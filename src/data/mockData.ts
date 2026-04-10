import { InventoryItem, AuditLog, Activity, TransactionRecord } from '../types';

export let MOCK_TRANSACTIONS: TransactionRecord[] = [
  { id: 'tx-1', type: 'TRANSFER', date: 'Oct 26, 2023, 10:30 AM', itemName: 'Dental Implant Screws 4.0mm', quantity: 10, unit: 'Units', from: 'Kepong Branch', to: 'Jadehills Branch', status: 'COMPLETED', user: 'System Admin' },
  { id: 'tx-2', type: 'STOCK_IN', date: 'Oct 25, 2023, 02:15 PM', itemName: 'Composite Resin A2', quantity: 20, unit: 'Syringes', from: 'Supplier: Dentcare', to: 'Kepong Branch', status: 'COMPLETED', user: 'Dr. Sarah' }
];

export let MOCK_INVENTORY: InventoryItem[] = [
  {
    id: '1',
    name: 'Dental Implant Screws 4.0mm',
    subtext: 'Titanium Grade 5',
    category: 'Surgery',
    sku: 'IMP-400-T',
    total: 54,
    lastAudit: 'Oct 25, 2023',
    status: 'HEALTHY',
    unit: 'Units',
    price: 450.00,
    branchStock: { Kepong: 22, Jadehills: 18, Puchong: 14 }
  },
  {
    id: '2',
    name: 'Nitrile Exam Gloves (Medium)',
    subtext: 'Box of 100',
    category: 'Consumables',
    sku: 'GLV-NIT-M',
    total: 165,
    lastAudit: 'Oct 24, 2023',
    status: 'HEALTHY',
    unit: 'Boxes',
    price: 35.50,
    branchStock: { Kepong: 60, Jadehills: 55, Puchong: 50 }
  },
  {
    id: '3',
    name: 'Alginate Impression Material',
    subtext: 'Fast Set 500g',
    category: 'Prosthetics',
    sku: 'ALG-FST-500',
    total: 47,
    lastAudit: 'Oct 19, 2023',
    status: 'BALANCED',
    unit: 'Packs',
    price: 125.00,
    branchStock: { Kepong: 18, Jadehills: 15, Puchong: 14 }
  },
  {
    id: '4',
    name: 'Composite Resin A2',
    subtext: 'Light-cure 4g syringe',
    category: 'Consumables',
    sku: 'CMP-A2-4G',
    total: 36,
    lastAudit: 'Oct 22, 2023',
    status: 'BALANCED',
    unit: 'Syringes',
    price: 85.00,
    branchStock: { Kepong: 14, Jadehills: 12, Puchong: 10 }
  },
  {
    id: '5',
    name: 'Anesthetic Cartridges 2%',
    subtext: 'Lidocaine HCL',
    category: 'Surgery',
    sku: 'ANE-LID-2P',
    total: 120,
    lastAudit: 'Oct 23, 2023',
    status: 'HEALTHY',
    unit: 'Cartridges',
    price: 12.50,
    branchStock: { Kepong: 45, Jadehills: 40, Puchong: 35 }
  },
  {
    id: '6',
    name: 'Dental Burs (Diamond FG)',
    subtext: 'Assorted Pack 10pcs',
    category: 'Instruments',
    sku: 'BUR-DIA-FG',
    total: 15,
    lastAudit: 'Oct 20, 2023',
    status: 'REORDER',
    unit: 'Packs',
    price: 65.00,
    branchStock: { Kepong: 6, Jadehills: 5, Puchong: 4 }
  }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: '1',
    date: 'Today, 09:30 AM',
    branch: 'Main Branch',
    auditor: 'System Manager',
    auditorAvatar: 'https://picsum.photos/seed/admin/100/100',
    itemsChecked: 1284,
    status: 'ZERO DISCREPANCY',
    isRecent: true
  },
  {
    id: '2',
    date: 'Oct 24, 2023',
    branch: 'Main Branch',
    auditor: 'Dr. Sarah Chen',
    auditorAvatar: 'https://picsum.photos/seed/sarah/100/100',
    itemsChecked: 1284,
    status: 'ZERO DISCREPANCY'
  },
  {
    id: '3',
    date: 'Oct 22, 2023',
    branch: 'Main Branch',
    auditor: 'Marcus Wong',
    auditorAvatar: 'https://picsum.photos/seed/marcus/100/100',
    itemsChecked: 412,
    status: '3 ITEMS MISMATCH',
    mismatchedItems: [
      { name: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', expected: 22, actual: 18, remark: 'Used in morning surgery, forgot to log.' },
      { name: 'Composite Resin (A2 Shade)', sku: 'BD-RES-045', expected: 20, actual: 24, remark: 'Found extra unlogged boxes in back drawer.' },
      { name: 'Sterile Gauze Pads (4x4)', sku: 'BD-GAU-089', expected: 520, actual: 500, remark: 'Dispensed to hygiene room.' }
    ]
  }
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: '1',
    type: 'audit',
    title: 'Audit Completed',
    location: 'Main Branch',
    time: 'Today, 9:30 AM'
  },
  {
    id: '2',
    type: 'restock',
    title: 'Restock: Ortho-Brackets',
    location: 'Jadehills',
    time: '12 mins ago'
  },
  {
    id: '3',
    type: 'transfer',
    title: 'Transfer: Local Anesthetic',
    location: 'Kepong → Setiawalk',
    time: '1 hour ago'
  }
];
