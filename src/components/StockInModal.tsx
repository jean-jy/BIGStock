import React, { useState, useEffect } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';

interface StockInItem {
  id: string;
  name: string;
  unit: string;
  min_stock?: number;
}

type Line = { itemId: string; qty: number | '' };
const emptyLine = (): Line => ({ itemId: '', qty: 1 });

// Receive stock into one branch, several items at once. Shows no prices, so Staff can use it.
export function StockInModal({ isOpen, onClose, onSaved, branches, defaultBranch, activeCompany = 'big-dental' }: {
  isOpen: boolean,
  onClose: () => void,
  onSaved?: () => void,
  branches: string[],
  defaultBranch?: string,
  activeCompany?: string
}) {
  const [branch, setBranch] = useState('');
  const [items, setItems] = useState<StockInItem[]>([]);
  const [branchQty, setBranchQty] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Start on the branch in view when it's one the user can stock into
  useEffect(() => {
    if (!isOpen) return;
    setBranch(defaultBranch && branches.includes(defaultBranch) ? defaultBranch : (branches[0] || ''));
    setLines([emptyLine()]);
    setInvoiceNo('');
    setNotes('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    supabase.from('inventory').select('id, name, unit, min_stock').eq('company_id', activeCompany).order('name')
      .then(({ data }) => setItems((data || []) as StockInItem[]));
  }, [isOpen, activeCompany]);

  useEffect(() => {
    if (!isOpen || !branch) return;
    supabase.from('branch_inventory').select('item_id, quantity').eq('branch_id', branch)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { map[r.item_id] = r.quantity; });
        setBranchQty(map);
      });
  }, [isOpen, branch]);

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => i === index ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (index: number) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const linesValid = lines.every(l => l.itemId && Number(l.qty) > 0);

  const stockInOne = async (item: StockInItem, qty: number, performedBy?: string) => {
    // 1. Add to this branch's quantity
    const { data: biRow } = await supabase.from('branch_inventory').select('id, quantity').eq('item_id', item.id).eq('branch_id', branch).maybeSingle();
    const { error: biErr } = biRow
      ? await supabase.from('branch_inventory').update({ quantity: biRow.quantity + qty }).eq('id', biRow.id)
      : await supabase.from('branch_inventory').insert({ item_id: item.id, branch_id: branch, quantity: qty });
    if (biErr) throw biErr;

    // 2. Master total = sum across branches
    const { data: allRows, error: sumErr } = await supabase.from('branch_inventory').select('quantity').eq('item_id', item.id);
    if (sumErr) throw sumErr;
    const newTotal = (allRows || []).reduce((acc, r: any) => acc + (r.quantity || 0), 0);
    const alertLevel = item.min_stock || 20;
    const status = newTotal < alertLevel ? 'REORDER' : (newTotal < alertLevel * 2 ? 'BALANCED' : 'HEALTHY');
    const { error: invErr } = await supabase.from('inventory').update({ total: newTotal, status }).eq('id', item.id);
    if (invErr) throw invErr;

    // 3. Record the movement
    const { error: txErr } = await supabase.from('inventory_transactions').insert({
      type: 'STOCK_IN',
      item_id: item.id,
      item_name: item.name,
      quantity: qty,
      unit: item.unit,
      from_location: 'Supplier',
      to_location: branch,
      remarks: [invoiceNo && `Invoice: ${invoiceNo}`, notes].filter(Boolean).join(' — '),
      performed_by: performedBy
    });
    if (txErr) throw txErr;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch || !linesValid || saving) return;
    setSaving(true);

    const performedBy = (await supabase.auth.getSession()).data.session?.user?.id;
    let saved = 0;
    try {
      // Each line is its own stock-in so history stays per item
      for (const line of lines) {
        const item = items.find(i => i.id === line.itemId);
        if (item) await stockInOne(item, Number(line.qty), performedBy);
        saved++;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error recording stock in:', err);
      // Drop the lines already saved so a retry doesn't add them twice
      setLines(prev => prev.slice(saved));
      if (saved > 0) onSaved?.();
      alert(saved > 0
        ? `Saved ${saved} item${saved > 1 ? 's' : ''}, then failed. The remaining items are still in the form — try again.`
        : 'Failed to record stock in');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all';
  const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-sky-50/50">
              <h3 className="text-sm font-bold text-sky-800 flex items-center gap-2"><Download size={16} className="text-sky-600" /> Stock In</h3>
              <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg focus:outline-none"><Plus size={16} className="rotate-45" /></button>
            </div>
            {branches.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No branch available to stock into.</p>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                <div>
                  <label className={labelCls}>Receiving Branch</label>
                  <select
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    disabled={branches.length === 1}
                    className={`${inputCls} font-semibold text-slate-700 disabled:opacity-100`}
                  >
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items Received</label>
                    <label className="w-24 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                    <span className="w-8" />
                  </div>
                  {lines.map((line, index) => {
                    const item = items.find(i => i.id === line.itemId);
                    const takenElsewhere = new Set(lines.filter((_, i) => i !== index).map(l => l.itemId));
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <select
                            required
                            value={line.itemId}
                            onChange={(e) => updateLine(index, { itemId: e.target.value })}
                            className="flex-1 min-w-0 pl-3 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                          >
                            <option value="" disabled>Select an item...</option>
                            {items.filter(i => !takenElsewhere.has(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                          <input
                            type="number"
                            required
                            min="1"
                            value={line.qty}
                            onChange={(e) => updateLine(index, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="w-24 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            disabled={lines.length === 1}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {item && (
                          <p className="text-[10px] text-slate-400">
                            In stock at {branch}: <span className="font-bold">{branchQty[item.id] ?? 0}</span> {item.unit}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addLine}
                    className="w-full py-2.5 border border-dashed border-slate-200 text-sky-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> Add another item
                  </button>
                </div>

                <div>
                  <label className={labelCls}>Invoice / DO No. (Optional)</label>
                  <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>Notes (Optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`}></textarea>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm">Cancel</button>
                  <button type="submit" disabled={saving || !linesValid} className="flex-1 py-3 bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/30 hover:opacity-90 transition-all text-sm disabled:opacity-60">
                    {saving ? 'Saving...' : lines.length > 1 ? `Stock In ${lines.length} Items` : 'Confirm Stock In'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
