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
    const scores = {
      total: avg(rows.map(r => r.score_total)),
      intern: avg(rows.map(r => r.score_intern)),
      sport: avg(rows.map(r => r.score_sport)),
      extern: avg(rows.map(r => r.score_extern)),
      zukunft: avg(rows.map(r => r.score_zukunft)),
      custom: avg(rows.map(r => r.score_custom))
    };

    const npsValues = rows.map(r => Number(r.nps)).filter(n => Number.isFinite(n));
    const promoters = npsValues.filter(n => n >= 9).length;
    const passives = npsValues.filter(n => n >= 7 && n < 9).length;
    const critics = npsValues.filter(n => n <= 6).length;
    const npsScore = npsValues.length ? Math.round(((promoters - critics) / npsValues.length) * 100) : null;

    const questionAverages = [];
    const prefixes = ["intern", "sport", "extern", "zukunft", "custom"];
    prefixes.forEach(prefix => {
      for (let i = 1; i <= 20; i++) {
        const key = `${prefix}_${i}`;
        const values = valueByKey(rows, key);
        if (values.length) questionAverages.push({ key, avg: avgFloat(values), count: values.length });
      }
    });

    // Enrich custom questions with their averages for the PDF
    const customQuestions = clubQuestionsFromRow(club).map((q, i) => {
      const stat = questionAverages.find(qa => qa.key === `custom_${i + 1}`);
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        opts: q.opts,
        avg: stat ? stat.avg : null,
        count: stat ? stat.count : 0
      };
    });

    const freitexts = count >= 3
      ? rows.filter(r => r.freitext).slice(0, 40).map(r => ({
          text: r.freitext,
          role: r.role || "Anonym",
          createdAt: r.created_at
        }))
      : [];

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
        scores,
        roles: countBy(rows, "role"),
        tenure: countBy(rows, "tenure"),
        modes: countBy(rows, "mode"),
        nps: {
          avg: avgFloat(npsValues),
          score: npsScore,
          promoters,
          passives,
          critics,
          count: npsValues.length
        },
        questions: customQuestions,
        questionAverages,
        freitexts,
        lastResponses: rows.slice(0, 20).map(r => ({
          role: r.role,
          mode: r.mode,
          scoreTotal: r.score_total,
          nps: r.nps,
          createdAt: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error("get-dashboard failed:", err);
    return sendJson(res, 500, { ok: false, error: "Das Dashboard konnte nicht geladen werden." });
  }
};
