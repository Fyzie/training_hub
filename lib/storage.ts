import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { getHostPythonExe } from './python-runtime';

/**
 * Storage Hub - Centralized Data & Storage Path Resolution
 * Decouples all persistent data (users, jobs, inventory, blogs, datasets, uploads, and runs)
 * to an external directory (../storage-hub) beside the main codebase repository (hub).
 *
 * This ensures Git pulls, pushes, and branch changes will NEVER overwrite, conflict with,
 * or expose company operational data.
 */

function resolveStorageHubDir(): string {
  if (process.env.STORAGE_HUB_PATH) {
    return path.resolve(process.env.STORAGE_HUB_PATH);
  }
  // 1. Sibling storage-hub (preferred)
  const sibling = path.resolve(process.cwd(), '..', 'storage-hub');
  if (fs.existsSync(/*turbopackIgnore: true*/ sibling)) {
    return sibling;
  }
  try {
    fs.mkdirSync(sibling, { recursive: true });
    return sibling;
  } catch {}

  // 2. Fallback to an internal storage-hub directory inside current repo
  const internal = path.resolve(process.cwd(), 'storage-hub');
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ internal)) {
      fs.mkdirSync(internal, { recursive: true });
    }
    return internal;
  } catch {}

  return process.cwd();
}

export const STORAGE_HUB_DIR = resolveStorageHubDir();

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
  ensureStorageHub();

  let targetSubPath = '';

  // Clean rawPath from any machine-specific drive letters or prefixes from previous computers
  if (rawPath) {
    const trimmed = rawPath.trim();
    const match = trimmed.match(/uploads[\\/]datasets[\\/](.+)$/i);
    if (match) {
      targetSubPath = match[1].replace(/\\/g, '/');
    } else if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
      targetSubPath = trimmed.replace(/^\/?uploads\/?datasets\/?/i, '').replace(/\\/g, '/');
    } else {
      targetSubPath = path.basename(trimmed);
    }
  }

  const searchCandidates: string[] = [];

  // Check with targetSubPath
  if (targetSubPath) {
    searchCandidates.push(
      path.join(UPLOADS_DIR, 'datasets', targetSubPath),
      path.join(process.cwd(), 'public', 'uploads', 'datasets', targetSubPath),
      path.join(process.cwd(), 'uploads', 'datasets', targetSubPath)
    );
    if (!targetSubPath.toLowerCase().endsWith('.zip')) {
      searchCandidates.push(
        path.join(UPLOADS_DIR, 'datasets', `${targetSubPath}.zip`),
        path.join(process.cwd(), 'public', 'uploads', 'datasets', `${targetSubPath}.zip`)
      );
    }
  }

  // Check with datasetName
  if (datasetName) {
    const safeName = datasetName.replace(/[^a-zA-Z0-9_-]/g, '_');
    searchCandidates.push(
      path.join(UPLOADS_DIR, 'datasets', datasetName),
      path.join(UPLOADS_DIR, 'datasets', `${datasetName}-v1`),
      path.join(UPLOADS_DIR, 'datasets', safeName),
      path.join(UPLOADS_DIR, 'datasets', `${safeName}-v1`),
      path.join(process.cwd(), 'public', 'uploads', 'datasets', datasetName),
      path.join(process.cwd(), 'public', 'uploads', 'datasets', `${datasetName}-v1`)
    );
  }

  // Check if rawPath exists directly on current host
  if (rawPath && path.isAbsolute(rawPath) && fs.existsSync(/*turbopackIgnore: true*/ rawPath)) {
    searchCandidates.unshift(rawPath);
  }

  // Test direct candidates
  for (const cand of searchCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ cand)) {
      const isZip = cand.toLowerCase().endsWith('.zip') || (fs.statSync(/*turbopackIgnore: true*/ cand).isFile() && cand.includes('.zip'));
      if (isZip) {
        const extractedDir = cand.replace(/\.zip$/i, '');
        if (fs.existsSync(/*turbopackIgnore: true*/ extractedDir) && fs.statSync(/*turbopackIgnore: true*/ extractedDir).isDirectory()) {
          return extractedDir;
        }
        const extractedDir2 = `${cand}_extracted`;
        if (fs.existsSync(/*turbopackIgnore: true*/ extractedDir2) && fs.statSync(/*turbopackIgnore: true*/ extractedDir2).isDirectory()) {
          return extractedDir2;
        }
        // Return archive path directly so scheduler can unzip asynchronously with status updates
        return cand;
      }
      return cand;
    }
  }

  // Deep scan in datasets directories if not found by direct match
  for (const rootDir of [path.join(UPLOADS_DIR, 'datasets'), path.join(process.cwd(), 'public', 'uploads', 'datasets')]) {
    if (fs.existsSync(/*turbopackIgnore: true*/ rootDir)) {
      try {
        const entries = fs.readdirSync(rootDir);
        for (const entry of entries) {
          const p = path.join(rootDir, entry);
          if (targetSubPath && entry.toLowerCase().includes(targetSubPath.toLowerCase().replace(/\.zip$/i, ''))) {
            return p;
          }
          if (datasetName && entry.toLowerCase().includes(datasetName.toLowerCase())) {
            return p;
          }
        }
      } catch {}
    }
  }

  // Fallback to standard location under current storage hub datasets folder
  return targetSubPath ? path.join(UPLOADS_DIR, 'datasets', targetSubPath) : path.join(UPLOADS_DIR, 'datasets');
}

/**
 * Unzips a dataset archive asynchronously using the host's Python zipfile utility.
 * Extremely fast, non-blocking, and avoids PowerShell console popups.
 */
export function unzipDatasetArchiveAsync(zipPath: string, destDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const pythonExe = getHostPythonExe();
      const scriptPath = path.join(process.cwd(), 'scripts', 'dataset_tools.py');

      const child = spawn(pythonExe, [
        scriptPath,
        '--action', 'extract',
        '--dataset_dir', destDir,
        '--target_zip', zipPath
      ]);

      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(destDir)) {
          resolve(destDir);
        } else {
          reject(new Error(stderr || `Dataset extraction failed with exit code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}


