# Bell Acqua Lake — Product Marketing Context

**Client:** Bell Acqua Lake
**Last Updated:** 2026-05-05
**Managed by:** Anti-Gravity

---

## Business Overview

Bell Acqua Lake is a water skiing facility/lake offering lessons, ski rides, and memberships.

## Target Audience / ICP

- Historical "Ski Ride With Lesson" clients (20% discount target)
- Old clients (non-ski ride) looking for beginner/intermediate lessons (2-for-1 target)
- New database holders / VIP list (2-for-1 VIP target)

## Unique Selling Proposition (USP)

High-quality water skiing instruction with a new, user-friendly mobile booking portal.

## Goals & Priorities

1. Boost bookings through three targeted marketing campaigns (20% off and 2-for-1 offers).
2. Transition clients to the new booking portal.
3. Increase social media visibility and engagement through community groups and interactive video.

## Brand Voice & Tone

Professional yet accessible and community-focused.

## Key Competitors

Local water sports facilities and ski clubs.

## Current Projects / Active Work

- **Booking Portal Launch:** Updating platform for 2-for-1 logic; mobile UX demonstration.
- **Email Campaigns:** Segmenting lists and drafting three-tier offers (20% off, 2-for-1).
- **Social Strategy:** Weekly reporting alignment and community group engagement.

## Session Notes

### Session Update: 2026-05-11 (Zoom Sync)
**Summary:**
Processed meeting notes regarding three upcoming marketing campaigns: 20% discount for historical ski ride clients, 2-for-1 for beginner/intermediate old clients, and 2-for-1 VIP for new leads. Facebook ads payment issue resolved, leads flowing. Transitioning social reporting to weekly snapshots.
**Next Priority:** Update booking platform discount logic (min 3 bookings) and record mobile portal walkthrough.
---

### Session Update: 2026-06-08
**Summary:**
Built the full VIP Membership Giveaway campaign for June Facebook Ads. Created landing page copy, 3-email sequence (with Buy 2 Get 1 Free lesson promo code VIPBONUS in Email 1), 2 SMS messages, and a Thank You page. Built both landing page and thank you page as production-ready HTML with Bell Acqua Lake branding. Wired the landing page form to POST to the GHL webhook and redirect to the thank you page. Tested the webhook successfully. All assets saved to `outputs/`. Next session should focus on building the GHL workflow automation and publishing the Facebook Ads campaign.
---

### Session Update: 2026-06-24
**Summary:**
Created Supabase member account for `john.farley.pesigan@gmail.com` with password `password123`. Resolved database schema errors by executing a migration script to create the missing `member_bookings` table. Updated the Member Portal (`bell-acqua-member.html`) slot generation logic to produce bottom-of-the-hour 30-minute slots starting at 7:30 AM (matching public booking guidelines). Deployed the portal and all associated updates to the live Netlify production environment.
---
## Recent Technical Updates (June 2026)

- **Member Booking Dashboard**: Built an independent member dashboard (`bell-acqua-member.html`) where active members can book up to 2 time slots per day.
- **Membership Dates**: Added functionality to restrict member booking access based on active membership dates (`membership_start` and `membership_end`).
- **Staff Dashboard Integration**: Staff dashboard (`bell-acqua-staff.html`) now displays member bookings, correctly mapping 15-minute slot intervals to the staff's hourly layout.
- **Admin Password Reset**: Implemented a secure RPC function (`admin_update_user_password`) to allow staff to reset member passwords directly from the UI using a PIN (1965).
- **Deployment**: Both dashboards are synced to the `netlify-deploy` folder.

### Session Update: 2026-06-30
**Summary:**
Finalized the member dashboard integration. Fixed time format mapping so 24-hour member bookings (e.g. 15-minute slots at :30/:45) correctly display on the staff dashboard's hourly layout. Enforced new database RLS policies to allow the staff dashboard (anon) to read and cancel member bookings, and to allow authenticated members to insert/cancel their own bookings. Removed the strict 2-slot minimum for members. Added an Admin Password Reset function to the staff dashboard utilizing a secure Postgres RPC function protected by a staff PIN. All updates deployed to Netlify.
---

### Session Update: 2026-07-18
**Summary:**
Drafted the July B2G1 (Buy 2 Get 1) promo sequence for Bell Acqua Lake consisting of 2 emails and 2 SMS messages, using promo code B2G1JULY2026. The emails were designed directly in HTML for immediate GoHighLevel pasting and included the $297 price anchor alongside a hero image. HTML file was saved to the `outputs/` folder. Next session can execute the campaign in GHL.
---

