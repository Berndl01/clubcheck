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
    .replace(/<\/li>/gi, "\n")
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

// === LAYOUT ===
function emailLayout({ title, preheader, children }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;color:#1a1a1a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">${esc(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ee;padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e1dccf;">
          <tr>
            <td style="padding:30px 36px 26px;border-bottom:1px solid #e1dccf;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:#8a6d3b;line-height:1.3;font-weight:600;">Humatrix</div>
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.15;color:#1a1a1a;margin-top:4px;letter-spacing:-0.3px;">ClubCheck</div>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#9c978d;font-weight:600;">
                    Vereinsdiagnostik
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:38px 36px 32px;">
              ${children}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 28px;background:#faf8f3;border-top:1px solid #e1dccf;color:#5a5650;font-size:12px;line-height:1.7;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:top;">
                    <strong style="color:#1a1a1a;font-size:13px;">Humatrix ClubCheck</strong><br>
                    Digitale Vereinsdiagnostik aus Tirol.<br>
                    <a href="https://clubcheck.humatrix.cc" style="color:#5a5650;text-decoration:none;border-bottom:1px solid #c3aa7d;">clubcheck.humatrix.cc</a>
                  </td>
                  <td align="right" style="vertical-align:top;font-size:11px;color:#9c978d;line-height:1.7;">
                    Diese Nachricht wurde<br>automatisch versendet.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <div style="max-width:620px;margin:14px auto 0;padding:0 4px;font-size:11px;color:#9c978d;line-height:1.7;text-align:center;">
          Du erhältst diese E-Mail, weil du ClubCheck für deinen Verein nutzt.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// === BUILDING BLOCKS ===
function eyebrow(text) {
  return `<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a6d3b;line-height:1.3;font-weight:600;margin:0 0 14px;">${esc(text)}</div>`;
}

function headline(text) {
  return `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:400;margin:0 0 22px;color:#1a1a1a;letter-spacing:-0.4px;">${esc(text)}</h1>`;
}

function paragraph(html) {
  return `<p style="font-size:15px;line-height:1.75;color:#3d3a35;margin:0 0 18px;">${html}</p>`;
}

function softParagraph(html) {
  return `<p style="font-size:13.5px;line-height:1.8;color:#5a5650;margin:0 0 16px;">${html}</p>`;
}

function button(url, label) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0 26px;">
    <tr>
      <td style="background:#15110d;">
        <a href="${esc(url)}" style="display:inline-block;color:#f5f3ee;text-decoration:none;padding:15px 28px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;font-family:'Inter',Arial,sans-serif;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function infoTable(rows) {
  const tr = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:14px 0 13px;border-bottom:1px solid #e9e4d6;color:#8a847a;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;vertical-align:top;width:35%;font-weight:600;">${esc(label)}</td>
      <td style="padding:14px 0 13px;border-bottom:1px solid #e9e4d6;color:#1a1a1a;font-size:14px;line-height:1.55;vertical-align:top;">${value}</td>
    </tr>`
  ).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e9e4d6;margin:24px 0 8px;">${tr}</table>`;
}

function divider() {
  return `<div style="height:1px;background:#e1dccf;margin:24px 0;"></div>`;
}

function notice(html) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f3;border-left:3px solid #8a6d3b;margin:26px 0 20px;">
    <tr><td style="padding:16px 18px;color:#5a5650;font-size:13px;line-height:1.7;">${html}</td></tr>
  </table>`;
}

function steps(items) {
  return `<ol style="font-size:14px;line-height:1.85;color:#3d3a35;margin:6px 0 24px;padding-left:20px;">${
    items.map(item => `<li style="margin:0 0 10px;">${item}</li>`).join("")
  }</ol>`;
}

function signature() {
  return `<p style="font-size:14px;line-height:1.75;color:#3d3a35;margin:30px 0 0;">Mit besten Grüßen,<br><em style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">das Humatrix-Team</em></p>`;
}

// === RESEND TRANSPORT ===
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

// === IDEMPOTENT EVENT LOG ===
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

// === EMAIL TEMPLATES ===

