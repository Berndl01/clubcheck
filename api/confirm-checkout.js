const Stripe = require("stripe");
const {
  PLANS,
  requireEnv,
  getSupabase,
  cleanCode,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { sendPurchaseConfirmationForCode } = require("./_email");

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId.startsWith("cs_")) {
      return sendJson(res, 400, { ok: false, error: "Ungültige Zahlungsbestätigung." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== "paid") {
      return sendJson(res, 202, { ok: false, pending: true });
    }

    const code = cleanCode(session.client_reference_id || (session.metadata && session.metadata.code));
    const planKey = String((session.metadata && session.metadata.package) || "basic").toLowerCase();
    const plan = PLANS[planKey] || PLANS.basic;

    if (!code) return sendJson(res, 400, { ok: false, error: "Club-Code fehlt." });

    const supabase = getSupabase();
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

    return sendJson(res, 200, { ok: true, code });
  } catch (err) {
    console.error("confirm-checkout failed:", err);
    return sendJson(res, 500, { ok: false, error: "Die Zahlung konnte noch nicht bestätigt werden." });
  }
};