### Session Update: 2026-07-23
**Summary:**
Built a client-ready **90-Day Growth Roadmap (Aug–Oct 2026)** PowerPoint aligned to the client's "Growth Strategy Plan / Marketing & Revenue Performance Analysis" doc. 13 slides: the lead-gen thesis (demand, not capacity, is the constraint), targets ($25K/mo · 15 members · $15K reserve · $1K/mo ad spend), 4-yr revenue vs the $25K bar, the Lead→Lesson→Repeat→Member funnel (with the 27.5% lesson-to-member roster proof), the margin/ROI engine, the protected $1K budget, and **all 13 weeks as three monthly sprint boards with an owner tag (MKT/OPS/FIN/OWN) on every task**, plus a KPI scoreboard, risks/data-gaps, and a "do this week" action slide. Saved to `outputs/BellAcquaLake_90-Day_Growth_Roadmap.pptx`. Key flags surfaced: the $1K working ad budget must be **ring-fenced from overhead** (H1 2026 leaked to ~$128/mo real spend), and ~$22,400 of in-window renewals are a lower-effort path to the reserve than 15 cold members. **Next session:** optionally expand any month into per-week slides for finer granularity, and execute Week-1 actions — rebuild the Meta campaign (consolidate to winner, kill "– Copy" sets), build the renewal-reminder calendar (8/15 dates first), load the post-lesson membership follow-up into GHL, add a "How did you hear about us?" field — plus the still-open July B2G1 promo (code B2G1JULY2026) go-live in GHL.
---

### Session Update: 2026-08-12
**Summary:**
Built and shipped the full **affiliate referral program**, live in production. New `bell-acqua-affiliate.html` page (with the real BAL logo): anyone joins with name + email (no password) and gets a unique code (e.g. `JANE-7F2K`), a shareable `?ref=` booking link, and a private token-based dashboard showing referrals and credit coupons. Booking page: Step-1 "Have a referral code?" box auto-fills from `?ref=`, auto-applies **20% off first booking** at the cart via the existing coupon math, and on checkout mints the affiliate a one-time **20% credit coupon** (`CREDIT-XXXXXX`) redeemable in the normal coupon box; confirmation page now invites every new customer to join. Staff dashboard: Referrals tab reworked to list affiliates with active/inactive toggle and per-credit used/available status. All validation is server-side via 5 SECURITY DEFINER RPCs in `web/supabase/migrations/20260812_affiliate_program.sql` (applied by John): first-booking-only, no self-referral, one credit per referred email ever. Tier-ready: `friend_discount_pct` / `reward_pct` are per-affiliate columns — future reward tiers are just an UPDATE. **Netlify CLI was authorized this session — deploy directly with** `npx -y netlify-cli deploy --prod --dir "Marketing Agency\Bell Acqua Lake\web\netlify-deploy" --site 66da87b7-51e4-47db-bbbc-1a47eae71201` (no more manual deploys; a manual "deploy" this session turned out stale). **Next session:** (1) create the GHL "affiliate credit earned" email workflow and paste its webhook URL into `GHL_AFFILIATE_WEBHOOK_URL` in bell-acqua-booking.html — until then affiliates only see credits in their dashboard, no email; (2) announce the program (email blast to existing customers + social); (3) still open from July: B2G1JULY2026 promo go-live in GHL and the 90-day roadmap Week-1 actions.
---

### Session Update: 2026-08-12 (Part 2)
**Summary:**
Wired the GoHighLevel webhook URL (`GHL_AFFILIATE_WEBHOOK_URL`) inside the booking page configuration (`bell-acqua-booking.html` in both `web/` and `netlify-deploy/`) and successfully deployed it live to Netlify production. Sent a test payload to trigger and save the GHL workflow. Drafted an under-the-hood explanation email for Mike and designed a premium HTML referral launch email for existing customers, saved separately as `outputs/referral_promo_email.html`.
---

