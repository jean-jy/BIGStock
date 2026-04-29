import { useState, useEffect } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { BRANCH_NAMES } from '../types';

interface UsageData {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  usageValue: number;
  date: string;
  rawDate: string;
  remarks: string;
  branch: string;
}

interface AuditComparisonItem {
  id: string;
  name: string;
  sku: string;
  lastCount: number;
  currentCount: number;
  unit: string;
}

export function StockComparisonView() {
  const [viewMode, setViewMode] = useState<'audit' | 'usage'>('audit');
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [auditData, setAuditData] = useState<AuditComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState('All Branches');

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    if (viewMode === 'usage') {
      const fetchUsage = async () => {
        setLoading(true);
        try {
          const startOfMonth = new Date(selectedYear, selectedMonth, 1).toISOString();
          const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();

          let query = supabase
            .from('inventory_transactions')
            .select(`
            id,
            created_at,
            quantity,
            type,
            from_location,
            to_location,
            remarks,
            item_id,
            inventory (
              name,
              sku,
              unit,
              price
            )
            `)
            .eq('type', 'USAGE')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

          if (selectedBranch !== 'All Branches') {
            query = query.eq('from_location', selectedBranch);
          }

          const { data, error } = await query;
          if (error) throw error;

          const formattedUsage: UsageData[] = data.map((tx: any) => {
            const item = tx.inventory;
            return {
              id: tx.id || Math.random().toString(),
              name: item?.name || 'Unknown Item',
              sku: item?.sku || 'N/A',
              quantity: tx.quantity,
              unit: item?.unit || 'Units',
              usageValue: tx.quantity * (item?.price || 0),
              date: tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : '---',
              rawDate: tx.created_at || '',
              remarks: tx.remarks || (tx.to_location?.startsWith('Ref:') ? tx.to_location.replace('Ref: ', '') : 'No remarks'),
              branch: tx.from_location
            };
          });

          setUsageData(formattedUsage.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()));
        } catch (err) {
          console.error('Error fetching usage:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchUsage();
    } else {
      const fetchAudit = async () => {
        setLoading(true);
        try {
          const { data: inventory, error: invError } = await supabase
            .from('inventory')
            .select('id, name, sku, total, unit')
            .order('name');
          if (invError) throw invError;

          const { data: transactions, error: txError } = await supabase
            .from('inventory_transactions')
            .select('item_id, quantity, type, from_location')
            .order('created_at', { ascending: false });
          if (txError) throw txError;

          const netChange = new Map<string, number>();
          for (const tx of transactions || []) {
            if (!tx.item_id) continue;
            const prev = netChange.get(tx.item_id) || 0;
            if (tx.type === 'USAGE' || tx.type === 'TRANSFER' && tx.from_location !== 'Main Branch') {
              netChange.set(tx.item_id, prev + tx.quantity);
            } else if (tx.type === 'STOCK_IN') {
              netChange.set(tx.item_id, prev - tx.quantity);
            }
          }

          const items: AuditComparisonItem[] = (inventory || []).map(item => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            currentCount: item.total,
            lastCount: item.total + (netChange.get(item.id) || 0),
            unit: item.unit
          }));
          setAuditData(items);
        } catch (err) {
          console.error('Error fetching audit:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchAudit();
    }
  }, [viewMode, selectedMonth, selectedYear, selectedBranch]);

  const handleVoidUsage = async (usage: UsageData) => {
    if (!window.confirm(`Are you sure you want to VOID this usage record for ${usage.name}? This will add ${usage.quantity} units back to stock.`)) return;

    setLoading(true);
    try {
      // 1. Find current inventory item
      const { data: item, error: fetchError } = await supabase
        .from('inventory')
        .select('id, total, min_stock')
        .eq('sku', usage.sku)
        .single();
      
      if (fetchError) throw fetchError;

      // 2. Add back the quantity
      const newTotal = item.total + usage.quantity;
      const alertLevel = item.min_stock || 20;
      const newStatus = newTotal < alertLevel ? 'REORDER' : (newTotal < alertLevel * 2 ? 'BALANCED' : 'HEALTHY');

      await supabase
        .from('inventory')
        .update({ total: newTotal, status: newStatus })
        .eq('id', item.id);

      // 3. Delete the transaction
      await supabase
        .from('inventory_transactions')
        .delete()
        .eq('id', usage.id);

      alert('Usage voided successfully. Stock has been returned.');
      
      // Refresh local state without full reload
      setUsageData(prev => prev.filter(u => u.id !== usage.id));
    } catch (err) {
      console.error('Error voiding usage:', err);
      alert('Failed to void usage.');
    } finally {
      setLoading(false);
    }
  };


  // Audit calculations
  const totalDecrease = auditData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff < 0 ? acc + Math.abs(diff) : acc;
  }, 0);
  const totalIncrease = auditData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff > 0 ? acc + diff : acc;
  }, 0);
  const totalCurrent = auditData.reduce((s, i) => s + i.currentCount, 0);
  const accuracyRate = auditData.length > 0 && totalCurrent > 0 
    ? ((1 - (totalIncrease + totalDecrease) / totalCurrent) * 100).toFixed(1) 
    : '100.0';

  const totalUsageCount = usageData.reduce((acc, item) => acc + item.quantity, 0);
  const totalUsageValue = usageData.reduce((acc, item) => acc + item.usageValue, 0);
  const uniqueItemsCount = new Set(usageData.map(d => d.sku)).size;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Inventory Intelligence</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Audit & Analytics</h1>
          <div className="flex items-center gap-1 mt-3 bg-slate-100 p-1 rounded-lg w-fit">
            <button 
              onClick={() => setViewMode('audit')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'audit' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Audit Comparison
            </button>
            <button 
              onClick={() => setViewMode('usage')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'usage' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Monthly Usage Tracker
            </button>
          </div>
        </div>
        {viewMode === 'usage' ? (
          <div className="flex flex-wrap items-center gap-3">
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-white px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option>All Branches</option>
              {(BRANCH_NAMES || ['Kepong', 'Jadehills', 'Puchong']).map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-white px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
            >
              {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-3">
             <div className="bg-white px-4 py-2 rounded-lg border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Net Variance</p>
                <p className={`text-sm font-extrabold ${totalIncrease - totalDecrease >= 0 ? 'text-blue-600' : 'text-tertiary'}`}>
                  {totalIncrease - totalDecrease > 0 ? '+' : ''}{totalIncrease - totalDecrease} Units
                </p>
              </div>
              <div className="w-px h-8 bg-slate-100"></div>
              <button
                onClick={() => {
                  const headers = ['Item Name', 'SKU', 'Last Count', 'Current Count', 'Variance', 'Status'];
                  const rows = auditData.map(item => {
                    const diff = item.currentCount - item.lastCount;
                    return [item.name, item.sku, item.lastCount, item.currentCount, diff > 0 ? `+${diff}` : diff, diff > 0 ? 'EXTRA' : diff < 0 ? 'MISSING' : 'MATCHED'];
                  });
                  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `variance-${new Date().toISOString().split('T')[0]}.csv` });
                  a.click();
                }}
                className="flex items-center gap-2 text-primary text-sm font-bold hover:opacity-80 transition-opacity"
              >
                <Download size={16} /> Export Variance
              </button>
            </div>
          </div>
        )}
      </div>

      {viewMode === 'audit' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Decreases</p>
            <p className="text-2xl font-extrabold text-tertiary">-{totalDecrease}</p>
            <p className="text-[10px] text-slate-400 mt-1">Found missing during audit</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Increases</p>
            <p className="text-2xl font-extrabold text-blue-600">+{totalIncrease}</p>
            <p className="text-[10px] text-slate-400 mt-1">Found extra during audit</p>
          </div>
          <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
            <p className="text-primary text-[10px] font-bold uppercase mb-1">Accuracy Rate</p>
            <p className="text-2xl font-extrabold text-primary">{accuracyRate}%</p>
            <p className="text-[10px] text-primary/60 mt-1">Physical vs System Match</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Consumption</p>
            <p className="text-2xl font-extrabold text-slate-900">{totalUsageCount} <span className="text-sm font-medium text-slate-400">Units</span></p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Consumption Value</p>
            <p className="text-2xl font-extrabold text-primary">RM {totalUsageValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
            <p className="text-primary text-[10px] font-bold uppercase mb-1">Unique Items Affected</p>
            <p className="text-2xl font-extrabold text-primary">{uniqueItemsCount} SKUs</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm italic">Loading intel...</div>
        ) : viewMode === 'audit' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Name</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Last Count</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Latest Count</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Variance</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {auditData.map((item) => {
                  const diff = item.currentCount - item.lastCount;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-tight font-medium">SKU: {item.sku}</p>
                      </td>
                      <td className="px-6 py-5 text-center text-sm font-medium text-slate-500">{item.lastCount}</td>
                      <td className="px-6 py-5 text-center text-sm font-bold text-slate-900">{item.currentCount}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-tertiary' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          diff > 0 ? 'bg-blue-50 text-blue-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'
                        }`}>
                          {diff > 0 ? 'EXTRA' : diff < 0 ? 'MISSING' : 'MATCHED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : usageData.length === 0 ? (
          <div className="p-20 text-center">
            <p className="text-slate-400 text-sm font-medium">No usage found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item & Branch</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Remarks</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Qty</th>
                  <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usageData.map((item, idx) => (
                  <tr key={item.id + idx} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="text-xs font-bold text-slate-900">{item.date}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                      <p className="text-[9px] text-primary uppercase font-bold tracking-tighter">{item.branch}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs text-slate-500 italic max-w-[200px] truncate" title={item.remarks}>{item.remarks}</p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-extrabold text-primary">-{item.quantity}</span>
                      <span className="text-[9px] text-slate-400 uppercase ml-1 font-bold">{item.unit}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="text-right">
                          <span className="text-sm font-bold text-slate-900">RM {item.usageValue.toFixed(2)}</span>
                          <p className="text-[9px] text-slate-400 font-medium">Recorded Value</p>
                        </div>
                        <button 
                          onClick={() => handleVoidUsage(item)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                          title="Void this usage (Adds stock back)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
