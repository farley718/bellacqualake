// membership-checkout — creates (or reuses) a Stripe Customer for the member,
// then a PaymentIntent with setup_future_usage so the card is saved for the
// quarterly installment auto-charges.
//
// Deploy:  supabase functions deploy membership-checkout --project-ref euznpkrkkaieykznztho
// Secrets: STRIPE_SECRET_KEY (already set for create-payment-intent)
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { amount, currency = "usd", email, name, metadata = {} } = await req.json();

    if (!Number.isInteger(amount) || amount < 50) {
      return json({ error: "Invalid amount" }, 400);
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email" }, 400);
    }

    // Reuse the customer if this email has purchased before
    const existing = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
    const customer = existing.data[0] ??
      (await stripe.customers.create({ email: email.toLowerCase(), name }));

    const pi = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customer.id,
      setup_future_usage: "off_session", // save the card for installments 2–4
      payment_method_types: ["card"],
      metadata,
    });

    return json({ clientSecret: pi.client_secret, customerId: customer.id });
  } catch (e) {
    console.error("membership-checkout error:", e);
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
