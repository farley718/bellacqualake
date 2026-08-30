-- ─────────────────────────────────────────────────────────────
-- Waiver archive — staff dashboard "Waivers" tab — 2026-08-31
--
-- The staff dashboard gets a unified, searchable waiver archive:
--   · Booking + membership waivers already live in waiver_requests
--     (anon-readable, so the dashboard reads them directly).
--   · Youth Ski Club waivers live on ysc_registrations, which anon
--     deliberately CANNOT read (parent emails, kids' ages, medical
--     notes). These two SECURITY DEFINER RPCs expose ONLY the
--     waiver-relevant fields, gated by the staff PIN, and never
--     medical notes.
--
-- The PIN here must match CONFIG.STAFF_PIN in bell-acqua-staff.html
-- ('2626'). If the PIN ever changes, change it in BOTH places.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ─────────────────────────────────────────────────────────────

-- List all signed Youth Ski Club waivers (no signature blob, no medical notes)
CREATE OR REPLACE FUNCTION public.staff_ysc_waivers(p_staff_pin text)
RETURNS TABLE (
  id               text,
  skier_name       text,
  parent_name      text,
  parent_email     text,
  parent_phone     text,
  skier_level      text,
  cohort           text,
  season           text,
  reg_status       text,
  waiver_signer    text,
  waiver_signed_at timestamptz,
  photo_consent    boolean,
  created_at       timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_staff_pin IS DISTINCT FROM '2626' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;
  RETURN QUERY
  SELECT r.id, r.skier_name,
         r.parent_first || ' ' || r.parent_last,
         r.parent_email, r.parent_phone,
         r.skier_level, r.cohort, r.season, r.status,
         r.waiver_signer, r.waiver_signed_at, r.photo_consent, r.created_at
    FROM ysc_registrations r
   WHERE r.waiver_signed = true
   ORDER BY r.waiver_signed_at DESC NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.staff_ysc_waivers(text) TO anon, authenticated;

-- One YSC waiver with its signature image, for on-demand PDF download
CREATE OR REPLACE FUNCTION public.staff_ysc_waiver_pdf(p_staff_pin text, p_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF p_staff_pin IS DISTINCT FROM '2626' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;
  SELECT json_build_object(
           'id', r.id,
           'skier_name', r.skier_name,
           'parent_name', r.parent_first || ' ' || r.parent_last,
           'parent_email', r.parent_email,
           'parent_phone', r.parent_phone,
           'waiver_signer', r.waiver_signer,
           'waiver_signature', r.waiver_signature,
           'waiver_signed_at', r.waiver_signed_at,
           'photo_consent', r.photo_consent
         )
    INTO v
    FROM ysc_registrations r
   WHERE r.id = p_id AND r.waiver_signed = true;
  RETURN COALESCE(v, json_build_object('error', 'not_found'));
END $$;

GRANT EXECUTE ON FUNCTION public.staff_ysc_waiver_pdf(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
