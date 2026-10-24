import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { dataStore } from '@/lib/data-store';
import { Dataset, DatasetDomain } from '@/lib/types';
import { UPLOADS_DIR, ensureStorageHub, scanDatasetClasses } from '@/lib/storage';
import { getHostPythonExe } from '@/lib/python-runtime';

const UPLOAD_DIR = path.join(UPLOADS_DIR, 'datasets');
const TEMP_CHUNKS_DIR = path.join(UPLOAD_DIR, 'temp_chunks');

function runDatasetAnalysis(diskPath: string, domain?: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      const pythonExe = getHostPythonExe();
      const scriptPath = path.join(process.cwd(), 'scripts', 'dataset_tools.py');
      const args = [scriptPath, '--action', 'analyze', '--dataset_dir', diskPath];
      if (domain) {
        args.push('--domain', domain);
      }
      const child = spawn(pythonExe, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          const match = stdout.match(/__DATASET_JSON_START__([\s\S]*?)__DATASET_JSON_END__/);
          if (match) {
            try {
              return resolve(JSON.parse(match[1].trim()));
            } catch {}
          }
          const firstOpen = stdout.indexOf('{');
          const lastClose = stdout.lastIndexOf('}');
          if (firstOpen !== -1 && lastClose > firstOpen) {
            try {
              return resolve(JSON.parse(stdout.slice(firstOpen, lastClose + 1)));
            } catch {}
          }
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function POST(request: Request) {
  try {
    ensureStorageHub();
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEMP_CHUNKS_DIR)) {
      fs.mkdirSync(TEMP_CHUNKS_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const uploadId = (formData.get('uploadId') as string) || '';
    const chunkIndex = parseInt((formData.get('chunkIndex') as string) || '0', 10);
    const totalChunks = parseInt((formData.get('totalChunks') as string) || '1', 10);
    const fileName = (formData.get('fileName') as string) || 'dataset.zip';
    const name = (formData.get('name') as string) || '';
    const category = (formData.get('category') as any) || 'vision';
    const domain = (formData.get('domain') as string) || 'Instance Segmentation / Object Detection';
    const description = (formData.get('description') as string) || '';
    const uploadedBy = (formData.get('uploadedBy') as string) || 'Staff ML Engineer';
    const chunk = formData.get('chunk') as File | null;

    if (!uploadId) {
      return NextResponse.json({ error: 'Missing uploadId parameter' }, { status: 400 });
    }
    if (!chunk) {
      return NextResponse.json({ error: 'Missing chunk file data' }, { status: 400 });
    }

    const uploadSessionDir = path.join(TEMP_CHUNKS_DIR, uploadId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    if (!fs.existsSync(uploadSessionDir)) {
      fs.mkdirSync(uploadSessionDir, { recursive: true });
    }

    // Save current chunk part
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPartPath = path.join(uploadSessionDir, `part_${chunkIndex}.bin`);
    fs.writeFileSync(chunkPartPath, chunkBuffer);

    // If more chunks are expected, respond with chunk acknowledgement
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({
        success: true,
        completed: false,
        uploadId,
        chunkIndex,
        totalChunks
      });
    }

    // All chunks received! Verify that all parts exist
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(uploadSessionDir, `part_${i}.bin`);
      if (!fs.existsSync(partPath)) {
        return NextResponse.json(
          { error: `Incomplete upload: missing chunk part ${i} of ${totalChunks}` },
          { status: 400 }
        );
      }
    }

    // Assemble all parts into target file
    const cleanBase = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const cleanExt = path.extname(fileName) || '.zip';
    const safeName = `${Date.now()}_${cleanBase}${cleanExt}`;
    const destPath = path.join(UPLOAD_DIR, safeName);

    const writeStream = fs.createWriteStream(destPath);
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(uploadSessionDir, `part_${i}.bin`);
      const partData = fs.readFileSync(partPath);
      writeStream.write(partData);
    }
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (e) => reject(e));
    });

    // Clean up temporary chunks directory
    try {
      fs.rmSync(uploadSessionDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.warn('Could not remove temporary chunk directory:', rmErr);
    }

    const totalStat = fs.statSync(destPath);
    let fileSizeMB = Math.round((totalStat.size / (1024 * 1024)) * 10) / 10;
    const filePath = `/uploads/datasets/${safeName}`;

    // Run dataset analysis on assembled archive
    let resolvedFormat: 'coco' | 'images_folder' | 'csv' | 'yolo' = domain === 'Image Classification' ? 'images_folder' : (domain === 'Tabular' ? 'csv' : 'coco');
    let resolvedDomain = domain || 'Instance Segmentation / Object Detection';
    let resolvedCategory = category || (domain === 'Tabular' ? 'tabular' : 'vision');
    let resolvedClasses: string[] = [];
    let resolvedSamples = 1000;
    let resolvedSplits: { train: number; val: number; test?: number } = { train: 800, val: 200 };

    if (destPath && fs.existsSync(destPath)) {
      const analysis = await runDatasetAnalysis(destPath, domain);
      if (analysis) {
        if (analysis.classes && Array.isArray(analysis.classes) && analysis.classes.length > 0) {
          resolvedClasses = analysis.classes;
        }
        if (analysis.totalSamples) {
          resolvedSamples = analysis.totalSamples;
        }
        if (analysis.splits) {
          resolvedSplits = analysis.splits;
        }
        if (analysis.fileSizeMB) {
          fileSizeMB = analysis.fileSizeMB;
        }
        if (analysis.format === 'Image Classification Directory' || (domain && domain.includes('Classification'))) {
          resolvedFormat = 'images_folder';
          resolvedDomain = 'Image Classification';
          resolvedCategory = 'vision';
        } else if (analysis.format?.includes('Tabular') || (domain && domain.includes('Tabular'))) {
          resolvedFormat = 'csv';
          resolvedDomain = 'Tabular';
          resolvedCategory = 'tabular';
        } else if (analysis.format === 'COCO Vision Format' || (domain && domain.includes('Instance Segmentation'))) {
          resolvedFormat = 'coco';
          resolvedDomain = 'Instance Segmentation / Object Detection';
          resolvedCategory = 'vision';
        }
      }
    }

    // Automatically scan uploaded archive or directory for real class names if still needed
    if (resolvedClasses.length === 0) {
      const detectedClasses = filePath ? scanDatasetClasses(filePath) : [];
      if (detectedClasses && detectedClasses.length > 0) {
        resolvedClasses = detectedClasses;
      } else if (resolvedDomain === 'Image Classification') {
        resolvedClasses = ['class_a', 'class_b'];
        resolvedFormat = 'images_folder';
      } else if (resolvedDomain === 'Tabular') {
        resolvedClasses = ['feature_1', 'feature_2'];
        resolvedFormat = 'csv';
      } else {
        resolvedClasses = ['defect', 'background'];
        resolvedFormat = 'coco';
      }
    }

    const cleanDatasetName = (name || fileName.replace(/\.[^/.]+$/, '') || 'Custom Dataset')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const newDataset: Dataset = {
      id: `ds-${Date.now().toString(36)}`,
      name: cleanDatasetName,
      category: resolvedCategory,
      domain: resolvedDomain as DatasetDomain,
      description,
      format: resolvedFormat,
      fileSizeMB: fileSizeMB || 15,
      sampleCount: resolvedSamples,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      filePath,
      classes: resolvedClasses,
      splits: resolvedSplits
    };

    dataStore.addDataset(newDataset);
    return NextResponse.json({ success: true, completed: true, dataset: newDataset }, { status: 201 });
  } catch (err: any) {
    console.error('Chunk upload error:', err);
    return NextResponse.json({ error: err.message || 'Chunk upload processing failed' }, { status: 500 });
  }
}

