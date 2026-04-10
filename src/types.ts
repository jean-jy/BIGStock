/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type View = 'dashboard' | 'audit-checklist' | 'multi-branch' | 'stock-comparison' | 'inventory' | 'settings';

export interface InventoryItem {
  id: string;
  name: string;
  subtext: string;
  category: string;
  sku: string;
  total: number;
  lastAudit: string;
  status: 'REORDER' | 'HEALTHY' | 'BALANCED';
  unit: string;
  price?: number;
  branchStock: Record<string, number>;
}

export const BRANCH_NAMES = ['Kepong', 'Jadehills', 'Puchong'] as const;

export function getStatusForTotal(total: number): 'REORDER' | 'HEALTHY' | 'BALANCED' {
  if (total > 50) return 'HEALTHY';
  if (total > 20) return 'BALANCED';
  return 'REORDER';
}

export interface AuditLog {
  id: string;
  date: string;
  branch: string;
  auditor: string;
  auditorAvatar: string;
  itemsChecked: number;
  status: 'ZERO DISCREPANCY' | '3 ITEMS MISMATCH';
  isRecent?: boolean;
  mismatchedItems?: { name: string; sku: string; expected: number; actual: number; remark?: string; }[];
}

export interface Activity {
  id: string;
  type: 'audit' | 'restock' | 'transfer';
  title: string;
  location: string;
  time: string;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
}

export interface TransferRequest {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  requestedBy: string;
  requestedAt: any;
}

export interface TransactionRecord {
  id: string;
  type: 'STOCK_IN' | 'TRANSFER' | 'ADJUSTMENT' | 'USAGE';
  date: string;
  itemName: string;
  quantity: number;
  unit: string;
  from: string;
  to: string;
  status: 'COMPLETED' | 'PENDING';
  user: string;
}

export interface POLineItem {
  itemName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface ProcurementOrder {
  id: string;
  poNumber: string;
  supplier: string;
  items: POLineItem[];
  totalCost: number;
  status: 'DRAFT' | 'SUBMITTED' | 'RECEIVED' | 'CANCELLED';
  expectedDelivery: string;
  notes: string;
  createdAt: string;
  paymentStatus?: 'UNPAID' | 'PAYMENT_SUBMITTED' | 'PAID';
  paymentSubmittedDate?: string;
  paymentPaidDate?: string;
}
