const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service key for server-side operations
);

// Vercel needs raw body for Stripe signature verification
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Vercel provides raw body as buffer
    const buf = await getRawBody(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { code, clubName, package: pkg } = session.metadata || {};

    if (code) {
      const maxMembers = { basic: 100, plus: 250, premium: 500 };
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 84); // 12 weeks

      const { error } = await supabase
        .from('clubs')
        .update({
          payment_status: 'paid',
          package: pkg,
          max_members: maxMembers[pkg] || 100,
          expires_at: expiresAt.toISOString(),
          stripe_session_id: session.id,
          stripe_customer_id: session.customer,
        })
        .eq('code', code.toUpperCase());

      if (error) console.error('Supabase update error:', error);
      else console.log(`Payment confirmed for ${code} - ${pkg}`);
    }
  }

  res.json({ received: true });
};

// Raw body helper for Vercel
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Disable body parsing for webhook
module.exports.config = { api: { bodyParser: false } };
