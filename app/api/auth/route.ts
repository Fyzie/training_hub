import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { StaffUser } from '@/lib/types';

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
    const role = body.role || 'General';
    const department = body.department || 'AI Engineering Lab';

    const users = dataStore.getUsers();

    if (action === 'register') {
      if (!name || !email) {
        return NextResponse.json({ error: 'Name and email are required for registration' }, { status: 400 });
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
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
          department,
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
      const newPending = dataStore.addPendingUser({
        id: `usr-${Date.now().toString(36)}`,
        name,
        email,
        password,
        role: role as any,
        level: 'Guest',
        department,
        requestedAt: new Date().toISOString(),
        status: 'pending'
      });

      return NextResponse.json({
        success: true,
        pending: true,
        message: 'Registration request submitted! An existing team member must approve your account before you can log in.'
      });
    } else {
      const user = users.find((u) => u.email.toLowerCase() === email || u.name.toLowerCase() === email);
      if (!user) {
        // Check if user is in pending requests
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
    }
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, avatar, name, department, level, adminId } = body;

    const users = dataStore.getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (level !== undefined) {
      const requester = users.find((u) => u.id === adminId);
      if (!requester || requester.level !== 'Admin') {
        return NextResponse.json({ error: 'Only Admin level users can change user permissions.' }, { status: 403 });
      }
      user.level = level === 'Admin' ? 'Admin' : 'Guest';
    }

    if (avatar !== undefined) user.avatar = avatar;
    if (name !== undefined) user.name = name;
    if (department !== undefined) user.department = department;

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

