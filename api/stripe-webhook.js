const Stripe = require("stripe");
const {
  PLANS,
  requireEnv,
  getSupabase,
  cleanCode,
  getRawBody,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { sendPurchaseConfirmationForCode } = require("./_email");

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  let event;

  try {
    const signature = req.headers["stripe-signature"];
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const code = cleanCode(session.client_reference_id || (session.metadata && session.metadata.code));
      const planKey = String((session.metadata && session.metadata.package) || "basic").toLowerCase();
      const plan = PLANS[planKey] || PLANS.basic;

      if (code) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 84);

        const { error } = await supabase
          .from("clubs")
          .update({
            payment_status: "paid",
            package: plan.key,
            max_members: plan.maxMembers,
            max_custom_questions: plan.maxCustomQuestions,
            expires_at: expiresAt.toISOString(),
            stripe_session_id: session.id,
            stripe_customer_id: session.customer || null
          })
          .eq("code", code);

        if (error) throw error;

        try {
          await sendPurchaseConfirmationForCode(supabase, code, { plan, req });
        } catch (emailErr) {
          console.error("purchase confirmation email failed:", emailErr.message);
        }
      }
    }

    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;
      const code = cleanCode(session.client_reference_id || (session.metadata && session.metadata.code));
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

module.exports.config = {
  api: {
    bodyParser: false
  }
};
