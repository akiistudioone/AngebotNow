const { getCorsHeaders } = require('./utils');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiges JSON.' }) }; }

  const rating = parseInt(body.rating, 10);
  if (!rating || rating < 1 || rating > 5) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige Bewertung.' }) };
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  const context = ['send', 'profile', 'general'].includes(body.context) ? body.context : 'general';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ rating, text, context, email, created_at: new Date().toISOString() }),
      });
    } catch (e) {
      console.error('[submit-feedback] Supabase error:', e.message);
      return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankfehler.' }) };
    }
  }

  return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
};
