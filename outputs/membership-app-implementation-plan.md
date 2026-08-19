# Bell Acqua Lake — Membership App Upgrade: Implementation Plan

**Date:** 2026-08-20 · **Prepared by:** Anti-Gravity · **Status:** Proposal for Mike's sign-off

## What Mike asked for

1. Draft member contracts directly in the app.
2. Self-serve member portal: enter contact info, sign waiver, pick membership, add extras, check out through a cart.
3. Checkout payment choice: card on file (auto-charged on the 5th, +3.5% service fee on membership payments only) or Zelle/check (no fee, member pays manually each cycle).
4. Add-ons flagged for automatic annual renewal with reminders so nothing lapses.

**Offerings:** Midweek (Mon–Thu) $1,897 · Unlimited (7 days, sunup–sundown) $2,697
**Add-ons:** Locker $200/yr · Guest passes (book of 10) $300 — both auto-renew annually
**Payment plan:** 50% down, remainder billed monthly until paid off.

## What we already have to build on

- Supabase (auth, `profiles` with membership dates, `member_bookings`), Stripe live keys + a `create-payment-intent` Edge Function, the signature-pad waiver flow, GHL webhooks for email automations, and the PIN-gated staff dashboard.
- The member portal already handles login + booking; membership window enforcement (`membership_start`/`membership_end`) is live.
- The Midweek (Mon–Thu) restriction slots naturally into the existing member calendar logic (one new column check).

## Data model (new tables)

| Table | Purpose |
|---|---|
| `membership_plans` | midweek / unlimited, price, weekday rules — editable by staff, no redeploys for price changes |
| `memberships` | one row per member per year: plan, status (pending → active → paid_off / lapsed), start/end, contract id |
| `membership_addons` | locker / guest-pass rows tied to a membership, `auto_renew` flag, `renews_on` date |
| `guest_pass_ledger` | 10 passes per book; staff decrements at the lake |
| `contracts` | staff-drafted terms (templated HTML + fill-ins), member's e-signature, signed PDF snapshot |
| `payment_plans` | down payment, monthly amount, method (card / zelle / check), fee pct (3.5 or 0), balance |
| `payment_ledger` | one row per expected payment with due date (5th), status (due / paid / confirmed / late), Stripe charge id or manual-payment note |

## The four builds, in order

### Phase 1 — Member onboarding + cart checkout (the storefront)
New `bell-acqua-join.html`: account creation → contact info → waiver signature (reuse waiver pad) → membership picker → add-ons → cart. Checkout collects the **50% down payment** and creates the membership as `pending` until money clears.
- **Card:** Stripe SetupIntent saves the card on file, then charges down payment +3.5%. Fee applies to membership payments only — ride/lesson bookings stay fee-free.
- **Zelle/check:** shows payment instructions, creates the ledger row as `awaiting confirmation`; staff confirms receipt from the dashboard to activate.

### Phase 2 — Billing engine (the 5th-of-month machine)
A scheduled Supabase Edge Function runs monthly on the 5th:
- Card plans: charge saved card for (installment × 1.035), mark ledger paid, retry + GHL alert on decline.
- Zelle/check plans: fire a GHL reminder email/SMS ("your installment is due") ~3 days before the 5th; member payments are confirmed by staff with one click.
- Staff dashboard gets a **Payments tab**: who's paid, who's due, who's late, remaining balances.

### Phase 3 — Contracts in the app
Staff dashboard **Contracts tab**: pick a member + plan, the contract template auto-fills (name, plan, pricing, payment schedule, the add-on renewals). Member gets a link, reviews, signs on the same signature pad as the waiver, and both sides get the signed copy (stored + emailed via GHL). Verbiage comes from Mike's attached contract — we template it once, then every contract is a 30-second draft.

### Phase 4 — Add-on auto-renewal
Nightly check: add-ons within 30 days of `renews_on` trigger a GHL reminder ("your locker renews on X for $200 — reply to cancel"). On the renewal date: card members are auto-charged (with fee), Zelle/check members get an invoice email and a ledger row. Nothing silently lapses, nothing silently double-charges — every renewal has a reminder trail.

## Effort + sequencing

Phases 1–2 are the core (roughly two working sessions each). Phase 3 is one session once Mike's contract doc is in hand. Phase 4 is small (one session) but depends on Phase 2's billing engine. Suggested order: **1 → 2 → 3 → 4**, shipping each phase live as it completes.

## Questions for Mike before we start

1. **Payoff horizon:** "billed monthly until paid off" — over how many months max? (6? Until season end?)
2. **Down payment scope:** is the 50% down on membership only, with add-ons paid in full up front — or 50% on the whole cart?
3. **Card fee on the down payment too?** (Assuming yes — it's a membership payment.)
4. **Zelle details:** which Zelle account/email should the instructions show?
5. **Late policy:** what happens when a card declines twice or a Zelle payment is 2+ weeks late — pause booking access?
6. **Midweek definition:** do holidays that fall Mon–Thu count as midweek days?
7. **Contract doc:** need the attachment — it wasn't included with the requirements message.

---
*Priority features from the same request (free booking links, cancel/reschedule links, cross-calendar time blocking, editable affiliate rewards) were built and deployed separately on 2026-08-20 — see session notes.*
