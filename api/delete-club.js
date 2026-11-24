const {
  getSupabase,
  parseBody,
  sendJson,
  methodNotAllowed,
  getBearerToken,
  verifySessionToken,
  cleanCode,
  getClientIp,
  enforceRateLimit
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const supabase = getSupabase();
    const ip = getClientIp(req);

    // Sehr restriktives Rate-Limit (5/min/IP) — Löschen ist destruktiv.
    const rl = await enforceRateLimit(supabase, ip, "delete-club", { maxRequests: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSeconds || 60));
      return sendJson(res, 429, { ok: false, error: "Zu viele Anfragen. Bitte einen Moment warten." });
    }

    // Auth: gültiges Session-Token erforderlich.
    const token = getBearerToken(req);
    const session = verifySessionToken(token);
    if (!session) return sendJson(res, 401, { ok: false, error: "Bitte erneut anmelden." });

    const body = await parseBody(req);
    const confirmCode = cleanCode(body.confirmCode || body.code);

    // Den authentifizierten Verein laden und prüfen, dass der bestätigte Code
    // exakt mit dem Vereinscode der Session übereinstimmt (Schutz gegen Tippfehler).
    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id,code")
      .eq("id", session.sub)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!club) return sendJson(res, 404, { ok: false, error: "ClubCheck wurde nicht gefunden." });

    if (!confirmCode || confirmCode !== club.code) {
      return sendJson(res, 400, { ok: false, error: "Bitte den Vereinscode korrekt zur Bestätigung eingeben." });
    }

    // Cascade-Delete: clubs hat in den Kindtabellen jeweils ON DELETE CASCADE,
    // dadurch werden responses, password_resets und email_logs automatisch gelöscht.
    const { error: delError } = await supabase.from("clubs").delete().eq("id", club.id);
    if (delError) throw delError;

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error("delete-club failed:", err);
    return sendJson(res, 500, { ok: false, error: "Die Löschung ist fehlgeschlagen." });
  }
};
