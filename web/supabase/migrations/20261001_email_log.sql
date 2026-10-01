-- ─────────────────────────────────────────────────────────────
-- App email (Resend) — foundation — 2026-10-01
--
-- email_log records every transactional email the app sends through
-- the `send-email` edge function (who, what, when, Resend id, result).
-- The staff dashboard shows it in the ✉️ Emails tab.
--
-- Written only by the edge function (service role). Anyone with the
-- anon key can read it, same as the other staff-dashboard tables.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.email_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  event         text not null,            -- waiver_request | booking_confirmed | test | …
  to_email      text not null,
  to_name       text,
  subject       text not null,
  status        text not null,            -- sent | failed | skipped
  resend_id     text,                     -- id returned by Resend when sent
  error         text,
  booking_id    text,
  membership_id text,
  meta          jsonb not null default '{}'::jsonb
);

create index if not exists email_log_created_idx  on public.email_log (created_at desc);
create index if not exists email_log_booking_idx  on public.email_log (booking_id);
create index if not exists email_log_dedupe_idx   on public.email_log (event, booking_id, lower(to_email));

alter table public.email_log enable row level security;

drop policy if exists "read email_log" on public.email_log;
create policy "read email_log"
  on public.email_log for select to anon, authenticated using (true);
-- no insert/update/delete policies: only the service role (edge function) writes.
