const Stripe = require("stripe");
const {
  PLANS,
  requireEnv,
  getSupabase,
  getOrigin,
  cleanCode,
  cleanString,
  normalizePlan,
  hashPassword,
  parseBody,
  sendJson,
  methodNotAllowed,
  createUniqueCode,
  questionToFields
} = require("./_lib");
const { sendRegistrationStartedEmail } = require("./_email");

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

async function insertClub(supabase, payload) {
  const { data, error } = await supabase
    .from("clubs")
    .insert(payload)
    .select("id,code,name,contact_name,contact_email,package")
    .single();

  if (error) throw error;
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const supabase = getSupabase();
    const body = await parseBody(req);

    const planKey = normalizePlan(body.package || body.pkg || body.plan);
    const plan = PLANS[planKey];

    if (!plan) {
      return sendJson(res, 400, { ok: false, error: "Bitte ein gültiges Paket auswählen." });
    }

    const email = cleanString(body.email, 200).toLowerCase();
    const clubName = cleanString(body.clubName, 200);
    const contactName = cleanString(body.contactName, 200);
    const phone = cleanString(body.phone, 50);
    const password = String(body.password || "");

    if (!clubName) return sendJson(res, 400, { ok: false, error: "Bitte den Vereinsnamen eingeben." });
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return sendJson(res, 400, { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { ok: false, error: "Das Passwort muss mindestens 8 Zeichen haben." });
    }

    let code = cleanCode(body.code);
    if (!code) code = await createUniqueCode(supabase, clubName);

    const questionsRaw = Array.isArray(body.questions) ? body.questions : [];
    const questions = questionsRaw
      .map(q => ({
        text: cleanString(q && q.text, 180),
        type: String((q && q.type) || "scale").toLowerCase(),
        opts: Array.isArray(q && q.opts) ? q.opts : []
      }))
      .filter(q => q.text)
      .slice(0, plan.maxCustomQuestions);

    const qFields = questionToFields(questions);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 84);

    const payload = {
      code,
      name: clubName,
      contact_name: contactName || null,
      contact_email: email,
      contact_phone: phone || null,
      password_hash: hashPassword(password),
      package: plan.key,
      max_members: plan.maxMembers,
      max_custom_questions: plan.maxCustomQuestions,
      payment_status: "pending",
      expires_at: expiresAt.toISOString(),
      ...qFields
    };

    let club;
    try {
      club = await insertClub(supabase, payload);
    } catch (insertError) {
      if (insertError && insertError.code === "23505") {
        payload.code = await createUniqueCode(supabase, clubName);
        club = await insertClub(supabase, payload);
      } else {
        throw insertError;
      }
    }

    const origin = getOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: club.code,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: plan.amount,
            product_data: {
              name: plan.name,
              description: plan.desc
            }
          },
          quantity: 1
        }
      ],
      success_url: `${origin}/register.html?status=success&code=${encodeURIComponent(club.code)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/register.html?status=cancelled&code=${encodeURIComponent(club.code)}`,
      metadata: {
        code: club.code,
        package: plan.key,
        clubName,
        email
      }
    });

    // E-Mail ist bewusst nicht zahlungskritisch: Checkout darf nicht scheitern, wenn Resend kurz nicht erreichbar ist.
    try {
      await sendRegistrationStartedEmail(supabase, club, { plan, checkoutUrl: session.url });
    } catch (emailErr) {
      console.error("registration email failed:", emailErr.message);
    }

    return sendJson(res, 200, {
      ok: true,
      url: session.url,
      sessionId: session.id,
      code: club.code
    });
  } catch (err) {
    console.error("create-checkout failed:", err);
    return sendJson(res, 500, {
      ok: false,
      error: "Die Zahlung konnte nicht vorbereitet werden. Bitte versuche es später erneut."
    });
  }
};
