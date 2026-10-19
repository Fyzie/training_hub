import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

let cachedPythonExe: string | null = null;

/**
 * Dynamically resolves the Python executable installed on the HOST workstation server.
 * Never hardcodes any developer username, user profile, or drive letter.
 */
export function getHostPythonExe(): string {
  if (cachedPythonExe && fs.existsSync(/*turbopackIgnore: true*/ cachedPythonExe)) {
    return cachedPythonExe;
  }

  // 1. Explicit environment variable configured on host
  if (process.env.PYTHON_EXE && fs.existsSync(process.env.PYTHON_EXE)) {
    cachedPythonExe = process.env.PYTHON_EXE;
    return cachedPythonExe;
  }

  // 1b. Check .env.local configured by start_hub.bat or setup_office_pc.bat
  try {
    const envFile = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      const match = content.match(/^PYTHON_EXE=(.*)$/m);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        if (val && fs.existsSync(val)) {
          cachedPythonExe = val;
          return cachedPythonExe;
        }
      }
    }
  } catch {}

  const homedir = os.homedir();
  const hostUser = path.basename(homedir);

  // 2. High-priority candidate locations on the host server
  const candidates: string[] = [
    // Host user's py-gpu conda environment (Preferred for CUDA PyTorch)
    path.join(homedir, 'anaconda3', 'envs', 'py-gpu', 'python.exe'),
    path.join(homedir, 'miniconda3', 'envs', 'py-gpu', 'python.exe'),
    path.join(homedir, '.conda', 'envs', 'py-gpu', 'python.exe'),

    // Host user's base anaconda / miniconda
    path.join(homedir, 'anaconda3', 'python.exe'),
    path.join(homedir, 'miniconda3', 'python.exe'),

    // Global / ProgramData / Root Anaconda installations
    'C:\\ProgramData\\anaconda3\\envs\\py-gpu\\python.exe',
    'C:\\ProgramData\\miniconda3\\envs\\py-gpu\\python.exe',
    'C:\\ProgramData\\anaconda3\\python.exe',
    'C:\\ProgramData\\miniconda3\\python.exe',
    'C:\\anaconda3\\envs\\py-gpu\\python.exe',
    'C:\\anaconda3\\python.exe',
    'C:\\miniconda3\\python.exe',

    // Host user's AppData Python installations
    path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python39', 'python.exe'),
    path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python38', 'python.exe'),

    // Common system Python installations
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python39\\python.exe',
    'C:\\Python38\\python.exe',

    // Linux / Mac paths if hosted on Linux server
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    path.join(homedir, 'anaconda3', 'envs', 'py-gpu', 'bin', 'python'),
    path.join(homedir, 'miniconda3', 'envs', 'py-gpu', 'bin', 'python'),
    path.join(homedir, 'anaconda3', 'bin', 'python'),
    path.join(homedir, 'miniconda3', 'bin', 'python'),
  ];

  // Dynamically inspect any user directories under SystemDrive\Users (e.g., C:\Users)
  if (process.platform === 'win32') {
    try {
      const systemDrive = process.env.SystemDrive || 'C:';
      const usersDir = path.join(systemDrive, 'Users');
      if (fs.existsSync(usersDir)) {
        const userEntries = fs.readdirSync(usersDir, { withFileTypes: true });
        for (const entry of userEntries) {
          if (entry.isDirectory()) {
            const uName = entry.name;
            const uLower = uName.toLowerCase();
            if (uLower !== hostUser.toLowerCase() && !['all users', 'default', 'default user', 'public'].includes(uLower)) {
              candidates.push(
                path.join(usersDir, uName, 'anaconda3', 'envs', 'py-gpu', 'python.exe'),
                path.join(usersDir, uName, 'miniconda3', 'envs', 'py-gpu', 'python.exe'),
                path.join(usersDir, uName, 'anaconda3', 'python.exe'),
                path.join(usersDir, uName, 'miniconda3', 'python.exe'),
                path.join(usersDir, uName, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
                path.join(usersDir, uName, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
                path.join(usersDir, uName, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
                path.join(usersDir, uName, 'AppData', 'Local', 'Programs', 'Python', 'Python39', 'python.exe'),
                path.join(usersDir, uName, 'AppData', 'Local', 'Programs', 'Python', 'Python38', 'python.exe')
              );
            }
          }
        }
      }
    } catch {}
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ c)) {
        cachedPythonExe = c;
        return c;
      }
    } catch {}
  }

  // 3. Inspect system PATH on the host
  try {
    const cmd = process.platform === 'win32' ? 'where.exe python' : 'which python3 || which python';
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) {
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        // Skip WindowsApps redirector if another real python is present
        if (!line.toLowerCase().includes('windowsapps') && fs.existsSync(line)) {
          cachedPythonExe = line;
          return line;
        }
      }
      if (lines[0] && fs.existsSync(lines[0])) {
        cachedPythonExe = lines[0];
        return lines[0];
      }
    }
  } catch {}

  // 4. Fallback to bare command
  return 'python';
}