function registrationStartedHtml({ contactName, clubName, planLabel, price, checkoutUrl }) {
  const greeting = contactName ? `Hallo ${esc(contactName.split(" ")[0])},` : "Hallo,";
  return emailLayout({
    title: "Deine ClubCheck Bestellung ist vorbereitet",
    preheader: "Wir haben deine Registrierung gespeichert. Schließe die Zahlung ab, um den Mitglieder-Link zu erhalten.",
    children: `
      ${eyebrow("Schritt 1 von 2 — Registrierung")}
      ${headline("Schön, dass du dabei bist.")}
      ${paragraph(`${greeting} wir haben die ClubCheck-Registrierung für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> vorbereitet und auf dich zugeschnitten.`)}
      ${paragraph("Sobald die Bezahlung abgeschlossen ist, erhältst du in einer separaten E-Mail deinen Club-Code, den persönlichen Mitglieder-Link und den Dashboard-Zugang.")}
      ${infoTable([
        ["Verein", esc(clubName)],
        ["Paket", `ClubCheck ${esc(planLabel)}`],
        ["Preis", `${esc(price)} € · einmalig · 12 Wochen Laufzeit`]
      ])}
      ${button(checkoutUrl, "Zahlung jetzt abschließen")}
      ${notice("Die Bezahlung erfolgt sicher über Stripe. Wir speichern keine Zahlungsdaten auf unseren Servern.")}
      ${softParagraph("Falls du die Zahlung bereits abgeschlossen hast, kannst du diese E-Mail einfach ignorieren — die Bestätigung kommt automatisch.")}
      ${signature()}
    `
  });
}

function purchaseConfirmationHtml({ contactName, clubName, code, planLabel, price, surveyUrl, dashboardUrl, maxMembers, maxQuestions }) {
  const greeting = contactName ? `Hallo ${esc(contactName.split(" ")[0])},` : "Hallo,";
  return emailLayout({
    title: "Dein ClubCheck ist startklar",
    preheader: "Hier findest du Club-Code, Mitglieder-Link und Dashboard-Zugang.",
    children: `
      ${eyebrow("Bestätigung · Schritt 2 von 2")}
      ${headline("Dein ClubCheck ist startklar.")}
      ${paragraph(`${greeting} vielen Dank für dein Vertrauen. Wir freuen uns, dich auf dem Weg zu mehr Klarheit im Verein zu begleiten.`)}
      ${paragraph(`Der ClubCheck für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> wurde erfolgreich angelegt und ist ab sofort einsatzbereit.`)}
      ${infoTable([
        ["Club-Code", `<strong style="font-size:22px;letter-spacing:2.5px;color:#1a1a1a;font-family:Georgia,serif;">${esc(code)}</strong>`],
        ["Paket", `ClubCheck ${esc(planLabel)} · ${esc(price)} €`],
        ["Umfang", `bis ${esc(String(maxMembers || ""))} Rückmeldungen · bis zu ${esc(String(maxQuestions || ""))} eigene Vereinsfragen`],
        ["Mitglieder-Link", `<a href="${esc(surveyUrl)}" style="color:#1a1a1a;word-break:break-all;border-bottom:1px solid #c3aa7d;text-decoration:none;">${esc(surveyUrl)}</a>`],
        ["Dashboard", `<a href="${esc(dashboardUrl)}" style="color:#1a1a1a;word-break:break-all;border-bottom:1px solid #c3aa7d;text-decoration:none;">${esc(dashboardUrl)}</a>`]
      ])}
      ${button(surveyUrl, "Mitglieder-Link öffnen")}
      ${divider()}
      ${eyebrow("So geht's weiter")}
      ${steps([
        "Teile den <strong>Mitglieder-Link</strong> mit deinem Verein — per E-Mail, Messenger, Aushang oder QR-Code.",
        "Im <strong>Dashboard</strong> meldest du dich mit Club-Code und deinem Passwort an. Dort siehst du den Fortschritt live.",
        "Sobald genügend Rückmeldungen eingegangen sind, kannst du den <strong>PDF-Bericht</strong> herunterladen und im Vorstand besprechen."
      ])}
      ${notice(`<strong style="color:#1a1a1a;">Tipp:</strong> Wir empfehlen mindestens 10 Rückmeldungen für eine belastbare Auswertung. Bei größeren Vereinen sollten möglichst verschiedene Rollen vertreten sein — Mitglieder, Eltern, Trainer:innen, Vorstand.`)}
      ${softParagraph(`Bitte bewahre den Club-Code <strong style="color:#1a1a1a;">${esc(code)}</strong> gut auf — du brauchst ihn für Dashboard und Support.`)}
      ${signature()}
    `
  });
}

