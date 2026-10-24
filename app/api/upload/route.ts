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

    const rawName = (file.name || 'file.bin').trim();
    const ext = path.extname(rawName);
    const baseName = path.basename(rawName, ext).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = `${Date.now()}_${baseName}${ext}`;
    const destPath = path.join(uploadDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    // Mirror to public folder for direct Next.js static asset fallback
    try {
      const publicSubDir = path.join(process.cwd(), 'public', 'uploads', subFolder);
      if (!fs.existsSync(publicSubDir)) {
        fs.mkdirSync(publicSubDir, { recursive: true });
      }
      fs.copyFileSync(destPath, path.join(publicSubDir, safeName));
    } catch (mirrorErr) {
      console.warn('Could not mirror upload to public directory:', mirrorErr);
    }

    const url = `/uploads/${subFolder}/${safeName}`;
    const sizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;

    let fileType: 'pdf' | 'docx' | 'pptx' | 'zip' | 'md' | 'py' | 'other' = 'other';
    const lowerExt = ext.toLowerCase();
    if (lowerExt === '.pdf') fileType = 'pdf';
    else if (lowerExt === '.docx' || lowerExt === '.doc') fileType = 'docx';
    else if (lowerExt === '.pptx' || lowerExt === '.ppt') fileType = 'pptx';
    else if (lowerExt === '.zip' || lowerExt === '.tar' || lowerExt === '.gz') fileType = 'zip';
    else if (lowerExt === '.md' || lowerExt === '.markdown' || lowerExt === '.txt') fileType = 'md';
    else if (lowerExt === '.py') fileType = 'py';

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

