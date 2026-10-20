import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { ensureStorageHub } from '@/lib/storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureStorageHub();
    const { id } = await params;
    const datasets = dataStore.getDatasets();
    const dataset = datasets.find((d) => d.id === id);
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }
    return NextResponse.json(dataset);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch dataset' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureStorageHub();
    const { id } = await params;
    const body = await request.json();
    const datasets = dataStore.getDatasets();
    const index = datasets.findIndex((d) => d.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const current = datasets[index];
    if (body.domain !== undefined) current.domain = body.domain;
    if (body.name !== undefined) current.name = body.name.trim();
    if (body.description !== undefined) current.description = body.description.trim();
    if (body.classes !== undefined) current.classes = body.classes;

    dataStore.saveDatasets(datasets);
    return NextResponse.json({ success: true, dataset: current });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update dataset' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureStorageHub();
    const { id } = await params;
    const datasets = dataStore.getDatasets();
    const filtered = datasets.filter((d) => d.id !== id);
    dataStore.saveDatasets(filtered);
    return NextResponse.json({ success: true, remaining: filtered });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 });
  }
}

