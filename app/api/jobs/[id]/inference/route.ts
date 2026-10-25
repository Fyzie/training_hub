import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { UPLOADS_DIR } from '@/lib/storage';
import { dataStore } from '@/lib/data-store';
import { resolveJobTemplateInference } from '@/lib/templates';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const isCheckOnly = searchParams.get('check') === 'true';

    const job = dataStore.getJobById(id);

    // 1. Locate run directory
    let runDir = path.resolve(UPLOADS_DIR, 'runs', id);
    if (!fs.existsSync(runDir)) {
      const runName = job?.hyperparameters?.run_name;
      if (runName) {
        const byRunName = path.resolve(UPLOADS_DIR, 'runs', runName);
        if (fs.existsSync(byRunName)) runDir = byRunName;
      }
    }
    if (!fs.existsSync(runDir)) {
      const publicRunDir = path.resolve(process.cwd(), 'public', 'uploads', 'runs', id);
      if (fs.existsSync(publicRunDir)) runDir = publicRunDir;
    }

    const runInfPath = path.join(runDir, 'inference.py');

    // 2. Check if inference.py already exists in runDir
    let finalInferencePath: string | null = null;
    if (fs.existsSync(runInfPath)) {
      finalInferencePath = runInfPath;
    } else {
      // 3. Resolve from template directory
      const templateRes = resolveJobTemplateInference(job);
      if (templateRes.hasInferenceScript && templateRes.inferenceScriptPath) {
        finalInferencePath = templateRes.inferenceScriptPath;

        // Auto-compile / copy into run directory and public uploads for persistence
        if (fs.existsSync(runDir)) {
          try {
            fs.copyFileSync(finalInferencePath, runInfPath);
          } catch (e) {
            console.error('Could not copy inference.py to runDir:', e);
          }
        }
        const pubDir = path.resolve(process.cwd(), 'public', 'uploads', 'runs', id);
        if (fs.existsSync(pubDir)) {
          try {
            fs.copyFileSync(finalInferencePath, path.join(pubDir, 'inference.py'));
          } catch {}
        }
      }
    }

    // 4. If no inference script provided
    if (!finalInferencePath || !fs.existsSync(finalInferencePath)) {
      return NextResponse.json(
        { exists: false, error: 'No inference script provided' },
        { status: 404 }
      );
    }

    // 5. If only checking existence for UI button validation
    if (isCheckOnly) {
      return NextResponse.json({
        exists: true,
        filename: 'inference.py'
      });
    }

    // 6. Serve the inference script file for download
    const content = fs.readFileSync(finalInferencePath, 'utf-8');
    const safeName = (job?.name || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadFilename = `inference_${safeName}.py`;

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/x-python; charset=utf-8',
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err: any) {
    console.error('Inference download error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

