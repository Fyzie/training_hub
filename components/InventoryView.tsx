'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { HardwareItem, HardwareStatus, HardwareBorrowRecord } from '@/lib/types';
import { useAuth } from './AuthContext';
import {
  Layers,
  Cpu,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  MapPin,
  Tag,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Server,
  Eye,
  Camera,
  Sun,
  Disc,
  Check,
  Copy,
  LogOut,
  Trash2,
  Package,
  History,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutList,
  ShieldCheck,
  Building2,
  Briefcase,
  RefreshCw,
  CornerUpLeft,
  Pencil
} from 'lucide-react';

interface OnsiteDeployment {
  recordId: string;
  deviceId: string;
  deviceName: string;
  category: string;
  specs: string;
  quantity: number;
  assignedTo: string;
  projectName: string;
  onsiteLocation: string;
  assignedDate: string;
  purpose: string;
  status: 'active' | 'returned';
  returnedDate?: string;
}

export function InventoryView() {
  const { user } = useAuth();
  const [hardware, setHardware] = useState<HardwareItem[]>([]);
  const [activeSection, setActiveSection] = useState<'inventory' | 'onsite'>('inventory');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showReturnedOnsite, setShowReturnedOnsite] = useState(false);
  const [onsiteViewMode, setOnsiteViewMode] = useState<'device' | 'location'>('device');
  const [collapsedLocations, setCollapsedLocations] = useState<Record<string, boolean>>({});

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState<HardwareItem | null>(null);
  const [showBorrowModal, setShowBorrowModal] = useState<HardwareItem | null>(null);
  const [showTakeoutModal, setShowTakeoutModal] = useState<HardwareItem | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<HardwareItem | null>(null);
  const [showEditModal, setShowEditModal] = useState<HardwareItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    category: 'Edge Device' as any,
    assetTag: '',
    specs: '',
    location: 'B-4-10',
    serialNumber: '',
    quantity: 1,
    availableQuantity: 1,
    link: '',
    notes: ''
  });

  const [returningRecordId, setReturningRecordId] = useState<string | null>(null);

  // Add Hardware Form (asset tag auto-generated; link drop is optional)
  const [hwForm, setHwForm] = useState({
    name: '',
    category: 'Edge Device' as any,
    specs: '',
    location: 'B-4-10',
    serialNumber: '',
    quantity: 1,
    link: '',
    notes: ''
  });

  // Add Stock Form
  const [addStockQty, setAddStockQty] = useState<number | string>(1);
  const [addStockError, setAddStockError] = useState<string | null>(null);

  // Borrow Form (Internal check out)
  const [borrowForm, setBorrowForm] = useState({
    quantity: 1,
    assignedTo: '',
    expectedReturnDate: '',
    purpose: ''
  });

  // Takeout Form (Onsite deployment)
  const [takeoutForm, setTakeoutForm] = useState({
    quantity: 1,
    onsiteLocation: '',
    assignedTo: '',
    assignedDate: new Date().toISOString().split('T')[0],
    purpose: 'Onsite Deployment'
  });

  const loadHardware = async () => {
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setHardware(data);
      }
    } catch (err) {
      console.error('Failed to load hardware:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHardware();
  }, []);

  // -------------------------------------------------------------
  // DEDUPLICATION: Similar devices are aggregated if name AND serial number match.
  // If serial number is different, they remain separate distinct items!
  // -------------------------------------------------------------
  const uniqueDevices = useMemo(() => {
    const map = new Map<string, HardwareItem>();

    hardware.forEach((item) => {
      const nameNorm = (item.name || 'Unnamed Device').trim().toLowerCase();
      const snNorm = (item.serialNumber || '').trim().toLowerCase();
      // If serial numbers differ, separate keys are produced so items appear as separate rows
      const key = `${nameNorm}:::${snNorm}`;
      const itemQty = item.quantity || 1;
      const itemAvail = item.availableQuantity !== undefined ? item.availableQuantity : itemQty;

      if (!map.has(key)) {
        map.set(key, {
          ...item,
          quantity: itemQty,
          availableQuantity: itemAvail,
          borrowHistory: [...(item.borrowHistory || [])]
        });
      } else {
        const existing = map.get(key)!;
        existing.quantity += itemQty;
        existing.availableQuantity += itemAvail;

        // Merge asset tags without duplicates
        if (item.assetTag && !existing.assetTag.includes(item.assetTag)) {
          existing.assetTag = `${existing.assetTag}, ${item.assetTag}`;
        }
        // Merge borrow histories
        if (item.borrowHistory && item.borrowHistory.length > 0) {
          existing.borrowHistory = [...(existing.borrowHistory || []), ...item.borrowHistory];
        }
      }
    });

    return Array.from(map.values());
  }, [hardware]);

  // Autocomplete suggestion pools derived from existing hardware & history
  const nameSuggestions = useMemo(() => {
    return Array.from(new Set(hardware.map((h) => h.name?.trim()).filter(Boolean)));
  }, [hardware]);

  const assetTagSuggestions = useMemo(() => {
    return Array.from(new Set(hardware.map((h) => h.assetTag?.trim()).filter(Boolean)));
  }, [hardware]);

  const serialSuggestions = useMemo(() => {
    return Array.from(new Set(hardware.map((h) => h.serialNumber?.trim()).filter(Boolean)));
  }, [hardware]);

  const specsSuggestions = useMemo(() => {
    return Array.from(new Set(hardware.map((h) => h.specs?.trim()).filter(Boolean)));
  }, [hardware]);

  const locationSuggestions = useMemo(() => {
    const list = Array.from(new Set(hardware.map((h) => h.location?.trim()).filter(Boolean)));
    if (!list.includes('B-4-10')) {
      list.unshift('B-4-10');
    }
    return list;
  }, [hardware]);

  const personSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (user?.name) set.add(user.name);
    hardware.forEach((h) => {
      if (h.assignedTo) set.add(h.assignedTo.trim());
      (h.borrowHistory || []).forEach((r) => {
        if (r.assignedTo) set.add(r.assignedTo.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [hardware, user?.name]);

  const projectSuggestions = useMemo(() => {
    const set = new Set<string>();
    hardware.forEach((h) => {
      (h.borrowHistory || []).forEach((r) => {
        if (r.projectName) set.add(r.projectName.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [hardware]);

  const onsiteLocationSuggestions = useMemo(() => {
    const set = new Set<string>();
    hardware.forEach((h) => {
      (h.borrowHistory || []).forEach((r) => {
        if (r.onsiteLocation) set.add(r.onsiteLocation.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [hardware]);

  const purposeSuggestions = useMemo(() => {
    const set = new Set<string>();
    hardware.forEach((h) => {
      if (h.purpose) set.add(h.purpose.trim());
      (h.borrowHistory || []).forEach((r) => {
        if (r.purpose) set.add(r.purpose.trim());
      });
    });
    return Array.from(set).filter(Boolean);
  }, [hardware]);


  // Derive All Onsite Deployments from borrow histories
  const allOnsiteDeployments = useMemo(() => {
    const list: OnsiteDeployment[] = [];
    uniqueDevices.forEach((h) => {
      (h.borrowHistory || []).forEach((r) => {
        if (r.type === 'takeout_onsite' || r.type === 'takeout_forever') {
          list.push({
            recordId: r.id,
            deviceId: h.id,
            deviceName: h.name,
            category: h.category,
            specs: h.specs,
            quantity: r.quantity,
            assignedTo: r.assignedTo || 'Staff Engineer',
            projectName: r.projectName || r.purpose || 'Client Project',
            onsiteLocation: r.onsiteLocation || 'Client Deployment Site',
            assignedDate: r.assignedDate || '2026-10-18',
            purpose: r.purpose || 'Production deployment',
            status: r.status,
            returnedDate: r.returnedDate
          });
        }
      });
    });
    return list;
  }, [uniqueDevices]);

  // Overall statistics
  const activeOnsiteDeployments = useMemo(() => {
    return allOnsiteDeployments.filter((d) => d.status === 'active');
  }, [allOnsiteDeployments]);

  const returnedOnsiteDeployments = useMemo(() => {
    return allOnsiteDeployments.filter((d) => d.status === 'returned');
  }, [allOnsiteDeployments]);

  const totalInHouseAvailable = useMemo(() => {
    return uniqueDevices.reduce((sum, d) => sum + d.availableQuantity, 0);
  }, [uniqueDevices]);

  const totalOnsiteUnits = useMemo(() => {
    return activeOnsiteDeployments.reduce((sum, d) => sum + d.quantity, 0);
  }, [activeOnsiteDeployments]);

  const totalOwnedUnits = useMemo(() => {
    return uniqueDevices.reduce((sum, d) => sum + d.quantity, 0);
  }, [uniqueDevices]);

  // Filtered in-house inventory
  const filteredInventory = uniqueDevices.filter((item) => {
    const matchCat = filterCategory === 'all' || item.category === filterCategory;
    const term = searchQuery.trim().toLowerCase();

    const matchSearch =
      term === '' ||
      item.name.toLowerCase().includes(term) ||
      item.assetTag.toLowerCase().includes(term) ||
      (item.serialNumber && item.serialNumber.toLowerCase().includes(term)) ||
      item.category.toLowerCase().includes(term) ||
      item.specs.toLowerCase().includes(term) ||
      item.location.toLowerCase().includes(term);

    return matchCat && matchSearch;
  });

  const [inventoryPage, setInventoryPage] = useState(1);
  useEffect(() => {
    setInventoryPage(1);
  }, [filterCategory, searchQuery]);

  const inventoryTotalPages = Math.ceil(filteredInventory.length / 10) || 1;
  const pagedInventory = filteredInventory.slice((inventoryPage - 1) * 10, inventoryPage * 10);

  // Filtered onsite deployments
  const filteredOnsite = (showReturnedOnsite ? allOnsiteDeployments : activeOnsiteDeployments).filter((d) => {
    const term = searchQuery.trim().toLowerCase();
    return (
      term === '' ||
      d.deviceName.toLowerCase().includes(term) ||
      d.onsiteLocation.toLowerCase().includes(term) ||
      d.assignedTo.toLowerCase().includes(term) ||
      d.category.toLowerCase().includes(term) ||
      d.purpose.toLowerCase().includes(term)
    );
  });

  // Grouped onsite deployments by location
  const deploymentsByLocation = useMemo(() => {
    const map: Record<string, OnsiteDeployment[]> = {};
    filteredOnsite.forEach((d) => {
      const loc = (d.onsiteLocation || 'Unspecified Location').trim();
      if (!map[loc]) {
        map[loc] = [];
      }
      map[loc].push(d);
    });
    return map;
  }, [filteredOnsite]);

  const locationEntries = useMemo(() => {
    return Object.entries(deploymentsByLocation).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deploymentsByLocation]);

  const toggleLocationCollapse = (loc: string) => {
    setCollapsedLocations((prev) => ({
      ...prev,
      [loc]: !prev[loc],
    }));
  };

  const expandAllLocations = () => {
    setCollapsedLocations({});
  };

  const collapseAllLocations = () => {
    const collapsed: Record<string, boolean> = {};
    locationEntries.forEach(([loc]) => {
      collapsed[loc] = true;
    });
    setCollapsedLocations(collapsed);
  };

  // Handle Add New or Increment Existing Device
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hwForm)
      });
      if (res.ok) {
        setShowAddModal(false);
        setHwForm({
          name: '',
          category: 'Edge Device',
          specs: '',
          location: 'B-4-10',
          serialNumber: '',
          quantity: 1,
          link: '',
          notes: ''
        });
        await loadHardware();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (item: HardwareItem) => {
    setEditForm({
      name: item.name || '',
      category: item.category || 'Edge Device',
      assetTag: item.assetTag || '',
      specs: item.specs || '',
      location: item.location || 'B-4-10',
      serialNumber: item.serialNumber || '',
      quantity: item.quantity || 1,
      availableQuantity: item.availableQuantity || 1,
      link: item.link || '',
      notes: item.notes || ''
    });
    setShowEditModal(item);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showEditModal.id,
          name: editForm.name.trim(),
          category: editForm.category,
          specs: editForm.specs.trim(),
          location: editForm.location.trim(),
          serialNumber: editForm.serialNumber.trim(),
          quantity: editForm.quantity,
          availableQuantity: editForm.availableQuantity,
          notes: editForm.notes.trim(),
          link: editForm.link.trim()
        })
      });
      if (res.ok) {
        setShowEditModal(null);
        await loadHardware();
      }
    } catch (err) {
      console.error('Failed to update hardware:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Add Stock (Directly increase quantity of existing device)
  const handleAddStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddStockModal) return;

    const num = Number(addStockQty);
    if (isNaN(num) || num <= 0) {
      setAddStockError('Invalid number. Stock quantity must be 1 or more.');
      return;
    }

    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showAddStockModal.id,
          action: 'add_stock',
          quantity: num
        })
      });
      if (res.ok) {
        setShowAddStockModal(null);
        setAddStockQty(1);
        setAddStockError(null);
        await loadHardware();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Check out / Borrow (Internal office loan)
  const handleBorrowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBorrowModal) return;

    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showBorrowModal.id,
          action: 'checkout',
          quantity: borrowForm.quantity,
          assignedTo: borrowForm.assignedTo || user?.name || 'Staff Specialist',
          expectedReturnDate: borrowForm.expectedReturnDate,
          purpose: borrowForm.purpose || 'Experimental Research'
        })
      });
      if (res.ok) {
        setShowBorrowModal(null);
        setBorrowForm({ quantity: 1, assignedTo: '', expectedReturnDate: '', purpose: '' });
        await loadHardware();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Takeout for Onsite Project Deployment
  const handleTakeoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showTakeoutModal) return;

    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showTakeoutModal.id,
          action: 'takeout',
          quantity: takeoutForm.quantity,
          onsiteLocation: takeoutForm.onsiteLocation || 'Onsite Destination',
          assignedTo: takeoutForm.assignedTo || user?.name || 'Staff Engineer',
          assignedDate: takeoutForm.assignedDate,
          purpose: takeoutForm.purpose || 'Onsite Deployment'
        })
      });
      if (res.ok) {
        setShowTakeoutModal(null);
        setTakeoutForm({
          quantity: 1,
          onsiteLocation: '',
          assignedTo: '',
          assignedDate: new Date().toISOString().split('T')[0],
          purpose: 'Onsite Deployment'
        });
        await loadHardware();
        // Switch to onsite tab so user sees their new deployment
        setActiveSection('onsite');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Return from Onsite
  const handleReturnOnsite = async (deployment: OnsiteDeployment) => {
    setReturningRecordId(deployment.recordId);
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deployment.deviceId,
          action: 'return_onsite',
          recordId: deployment.recordId
        })
      });
      if (res.ok) {
        await loadHardware();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to return hardware from onsite:', errData);
      }
    } catch (err) {
      console.error('Return to office error:', err);
    } finally {
      setReturningRecordId(null);
    }
  };

  // Handle Return Internal Borrow
  const handleReturnBorrow = async (item: HardwareItem, recordId?: string) => {
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          action: 'checkin',
          recordId
        })
      });
      if (res.ok) {
        await loadHardware();
        if (showHistoryModal?.id === item.id) {
          const updated = await res.json();
          setShowHistoryModal(updated);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete Hardware
  const handleDeleteHardware = async (id: string) => {
    if (!confirm('Are you sure you want to remove this hardware item from inventory?')) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHardware((prev) => prev.filter((h) => h.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Hardware & Office Assets
          </h1>
        </div>

        <button
          onClick={() => {
            setHwForm({
              name: '',
              category: 'Edge Device',
              specs: '',
              location: 'B-4-10',
              serialNumber: '',
              quantity: 1,
              link: '',
              notes: ''
            });
            setShowAddModal(true);
          }}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Hardware Asset</span>
        </button>
      </div>

      {/* SECTION TABS: INVENTORY vs ONSITE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200 shadow-inner w-full sm:w-fit">
          <button
            onClick={() => setActiveSection('inventory')}
            className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition-all flex-1 sm:flex-initial whitespace-nowrap ${
              activeSection === 'inventory'
                ? 'bg-white text-blue-700 shadow-sm shadow-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4 text-blue-600 shrink-0" />
            <span>In-House</span>
            <span className="hidden xs:inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
              {uniqueDevices.length} Models • {totalInHouseAvailable} In Office
            </span>
          </button>

          <button
            onClick={() => setActiveSection('onsite')}
            className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition-all flex-1 sm:flex-initial whitespace-nowrap ${
              activeSection === 'onsite'
                ? 'bg-white text-amber-900 shadow-sm shadow-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Onsite</span>
            <span className={`hidden xs:inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
              totalOnsiteUnits > 0
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {totalOnsiteUnits} Units
            </span>
          </button>
        </div>

        {/* Global Summary KPI Pills */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2 text-xs w-full sm:w-auto">
          <div className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-center sm:text-left">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mx-auto sm:mx-0 shrink-0"></span>
            <span className="text-slate-500 font-medium text-[10px] sm:text-xs">Office:</span>
            <span className="font-extrabold text-slate-800 text-xs sm:text-sm">{totalInHouseAvailable}</span>
          </div>

          <div className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-center sm:text-left">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mx-auto sm:mx-0 shrink-0"></span>
            <span className="text-slate-500 font-medium text-[10px] sm:text-xs">Onsite:</span>
            <span className="font-extrabold text-amber-700 text-xs sm:text-sm">{totalOnsiteUnits}</span>
          </div>

          <div className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-center sm:text-left">
            <span className="w-2 h-2 rounded-full bg-blue-500 mx-auto sm:mx-0 shrink-0"></span>
            <span className="text-slate-500 font-medium text-[10px] sm:text-xs">Fleet:</span>
            <span className="font-extrabold text-slate-900 text-xs sm:text-sm">{totalOwnedUnits}</span>
          </div>
        </div>
      </div>

      {/* FILTER & MULTI-FIELD SEARCH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={
              activeSection === 'inventory'
                ? 'Search device name, asset tag, serial (SN-...), category, location...'
                : 'Search site location, deployed engineer, device...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {activeSection === 'inventory' ? (
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {['all', 'Edge Device', 'Camera', 'Lenses', 'Lighting', 'Peripheral'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all ${
                  filterCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {onsiteViewMode === 'location' && locationEntries.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs ml-auto">
                <button
                  type="button"
                  onClick={expandAllLocations}
                  className="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold transition-colors cursor-pointer"
                >
                  Expand All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={collapseAllLocations}
                  className="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold transition-colors cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            )}
            {/* View Mode Toggle: Per Device vs Per Location */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setOnsiteViewMode('device')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  onsiteViewMode === 'device'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5 text-slate-500" />
                <span>View Per Device</span>
              </button>
              <button
                type="button"
                onClick={() => setOnsiteViewMode('location')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  onsiteViewMode === 'location'
                    ? 'bg-white text-amber-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                <span>View Per Onsite Location</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowReturnedOnsite(!showReturnedOnsite)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                showReturnedOnsite
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
              }`}
            >
              {showReturnedOnsite ? 'Showing All (Active & Returned)' : 'Show Active Only'}
            </button>


          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION A: INVENTORY TABLE / MOBILE CARDS (Single row per device) */}
      {/* ------------------------------------------------------------- */}
      {activeSection === 'inventory' && (
        <div className="space-y-4">
          {/* Mobile Card List (< md) */}
          <div className="md:hidden space-y-3">
            {filteredInventory.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">
                <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-slate-600 text-sm">No hardware devices found</p>
                <p className="text-xs">Try adjusting your search query or add a new device</p>
              </div>
            ) : (
              pagedInventory.map((item) => {
                const activeBorrows = (item.borrowHistory || []).filter(
                  (r) => r.status === 'active' && r.type === 'borrow'
                );
                const activeOnsites = (item.borrowHistory || []).filter(
                  (r) => r.status === 'active' && (r.type === 'takeout_onsite' || r.type === 'takeout_forever')
                );
                const borrowedCount = activeBorrows.reduce((sum, r) => sum + r.quantity, 0);
                const onsiteCount = activeOnsites.reduce((sum, r) => sum + r.quantity, 0);

                return (
                  <div key={item.id} className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                          {item.category === 'Edge Device' && <Cpu className="w-4 h-4" />}
                          {item.category === 'Camera' && <Camera className="w-4 h-4" />}
                          {item.category === 'Lenses' && <Disc className="w-4 h-4" />}
                          {item.category === 'Lighting' && <Sun className="w-4 h-4" />}
                          {item.category === 'Peripheral' && <Server className="w-4 h-4" />}
                          {!['Edge Device', 'Camera', 'Lenses', 'Lighting', 'Peripheral'].includes(item.category) && (
                            <Package className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">{item.name}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.specs}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                          {item.assetTag}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/70">
                          SN: {item.serialNumber || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Stock & Location Bar */}
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">In Office Stock</span>
                        <span className="font-black text-slate-900 text-sm">{item.availableQuantity}</span>
                        <span className="text-[10px] text-slate-400"> / {item.quantity} total</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">Location</span>
                        <span className="font-bold text-slate-700 text-xs">{item.location}</span>
                      </div>
                    </div>

                    {/* Quick Badges if borrowed or onsite */}
                    {(borrowedCount > 0 || onsiteCount > 0) && (
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        {borrowedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {borrowedCount} Borrowed
                          </span>
                        )}
                        {onsiteCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            {onsiteCount} Onsite
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-1.5">
                      <div className="flex items-center gap-1.5 flex-1">
                        <button
                          onClick={() => {
                            setShowAddStockModal(item);
                            setAddStockQty(1);
                            setAddStockError(null);
                          }}
                          className="flex-1 py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] flex items-center justify-center gap-1 transition-colors border border-slate-200/80 cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-blue-600" />
                          <span>Stock</span>
                        </button>
                        <button
                          disabled={item.availableQuantity <= 0}
                          onClick={() => {
                            setShowTakeoutModal(item);
                            setTakeoutForm({
                              quantity: 1,
                              onsiteLocation: '',
                              assignedTo: user?.name || '',
                              assignedDate: new Date().toISOString().split('T')[0],
                              purpose: 'Onsite Deployment'
                            });
                          }}
                          className="flex-1 py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] flex items-center justify-center gap-1 transition-colors shadow-sm disabled:opacity-40 cursor-pointer"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>Takeout</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.link && (
                          <a
                            href={item.link.startsWith('http') ? item.link : `https://${item.link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Documentation / Spec Link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Edit Details"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setShowHistoryModal(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteHardware(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (hidden on mobile) */}
          <div className="hidden md:block bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Device & Specifications</th>
                  <th className="py-3.5 px-4">Asset Tag & Serial</th>
                  <th className="py-3.5 px-4">In-House Stock</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4 text-center">Deploy Status</th>
                  <th className="py-3.5 px-4 text-right">Row Actions (3 Core)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-bold text-slate-600">No hardware devices found</p>
                      <p className="text-[11px]">Try adjusting your search query or add a new device</p>
                    </td>
                  </tr>
                ) : (
                  pagedInventory.map((item) => {
                    const activeBorrows = (item.borrowHistory || []).filter(
                      (r) => r.status === 'active' && r.type === 'borrow'
                    );
                    const activeOnsites = (item.borrowHistory || []).filter(
                      (r) => r.status === 'active' && (r.type === 'takeout_onsite' || r.type === 'takeout_forever')
                    );
                    const borrowedCount = activeBorrows.reduce((sum, r) => sum + r.quantity, 0);
                    const onsiteCount = activeOnsites.reduce((sum, r) => sum + r.quantity, 0);

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-blue-50/30 transition-colors group"
                      >
                        {/* Device & Specs */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-xl bg-slate-100 text-slate-700 shrink-0 mt-0.5 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                              {item.category === 'Edge Device' && <Cpu className="w-4 h-4" />}
                              {item.category === 'Camera' && <Camera className="w-4 h-4" />}
                              {item.category === 'Lenses' && <Disc className="w-4 h-4" />}
                              {item.category === 'Lighting' && <Sun className="w-4 h-4" />}
                              {item.category === 'Peripheral' && <Server className="w-4 h-4" />}
                              {!['Edge Device', 'Camera', 'Lenses', 'Lighting', 'Peripheral'].includes(item.category) && (
                                <Package className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors text-sm">
                                  {item.name}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {item.category}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                {item.specs}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Tag & Serial Number */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 font-bold">
                              <Tag className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[140px]" title={item.assetTag}>
                                {item.assetTag}
                              </span>
                            </div>
                            {item.serialNumber && (
                              <p className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]" title={item.serialNumber}>
                                SN: {item.serialNumber}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* In-House Stock / Availability */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-slate-900 text-sm">
                                {item.availableQuantity}
                              </span>
                              <span className="text-[11px] text-slate-400">/ {item.quantity} available</span>
                            </div>
                            {/* Distribution indicator */}
                            <div className="flex items-center gap-1 text-[10px] font-bold">
                              {item.availableQuantity > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                  {item.availableQuantity} in office
                                </span>
                              )}
                              {borrowedCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                                  {borrowedCount} borrowed
                                </span>
                              )}
                              {onsiteCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                                  {onsiteCount} onsite
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Storage Location */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium truncate max-w-[120px]">{item.location}</span>
                          </div>
                        </td>

                        {/* Deployment Status Pill */}
                        <td className="py-3.5 px-4 text-center">
                          {item.availableQuantity > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Ready In Office
                            </span>
                          ) : onsiteCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              <MapPin className="w-3 h-3 text-amber-600" />
                              Fully Onsite
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600">
                              All Borrowed
                            </span>
                          )}
                        </td>

                        {/* 3 ROW ACTIONS */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Action 1: Add Stock (Increment quantity without creating duplicate row) */}
                            <button
                              onClick={() => {
                                setShowAddStockModal(item);
                                setAddStockQty(1);
                                setAddStockError(null);
                              }}
                              title="Add stock units to this device"
                              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] flex items-center gap-1 transition-colors border border-slate-200/80"
                            >
                              <Plus className="w-3 h-3 text-blue-600" />
                              <span>Add</span>
                            </button>

                            {/* Action 2: Take Out (Deploy to Onsite) */}
                            <button
                              disabled={item.availableQuantity <= 0}
                              onClick={() => {
                                setShowTakeoutModal(item);
                                setTakeoutForm({
                                  quantity: 1,
                                  onsiteLocation: '',
                                  assignedTo: user?.name || '',
                                  assignedDate: new Date().toISOString().split('T')[0],
                                  purpose: 'Onsite Deployment'
                                });
                              }}
                              title="Take out units for onsite project deployment"
                              className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] flex items-center gap-1 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Take Out</span>
                            </button>

                            {/* Link Drop */}
                            {item.link && (
                              <a
                                href={item.link.startsWith('http') ? item.link : `https://${item.link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Documentation / Spec Link"
                                className="p-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {/* Edit */}
                            <button
                              onClick={() => openEditModal(item)}
                              title="Edit hardware details"
                              className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* History Log */}
                            <button
                              onClick={() => setShowHistoryModal(item)}
                              title="View borrow & deployment history"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-0.5"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteHardware(item.id)}
                              title="Delete hardware item"
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Navigation (Max 10 per page) */}
        {filteredInventory.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200/80 text-xs px-1">
            <span className="text-slate-400 font-medium">
              Showing {(inventoryPage - 1) * 10 + 1} - {Math.min(filteredInventory.length, inventoryPage * 10)} of {filteredInventory.length} items
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={inventoryPage <= 1}
                onClick={() => {
                  setInventoryPage((p) => Math.max(1, p - 1));
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <span className="font-extrabold text-slate-800 px-2 select-none">
                {inventoryPage} out of {inventoryTotalPages}
              </span>
              <button
                disabled={inventoryPage >= inventoryTotalPages}
                onClick={() => {
                  setInventoryPage((p) => Math.min(inventoryTotalPages, p + 1));
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION B: ONSITE DEPLOYMENTS TABLE / MOBILE CARDS */}
      {/* ------------------------------------------------------------- */}
      {activeSection === 'onsite' && (
        <div className="space-y-4">
          {/* Mobile Onsite Cards (< md) */}
          <div className="md:hidden space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  <span>Onsite Project Deployments</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {onsiteViewMode === 'location' ? 'Grouped by client deployment site' : 'Hardware active at client sites'}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                {totalOnsiteUnits} Units
              </span>
            </div>

            {filteredOnsite.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">
                <MapPin className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                <p className="font-bold text-slate-700 text-sm">No onsite hardware deployments found</p>
                <p className="text-xs">Click "Takeout" on any in-house inventory item to deploy it onsite</p>
              </div>
            ) : onsiteViewMode === 'location' ? (
              /* Mobile View Grouped by Location */
              locationEntries.map(([locationName, items]) => {
                const isCollapsed = Boolean(collapsedLocations[locationName]);
                const locTotalUnits = items.reduce((s, it) => s + it.quantity, 0);
                const locActiveUnits = items.filter((it) => it.status === 'active').reduce((s, it) => s + it.quantity, 0);
                return (
                  <div key={locationName} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleLocationCollapse(locationName)}
                      className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-sm text-slate-900 truncate">{locationName}</h4>
                          <p className="text-[11px] text-slate-500">
                            {items.length} {items.length === 1 ? 'device' : 'devices'} • {locTotalUnits} units
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                          {locActiveUnits} Active
                        </span>
                        {isCollapsed ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="p-3 pt-0 space-y-2.5 border-t border-slate-100">
                        {items.map((d) => (
                          <div key={d.recordId} className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60 space-y-2 mt-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-slate-900 text-sm">{d.deviceName}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-700">
                                    {d.category}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{d.specs}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded-xl bg-amber-100 text-amber-950 font-black text-xs border border-amber-200 shrink-0">
                                {d.quantity} units
                              </span>
                            </div>

                            <div className="text-xs space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>By: <strong>{d.assignedTo}</strong></span>
                                <span>{d.assignedDate}</span>
                              </div>
                              {d.purpose && (
                                <p className="text-[11px] text-slate-600 line-clamp-2 italic pt-1 border-t border-slate-200/50">
                                  "{d.purpose}"
                                </p>
                              )}
                            </div>

                            {d.status === 'active' ? (
                              <button
                                disabled={returningRecordId === d.recordId}
                                onClick={() => handleReturnOnsite(d)}
                                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                {returningRecordId === d.recordId ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CornerUpLeft className="w-3.5 h-3.5" />
                                )}
                                <span>Return Hardware to Office</span>
                              </button>
                            ) : (
                              <div className="text-[11px] font-bold text-slate-400 text-center py-1">
                                Returned {d.returnedDate ? `on ${d.returnedDate}` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              /* Mobile View Flat Per Device */
              filteredOnsite.map((d) => (
                <div key={d.recordId} className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm">{d.deviceName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {d.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{d.specs}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-xl bg-amber-100 text-amber-950 font-black text-xs border border-amber-200 shrink-0">
                      {d.quantity} units
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                      <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{d.onsiteLocation}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>By: <strong>{d.assignedTo}</strong></span>
                      <span>{d.assignedDate}</span>
                    </div>
                  </div>

                  {d.status === 'active' && (
                    <button
                      disabled={returningRecordId === d.recordId}
                      onClick={() => handleReturnOnsite(d)}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {returningRecordId === d.recordId ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CornerUpLeft className="w-3.5 h-3.5" />
                      )}
                      <span>Return Hardware to Office</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Onsite Section (hidden on mobile) */}
          <div className="hidden md:block space-y-4">
            {filteredOnsite.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-12 text-center text-slate-400">
                <MapPin className="w-10 h-10 mx-auto text-amber-300 mb-2" />
                <p className="font-bold text-slate-700">No onsite hardware deployments found</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click "Take Out" on any in-house inventory item to deploy it onsite
                </p>
              </div>
            ) : onsiteViewMode === 'location' ? (
              /* Desktop View Grouped by Location (Collapsible) */
              <div className="space-y-3.5">
                {locationEntries.map(([locationName, items]) => {
                  const isCollapsed = Boolean(collapsedLocations[locationName]);
                  const locTotalUnits = items.reduce((s, it) => s + it.quantity, 0);
                  const locActiveUnits = items.filter((it) => it.status === 'active').reduce((s, it) => s + it.quantity, 0);
                  return (
                    <div
                      key={locationName}
                      className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden transition-all"
                    >
                      {/* Collapsible Header */}
                      <div
                        onClick={() => toggleLocationCollapse(locationName)}
                        className="p-4 px-6 flex items-center justify-between cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h4 className="font-extrabold text-base text-slate-900">{locationName}</h4>
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-200">
                                {locActiveUnits} Active Units
                              </span>
                              {locTotalUnits > locActiveUnits && (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                                  {locTotalUnits - locActiveUnits} Returned
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {items.length} {items.length === 1 ? 'hardware device registered' : 'hardware devices registered'} at this facility ({locTotalUnits} total units)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-500">
                            {isCollapsed ? 'Show Devices' : 'Hide Devices'}
                          </span>
                          <div className="p-1.5 rounded-xl bg-slate-100 text-slate-600">
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Devices Table for this Location */}
                      {!isCollapsed && (
                        <div className="border-t border-slate-100">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-amber-50/40 border-b border-amber-100/70 text-[11px] font-extrabold text-amber-900 uppercase tracking-wider">
                                  <th className="py-2.5 px-6">Device Deployed</th>
                                  <th className="py-2.5 px-4">Qty</th>
                                  <th className="py-2.5 px-4">Deployed By & Date</th>
                                  <th className="py-2.5 px-4">Purpose / Notes</th>
                                  <th className="py-2.5 px-6 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {items.map((d) => {
                                  const isActive = d.status === 'active';
                                  return (
                                    <tr
                                      key={d.recordId}
                                      className={`transition-colors ${
                                        isActive ? 'hover:bg-amber-50/30' : 'bg-slate-50/50 opacity-70'
                                      }`}
                                    >
                                      {/* Device */}
                                      <td className="py-3.5 px-6">
                                        <div>
                                          <p className="font-extrabold text-slate-900 text-sm">{d.deviceName}</p>
                                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                            {d.category}
                                          </span>
                                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{d.specs}</p>
                                        </div>
                                      </td>

                                      {/* Qty */}
                                      <td className="py-3.5 px-4">
                                        <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-950 font-black text-xs border border-amber-200">
                                          {d.quantity} units
                                        </span>
                                      </td>

                                      {/* Deployed By & Date */}
                                      <td className="py-3.5 px-4">
                                        <div>
                                          <p className="font-bold text-slate-800">{d.assignedTo}</p>
                                          <p className="text-[10px] text-slate-400">Deployed: {d.assignedDate}</p>
                                          {!isActive && d.returnedDate && (
                                            <p className="text-[10px] text-emerald-600 font-bold">Returned: {d.returnedDate}</p>
                                          )}
                                        </div>
                                      </td>

                                      {/* Purpose */}
                                      <td className="py-3.5 px-4">
                                        <p className="text-slate-600 text-[11px] line-clamp-2 max-w-[280px]">
                                          {d.purpose}
                                        </p>
                                      </td>

                                      {/* Action: Return to In-House Inventory */}
                                      <td className="py-3.5 px-6 text-right">
                                        {isActive ? (
                                          <button
                                            disabled={returningRecordId === d.recordId}
                                            onClick={() => handleReturnOnsite(d)}
                                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center gap-1.5 ml-auto shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                          >
                                            <RotateCcw className={`w-3.5 h-3.5 ${returningRecordId === d.recordId ? 'animate-spin' : ''}`} />
                                            <span>{returningRecordId === d.recordId ? 'Returning...' : 'Return to Office'}</span>
                                          </button>
                                        ) : (
                                          <span className="text-[11px] font-bold text-slate-400">
                                            Returned
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Desktop View Flat Table Per Device */
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden p-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-amber-50/60 border-b border-amber-100 text-[11px] font-extrabold text-amber-900 uppercase tracking-wider">
                        <th className="py-3 px-4">Device Deployed</th>
                        <th className="py-3 px-4">Qty</th>
                        <th className="py-3 px-4">Onsite Location</th>
                        <th className="py-3 px-4">Deployed By & Date</th>
                        <th className="py-3 px-4">Purpose / Notes</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredOnsite.map((d) => {
                        const isActive = d.status === 'active';
                        return (
                          <tr
                            key={d.recordId}
                            className={`transition-colors ${
                              isActive ? 'hover:bg-amber-50/30' : 'bg-slate-50/50 opacity-70'
                            }`}
                          >
                            {/* Device */}
                            <td className="py-3.5 px-4">
                              <div>
                                <p className="font-extrabold text-slate-900 text-sm">{d.deviceName}</p>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                  {d.category}
                                </span>
                                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{d.specs}</p>
                              </div>
                            </td>

                            {/* Qty */}
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-950 font-black text-xs border border-amber-200">
                                {d.quantity} units
                              </span>
                            </td>

                            {/* Onsite Location */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{d.onsiteLocation}</span>
                              </div>
                            </td>

                            {/* Deployed By & Date */}
                            <td className="py-3.5 px-4">
                              <div>
                                <p className="font-bold text-slate-800">{d.assignedTo}</p>
                                <p className="text-[10px] text-slate-400">Deployed: {d.assignedDate}</p>
                                {!isActive && d.returnedDate && (
                                  <p className="text-[10px] text-emerald-600 font-bold">Returned: {d.returnedDate}</p>
                                )}
                              </div>
                            </td>

                            {/* Purpose */}
                            <td className="py-3.5 px-4">
                              <p className="text-slate-600 text-[11px] line-clamp-2 max-w-[200px]">
                                {d.purpose}
                              </p>
                            </td>

                            {/* Action: Return to In-House Inventory */}
                            <td className="py-3.5 px-4 text-right">
                              {isActive ? (
                                <button
                                  disabled={returningRecordId === d.recordId}
                                  onClick={() => handleReturnOnsite(d)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center gap-1.5 ml-auto shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${returningRecordId === d.recordId ? 'animate-spin' : ''}`} />
                                  <span>{returningRecordId === d.recordId ? 'Returning...' : 'Return to Office'}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] font-bold text-slate-400">
                                  Returned
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
      </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: ADD NEW HARDWARE / FLEET ITEM */}
      {/* ------------------------------------------------------------- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Add Hardware to Inventory
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Enter hardware device specifications. If a device with the same name and serial number already exists, quantity will be aggregated into that item.
            </p>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Device Name / Model *
                  </label>
                  <input
                    type="text"
                    required
                    list="hw-name-suggestions"
                    placeholder="e.g. NVIDIA Jetson Orin Nano 8GB"
                    value={hwForm.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = hardware.find((h) => h.name?.trim().toLowerCase() === val.trim().toLowerCase());
                      if (match) {
                        setHwForm((prev) => ({
                          ...prev,
                          name: val,
                          category: match.category || prev.category,
                          specs: (!prev.specs || prev.specs === 'Standard Specification') ? match.specs : prev.specs,
                          location: (!prev.location || prev.location === 'Office Lab Rack A' || prev.location === 'B-4-10') ? match.location : prev.location
                        }));
                      } else {
                        setHwForm((prev) => ({ ...prev, name: val }));
                      }
                    }}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                  />
                  <datalist id="hw-name-suggestions">
                    {nameSuggestions.map((name, i) => (
                      <option key={`hname-${i}`} value={name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={hwForm.category}
                    onChange={(e) => setHwForm({ ...hwForm, category: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 bg-white font-semibold"
                  >
                    <option value="Edge Device">Edge Device</option>
                    <option value="Camera">Camera</option>
                    <option value="Lenses">Lenses</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Peripheral">Peripheral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={hwForm.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHwForm({ ...hwForm, quantity: val === '' ? ('' as any) : parseInt(val) || 0 });
                    }}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Link Drop / Doc URL <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      placeholder="https://datasheet.com or wiki"
                      value={hwForm.link}
                      onChange={(e) => setHwForm({ ...hwForm, link: e.target.value })}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    list="hw-serial-suggestions"
                    placeholder="e.g. SN-994821"
                    value={hwForm.serialNumber}
                    onChange={(e) => setHwForm({ ...hwForm, serialNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-mono"
                  />
                  <datalist id="hw-serial-suggestions">
                    {serialSuggestions.map((sn, i) => (
                      <option key={`hsn-${i}`} value={sn} />
                    ))}
                  </datalist>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hardware Specifications
                  </label>
                  <input
                    type="text"
                    list="hw-specs-suggestions"
                    placeholder="e.g. 40 TOPS AI, 8GB 128-bit LPDDR5, Ampere Architecture"
                    value={hwForm.specs}
                    onChange={(e) => setHwForm({ ...hwForm, specs: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                  <datalist id="hw-specs-suggestions">
                    {specsSuggestions.map((sp, i) => (
                      <option key={`hsp-${i}`} value={sp} />
                    ))}
                  </datalist>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Office Storage Location
                  </label>
                  <input
                    type="text"
                    list="hw-location-suggestions"
                    placeholder="e.g. B-4-10, Shelf 2"
                    value={hwForm.location}
                    onChange={(e) => setHwForm({ ...hwForm, location: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                  <datalist id="hw-location-suggestions">
                    {locationSuggestions.map((loc, i) => (
                      <option key={`hloc-${i}`} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  Save to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: ADD STOCK UNITS TO EXISTING DEVICE */}
      {/* ------------------------------------------------------------- */}
      {showAddStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowAddStockModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Plus className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Add Stock Quantity
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Increase total and available units for <span className="font-bold text-slate-800">{showAddStockModal.name}</span>.
            </p>

            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 mb-5">
              <p className="text-xs font-extrabold text-blue-900">{showAddStockModal.name}</p>
              <p className="text-[11px] text-blue-700 mt-0.5">{showAddStockModal.specs}</p>
              <div className="flex items-center gap-3 mt-2 text-xs font-bold text-blue-950">
                <span>Current Total: {showAddStockModal.quantity}</span>
                <span>•</span>
                <span>In Office: {showAddStockModal.availableQuantity}</span>
              </div>
            </div>

            <form onSubmit={handleAddStockSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantity to Add
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={addStockQty}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setAddStockQty(raw);
                    if (raw === '') {
                      setAddStockError('Please enter a stock quantity.');
                    } else {
                      const num = Number(raw);
                      if (isNaN(num) || num <= 0) {
                        setAddStockError('Invalid number. Quantity must be 1 or more.');
                      } else {
                        setAddStockError(null);
                      }
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-black text-slate-900 focus:outline-none focus:ring-2 ${
                    addStockError
                      ? 'border-rose-300 focus:ring-rose-500/20 bg-rose-50/20'
                      : 'border-slate-200 focus:ring-blue-500/20'
                  }`}
                  placeholder="Enter quantity to add"
                />
                {addStockError && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{addStockError}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStockModal(null);
                    setAddStockError(null);
                  }}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(addStockError) || !addStockQty || Number(addStockQty) <= 0}
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Confirm +{addStockQty || 0} Units
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: BORROW (Internal Office Loan) */}
      {/* ------------------------------------------------------------- */}
      {showBorrowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowBorrowModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Borrow Hardware (Internal Loan)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Check out units for in-house research, testing, or development.
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 mb-5">
              <p className="text-xs font-extrabold text-slate-900">{showBorrowModal.name}</p>
              <p className="text-[11px] text-slate-500">{showBorrowModal.specs}</p>
              <p className="text-[11px] font-bold text-emerald-700 mt-1">
                Available in Office: {showBorrowModal.availableQuantity} units
              </p>
            </div>

            <form onSubmit={handleBorrowSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantity to Borrow (Max: {showBorrowModal.availableQuantity})
                </label>
                <input
                  type="number"
                  min="1"
                  max={showBorrowModal.availableQuantity}
                  required
                  value={borrowForm.quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBorrowForm({
                      ...borrowForm,
                      quantity: val === '' ? ('' as any) : Math.min(showBorrowModal.availableQuantity, Math.max(1, parseInt(val) || 1))
                    });
                  }}
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Borrower Name / Staff Member *
                </label>
                <input
                  type="text"
                  required
                  list="borrow-person-suggestions"
                  placeholder="e.g. John Doe"
                  value={borrowForm.assignedTo}
                  onChange={(e) => setBorrowForm({ ...borrowForm, assignedTo: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200"
                />
                <datalist id="borrow-person-suggestions">
                  {personSuggestions.map((p, i) => (
                    <option key={`bp-${i}`} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Expected Return Date
                </label>
                <input
                  type="date"
                  value={borrowForm.expectedReturnDate}
                  onChange={(e) => setBorrowForm({ ...borrowForm, expectedReturnDate: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Purpose / Research Scope
                </label>
                <input
                  type="text"
                  list="borrow-purpose-suggestions"
                  placeholder="e.g. Model validation on edge hardware"
                  value={borrowForm.purpose}
                  onChange={(e) => setBorrowForm({ ...borrowForm, purpose: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                />
                <datalist id="borrow-purpose-suggestions">
                  {purposeSuggestions.map((p, i) => (
                    <option key={`bpurp-${i}`} value={p} />
                  ))}
                </datalist>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBorrowModal(null)}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  Confirm Borrow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: TAKE OUT FOR ONSITE (Deploy to Client Site / Project) */}
      {/* ------------------------------------------------------------- */}
      {showTakeoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowTakeoutModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Take Out for Onsite Deployment
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Deploy units to a project or client facility. Units will be registered in the <span className="font-bold text-amber-900">b. Onsite Deployments</span> section.
            </p>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 mb-5">
              <p className="text-xs font-extrabold text-amber-950">{showTakeoutModal.name}</p>
              <p className="text-[11px] text-amber-800">{showTakeoutModal.specs}</p>
              <p className="text-[11px] font-bold text-amber-900 mt-1">
                Available In-House: {showTakeoutModal.availableQuantity} units
              </p>
            </div>

            <form onSubmit={handleTakeoutSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity to Take Out (Max: {showTakeoutModal.availableQuantity}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={showTakeoutModal.availableQuantity}
                    required
                    value={takeoutForm.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTakeoutForm({
                        ...takeoutForm,
                        quantity: val === '' ? ('' as any) : Math.min(showTakeoutModal.availableQuantity, Math.max(1, parseInt(val) || 1))
                      });
                    }}
                    className="w-full px-3.5 py-2 rounded-xl text-xs font-black border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deployment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={takeoutForm.assignedDate}
                    onChange={(e) => setTakeoutForm({ ...takeoutForm, assignedDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Onsite Deployment Location / Site *
                  </label>
                  <input
                    type="text"
                    required
                    list="takeout-location-suggestions"
                    placeholder="e.g. Tanjung Malim Plant, Bay 4 Inspection Conveyor"
                    value={takeoutForm.onsiteLocation}
                    onChange={(e) => setTakeoutForm({ ...takeoutForm, onsiteLocation: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200"
                  />
                  <datalist id="takeout-location-suggestions">
                    {onsiteLocationSuggestions.map((loc, i) => (
                      <option key={`tloc-${i}`} value={loc} />
                    ))}
                  </datalist>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Staff Engineer / Deployed By *
                  </label>
                  <input
                    type="text"
                    required
                    list="takeout-person-suggestions"
                    placeholder="e.g. John Doe"
                    value={takeoutForm.assignedTo}
                    onChange={(e) => setTakeoutForm({ ...takeoutForm, assignedTo: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200"
                  />
                  <datalist id="takeout-person-suggestions">
                    {personSuggestions.map((p, i) => (
                      <option key={`tp-${i}`} value={p} />
                    ))}
                  </datalist>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deployment Purpose & Operational Scope
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Onsite edge inference test for real-time defect segmentation"
                    value={takeoutForm.purpose}
                    onChange={(e) => setTakeoutForm({ ...takeoutForm, purpose: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                  {purposeSuggestions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-semibold mr-1">Suggestions:</span>
                      {purposeSuggestions.slice(0, 3).map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setTakeoutForm({ ...takeoutForm, purpose: p })}
                          className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[200px]"
                          title={p}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTakeoutModal(null)}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20"
                >
                  Confirm Onsite Deployment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: BORROW & AUDIT HISTORY MODAL */}
      {/* ------------------------------------------------------------- */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-2xl w-full border border-slate-100 shadow-2xl relative max-h-[88vh] flex flex-col">
            <button
              onClick={() => setShowHistoryModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Audit History & Allocations
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Transaction logs and active allocations for <span className="font-bold text-slate-800">{showHistoryModal.name}</span>
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {!showHistoryModal.borrowHistory || showHistoryModal.borrowHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Package className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                  <p className="font-bold text-xs text-slate-600">No checkout history recorded yet</p>
                </div>
              ) : (
                showHistoryModal.borrowHistory.map((rec) => {
                  const isActive = rec.status === 'active';
                  const isOnsite = rec.type === 'takeout_onsite' || rec.type === 'takeout_forever';

                  return (
                    <div
                      key={rec.id}
                      className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                        isActive
                          ? isOnsite
                            ? 'bg-amber-50/50 border-amber-200'
                            : 'bg-blue-50/50 border-blue-200'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isOnsite
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isOnsite ? 'Onsite Deployment' : 'Internal Borrow'}
                          </span>
                          <span className="font-bold text-slate-800">
                            {rec.quantity} Unit(s) assigned to {rec.assignedTo}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {rec.purpose}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Date: {rec.assignedDate}
                          {rec.expectedReturnDate && ` • Expected Return: ${rec.expectedReturnDate}`}
                          {rec.returnedDate && ` • Returned: ${rec.returnedDate}`}
                        </p>
                      </div>

                      {isActive && (
                        <button
                          onClick={() => handleReturnBorrow(showHistoryModal, rec.id)}
                          className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Return</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 6: EDIT HARDWARE ITEM */}
      {/* ------------------------------------------------------------- */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowEditModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Edit Hardware Asset
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Update device specifications, storage location, or documentation link.
            </p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Device Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-semibold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 bg-white font-semibold"
                  >
                    <option value="Edge Device">Edge Device</option>
                    <option value="Camera">Camera</option>
                    <option value="Lenses">Lenses</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Peripheral">Peripheral</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    value={editForm.serialNumber}
                    onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-mono"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Storage Location
                  </label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Stock Units *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editForm.quantity}
                    onChange={(e) => {
                      const q = Math.max(0, parseInt(e.target.value, 10) || 0);
                      const diff = q - editForm.quantity;
                      setEditForm({
                        ...editForm,
                        quantity: q,
                        availableQuantity: Math.max(0, editForm.availableQuantity + diff)
                      });
                    }}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-bold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Available In-Office Stock *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={editForm.quantity}
                    required
                    value={editForm.availableQuantity}
                    onChange={(e) => {
                      const avail = Math.max(0, Math.min(editForm.quantity, parseInt(e.target.value, 10) || 0));
                      setEditForm({
                        ...editForm,
                        availableQuantity: avail
                      });
                    }}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 font-bold"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hardware Specifications
                  </label>
                  <input
                    type="text"
                    value={editForm.specs}
                    onChange={(e) => setEditForm({ ...editForm, specs: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Link Drop / Documentation URL (Optional)
                  </label>
                  <div className="relative">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      placeholder="https://datasheet-link.com or company wiki"
                      value={editForm.link}
                      onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs border border-slate-200"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
