import { useState, useEffect } from 'react';
import { ArrowRightLeft, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '../supabase';

export function PendingTransfersList({ user }: { user?: any }) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const isAdmin = user?.role === 'Admin';

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transfers').select('*')
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      setTransfers(data || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransfers(); }, []);

  const handleApprove = async (transfer: any) => {
    setProcessing(transfer.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Move stock between branches
      const [fromRow, toRow] = await Promise.all([
        supabase.from('branch_inventory').select('id, quantity').eq('branch_id', transfer.from_branch_id).eq('item_id', transfer.item_id).maybeSingle(),
        supabase.from('branch_inventory').select('id, quantity').eq('branch_id', transfer.to_branch_id).eq('item_id', transfer.item_id).maybeSingle(),
      ]);
      if (fromRow.data) await supabase.from('branch_inventory').update({ quantity: Math.max(0, fromRow.data.quantity - transfer.quantity) }).eq('id', fromRow.data.id);
      if (toRow.data) await supabase.from('branch_inventory').update({ quantity: toRow.data.quantity + transfer.quantity }).eq('id', toRow.data.id);
      else await supabase.from('branch_inventory').insert({ branch_id: transfer.to_branch_id, item_id: transfer.item_id, quantity: transfer.quantity });

      // Record transaction
      await supabase.from('inventory_transactions').insert({
        type: 'TRANSFER', item_id: transfer.item_id, item_name: transfer.item_name,
        quantity: transfer.quantity, from_location: transfer.from_branch_id,
        to_location: transfer.to_branch_id, performed_by: session?.user?.id || null,
      });

      await supabase.from('transfers').update({ status: 'COMPLETED', approved_by: session?.user?.id, updated_at: new Date().toISOString() }).eq('id', transfer.id);
      fetchTransfers();
    } catch (err) {
      console.error('Error approving transfer:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      await supabase.from('transfers').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', id);
      fetchTransfers();
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">Loading transfers...</td></tr>;
  if (transfers.length === 0) return <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm italic">No transfer records found.</td></tr>;

  return (
    <>
      {transfers.map(t => (
        <tr key={t.id} className={`hover:bg-slate-50/30 transition-colors ${t.status === 'PENDING' ? 'bg-amber-50/30' : ''}`}>
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
              {t.status === 'PENDING' && <Clock size={9} />}
              {t.status === 'COMPLETED' && <CheckCircle2 size={9} />}
              {t.status}
            </span>
          </td>
          <td className="px-6 py-4 text-[10px] font-bold text-slate-400">
            {new Date(t.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
          </td>
          <td className="px-6 py-4">
            {isAdmin && t.status === 'PENDING' && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleApprove(t)} disabled={processing === t.id}
                  className="flex items-center gap-1 px-2.5 py-1 bg-green-500 text-white text-[10px] font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-all">
                  <CheckCircle2 size={11} /> Approve
                </button>
                <button onClick={() => handleReject(t.id)} disabled={processing === t.id}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200 disabled:opacity-50 transition-all">
                  <XCircle size={11} /> Reject
                </button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
