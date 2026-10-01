// send-email — Bell Acqua Lake's own transactional email service (Resend).
//
// Pages never pass email bodies. They say what happened ("event") and which
// booking, and this function looks the booking up itself, builds the email,
// sends it through Resend and records it in email_log. That keeps the anon
// key from being usable to send arbitrary mail.
//
// Events
//   waiver_request    { booking_id, guest_index? }  → "please sign your waiver" to each unsigned skier
//   booking_confirmed { booking_id }                → confirmation to the booker (sent once per booking)
//   test              { to }                        → sample email, only to an active staff member's address
//
// Deploy:  supabase functions deploy send-email --project-ref euznpkrkkaieykznztho
// Secrets: RESEND_API_KEY (required)
//          EMAIL_FROM      optional, default "Bell Acqua Lake <info@bellacqualakes.com>"
//          EMAIL_REPLY_TO  optional, default "mtbalake@gmail.com"
//          APP_BASE_URL    optional, default "https://meek-duckanoo-53e84b.netlify.app"
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM     = Deno.env.get("EMAIL_FROM")     ?? "Bell Acqua Lake <info@bellacqualakes.com>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "mtbalake@gmail.com";
const BASE     = (Deno.env.get("APP_BASE_URL")  ?? "https://meek-duckanoo-53e84b.netlify.app").replace(/\/$/, "");
const PHONE    = "(916) 919-5726";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const event = String(body.event ?? "");

  try {
    switch (event) {
      case "waiver_request":    return json(await waiverRequest(body));
      case "booking_confirmed": return json(await bookingConfirmed(body));
      case "test":              return json(await testEmail(body));
      case "preview":           return json(await previewEmail(body));
      default:                  return json({ error: `Unknown event "${event}"` }, 400);
    }
  } catch (e) {
    console.error("send-email error:", e);
    return json({ error: (e as Error)?.message ?? "Server error" }, 500);
  }
});

/* ── events ───────────────────────────────────────────────── */

async function waiverRequest(body: Record<string, unknown>) {
  const bookingId = String(body.booking_id ?? "");
  if (!bookingId) throw new Error("booking_id required");
  const booking = await loadBooking(bookingId);

  let q = db.from("waiver_requests")
    .select("guest_index, guest_name, guest_email, token, status")
    .eq("booking_id", bookingId)
    .neq("status", "signed")
    .order("guest_index");
  if (body.guest_index !== undefined && body.guest_index !== null) q = q.eq("guest_index", Number(body.guest_index));
  const { data: rows, error } = await q;
  if (error) throw error;

  const results = [];
  for (const w of rows ?? []) {
    if (!w.guest_email) { results.push({ guest: w.guest_name, status: "skipped", reason: "no email" }); continue; }
    if (!body.force && await sentRecently("waiver_request", bookingId, w.guest_email, 10)) {
      results.push({ guest: w.guest_name, status: "skipped", reason: "sent in last 10 min" }); continue;
    }
    const waiverUrl = `${BASE}/bell-acqua-waiver.html?token=${encodeURIComponent(w.token)}`;
    const m = renderWaiverRequest(booking, w.guest_name, w.guest_email, waiverUrl);
    results.push(await send({ event: "waiver_request", to: w.guest_email, toName: w.guest_name, ...m, bookingId, meta: { guest_index: w.guest_index } }));
  }
  return { ok: true, results };
}

