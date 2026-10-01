// send-email — Bell Acqua Lake's own transactional email service (Resend).
//
// Pages never pass email bodies. They say what happened ("event") and which
// record, and this function looks the record up itself, builds the email,
// sends it through Resend and records it in email_log. That keeps the anon
// key from being usable to send arbitrary mail.
//
// CUSTOMER EVENTS                      fired from
//   booking_receipt    {booking_id}    booking + lesson pages, right after payment
//   waiver_request     {booking_id}    booking + lesson pages (every unsigned skier)
//   booking_confirmed  {booking_id}    booking page / waiver page when all waivers signed
//   booking_changed    {booking_id, change, details}   manage page (reschedule, add, party size, cancel)
//   member_booking     {action, booking_ids|booking_id}  member portal (created / cancelled)
//   membership_welcome {membership_id} membership checkout (welcome + each skier's waiver link)
//   membership_active  {membership_id} waiver page when the last membership waiver is signed
//   affiliate_credit   {booking_id}    booking page when a referred friend completes a booking
//   ysc_paid           {registration_id} youth ski club checkout
//   ysc_lead           {lead_id}       youth ski club landing form (nurture email 1, immediately)
//   installment_receipt {payment_id}   charge-membership-installments (service role)
//   installment_failed  {payment_id, reason}
//
// STAFF COPIES go to active staff with "notify new bookings" on (Staff tab).
//   waiver_signed      {token}         waiver page → staff only, with PDF link
//
// SCHEDULED (x-cron-key header = CRON_SECRET)
//   daily                              booking reminders (tomorrow), member ride reminders,
//                                      membership expiring (30 / 7 days), youth club nurture steps
//
// STAFF TOOLS (recipient must be an active staff member's address)
//   test {to}                          connection test
//   preview {to, template}             sample of any template with made-up data
//
// Deploy:  supabase functions deploy send-email --project-ref euznpkrkkaieykznztho
// Secrets: RESEND_API_KEY (required), CRON_SECRET (same one the installment charger uses)
//          EMAIL_FROM / EMAIL_REPLY_TO / APP_BASE_URL optional
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET    = Deno.env.get("CRON_SECRET") ?? "";
const FROM     = Deno.env.get("EMAIL_FROM")     ?? "Bell Acqua Lake <info@bellacqualakes.com>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "mtbalake@gmail.com";
const BASE     = (Deno.env.get("APP_BASE_URL")  ?? "https://meek-duckanoo-53e84b.netlify.app").replace(/\/$/, "");
const PHONE    = "(916) 919-5726";
const ADDRESS  = "930 E St, Rio Linda, CA 95673";
const MAPS_URL = "https://maps.google.com/?q=" + encodeURIComponent("Bell Acqua Lake, " + ADDRESS);

const URLS = {
  waiver:     (token: string) => `${BASE}/bell-acqua-waiver.html?token=${encodeURIComponent(token)}`,
  waiverPdf:  (token: string) => `${BASE}/bell-acqua-waiver.html?token=${encodeURIComponent(token)}&view=pdf`,
  manage:     (id: string, email: string) => `${BASE}/bell-acqua-manage.html?ref=${encodeURIComponent(id)}&email=${encodeURIComponent(email || "")}`,
  booking:    `${BASE}/bell-acqua-booking.html`,
  portal:     `${BASE}/bell-acqua-member.html`,
  membership: `${BASE}/bell-acqua-membership.html`,
  affiliate:  `${BASE}/bell-acqua-affiliate.html`,
  staff:      `${BASE}/bell-acqua-staff.html`,
  ysc:        `${BASE}/bell-acqua-youth-ski-club-checkout.html`,
};

const YSC = { program: "Youth Ski Club — Fall 2026", season: "Sept 15 – Oct 31, 2026", price: "$2,000",
  cohorts: { tue_thu: "Tuesday & Thursday, 4:00–6:30 PM", mon_wed: "Monday & Wednesday, 4:00–6:30 PM" } as Record<string, string> };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const event = String(body.event ?? "");

  try {
    switch (event) {
      case "booking_receipt":     return json(await evBookingReceipt(body));
      case "waiver_request":      return json(await evWaiverRequest(body));
      case "booking_confirmed":   return json(await evBookingConfirmed(body));
      case "booking_changed":     return json(await evBookingChanged(body));
      case "waiver_signed":       return json(await evWaiverSigned(body));
      case "member_booking":      return json(await evMemberBooking(body));
      case "membership_welcome":  return json(await evMembershipWelcome(body));
      case "membership_active":   return json(await evMembershipActive(body));
      case "affiliate_credit":    return json(await evAffiliateCredit(body));
      case "ysc_paid":            return json(await evYscPaid(body));
      case "ysc_lead":            return json(await evYscLead(body));
      case "installment_receipt": return json(await evInstallment(body, "receipt"));
      case "installment_failed":  return json(await evInstallment(body, "failed"));
      case "daily": {
        if (CRON_SECRET && req.headers.get("x-cron-key") !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);
        return json(await evDaily());
      }
      case "test":                return json(await evTest(body));
      case "preview":             return json(await evPreview(body));
      default:                    return json({ error: `Unknown event "${event}"` }, 400);
    }
  } catch (e) {
    console.error("send-email error:", e);
    return json({ error: (e as Error)?.message ?? "Server error" }, 500);
  }
});

/* ═══════════════════════════════════════════════════════════
   EVENTS — load data, pick template, send, log
   ═══════════════════════════════════════════════════════════ */

async function evBookingReceipt(b: any) {
  const booking = await loadBooking(req(b.booking_id, "booking_id"));
  const results = [];
  if (booking.email && !(await sentEver("booking_receipt", booking.id, booking.email))) {
    results.push(await send("booking_receipt", booking.email, fullName(booking), T.booking_receipt(booking), { bookingId: booking.id }));
  }
  results.push(...await sendStaff("staff_new_booking", T.staff_new_booking(booking), { bookingId: booking.id, dedupe: true }));
  return { ok: true, results };
}

async function evWaiverRequest(b: any) {
  const booking = await loadBooking(req(b.booking_id, "booking_id"));
  let q = db.from("waiver_requests").select("guest_index, guest_name, guest_email, token, status").eq("booking_id", booking.id).neq("status", "signed").order("guest_index");
  if (b.guest_index !== undefined && b.guest_index !== null) q = q.eq("guest_index", Number(b.guest_index));
  const { data: rows, error } = await q; if (error) throw error;
  const results = [];
  for (const w of rows ?? []) {
    if (!w.guest_email) { results.push({ guest: w.guest_name, status: "skipped", reason: "no email" }); continue; }
    if (!b.force && await sentRecently("waiver_request", booking.id, w.guest_email, 10)) { results.push({ guest: w.guest_name, status: "skipped", reason: "sent in last 10 min" }); continue; }
    results.push(await send("waiver_request", w.guest_email, w.guest_name, T.waiver_request({ booking, guestName: w.guest_name, guestEmail: w.guest_email, waiverUrl: URLS.waiver(w.token) }), { bookingId: booking.id, meta: { guest_index: w.guest_index } }));
  }
  return { ok: true, results };
}

async function evBookingConfirmed(b: any) {
  const booking = await loadBooking(req(b.booking_id, "booking_id"));
  if (!booking.email) return skip("booking has no email");
  if (!b.force && await sentEver("booking_confirmed", booking.id, booking.email)) return skip("already sent for this booking");
  return { ok: true, results: [await send("booking_confirmed", booking.email, fullName(booking), T.booking_confirmed(booking), { bookingId: booking.id })] };
}

async function evBookingChanged(b: any) {
  const booking = await loadBooking(req(b.booking_id, "booking_id"));
  const change = String(b.change ?? "update");
  const details = (b.details && typeof b.details === "object") ? b.details : {};
  const results = [];
  if (booking.email && !(await sentRecently("booking_changed", booking.id, booking.email, 2, { change }))) {
    results.push(await send("booking_changed", booking.email, fullName(booking), T.booking_changed({ booking, change, details }), { bookingId: booking.id, meta: { change } }));
  }
  results.push(...await sendStaff("staff_booking_changed", T.staff_booking_changed({ booking, change, details }), { bookingId: booking.id }));
  return { ok: true, results };
}

async function evWaiverSigned(b: any) {
  const token = req(b.token, "token");
  const { data: w } = await db.from("waiver_requests").select("id, booking_id, membership_id, guest_name, guest_email, status, signed_at, token").eq("token", token).maybeSingle();
  if (!w) throw new Error("waiver not found");
  const booking = w.booking_id ? await loadBooking(w.booking_id).catch(() => null) : null;
  const results = await sendStaff("staff_waiver_signed", T.staff_waiver_signed({ waiver: w, booking, pdfUrl: URLS.waiverPdf(w.token) }), { bookingId: w.booking_id ?? undefined, membershipId: w.membership_id ?? undefined, meta: { waiver_id: w.id }, dedupe: true });
  return { ok: true, results };
}

