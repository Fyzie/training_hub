import { NextResponse } from 'next/server';
import { getSystemMetrics } from '@/lib/hardware-telemetry';
import { jobRunner } from '@/lib/job-runner';

export async function GET() {
  try {
    // Advance job queue simulation on telemetry ping
    jobRunner.tick();
    const metrics = getSystemMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('System metrics API error:', error);
    return NextResponse.json({ error: 'Failed to read system metrics' }, { status: 500 });
  }
}

