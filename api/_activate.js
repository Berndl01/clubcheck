const { PLANS, cleanCode } = require("./_lib");
const { sendPurchaseConfirmationForCode } = require("./_email");

// Eine Checkout-Session gilt als bezahlt, wenn Stripe die Zahlung bestätigt hat
// oder ein 100%-Gutschein verwendet wurde (kein Betrag fällig).
function isSessionPaid(session) {
  return Boolean(session) && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
}

function codeFromSession(session) {
  return cleanCode(session && (session.client_reference_id || (session.metadata && session.metadata.code)));
}

/**
 * Schaltet den ClubCheck nach bestätigter Zahlung frei.
 * Die 12-Wochen-Laufzeit startet bei der ERSTEN Freischaltung. Webhook-Wiederholungen
 * oder ein erneutes Laden der Erfolgsseite verlängern die Laufzeit nicht.
 * Die Kaufbestätigung ist über email_logs idempotent und geht nur einmal raus.
 */
async function activateClubFromSession(supabase, session, req) {
  const code = codeFromSession(session);
  if (!code) return { ok: false, reason: "missing_code" };

  const planKey = String((session.metadata && session.metadata.package) || "basic").toLowerCase();
  const plan = PLANS[planKey] || PLANS.basic;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 84);

  const { data: updated, error } = await supabase
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
    .eq("code", code)
    .neq("payment_status", "paid")
    .select("id");

  if (error) throw error;

  try {
    await sendPurchaseConfirmationForCode(supabase, code, { plan, req });
  } catch (emailErr) {
    console.error("purchase confirmation email failed:", emailErr.message);
  }

  return { ok: true, code, activated: Array.isArray(updated) && updated.length > 0 };
}

module.exports = { isSessionPaid, codeFromSession, activateClubFromSession };
