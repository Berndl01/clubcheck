const {
  getSupabase,
  sendJson,
  methodNotAllowed,
  getBearerToken,
  verifySessionToken,
  clubQuestionsFromRow,
  avg,
  avgFloat
} = require("./_lib");

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Nicht angegeben";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function valueByKey(responses, key) {
  return responses
    .map(r => r.answers && r.answers[key])
    .map(Number)
    .filter(n => Number.isFinite(n));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const token = getBearerToken(req);
    const session = verifySessionToken(token);
    if (!session) return sendJson(res, 401, { ok: false, error: "Bitte erneut anmelden." });

    const supabase = getSupabase();

    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id,code,name,package,max_members,max_custom_questions,expires_at,created_at,q1_text,q1_type,q1_opts,q2_text,q2_type,q2_opts,q3_text,q3_type,q3_opts,q4_text,q4_type,q4_opts,q5_text,q5_type,q5_opts")
      .eq("id", session.sub)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!club) return sendJson(res, 404, { ok: false, error: "ClubCheck wurde nicht gefunden." });

    const { data: responses, error: respError } = await supabase
      .from("responses")
      .select("id,role,tenure,mode,score_total,score_intern,score_sport,score_extern,score_zukunft,score_custom,nps,cal_life,cal_active,answers,freitext,created_at")
      .eq("club_id", club.id)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (respError) throw respError;

    const rows = responses || [];
    const count = rows.length;

    // ============================================================
    // PRIVACY-SCHWELLEN: Bei kleinen Gruppen werden weder aggregierte
    // Auswertungen noch Freitexte ausgewiesen, um Einzelpersonen zu
    // schützen.
    // ============================================================
    const MIN_FOR_SCORES = 5;      // unter 5 Rückmeldungen: keine Scores/NPS/Rollen
    const MIN_FOR_FREITEXT = 7;    // unter 7 Rückmeldungen: keine Freitext-Anzeige
    const MIN_PER_GROUP = 3;       // unter 3 pro Rolle: Rolle wird zu "Sonstige" aggregiert

    const lowParticipation = count < MIN_FOR_SCORES;
    const freitextHidden = count < MIN_FOR_FREITEXT;

    // Bereichswerte mit einer Nachkommastelle direkt aus den Einzelantworten berechnen
    // (statt gerundete Ganzzahlen nochmals zu mitteln). Ältere Datensätze ohne
    // Einzelantworten fallen auf den gespeicherten Bereichswert zurück.
    function areaMean(r, prefix) {
      const a = r.answers || {};
      const vals = Object.keys(a)
        .filter(k => k.startsWith(prefix + "_"))
        .map(k => Number(a[k]))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= 7);
      if (vals.length) return vals.reduce((x, y) => x + y, 0) / vals.length;
      const stored = Number(r[`score_${prefix}`]);
      return Number.isFinite(stored) && r[`score_${prefix}`] !== null ? stored : null;
    }
    function responseTotal(r) {
      const parts = ["intern", "sport", "extern", "zukunft"].map(p => areaMean(r, p)).filter(v => v !== null);
      if (parts.length) return parts.reduce((x, y) => x + y, 0) / parts.length;
      const stored = Number(r.score_total);
      return Number.isFinite(stored) && r.score_total !== null ? stored : null;
    }
    const fullScores = {
      total: avgFloat(rows.map(responseTotal).filter(v => v !== null)),
      intern: avgFloat(rows.map(r => areaMean(r, "intern")).filter(v => v !== null)),
      sport: avgFloat(rows.map(r => areaMean(r, "sport")).filter(v => v !== null)),
      extern: avgFloat(rows.map(r => areaMean(r, "extern")).filter(v => v !== null)),
      zukunft: avgFloat(rows.map(r => areaMean(r, "zukunft")).filter(v => v !== null)),
      custom: avgFloat(rows.map(r => areaMean(r, "custom")).filter(v => v !== null))
    };
    const emptyScores = { total: null, intern: null, sport: null, extern: null, zukunft: null, custom: null };
    const scores = lowParticipation ? emptyScores : fullScores;

    const npsValues = rows.map(r => Number(r.nps)).filter(n => Number.isFinite(n));
    const promoters = npsValues.filter(n => n >= 9).length;
    const passives = npsValues.filter(n => n >= 7 && n < 9).length;
    const critics = npsValues.filter(n => n <= 6).length;
    const npsScore = (!lowParticipation && npsValues.length)
      ? Math.round(((promoters - critics) / npsValues.length) * 100)
      : null;

    const questionAverages = [];
    if (!lowParticipation) {
      const prefixes = ["intern", "sport", "extern", "zukunft", "custom"];
      prefixes.forEach(prefix => {
        for (let i = 1; i <= 20; i++) {
          const key = `${prefix}_${i}`;
          const values = valueByKey(rows, key);
          if (values.length) questionAverages.push({ key, avg: avgFloat(values), count: values.length });
        }
      });
    }

    // Custom questions mit Averages anreichern (nur wenn genug Daten)
    const customQuestions = clubQuestionsFromRow(club).map((q, i) => {
      const stat = questionAverages.find(qa => qa.key === `custom_${i + 1}`);
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        opts: q.opts,
        avg: lowParticipation ? null : (stat ? stat.avg : null),
        count: stat ? stat.count : 0
      };
    });

    // Rollen und Zugehörigkeit: zu kleine Gruppen fassen wir zu "Sonstige" zusammen,
    // damit niemand anhand einer Mini-Gruppe re-identifizierbar wird.
    function groupSafely(items, key) {
      const raw = countBy(items, key);
      const safe = {};
      let small = 0;
      Object.entries(raw).forEach(([k, val]) => {
        if (val >= MIN_PER_GROUP) safe[k] = val;
        else small += val;
      });
      if (small > 0) safe["Sonstige"] = (safe["Sonstige"] || 0) + small;
      return safe;
    }
    const safeRoles = lowParticipation ? {} : groupSafely(rows, "role");
    const safeTenure = lowParticipation ? {} : groupSafely(rows, "tenure");
    const safeModes = lowParticipation ? {} : countBy(rows, "mode");

    // Freitexte ohne Zeitstempel ausliefern (Zeitpunkt könnte Personen verraten),
    // Rolle erst ab 10 Rückmeldungen.
    const freitexts = freitextHidden
      ? []
      : rows.filter(r => r.freitext).slice(0, 40).map(r => ({
          text: r.freitext,
          role: count >= 10 ? (r.role || "Anonym") : "Anonym"
        }));

    return sendJson(res, 200, {
      ok: true,
      dashboard: {
        club: {
          code: club.code,
          name: club.name,
          package: club.package,
          maxMembers: club.max_members,
          expiresAt: club.expires_at,
          createdAt: club.created_at,
          questions: clubQuestionsFromRow(club)
        },
        count,
        completion: club.max_members ? Math.round((count / club.max_members) * 100) : 0,
        privacy: {
          lowParticipation,
          freitextHidden,
          minForScores: MIN_FOR_SCORES,
          minForFreitext: MIN_FOR_FREITEXT
        },
        scores,
        roles: safeRoles,
        tenure: safeTenure,
        modes: safeModes,
        nps: {
          avg: lowParticipation ? null : avgFloat(npsValues),
          score: npsScore,
          promoters: lowParticipation ? 0 : promoters,
          passives: lowParticipation ? 0 : passives,
          critics: lowParticipation ? 0 : critics,
          count: lowParticipation ? 0 : npsValues.length
        },
        questions: customQuestions,
        questionAverages,
        freitexts
      }
    });
  } catch (err) {
    console.error("get-dashboard failed:", err);
    return sendJson(res, 500, { ok: false, error: "Das Dashboard konnte nicht geladen werden." });
  }
};
