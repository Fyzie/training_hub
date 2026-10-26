import { NextRequest } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { Dataset } from '@/lib/types';
import { spawn } from 'child_process';
import path from 'path';
import { getHostPythonExe } from '@/lib/python-runtime';
import { ensureStorageHub } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 3600; // Allow up to 1 hour for massive multi-gigabyte dataset downloads

function extractJson(text: string): any {
  if (!text) return null;
  const match = text.match(/__ROBOFLOW_JSON_START__([\s\S]*?)__ROBOFLOW_JSON_END__/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    try {
      return JSON.parse(text.slice(firstOpen, lastClose + 1));
    } catch {}
  }
  return null;
}

export async function POST(request: NextRequest) {
  ensureStorageHub();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { roboflowSnippet, name, domain, description, uploadedBy } = body || {};

  if (!roboflowSnippet || typeof roboflowSnippet !== 'string' || roboflowSnippet.trim().length < 10) {
    return new Response(JSON.stringify({ error: 'Please provide a valid Roboflow code snippet.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cleanName = (name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  const user = uploadedBy || 'ML Engineer';
  const targetDomain = domain || 'Instance Segmentation / Object Detection';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const pythonExe = getHostPythonExe();
      const scriptPath = path.join(process.cwd(), 'scripts', 'download_roboflow.py');
      const args = [scriptPath, '--snippet', roboflowSnippet.trim()];
      if (cleanName) {
        args.push('--name', cleanName);
      }

      const child = spawn(pythonExe, args);

      let stdoutAccum = '';
      let stderrAccum = '';
      let stdoutBuffer = '';

      const sendEvent = (eventObj: any) => {
        try {
          const line = `data: ${JSON.stringify(eventObj)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          // Stream might be closed by client
        }
      };

      // Initial progress packet
      sendEvent({
        type: 'progress',
        percent: 2,
        stage: 'init',
        message: 'Initializing Roboflow downloader engine...'
      });

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutAccum += text;
        stdoutBuffer += text;

        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('__ROBOFLOW_PROGRESS__')) {
            try {
              const progressData = JSON.parse(trimmed.slice('__ROBOFLOW_PROGRESS__'.length));
              sendEvent({
                type: 'progress',
                ...progressData
              });
            } catch {}
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        stderrAccum += chunk.toString();
      });

      child.on('close', (code) => {
        let result: any = null;
        try {
          result = extractJson(stdoutAccum) || extractJson(stderrAccum);
        } catch {}

        if (code !== 0) {
          const errMsg = (result && result.error) || stderrAccum || stdoutAccum || `Downloader process failed with exit code ${code}`;
          sendEvent({
            type: 'error',
            error: errMsg
          });
          controller.close();
          return;
        }

        if (result && !result.error) {
          const sampleCount = result.sampleCount || 500;
          const newDataset: Dataset = {
            id: `ds-${Date.now().toString(36)}`,
            name: cleanName || result.name || 'Roboflow Dataset',
            category: 'vision',
            domain: targetDomain,
            description: (description || '').trim() || `Imported from Roboflow (${result.project} v${result.version})`,
            format: 'coco',
            fileSizeMB: result.fileSizeMB || 10,
            sampleCount,
            uploadedBy: user,
            uploadedAt: new Date().toISOString(),
            filePath: result.filePath,
            classes: result.classes || ['object'],
            splits: result.splits || {
              train: Math.round(sampleCount * 0.8),
              val: Math.round(sampleCount * 0.2)
            }
          };

          try {
            dataStore.addDataset(newDataset);
          } catch (e: any) {
            console.error('[Roboflow Route] Failed to register dataset in dataStore:', e);
          }

          sendEvent({
            type: 'complete',
            percent: 100,
            message: `Dataset '${newDataset.name}' cataloged successfully!`,
            dataset: newDataset
          });
          controller.close();
          return;
        }

        sendEvent({
          type: 'error',
          error: (result && result.error) || 'Failed to parse Roboflow dataset result'
        });
        controller.close();
      });

      child.on('error', (err) => {
        sendEvent({
          type: 'error',
          error: `Failed to launch Python downloader: ${err.message}`
        });
        controller.close();
      });

      // Terminate child process if client disconnects
      if (request.signal) {
        request.signal.addEventListener('abort', () => {
          try {
            child.kill('SIGTERM');
          } catch {}
        });
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

