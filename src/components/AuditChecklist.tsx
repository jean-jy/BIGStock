import React, { useState, useEffect } from 'react';
import { Package, AlertCircle, ArrowLeft, Calendar, Filter, CheckCircle2, CloudUpload } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';

/** Normalize a category string to Title Case so that "CLEANING", "cleaning", "Cleaning" all become "Cleaning" */
function normalizeCategory(cat: string): string {
  if (!cat) return cat;
  return cat
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface AuditItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  system: number;
  unit: string;
}

export function AuditChecklist({ onBack }: { onBack: () => void, key?: string }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBranch, setSelectedBranch] = useState('Kepong');
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [invResult, branchResult] = await Promise.all([
          supabase.from('inventory').select('id, name, sku, category, total, unit, item_type').order('name'),
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

        setBranches((branchResult.data || []).map(b => b.id));
      } catch (err) {
        console.error('Error fetching audit data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const recordedCount = Object.values(counts).filter(v => v !== '').length;

  const handleSubmitAudit = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auditorName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Unknown';

      // Determine mismatches
      const mismatches: { id: string; name: string; sku: string; expected: number; actual: number; remark?: string }[] = [];
      for (const item of auditItems) {
        if (counts[item.id] !== undefined && counts[item.id] !== '') {
          const actual = Number(counts[item.id]);
          if (actual !== item.system) {
            mismatches.push({
              id: item.id,
              name: item.name,
              sku: item.sku,
              expected: item.system,
              actual,
              remark: remarks[item.id] || undefined
            });
          }
        }
      }

      const status = mismatches.length === 0 ? 'ZERO DISCREPANCY' : `${mismatches.length} ITEMS MISMATCH`;

      // Insert audit log
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

      // Mark previous audits as not recent
      await supabase
        .from('audit_logs')
        .update({ is_recent: false })
        .neq('id', auditLog.id);

      // Insert mismatches
      if (mismatches.length > 0) {
        const { error: mmError } = await supabase
          .from('audit_mismatches')
          .insert(mismatches.map(m => ({ audit_log_id: auditLog.id, item_id: m.id, name: m.name, sku: m.sku, expected: m.expected, actual: m.actual, remark: m.remark })));
        if (mmError) throw mmError;
      }

      // Record as activity
      await supabase.from('activities').insert({
        type: 'audit',
        title: `Audit Completed (${status})`,
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
      className="max-w-6xl mx-auto"
    >
      {/* Breadcrumbs & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <nav className="flex text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
            <span>Inventory</span>
            <span className="mx-2 opacity-50">/</span>
            <span className="text-primary">Stock Audit</span>
          </nav>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded transition-colors border border-primary/20 mb-4"
          >
            <ArrowLeft size={14} />
            Back to Master Inventory
          </button>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 leading-tight">Audit Checklist</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500 text-sm">Bi-monthly stock verification for Big Dental Group.</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
              <CheckCircle2 size={12} className="mr-1" />
              Master Sheet Linked
            </span>
          </div>
        </div>

        <div className="w-full md:w-auto flex flex-col gap-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Select Branch</label>
          <div className="flex items-center gap-2">
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="bg-white border border-slate-200 text-sm font-semibold text-slate-700 px-4 py-2.5 rounded-lg min-w-[200px] focus:ring-2 focus:ring-primary/10 transition-all"
            >
              {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
            </select>
            <div className="relative flex items-center">
              <Calendar size={16} className="text-primary absolute left-3 pointer-events-none z-10" />
              <input
                type="date"
                value={auditDate}
                onChange={e => setAuditDate(e.target.value)}
                className="bg-white pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Items</p>
          <p className="text-2xl font-bold font-manrope">{auditItems.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Completed</p>
          <p className="text-2xl font-bold font-manrope text-primary">{recordedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Pending Check</p>
          <p className="text-2xl font-bold font-manrope">{auditItems.length - recordedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Audit Status</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${recordedCount === auditItems.length ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}></span>
            <p className={`text-sm font-bold ${recordedCount === auditItems.length ? 'text-green-600' : 'text-amber-600'}`}>
              {recordedCount === auditItems.length ? 'Ready to Submit' : 'In Progress'}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div className="flex gap-4">
            <button className="text-xs font-bold text-primary border-b-2 border-primary px-1">All Items</button>
            {Array.from(new Set(auditItems.map(i => i.category))).map(cat => (
              <button key={cat} className="text-xs font-bold text-slate-400 hover:text-primary transition-colors px-1">{cat}</button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Sort by: <span className="text-slate-700 font-bold">A-Z</span></span>
            <Filter size={16} className="text-slate-400" />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading inventory items...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Details</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">System Stock</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">Physical Count</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {auditItems.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                          <Package size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.name}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">SKU: {item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">{item.system}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">{item.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2">
                        <input
                          type="number"
                          value={counts[item.id] || ''}
                          onChange={(e) => setCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className={`w-full bg-slate-50 border focus:ring-0 text-sm font-bold px-3 py-2 rounded transition-all outline-none ${counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== item.system ? 'border-orange-300 ring-2 ring-orange-50 focus:border-orange-400 text-orange-700 bg-orange-50/30' : 'border-slate-100 focus:border-primary'}`}
                          placeholder="0"
                        />
                        {counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== item.system && (
                          <input
                            type="text"
                            value={remarks[item.id] || ''}
                            onChange={(e) => setRemarks(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Why is it mismatched?"
                            title="Please provide a reason for this variance"
                            className="w-full bg-orange-50 border border-orange-200 text-orange-900 placeholder:text-orange-400/70 focus:border-orange-400 focus:ring-0 text-[10px] font-bold px-3 py-1.5 rounded transition-all outline-none animate-in fade-in slide-in-from-top-1"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <CheckCircle2 size={20} className={`transition-colors ${counts[item.id] ? 'text-primary' : 'text-slate-100'}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Action */}
        <div className="p-8 bg-slate-50/50 border-t border-slate-100">
          <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="flex-1 max-w-lg w-full">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Audit Notes (Optional)</label>
              <textarea
                className="w-full bg-white border border-slate-200 focus:border-primary focus:ring-0 text-sm p-3 rounded-lg shadow-inner resize-none"
                placeholder="Mention any damages or expired stock here..."
                rows={2}
              ></textarea>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Current Submission</p>
                <p className="text-xl font-extrabold text-primary">{recordedCount} Items Recorded</p>
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
                <span className="text-[9px] uppercase tracking-widest opacity-80 mt-1">Syncing with Central Database</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-12 mb-8 text-center">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">BIGStock Precision © 2023 | Precision Stock Monitoring</p>
      </footer>
    </motion.div>
  );
}
