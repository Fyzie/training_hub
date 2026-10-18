import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { HardwareItem } from '@/lib/types';

export async function GET() {
  const hardware = dataStore.getHardware();
  return NextResponse.json(hardware);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.category) {
      return NextResponse.json({ error: 'Name and category are required' }, { status: 400 });
    }

    const qty = Math.max(1, parseInt(body.quantity || '1', 10));
    const nameClean = (body.name || '').trim();
    const snClean = (body.serialNumber || '').trim();

    const items = dataStore.getHardware();
    // Only aggregate if both name and serial number match
    const existing = items.find(
      (h) =>
        (h.name || '').trim().toLowerCase() === nameClean.toLowerCase() &&
        (h.serialNumber || '').trim().toLowerCase() === snClean.toLowerCase()
    );

    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
      existing.availableQuantity = (existing.availableQuantity ?? existing.quantity) + qty;
      if (body.specs && existing.specs !== body.specs) {
        existing.specs = `${existing.specs}; ${body.specs}`;
      }
      if (body.location) {
        existing.location = body.location;
      }
      if (body.assetTag && !existing.assetTag.includes(body.assetTag)) {
        existing.assetTag = `${existing.assetTag}, ${body.assetTag}`;
      }
      if (existing.availableQuantity > 0 && (existing.status === 'in_use' || existing.status === 'onsite')) {
        existing.status = 'available';
      }
      dataStore.saveHardware(items);
      return NextResponse.json(existing, { status: 200 });
    }

    const newItem: HardwareItem = {
      id: `hw-${Date.now().toString(36)}`,
      assetTag: body.assetTag || `EQ-${Math.floor(100 + Math.random() * 900)}`,
      name: nameClean,
      category: body.category,
      specs: body.specs || 'Standard specification',
      status: body.status || 'available',
      location: body.location || 'AI Lab',
      serialNumber: snClean || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
      quantity: qty,
      availableQuantity: parseInt(body.availableQuantity || qty.toString(), 10),
      assignedTo: body.assignedTo || undefined,
      assignedDate: body.assignedDate || undefined,
      expectedReturnDate: body.expectedReturnDate || undefined,
      purpose: body.purpose || undefined,
      notes: body.notes || undefined,
      healthStatus: body.healthStatus || 'optimal',
      borrowHistory: body.borrowHistory || []
    };

    dataStore.addHardware(newItem);
    return NextResponse.json(newItem, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to add hardware' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, action, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Hardware ID required' }, { status: 400 });
    }

    const items = dataStore.getHardware();
    const item = items.find((h) => h.id === id);
    if (!item) {
      return NextResponse.json({ error: 'Hardware item not found' }, { status: 404 });
    }

    item.quantity = item.quantity || 1;
    item.availableQuantity = item.availableQuantity ?? item.quantity;
    item.borrowHistory = item.borrowHistory || [];

    if (action === 'checkout') {
      const borrowQty = Math.min(item.availableQuantity, Math.max(1, parseInt(body.quantity || '1', 10)));
      item.availableQuantity -= borrowQty;
      if (item.availableQuantity === 0) item.status = 'in_use';

      const rec = {
        id: `rec-${Date.now()}`,
        type: 'borrow' as const,
        quantity: borrowQty,
        assignedTo: body.assignedTo || 'Staff Member',
        assignedDate: new Date().toISOString().split('T')[0],
        expectedReturnDate: body.expectedReturnDate || '',
        purpose: body.purpose || 'Project Borrow',
        status: 'active' as const
      };
      item.borrowHistory.unshift(rec);
      item.assignedTo = rec.assignedTo;
      item.assignedDate = rec.assignedDate;
      item.expectedReturnDate = rec.expectedReturnDate;
      item.purpose = rec.purpose;
    } else if (action === 'takeout') {
      const takeoutQty = Math.min(item.availableQuantity, Math.max(1, parseInt(body.quantity || '1', 10)));
      item.availableQuantity = Math.max(0, item.availableQuantity - takeoutQty);
      if (item.availableQuantity === 0) item.status = 'onsite';

      const rec = {
        id: `rec-${Date.now()}`,
        type: 'takeout_onsite' as const,
        quantity: takeoutQty,
        assignedTo: body.assignedTo || 'Staff Engineer',
        projectName: body.projectName || 'Onsite Project',
        onsiteLocation: body.onsiteLocation || 'Client Deployment Site',
        assignedDate: body.assignedDate || new Date().toISOString().split('T')[0],
        purpose: body.purpose || 'Onsite Project Deployment',
        status: 'active' as const
      };
      item.borrowHistory.unshift(rec);
    } else if (action === 'return_onsite') {
      const recId = body.recordId;
      // First attempt on current item
      let targetItem = item;
      let targetRecord = (targetItem.borrowHistory || []).find(
        (r) => (!recId || r.id === recId) && r.status === 'active' && (r.type === 'takeout_onsite' || r.type === 'takeout_forever')
      );

      // Fallback: search across all items if record belonged to another item in case of deduplication
      if (!targetRecord && recId) {
        for (const other of items) {
          const match = (other.borrowHistory || []).find(
            (r) => r.id === recId && r.status === 'active' && (r.type === 'takeout_onsite' || r.type === 'takeout_forever')
          );
          if (match) {
            targetItem = other;
            targetRecord = match;
            break;
          }
        }
      }

      if (targetRecord) {
        targetRecord.status = 'returned';
        targetRecord.returnedDate = new Date().toISOString().split('T')[0];
        targetItem.availableQuantity = Math.min(targetItem.quantity, (targetItem.availableQuantity || 0) + targetRecord.quantity);
        if (targetItem.availableQuantity > 0 && targetItem.status !== 'maintenance') {
          targetItem.status = 'available';
        }
      }
    } else if (action === 'checkin') {
      const recId = body.recordId;
      let targetItem = item;
      let targetRecord = (targetItem.borrowHistory || []).find(
        (r) => (!recId || r.id === recId) && r.status === 'active' && r.type === 'borrow'
      );

      if (!targetRecord && recId) {
        for (const other of items) {
          const match = (other.borrowHistory || []).find(
            (r) => r.id === recId && r.status === 'active' && r.type === 'borrow'
          );
          if (match) {
            targetItem = other;
            targetRecord = match;
            break;
          }
        }
      }

      if (targetRecord) {
        targetRecord.status = 'returned';
        targetRecord.returnedDate = new Date().toISOString().split('T')[0];
        targetItem.availableQuantity = Math.min(targetItem.quantity, (targetItem.availableQuantity || 0) + targetRecord.quantity);
        if (targetItem.availableQuantity > 0 && targetItem.status !== 'maintenance') {
          targetItem.status = 'available';
        }
      }
    } else if (action === 'add_stock') {
      const addQty = Math.max(1, parseInt(body.quantity || '1', 10));
      item.quantity += addQty;
      item.availableQuantity += addQty;
      if (item.availableQuantity > 0 && item.status === 'in_use') item.status = 'available';
    } else {
      Object.assign(item, updates);
    }

    dataStore.saveHardware(items);
    return NextResponse.json(item);
  } catch (err: any) {
    console.error('Inventory PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update hardware', details: err?.message || String(err) }, { status: 500 });
  }
}

