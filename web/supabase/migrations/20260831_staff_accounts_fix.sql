-- ─────────────────────────────────────────────────────────────
-- FIX for 20260831_staff_accounts.sql — 2026-08-31
--
-- On Supabase, pgcrypto installs into the `extensions` schema, and
-- the staff functions pinned `search_path = public`, which hid
-- crypt()/gen_salt() — so staff_login failed with "function crypt
-- does not exist". This recreates the two functions that hash PINs
-- with `public, extensions` in their search path, and re-seeds the
-- Shared Legacy Admin (PIN 2626) in case the original seed failed.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.staff_login(p_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

CREATE OR REPLACE FUNCTION public.staff_set_pin(p_token text, p_staff_id uuid, p_new_pin text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

-- Re-seed the bootstrap admin if the original seed didn't survive
INSERT INTO public.staff_members (name, role, pin_hash, notify_new_bookings)
SELECT 'Shared Legacy Admin', 'admin', extensions.crypt('2626', extensions.gen_salt('bf')), false
 WHERE NOT EXISTS (SELECT 1 FROM public.staff_members);

-- If the row exists but its hash is missing/broken, repair it
UPDATE public.staff_members
   SET pin_hash = extensions.crypt('2626', extensions.gen_salt('bf'))
 WHERE name = 'Shared Legacy Admin' AND pin_hash IS NULL;

NOTIFY pgrst, 'reload schema';
