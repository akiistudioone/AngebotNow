const { checkRateLimit, getClientIp, rateLimitResponse } = require('./rate-limit');
const { getCorsHeaders, isValidEmail } = require('./utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Methode nicht erlaubt.' }) };
  }

  // Stricter rate limit for promo redemption (5/min per IP) to prevent brute-force
  const ip = getClientIp(event);
  if (!checkRateLimit(ip, 5)) return rateLimitResponse(event);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiges JSON.' }) };
  }

  const { code, email } = body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Promo-Code fehlt.' }) };
  }
  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase env vars not configured');
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankverbindung nicht konfiguriert.' }) };
  }

  const safeCode = code.trim().toUpperCase().slice(0, 64);
  const normalizedEmail = email.trim().toLowerCase();

  // Look up promo code
  let codeData;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(safeCode)}&select=code,is_active,uses_count,max_uses,extra_quotes`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiger oder abgelaufener Code.' }) };
    }
    codeData = rows[0];
  } catch (err) {
    console.error('promo_codes lookup error:', err.message);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankfehler.' }) };
  }

  if (!codeData.is_active || codeData.uses_count >= codeData.max_uses) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiger oder abgelaufener Code.' }) };
  }

  // Atomic increment: only update if uses_count is still below max_uses.
  // The filter `uses_count=lt.max_uses` prevents race conditions — if two requests
  // arrive simultaneously, only one will match and update; the other gets 0 rows back.
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(safeCode)}&uses_count=lt.${codeData.max_uses}&is_active=eq.true`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ uses_count: codeData.uses_count + 1 }),
      }
    );

    const updated = await patchRes.json().catch(() => []);
    if (!Array.isArray(updated) || updated.length === 0) {
      // Another request got there first or code is now exhausted
      return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Ungültiger oder abgelaufener Code.' }) };
    }
  } catch (err) {
    console.error('promo uses_count increment error:', err.message);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Datenbankfehler beim Einlösen.' }) };
  }

  // Find user, enforce one-code-per-user, then credit bonus_quotes
  try {
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=email,bonus_quotes,redeemed_codes`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const users = await userRes.json();
    if (Array.isArray(users) && users.length > 0) {
      const user = users[0];

      // Check if user already redeemed this specific code
      const redeemed = (user.redeemed_codes || '').split(',').map(s => s.trim()).filter(Boolean);
      if (redeemed.includes(safeCode)) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: 'Du hast diesen Code bereits eingelöst.' }) };
      }

      // Increase bonus_quotes and record redeemed code
      const newBonusQuotes = (user.bonus_quotes || 0) + codeData.extra_quotes;
      const newRedeemed = [...redeemed, safeCode].join(',');
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ bonus_quotes: newBonusQuotes, redeemed_codes: newRedeemed }),
        }
      );
    }
  } catch (err) {
    console.error('user quote credit error:', err.message);
    // Non-fatal: code was already claimed, still report success
  }

  return {
    statusCode: 200,
    headers: getCorsHeaders(event),
    body: JSON.stringify({ success: true, extra_quotes: codeData.extra_quotes }),
  };
};
