'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { StaffUser } from '@/lib/types';
import {
  UserCheck,
  ShieldCheck,
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
  KeyRound,
  Mail,
  Check,
  ArrowLeft
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function PasswordRequirements({ password }: { password: string }) {
  const criteria = [
    { label: 'At least 6 characters', met: password.length >= 6 },
    { label: 'At least one number (0-9)', met: /\d/.test(password) },
    { label: 'At least one uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter (a-z)', met: /[a-z]/.test(password) },
  ];

  return (
    <div className="mt-2 p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1.5">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        Password Requirements:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {criteria.map((c, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
              c.met ? 'text-emerald-600' : 'text-rose-500'
            }`}
          >
            {c.met ? (
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 stroke-[3]" />
            ) : (
              <X className="w-3.5 h-3.5 shrink-0 text-rose-500 stroke-[2.5]" />
            )}
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function isStrongPassword(pw: string): boolean {
  return pw.length >= 6 && /\d/.test(pw) && /[A-Z]/.test(pw) && /[a-z]/.test(pw);
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { allUsers, login, register } = useAuth();

  // Mode: 'register' | 'login' | 'forgot-password' | 'reset-password'
  const [authMode, setAuthMode] = useState<'register' | 'login' | 'forgot-password' | 'reset-password'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token') || params.get('resetToken');
      if (token) return 'reset-password';
    }
    return allUsers.length === 0 ? 'register' : 'login';
  });

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState('ML Engineer');
  const [customRole, setCustomRole] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password & reset password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');

  const prevIsOpenRef = useRef(false);

  // Initialize mode only when the modal opens (transitions from closed to open)
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current) {
      prevIsOpenRef.current = true;

      // 1. Check URL for password reset token
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const token = params.get('token') || params.get('resetToken');
        if (token && (action === 'reset-password' || action === 'reset' || action === 'reset_password' || !action)) {
          setResetToken(token);
          setAuthMode('reset-password');
          return;
        }
      }

      // 2. Default to register if system is brand new (0 users), else default to login
      if (allUsers.length === 0) {
        setAuthMode('register');
      } else {
        setAuthMode('login');
      }
      setErrorMessage('');
      setPendingMessage('');
    }
  }, [isOpen, allUsers.length]);

  if (!isOpen) return null;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setPendingMessage('');

    if (!regName.trim() || !regEmail.trim()) {
      setErrorMessage('Please provide both your name and email.');
      return;
    }

    if (!isStrongPassword(regPassword)) {
      setErrorMessage('Password does not fulfill all strong password conditions.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    const finalRole = regRole === 'Others' ? (customRole.trim() || 'Others') : regRole;

    setIsSubmitting(true);
    const result = await register(regName, regEmail, regPassword, finalRole);
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

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setForgotSuccess('');

    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot-password', email: forgotEmail.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForgotSuccess(data.message || 'Verification email sent! Please check your inbox.');
      } else {
        setErrorMessage(data.error || 'Failed to send password reset email.');
      }
    } catch {
      setErrorMessage('Network error while requesting password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setResetSuccess('');

    if (!isStrongPassword(newPassword)) {
      setErrorMessage('New password does not fulfill all strong password conditions.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          token: resetToken,
          password: newPassword.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetSuccess(data.message || 'Password changed successfully!');
        setTimeout(() => {
          setAuthMode('login');
          setResetSuccess('');
          setErrorMessage('');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('action');
            url.searchParams.delete('token');
            window.history.replaceState({}, '', url.toString());
          }
        }, 2000);
      } else {
        setErrorMessage(data.error || 'Failed to reset password. Link may have expired.');
      }
    } catch {
      setErrorMessage('Network error while resetting password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectStaff = (selectedUser: StaffUser) => {
    setLoginEmail(selectedUser.email);
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100">
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
              {authMode === 'forgot-password'
                ? 'Forgot Password'
                : authMode === 'reset-password'
                ? 'Reset Your Password'
                : allUsers.length === 0
                ? 'Welcome to IRnow Workspace'
                : 'Sign in to IRnow Workspace'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              {authMode === 'forgot-password'
                ? 'Verify via email using Resend to reset your password'
                : authMode === 'reset-password'
                ? 'Set a new strong password for your workstation account'
                : allUsers.length === 0
                ? 'Register the first account to set up your workspace'
                : 'Sign in to access model training, hardware & documents'}
            </p>
          </div>
          {allUsers.length > 0 && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Switcher if users exist and not in forgot/reset flow */}
        {allUsers.length > 0 && authMode !== 'forgot-password' && authMode !== 'reset-password' && (
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl my-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMessage('');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Now</span>
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
              Create your administrator account with email & a strong password.
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

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
              >
                <option value="ML Engineer">ML Engineer</option>
                <option value="System Engineer">System Engineer</option>
                <option value="Labeller">Labeller</option>
                <option value="Others">Others</option>
              </select>
            </div>

            {regRole === 'Others' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Specify Role Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QA Engineer, Research Lead"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-blue-200 text-xs font-semibold bg-blue-50/30 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Create strong password"
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
              <PasswordRequirements password={regPassword} />
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

            {/* Remember on this device checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="rememberRegister"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <label htmlFor="rememberRegister" className="text-xs font-medium text-slate-600 select-none cursor-pointer">
                Remember login on this computer
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Registering Account...' : 'Complete Registration & Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {allUsers.length > 0 && (
              <div className="pt-1 text-center">
                <span className="text-[11px] text-slate-500">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMessage('');
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            )}
          </form>
        )}

        {/* MODE 2: SIGN IN */}
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
                        className={`w-full flex items-center justify-between p-2 rounded-2xl border transition-all text-left cursor-pointer ${
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
                            <p className="text-[10px] text-slate-400">{u.email} • {u.role}</p>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(loginEmail);
                      setAuthMode('forgot-password');
                      setErrorMessage('');
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  >
                    Forgot password? Change password
                  </button>
                </div>
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
                  className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Verifying Password...' : 'Sign In'}</span>
                </button>
              </div>

              <div className="pt-1 text-center">
                <span className="text-[11px] text-slate-500">Need a new staff account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage('');
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  Register Now
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MODE 3: FORGOT PASSWORD (EMAIL VERIFICATION) */}
        {authMode === 'forgot-password' && (
          <div className="space-y-4 pt-2">
            {forgotSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Verification Email Dispatched</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-700">
                  {forgotSuccess}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setForgotSuccess('');
                  }}
                  className="mt-2 w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Enter your registered account email below. We will send you an email containing a secure verification link to set a new password.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Registered Email</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="your.email@company.internal"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMessage('');
                    }}
                    className="flex-1 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-2 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Sending Email...' : 'Send Verification Email'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* MODE 4: RESET PASSWORD (CONFIRM NEW PASSWORD) */}
        {authMode === 'reset-password' && (
          <div className="space-y-4 pt-2">
            {resetSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="font-bold text-emerald-900 text-sm">Password Updated!</p>
                <p className="text-[11px] text-emerald-700">{resetSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Your verification link is valid. Please choose a new strong password for your account.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter new strong password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                  <PasswordRequirements password={newPassword} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmitting ? 'Updating Password...' : 'Save New Password & Sign In'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <p className="mt-4 text-[10px] text-center text-slate-400 leading-tight">
          🔒 Passwords and sessions are preserved on company PC.
        </p>
      </div>
    </div>
  );
}