async function evMemberBooking(b: any) {
  const action = b.action === "cancelled" ? "cancelled" : "created";
  const ids: string[] = Array.isArray(b.booking_ids) ? b.booking_ids.map(String) : (b.booking_id ? [String(b.booking_id)] : []);
  if (!ids.length) throw new Error("booking_ids required");
  const { data: rows } = await db.from("member_bookings").select("id, member_id, member_email, member_name, booking_date, slot_start, slot_end, status").in("id", ids).order("slot_start");
  if (!rows || !rows.length) return skip("member booking not found");
  const r0 = rows[0];
  const data = { action, memberName: r0.member_name || "Member", memberEmail: r0.member_email, date: r0.booking_date, slots: rows.map(r => `${fmtTime(r.slot_start)} – ${fmtTime(r.slot_end)}`) };
  const results = [];
  const key = ids.sort().join(",");
  if (r0.member_email && !(await sentEver(`member_booking_${action}`, key, r0.member_email))) {
    results.push(await send(`member_booking_${action}`, r0.member_email, r0.member_name, T.member_booking(data), { bookingId: key, membershipId: r0.member_id, meta: { date: r0.booking_date } }));
  }
  results.push(...await sendStaff("staff_member_booking", T.staff_member_booking(data), { bookingId: key, meta: { action }, dedupe: true }));
  return { ok: true, results };
}

async function evMembershipWelcome(b: any) {
  const m = await loadMembership(req(b.membership_id, "membership_id"));
  const { data: waivers } = await db.from("waiver_requests").select("guest_index, guest_name, guest_email, token, status").eq("membership_id", m.id).order("guest_index");
  const { data: pays } = await db.from("membership_payments").select("seq, amount, due_date, status").eq("membership_id", m.id).order("seq");
  const ws = (waivers ?? []).map(w => ({ name: w.guest_name, email: w.guest_email, url: URLS.waiver(w.token), signed: w.status === "signed", index: w.guest_index }));
  const data = { m, waivers: ws, payments: pays ?? [] };
  const results = [];
  if (!(await sentEver("membership_welcome", m.id, m.email))) {
    results.push(await send("membership_welcome", m.email, fullName(m), T.membership_welcome(data), { membershipId: m.id }));
  }
  for (const w of ws) {
    if (!w.email || w.index === 0 || w.email.toLowerCase() === (m.email || "").toLowerCase() || w.signed) continue;
    if (await sentEver("membership_waiver_request", m.id, w.email)) continue;
    results.push(await send("membership_waiver_request", w.email, w.name, T.membership_waiver_request({ m, waiver: w }), { membershipId: m.id, meta: { guest_index: w.index } }));
  }
  results.push(...await sendStaff("staff_new_membership", T.staff_new_membership(data), { membershipId: m.id, dedupe: true }));
  return { ok: true, results };
}

async function evMembershipActive(b: any) {
  const m = await loadMembership(req(b.membership_id, "membership_id"));
  if (!b.force && await sentEver("membership_active", m.id, m.email)) return skip("already sent");
  return { ok: true, results: [await send("membership_active", m.email, fullName(m), T.membership_active({ m }), { membershipId: m.id })] };
}

async function evAffiliateCredit(b: any) {
  const bookingId = req(b.booking_id, "booking_id");
  const { data: ref } = await db.from("affiliate_referrals").select("id, affiliate_id, referred_name, credit_pct, credit_coupon_code, status").eq("booking_id", bookingId).eq("status", "earned").maybeSingle();
  if (!ref) return skip("no earned referral for this booking");
  const { data: aff } = await db.from("affiliates").select("name, email, code").eq("id", ref.affiliate_id).maybeSingle();
  if (!aff || !aff.email) return skip("affiliate has no email");
  if (!b.force && await sentEver("affiliate_credit", bookingId, aff.email)) return skip("already sent");
  const data = { affiliateName: aff.name, code: ref.credit_coupon_code, pct: Number(ref.credit_pct || 20), referredFirst: firstName(ref.referred_name || "") || "your friend" };
  return { ok: true, results: [await send("affiliate_credit", aff.email, aff.name, T.affiliate_credit(data), { bookingId })] };
}

async function evYscPaid(b: any) {
  const id = req(b.registration_id, "registration_id");
  const { data: r } = await db.from("ysc_registrations").select("id, parent_first, parent_last, parent_email, parent_phone, skier_name, skier_age, skier_level, cohort, amount_paid, waiver_signed, status, created_at").eq("id", id).maybeSingle();
  if (!r) throw new Error("registration not found");
  const results = [];
  if (r.parent_email && !(await sentEver("ysc_paid", r.id, r.parent_email))) {
    results.push(await send("ysc_paid", r.parent_email, `${r.parent_first} ${r.parent_last}`, T.ysc_paid({ r }), { bookingId: r.id }));
  }
  results.push(...await sendStaff("staff_ysc_paid", T.staff_ysc_paid({ r }), { bookingId: r.id, dedupe: true }));
  // stop the nurture sequence for this parent
  await db.from("ysc_leads").update({ status: "paid" }).ilike("email", r.parent_email).eq("status", "open");
  return { ok: true, results };
}

async function evYscLead(b: any) {
  const id = req(b.lead_id, "lead_id");
  const { data: lead } = await db.from("ysc_leads").select("id, first_name, email, status, created_at").eq("id", id).maybeSingle();
  if (!lead || !lead.email) throw new Error("lead not found");
  if (lead.status !== "open") return skip(`lead is ${lead.status}`);
  if (await sentWithMeta("ysc_nurture", lead.id, lead.email, { step: 1 })) return skip("step 1 already sent");
  return { ok: true, results: [await send("ysc_nurture", lead.email, lead.first_name, T.ysc_nurture({ first: lead.first_name, step: 1 }), { bookingId: lead.id, meta: { step: 1 } })] };
}

async function evInstallment(b: any, kind: "receipt" | "failed") {
  const paymentId = req(b.payment_id, "payment_id");
  const { data: p } = await db.from("membership_payments").select("id, membership_id, seq, amount, due_date, status, paid_at, note").eq("id", paymentId).maybeSingle();
  if (!p) throw new Error("payment not found");
  const m = await loadMembership(p.membership_id);
  const { data: all } = await db.from("membership_payments").select("seq, amount, due_date, status").eq("membership_id", m.id).order("seq");
  const results = [];
  const ev = kind === "receipt" ? "installment_receipt" : "installment_failed";
  if (m.email && !(await sentWithMeta(ev, m.id, m.email, { payment_id: p.id }))) {
    const data = { m, p, all: all ?? [], reason: String(b.reason ?? p.note ?? "") };
    results.push(await send(ev, m.email, fullName(m), kind === "receipt" ? T.installment_receipt(data) : T.installment_failed(data), { membershipId: m.id, meta: { payment_id: p.id, seq: p.seq } }));
  }
  if (kind === "failed") results.push(...await sendStaff("staff_installment_failed", T.staff_installment_failed({ m, p, reason: String(b.reason ?? p.note ?? "") }), { membershipId: m.id, meta: { payment_id: p.id }, dedupe: true }));
  return { ok: true, results };
}

