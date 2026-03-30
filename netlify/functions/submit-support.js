const { getCorsHeaders, isValidEmail, sanitizeString } = require('./utils');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'akan.yueksel@gmail.com';

const ALLOWED_CATEGORIES = ['Technisches Problem', 'Konto & Abo', 'Zahlung', 'Feature-Wunsch', 'Sonstiges'];

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

  const name = sanitizeString(body.name || '', 100);
  const email = (body.email || '').trim().toLowerCase();
  const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'Sonstiges';
  const message = sanitizeString(body.message || '', 2000);

  if (!name) return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Name fehlt.' }) };
  if (!isValidEmail(email)) return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige E-Mail.' }) };
  if (!message) return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Nachricht fehlt.' }) };

  // Store in Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/support_requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ name, email, category, message, created_at: new Date().toISOString(), resolved: false }),
      });
    } catch (e) {
      console.error('[submit-support] Supabase error:', e.message);
    }
  }

  // Email notification to admin
  if (RESEND_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'AngebotGo Support <no-reply@angebotgo.de>',
          to: ADMIN_EMAIL,
          subject: `[Support] ${category}: ${name}`,
          text: `Neue Support-Anfrage\n\nName: ${name}\nE-Mail: ${email}\nKategorie: ${category}\n\nNachricht:\n${message}\n\n---\nAngebotGo Support System`,
        }),
      });
    } catch (e) {
      console.error('[submit-support] Resend error:', e.message);
    }
  }

  return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
};
