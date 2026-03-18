const { checkRateLimit, getClientIp, rateLimitResponse } = require('./rate-limit');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://angebot-now.de',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  const ip = getClientIp(event);
  if (!checkRateLimit(ip)) return rateLimitResponse();

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  const { plan, email } = body;

  if (!['monthly', 'yearly'].includes(plan)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiger Plan.' }) };
  }
  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültige E-Mail.' }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = plan === 'yearly'
    ? process.env.STRIPE_YEARLY_PRICE_ID
    : process.env.STRIPE_MONTHLY_PRICE_ID;

  if (!stripeKey || !priceId) {
    console.error('Stripe environment variables not configured');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Zahlungsdienst nicht konfiguriert.' }) };
  }

  try {
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      customer_email: email.trim().toLowerCase(),
      success_url: 'https://angebot-now.de/?checkout=success',
      cancel_url: 'https://angebot-now.de/?checkout=cancel',
      'metadata[plan]': plan,
      'subscription_data[metadata][plan]': plan,
      allow_promotion_codes: 'true',
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Stripe checkout error:', res.status, err.error?.message || '');
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Fehler beim Erstellen der Bezahlsitzung.' }),
      };
    }

    const session = await res.json();
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout error:', err.message);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Netzwerkfehler.' }) };
  }
};
