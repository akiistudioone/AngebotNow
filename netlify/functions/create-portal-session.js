const { checkRateLimit, getClientIp, rateLimitResponse } = require('./rate-limit');
const { getCorsHeaders, isValidEmail } = require('./utils');

const APP_URL = process.env.APP_URL || process.env.ALLOWED_ORIGIN || 'https://angebotgo.de';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  const ip = getClientIp(event);
  if (!checkRateLimit(ip)) return rateLimitResponse(event);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  const { email } = body;
  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige E-Mail.' }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!stripeKey) {
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Zahlungsdienst nicht konfiguriert.' }) };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Look up stripe_customer_id from Supabase
  let customerId;
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=stripe_customer_id`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          customerId = rows[0].stripe_customer_id;
        }
      }
    } catch (err) {
      console.error('Supabase lookup error:', err.message);
    }
  }

  if (!customerId) {
    return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Kein Abo-Konto gefunden.' }) };
  }

  try {
    const params = new URLSearchParams({
      customer: customerId,
      return_url: APP_URL,
    });

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Stripe portal error:', res.status, err.error?.message || '');
      return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Portal konnte nicht geöffnet werden.' }) };
    }

    const session = await res.json();
    return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-portal-session error:', err.message);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Netzwerkfehler.' }) };
  }
};
