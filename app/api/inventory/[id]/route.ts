import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const items = dataStore.getHardware();
    const filtered = items.filter((h) => h.id !== id);

    if (filtered.length === items.length) {
      return NextResponse.json({ error: 'Hardware item not found' }, { status: 404 });
    }

    dataStore.saveHardware(filtered);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete hardware item' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const items = dataStore.getHardware();
    const item = items.find((h) => h.id === id);

    if (!item) {
      return NextResponse.json({ error: 'Hardware item not found' }, { status: 404 });
    }

    Object.assign(item, body);
    dataStore.saveHardware(items);
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update hardware item' }, { status: 500 });
  }
}