function passwordResetHtml({ clubName, resetUrl }) {
  return emailLayout({
    title: "ClubCheck Passwort zurücksetzen",
    preheader: "Setze ein neues Dashboard-Passwort. Der Link ist 30 Minuten gültig.",
    children: `
      ${eyebrow("Sicherheit")}
      ${headline("Passwort zurücksetzen.")}
      ${paragraph(`Für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> wurde gerade ein neues Dashboard-Passwort angefordert.`)}
      ${paragraph("Über den folgenden Link kannst du innerhalb der nächsten <strong>30 Minuten</strong> ein neues Passwort vergeben:")}
      ${button(resetUrl, "Neues Passwort setzen")}
      ${notice(`<strong style="color:#1a1a1a;">Diese Anfrage kam nicht von dir?</strong> Dann kannst du diese E-Mail einfach ignorieren — dein bisheriges Passwort bleibt unverändert. Es wurde nichts geändert.`)}
      ${softParagraph("Aus Sicherheitsgründen ist der Link nur einmal verwendbar und läuft nach 30 Minuten ab. Bei Fragen kannst du jederzeit auf diese E-Mail antworten.")}
      ${signature()}
    `
  });
}

function passwordChangedHtml({ contactName, clubName, dashboardUrl, when }) {
  const greeting = contactName ? `Hallo ${esc(contactName.split(" ")[0])},` : "Hallo,";
  return emailLayout({
    title: "Dein Passwort wurde geändert",
    preheader: "Sicherheitshinweis: Das Dashboard-Passwort für deinen Verein wurde aktualisiert.",
    children: `
      ${eyebrow("Sicherheitshinweis")}
      ${headline("Dein Passwort wurde geändert.")}
      ${paragraph(`${greeting} das Dashboard-Passwort für <strong style="color:#1a1a1a;">${esc(clubName)}</strong> wurde gerade erfolgreich aktualisiert.`)}
      ${infoTable([
        ["Verein", esc(clubName)],
        ["Geändert am", esc(when)]
      ])}
      ${button(dashboardUrl, "Zum Dashboard")}
      ${notice(`<strong style="color:#1a1a1a;">Das warst nicht du?</strong> Bitte antworte sofort auf diese E-Mail. Wir sperren den Zugang und unterstützen dich bei der Wiederherstellung.`)}
      ${signature()}
    `
  });
}

// === PUBLIC SEND FUNCTIONS ===

async function sendRegistrationStartedEmail(supabase, club, { plan, checkoutUrl }) {
  const subject = "Deine ClubCheck Bestellung ist vorbereitet";
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
  const subject = `Dein ClubCheck ${plan.label} ist startklar`;

  return sendEmailEventOnce(supabase, club, "purchase_confirmed", subject, () =>
    purchaseConfirmationHtml({
      contactName: club.contact_name,
      clubName: club.name,
      code,
      planLabel: plan.label,
      price: plan.price,
      surveyUrl,
      dashboardUrl,
      maxMembers: plan.maxMembers,
      maxQuestions: plan.maxCustomQuestions
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

async function sendPasswordChangedEmail(to, { clubName, contactName, dashboardUrl }) {
  if (!to) return { ok: false, skipped: true, reason: "missing_recipient" };
  const subject = "Dein ClubCheck Passwort wurde geändert";
  const dt = new Date();
  const months = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const when = `${dt.getDate()}. ${months[dt.getMonth()]} ${dt.getFullYear()} · ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")} Uhr`;
  const html = passwordChangedHtml({ contactName, clubName, dashboardUrl, when });
  return sendResendEmail({ to, subject, html });
}

module.exports = {
  appBaseUrl,
  canSendEmails,
  sendResendEmail,
  sendRegistrationStartedEmail,
  sendPurchaseConfirmationEmail,
  sendPurchaseConfirmationForCode,
  sendPasswordResetEmail,
  sendPasswordChangedEmail
};
