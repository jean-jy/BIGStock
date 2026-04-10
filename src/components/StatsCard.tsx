import { History } from 'lucide-react';

export const StatsCard = ({ label, value, subtext, borderVariant }: { label: string, value: string, subtext: string, borderVariant: 'primary' | 'tertiary' | 'secondary' | 'blue' }) => {
  const borderColors = {
    primary: 'border-primary',
    tertiary: 'border-tertiary',
    secondary: 'border-surface-container-high',
    blue: 'border-primary-container'
  };

  return (
    <div className={`bg-white p-6 rounded-xl border-l-4 ${borderColors[borderVariant]} shadow-sm`}>
      <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-manrope font-extrabold ${borderVariant === 'tertiary' ? 'text-tertiary' : 'text-slate-900'}`}>{value}</p>
      <p className="text-[9px] text-slate-400 mt-2 flex items-center gap-1">
        <History size={12} /> {subtext}
      </p>
    </div>
  );
};
