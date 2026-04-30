const {
  getSupabase,
  cleanString,
  sha256,
  hashPassword,
  parseBody,
  sendJson,
  methodNotAllowed
} = require("./_lib");
const { sendPasswordChangedEmail, appBaseUrl } = require("./_email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await parseBody(req);
    const token = cleanString(body.token, 300);
    const password = String(body.password || "");

    if (!token || password.length < 8) {
      return sendJson(res, 400, { ok: false, error: "Bitte ein neues Passwort mit mindestens 8 Zeichen eingeben." });
    }

    const supabase = getSupabase();
    const tokenHash = sha256(token);

    const { data: reset, error } = await supabase
      .from("password_resets")
      .select("id,club_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw error;
    if (!reset || reset.used_at || new Date(reset.expires_at).getTime() < Date.now()) {
      return sendJson(res, 400, { ok: false, error: "Dieser Link ist ungültig oder abgelaufen." });
    }

    const { error: updateError } = await supabase
      .from("clubs")
      .update({ password_hash: hashPassword(password) })
      .eq("id", reset.club_id);

    if (updateError) throw updateError;

    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", reset.id);

    // Bestätigungs-Email "Passwort geändert" — best effort, blockiert die Antwort nicht
    try {
      const { data: club } = await supabase
        .from("clubs")
        .select("code,name,contact_email,contact_name")
        .eq("id", reset.club_id)
        .maybeSingle();

      if (club && club.contact_email) {
        const baseUrl = appBaseUrl(req);
        const dashboardUrl = `${baseUrl}/dashboard.html?c=${encodeURIComponent(String(club.code || "").toUpperCase())}`;
        await sendPasswordChangedEmail(club.contact_email, {
          clubName: club.name,
          contactName: club.contact_name,
          dashboardUrl
        });
      }
    } catch (mailErr) {
      console.error("password_changed email failed:", mailErr.message);
    }

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error("reset-password failed:", err);
    return sendJson(res, 500, { ok: false, error: "Das Passwort konnte nicht geändert werden." });
  }
};
