const ALLOWED_ORIGINS = new Set([
  'https://angebot-now.de',
  'https://angebotnow.netlify.app',
]);

function getCorsOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://angebot-now.de';
}

// Shared in-memory rate limiter (per function instance)
// For production scale, replace with Upstash Redis
const requestCounts = new Map();

/**
 * Simple rate limiter: max 10 requests per IP per minute.
 * Returns true if request is allowed, false if rate limit exceeded.
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;

  const key = `${ip}:${Math.floor(now / windowMs)}`;
  const current = requestCounts.get(key) || 0;

  // Clean up old keys (keep map small)
  if (requestCounts.size > 10000) {
    const cutoff = Math.floor(now / windowMs) - 2;
    for (const [k] of requestCounts) {
      const [, windowKey] = k.split(':');
      if (parseInt(windowKey, 10) < cutoff) requestCounts.delete(k);
    }
  }

  if (current >= maxRequests) return false;

  requestCounts.set(key, current + 1);
  return true;
}

function getClientIp(event) {
  return (
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['x-real-ip'] ||
    event.headers['client-ip'] ||
    'unknown'
  );
}

function rateLimitResponse(event) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': '60',
      'Access-Control-Allow-Origin': getCorsOrigin(event),
    },
    body: JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }),
  };
}

module.exports = { checkRateLimit, getClientIp, rateLimitResponse, getCorsOrigin };
