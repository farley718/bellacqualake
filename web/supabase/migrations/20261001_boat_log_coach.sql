-- Boat log: separate Coach from Driver — 2026-10-01
-- Mike's request: the coach and the boat driver are two different people.
-- `driver` stays as the boat driver; `coach` is new (optional).
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
alter table public.boat_log add column if not exists coach text;
