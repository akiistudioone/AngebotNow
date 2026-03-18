# AngebotNow

DSGVO-compliant German quote generator SaaS for Handwerker. Single-page app hosted on Netlify with EU-only data processing.

**Domain:** angebot-now.de
**Stack:** Vanilla HTML/CSS/JS · Netlify Functions (Node 18) · Supabase (Frankfurt) · Stripe · Resend

---

## Prerequisites

- [Netlify CLI](https://docs.netlify.com/cli/get-started/) `npm i -g netlify-cli`
- Supabase account → project in **Frankfurt (eu-central-1)** region
- Stripe account (live or test mode)
- Resend account with verified domain `angebot-now.de`

---

## Environment Variables

Set all of these in **Netlify → Site Settings → Environment Variables**. Never commit them.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase **service role** key (not anon key) — server-side only |
| `RESEND_API_KEY` | Resend API key from resend.com/api-keys |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Price ID for 39,99 €/month plan (`price_...`) |
| `STRIPE_YEARLY_PRICE_ID` | Stripe Price ID for 299,88 €/year plan (`price_...`) |
| `SUPABASE_ANON_KEY` | Supabase **anon/public** key — used by Netlify Functions to validate user JWTs |

---

## Supabase Setup

1. Create a new project in **Frankfurt (eu-central-1)** region
2. Go to **SQL Editor** and run the following schema:

```sql
-- Users table
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  quote_count INT DEFAULT 0,
  is_pro BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own row
CREATE POLICY "users_self_read" ON users
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

CREATE POLICY "users_self_update" ON users
  FOR UPDATE USING (auth.jwt() ->> 'email' = email);

-- Service role can do everything (used by Netlify Functions)
-- Service role bypasses RLS by default in Supabase

-- Helper function: increment quote count atomically
CREATE OR REPLACE FUNCTION increment_quote_count(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (email, quote_count, is_pro, created_at)
  VALUES (user_email, 1, false, NOW())
  ON CONFLICT (email)
  DO UPDATE SET quote_count = users.quote_count + 1;
END;
$$;
```

3. Copy your **Project URL**, **service_role** key and **anon** key from
   Project Settings → API → Project API keys

4. In **Authentication → Settings** configure:
   - **Site URL**: `https://angebot-now.de`
   - **Redirect URLs**: `https://angebot-now.de`
   - Email provider: already configured via Resend (or use Supabase built-in)
   - Magic Link and Email/Password providers: enabled by default

5. In **`index.html`**, replace the two placeholder constants:
   ```js
   const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
   with your actual Supabase project URL and **anon** key (safe to expose client-side).

---

## Stripe Setup

### 1. Create Product
- Dashboard → Products → Add product
- Name: `AngebotNow Pro`

### 2. Create Prices
- **Monthly:** 39,99 € recurring/month → copy `price_...` ID → `STRIPE_MONTHLY_PRICE_ID`
- **Yearly:** 299,88 € recurring/year → copy `price_...` ID → `STRIPE_YEARLY_PRICE_ID`

### 3. Configure Webhook
- Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://angebot-now.de/.netlify/functions/stripe-webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
- Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## Resend Setup

1. Sign up at [resend.com](https://resend.com)
2. Add domain → **angebot-now.de**
3. Add DNS records (MX, SPF, DKIM) as shown in Resend dashboard
4. Verify domain (can take up to 48h)
5. Create API key → `RESEND_API_KEY`
6. Sender address used: `noreply@angebot-now.de`

---

## Deploy Steps

```bash
# 1. Clone / navigate to project
cd AngebotNow

# 2. Login to Netlify
netlify login

# 3. Init site (first time)
netlify init

# 4. Set environment variables
netlify env:set SUPABASE_URL "https://xxxx.supabase.co"
netlify env:set SUPABASE_KEY "your-service-role-key"
netlify env:set RESEND_API_KEY "re_xxxx"
netlify env:set STRIPE_SECRET_KEY "sk_live_xxxx"
netlify env:set STRIPE_WEBHOOK_SECRET "whsec_xxxx"
netlify env:set STRIPE_MONTHLY_PRICE_ID "price_xxxx"
netlify env:set STRIPE_YEARLY_PRICE_ID "price_xxxx"

# 5. Deploy
netlify deploy --prod

# 6. Set custom domain in Netlify UI → Domain Management → angebot-now.de
```

---

## Local Development

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Create .env file (never commit this)
cat > .env << EOF
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-service-role-key
RESEND_API_KEY=re_xxxx
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
STRIPE_MONTHLY_PRICE_ID=price_xxxx
STRIPE_YEARLY_PRICE_ID=price_xxxx
EOF

# Start local dev server
netlify dev

# For Stripe webhooks locally:
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

---

## DSGVO / Data Protection Notes

### Data Storage

**localStorage (client-side only):**
- `handwerker_email` — craftsman's email address
- `saved_sender_info` — sender company details (name, address, phone)
- `quote_counter_local` — local quote count cache

**Supabase (server-side, Frankfurt EU):**
- `email` — craftsman's email address
- `quote_count` — number of quotes created
- `is_pro` — subscription status
- `stripe_customer_id` — Stripe customer reference (set on upgrade)

**What is NEVER stored:**
- Customer/recipient data (names, addresses, emails)
- Quote content or line items
- PDF files

### Sub-processors & AVV (Auftragsverarbeitungsverträge)

| Service | Purpose | Region | AVV |
|---|---|---|---|
| Netlify | Hosting, Edge Functions | EU (via CDN) | [netlify.com/gdpr-sub-processors](https://www.netlify.com/gdpr-sub-processors/) |
| Supabase | Database | Frankfurt (eu-central-1) | [supabase.com/privacy](https://supabase.com/privacy) — DPA available |
| Resend | Transactional email | EU | [resend.com/privacy](https://resend.com/privacy) — DPA available |
| Stripe | Payment processing | EU | [stripe.com/privacy](https://stripe.com/privacy) — DPA available |

### Security Headers (via netlify.toml)
- `Strict-Transport-Security` with 1-year max-age + preload
- `Content-Security-Policy` restricting scripts/styles/connections
- `X-Frame-Options: DENY` — clickjacking protection
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — no camera/mic/geolocation access
- CORS restricted to `angebot-now.de` only
- Rate limiting: 10 requests/minute/IP on all functions

---

## Project Structure

```
AngebotNow/
├── index.html                          # Single-page frontend (all CSS+JS embedded)
├── netlify.toml                        # Security headers, redirects, function config
├── README.md                           # This file
└── netlify/
    └── functions/
        ├── rate-limit.js               # Shared rate limiting middleware
        ├── send-email.js               # POST: send PDF via Resend
        ├── track-quote.js              # POST: increment quote counter in Supabase
        ├── stripe-webhook.js           # POST: handle Stripe subscription events
        └── create-checkout.js          # POST: create Stripe checkout session
```
