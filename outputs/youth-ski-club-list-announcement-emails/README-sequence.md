# Youth Ski Club — List Announcement Emails (GoHighLevel)

Audience: **John's current/full email list** — past Bell Acqua Lake customers who have not
submitted the Youth Ski Club form and don't yet know the program exists. This is a separate
sequence from `../youth-ski-club-emails/`, which is the 5-email nurture for parents who
already submitted the reservation form.

Goal: introduce the Youth Ski Club (Fall 2026, ages 10–17, $2,000 all-inclusive) to the
broader list and convert interest into registrations before and through the season opener.

**CTA destination:** every button points to the checkout at
`https://meek-duckanoo-53e84b.netlify.app/bell-acqua-youth-ski-club-checkout.html` — this is
the verified-live URL from the 2026-08-31 session. There's also a landing page at
`https://link.fgfunnels.com/preview/neQxlvj8lQmFl0NFzxeV`, but that's a funnel-builder
*preview* link, not confirmed as the published public page, so it was not used here. If Mike
wants a softer top-of-funnel landing page instead of sending straight to checkout, swap the
href in all four files once that page is live.

| # | Suggested send | File | Subject line | Preview text |
|---|-----------------|------|---------------|---------------|
| 1 | Tue, Sept 8 | `01-introducing-youth-ski-club.html` | Introducing the Bell Acqua Lake Youth Ski Club | Competition-level coaching for your skier, right here on our lake. |
| 2 | Fri, Sept 11 | `02-what-a-session-looks-like.html` | What a Youth Ski Club afternoon actually looks like | 4:00 to 6:30, three events, one private lake. |
| 3 | Mon, Sept 14 | `03-last-chance-before-season-opens.html` | Season opens tomorrow — last chance to start day one | Cohorts are capped. Register today to hold your skier's place. |
| 4 | Fri, Sept 18 | `04-season-underway-still-time.html` | The season's underway — still time for your skier to join | Sessions are running now. Here's how to jump in. |

That's a 3–4 day cadence across the 11 days from today (Sept 7) to Sept 18 — well inside
the two-week window, with email 3 landing the day before the season opens (Tuesday, Sept 15)
and email 4 following up once sessions are already running.

## Notes

- No spot-count numbers are used anywhere ("4 spots left," etc.) — per Mike's standing rule
  on the NCWSA/thank-you pages, scarcity claims must come from real registration data, and
  this session has no live read access to the `ysc_cohort_seats` table. Urgency here comes
  from the real season start date and "cohorts are capped," not invented counts. If John
  wants live spot counts in these emails, pull `ysc_cohort_availability` before send and
  swap in the real numbers.
- Phone number used throughout: **(916) 919-5726** — the confirmed-correct number per the
  2026-08-31 session (the older 991-5341 mockup number was wrong).
- Program facts (season dates, price, schedule, inclusions) are pulled from the existing
  Youth Ski Club landing page copy and thank-you page — nothing new was invented.
- Merge field used: `{{contact.first_name}}` only. This list doesn't have `skier_name` on
  file (that's collected on the form/checkout itself), so these emails don't attempt to
  personalize with a skier's name the way the post-form-fill sequence does.
- Email 4's "still time to join" framing assumes John is comfortable enrolling a skier a few
  days into a season that's priced as a flat $2,000 for the full 7 weeks — there's no
  pro-rating built anywhere in the checkout or database. If late joiners should pay less,
  that's a pricing decision Mike needs to make (and build) before this email goes out.
