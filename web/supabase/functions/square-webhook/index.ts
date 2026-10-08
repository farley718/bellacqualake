// square-webhook — Square → Bell Acqua app bridge for banquet ticket sales.
//
// Square calls this URL for payment events. For a COMPLETED payment whose
// order contains the banquet ticket item, we:
//   1. record it in banquet_orders (buyer name/email, ticket count, amount)
//   2. ask send-email to send the buyer a branded confirmation
//   3. post to the banquet GHL inbound webhook with payment_status = paid
//
// Square webhook setup (developer.squareup.com → your app → Webhooks):
//   Notification URL: https://euznpkrkkaieykznztho.supabase.co/functions/v1/square-webhook
//   Events:           payment.created, payment.updated
//   Copy the subscription's Signature Key into the secret below.
//
// Deploy (NO JWT — Square can't send a Supabase token):
//   supabase functions deploy square-webhook --project-ref euznpkrkkaieykznztho --no-verify-jwt
// Secrets:
//   SQUARE_WEBHOOK_SIGNATURE_KEY   from the webhook subscription (required)
//   SQUARE_ACCESS_TOKEN            app's production access token (required; reads the order for ticket count)
//   SQUARE_WEBHOOK_URL             optional override of the notification URL used in the signature check
//   BANQUET_ITEM_MATCH             optional, default "banquet" (case-insensitive match on the line item name)
//   BANQUET_GHL_WEBHOOK_URL        optional, default = the banquet page's GHL inbound webhook
import { createClient } from "npm:@supabase/supabase-js@2";

