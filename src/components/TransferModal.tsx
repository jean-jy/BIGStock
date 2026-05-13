import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { BRANCH_NAMES } from '../types';
import type { InventoryItem } from '../types';

export function TransferModal({ isOpen, onClose, user }: { isOpen: boolean, onClose: () => void, user?: any }) {
  const [fromBranch, setFromBranch] = useState('Kepong');
  const [toBranch, setToBranch] = useState('Jadehills');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [fromStock, setFromStock] = useState<number | null>(null);

  const branches = [...BRANCH_NAMES];
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    if (!isOpen) return;
    supabase.from('inventory').select('*').order('name').then(({ data }) => {
      setInventory((data || []).map(item => ({ ...item, lastAudit: item.last_audit || 'Never', branchStock: {} })));
    });
  }, [isOpen]);

  useEffect(() => {
    if (!selectedItem || !fromBranch) { setFromStock(null); return; }
    supabase.from('branch_inventory').select('quantity').eq('branch_id', fromBranch).eq('item_id', selectedItem).maybeSingle()
      .then(({ data }) => setFromStock(data?.quantity ?? null));
  }, [selectedItem, fromBranch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!selectedItem || fromBranch === toBranch || qty <= 0) return;

    setLoading(true);
    try {
      const item = inventory.find(i => i.id === selectedItem);
      if (!item) return;
      const { data: { session } } = await supabase.auth.getSession();

      if (isAdmin) {
        // Admin: immediate transfer
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

      setSuccess(true);
      setTimeout(() => { setSuccess(false); setQuantity(1); setSelectedItem(''); setNotes(''); onClose(); }, 2500);
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
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-manrope font-extrabold text-slate-900 tracking-tight">
                {isAdmin ? 'Transfer Stock' : 'Request Stock Transfer'}
              </h2>
              <p className="text-slate-500 text-sm">
                {isAdmin ? 'Instantly move inventory between branches.' : 'Submit a request — admin will approve.'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <Plus size={24} className="rotate-45 text-slate-400" />
            </button>
          </div>

          {success ? (
            <div className="py-12 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAdmin ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {isAdmin ? 'Transfer Completed' : 'Request Submitted'}
              </h3>
              <p className="text-slate-500 text-sm mt-2">
                {isAdmin ? 'Inventory balances have been updated.' : 'An admin will review and approve your request.'}
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

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Item</label>
                <select required value={selectedItem} onChange={e => setSelectedItem(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10">
                  <option value="">Choose an item...</option>
                  {inventory.map(item => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
                </select>
                {fromStock !== null && selectedItem && (
                  <p className="text-[10px] text-slate-400">Available at {fromBranch}: <span className="font-bold text-slate-600">{fromStock}</span> {inventory.find(i => i.id === selectedItem)?.unit}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                <div className="flex items-center gap-4">
                  <input type="number" min="1" required value={quantity}
                    onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 bg-slate-50 border border-slate-100 text-sm font-bold p-3 rounded-xl focus:ring-2 focus:ring-primary/10" />
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {inventory.find(i => i.id === selectedItem)?.unit || 'Units'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason / Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Urgent need at Kepong branch"
                  className="w-full bg-slate-50 border border-slate-100 text-sm p-3 rounded-xl focus:ring-2 focus:ring-primary/10" />
              </div>

              {!isAdmin && (
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
                  disabled={loading || !selectedItem || fromBranch === toBranch || Number(quantity) <= 0}
                  className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
                  {loading ? 'Submitting...' : isAdmin ? 'Transfer Now' : 'Submit Request'}
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
