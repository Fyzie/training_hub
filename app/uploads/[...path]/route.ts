import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { UPLOADS_DIR } from '@/lib/storage';
import { getHostPythonExe } from '@/lib/python-runtime';

// Map common file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.pt': 'application/octet-stream',
  '.pth': 'application/octet-stream',
  '.csv': 'text/csv',
  '.json': 'application/json'
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    const relativePath = pathSegments.join('/');
    
    // Check decoupled external storage first (storage-hub/uploads/...)
    const normUploadsDir = path.resolve(UPLOADS_DIR).toLowerCase();
    let resolvedFilePath = path.resolve(UPLOADS_DIR, relativePath);
    let isAllowed = resolvedFilePath.toLowerCase().startsWith(normUploadsDir);

    // Fallback to legacy public/uploads if not found in storage-hub
    if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedFilePath) || !isAllowed) {
      const legacyBase = path.resolve(process.cwd(), 'public', 'uploads').toLowerCase();
      const legacyPath = path.resolve(process.cwd(), 'public', 'uploads', relativePath);
      if (legacyPath.toLowerCase().startsWith(legacyBase) && fs.existsSync(/*turbopackIgnore: true*/ legacyPath)) {
        resolvedFilePath = legacyPath;
        isAllowed = true;
      }
    }

    if (!isAllowed) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Auto-generate result_bundle.zip on the fly if requested and not yet existing on disk
    if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedFilePath) && relativePath.toLowerCase().endsWith('result_bundle.zip')) {
      const parentDir = path.dirname(resolvedFilePath);
      if (fs.existsSync(parentDir)) {
        try {
          const pythonExe = getHostPythonExe();
          const pyScript = `import zipfile, os, sys; run_dir, zip_path = sys.argv[1], sys.argv[2]; z = zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED); [z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), run_dir)) for root, _, files in os.walk(run_dir) for f in files if not f.endswith('.zip')]; z.close()`;
          execSync(`"${pythonExe}" -c "${pyScript}" "${parentDir}" "${resolvedFilePath}"`, { timeout: 15000, windowsHide: true });
        } catch (ze) {
          console.error('Failed on-the-fly zip creation:', ze);
        }
      }
    }

    if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedFilePath)) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    const filePath = resolvedFilePath;
    const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600'
      }
    });
  } catch (error) {
    console.error('Error serving uploads static file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

