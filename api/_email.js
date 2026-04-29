const { cleanString, getOrigin } = require("./_lib");

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function appBaseUrl(req) {
  if (process.env.APP_BASE_URL) return stripTrailingSlash(process.env.APP_BASE_URL);
  if (req) return stripTrailingSlash(getOrigin(req));
  return "https://clubcheck.humatrix.cc";
}

function emailFrom() {
  return process.env.EMAIL_FROM || process.env.RESET_EMAIL_FROM || "Humatrix ClubCheck <clubcheck@humatrix.cc>";
}

function replyTo() {
  return process.env.EMAIL_REPLY_TO || process.env.REPLY_TO_EMAIL || "";
}

function canSendEmails() {
  return Boolean(process.env.RESEND_API_KEY && emailFrom());
}

function plainTextFromHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emailLayout({ title, preheader, children }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;color:#1a1a1a;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">${esc(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ee;padding:28px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e2da;">
          <tr>
            <td style="padding:28px 30px;border-bottom:1px solid #e5e2da;">
              <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#5a5650;line-height:1.3;">Humatrix</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.15;color:#1a1a1a;margin-top:4px;">ClubCheck</div>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 30px 30px;">
              ${children}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 30px;background:#fafaf7;border-top:1px solid #e5e2da;color:#5a5650;font-size:12px;line-height:1.7;">
              <strong style="color:#1a1a1a;">Humatrix ClubCheck</strong><br>
              Digitale Vereinsanalyse für klare, strukturierte Rückmeldungen im Verein.<br>
              Diese Nachricht wurde automatisch versendet. Bei Fragen antworte bitte direkt auf diese E-Mail.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(url, label) {
  return `<p style="margin:26px 0 28px;"><a href="${esc(url)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;">${esc(label)}</a></p>`;
}

function infoRow(label, value) {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e2da;color:#5a5650;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;vertical-align:top;width:160px;">${esc(label)}</td><td style="padding:12px 0;border-bottom:1px solid #e5e2da;color:#1a1a1a;font-size:14px;line-height:1.6;vertical-align:top;">${value}</td></tr>`;
}

async function sendResendEmail({ to, subject, html, text }) {
  if (!canSendEmails()) {
    console.warn("E-Mail nicht versendet: RESEND_API_KEY oder EMAIL_FROM fehlt.");
    return { ok: false, skipped: true, reason: "missing_config" };
  }

  const payload = {
    from: emailFrom(),
    to: [to],
    subject,
    html,
    text: text || plainTextFromHtml(html)
  };

  const rt = replyTo();
  if (rt) payload.reply_to = rt;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }

  if (!response.ok) {
    const message = typeof data === "object" && data && data.message ? data.message : raw;
    throw new Error(`Resend Fehler: ${message || response.status}`);
  }

  return { ok: true, data };
}

