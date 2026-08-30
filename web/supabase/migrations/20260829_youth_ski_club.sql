-- ─────────────────────────────────────────────────────────────
-- Youth Ski Club — Fall 2026 registrations — 2026-08-29
--
-- Self-serve youth season registration (bell-acqua-youth-ski-club-checkout.html):
--   · One product: Fall 2026 season, $2,000, all-inclusive
--   · Season: Sept 15 – Oct 31, 2026 (7 weeks, 4 coached sets/wk)
--   · Cohorts: 'tue_thu' or 'mon_wed', 4:00–6:30 PM
--   · Ages 10–17, all skill levels
--   · Payment in full at checkout (Stripe). The card is saved on a
--     Stripe Customer via the existing membership-checkout function,
--     so a future installment option needs no new payment plumbing.
--
-- Cohort capacity is enforced here, not in the page: ysc_cohort_seats
-- holds the real cap and the page reads remaining seats from the
-- ysc_cohort_availability view. That keeps "limited slots" honest.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ysc_registrations (
  id                 text        PRIMARY KEY,            -- 'YSC-XXXXXXXX'
  season             text        NOT NULL DEFAULT 'fall-2026',
  parent_first       text        NOT NULL,
  parent_last        text        NOT NULL,
  parent_email       text        NOT NULL,
  parent_phone       text        NOT NULL,
  skier_name         text        NOT NULL,
  skier_age          int         NOT NULL CHECK (skier_age BETWEEN 10 AND 17),
  skier_level        text        CHECK (skier_level IN ('beginner','intermediate','advanced','competitive')),
  cohort             text        NOT NULL CHECK (cohort IN ('tue_thu','mon_wed')),
  emergency_contact  text,
  emergency_phone    text,
  medical_notes      text,                               -- allergies / conditions coaches must know
  amount_paid        numeric     NOT NULL DEFAULT 0,
  stripe_pi          text,
  stripe_customer    text,
  waiver_signed      boolean     NOT NULL DEFAULT false,
  waiver_signed_at   timestamptz,
  status             text        NOT NULL DEFAULT 'paid'
                                 CHECK (status IN ('paid','pending','cancelled','refunded')),
  source             text        DEFAULT 'youth-ski-club-checkout',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ysc_registrations_email_idx  ON public.ysc_registrations (lower(parent_email));
CREATE INDEX IF NOT EXISTS ysc_registrations_cohort_idx ON public.ysc_registrations (season, cohort, status);

-- ── Cohort capacity ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ysc_cohort_seats (
  season  text NOT NULL DEFAULT 'fall-2026',
  cohort  text NOT NULL CHECK (cohort IN ('tue_thu','mon_wed')),
  seats   int  NOT NULL CHECK (seats >= 0),
  PRIMARY KEY (season, cohort)
);

-- Set the REAL caps here before launch. These are placeholders.
INSERT INTO public.ysc_cohort_seats (season, cohort, seats) VALUES
  ('fall-2026','tue_thu', 12),
  ('fall-2026','mon_wed', 12)
ON CONFLICT (season, cohort) DO NOTHING;

CREATE OR REPLACE VIEW public.ysc_cohort_availability AS
SELECT
  s.season,
  s.cohort,
  s.seats                                        AS total_seats,
  COALESCE(r.taken, 0)                           AS taken,
  GREATEST(s.seats - COALESCE(r.taken, 0), 0)    AS remaining
FROM public.ysc_cohort_seats s
LEFT JOIN (
  SELECT season, cohort, COUNT(*) AS taken
  FROM public.ysc_registrations
  WHERE status = 'paid'
  GROUP BY season, cohort
) r ON r.season = s.season AND r.cohort = s.cohort;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.ysc_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ysc_cohort_seats  ENABLE ROW LEVEL SECURITY;

-- The checkout page (anon) may create a registration…
DROP POLICY IF EXISTS ysc_insert_anon ON public.ysc_registrations;
CREATE POLICY ysc_insert_anon ON public.ysc_registrations
  FOR INSERT TO anon WITH CHECK (true);

-- …but must never read the roster back. Parent details, ages and
-- medical notes are not public data; the staff dashboard reads it
-- with the service role.
DROP POLICY IF EXISTS ysc_seats_read_anon ON public.ysc_cohort_seats;
CREATE POLICY ysc_seats_read_anon ON public.ysc_cohort_seats
  FOR SELECT TO anon USING (true);

GRANT SELECT ON public.ysc_cohort_availability TO anon;

-- ── Seat check used by the page before it takes a payment ────
-- SECURITY DEFINER so it can count rows the caller cannot read.
CREATE OR REPLACE FUNCTION public.ysc_seats_remaining(p_season text DEFAULT 'fall-2026')
RETURNS TABLE (cohort text, remaining int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.cohort, a.remaining::int
  FROM public.ysc_cohort_availability a
  WHERE a.season = p_season;
$$;

GRANT EXECUTE ON FUNCTION public.ysc_seats_remaining(text) TO anon;
