'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { PendingUser } from '@/lib/types';
import {
  Activity,
  Cpu,
  Layers,
  BookOpen,
  Bell,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  LogOut,
  UserCheck,
  UserPlus,
  Check,
  X,
  Server,
  Camera,
  Upload,
  Menu,
  Users,
  Trash2,
  Shield,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { EditProfileModal } from './EditProfileModal';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenTunnel: () => void;
  onOpenLogin: () => void;
  unreadCount?: number;
  isTunnelActive?: boolean;
  localIp?: string;
}

export function Navbar({
  activeTab,
  setActiveTab,
  onOpenTunnel,
  onOpenLogin,
  unreadCount = 0,
  isTunnelActive,
  localIp
}: NavbarProps) {
  const { user, allUsers, switchUser, logout, updateAvatar, refreshUsers, deleteUser, updateUserLevel } = useAuth();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [pendingLevels, setPendingLevels] = useState<Record<string, 'Admin' | 'Guest'>>({});
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [tunnelActive, setTunnelActive] = useState(isTunnelActive ?? false);
  const [hostIp, setHostIp] = useState(localIp || (typeof window !== 'undefined' ? window.location.hostname : 'localhost'));
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close mobile sidebar on Escape key or desktop viewport resize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };

    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', handleResize);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (typeof isTunnelActive === 'boolean') {
      setTunnelActive(isTunnelActive);
    }
  }, [isTunnelActive]);

  useEffect(() => {
    if (localIp) {
      setHostIp(localIp);
    }
  }, [localIp]);

  // Poll tunnel status to keep indicator instantly reactive
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/system/tunnel');
        if (res.ok) {
          const data = await res.json();
          setTunnelActive(Boolean(data.isActive));
          if (data.localIp) setHostIp(data.localIp);
        }
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll pending user approval requests when logged in
  const fetchPendingUsers = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/auth/pending');
      if (res.ok) {
        const data = await res.json();
        setPendingUsers(data);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchPendingUsers();
      const interval = setInterval(fetchPendingUsers, 4000);
      return () => clearInterval(interval);
    }
  }, [user, fetchPendingUsers]);

  const handleApproveUser = async (pendingId: string) => {
    setIsApprovingId(pendingId);
    try {
      const chosenLevel = pendingLevels[pendingId] || 'Guest';
      const res = await fetch('/api/auth/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingId,
          action: 'approve',
          approvedBy: user?.name || 'Admin',
          approvedById: user?.id,
          level: chosenLevel
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPendingUsers(data.allPending || []);
        await refreshUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to approve user');
      }
    } catch (err) {
      console.error('Failed to approve user:', err);
    } finally {
      setIsApprovingId(null);
    }
  };

  const handleRejectUser = async (pendingId: string) => {
    setIsApprovingId(pendingId);
    try {
      const res = await fetch('/api/auth/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingId,
          action: 'reject',
          approvedBy: user?.name || 'Admin',
          approvedById: user?.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPendingUsers(data.allPending || []);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to decline user');
      }
    } catch (err) {
      console.error('Failed to decline user:', err);
    } finally {
      setIsApprovingId(null);
    }
  };

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'training', label: 'Model Training', icon: Cpu },
    { id: 'inventory', label: 'Inventory', icon: Layers },
    { id: 'blog', label: 'Guidance', icon: BookOpen }
  ];

  const navItems = user
    ? allNavItems
    : allNavItems.filter((item) => item.id === 'dashboard');

  // Helper for empty avatar initials
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Handle avatar upload by the staff themselves
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.url) {
        await updateAvatar(data.url);
      }
    } catch (err) {
      console.error('Failed to upload profile picture:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#F4F6F9]/95 backdrop-blur-md py-2 sm:py-3 px-3 sm:px-5 lg:px-8 xl:px-12 border-b border-slate-200/60">
        <div className="w-full flex items-center justify-between gap-1.5 sm:gap-3 xl:gap-4 flex-nowrap">
          {/* Left: Mobile Sidebar Hamburger Button & Brand Logo */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 select-none">
            {user && (
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open navigation sidebar"
                title="Navigation Menu"
                className="md:hidden w-8 h-8 rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
              >
                <Menu className="w-4.5 h-4.5" />
              </button>
            )}

            <div
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
            >
              <img
                src="/logo.png"
                alt="Company Logo"
                className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg group-hover:scale-105 transition-transform"
              />
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg xl:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
                  IRnow Workspace
                </span>
              </div>
            </div>
          </div>

        {/* Center: Sleek Pill Navigation Bar - DESKTOP ONLY */}
        <nav className="hidden md:flex items-center bg-white/95 rounded-full p-1 sm:p-1.5 shadow-sm border border-slate-200/80 shrink-0 flex-nowrap">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-1.5 xl:gap-2 px-3 xl:px-4.5 py-1.5 xl:py-2 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Controls & User Pill (Single Line) */}
        <div className="flex items-center gap-1.5 sm:gap-2 xl:gap-3 shrink-0 flex-nowrap">
          {/* Dedicated Host Gateway Pill Button (Logged in only) */}
          {user && (
            <button
              onClick={onOpenTunnel}
              title={tunnelActive ? "Cloudflare Tunnel Active (Live) • Click to open Gateway" : "Cloudflare Tunnel Stopped • Click to Start"}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200/80 hover:bg-blue-100 transition-colors shrink-0 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="font-mono text-xs font-semibold hidden xl:inline">{hostIp}</span>
              <span className="font-mono text-[11px] font-semibold hidden sm:inline xl:hidden">LAN</span>
              <span className="font-mono text-[10px] font-bold sm:hidden">IP</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  tunnelActive
                    ? 'bg-emerald-500 animate-pulse ring-2 ring-emerald-300'
                    : 'bg-rose-500 animate-pulse ring-2 ring-rose-300'
                }`}
              ></span>
            </button>
          )}

          {/* Notifications Button (Logged in only) */}
          {user && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`w-8 h-8 sm:w-8.5 sm:h-8.5 xl:w-9 xl:h-9 rounded-full bg-white border flex items-center justify-center shadow-sm relative transition-all cursor-pointer ${
                  pendingUsers.filter((p) => p.status === 'pending').length > 0
                    ? 'border-amber-300 text-amber-600 hover:bg-amber-50 ring-2 ring-amber-400/20'
                    : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title={
                  pendingUsers.filter((p) => p.status === 'pending').length > 0
                    ? `${pendingUsers.filter((p) => p.status === 'pending').length} user approval requests pending`
                    : 'Notifications'
                }
              >
                <Bell className="w-4 h-4" />
                {pendingUsers.filter((p) => p.status === 'pending').length > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center animate-pulse shadow-sm">
                    {pendingUsers.filter((p) => p.status === 'pending').length}
                  </span>
                ) : unreadCount > 0 ? (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white"></span>
                ) : null}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">Notifications & Approvals</span>
                      {pendingUsers.filter((p) => p.status === 'pending').length > 0 && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {pendingUsers.filter((p) => p.status === 'pending').length} pending
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2.5">
                    {pendingUsers.filter((p) => p.status === 'pending').length === 0 ? (
                      <div className="text-xs text-slate-400 text-center py-6">
                        No pending approvals or alerts.
                      </div>
                    ) : (
                      pendingUsers
                        .filter((p) => p.status === 'pending')
                        .map((item) => {
                          const isPending = true;

                          return (
                            <div
                              key={item.id}
                              className="p-3 rounded-2xl border transition-all text-xs bg-amber-50/70 border-amber-200 shadow-xs"
                            >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs bg-amber-500 text-white">
                                  {item.name ? item.name[0].toUpperCase() : 'U'}
                                </div>
                                <div>
                                  <p className="font-extrabold text-slate-900 leading-tight">{item.name}</p>
                                  <p className="text-[11px] text-slate-500">{item.email}</p>
                                </div>
                              </div>

                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-200 text-amber-900">
                                {item.role}
                              </span>
                            </div>

                            <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between">
                              <span>Role: <strong className="text-slate-800">{item.role}</strong></span>
                              <span className="text-slate-400">
                                {new Date(item.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Action Buttons for Pending Request */}
                            <div className="mt-2.5 pt-2 border-t border-amber-200/60 space-y-2">
                              {user?.level === 'Admin' ? (
                                <>
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="font-bold text-slate-600">Assign Level:</span>
                                    <select
                                      value={pendingLevels[item.id] || 'Guest'}
                                      onChange={(e) =>
                                        setPendingLevels({
                                          ...pendingLevels,
                                          [item.id]: e.target.value as 'Admin' | 'Guest'
                                        })
                                      }
                                      className="px-2 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-800 outline-none"
                                    >
                                      <option value="Guest">Guest Level</option>
                                      <option value="Admin">Admin Level</option>
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      disabled={isApprovingId === item.id}
                                      onClick={() => handleApproveUser(item.id)}
                                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>
                                        {isApprovingId === item.id
                                          ? 'Approving...'
                                          : `Approve as ${pendingLevels[item.id] || 'Guest'}`}
                                      </span>
                                    </button>
                                    <button
                                      disabled={isApprovingId === item.id}
                                      onClick={() => handleRejectUser(item.id)}
                                      className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors cursor-pointer"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-amber-700 italic py-1">
                                  Approval requires an Admin level account.
                                </div>
                              )}
                            </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Team Users Button (Beside Profile on Left) */}
          {user && (
            <button
              onClick={() => {
                if (user.level === 'Admin') {
                  setShowUsersModal(true);
                } else {
                  alert('Access Restricted: Only Admin level accounts can access and manage team users.');
                }
              }}
              title={user.level === 'Admin' ? 'Team Users & Access Levels' : 'Team Users (Admin Only)'}
              className={`w-8 h-8 sm:w-8.5 sm:h-8.5 xl:w-9 xl:h-9 rounded-full flex items-center justify-center border shadow-sm transition-all cursor-pointer shrink-0 ${
                user.level === 'Admin'
                  ? 'bg-white border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Users className="w-4 h-4" />
            </button>
          )}

          {/* User Profile Pill / Dropdown (Empty Avatar Placeholder with Initials until Staff Adds Their Own) */}
          <div className="relative shrink-0">
            {user ? (
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:pr-2.5 xl:pr-3 rounded-full bg-white border border-slate-200/90 shadow-sm hover:bg-slate-50 transition-all shrink-0 max-w-[170px] sm:max-w-[220px]"
              >
                {/* Empty image avatar until staff adds by themselves */}
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-blue-500/20 shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-extrabold text-[11px] flex items-center justify-center uppercase shadow-xs shrink-0">
                    {getInitials(user.name)}
                  </div>
                )}
                <div className="hidden sm:block text-left min-w-0">
                  <p className="text-xs font-bold text-slate-900 leading-tight truncate">{user.name}</p>
                  <p className="text-[10px] text-slate-500 font-medium truncate hidden xl:block">{user.role}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden xl:block shrink-0" />
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all shrink-0 whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Register / Sign In</span>
              </button>
            )}

            {/* User Dropdown */}
            {showUserDropdown && user && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-2 border-b border-slate-100 mb-2">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center uppercase">
                        {getInitials(user.name)}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-slate-900">{user.name}</p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{user.email}</p>
                    </div>
                  </div>

                  {/* Edit Profile Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditProfileModal(true);
                      setShowUserDropdown(false);
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-blue-700 text-[11px] font-bold border border-slate-200/80 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                </div>

                {allUsers.length > 1 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                      Switch Profile
                    </p>
                    <div className="space-y-1">
                      {allUsers
                        .filter((u) => u.id !== user.id)
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              switchUser(u);
                              setShowUserDropdown(false);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left text-xs text-slate-600 hover:bg-slate-50"
                          >
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.name} className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[9px] flex items-center justify-center">
                                {getInitials(u.name)}
                              </div>
                            )}
                            <span className="flex-1 truncate">{u.name}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      onOpenLogin();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Register another account</span>
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs text-rose-600 hover:bg-rose-50 font-medium mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 transition-opacity animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col justify-between transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-label="Mobile Navigation Sidebar"
      >
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Sidebar Top Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="IRnow Workspace" className="w-7 h-7 object-contain rounded-lg" />
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 leading-tight">IRnow Workspace</h2>
                <p className="text-[10px] text-slate-400 font-medium">Workstation Portal</p>
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User profile card inside sidebar */}
          {user && (
            <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/20" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center uppercase shadow-xs">
                    {getInitials(user.name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate leading-tight">{user.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.role}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <div className="p-3 space-y-1">
            <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Navigation
            </p>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#111827] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </div>
                </button>
              );
            })}

            {/* Host Server Gateway Link */}
            {user && (
              <div className="pt-3 mt-2 border-t border-slate-100">
                <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Workstation Gateway
                </p>
                <button
                  onClick={() => {
                    onOpenTunnel();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all border border-blue-200/60 mt-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Server className="w-4 h-4 text-blue-600" />
                    <div className="text-left">
                      <p className="text-xs font-extrabold text-blue-900 leading-tight">Host Gateway</p>
                      <p className="font-mono text-[10px] text-blue-600">{hostIp}</p>
                    </div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      tunnelActive
                        ? 'bg-emerald-500 ring-2 ring-emerald-300 animate-pulse'
                        : 'bg-rose-500 ring-2 ring-rose-300 animate-pulse'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/60 space-y-2 shrink-0">
          {user ? (
            <button
              onClick={() => {
                logout();
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onOpenLogin();
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Register / Sign In</span>
            </button>
          )}
          <p className="text-[10px] text-slate-400 text-center font-mono">
            LAN: {hostIp}:3000
          </p>
        </div>
      </aside>

      {/* Users Management Modal (Admin Only) */}
      {showUsersModal && user?.level === 'Admin' && (() => {
        const filteredUsers = allUsers.filter((u) => {
          if (!userSearchQuery.trim()) return true;
          const q = userSearchQuery.toLowerCase();
          return (
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.role && u.role.toLowerCase().includes(q)) ||
            (u.level && u.level.toLowerCase().includes(q)) ||
            (u.department && u.department.toLowerCase().includes(q))
          );
        });
        const USERS_PER_PAGE = 5;
        const totalUserPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE) || 1;
        const currentPage = Math.min(userPage, totalUserPages);
        const pagedUsers = filteredUsers.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Registered Team Users</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-extrabold">
                        {allUsers.length}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Manage team accounts, view member roles, and adjust Admin or Guest permissions.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUsersModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="pt-3 pb-1 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search registered team members by name, email, or role..."
                    value={userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value);
                      setUserPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 rounded-2xl border border-slate-200 text-xs bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserSearchQuery('');
                        setUserPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Users List (max 5 items shown per page) */}
              <div className="overflow-y-auto py-2.5 space-y-2.5 flex-1 pr-1 min-h-[220px]">
                {pagedUsers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No registered users match &quot;{userSearchQuery}&quot;
                  </div>
                ) : (
                  pagedUsers.map((u) => {
                    const isCurrent = u.id === user.id;
                    const isAdmin = u.level === 'Admin';
                    const adminCount = allUsers.filter((x) => x.level === 'Admin').length;
                    const cannotDelete = isCurrent && adminCount <= 1;

                    return (
                      <div
                        key={u.id}
                        className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center uppercase shadow-xs">
                              {getInitials(u.name)}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900">{u.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-700">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{u.email} • {u.role}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                          {/* Registered Role Badge */}
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-200/70 text-slate-700">
                            {u.role || 'General'}
                          </span>

                          {/* Level Dropdown */}
                          <select
                            value={u.level || 'Guest'}
                            onChange={async (e) => {
                              const newLevel = e.target.value as 'Admin' | 'Guest';
                              const res = await updateUserLevel(u.id, newLevel);
                              if (!res.success) alert(res.error || 'Failed to update level');
                            }}
                            className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border cursor-pointer outline-none transition-all ${
                              isAdmin
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/20'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="Admin">Admin</option>
                            <option value="Guest">Guest</option>
                          </select>

                          {/* Delete User Button */}
                          <button
                            onClick={async () => {
                              if (cannotDelete) {
                                alert('Cannot remove the only Admin account on the workstation.');
                                return;
                              }
                              if (!confirm(`Are you sure you want to permanently delete user "${u.name}"?`)) return;
                              setIsDeletingUser(u.id);
                              const res = await deleteUser(u.id);
                              setIsDeletingUser(null);
                              if (!res.success) {
                                alert(res.error || 'Failed to remove user');
                              }
                            }}
                            disabled={isDeletingUser === u.id || cannotDelete}
                            title={cannotDelete ? 'Cannot delete the only Admin' : 'Remove User'}
                            className="w-8 h-8 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Range Button Pagination Controls */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400 font-medium">
                  Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * USERS_PER_PAGE + 1} - {Math.min(filteredUsers.length, currentPage * USERS_PER_PAGE)} of {filteredUsers.length} users
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    {currentPage} out of {totalUserPages} pages
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalUserPages}
                    onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>Only Admin level users can manage team accounts and permissions.</span>
                </span>
                <button
                  onClick={() => setShowUsersModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
      />
    </>
  );
}
