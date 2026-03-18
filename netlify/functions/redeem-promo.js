const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://angebot-now.de',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  const { code, email } = body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Promo-Code fehlt.' }) };
  }
  if (!email || !isValidEmail(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase env vars not configured');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Datenbankverbindung nicht konfiguriert.' }) };
  }

  const safeCode = code.trim().toUpperCase().slice(0, 64);

  // Look up promo code
  let codeData;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(safeCode)}&select=id,code,is_active,uses_count,max_uses,extra_quotes`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiger oder abgelaufener Code' }) };
    }
    codeData = rows[0];
  } catch (err) {
    console.error('promo_codes lookup error:', err.message);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Datenbankfehler.' }) };
  }

  if (!codeData.is_active || codeData.uses_count >= codeData.max_uses) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiger oder abgelaufener Code' }) };
  }

  // Increment uses_count on promo code
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/promo_codes?id=eq.${encodeURIComponent(codeData.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ uses_count: codeData.uses_count + 1 }),
    });
  } catch (err) {
    console.error('promo uses_count increment error:', err.message);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Datenbankfehler beim Einlösen.' }) };
  }

  // Find user by email and increment quote_count by extra_quotes
  try {
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,quote_count`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const users = await userRes.json();
    if (Array.isArray(users) && users.length > 0) {
      const user = users[0];
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ quote_count: (user.quote_count || 0) + codeData.extra_quotes }),
      });
    }
  } catch (err) {
    console.error('user quote_count update error:', err.message);
    // Non-fatal: code was already redeemed, still return success
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true, extra_quotes: codeData.extra_quotes }),
  };
};
