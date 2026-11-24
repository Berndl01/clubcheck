const Stripe = require("stripe");
const {
  requireEnv,
  getSupabase,
  getRawBody,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { isSessionPaid, codeFromSession, activateClubFromSession } = require("./_activate");

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  let event;

  try {
    const signature = req.headers["stripe-signature"];
    // Vercel liest den Body vorab ein, stellt den Rohdatenstrom aber für den Handler
    // wieder her. getRawBody liefert daher die unveränderten Bytes für die Signaturprüfung.
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch (err) {
    console.error("stripe webhook signature failed:", err.message);
    res.status(400).setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(`Webhook Error: ${err.message}`);
  }

  try {
    const supabase = getSupabase();
    const session = event.data && event.data.object;

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      // Nur freischalten, wenn wirklich bezahlt ist. Bei verzögerten Zahlungsarten
      // (z. B. SEPA-Lastschrift) kommt "completed" vor dem Geldeingang; freigeschaltet
      // wird dann erst mit "async_payment_succeeded".
      if (isSessionPaid(session)) {
        await activateClubFromSession(supabase, session, req);
      } else {
        console.log(`checkout ${session && session.id}: Zahlung noch offen (${session && session.payment_status}), noch keine Freischaltung.`);
      }
    }

    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const code = codeFromSession(session);
      if (code) {
        await supabase
          .from("clubs")
          .update({ payment_status: "failed" })
          .eq("code", code)
          .eq("payment_status", "pending");
      }
    }

    return sendJson(res, 200, { received: true });
  } catch (err) {
    console.error("stripe webhook handling failed:", err);
    return sendJson(res, 500, { received: false });
  }
};
