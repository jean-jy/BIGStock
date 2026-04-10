import { useState, useEffect } from 'react';
import { ArrowRightLeft, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { PendingTransfersList } from './PendingTransfersList';

interface MultiBranchItem {
  id: string;
  name: string;
  category: string;
  branches: Record<string, number>;
  total: number;
}

export function MultiBranchView({ onOpenTransfer }: { onOpenTransfer: () => void, key?: string }) {
  const [multiBranchData, setMultiBranchData] = useState<MultiBranchItem[]>([]);
  const [branchNames, setBranchNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [branchResult, biResult] = await Promise.all([
          supabase.from('branches').select('id, name').order('name'),
          supabase.from('branch_inventory').select('branch_id, quantity, item_id, inventory(id, name, category)')
        ]);

        const branches = (branchResult.data || []).map(b => b.id);
        setBranchNames(branches);

        const itemMap = new Map<string, MultiBranchItem>();
        for (const row of biResult.data || []) {
          const inv = row.inventory as any;
          if (!inv) continue;
          if (!itemMap.has(inv.id)) {
            itemMap.set(inv.id, { id: inv.id, name: inv.name, category: inv.category, branches: {}, total: 0 });
          }
          const item = itemMap.get(inv.id)!;
          item.branches[row.branch_id] = row.quantity;
          item.total += row.quantity;
        }

        setMultiBranchData(Array.from(itemMap.values()));
      } catch (err) {
        console.error('Error fetching multi-branch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Network Synchronization</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Multi-Branch Inventory</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">Comparative stock analysis across all branches.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenTransfer}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity rounded-md"
          >
            <ArrowRightLeft size={16} />
            New Transfer Request
          </button>
          <button
            onClick={onOpenTransfer}
            className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-white transition-colors rounded-md"
          >
            <RefreshCw size={16} className="text-primary" />
            Rebalance Stock
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading branch inventory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
                  {branchNames.map(branch => (
                    <th key={branch} className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-blue-50/30">{branch}</th>
                  ))}
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Total Network</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {multiBranchData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                    </td>
                    {branchNames.map(branch => (
                      <td key={branch} className="px-6 py-5 text-center bg-blue-50/10">
                        <span className={`text-sm font-bold ${(item.branches[branch] || 0) < 10 ? 'text-tertiary' : 'text-slate-700'}`}>
                          {item.branches[branch] || 0}
                        </span>
                      </td>
                    ))}
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-extrabold text-primary">{item.total}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-tertiary"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Low Stock Alert</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Healthy Supply</span>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live from Database</p>
        </div>
      </div>

      {/* Transfer History Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-manrope font-extrabold text-slate-900">Recent Transfer History</h3>
            <p className="text-slate-500 text-sm">Detailed records of stock moved across the branch network.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="text-[10px] font-bold text-primary uppercase">Synchronized</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Route</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Qty</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <PendingTransfersList />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
