const Stripe = require("stripe");
const {
  requireEnv,
  getSupabase,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { isSessionPaid, codeFromSession, activateClubFromSession } = require("./_activate");

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId.startsWith("cs_")) {
      return sendJson(res, 400, { ok: false, error: "Ungültige Zahlungsbestätigung." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!isSessionPaid(session)) {
      return sendJson(res, 202, { ok: false, pending: true });
    }

    if (!codeFromSession(session)) return sendJson(res, 400, { ok: false, error: "Club-Code fehlt." });

    const result = await activateClubFromSession(getSupabase(), session, req);
    return sendJson(res, 200, { ok: true, code: result.code });
  } catch (err) {
    console.error("confirm-checkout failed:", err);
    return sendJson(res, 500, { ok: false, error: "Die Zahlung konnte noch nicht bestätigt werden." });
  }
};
