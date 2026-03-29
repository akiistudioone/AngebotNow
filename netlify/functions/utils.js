// Shared utilities for Netlify Functions
// Single source of truth for validation, CORS, and sanitization

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://angebotgo.de';

// Also accept the Netlify preview domain during development
const EXTRA_ORIGINS = new Set([
  ALLOWED_ORIGIN,
  process.env.NETLIFY_PREVIEW_ORIGIN || '',
  'https://angebotgo.netlify.app',
].filter(Boolean));

function getCorsOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return EXTRA_ORIGINS.has(origin) ? origin : ALLOWED_ORIGIN;
}

function getCorsHeaders(event, methods = 'POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(event),
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
    .slice(0, maxLen);
}

module.exports = { getCorsOrigin, getCorsHeaders, isValidEmail, sanitizeString };
