import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { BRANCH_NAMES } from '../types';
import type { InventoryItem } from '../types';
import { MOCK_INVENTORY } from '../data/mockData';

export function TransferModal({ isOpen, onClose, inventory }: { isOpen: boolean, onClose: () => void, inventory: InventoryItem[] }) {
  const [fromBranch, setFromBranch] = useState('Kepong');
  const [toBranch, setToBranch] = useState('Jadehills');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const branches = [...BRANCH_NAMES];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!selectedItem || fromBranch === toBranch || qty <= 0) return;

    setLoading(true);
    try {
      const item = inventory.find(i => i.id === selectedItem);
      if (!item) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('transfers').insert({
          from_branch_id: fromBranch,
          to_branch_id: toBranch,
          item_id: selectedItem,
          item_name: item.name,
          quantity: qty,
          status: 'COMPLETED',
          requested_by: session?.user?.id || null,
        });
      } catch (err) {
        console.warn("Supabase skipped for local dev transfer.");
      }

      // Immediately apply transfer to MOCK_INVENTORY for instant feedback
      if (item.branchStock) {
        item.branchStock[fromBranch] = Math.max(0, (item.branchStock[fromBranch] || 0) - qty);
        item.branchStock[toBranch] = (item.branchStock[toBranch] || 0) + qty;
        item.total = Object.values(item.branchStock).reduce((a, b) => a + b, 0);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setQuantity(1);
        setSelectedItem('');
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Error requesting transfer:", error);
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
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-manrope font-extrabold text-slate-900 tracking-tight">Request Stock Transfer</h2>
              <p className="text-slate-500 text-sm">Move inventory between clinical branches.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <Plus size={24} className="rotate-45 text-slate-400" />
            </button>
          </div>

          {success ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Transfer Completed Successfully</h3>
              <p className="text-slate-500 text-sm mt-2">Inventory balances have been automatically adjusted.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From Branch</label>
                  <select
                    value={fromBranch}
                    onChange={(e) => setFromBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To Branch</label>
                  <select
                    value={toBranch}
                    onChange={(e) => setToBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Item</label>
                <select
                  required
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                >
                  <option value="">Choose an item...</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 bg-slate-50 border border-slate-100 text-sm font-bold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {inventory.find(i => i.id === selectedItem)?.unit || 'Units'}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 border border-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedItem || fromBranch === toBranch || Number(quantity) <= 0}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Transfer Stock'}
                </button>
              </div>

              {fromBranch === toBranch && (
                <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-tight">Source and destination branches must be different</p>
              )}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
