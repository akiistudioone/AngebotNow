// Shared rate limiter and CORS helpers for Netlify Functions
//
// NOTE: This in-memory store works per function instance.
// For distributed/high-traffic production, upgrade to Upstash Redis:
// https://upstash.com/docs/redis/quickstarts/netlify-functions
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.

const { getCorsOrigin } = require('./utils');

const requestCounts = new Map();

/**
 * Check rate limit for an IP address.
 * @param {string} ip
 * @param {number} maxRequests - max requests per minute (default 10, use 3 for sensitive endpoints)
 */
function checkRateLimit(ip, maxRequests = 10) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute sliding window
  const key = `${ip}:${Math.floor(now / windowMs)}`;
  const current = requestCounts.get(key) || 0;

  // Clean up stale keys to keep memory bounded
  if (requestCounts.size > 5000) {
    const cutoff = Math.floor(now / windowMs) - 2;
    for (const [k] of requestCounts) {
      const windowKey = k.split(':').pop();
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