async function claimEmailEvent(supabase, clubId, eventType, recipient, subject) {
  if (!clubId) return null;

  const { data, error } = await supabase
    .from("email_logs")
    .insert({
      club_id: clubId,
      event_type: eventType,
      recipient,
      subject,
      status: "sending"
    })
    .select("id")
    .single();

  if (!error) return data && data.id;

  // 23505 = duplicate unique constraint. Bereits gesendete oder laufende Mails werden nicht doppelt versendet.
  // Fehlgeschlagene Mails dürfen bei einem späteren Trigger erneut versucht werden.
  if (error.code === "23505") {
    const existing = await supabase
      .from("email_logs")
      .select("id,status")
      .eq("club_id", clubId)
      .eq("event_type", eventType)
      .maybeSingle();

    if (existing.error || !existing.data) return null;
    if (existing.data.status !== "failed") return null;

    const retry = await supabase
      .from("email_logs")
      .update({
        recipient,
        subject,
        status: "sending",
        error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (retry.error) throw retry.error;
    return retry.data && retry.data.id;
  }

  throw error;
}

async function markEmailEvent(supabase, logId, status, details = {}) {
  if (!logId) return;
  const payload = {
    status,
    updated_at: new Date().toISOString()
  };
  if (status === "sent") payload.sent_at = new Date().toISOString();
  if (details.provider_id) payload.provider_id = details.provider_id;
  if (details.error) payload.error = String(details.error).slice(0, 1000);
  await supabase.from("email_logs").update(payload).eq("id", logId);
}

async function sendEmailEventOnce(supabase, club, eventType, subject, htmlBuilder) {
  if (!canSendEmails()) return { ok: false, skipped: true, reason: "missing_config" };

  const to = cleanString(club && club.contact_email, 200).toLowerCase();
  if (!to) return { ok: false, skipped: true, reason: "missing_recipient" };

  const logId = await claimEmailEvent(supabase, club.id, eventType, to, subject);
  if (!logId) return { ok: true, skipped: true, reason: "already_sent_or_claimed" };

  try {
    const html = htmlBuilder();
    const result = await sendResendEmail({ to, subject, html });
    const providerId = result && result.data && result.data.id;
    await markEmailEvent(supabase, logId, "sent", { provider_id: providerId });
    return result;
  } catch (err) {
    await markEmailEvent(supabase, logId, "failed", { error: err.message });
    console.error(`${eventType} email failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

function registrationStartedHtml({ contactName, clubName, planLabel, price, checkoutUrl }) {
  const greeting = contactName ? `Hallo ${esc(contactName)},` : "Hallo,";
  return emailLayout({
    title: "Deine ClubCheck Registrierung wurde gestartet",
    preheader: "Dein ClubCheck ist vorbereitet. Schließe die Zahlung ab, um den Mitglieder-Link zu erhalten.",
    children: `
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;margin:0 0 18px;color:#1a1a1a;">Deine Registrierung ist vorbereitet.</h1>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">wir haben die ClubCheck Registrierung für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> vorbereitet. Sobald die Zahlung abgeschlossen ist, erhältst du den Club-Code, den Mitglieder-Link und den Dashboard-Zugang.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e2da;margin:20px 0;">
        ${infoRow("Verein", esc(clubName))}
        ${infoRow("Paket", `ClubCheck ${esc(planLabel)}`)}
        ${infoRow("Preis", `${esc(price)} €`)}
      </table>
      ${button(checkoutUrl, "Zahlung fortsetzen")}
      <p style="font-size:13px;line-height:1.8;color:#5a5650;margin:0;">Falls du die Zahlung bereits abgeschlossen hast, kannst du diese E-Mail ignorieren. Die Bestätigung kommt separat.</p>
    `
  });
}

function purchaseConfirmationHtml({ contactName, clubName, code, planLabel, price, surveyUrl, dashboardUrl }) {
  const greeting = contactName ? `Hallo ${esc(contactName)},` : "Hallo,";
  return emailLayout({
    title: "Danke für deinen ClubCheck Kauf",
    preheader: "Dein ClubCheck ist bereit. Hier findest du Club-Code, Mitglieder-Link und Dashboard-Zugang.",
    children: `
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;margin:0 0 18px;color:#1a1a1a;">Dein ClubCheck ist bereit.</h1>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">vielen Dank für deinen Kauf. Der ClubCheck für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> wurde erfolgreich angelegt.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e2da;margin:20px 0;">
        ${infoRow("Club-Code", `<strong style="font-size:22px;letter-spacing:2px;color:#1a1a1a;">${esc(code)}</strong>`)}
        ${infoRow("Paket", `ClubCheck ${esc(planLabel)} · ${esc(price)} €`)}
        ${infoRow("Mitglieder-Link", `<a href="${esc(surveyUrl)}" style="color:#1a1a1a;word-break:break-all;">${esc(surveyUrl)}</a>`)}
        ${infoRow("Dashboard", `<a href="${esc(dashboardUrl)}" style="color:#1a1a1a;word-break:break-all;">${esc(dashboardUrl)}</a>`)}
      </table>
      ${button(surveyUrl, "Mitglieder-Link öffnen")}
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 14px;"><strong style="color:#1a1a1a;">So geht es weiter:</strong></p>
      <ol style="font-size:14px;line-height:1.9;color:#5a5650;margin:0 0 20px;padding-left:20px;">
        <li>Teile den Mitglieder-Link mit deinem Verein.</li>
        <li>Melde dich im Dashboard mit Club-Code und deinem Passwort an.</li>
        <li>Lade den PDF-Bericht herunter, sobald genügend Rückmeldungen eingegangen sind.</li>
      </ol>
      <p style="font-size:13px;line-height:1.8;color:#5a5650;margin:0;">Bitte bewahre den Club-Code gut auf. Er wird für Dashboard und Support benötigt.</p>
    `
  });
}

function passwordResetHtml({ clubName, resetUrl }) {
  return emailLayout({
    title: "ClubCheck Passwort zurücksetzen",
    preheader: "Nutze den Link, um ein neues Dashboard-Passwort zu setzen.",
    children: `
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;margin:0 0 18px;color:#1a1a1a;">Passwort zurücksetzen</h1>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">Für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> wurde ein neues Dashboard-Passwort angefordert.</p>
      <p style="font-size:15px;line-height:1.8;color:#5a5650;margin:0 0 18px;">Über den folgenden Link kannst du ein neues Passwort setzen. Der Link ist 30 Minuten gültig.</p>
      ${button(resetUrl, "Passwort neu setzen")}
      <p style="font-size:13px;line-height:1.8;color:#5a5650;margin:0;">Falls du diese Anfrage nicht ausgelöst hast, kannst du diese E-Mail ignorieren. Dein bisheriges Passwort bleibt unverändert.</p>
    `
  });
}

async function sendRegistrationStartedEmail(supabase, club, { plan, checkoutUrl }) {
  const subject = "Deine ClubCheck Registrierung wurde gestartet";
  return sendEmailEventOnce(supabase, club, "registration_started", subject, () =>
    registrationStartedHtml({
      contactName: club.contact_name,
      clubName: club.name,
      planLabel: plan.label,
      price: plan.price,
      checkoutUrl
    })
  );
}

async function sendPurchaseConfirmationEmail(supabase, club, { plan, baseUrl }) {
  const code = String(club.code || "").toUpperCase();
  const surveyUrl = `${baseUrl}/survey.html?c=${encodeURIComponent(code)}`;
  const dashboardUrl = `${baseUrl}/dashboard.html?c=${encodeURIComponent(code)}`;
  const subject = "Danke für deinen Kauf — dein ClubCheck ist bereit";

  return sendEmailEventOnce(supabase, club, "purchase_confirmed", subject, () =>
    purchaseConfirmationHtml({
      contactName: club.contact_name,
      clubName: club.name,
      code,
      planLabel: plan.label,
      price: plan.price,
      surveyUrl,
      dashboardUrl
    })
  );
}

async function sendPurchaseConfirmationForCode(supabase, code, { plan, req } = {}) {
  const cleanCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleanCode) return { ok: false, skipped: true, reason: "missing_code" };

  const { data: club, error } = await supabase
    .from("clubs")
    .select("id,code,name,contact_name,contact_email,package")
    .eq("code", cleanCode)
    .maybeSingle();

  if (error) throw error;
  if (!club) return { ok: false, skipped: true, reason: "club_not_found" };

  const selectedPlan = plan || require("./_lib").PLANS[club.package] || require("./_lib").PLANS.basic;
  return sendPurchaseConfirmationEmail(supabase, club, {
    plan: selectedPlan,
    baseUrl: appBaseUrl(req)
  });
}

async function sendPasswordResetEmail(to, resetUrl, clubName) {
  const subject = "ClubCheck Passwort zurücksetzen";
  const html = passwordResetHtml({ clubName, resetUrl });
  return sendResendEmail({ to, subject, html });
}

module.exports = {
  appBaseUrl,
  canSendEmails,
  sendResendEmail,
  sendRegistrationStartedEmail,
  sendPurchaseConfirmationEmail,
  sendPurchaseConfirmationForCode,
  sendPasswordResetEmail
};
