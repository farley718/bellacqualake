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
