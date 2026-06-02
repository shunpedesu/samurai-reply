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
  ssl: { rejectUnauthorized: false, sslmode: 'verify-full' },
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.APP_URL || '*',
  methods: ['GET', 'POST'],
}));

// ── Raw body for Stripe webhook (must come before express.json) ───────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── JSON for everything else ──────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));

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
// 2a. POST /api/bonus-email — +3 credits for email signup (once per email)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/bonus-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  const clean = email.toLowerCase().trim();
  try {
    const { rows } = await pool.query('SELECT count FROM free_usage WHERE key = $1', [`email_bonus:${clean}`]);
    if (rows[0]?.count >= 1) {
      const cr = await pool.query('SELECT credits FROM user_credits WHERE email = $1', [clean]);
      return res.json({ success: false, already: true, credits: parseInt(cr.rows[0]?.credits || 0) });
    }
    await pool.query(
      `INSERT INTO free_usage (key, count, updated_at) VALUES ($1, 1, NOW()) ON CONFLICT (key) DO UPDATE SET count=1, updated_at=NOW()`,
      [`email_bonus:${clean}`]);
    const result = await pool.query(
      `INSERT INTO user_credits (email, credits, created_at, updated_at) VALUES ($1,3,NOW(),NOW())
       ON CONFLICT (email) DO UPDATE SET credits=user_credits.credits+3, updated_at=NOW() RETURNING credits`,
      [clean]);
    res.json({ success: true, credits: parseInt(result.rows[0].credits) });
  } catch (err) { console.error('Email bonus error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b. POST /api/bonus-share — +2 free uses for sharing (once per IP per day)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/bonus-share', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query('SELECT count FROM free_usage WHERE key = $1', [`share_bonus:${ip}:${today}`]);
    if (rows[0]?.count >= 1) return res.json({ success: false, already: true });
    await pool.query(
      `INSERT INTO free_usage (key, count, updated_at) VALUES ($1,1,NOW()) ON CONFLICT (key) DO UPDATE SET count=1, updated_at=NOW()`,
      [`share_bonus:${ip}:${today}`]);
    await pool.query(
      `UPDATE free_usage SET count=GREATEST(0,count-2), updated_at=NOW() WHERE key=$1`,
      [`free:${ip}:${today}`]);
    res.json({ success: true, bonus: 2 });
  } catch (err) { console.error('Share bonus error:', err); res.status(500).json({ error: 'Server error' }); }
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
    const prompt = `You are a response generator for a tool that handles TWO types of input:
TYPE A — a message the user RECEIVED and wants to reply to.
TYPE B — a situation, worry, or vent the user wants PERSPECTIVE on (not a reply to send).

Detect which type this is and respond accordingly:
- Type A: generate replies the user could SEND back.
- Type B: generate responses that offer perspective, comfort, advice, or reframing — as if each character is speaking directly TO the user.

Either way, generate 5 GENUINELY DIFFERENT responses.

CRITICAL RULE — DIFFERENT CONTENT, NOT JUST DIFFERENT TONE:
Each character must approach the situation from a completely different angle. They should focus on different aspects, give different advice, ask different questions, or reach different conclusions. Do NOT have all 5 characters say the same thing in different styles. A reader should feel like they got 5 distinct perspectives, not 1 perspective repeated 5 times.

LANGUAGE RULE: Detect the language of the message. Reply in the SAME language. Japanese input → Japanese replies. English input → English replies.

Message: "${message.trim()}"

CHARACTER INSTRUCTIONS:

1. hero — LENS: A shonen anime protagonist — pure-hearted, overly enthusiastic, completely misses the nuance but charges at every problem with maximum energy. Believes in the power of friendship, hard work, and never giving up. References nakama, determination, or "I won't back down." Slightly dense but 100% sincere. Every problem is an opportunity to grow stronger. 30-80 words.

2. zen — LENS: Strip away the ego and attachment behind the situation. Don't answer the question — dissolve it. Return a koan or reframe that makes the problem itself disappear. Do NOT give practical advice. Reference impermanence, non-attachment, or present moment. Possibly answer with a question. 30-80 words.

3. obaachan — LENS: Immediately redirect to physical wellbeing. Completely sidestep the actual issue and express concern about eating, sleeping, health, or coming home. Warm but suffocating. The reply should feel like the grandma didn't even register the real problem — she just started worrying about dinner. Use あらあら、まあまあ、ねえ naturally if in Japanese. 30-80 words.

4. tsundere — LENS: Reluctantly offer something genuinely useful — a specific suggestion, a concrete action, or real emotional acknowledgment — while desperately pretending not to care. The content should be more direct and actionable than the other replies, wrapped in flustered denial. The embarrassment is in HOW they say it, not in withholding the help. Use べ、べつに…/勘違いしないでよ if in Japanese, or "It's not like I care but..." if in English. 30-80 words.

5. samurai — LENS: Reframe the situation as a matter of honor, duty, or inner strength. Call the person to action or resolve. Use seasonal/nature metaphors. Weave in Japanese words (武士道, 刀, etc.) regardless of input language. Be poetic and slightly absurd but fully earnest. The reply should feel like a battle cry or solemn vow. 40-100 words.

Return ONLY valid JSON, no other text:
{"hero":"...","zen":"...","obaachan":"...","tsundere":"...","samurai":"..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
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
    let replies;
    try {
      replies = JSON.parse(match[0]);
    } catch(parseErr) {
      console.error('JSON parse error — raw response may be truncated. raw length:', raw.length);
      throw new Error('Response was cut off. Please try again.');
    }

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

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API error: ${response.status} — ${errBody}`);
    }
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
app.get('/ogp.png',      (req, res) => res.sendFile(path.join(__dirname, 'ogp.png')));
app.get('*',             (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Samurai Reply server running on port ${PORT}`);
});