### Session Update: 2026-08-20
**Summary:**
Massive build day off Mike's two feature requests — all live in production and pushed to GitHub. **(1) Priority features:** cross-calendar time-range blocking (`blocked_ranges` table — staff blocks e.g. "Sep 19, 2 PM–dark" on any mix of B/I, SRL, Member calendars; replaced the broken per-slot picker whose hourly IDs never matched the B/I `:30` grid; member portal now respects blocks); free booking links (staff mints one-time 100% coupon, `?coupon=` URL bypasses 2-session minimum); Copy Reschedule Link on booking cards (manage page auto-verifies via `?ref=&email=`, and the same auto-open link now rides every confirmation email — waiver-page webhook upgraded, lesson page got the confirmed webhook it never had); editable affiliate rewards (per-affiliate + program defaults, RPCs in `20260820_blocking_and_rewards.sql`, migration applied). Also: staff Coupons/Referrals cards → tables, pagination (20/40/100) on Customers/Coupons/Referrals, fixed the dead customer search box, and fixed the manage page's stale top-of-hour reschedule grid. **(2) Membership checkout** (`bell-acqua-membership.html`, linked from booking header): Midweek $1,897 / Unlimited $2,697, add-ons (locker $200, guest passes $300/book, supplementary members $1,897 ea), full contract from Mike's PDF templated in-flow with signature pad (gate code/password redacted from public page; guest passes standardized to $300), payment in full or 4 quarterly installments covering everything (midweek $525-base, unlimited $700-base + extras/4). On payment: `memberships` + `membership_payments` rows, auth signup, `membership_activate` RPC provisions the profile — member portal works immediately; midweek members restricted to Mon–Thu booking. **Auto-charge is fully live:** `membership-checkout` edge function saves cards (Stripe Customer + setup_future_usage), `charge-membership-installments` charges due installments daily via pg_cron (`bal-charge-installments`, 15:00 UTC, verified active) — both deployed via John's browser, CRON_SECRET set, all migrations applied (`20260820_membership_checkout.sql`). Staff Members tab: plan badges + Membership Purchases table with per-installment mark-paid. **Open:** GHL membership welcome workflow — email template ready at `outputs/membership_welcome_email.html`, paste its webhook URL into `GHL_MEMBERSHIP_WEBHOOK_URL` in bell-acqua-membership.html; a stray Stripe test customer (autocharge-test@example.com) can be deleted; still pending from before: B2G1JULY2026 promo go-live, affiliate program announcement, 90-day roadmap Week-1 actions. Bigger-app plan with 7 questions for Mike: `outputs/membership-app-implementation-plan.md`. Flagged: member calendar and B/I calendar don't cross-check bookings (double-booking risk).
---


### Session Update: 2026-08-22
**Summary:**
Two production fixes to the booking system, both live and pushed. **(1) B/I calendar restored to top-of-hour.** Traced a real double-booking risk to its root: the Beginner/Intermediate booking page had been silently switched from top-of-hour (7:00-7:30) to bottom-of-hour (7:30-8:00) on 2026-06-23 at 23:51 UTC (Netlify deploy `6a3b1c0d`, no commit, no session note) — putting public customers into members-only time and killing the B/I<->SRL cross-blocking, which keys on slot ids ending `00`. Confirmed original design via 84 pre-flip bookings on `HH00`, the SRL page and staff dashboard (both never changed), and Mike's own description. Restored in `bell-acqua-booking.html` and `bell-acqua-manage.html`; cross-blocking revived with no new code (verified live: Andreas Thoma's Aug 23 lessons now close 9/10/11 AM to B/I). **Correct model: top of hour = B/I (30 min) + SRL (2×15 min), shared and cross-blocked; bottom of hour = members only, 2×15 min.** The 14 upcoming B/I bookings taken on the wrong grid (Leslee Bender, Tara Coronado, Mike Riley, Ryan Sydenham ×6, Misty Allard ×2, Mike Todd ×2) were left untouched per John — `20260822_grandfather_bottom_of_hour_bi.sql` blocks those windows on the member calendar instead (applied). Email drafted for Mike at `outputs/mike-booking-grid-email.md` — **NOT yet sent**, awaiting John. **(2) Membership waiver gate built.** Membership checkout was writing `status='active'` and activating the portal immediately with no liability waiver anywhere — the checkout signature is the membership *agreement* (fees/guest rules/payment terms) and contains zero release-of-liability language; supplementary members got no account, no waiver, no record. Now checkout saves the membership as `pending` and creates one `waiver_requests` row per skier (primary + each supplementary); the portal stays locked until all are signed, then the waiver page calls the new `membership_waiver_check()` RPC which flips it to `active` and provisions the profile. Also closed a related hole: the portal treated a missing profile as "no date restriction" instead of "no access", and the `members_insert_own` RLS policy only checked `auth.uid()`, so the lock would have been cosmetic — the policy now requires a profile whose membership window covers the booking date. Migration `20260822_membership_waivers.sql` applied. Fully tested (1-of-2-signed correctly keeps the membership locked; active and midweek members unaffected).
**Next session:** (1) **Two test rows still need deleting** — anon has no DELETE policy so my cleanup silently no-op'd: `DELETE FROM waiver_requests WHERE membership_id='BAM-VERIFY01'; DELETE FROM memberships WHERE id='BAM-VERIFY01';` (2) **`GHL_MEMBERSHIP_WEBHOOK_URL` is still the placeholder `YOUR_MEMBERSHIP_WEBHOOK_URL`** — until John creates the GHL workflow and provides the URL, no waiver email and no welcome email fire; members only get waiver links on the confirmation screen and must forward supplementary ones by hand. Payload already carries `waiver_url`, `waivers[]`, `supplementary_waivers`, `membership_status` — one-line change once the URL arrives. (3) Send the Mike email. (4) Consider renaming `memberships.waiver_*` columns (they hold the contract signature, not a waiver) — deferred because it would break the staff dashboard and installment charger. (5) Still pending from before: B2G1JULY2026 promo go-live, affiliate program announcement, 90-day roadmap Week-1 actions.
---
