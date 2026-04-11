/* ============================================================
   SOCRATES — PUSH NOTIFY (Netlify Scheduled Function)
   Läuft stündlich — sendet Erinnerung zur gesetzten Reflexionszeit
   Cron: "0 * * * *" (jede volle Stunde UTC)
   ============================================================ */

const webpush    = require('web-push');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@socrates.app';
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!vapidPublic || !vapidPrivate || !supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: 'Konfiguration unvollständig.' };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Aktuelle Stunde UTC
  const nowHourUTC = new Date().getUTCHours();

  // Stunden-Map (UTC) für Reflexionszeiten
  // Vereinfachung: Morgen=6, Mittag=11, Abend=19
  const timeToHour = { morgen: 6, mittag: 11, abend: 19 };

  const matchingTimes = Object.entries(timeToHour)
    .filter(([, h]) => h === nowHourUTC)
    .map(([time]) => time);

  if (matchingTimes.length === 0) {
    return { statusCode: 200, body: 'Keine Erinnerungen für diese Stunde.' };
  }

  const today = new Date().toISOString().split('T')[0];

  // User finden: passende Reflexionszeit + noch keine Session heute
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, reflection_time')
    .in('reflection_time', matchingTimes)
    .eq('onboarding_done', true);

  if (!profiles?.length) {
    return { statusCode: 200, body: 'Keine User für diese Stunde.' };
  }

  // Prüfen wer heute noch keine Session hat
  const { data: todaySessions } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('date', today)
    .eq('completed', true);

  const completedUserIds = new Set((todaySessions || []).map(s => s.user_id));
  const toNotify = profiles.filter(p => !completedUserIds.has(p.id));

  if (!toNotify.length) {
    return { statusCode: 200, body: 'Alle User haben heute bereits reflektiert.' };
  }

  // Push-Subscriptions laden
  const userIds = toNotify.map(p => p.id);
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds)
    .eq('is_active', true);

  if (!subscriptions?.length) {
    return { statusCode: 200, body: 'Keine aktiven Subscriptions.' };
  }

  const results = [];

  for (const sub of subscriptions) {
    const profile = toNotify.find(p => p.id === sub.user_id);
    const name    = profile?.name ? `, ${profile.name}` : '';
    const greetings = {
      morgen: `Guten Morgen${name}. Dein Orb wartet.`,
      mittag: `Kurze Pause${name}? Drei Minuten Reflexion.`,
      abend:  `Guter Abend${name}. Wie war dein Tag wirklich?`,
    };
    const body = greetings[profile?.reflection_time] || 'Zeit für deine tägliche Reflexion.';

    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    const payload = JSON.stringify({
      title: 'Socrates',
      body,
      url: '/socrates/reflection.html',
    });

    try {
      await webpush.sendNotification(pushSub, payload);
      results.push({ userId: sub.user_id, status: 'sent' });
    } catch (err) {
      // Subscription abgelaufen → deaktivieren
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', sub.id);
      }
      results.push({ userId: sub.user_id, status: 'failed', code: err.statusCode });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sent: results.filter(r => r.status === 'sent').length, results }),
  };
};
