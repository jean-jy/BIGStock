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
import type { InventoryItem, ProcurementOrder, POLineItem, AuditLog } from '../types';
import { StatsCard } from './StatsCard';
import { StatusBadge } from './StatusBadge';
import { Pagination } from './Pagination';

/** Normalize a category string to Title Case so that "CLEANING", "cleaning", "Cleaning" all become "Cleaning" */
function normalizeCategory(cat: string): string {
  if (!cat) return cat;
  return cat
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function DashboardView({ onStartAudit, activeBranch, user }: { onStartAudit: () => void, activeBranch: string, user?: any, key?: string }) {
  const [dashTab, setDashTab] = useState<'inventory' | 'audit' | 'procurement' | 'transactions'>('inventory');
  const [activeItemType, setActiveItemType] = useState<'All' | 'Stock' | 'Asset'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagForm, setFlagForm] = useState({ itemId: '', remark: '' });
  const [flaggedItemName, setFlaggedItemName] = useState('');
  const [usageForm, setUsageForm] = useState({ itemId: '', quantity: 1, remarks: '' });
  const [auditLogs, setAuditLogs] = useState<(AuditLog & { mismatchedItems?: any[] })[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [viewType, setViewType] = useState<'consolidated' | 'branch'>('branch');
  const [branchInventory, setBranchInventory] = useState<Record<string, { qty: number; flagged: boolean }>>({});
  const [consolidatedQty, setConsolidatedQty] = useState<Record<string, number>>({});
  const [approvingAuditId, setApprovingAuditId] = useState<string | null>(null);
  const [restockByBranch, setRestockByBranch] = useState<Record<string, { name: string; items: { id: string; name: string; sku: string; category: string; current: number; minStock: number; unit: string; flagged: boolean; belowMin: boolean }[] }>>({});
  const [restockCollapsed, setRestockCollapsed] = useState(false);

  useEffect(() => {
    // Default to consolidated if 'Main Branch' is selected AND user is Admin/Manager, otherwise 'branch'
    if (activeBranch === 'Main Branch' && (user?.role === 'Admin' || user?.role === 'Branch Manager')) {
      setViewType('consolidated');
    } else {
      setViewType('branch');
    }
  }, [activeBranch, user?.role]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invResult, txResult, auditResult, poResult, supplierResult, branchResult, branchInvResult, allBranchInvResult] = await Promise.all([
        supabase.from('inventory').select('*').order('category').order('name').limit(5000),
        supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('audit_logs').select('*, audit_mismatches(*)').order('created_at', { ascending: false }),
        supabase.from('procurement_orders').select('*, procurement_order_items(*)').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('name').order('name'),
        supabase.from('branches').select('*').order('name'),
        supabase.from('branch_inventory').select('item_id, quantity, is_reorder_flagged').eq('branch_id', activeBranch),
        supabase.from('branch_inventory').select('item_id, quantity, branch_id, is_reorder_flagged')
      ]);

      setAllBranches(branchResult.data || []);

      // Compute restock needs per branch (low stock OR manually flagged)
      const itemMap = new Map((invResult.data || []).map((i: any) => [i.id, i]));
      const branchNameMap = new Map((branchResult.data || []).map((b: any) => [b.id, b.name || b.id]));
      const restock: Record<string, { name: string; items: any[] }> = {};
      for (const row of allBranchInvResult.data || []) {
        const item = itemMap.get(row.item_id);
        if (!item) continue;
        const minStock = item.min_stock || 20;
        const isBelowMin = row.quantity < minStock;
        const isFlagged = !!row.is_reorder_flagged;
        if (!isBelowMin && !isFlagged) continue;
        if (!restock[row.branch_id]) restock[row.branch_id] = { name: branchNameMap.get(row.branch_id) || row.branch_id, items: [] };
        restock[row.branch_id].items.push({ id: item.id, name: item.name, sku: item.sku, category: normalizeCategory(item.category || ''), current: row.quantity, minStock, unit: item.unit || 'Units', flagged: isFlagged, belowMin: isBelowMin });
      }
      Object.values(restock).forEach(b => b.items.sort((a, b) => a.current - b.current));
      setRestockByBranch(restock);

      // Map branch inventory to a lookup object
      const binv: Record<string, { qty: number; flagged: boolean }> = {};
      (branchInvResult.data || []).forEach((row: any) => {
        binv[row.item_id] = { qty: row.quantity, flagged: !!row.is_reorder_flagged };
      });
      setBranchInventory(binv);

      // Compute consolidated totals by summing all branch quantities per item
      const cqty: Record<string, number> = {};
      (allBranchInvResult.data || []).forEach((row: any) => {
        cqty[row.item_id] = (cqty[row.item_id] || 0) + (row.quantity || 0);
      });
      setConsolidatedQty(cqty);

      setItems((invResult.data || []).map(i => ({ ...i, category: normalizeCategory(i.category || ''), lastAudit: i.last_audit ? new Date(i.last_audit).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never' })));
      setTransactions(txResult.data || []);

      // Map audit logs
      setAuditLogs((auditResult.data || []).map(log => ({
        id: log.id,
        date: log.date,
        branch: log.branch,
        auditor: log.auditor,
        auditorAvatar: log.auditor_avatar || '',
        itemsChecked: log.items_checked,
        status: log.status,
        approvalStatus: log.approval_status,
        approvedByName: log.approved_by_name,
        approvedAt: log.approved_at,
        isRecent: log.is_recent,
        mismatchedItems: log.audit_mismatches?.length > 0 ? log.audit_mismatches.map((m: any) => ({
          id: m.item_id,
          name: m.name,
          sku: m.sku,
          expected: m.expected,
          actual: m.actual,
          remark: m.remark
        })) : undefined
      })));

      // Map procurement orders
      const mappedOrders: ProcurementOrder[] = (poResult.data || []).map(po => ({
        id: po.id,
        poNumber: po.po_number,
        supplier: po.supplier,
        items: (po.procurement_order_items || []).map((li: any) => ({
          itemName: li.item_name,
          sku: li.sku,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: Number(li.unit_price)
        })),
        totalCost: Number(po.total_cost),
        status: po.status,
        branchId: po.branch_id,
        expectedDelivery: po.expected_delivery || '',
        notes: po.notes || '',
        createdAt: new Date(po.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }),
        paymentStatus: po.payment_status || undefined,
        paymentSubmittedDate: po.payment_submitted_date ? new Date(po.payment_submitted_date).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
        paymentPaidDate: po.payment_paid_date ? new Date(po.payment_paid_date).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
      }));
      setOrders(mappedOrders);

      // Map suppliers
      setSuppliersList((supplierResult.data || []).map(s => s.name));
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

        // SYNC: Update branch_inventory for the specific branch
        const { data: biRow } = await supabase
          .from('branch_inventory')
          .select('id, quantity')
          .eq('branch_id', activeBranch)
          .eq('item_id', item.id)
          .maybeSingle();

        if (biRow) {
          await supabase
            .from('branch_inventory')
            .update({ quantity: Math.max(0, biRow.quantity - usageForm.quantity) })
            .eq('id', biRow.id);
        } else {
          // If for some reason it's not in the branch list, we assume it started with what was in the master list
          await supabase
            .from('branch_inventory')
            .insert({ 
              branch_id: activeBranch, 
              item_id: item.id, 
              quantity: Math.max(0, (item as any).branchStock?.[activeBranch] || 0) - usageForm.quantity 
            });
        }

        await supabase.from('inventory_transactions').insert({
          type: 'USAGE',
          item_id: item.id,
          item_name: item.name,
          quantity: usageForm.quantity,
          unit: item.unit,
          from_location: activeBranch,
          to_location: 'Consumed / Dispensed',
          remarks: usageForm.remarks,
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

  const handleSubmitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagForm.itemId) return;
    
    try {
      await supabase
        .from('inventory')
        .update({ 
          is_reorder_flagged: true, 
          reorder_flag_remark: flagForm.remark 
        })
        .eq('id', flagForm.itemId);
        
      alert('Item successfully flagged for reorder!');
      fetchData();
    } catch (err) {
      console.error('Error flagging item:', err);
    }
    setFlagModalOpen(false);
    setFlagForm({ itemId: '', remark: '' });
  };

  const handleUnflag = async (itemId: string) => {
    if (user?.role === 'Staff') return; // Only Admin or Manager can resolve flag
    if (window.confirm('Mark this reorder request as resolved/cleared?')) {
      try {
        await supabase
          .from('inventory')
          .update({ 
            is_reorder_flagged: false, 
            reorder_flag_remark: null 
          })
          .eq('id', itemId);
        fetchData();
      } catch (err) {
        console.error('Error clearing flag:', err);
      }
    }
  };

  const [orders, setOrders] = useState<ProcurementOrder[]>([]);

  const emptyLine = (): POLineItem => ({ itemName: '', sku: '', quantity: 0, unit: 'Units', unitPrice: 0 });
  const [poFormSupplier, setPoFormSupplier] = useState('');
  const [poFormDelivery, setPoFormDelivery] = useState('');
  const [poFormNotes, setPoFormNotes] = useState('');
  const [poFormLines, setPoFormLines] = useState<POLineItem[]>([emptyLine()]);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [suppliersList, setSuppliersList] = useState<string[]>([]);
  const [printPOId, setPrintPOId] = useState<string | null>(null);

  const nextPoNumber = editingPOId ? orders.find(o => o.id === editingPOId)?.poNumber || '' : `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;

  const updateLine = (idx: number, field: keyof POLineItem, val: string | number) => {
    setPoFormLines(poFormLines.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };
  const removeLine = (idx: number) => setPoFormLines(poFormLines.filter((_, i) => i !== idx));
  const addLine = () => setPoFormLines([...poFormLines, emptyLine()]);

  const poFormTotal = poFormLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = poFormLines.filter(l => l.itemName && l.quantity > 0);
    if (validLines.length === 0) return;

    const totalCost = validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

    try {
      if (editingPOId) {
        await supabase.from('procurement_orders').update({
          supplier: poFormSupplier,
          total_cost: totalCost,
          expected_delivery: poFormDelivery || null,
          notes: poFormNotes,
          updated_at: new Date().toISOString()
        }).eq('id', editingPOId);

        // Delete old line items and re-insert
        await supabase.from('procurement_order_items').delete().eq('order_id', editingPOId);
        await supabase.from('procurement_order_items').insert(
          validLines.map(l => ({ order_id: editingPOId, item_name: l.itemName, sku: l.sku, quantity: l.quantity, unit: l.unit, unit_price: l.unitPrice }))
        );
      } else {
        const { data: newPO, error } = await supabase.from('procurement_orders').insert({
          po_number: nextPoNumber,
          branch_id: activeBranch !== 'Main Branch' ? activeBranch : 'Kepong', // Default to Kepong for HQ orders
          supplier: poFormSupplier,
          total_cost: totalCost,
          status: 'DRAFT',
          expected_delivery: poFormDelivery || null,
          notes: poFormNotes,
        }).select('id').single();

        if (error) throw error;

        await supabase.from('procurement_order_items').insert(
          validLines.map(l => ({ order_id: newPO.id, item_name: l.itemName, sku: l.sku, quantity: l.quantity, unit: l.unit, unit_price: l.unitPrice }))
        );
      }

      fetchData();
    } catch (err) {
      console.error('Error saving PO:', err);
      alert('Failed to save purchase order');
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

  const updatePOStatus = async (id: string, newStatus: ProcurementOrder['status']) => {
    try {
      await supabase.from('procurement_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
      fetchData();
    } catch (err) {
      console.error('Error updating PO status:', err);
    }
  };

  const handleGoodsReceived = async (order: ProcurementOrder) => {
    const targetBranch = activeBranch === 'Main Branch' ? (order.branchId || allBranches[0]?.id) : activeBranch;
    try {
      for (const line of order.items) {
        const invItem = items.find(i => i.sku === line.sku);
        if (!invItem) continue;

        const newTotal = invItem.total + line.quantity;
        const status = newTotal > 50 ? 'HEALTHY' : newTotal > 20 ? 'BALANCED' : 'REORDER';
        await supabase.from('inventory').update({ total: newTotal, status, last_audit: new Date().toISOString() }).eq('id', invItem.id);

        // Update branch_inventory for the receiving branch
        const { data: biRow } = await supabase.from('branch_inventory').select('id, quantity').eq('branch_id', targetBranch).eq('item_id', invItem.id).maybeSingle();
        if (biRow) {
          await supabase.from('branch_inventory').update({ quantity: biRow.quantity + line.quantity }).eq('id', biRow.id);
        } else {
          await supabase.from('branch_inventory').insert({ branch_id: targetBranch, item_id: invItem.id, quantity: line.quantity });
        }

        await supabase.from('inventory_transactions').insert({
          type: 'STOCK_IN',
          item_id: invItem.id,
          item_name: invItem.name,
          quantity: line.quantity,
          unit: line.unit,
          from_location: `PO: ${order.poNumber} (${order.supplier})`,
          to_location: targetBranch,
          performed_by: user?.id
        });
      }

      await supabase.from('procurement_orders').update({ status: 'RECEIVED', payment_status: 'UNPAID', updated_at: new Date().toISOString() }).eq('id', order.id);
      fetchData();
    } catch (err) {
      console.error('Error receiving goods:', err);
    }
  };

  const updatePaymentStatus = async (orderId: string, status: 'PAYMENT_SUBMITTED' | 'PAID') => {
    try {
      const updates: any = { payment_status: status, updated_at: new Date().toISOString() };
      if (status === 'PAYMENT_SUBMITTED') {
        updates.payment_submitted_date = new Date().toISOString();
      } else {
        updates.payment_paid_date = new Date().toISOString();
      }
      await supabase.from('procurement_orders').update(updates).eq('id', orderId);
      fetchData();
    } catch (err) {
      console.error('Error updating payment status:', err);
    }
  };

  const deletePO = async (id: string) => {
    if (window.confirm('Delete this procurement order?')) {
      try {
        await supabase.from('procurement_orders').delete().eq('id', id);
        fetchData();
      } catch (err) {
        console.error('Error deleting PO:', err);
      }
    }
  };

  const handleApproveAudit = async (log: AuditLog) => {
    if (approvingAuditId) return;
    setApprovingAuditId(log.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const approverName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Admin';

      // 1. Use already-loaded mismatch items; fall back to DB query if missing
      let mismatches: { id: string; name: string; expected: number; actual: number }[] = [];
      const loadedItems = (log.mismatchedItems || []).filter(m => m.id);
      if (loadedItems.length > 0) {
        mismatches = loadedItems.map(m => ({ id: m.id, name: m.name, expected: m.expected, actual: m.actual }));
      } else {
        const { data: rows, error: fetchErr } = await supabase
          .from('audit_mismatches')
          .select('*')
          .eq('audit_log_id', log.id);
        if (fetchErr) throw fetchErr;
        mismatches = (rows || [])
          .filter((m: any) => m.item_id)
          .map((m: any) => ({
            id: m.item_id as string,
            name: m.name as string,
            expected: m.expected as number,
            actual: m.actual as number,
          }));
      }

      const branchId = log.branch.replace(/ Branch$/, '');

      // 2. Batch upsert branch_inventory
      if (mismatches.length > 0) {
        const { error: upsertErr } = await supabase.from('branch_inventory').upsert(
          mismatches.map(m => ({ item_id: m.id, branch_id: branchId, quantity: m.actual })),
          { onConflict: 'item_id,branch_id' }
        );
        if (upsertErr) throw upsertErr;
      }

      // 3. Re-fetch all branch quantities for affected items to compute correct totals
      const itemIds = mismatches.map(m => m.id);
      const { data: allBranchRows, error: branchFetchErr } = itemIds.length > 0
        ? await supabase.from('branch_inventory').select('item_id, quantity').in('item_id', itemIds)
        : { data: [], error: null };
      if (branchFetchErr) throw branchFetchErr;

      const totalByItem: Record<string, number> = {};
      for (const row of allBranchRows || []) {
        totalByItem[row.item_id] = (totalByItem[row.item_id] || 0) + (row.quantity || 0);
      }

      // 4. Batch insert adjustment transactions
      if (mismatches.length > 0) {
        const { error: txErr } = await supabase.from('inventory_transactions').insert(
          mismatches.map(m => ({
            type: 'ADJUSTMENT',
            item_id: m.id,
            item_name: m.name,
            quantity: m.actual - m.expected,
            unit: 'Units',
            from_location: 'Stock Audit',
            to_location: branchId,
            remarks: `Audit approval by ${approverName}`,
            performed_by: session?.user?.id
          }))
        );
        if (txErr) throw txErr;
      }

      // 5. Parallel inventory updates — throw if any fail
      if (mismatches.length > 0) {
        const updateResults = await Promise.all(
          mismatches.map(item => {
            const newTotal = totalByItem[item.id] ?? item.actual;
            const status = newTotal > 50 ? 'HEALTHY' : newTotal > 20 ? 'BALANCED' : 'REORDER';
            return supabase.from('inventory').update({
              total: newTotal, status, last_audit: new Date().toISOString()
            }).eq('id', item.id);
          })
        );
        const failedUpdates = updateResults.filter(r => r.error);
        if (failedUpdates.length > 0) throw failedUpdates[0].error;
      }

      // 6. Mark audit approved — only reached if all data updates succeeded
      const { error: approveErr } = await supabase.from('audit_logs').update({
        approval_status: 'APPROVED',
        approved_by_name: approverName,
        approved_at: new Date().toISOString()
      }).eq('id', log.id);
      if (approveErr) throw approveErr;

      alert(`Audit approved — ${mismatches.length} item(s) updated for ${branchId}.`);
      fetchData();
    } catch (err) {
      console.error('Error approving audit:', err);
      alert('Failed to approve audit. Check the browser console for the exact error.');
    } finally {
      setApprovingAuditId(null);
    }
  };

  const handleResyncAuditData = async (log: AuditLog) => {
    if (approvingAuditId) return;
    setApprovingAuditId(log.id);
    try {
      const mismatches = (log.mismatchedItems || []).filter(m => m.id)
        .map(m => ({ id: m.id, name: m.name, expected: m.expected, actual: m.actual }));
      if (mismatches.length === 0) {
        alert('No mismatch data found for this audit. Cannot re-sync.');
        return;
      }
      const branchId = log.branch.replace(/ Branch$/, '');

      const { error: upsertErr } = await supabase.from('branch_inventory').upsert(
        mismatches.map(m => ({ item_id: m.id, branch_id: branchId, quantity: m.actual })),
        { onConflict: 'item_id,branch_id' }
      );
      if (upsertErr) throw upsertErr;

      const itemIds = mismatches.map(m => m.id);
      const { data: allBranchRows, error: branchFetchErr } = await supabase
        .from('branch_inventory').select('item_id, quantity').in('item_id', itemIds);
      if (branchFetchErr) throw branchFetchErr;

      const totalByItem: Record<string, number> = {};
      for (const row of allBranchRows || []) {
        totalByItem[row.item_id] = (totalByItem[row.item_id] || 0) + (row.quantity || 0);
      }

      const updateResults = await Promise.all(
        mismatches.map(item => {
          const newTotal = totalByItem[item.id] ?? item.actual;
          const status = newTotal > 50 ? 'HEALTHY' : newTotal > 20 ? 'BALANCED' : 'REORDER';
          return supabase.from('inventory').update({
            total: newTotal, status, last_audit: new Date().toISOString()
          }).eq('id', item.id);
        })
      );
      const failedUpdates = updateResults.filter(r => r.error);
      if (failedUpdates.length > 0) throw failedUpdates[0].error;

      alert(`Re-sync complete — ${mismatches.length} item(s) updated for ${branchId}.`);
      fetchData();
    } catch (err) {
      console.error('Error re-syncing audit data:', err);
      alert('Re-sync failed. Check the browser console for details.');
    } finally {
      setApprovingAuditId(null);
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
  const criticalStock = items.filter(item => {
    const qty = viewType === 'consolidated' ? (consolidatedQty[item.id] ?? 0) : (branchInventory[item.id]?.qty ?? 0);
    return qty < (item.min_stock || 20);
  }).length;
  const stockValue = items.reduce((sum, item) => {
    const qty = viewType === 'consolidated' ? (consolidatedQty[item.id] ?? 0) : (branchInventory[item.id]?.qty ?? 0);
    return sum + (qty * (item.price || 0));
  }, 0);

  const isAdmin = user?.role === 'Admin';
  const tdCls = isAdmin ? 'px-4 py-2' : 'px-6 py-5';

  const displayItems = items.filter(item => {
    const iType = item.item_type || 'Stock';
    if (user?.role === 'Staff' && iType === 'Asset') return false;
    return activeItemType === 'All' || iType === activeItemType;
  }).sort((a, b) => {
    const catCmp = (a.category || '').localeCompare(b.category || '');
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });
  const totalPages = Math.ceil(displayItems.length / PAGE_SIZE);
  const paginatedItems = isAdmin ? displayItems : displayItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [activeItemType]);

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setEditModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const alertLevel = editingItem.min_stock || 20;
      const currentQty = editingItem.total;
      const calcStatus = currentQty < alertLevel ? 'REORDER' : (currentQty < alertLevel * 2 ? 'BALANCED' : 'HEALTHY');

      const { error } = await supabase
        .from('inventory')
        .update({
          name: editingItem.name,
          sku: editingItem.sku,
          category: editingItem.category,
          subtext: editingItem.subtext,
          unit: editingItem.unit,
          price: editingItem.price,
          min_stock: alertLevel,
          status: calcStatus,
          item_type: editingItem.item_type || 'Stock'
        })
        .eq('id', editingItem.id);

      if (error) throw error;

      alert('Item updated successfully!');
      setEditModalOpen(false);
      fetchData();
    } catch (err) {
      console.error('Error updating item:', err);
      alert('Failed to update item');
    }
  };

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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Stock Overview — {activeBranch}</span>
          <h1 className="text-2xl md:text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">{activeBranch === 'Main Branch' ? 'Main Master Sheet' : `${activeBranch} Branch`}</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">{activeBranch === 'Main Branch' ? 'Consolidated stock across all branches.' : `Viewing stock levels for ${activeBranch} branch.`}</p>
        </div>
        {/* Desktop action row */}
        <div className="hidden md:flex flex-wrap items-center gap-2 md:gap-3">
          {(user?.role === 'Admin' || user?.role === 'Branch Manager') && (
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
              <button
                onClick={() => setViewType('consolidated')}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewType === 'consolidated' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-primary'}`}
              >
                Consolidated
              </button>
              <button
                onClick={() => setViewType('branch')}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewType === 'branch' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-primary'}`}
              >
                By Branch
              </button>
            </div>
          )}
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
        {/* Mobile action row */}
        <div className="flex flex-col gap-2 md:hidden w-full">
          {(user?.role === 'Admin' || user?.role === 'Branch Manager') && (
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
              <button
                onClick={() => setViewType('consolidated')}
                className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${viewType === 'consolidated' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}
              >
                Consolidated
              </button>
              <button
                onClick={() => setViewType('branch')}
                className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${viewType === 'branch' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}
              >
                By Branch
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUsageModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-bold rounded-md active:scale-95"
            >
              <MinusCircle size={14} />
              Log Usage
            </button>
            <button
              onClick={onStartAudit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-container text-white text-xs font-bold rounded-md active:scale-95"
            >
              <FileCheck size={14} />
              New Audit
            </button>
            <button className="w-10 h-10 flex items-center justify-center border border-slate-200 text-slate-600 rounded-md shrink-0">
              <Download size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8">
        <StatsCard label="Total SKUs" value={`${totalSKUs.toLocaleString()}`} subtext="Available in catalog" borderVariant="primary" />
        <StatsCard label="Critical Low Stock" value={`${criticalStock} Items`} subtext="Requires attention" borderVariant="tertiary" />
        <StatsCard label="In Transit" value="156 Units" subtext="Pending Delivery" borderVariant="secondary" />
        <StatsCard label="Stock Value" value={formatStockValue(stockValue)} subtext="Calculated total value" borderVariant="blue" />
      </div>

      {/* Restock Alert Panel — Admin only */}
      {isAdmin && Object.keys(restockByBranch).length > 0 && (
        <div className="mb-6 bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100 cursor-pointer select-none"
            onClick={() => setRestockCollapsed(!restockCollapsed)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  Restock Alert
                  <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full">
                    {Object.values(restockByBranch).reduce((s, b) => s + b.items.length, 0)} items
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {Object.keys(restockByBranch).length} branch{Object.keys(restockByBranch).length !== 1 ? 'es' : ''} need restocking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {Object.entries(restockByBranch).map(([id, b]) => (
                <span key={id} className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-red-100 text-red-600 text-[10px] font-bold rounded-full shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  {b.name} · {b.items.length}
                </span>
              ))}
              {restockCollapsed ? <ChevronDown size={16} className="text-slate-400 ml-2" /> : <ChevronUp size={16} className="text-slate-400 ml-2" />}
            </div>
          </div>

          {!restockCollapsed && (
            <div className={`grid grid-cols-1 divide-y md:divide-y-0 md:divide-x divide-slate-100 ${Object.keys(restockByBranch).length === 1 ? 'md:grid-cols-1' : Object.keys(restockByBranch).length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
              {Object.entries(restockByBranch).map(([branchId, branch]) => {
                const urgent = branch.items.filter(i => i.current === 0).length;
                return (
                  <div key={branchId} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">{branch.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {urgent > 0 && <span className="text-red-500 font-bold">{urgent} out of stock · </span>}
                          {branch.items.length} items total
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-[10px] font-black rounded-lg ${urgent > 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                        {urgent > 0 ? '🔴 URGENT' : '🟠 LOW'}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {branch.items.map(item => {
                        const dotColor = item.current === 0 ? 'bg-red-500' : item.belowMin ? 'bg-orange-400' : 'bg-blue-400';
                        const qtyColor = item.current === 0 ? 'text-red-600' : item.belowMin ? 'text-orange-500' : 'text-blue-500';
                        return (
                        <div key={item.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{item.name}</p>
                            <div className="flex items-center gap-1">
                              <p className="text-[9px] text-slate-400 uppercase leading-tight">{item.category}</p>
                              {item.flagged && !item.belowMin && (
                                <span className="text-[8px] font-bold text-blue-500 bg-blue-50 border border-blue-200 rounded px-1 leading-tight">FLAGGED</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`text-xs font-extrabold ${qtyColor}`}>{item.current}</span>
                            <span className="text-[10px] text-slate-400"> / {item.minStock}</span>
                            <span className="text-[9px] text-slate-300 ml-0.5 uppercase">{item.unit}</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-6 md:gap-8 border-b border-slate-100 mb-6 overflow-x-auto pb-px scrollbar-hide">
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
          {/* Desktop search/filter bar */}
          <div className="hidden md:flex bg-surface-container-low rounded-xl p-4 mb-6 flex-wrap items-center gap-4">
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
              {Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort().map(cat => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
            {user?.role !== 'Staff' && (
              <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-100">
                {(['All', 'Stock', 'Asset'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setActiveItemType(type)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeItemType === type ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-indigo-600'}`}
                  >
                    {type === 'All' ? 'All Types' : type}
                  </button>
                ))}
              </div>
            )}
            <button className="p-2.5 bg-white text-slate-500 rounded-lg hover:text-primary transition-colors shadow-sm">
              <Filter size={18} />
            </button>
          </div>
          {/* Mobile search/filter bar */}
          <div className="flex flex-col gap-3 md:hidden bg-surface-container-low rounded-xl p-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className="w-full pl-9 pr-4 py-2.5 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-300"
                placeholder="Search item name or SKU..."
                type="text"
              />
            </div>
            <div className="flex items-center gap-2">
              <select className="flex-1 bg-white border-none rounded-lg text-xs font-bold py-2 px-3 focus:ring-2 focus:ring-primary/10 text-slate-700 min-w-0">
                <option>All Categories</option>
                {Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort().map(cat => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
              {user?.role !== 'Staff' && (
                <div className="flex bg-white rounded-lg p-0.5 shadow-sm border border-slate-100 shrink-0">
                  {(['All', 'Stock', 'Asset'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setActiveItemType(type)}
                      className={`px-2.5 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeItemType === type ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-indigo-600'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile inventory card list */}
          <div className="flex flex-col gap-3 md:hidden">
            {paginatedItems.map((item, idx, arr) => {
              const qty = viewType === 'consolidated' ? (consolidatedQty[item.id] ?? 0) : (branchInventory[item.id]?.qty ?? 0);
              const isCritical = qty < (item.min_stock || 20);
              const showCatHeader = idx === 0 || item.category !== arr[idx - 1].category;
              return (
                <React.Fragment key={item.id}>
                  {showCatHeader && (
                    <div className="px-1 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {item.category || 'Uncategorized'}
                    </div>
                  )}
                <div className={`bg-white rounded-xl border shadow-sm p-4 ${branchInventory[item.id]?.flagged ? 'border-orange-200 bg-orange-50/30' : 'border-slate-100'}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${(item.item_type || 'Stock') === 'Asset' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                      {item.item_type || 'Stock'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 leading-tight">{item.name}</p>
                      {item.subtext && <p className="text-[10px] text-slate-400 uppercase mt-0.5">{item.subtext}</p>}
                    </div>
                    {branchInventory[item.id]?.flagged && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-extrabold uppercase rounded-md border border-orange-200 flex items-center gap-1">
                        <AlertCircle size={9} /> Low
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                    <span className="text-[10px] font-mono text-slate-400">{item.sku}</span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Qty</p>
                      <p className={`text-base font-extrabold font-manrope ${isCritical ? 'text-tertiary' : 'text-slate-900'}`}>{qty.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Last Audit</p>
                      <p className="text-xs text-slate-500">{item.lastAudit}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  {(user?.role === 'Admin' || user?.role === 'Branch Manager') && (
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button onClick={() => handleEditItem(item)} className="flex items-center gap-1 px-3 py-1.5 bg-primary/5 text-primary text-xs font-bold rounded-lg">
                        <Edit3 size={13} /> Edit
                      </button>
                      {item.status === 'REORDER' && (
                        <button onClick={() => prefillFromItem(item)} className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg border border-amber-100">
                          <Plus size={13} /> Order
                        </button>
                      )}
                      {!branchInventory[item.id]?.flagged ? (
                        <button onClick={() => { setFlagForm({ itemId: item.id, remark: '' }); setFlaggedItemName(item.name); setFlagModalOpen(true); }} className="ml-auto p-2 text-slate-400 hover:text-orange-500 rounded-lg transition-colors">
                          <AlertCircle size={16} />
                        </button>
                      ) : (
                        <button onClick={() => handleUnflag(item.id)} disabled={user?.role === 'Staff'} className="ml-auto p-2 text-orange-500 rounded-lg">
                          <AlertCircle size={16} className="fill-orange-100" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
            {!isAdmin && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={displayItems.length} pageSize={PAGE_SIZE} />}
          </div>

          {/* Desktop inventory table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
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
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedItems.map((item, idx, arr) => (
                    <React.Fragment key={item.id}>
                      {(idx === 0 || item.category !== arr[idx - 1].category) && (
                        <tr>
                          <td colSpan={7} className="px-6 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                            {item.category || 'Uncategorized'}
                          </td>
                        </tr>
                      )}
                    <tr className={`transition-colors ${branchInventory[item.id]?.flagged ? 'bg-orange-50/40 hover:bg-orange-50/80' : 'hover:bg-slate-50/50'}`}>
                      <td className={tdCls}>
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${
                            (item.item_type || 'Stock') === 'Asset' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                            {item.item_type || 'Stock'}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-slate-900">{item.name}</span>
                              {branchInventory[item.id]?.flagged && (
                                <span title={`Flagged reason: ${item.reorder_flag_remark || 'None'}`} className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-extrabold uppercase rounded-md tracking-widest flex items-center gap-1 border border-orange-200">
                                  <AlertCircle size={10} /> Flagged Low
                                </span>
                              )}
                            </div>
                            {!isAdmin && <span className="text-[10px] text-slate-500 uppercase">{item.subtext}</span>}
                          </div>
                        </div>
                      </td>
                      <td className={tdCls}>
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{item.category}</span>
                      </td>
                      <td className={`${tdCls} text-xs font-mono text-slate-400`}>{item.sku}</td>
                      <td className={`${tdCls} text-sm font-bold ${
                        (viewType === 'consolidated' ? (consolidatedQty[item.id] ?? 0) : (branchInventory[item.id]?.qty ?? 0)) < (item.min_stock || 20) ? 'text-tertiary' : 'text-slate-900'
                      }`}>
                        {viewType === 'consolidated' ? (consolidatedQty[item.id] ?? 0).toLocaleString() : (branchInventory[item.id]?.qty ?? 0).toLocaleString()}
                      </td>
                      <td className={`${tdCls} text-xs font-medium text-slate-500`}>{item.lastAudit}</td>
                      <td className={tdCls}>
                        <StatusBadge status={item.status} />
                      </td>
                      <td className={tdCls}>
                        <div className="flex items-center gap-2">
                          {(user?.role === 'Admin' || user?.role === 'Branch Manager') && (
                            <>
                              <button 
                                onClick={() => handleEditItem(item)}
                                className="text-primary hover:text-primary-container transition-colors"
                              >
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
                            </>
                          )}
                          {!branchInventory[item.id]?.flagged ? (
                            <button
                              onClick={() => { setFlagForm({ itemId: item.id, remark: '' }); setFlaggedItemName(item.name); setFlagModalOpen(true); }}
                              className="text-slate-400 hover:text-orange-500 transition-colors p-1"
                              title="Flag item: Staff sees it's running out"
                            >
                              <AlertCircle size={18} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnflag(item.id)}
                              className="text-orange-500 hover:text-slate-400 transition-colors p-1"
                              title={`Flagged for reorder: ${item.reorder_flag_remark || 'No remark'}. Click to resolve.`}
                              disabled={user?.role === 'Staff'}
                            >
                              <AlertCircle size={18} className="fill-orange-100" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {!isAdmin && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={displayItems.length} pageSize={PAGE_SIZE} />}
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
          {/* Mobile audit card list */}
          <div className="flex flex-col gap-3 mb-6 md:hidden">
            {auditLogs.map((log) => (
              <div key={log.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${log.isRecent ? 'border-primary/20' : 'border-slate-100'}`}>
                <button
                  className="w-full text-left p-4"
                  onClick={() => (log.mismatchedItems || log.approvalStatus === 'PENDING') && setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      {log.isRecent && <p className="text-[9px] text-primary font-bold uppercase tracking-tighter mb-1">Recently Completed</p>}
                      <p className="text-sm font-bold text-slate-900">{log.date}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{log.branch}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={log.status} />
                      {(log.mismatchedItems || log.approvalStatus === 'PENDING') && (expandedAuditId === log.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <img src={log.auditorAvatar} alt={log.auditor} className="w-6 h-6 rounded-full object-cover shrink-0" />
                    <span className="text-xs font-medium text-slate-700 flex-1">{log.auditor}</span>
                    <span className="text-xs font-bold text-primary">{log.itemsChecked} items</span>
                  </div>
                  <div>
                    {log.approvalStatus === 'PENDING'
                      ? <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-bold rounded-full border border-amber-100">Pending Approval</span>
                      : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded-full border border-emerald-100">Approved</span>}
                  </div>
                </button>
                {expandedAuditId === log.id && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1"><AlertCircle size={10} className="text-tertiary" /> Discrepancy Details</p>
                    {!log.mismatchedItems && (
                      <div className="px-3 py-2.5 mb-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700 font-semibold">
                        Detailed mismatch breakdown was not recorded for this audit. You can still approve to accept the submitted counts.
                      </div>
                    )}
                    <div className="space-y-3 mb-4">
                      {(log.mismatchedItems || []).map((item, idx) => {
                        const diff = item.actual - item.expected;
                        return (
                          <div key={idx} className="bg-white rounded-xl border border-slate-100 p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-sm font-bold text-slate-900">{item.name}</p>
                                <p className="text-[10px] font-mono text-slate-400">{item.sku}</p>
                              </div>
                              <span className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : 'text-tertiary'}`}>{diff > 0 ? `+${diff}` : diff}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-50 rounded-lg p-2">
                                <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">System</p>
                                <p className="font-bold">{item.expected}</p>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2">
                                <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Audited</p>
                                <p className="font-bold">{item.actual}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-slate-400 mb-3">
                      {log.approvalStatus === 'APPROVED' ? (
                        <p className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 size={12} /> Approved by {log.approvedByName}</p>
                      ) : (
                        <p>Awaiting management review and system sync.</p>
                      )}
                    </div>
                    {(user?.role === 'Admin' || user?.role === 'Branch Manager') && log.approvalStatus === 'PENDING' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproveAudit(log); }}
                        disabled={approvingAuditId === log.id}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-70"
                      >
                        {approvingAuditId === log.id
                          ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Approving...</>
                          : <><CheckCircle2 size={14} /> Approve & Update Stock</>
                        }
                      </button>
                    )}
                    {user?.role === 'Admin' && log.approvalStatus === 'APPROVED' && (log.mismatchedItems || []).length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResyncAuditData(log); }}
                        disabled={approvingAuditId === log.id}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl active:scale-95 disabled:opacity-70 hover:bg-slate-200 transition-colors"
                      >
                        {approvingAuditId === log.id
                          ? <><span className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" /> Syncing...</>
                          : <>↺ Re-sync Inventory Data</>
                        }
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop audit table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
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
                {auditLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`${log.isRecent ? 'bg-primary/5' : ''} hover:bg-slate-50/50 transition-colors ${(log.mismatchedItems || log.approvalStatus === 'PENDING') ? 'cursor-pointer' : ''}`}
                      onClick={() => (log.mismatchedItems || log.approvalStatus === 'PENDING') && setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
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
                          {log.approvalStatus === 'PENDING' ? (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-bold rounded-full border border-amber-100 uppercase tracking-tighter">Pending Approval</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded-full border border-emerald-100 uppercase tracking-tighter">Approved</span>
                          )}
                          {(log.mismatchedItems || log.approvalStatus === 'PENDING') && (
                            <button className="text-slate-400 hover:text-primary transition-colors flex shrink-0">
                              {expandedAuditId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedAuditId === log.id && (
                      <tr className="bg-slate-50 border-t border-slate-100/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <AlertCircle size={12} className="text-tertiary" />
                              Discrepancy Details
                            </h4>
                            {!log.mismatchedItems && (
                              <div className="px-4 py-3 mb-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700 font-semibold">
                                Detailed mismatch breakdown was not recorded for this audit. You can still approve to accept the submitted counts.
                              </div>
                            )}
                            <div className="space-y-3">
                              {(log.mismatchedItems || []).map((item, idx) => {
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
                            <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-100">
                                <div className="text-[10px] text-slate-400">
                                  {log.approvalStatus === 'APPROVED' ? (
                                    <p className="flex items-center gap-1 text-emerald-600 font-bold">
                                      <CheckCircle2 size={12} />
                                      Approved by {log.approvedByName} on {new Date(log.approvedAt!).toLocaleDateString('en-MY')}
                                    </p>
                                  ) : (
                                    <p>Awaiting management review and system sync.</p>
                                  )}
                                </div>
                                {(user?.role === 'Admin' || user?.role === 'Branch Manager') && log.approvalStatus === 'PENDING' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleApproveAudit(log); }}
                                    disabled={approvingAuditId === log.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-70"
                                  >
                                    {approvingAuditId === log.id
                                      ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Approving...</>
                                      : <><CheckCircle2 size={14} /> Approve & Update Stock</>
                                    }
                                  </button>
                                )}
                                {user?.role === 'Admin' && log.approvalStatus === 'APPROVED' && (log.mismatchedItems || []).length > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleResyncAuditData(log); }}
                                    disabled={approvingAuditId === log.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-70"
                                  >
                                    {approvingAuditId === log.id
                                      ? <><span className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" /> Syncing...</>
                                      : <>↺ Re-sync Inventory Data</>
                                    }
                                  </button>
                                )}
                              </div>
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

          {/* Mobile procurement card list */}
          <div className="flex flex-col gap-3 mb-10 md:hidden">
            {orders.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button className="w-full text-left p-4" onClick={() => setExpandedPO(expandedPO === o.id ? null : o.id)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-bold text-primary font-mono">{o.poNumber}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{o.createdAt}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${poStatusStyles[o.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${poStatusDots[o.status]}`}></span>
                        {o.status}
                      </span>
                      {expandedPO === o.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 font-medium mb-2">{o.supplier}</p>
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span className="font-bold text-slate-900">{o.items.length} {o.items.length === 1 ? 'item' : 'items'}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-bold text-primary">RM{o.totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                    {o.expectedDelivery && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">{new Date(o.expectedDelivery).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}</span>
                      </>
                    )}
                  </div>
                  {o.status === 'RECEIVED' && o.paymentStatus && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${paymentStatusStyles[o.paymentStatus]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${paymentStatusDots[o.paymentStatus]}`}></span>
                        {paymentStatusLabels[o.paymentStatus]}
                      </span>
                    </div>
                  )}
                </button>
                {expandedPO === o.id && (
                  <div className="border-t border-slate-100 px-4 pt-3 pb-2 bg-slate-50/50">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Line Items</p>
                    <div className="space-y-2 mb-3">
                      {o.items.map((line, li) => (
                        <div key={li} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-slate-100">
                          <div>
                            <p className="font-bold text-slate-800">{line.itemName}</p>
                            <p className="text-[10px] font-mono text-slate-400">{line.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400">{line.quantity} × RM{line.unitPrice.toFixed(2)}</p>
                            <p className="font-bold text-primary">RM{(line.quantity * line.unitPrice).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {o.notes && <p className="text-[10px] text-slate-500 mb-3"><span className="font-bold">Notes:</span> {o.notes}</p>}
                  </div>
                )}
                <div className="px-4 pb-4 flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                  {o.status === 'DRAFT' && (
                    <>
                      <button onClick={() => updatePOStatus(o.id, 'SUBMITTED')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg border border-amber-100 active:scale-95">
                        <CloudUpload size={13} /> Submit
                      </button>
                      <button onClick={() => handleEditPO(o)} className="p-2 text-slate-400 border border-slate-200 rounded-lg">
                        <Pencil size={14} />
                      </button>
                    </>
                  )}
                  {o.status === 'SUBMITTED' && (
                    <button onClick={() => handleGoodsReceived(o)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-500 text-white text-xs font-bold rounded-lg active:scale-95">
                      <CheckCircle2 size={13} /> Goods Received
                    </button>
                  )}
                  {o.status === 'RECEIVED' && o.paymentStatus !== 'PAID' && (
                    <>
                      {(!o.paymentStatus || o.paymentStatus === 'UNPAID') && (
                        <button onClick={() => updatePaymentStatus(o.id, 'PAYMENT_SUBMITTED')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg border border-amber-100 active:scale-95">
                          <Receipt size={13} /> Payment Submitted
                        </button>
                      )}
                      <button onClick={() => updatePaymentStatus(o.id, 'PAID')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg border border-emerald-100 active:scale-95">
                        <CheckCircle2 size={13} /> Mark Paid
                      </button>
                    </>
                  )}
                  {(o.status === 'SUBMITTED' || o.status === 'RECEIVED') && (
                    <button onClick={() => setPrintPOId(o.id)} className="p-2 text-slate-600 border border-slate-200 rounded-lg">
                      <Download size={14} />
                    </button>
                  )}
                  <button onClick={() => deletePO(o.id)} className="p-2 text-slate-400 border border-slate-200 rounded-lg ml-auto">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Package size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-bold">No procurement orders yet</p>
                <p className="text-xs mt-1">Create your first purchase order to start tracking.</p>
              </div>
            )}
          </div>

          {/* Desktop procurement table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
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
      <div className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 flex flex-col gap-4">
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
                      <button type="button" onClick={async () => {
                        const newSup = window.prompt("Enter new supplier name:");
                        if (newSup && newSup.trim() && !suppliersList.includes(newSup.trim())) {
                          await supabase.from('suppliers').insert({ name: newSup.trim() });
                          setSuppliersList([...suppliersList, newSup.trim()]);
                          setPoFormSupplier(newSup.trim());
                        }
                      }} className="w-10 h-10 flex shrink-0 items-center justify-center bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors" title="Add New Supplier">
                        <Plus size={16} />
                      </button>
                      {poFormSupplier && (
                        <button type="button" onClick={async () => {
                          if (window.confirm(`Delete supplier "${poFormSupplier}" from list?`)) {
                            await supabase.from('suppliers').delete().eq('name', poFormSupplier);
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
          {/* Mobile transaction card list */}
          <div className="flex flex-col gap-3 mb-6 md:hidden">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase rounded-md ${tx.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' : tx.type === 'TRANSFER' ? 'bg-blue-50 text-blue-700' : tx.type === 'USAGE' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                    {tx.type === 'STOCK_IN' && <Package size={10} />}
                    {tx.type === 'TRANSFER' && <ArrowRightLeft size={10} />}
                    {tx.type === 'USAGE' && <MinusCircle size={10} />}
                    {tx.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{new Date(tx.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 mb-1">{tx.item_name}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-extrabold ${tx.type === 'STOCK_IN' ? 'text-green-600' : tx.type === 'USAGE' ? 'text-orange-600' : 'text-blue-600'}`}>
                    {tx.type === 'USAGE' ? '−' : '+'}{tx.quantity} {tx.unit}
                  </span>
                  <span className="text-[10px] text-slate-400 text-right leading-snug">
                    {tx.from_location}{tx.to_location ? ` → ${tx.to_location}` : ''}
                  </span>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <p className="text-center text-slate-400 text-sm italic py-8">No recent transactions recorded.</p>}
          </div>

          {/* Desktop transaction table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
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
                        {(() => {
                          const branch = allBranches.find(b => b.id === o.branchId);
                          return (
                            <>
                              <p className="text-sm font-bold text-slate-900">{branch?.name || 'BIG DENTAL CLINIC'}</p>
                              {branch?.address ? (
                                branch.address.split(',').map((line, i) => (
                                  <p key={i} className="text-[10px] text-slate-500 mt-0.5">{line.trim()}</p>
                                ))
                              ) : (
                                <>
                                  <p className="text-[10px] text-slate-500 mt-0.5">123, Jalan Dental, 43000 Kajang</p>
                                  <p className="text-[10px] text-slate-500">Selangor, Malaysia</p>
                                </>
                              )}
                            </>
                          );
                        })()}
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

      {/* ==================== REQUEST REORDER FLAG MODAL ==================== */}
      <AnimatePresence>
        {flagModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFlagModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col print:hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-orange-50/50">
                <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2"><AlertCircle size={16} className="text-orange-600"/> Request Reorder</h3>
                <button type="button" onClick={() => setFlagModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg focus:outline-none"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={handleSubmitFlag} className="p-6 space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Item to Flag</label>
                  <p className="text-sm font-bold text-slate-800 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">{flaggedItemName}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Reason / Notes (Required)</label>
                  <textarea
                    required
                    value={flagForm.remark}
                    onChange={(e) => setFlagForm({...flagForm, remark: e.target.value})}
                    rows={3}
                    autoFocus
                    placeholder="e.g. The currently opened bottle is almost finished and we have very few left at the clinic."
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all resize-none shadow-sm"
                  ></textarea>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setFlagModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 hover:opacity-90 transition-all text-sm flex justify-center items-center gap-2"><AlertCircle size={16}/> Submit Flag</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== EDIT ITEM MODAL ==================== */}
      <AnimatePresence>
        {editModalOpen && editingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-primary/5">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2"><Edit3 size={16} /> Edit Item Details</h3>
                <button type="button" onClick={() => setEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={handleSaveItem} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item Name</label>
                    <input
                      type="text"
                      required
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description / Subtext</label>
                    <input
                      type="text"
                      value={editingItem.subtext}
                      onChange={(e) => setEditingItem({ ...editingItem, subtext: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">SKU Code</label>
                    <input
                      type="text"
                      required
                      value={editingItem.sku}
                      onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Category</label>
                    <select
                      value={editingItem.category}
                      onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort().map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item Type</label>
                    <select
                      value={editingItem.item_type || 'Stock'}
                      onChange={(e) => setEditingItem({ ...editingItem, item_type: e.target.value as 'Stock' | 'Asset' })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="Stock">Stock (Consumables, Merch)</option>
                      <option value="Asset">Asset (Equipment, Computers)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit of Measure</label>
                    <input
                      type="text"
                      required
                      value={editingItem.unit}
                      onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit Price (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingItem.price || 0}
                      onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Min. Stock Level (Alert Point)</label>
                    <input
                      type="number"
                      value={editingItem.min_stock || 20}
                      onChange={(e) => setEditingItem({ ...editingItem, min_stock: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setEditModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/30 hover:opacity-90 transition-all text-sm">Save Changes</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
