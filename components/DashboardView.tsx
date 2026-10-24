'use client';

import React, { useState, useEffect } from 'react';
import { SystemMetrics, TrainingJob } from '@/lib/types';
import { useAuth } from './AuthContext';
import {
  Activity,
  Cpu,
  Flame,
  Zap,
  HardDrive,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Server,
  Play,
  Layers,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  User
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateTab: (tab: string) => void;
  onOpenTunnel?: () => void;
  onOpenLogin?: () => void;
}

export function DashboardView({ onNavigateTab, onOpenTunnel, onOpenLogin }: DashboardViewProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch real-time hardware telemetry and active jobs
  const fetchTelemetry = async () => {
    try {
      setIsRefreshing(true);
      const [mRes, jRes] = await Promise.all([
        fetch('/api/system/metrics'),
        fetch('/api/jobs')
      ]);

      if (mRes.ok) {
        const mData: SystemMetrics = await mRes.json();
        setMetrics(mData);
      }
      if (jRes.ok) {
        const jData: TrainingJob[] = await jRes.json();
        setJobs(jData);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    // Auto-refresh every 3.5 seconds for live PC specs
    const timer = setInterval(fetchTelemetry, 3500);
    return () => clearInterval(timer);
  }, []);

  const activeJob = jobs.find((j) => j.status === 'running');
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getElapsedRunningTime = (startedAt?: string, submittedAt?: string) => {
    const start = startedAt || submittedAt;
    if (!start) return '0s';
    const startTime = new Date(start).getTime();
    if (isNaN(startTime)) return '0s';
    const diffSec = Math.max(0, Math.floor((currentTime - startTime) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // GPU values with fallback defaults
  const gpuTemp = metrics?.gpu.temperature ?? 45;
  const gpuUtil = metrics?.gpu.utilization ?? 28;
  const gpuMemUsed = metrics?.gpu.memoryUsed ?? 1252;
  const gpuMemTotal = metrics?.gpu.memoryTotal ?? 12288;
  const gpuMemFreeGB = Math.round(((gpuMemTotal - gpuMemUsed) / 1024) * 10) / 10;
  const gpuMemUsedGB = Math.round((gpuMemUsed / 1024) * 10) / 10;
  const gpuMemPercent = Math.round((gpuMemUsed / gpuMemTotal) * 100);

  const cpuUsage = metrics?.cpu.usagePercent ?? 14;
  const ramUsed = metrics?.ram.usedGB ?? 14.8;
  const ramTotal = metrics?.ram.totalGB ?? 31.9;
  const ramPercent = metrics?.ram.usagePercent ?? 46;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 w-full">
      {/* Top Banner: Title */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
            Host Workstation Analytics
          </h1>
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
            OFFICE PC
          </span>
        </div>
      </div>

      {/* Primary Telemetry Grid: Active Training Job & Pressure Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Active Training Job Live Progress Card (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-slate-900">Active Training Job</span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                activeJob
                  ? 'bg-blue-100 text-blue-700 animate-pulse'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {activeJob ? 'TRAINING LIVE' : 'WORKSTATION IDLE'}
            </span>
          </div>

          {activeJob ? (
            <div className="my-4 space-y-4">
              <div>
                <p className="text-base font-extrabold text-slate-900 truncate">{activeJob.name}</p>
                <p className="text-xs text-slate-500">{activeJob.datasetName || 'Industrial Dataset'}</p>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-600">
                    Epoch {activeJob.currentEpoch}/{activeJob.totalEpochs}
                  </span>
                  <span className="text-blue-600 font-bold">{activeJob.progressPercent}%</span>
                </div>
                <div className="w-full h-3.5 rounded-full bg-slate-100 overflow-hidden p-0.5">
                  <div
                    style={{ width: `${activeJob.progressPercent}%` }}
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">User</span>
                    <span className="font-extrabold text-slate-800 text-xs truncate block">
                      {activeJob.submittedBy ? `By ${activeJob.submittedBy}` : 'By ML Engineer'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Time Running</span>
                    <span className="font-extrabold text-emerald-700 text-xs truncate block font-mono">
                      {getElapsedRunningTime(activeJob.startedAt, activeJob.submittedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="my-8 text-center py-6">
              <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-slate-800">No Job Running on GPU</p>
            </div>
          )}

          {user && (
            <div className="pt-2">
              <button
                onClick={() => onNavigateTab('training')}
                className="w-full py-3 px-4 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Open Job Queue & Console Logs</span>
              </button>
            </div>
          )}
        </div>

        {/* Circular Telemetry Gauges (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-bold text-sm text-slate-900">System Pressure Gauges</span>
              <p className="text-xs text-slate-400 mt-0.5">Real-time workstation memory and compute utilization</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchTelemetry}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                title="Refresh Metrics"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Twin Circular Rings */}
          <div className="grid grid-cols-2 gap-3 sm:gap-6 my-auto py-3 sm:py-4">
            {/* VRAM Ring */}
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#F1F5F9"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#2563EB"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * gpuMemPercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="30"
                    fill="transparent"
                    stroke="#93C5FD"
                    strokeWidth="5"
                    strokeDasharray="188.4"
                    strokeDashoffset={188.4 - (188.4 * gpuUtil) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-sm sm:text-base font-black text-slate-900">{gpuMemPercent}%</span>
                  <span className="block text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase">VRAM</span>
                </div>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-2">GPU Memory</p>
              <p className="text-[10px] sm:text-[11px] text-slate-400">{gpuMemUsedGB} / 12 GB</p>
            </div>

            {/* RAM Ring */}
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#F1F5F9"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#F59E0B"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * ramPercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="30"
                    fill="transparent"
                    stroke="#FDE68A"
                    strokeWidth="5"
                    strokeDasharray="188.4"
                    strokeDashoffset={188.4 - (188.4 * cpuUsage) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-sm sm:text-base font-black text-slate-900">{ramPercent}%</span>
                  <span className="block text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase">RAM</span>
                </div>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-2">Host Memory</p>
              <p className="text-[10px] sm:text-[11px] text-slate-400">{ramUsed} / {ramTotal} GB</p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-around gap-2 text-[11px] sm:text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" /> GPU: {gpuTemp}°C
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Power: {metrics?.gpu.powerDraw ?? 28}W
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Fan: {metrics?.gpu.fanSpeed ?? 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Office Workstation Specs & Quick Lab Portals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Node Specs */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-900">Workstation Specifications</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">LOCAL SERVER</span>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-start py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-400 shrink-0">GPU Architecture</span>
                <span className="font-bold text-slate-800 text-right text-[11px] sm:text-xs">
                  {metrics?.specs?.gpuArchitecture || (metrics?.gpu?.name ? `${metrics.gpu.name} (${Math.round((metrics.gpu.memoryTotal || 12288)/1024)}GB)` : 'Detecting GPU...')}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-400 shrink-0">Host Processor</span>
                <span className="font-bold text-slate-800 text-right text-[11px] sm:text-xs">
                  {metrics?.specs?.hostProcessor || metrics?.cpu?.model || 'Detecting CPU...'}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-400 shrink-0">System Memory</span>
                <span className="font-bold text-slate-800 text-right text-[11px] sm:text-xs">
                  {metrics?.specs?.systemMemory || (metrics?.ram?.totalGB ? `${Math.round(metrics.ram.totalGB)} GB RAM` : 'Detecting RAM...')}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 gap-2">
                <span className="text-slate-400 shrink-0">Storage Array</span>
                <span className="font-bold text-slate-800 text-right text-[11px] sm:text-xs">
                  {metrics?.specs?.storageArray || (metrics?.disk?.totalGB ? `${metrics.disk.totalGB >= 900 ? '1 TB' : `${metrics.disk.totalGB} GB`} SSD (${metrics.disk.freeGB} GB Free)` : 'Detecting Storage...')}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="truncate mr-2">Gateway: {metrics?.specs?.gateway || (metrics?.network?.localIp ? `${metrics.network.localIp}:3000` : 'localhost:3000')}</span>
            {user && (
              <button
                onClick={onOpenTunnel}
                className="text-blue-600 font-bold hover:underline cursor-pointer shrink-0"
              >
                Cloudflare Tunnel
              </button>
            )}
          </div>
        </div>

        {/* Model Studio Link */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-900">Model Training Studio</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">COMPUTE READY</span>
            </div>
            <div className="mt-4 p-3 bg-slate-50 rounded-2xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Active / Queued:</span>
                <span className="font-bold text-slate-900">{activeJob ? '1 Running' : '0 Running'} • {queuedCount} Queued</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Historical Runs:</span>
                <span className="font-bold text-slate-900">{completedCount} Completed</span>
              </div>
            </div>
          </div>
          {user && (
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => onNavigateTab('training')}
                className="w-full py-2.5 px-4 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Go to Model Studio</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Hardware & SOP Link */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-900">Inventory & Guidance</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">OFFICE ASSETS</span>
            </div>
            {user && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onNavigateTab('inventory')}
                  className="flex-1 p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-left transition-colors cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-blue-600 mb-1" />
                  <p className="text-xs font-bold text-slate-900">Inventory</p>
                  <p className="text-[10px] text-slate-400">List & Checkout</p>
                </button>
                <button
                  onClick={() => onNavigateTab('blog')}
                  className="flex-1 p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-left transition-colors cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-amber-600 mb-1" />
                  <p className="text-xs font-bold text-slate-900">Guidance Docs</p>
                  <p className="text-[10px] text-slate-400">SOPs & Slides</p>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
