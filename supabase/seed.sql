-- ============================================================
-- BIGStock Precision — Seed Data
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- ============================================================

-- 1. BRANCHES
insert into public.branches (id, name, location, manager) values
  ('Kepong',    'Kepong Branch',    'Kepong Medical Center',    'Marcus Wong'),
  ('Jadehills', 'Jadehills Branch', 'Jadehills Medical Center', 'Branch Manager'),
  ('Puchong',   'Puchong Branch',   'Puchong Medical Center',   'Branch Manager')
on conflict (id) do nothing;

-- 2. INVENTORY (master items)
insert into public.inventory (name, subtext, category, sku, total, unit, status, price, last_audit) values
  ('Dental Implant Screws 4.0mm', 'Titanium Grade 5',       'Surgery',      'IMP-400-T',    54,  'Units',      'HEALTHY',  450.00,  '2023-10-25T00:00:00Z'),
  ('Nitrile Exam Gloves (Medium)','Box of 100',             'Consumables',  'GLV-NIT-M',   165,  'Boxes',      'HEALTHY',   35.50,  '2023-10-24T00:00:00Z'),
  ('Alginate Impression Material','Fast Set 500g',           'Prosthetics',  'ALG-FST-500',  47,  'Packs',      'BALANCED', 125.00,  '2023-10-19T00:00:00Z'),
  ('Composite Resin A2',         'Light-cure 4g syringe',   'Consumables',  'CMP-A2-4G',    36,  'Syringes',   'BALANCED',  85.00,  '2023-10-22T00:00:00Z'),
  ('Anesthetic Cartridges 2%',   'Lidocaine HCL',           'Surgery',      'ANE-LID-2P',  120,  'Cartridges', 'HEALTHY',   12.50,  '2023-10-23T00:00:00Z'),
  ('Dental Burs (Diamond FG)',   'Assorted Pack 10pcs',     'Instruments',  'BUR-DIA-FG',   15,  'Packs',      'REORDER',   65.00,  '2023-10-20T00:00:00Z')
on conflict (sku) do nothing;

-- 3. BRANCH_INVENTORY (per-branch stock distribution, referencing by SKU)
insert into public.branch_inventory (branch_id, item_id, quantity)
select b.branch_id, i.id, b.quantity
from (values
  ('Kepong',    'IMP-400-T',   22),
  ('Jadehills', 'IMP-400-T',   18),
  ('Puchong',   'IMP-400-T',   14),
  ('Kepong',    'GLV-NIT-M',   60),
  ('Jadehills', 'GLV-NIT-M',   55),
  ('Puchong',   'GLV-NIT-M',   50),
  ('Kepong',    'ALG-FST-500', 18),
  ('Jadehills', 'ALG-FST-500', 15),
  ('Puchong',   'ALG-FST-500', 14),
  ('Kepong',    'CMP-A2-4G',   14),
  ('Jadehills', 'CMP-A2-4G',   12),
  ('Puchong',   'CMP-A2-4G',   10),
  ('Kepong',    'ANE-LID-2P',  45),
  ('Jadehills', 'ANE-LID-2P',  40),
  ('Puchong',   'ANE-LID-2P',  35),
  ('Kepong',    'BUR-DIA-FG',   6),
  ('Jadehills', 'BUR-DIA-FG',   5),
  ('Puchong',   'BUR-DIA-FG',   4)
) as b(branch_id, sku, quantity)
join public.inventory i on i.sku = b.sku
on conflict (branch_id, item_id) do nothing;

-- 4. INVENTORY_TRANSACTIONS (initial history, referencing by SKU)
insert into public.inventory_transactions (type, item_id, item_name, quantity, unit, from_location, to_location, status, created_at)
select 'TRANSFER', i.id, 'Dental Implant Screws 4.0mm', 10, 'Units', 'Kepong Branch', 'Jadehills Branch', 'COMPLETED', '2023-10-26T10:30:00Z'
from public.inventory i where i.sku = 'IMP-400-T';

insert into public.inventory_transactions (type, item_id, item_name, quantity, unit, from_location, to_location, status, created_at)
select 'STOCK_IN', i.id, 'Composite Resin A2', 20, 'Syringes', 'Supplier: Dentcare', 'Kepong Branch', 'COMPLETED', '2023-10-25T14:15:00Z'
from public.inventory i where i.sku = 'CMP-A2-4G';

