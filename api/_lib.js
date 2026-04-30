const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PLANS = {
  basic: {
    key: "basic",
    label: "Basic",
    amount: 19900,
    price: 199,
    name: "ClubCheck Basic",
    desc: "Bis 100 Mitglieder · 12 Wochen · 1 eigene Vereinsfrage",
    maxMembers: 100,
    maxCustomQuestions: 1
  },
  plus: {
    key: "plus",
    label: "Plus",
    amount: 29900,
    price: 299,
    name: "ClubCheck Plus",
    desc: "Bis 250 Mitglieder · 12 Wochen · bis zu 3 eigene Vereinsfragen",
    maxMembers: 250,
    maxCustomQuestions: 3
  },
  premium: {
    key: "premium",
    label: "Premium",
    amount: 49900,
    price: 499,
    name: "ClubCheck Premium",
    desc: "Bis 500 Mitglieder · 12 Wochen · bis zu 5 eigene Vereinsfragen",
    maxMembers: 500,
    maxCustomQuestions: 5
  }
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

function getSupabase() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_KEY"),
    { auth: { persistSession: false } }
  );
}

function getOrigin(req) {
  const origin = req.headers.origin;
  if (origin) return origin;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function cleanString(value, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePlan(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "starter") return "basic";
  if (v === "standard") return "plus";
  if (PLANS[v]) return v;
  return null;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 210000;
  const keylen = 32;
  const digest = "sha256";
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, keylen, digest).toString("hex");
  return `pbkdf2:${digest}:${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!password || !stored) return false;

  const parts = String(stored).split(":");

  if (parts[0] === "pbkdf2" && parts.length === 5) {
    const [, digest, iterRaw, salt, expected] = parts;
    const iterations = Number(iterRaw);
    const actual = crypto.pbkdf2Sync(String(password), salt, iterations, Buffer.from(expected, "hex").length, digest).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }

  // Kompatibilität mit älteren ClubCheck-Hashes: salt:sha256(salt+password)
  if (parts.length === 2) {
    const [salt, expected] = parts;
    const actual = crypto.createHash("sha256").update(salt + String(password)).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    } catch (_) {
      return false;
    }
  }

  return false;
}

function sessionSecret() {
  return process.env.APP_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || process.env.STRIPE_SECRET_KEY || "clubcheck-local-secret";
}

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

function createSessionToken(club) {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64urlJson({
    sub: club.id,
    code: club.code,
    name: club.name,
    iat: now,
    exp: now + 60 * 60 * 12
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signPayload(unsigned)}`;
}

function verifySessionToken(token) {
  const raw = String(token || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = signPayload(unsigned);

  try {
    if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (_) {
    return null;
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.sub || !payload.code) return null;
  return payload;
}

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return "";
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;

  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch (_) { return {}; }
  }

  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString("utf8") || "{}"); } catch (_) { return {}; }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (_) { return {}; }
}

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(payload));
}

function methodNotAllowed(res) {
  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

function publicError(res, message = "Die Anfrage konnte nicht verarbeitet werden.", status = 400) {
  return sendJson(res, status, { ok: false, error: message });
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function makeCodeSeed(name) {
  const base = String(name || "CLUB")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return base.length >= 2 ? base : "CC";
}

async function createUniqueCode(supabase, clubName) {
  const seed = makeCodeSeed(clubName);
  for (let i = 0; i < 20; i++) {
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

function questionToFields(questions) {
  const out = {
    q1_text: null, q1_type: "scale", q1_opts: null,
    q2_text: null, q2_type: "scale", q2_opts: null,
    q3_text: null, q3_type: "scale", q3_opts: null,
    q4_text: null, q4_type: "scale", q4_opts: null,
    q5_text: null, q5_type: "scale", q5_opts: null
  };

  questions.slice(0, 5).forEach((q, i) => {
    const n = i + 1;
    const text = cleanString(q && q.text, 180);
    if (!text) return;

    const typeRaw = String((q && q.type) || "scale").toLowerCase();
    const type = typeRaw === "choice" ? "choice" : typeRaw === "text" ? "text" : "scale";

    out[`q${n}_text`] = text;
    out[`q${n}_type`] = type;

    if (Array.isArray(q && q.opts)) {
      out[`q${n}_opts`] = q.opts
        .map(x => cleanString(x, 80))
        .filter(Boolean)
        .slice(0, 8)
        .join("|") || null;
    }
  });

  return out;
}

function clubQuestionsFromRow(club) {
  const items = [];
  for (let i = 1; i <= 5; i++) {
    const text = club[`q${i}_text`];
    if (!text) continue;
    items.push({
      id: `custom_${i}`,
      text,
      type: club[`q${i}_type`] || "scale",
      opts: club[`q${i}_opts`] ? String(club[`q${i}_opts`]).split("|").filter(Boolean) : []
    });
  }
  return items.slice(0, Number(club.max_custom_questions || 5));
}

function avg(nums) {
  const clean = nums.map(Number).filter(n => Number.isFinite(n));
  if (!clean.length) return null;
  return Math.round(clean.reduce((a, b) => a + b, 0) / clean.length);
}

function avgFloat(nums, digits = 1) {
  const clean = nums.map(Number).filter(n => Number.isFinite(n));
  if (!clean.length) return null;
  const val = clean.reduce((a, b) => a + b, 0) / clean.length;
  return Number(val.toFixed(digits));
}

function scoreFromAnswers(answers) {
  const a = answers || {};
  const byPrefix = prefix => Object.keys(a)
    .filter(k => k.startsWith(prefix))
    .map(k => Number(a[k]))
    .filter(n => Number.isFinite(n));

  const intern = avg(byPrefix("intern_"));
  const sport = avg(byPrefix("sport_"));
  const extern = avg(byPrefix("extern_"));
  const zukunft = avg(byPrefix("zukunft_"));
  const custom = avg(byPrefix("custom_"));

  const base = [intern, sport, extern, zukunft].filter(n => n !== null);
  const total = avg(base);

  return { intern, sport, extern, zukunft, custom, total };
}

function normalizeAnswerValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  return cleanString(value, 1000);
}

module.exports = {
  PLANS,
  requireEnv,
  getSupabase,
  getOrigin,
  cleanCode,
  cleanString,
  normalizePlan,
  randomToken,
  sha256,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getBearerToken,
  parseBody,
  sendJson,
  methodNotAllowed,
  publicError,
  getRawBody,
  createUniqueCode,
  questionToFields,
  clubQuestionsFromRow,
  avg,
  avgFloat,
  scoreFromAnswers,
  normalizeAnswerValue
};
