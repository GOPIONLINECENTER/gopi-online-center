-- Run in Supabase Dashboard > SQL Editor after taking a database backup.
-- Adds payment tracking fields without changing your existing order_status workflow.
alter table public.orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists paid_at timestamptz;

create unique index if not exists orders_razorpay_payment_id_unique
  on public.orders (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists orders_payment_status_idx on public.orders (payment_status);
