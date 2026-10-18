import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';

export async function GET() {
  const pending = dataStore.getPendingUsers();
  return NextResponse.json(pending);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pendingId, action, approvedBy, approvedById, level } = body;

    if (!pendingId) {
      return NextResponse.json({ error: 'pendingId is required' }, { status: 400 });
    }

    const approver = dataStore.getUsers().find((u) => (approvedById && u.id === approvedById) || u.name === approvedBy);
    if (!approver || approver.level !== 'Admin') {
      return NextResponse.json({ error: 'Only Admin level users can approve or reject new user registrations.' }, { status: 403 });
    }

    if (action === 'approve') {
      const selectedLevel: 'Admin' | 'Guest' = level === 'Admin' ? 'Admin' : 'Guest';
      const result = dataStore.approvePendingUser(pendingId, approvedBy || 'Admin', selectedLevel);
      if (!result) {
        return NextResponse.json({ error: 'Pending user request not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        message: `New user ${result.pendingUser.name} already approved as ${selectedLevel}`,
        pendingUser: result.pendingUser,
        staffUser: result.staffUser,
        allPending: dataStore.getPendingUsers(),
        allUsers: dataStore.getUsers()
      });
    } else if (action === 'reject') {
      const result = dataStore.rejectPendingUser(pendingId, approvedBy || 'Team Member');
      if (!result) {
        return NextResponse.json({ error: 'Pending user request not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        message: `User request for ${result.name} rejected`,
        pendingUser: result,
        allPending: dataStore.getPendingUsers(),
        allUsers: dataStore.getUsers()
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err) {
    console.error('Pending user approval failed:', err);
    return NextResponse.json({ error: 'Failed to process approval request' }, { status: 500 });
  }
}

