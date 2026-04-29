const {
  getSupabase,
  cleanCode,
  parseBody,
  sendJson,
  methodNotAllowed,
  verifyPassword,
  createSessionToken
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await parseBody(req);
    const code = cleanCode(body.code || body.c);
    const password = String(body.password || "");

    if (!code || !password) {
      return sendJson(res, 400, { ok: false, error: "Bitte Club-Code und Passwort eingeben." });
    }

    const supabase = getSupabase();
    const { data: club, error } = await supabase
      .from("clubs")
      .select("id,code,name,password_hash,payment_status,expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;

    if (!club || club.payment_status !== "paid" || !verifyPassword(password, club.password_hash)) {
      return sendJson(res, 401, { ok: false, error: "Club-Code oder Passwort ist falsch." });
    }

    if (club.expires_at && new Date(club.expires_at).getTime() < Date.now()) {
      return sendJson(res, 403, { ok: false, error: "Dieser ClubCheck ist abgelaufen." });
    }

    return sendJson(res, 200, {
      ok: true,
      token: createSessionToken(club),
      club: { code: club.code, name: club.name }
    });
  } catch (err) {
    console.error("dashboard-login failed:", err);
    return sendJson(res, 500, { ok: false, error: "Die Anmeldung konnte nicht durchgeführt werden." });
  }
};
