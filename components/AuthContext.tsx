'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { StaffUser } from '@/lib/types';

interface AuthResponse {
  success: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
}

interface AuthContextType {
  user: StaffUser | null;
  allUsers: StaffUser[];
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string, role: string, department: string) => Promise<AuthResponse>;
  updateAvatar: (avatarUrl: string) => Promise<boolean>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateUserLevel: (id: string, level: 'Admin' | 'Guest') => Promise<{ success: boolean; error?: string }>;
  switchUser: (user: StaffUser) => void;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  allUsers: [],
  isLoading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  updateAvatar: async () => false,
  deleteUser: async () => ({ success: false }),
  updateUserLevel: async () => ({ success: false }),
  switchUser: () => {},
  logout: () => {},
  refreshUsers: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [allUsers, setAllUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUsers = async () => {
    try {
      const res = await fetch('/api/auth');
      if (res.ok) {
        const users: StaffUser[] = await res.json();
        setAllUsers(users);

        const savedUserId = localStorage.getItem('company_user_id');
        if (savedUserId) {
          const matched = users.find((u) => u.id === savedUserId);
          if (matched) {
            setUser(matched);
            return;
          }
        }

        // New device or unauthenticated visitor: keep unauthenticated so user must log in
        setUser(null);
        localStorage.removeItem('company_user_id');
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => {
    async function init() {
      await refreshUsers();
      setIsLoading(false);
    }
    init();
  }, []);

  const login = async (email: string, password?: string): Promise<AuthResponse> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('company_user_id', data.user.id);
        await refreshUsers();
        return { success: true };
      }
      return { success: false, error: data.error || data.detail || 'Login failed' };
    } catch {
      return { success: false, error: 'Network error communicating with server' };
    }
  };

  const register = async (name: string, email: string, password: string, role: string, department: string): Promise<AuthResponse> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role,
          department: department.trim() || 'AI Engineering Lab'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.pending) {
          return {
            success: true,
            pending: true,
            message: data.message || 'Registration request submitted! Please wait for an existing team member to approve your account.'
          };
        }
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('company_user_id', data.user.id);
          await refreshUsers();
          return { success: true };
        }
      }
      return { success: false, error: data.error || data.detail || 'Registration failed' };
    } catch {
      return { success: false, error: 'Network error communicating with server' };
    }
  };

  const updateAvatar = async (avatarUrl: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, avatar: avatarUrl })
      });
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, avatar: avatarUrl } : null));
        await refreshUsers();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch(`/api/auth?id=${encodeURIComponent(id)}&adminId=${encodeURIComponent(user.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.allUsers) setAllUsers(data.allUsers);
        else await refreshUsers();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to remove user' };
    } catch {
      return { success: false, error: 'Network error communicating with server' };
    }
  };

  const updateUserLevel = async (id: string, level: 'Admin' | 'Guest'): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, level, adminId: user.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.allUsers) setAllUsers(data.allUsers);
        else await refreshUsers();
        if (user.id === id) {
          setUser((prev) => (prev ? { ...prev, level } : null));
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update user level' };
    } catch {
      return { success: false, error: 'Network error communicating with server' };
    }
  };

  const switchUser = (selectedUser: StaffUser) => {
    setUser(selectedUser);
    localStorage.setItem('company_user_id', selectedUser.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('company_user_id');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        allUsers,
        isLoading,
        login,
        register,
        updateAvatar,
        deleteUser,
        updateUserLevel,
        switchUser,
        logout,
        refreshUsers
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
