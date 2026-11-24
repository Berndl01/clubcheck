const {
  getSupabase,
  cleanCode,
  parseBody,
  sendJson,
  methodNotAllowed,
  verifyPassword,
  createSessionToken,
  getClientIp,
  enforceRateLimit,
  isIpLockedForLogin,
  recordLoginAttempt
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const supabase = getSupabase();
    const ip = getClientIp(req);

    // 1) Generelle Rate-Limit-Schranke: 10 Aufrufe pro Minute pro IP.
    const rl = await enforceRateLimit(supabase, ip, "dashboard-login", { maxRequests: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSeconds || 60));
      return sendJson(res, 429, { ok: false, error: "Zu viele Anmeldeversuche. Bitte einen Moment warten." });
    }

    // 2) Lockout nach 10 Fehlversuchen in den letzten 15 Minuten (pro IP).
    const lock = await isIpLockedForLogin(supabase, ip, { maxFailures: 10, windowSeconds: 15 * 60 });
    if (lock.locked) {
      res.setHeader("Retry-After", String(lock.retryAfterSeconds || 900));
      return sendJson(res, 423, {
        ok: false,
        error: "Zu viele fehlgeschlagene Anmeldeversuche. Diese Verbindung ist für ca. 15 Minuten gesperrt."
      });
    }

    const body = await parseBody(req);
    const code = cleanCode(body.code || body.c);
    const password = String(body.password || "");

    if (!code || !password) {
      return sendJson(res, 400, { ok: false, error: "Bitte Club-Code und Passwort eingeben." });
    }

    const { data: club, error } = await supabase
      .from("clubs")
      .select("id,code,name,password_hash,payment_status,expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;

    const ok = club && club.payment_status === "paid" && verifyPassword(password, club.password_hash);
    if (!ok) {
      // Fehler protokollieren, damit Lockout greift. Wir verraten in der
      // Antwort nicht, ob der Code oder das Passwort falsch ist.
      await recordLoginAttempt(supabase, ip, code, false);
      return sendJson(res, 401, { ok: false, error: "Club-Code oder Passwort ist falsch." });
    }

    if (club.expires_at && new Date(club.expires_at).getTime() < Date.now()) {
      await recordLoginAttempt(supabase, ip, code, false);
      return sendJson(res, 403, { ok: false, error: "Dieser ClubCheck ist abgelaufen." });
    }

    // Erfolgreicher Login.
    await recordLoginAttempt(supabase, ip, code, true);

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
