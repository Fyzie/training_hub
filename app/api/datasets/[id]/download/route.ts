import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { dataStore } from '@/lib/data-store';
import { UPLOADS_DIR, ensureStorageHub, resolveHostDatasetDir } from '@/lib/storage';
import { getHostPythonExe } from '@/lib/python-runtime';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureStorageHub();
    const { id } = await params;
    const datasets = dataStore.getDatasets();
    const dataset = datasets.find((d) => d.id === id);

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    // Resolve directory path on disk
    let datasetPath = resolveHostDatasetDir(dataset.filePath, dataset.name);
    if (!datasetPath || !fs.existsSync(datasetPath)) {
      const candidate1 = path.join(UPLOADS_DIR, 'datasets', dataset.name);
      const candidate2 = path.join(UPLOADS_DIR, 'datasets', `${dataset.name}-v1`);
      const candidate3 = path.join(UPLOADS_DIR, 'datasets', path.basename(dataset.filePath || ''));
      if (fs.existsSync(candidate1)) datasetPath = candidate1;
      else if (fs.existsSync(candidate2)) datasetPath = candidate2;
      else if (fs.existsSync(candidate3)) datasetPath = candidate3;
    }

    if (!datasetPath || !fs.existsSync(datasetPath)) {
      return NextResponse.json({ error: 'Dataset files not found in storage' }, { status: 404 });
    }

    const safeName = dataset.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'dataset';

    // If it's already a zip file
    if (fs.statSync(/*turbopackIgnore: true*/ datasetPath).isFile()) {
      const stat = fs.statSync(/*turbopackIgnore: true*/ datasetPath);
      const webStream = Readable.toWeb(fs.createReadStream(/*turbopackIgnore: true*/ datasetPath));
      return new NextResponse(webStream as any, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${safeName}.zip"`,
          'Content-Length': stat.size.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // If it's a directory, check if cached zip exists or zip it
    const cacheDir = path.join(UPLOADS_DIR, 'datasets', '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const zipPath = path.join(cacheDir, `${dataset.id}.zip`);
    const tmpZipPath = `${zipPath}.${Date.now()}.tmp`;

    // Zip using Python script if not already cached
    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 100) {
      const pythonExe = getHostPythonExe();
      const scriptPath = path.join(process.cwd(), 'scripts', 'dataset_tools.py');

      await new Promise<void>((resolve, reject) => {
        const child = spawn(pythonExe, [
          scriptPath,
          '--action',
          'zip',
          '--dataset_dir',
          datasetPath,
          '--target_zip',
          tmpZipPath
        ], { windowsHide: true });

        let stderr = '';
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
          if (code === 0 && fs.existsSync(tmpZipPath)) {
            try {
              if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
              fs.renameSync(tmpZipPath, zipPath);
            } catch {}
            resolve();
          } else {
            if (fs.existsSync(tmpZipPath)) {
              try { fs.unlinkSync(tmpZipPath); } catch {}
            }
            reject(new Error(stderr || `Failed to zip dataset (code ${code})`));
          }
        });
      });
    }

    const stat = fs.statSync(zipPath);
    const webStream = Readable.toWeb(fs.createReadStream(zipPath));
    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}.zip"`,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    console.error('Failed to download dataset:', err);
    return NextResponse.json({ error: err.message || 'Failed to download dataset' }, { status: 500 });
  }
}
