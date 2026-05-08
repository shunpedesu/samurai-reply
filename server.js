/**
 * Samurai Reply — Backend Server (Credit Edition)
 *
 * Endpoints:
 *   POST /api/generate          — AI reply generation (credits or free quota)
 *   POST /api/check-credits     — check remaining credits for email
 *   POST /api/stripe/webhook    — Stripe payment webhook (+200 credits)
 *   GET  /api/stripe/link       — return Stripe Payment Link URL
 *   POST /api/extract-image     — OCR image via Claude
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.APP_URL || '*',
  methods: ['GET', 'POST'],
}));

// ── Raw body for Stripe webhook (must come before express.json) ───────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── JSON for everything else ──────────────────────────────────────────────────
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/stripe/link
//    Frontend calls this to get Stripe Payment Link URLs
//    ?plan=starter (100 credits / $2.99) or plan=standard (500 credits / $7.99)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/stripe/link', (req, res) => {
  const { email, plan } = req.query;
  const base = plan === 'standard'
    ? process.env.STRIPE_PAYMENT_LINK_STANDARD
    : process.env.STRIPE_PAYMENT_LINK_STARTER;
  let url = base || process.env.STRIPE_PAYMENT_LINK || '#';
  if (email) url += `?prefilled_email=${encodeURIComponent(email)}`;
  res.json({ url });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/check-credits
//    Body: { email: string }
//    Returns: { credits: number }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/check-credits', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ credits: 0 });

  try {
    const { rows } = await pool.query(
      'SELECT credits FROM user_credits WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    res.json({ credits: parseInt(rows[0]?.credits || 0, 10) });
  } catch (err) {
    console.error('DB check error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/generate
//    Body: { message: string, email?: string }
//    Logic: if email has credits → deduct 1 credit
//           else → check IP free quota (3/day)
//    Returns: { replies, credits }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { message, email } = req.body;

  if (!message || message.trim().length < 3) {
    return res.status(400).json({ error: 'Message too short' });
  }

  let creditsRemaining = 0;
  let usedCredit = false;

  // Check credit balance
  if (email) {
    try {
      const { rows } = await pool.query(
        'SELECT credits FROM user_credits WHERE email = $1',
        [email.toLowerCase().trim()]
      );
      creditsRemaining = parseInt(rows[0]?.credits || 0, 10);
    } catch (err) {
      console.error('Credits check error:', err);
    }
  }

  if (creditsRemaining > 0) {
    // Deduct 1 credit
    try {
      const { rows } = await pool.query(
        'UPDATE user_credits SET credits = credits - 1, updated_at = NOW() WHERE email = $1 RETURNING credits',
        [email.toLowerCase().trim()]
      );
      creditsRemaining = parseInt(rows[0]?.credits || 0, 10);
      usedCredit = true;
    } catch (err) {
      console.error('Credit deduction error:', err);
    }
  } else {
    // Rate limit free users by IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `free:${ip}:${today}`;

    try {
      const { rows } = await pool.query(
        'SELECT count FROM free_usage WHERE key = $1',
        [key]
      );
      const count = parseInt(rows[0]?.count || 0, 10);

      if (count >= 3) {
        return res.status(429).json({
          error: 'Free limit reached',
          limitReached: true,
        });
      }
      // Save key to increment AFTER successful generation
      req._freeKey = key;
    } catch (err) {
      console.error('Rate limit error:', err);
    }
  }

  // Call Anthropic API
  try {
    const prompt = `You are a reply strategist. Generate 5 reply options for this received message.

Message: "${message.trim()}"

1. pro: Polished and diplomatic. Safe, no drama. 40-100 words.
2. honest: What the person actually thinks/feels, direct but not cruel. 40-100 words.
3. rage: UNHINGED reply they wish they could send. Cathartic, over-the-top, a little funny. 40-120 words.
4. ghost: Single punchy line, 5-15 words MAX. Dry, deadpan, hilariously brief.
5. samurai: Reply as an honorable samurai. Poetic, dramatic, metaphors of honor/steel/seasons. Weave in Japanese words naturally. Slightly absurd but earnest. 40-100 words.

Return ONLY valid JSON, no other text:
{"pro":"...","honest":"...","rage":"...","ghost":"...","samurai":"..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API error: ${response.status} — ${errBody}`);
    }
    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Parse failed');
    const replies = JSON.parse(match[0]);

    // Only count free usage AFTER successful generation
    if (req._freeKey) {
      try {
        await pool.query(`
          INSERT INTO free_usage (key, count, updated_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (key) DO UPDATE
            SET count      = free_usage.count + 1,
                updated_at = NOW()
        `, [req._freeKey]);
      } catch (err) {
        console.error('Free usage increment error:', err);
      }
    }

    res.json({ replies, credits: creditsRemaining, usedCredit });

  } catch (err) {
    console.error('Generate error:', err);
    // If we deducted a credit but generation failed, refund it
    if (usedCredit && email) {
      try {
        await pool.query(
          'UPDATE user_credits SET credits = credits + 1, updated_at = NOW() WHERE email = $1',
          [email.toLowerCase().trim()]
        );
      } catch (refundErr) {
        console.error('Credit refund error:', refundErr);
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/stripe/webhook
//    Stripe sends checkout.session.completed here
//    → add 200 credits to the user's account
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'payment_intent.succeeded'
  ) {
    const session = event.data.object;
    const email =
      session.customer_details?.email ||
      session.customer_email ||
      session.receipt_email;

    if (email) {
      // Determine credits based on amount paid
      // $2.99 (299 cents) → 100 credits (Starter)
      // $7.99 (799 cents) → 500 credits (Standard)
      const amountPaid = session.amount_total || session.amount_subtotal || 0;
      let credits = 100; // default: Starter
      if (amountPaid >= 700) credits = 500; // Standard pack

      try {
        await pool.query(`
          INSERT INTO user_credits (email, credits, stripe_session_id, created_at, updated_at)
          VALUES ($1, $3, $2, NOW(), NOW())
          ON CONFLICT (email) DO UPDATE
            SET credits           = user_credits.credits + $3,
                stripe_session_id = $2,
                updated_at        = NOW()
        `, [email.toLowerCase().trim(), session.id, credits]);
        console.log(`✓ +${credits} credits added: ${email}`);
      } catch (err) {
        console.error('DB upsert error:', err);
      }
    }
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/extract-image
//    Body: { image: base64string, mediaType: string }
//    Returns: { text: string }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/extract-image', async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
            { type: 'text',  text: 'Extract ONLY the message text from this screenshot. Return just the raw message text, nothing else. If multiple messages, return the most recent one that needs a reply.' }
          ]
        }]
      }),
    });

    if (!response.ok) throw new Error('Anthropic API error ' + response.status);
    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';
    res.json({ text });

  } catch (err) {
    console.error('Extract image error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Static files (index.html, sw.js, manifest.json)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/sw.js',        (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.get('/manifest.json',(req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/samurai.svg',  (req, res) => res.sendFile(path.join(__dirname, 'samurai.svg')));
app.get('*',             (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Samurai Reply server running on port ${PORT}`);
});
