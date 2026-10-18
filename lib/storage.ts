import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Storage Hub - Centralized Data & Storage Path Resolution
 * Decouples all persistent data (users, jobs, inventory, blogs, datasets, uploads, and runs)
 * to an external directory (../storage-hub) beside the main codebase repository (hub).
 *
 * This ensures Git pulls, pushes, and branch changes will NEVER overwrite, conflict with,
 * or expose company operational data.
 */

export const STORAGE_HUB_DIR =
  process.env.STORAGE_HUB_PATH ||
  path.resolve(process.cwd(), '..', 'storage-hub');

export const DATA_DIR = path.join(STORAGE_HUB_DIR, 'data');
export const UPLOADS_DIR = path.join(STORAGE_HUB_DIR, 'uploads');

// Specific upload subdirectories
export const UPLOAD_SUBDIRS = {
  images: path.join(UPLOADS_DIR, 'images'),
  docs: path.join(UPLOADS_DIR, 'docs'),
  datasets: path.join(UPLOADS_DIR, 'datasets'),
  runs: path.join(UPLOADS_DIR, 'runs')
};

// Ensure all persistent storage hub directories exist upon invocation
export function ensureStorageHub(): void {
  const dirsToEnsure = [
    STORAGE_HUB_DIR,
    DATA_DIR,
    UPLOADS_DIR,
    UPLOAD_SUBDIRS.images,
    UPLOAD_SUBDIRS.docs,
    UPLOAD_SUBDIRS.datasets,
    UPLOAD_SUBDIRS.runs
  ];

  for (const dir of dirsToEnsure) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        console.error(`Failed to create storage directory: ${dir}`, e);
      }
    }
  }

  // Automatic Migration Safety: If target data/ is missing any json that exists in local hub/data, copy it
  try {
    const localData = path.join(process.cwd(), 'data');
    if (fs.existsSync(localData)) {
      const files = fs.readdirSync(localData);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const targetFile = path.join(DATA_DIR, file);
          const sourceFile = path.join(localData, file);
          if (!fs.existsSync(targetFile)) {
            fs.copyFileSync(sourceFile, targetFile);
            console.log(`[StorageHub] Auto-synced initial data: ${file} -> ${targetFile}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[StorageHub] Migration check notice:', err);
  }
}

// Initialize on module load
ensureStorageHub();

/**
 * Resolves any dataset path (web url, relative path, or zip archive) to an absolute
 * directory path located on the HOST workstation server's filesystem.
 * If the dataset is a .zip archive, it unpacks it automatically on the host.
 */
export function resolveHostDatasetDir(rawPath?: string, datasetName?: string): string {
  if (!rawPath && !datasetName) return '';

  let candidate = (rawPath || '').trim();

  // 1. If it's a relative URL path like '/uploads/datasets/xyz', resolve to absolute on host
  if (candidate.startsWith('/uploads/') || candidate.startsWith('uploads/')) {
    const rel = candidate.replace(/^\/?uploads\/?/, '');
    candidate = path.join(UPLOADS_DIR, rel);
  }

  // 2. If it's not absolute, resolve relative to datasets directory or cwd
  if (!path.isAbsolute(candidate)) {
    const fromDatasets = path.join(UPLOADS_DIR, 'datasets', candidate);
    if (fs.existsSync(fromDatasets)) {
      candidate = fromDatasets;
    } else {
      candidate = path.resolve(process.cwd(), candidate);
    }
  }

  // 3. If candidate exists on disk:
  if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
    const isZip = candidate.toLowerCase().endsWith('.zip') || (fs.statSync(/*turbopackIgnore: true*/ candidate).isFile() && candidate.includes('.zip'));
    if (isZip) {
      const extractedDir = candidate.replace(/\.zip$/i, '');
      if (fs.existsSync(/*turbopackIgnore: true*/ extractedDir) && fs.statSync(/*turbopackIgnore: true*/ extractedDir).isDirectory()) {
        return extractedDir;
      }
      try {
        fs.mkdirSync(extractedDir, { recursive: true });
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${candidate}' -DestinationPath '${extractedDir}' -Force"`, {
          timeout: 60000,
          stdio: ['ignore', 'ignore', 'ignore']
        });
        if (fs.existsSync(/*turbopackIgnore: true*/ extractedDir)) {
          return extractedDir;
        }
      } catch {
        // Fallback: Python will also handle auto-extraction if zip passed
      }
    }
    return candidate;
  }

  // 4. Try matching datasetName in UPLOADS_DIR/datasets
  if (datasetName) {
    const byName1 = path.join(UPLOADS_DIR, 'datasets', datasetName);
    const byName2 = path.join(UPLOADS_DIR, 'datasets', `${datasetName}-v1`);
    if (fs.existsSync(byName1)) return byName1;
    if (fs.existsSync(byName2)) return byName2;
  }

  // 5. Try basename in UPLOADS_DIR/datasets
  if (rawPath) {
    const base = path.basename(rawPath);
    const byBase = path.join(UPLOADS_DIR, 'datasets', base);
    if (fs.existsSync(byBase)) {
      if (byBase.toLowerCase().endsWith('.zip')) {
        const extracted = byBase.replace(/\.zip$/i, '');
        if (fs.existsSync(extracted)) return extracted;
      }
      return byBase;
    }
  }

  return candidate;
}


