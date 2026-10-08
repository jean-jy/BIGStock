import { supabase } from './supabase';

type AuditedItem = { id: string; name: string; expected: number; actual: number; isMismatch: boolean };

/**
 * Applies an audit's counted quantities to stock and marks the audit APPROVED.
 * Used by the admin "Approve & Update Stock" action, and directly on submit for
 * companies that skip audit approval.
 */
export async function applyAuditToStock({
  auditLogId,
  branchId,
  approverName,
  performedBy,
  fallbackItems = [],
}: {
  auditLogId: string;
  branchId: string;
  approverName: string;
  performedBy?: string | null;
  fallbackItems?: { id?: string; name: string; expected: number; actual: number }[];
}) {
  // 1. Fetch ALL counted items for this audit from audit_mismatches
  const { data: auditRows, error: fetchErr } = await supabase
    .from('audit_mismatches')
    .select('*')
    .eq('audit_log_id', auditLogId);
  if (fetchErr) throw fetchErr;

  const allAuditedItems: AuditedItem[] = (auditRows || [])
    .filter((m: any) => m.item_id)
    .map((m: any) => ({
      id: m.item_id as string,
      name: m.name as string,
      expected: m.expected as number,
      actual: m.actual as number,
      isMismatch: m.is_mismatch !== false,
    }));

  // Fall back to the caller's mismatch list if audit_mismatches has no rows
  const itemsToUpdate: AuditedItem[] = allAuditedItems.length > 0
    ? allAuditedItems
    : fallbackItems.filter(m => m.id).map(m => ({ ...m, id: m.id as string, isMismatch: true }));

  // 2. Update branch_inventory for ALL audited items (upsert — never deletes existing rows)
  if (itemsToUpdate.length > 0) {
    const { error: upsertErr } = await supabase.from('branch_inventory').upsert(
      itemsToUpdate.map(m => ({ item_id: m.id, branch_id: branchId, quantity: m.actual })),
      { onConflict: 'branch_id,item_id' }
    );
    if (upsertErr) throw upsertErr;
  }

  // 3. Re-fetch all branch quantities for affected items to compute correct totals
  const itemIds = itemsToUpdate.map(m => m.id);
  const { data: allBranchRows, error: branchFetchErr } = itemIds.length > 0
    ? await supabase.from('branch_inventory').select('item_id, quantity').in('item_id', itemIds)
    : { data: [], error: null };
  if (branchFetchErr) throw branchFetchErr;

  const totalByItem: Record<string, number> = {};
  for (const row of allBranchRows || []) {
    totalByItem[row.item_id] = (totalByItem[row.item_id] || 0) + (row.quantity || 0);
  }

  // 4. Record adjustment transactions only for items with actual discrepancies
  const discrepancies = itemsToUpdate.filter(m => m.isMismatch);
  if (discrepancies.length > 0) {
    const { error: txErr } = await supabase.from('inventory_transactions').insert(
      discrepancies.map(m => ({
        type: 'ADJUSTMENT',
        item_id: m.id,
        item_name: m.name,
        quantity: m.actual - m.expected,
        unit: 'Units',
        from_location: 'Stock Audit',
        to_location: branchId,
        remarks: `Audit approval by ${approverName}`,
        performed_by: performedBy || null
      }))
    );
    if (txErr) throw txErr;
  }

  // 5. Update last_audit (and totals/status) for ALL audited items in batches of 10
  if (itemsToUpdate.length > 0) {
    const BATCH_SIZE = 10;
    for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
      const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
      const updateResults = await Promise.all(
        batch.map(item => {
          const newTotal = totalByItem[item.id] ?? item.actual;
          const status = newTotal > 50 ? 'HEALTHY' : newTotal > 20 ? 'BALANCED' : 'REORDER';
          return supabase.from('inventory').update({
            total: newTotal, status, last_audit: new Date().toISOString()
          }).eq('id', item.id);
        })
      );
      const failedUpdates = updateResults.filter(r => r.error);
      if (failedUpdates.length > 0) throw failedUpdates[0].error;
    }
  }

  // 6. Mark audit approved — only reached if all data updates succeeded
  const { error: approveErr } = await supabase.from('audit_logs').update({
    approval_status: 'APPROVED',
    approved_by_name: approverName,
    approved_at: new Date().toISOString()
  }).eq('id', auditLogId);
  if (approveErr) throw approveErr;

  return { updatedCount: itemsToUpdate.length, discrepancyCount: discrepancies.length };
}
