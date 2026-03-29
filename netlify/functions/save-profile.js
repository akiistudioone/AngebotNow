// Save user profile data (company, address, contact) to Supabase.
// Profile data persists across devices — loaded on login via track-quote check_only.

const { checkRateLimit, getClientIp, rateLimitResponse } = require('./rate-limit');
const { getCorsHeaders, isValidEmail, sanitizeString } = require('./utils');

const PROFILE_FIELDS = ['firma', 'strasse', 'plz', 'ort', 'tel', 'kontakt_email', 'iban', 'bic'];

async function getEmailFromToken(authHeader, supabaseUrl) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '',
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.email ? user.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  const ip = getClientIp(event);
  if (!checkRateLimit(ip)) return rateLimitResponse(event);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankdienst nicht konfiguriert.' }) };
  }

  // Require valid JWT
  const email = await getEmailFromToken(
    event.headers['authorization'] || event.headers['Authorization'],
    supabaseUrl
  );

  if (!email) {
    return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Authentifizierung erforderlich.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  // Validate and sanitize profile fields
  const profile = {};
  for (const field of PROFILE_FIELDS) {
    if (body[field] !== undefined) {
      profile[field] = sanitizeString(String(body[field] ?? ''), 200);
    }
  }

  if (profile.kontakt_email && !isValidEmail(profile.kontakt_email)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige Kontakt-E-Mail.' }) };
  }

  if (profile.plz && !/^\d{5}$/.test(profile.plz)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'PLZ muss 5-stellig sein.' }) };
  }

  if (Object.keys(profile).length === 0) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Keine Profildaten übergeben.' }) };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(profile),
      }
    );

    if (!res.ok) {
      console.error('Supabase profile update failed:', res.status);
      return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Profil konnte nicht gespeichert werden.' }) };
    }

    return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('save-profile error:', err.message);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Netzwerkfehler.' }) };
  }
};