const SIG_KEY   = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY") ?? "";
const SQ_TOKEN  = Deno.env.get("SQUARE_ACCESS_TOKEN") ?? "";
const SQ_API    = "https://connect.squareup.com/v2";
const SQ_VER    = "2025-01-23";
const NOTIFY_URL = Deno.env.get("SQUARE_WEBHOOK_URL") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/square-webhook`;
const ITEM_MATCH = (Deno.env.get("BANQUET_ITEM_MATCH") ?? "banquet").toLowerCase();
// GHL workflow "NCWSA Banquet 2026 - Ticket Paid" (Inbound Webhook trigger → tag banquet-paid-2026 + staff note)
const GHL_URL   = Deno.env.get("BANQUET_GHL_WEBHOOK_URL") ?? "https://services.leadconnectorhq.com/hooks/rqN9GeQaEfpisadTVaUO/webhook-trigger/40b14e6b-c3b4-4199-b9f4-0042ac87262d";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const raw = await req.text();

  // 1. Verify it really came from Square (HMAC-SHA256 of notification URL + body)
  if (SIG_KEY) {
    const sig = req.headers.get("x-square-hmacsha256-signature") ?? "";
    if (!(await validSignature(sig, raw))) {
      console.warn("square-webhook: bad signature");
      return new Response("bad signature", { status: 401 });
    }
  }

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  // Store every event once (idempotent on event_id)
  const { error: insErr } = await db.from("square_events").insert({ event_id: ev.event_id ?? null, event_type: ev.type ?? null, payload: ev });
  if (insErr && /duplicate|unique/i.test(insErr.message)) return json({ ok: true, duplicate: true });

  try {
    const type = String(ev.type ?? "");
    if (!/^payment\.(created|updated)$/.test(type)) return done(ev, false, `ignored ${type}`);
    const payment = ev?.data?.object?.payment;
    if (!payment || payment.status !== "COMPLETED") return done(ev, false, `status ${payment?.status ?? "?"}`);

    // Already recorded? (payment.created and payment.updated both fire)
    const { data: existing } = await db.from("banquet_orders").select("id, buyer_email").eq("square_payment_id", payment.id).maybeSingle();
    if (existing) return done(ev, true, "already recorded");

    // 2. Read the order to find the banquet line item + quantity
    const order = payment.order_id ? await squareGet(`/orders/${payment.order_id}`).then(r => r?.order).catch(() => null) : null;
    const lines: any[] = order?.line_items ?? [];
    const banquetLines = lines.filter(l => String(l.name ?? "").toLowerCase().includes(ITEM_MATCH));
    if (!banquetLines.length) return done(ev, false, "not a banquet order");
    const quantity = banquetLines.reduce((n, l) => n + (parseInt(l.quantity ?? "1", 10) || 1), 0);
    const itemName = banquetLines[0].name ?? "Banquet Ticket";

    // 3. Buyer details: payment → order fulfillment/customer → Square Customers API
    let name = payment?.card_details?.card?.cardholder_name || "";
    let email = payment.buyer_email_address || "";
    let phone = "";
    const recipient = order?.fulfillments?.[0]?.pickup_details?.recipient ?? order?.fulfillments?.[0]?.shipment_details?.recipient;
    if (recipient) { name = recipient.display_name || name; email = recipient.email_address || email; phone = recipient.phone_number || phone; }
    const customerId = payment.customer_id || order?.customer_id;
    if (customerId && (!name || !email || !phone)) {
      const c = await squareGet(`/customers/${customerId}`).then(r => r?.customer).catch(() => null);
      if (c) { name = name || `${c.given_name ?? ""} ${c.family_name ?? ""}`.trim(); email = email || c.email_address || ""; phone = phone || c.phone_number || ""; }
    }

    const row = {
      square_payment_id: payment.id, square_order_id: payment.order_id ?? null, square_location_id: payment.location_id ?? null,
      receipt_url: payment.receipt_url ?? null, paid_at: payment.updated_at ?? payment.created_at ?? new Date().toISOString(),
      buyer_name: name || null, buyer_email: email ? email.toLowerCase() : null, buyer_phone: phone || null,
      item_name: itemName, quantity, amount_cents: Number(payment?.amount_money?.amount ?? 0), currency: payment?.amount_money?.currency ?? "USD",
      status: "paid", raw: { payment, order_line_items: lines },
    };
    const { data: saved, error } = await db.from("banquet_orders").insert(row).select("id").single();
    if (error) throw error;

    // 4. Confirmation email (best effort) + GHL paid tag (best effort)
    await appEmail({ event: "banquet_confirmed", order_id: saved.id });
    await ghl(row);
    return done(ev, true, `recorded ${quantity} ticket(s) for ${email || name || "unknown"}`);
  } catch (e) {
    console.error("square-webhook error:", e);
    await db.from("square_events").update({ note: `error: ${(e as Error).message}` }).eq("event_id", ev.event_id ?? "");
    return json({ ok: false, error: (e as Error).message }, 200); // 200 so Square doesn't hammer retries on our bug
  }
});

/* ── helpers ──────────────────────────────────────────────── */
async function validSignature(sig: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SIG_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(NOTIFY_URL + body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === sig;
}
async function squareGet(path: string) {
  if (!SQ_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN not set");
  const r = await fetch(SQ_API + path, { headers: { "Authorization": `Bearer ${SQ_TOKEN}`, "Square-Version": SQ_VER, "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`Square ${path} → ${r.status}`);
  return r.json();
}
async function appEmail(body: Record<string, unknown>) {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` }, body: JSON.stringify(body) });
  } catch (e) { console.warn("appEmail failed:", e); }
}
async function ghl(row: any) {
  if (!GHL_URL) return;
  const [first, ...rest] = String(row.buyer_name ?? "").trim().split(/\s+/);
  try {
    await fetch(GHL_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      first_name: first ?? "", last_name: rest.join(" "), name: row.buyer_name ?? "", email: row.buyer_email ?? "", phone: row.buyer_phone ?? "",
      payment_status: "paid", payment_method: "card", tickets: row.quantity, amount: (row.amount_cents / 100).toFixed(2),
      square_payment_id: row.square_payment_id, receipt_url: row.receipt_url ?? "", paid_at: row.paid_at,
      event: "NCWSA Nationals Banquet 2026", source: "square-webhook",
    }) });
  } catch (e) { console.warn("GHL post failed:", e); }
}
async function done(ev: any, handled: boolean, note: string) {
  await db.from("square_events").update({ handled, note }).eq("event_id", ev.event_id ?? "");
  return json({ ok: true, handled, note });
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
