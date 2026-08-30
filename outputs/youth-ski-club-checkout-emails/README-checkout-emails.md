# Youth Ski Club — Post-Checkout Emails (GHL)

Two GHL-paste-ready HTML emails that fire from the Youth Ski Club webhook workflow
after a checkout completes. Table layout, fully inline styles, hidden preheader.

| # | File | Subject | Preview text | When it fires |
|---|------|---------|--------------|---------------|
| 1 | `01-payment-confirmed.html` | Payment confirmed — {{contact.skier_name}} is on the Fall 2026 roster 🎿 | Payment received and waiver on file — here's what happens next. | `registration_status = paid` AND `waiver_signed = true` |
| 2 | `02-payment-received-waiver-pending.html` | Payment received — one step left before your skier hits the water | The spot is held, but the safety waiver still needs a signature. | `registration_status = paid` AND `waiver_signed` is false/missing |

## Workflow branch logic

The checkout webhook payload carries `registration_status` and `waiver_signed`.

- `registration_status = "paid"` + `waiver_signed = true` → **Email 1**. This is the
  normal path: since 2026-08-30 the checkout collects the full Waiver & Release
  (sections A–E + signature) as step 3, *before* payment, so every new paid
  registration arrives with the waiver already signed.
- `registration_status = "paid"` + `waiver_signed` false or missing → **Email 2**.
  Edge path: registrations from before the in-flow waiver existed, or manual/phone
  registrations entered without one.
- `registration_status = "test"` → exit, or route to an internal-notify step only
  (these are `?test=1` runs — $0, `YSC-TEST-` registration ids).
- No `registration_status` at all → this is an unpaid landing-page lead → the
  existing 5-email nurture sequence (`outputs/youth-ski-club-emails/`), not these.

## Merge fields used

`{{contact.first_name}}`, `{{contact.skier_name}}`, `{{contact.preferred_schedule}}`,
`{{contact.registration_id}}` — the last three must be mapped as custom fields from
the inbound webhook payload (`skier_name`, `preferred_schedule`, `registration_id`).
If a custom field isn't mapped, GHL renders it blank — the summary-table layout
degrades gracefully, but map them for a proper receipt.

## Note on Email 2's CTA

There is deliberately **no waiver link** in Email 2: the facility waiver page
(`bell-acqua-waiver.html`) is token-gated per `waiver_requests` row, and no
self-serve YSC waiver flow exists. The email promises a personal link within one
business day and offers phone/reply — so pair Email 2 with an **internal
notification** step so staff actually mint and send that link. If waiver-pending
registrations turn out to be common, build a tokenized YSC waiver flow
(waiver_requests + ysc_registration_id column) and swap the CTA to a real button.
