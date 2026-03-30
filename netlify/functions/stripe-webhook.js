const crypto = require('crypto');

const CORS_HEADERS = { 'Content-Type': 'application/json' };

function verifyStripeSignature(payload, signature, secret) {
  if (!signature || !secret) return false;

  const parts = {};
  signature.split(',').forEach((part) => {
    const [key, value] = part.split('=');
    parts[key] = value;
  });

  if (!parts.t || !parts.v1) return false;

  const timestampMs = parseInt(parts.t, 10) * 1000;
  const now = Date.now();
  // Reject events older than 5 minutes (replay protection)
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(parts.v1, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    return false;
  }
}

async function updateUserProStatus(email, isPro) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase not configured for webhook update');
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const res = await fetch(
    `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ is_pro: isPro }),
    }
  );

  if (!res.ok) {
    console.error('Failed to update user pro status:', res.status);
    return false;
  }
  return true;
}

async function getCustomerEmail(customerId) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return null;

  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });

  if (!res.ok) return null;
  const customer = await res.json();
  return customer.email || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const signature = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Webhook not configured' }) };
  }

  if (!verifyStripeSignature(event.body, signature, webhookSecret)) {
    console.error('Stripe signature verification failed');
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Process synchronously so Stripe retries on failure (instead of silent setImmediate loss)
  try {
    const eventType = stripeEvent.type;
    const eventObject = stripeEvent.data?.object;

    if (eventObject) {
      if (eventType === 'checkout.session.completed') {
        const customerEmail =
          eventObject.customer_email ||
          eventObject.customer_details?.email ||
          (eventObject.customer ? await getCustomerEmail(eventObject.customer) : null);

        if (customerEmail) {
          const ok = await updateUserProStatus(customerEmail, true);
          if (!ok) {
            console.error('checkout.session.completed: DB update failed for', customerEmail);
            return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'DB update failed' }) };
          }
        } else {
          console.error('checkout.session.completed: no customer email found');
          return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No customer email' }) };
        }

      } else if (eventType === 'customer.subscription.deleted') {
        const customerId = eventObject.customer;
        if (customerId) {
          const customerEmail = await getCustomerEmail(customerId);
          if (customerEmail) {
            await updateUserProStatus(customerEmail, false);
          }
        }
      }
    }
  } catch (err) {
    console.error('Stripe webhook processing error:', err.message);
    // Return 500 so Stripe retries the event
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Processing error' }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ received: true }) };
};
