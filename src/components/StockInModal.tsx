import React, { useState, useEffect } from 'react';
import { Download, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';

interface StockInItem {
  id: string;
  name: string;
  unit: string;
  min_stock?: number;
}

const emptyForm = { itemId: '', quantity: 1, supplierName: '', invoiceNo: '', notes: '' };

// Receive stock from a supplier into one branch. Shows no prices, so Staff can use it.
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
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Start on the branch in view when it's one the user can stock into
  useEffect(() => {
    if (!isOpen) return;
    setBranch(defaultBranch && branches.includes(defaultBranch) ? defaultBranch : (branches[0] || ''));
    setForm(emptyForm);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === form.itemId);
    const qty = form.quantity;
    if (!item || !branch || qty <= 0 || saving) return;
    setSaving(true);

    try {
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
      const performedBy = (await supabase.auth.getSession()).data.session?.user?.id;
      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        type: 'STOCK_IN',
        item_id: item.id,
        item_name: item.name,
        quantity: qty,
        unit: item.unit,
        from_location: form.supplierName || 'Supplier',
        to_location: branch,
        remarks: [form.invoiceNo && `Invoice: ${form.invoiceNo}`, form.notes].filter(Boolean).join(' — '),
        performed_by: performedBy
      });
      if (txErr) throw txErr;

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error recording stock in:', err);
      alert('Failed to record stock in');
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
            className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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

                <div>
                  <label className={labelCls}>Item Received</label>
                  <select
                    required
                    value={form.itemId}
                    onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                    className={`${inputCls} font-semibold text-slate-700`}
                  >
                    <option value="" disabled>Select an item...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({branchQty[item.id] ?? 0} {item.unit} in stock)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Quantity Received</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} font-bold font-mono`}
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className={labelCls}>Supplier (Optional)</label>
                    <input type="text" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="e.g. Dentsply" className={inputCls} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Invoice / DO No. (Optional)</label>
                    <input type="text" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Notes (Optional)</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} resize-none`}></textarea>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 py-3 bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/30 hover:opacity-90 transition-all text-sm disabled:opacity-60">{saving ? 'Saving...' : 'Confirm Stock In'}</button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
