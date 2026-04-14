import type { InventoryItem, AuditLog } from '../types';

export const StatusBadge = ({ status }: { status: InventoryItem['status'] | string }) => {
  const isMismatch = status.includes('MISMATCH');
  
  const styles: Record<string, string> = {
    REORDER: 'bg-red-100 text-red-700',
    HEALTHY: 'bg-blue-100 text-blue-700',
    BALANCED: 'bg-blue-100 text-blue-700',
    'ZERO DISCREPANCY': 'bg-blue-100 text-blue-700'
  };

  const dotColors: Record<string, string> = {
    REORDER: 'bg-red-500',
    HEALTHY: 'bg-blue-500',
    BALANCED: 'bg-blue-500',
    'ZERO DISCREPANCY': 'bg-blue-500'
  };

  const currentStyle = isMismatch ? 'bg-red-100 text-red-700' : (styles[status] || styles['ZERO DISCREPANCY']);
  const currentDotColor = isMismatch ? 'bg-red-500' : (dotColors[status] || dotColors['ZERO DISCREPANCY']);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${currentStyle}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${currentDotColor}`}></span>
      {status}
    </span>
  );
};
