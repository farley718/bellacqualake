-- ─────────────────────────────────────────────────────────────
-- Youth Ski Club — in-flow waiver — 2026-08-30
--
-- The checkout now collects the Waiver & Release of Liability as
-- step 3 (before payment): sections A–E agreement, photo release,
-- parent/guardian printed name and a drawn signature. These
-- columns store that record on the registration itself.
--
-- The page degrades safely if this hasn't run: on a column error
-- it retries the insert without the three new columns, so a paid
-- registration is never lost — but run this BEFORE going live so
-- signatures are actually kept.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.ysc_registrations
  ADD COLUMN IF NOT EXISTS waiver_signer    text,     -- parent/guardian printed name
  ADD COLUMN IF NOT EXISTS waiver_signature text,     -- PNG data URI from the signature pad
  ADD COLUMN IF NOT EXISTS photo_consent    boolean;  -- photo release: true = consented

NOTIFY pgrst, 'reload schema';
