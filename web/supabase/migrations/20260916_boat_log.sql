-- ─────────────────────────────────────────────────────────────
-- 20260916_boat_log.sql
-- Boat Log ("BA Hours") — engine-hours tracking after each ride.
-- Kiosk page: bell-acqua-boatlog.html (iPad / phone friendly).
--
-- One row per ride (or fuel/maintenance entry). Rows can be
-- created from a calendar booking (member / B/I / ski ride) or
-- entered manually for rides that never hit a calendar.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.boat_log (
  id             uuid primary key default gen_random_uuid(),
  log_date       date not null,
  ride_time      text,                                -- "HH:MM" 24h start time (optional)
  person_name    text not null,
  guest_name     text,
  activity       text not null default 'Member Ride', -- Member Ride | B/I Lesson | Ski Ride | Fuel | Maintenance | Other
  boat           text,
  engine_start   numeric(10,1),                       -- engine-hour meter at start
  engine_stop    numeric(10,1),                       -- engine-hour meter at stop
  hours          numeric(10,1),                       -- qty used (auto = stop - start, manually overridable)
  driver         text,                                -- coach / boat driver
  notes          text,
  booking_source text not null default 'manual',      -- member | public | manual
  booking_id     text,                                -- member_bookings.id::text or bookings.id (BAL-XXXX)
  slot_key       text,                                -- stable key so a calendar ride can only be logged once
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists boat_log_date_idx on public.boat_log (log_date desc);

-- A calendar ride can only be logged once (manual rows have slot_key null and are exempt)
create unique index if not exists boat_log_slot_key_uidx
  on public.boat_log (slot_key) where slot_key is not null;

alter table public.boat_log enable row level security;

-- Kiosk runs on the anon key (same trust model as the staff dashboard).
-- Read + insert + update allowed; NO delete policy — entries can be
-- corrected but never removed from the kiosk. Deletions go through the
-- SQL editor if ever needed.
drop policy if exists boat_log_read   on public.boat_log;
drop policy if exists boat_log_insert on public.boat_log;
drop policy if exists boat_log_update on public.boat_log;

create policy boat_log_read   on public.boat_log for select using (true);
create policy boat_log_insert on public.boat_log for insert with check (true);
create policy boat_log_update on public.boat_log for update using (true) with check (true);
