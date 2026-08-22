-- Membership waivers: require a signed liability waiver from every person on a
-- membership (primary + each supplementary member) before the membership is
-- activated and the member portal unlocks.
--
-- Before this, bell-acqua-membership.html wrote status='active' straight away
-- and called membership_activate() immediately, so a member could pay, get a
-- portal account and book ski time with no liability waiver on file. The
-- signature captured during checkout is the membership CONTRACT (fees, guest
-- rules, payment terms) -- it contains no release of liability.
--
-- waiver_requests.booking_id has a FK to bookings(id), so memberships need
-- their own column rather than borrowing that one.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).
-- ---------------------------------------------------------------------------

-- 1. Let a waiver row belong to EITHER a booking or a membership -------------

ALTER TABLE public.waiver_requests
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE public.waiver_requests
  ADD COLUMN IF NOT EXISTS membership_id text
    REFERENCES public.memberships(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS waiver_requests_membership_idx
  ON public.waiver_requests (membership_id);

-- Exactly one owner: a booking waiver or a membership waiver, never both/neither
ALTER TABLE public.waiver_requests
  DROP CONSTRAINT IF EXISTS waiver_requests_one_owner;

ALTER TABLE public.waiver_requests
  ADD CONSTRAINT waiver_requests_one_owner
  CHECK (num_nonnulls(booking_id, membership_id) = 1);

-- 2. Activate a membership once every waiver on it is signed -----------------
--
-- Returns:
--   {ok:true,  activated:true}              -- all signed, membership now active
--   {ok:true,  activated:false, pending:N}  -- N people still have to sign
--   {ok:false, reason:'...'}
--
-- SECURITY DEFINER so the anon-key waiver page can flip the membership without
-- being able to UPDATE memberships directly for any other reason.

CREATE OR REPLACE FUNCTION public.membership_waiver_check(p_membership_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total   int;
  v_signed  int;
  v_exists  boolean;
  v_act     json;
BEGIN
  SELECT EXISTS (SELECT 1 FROM memberships WHERE id = p_membership_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN json_build_object('ok', false, 'reason', 'membership_not_found');
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'signed')
    INTO v_total, v_signed
    FROM waiver_requests
   WHERE membership_id = p_membership_id;

  IF v_total = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'no_waivers');
  END IF;

  IF v_signed < v_total THEN
    RETURN json_build_object('ok', true, 'activated', false,
                             'pending', v_total - v_signed, 'total', v_total);
  END IF;

  UPDATE memberships
     SET status = 'active'
   WHERE id = p_membership_id
     AND status <> 'active';

  -- Provision / refresh the member-portal profile
  v_act := membership_activate(p_membership_id);

  RETURN json_build_object('ok', true, 'activated', true,
                           'total', v_total, 'profile', v_act);
END $$;

GRANT EXECUTE ON FUNCTION public.membership_waiver_check(text) TO anon, authenticated;

-- 3. New memberships start pending ------------------------------------------
-- (the checkout page also sends status='pending' explicitly; this makes the
--  table safe by default if any other writer forgets)

ALTER TABLE public.memberships ALTER COLUMN status SET DEFAULT 'pending';

NOTIFY pgrst, 'reload schema';

-- 4. Enforce the gate in the database, not just the UI ----------------------
--
-- The old policy let ANY authenticated user insert a member_booking for
-- themselves, so the portal's lock was cosmetic -- a direct POST with the anon
-- key and a logged-in session would still have created a booking. Require a
-- profile whose membership window actually covers the booking date. That row
-- is only written by membership_activate(), which now runs only after every
-- waiver on the membership is signed.

DROP POLICY IF EXISTS "members_insert_own" ON public.member_bookings;

CREATE POLICY "members_insert_own"
  ON public.member_bookings FOR INSERT
  WITH CHECK (
    auth.uid() = member_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.membership_start IS NOT NULL
         AND p.membership_end   IS NOT NULL
         AND member_bookings.booking_date BETWEEN p.membership_start AND p.membership_end
    )
  );

NOTIFY pgrst, 'reload schema';
