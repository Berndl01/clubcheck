const {
  getSupabase,
  cleanCode,
  cleanString,
  parseBody,
  sendJson,
  methodNotAllowed,
  normalizeAnswerValue,
  scoreFromAnswers
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await parseBody(req);
    const code = cleanCode(body.code || body.c);
    if (!code) return sendJson(res, 400, { ok: false, error: "Bitte einen gültigen Club-Code eingeben." });

    const supabase = getSupabase();

    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id,code,name,max_members,expires_at,payment_status")
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

    const rawAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const answers = {};
    Object.keys(rawAnswers).slice(0, 160).forEach(key => {
      const safeKey = String(key).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 50);
      if (!safeKey) return;
      answers[safeKey] = normalizeAnswerValue(rawAnswers[key]);
    });

    const scores = scoreFromAnswers(answers);
    const isAnonymous = Boolean(body.isAnonymous);
    const role = cleanString(body.role || answers.role, 50);
    const tenure = cleanString(body.tenure || answers.tenure, 50);
    const modeRaw = String(body.mode || "pulse").toLowerCase();
    const mode = modeRaw === "core" ? "core" : "pulse";
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
