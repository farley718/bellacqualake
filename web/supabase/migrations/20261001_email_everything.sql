-- ─────────────────────────────────────────────────────────────
-- App email — everything else — 2026-10-01
--
-- 1. ysc_leads: Youth Ski Club landing-form leads, so the app can run
--    the 5-email nurture itself (GHL still gets the webhook for CRM).
-- 2. Daily email job (pg_cron → send-email "daily"): booking reminders
--    for tomorrow, member ride reminders, membership-expiring notices
--    (30 and 7 days), youth club nurture steps.
--
-- BEFORE RUNNING: replace YOUR_CRON_SECRET below with the same value
-- that is set as the CRON_SECRET edge-function secret (the one the
-- installment charger already uses).
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

-- 1 ───────────────────────────────────────────────────────────
create table if not exists public.ysc_leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  first_name  text,
  last_name   text,
  email       text not null,
  phone       text,
  skier_name  text,
  skier_age   text,
  preferred_schedule text,
  source      text default 'youth-ski-club-landing',
  page_url    text,
  status      text not null default 'open' check (status in ('open','paid','stopped'))
);
create index if not exists ysc_leads_email_idx on public.ysc_leads (lower(email));

alter table public.ysc_leads enable row level security;
-- The public landing form inserts a lead; nobody reads leads with the anon key
-- (contact details). The edge function reads them with the service role.
drop policy if exists "anon insert ysc_leads" on public.ysc_leads;
create policy "anon insert ysc_leads" on public.ysc_leads for insert to anon with check (true);

-- 2 ───────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 16:00 UTC = 9:00 AM Pacific (8:00 AM during daylight time): reminders land in the morning.
select cron.unschedule('bal-daily-emails') where exists (select 1 from cron.job where jobname = 'bal-daily-emails');
select cron.schedule(
  'bal-daily-emails',
  '0 16 * * *',
  $$
  select net.http_post(
    url     := 'https://euznpkrkkaieykznztho.supabase.co/functions/v1/send-email',
    headers := '{"Content-Type":"application/json","x-cron-key":"YOUR_CRON_SECRET"}'::jsonb,
    body    := '{"event":"daily"}'::jsonb
  );
  $$
);
