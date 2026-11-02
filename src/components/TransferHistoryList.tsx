import { useState, useEffect } from 'react';
import { ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabase';

export function TransferHistoryList({ companyBranches = [] }: { companyBranches?: string[] }) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('transfers').select('*');
      if (companyBranches.length > 0) query = query.in('from_branch_id', companyBranches);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      setTransfers(data || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTransfers(); }, [companyBranches.join(',')]);

  if (loading) return <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">Loading transfers...</td></tr>;
  if (transfers.length === 0) return <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">No transfer records found.</td></tr>;

  return (
    <>
      {transfers.map(t => (
        <tr key={t.id} className="hover:bg-slate-50/30 transition-colors">
          <td className="px-6 py-4">
            <p className="text-sm font-bold text-slate-900">{t.item_name}</p>
            <p className="text-[10px] text-slate-400 font-mono">{t.id.slice(0, 8)}</p>
            {t.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">"{t.notes}"</p>}
          </td>
          <td className="px-6 py-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">{t.from_branch_id}</span>
              <ArrowRightLeft size={11} className="text-slate-300" />
              <span className="text-xs font-bold text-slate-700">{t.to_branch_id}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-extrabold text-slate-900">{t.quantity}</td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              t.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-100' :
              t.status === 'PENDING'   ? 'bg-amber-50 text-amber-700 border-amber-100' :
              t.status === 'REJECTED'  ? 'bg-red-50 text-red-700 border-red-100' :
              'bg-slate-50 text-slate-600 border-slate-100'
            }`}>
              {t.status === 'COMPLETED' && <CheckCircle2 size={9} />}
              {t.status}
            </span>
          </td>
          <td className="px-6 py-4 text-[10px] font-bold text-slate-400">
            {new Date(t.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
          </td>
        </tr>
      ))}
    </>
  );
}
