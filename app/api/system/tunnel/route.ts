import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync, ChildProcess } from 'child_process';
import { DATA_DIR, ensureStorageHub } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const TUNNEL_CONFIG_FILE = path.join(DATA_DIR, 'tunnel.json');
const TUNNEL_LOG_FILE = path.join(DATA_DIR, 'cloudflared.log');

declare global {
  // eslint-disable-next-line no-var
  var __cloudflared_proc: ChildProcess | null | undefined;
}

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];

  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    // Exclude virtual adapters
    if (
      lower.includes('vgate') ||
      lower.includes('vethernet') ||
      lower.includes('docker') ||
      lower.includes('wsl') ||
      lower.includes('virtual') ||
      lower.includes('vmware') ||
      lower.includes('tap') ||
      lower.includes('teredo')
    ) {
      continue;
    }

    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        candidates.push({ name, address: net.address });
      }
    }
  }

  // Prioritize physical 192.168.x.x / 10.x.x office LAN, or Ethernet / Wi-Fi
  const preferred = candidates.find(
    (c) =>
      c.address.startsWith('192.168.') ||
      c.name.toLowerCase().includes('ethernet') ||
      c.name.toLowerCase().includes('wi-fi') ||
      c.name.toLowerCase().includes('wireless')
  );

  if (preferred) return preferred.address;
  if (candidates.length > 0) return candidates[0].address;
  return '192.168.8.105';
}

function findCloudflared(): string | null {
  const candidates = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.cwd(), 'cloudflared.exe')
  ];

  for (const c of candidates) {
    if (c === 'cloudflared') {
      try {
        execSync('where.exe cloudflared', { stdio: 'ignore' });
        return 'cloudflared';
      } catch {}
    } else if (fs.existsSync(/* turbopackIgnore: true */ c)) {
      return c;
    }
  }
  return null;
}

function isCloudflaredRunning(): boolean {
  try {
    const stdout = execSync('tasklist /fi "imagename eq cloudflared.exe" /fo csv /nh', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return stdout.toLowerCase().includes('cloudflared.exe');
  } catch {
    return false;
  }
}

function getTunnelConfig() {
  const defaults = {
    tunnelUrl: '',
    isActive: false,
    lastChecked: null,
    tunnelType: 'cloudflare_quick'
  };

  if (fs.existsSync(TUNNEL_CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TUNNEL_CONFIG_FILE, 'utf-8'));
      return { ...defaults, ...data };
    } catch {}
  }
  return defaults;
}

function saveTunnelConfig(updates: Partial<{ tunnelUrl: string; isActive: boolean; tunnelType: string }>) {
  const current = getTunnelConfig();
  const next = {
    ...current,
    ...updates,
    lastChecked: new Date().toISOString()
  };

  const dataDir = path.dirname(TUNNEL_CONFIG_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(TUNNEL_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function stopTunnelProcess() {
  if (globalThis.__cloudflared_proc) {
    try {
      globalThis.__cloudflared_proc.kill();
    } catch {}
    globalThis.__cloudflared_proc = null;
  }

  try {
    execSync('taskkill /f /im cloudflared.exe', { stdio: 'ignore' });
  } catch {}

  saveTunnelConfig({ tunnelUrl: '', isActive: false });
}

function extractUrlFromLog(): string | null {
  if (fs.existsSync(TUNNEL_LOG_FILE)) {
    try {
      const content = fs.readFileSync(TUNNEL_LOG_FILE, 'utf-8');
      const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1]; // Return the latest URL
      }
    } catch {}
  }
  return null;
}

async function startTunnelProcess(): Promise<{ success: boolean; tunnelUrl?: string; error?: string }> {
  const exe = findCloudflared();
  if (!exe) {
    return {
      success: false,
      error: 'cloudflared executable was not found on this computer. Please install it via "winget install Cloudflare.cloudflared".'
    };
  }

  // Ensure any existing cloudflared process is killed first
  stopTunnelProcess();

  const dataDir = path.dirname(TUNNEL_LOG_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(TUNNEL_LOG_FILE, `[${new Date().toISOString()}] Launching Cloudflare quick tunnel...\n`, 'utf-8');

  return new Promise((resolve) => {
    let resolved = false;
    let accumulated = '';

    const child = spawn(/* turbopackIgnore: true */ exe, ['tunnel', '--url', 'http://localhost:3000'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    globalThis.__cloudflared_proc = child;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const match = accumulated.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          const tunnelUrl = match[0];
          saveTunnelConfig({ tunnelUrl, isActive: true });
          resolve({ success: true, tunnelUrl });
        } else {
          resolve({
            success: false,
            error: 'Timed out waiting for Cloudflare tunnel URL (took longer than 15s). Please try again.'
          });
        }
      }
    }, 15000);

    const onOutput = (data: Buffer) => {
      const text = data.toString('utf-8');
      accumulated += text;

      try {
        fs.appendFileSync(TUNNEL_LOG_FILE, text, 'utf-8');
      } catch {}

      if (!resolved) {
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          resolved = true;
          clearTimeout(timeout);
          const tunnelUrl = match[0];
          saveTunnelConfig({ tunnelUrl, isActive: true });
          resolve({ success: true, tunnelUrl });
        }
      }
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ success: false, error: `Failed to start cloudflared: ${err.message}` });
      }
    });

    child.on('exit', (code) => {
      globalThis.__cloudflared_proc = null;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ success: false, error: `cloudflared exited unexpectedly with code ${code}` });
      } else {
        saveTunnelConfig({ tunnelUrl: '', isActive: false });
      }
    });
  });
}

export async function GET() {
  const localIp = getLocalIp();
  const config = getTunnelConfig();
  const running = isCloudflaredRunning();
  const cloudflareInstalled = Boolean(findCloudflared());

  let activeUrl = config.tunnelUrl;
  let activeState = running;

  if (running) {
    // If running but tunnelUrl is missing from config, check log file
    if (!activeUrl) {
      const logUrl = extractUrlFromLog();
      if (logUrl) {
        activeUrl = logUrl;
        saveTunnelConfig({ tunnelUrl: logUrl, isActive: true });
      }
    }
  } else {
    // Not running: ensure config reflects inactive
    if (config.isActive || config.tunnelUrl) {
      saveTunnelConfig({ tunnelUrl: '', isActive: false });
      activeUrl = '';
      activeState = false;
    }
  }

  return NextResponse.json({
    isActive: activeState,
    tunnelUrl: activeUrl,
    cloudflareInstalled,
    localIp,
    port: 3000,
    lanUrl: `http://${localIp}:3000`,
    localhostUrl: 'http://localhost:3000',
    tunnelType: config.tunnelType || 'cloudflare_quick',
    lastChecked: config.lastChecked
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'start') {
      const result = await startTunnelProcess();
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        isActive: true,
        tunnelUrl: result.tunnelUrl
      });
    }

    if (action === 'stop') {
      stopTunnelProcess();
      return NextResponse.json({
        success: true,
        isActive: false,
        tunnelUrl: ''
      });
    }

    // Manual/custom URL update fallback
    if (body.tunnelUrl !== undefined) {
      const config = saveTunnelConfig({
        tunnelUrl: body.tunnelUrl ? body.tunnelUrl.trim() : '',
        isActive: Boolean(body.tunnelUrl && body.tunnelUrl.trim()),
        tunnelType: body.tunnelType || 'cloudflare_quick'
      });
      return NextResponse.json({ success: true, config });
    }

    return NextResponse.json({ error: 'Invalid action or payload' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
