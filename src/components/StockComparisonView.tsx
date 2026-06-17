import { useState, useEffect } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
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

interface Props {
  activeBranch: string;
  refreshKey?: number;
}

export function StockComparisonView({ activeBranch, refreshKey }: Props) {
  const [viewMode, setViewMode] = useState<'audit' | 'usage' | 'history'>('audit');
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [auditData, setAuditData] = useState<AuditComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState(activeBranch === 'Main Branch' ? 'All Branches' : activeBranch);
  const [searchQuery, setSearchQuery] = useState('');

  // Audit history state
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<any | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyBranchFilter, setHistoryBranchFilter] = useState('All Branches');

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    setSelectedBranch(activeBranch === 'Main Branch' ? 'All Branches' : activeBranch);
  }, [activeBranch]);

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
          const branchLabel = activeBranch !== 'Main Branch' ? `${activeBranch} Branch` : 'Main Branch';

            // Fetch the 2 most recent approved audits for this branch
            const { data: auditLogs } = await supabase
              .from('audit_logs')
              .select('id')
              .eq('branch', branchLabel)
              .eq('approval_status', 'APPROVED')
              .order('approved_at', { ascending: false })
              .limit(2);

            const latestLogId = auditLogs?.[0]?.id ?? null;
            const previousLogId = auditLogs?.[1]?.id ?? null;

            const [invResult, latestAuditResult, previousAuditResult] = await Promise.all([
              supabase.from('inventory').select('id, name, sku, unit').order('name'),
              latestLogId
                ? supabase.from('audit_mismatches').select('item_id, actual').eq('audit_log_id', latestLogId)
                : Promise.resolve({ data: [], error: null }),
              previousLogId
                ? supabase.from('audit_mismatches').select('item_id, actual').eq('audit_log_id', previousLogId)
                : Promise.resolve({ data: [], error: null }),
            ]);
            if (invResult.error) throw invResult.error;

            // Latest audit quantities (most recent approved audit)
            const latestAuditMap = new Map<string, number>();
            for (const row of (latestAuditResult.data || []) as any[]) {
              latestAuditMap.set(row.item_id, row.actual);
            }

            // Previous audit quantities (second most recent approved audit)
            const previousAuditMap = new Map<string, number>();
            for (const row of (previousAuditResult.data || []) as any[]) {
              previousAuditMap.set(row.item_id, row.actual);
            }

            const items: AuditComparisonItem[] = (invResult.data || []).map((inv: any) => {
              const latestCount = latestAuditMap.get(inv.id) ?? null;
              const previousCount = previousAuditMap.get(inv.id) ?? null;
              // Only show items that appear in at least one audit
              return {
                id: inv.id,
                name: inv.name,
                sku: inv.sku || 'N/A',
                currentCount: latestCount ?? 0,   // Latest Count = most recent audit
                lastCount: previousCount ?? latestCount ?? 0, // Last Count = previous audit
                unit: inv.unit || 'Units'
              };
            }).filter((inv: AuditComparisonItem) => latestAuditMap.has(inv.id) || previousAuditMap.has(inv.id));
            setAuditData(items);
        } catch (err) {
          console.error('Error fetching audit:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchAudit();
    }
  }, [viewMode, selectedMonth, selectedYear, selectedBranch, activeBranch, refreshKey]);

  useEffect(() => {
    if (viewMode !== 'history') return;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        let query = supabase
          .from('audit_logs')
          .select('id, date, branch, auditor, items_checked, status, approval_status, approved_by_name, approved_at')
          .eq('approval_status', 'APPROVED')
          .order('approved_at', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        setHistoryLogs(data || []);
      } catch (err) {
        console.error('Error fetching audit history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [viewMode, refreshKey]);

  const handleSelectHistoryLog = async (log: any) => {
    setSelectedHistoryLog(log);
    const { data } = await supabase
      .from('audit_mismatches')
      .select('*')
      .eq('audit_log_id', log.id)
      .order('name');
    setHistoryItems(data || []);
  };

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

  const filteredAuditData = searchQuery.trim()
    ? auditData.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
    : auditData;

  const filteredUsageData = searchQuery.trim()
    ? usageData.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.branch.toLowerCase().includes(searchQuery.toLowerCase()))
    : usageData;

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
              onClick={() => { setViewMode('audit'); setSearchQuery(''); }}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'audit' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Audit Comparison
            </button>
            <button
              onClick={() => { setViewMode('usage'); setSearchQuery(''); }}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'usage' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Monthly Usage Tracker
            </button>
            <button
              onClick={() => { setViewMode('history'); setSearchQuery(''); setSelectedHistoryLog(null); }}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${viewMode === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Audit History
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

      {viewMode !== 'history' && viewMode === 'audit' ? (
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

      {viewMode !== 'history' && (
        <div className="mb-4">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={viewMode === 'audit' ? 'Search by item name or SKU...' : 'Search by item name or branch...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400"
            />
          </div>
        </div>
      )}

      {viewMode !== 'history' && <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm italic">Loading intel...</div>
        ) : viewMode === 'audit' ? (
          <>
            {/* Mobile audit cards */}
            <div className="md:hidden flex flex-col divide-y divide-slate-50">
              {filteredAuditData.map(item => {
                const diff = item.currentCount - item.lastCount;
                return (
                  <div key={item.id} className="p-4">
                    <p className="text-sm font-bold text-slate-900 mb-0.5">{item.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-3">SKU: {item.sku}</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Last</p>
                        <p className="text-sm font-bold text-slate-500">{item.lastCount}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Latest</p>
                        <p className="text-sm font-bold text-slate-900">{item.currentCount}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Variance</p>
                        <p className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-tertiary' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${diff > 0 ? 'bg-blue-50 text-blue-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
                      {diff > 0 ? 'EXTRA' : diff < 0 ? 'MISSING' : 'MATCHED'}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Desktop audit table */}
            <div className="hidden md:block overflow-x-auto">
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
                  {filteredAuditData.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">No items match "{searchQuery}"</td></tr>
                  )}
                  {filteredAuditData.map((item) => {
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
          </>
        ) : filteredUsageData.length === 0 ? (
          <div className="p-20 text-center">
            <p className="text-slate-400 text-sm font-medium">{searchQuery ? `No items match "${searchQuery}"` : 'No usage found.'}</p>
          </div>
        ) : (
          <>
            {/* Mobile usage cards */}
            <div className="md:hidden flex flex-col divide-y divide-slate-50">
              {filteredUsageData.map((item, idx) => (
                <div key={item.id + idx} className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-bold text-slate-900 flex-1 pr-2">{item.name}</p>
                    <p className="text-xs font-bold text-slate-400 shrink-0">{item.date}</p>
                  </div>
                  <p className="text-[10px] font-bold text-primary uppercase mb-2">{item.branch}</p>
                  {item.remarks && item.remarks !== 'No remarks' && (
                    <p className="text-xs text-slate-500 italic mb-2 truncate">{item.remarks}</p>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <div>
                      <span className="text-sm font-extrabold text-primary">-{item.quantity}</span>
                      <span className="text-[10px] text-slate-400 uppercase ml-1 font-bold">{item.unit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-800">RM {item.usageValue.toFixed(2)}</span>
                      <button onClick={() => handleVoidUsage(item)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop usage table */}
            <div className="hidden md:block overflow-x-auto">
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
                  {filteredUsageData.map((item, idx) => (
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
          </>
        )}
      </div>}

        {/* Audit History Tab */}
        {viewMode === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {selectedHistoryLog ? (
              <div>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <button onClick={() => setSelectedHistoryLog(null)} className="text-xs text-primary font-bold hover:underline mb-1 block">← Back to list</button>
                    <h3 className="text-sm font-extrabold text-slate-900">{selectedHistoryLog.branch} · {selectedHistoryLog.date}</h3>
                    <p className="text-xs text-slate-500">Audited by {selectedHistoryLog.auditor} · Approved by {selectedHistoryLog.approved_by_name}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${selectedHistoryLog.status === 'ZERO DISCREPANCY' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {selectedHistoryLog.status}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Expected</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Audited</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Variance</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {historyItems.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">No item records saved for this audit.</td></tr>
                      )}
                      {historyItems.map((item: any) => {
                        const diff = item.actual - item.expected;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/30">
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-slate-900">{item.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-slate-500">{item.expected}</td>
                            <td className="px-6 py-4 text-center text-sm font-bold text-slate-900">{item.actual}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${diff !== 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {diff !== 0 ? 'MISMATCH' : 'MATCHED'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 italic">{item.remark || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <select
                    value={historyBranchFilter}
                    onChange={e => setHistoryBranchFilter(e.target.value)}
                    className="bg-white px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option>All Branches</option>
                    {['Kepong', 'Jadehills', 'Puchong'].map(b => <option key={b} value={`${b} Branch`}>{b}</option>)}
                  </select>
                  <span className="text-xs text-slate-400">{historyLogs.filter(l => historyBranchFilter === 'All Branches' || l.branch === historyBranchFilter).length} approved audits</span>
                </div>
                {historyLoading ? (
                  <div className="p-12 text-center text-slate-400 text-sm italic">Loading history...</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Branch</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Auditor</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Items</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Result</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Approved By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {historyLogs.filter(l => historyBranchFilter === 'All Branches' || l.branch === historyBranchFilter).length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">No approved audits found.</td></tr>
                      )}
                      {historyLogs
                        .filter(l => historyBranchFilter === 'All Branches' || l.branch === historyBranchFilter)
                        .map(log => (
                          <tr
                            key={log.id}
                            className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                            onClick={() => handleSelectHistoryLog(log)}
                          >
                            <td className="px-6 py-4 text-sm font-bold text-slate-900">{log.date}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{log.branch}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{log.auditor}</td>
                            <td className="px-6 py-4 text-center text-sm font-bold text-primary">{log.items_checked}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === 'ZERO DISCREPANCY' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">{log.approved_by_name}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
    </motion.div>
  );
}
