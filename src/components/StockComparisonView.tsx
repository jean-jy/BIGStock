import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';

interface ComparisonItem {
  id: string;
  name: string;
  sku: string;
  lastCount: number;
  currentCount: number;
  unit: string;
}

export function StockComparisonView() {
  const [comparisonData, setComparisonData] = useState<ComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComparison = async () => {
      setLoading(true);
      try {
        // Fetch current inventory
        const { data: inventory, error: invError } = await supabase
          .from('inventory')
          .select('id, name, sku, total, unit')
          .order('name');

        if (invError) throw invError;

        // Fetch the most recent USAGE/STOCK_IN transactions to derive last-count differences
        const { data: transactions, error: txError } = await supabase
          .from('inventory_transactions')
          .select('item_id, quantity, type')
          .order('created_at', { ascending: false });

        if (txError) throw txError;

        // Sum net change per item from transactions to estimate "last count"
        const netChange = new Map<string, number>();
        for (const tx of transactions || []) {
          if (!tx.item_id) continue;
          const prev = netChange.get(tx.item_id) || 0;
          if (tx.type === 'USAGE') {
            netChange.set(tx.item_id, prev + tx.quantity); // usage reduced stock, so last count was higher
          } else if (tx.type === 'STOCK_IN') {
            netChange.set(tx.item_id, prev - tx.quantity); // stock-in increased stock, so last count was lower
          }
        }

        const items: ComparisonItem[] = (inventory || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          currentCount: item.total,
          lastCount: item.total + (netChange.get(item.id) || 0),
          unit: item.unit
        }));

        setComparisonData(items);
      } catch (err) {
        console.error('Error fetching comparison data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, []);

  const totalDecrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff < 0 ? acc + Math.abs(diff) : acc;
  }, 0);

  const totalIncrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff > 0 ? acc + diff : acc;
  }, 0);

  const totalItems = comparisonData.reduce((s, i) => s + i.currentCount, 0);
  const totalVariance = Math.abs(totalIncrease - totalDecrease);
  const accuracyRate = totalItems > 0 ? ((1 - totalVariance / totalItems) * 100).toFixed(1) : '100.0';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Audit Variance Analysis</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Stock Comparison</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">Comparing current stock levels vs. pre-transaction baseline.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="text-right">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Net Variance</p>
              <p className={`text-sm font-extrabold ${totalIncrease - totalDecrease >= 0 ? 'text-blue-600' : 'text-tertiary'}`}>
                {totalIncrease - totalDecrease > 0 ? '+' : ''}{totalIncrease - totalDecrease} Units
              </p>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <button className="flex items-center gap-2 text-primary text-sm font-bold hover:opacity-80 transition-opacity">
              <Download size={16} />
              Export Variance
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Decreases</p>
          <p className="text-2xl font-extrabold text-tertiary">-{totalDecrease}</p>
          <p className="text-[10px] text-slate-400 mt-1">Items consumed or missing</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Increases</p>
          <p className="text-2xl font-extrabold text-blue-600">+{totalIncrease}</p>
          <p className="text-[10px] text-slate-400 mt-1">Restocked or found items</p>
        </div>
        <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
          <p className="text-primary text-[10px] font-bold uppercase mb-1">Accuracy Rate</p>
          <p className="text-2xl font-extrabold text-primary">{accuracyRate}%</p>
          <p className="text-[10px] text-primary/60 mt-1">Based on system expectations</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading comparison data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Last Count</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Current Count</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Difference</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {comparisonData.map((item) => {
                  const diff = item.currentCount - item.lastCount;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-tight">SKU: {item.sku}</p>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-sm font-medium text-slate-500">{item.lastCount}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-sm font-bold text-slate-900">{item.currentCount}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-tertiary' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          diff > 0 ? 'bg-blue-50 text-blue-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'
                        }`}>
                          {diff > 0 ? 'RESTOCKED' : diff < 0 ? 'CONSUMED' : 'NO CHANGE'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
