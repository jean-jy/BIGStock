import React, { useState, useEffect } from 'react';
import { Package, AlertCircle, ArrowLeft, Calendar, CheckCircle2, CloudUpload, Search, Plus, Minus, ShoppingCart } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { Pagination } from './Pagination';

function normalizeCategory(cat: string): string {
  if (!cat) return cat;
  return cat.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface AuditItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  system: number;
  unit: string;
}

export function AuditChecklist({ onBack, user }: { onBack: () => void, user?: any, key?: string }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBranch, setSelectedBranch] = useState('Kepong');
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [auditNotes, setAuditNotes] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [restockFlags, setRestockFlags] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [branchQuantities, setBranchQuantities] = useState<Record<string, number>>({});

  const toggleRestock = (id: string) => setRestockFlags(prev => ({ ...prev, [id]: !prev[id] }));

  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [invResult, branchResult] = await Promise.all([
          supabase.from('inventory').select('id, name, sku, category, total, unit, item_type').order('category').order('name'),
          supabase.from('branches').select('id').order('name')
        ]);
        setAuditItems((invResult.data || [])
          .filter((item: any) => item.item_type !== 'Asset')
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: normalizeCategory(item.category || ''),
            system: item.total,
            unit: item.unit
          })));
        const branchIds: string[] = (branchResult.data || []).map((b: any) => b.id);
        setBranches(branchIds);

        // Default to the user's assigned branch (strip " Branch" suffix if present)
        if (user?.assignedBranch && user.assignedBranch !== 'Main Branch' && user.assignedBranch !== 'All Branches') {
          const assignedId = user.assignedBranch.replace(/ Branch$/, '');
          if (branchIds.includes(assignedId)) setSelectedBranch(assignedId);
        }
      } catch (err) {
        console.error('Error fetching audit data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch branch-specific quantities whenever the selected branch changes
  useEffect(() => {
    if (!selectedBranch) return;
    supabase
      .from('branch_inventory')
      .select('item_id, quantity')
      .eq('branch_id', selectedBranch)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        for (const row of data || []) map[row.item_id] = row.quantity;
        setBranchQuantities(map);
      });
    // Reset counts when switching branches so prior branch data doesn't carry over
    setCounts({});
    setRemarks({});
  }, [selectedBranch]);

  // Expected quantity for a given item in the currently selected branch
  const getExpected = (item: AuditItem) =>
    branchQuantities[item.id] !== undefined ? branchQuantities[item.id] : item.system;

  const categories = ['All', ...Array.from(new Set(auditItems.map(i => i.category))).filter(Boolean).sort()];

  const filteredItems = auditItems.filter(item => {
    const matchCat = activeCategory === 'All' || item.category === activeCategory;
    const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  }).sort((a, b) => {
    const catCmp = (a.category || '').localeCompare(b.category || '');
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [activeCategory, searchQuery]);

  const recordedCount = Object.values(counts).filter(v => v !== '').length;
  const progress = auditItems.length > 0 ? (recordedCount / auditItems.length) * 100 : 0;

  const setCount = (id: string, val: string) => setCounts(prev => ({ ...prev, [id]: val }));
  const increment = (item: AuditItem) => {
    const cur = counts[item.id] === '' || counts[item.id] === undefined ? getExpected(item) : Number(counts[item.id]);
    setCount(item.id, String(cur + 1));
  };
  const decrement = (item: AuditItem) => {
    const cur = counts[item.id] === '' || counts[item.id] === undefined ? getExpected(item) : Number(counts[item.id]);
    setCount(item.id, String(Math.max(0, cur - 1)));
  };

  const hasMismatch = (item: AuditItem) =>
    counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== getExpected(item);

  const isDone = (item: AuditItem) =>
    counts[item.id] !== undefined && counts[item.id] !== '';

  const handleSubmitAudit = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auditorName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Unknown';

      const mismatches = auditItems
        .filter(item => counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== getExpected(item))
        .map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          expected: getExpected(item),
          actual: Number(counts[item.id]),
          remark: remarks[item.id] || undefined
        }));

      const status = mismatches.length === 0 ? 'ZERO DISCREPANCY' : `${mismatches.length} ITEMS MISMATCH`;

      const { data: auditLog, error: logError } = await supabase
        .from('audit_logs')
        .insert({
          date: new Date(auditDate).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }),
          branch: `${selectedBranch} Branch`,
          auditor: auditorName,
          auditor_avatar: session?.user?.user_metadata?.avatar_url || '',
          items_checked: recordedCount,
          status,
          approval_status: 'PENDING',
          is_recent: true
        })
        .select('id')
        .single();

      if (logError) throw logError;

      await supabase.from('audit_logs').update({ is_recent: false }).neq('id', auditLog.id);

      if (mismatches.length > 0) {
        await supabase.from('audit_mismatches').insert(
          mismatches.map(m => ({ audit_log_id: auditLog.id, item_id: m.id, name: m.name, sku: m.sku, expected: m.expected, actual: m.actual, remark: m.remark }))
        );
      }

      // Flag items marked for restock
      const restockItemIds = Object.entries(restockFlags).filter(([, v]) => v).map(([id]) => id);
      if (restockItemIds.length > 0) {
        await supabase.from('inventory')
          .update({ is_reorder_flagged: true, reorder_flag_remark: `Urgent restock flagged during audit by ${auditorName}` })
          .in('id', restockItemIds);
      }

      await supabase.from('activities').insert({
        type: 'audit',
        title: auditNotes ? `Audit Completed (${status}) — ${auditNotes}` : `Audit Completed (${status})`,
        location: `${selectedBranch} Branch`,
        time: new Date().toLocaleString('en-MY')
      });

      alert('Audit submitted successfully!');
      onBack();
    } catch (err) {
      console.error('Error submitting audit:', err);
      alert('Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto pb-36 md:pb-16"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded transition-colors border border-primary/20 w-fit">
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-manrope font-extrabold text-slate-900 leading-tight">Audit Checklist</h1>
            <p className="text-slate-500 text-sm mt-0.5">Bi-monthly stock verification · Big Dental Group</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin ? (
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="bg-white border border-slate-200 text-sm font-semibold text-slate-700 px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/10"
              >
                {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
              </select>
            ) : (
              <span className="bg-white border border-slate-200 text-sm font-semibold text-slate-700 px-3 py-2 rounded-lg">
                {selectedBranch} Branch
              </span>
            )}
            <div className="relative flex items-center">
              <Calendar size={14} className="text-primary absolute left-2.5 pointer-events-none" />
              <input
                type="date"
                value={auditDate}
                onChange={e => setAuditDate(e.target.value)}
                className="bg-white pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats (2-col on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-0.5">Total Items</p>
          <p className="text-xl font-bold font-manrope">{auditItems.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-0.5">Completed</p>
          <p className="text-xl font-bold font-manrope text-primary">{recordedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-0.5">Pending</p>
          <p className="text-xl font-bold font-manrope">{auditItems.length - recordedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-0.5">Status</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${recordedCount === auditItems.length && auditItems.length > 0 ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}></span>
            <p className={`text-xs font-bold ${recordedCount === auditItems.length && auditItems.length > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {recordedCount === auditItems.length && auditItems.length > 0 ? 'Ready' : 'In Progress'}
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search items or SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-primary/10 focus:border-primary/30 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeCategory === cat
                  ? 'bg-primary text-white shadow-sm shadow-primary/30'
                  : 'bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Item count for filtered view */}
      {(searchQuery || activeCategory !== 'All') && (
        <p className="text-xs text-slate-400 font-medium mb-3">{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} shown</p>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading inventory items...</div>
      ) : (
        <>
          {/* ── Mobile Card View ── */}
          <div className="md:hidden space-y-3">
            {paginatedItems.map((item, idx, arr) => (
              <React.Fragment key={item.id}>
                {(idx === 0 || item.category !== arr[idx - 1].category) && (
                  <div className="px-1 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {item.category || 'Uncategorized'}
                  </div>
                )}
              <div
                className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
                  isDone(item)
                    ? hasMismatch(item)
                      ? 'border-orange-200 bg-orange-50/40'
                      : 'border-primary/20 bg-primary/5'
                    : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 leading-snug">{item.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">{item.sku} · {item.category}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDone(item) && !hasMismatch(item) && <CheckCircle2 size={18} className="text-primary" />}
                    {hasMismatch(item) && <AlertCircle size={18} className="text-orange-500" />}
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      Branch: {getExpected(item)} {item.unit}
                    </span>
                  </div>
                </div>

                {/* Stepper input */}
                <div className="flex items-center gap-3">
                  <button
                    onPointerDown={e => { e.preventDefault(); decrement(item); }}
                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold active:bg-slate-200 active:scale-95 transition-all shrink-0"
                  >
                    <Minus size={18} />
                  </button>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={counts[item.id] ?? ''}
                      onChange={e => setCount(item.id, e.target.value)}
                      placeholder={`Expected: ${getExpected(item)}`}
                      className={`w-full text-center text-lg font-extrabold py-2.5 rounded-xl border outline-none transition-all ${
                        hasMismatch(item)
                          ? 'border-orange-300 bg-orange-50 text-orange-700'
                          : isDone(item)
                          ? 'border-primary/30 bg-primary/5 text-primary'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    />
                  </div>
                  <button
                    onPointerDown={e => { e.preventDefault(); increment(item); }}
                    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold active:bg-primary-container active:scale-95 transition-all shrink-0"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Mismatch remark */}
                {hasMismatch(item) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2"
                  >
                    <input
                      type="text"
                      value={remarks[item.id] || ''}
                      onChange={e => setRemarks(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Reason for mismatch?"
                      className="w-full bg-orange-50 border border-orange-200 text-orange-900 placeholder:text-orange-400/70 text-xs font-semibold px-3 py-2 rounded-lg outline-none"
                    />
                  </motion.div>
                )}

                {/* Restock flag */}
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <button
                    onPointerDown={e => { e.preventDefault(); toggleRestock(item.id); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      restockFlags[item.id]
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-500'
                    }`}
                  >
                    <ShoppingCart size={13} />
                    {restockFlags[item.id] ? 'Restock Flagged' : 'Flag for Restock'}
                  </button>
                </div>
              </div>
              </React.Fragment>
            ))}
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredItems.length} pageSize={PAGE_SIZE} />
          </div>

          {/* ── Desktop Table View ── */}
          <div className="hidden md:block bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Details</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">Branch Stock</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-48">Physical Count</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">Restock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedItems.map((item, idx, arr) => (
                    <React.Fragment key={item.id}>
                      {(idx === 0 || item.category !== arr[idx - 1].category) && (
                        <tr>
                          <td colSpan={5} className="px-6 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                            {item.category || 'Uncategorized'}
                          </td>
                        </tr>
                      )}
                    <tr className="group hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors shrink-0">
                            <Package size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.name}</p>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">SKU: {item.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{getExpected(item)} <span className="text-[10px] font-medium text-slate-400 uppercase">{item.unit}</span></span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <button onPointerDown={e => { e.preventDefault(); decrement(item); }} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0">
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              value={counts[item.id] ?? ''}
                              onChange={e => setCount(item.id, e.target.value)}
                              className={`flex-1 text-center text-sm font-bold px-2 py-1.5 rounded-lg border outline-none transition-all ${hasMismatch(item) ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 focus:border-primary'}`}
                              placeholder="0"
                            />
                            <button onPointerDown={e => { e.preventDefault(); increment(item); }} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary-container transition-colors shrink-0">
                              <Plus size={14} />
                            </button>
                          </div>
                          {hasMismatch(item) && (
                            <input
                              type="text"
                              value={remarks[item.id] || ''}
                              onChange={e => setRemarks(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Reason for mismatch?"
                              className="w-full bg-orange-50 border border-orange-200 text-orange-900 placeholder:text-orange-400/70 text-[10px] font-bold px-3 py-1.5 rounded transition-all outline-none"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={18} className={`transition-colors shrink-0 ${isDone(item) ? hasMismatch(item) ? 'text-orange-400' : 'text-primary' : 'text-slate-100'}`} />
                          <button
                            onPointerDown={e => { e.preventDefault(); toggleRestock(item.id); }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              restockFlags[item.id]
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-500'
                            }`}
                          >
                            <ShoppingCart size={11} />
                            {restockFlags[item.id] ? 'Flagged' : 'Restock'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredItems.length} pageSize={PAGE_SIZE} />

            {/* Desktop footer */}
            <div className="p-6 bg-slate-50/50 border-t border-slate-100">
              <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="flex-1 max-w-lg w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Audit Notes (Optional)</label>
                  <textarea
                    value={auditNotes}
                    onChange={e => setAuditNotes(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-primary focus:ring-0 text-sm p-3 rounded-lg resize-none outline-none"
                    placeholder="Mention any damages or expired stock here..."
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Recorded</p>
                    <p className="text-xl font-extrabold text-primary">{recordedCount} / {auditItems.length}</p>
                  </div>
                  <button
                    onClick={handleSubmitAudit}
                    disabled={submitting || recordedCount === 0}
                    className="bg-gradient-to-b from-primary to-primary-container text-white px-8 py-4 rounded-xl font-bold flex flex-col items-center shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <CloudUpload size={20} />
                      <span>{submitting ? 'Submitting...' : 'Submit & Update Master Sheet'}</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-widest opacity-80 mt-1">Sync with Central Database</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile Sticky Bottom Bar ── */}
      <div className="md:hidden fixed bottom-[60px] left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 pt-3 pb-4 safe-area-pb">
        <div className="mb-2">
          <textarea
            value={auditNotes}
            onChange={e => setAuditNotes(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-xs p-2.5 rounded-xl resize-none outline-none font-medium text-slate-700 placeholder:text-slate-400"
            placeholder="Audit notes (optional)..."
            rows={1}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-slate-500 mt-1">{recordedCount} of {auditItems.length} recorded</p>
          </div>
          <button
            onClick={handleSubmitAudit}
            disabled={submitting || recordedCount === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-container text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/25 active:scale-95 transition-all disabled:opacity-50 shrink-0"
          >
            <CloudUpload size={18} />
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
