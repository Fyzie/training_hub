import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, ensureStorageHub } from './storage';
import { dataStore } from './data-store';

/**
 * Reads environment variables from sibling `../env_hub/.env` (or candidates)
 */
export function getEnvHubConfig(): Record<string, string> {
  const envMap: Record<string, string> = {};

  const candidates = [
    process.env.ENV_HUB_PATH,
    path.resolve(process.cwd(), '..', 'env_hub', '.env'),
    path.resolve(process.cwd(), '..', 'env-hub', '.env'),
    path.resolve(process.cwd(), 'env_hub', '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env')
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (key && !(key in envMap)) {
              envMap[key] = val;
            }
          }
        }
      } catch (err) {
        console.error(`[EnvHub] Error reading ${candidate}:`, err);
      }
    }
  }

  return envMap;
}

/**
 * Send email via Resend API using standard HTTP fetch
 */
export async function sendEmail({
  to,
  subject,
  html,
  text
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const env = getEnvHubConfig();
  const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.warn('[Email] RESEND_API_KEY is not configured in env_hub/.env. Email not sent.');
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured in env_hub/.env. Please configure your Resend API key.'
    };
  }

  let from = env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!from || from.includes('onboarding@resend.dev')) {
    if (env.APP_URL) {
      try {
        const host = new URL(env.APP_URL.startsWith('http') ? env.APP_URL : `https://${env.APP_URL}`).hostname;
        from = `Company Workspace <no-reply@${host}>`;
      } catch {
        from = 'Company Workspace <no-reply@hub.hafizimalik.com>';
      }
    } else {
      from = 'Company Workspace <no-reply@hub.hafizimalik.com>';
    }
  } else if (!from.includes('<') && from.includes('@')) {
    from = `Company Workspace <${from.trim()}>`;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: text || ''
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[Email] Resend API error response:', data);
      return { success: false, error: data.message || 'Failed to send email via Resend' };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[Email] Exception while sending email:', err);
    return { success: false, error: err.message || 'Network error while contacting Resend' };
  }
}

// -------------------------------------------------------------
// Password Reset Token Management
// -------------------------------------------------------------

interface PasswordResetRecord {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

function getResetFilePath(): string {
  ensureStorageHub();
  return path.join(DATA_DIR, 'password_resets.json');
}

function readResetTokens(): PasswordResetRecord[] {
  const filePath = getResetFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveResetTokens(tokens: PasswordResetRecord[]): void {
  const filePath = getResetFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (err) {
    console.error('[PasswordReset] Failed to save tokens:', err);
  }
}

export function createPasswordResetToken(email: string): string {
  const tokens = readResetTokens().filter((t) => !t.used && new Date(t.expiresAt) > new Date());
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour validity

  tokens.push({
    token,
    email: email.toLowerCase().trim(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false
  });

  saveResetTokens(tokens);
  return token;
}

export function verifyPasswordResetToken(token: string): { valid: boolean; email?: string; error?: string } {
  if (!token) return { valid: false, error: 'Reset token is required' };
  const tokens = readResetTokens();
  const found = tokens.find((t) => t.token === token);
  if (!found) {
    return { valid: false, error: 'Invalid reset token' };
  }
  if (found.used) {
    return { valid: false, error: 'This reset link has already been used' };
  }
  if (new Date(found.expiresAt) < new Date()) {
    return { valid: false, error: 'This reset link has expired' };
  }
  return { valid: true, email: found.email };
}

export function consumePasswordResetToken(token: string, newPassword: string): { success: boolean; error?: string } {
  const verification = verifyPasswordResetToken(token);
  if (!verification.valid || !verification.email) {
    return { success: false, error: verification.error || 'Invalid reset token' };
  }

  const users = dataStore.getUsers();
  const user = users.find((u) => u.email.toLowerCase() === verification.email!.toLowerCase());
  if (!user) {
    return { success: false, error: 'Associated user account not found' };
  }

  user.password = newPassword;
  dataStore.saveUsers(users);

  // Mark token as used
  const tokens = readResetTokens();
  const found = tokens.find((t) => t.token === token);
  if (found) {
    found.used = true;
    saveResetTokens(tokens);
  }

  return { success: true };
}

