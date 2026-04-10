import type { InventoryItem, AuditLog } from '../types';

export const StatusBadge = ({ status }: { status: InventoryItem['status'] | AuditLog['status'] }) => {
  const styles = {
    REORDER: 'bg-red-100 text-red-700',
    HEALTHY: 'bg-blue-100 text-blue-700',
    BALANCED: 'bg-blue-100 text-blue-700',
    'ZERO DISCREPANCY': 'bg-blue-100 text-blue-700',
    '3 ITEMS MISMATCH': 'bg-red-100 text-red-700'
  };

  const dotColors = {
    REORDER: 'bg-red-500',
    HEALTHY: 'bg-blue-500',
    BALANCED: 'bg-blue-500',
    'ZERO DISCREPANCY': 'bg-blue-500',
    '3 ITEMS MISMATCH': 'bg-red-500'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${styles[status as keyof typeof styles]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status as keyof typeof dotColors]}`}></span>
      {status}
    </span>
  );
};
