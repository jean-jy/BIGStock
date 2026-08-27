-- Per-item switch for low-stock alerts.
-- Default true keeps existing behavior; set false to mute an item's
-- low-stock notifications (bell) and dashboard restock alerts.
alter table public.inventory
  add column if not exists low_stock_alert boolean not null default true;
