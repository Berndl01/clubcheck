const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PLANS = {
  basic: {
    amount: 19900,
    name: "ClubCheck Basic",
    desc: "Bis 100 Mitglieder · 12 Wochen",
    maxMembers: 100
  },
  plus: {
    amount: 29900,
    name: "ClubCheck Plus",
    desc: "Bis 250 Mitglieder · 12 Wochen",
    maxMembers: 250
  },
  premium: {
    amount: 49900,
    name: "ClubCheck Premium",
    desc: "Bis 500 Mitglieder · 12 Wochen",
    maxMembers: 500
  }
};

function normalizePlan(value) {
  const v = String(value || "").toLowerCase();

  if (v === "starter") return "basic";
  if (v === "standard") return "plus";
  if (v === "basic") return "basic";
  if (v === "plus") return "plus";
  if (v === "premium") return "premium";

  return null;
}

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function makePasswordHash(password) {
  if (!password) return null;

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(salt + String(password))
    .digest("hex");

  return `${salt}:${hash}`;
}

function makeCodeSeed(name) {
  const base = String(name || "CLUB")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);

  return base.length >= 2 ? base : "CC";
}

async function createUniqueCode(clubName) {
  const seed = makeCodeSeed(clubName);

  for (let i = 0; i < 10; i++) {
    const code = `${seed}${Math.floor(1000 + Math.random() * 9000)}`;

    const { data, error } = await supabase
      .from("clubs")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return code;
  }

  return `${seed}${Date.now().toString().slice(-6)}`;
}

function questionToFields(index, q) {
  const out = {};
  const n = index + 1;

  if (!q || !q.text) return out;

  out[`q${n}_text`] = String(q.text).trim();
  out[`q${n}_type`] = q.type === "choice" ? "choice" : q.type === "text" ? "text" : "scale";

  if (Array.isArray(q.opts)) {
    out[`q${n}_opts`] = q.opts
      .map(x => String(x || "").trim())
      .filter(Boolean)
      .join("|");
  }

  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY fehlt in Vercel.");
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error("Supabase Environment Variables fehlen in Vercel.");
    }

    const body = req.body || {};

    const pkg = normalizePlan(body.package || body.pkg || body.plan);
    const plan = PLANS[pkg];

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: "Ungültiges Paket. Erlaubt: basic, plus, premium."
      });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const clubName = String(body.clubName || "").trim();
    const contactName = String(body.contactName || "").trim();
    const phone = String(body.phone || "").trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "Gültige E-Mail-Adresse fehlt."
      });
    }

    if (!clubName) {
      return res.status(400).json({
        success: false,
        error: "Vereinsname fehlt."
      });
    }

    let code = cleanCode(body.code);

    if (!code) {
      code = await createUniqueCode(clubName);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 84);

    const questions = Array.isArray(body.questions) ? body.questions.slice(0, 3) : [];

    const qFields = questions.reduce((acc, q, i) => {
      return Object.assign(acc, questionToFields(i, q));
    }, {});

    const passwordHash = makePasswordHash(body.password);

    const clubPayload = {
      code,
      name: clubName,
      contact_name: contactName || null,
      contact_email: email,
      contact_phone: phone || null,
      package: pkg,
      max_members: plan.maxMembers,
      payment_status: "pending",
      expires_at: expiresAt.toISOString(),
      ...qFields
    };

    if (passwordHash) {
      clubPayload.password_hash = passwordHash;
    }

    const { error: upsertError } = await supabase
      .from("clubs")
      .upsert(clubPayload, { onConflict: "code" });

    if (upsertError) {
      throw new Error(`Supabase-Fehler: ${upsertError.message}`);
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: code,
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
      success_url: `${origin}/register.html?status=success&code=${encodeURIComponent(code)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/register.html?status=cancelled&code=${encodeURIComponent(code)}`,
      metadata: {
        code,
        package: pkg,
        clubName,
        email
      }
    });

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      code
    });
  } catch (err) {
    console.error("create-checkout error:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "Unbekannter Stripe-Fehler"
    });
  }
};
