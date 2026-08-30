# Youth Ski Club — Thank You Page Copy (Urgency + Checkout)
**Client:** Bell Acqua Lake · **Program:** Youth Ski Club, Fall 2026 (Sept 15 – Oct 31)
**Purpose:** Convert the form submission into a paid $2,000 registration on the same page.
**Date:** 2026-08-29

---

## Strategic note

The current page congratulates and then hands the parent a to-do list. That reads as
"you're done" — which is exactly the feeling that kills same-session payment. The fix is to
reframe the moment: the form put them **in line**, it did not **secure** a spot. "Skip the
line" is the whole angle — it turns paying from an obligation into an advantage. Everything above the
fold should point at one action — check out — and the parent's other tasks (inbox, waiver,
cohort days) move *below* the checkout, where they become the post-payment reward rather
than a competing list.

**Honesty guardrail:** only run the scarcity line if the cap is real. Four coached sessions a
week across two cohorts on one lake is a genuine capacity limit — state the actual number of
remaining spots per cohort and keep it current. A countdown that never ends trains parents
to ignore it, and Mike's audience is a referral-driven local community.

---

## SECTION 1 — Hero (replaces "You're In! Welcome to the Youth Ski Club")

**Badge:** `⚠ YOU'RE ON THE LIST — SPOT NOT YET SECURED`

**H1:** Skip the line and secure your skier's spot now.

**Subhead:**
Your request is in — but requests don't hold a place on the water. Spots are confirmed in the
order they're paid, and both fall cohorts are filling fast. Register below and [Skier First
Name] is locked in for all seven weeks.

**Scarcity line (dynamic — update weekly):**
Tue/Thu cohort: **4 spots left** · Mon/Wed cohort: **6 spots left** · Season opens September 15

---

## SECTION 2 — Urgency band (new, directly under hero)

**Eyebrow:** WHY NOW

**Headline:** Everyone who requested a spot is in line. Paying moves you to the front.

**Body:**
Every skier gets real time behind a tournament boat with a certified coach — which means we
cap each cohort rather than stack the dock. We work the request list in the order registrations
are paid, so completing yours now puts your skier ahead of every unpaid request behind you.
Once a cohort is full, the next opening is the spring season.

**Three-up support strip (short, scannable):**

| | |
|---|---|
| **Paid = confirmed** | A request holds your place in line. Payment holds your place on the water. |
| **Seven weeks, four sessions a week** | Sept 15 – Oct 31. Every coaching set included. |
| **Nothing else to buy** | Boats, gear, coaching, hot tub, lockers, showers — all in. |

---

## SECTION 3 — Checkout block (the new centerpiece)

**Eyebrow:** COMPLETE YOUR REGISTRATION

**H2:** Skip the line — Fall 2026 Season

**Price display:**
**$2,000** — full season, all-inclusive

**Value recap (tight bullets beside the price):**
- 4 coached sessions per week for 7 weeks (28 sessions)
- 3-event training: slalom, trick, and jump
- Certified coaches, tournament boats, and all gear
- Hot tub, warm showers, lockers, changing rooms, WiFi
- Ages 10–17, beginner through competitive

**Primary CTA button:** Secure My Spot — $2,000

*(CTA alternates worth A/B testing: "Skip the Line — $2,000" · "Lock In Our Spot — $2,000")*

**Trust line under the button:**
Secure checkout. You'll receive an emailed receipt and your Welcome Guide the moment payment
clears.

**Risk-reversal / objection handler (small text):**
Questions before you pay? Call us at (916) 919-5726 and we'll walk you through the season,
the coaching staff, and what a typical Tuesday on the water looks like.

**Payment-plan option (recommended — ask Mike first):**
Prefer to split it? Ask about our installment option when you call. — *This mirrors the
membership checkout's 4-installment structure and typically lifts conversion on a $2,000
ticket. Flagged for Mike's approval, not built yet.*

---

## SECTION 4 — After checkout (the old "Next Steps," demoted and slimmed)

**Eyebrow:** ONCE YOU'RE REGISTERED

**H3:** Here's what happens next

1. **Your Welcome Guide lands in your inbox** — season schedule, what to pack, dock rules,
   and directions to 930 E St, Rio Linda. Add Bell Acqua Lake as a safe sender.
2. **Sign the safety waiver** — every youth skier needs one on file before their first
   coaching set on September 15. It takes two minutes. `[Sign Safety Waiver]`
3. **Confirm your cohort days** — reply to the welcome email or call and we'll lock in
   Mon/Wed or Tue/Thu, 4:00–6:30 PM.

**Closing line:**
See you on the water, September 15.

---

## Build notes for John

- **Phone number conflict:** the mockup shows **(916) 991-5341**; the landing page footer and
  Bell Acqua's site use **(916) 919-5726**. Confirm which is correct before this ships — a
  wrong number on the highest-intent page in the funnel is the most expensive typo available.
- **Merge fields:** `[Skier First Name]` should pull from the form submission via the GHL
  webhook payload (`skier_name`) so the hero reads personally.
- **Cohort counts:** hardcoded numbers go stale. Either wire them to the registration count
  or have Mike update them weekly — an inaccurate "4 spots left" is worse than no number.
- **Checkout:** needs a Stripe/GHL product for the $2,000 season. The membership checkout
  (`bell-acqua-membership.html`) already has the Stripe customer + installment plumbing —
  the same pattern can carry the season fee if Mike approves a payment plan.
- **Waiver:** the membership waiver gate (`membership_waiver_check()` RPC, migration
  `20260822_membership_waivers.sql`) is the existing model for gating access until a waiver
  is signed. Worth reusing rather than building a second waiver flow.
