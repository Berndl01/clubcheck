const {
  getSupabase,
  getOrigin,
  cleanCode,
  cleanString,
  randomToken,
  sha256,
  parseBody,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { sendPasswordResetEmail } = require("./_email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await parseBody(req);
    const code = cleanCode(body.code || body.c);
    const email = cleanString(body.email, 200).toLowerCase();

    // Immer neutral antworten, damit nicht erkennbar ist, ob ein Konto existiert.
    const neutral = { ok: true, message: "Falls die Daten zu einem aktiven ClubCheck passen, wurde ein Link zum Zurücksetzen versendet." };

    if (!code || !email) return sendJson(res, 200, neutral);

    const supabase = getSupabase();
    const { data: club, error } = await supabase
      .from("clubs")
      .select("id,code,name,contact_email,payment_status")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;

    if (!club || club.payment_status !== "paid" || String(club.contact_email || "").toLowerCase() !== email) {
      return sendJson(res, 200, neutral);
    }

    const token = randomToken(32);
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from("password_resets")
      .insert({ club_id: club.id, token_hash: tokenHash, expires_at: expiresAt });

    if (insertError) throw insertError;

    const resetUrl = `${getOrigin(req)}/dashboard.html?reset=${encodeURIComponent(token)}`;

    try {
      await sendPasswordResetEmail(email, resetUrl, club.name);
    } catch (emailErr) {
      console.error("reset email failed:", emailErr.message);
      // Die neutrale Antwort bleibt bewusst gleich.
    }

    return sendJson(res, 200, neutral);
  } catch (err) {
    console.error("request-password-reset failed:", err);
    return sendJson(res, 200, { ok: true, message: "Falls die Daten zu einem aktiven ClubCheck passen, wurde ein Link zum Zurücksetzen versendet." });
  }
};
