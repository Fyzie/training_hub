import { NextResponse } from 'next/server';
import path from 'path';
import { dataStore } from '@/lib/data-store';
import { jobRunner } from '@/lib/job-runner';
import { TrainingJob } from '@/lib/types';
import { getRealGpuDeviceString } from '@/lib/hardware-telemetry';

export async function GET() {
  const jobs = dataStore.getJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name || !body.datasetId) {
      return NextResponse.json({ error: 'Job name and dataset are required' }, { status: 400 });
    }

    const datasets = dataStore.getDatasets();
    const dataset = datasets.find((d) => d.id === body.datasetId);

    if (dataset) {
      const isDetOrSeg = body.taskType?.includes('RF-DETR') || body.taskType?.includes('YOLO') || body.taskType?.includes('Detection') || body.taskType?.includes('Segmentation');
      const isClassif = body.taskType?.includes('Classification');

      if (isDetOrSeg) {
        if (dataset.domain === 'Image Classification' || dataset.format === 'images_folder') {
          return NextResponse.json({
            error: `Incompatible dataset: "${dataset.name}" is formatted for Image Classification, but this template requires Instance Segmentation / Object Detection (COCO/YOLO format with bounding boxes/masks).`
          }, { status: 400 });
        }
        if (dataset.domain === 'Tabular' || dataset.format === 'csv') {
          return NextResponse.json({
            error: `Incompatible dataset: "${dataset.name}" is a Tabular dataset, which cannot be used with vision object detection or segmentation templates.`
          }, { status: 400 });
        }
      }

      if (isClassif) {
        if (dataset.domain === 'Instance Segmentation / Object Detection' || dataset.format === 'coco' || dataset.format === 'yolo') {
          return NextResponse.json({
            error: `Incompatible dataset: "${dataset.name}" is formatted for Object Detection/Segmentation, but MobileNetV4 Image Classification requires folder hierarchy dataset with class subfolders.`
          }, { status: 400 });
        }
        if (dataset.domain === 'Tabular' || dataset.format === 'csv') {
          return NextResponse.json({
            error: `Incompatible dataset: "${dataset.name}" is a Tabular dataset, which cannot be used with image classification.`
          }, { status: 400 });
        }
      }
    }

    const realGpu = getRealGpuDeviceString();
    const targetDevice = body.device || 'cuda:0';

    const isSahi = (body.hyperparameters?.template && String(body.hyperparameters.template).includes('sahi')) ||
      (body.taskType && String(body.taskType).includes('SAHI')) ||
      (body.hyperparameters?.model_architecture && String(body.hyperparameters.model_architecture).includes('SAHI'));

    let effectiveDatasetId = body.datasetId;
    let effectiveDatasetName = dataset ? dataset.name : (body.datasetName || 'Custom Dataset');

    if (isSahi && dataset && !dataset.name.endsWith('(SAHI)')) {
      const sahiDatasetName = `${dataset.name} (SAHI)`;
      let sahiDataset = datasets.find((d) => d.name.toLowerCase() === sahiDatasetName.toLowerCase());
      const sliceCols = Number(body.hyperparameters?.sliceCols || body.hyperparameters?.slice_cols || 2);
      const sliceRows = Number(body.hyperparameters?.sliceRows || body.hyperparameters?.slice_rows || 2);
      const overlapType = body.hyperparameters?.overlapType || 'pixel';

      if (!sahiDataset) {
        sahiDataset = {
          id: `ds-sahi-${Date.now().toString(36)}`,
          name: sahiDatasetName,
          category: 'vision',
          domain: 'Instance Segmentation / Object Detection',
          description: `SAHI sliced dataset generated from ${dataset.name} (${sliceCols}x${sliceRows} slices, ${overlapType} overlap).`,
          format: 'coco',
          fileSizeMB: Math.round((dataset.fileSizeMB || 10) * sliceCols * sliceRows * 0.9 * 10) / 10,
          sampleCount: (dataset.sampleCount || 10) * sliceCols * sliceRows,
          uploadedBy: dataset.uploadedBy || body.submittedBy || 'Staff ML Engineer',
          uploadedAt: new Date().toISOString(),
          filePath: `/uploads/datasets/${path.basename(dataset.filePath || dataset.name).replace(/\.zip$/i, '')}_sahi`,
          classes: dataset.classes || [],
          splits: dataset.splits ? {
            train: (dataset.splits.train || 0) * sliceCols * sliceRows,
            val: (dataset.splits.val || 0) * sliceCols * sliceRows,
            test: (dataset.splits.test || 0) * sliceCols * sliceRows,
          } : undefined
        };
        dataStore.addDataset(sahiDataset);
      }
      effectiveDatasetId = sahiDataset.id;
      effectiveDatasetName = sahiDataset.name;
    }

    const newJob: TrainingJob = {
      id: `job-${Date.now().toString(36)}`,
      name: body.name.trim(),
      category: body.category || 'vision',
      taskType: body.taskType || 'YOLOv8 Detection',
      datasetId: effectiveDatasetId,
      datasetName: effectiveDatasetName,
      status: 'queued',
      progressPercent: 0,
      currentEpoch: 0,
      totalEpochs: parseInt(body.epochs) || 50,
      batchSize: parseInt(body.batchSize) || 16,
      learningRate: parseFloat(body.learningRate) || 0.001,
      optimizer: body.optimizer || 'AdamW',
      device: targetDevice,
      deviceName: realGpu,
      submittedBy: body.submittedBy || 'ML Engineer',
      submittedById: body.submittedById || '',
      submittedAt: new Date().toISOString(),
      metricsHistory: [],
      logs: [
        `[${new Date().toLocaleTimeString()}] Job "${body.name}" submitted to host queue.`,
        `[${new Date().toLocaleTimeString()}] Target Execution Hardware: Host Server ${targetDevice} (${realGpu})`,
        `[${new Date().toLocaleTimeString()}] Configured ${body.epochs || 50} epochs, batch size ${body.batchSize || 16}, lr ${body.learningRate || 0.001}`
      ],
      hyperparameters: {
        imgSize: body.imgSize || 640,
        augmentations: body.augmentations || 'default',
        pretrained: body.pretrained ?? true,
        model_architecture: body.hyperparameters?.model_architecture || (body.taskType?.includes('Seg') ? 'RFDETRSegSmall' : 'RFDETRSmall'),
        backbone: body.hyperparameters?.model_architecture || (body.taskType?.includes('Seg') ? 'RF-DETR Swin-Small' : 'RF-DETR ResNet-50'),
        ...(body.hyperparameters || {})
      },
      description: body.description || ''
    };

    dataStore.addJob(newJob);

    // Prompt the scheduler
    jobRunner.tick();

    return NextResponse.json(newJob, { status: 201 });
  } catch (err) {
    console.error('Job creation error:', err);
    return NextResponse.json({ error: 'Failed to create training job' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = dataStore.clearFailedAndCancelledJobs();
    return NextResponse.json({
      success: true,
      removedCount: result.removedCount,
      remaining: result.remaining
    });
  } catch (err) {
    console.error('Failed to clear failed and cancelled jobs:', err);
    return NextResponse.json({ error: 'Failed to clear jobs' }, { status: 500 });
  }
}

