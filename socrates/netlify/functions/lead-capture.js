/* ============================================================
   SOCRATES — LEAD CAPTURE (Netlify Function)
   Endpoint: /.netlify/functions/lead-capture
   Methode:  POST
   Body:     { email, name?, source?, honeypot? }

   Speichert Leads (E-Mail-Adressen) aus dem Funnel-Formular
   in die Supabase leads-Tabelle.
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Einfache E-Mail-Validierung (RFC 5321 subset)
function isValidEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Methode nicht erlaubt.' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Serverkonfiguration fehlt.' }),
    };
  }

  let email, name, source, honeypot;
  try {
    const body = JSON.parse(event.body || '{}');
    email    = String(body.email    || '').trim().toLowerCase().slice(0, 254);
    name     = String(body.name     || '').trim().slice(0, 100);
    source   = String(body.source   || 'funnel').trim().slice(0, 50);
    honeypot = body.honeypot;
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Ungültiger Request.' }),
    };
  }

  // Honeypot-Feld: Bot-Schutz
  if (honeypot) {
    // Stille 200-Antwort für Bots
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true }),
    };
  }

  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' }),
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('leads')
      .upsert(
        { email, name: name || null, source },
        { onConflict: 'email', ignoreDuplicates: false }
      );

    if (error) {
      // Duplizierter Eintrag ist kein Fehler für den User
      if (error.code === '23505') {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, message: 'Bereits registriert.' }),
        };
      }
      throw error;
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, message: 'Erfolgreich gespeichert.' }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Interner Fehler. Bitte versuche es erneut.' }),
    };
  }
};
