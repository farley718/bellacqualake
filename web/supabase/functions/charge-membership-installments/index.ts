// charge-membership-installments — the quarterly auto-charge job.
//
// Finds membership_payments rows that are 'due' with due_date <= today and
// charges each member's saved card off-session. On success the payment row
// is marked paid and the membership's amount_paid rolls up. On decline the
// row keeps status 'due' with the error in `note`, so staff sees it in the
// dashboard's Membership Purchases table and can follow up.
//
// Deploy:  supabase functions deploy charge-membership-installments --project-ref euznpkrkkaieykznztho --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, CRON_SECRET (any random string)
// Schedule (Supabase SQL editor, fill in your CRON_SECRET) — daily 8 AM Pacific:
//   create extension if not exists pg_cron;
//   create extension if not exists pg_net;
//   select cron.schedule('bal-charge-installments', '0 15 * * *', $$
//     select net.http_post(
//       url     := 'https://euznpkrkkaieykznztho.supabase.co/functions/v1/charge-membership-installments',
//       headers := jsonb_build_object('Content-Type','application/json','x-cron-key','YOUR_CRON_SECRET'),
//       body    := '{}'::jsonb);
//   $$);
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  // Only the cron job (or staff with the secret) may trigger charges
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-key") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: duePayments, error } = await supabase
    .from("membership_payments")
    .select("id, membership_id, seq, amount, due_date")
    .eq("status", "due")
    .lte("due_date", today);

  if (error) return json({ error: error.message }, 500);

  const results = { charged: 0, failed: 0, skipped: 0, details: [] as string[] };

  for (const pay of duePayments ?? []) {
    const { data: m } = await supabase
      .from("memberships")
      .select("id, email, first_name, last_name, stripe_customer, stripe_payment_method, amount_paid, status")
      .eq("id", pay.membership_id)
      .single();

    if (!m || m.status === "cancelled") {
      results.skipped++;
      continue;
    }
    if (!m.stripe_customer || !m.stripe_payment_method) {
      results.skipped++;
      results.details.push(`${m.id} #${pay.seq}: no saved card`);
      await supabase.from("membership_payments")
        .update({ note: "No saved card on file — collect manually" })
        .eq("id", pay.id);
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(Number(pay.amount) * 100),
        currency: "usd",
        customer: m.stripe_customer,
        payment_method: m.stripe_payment_method,
        off_session: true,
        confirm: true,
        metadata: {
          type: "membership_installment",
          membershipId: m.id,
          seq: String(pay.seq),
          email: m.email,
        },
      });

      await supabase.from("membership_payments").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_pi: pi.id,
        note: "Auto-charged",
      }).eq("id", pay.id);

      await supabase.from("memberships").update({
        amount_paid: Number(m.amount_paid) + Number(pay.amount),
      }).eq("id", m.id);

      results.charged++;
      results.details.push(`${m.id} #${pay.seq}: charged $${pay.amount}`);
    } catch (e) {
      const msg = e?.raw?.message ?? e?.message ?? "charge failed";
      results.failed++;
      results.details.push(`${m.id} #${pay.seq}: ${msg}`);
      await supabase.from("membership_payments")
        .update({ note: `Auto-charge failed ${today}: ${msg}` })
        .eq("id", pay.id);
    }
  }

  console.log("charge-membership-installments:", JSON.stringify(results));
  return json(results);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
