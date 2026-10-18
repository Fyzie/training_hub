import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR, ensureStorageHub } from '@/lib/storage';

export async function POST(request: Request) {
  try {
    ensureStorageHub();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string) || 'auto'; // 'doc' | 'image' | 'auto'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
    const subFolder = isImage ? 'images' : 'docs';
    const uploadDir = path.join(UPLOADS_DIR, subFolder);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.name);
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = `${Date.now()}_${baseName}${ext}`;
    const destPath = path.join(uploadDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const url = `/uploads/${subFolder}/${safeName}`;
    const sizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;

    let fileType: 'pdf' | 'docx' | 'pptx' | 'zip' | 'other' = 'other';
    if (ext === '.pdf') fileType = 'pdf';
    else if (ext === '.docx' || ext === '.doc') fileType = 'docx';
    else if (ext === '.pptx' || ext === '.ppt') fileType = 'pptx';
    else if (ext === '.zip' || ext === '.tar' || ext === '.gz') fileType = 'zip';

    return NextResponse.json({
      success: true,
      url,
      originalName: file.name,
      fileName: safeName,
      fileType,
      sizeMB,
      isImage
    });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
  }
}

