import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { Dataset } from '@/lib/types';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { UPLOADS_DIR, ensureStorageHub } from '@/lib/storage';
import { getHostPythonExe } from '@/lib/python-runtime';

const UPLOAD_DIR = path.join(UPLOADS_DIR, 'datasets');

export async function GET() {
  ensureStorageHub();
  const datasets = dataStore.getDatasets();
  return NextResponse.json(datasets);
}

function extractJson(text: string): any {
  if (!text) return null;
  const match = text.match(/__ROBOFLOW_JSON_START__([\s\S]*?)__ROBOFLOW_JSON_END__/);
  if (match) {
    return JSON.parse(match[1].trim());
  }
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    return JSON.parse(text.slice(firstOpen, lastClose + 1));
  }
  return JSON.parse(text.trim());
}

function runPythonRoboflow(snippet: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonExe = getHostPythonExe();
    const scriptPath = path.join(process.cwd(), 'scripts', 'download_roboflow.py');
    const child = spawn(pythonExe, [scriptPath, '--snippet', snippet]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      let result: any = null;
      try {
        result = extractJson(stdout);
      } catch {
        try {
          result = extractJson(stderr);
        } catch {
          // ignore
        }
      }

      if (code !== 0) {
        if (result && result.error) {
          return reject(new Error(result.error));
        }
        return reject(new Error(stderr || stdout || `Process failed with code ${code}`));
      }

      if (result) {
        if (result.error) {
          return reject(new Error(result.error));
        }
        return resolve(result);
      }

      reject(new Error(`Failed to parse Roboflow output: ${stdout}\nStderr: ${stderr}`));
    });
  });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const roboflowSnippet = (formData.get('roboflowSnippet') as string) || '';
      const name = (formData.get('name') as string) || '';
      const category = (formData.get('category') as any) || 'vision';
      const description = (formData.get('description') as string) || '';
      const uploadedBy = (formData.get('uploadedBy') as string) || 'ML Engineer';
      const file = formData.get('file') as File | null;

      if (roboflowSnippet && roboflowSnippet.trim().length > 10) {
        try {
          const rfRes = await runPythonRoboflow(roboflowSnippet.trim());
          const newDataset: Dataset = {
            id: `ds-${Date.now().toString(36)}`,
            name: name.trim() || rfRes.name,
            category: 'vision',
            description: description.trim() || `Imported from Roboflow (${rfRes.project} v${rfRes.version})`,
            format: 'coco',
            fileSizeMB: rfRes.fileSizeMB || 10,
            sampleCount: rfRes.sampleCount || 500,
            uploadedBy,
            uploadedAt: new Date().toISOString(),
            filePath: rfRes.filePath,
            classes: rfRes.classes || ['object'],
            splits: rfRes.splits || { train: Math.round((rfRes.sampleCount || 500) * 0.8), val: Math.round((rfRes.sampleCount || 500) * 0.2) }
          };
          dataStore.addDataset(newDataset);
          return NextResponse.json(newDataset, { status: 201 });
        } catch (rfErr: any) {
          console.error('Roboflow import error:', rfErr);
          return NextResponse.json({ error: rfErr.message || 'Failed to download dataset from Roboflow' }, { status: 400 });
        }
      }

      let filePath = '';
      let fileSizeMB = 10;

      if (file && file.size) {
        if (!fs.existsSync(UPLOAD_DIR)) {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const destPath = path.join(UPLOAD_DIR, safeName);
        fs.writeFileSync(destPath, buffer);
        filePath = `/uploads/datasets/${safeName}`;
        fileSizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      }

      const newDataset: Dataset = {
        id: `ds-${Date.now().toString(36)}`,
        name: name || 'Custom Dataset',
        category,
        description,
        format: 'coco',
        fileSizeMB: fileSizeMB || 15,
        sampleCount: 1000,
        uploadedBy,
        uploadedAt: new Date().toISOString(),
        filePath,
        classes: ['object'],
        splits: { train: 800, val: 200 }
      };

      dataStore.addDataset(newDataset);
      return NextResponse.json(newDataset, { status: 201 });
    } else {
      const body = await request.json();

      if (body.roboflowSnippet && body.roboflowSnippet.trim().length > 10) {
        try {
          const rfRes = await runPythonRoboflow(body.roboflowSnippet.trim());
          const newDataset: Dataset = {
            id: `ds-${Date.now().toString(36)}`,
            name: body.name?.trim() || rfRes.name,
            category: 'vision',
            description: body.description?.trim() || `Imported from Roboflow (${rfRes.project} v${rfRes.version})`,
            format: 'coco',
            fileSizeMB: rfRes.fileSizeMB || 10,
            sampleCount: rfRes.sampleCount || 500,
            uploadedBy: body.uploadedBy || 'ML Engineer',
            uploadedAt: new Date().toISOString(),
            filePath: rfRes.filePath,
            classes: rfRes.classes || ['object'],
            splits: rfRes.splits || { train: Math.round((rfRes.sampleCount || 500) * 0.8), val: Math.round((rfRes.sampleCount || 500) * 0.2) }
          };
          dataStore.addDataset(newDataset);
          return NextResponse.json(newDataset, { status: 201 });
        } catch (rfErr: any) {
          console.error('Roboflow import error:', rfErr);
          return NextResponse.json({ error: rfErr.message || 'Failed to download dataset from Roboflow' }, { status: 400 });
        }
      }

      const newDataset: Dataset = {
        id: `ds-${Date.now().toString(36)}`,
        name: body.name || 'New Dataset',
        category: body.category || 'vision',
        description: body.description || '',
        format: 'coco',
        fileSizeMB: body.fileSizeMB || 50,
        sampleCount: body.sampleCount || 1000,
        uploadedBy: body.uploadedBy || 'ML Engineer',
        uploadedAt: new Date().toISOString(),
        classes: body.classes || ['object'],
        splits: body.splits || { train: 800, val: 200 }
      };

      dataStore.addDataset(newDataset);
      return NextResponse.json(newDataset, { status: 201 });
    }
  } catch (err) {
    console.error('Dataset upload error:', err);
    return NextResponse.json({ error: 'Failed to upload dataset' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Dataset ID is required' }, { status: 400 });
    }

    const datasets = dataStore.getDatasets();
    const dataset = datasets.find((d) => d.id === id);
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Attempt to remove downloaded files or roboflow directory if present
    if (dataset.filePath) {
      try {
        let absPath = dataset.filePath;
        if (!path.isAbsolute(absPath)) {
          if (dataset.filePath.startsWith('/uploads/')) {
            absPath = path.join(UPLOADS_DIR, dataset.filePath.replace(/^\/uploads\/?/, ''));
          } else {
            absPath = path.join(process.cwd(), 'public', dataset.filePath.replace(/^\//, ''));
          }
        }
        if (fs.existsSync(/*turbopackIgnore: true*/ absPath)) {
          fs.rmSync(absPath, { recursive: true, force: true });
        }
      } catch (e) {
        console.warn('Could not remove dataset file:', e);
      }
    }

    dataStore.deleteDataset(id);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('Dataset deletion error:', err);
    return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 });
  }
}

