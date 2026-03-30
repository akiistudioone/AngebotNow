const { checkRateLimit, getClientIp, rateLimitResponse, getCorsOrigin } = require('./rate-limit');
const { getCorsHeaders, isValidEmail } = require('./utils');

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

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  const { email: bodyEmail, check_only } = body;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  // Prefer authenticated JWT email over body email
  const jwtEmail = await getEmailFromToken(
    event.headers['authorization'] || event.headers['Authorization'],
    supabaseUrl
  );
  const rawEmail = jwtEmail || bodyEmail;

  if (!isValidEmail(rawEmail)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }) };
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase environment variables not configured');
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankdienst nicht konfiguriert.' }) };
  }

  // check_only: read status + profile without incrementing
  if (check_only) {
    try {
      const selectRes = await fetch(
        `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=quote_count,is_pro,bonus_quotes,firma,strasse,plz,ort,tel,kontakt_email,iban,bic`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (!selectRes.ok) {
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ quote_count: 0, is_pro: false, bonus_quotes: 0 }) };
      }
      const rows = await selectRes.json();
      if (!rows || rows.length === 0) {
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ quote_count: 0, is_pro: false, bonus_quotes: 0 }) };
      }
      const { quote_count, is_pro, bonus_quotes, firma, strasse, plz, ort, tel, kontakt_email, iban, bic } = rows[0];
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({
          quote_count: quote_count || 0,
          is_pro: Boolean(is_pro),
          bonus_quotes: bonus_quotes || 0,
          profile: { firma, strasse, plz, ort, tel, kontakt_email, iban, bic },
        }),
      };
    } catch (err) {
      console.error('track-quote check_only error:', err.message);
      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ quote_count: 0, is_pro: false }) };
    }
  }

  try {
    // Ensure user row exists without touching quote_count or is_pro of existing users.
    // resolution=ignore-duplicates: INSERT only if email not found; skip silently if exists.
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        quote_count: 0,
        is_pro: false,
        created_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok && upsertRes.status !== 409) {
      console.error('Supabase upsert failed:', upsertRes.status);
    }

    // Increment quote_count via SELECT then PATCH (RPC may not exist)
    const currentRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=quote_count`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const currentRows = currentRes.ok ? await currentRes.json() : [];
    const currentCount = (Array.isArray(currentRows) && currentRows[0]) ? (currentRows[0].quote_count || 0) : 0;
    await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ quote_count: currentCount + 1 }),
      }
    );

    // Read final state
    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=quote_count,is_pro`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );

    if (!selectRes.ok) {
      console.error('Supabase select failed:', selectRes.status);
      return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Fehler beim Lesen.' }) };
    }

    const rows = await selectRes.json();
    if (!rows || rows.length === 0) {
      return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Benutzer nicht gefunden.' }) };
    }

    const { quote_count, is_pro } = rows[0];
    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ quote_count, is_pro: Boolean(is_pro) }),
    };
  } catch (err) {
    console.error('track-quote error:', err.message);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Netzwerkfehler.' }) };
  }
};
