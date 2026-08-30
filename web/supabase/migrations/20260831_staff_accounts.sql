-- ─────────────────────────────────────────────────────────────
-- Staff accounts, audit log & roster-driven notifications — 2026-08-31
--
-- Replaces the shared staff PIN with per-staff logins:
--   · staff_members: each person gets their own PIN (bcrypt-hashed),
--     a role ('admin' manages staff; 'coach' does everything else),
--     and a notify_new_bookings toggle.
--   · staff_sessions: PIN login mints a session token (30 days);
--     every logged action carries it.
--   · staff_audit_log: who did what, when — coupons issued, members
--     added, schedule blocks, cancellations, etc.
--   · booking_notify_recipients(): the live list of active staff who
--     want new-booking notifications. Booking pages put this into the
--     GHL webhook payload, so the GHL workflow reads recipients from
--     the payload instead of a hardcoded list.
--
-- Bootstrap: one seeded admin account with the legacy PIN 2626
-- ("Shared Legacy Admin"). Log in with it, create real personal
-- accounts in the new Staff tab, then DEACTIVATE it so every action
-- is attributable to a person.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_members (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,
  email                text,
  phone                text,
  pin_hash             text,
  role                 text        NOT NULL DEFAULT 'coach' CHECK (role IN ('admin','coach')),
  is_active            boolean     NOT NULL DEFAULT true,
  notify_new_bookings  boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_sessions (
  token      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid        NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id          bigserial   PRIMARY KEY,
  staff_id    uuid        REFERENCES public.staff_members(id),
  staff_name  text        NOT NULL,
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_audit_created_idx ON public.staff_audit_log (created_at DESC);

ALTER TABLE public.staff_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;
-- No anon policies: everything goes through the SECURITY DEFINER RPCs below.

-- ── Internal: resolve a session token to a staff row ─────────
CREATE OR REPLACE FUNCTION public._staff_from_token(p_token text)
RETURNS public.staff_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.staff_members;
BEGIN
  SELECT m.* INTO s
    FROM staff_sessions ss JOIN staff_members m ON m.id = ss.staff_id
   WHERE ss.token::text = p_token
     AND ss.created_at > now() - interval '30 days'
     AND m.is_active;
  RETURN s;  -- NULL row if not found
END $$;
REVOKE ALL ON FUNCTION public._staff_from_token(text) FROM public, anon, authenticated;

-- ── Login with a personal PIN ────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_login(p_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members; t uuid;
BEGIN
  SELECT * INTO s FROM staff_members
   WHERE is_active AND pin_hash IS NOT NULL AND pin_hash = crypt(p_pin, pin_hash)
   LIMIT 1;
  IF s.id IS NULL THEN
    RETURN json_build_object('ok', false);
  END IF;
  INSERT INTO staff_sessions (staff_id) VALUES (s.id) RETURNING token INTO t;
  INSERT INTO staff_audit_log (staff_id, staff_name, action)
       VALUES (s.id, s.name, 'login');
  RETURN json_build_object('ok', true, 'token', t,
           'staff', json_build_object('id', s.id, 'name', s.name, 'role', s.role));
END $$;
GRANT EXECUTE ON FUNCTION public.staff_login(text) TO anon, authenticated;

-- ── Validate a stored token (page reload) ────────────────────
CREATE OR REPLACE FUNCTION public.staff_session_info(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL THEN RETURN json_build_object('ok', false); END IF;
  RETURN json_build_object('ok', true,
           'staff', json_build_object('id', s.id, 'name', s.name, 'role', s.role));
END $$;
GRANT EXECUTE ON FUNCTION public.staff_session_info(text) TO anon, authenticated;

-- ── Write an audit entry (called by the dashboard after actions) ──
CREATE OR REPLACE FUNCTION public.staff_log(p_token text, p_action text,
  p_entity_type text DEFAULT NULL, p_entity_id text DEFAULT NULL, p_details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  INSERT INTO staff_audit_log (staff_id, staff_name, action, entity_type, entity_id, details)
       VALUES (s.id, s.name, p_action, p_entity_type, p_entity_id, p_details);
END $$;
GRANT EXECUTE ON FUNCTION public.staff_log(text, text, text, text, jsonb) TO anon, authenticated;

-- ── Staff roster (any logged-in staff can view) ──────────────
CREATE OR REPLACE FUNCTION public.staff_list(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  RETURN COALESCE((SELECT json_agg(json_build_object(
      'id', m.id, 'name', m.name, 'email', m.email, 'phone', m.phone,
      'role', m.role, 'is_active', m.is_active,
      'notify_new_bookings', m.notify_new_bookings,
      'has_pin', m.pin_hash IS NOT NULL, 'created_at', m.created_at)
      ORDER BY m.is_active DESC, m.name)
    FROM staff_members m), '[]'::json);
END $$;
GRANT EXECUTE ON FUNCTION public.staff_list(text) TO anon, authenticated;

-- ── Add / edit a staff member (admin only; audited server-side) ──
CREATE OR REPLACE FUNCTION public.staff_save(p_token text, p_id uuid, p_name text,
  p_email text, p_phone text, p_role text, p_notify boolean, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members; v_id uuid;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL OR s.role <> 'admin' THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF p_role NOT IN ('admin','coach') THEN RAISE EXCEPTION 'bad_role'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO staff_members (name, email, phone, role, notify_new_bookings, is_active)
         VALUES (p_name, p_email, p_phone, p_role, COALESCE(p_notify,true), COALESCE(p_active,true))
      RETURNING id INTO v_id;
    INSERT INTO staff_audit_log (staff_id, staff_name, action, entity_type, entity_id, details)
         VALUES (s.id, s.name, 'staff_added', 'staff', v_id::text,
                 json_build_object('name', p_name, 'role', p_role)::jsonb);
  ELSE
    UPDATE staff_members
       SET name = p_name, email = p_email, phone = p_phone, role = p_role,
           notify_new_bookings = COALESCE(p_notify, notify_new_bookings),
           is_active = COALESCE(p_active, is_active)
     WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
    INSERT INTO staff_audit_log (staff_id, staff_name, action, entity_type, entity_id, details)
         VALUES (s.id, s.name, 'staff_updated', 'staff', v_id::text,
                 json_build_object('name', p_name, 'role', p_role,
                                   'active', p_active, 'notify', p_notify)::jsonb);
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.staff_save(text, uuid, text, text, text, text, boolean, boolean) TO anon, authenticated;

-- ── Set / reset a staff PIN (admin only; PINs must be unique) ──
CREATE OR REPLACE FUNCTION public.staff_set_pin(p_token text, p_staff_id uuid, p_new_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members; clash int;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL OR s.role <> 'admin' THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF p_new_pin !~ '^[0-9]{4,8}$' THEN
    RETURN json_build_object('ok', false, 'reason', 'PIN must be 4–8 digits.');
  END IF;
  SELECT count(*) INTO clash FROM staff_members m
   WHERE m.id <> p_staff_id AND m.is_active AND m.pin_hash IS NOT NULL
     AND m.pin_hash = crypt(p_new_pin, m.pin_hash);
  IF clash > 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'That PIN is already in use by another active staff member.');
  END IF;
  UPDATE staff_members SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_staff_id;
  INSERT INTO staff_audit_log (staff_id, staff_name, action, entity_type, entity_id)
       VALUES (s.id, s.name, 'staff_pin_set', 'staff', p_staff_id::text);
  RETURN json_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.staff_set_pin(text, uuid, text) TO anon, authenticated;

-- ── Audit log listing ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_audit(p_token text,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_search text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members; v_total int; v_rows json;
BEGIN
  s := _staff_from_token(p_token);
  IF s.id IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  SELECT count(*) INTO v_total FROM staff_audit_log l
   WHERE p_search IS NULL OR p_search = ''
      OR l.staff_name ILIKE '%'||p_search||'%'
      OR l.action     ILIKE '%'||p_search||'%'
      OR l.entity_id  ILIKE '%'||p_search||'%';
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_rows FROM (
    SELECT l.id, l.staff_name, l.action, l.entity_type, l.entity_id, l.details, l.created_at
      FROM staff_audit_log l
     WHERE p_search IS NULL OR p_search = ''
        OR l.staff_name ILIKE '%'||p_search||'%'
        OR l.action     ILIKE '%'||p_search||'%'
        OR l.entity_id  ILIKE '%'||p_search||'%'
     ORDER BY l.created_at DESC
     LIMIT LEAST(GREATEST(p_limit,1),200) OFFSET GREATEST(p_offset,0)) t;
  RETURN json_build_object('total', v_total, 'rows', v_rows);
END $$;
GRANT EXECUTE ON FUNCTION public.staff_audit(text, int, int, text) TO anon, authenticated;

-- ── Notification recipients for new bookings ─────────────────
-- Called by the PUBLIC booking pages right before they fire the GHL
-- webhook, so the payload carries the current roster. Deliberately
-- returns ONLY contact details of active staff who opted in.
CREATE OR REPLACE FUNCTION public.booking_notify_recipients()
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'emails', COALESCE((SELECT string_agg(m.email, ',') FROM staff_members m
                         WHERE m.is_active AND m.notify_new_bookings AND m.email IS NOT NULL AND m.email <> ''), ''),
    'phones', COALESCE((SELECT string_agg(m.phone, ',') FROM staff_members m
                         WHERE m.is_active AND m.notify_new_bookings AND m.phone IS NOT NULL AND m.phone <> ''), ''));
$$;
GRANT EXECUTE ON FUNCTION public.booking_notify_recipients() TO anon, authenticated;

-- ── YSC waiver RPCs: accept a session token as well as the legacy PIN ──
CREATE OR REPLACE FUNCTION public._staff_pin_or_token_ok(p_cred text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s staff_members;
BEGIN
  IF p_cred = '2626' THEN RETURN true; END IF;   -- legacy shared PIN
  s := _staff_from_token(p_cred);
  RETURN s.id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public._staff_pin_or_token_ok(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_ysc_waivers(p_staff_pin text)
RETURNS TABLE (
  id text, skier_name text, parent_name text, parent_email text, parent_phone text,
  skier_level text, cohort text, season text, reg_status text,
  waiver_signer text, waiver_signed_at timestamptz, photo_consent boolean, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _staff_pin_or_token_ok(p_staff_pin) THEN RAISE EXCEPTION 'invalid_pin'; END IF;
  RETURN QUERY
  SELECT r.id, r.skier_name, r.parent_first || ' ' || r.parent_last,
         r.parent_email, r.parent_phone, r.skier_level, r.cohort, r.season, r.status,
         r.waiver_signer, r.waiver_signed_at, r.photo_consent, r.created_at
    FROM ysc_registrations r
   WHERE r.waiver_signed = true
   ORDER BY r.waiver_signed_at DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.staff_ysc_waiver_pdf(p_staff_pin text, p_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF NOT _staff_pin_or_token_ok(p_staff_pin) THEN RAISE EXCEPTION 'invalid_pin'; END IF;
  SELECT json_build_object(
           'id', r.id, 'skier_name', r.skier_name,
           'parent_name', r.parent_first || ' ' || r.parent_last,
           'parent_email', r.parent_email, 'parent_phone', r.parent_phone,
           'waiver_signer', r.waiver_signer, 'waiver_signature', r.waiver_signature,
           'waiver_signed_at', r.waiver_signed_at, 'photo_consent', r.photo_consent)
    INTO v FROM ysc_registrations r
   WHERE r.id = p_id AND r.waiver_signed = true;
  RETURN COALESCE(v, json_build_object('error', 'not_found'));
END $$;

-- ── Bootstrap admin (legacy shared PIN — deactivate after setup) ──
INSERT INTO public.staff_members (name, role, pin_hash, notify_new_bookings)
SELECT 'Shared Legacy Admin', 'admin', crypt('2626', gen_salt('bf')), false
 WHERE NOT EXISTS (SELECT 1 FROM public.staff_members);

NOTIFY pgrst, 'reload schema';
