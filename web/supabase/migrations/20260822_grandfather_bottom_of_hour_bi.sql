-- Grandfather the 14 upcoming Beginner/Intermediate bookings that were
-- taken on the old (incorrect) bottom-of-hour grid.
--
-- The B/I booking page has been moved back to the top of the hour, so the
-- bottom of the hour is members-only again. These 14 bookings are staying
-- exactly as sold -- customers keep their times. But because their slot ids
-- no longer exist on any public grid, nothing stops a MEMBER from booking
-- over them. These rows close that window on the member calendar only.
--
-- B/I and SRL customers are unaffected: both now book :00-:30, which does
-- not overlap these windows.
--
-- Run in the Supabase SQL Editor (project: euznpkrkkaieykznztho).

INSERT INTO public.blocked_ranges (date, start_min, end_min, calendars, reason, blocked_by) VALUES
  ('2026-08-22', 450, 480, '{member}', 'Existing B/I booking - Leslee Bender (7:30 AM - 8:00 AM)', 'system'),
  ('2026-08-22', 630, 660, '{member}', 'Existing B/I booking - Tara Coronado (10:30 AM - 11:00 AM)', 'system'),
  ('2026-08-24', 810, 840, '{member}', 'Existing B/I booking - Mike Riley (1:30 PM - 2:00 PM)', 'system'),
  ('2026-08-24', 870, 900, '{member}', 'Existing B/I booking - Mike Riley (2:30 PM - 3:00 PM)', 'system'),
  ('2026-08-29', 570, 600, '{member}', 'Existing B/I booking - Ryan Sydenham (9:30 AM - 10:00 AM)', 'system'),
  ('2026-08-29', 630, 660, '{member}', 'Existing B/I booking - Ryan Sydenham (10:30 AM - 11:00 AM)', 'system'),
  ('2026-08-29', 690, 720, '{member}', 'Existing B/I booking - Ryan Sydenham (11:30 AM - 12:00 PM)', 'system'),
  ('2026-08-29', 750, 780, '{member}', 'Existing B/I booking - Ryan Sydenham (12:30 PM - 1:00 PM)', 'system'),
  ('2026-08-29', 810, 840, '{member}', 'Existing B/I booking - Ryan Sydenham (1:30 PM - 2:00 PM)', 'system'),
  ('2026-08-29', 870, 900, '{member}', 'Existing B/I booking - Ryan Sydenham (2:30 PM - 3:00 PM)', 'system'),
  ('2026-09-05', 870, 900, '{member}', 'Existing B/I booking - Misty Allard (2:30 PM - 3:00 PM)', 'system'),
  ('2026-09-05', 930, 960, '{member}', 'Existing B/I booking - Misty Allard (3:30 PM - 4:00 PM)', 'system'),
  ('2026-11-30', 1110, 1140, '{member}', 'Existing B/I booking - Mike Todd (6:30 PM - 7:00 PM)', 'system'),
  ('2026-11-30', 1170, 1200, '{member}', 'Existing B/I booking - Mike Todd (7:30 PM - 8:00 PM)', 'system');

-- 14 windows blocked.
