import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { jobRunner } from '@/lib/job-runner';
import { UPLOAD_SUBDIRS } from '@/lib/storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = dataStore.getJobById(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action;

    const job = dataStore.getJobById(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (action === 'stop' || action === 'cancel' || action === 'pause' || action === 'resume') {
      const requestedBy = (body.requestedBy || '').trim().toLowerCase();
      const requestedById = body.requestedById;
      const userRole = body.userRole;

      const isOwner =
        (job.submittedById && requestedById && job.submittedById === requestedById) ||
        (job.submittedBy && requestedBy && job.submittedBy.trim().toLowerCase() === requestedBy) ||
        userRole === 'Admin';

      if (!isOwner) {
        return NextResponse.json(
          { error: `This training job can only be cancelled by ${job.submittedBy || 'the user who submitted it'}.` },
          { status: 403 }
        );
      }

      if (action === 'stop' || action === 'cancel') {
        jobRunner.stopJob(id);
      } else if (action === 'pause') {
        jobRunner.pauseJob(id);
      } else if (action === 'resume') {
        jobRunner.resumeJob(id);
      }
    } else if (body.updates) {
      dataStore.updateJob(id, body.updates);
    }

    const updated = dataStore.getJobById(id);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = dataStore.getJobById(id);
  if (job) {
    const url = new URL(request.url);
    const requestedBy = (url.searchParams.get('requestedBy') || '').trim().toLowerCase();
    const requestedById = url.searchParams.get('requestedById');
    const userRole = url.searchParams.get('userRole');

    const isOwner =
      (job.submittedById && requestedById && job.submittedById === requestedById) ||
      (job.submittedBy && requestedBy && job.submittedBy.trim().toLowerCase() === requestedBy) ||
      userRole === 'Admin';

    if (!isOwner) {
      return NextResponse.json(
        { error: `This training job can only be cancelled/deleted by ${job.submittedBy || 'the user who submitted it'}.` },
        { status: 403 }
      );
    }
  }

  const jobs = dataStore.getJobs().filter((j) => j.id !== id);
  dataStore.saveJobs(jobs);

  // Delete training result folder from storage-hub and public directory
  try {
    const runDir = path.join(UPLOAD_SUBDIRS.runs, id);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
    const publicRunDir = path.join(process.cwd(), 'public', 'uploads', 'runs', id);
    if (fs.existsSync(publicRunDir)) {
      fs.rmSync(publicRunDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`Failed to delete run directory for ${id}:`, e);
  }

  return NextResponse.json({ success: true });
}

