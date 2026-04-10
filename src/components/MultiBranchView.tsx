import { ArrowRightLeft, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { PendingTransfersList } from './PendingTransfersList';

export function MultiBranchView({ onOpenTransfer }: { onOpenTransfer: () => void, key?: string }) {
  const multiBranchData = [
    { id: '1', name: 'Dental Implant Screws 4.0mm', category: 'Surgery', kepong: 5, jadehills: 8, setiawalk: 5, total: 18 },
    { id: '2', name: 'Nitrile Exam Gloves (Medium)', category: 'Consumables', kepong: 45, jadehills: 70, setiawalk: 50, total: 165 },
    { id: '3', name: 'Alginate Impression Material', category: 'Prosthetics', kepong: 12, jadehills: 20, setiawalk: 15, total: 47 },
    { id: '4', name: 'Composite Resin (A2 Shade)', category: 'Consumables', kepong: 4, jadehills: 12, setiawalk: 8, total: 24 },
    { id: '5', name: 'Sterile Gauze Pads (4x4)', category: 'Consumables', kepong: 150, jadehills: 200, setiawalk: 150, total: 500 },
  ];

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
          <p className="text-slate-500 font-inter text-sm mt-1">Comparative stock analysis across Kepong, Jadehills, and Setiawalk branches.</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-blue-50/30">Kepong</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-blue-50/30">Jadehills</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-purple-50/30">Setiawalk</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Total Network</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {multiBranchData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tight">SKU: MB-{item.id}00-X</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-blue-50/10">
                    <span className={`text-sm font-bold ${item.kepong < 10 ? 'text-tertiary' : 'text-slate-700'}`}>{item.kepong}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-blue-50/10">
                    <span className="text-sm font-bold text-slate-700">{item.jadehills}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-purple-50/10">
                    <span className="text-sm font-bold text-slate-700">{item.setiawalk}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-extrabold text-primary">{item.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Synced: 2 mins ago</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
          <h5 className="text-xs font-bold text-blue-800 uppercase mb-4">Kepong Performance</h5>
          <p className="text-2xl font-extrabold text-blue-900">88%</p>
          <p className="text-[10px] text-blue-600 font-medium mt-1">Inventory Efficiency Score</p>
        </div>
        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
          <h5 className="text-xs font-bold text-blue-800 uppercase mb-4">Jadehills Performance</h5>
          <p className="text-2xl font-extrabold text-blue-900">94%</p>
          <p className="text-[10px] text-blue-600 font-medium mt-1">Inventory Efficiency Score</p>
        </div>
        <div className="bg-purple-50/50 p-6 rounded-2xl border border-purple-100/50">
          <h5 className="text-xs font-bold text-purple-800 uppercase mb-4">Setiawalk Performance</h5>
          <p className="text-2xl font-extrabold text-purple-900">82%</p>
          <p className="text-[10px] text-purple-600 font-medium mt-1">Inventory Efficiency Score</p>
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
