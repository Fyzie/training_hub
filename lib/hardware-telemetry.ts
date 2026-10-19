import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { SystemMetrics } from './types';

let previousCpus = os.cpus();
let lastCpuMeasureTime = Date.now();
let cachedCpuUsage = 14;

let cachedHardwareSpecs: {
  gpuArchitecture: string;
  hostProcessor: string;
  systemMemory: string;
  storageArray: string;
} | null = null;
let lastSpecsTime = 0;

function calculateCpuUsage(): number {
  const currentCpus = os.cpus();
  const now = Date.now();

  if (now - lastCpuMeasureTime < 500) {
    return cachedCpuUsage;
  }

  let totalDiff = 0;
  let idleDiff = 0;

  for (let i = 0; i < currentCpus.length; i++) {
    const prev = previousCpus[i] ? previousCpus[i].times : { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    const curr = currentCpus[i].times;

    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    totalDiff += currTotal - prevTotal;
    idleDiff += curr.idle - prev.idle;
  }

  previousCpus = currentCpus;
  lastCpuMeasureTime = now;

  if (totalDiff <= 0) return cachedCpuUsage;

  const usage = Math.max(2, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
  cachedCpuUsage = usage;
  return usage;
}

export function getRealGpuDeviceString(): string {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { timeout: 2000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    if (output) {
      const firstLine = output.split('\n')[0].trim();
      const parts = firstLine.split(',').map((p) => p.trim());
      const name = parts[0] || 'NVIDIA GPU';
      const memMB = parseFloat(parts[1]) || 0;
      const memGB = Math.round(memMB / 1024);
      return memGB > 0 ? `${name} (${memGB}GB)` : name;
    }
  } catch {
    try {
      const out = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Where-Object {$_.Name -match \'NVIDIA|GeForce|RTX|GTX|Radeon|AMD|Intel\'} | Select-Object -First 1).Name"',
        { timeout: 2500, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      if (out) return out;
    } catch {}
  }
  return 'CUDA GPU';
}

export function getRealGpuShortName(): string {
  const full = getRealGpuDeviceString();
  return full.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '').trim();
}

function getGpuMetrics() {
  const realName = getRealGpuDeviceString();
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.free,memory.used,power.draw,power.limit,fan.speed --format=csv,noheader,nounits',
      { timeout: 2000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    if (output) {
      const parts = output.split(',').map((p) => p.trim());
      if (parts.length >= 10) {
        return {
          available: true,
          name: parts[0] || realName,
          temperature: parseFloat(parts[1]) || 45,
          utilization: parseFloat(parts[2]) || 0,
          memoryUtilization: parseFloat(parts[3]) || 0,
          memoryTotal: parseFloat(parts[4]) || 12288,
          memoryFree: parseFloat(parts[5]) || 11000,
          memoryUsed: parseFloat(parts[6]) || 1288,
          powerDraw: parseFloat(parts[7]) || 28,
          powerLimit: parseFloat(parts[8]) || 170,
          fanSpeed: parseFloat(parts[9]) || 0
        };
      }
    }
  } catch {
    // Fallback if nvidia-smi isn't available
  }

  return {
    available: false,
    name: realName,
    temperature: 46,
    utilization: 0,
    memoryUtilization: 0,
    memoryTotal: 12288,
    memoryFree: 12288,
    memoryUsed: 0,
    powerDraw: 0,
    powerLimit: 170,
    fanSpeed: 0
  };
}

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];

  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
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

  const preferred = candidates.find(
    (c) =>
      c.address.startsWith('192.168.') ||
      c.name.toLowerCase().includes('ethernet') ||
      c.name.toLowerCase().includes('wi-fi') ||
      c.name.toLowerCase().includes('wireless')
  );

  if (preferred) return preferred.address;
  if (candidates.length > 0) return candidates[0].address;
  return '127.0.0.1';
}

function getDiskMetrics() {
  try {
    const stat = fs.statfsSync('.');
    const totalGB = Math.round((stat.bsize * stat.blocks) / (1024 * 1024 * 1024));
    const freeGB = Math.round((stat.bsize * stat.bfree) / (1024 * 1024 * 1024));
    const usedGB = totalGB - freeGB;
    const usagePercent = totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 48;
    return { totalGB, freeGB, usedGB, usagePercent };
  } catch {
    return { totalGB: 1000, freeGB: 516, usedGB: 484, usagePercent: 48 };
  }
}

function extractRealHardwareSpecs(gpuName: string, gpuMemMB: number, totalDiskGB: number, freeDiskGB: number) {
  const now = Date.now();
  if (cachedHardwareSpecs && now - lastSpecsTime < 300000) {
    return cachedHardwareSpecs;
  }

  // 1. Host Processor (CPU)
  const cpus = os.cpus();
  let hostProcessor = 'Intel Core i5-11400F (12T)';
  if (cpus && cpus.length > 0) {
    const raw = cpus[0].model.replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim();
    const cleanModel = raw.split('@')[0].trim();
    hostProcessor = `${cleanModel} (${cpus.length}T)`;
  }

  // 2. GPU Architecture
  let gpuArchitecture = getRealGpuDeviceString();
  if (gpuName && gpuName !== 'NVIDIA GPU' && gpuName !== 'CUDA GPU') {
    const vramGB = Math.round(gpuMemMB / 1024);
    gpuArchitecture = vramGB > 0 ? `${gpuName} (${vramGB}GB)` : gpuName;
  }

  // 3. System Memory (RAM)
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  let memType = '';
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).SMBIOSMemoryType"',
      { timeout: 2500, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (out === '26') memType = ' DDR4';
    else if (out === '34' || out === '35') memType = ' DDR5';
    else if (out === '24') memType = ' DDR3';
  } catch {}
  const systemMemory = `${totalRamGB} GB${memType || ' RAM'}`;

  // 4. Storage Array (Active local drive where the codebase is installed)
  const root = path.parse(process.cwd()).root;
  const driveLetter = root.replace(/[^a-zA-Z]/g, '').toUpperCase() || 'D';
  const capacityStr = totalDiskGB >= 900 ? `${Math.round(totalDiskGB / 1000)} TB` : `${totalDiskGB} GB`;
  const storageArray = `Local Disk (${driveLetter}:) - ${capacityStr} (${freeDiskGB} GB Free)`;

  cachedHardwareSpecs = {
    gpuArchitecture,
    hostProcessor,
    systemMemory,
    storageArray
  };
  lastSpecsTime = now;

  return cachedHardwareSpecs;
}

export function getSystemMetrics(): SystemMetrics {
  const totalRamGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const freeRamGB = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;
  const usedRamGB = Math.round((totalRamGB - freeRamGB) * 10) / 10;
  const ramUsagePercent = Math.round((usedRamGB / totalRamGB) * 100);

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'Intel Core i5-11400F';
  const cpuCores = cpus.length || 12;
  const cpuUsage = calculateCpuUsage();

  const gpu = getGpuMetrics();
  const disk = getDiskMetrics();
  const localIp = getLocalIp();

  const specsBase = extractRealHardwareSpecs(gpu.name, gpu.memoryTotal, disk.totalGB, disk.freeGB);

  return {
    gpu,
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      usagePercent: cpuUsage,
      clockSpeed: cpus[0]?.speed || 2600
    },
    ram: {
      totalGB: totalRamGB,
      usedGB: usedRamGB,
      freeGB: freeRamGB,
      usagePercent: ramUsagePercent
    },
    disk,
    os: {
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      uptimeSeconds: os.uptime()
    },
    network: {
      localIp,
      port: 3000,
      tunnelActive: false
    },
    specs: {
      ...specsBase,
      gateway: `${localIp}:3000`
    },
    timestamp: new Date().toISOString()
  };
}
