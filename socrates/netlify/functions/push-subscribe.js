/* ============================================================
   SOCRATES — PUSH SUBSCRIPTION MANAGEMENT
   POST: Subscription speichern
   DELETE: Subscription deaktivieren
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: 'Konfiguration fehlt.' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Ungültiger JSON-Body.' };
  }

  /* ---- POST: Subscription speichern / aktualisieren ---- */
  if (event.httpMethod === 'POST') {
    const { userId, subscription } = body;
    if (!userId || !subscription?.endpoint) {
      return { statusCode: 400, body: 'userId und subscription erforderlich.' };
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id:   userId,
        endpoint:  subscription.endpoint,
        p256dh:    subscription.keys?.p256dh || '',
        auth:      subscription.keys?.auth   || '',
        is_active: true,
      }, { onConflict: 'user_id,endpoint' });

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  /* ---- DELETE: Subscription deaktivieren ---- */
  if (event.httpMethod === 'DELETE') {
    const { userId, endpoint } = body;
    if (!userId || !endpoint) {
      return { statusCode: 400, body: 'userId und endpoint erforderlich.' };
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
