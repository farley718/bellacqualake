# Bell Acqua Lake — Session Summary, 2026-10-01

Everything built, shipped, and changed in the session that ran from Oct 1 into Oct 2, 2026. All items are live unless marked otherwise.

---

## 1. Member roster loaded into the app

- Compared Mike's **2025 MEMBER INFORMATION.xlsx** against the GHL "members" export and loaded the roster into the member dashboard.
- **46 accounts** now in the dashboard: 17 current paid members, 23 expired members (kept so staff can see history and Mike can delete), 5 with no dates on file (Warren Marcus, Leann Munro, Phil Todd, Rick Todd, Panos Panagopoulos), plus Mike and John's test account.
- Seven members had no email on file and got placeholder addresses (Blomgren, Parsons, Lake Lutes, Griepp, Best, Munro, Nelson). They show everywhere but cannot log in until a real email replaces the placeholder.
- No passwords were stored anywhere. Staff grant access with **Reset Password** in the Members tab.
- Comparison report: `outputs/member-roster-comparison-2026-10-01.md` and a Google Sheet of the same.
- Still waiting on John/Mike: real emails for the seven placeholders; a call on six disputed names (Byrne, Mack, Nolden, Panagopoulos, Wolfe, Bettencourt); Afrahi expired Oct 1 and Leach expires Oct 8, extend in the dashboard when they renew.

## 2. Boat Log upgrades

- **Member name picker** on the "Find your name" box and on the entry form's Name field. Tap to pick from the full member list; works on iPad and phones (replaced the browser's unreliable built-in suggestion box). Expired members are listed after current ones, tagged "Expired".
- Picking a name on the main page opens that member's ride card for today, or a Manual Entry with the name filled in if they have no card.
- **Engine Hours Start prefills** from that boat's last recorded Stop, per boat, with a note showing where the number came from. New entries open with the last-used boat selected so the number is there immediately. Still editable.
- **Driver and Coach are separate fields** (Coach optional). Both in the table and CSV export. New `coach` column in the database.

## 3. Staff dashboard

- **Delete member** button (admin logins only), removes login, profile, and member bookings; recorded in the Activity tab.
- **✉️ Emails tab**: a log of every email the app sends, with search, plus a dropdown to send yourself a sample of any of the 28 templates or a connection test.

## 4. App email (Resend) — the big one

The app now sends **all transactional email itself** from **info@bellacqualakes.com** (replies go to Mike's Gmail). GHL stays the CRM; its email steps should be removed.

**Customer emails**
- Payment received (receipt), Sign your waiver, Booking confirmed
- Booking rescheduled / sessions added / party size changed / cancelled
- Reminder the day before a lesson or ski ride
- Member: ride booked, ride cancelled, reminder the day before
- Membership welcome (contract summary + waiver links), supplementary member waiver request, membership active (portal open)
- Installment receipt, installment failed
- Membership expiring at 30 days and 7 days
- Affiliate credit earned
- Youth Ski Club registration receipt
- Youth Ski Club nurture emails 1–5 (email 1 immediately, then days 1/3/5/7; stops when the parent pays)

**Staff emails** (everyone with "notify new bookings" on): new booking, booking changed, waiver signed with PDF link, member ride booked/cancelled, new membership, youth club registration, installment failed.

**How it works (surface level)**
- One send service inside the app; pages only report what happened, the service looks up the record, builds the email, sends, and logs it. Nothing can be sent that isn't tied to a real record, and samples/tests only go to active staff addresses.
- Every send is logged (Emails tab). Duplicates are prevented (one confirmation per booking, one reminder per day, etc.).
- A daily job runs at 9 AM Pacific for reminders, expiring memberships, and nurture steps.
- Youth Ski Club landing page script updated so form leads go to the app (and still to GHL).

**Files**
- `web/supabase/functions/send-email/index.ts` (service), `charge-membership-installments/index.ts` (now sends receipts/failures)
- Migrations run: `20261001_member_delete.sql`, `20261001_boat_log_coach.sql`, `20261001_email_log.sql`, `20261001_email_everything.sql`
- Plan: `outputs/email-migration-plan-2026-10-01.md` (+ Google Doc)
- All 28 samples sent to John for review on Oct 2.

## 5. Open items after this session

1. Review the 28 sample emails; request wording/look changes.
2. In GHL, delete the "Send Email" steps (only those) in: waiver request, booking confirmed, affiliate credit, youth ski club, staff waiver notification. Until then customers get both versions.
3. Rename the "Shared Legacy Admin" staff account to John's name (samples say "Hi Shared").
4. Member roster follow-ups listed in section 1.
5. Older backlog unchanged: waterski-ncswa.com DNS, YSC cohort caps, Mike's two unsent emails, school outreach, B2G1 promo, affiliate announcement.
