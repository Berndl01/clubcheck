const {
  getSupabase,
  cleanCode,
  sendJson,
  methodNotAllowed,
  clubQuestionsFromRow
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const code = cleanCode(req.query.code || req.query.c);
    if (!code) return sendJson(res, 400, { ok: false, error: "Bitte einen gültigen Club-Code eingeben." });

    const supabase = getSupabase();

    const { data: club, error } = await supabase
      .from("clubs")
      .select("id,code,name,package,max_members,max_custom_questions,expires_at,payment_status,q1_text,q1_type,q1_opts,q2_text,q2_type,q2_opts,q3_text,q3_type,q3_opts,q4_text,q4_type,q4_opts,q5_text,q5_type,q5_opts")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!club || club.payment_status !== "paid") {
      return sendJson(res, 404, { ok: false, error: "Dieser ClubCheck ist noch nicht aktiv oder der Code ist ungültig." });
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
      return sendJson(res, 403, { ok: false, error: "Für diesen ClubCheck wurde die maximale Anzahl an Rückmeldungen erreicht." });
    }

    return sendJson(res, 200, {
      ok: true,
      club: {
        code: club.code,
        name: club.name,
        package: club.package,
        maxMembers: club.max_members,
        remaining: Math.max(0, Number(club.max_members || 0) - Number(count || 0)),
        questions: clubQuestionsFromRow(club)
      }
    });
  } catch (err) {
    console.error("get-club-config failed:", err);
    return sendJson(res, 500, { ok: false, error: "Der ClubCheck konnte nicht geladen werden." });
  }
};
