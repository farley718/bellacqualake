-- ─────────────────────────────────────────────────────────────
-- NCWSA Nationals Banquet — paid ticket tracking — 2026-10-08
--
-- Square notifies the `square-webhook` edge function on every payment.
-- Banquet ticket payments (the "NCWSA Nationals Banquet 2026" event
-- link) are recorded here with buyer name, email and ticket count, so
-- staff can see who paid. The function then emails the buyer a
-- confirmation (send-email) and tags the contact in GHL as paid.
--
-- Written only by the edge function (service role). Anyone with the
-- anon key can read it (staff dashboard 🎟 Banquet tab).
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.banquet_orders (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  square_payment_id  text not null unique,
  square_order_id    text,
  square_location_id text,
  receipt_url        text,
  buyer_name         text,
  buyer_email        text,
  buyer_phone        text,
  item_name          text,
  quantity           int not null default 1,
  amount_cents       int not null default 0,
  currency           text not null default 'USD',
  status             text not null default 'paid' check (status in ('paid','refunded','cancelled')),
  source             text not null default 'square',
  raw                jsonb not null default '{}'::jsonb
);

create index if not exists banquet_orders_email_idx on public.banquet_orders (lower(buyer_email));
create index if not exists banquet_orders_paid_idx  on public.banquet_orders (paid_at desc);

alter table public.banquet_orders enable row level security;

drop policy if exists "read banquet_orders" on public.banquet_orders;
create policy "read banquet_orders"
  on public.banquet_orders for select to anon, authenticated using (true);
-- no insert/update/delete policies: only the service role (edge function) writes.

-- Raw Square events, kept for troubleshooting / replay (service role only).
create table if not exists public.square_events (
  id          uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event_id    text unique,
  event_type  text,
  handled     boolean not null default false,
  note        text,
  payload     jsonb not null default '{}'::jsonb
);
alter table public.square_events enable row level security;
