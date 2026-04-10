import { ArrowRightLeft } from 'lucide-react';
import { MOCK_TRANSACTIONS } from '../data/mockData';

export function PendingTransfersList() {
  const transfers = MOCK_TRANSACTIONS.filter(t => t.type === 'TRANSFER');

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
            <p className="text-sm font-bold text-slate-900">{transfer.itemName}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-tight">ID: {transfer.id.slice(0, 8)}</p>
          </td>
          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{transfer.from.replace(' Branch', '')}</span>
              <ArrowRightLeft size={12} className="text-slate-300" />
              <span className="text-xs font-bold text-slate-700">{transfer.to.replace(' Branch', '')}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-extrabold text-slate-900">{transfer.quantity}</td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100`}>
              {transfer.status}
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <span className="text-[10px] font-bold text-slate-400">{transfer.date}</span>
          </td>
        </tr>
      ))}
    </>
  );
}
