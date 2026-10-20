'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  X,
  User,
  Mail,
  Briefcase,
  Lock,
  Camera,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  Shield
} from 'lucide-react';
import { isStrongPassword } from './LoginModal';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getInitials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');

  const standardRoles = ['ML Engineer', 'System Engineer', 'Labeller'];
  const initialIsStandard = user?.role ? standardRoles.includes(user.role) : false;
  const [roleSelect, setRoleSelect] = useState(initialIsStandard ? user?.role || 'ML Engineer' : 'Others');
  const [customRole, setCustomRole] = useState(!initialIsStandard ? user?.role || '' : '');

  // Password change section
  const [wantsPasswordChange, setWantsPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Sync state whenever modal opens
  React.useEffect(() => {
    if (user && isOpen) {
      setName(user.name || '');
      setEmail(user.email || '');
      setAvatar(user.avatar || '');
      const isStd = user.role ? standardRoles.includes(user.role) : false;
      setRoleSelect(isStd ? user.role : 'Others');
      setCustomRole(!isStd ? user.role || '' : '');
      setWantsPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image size must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatar(result);
      setErrorMessage('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatar('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Office email is required.');
      return;
    }

    const finalRole = roleSelect === 'Others' ? (customRole.trim() || 'Others') : roleSelect;

    if (wantsPasswordChange) {
      if (!isStrongPassword(newPassword)) {
        setErrorMessage('New password does not meet all strong password conditions.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify.');
        return;
      }
    }

    setIsSaving(true);
    const updates: {
      name: string;
      email: string;
      role: string;
      avatar: string;
      password?: string;
    } = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: finalRole,
      avatar
    };

    if (wantsPasswordChange && newPassword.trim()) {
      updates.password = newPassword.trim();
    }

    const result = await updateProfile(updates);
    setIsSaving(false);

    if (result.success) {
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setErrorMessage(result.error || 'Failed to update profile.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Account Management
          </span>
        </div>
        <h3 className="font-extrabold text-lg text-slate-900">Edit Profile</h3>
        <p className="text-xs text-slate-500 mb-4">
          Update your profile photo, details, role, or change your account password.
        </p>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Photo Upload / Remove */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-4">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-black text-xl flex items-center justify-center uppercase shadow-sm">
                  {getInitials(name)}
                </div>
              )}
            </div>

            <div className="space-y-1.5 flex-1">
              <p className="text-xs font-bold text-slate-800">Profile Picture</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-blue-600 border border-slate-200 text-xs font-bold cursor-pointer transition-colors">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                {avatar && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold border border-rose-200 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400">JPG, PNG, or WebP. Max 5MB.</p>
            </div>
          </div>

          {/* Full Name & Office Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs border border-slate-200 font-semibold focus:ring-2 focus:ring-blue-500/20"
                />
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Office Email *</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs border border-slate-200 font-semibold focus:ring-2 focus:ring-blue-500/20"
                />
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Role and Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Role *</label>
              <select
                value={roleSelect}
                onChange={(e) => setRoleSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 bg-white font-semibold"
              >
                <option value="ML Engineer">ML Engineer</option>
                <option value="System Engineer">System Engineer</option>
                <option value="Labeller">Labeller</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Permission Level</span>
                <span className="text-[10px] text-slate-400 font-normal">Read-only</span>
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span>{user.level || 'Guest'}</span>
              </div>
            </div>
          </div>

          {roleSelect === 'Others' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Specify Role Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Data Scientist, Manager"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-xs border border-blue-200 bg-blue-50/30 font-semibold focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {/* Change Password Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wantsPasswordChange}
                  onChange={(e) => setWantsPasswordChange(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span>Change Account Password</span>
              </label>
            </div>

            {wantsPasswordChange && (
              <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter strong password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 rounded-xl text-xs border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

