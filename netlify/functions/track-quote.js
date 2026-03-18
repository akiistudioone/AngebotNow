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

  const { email, check_only } = body;

  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }) };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase environment variables not configured');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Datenbankdienst nicht konfiguriert.' }) };
  }

  // check_only: just read status without incrementing
  if (check_only) {
    try {
      const selectRes = await fetch(
        `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=quote_count,is_pro`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      if (!selectRes.ok) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ quote_count: 0, is_pro: false }) };
      }
      const rows = await selectRes.json();
      if (!rows || rows.length === 0) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ quote_count: 0, is_pro: false }) };
      }
      const { quote_count, is_pro } = rows[0];
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ quote_count: quote_count || 0, is_pro: Boolean(is_pro) }) };
    } catch (err) {
      console.error('track-quote check_only error:', err.message);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ quote_count: 0, is_pro: false }) };
    }
  }

  try {
    // Upsert user row, incrementing quote_count
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        quote_count: 1,
        is_pro: false,
        created_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      console.error('Supabase upsert failed:', upsertRes.status);
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Fehler beim Speichern.' }) };
    }

    // Now increment quote_count via RPC to avoid race conditions
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_quote_count`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_email: normalizedEmail }),
    });

    // Fall back to reading current state if RPC not available
    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=quote_count,is_pro`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!selectRes.ok) {
      console.error('Supabase select failed:', selectRes.status);
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Fehler beim Lesen.' }) };
    }

    const rows = await selectRes.json();
    if (!rows || rows.length === 0) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Benutzer nicht gefunden.' }) };
    }

    const { quote_count, is_pro } = rows[0];
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ quote_count, is_pro: Boolean(is_pro) }),
    };
  } catch (err) {
    console.error('track-quote error:', err.message);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Netzwerkfehler.' }) };
  }
};
