'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  Zap,
  X,
  RefreshCw,
  Power,
  AlertCircle,
  Radio,
  Server
} from 'lucide-react';

interface TunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  isTabMode?: boolean;
}

export function TunnelModal({ isOpen, onClose, isTabMode = false }: TunnelModalProps) {
  const [networkInfo, setNetworkInfo] = useState<{
    localIp: string;
    port: number;
    lanUrl: string;
    localhostUrl: string;
    tunnelUrl: string;
    isActive: boolean;
    cloudflareInstalled: boolean;
    tunnelType?: string;
    customAppUrl?: string;
  }>({
    localIp: '127.0.0.1',
    port: 3000,
    lanUrl: 'http://localhost:3000',
    localhostUrl: 'http://localhost:3000',
    tunnelUrl: '',
    isActive: false,
    cloudflareInstalled: true
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchNetwork = useCallback(async () => {
    try {
      const res = await fetch('/api/system/tunnel');
      if (res.ok) {
        const data = await res.json();
        setNetworkInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch tunnel network info:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen || isTabMode) {
      fetchNetwork();
      const interval = setInterval(fetchNetwork, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, isTabMode, fetchNetwork]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleStartTunnel = async () => {
    setIsStarting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/system/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to start Cloudflare tunnel');
      } else {
        await fetchNetwork();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error starting tunnel';
      setErrorMessage(msg);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTunnel = async () => {
    setIsStopping(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/system/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to stop Cloudflare tunnel');
      } else {
        await fetchNetwork();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error stopping tunnel';
      setErrorMessage(msg);
    } finally {
      setIsStopping(false);
    }
  };

  if (!isOpen && !isTabMode) return null;

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-100 gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Host Server Gateway
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              Port: 3000 • Local Workstation
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 leading-tight">
            Local Office Server & Cloudflare Remote Access
          </h2>
        </div>

        {!isTabMode && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-bold">Tunnel Notice:</p>
            <p>{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Two Main Access Channels: In-Office LAN vs Cloudflare Tunnel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Channel 1: In-Office Wi-Fi / LAN */}
        <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200/80 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">In-Office Access (LAN)</h4>
                  <p className="text-[11px] text-slate-500">For office Wi-Fi / Ethernet</p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Always Live
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Shareable Office URL
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold text-blue-700 break-all select-all">
                  {networkInfo.lanUrl}
                </span>
                <button
                  onClick={() => copyToClipboard(networkInfo.lanUrl, 'lan')}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedField === 'lan' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Channel 2: Worldwide Remote Access (Cloudflare Tunnel) */}
        <div className="bg-amber-50/40 rounded-3xl p-5 border border-amber-200/80 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-sm">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">Worldwide Remote Access</h4>
                  <p className="text-[11px] text-slate-500">
                    {networkInfo.tunnelType === 'cloudflare_named'
                      ? 'Cloudflare Zero Trust (Permanent Domain)'
                      : 'Cloudflare Quick Tunnel (Anywhere)'}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {networkInfo.isActive ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  Online
                </span>
              ) : isStarting ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-700" />
                  Connecting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Stopped
                </span>
              )}
            </div>

            {/* Active URL Display Box */}
            {networkInfo.isActive && networkInfo.tunnelUrl ? (
              <div className="bg-white p-3.5 rounded-2xl border border-emerald-300 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                    <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                    Active Cloudflare Public URL
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-800 break-all select-all">
                    {networkInfo.tunnelUrl}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => copyToClipboard(networkInfo.tunnelUrl, 'tunnel')}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="Copy Public URL"
                    >
                      {copiedField === 'tunnel' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <a
                      href={networkInfo.tunnelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-amber-100/40 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                Click <strong className="font-bold">Start Tunnel</strong> above. Cloudflare will automatically generate an active public URL and display it here within 3–5 seconds without manual setup!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Summary / Status Information */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-600" />
          <span>Workstation Host Gateway Status</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">Local PC Host IP</p>
            <p className="font-mono font-bold text-slate-800">{networkInfo.localIp}</p>
            <p className="text-[11px] text-slate-500">Ethernet / Wi-Fi Adapter</p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">Workstation Port</p>
            <p className="font-mono font-bold text-slate-800">3000 (Web) • 8000 (API)</p>
            <p className="text-[11px] text-slate-500">Decoupled Local Storage</p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">Tunnel Daemon</p>
            <p className="font-mono font-bold text-slate-800">
              {networkInfo.isActive ? 'Active (Live)' : 'Stopped (On-Demand)'}
            </p>
            <p className="text-[11px] text-slate-500">No open router ports required</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (isTabMode) {
    return <div className="animate-in fade-in duration-300">{content}</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl p-4 sm:p-8 max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        {content}
      </div>
    </div>
  );
}
