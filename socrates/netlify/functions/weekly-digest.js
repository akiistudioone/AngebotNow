/* ============================================================
   SOCRATES — WEEKLY DIGEST (Netlify Scheduled Function)
   Läuft jeden Sonntag um 20:00 UTC
   Generiert KI-Zusammenfassung der Woche pro User
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient }       = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Scheduled Functions senden POST, manueller Aufruf optional
  const isScheduled = event.headers['x-netlify-event'] === 'schedule';
  if (!isScheduled && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey           = process.env.GEMINI_API_KEY;
  const supabaseUrl      = process.env.SUPABASE_URL;
  const supabaseKey      = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: 'Konfiguration unvollständig.' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const genAI    = new GoogleGenerativeAI(apiKey);

  // Woche berechnen
  const now       = new Date();
  const weekEnd   = now.toISOString().split('T')[0];
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Alle User mit Sessions in den letzten 7 Tagen
  const { data: activeSessions, error: sessionErr } = await supabase
    .from('sessions')
    .select('user_id')
    .gte('date', weekStart)
    .eq('completed', true);

  if (sessionErr) {
    return { statusCode: 500, body: JSON.stringify({ error: sessionErr.message }) };
  }

  const userIds = [...new Set((activeSessions || []).map(s => s.user_id))];
  const results = [];

  for (const userId of userIds) {
    try {
      // Sessions dieser Woche für diesen User
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .eq('completed', true)
        .order('date', { ascending: true });

      if (!sessions || sessions.length === 0) continue;

      // Prüfen ob Digest schon existiert
      const { data: existing } = await supabase
        .from('weekly_digests')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .single();

      if (existing) continue; // Bereits generiert

      const digest = await _generateDigest(genAI, sessions, weekStart, weekEnd);

      await supabase.from('weekly_digests').insert({
        user_id:       userId,
        week_start:    weekStart,
        week_end:      weekEnd,
        session_count: sessions.length,
        summary:       digest.summary,
        key_themes:    digest.key_themes,
        growth_noted:  digest.growth_noted,
      });

      results.push({ userId, status: 'ok', sessions: sessions.length });
    } catch (err) {
      results.push({ userId, status: 'error', message: err.message });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed: results.length, results }),
  };
};

async function _generateDigest(genAI, sessions, weekStart, weekEnd) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { maxOutputTokens: 512, temperature: 0.6 },
  });

  const sessionData = sessions.map((s, i) => {
    const date  = new Date(s.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const parts = [];
    if (s.topic_answer)    parts.push(`Thema: "${s.topic_answer}"`);
    if (s.closing_insight) parts.push(`Erkenntnis: "${s.closing_insight}"`);
    if (s.aha_moment)      parts.push(`AHA: "${s.aha_moment}"`);
    return `${date}: ${parts.join(' | ')}`;
  }).join('\n');

  const prompt = `Du analysierst die Reflexions-Sessions eines Users für die Woche vom ${weekStart} bis ${weekEnd}.
Du sprichst Deutsch, duzt den User, bist warm und präzise.

Sessions dieser Woche:
${sessionData}

Antworte NUR als JSON (kein Markdown):
{
  "summary": "Eine tiefe, persönliche Zusammenfassung der Woche (3-4 Sätze, direkt an den User gerichtet, du-Form)",
  "key_themes": ["Thema 1", "Thema 2", "Thema 3"],
  "growth_noted": "Ein konkreter Wachstumsmoment oder eine bemerkenswerte Verschiebung diese Woche (1-2 Sätze)"
}`;

  const result = await model.generateContent(prompt);
  const raw    = result.response.text();

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary:      raw,
      key_themes:   [],
      growth_noted: '',
    };
  }
}