-- 5. AUDIT_LOGS
insert into public.audit_logs (date, branch, auditor, auditor_avatar, items_checked, status, is_recent) values
  ('Today, 09:30 AM', 'Main Branch', 'System Manager',  'https://picsum.photos/seed/admin/100/100',  1284, 'ZERO DISCREPANCY',  true),
  ('Oct 24, 2023',    'Main Branch', 'Dr. Sarah Chen',  'https://picsum.photos/seed/sarah/100/100',  1284, 'ZERO DISCREPANCY',  false),
  ('Oct 22, 2023',    'Main Branch', 'Marcus Wong',     'https://picsum.photos/seed/marcus/100/100',  412, '3 ITEMS MISMATCH',  false);

-- 6. AUDIT_MISMATCHES (for the mismatch audit)
insert into public.audit_mismatches (audit_log_id, name, sku, expected, actual, remark)
select al.id, m.name, m.sku, m.expected, m.actual, m.remark
from public.audit_logs al
cross join (values
  ('Dental Implant Screws 4.0mm', 'IMP-400-T',  22,  18, 'Used in morning surgery, forgot to log.'),
  ('Composite Resin (A2 Shade)',  'BD-RES-045', 20,  24, 'Found extra unlogged boxes in back drawer.'),
  ('Sterile Gauze Pads (4x4)',    'BD-GAU-089', 520, 500, 'Dispensed to hygiene room.')
) as m(name, sku, expected, actual, remark)
where al.status = '3 ITEMS MISMATCH';

-- 7. ACTIVITIES (recent activity feed)
insert into public.activities (type, title, location, time) values
  ('audit',    'Audit Completed',            'Main Branch',       'Today, 9:30 AM'),
  ('restock',  'Restock: Ortho-Brackets',    'Jadehills',         '12 mins ago'),
  ('transfer', 'Transfer: Local Anesthetic', 'Kepong → Puchong',  '1 hour ago');

-- 8. SUPPLIERS
insert into public.suppliers (name) values
  ('Dentcare Solutions Sdn Bhd'),
  ('MediGlove Malaysia'),
  ('ProDental Supplies'),
  ('MedSupply Asia Pacific')
on conflict (name) do nothing;

-- 9. ROLE_PERMISSIONS
insert into public.role_permissions (permission_name, admin, manager, staff) values
  ('View Master Inventory',    true,  true,  false),
  ('Perform Stock Audit',      true,  true,  true),
  ('Log Stock Usage',          true,  true,  true),
  ('Create Purchase Orders',   true,  true,  false),
  ('View Transaction Records', true,  true,  false),
  ('Export Reports & Data',    true,  false, false),
  ('Edit Item Catalog',        true,  false, false),
  ('Approve Transfers',        true,  true,  false),
  ('Manage Users',             true,  false, false),
  ('Modify System Settings',   true,  false, false)
on conflict (permission_name) do nothing;

-- 10. PROCUREMENT_ORDERS (sample POs)
insert into public.procurement_orders (id, po_number, supplier, total_cost, status, expected_delivery, notes, payment_status, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'PO-2023-001', 'Dentcare Solutions Sdn Bhd', 23210.00, 'SUBMITTED', '2023-11-15', 'Urgent restock — stock critical', 'UNPAID', '2023-10-25T00:00:00Z'),
  ('b0000000-0000-0000-0000-000000000002', 'PO-2023-002', 'MedSupply Asia Pacific',      8450.00, 'DRAFT',     '2023-11-20', null,                              'UNPAID', '2023-10-26T00:00:00Z');

-- 11. PROCUREMENT_ORDER_ITEMS
insert into public.procurement_order_items (order_id, item_name, sku, quantity, unit, unit_price) values
  ('b0000000-0000-0000-0000-000000000001', 'Dental Implant Screws 4.0mm',  'IMP-400-T',   50, 'Units',  450.00),
  ('b0000000-0000-0000-0000-000000000001', 'Nitrile Exam Gloves (Medium)', 'GLV-NIT-M',   20, 'Boxes',   35.50),
  ('b0000000-0000-0000-0000-000000000002', 'Alginate Impression Material',  'ALG-FST-500', 30, 'Packs',  125.00),
  ('b0000000-0000-0000-0000-000000000002', 'Dental Burs (Diamond FG)',      'BUR-DIA-FG',  50, 'Packs',   65.00);
