const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { package: pkg, clubName, email, code } = req.body;

    const prices = {
      basic:   { amount: 19900, name: 'ClubCheck Basic',   desc: 'Bis 100 Mitglieder · 12 Wochen' },
      plus:    { amount: 29900, name: 'ClubCheck Plus',     desc: 'Bis 250 Mitglieder · 12 Wochen' },
      premium: { amount: 49900, name: 'ClubCheck Premium',  desc: 'Bis 500 Mitglieder · 12 Wochen' },
    };

    const p = prices[pkg];
    if (!p) return res.status(400).json({ error: 'Invalid package' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: p.name, description: p.desc },
          unit_amount: p.amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/register?step=5&code=${code}&status=success`,
      cancel_url: `${req.headers.origin}/register?step=3&status=cancelled`,
      metadata: { code, clubName, package: pkg },
    });

    res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
