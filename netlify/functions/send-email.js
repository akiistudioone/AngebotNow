const { checkRateLimit, getClientIp, rateLimitResponse } = require('./rate-limit');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://angebot-now.de',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
    .slice(0, 500);
}

function validateInput({ to, cc, subject, pdfBase64, filename }) {
  if (!to || !isValidEmail(to)) return 'Ungültige Empfänger-E-Mail-Adresse.';
  if (cc && !isValidEmail(cc)) return 'Ungültige CC-E-Mail-Adresse.';
  if (!subject || subject.trim().length === 0) return 'Betreff fehlt.';
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return 'PDF fehlt.';
  if (!filename || typeof filename !== 'string') return 'Dateiname fehlt.';

  // Check base64 size: base64 encodes 3 bytes as 4 chars → 5MB = 5*1024*1024 bytes
  const maxBase64Length = Math.ceil((5 * 1024 * 1024) / 3) * 4;
  if (pdfBase64.length > maxBase64Length) return 'PDF zu groß (max. 5MB).';

  // Validate it's actually base64
  if (!/^[A-Za-z0-9+/]+=*$/.test(pdfBase64.replace(/\s/g, ''))) {
    return 'Ungültiges PDF-Format.';
  }

  return null;
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

  const { to, cc, subject, pdfBase64, filename, bodyText } = body;

  const validationError = validateInput({ to, cc, subject, pdfBase64, filename });
  if (validationError) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: validationError }) };
  }

  const safeSubject = sanitizeString(subject);
  const safeFilename = sanitizeString(filename).replace(/[^a-zA-Z0-9\-_.]/g, '_') + '.pdf';
  const safeBodyText = sanitizeString(bodyText || '');

  const emailPayload = {
    from: 'AngebotNow <noreply@angebot-now.de>',
    to: [to],
    subject: safeSubject,
    reply_to: cc || undefined,
    html: buildEmailHtml(safeBodyText, safeSubject),
    attachments: [
      {
        filename: safeFilename,
        content: pdfBase64,
      },
    ],
  };

  if (cc && isValidEmail(cc)) {
    emailPayload.cc = [cc];
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'E-Mail-Dienst nicht konfiguriert.' }) };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Resend API error:', response.status, errData.name || '');
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden. Bitte erneut versuchen.' }),
      };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('send-email network error:', err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Netzwerkfehler beim Senden der E-Mail.' }),
    };
  }
};

function buildEmailHtml(bodyText, subject) {
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#6366F1;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600">AngebotNow</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#111827;font-size:15px;line-height:1.6;margin:0 0 16px">${escaped}</p>
      <p style="color:#6B7280;font-size:13px;margin:24px 0 0">Das Angebot finden Sie im Anhang dieser E-Mail als PDF-Datei.</p>
    </div>
    <div style="background:#F8F9FF;padding:16px 32px;border-top:1px solid #E5E7EB">
      <p style="color:#9CA3AF;font-size:11px;margin:0;text-align:center">
        Erstellt mit <a href="https://angebot-now.de" style="color:#6366F1;text-decoration:none">AngebotNow.de</a> — DSGVO-konform, Server in der EU
      </p>
    </div>
  </div>
</body>
</html>`;
}
