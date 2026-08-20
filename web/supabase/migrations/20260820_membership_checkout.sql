-- ─────────────────────────────────────────────────────────────
-- Membership Checkout — 2026-08-20
--
-- Self-serve membership purchase (bell-acqua-membership.html):
--   · Plans: midweek $1,897 / unlimited $2,697
--   · Add-ons: locker $200/yr, guest-pass book (10) $300
--   · Supplementary members: $1,897 each (either plan)
--   · Terms: full at signing, or 4 quarterly installments
--     (midweek $525×4, unlimited $700×4; first due at checkout)
--   · Contract signed in-flow (signature stored on the row)
--   · On payment: auth signup + membership_activate() provisions
--     the profiles row so the member portal works immediately
--
-- profiles.membership_type drives the portal booking rule:
--   'midweek' members can only book Mon–Thu.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.memberships (
  id                 text        PRIMARY KEY,   -- 'BAM-XXXXXXXX'
  first_name         text        NOT NULL,
  last_name          text        NOT NULL,
  email              text        NOT NULL,
  phone              text,
  address            text,
  emergency_contact  text,
  drivers_license    text,
  date_of_birth      text,
  plan               text        NOT NULL CHECK (plan IN ('midweek','unlimited')),
  addons             jsonb       NOT NULL DEFAULT '[]',  -- [{key,label,price}]
  supplementary      jsonb       NOT NULL DEFAULT '[]',  -- [{name,email}] — $1,897 each
  payment_term       text        NOT NULL CHECK (payment_term IN ('full','installment')),
  total_amount       numeric     NOT NULL,               -- full contract value
  amount_paid        numeric     NOT NULL DEFAULT 0,
  installment_amount numeric,                            -- per-quarter amount when term = installment
  membership_start   date        NOT NULL,
  membership_end     date        NOT NULL,
  waiver_name        text,                               -- printed name on the signed contract
  waiver_signature   text,                               -- signature pad dataURL
  waiver_signed_at   timestamptz,
  contract_version   text        NOT NULL DEFAULT '2026-08',
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','pending','cancelled')),
  stripe_pi          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memberships_email_idx ON public.memberships (lower(email));

CREATE TABLE IF NOT EXISTS public.membership_payments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  text        NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  seq            integer     NOT NULL,        -- 1..4 (1 for full-payment contracts)
  amount         numeric     NOT NULL,
  due_date       date        NOT NULL,
  status         text        NOT NULL DEFAULT 'due'
                             CHECK (status IN ('due','paid','late','cancelled')),
  paid_at        timestamptz,
  stripe_pi      text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_payments_membership_idx
  ON public.membership_payments (membership_id);

-- Same trust model as the rest of the app: checkout + PIN-gated
-- staff dashboard both talk to the API with the anon key.
ALTER TABLE public.memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read memberships" ON public.memberships;
CREATE POLICY "read memberships"
  ON public.memberships FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon insert memberships" ON public.memberships;
CREATE POLICY "anon insert memberships"
  ON public.memberships FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update memberships" ON public.memberships;
CREATE POLICY "anon update memberships"
  ON public.memberships FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read membership payments" ON public.membership_payments;
CREATE POLICY "read membership payments"
  ON public.membership_payments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon insert membership payments" ON public.membership_payments;
CREATE POLICY "anon insert membership payments"
  ON public.membership_payments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update membership payments" ON public.membership_payments;
CREATE POLICY "anon update membership payments"
  ON public.membership_payments FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Portal booking rule lives on the profile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS membership_type text;

-- ── RPC: provision the member-portal profile after checkout ──
-- Called after the auth signup; matches the auth user by email so
-- it works whether the account was just created or already existed.
CREATE OR REPLACE FUNCTION public.membership_activate(p_membership_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_m   memberships%ROWTYPE;
  v_uid uuid;
BEGIN
  SELECT * INTO v_m FROM memberships WHERE id = p_membership_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'membership_not_found');
  END IF;

  SELECT id INTO v_uid FROM auth.users
   WHERE lower(email) = lower(v_m.email)
   ORDER BY created_at DESC LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  INSERT INTO profiles (id, email, first_name, last_name,
                        membership_start, membership_end, membership_type)
  VALUES (v_uid, lower(v_m.email), v_m.first_name, v_m.last_name,
          v_m.membership_start, v_m.membership_end, v_m.plan)
  ON CONFLICT (id) DO UPDATE
    SET first_name       = EXCLUDED.first_name,
        last_name        = EXCLUDED.last_name,
        membership_start = EXCLUDED.membership_start,
        membership_end   = EXCLUDED.membership_end,
        membership_type  = EXCLUDED.membership_type;

  RETURN json_build_object('ok', true, 'user_id', v_uid);
END $$;

GRANT EXECUTE ON FUNCTION public.membership_activate(text) TO anon;

NOTIFY pgrst, 'reload schema';
