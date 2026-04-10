import { Download } from 'lucide-react';
import { motion } from 'motion/react';

export function StockComparisonView() {
  const comparisonData = [
    { id: '1', name: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', lastCount: 22, currentCount: 18, unit: 'Units' },
    { id: '2', name: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', lastCount: 150, currentCount: 165, unit: 'Boxes' },
    { id: '3', name: 'Alginate Impression Material', sku: 'ALG-FST-500', lastCount: 55, currentCount: 47, unit: 'Packs' },
    { id: '4', name: 'Composite Resin (A2 Shade)', sku: 'BD-RES-045', lastCount: 20, currentCount: 24, unit: 'Syringes' },
    { id: '5', name: 'Sterile Gauze Pads (4x4)', sku: 'BD-GAU-089', lastCount: 520, currentCount: 500, unit: 'Units' },
  ];

  const totalDecrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff < 0 ? acc + Math.abs(diff) : acc;
  }, 0);

  const totalIncrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff > 0 ? acc + diff : acc;
  }, 0);

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
          <p className="text-slate-500 font-inter text-sm mt-1">Comparing current audit (Oct 24) vs previous audit (Oct 10).</p>
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
          <p className="text-2xl font-extrabold text-primary">98.4%</p>
          <p className="text-[10px] text-primary/60 mt-1">Based on system expectations</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
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
      </div>
    </motion.div>
  );
}
