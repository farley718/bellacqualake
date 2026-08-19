-- ─────────────────────────────────────────────────────────────
-- Time-Range Blocking + Editable Affiliate Rewards — 2026-08-20
--
-- 1. blocked_ranges: staff can block a time window (e.g. Sep 19,
--    2:00 PM → dark) on any combination of the three calendars
--    (bi = Beginner/Intermediate, srl = Ski Ride w/ Lesson,
--    member = Member portal). Each calendar page hides any slot
--    that OVERLAPS a range targeting it — no more slot-id
--    mismatches between the hourly staff picker and the :30/:15
--    grids. Full-day blocks stay in blocked_dates as before.
--
-- 2. app_settings + reward RPCs: staff can edit the referral
--    program's friend discount % and affiliate reward % — per
--    affiliate, and the defaults applied to new signups.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

-- ── 1. Blocked time ranges ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blocked_ranges (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date        NOT NULL,
  start_min  integer     NOT NULL CHECK (start_min >= 0   AND start_min < 1440),
  end_min    integer     NOT NULL CHECK (end_min   > 0    AND end_min  <= 1440),
  calendars  text[]      NOT NULL DEFAULT '{bi,srl,member}',
  reason     text,
  blocked_by text        NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_min > start_min)
);

CREATE INDEX IF NOT EXISTS blocked_ranges_date_idx ON public.blocked_ranges (date);

ALTER TABLE public.blocked_ranges ENABLE ROW LEVEL SECURITY;

-- Same trust model as blocked_dates / blocked_slots: the staff
-- dashboard is PIN-gated client-side and writes with the anon key.
-- Members read with an authenticated JWT, so grant both roles.
DROP POLICY IF EXISTS "read blocked ranges"   ON public.blocked_ranges;
CREATE POLICY "read blocked ranges"
  ON public.blocked_ranges FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon insert blocked ranges" ON public.blocked_ranges;
CREATE POLICY "anon insert blocked ranges"
  ON public.blocked_ranges FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete blocked ranges" ON public.blocked_ranges;
CREATE POLICY "anon delete blocked ranges"
  ON public.blocked_ranges FOR DELETE TO anon USING (true);

-- The member portal reads full-day blocks too, but blocked_dates
-- was only ever opened to anon. Add an authenticated read policy.
DROP POLICY IF EXISTS "authenticated read blocked dates" ON public.blocked_dates;
CREATE POLICY "authenticated read blocked dates"
  ON public.blocked_dates FOR SELECT TO authenticated USING (true);

-- ── 2. App settings (affiliate program defaults) ─────────────

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read app settings" ON public.app_settings;
CREATE POLICY "read app settings"
  ON public.app_settings FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_settings (key, value)
VALUES ('affiliate_defaults', '{"friend_discount_pct": 20, "reward_pct": 20}')
ON CONFLICT (key) DO NOTHING;

-- ── 3. RPC: edit one affiliate's reward percentages ──────────

CREATE OR REPLACE FUNCTION public.affiliate_set_rewards(
  p_id uuid, p_friend_pct numeric, p_reward_pct numeric)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_friend_pct IS NULL OR p_reward_pct IS NULL
     OR p_friend_pct < 0 OR p_friend_pct > 100
     OR p_reward_pct < 0 OR p_reward_pct > 100 THEN
    RETURN json_build_object('ok', false, 'reason', 'out_of_range');
  END IF;

  UPDATE affiliates
     SET friend_discount_pct = p_friend_pct,
         reward_pct          = p_reward_pct
   WHERE id = p_id;

  RETURN json_build_object('ok', FOUND);
END $$;

-- ── 4. RPC: edit program defaults (new signups), optionally
--          pushing the new numbers to all existing affiliates ──

CREATE OR REPLACE FUNCTION public.affiliate_set_defaults(
  p_friend_pct numeric, p_reward_pct numeric, p_apply_existing boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_friend_pct IS NULL OR p_reward_pct IS NULL
     OR p_friend_pct < 0 OR p_friend_pct > 100
     OR p_reward_pct < 0 OR p_reward_pct > 100 THEN
    RETURN json_build_object('ok', false, 'reason', 'out_of_range');
  END IF;

  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('affiliate_defaults',
          json_build_object('friend_discount_pct', p_friend_pct,
                            'reward_pct',          p_reward_pct)::jsonb,
          now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  IF p_apply_existing THEN
    UPDATE affiliates
       SET friend_discount_pct = p_friend_pct,
           reward_pct          = p_reward_pct;
  END IF;

  RETURN json_build_object('ok', true, 'applied_existing', p_apply_existing);
END $$;

-- ── 5. New affiliates pick up the editable defaults ──────────

CREATE OR REPLACE FUNCTION public.affiliate_get_or_create(p_name text, p_email text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row      affiliates%ROWTYPE;
  v_code     text;
  v_base     text;
  v_existing boolean := false;
  v_friend   numeric := 20;
  v_reward   numeric := 20;
BEGIN
  IF coalesce(trim(p_name),'') = '' OR p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_row FROM affiliates WHERE lower(email) = lower(trim(p_email));
  IF FOUND THEN
    v_existing := true;
  ELSE
    SELECT coalesce((value->>'friend_discount_pct')::numeric, 20),
           coalesce((value->>'reward_pct')::numeric, 20)
      INTO v_friend, v_reward
      FROM app_settings WHERE key = 'affiliate_defaults';
    IF NOT FOUND THEN v_friend := 20; v_reward := 20; END IF;

    -- Code = first name (letters only, max 8) + '-' + 4 random chars
    v_base := upper(regexp_replace(split_part(trim(p_name),' ',1), '[^a-zA-Z]', '', 'g'));
    v_base := coalesce(nullif(substr(v_base, 1, 8), ''), 'SKI');
    LOOP
      v_code := v_base || '-' || upper(substr(md5(random()::text), 1, 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM affiliates    WHERE code = v_code)
           AND  NOT EXISTS (SELECT 1 FROM coupon_codes  WHERE code = v_code);
    END LOOP;

    INSERT INTO affiliates (name, email, code, dash_token, friend_discount_pct, reward_pct)
    VALUES (trim(p_name), lower(trim(p_email)), v_code,
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
            v_friend, v_reward)
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

GRANT EXECUTE ON FUNCTION public.affiliate_set_rewards(uuid, numeric, numeric)            TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_set_defaults(numeric, numeric, boolean)        TO anon;
GRANT EXECUTE ON FUNCTION public.affiliate_get_or_create(text, text)                      TO anon;
