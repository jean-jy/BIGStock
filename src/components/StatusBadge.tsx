import type { InventoryItem, AuditLog } from '../types';

export const StatusBadge = ({ status }: { status: InventoryItem['status'] | string }) => {
  const isMismatch = status.includes('MISMATCH');
  
  const styles: Record<string, string> = {
    REORDER:            'bg-red-500/15 text-red-400 border border-red-500/25',
    HEALTHY:            'bg-blue-500/15 text-blue-300 border border-blue-500/25',
    BALANCED:           'bg-sky-500/15 text-sky-300 border border-sky-500/25',
    'ZERO DISCREPANCY': 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
  };

  const dotColors: Record<string, string> = {
    REORDER:            'bg-red-400',
    HEALTHY:            'bg-blue-400',
    BALANCED:           'bg-sky-400',
    'ZERO DISCREPANCY': 'bg-blue-400'
  };

  const currentStyle = isMismatch ? 'bg-red-500/15 text-red-400 border border-red-500/25' : (styles[status] || styles['ZERO DISCREPANCY']);
  const currentDotColor = isMismatch ? 'bg-red-400' : (dotColors[status] || dotColors['ZERO DISCREPANCY']);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${currentStyle}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${currentDotColor}`}></span>
      {status}
    </span>
  );
};
