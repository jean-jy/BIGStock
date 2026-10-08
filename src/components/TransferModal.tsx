import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, ArrowRightLeft, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { BRANCH_NAMES, companySkipsApproval } from '../types';
import type { InventoryItem } from '../types';

export function TransferModal({ isOpen, onClose, user, companyBranches, activeCompany = 'big-dental' }: { isOpen: boolean, onClose: () => void, user?: any, companyBranches?: string[], activeCompany?: string }) {
  const branches = (companyBranches && companyBranches.length > 0) ? companyBranches : [...BRANCH_NAMES];
  const [fromBranch, setFromBranch] = useState(branches[0] || 'Kepong');
  const [toBranch, setToBranch] = useState(branches[1] || branches[0] || 'Jadehills');
  const [lines, setLines] = useState<{ itemId: string; qty: number | '' }[]>([{ itemId: '', qty: 1 }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [fromStock, setFromStock] = useState<Record<string, number>>({});

  const isAdmin = user?.role === 'Admin';
  // Admins always transfer instantly; some companies skip approval for everyone
  const instant = isAdmin || companySkipsApproval(activeCompany);

  useEffect(() => {
    if (!isOpen) return;
    supabase.from('inventory').select('*').eq('company_id', activeCompany).order('name').then(({ data }) => {
      setInventory((data || []).map(item => ({ ...item, lastAudit: item.last_audit || 'Never', branchStock: {} })));
    });
  }, [isOpen, activeCompany]);

  const selectedIds = lines.map(l => l.itemId).filter(Boolean);
  const selectedKey = selectedIds.join(',');

  useEffect(() => {
    if (!fromBranch || selectedIds.length === 0) { setFromStock({}); return; }
    supabase.from('branch_inventory').select('item_id, quantity').eq('branch_id', fromBranch).in('item_id', selectedIds)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { map[r.item_id] = r.quantity; });
        setFromStock(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, fromBranch]);

  const updateLine = (index: number, patch: Partial<{ itemId: string; qty: number | '' }>) =>
    setLines(prev => prev.map((l, i) => i === index ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, { itemId: '', qty: 1 }]);
  const removeLine = (index: number) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const linesValid = lines.every(l => l.itemId && Number(l.qty) > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linesValid || fromBranch === toBranch) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Each line is recorded as its own transfer so approvals and history stay per item
      for (const line of lines) {
        const selectedItem = line.itemId;
        const qty = Number(line.qty);
        const item = inventory.find(i => i.id === selectedItem);
        if (!item) continue;

        if (instant) {
          // Immediate transfer
          await supabase.from('transfers').insert({
            from_branch_id: fromBranch, to_branch_id: toBranch,
            item_id: selectedItem, item_name: item.name,
            quantity: qty, status: 'COMPLETED', notes,
            requested_by: session?.user?.id || null,
            approved_by: session?.user?.id || null,
          });

          const [fromRow, toRow] = await Promise.all([
            supabase.from('branch_inventory').select('id, quantity').eq('branch_id', fromBranch).eq('item_id', selectedItem).maybeSingle(),
            supabase.from('branch_inventory').select('id, quantity').eq('branch_id', toBranch).eq('item_id', selectedItem).maybeSingle(),
          ]);
          if (fromRow.data) await supabase.from('branch_inventory').update({ quantity: Math.max(0, fromRow.data.quantity - qty) }).eq('id', fromRow.data.id);
          if (toRow.data) await supabase.from('branch_inventory').update({ quantity: toRow.data.quantity + qty }).eq('id', toRow.data.id);
          else await supabase.from('branch_inventory').insert({ branch_id: toBranch, item_id: selectedItem, quantity: qty });

          await supabase.from('inventory_transactions').insert({
            type: 'TRANSFER', item_id: selectedItem, item_name: item.name,
            quantity: qty, unit: item.unit,
            from_location: fromBranch, to_location: toBranch,
            performed_by: session?.user?.id || null,
          });
        } else {
          // Staff/Manager: submit as PENDING for admin approval
          await supabase.from('transfers').insert({
            from_branch_id: fromBranch, to_branch_id: toBranch,
            item_id: selectedItem, item_name: item.name,
            quantity: qty, status: 'PENDING', notes,
            requested_by: session?.user?.id || null,
          });
        }
      }

      setSuccess(true);
      setTimeout(() => { setSuccess(false); setLines([{ itemId: '', qty: 1 }]); setNotes(''); onClose(); }, 2500);
    } catch (error) {
      console.error('Error requesting transfer:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="p-8 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-manrope font-extrabold text-slate-900 tracking-tight">
                {instant ? 'Transfer Stock' : 'Request Stock Transfer'}
              </h2>
              <p className="text-slate-500 text-sm">
                {instant ? 'Instantly move inventory between branches.' : 'Submit a request — admin will approve.'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <Plus size={24} className="rotate-45 text-slate-400" />
            </button>
          </div>

          {success ? (
            <div className="py-12 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${instant ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {instant ? 'Transfer Completed' : 'Request Submitted'}
              </h3>
              <p className="text-slate-500 text-sm mt-2">
                {instant ? 'Inventory balances have been updated.' : 'An admin will review and approve your request.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From Branch</label>
                  <select value={fromBranch} onChange={e => setFromBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10">
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To Branch</label>
                  <select value={toBranch} onChange={e => setToBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10">
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items</label>
                  <label className="w-24 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                  <span className="w-8" />
                </div>
                {lines.map((line, index) => {
                  const item = inventory.find(i => i.id === line.itemId);
                  const available = line.itemId ? fromStock[line.itemId] : undefined;
                  const takenElsewhere = new Set(lines.filter((_, i) => i !== index).map(l => l.itemId));
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <select required value={line.itemId} onChange={e => updateLine(index, { itemId: e.target.value })}
                          className="flex-1 min-w-0 bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10">
                          <option value="">Choose an item...</option>
                          {inventory.filter(i => !takenElsewhere.has(i.id)).map(i => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
                        </select>
                        <input type="number" min="1" required value={line.qty}
                          onChange={e => updateLine(index, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-24 bg-slate-50 border border-slate-100 text-sm font-bold p-3 rounded-xl focus:ring-2 focus:ring-primary/10" />
                        <button type="button" onClick={() => removeLine(index)} disabled={lines.length === 1}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          title="Remove item">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {item && (
                        <p className={`text-[10px] ${available !== undefined && Number(line.qty) > available ? 'text-red-500' : 'text-slate-400'}`}>
                          Available at {fromBranch}: <span className="font-bold">{available ?? 0}</span> {item.unit}
                        </p>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={addLine}
                  className="w-full py-2.5 border border-dashed border-slate-200 text-primary rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
                  <Plus size={14} /> Add another item
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason / Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Urgent need at Kepong branch"
                  className="w-full bg-slate-50 border border-slate-100 text-sm p-3 rounded-xl focus:ring-2 focus:ring-primary/10" />
              </div>

              {!instant && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                  <ArrowRightLeft size={14} className="text-blue-500 shrink-0" />
                  <p className="text-[11px] text-blue-600 font-medium">Your request will be reviewed by an admin before stock is moved.</p>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 py-3.5 border border-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button type="submit"
                  disabled={loading || !linesValid || fromBranch === toBranch}
                  className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
                  {loading ? 'Submitting...' : instant ? (lines.length > 1 ? `Transfer ${lines.length} Items` : 'Transfer Now') : (lines.length > 1 ? `Submit ${lines.length} Requests` : 'Submit Request')}
                </button>
              </div>
              {fromBranch === toBranch && <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-tight">Source and destination branches must be different</p>}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
