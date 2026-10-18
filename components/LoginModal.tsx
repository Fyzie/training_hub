'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { StaffUser } from '@/lib/types';
import {
  UserCheck,
  ShieldCheck,
  Laptop,
  CheckCircle2,
  X,
  Lock,
  ArrowRight,
  Sparkles,
  UserPlus,
  LogIn,
  AlertCircle,
  Eye,
  EyeOff,
  Key
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { user, allUsers, switchUser, login, register } = useAuth();
  
  // Tab: 'register' vs 'login'
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  
  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState('General');
  const [regDepartment, setRegDepartment] = useState('AI Lab');
  
  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');

  // Default to register if no users exist yet
  useEffect(() => {
    if (allUsers.length === 0) {
      setAuthMode('register');
    } else {
      setAuthMode('login');
    }
  }, [allUsers.length, isOpen]);

  if (!isOpen) return null;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setPendingMessage('');
    
    if (!regName.trim() || !regEmail.trim()) {
      setErrorMessage('Please provide both your name and email.');
      return;
    }

    if (!regPassword) {
      setErrorMessage('Please enter a password.');
      return;
    }

    if (regPassword.length < 4) {
      setErrorMessage('Password should be at least 4 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    const result = await register(regName, regEmail, regPassword, regRole, regDepartment);
    setIsSubmitting(false);

    if (result.success) {
      if (result.pending) {
        setPendingMessage(result.message || 'Registration request submitted! Please wait for an existing team member to approve your account.');
        setAuthMode('login');
      } else {
        onClose();
      }
    } else {
      setErrorMessage(result.error || 'Registration failed. Please check your inputs.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    if (!loginEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    if (!loginPassword) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (result.success) {
      onClose();
    } else {
      setErrorMessage(result.error || 'Incorrect email or password. Please check your credentials.');
    }
  };

  const handleSelectStaff = (selectedUser: StaffUser) => {
    setLoginEmail(selectedUser.email);
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Staff Authentication
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {allUsers.length === 0 ? 'Welcome to IRnow Hub' : 'Sign in to IRnow Hub'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              {allUsers.length === 0
                ? 'Register the first account to set up your workspace'
                : 'Sign in to access model training, hardware & documents'}
            </p>
          </div>
          {allUsers.length > 0 && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Switcher if users exist */}
        {allUsers.length > 0 && (
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl my-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMessage('');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setErrorMessage('');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register New</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="my-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Pending Approval Notice */}
        {pendingMessage && (
          <div className="my-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800">Waiting for Team Approval</p>
              <p className="mt-0.5 text-slate-700 leading-relaxed">{pendingMessage}</p>
            </div>
          </div>
        )}

        {/* First time setup banner if no users */}
        {allUsers.length === 0 && (
          <div className="my-4 p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Initial Workspace Setup</span>
            </div>
            <p className="text-[11px] text-blue-800">
              Create your administrator or staff account with email & password. Your login will be securely remembered on this device.
            </p>
          </div>
        )}

        {/* MODE 1: REGISTER */}
        {authMode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Your Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Office Email</label>
              <input
                type="email"
                required
                placeholder="e.g. john.doe@company.internal"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Create password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
                >
                  <option value="General">General</option>
                  <option value="ML Engineer">ML Engineer</option>
                  <option value="System Engineer">System Engineer</option>
                  <option value="Labeller">Labeller</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="AI Lab"
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                />
              </div>
            </div>

            {/* Remember on this device checkbox */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="rememberRegister"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <label htmlFor="rememberRegister" className="text-xs font-medium text-slate-600 select-none cursor-pointer">
                Remember login on this computer / laptop
              </label>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Registering Account...' : 'Complete Registration & Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* MODE 2: SIGN IN (when users exist) */}
        {authMode === 'login' && (
          <div className="space-y-4">
            {allUsers.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Select Your Account
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {allUsers.map((u) => {
                    const isSelected = loginEmail.toLowerCase() === u.email.toLowerCase();
                    const initials = u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSelectStaff(u)}
                        className={`w-full flex items-center justify-between p-2 rounded-2xl border transition-all text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10'
                            : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center">
                              {initials}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-slate-900 leading-tight">{u.name}</p>
                            <p className="text-[10px] text-slate-400">{u.email}</p>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="your.email@company.internal"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Verifying Password...' : 'Sign In'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="mt-4 text-[10px] text-center text-slate-400 leading-tight">
          🔒 Passwords and sessions are preserved on company PC.
        </p>
      </div>
    </div>
  );
}
