const {
  getSupabase,
  cleanCode,
  cleanString,
  parseBody,
  sendJson,
  methodNotAllowed,
  scoreFromAnswers,
  canonicalRole,
  canonicalTenure,
  getClientIp,
  enforceRateLimit
} = require("./_lib");

// Pulse = Einstiegstest (basic). Core = Premium-Test (plus, premium).
function modeForPackage(pkg) {
  return pkg === "basic" ? "pulse" : "core";
}

// Nur bekannte Antwortfelder mit gültigen Werten übernehmen. So kann niemand mit
// manipulierten Anfragen (z. B. Wert 999 statt 1–7) die Vereinsauswertung verfälschen.
const SCALE_KEY = /^(intern|sport|extern|zukunft)_([1-9]|1[0-5])$/;
const CUSTOM_KEY = /^custom_[1-5]$/;

function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function sanitizeAnswers(raw) {
  const out = {};
  Object.keys(raw).slice(0, 200).forEach(key => {
    const value = raw[key];
    if (SCALE_KEY.test(key)) {
      const n = intIn(value, 1, 7);
      if (n !== null) out[key] = n;
      return;
    }
    if (CUSTOM_KEY.test(key)) {
      const n = intIn(value, 1, 7);
      if (n !== null) out[key] = n;
      else if (typeof value === "string" && value.trim()) out[key] = cleanString(value, 500);
      return;
    }
    if (key === "nps") {
      const n = intIn(value, 0, 10);
      if (n !== null) out.nps = n;
      return;
    }
    if (key === "cal_life" || key === "cal_active") {
      const n = intIn(value, 1, 7);
      if (n !== null) out[key] = n;
      return;
    }
    if (key === "role") { out.role = cleanString(value, 50); return; }
    if (key === "tenure") { out.tenure = cleanString(value, 30); return; }
    if (key === "freitext") { out.freitext = cleanString(value, 2500); }
  });
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const supabase = getSupabase();

    // Rate-Limit: 30 Antworten pro Minute pro IP (für Vereins-Aktionen
    // ein großzügiger Wert; bei Bot-Verdacht greift es trotzdem).
    const ip = getClientIp(req);
    const rl = await enforceRateLimit(supabase, ip, "submit-response", { maxRequests: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSeconds || 60));
      return sendJson(res, 429, { ok: false, error: "Zu viele Anfragen. Bitte einen Moment warten und erneut versuchen." });
    }

    const body = await parseBody(req);
    const code = cleanCode(body.code || body.c);
    if (!code) return sendJson(res, 400, { ok: false, error: "Bitte einen gültigen Club-Code eingeben." });

    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id,code,name,package,max_members,expires_at,payment_status")
      .eq("code", code)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!club || club.payment_status !== "paid") {
      return sendJson(res, 404, { ok: false, error: "Dieser ClubCheck ist nicht aktiv oder der Code ist ungültig." });
    }
    if (club.expires_at && new Date(club.expires_at).getTime() < Date.now()) {
      return sendJson(res, 403, { ok: false, error: "Dieser ClubCheck ist abgelaufen." });
    }

    const { count, error: countError } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("code", code);
    if (countError) throw countError;

    if ((count || 0) >= Number(club.max_members || 0)) {
      return sendJson(res, 403, { ok: false, error: "Die maximale Anzahl an Rückmeldungen wurde erreicht." });
    }

    const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};
    const answers = sanitizeAnswers(rawAnswers);

    const scores = scoreFromAnswers(answers);
    const isAnonymous = Boolean(body.isAnonymous);
    const role = canonicalRole(body.role || answers.role);
    const tenure = canonicalTenure(body.tenure || answers.tenure);
    if (answers.role) answers.role = role;
    if (answers.tenure) answers.tenure = tenure;

    // WICHTIG: Modus wird strikt aus dem Paket abgeleitet,
    // damit Mitglieder keinen anderen Modus erzwingen können.
    const mode = modeForPackage(club.package);

    const freitext = cleanString(body.freitext || answers.freitext, 2500);
    const nps = Number(answers.nps);
    const calLife = Number(answers.cal_life);
    const calActive = Number(answers.cal_active);

    const payload = {
      club_id: club.id,
      code,
      name: isAnonymous ? null : cleanString(body.name, 200) || null,
      is_anonymous: isAnonymous,
      role: role || null,
      tenure: tenure || null,
      mode,
      score_total: scores.total,
      score_intern: scores.intern,
      score_sport: scores.sport,
      score_extern: scores.extern,
      score_zukunft: scores.zukunft,
      score_custom: scores.custom,
      nps: Number.isFinite(nps) ? nps : null,
      cal_life: Number.isFinite(calLife) ? calLife : null,
      cal_active: Number.isFinite(calActive) ? calActive : null,
      answers,
      freitext: freitext || null
    };

    const { error: insertError } = await supabase.from("responses").insert(payload);
    if (insertError) throw insertError;

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error("submit-response failed:", err);
    return sendJson(res, 500, { ok: false, error: "Die Rückmeldung konnte nicht gespeichert werden." });
  }
};
