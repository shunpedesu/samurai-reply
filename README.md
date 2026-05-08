# Samurai Reply 🚀

> The reply you couldn't write. — AI-powered reply generator with 5 tones.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (`index.html`)
- **Backend**: Node.js + Express (`server.js`)
- **Payments**: Stripe Payment Links + Webhooks
- **Database**: Supabase (PostgreSQL)
- **Deploy**: Vercel (one command)

---

## Setup in 30 minutes

### 1. Supabase — 5 min

1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** → paste contents of `supabase-schema.sql` → Run
3. Go to **Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### 2. Stripe — 10 min

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Products** → Add product → Name: "Samurai Reply Lifetime" → Price: $9.99 one-time
3. **Payment Links** → Create link → select your product → copy the URL → `STRIPE_PAYMENT_LINK`
4. **Developers → API keys** → copy Secret key → `STRIPE_SECRET_KEY`
5. **Developers → Webhooks** → Add endpoint:
   - URL: `https://your-domain.vercel.app/api/stripe/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 3. Anthropic — 2 min

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. **API Keys** → Create key → `ANTHROPIC_API_KEY`

### 4. Deploy to Vercel — 5 min

```bash
# Install Vercel CLI
npm i -g vercel

# Clone / cd into this folder
cd samurai-reply

# Install dependencies
npm install

# Deploy (first time — follow prompts)
vercel

# Set environment variables
vercel env add ANTHROPIC_API_KEY
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_PAYMENT_LINK
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add APP_URL   # e.g. https://samurai-reply.vercel.app

# Deploy to production
vercel --prod
```

### 5. Update Stripe Webhook URL

After deploy, go back to Stripe → Webhooks → update the endpoint URL to your real Vercel domain.

---

## Local Development

```bash
cp .env.example .env
# Fill in your values

npm install
npm run dev
# → http://localhost:3000
```

---

## How payments work

```
User hits free limit (3/day)
  → Paywall modal appears
  → User enters email → redirected to Stripe checkout ($9.99)
  → Stripe sends webhook to /api/stripe/webhook
  → Email saved to Supabase unlocked_users table
  → Next visit: /api/check-unlock returns true → unlimited access
```

---

## File structure

```
samurai-reply/
├── index.html          ← Frontend (full app)
├── server.js           ← Backend (Express)
├── supabase-schema.sql ← DB tables (run once in Supabase)
├── vercel.json         ← Vercel deploy config
├── package.json
├── .env.example        ← Copy to .env and fill in
└── README.md
```

---

## Go-live checklist

- [ ] Supabase tables created
- [ ] Stripe product + payment link created
- [ ] Stripe webhook configured with correct URL
- [ ] All env vars set in Vercel
- [ ] `vercel --prod` deployed
- [ ] Test payment with Stripe test card `4242 4242 4242 4242`
- [ ] Confirm webhook fires and email appears in Supabase
- [ ] Switch Stripe to live mode (remove `test` keys → add `live` keys)
- [ ] Share on X / TikTok 🚀

---

Made with Claude. Good luck. ⚔️
