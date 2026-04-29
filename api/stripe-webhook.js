const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }

    if (typeof req.body === "string") {
      return resolve(Buffer.from(req.body));
    }

    const chunks = [];

    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let event;

  try {
    const signature = req.headers["stripe-signature"];
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const code = String(
        session.client_reference_id ||
        session.metadata?.code ||
        ""
      )
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      const pkg = String(session.metadata?.package || "basic").toLowerCase();

      const maxMembers = {
        basic: 100,
        plus: 250,
        premium: 500
      };

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 84);

      if (!code) {
        console.error("Webhook ohne Club-Code:", session.id);
        return res.status(200).json({ received: true, warning: "missing_code" });
      }

      const { error } = await supabase
        .from("clubs")
        .update({
          payment_status: "paid",
          package: pkg,
          max_members: maxMembers[pkg] || 100,
          expires_at: expiresAt.toISOString(),
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null,
          updated_at: new Date().toISOString()
        })
        .eq("code", code);

      if (error) {
        console.error("Supabase payment update error:", error);
        return res.status(500).json({
          received: true,
          error: error.message
        });
      }

      console.log(`Payment confirmed for club ${code}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handling error:", err);
    return res.status(500).json({
      received: false,
      error: err.message
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
