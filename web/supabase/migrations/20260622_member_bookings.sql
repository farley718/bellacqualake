-- Member bookings table for annual membership holders
CREATE TABLE IF NOT EXISTS member_bookings (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email TEXT        NOT NULL,
  member_name  TEXT,
  booking_date DATE        NOT NULL,
  slot_start   TIME        NOT NULL,
  slot_end     TIME        NOT NULL,
  status       TEXT        DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Prevents two members from booking the same slot on the same date
CREATE UNIQUE INDEX member_bookings_slot_unique
  ON member_bookings(booking_date, slot_start)
  WHERE status = 'confirmed';

-- Speed up per-member lookups
CREATE INDEX member_bookings_member_date
  ON member_bookings(member_id, booking_date);

-- Row-level security
ALTER TABLE member_bookings ENABLE ROW LEVEL SECURITY;

-- Any logged-in member can read all bookings (needed to show availability)
CREATE POLICY "authenticated_read_all"
  ON member_bookings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Members can only insert rows where member_id matches their own user id
CREATE POLICY "members_insert_own"
  ON member_bookings FOR INSERT
  WITH CHECK (auth.uid() = member_id);

-- Members can only update (cancel) their own bookings
CREATE POLICY "members_update_own"
  ON member_bookings FOR UPDATE
  USING (auth.uid() = member_id);
