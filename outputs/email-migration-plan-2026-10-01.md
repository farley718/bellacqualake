# Bell Acqua Lake — App Email (Resend) Migration Plan

**Date:** 2026-10-01
**Goal:** every transactional email (booking, waiver, payment, reminders, member notices) is sent by the app itself through Resend, from a Bell Acqua address. GoHighLevel (GHL) stays the CRM and marketing tool but stops sending transactional email.

---

## 1. What the app sends to customers today

Everything below goes out through GHL. The app posts a webhook, a GHL workflow sends the email.

| # | Email | When it fires | Who gets it | Status today |
|---|---|---|---|---|
| 1 | **Please sign your waiver** | Right after a lesson or ski-ride booking is paid | The customer and every skier in the party | Live (GHL) |
| 2 | **Booking confirmed** | When every waiver in the party is signed | The customer | Live (GHL). Includes the manage/reschedule link. |
| 3 | **Staff: new waiver signed** | Every time a waiver is signed | Staff on the notify roster | Live (GHL). Internal. |
| 4 | **Staff: new booking** | Every new booking | Staff on the notify roster | Live (GHL). Internal. |
| 5 | **Affiliate: you earned a credit** | A referred friend completes their first booking | The affiliate | Live (GHL) |
| 6 | **Member booking confirmed / cancelled** | A member books or cancels a slot in the portal | The member + staff | Live (GHL, via the notify-member-booking function) |
| 7 | **Youth Ski Club: 5-email nurture** | Landing form filled, not paid | Parent | Live (GHL workflow) |
| 8 | **Youth Ski Club: paid + waiver status** | Checkout paid | Parent | Live (GHL workflow) |
| 9 | **Membership welcome + sign your waiver** | Membership bought on the checkout page | New member | **Never wired.** Placeholder webhook. Nothing sends. |
| 10 | **Booking changed / rescheduled** | Customer reschedules on the manage page | Customer | **Not wired.** Nothing sends. |
| 11 | **Payment receipt** | Any card payment | Customer | Only if Stripe's own receipts are switched on in the Stripe dashboard. The app sends none. |
| 12 | **Installment charged** | Quarterly membership installment auto-charged | Member | **Nothing sends.** |
| 13 | **Booking reminder (day before)** | 24 h before a lesson / ski ride | Customer | **Does not exist** unless a GHL workflow was built by hand. |
| 14 | **Membership expiring / renewal reminder** | 30 and 7 days before membership end | Member | **Does not exist.** |

Rows 9 to 14 are the gaps. Moving to Resend fixes rows 1 to 8 and builds 9 to 14 for the first time.

---

## 2. What I need from you (one-time setup)

1. **The sending domain.** The plan was bellacqualakes.com (bellacqualake.com is inaccessible). Confirm Mike bought it and which registrar holds it (Namecheap?).
2. **Add the domain in Resend.** Resend → Domains → Add Domain → bellacqualakes.com. Resend shows 3 to 4 DNS records (DKIM, SPF/MX for bounces, optional DMARC). Add them at the registrar. Resend shows "Verified" once DNS catches up, usually under an hour.
3. **An API key.** Resend → API Keys → Create → permission "Sending access", restricted to that domain. **Do not paste it in chat.** Put it in Supabase: project euznpkrkkaieykznztho → Edge Functions → Secrets → name `RESEND_API_KEY`.
4. **The from address and reply-to.** My suggestion: `Bell Acqua Lake <bookings@bellacqualakes.com>`, reply-to `mtbalake@gmail.com` so replies land in Mike's inbox. Tell me if you want different ones.
5. **Reminder timing.** Default: booking reminder 24 h before; membership reminders 30 days and 7 days before expiry; installment receipt the moment the card is charged.

That is everything. The rest is build work on my side.

---

## 3. How it will work (surface level)

- One new "send email" service inside the app. Every page and every scheduled job calls it. It holds all the templates and the Bell Acqua branding.
- Every email sent is recorded in an **Email Log** the staff dashboard can show: who, what, when, delivered or bounced.
- Reminders run on a daily schedule inside the app, same mechanism that already charges installments.
- The GHL webhooks **keep firing** so contacts and tags keep syncing to the CRM. Only the email steps inside the GHL workflows get removed.

## 4. Build order (one flow at a time, each tested before the next)

1. Foundation: send service, email log, domain verified, one test email to John and Mike.
2. Waiver request + booking confirmed (rows 1, 2).
3. Member portal booking confirmed / cancelled (row 6).
4. Membership welcome + waiver (row 9) and installment receipt (row 12). Fixes two gaps.
5. Affiliate credit (row 5).
6. Booking reminder, membership expiry reminders (rows 13, 14). New.
7. Reschedule notice (row 10). New.
8. Youth Ski Club (rows 7, 8). Last, because the 5-email nurture is marketing-style and may stay in GHL by choice.
9. Staff notifications (rows 3, 4). Internal, lowest risk, can stay in GHL if preferred.

## 5. Turning off GHL emailing (do this per flow, after its Resend version is verified)

For each workflow, in GHL go to **Automations → Workflows**, open the workflow whose trigger is "Inbound Webhook":

1. Click the **Send Email** action inside it and delete that step only.
2. Leave the trigger and any tag / contact steps alone. That keeps the CRM in sync.
3. Save and keep the workflow published.

Never do this before the matching app email is live and tested, or customers get nothing. The order above is the safe order. Workflows to touch, by their webhook ID ending:

| Workflow (webhook id ends in) | Email step to remove | Remove at build step |
|---|---|---|
| …5d021de9 | Waiver request | 2 |
| …12d78a88079 | Booking confirmed | 2 |
| notify-member-booking target | Member booking confirmed / cancelled | 3 |
| …d982792d7770 | Affiliate credit | 5 |
| …aa1ce705cd5d | Youth Ski Club paid / nurture | 8 (if moving) |
| …11c48f97758f | Staff waiver notification | 9 (if moving) |

Stripe's own receipts: leave them on in Stripe if they are on today, or turn them off at step 4 once the app sends its own.
