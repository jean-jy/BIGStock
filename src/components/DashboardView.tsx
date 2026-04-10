import React, { useState, useEffect } from 'react';
import {
  Package, Search, Filter, Edit3, ChevronLeft, ChevronRight,
  Plus, FileCheck, Download, ClipboardCheck, Warehouse,
  ArrowRightLeft, ArrowRight, CheckCircle2, CloudUpload,
  Pencil, Trash2, AlertCircle, ChevronDown, ChevronUp,
  Banknote, Receipt, MinusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';
import type { InventoryItem, ProcurementOrder, POLineItem } from '../types';
import { MOCK_INVENTORY, MOCK_AUDIT_LOGS } from '../data/mockData';
import { StatsCard } from './StatsCard';
import { StatusBadge } from './StatusBadge';

export function DashboardView({ onStartAudit, activeBranch, user }: { onStartAudit: () => void, activeBranch: string, user?: any, key?: string }) {
  const [dashTab, setDashTab] = useState<'inventory' | 'audit' | 'procurement' | 'transactions'>('inventory');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [usageForm, setUsageForm] = useState({ itemId: '', quantity: 1, remarks: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invResult, txResult] = await Promise.all([
        supabase.from('inventory').select('*').order('name'),
        supabase
          .from('inventory_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      setItems((invResult.data || []).map(i => ({ ...i, lastAudit: i.last_audit || 'Never' })));
      setTransactions(txResult.data || []);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeBranch]);

  const handleRecordUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageForm.itemId || usageForm.quantity <= 0) return;

    const item = items.find(i => i.id === usageForm.itemId);
    if (item) {
      try {
        const newTotal = Math.max(0, item.total - usageForm.quantity);
        const status = newTotal > 50 ? 'HEALTHY' : newTotal > 20 ? 'BALANCED' : 'REORDER';

        await supabase
          .from('inventory')
          .update({ total: newTotal, status, last_audit: new Date().toISOString() })
          .eq('id', item.id);

        await supabase.from('inventory_transactions').insert({
          type: 'USAGE',
          item_id: item.id,
          item_name: item.name,
          quantity: usageForm.quantity,
          unit: item.unit,
          from_location: activeBranch,
          to_location: usageForm.remarks ? `Ref: ${usageForm.remarks}` : 'Consumed / Dispensed',
          performed_by: user?.id
        });

        fetchData();
      } catch (err) {
        console.error("Error recording usage:", err);
      }
    }

    setUsageModalOpen(false);
    setUsageForm({ itemId: '', quantity: 1, remarks: '' });
  };

  const [orders, setOrders] = useState<ProcurementOrder[]>([
    {
      id: '1', poNumber: 'PO-2023-001', supplier: 'Dentcare Solutions Sdn Bhd',
      items: [
        { itemName: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', quantity: 50, unit: 'Units', unitPrice: 450.00 },
        { itemName: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', quantity: 20, unit: 'Boxes', unitPrice: 35.50 }
      ],
      totalCost: 23210.00, status: 'SUBMITTED', expectedDelivery: '2023-11-15',
      notes: 'Urgent restock — stock critical', createdAt: 'Oct 25, 2023'
    },
    {
      id: '2', poNumber: 'PO-2023-002', supplier: 'MediGlove Malaysia',
      items: [{ itemName: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', quantity: 100, unit: 'Boxes', unitPrice: 35.50 }],
      totalCost: 3550.00, status: 'RECEIVED', expectedDelivery: '2023-11-01',
      notes: 'Monthly restock order', createdAt: 'Oct 20, 2023',
      paymentStatus: 'PAID', paymentSubmittedDate: 'Oct 21, 2023', paymentPaidDate: 'Oct 22, 2023'
    },
    {
      id: '3', poNumber: 'PO-2023-003', supplier: 'ProDental Supplies',
      items: [
        { itemName: 'Alginate Impression Material', sku: 'ALG-FST-500', quantity: 30, unit: 'Packs', unitPrice: 125.00 },
        { itemName: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', quantity: 10, unit: 'Units', unitPrice: 450.00 }
      ],
      totalCost: 8250.00, status: 'DRAFT', expectedDelivery: '2023-12-01',
      notes: '', createdAt: 'Oct 26, 2023'
    }
  ]);

  const emptyLine = (): POLineItem => ({ itemName: '', sku: '', quantity: 0, unit: 'Units', unitPrice: 0 });
  const [poFormSupplier, setPoFormSupplier] = useState('');
  const [poFormDelivery, setPoFormDelivery] = useState('');
  const [poFormNotes, setPoFormNotes] = useState('');
  const [poFormLines, setPoFormLines] = useState<POLineItem[]>([emptyLine()]);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [suppliersList, setSuppliersList] = useState<string[]>(['Dentcare Solutions Sdn Bhd', 'MediGlove Malaysia', 'ProDental Supplies']);
  const [printPOId, setPrintPOId] = useState<string | null>(null);

  const nextPoNumber = editingPOId ? orders.find(o => o.id === editingPOId)?.poNumber || '' : `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;

  const updateLine = (idx: number, field: keyof POLineItem, val: string | number) => {
    setPoFormLines(poFormLines.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };
  const removeLine = (idx: number) => setPoFormLines(poFormLines.filter((_, i) => i !== idx));
  const addLine = () => setPoFormLines([...poFormLines, emptyLine()]);

  const poFormTotal = poFormLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = poFormLines.filter(l => l.itemName && l.quantity > 0);
    if (validLines.length === 0) return;

    if (editingPOId) {
      setOrders(orders.map(o => o.id === editingPOId ? {
        ...o,
        supplier: poFormSupplier,
        items: validLines,
        totalCost: validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        expectedDelivery: poFormDelivery,
        notes: poFormNotes,
      } : o));
    } else {
      const newOrder: ProcurementOrder = {
        id: Math.random().toString(36).substr(2, 9),
        poNumber: nextPoNumber,
        supplier: poFormSupplier,
        items: validLines,
        totalCost: validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        status: 'DRAFT',
        expectedDelivery: poFormDelivery,
        notes: poFormNotes,
        createdAt: new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })
      };
      setOrders([newOrder, ...orders]);
    }

    setPoFormSupplier(''); setPoFormDelivery(''); setPoFormNotes(''); setPoFormLines([emptyLine()]);
    setEditingPOId(null);
    setPoModalOpen(false);
  };

  const handleEditPO = (order: ProcurementOrder) => {
    setEditingPOId(order.id);
    setPoFormSupplier(order.supplier);
    setPoFormDelivery(order.expectedDelivery || '');
    setPoFormNotes(order.notes || '');
    setPoFormLines(order.items.length > 0 ? order.items.map(l => ({...l})) : [emptyLine()]);
    setPoModalOpen(true);
  };

  const handleClosePoModal = () => {
    setPoModalOpen(false);
    setTimeout(() => {
      setEditingPOId(null);
      setPoFormSupplier(''); setPoFormDelivery(''); setPoFormNotes(''); setPoFormLines([emptyLine()]);
    }, 200);
  };

  const updatePOStatus = (id: string, newStatus: ProcurementOrder['status']) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const handleGoodsReceived = (order: ProcurementOrder) => {
    for (const line of order.items) {
      const invItem = MOCK_INVENTORY.find(i => i.sku === line.sku);
      if (invItem) {
        invItem.total += line.quantity;
        if (invItem.total > 50) invItem.status = 'HEALTHY';
        else if (invItem.total > 20) invItem.status = 'BALANCED';
        else invItem.status = 'REORDER';
      }
    }
    const updatedOrder = { ...order, status: 'RECEIVED' as const, paymentStatus: 'UNPAID' as const };
    setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
  };

  const updatePaymentStatus = (orderId: string, status: 'PAYMENT_SUBMITTED' | 'PAID') => {
    const now = new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      if (status === 'PAYMENT_SUBMITTED') {
        return { ...o, paymentStatus: status, paymentSubmittedDate: now };
      }
      return { ...o, paymentStatus: status, paymentPaidDate: now, paymentSubmittedDate: o.paymentSubmittedDate || now };
    }));
  };

  const deletePO = (id: string) => {
    if (window.confirm('Delete this procurement order?')) {
      setOrders(orders.filter(o => o.id !== id));
    }
  };

  const prefillFromItem = (item: InventoryItem) => {
    setPoFormLines([{ itemName: item.name, sku: item.sku, quantity: 0, unit: item.unit, unitPrice: item.price || 0 }]);
    setPoModalOpen(true);
  };

  const poStatusStyles: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-600', SUBMITTED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700'
  };
  const poStatusDots: Record<string, string> = {
    DRAFT: 'bg-slate-400', SUBMITTED: 'bg-amber-500', RECEIVED: 'bg-green-500', CANCELLED: 'bg-red-500'
  };
  const paymentStatusStyles: Record<string, string> = {
    UNPAID: 'bg-red-50 text-red-600 border-red-100',
    PAYMENT_SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-100',
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  };
  const paymentStatusDots: Record<string, string> = {
    UNPAID: 'bg-red-400', PAYMENT_SUBMITTED: 'bg-amber-500', PAID: 'bg-emerald-500'
  };
  const paymentStatusLabels: Record<string, string> = {
    UNPAID: 'UNPAID', PAYMENT_SUBMITTED: 'PAYMENT SUBMITTED', PAID: 'PAID'
  };

  const totalPOValue = orders.filter(o => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.totalCost, 0);
  const pendingCount = orders.filter(o => o.status === 'SUBMITTED').length;
  const draftCount = orders.filter(o => o.status === 'DRAFT').length;

  const totalSKUs = items.length;
  const criticalStock = items.filter(item => item.status === 'REORDER').length;
  const stockValue = items.reduce((sum, item) => sum + (item.total * (item.price || 0)), 0);

  const formatStockValue = (value: number) => {
    if (value >= 1000) {
      return `RM${(value / 1000).toFixed(1)}k`;
    }
    return `RM${value.toFixed(2)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Stock Overview — {activeBranch}</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">{activeBranch === 'Main Branch' ? 'Main Master Sheet' : `${activeBranch} Branch`}</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">{activeBranch === 'Main Branch' ? 'Consolidated stock across all branches.' : `Viewing stock levels for ${activeBranch} branch.`}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
            <button className="px-4 py-2 bg-white shadow-sm rounded-md text-xs font-bold text-primary">Consolidated</button>
            <button className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-primary transition-colors">By Branch</button>
          </div>
          <button
            onClick={() => setUsageModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
          >
            <MinusCircle size={16} />
            Log Usage
          </button>
          <button
            onClick={onStartAudit}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity rounded-md"
          >
            <FileCheck size={16} />
            Start New Audit
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-white transition-colors rounded-md">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard label="Total SKUs" value={`${totalSKUs.toLocaleString()}`} subtext="Available in catalog" borderVariant="primary" />
        <StatsCard label="Critical Low Stock" value={`${criticalStock} Items`} subtext="Requires attention" borderVariant="tertiary" />
        <StatsCard label="In Transit" value="156 Units" subtext="Pending Delivery" borderVariant="secondary" />
        <StatsCard label="Stock Value" value={formatStockValue(stockValue)} subtext="Calculated total value" borderVariant="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-slate-100 mb-6">
        <button
          onClick={() => setDashTab('inventory')}
          className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'inventory' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
        >Active Inventory</button>
        <button
          onClick={() => setDashTab('audit')}
          className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'audit' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
        >Stock Audit Logs</button>
        {user?.role === 'Admin' && (
          <>
            <button
              onClick={() => setDashTab('procurement')}
              className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'procurement' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
            >Procurement Orders</button>
            <button
              onClick={() => setDashTab('transactions')}
              className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'transactions' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
            >Transaction Records</button>
          </>
        )}
      </div>

      {/* ==================== ACTIVE INVENTORY TAB ==================== */}
      {dashTab === 'inventory' && (
        <>
          <div className="bg-surface-container-low rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[300px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="w-full pl-10 pr-4 py-2.5 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-300"
                placeholder="Search by item name or SKU..."
                type="text"
              />
            </div>
            <select className="bg-white border-none rounded-lg text-xs font-bold py-2.5 px-4 focus:ring-2 focus:ring-primary/10 text-slate-700">
              <option>All Categories</option>
              <option>Surgery</option>
              <option>Consumables</option>
              <option>Prosthetics</option>
            </select>
            <button className="p-2.5 bg-white text-slate-500 rounded-lg hover:text-primary transition-colors shadow-sm">
              <Filter size={18} />
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">SKU</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Last Audit</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                    {user?.role === 'Admin' && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{item.name}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{item.subtext}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{item.category}</span>
                      </td>
                      <td className="px-6 py-5 text-xs font-mono text-slate-400">{item.sku}</td>
                      <td className={`px-6 py-5 text-sm font-bold ${item.status === 'REORDER' ? 'text-tertiary' : 'text-slate-900'}`}>{item.total}</td>
                      <td className="px-6 py-5 text-xs font-medium text-slate-500">{item.lastAudit}</td>
                      <td className="px-6 py-5">
                        <StatusBadge status={item.status} />
                      </td>
                      {user?.role === 'Admin' && (
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <button className="text-primary hover:text-primary-container transition-colors">
                              <Edit3 size={18} />
                            </button>
                            {item.status === 'REORDER' && (
                              <button
                                onClick={() => prefillFromItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all"
                                title="Create Purchase Order for this item"
                              >
                                <Plus size={11} />
                                Order
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 flex items-center justify-between border-t border-slate-50">
              <span className="text-xs text-slate-400">Showing 1 to 3 of 1,284 entries</span>
              <div className="flex gap-1">
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"><ChevronLeft size={14} /></button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-white text-xs font-bold">1</button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors text-xs font-bold">2</button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== AUDIT LOGS TAB ==================== */}
      {dashTab === 'audit' && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Stock Audit Logs</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary/5 text-primary text-xs font-bold rounded hover:bg-primary/10 transition-colors border border-primary/10">
              <Plus size={14} />
              Schedule New Audit
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Audit Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Branch</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Auditor Name</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Items Checked</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Discrepancy Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_AUDIT_LOGS.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`${log.isRecent ? 'bg-primary/5' : ''} hover:bg-slate-50/50 transition-colors ${log.mismatchedItems ? 'cursor-pointer' : ''}`}
                      onClick={() => log.mismatchedItems && setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{log.date}</span>
                          {log.isRecent && <span className="text-[9px] text-primary font-bold uppercase tracking-tighter">Recently Completed</span>}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">{log.branch}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <img src={log.auditorAvatar} alt={log.auditor} className="w-6 h-6 rounded-full object-cover" />
                          <span className="text-sm font-medium text-slate-700">{log.auditor}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-primary">{log.itemsChecked.toLocaleString()}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <StatusBadge status={log.status} />
                          {log.mismatchedItems && (
                            <button className="text-slate-400 hover:text-primary transition-colors flex shrink-0">
                              {expandedAuditId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedAuditId === log.id && log.mismatchedItems && (
                      <tr className="bg-slate-50 border-t border-slate-100/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <AlertCircle size={12} className="text-tertiary" />
                              Discrepancy Details
                            </h4>
                            <div className="space-y-3">
                              {log.mismatchedItems.map((item, idx) => {
                                const diff = item.actual - item.expected;
                                return (
                                  <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100/60 bg-slate-50/50">
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                                      <p className="text-[10px] text-slate-500 font-mono tracking-tight mt-0.5">{item.sku}</p>
                                    </div>
                                    <div className="flex items-center gap-8 text-xs">
                                      <div className="text-right">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">System Qty</p>
                                        <p className="font-semibold text-slate-600">{item.expected}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Audited Qty</p>
                                        <p className="font-bold text-slate-900">{item.actual}</p>
                                      </div>
                                      <div className="text-right min-w-[70px] bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Variance</p>
                                        <p className={`font-extrabold ${diff > 0 ? 'text-blue-600' : 'text-tertiary'}`}>{diff > 0 ? `+${diff}` : diff}</p>
                                      </div>
                                      <div className="text-right min-w-[140px] w-[200px] border-l border-slate-200 pl-6 ml-2 flex flex-col justify-center">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Auditor Remark</p>
                                        <input
                                          type="text"
                                          defaultValue={item.remark || ''}
                                          onChange={(e) => { item.remark = e.target.value; }}
                                          placeholder="Click to add remark..."
                                          className="w-full text-xs font-semibold text-slate-700 italic text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none transition-colors"
                                          title="Edit auditor remark"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== PROCUREMENT ORDERS TAB ==================== */}
      {dashTab === 'procurement' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Orders</p>
              <p className="text-2xl font-bold font-manrope">{orders.length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Pending Delivery</p>
              <p className="text-2xl font-bold font-manrope text-amber-600">{pendingCount}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Awaiting Payment</p>
              <p className="text-2xl font-bold font-manrope text-red-500">{orders.filter(o => o.status === 'RECEIVED' && o.paymentStatus && o.paymentStatus !== 'PAID').length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total PO Value</p>
              <p className="text-2xl font-bold font-manrope text-primary">RM{totalPOValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Purchase Orders</h3>
            <button
              onClick={() => setPoModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
            >
              <Plus size={16} />
              New Purchase Order
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">PO Number</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Supplier</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Items</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Total (RM)</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Payment</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map((o) => (
                    <React.Fragment key={o.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setExpandedPO(expandedPO === o.id ? null : o.id)}>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-primary font-mono">{o.poNumber}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{o.createdAt}</p>
                        </td>
                        <td className="px-6 py-5 text-xs font-medium text-slate-600 max-w-[160px]">{o.supplier}</td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-slate-900">{o.items.length}</span>
                          <span className="text-[10px] text-slate-400 ml-1">{o.items.length === 1 ? 'item' : 'items'}</span>
                        </td>
                        <td className="px-6 py-5 text-sm font-bold text-slate-900">RM{o.totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 text-xs text-slate-500">{o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${poStatusStyles[o.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${poStatusDots[o.status]}`}></span>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {o.status === 'RECEIVED' && o.paymentStatus ? (
                            <div>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${paymentStatusStyles[o.paymentStatus]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${paymentStatusDots[o.paymentStatus]}`}></span>
                                {paymentStatusLabels[o.paymentStatus]}
                              </span>
                              {o.paymentSubmittedDate && (
                                <p className="text-[9px] text-slate-400 mt-1.5">Submitted: <span className="font-bold text-slate-600">{o.paymentSubmittedDate}</span></p>
                              )}
                              {o.paymentPaidDate && (
                                <p className="text-[9px] text-slate-400 mt-0.5">Paid: <span className="font-bold text-emerald-600">{o.paymentPaidDate}</span></p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {o.status === 'DRAFT' && (
                              <>
                                <button onClick={() => updatePOStatus(o.id, 'SUBMITTED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all">
                                  <CloudUpload size={11} /> Submit
                                </button>
                                <button onClick={() => handleEditPO(o)}
                                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="Edit Draft">
                                  <Pencil size={13} />
                                </button>
                              </>
                            )}
                            {o.status === 'SUBMITTED' && (
                              <button onClick={() => handleGoodsReceived(o)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-[10px] font-bold rounded-full hover:bg-green-600 transition-all shadow-sm active:scale-95">
                                <CheckCircle2 size={12} /> Goods Received
                              </button>
                            )}
                            {o.status === 'RECEIVED' && o.paymentStatus !== 'PAID' && (
                              <>
                                {(!o.paymentStatus || o.paymentStatus === 'UNPAID') && (
                                  <button onClick={() => updatePaymentStatus(o.id, 'PAYMENT_SUBMITTED')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all active:scale-95">
                                    <Receipt size={11} /> Payment Submitted
                                  </button>
                                )}
                                <button onClick={() => updatePaymentStatus(o.id, 'PAID')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95">
                                  <CheckCircle2 size={11} /> Payment Done
                                </button>
                              </>
                            )}
                            {(o.status === 'SUBMITTED' || o.status === 'RECEIVED') && (
                              <button onClick={() => setPrintPOId(o.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full border border-slate-200 hover:bg-slate-200 transition-all shadow-sm tracking-tight">
                                <Download size={11} /> Export PO
                              </button>
                            )}
                            {(o.status === 'DRAFT' || o.status === 'SUBMITTED') && (
                              <button onClick={() => updatePOStatus(o.id, 'CANCELLED')}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Cancel Order">
                                <Plus size={14} className="rotate-45" />
                              </button>
                            )}
                            <button onClick={() => deletePO(o.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedPO === o.id && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/80 px-6 py-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Line Items</p>
                            <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="border-b border-slate-100">
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Item</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">SKU</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Qty</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Unit Price</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {o.items.map((line, li) => (
                                    <tr key={li}>
                                      <td className="px-4 py-2.5 text-xs font-bold text-slate-800">{line.itemName}</td>
                                      <td className="px-4 py-2.5 text-[10px] font-mono text-slate-400">{line.sku}</td>
                                      <td className="px-4 py-2.5 text-xs font-bold">{line.quantity} <span className="text-slate-400 font-normal">{line.unit}</span></td>
                                      <td className="px-4 py-2.5 text-xs text-slate-600">RM{line.unitPrice.toFixed(2)}</td>
                                      <td className="px-4 py-2.5 text-xs font-bold text-primary">RM{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {o.notes && <p className="text-[10px] text-slate-500 mt-2"><span className="font-bold">Notes:</span> {o.notes}</p>}
                            {o.paymentStatus && (
                              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Banknote size={12} /> Payment Record</p>
                                <div className="flex items-center gap-4 flex-wrap">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${paymentStatusStyles[o.paymentStatus]}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${paymentStatusDots[o.paymentStatus]}`}></span>
                                    {paymentStatusLabels[o.paymentStatus]}
                                  </span>
                                  {o.paymentSubmittedDate && <span className="text-[10px] text-slate-500">Submitted: <span className="font-bold">{o.paymentSubmittedDate}</span></span>}
                                  {o.paymentPaidDate && <span className="text-[10px] text-slate-500">Paid: <span className="font-bold text-emerald-600">{o.paymentPaidDate}</span></span>}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                        <Package size={40} className="mx-auto mb-3 text-slate-200" />
                        <p className="text-sm font-bold">No procurement orders yet</p>
                        <p className="text-xs mt-1">Create your first purchase order to start tracking supplier orders.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Inventory + Audit tabs: Bottom Grid */}
      {dashTab !== 'procurement' && (
        <>
          {dashTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="col-span-1 md:col-span-2 bg-surface-container-low p-6 rounded-2xl relative overflow-hidden">
                <h4 className="text-lg font-manrope font-bold text-slate-900 mb-4">Branch Distribution Trend</h4>
                <div className="h-48 w-full flex items-end gap-4 px-2 relative z-10">
                  {[
                    { name: 'Kepong', val: 34 },
                    { name: 'Jadehills', val: 42 },
                    { name: 'Setiawalk', val: 24 }
                  ].map((branch) => (
                    <div key={branch.name} className="flex-1 bg-primary/10 rounded-t-lg relative group">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white text-[10px] px-2 py-1 rounded">{branch.val}%</div>
                      <div
                        className="bg-primary-container w-full rounded-t-lg transition-all duration-1000"
                        style={{ height: `${branch.val}%` }}
                      ></div>
                      <p className="text-[10px] font-bold text-center mt-2 text-slate-600">{branch.name}</p>
                    </div>
                  ))}
                </div>
                <div className="absolute right-[-5%] bottom-[-5%] w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-manrope font-bold text-slate-900">Recent Activity</h4>
                  <button className="text-[10px] text-primary uppercase font-bold tracking-tighter">View All</button>
                </div>
                <div className="space-y-4">
                  {transactions.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        activity.type === 'audit' ? 'bg-blue-50 text-blue-600' :
                        activity.type === 'STOCK_IN' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {activity.type === 'audit' ? <FileCheck size={14} /> :
                         activity.type === 'STOCK_IN' ? <Warehouse size={14} /> : <ArrowRightLeft size={14} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{activity.type === 'USAGE' ? `Used ${activity.quantity} ${activity.unit}` : activity.type} - {activity.item_name}</p>
                        <p className="text-[10px] text-slate-400">{activity.from_location} • {new Date(activity.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4">
        <button
          onClick={onStartAudit}
          className="w-12 h-12 bg-white text-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all group relative border border-slate-100"
        >
          <ClipboardCheck size={20} />
          <span className="absolute right-full mr-3 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Quick Audit</span>
        </button>
        {user?.role === 'Admin' && (
          <button
            onClick={() => setPoModalOpen(true)}
            className="w-14 h-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={28} />
          </button>
        )}
      </div>

      {/* ==================== CREATE PO MODAL ==================== */}
      <AnimatePresence>
        {poModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClosePoModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Package size={16} className="text-primary" />
                      </div>
                      <h3 className="text-xl font-manrope font-extrabold text-slate-900">{editingPOId ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
                    </div>
                    <p className="text-xs text-slate-500">PO Number: <span className="font-mono font-bold text-primary">{nextPoNumber}</span></p>
                  </div>
                  <button type="button" onClick={handleClosePoModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Plus size={24} className="rotate-45" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreatePO} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Supplier Name *</label>
                    <div className="flex items-center gap-2">
                      <select required value={poFormSupplier} onChange={e => setPoFormSupplier(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all text-slate-700 font-semibold"
                      >
                        <option value="">Select Supplier...</option>
                        {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const newSup = window.prompt("Enter new supplier name:");
                        if (newSup && newSup.trim() && !suppliersList.includes(newSup.trim())) {
                          setSuppliersList([...suppliersList, newSup.trim()]);
                          setPoFormSupplier(newSup.trim());
                        }
                      }} className="w-10 h-10 flex shrink-0 items-center justify-center bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors" title="Add New Supplier">
                        <Plus size={16} />
                      </button>
                      {poFormSupplier && (
                        <button type="button" onClick={() => {
                          if (window.confirm(`Delete supplier "${poFormSupplier}" from list?`)) {
                            setSuppliersList(suppliersList.filter(s => s !== poFormSupplier));
                            setPoFormSupplier('');
                          }
                        }} className="w-10 h-10 flex shrink-0 items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Remove Supplier">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Expected Delivery</label>
                    <input type="date" value={poFormDelivery} onChange={e => setPoFormDelivery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Line Items *</label>
                    <button type="button" onClick={addLine}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/5 text-primary text-[10px] font-bold rounded-full border border-primary/10 hover:bg-primary/10 transition-all">
                      <Plus size={11} /> Add Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {poFormLines.map((line, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Item {idx + 1}</span>
                          {poFormLines.length > 1 && (
                            <button type="button" onClick={() => removeLine(idx)}
                              className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <div className="col-span-2">
                            <input required value={line.itemName} onChange={e => updateLine(idx, 'itemName', e.target.value)}
                              className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                              placeholder="Item Name *" />
                          </div>
                          <input value={line.sku} onChange={e => updateLine(idx, 'sku', e.target.value)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="SKU" />
                          <input type="number" min="1" required value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="Qty *" />
                          <input type="number" step="0.01" required value={line.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="RM Price *" />
                        </div>
                        {line.quantity > 0 && line.unitPrice > 0 && (
                          <p className="text-[10px] text-primary font-bold mt-1.5 text-right">Subtotal: RM{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes (Optional)</label>
                  <textarea value={poFormNotes} onChange={e => setPoFormNotes(e.target.value)} rows={2}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                    placeholder="e.g. Urgent restock, preferred brand..." />
                </div>

                {poFormTotal > 0 && (
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-600">Order Total ({poFormLines.filter(l => l.quantity > 0).length} items)</p>
                      <p className="text-lg font-extrabold text-primary">RM{poFormTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={handleClosePoModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit"
                    className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <Package size={16} /> {editingPOId ? 'Save Draft' : 'Create PO (Draft)'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      {/* ==================== TRANSACTION RECORDS TAB ==================== */}
      {dashTab === 'transactions' && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Transaction & Activity Records</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded hover:bg-slate-50 transition-colors shadow-sm">
              <Download size={14} />
              Export Log
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date & Time</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Quantity</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Details (Route/User)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5 text-sm font-semibold text-slate-700">{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md ${
                        tx.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' :
                        tx.type === 'TRANSFER' ? 'bg-blue-50 text-blue-700' :
                        tx.type === 'USAGE' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {tx.type === 'STOCK_IN' && <Package size={12} />}
                        {tx.type === 'TRANSFER' && <ArrowRightLeft size={12} />}
                        {tx.type === 'USAGE' && <MinusCircle size={12} />}
                        {tx.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{tx.item_name}</td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-extrabold ${tx.type === 'STOCK_IN' ? 'text-green-600' : tx.type === 'USAGE' ? 'text-orange-600' : 'text-blue-600'}`}>
                        {tx.type === 'USAGE' ? '-' : '+'}{tx.quantity} {tx.unit}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col text-xs text-slate-500 leading-snug">
                        <span className="font-semibold">{tx.from_location} {tx.to_location && <><ArrowRight className="inline mx-1 text-slate-300" size={10} /> {tx.to_location}</>}</span>
                        <span>User: {tx.performed_by || 'System'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">No recent transactions recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </AnimatePresence>

      {/* ==================== PRINT PO MODAL ==================== */}
      <AnimatePresence>
        {printPOId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPrintPOId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:rounded-none"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
                <h3 className="text-sm font-bold text-slate-800">Purchase Order Preview</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()} className="flex items-center gap-1 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90"><Download size={14} /> Print / Save PDF</button>
                  <button onClick={() => setPrintPOId(null)} className="p-2 text-slate-400 hover:text-slate-600"><Plus size={16} className="rotate-45" /></button>
                </div>
              </div>
              {(() => {
                const o = orders.find(ord => ord.id === printPOId);
                if (!o) return null;
                return (
                  <div className="p-8 print:p-4">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h2 className="text-2xl font-manrope font-extrabold text-slate-900 tracking-tight">PURCHASE ORDER</h2>
                        <p className="text-primary font-mono font-bold text-lg mt-1">{o.poNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">BIG DENTAL CLINIC</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">123, Jalan Dental, 43000 Kajang</p>
                        <p className="text-[10px] text-slate-500">Selangor, Malaysia</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-8 mb-8 p-4 bg-slate-50 rounded-xl print:bg-transparent print:p-0">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Supplier</p>
                        <p className="text-sm font-bold text-slate-900">{o.supplier}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Expected Delivery</p>
                        <p className="text-sm font-bold text-slate-900">{o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order Date</p>
                        <p className="text-sm font-bold text-slate-900">{o.createdAt}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${poStatusStyles[o.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${poStatusDots[o.status]}`}></span>
                          {o.status}
                        </span>
                      </div>
                    </div>
                    <div className="mb-6">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-800">
                            <th className="py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Item</th>
                            <th className="py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Qty</th>
                            <th className="py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Unit Price (RM)</th>
                            <th className="py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Subtotal (RM)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {o.items.map((line, li) => (
                            <tr key={li}>
                              <td className="py-3">
                                <p className="font-bold text-sm text-slate-900">{line.itemName}</p>
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{line.sku}</p>
                              </td>
                              <td className="py-3 text-center text-sm font-semibold">{line.quantity} <span className="text-[10px] text-slate-400 font-normal">{line.unit}</span></td>
                              <td className="py-3 text-right text-sm text-slate-600">{line.unitPrice.toFixed(2)}</td>
                              <td className="py-3 text-right text-sm font-bold text-slate-900">{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-800 bg-slate-50/50 print:bg-transparent">
                            <td colSpan={3} className="py-4 text-right font-extrabold text-sm text-slate-700 uppercase tracking-wider pr-4">Total Amount</td>
                            <td className="py-4 text-right font-extrabold text-xl text-primary">RM{o.totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {o.notes && (
                      <div className="mt-8 pt-4 border-t border-slate-200 bg-slate-50/50 p-4 rounded-xl print:bg-transparent print:p-0 print:mt-10">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes / Instructions</p>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed">{o.notes}</p>
                      </div>
                    )}

                    <div className="mt-20 pt-8 border-t border-slate-200 flex justify-between align-end">
                      <div className="text-center">
                        <div className="w-48 border-b-2 border-slate-300 pb-2 mb-2"></div>
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Authorized Signature</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== RECORD USAGE MODAL ==================== */}
      <AnimatePresence>
        {usageModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setUsageModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col print:hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-teal-50/50">
                <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2"><MinusCircle size={16} className="text-teal-600"/> Record Stock Usage</h3>
                <button type="button" onClick={() => setUsageModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg focus:outline-none"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={handleRecordUsage} className="p-6 space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Item Consumed</label>
                  <select
                    required
                    value={usageForm.itemId}
                    onChange={(e) => setUsageForm({...usageForm, itemId: e.target.value})}
                    className="w-full pl-3 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
                  >
                    <option value="" disabled>Select an item...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.total} {item.unit} available)</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Quantity Used</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={usageForm.quantity}
                      onChange={(e) => setUsageForm({...usageForm, quantity: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Remarks / Patient Ref (Optional)</label>
                  <textarea
                    value={usageForm.remarks}
                    onChange={(e) => setUsageForm({...usageForm, remarks: e.target.value})}
                    rows={2}
                    placeholder="e.g. For patient John Doe (Surgery)"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all resize-none"
                  ></textarea>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setUsageModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:opacity-90 transition-all text-sm">Save Usage</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
