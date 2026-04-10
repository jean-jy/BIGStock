import { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { supabase } from '../supabase';

export function PendingTransfersList() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransfers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('transfers')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        setTransfers(data || []);
      } catch (err) {
        console.error('Error fetching transfers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransfers();
  }, []);

  if (loading) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">Loading transfers...</td>
      </tr>
    );
  }

  if (transfers.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">No recent transfer records found.</td>
      </tr>
    );
  }

  return (
    <>
      {transfers.map((transfer) => (
        <tr key={transfer.id} className="hover:bg-slate-50/30 transition-colors">
          <td className="px-6 py-4">
            <p className="text-sm font-bold text-slate-900">{transfer.item_name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-tight">ID: {transfer.id.slice(0, 8)}</p>
          </td>
          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{transfer.from_branch_id}</span>
              <ArrowRightLeft size={12} className="text-slate-300" />
              <span className="text-xs font-bold text-slate-700">{transfer.to_branch_id}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-extrabold text-slate-900">{transfer.quantity}</td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
              transfer.status === 'COMPLETED' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              transfer.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
              transfer.status === 'REJECTED' ? 'bg-red-50 text-red-700 border border-red-100' :
              'bg-green-50 text-green-700 border border-green-100'
            }`}>
              {transfer.status}
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <span className="text-[10px] font-bold text-slate-400">
              {new Date(transfer.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}
