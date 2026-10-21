import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { StaffUser } from '@/lib/types';
import {
  createPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
  sendEmail,
  getEnvHubConfig
} from '@/lib/email';

export function validateStrongPassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must include at least one number (0-9).' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter (a-z).' };
  }
  return { valid: true };
}

export async function GET() {
  const users = dataStore.getUsers();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action || 'login';
    const email = (body.email || '').toLowerCase().trim();
    const name = (body.name || '').trim();
    const password = (body.password || '').trim();
    const role = (body.role || 'Others').trim();
    const department = (body.department || '').trim();

    const users = dataStore.getUsers();

    // 1. FORGOT PASSWORD ACTION
    if (action === 'forgot-password') {
      if (!email) {
        return NextResponse.json({ error: 'Please enter your registered email address.' }, { status: 400 });
      }
      const user = users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        return NextResponse.json({
          error: 'No registered staff account found with this email address.'
        }, { status: 404 });
      }

      const token = createPasswordResetToken(email);
      const env = getEnvHubConfig();
      let baseUrl = env.APP_URL ? env.APP_URL.replace(/\/$/, '') : '';
      if (!baseUrl) {
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
        const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
        baseUrl = `${proto}://${host}`;
      }
      const resetUrl = `${baseUrl}/?action=reset-password&token=${token}`;

      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Reset Your IRnow Workspace Password',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #2563eb;"></span>
              <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">IRnow Workspace Workstation</span>
            </div>
            <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Reset Request</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">We received a request to change your password for your IRnow Workspace account. Click the button below to verify your email and set a new password:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">Verify & Reset Password</a>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">This verification link will expire in 1 hour. If you did not request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 11px;">Or copy and paste this link in your browser:<br/><a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a></p>
          </div>
        `,
        text: `Reset your IRnow Workspace password by visiting: ${resetUrl}`
      });

      if (!emailResult.success) {
        return NextResponse.json({
          error: emailResult.error || 'Failed to send reset email. Please ensure RESEND_API_KEY is configured in env_hub/.env.'
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Verification email sent! Please check your inbox and click the verify link to change your password.'
      });
    }

    // 2. VERIFY RESET TOKEN
    if (action === 'verify-reset-token') {
      const token = (body.token || '').trim();
      const verification = verifyPasswordResetToken(token);
      if (!verification.valid) {
        return NextResponse.json({ valid: false, error: verification.error }, { status: 400 });
      }
      return NextResponse.json({ valid: true, email: verification.email });
    }

    // 3. COMPLETE RESET PASSWORD
    if (action === 'reset-password') {
      const token = (body.token || '').trim();
      const newPassword = (body.password || '').trim();
      if (!token) {
        return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
      }
      const pwCheck = validateStrongPassword(newPassword);
      if (!pwCheck.valid) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 });
      }
      const result = consumePasswordResetToken(token, newPassword);
      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to reset password' }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: 'Password has been successfully changed! You can now sign in with your new password.'
      });
    }

    // 4. REGISTER ACTION
    if (action === 'register') {
      if (!name || !email) {
        return NextResponse.json({ error: 'Name and email are required for registration' }, { status: 400 });
      }

      const pwCheck = validateStrongPassword(password);
      if (!pwCheck.valid) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 });
      }

      // If this is the first user ever, approve immediately as Admin level
      if (users.length === 0) {
        const newUser: StaffUser = {
          id: `usr-${Date.now().toString(36)}`,
          name,
          email,
          password,
          role: role as any,
          level: 'Admin',
          avatar: '',
          department: department || undefined,
          joinedAt: new Date().toISOString().split('T')[0]
        };

        dataStore.addUser(newUser);

        const response = NextResponse.json({
          success: true,
          pending: false,
          user: newUser,
          token: `session_${newUser.id}_${Date.now()}`
        });

        response.cookies.set('company_session', `session_${newUser.id}_${Date.now()}`, {
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax'
        });

        return response;
      }

      // Existing team members present: check if already in approved users
      const existing = users.find((u) => u.email.toLowerCase() === email);
      if (existing) {
        return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 400 });
      }

      // Check if already in pending requests
      const pendingUsers = dataStore.getPendingUsers();
      const existingPending = pendingUsers.find((p) => p.email.toLowerCase() === email && p.status === 'pending');
      if (existingPending) {
        return NextResponse.json({
          success: true,
          pending: true,
          message: 'Your registration request is already submitted and waiting for approval from an existing team member.'
        });
      }

      // Create new pending user profile
      dataStore.addPendingUser({
        id: `usr-${Date.now().toString(36)}`,
        name,
        email,
        password,
        role: role as any,
        level: 'Guest',
        department: department || undefined,
        requestedAt: new Date().toISOString(),
        status: 'pending'
      });

      return NextResponse.json({
        success: true,
        pending: true,
        message: 'Registration request submitted! An existing team member must approve your account before you can log in.'
      });
    }

    // 5. LOGIN ACTION
    const user = users.find((u) => u.email.toLowerCase() === email || u.name.toLowerCase() === email);
    if (!user) {
      const pendingUser = dataStore.getPendingUsers().find((p) => p.email.toLowerCase() === email || p.name.toLowerCase() === email);
      if (pendingUser) {
        if (pendingUser.status === 'pending') {
          return NextResponse.json({
            error: 'Your account is waiting for approval from an existing team member. Please notify your colleagues.'
          }, { status: 403 });
        } else if (pendingUser.status === 'rejected') {
          return NextResponse.json({
            error: 'Your registration request was declined. Please consult your team administrator.'
          }, { status: 403 });
        }
      }
      return NextResponse.json({ error: 'Staff account not found with this email. Please register first.' }, { status: 404 });
    }

    if (user.password && user.password !== password) {
      return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user,
      token: `session_${user.id}_${Date.now()}`
    });

    response.cookies.set('company_session', `session_${user.id}_${Date.now()}`, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax'
    });

    return response;
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, avatar, name, email, role, password, department, level, adminId } = body;

    const users = dataStore.getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Permission change (Admin only)
    if (level !== undefined) {
      const requester = users.find((u) => u.id === adminId);
      if (!requester || requester.level !== 'Admin') {
        return NextResponse.json({ error: 'Only Admin level users can change user permissions.' }, { status: 403 });
      }
      user.level = level === 'Admin' ? 'Admin' : 'Guest';
    }

    if (avatar !== undefined) user.avatar = avatar;
    if (name !== undefined && name.trim()) user.name = name.trim();
    if (email !== undefined && email.trim()) user.email = email.toLowerCase().trim();
    if (role !== undefined && role.trim()) user.role = role.trim();
    if (department !== undefined) user.department = department.trim() || undefined;

    if (password !== undefined && password.trim()) {
      const pwCheck = validateStrongPassword(password.trim());
      if (!pwCheck.valid) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 });
      }
      user.password = password.trim();
    }

    dataStore.saveUsers(users);
    return NextResponse.json({ success: true, user, allUsers: dataStore.getUsers() });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const adminId = url.searchParams.get('adminId');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const users = dataStore.getUsers();
    const requester = users.find((u) => u.id === adminId);
    if (!requester || requester.level !== 'Admin') {
      return NextResponse.json({ error: 'Only Admin level users can remove users.' }, { status: 403 });
    }

    const targetUser = users.find((u) => u.id === id);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Protect against deleting the only Admin account
    const adminCount = users.filter((u) => u.level === 'Admin').length;
    if (targetUser.level === 'Admin' && adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the only Admin account in the workstation.' },
        { status: 400 }
      );
    }

    dataStore.deleteUser(id);
    return NextResponse.json({
      success: true,
      message: `User ${targetUser.name} removed successfully.`,
      allUsers: dataStore.getUsers()
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
