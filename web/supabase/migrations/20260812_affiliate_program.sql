-- ─────────────────────────────────────────────────────────────
-- Affiliate / Referral Program — 2026-08-12
-- Every lead or customer can create an affiliate account and gets
-- a unique referral URL (booking page + ?ref=CODE).
--   · Friend gets friend_discount_pct (20%) off their FIRST booking
--   · Affiliate earns reward_pct (20%) credit as a one-time coupon
--     for their own next booking, auto-generated at checkout
--   · Tier-ready: both percentages are per-affiliate columns, so
--     future tiers just update these numbers per affiliate
-- Replaces the never-deployed referral_rewards design.
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.referral_rewards;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS referrer_email text;

-- ── Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  email               text        NOT NULL,
  code                text        NOT NULL UNIQUE,
  dash_token          text        NOT NULL UNIQUE,
  friend_discount_pct numeric     NOT NULL DEFAULT 20,  -- what the referred friend gets off their 1st booking
  reward_pct          numeric     NOT NULL DEFAULT 20,  -- credit the affiliate earns per completed referral
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliates_email_key
  ON public.affiliates (lower(email));

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id       uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  affiliate_code     text        NOT NULL,
  referred_email     text        NOT NULL,
  referred_name      text,
  booking_id         text        NOT NULL,
  discount_pct       numeric     NOT NULL DEFAULT 20,   -- % the friend actually got
  credit_pct         numeric     NOT NULL DEFAULT 20,   -- % credit the affiliate earned
  credit_coupon_code text,                              -- one-time coupon generated for the affiliate
  status             text        NOT NULL DEFAULT 'earned'
                                 CHECK (status IN ('earned','void')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Anti-abuse: a referred customer can only ever generate ONE credit,
-- regardless of bookings made or which affiliate referred them.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_referrals_referred_email_key
  ON public.affiliate_referrals (lower(referred_email));

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_referrals_booking_id_key
  ON public.affiliate_referrals (booking_id);

-- ── Security model ───────────────────────────────────────────
-- Tables are locked to anon; all reads/writes flow through
-- SECURITY DEFINER functions so dash tokens never leak.
-- The staff dashboard reads through the affiliates_public view
-- (no dash_token) and affiliate_referrals (consistent with the
-- existing anon-readable bookings/waivers model).

ALTER TABLE public.affiliates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read affiliate referrals" ON public.affiliate_referrals;
CREATE POLICY "anon can read affiliate referrals"
  ON public.affiliate_referrals FOR SELECT
  TO anon
  USING (true);

CREATE OR REPLACE VIEW public.affiliates_public AS
  SELECT id, name, email, code, friend_discount_pct, reward_pct, is_active, created_at
  FROM public.affiliates;

GRANT SELECT ON public.affiliates_public TO anon;

-- ── RPC: create (or fetch) an affiliate account ──────────────
CREATE OR REPLACE FUNCTION public.affiliate_get_or_create(p_name text, p_email text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row      affiliates%ROWTYPE;
  v_code     text;
  v_base     text;
  v_existing boolean := false;
BEGIN
  IF coalesce(trim(p_name),'') = '' OR p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_row FROM affiliates WHERE lower(email) = lower(trim(p_email));
  IF FOUND THEN
    v_existing := true;
  ELSE
    -- Code = first name (letters only, max 8) + '-' + 4 random chars
    v_base := upper(regexp_replace(split_part(trim(p_name),' ',1), '[^a-zA-Z]', '', 'g'));
    v_base := coalesce(nullif(substr(v_base, 1, 8), ''), 'SKI');
    LOOP
      v_code := v_base || '-' || upper(substr(md5(random()::text), 1, 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM affiliates    WHERE code = v_code)
           AND  NOT EXISTS (SELECT 1 FROM coupon_codes  WHERE code = v_code);
    END LOOP;

    INSERT INTO affiliates (name, email, code, dash_token)
    VALUES (trim(p_name), lower(trim(p_email)), v_code,
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    RETURNING * INTO v_row;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'existing', v_existing,
    'name', v_row.name,
    'email', v_row.email,
    'code', v_row.code,
    'token', v_row.dash_token,
    'friend_discount_pct', v_row.friend_discount_pct,
    'reward_pct', v_row.reward_pct
  );
END $$;

-- ── RPC: dashboard data by private token ─────────────────────
CREATE OR REPLACE FUNCTION public.affiliate_dashboard(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row affiliates%ROWTYPE;
  v_refs json;
BEGIN
  SELECT * INTO v_row FROM affiliates WHERE dash_token = p_token;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT coalesce(json_agg(json_build_object(
           'referred_name',      r.referred_name,
           'created_at',         r.created_at,
           'credit_pct',         r.credit_pct,
           'credit_coupon_code', r.credit_coupon_code,
           'status',             r.status,
           'credit_used',        (c.uses_count IS NOT NULL AND c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses),
           'credit_active',      coalesce(c.is_active, false)
         ) ORDER BY r.created_at DESC), '[]'::json)
    INTO v_refs
    FROM affiliate_referrals r
    LEFT JOIN coupon_codes c ON c.code = r.credit_coupon_code
   WHERE r.affiliate_id = v_row.id;

  RETURN json_build_object(
    'ok', true,
    'name', v_row.name,
    'email', v_row.email,
    'code', v_row.code,
    'is_active', v_row.is_active,
    'friend_discount_pct', v_row.friend_discount_pct,
    'reward_pct', v_row.reward_pct,
    'referrals', v_refs
  );
END $$;

-- ── RPC: validate a referral code at booking time ────────────
CREATE OR REPLACE FUNCTION public.affiliate_validate_code(p_code text, p_email text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row affiliates%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM affiliates
   WHERE upper(code) = upper(trim(p_code)) AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason', 'invalid');
  END IF;

  IF lower(v_row.email) = lower(trim(p_email)) THEN
    RETURN json_build_object('valid', false, 'reason', 'self');
  END IF;

  IF EXISTS (SELECT 1 FROM affiliate_referrals WHERE lower(referred_email) = lower(trim(p_email))) THEN
    RETURN json_build_object('valid', false, 'reason', 'already_referred');
  END IF;

  IF EXISTS (SELECT 1 FROM bookings
              WHERE lower(email) = lower(trim(p_email)) AND status <> 'cancelled') THEN
    RETURN json_build_object('valid', false, 'reason', 'not_first');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'code', v_row.code,
    'discount_pct', v_row.friend_discount_pct,
    'affiliate_first_name', split_part(v_row.name, ' ', 1)
  );
END $$;

-- ── RPC: record a completed referral + mint the credit coupon ─
CREATE OR REPLACE FUNCTION public.affiliate_record_referral(
  p_code text, p_referred_email text, p_referred_name text, p_booking_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row    affiliates%ROWTYPE;
  v_credit text;
BEGIN
  SELECT * INTO v_row FROM affiliates
   WHERE upper(code) = upper(trim(p_code)) AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF lower(v_row.email) = lower(trim(p_referred_email)) THEN
    RETURN json_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Mint a unique one-time credit coupon code
  LOOP
    v_credit := 'CREDIT-' || upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM coupon_codes WHERE code = v_credit)
         AND  NOT EXISTS (SELECT 1 FROM affiliates   WHERE code = v_credit);
  END LOOP;

  -- Unique indexes enforce one credit per referred email / booking
  BEGIN
    INSERT INTO affiliate_referrals
      (affiliate_id, affiliate_code, referred_email, referred_name,
       booking_id, discount_pct, credit_pct, credit_coupon_code)
    VALUES
      (v_row.id, v_row.code, lower(trim(p_referred_email)), p_referred_name,
       p_booking_id, v_row.friend_discount_pct, v_row.reward_pct, v_credit);
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'reason', 'duplicate');
  END;

  INSERT INTO coupon_codes (code, discount_type, discount_value, max_uses, is_active, description)
  VALUES (v_credit, 'percent', v_row.reward_pct, 1, true,
          'Referral credit — ' || v_row.email);

  UPDATE bookings SET referrer_email = v_row.email WHERE id = p_booking_id;

  RETURN json_build_object(
    'ok', true,
    'credit_coupon_code', v_credit,
    'reward_pct', v_row.reward_pct,
    'affiliate_name', v_row.name,
    'affiliate_email', v_row.email
  );
END $$;

-- ── RPC: staff toggle (used by the PIN-gated staff dashboard) ─
CREATE OR REPLACE FUNCTION public.affiliate_set_active(p_id uuid, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE affiliates SET is_active = p_active WHERE id = p_id;
  RETURN json_build_object('ok', FOUND);
END $$;

GRANT EXECUTE ON FUNCTION public.affiliate_get_or_create(text, text)                 TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_dashboard(text)                            TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_validate_code(text, text)                  TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_record_referral(text, text, text, text)    TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_set_active(uuid, boolean)                  TO anon;
