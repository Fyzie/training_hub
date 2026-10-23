import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { UPLOADS_DIR } from '@/lib/storage';
import { dataStore } from '@/lib/data-store';
import { getHostPythonExe } from '@/lib/python-runtime';
import { spawn } from 'child_process';

async function generateZipBundleAsync(runDir: string, zipPath: string): Promise<boolean> {
  // If valid zip already exists and is not empty, reuse it
  if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 200) {
    return true;
  }

  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  const tmpZipPath = `${zipPath}.${Date.now()}.tmp`;
  const pythonExe = getHostPythonExe();

  const pyScript = `
import zipfile, os, sys

run_dir = sys.argv[1]
tmp_zip = sys.argv[2]
final_zip = sys.argv[3]

try:
    with zipfile.ZipFile(tmp_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as z:
        for root, dirs, files in os.walk(run_dir):
            for f in files:
                if f.endswith('.zip') or f.endswith('.tmp') or f.endswith('.crdownload'):
                    continue
                fp = os.path.join(root, f)
                try:
                    rel = os.path.relpath(fp, run_dir)
                    z.write(fp, rel)
                except Exception as ex:
                    print(f"Skipping locked file {f}: {ex}", file=sys.stderr)
    if os.path.exists(final_zip):
        try:
            os.remove(final_zip)
        except Exception:
            pass
    os.replace(tmp_zip, final_zip)
    print("ZIP_OK")
except Exception as e:
    print(f"ZIP_ERROR: {e}", file=sys.stderr)
    if os.path.exists(tmp_zip):
        try:
            os.remove(tmp_zip)
        except Exception:
            pass
    sys.exit(1)
`;

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(pythonExe, ['-c', pyScript, runDir, tmpZipPath, zipPath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        if (fs.existsSync(tmpZipPath)) {
          try { fs.unlinkSync(tmpZipPath); } catch {}
        }
        resolve(false);
      }, 180000); // 3 minutes timeout

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return;
        if (code === 0 && fs.existsSync(zipPath) && fs.statSync(zipPath).size > 100) {
          resolve(true);
        } else {
          console.error('Result zip creation failed:', stderr);
          if (fs.existsSync(tmpZipPath)) {
            try { fs.unlinkSync(tmpZipPath); } catch {}
          }
          resolve(false);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        console.error('Failed to spawn python for zip:', err);
        resolve(false);
      });
    } catch (err) {
      console.error('Error starting zip bundler:', err);
      resolve(false);
    }
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return new NextResponse('Job ID required', { status: 400 });
    }

    const job = dataStore.getJobById(id);

    // Locate run directory in storage-hub or public/uploads
    let runDir = path.resolve(UPLOADS_DIR, 'runs', id);
    if (!fs.existsSync(runDir)) {
      const runName = job?.hyperparameters?.run_name;
      if (runName) {
        const byRunName = path.resolve(UPLOADS_DIR, 'runs', runName);
        if (fs.existsSync(byRunName)) {
          runDir = byRunName;
        }
      }
    }

    if (!fs.existsSync(runDir)) {
      const publicRunDir = path.resolve(process.cwd(), 'public', 'uploads', 'runs', id);
      if (fs.existsSync(publicRunDir)) {
        runDir = publicRunDir;
      }
    }

    // If runDir doesn't exist at all, create it with job metadata
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
      if (job) {
        fs.writeFileSync(
          path.join(runDir, 'training_metadata.json'),
          JSON.stringify(job, null, 2),
          'utf-8'
        );
      }
    }

    const zipPath = path.join(runDir, 'result_bundle.zip');
    const ok = await generateZipBundleAsync(runDir, zipPath);

    if (!ok || !fs.existsSync(zipPath)) {
      return new NextResponse('Could not prepare result zip', { status: 500 });
    }

    const stat = fs.statSync(zipPath);
    const safeName = (job?.name || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `result_bundle_${safeName}.zip`;

    // Stream file rather than buffering into RAM to prevent socket disconnects
    const nodeStream = fs.createReadStream(zipPath);
    const webStream = Readable.toWeb(nodeStream);

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Download result folder error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
