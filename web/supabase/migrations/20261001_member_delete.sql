-- ─────────────────────────────────────────────────────────────
-- Member delete — 2026-10-01
--
-- Staff dashboard → Members tab → "Delete" button. Removes the
-- member's login (auth.users), their profile row and their member
-- bookings (cascade), and writes a staff_audit_log entry.
--
-- Allowed for: an admin staff session token, or the legacy shared
-- PIN (same as the YSC waiver RPCs) so the dashboard works in both
-- login modes. Coaches cannot delete members.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_member(
  p_user_id   uuid,
  p_token     text DEFAULT NULL,
  p_staff_pin text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        staff_members;
  v_name   text;
  v_email  text;
  v_bk     int;
BEGIN
  -- who is asking?
  IF p_token IS NOT NULL THEN
    s := _staff_from_token(p_token);
  END IF;
  IF s.id IS NULL THEN
    IF p_staff_pin IS NULL OR p_staff_pin <> '2626' THEN
      RAISE EXCEPTION 'admin_only';
    END IF;
  ELSIF s.role <> 'admin' THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email), email
    INTO v_name, v_email
    FROM profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  END IF;
  IF v_email IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT count(*) INTO v_bk FROM member_bookings WHERE member_id = p_user_id;

  DELETE FROM member_bookings WHERE member_id = p_user_id;
  DELETE FROM profiles        WHERE id = p_user_id;
  DELETE FROM auth.users      WHERE id = p_user_id;

  INSERT INTO staff_audit_log (staff_id, staff_name, action, entity_type, entity_id, details)
       VALUES (s.id, COALESCE(s.name, 'Shared Legacy Admin'), 'member_deleted', 'member',
               p_user_id::text,
               json_build_object('name', v_name, 'email', v_email, 'bookings_removed', v_bk)::jsonb);

  RETURN json_build_object('ok', true, 'name', v_name, 'bookings_removed', v_bk);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_member(uuid, text, text) TO anon, authenticated;