async function bookingConfirmed(body: Record<string, unknown>) {
  const bookingId = String(body.booking_id ?? "");
  if (!bookingId) throw new Error("booking_id required");
  const booking = await loadBooking(bookingId);
  if (!booking.email) return { ok: true, results: [{ status: "skipped", reason: "booking has no email" }] };
  if (!body.force && await sentEver("booking_confirmed", bookingId, booking.email)) {
    return { ok: true, results: [{ status: "skipped", reason: "already sent for this booking" }] };
  }
  const m = renderBookingConfirmed(booking);
  const r = await send({ event: "booking_confirmed", to: booking.email, toName: `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim(), ...m, bookingId });
  return { ok: true, results: [r] };
}

/* Send a sample of any template to an active staff member, using made-up
   booking data. Lets staff see every email before (and after) it goes live. */
async function previewEmail(body: Record<string, unknown>) {
  const to = String(body.to ?? "").trim().toLowerCase();
  const template = String(body.template ?? "");
  if (!to) throw new Error("to required");
  const { data: staff } = await db.from("staff_members").select("id, name").eq("is_active", true).ilike("email", to).limit(1);
  if (!staff || !staff.length) throw new Error("Samples can only go to an active staff member's address.");
  const sample: Booking = {
    id: "BAL-SAMPLE1", email: to, first_name: firstName(staff[0].name) || "Sam", last_name: "Sample",
    party_size: 2, booking_type: "ski_ride_lesson", total_amount: 150, status: "confirmed",
    slots: [{ id: "2026-10-18__1000", date: "2026-10-18", label: "10:00 AM – 10:15 AM" }, { id: "2026-10-18__1015", date: "2026-10-18", label: "10:15 AM – 10:30 AM" }],
  };
  let m: { subject: string; html: string; text: string };
  switch (template) {
    case "waiver_request":    m = renderWaiverRequest(sample, `${sample.first_name} ${sample.last_name}`, to, `${BASE}/bell-acqua-waiver.html?token=SAMPLE`); break;
    case "booking_confirmed": m = renderBookingConfirmed(sample); break;
    default: throw new Error(`Unknown template "${template}". Available: waiver_request, booking_confirmed`);
  }
  m.subject = `[SAMPLE] ${m.subject}`;
  const r = await send({ event: "preview", to, toName: staff[0].name, ...m, meta: { template } });
  return { ok: true, results: [r] };
}

/* ── templates ────────────────────────────────────────────── */

function renderWaiverRequest(booking: Booking, guestName: string, guestEmail: string, waiverUrl: string) {
  const isPrimary = (guestEmail || "").toLowerCase() === (booking.email || "").toLowerCase();
  const first = firstName(guestName) || booking.first_name || "there";
  const subject = `Please sign your waiver — Bell Acqua Lake, ${shortDate(booking)}`;
  const { html, text } = layout({
    title: "One quick step before you ski",
    preheader: `Sign your waiver for ${bookingLabel(booking)} on ${shortDate(booking)}.`,
    body: `
      <p>Hi ${esc(first)},</p>
      <p>${isPrimary ? "Thanks for booking with us!" : `${esc(booking.first_name)} ${esc(booking.last_name)} has booked you in for a ride with us.`}
      Every skier signs our safety waiver online before their time on the water. It takes about two minutes.</p>
      ${summaryTable(booking)}
      ${button("Sign my waiver", waiverUrl)}
      <p class="muted">The link is personal to you. If you're signing for a minor, you'll be able to add their name on the form.</p>
      ${isPrimary ? `<p class="muted">Need to change your time? <a href="${manageUrl(booking)}">Manage your booking</a>.</p>` : ""}`,
    text: `Hi ${first},\n\nPlease sign your safety waiver before your ${bookingLabel(booking)} on ${shortDate(booking)}:\n${waiverUrl}\n\n${summaryText(booking)}\n\nQuestions? Reply to this email or call ${PHONE}.`,
  });
  return { subject, html, text };
}

function renderBookingConfirmed(booking: Booking) {
  const first = booking.first_name || "there";
  const subject = `You're confirmed — ${bookingLabel(booking)}, ${shortDate(booking)}`;
  const { html, text } = layout({
    title: "You're all set!",
    preheader: `${bookingLabel(booking)} on ${shortDate(booking)} is confirmed.`,
    body: `
      <p>Hi ${esc(first)},</p>
      <p>Your waivers are in and your booking is confirmed. We'll see you on the water!</p>
      ${summaryTable(booking)}
      ${button("View or change my booking", manageUrl(booking))}
      <p class="muted">Please arrive 15 minutes early. Need to reschedule? Use the link above or call us at ${PHONE}.</p>`,
    text: `Hi ${first},\n\nYour booking is confirmed.\n\n${summaryText(booking)}\n\nView or change your booking: ${manageUrl(booking)}\n\nPlease arrive 15 minutes early. Questions? Reply to this email or call ${PHONE}.`,
  });
  return { subject, html, text };
}

async function testEmail(body: Record<string, unknown>) {
  const to = String(body.to ?? "").trim().toLowerCase();
  if (!to) throw new Error("to required");
  const { data: staff } = await db.from("staff_members").select("id, name").eq("is_active", true).ilike("email", to).limit(1);
  if (!staff || !staff.length) throw new Error("Test emails can only go to an active staff member's address.");
  const html = layout({
    title: "Email is connected",
    preheader: "Bell Acqua Lake can now send its own email.",
    body: `<p>Hi ${esc(staff[0].name)},</p><p>This is a test from the Bell Acqua Lake booking app. If you're reading it, Resend is connected and emails are going out from <strong>${esc(FROM)}</strong>.</p>${button("Open the staff dashboard", `${BASE}/bell-acqua-staff.html`)}`,
    text: `This is a test from the Bell Acqua Lake booking app. Resend is connected and emails are going out from ${FROM}.`,
  });
  const r = await send({ event: "test", to, toName: staff[0].name, subject: "Bell Acqua Lake — email test", html: html.html, text: html.text });
  return { ok: true, results: [r] };
}

/* ── sending + logging ────────────────────────────────────── */

async function send(m: { event: string; to: string; toName?: string; subject: string; html: string; text: string; bookingId?: string; membershipId?: string; meta?: Record<string, unknown> }) {
  let status = "sent", resendId: string | null = null, error: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [m.to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
        tags: [{ name: "event", value: m.event }],
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { status = "failed"; error = data?.message || `Resend HTTP ${r.status}`; }
    else resendId = data?.id ?? null;
  } catch (e) { status = "failed"; error = (e as Error).message; }

  await db.from("email_log").insert({
    event: m.event, to_email: m.to, to_name: m.toName ?? null, subject: m.subject,
    status, resend_id: resendId, error, booking_id: m.bookingId ?? null, membership_id: m.membershipId ?? null,
    meta: m.meta ?? {},
  });
  return { to: m.to, status, id: resendId, error };
}

async function sentRecently(event: string, bookingId: string, to: string, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db.from("email_log").select("id", { count: "exact", head: true })
    .eq("event", event).eq("booking_id", bookingId).ilike("to_email", to).eq("status", "sent").gte("created_at", since);
  return (count ?? 0) > 0;
}
async function sentEver(event: string, bookingId: string, to: string) {
  const { count } = await db.from("email_log").select("id", { count: "exact", head: true })
    .eq("event", event).eq("booking_id", bookingId).ilike("to_email", to).eq("status", "sent");
  return (count ?? 0) > 0;
}

/* ── booking helpers ──────────────────────────────────────── */

type Slot = { id?: string; date?: string; label?: string };
type Booking = { id: string; email: string; first_name: string; last_name: string; party_name?: string; party_size?: number; booking_type?: string; slots?: Slot[]; total_amount?: number; status?: string };

async function loadBooking(id: string): Promise<Booking> {
  const { data, error } = await db.from("bookings").select("id, email, first_name, last_name, party_name, party_size, booking_type, slots, total_amount, status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Booking ${id} not found`);
  return data as Booking;
}
function bookingLabel(b: Booking) {
  return b.booking_type === "ski_ride_lesson" ? "Ski Ride with Lesson"
       : b.booking_type === "beginner_intermediate" ? "Beginner / Intermediate Lesson"
       : "your session";
}
function slotDate(s: Slot) { return s.date || (s.id || "").split("__")[0] || ""; }
function longDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function shortDate(b: Booking) {
  const dates = [...new Set((b.slots ?? []).map(slotDate).filter(Boolean))].sort();
  if (!dates.length) return "your booking";
  const [y, m, d] = dates[0].split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return dates.length > 1 ? `${s} +${dates.length - 1} more` : s;
}
function slotLines(b: Booking) {
  const slots = [...(b.slots ?? [])].sort((a, c) => `${slotDate(a)} ${a.id}`.localeCompare(`${slotDate(c)} ${c.id}`));
  return slots.map(s => `${longDate(slotDate(s))} · ${s.label || (s.id || "").split("__")[1] || ""}`);
}
function summaryTable(b: Booking) {
  const rows = [
    ["Booking", `${esc(b.id)}`],
    ["Session", esc(bookingLabel(b))],
    ["When", slotLines(b).map(esc).join("<br>") || "—"],
    ["Skiers", String(b.party_size || 1)],
  ];
  return `<table class="sum" role="presentation" cellspacing="0" cellpadding="0">${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join("")}</table>`;
}
function summaryText(b: Booking) {
  return `Booking: ${b.id}\nSession: ${bookingLabel(b)}\nWhen: ${slotLines(b).join("; ") || "—"}\nSkiers: ${b.party_size || 1}`;
}
function manageUrl(b: Booking) {
  return `${BASE}/bell-acqua-manage.html?ref=${encodeURIComponent(b.id)}&email=${encodeURIComponent(b.email || "")}`;
}
function firstName(full?: string) { return (full || "").trim().split(/\s+/)[0] || ""; }

/* ── layout ───────────────────────────────────────────────── */

function button(label: string, url: string) {
  return `<p style="margin:26px 0;"><a class="btn" href="${url}" style="background:#f4a61d;color:#0d2137;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:8px;display:inline-block;font-family:Arial,Helvetica,sans-serif;">${esc(label)}</a></p>`;
}
function layout(o: { title: string; preheader: string; body: string; text: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title>
<style>
  body{margin:0;background:#eef5f9;font-family:Arial,Helvetica,sans-serif;color:#0d2137;}
  .wrap{max-width:560px;margin:0 auto;padding:24px 12px;}
  .card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d1e3ee;}
  .head{background:#0d2137;color:#fff;padding:22px 26px;}
  .head .brand{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f4a61d;font-weight:700;}
  .head h1{margin:8px 0 0;font-size:22px;line-height:1.25;}
  .body{padding:24px 26px;font-size:15px;line-height:1.6;}
  .body p{margin:0 0 14px;}
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
  <div class="foot">Bell Acqua Lake · ${PHONE} · Reply to this email and it reaches us directly.</div>
</div></div></body></html>`;
  const text = `${o.text}\n\n— Bell Acqua Lake · ${PHONE}`;
  return { html, text };
}

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
