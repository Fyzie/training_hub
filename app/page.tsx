'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/components/AuthContext';
import { Navbar } from '@/components/Navbar';
import { DashboardView } from '@/components/DashboardView';
import { TrainingView } from '@/components/TrainingView';
import { InventoryView } from '@/components/InventoryView';
import { BlogView } from '@/components/BlogView';
import { TunnelModal } from '@/components/TunnelModal';
import { LoginModal } from '@/components/LoginModal';

function MainApp() {
  const { user, allUsers, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showTunnelModal, setShowTunnelModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [lanHost, setLanHost] = useState<string>('localhost:3000');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLanHost(window.location.host);
      // Auto-open modal if email password reset link or token was clicked
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      const token = params.get('token') || params.get('resetToken');
      if (token || action === 'reset-password' || action === 'reset' || action === 'reset_password') {
        setShowLoginModal(true);
      }
    }
  }, []);

  useEffect(() => {
    // If no user logged in or fresh setup, prompt registration
    if (!isLoading && !user) {
      setShowLoginModal(true);
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
      }
    }
  }, [isLoading, user, activeTab]);

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-900 flex flex-col w-full overflow-x-clip">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (!user && tab !== 'dashboard') {
            setShowLoginModal(true);
          } else {
            setActiveTab(tab);
          }
        }}
        onOpenTunnel={() => {
          if (user) setShowTunnelModal(true);
        }}
        onOpenLogin={() => setShowLoginModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full px-3 sm:px-6 xl:px-12 py-4 sm:py-6 pb-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigateTab={(tab) => {
              if (!user) {
                setShowLoginModal(true);
              } else {
                setActiveTab(tab);
              }
            }}
            onOpenTunnel={() => {
              if (user) setShowTunnelModal(true);
            }}
            onOpenLogin={() => setShowLoginModal(true)}
          />
        )}

        {user && activeTab === 'training' && <TrainingView />}

        {user && activeTab === 'inventory' && <InventoryView />}

        {user && activeTab === 'blog' && <BlogView />}

        {user && activeTab === 'network' && (
          <TunnelModal
            isOpen={true}
            onClose={() => setActiveTab('dashboard')}
            isTabMode={true}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/60 py-6 mb-0 text-center text-xs text-slate-400 bg-white/40 w-full">
        <div className="w-full px-3 sm:px-6 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 IRnow Workspace • Internal Office Workstation Portal</p>
          {user && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab('network')}
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                LAN: {lanHost}
              </button>
              <span>•</span>
              <button
                onClick={() => setShowTunnelModal(true)}
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Cloudflare Quick Tunnel
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Pop-up Modals */}
      {user && (
        <TunnelModal
          isOpen={showTunnelModal}
          onClose={() => setShowTunnelModal(false)}
        />
      )}

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