/* ── daily job ─────────────────────────────────────────────── */
async function evDaily() {
  const today = laDate(0), tomorrow = laDate(1);
  const out: Record<string, number> = { booking_reminders: 0, member_reminders: 0, membership_expiring: 0, ysc_nurture: 0, skipped: 0 };

  // 1. Public bookings tomorrow
  const { data: bookings } = await db.from("bookings").select("id, email, first_name, last_name, party_size, booking_type, slots, total_amount, status").eq("status", "confirmed");
  for (const bk of (bookings ?? []) as Booking[]) {
    if (!bk.email || !(bk.slots ?? []).some(s => slotDate(s) === tomorrow)) continue;
    if (await sentWithMeta("booking_reminder", bk.id, bk.email, { date: tomorrow })) { out.skipped++; continue; }
    await send("booking_reminder", bk.email, fullName(bk), T.booking_reminder({ booking: bk, date: tomorrow }), { bookingId: bk.id, meta: { date: tomorrow } });
    out.booking_reminders++;
  }

  // 2. Member rides tomorrow (one email per member)
  const { data: mrows } = await db.from("member_bookings").select("id, member_id, member_email, member_name, booking_date, slot_start, slot_end").eq("booking_date", tomorrow).eq("status", "confirmed").order("slot_start");
  const byMember: Record<string, any[]> = {};
  for (const r of mrows ?? []) { if (r.member_email) (byMember[r.member_email.toLowerCase()] ??= []).push(r); }
  for (const [email, rows] of Object.entries(byMember)) {
    const key = `member:${rows[0].member_id || email}`;
    if (await sentWithMeta("member_reminder", key, email, { date: tomorrow })) { out.skipped++; continue; }
    await send("member_reminder", email, rows[0].member_name, T.member_reminder({ memberName: rows[0].member_name, date: tomorrow, slots: rows.map(r => `${fmtTime(r.slot_start)} – ${fmtTime(r.slot_end)}`) }), { bookingId: key, membershipId: rows[0].member_id, meta: { date: tomorrow } });
    out.member_reminders++;
  }

  // 3. Memberships ending in 30 / 7 days
  for (const days of [30, 7]) {
    const target = laDate(days);
    const { data: profs } = await db.from("profiles").select("id, email, first_name, last_name, membership_end, membership_type").eq("membership_end", target);
    for (const p of profs ?? []) {
      if (!p.email || p.email.includes("@placeholder.")) continue;
      if (await sentWithMeta("membership_expiring", p.id, p.email, { days })) { out.skipped++; continue; }
      await send("membership_expiring", p.email, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), T.membership_expiring({ first: p.first_name, end: p.membership_end, days, plan: p.membership_type }), { membershipId: p.id, meta: { days, end: p.membership_end } });
      out.membership_expiring++;
    }
  }

  // 4. Youth Ski Club nurture (steps 2–5 by days since the lead came in; step 1 is immediate)
  const { data: leads } = await db.from("ysc_leads").select("id, first_name, email, created_at, status").eq("status", "open");
  for (const lead of leads ?? []) {
    if (!lead.email) continue;
    const { count: paid } = await db.from("ysc_registrations").select("id", { count: "exact", head: true }).ilike("parent_email", lead.email).eq("status", "paid");
    if ((paid ?? 0) > 0) { await db.from("ysc_leads").update({ status: "paid" }).eq("id", lead.id); continue; }
    const age = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000);
    for (const [step, offset] of [[2, 1], [3, 3], [4, 5], [5, 7]] as [number, number][]) {
      if (age < offset) break;
      if (await sentWithMeta("ysc_nurture", lead.id, lead.email, { step })) continue;
      await send("ysc_nurture", lead.email, lead.first_name, T.ysc_nurture({ first: lead.first_name, step }), { bookingId: lead.id, meta: { step } });
      out.ysc_nurture++;
      break; // one step per day
    }
  }
  console.log("daily:", JSON.stringify(out));
  return { ok: true, date: today, ...out };
}

/* ── staff tools ───────────────────────────────────────────── */
async function evTest(b: any) {
  const staff = await requireStaff(b.to);
  return { ok: true, results: [await send("test", staff.email, staff.name, T.test({ name: staff.name }), {})] };
}

async function evPreview(b: any) {
  const staff = await requireStaff(b.to);
  const template = String(b.template ?? "");
  const data = SAMPLES(staff);
  const tpl = (T as any)[template];
  if (!tpl || !(template in data)) throw new Error(`Unknown template "${template}". Available: ${Object.keys(data).join(", ")}`);
  const m = tpl((data as any)[template]);
  m.subject = `[SAMPLE] ${m.subject}`;
  return { ok: true, results: [await send("preview", staff.email, staff.name, m, { meta: { template } })] };
}

async function requireStaff(toRaw: unknown) {
  const to = String(toRaw ?? "").trim().toLowerCase();
  if (!to) throw new Error("to required");
  const { data } = await db.from("staff_members").select("id, name, email").eq("is_active", true).ilike("email", to).limit(1);
  if (!data || !data.length) throw new Error("Only an active staff member's address can receive tests and samples.");
  return { name: data[0].name as string, email: to };
}

/* ═══════════════════════════════════════════════════════════
   SENDING + LOGGING
   ═══════════════════════════════════════════════════════════ */
type Msg = { subject: string; html: string; text: string };
type Opts = { bookingId?: string; membershipId?: string; meta?: Record<string, unknown> };

async function send(event: string, to: string, toName: string | null | undefined, m: Msg, o: Opts) {
  let status = "sent", resendId: string | null = null, error: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text, tags: [{ name: "event", value: event.replace(/[^a-zA-Z0-9_-]/g, "_") }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { status = "failed"; error = data?.message || `Resend HTTP ${r.status}`; } else resendId = data?.id ?? null;
  } catch (e) { status = "failed"; error = (e as Error).message; }
  await db.from("email_log").insert({ event, to_email: to, to_name: toName ?? null, subject: m.subject, status, resend_id: resendId, error, booking_id: o.bookingId ?? null, membership_id: o.membershipId ?? null, meta: o.meta ?? {} });
  return { event, to, status, id: resendId, error };
}

async function staffRecipients() {
  const { data } = await db.from("staff_members").select("name, email").eq("is_active", true).eq("notify_new_bookings", true);
  return (data ?? []).filter(s => s.email && /@/.test(s.email)).map(s => ({ name: s.name as string, email: String(s.email).toLowerCase() }));
}
async function sendStaff(event: string, m: Msg, o: Opts & { dedupe?: boolean }) {
  const results = [];
  for (const s of await staffRecipients()) {
    if (o.dedupe && o.bookingId && await sentWithMeta(event, o.bookingId, s.email, o.meta ?? {})) continue;
    results.push(await send(event, s.email, s.name, m, o));
  }
  return results;
}

async function sentRecently(event: string, bookingId: string, to: string, minutes: number, meta?: Record<string, unknown>) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  let q = db.from("email_log").select("id", { count: "exact", head: true }).eq("event", event).eq("booking_id", bookingId).ilike("to_email", to).eq("status", "sent").gte("created_at", since);
  if (meta) q = q.contains("meta", meta);
  const { count } = await q; return (count ?? 0) > 0;
}
async function sentEver(event: string, key: string, to: string) {
  const { count } = await db.from("email_log").select("id", { count: "exact", head: true }).eq("event", event).or(`booking_id.eq.${key},membership_id.eq.${key}`).ilike("to_email", to).eq("status", "sent");
  return (count ?? 0) > 0;
}
async function sentWithMeta(event: string, key: string, to: string, meta: Record<string, unknown>) {
  const { count } = await db.from("email_log").select("id", { count: "exact", head: true }).eq("event", event).or(`booking_id.eq.${key},membership_id.eq.${key}`).ilike("to_email", to).eq("status", "sent").contains("meta", meta);
  return (count ?? 0) > 0;
}
function skip(reason: string) { return { ok: true, results: [{ status: "skipped", reason }] }; }
function req(v: unknown, name: string) { const s = String(v ?? "").trim(); if (!s) throw new Error(`${name} required`); return s; }

/* ═══════════════════════════════════════════════════════════
   DATA HELPERS
   ═══════════════════════════════════════════════════════════ */
type Slot = { id?: string; date?: string; label?: string };
type Booking = { id: string; email: string; first_name: string; last_name: string; phone?: string; party_name?: string; party_size?: number; booking_type?: string; slots?: Slot[]; total_amount?: number; status?: string; applied_coupon?: string | null };
type Membership = { id: string; first_name: string; last_name: string; email: string; phone?: string; plan: string; addons?: any[]; supplementary?: any[]; payment_term: string; total_amount: number; amount_paid: number; installment_amount?: number; membership_start: string; membership_end: string; status: string };

