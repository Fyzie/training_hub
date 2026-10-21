import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { UPLOADS_DIR } from '@/lib/storage';
import { dataStore } from '@/lib/data-store';
import { getHostPythonExe } from '@/lib/python-runtime';
import { execSync } from 'child_process';

function ensureZipBundle(runDir: string, zipPath: string): boolean {
  try {
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 100) {
      return true;
    }

    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Zip directory using Python zipfile
    const pythonExe = getHostPythonExe();
    const pyScript = `
import zipfile, os, sys
run_dir = sys.argv[1]
zip_path = sys.argv[2]
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(run_dir):
        for f in files:
            if f.endswith('.zip'): continue
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, run_dir))
`;
    execSync(`"${pythonExe}" -c "${pyScript.replace(/\r?\n/g, ' ')}" "${runDir}" "${zipPath}"`, {
      timeout: 15000,
      windowsHide: true
    });
    return fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0;
  } catch (e) {
    console.error('Failed to generate result zip bundle:', e);
    return false;
  }
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
    ensureZipBundle(runDir, zipPath);

    if (!fs.existsSync(zipPath)) {
      return new NextResponse('Could not prepare result zip', { status: 500 });
    }

    const stat = fs.statSync(zipPath);
    const fileBuffer = fs.readFileSync(zipPath);

    const safeName = (job?.name || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `result_bundle_${safeName}.zip`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Download result folder error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