async function loadBooking(id: string): Promise<Booking> {
  const { data, error } = await db.from("bookings").select("id, email, first_name, last_name, phone, party_name, party_size, booking_type, slots, total_amount, status, applied_coupon").eq("id", id).maybeSingle();
  if (error) throw error; if (!data) throw new Error(`Booking ${id} not found`);
  return data as Booking;
}
async function loadMembership(id: string): Promise<Membership> {
  const { data, error } = await db.from("memberships").select("id, first_name, last_name, email, phone, plan, addons, supplementary, payment_term, total_amount, amount_paid, installment_amount, membership_start, membership_end, status").eq("id", id).maybeSingle();
  if (error) throw error; if (!data) throw new Error(`Membership ${id} not found`);
  return data as Membership;
}
function fullName(x: { first_name?: string; last_name?: string }) { return `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim(); }
function firstName(full?: string) { return (full || "").trim().split(/\s+/)[0] || ""; }
function bookingLabel(b: Booking) { return b.booking_type === "ski_ride_lesson" ? "Ski Ride with Lesson" : b.booking_type === "beginner_intermediate" ? "Beginner / Intermediate Lesson" : "your session"; }
function planLabel(p?: string) { return p === "midweek" ? "Mid-Week Membership (Mon–Thu)" : p === "unlimited" ? "Full-Time Unlimited Membership" : (p || "Membership"); }
function slotDate(s: Slot) { return s.date || (s.id || "").split("__")[0] || ""; }
function laDate(offsetDays: number) { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function longDate(iso?: string) { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function midDate(iso?: string) { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function shortDate(b: Booking) {
  const dates = [...new Set((b.slots ?? []).map(slotDate).filter(Boolean))].sort();
  if (!dates.length) return "your booking";
  const [y, m, d] = dates[0].split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return dates.length > 1 ? `${s} +${dates.length - 1} more` : s;
}
function fmtTime(t?: string) { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`; }
function money(n: unknown) { const v = Number(n || 0); return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function slotLines(b: Booking, onlyDate?: string) {
  const slots = [...(b.slots ?? [])].filter(s => !onlyDate || slotDate(s) === onlyDate).sort((a, c) => `${slotDate(a)} ${a.id}`.localeCompare(`${slotDate(c)} ${c.id}`));
  return slots.map(s => `${longDate(slotDate(s))} · ${s.label || (s.id || "").split("__")[1] || ""}`);
}
function bookingRows(b: Booking) {
  return [["Booking", esc(b.id)], ["Session", esc(bookingLabel(b))], ["When", slotLines(b).map(esc).join("<br>") || "—"], ["Skiers", String(b.party_size || 1)]];
}
function summaryText(b: Booking) { return `Booking: ${b.id}\nSession: ${bookingLabel(b)}\nWhen: ${slotLines(b).join("; ") || "—"}\nSkiers: ${b.party_size || 1}`; }

/* ═══════════════════════════════════════════════════════════
   TEMPLATES — pure functions of data (so previews can use samples)
   ═══════════════════════════════════════════════════════════ */
const T = {
  /* ── public bookings ── */
  booking_receipt: (b: Booking): Msg => {
    const rows = [...bookingRows(b), ["Paid", money(b.total_amount) + (b.applied_coupon ? ` <span class="muted">(coupon ${esc(b.applied_coupon)})</span>` : "")]];
    return layout({
      title: "Payment received — thank you!",
      preheader: `${bookingLabel(b)} on ${shortDate(b)}. Waiver links are on their way.`,
      body: `<p>Hi ${esc(b.first_name || "there")},</p>
        <p>We've received your payment for ${esc(bookingLabel(b))}. Here's your receipt.</p>
        ${table(rows)}
        <p><strong>One more step:</strong> every skier signs a short safety waiver online before their time on the water. Each skier gets their own waiver link by email (yours is in a separate message). Your booking is confirmed once everyone has signed.</p>
        ${button("View or change my booking", URLS.manage(b.id, b.email))}
        ${whereBlock()}`,
      text: `Hi ${b.first_name || "there"},\n\nWe've received your payment for ${bookingLabel(b)}.\n\n${summaryText(b)}\nPaid: ${money(b.total_amount)}\n\nEvery skier signs a short safety waiver online before skiing; each skier gets their own link by email. Your booking is confirmed once everyone has signed.\n\nView or change your booking: ${URLS.manage(b.id, b.email)}\n\nWhere: Bell Acqua Lake, ${ADDRESS}`,
    });
  },
  waiver_request: (d: { booking: Booking; guestName: string; guestEmail: string; waiverUrl: string }): Msg => {
    const b = d.booking, isPrimary = (d.guestEmail || "").toLowerCase() === (b.email || "").toLowerCase();
    const first = firstName(d.guestName) || b.first_name || "there";
    return layout({
      title: "One quick step before you ski",
      preheader: `Sign your waiver for ${bookingLabel(b)} on ${shortDate(b)}.`,
      body: `<p>Hi ${esc(first)},</p>
        <p>${isPrimary ? "Thanks for booking with us!" : `${esc(b.first_name)} ${esc(b.last_name)} has booked you in for a ride with us.`} Every skier signs our safety waiver online before their time on the water. It takes about two minutes.</p>
        ${table(bookingRows(b))}
        ${button("Sign my waiver", d.waiverUrl)}
        <p class="muted">The link is personal to you. If you're signing for a minor, you'll be able to add their name on the form.</p>
        ${isPrimary ? `<p class="muted">Need to change your time? <a href="${URLS.manage(b.id, b.email)}">Manage your booking</a>.</p>` : ""}`,
      text: `Hi ${first},\n\nPlease sign your safety waiver before your ${bookingLabel(b)} on ${shortDate(b)}:\n${d.waiverUrl}\n\n${summaryText(b)}`,
    }, `Please sign your waiver — Bell Acqua Lake, ${shortDate(b)}`);
  },
  booking_confirmed: (b: Booking): Msg => layout({
    title: "You're all set!",
    preheader: `${bookingLabel(b)} on ${shortDate(b)} is confirmed.`,
    body: `<p>Hi ${esc(b.first_name || "there")},</p>
      <p>Your waivers are in and your booking is confirmed. We'll see you on the water!</p>
      ${table(bookingRows(b))}
      ${button("View or change my booking", URLS.manage(b.id, b.email))}
      ${whereBlock()}
      <p class="muted">Please arrive 15 minutes early. Need to reschedule? Use the link above or call us at ${PHONE}.</p>`,
    text: `Hi ${b.first_name || "there"},\n\nYour booking is confirmed.\n\n${summaryText(b)}\n\nView or change your booking: ${URLS.manage(b.id, b.email)}\nWhere: Bell Acqua Lake, ${ADDRESS}\nPlease arrive 15 minutes early.`,
  }, `You're confirmed — ${bookingLabel(b)}, ${shortDate(b)}`),
  booking_changed: (d: { booking: Booking; change: string; details: any }): Msg => {
    const b = d.booking, x = d.details || {};
    const what: Record<string, [string, string]> = {
      reschedule:        ["Your booking has been rescheduled", `Moved from <strong>${esc(x.old_booking_date || "")}</strong> (${esc(x.old_slots_summary || "")}) to <strong>${esc(x.new_booking_date || "")}</strong> (${esc(x.new_slots_summary || "")}).`],
      slots_added:       ["Sessions added to your booking", `You added: ${esc(x.added_slots_summary || x.new_slots_summary || "new sessions")}.`],
      party_size_change: ["Your party size was updated", `Skiers changed from <strong>${esc(x.old_party_size ?? "")}</strong> to <strong>${esc(x.new_party_size ?? "")}</strong>.${Number(x.new_party_size) > Number(x.old_party_size) ? " New skiers will each receive a waiver link to sign." : ""}`],
      cancellation:      ["Your booking has been cancelled", `Your booking for <strong>${esc(x.booking_date || shortDate(b))}</strong> (${esc(x.slots_summary || "")}) is cancelled. If this wasn't you, call us right away at ${PHONE}.`],
    };
    const [title, line] = what[d.change] || ["Your booking was updated", "Here are your current booking details."];
    const cancelled = d.change === "cancellation";
    return layout({
      title, preheader: `${bookingLabel(b)} — ${title.toLowerCase()}.`,
      body: `<p>Hi ${esc(b.first_name || "there")},</p><p>${line}</p>${cancelled ? "" : table(bookingRows(b))}${cancelled ? button("Book again", URLS.booking) : button("View my booking", URLS.manage(b.id, b.email))}${cancelled ? "" : whereBlock()}`,
      text: `Hi ${b.first_name || "there"},\n\n${title}.\n${line.replace(/<[^>]+>/g, "")}\n\n${cancelled ? `Book again: ${URLS.booking}` : summaryText(b) + "\n\nView your booking: " + URLS.manage(b.id, b.email)}`,
    }, `${title} — Bell Acqua Lake`);
  },
  booking_reminder: (d: { booking: Booking; date: string }): Msg => {
    const b = d.booking;
    return layout({
      title: "See you tomorrow!",
      preheader: `Your ${bookingLabel(b)} is tomorrow, ${midDate(d.date)}.`,
      body: `<p>Hi ${esc(b.first_name || "there")},</p>
        <p>Just a reminder that your ${esc(bookingLabel(b))} is <strong>tomorrow</strong>.</p>
        ${table([["When", slotLines(b, d.date).map(esc).join("<br>")], ["Skiers", String(b.party_size || 1)], ["Booking", esc(b.id)]])}
        ${whereBlock()}
        <p><strong>Bring:</strong> swimsuit, towel, sunscreen. We supply skis, vests and ropes. Please arrive 15 minutes early.</p>
        ${button("View or change my booking", URLS.manage(b.id, b.email))}
        <p class="muted">Can't make it? Reschedule from the link above or call ${PHONE}.</p>`,
      text: `Hi ${b.first_name || "there"},\n\nReminder: your ${bookingLabel(b)} is tomorrow.\n${slotLines(b, d.date).join("\n")}\n\nWhere: Bell Acqua Lake, ${ADDRESS}\nBring swimsuit, towel, sunscreen. Arrive 15 minutes early.\n\nView or change: ${URLS.manage(b.id, b.email)}`,
    }, `Reminder: ${bookingLabel(b)} tomorrow at Bell Acqua Lake`);
  },

  /* ── member portal ── */
  member_booking: (d: { action: string; memberName: string; date: string; slots: string[] }): Msg => {
    const cancelled = d.action === "cancelled";
    return layout({
      title: cancelled ? "Ride cancelled" : "Ride booked",
      preheader: `${cancelled ? "Cancelled" : "Booked"}: ${midDate(d.date)}, ${d.slots.join(", ")}.`,
      body: `<p>Hi ${esc(firstName(d.memberName) || "there")},</p>
        <p>${cancelled ? "Your member ride has been cancelled." : "Your member ride is booked. See you on the water!"}</p>
        ${table([["Date", esc(longDate(d.date))], ["Time", d.slots.map(esc).join("<br>")]])}
        ${button(cancelled ? "Book another ride" : "Open the member portal", URLS.portal)}
        ${cancelled ? "" : "<p class=\"muted\">Need to cancel? Open the portal and cancel from your upcoming rides.</p>"}`,
      text: `Hi ${firstName(d.memberName) || "there"},\n\n${cancelled ? "Your member ride has been cancelled." : "Your member ride is booked."}\nDate: ${longDate(d.date)}\nTime: ${d.slots.join(", ")}\n\nMember portal: ${URLS.portal}`,
    }, cancelled ? `Ride cancelled — ${midDate(d.date)}` : `Ride booked — ${midDate(d.date)}, ${d.slots[0] || ""}`);
  },
  member_reminder: (d: { memberName: string; date: string; slots: string[] }): Msg => layout({
    title: "Your ride is tomorrow",
    preheader: `${midDate(d.date)}: ${d.slots.join(", ")}.`,
    body: `<p>Hi ${esc(firstName(d.memberName) || "there")},</p><p>Reminder: you're on the water <strong>tomorrow</strong>.</p>
      ${table([["Date", esc(longDate(d.date))], ["Time", d.slots.map(esc).join("<br>")]])}
      ${button("Open the member portal", URLS.portal)}
      <p class="muted">Can't make it? Please cancel in the portal so another member can take the slot.</p>`,
    text: `Hi ${firstName(d.memberName) || "there"},\n\nReminder: your ride is tomorrow.\n${longDate(d.date)}\n${d.slots.join(", ")}\n\nCan't make it? Cancel in the portal: ${URLS.portal}`,
  }, `Reminder: your ride tomorrow, ${d.slots[0] || ""}`),

  /* ── memberships ── */
  membership_welcome: (d: { m: Membership; waivers: { name: string; email: string; url: string; signed: boolean; index: number }[]; payments: any[] }): Msg => {
    const m = d.m, mine = d.waivers.find(w => w.index === 0), others = d.waivers.filter(w => w.index !== 0);
    const paid = money(m.amount_paid), total = money(m.total_amount);
    const sched = d.payments.filter(p => p.seq > 1).map(p => `${midDate(p.due_date)} · ${money(p.amount)}`);
    const rows = [["Membership", esc(m.id)], ["Plan", esc(planLabel(m.plan))], ["Active", `${esc(midDate(m.membership_start))} → ${esc(midDate(m.membership_end))}`], ["Contract total", total], ["Paid today", paid]];
    if (sched.length) rows.push(["Next payments", sched.map(esc).join("<br>") + '<br><span class="muted">charged automatically to your card on file</span>']);
    return layout({
      title: "Welcome to Bell Acqua Lake!",
      preheader: "Your membership is in. One last step: sign the waiver.",
      body: `<p>Hi ${esc(m.first_name)},</p>
        <p>Thank you — your membership is set up and your contract is on file. Here's your summary.</p>
        ${table(rows)}
        <p><strong>Last step:</strong> the member portal unlocks once every skier on the membership has signed our safety waiver.</p>
        ${mine ? button("Sign my waiver", mine.url) : ""}
        ${others.length ? `<p><strong>Forward these to your supplementary member${others.length > 1 ? "s" : ""}</strong> (we've emailed each of them too):</p><ul>${others.map(o => `<li>${esc(o.name)} — <a href="${o.url}">sign waiver</a></li>`).join("")}</ul>` : ""}
        <p class="muted">Once everyone has signed you'll get a "you're active" email with your portal link.</p>`,
      text: `Hi ${m.first_name},\n\nYour membership is set up.\nMembership: ${m.id}\nPlan: ${planLabel(m.plan)}\nActive: ${midDate(m.membership_start)} to ${midDate(m.membership_end)}\nContract total: ${total}\nPaid today: ${paid}${sched.length ? "\nNext payments: " + sched.join("; ") : ""}\n\nLast step: sign your waiver${mine ? ": " + mine.url : ""}${others.map(o => `\n${o.name}: ${o.url}`).join("")}`,
    }, `Welcome to Bell Acqua Lake — your membership ${m.id}`);
  },
  membership_waiver_request: (d: { m: Membership; waiver: { name: string; url: string } }): Msg => layout({
    title: "Please sign your member waiver",
    preheader: `${d.m.first_name} ${d.m.last_name} added you to their Bell Acqua Lake membership.`,
    body: `<p>Hi ${esc(firstName(d.waiver.name) || "there")},</p>
      <p>${esc(d.m.first_name)} ${esc(d.m.last_name)} has added you to their Bell Acqua Lake membership. Before you can ski, please sign our safety waiver online. It takes about two minutes.</p>
      ${button("Sign my waiver", d.waiver.url)}
      <p class="muted">The membership's portal unlocks once everyone on it has signed.</p>`,
    text: `Hi ${firstName(d.waiver.name) || "there"},\n\n${d.m.first_name} ${d.m.last_name} has added you to their Bell Acqua Lake membership. Please sign the safety waiver:\n${d.waiver.url}`,
  }, "Please sign your member waiver — Bell Acqua Lake"),
  membership_active: (d: { m: Membership }): Msg => layout({
    title: "You're active — welcome aboard",
    preheader: "All waivers signed. Your member portal is open.",
    body: `<p>Hi ${esc(d.m.first_name)},</p>
      <p>All waivers are signed and your membership is <strong>active</strong>. You can book your rides in the member portal now.</p>
      ${table([["Plan", esc(planLabel(d.m.plan))], ["Active", `${esc(midDate(d.m.membership_start))} → ${esc(midDate(d.m.membership_end))}`], ["Login", esc(d.m.email)]])}
      ${button("Open the member portal", URLS.portal)}
      <p class="muted">Log in with the email above and the password you chose at checkout. Members can book up to two slots a day${d.m.plan === "midweek" ? ", Monday to Thursday" : ""}. Forgot your password? Reply to this email and we'll reset it.</p>`,
    text: `Hi ${d.m.first_name},\n\nAll waivers are signed and your membership is active.\nPlan: ${planLabel(d.m.plan)}\nActive: ${midDate(d.m.membership_start)} to ${midDate(d.m.membership_end)}\n\nMember portal: ${URLS.portal}\nLog in with ${d.m.email} and the password you chose at checkout.`,
  }, "Your Bell Acqua Lake membership is active"),
  installment_receipt: (d: { m: Membership; p: any; all: any[] }): Msg => {
    const remaining = d.all.filter(p => p.status === "due").map(p => `${midDate(p.due_date)} · ${money(p.amount)}`);
    return layout({
      title: "Payment received",
      preheader: `Installment ${d.p.seq} of ${d.all.length || 4}: ${money(d.p.amount)}.`,
      body: `<p>Hi ${esc(d.m.first_name)},</p><p>We've charged your card on file for your membership installment. Thank you!</p>
        ${table([["Membership", esc(d.m.id)], ["Installment", `${d.p.seq} of ${d.all.length || 4}`], ["Amount", money(d.p.amount)], ["Date", esc(midDate(d.p.paid_at ? String(d.p.paid_at).slice(0, 10) : d.p.due_date))], ...(remaining.length ? [["Remaining", remaining.map(esc).join("<br>")]] : [["Remaining", "None — paid in full 🎉"]])])}
        <p class="muted">Questions about your account? Reply to this email.</p>`,
      text: `Hi ${d.m.first_name},\n\nWe've charged your card for membership installment ${d.p.seq}: ${money(d.p.amount)}.\nMembership: ${d.m.id}\n${remaining.length ? "Remaining: " + remaining.join("; ") : "Paid in full."}`,
    }, `Receipt: membership installment ${d.p.seq} — ${money(d.p.amount)}`);
  },
  installment_failed: (d: { m: Membership; p: any; all: any[]; reason: string }): Msg => layout({
    title: "We couldn't process your payment",
    preheader: `Installment ${d.p.seq} (${money(d.p.amount)}) didn't go through.`,
    body: `<p>Hi ${esc(d.m.first_name)},</p>
      <p>We tried to charge your card on file for membership installment ${d.p.seq} (<strong>${money(d.p.amount)}</strong>, due ${esc(midDate(d.p.due_date))}) and it didn't go through.${d.reason ? ` The bank said: <em>${esc(d.reason)}</em>.` : ""}</p>
      <p>No action is taken on your membership yet. Please reply to this email or call ${PHONE} and we'll sort out payment together.</p>`,
    text: `Hi ${d.m.first_name},\n\nWe couldn't charge your card for membership installment ${d.p.seq} (${money(d.p.amount)}, due ${midDate(d.p.due_date)}).${d.reason ? " Reason: " + d.reason : ""}\n\nPlease reply to this email or call ${PHONE}.`,
  }, `Action needed: membership payment didn't go through`),
  membership_expiring: (d: { first?: string; end: string; days: number; plan?: string }): Msg => layout({
    title: d.days <= 7 ? "Your membership ends in a week" : "Your membership renews soon",
    preheader: `Ends ${midDate(d.end)}. Renew to keep your spot on the water.`,
    body: `<p>Hi ${esc(d.first || "there")},</p>
      <p>Your ${esc(planLabel(d.plan))} ends on <strong>${esc(longDate(d.end))}</strong>, ${d.days} days from now.</p>
      <p>Renew before then and your portal access carries on without a gap. Reply to this email or call ${PHONE} and Mike will set up your renewal, or sign up online.</p>
      ${button("Renew my membership", URLS.membership)}`,
    text: `Hi ${d.first || "there"},\n\nYour ${planLabel(d.plan)} ends on ${longDate(d.end)} (${d.days} days). Renew to keep your portal access: ${URLS.membership}\nOr reply to this email / call ${PHONE}.`,
  }, d.days <= 7 ? `Your Bell Acqua membership ends ${midDate(d.end)}` : `Renewal reminder: membership ends ${midDate(d.end)}`),

  /* ── affiliates ── */
  affiliate_credit: (d: { affiliateName: string; code: string; pct: number; referredFirst: string }): Msg => layout({
    title: `You just earned ${d.pct}% off`,
    preheader: `${d.referredFirst} booked with your link. Here's your credit code.`,
    body: `<p>Hi ${esc(firstName(d.affiliateName) || "there")},</p>
      <p><strong>${esc(d.referredFirst)}</strong> just booked their first ride using your link, so you've earned a one-time <strong>${d.pct}% credit</strong> toward your next booking.</p>
      ${table([["Your credit code", `<span style="font-family:monospace;font-size:16px;font-weight:700;">${esc(d.code)}</span>`], ["Worth", `${d.pct}% off one booking`]])}
      ${button("Book and use my credit", URLS.booking)}
      <p class="muted">Enter the code in the coupon box at checkout. Keep sharing your link to earn more — see your dashboard on the <a href="${URLS.affiliate}">referral page</a>.</p>`,
    text: `Hi ${firstName(d.affiliateName) || "there"},\n\n${d.referredFirst} booked with your link, so you've earned a one-time ${d.pct}% credit.\nCode: ${d.code}\n\nUse it in the coupon box at checkout: ${URLS.booking}`,
  }, `You earned a ${d.pct}% credit — code inside`),

  /* ── youth ski club ── */
  ysc_paid: (d: { r: any }): Msg => {
    const r = d.r;
    return layout({
      title: `${esc(r.skier_name)} is in!`,
      preheader: `Youth Ski Club registration confirmed. Here's what happens next.`,
      body: `<p>Hi ${esc(r.parent_first)},</p>
        <p>Thank you — <strong>${esc(r.skier_name)}</strong> is registered for the ${esc(YSC.program)}. Here's your receipt and what happens next.</p>
        ${table([["Registration", esc(r.id)], ["Skier", `${esc(r.skier_name)}, age ${esc(r.skier_age)}${r.skier_level ? ` · ${esc(r.skier_level)}` : ""}`], ["Schedule", esc(YSC.cohorts[r.cohort] || r.cohort)], ["Season", esc(YSC.season)], ["Paid", money(r.amount_paid)], ["Waiver", r.waiver_signed ? "Signed ✓" : "Pending — we'll send a link"]])}
        <p><strong>What's next:</strong> a coach will reach out before the first session to confirm the start date and answer questions. Sessions run 4:00–6:30 PM at the lake. We supply skis, vests and ropes; bring a swimsuit, towel and sunscreen.</p>
        ${whereBlock()}
        <p class="muted">Questions? Reply to this email or call ${PHONE}.</p>`,
      text: `Hi ${r.parent_first},\n\n${r.skier_name} is registered for the ${YSC.program}.\nRegistration: ${r.id}\nSchedule: ${YSC.cohorts[r.cohort] || r.cohort}\nSeason: ${YSC.season}\nPaid: ${money(r.amount_paid)}\nWaiver: ${r.waiver_signed ? "signed" : "pending"}\n\nA coach will reach out before the first session. Where: Bell Acqua Lake, ${ADDRESS}`,
    }, `Confirmed: ${r.skier_name} — Youth Ski Club`);
  },
  ysc_nurture: (d: { first?: string; step: number }): Msg => {
    const first = esc(d.first || "there"), cta = URLS.ysc;
    const steps: Record<number, { subject: string; title: string; pre: string; body: string; btn: string }> = {
      1: { subject: `Your Youth Ski Club spot is being held, ${d.first || "there"}`, title: "You're on the list.", pre: "Here's exactly what happens next.",
        body: `<p>Hi ${first},</p><p>Thanks for reserving a spot in the Bell Acqua Lake Youth Ski Club. We've received your request and your spot is being held while we confirm scheduling.</p>
          ${table([["Season", esc(YSC.season)], ["Sessions", "4 coached sessions a week · Tue/Thu or Mon/Wed, 4–6:30 PM"], ["Ages", "10–17, beginner through competitive"], ["Investment", `${YSC.price} all-inclusive`]])}
          <p><strong>What happens next</strong></p><ol><li>A coach will call you within one business day to confirm your days and answer any questions.</li><li>Lock in the spot online whenever you're ready. The waiver is signed in the same two-minute checkout.</li><li>Then you just show up on day one. We handle the rest.</li></ol>
          <p>Slots are limited and filled first come, first served.</p>`, btn: "Confirm my skier's spot" },
      2: { subject: "What a Youth Ski Club session actually looks like", title: "Two and a half hours on the water.", pre: "4pm to 6:30pm, from the dock to the last set.",
        body: `<p>Hi ${first},</p><p>Most parents want to picture the afternoon before they commit. Here's how a session runs.</p>
          <p><strong>4:00pm — Arrive and gear up.</strong> Your skier changes at the dock. Lockers and changing rooms are on site, and every ski, vest, and rope they need is already here.</p>
          <p><strong>4:15pm — On the boat.</strong> Bell Acqua is a private, wind-protected lake built for training. Skiers run sets in small rotations behind tournament boats with a certified coach calling every pass.</p>
          <p><strong>Through 6:30pm — Three events, real progress.</strong> Slalom, trick and jump. Beginners start with a solid slalom pass; advanced skiers work the course and build toward the jump. Everyone trains at their own level in the same group.</p>
          <p><strong>After the last set.</strong> Hot tub, warm showers, WiFi at the dock, and a refrigerator for snacks.</p><p>Four of these a week, for the whole season.</p>`, btn: "Reserve our spot" },
      3: { subject: "“But my kid has never skied before”", title: "Your questions, answered.", pre: "The five questions every parent asks us first.",
        body: `<p>Hi ${first},</p>
          <p><strong>“My kid has never been on skis.”</strong> Perfect. Club is built for all levels, ages 10–17. Beginners are coached from the first deep-water start.</p>
          <p><strong>“Do we need to buy gear?”</strong> No. Skis, vests, ropes, tournament boats: all included.</p>
          <p><strong>“Is it safe?”</strong> Certified coaches, a private lake with no public traffic, tournament boats built for this. Skiers are never on the water unsupervised.</p>
          <p><strong>“What if they can only make some sessions?”</strong> Four a week is what's available, not a quota. Pick Tue/Thu or Mon/Wed, 4–6:30 PM, and come to what you can.</p>
          <p><strong>“What about weekends?”</strong> Weekend lessons are available for an additional fee.</p>
          <p>Anything we didn't cover? Reply to this email or call ${PHONE}. A coach answers, not a call center.</p>`, btn: "Confirm my skier's spot" },
      4: { subject: `What ${YSC.price} actually buys, ${d.first || "there"}`, title: "One price. Nothing else to buy.", pre: "Four sessions a week. Everything included.",
        body: `<p>Hi ${first},</p><p>${YSC.price} covers the full season, ${esc(YSC.season)}. Four coached sessions a week, up to 2.5 hours each.</p>
          <ul><li>Certified coaches on every session</li><li>Tournament boats and fuel</li><li>All skis, vests, and ropes</li><li>Private, wind-protected training lake</li><li>Lockers, changing rooms, refrigerator</li><li>Hot tub, warm showers, dock WiFi</li></ul>
          <p>No hidden fees. Weekend lessons are the only optional add-on.</p>
          <p>Compare that to private lessons paid one at a time, plus gear, plus a boat you'd have to own and tow. This is the version where you drop your skier off at 4pm and pick up a better athlete at 6:30.</p>`, btn: `Lock in our spot — ${YSC.price}` },
      5: { subject: "Last call: we can only hold the spot so long", title: "Spots are limited.", pre: "We can only hold your skier's spot so long.",
        body: `<p>Hi ${first},</p><p>Quick and honest one: you reserved a spot in Youth Ski Club, and we've been holding it. Slots are limited and go first come, first served. Once the club fills, we close it for the season.</p>
          <p>All that's left is choosing your days: <strong>Tuesday & Thursday</strong> or <strong>Monday & Wednesday</strong>, 4–6:30 PM.</p>
          <p>Reply with the days you want, or call ${PHONE}, and we'll have your skier on the water this week.</p>
          <p class="muted">If the timing doesn't work this season, just reply and let us know. We'll take you off these reminders and keep you posted on the next one.</p>`, btn: "Claim our spot" },
    };
    const s = steps[d.step] || steps[1];
    return layout({ title: s.title, preheader: s.pre, body: `${s.body}${button(s.btn, cta)}`, text: `${s.body.replace(/<li>/g, "\n- ").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim()}\n\n${s.btn}: ${cta}` }, s.subject);
  },

  /* ── staff ── */
  staff_new_booking: (b: Booking): Msg => staffMsg(`New booking: ${fullName(b)} — ${shortDate(b)}`,
    `<p><strong>${esc(fullName(b))}</strong> booked a ${esc(bookingLabel(b))}.</p>${table([...bookingRows(b), ["Paid", money(b.total_amount)], ["Email", esc(b.email)], ["Phone", esc(b.phone || "—")]])}<p class="muted">Waiver links have been emailed to each skier. You'll get a note as each one is signed.</p>`,
    `${fullName(b)} booked a ${bookingLabel(b)}.\n${summaryText(b)}\nPaid: ${money(b.total_amount)}\nEmail: ${b.email}\nPhone: ${b.phone || "—"}`),
  staff_booking_changed: (d: { booking: Booking; change: string; details: any }): Msg => {
    const b = d.booking, x = d.details || {};
    const line: Record<string, string> = { reschedule: `Rescheduled from ${esc(x.old_booking_date || "")} (${esc(x.old_slots_summary || "")}) to ${esc(x.new_booking_date || "")} (${esc(x.new_slots_summary || "")}).`, slots_added: `Added sessions: ${esc(x.added_slots_summary || x.new_slots_summary || "")}.`, party_size_change: `Party size ${esc(x.old_party_size ?? "")} → ${esc(x.new_party_size ?? "")}.`, cancellation: `Cancelled ${esc(x.booking_date || "")} (${esc(x.slots_summary || "")}).` };
    const l = line[d.change] || "Booking updated.";
    return staffMsg(`Booking ${d.change === "cancellation" ? "cancelled" : "changed"}: ${fullName(b)}`, `<p><strong>${esc(fullName(b))}</strong> — ${l}</p>${d.change === "cancellation" ? "" : table(bookingRows(b))}<p class="muted">Email ${esc(b.email)} · Phone ${esc(b.phone || "—")}</p>`, `${fullName(b)} — ${l.replace(/<[^>]+>/g, "")}\n${summaryText(b)}`);
  },
  staff_waiver_signed: (d: { waiver: any; booking: Booking | null; pdfUrl: string }): Msg => {
    const w = d.waiver, b = d.booking;
    return staffMsg(`Waiver signed: ${w.guest_name}${b ? ` — ${shortDate(b)}` : w.membership_id ? " (membership)" : ""}`,
      `<p><strong>${esc(w.guest_name)}</strong> signed their waiver${b ? ` for booking ${esc(b.id)} (${esc(bookingLabel(b))}, ${esc(shortDate(b))})` : w.membership_id ? ` for membership ${esc(w.membership_id)}` : ""}.</p>${button("Open signed waiver (PDF)", d.pdfUrl)}`,
      `${w.guest_name} signed their waiver${b ? ` for booking ${b.id}` : w.membership_id ? ` for membership ${w.membership_id}` : ""}.\nPDF: ${d.pdfUrl}`);
  },
  staff_member_booking: (d: { action: string; memberName: string; memberEmail: string; date: string; slots: string[] }): Msg => staffMsg(`Member ${d.action === "cancelled" ? "cancelled" : "booked"}: ${d.memberName} — ${midDate(d.date)}`,
    `<p><strong>${esc(d.memberName)}</strong> ${d.action === "cancelled" ? "cancelled" : "booked"} a member ride.</p>${table([["Date", esc(longDate(d.date))], ["Time", d.slots.map(esc).join("<br>")], ["Member", esc(d.memberEmail)]])}`,
    `${d.memberName} ${d.action} a member ride: ${longDate(d.date)}, ${d.slots.join(", ")}`),
  staff_new_membership: (d: { m: Membership; waivers: any[] }): Msg => staffMsg(`New membership: ${fullName(d.m)} — ${planLabel(d.m.plan)}`,
    `<p><strong>${esc(fullName(d.m))}</strong> bought a membership.</p>${table([["Membership", esc(d.m.id)], ["Plan", esc(planLabel(d.m.plan))], ["Term", d.m.payment_term === "installment" ? "4 quarterly installments" : "Paid in full"], ["Total", money(d.m.total_amount)], ["Paid today", money(d.m.amount_paid)], ["Skiers", String(d.waivers.length || 1)], ["Email", esc(d.m.email)], ["Phone", esc(d.m.phone || "—")]])}<p class="muted">Waiver links sent. The portal unlocks when all are signed.</p>`,
    `${fullName(d.m)} bought ${planLabel(d.m.plan)} (${d.m.id}). Total ${money(d.m.total_amount)}, paid ${money(d.m.amount_paid)}. ${d.m.email} ${d.m.phone || ""}`),
  staff_ysc_paid: (d: { r: any }): Msg => staffMsg(`Youth Ski Club: ${d.r.skier_name} registered`,
    `<p><strong>${esc(d.r.skier_name)}</strong> (age ${esc(d.r.skier_age)}) is registered.</p>${table([["Registration", esc(d.r.id)], ["Schedule", esc(YSC.cohorts[d.r.cohort] || d.r.cohort)], ["Parent", `${esc(d.r.parent_first)} ${esc(d.r.parent_last)} · ${esc(d.r.parent_email)} · ${esc(d.r.parent_phone)}`], ["Paid", money(d.r.amount_paid)], ["Waiver", d.r.waiver_signed ? "Signed" : "Pending"]])}<p class="muted">Medical notes (if any) are in the staff dashboard roster, not in email.</p>`,
    `${d.r.skier_name} registered for Youth Ski Club (${YSC.cohorts[d.r.cohort] || d.r.cohort}). Parent ${d.r.parent_first} ${d.r.parent_last}, ${d.r.parent_email}, ${d.r.parent_phone}. Paid ${money(d.r.amount_paid)}.`),
  staff_installment_failed: (d: { m: Membership; p: any; reason: string }): Msg => staffMsg(`Payment failed: ${fullName(d.m)} installment ${d.p.seq}`,
    `<p>The auto-charge for <strong>${esc(fullName(d.m))}</strong> (membership ${esc(d.m.id)}), installment ${d.p.seq} of ${money(d.p.amount)}, failed.${d.reason ? ` Reason: <em>${esc(d.reason)}</em>.` : ""}</p><p>The member has been emailed. Follow up to collect manually or update the card.</p>${button("Open the staff dashboard", URLS.staff)}`,
    `Auto-charge failed for ${fullName(d.m)} (${d.m.id}), installment ${d.p.seq} of ${money(d.p.amount)}. ${d.reason}`),
  test: (d: { name: string }): Msg => layout({ title: "Email is connected", preheader: "Bell Acqua Lake can now send its own email.", body: `<p>Hi ${esc(d.name)},</p><p>This is a test from the Bell Acqua Lake booking app. If you're reading it, Resend is connected and emails are going out from <strong>${esc(FROM)}</strong>.</p>${button("Open the staff dashboard", URLS.staff)}`, text: `This is a test from the Bell Acqua Lake booking app. Emails are going out from ${FROM}.` }, "Bell Acqua Lake — email test"),
};

/* ═══════════════════════════════════════════════════════════
   SAMPLE DATA for previews
   ═══════════════════════════════════════════════════════════ */
function SAMPLES(staff: { name: string; email: string }) {
  const first = firstName(staff.name) || "Sam";
  const booking: Booking = { id: "BAL-SAMPLE1", email: staff.email, first_name: first, last_name: "Sample", phone: "(916) 555-0100", party_size: 2, booking_type: "ski_ride_lesson", total_amount: 150, status: "confirmed", applied_coupon: null,
    slots: [{ id: "2026-10-18__1000", date: "2026-10-18", label: "10:00 AM – 10:15 AM" }, { id: "2026-10-18__1015", date: "2026-10-18", label: "10:15 AM – 10:30 AM" }] };
  const m: Membership = { id: "BAM-SAMPLE1", first_name: first, last_name: "Sample", email: staff.email, phone: "(916) 555-0100", plan: "unlimited", payment_term: "installment", total_amount: 2697, amount_paid: 674.25, installment_amount: 674.25, membership_start: "2026-10-01", membership_end: "2027-10-01", status: "pending", addons: [], supplementary: [{ name: "Jamie Sample", email: "jamie@example.com" }] };
  const payments = [{ seq: 1, amount: 674.25, due_date: "2026-10-01", status: "paid", paid_at: "2026-10-01T16:00:00Z" }, { seq: 2, amount: 674.25, due_date: "2027-01-01", status: "due" }, { seq: 3, amount: 674.25, due_date: "2027-04-01", status: "due" }, { seq: 4, amount: 674.25, due_date: "2027-07-01", status: "due" }];
  const waivers = [{ index: 0, name: `${first} Sample`, email: staff.email, url: URLS.waiver("SAMPLE"), signed: false }, { index: 1, name: "Jamie Sample", email: "jamie@example.com", url: URLS.waiver("SAMPLE2"), signed: false }];
  const r = { id: "YSC-SAMPLE1", parent_first: first, parent_last: "Sample", parent_email: staff.email, parent_phone: "(916) 555-0100", skier_name: "Alex Sample", skier_age: 13, skier_level: "beginner", cohort: "tue_thu", amount_paid: 2000, waiver_signed: true, status: "paid" };
  const mb = { action: "created", memberName: `${first} Sample`, memberEmail: staff.email, date: "2026-10-18", slots: ["7:30 AM – 7:45 AM", "7:45 AM – 8:00 AM"] };
  return {
    booking_receipt: booking,
    waiver_request: { booking, guestName: `${first} Sample`, guestEmail: staff.email, waiverUrl: URLS.waiver("SAMPLE") },
    booking_confirmed: booking,
    booking_changed: { booking, change: "reschedule", details: { old_booking_date: "Saturday, October 11, 2026", old_slots_summary: "9:00 AM – 9:15 AM", new_booking_date: "Saturday, October 18, 2026", new_slots_summary: "10:00 AM – 10:15 AM, 10:15 AM – 10:30 AM" } },
    booking_reminder: { booking, date: "2026-10-18" },
    member_booking: mb,
    member_booking_cancelled: { ...mb, action: "cancelled" },
    member_reminder: { memberName: mb.memberName, date: mb.date, slots: mb.slots },
    membership_welcome: { m, waivers, payments },
    membership_waiver_request: { m, waiver: waivers[1] },
    membership_active: { m: { ...m, status: "active" } },
    installment_receipt: { m, p: { ...payments[1], status: "paid", paid_at: "2027-01-01T15:00:00Z" }, all: payments },
    installment_failed: { m, p: payments[1], all: payments, reason: "Your card was declined." },
    membership_expiring: { first, end: "2027-10-01", days: 30, plan: "unlimited" },
    affiliate_credit: { affiliateName: `${first} Sample`, code: "CREDIT-7F2K9Q", pct: 20, referredFirst: "Jordan" },
    ysc_paid: { r },
    ysc_nurture_1: { first, step: 1 }, ysc_nurture_2: { first, step: 2 }, ysc_nurture_3: { first, step: 3 }, ysc_nurture_4: { first, step: 4 }, ysc_nurture_5: { first, step: 5 },
    staff_new_booking: booking,
    staff_booking_changed: { booking, change: "cancellation", details: { booking_date: "Saturday, October 18, 2026", slots_summary: "10:00 AM – 10:30 AM" } },
    staff_waiver_signed: { waiver: { guest_name: `${first} Sample`, booking_id: booking.id, membership_id: null, token: "SAMPLE" }, booking, pdfUrl: URLS.waiverPdf("SAMPLE") },
    staff_member_booking: mb,
    staff_new_membership: { m, waivers },
    staff_ysc_paid: { r },
    staff_installment_failed: { m, p: payments[1], reason: "Your card was declined." },
    test: { name: staff.name },
  };
}
// preview names that map onto a shared template
(T as any).member_booking_cancelled = T.member_booking;
for (const i of [1, 2, 3, 4, 5]) (T as any)[`ysc_nurture_${i}`] = T.ysc_nurture;

/* ═══════════════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════════════ */
function table(rows: (string | number)[][]) {
  return `<table class="sum" role="presentation" cellspacing="0" cellpadding="0">${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join("")}</table>`;
}
function button(label: string, url: string) {
  return `<p style="margin:26px 0;"><a href="${url}" style="background:#f4a61d;color:#0d2137;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:8px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">${esc(label)}</a></p>`;
}
function whereBlock() {
  return `<p class="muted"><strong>Where:</strong> Bell Acqua Lake, ${esc(ADDRESS)} · <a href="${MAPS_URL}">Directions</a></p>`;
}
function staffMsg(subject: string, body: string, text: string): Msg {
  return layout({ title: subject, preheader: "Staff notification from the booking app.", body: `${body}<p class="muted">You're getting this because "notify new bookings" is on for you in the Staff tab.</p>`, text }, `[Staff] ${subject}`);
}
function layout(o: { title: string; preheader: string; body: string; text: string }, subject?: string): Msg {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title>
<style>
  body{margin:0;background:#eef5f9;font-family:Arial,Helvetica,sans-serif;color:#0d2137;}
  .wrap{max-width:560px;margin:0 auto;padding:24px 12px;}
  .card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d1e3ee;}
  .head{background:#0d2137;color:#fff;padding:22px 26px;}
  .head .brand{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f4a61d;font-weight:700;}
  .head h1{margin:8px 0 0;font-size:22px;line-height:1.25;}
  .body{padding:24px 26px;font-size:15px;line-height:1.6;}
  .body p{margin:0 0 14px;} .body ul,.body ol{margin:0 0 14px 20px;padding:0;} .body li{margin:4px 0;}
  .muted{color:#5f7484;font-size:13px;}
  .sum{width:100%;border:1px solid #d1e3ee;border-radius:8px;border-collapse:separate;margin:6px 0 10px;font-size:14px;}
  .sum td{padding:9px 12px;border-bottom:1px solid #e6eff5;vertical-align:top;}
  .sum tr:last-child td{border-bottom:none;}
  .sum .k{color:#5f7484;font-weight:700;width:34%;}
  .foot{padding:16px 26px 22px;font-size:12px;color:#5f7484;border-top:1px solid #e6eff5;}
  a{color:#1a4a6e;}
</style></head><body>
<span style="display:none;max-height:0;overflow:hidden;color:#eef5f9;">${esc(o.preheader)}</span>
<div class="wrap"><div class="card">
  <div class="head"><div class="brand">Bell Acqua Lake</div><h1>${esc(o.title)}</h1></div>
  <div class="body">${o.body}</div>
  <div class="foot">Bell Acqua Lake · ${esc(ADDRESS)} · ${PHONE}<br>Reply to this email and it reaches us directly.</div>
</div></div></body></html>`;
  return { subject: subject ?? o.title, html, text: `${o.text}\n\n— Bell Acqua Lake · ${ADDRESS} · ${PHONE}` };
}
function esc(s: unknown) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
