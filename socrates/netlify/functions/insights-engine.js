/* ============================================================
   SOCRATES — INSIGHTS ENGINE (Netlify Function)
   Endpoint: /.netlify/functions/insights-engine
   Methode:  POST
   Headers:  Authorization: Bearer <supabase-access-token>
   Body:     { userId: "...", sessions: [...] }

   Analysiert Sessions mit Gemini und speichert Muster.
   JWT-gesichert — nur authentifizierte User können triggern.
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient }       = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const geminiApiKey      = process.env.GEMINI_API_KEY;
  const supabaseUrl       = process.env.SUPABASE_URL;
  const supabaseAnonKey   = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!geminiApiKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Konfiguration unvollständig.' }),
    };
  }

  // ---- JWT-Validierung ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authentifizierung erforderlich.' }) };
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Ungültiges Token.' }) };
  }

  // ---- Body parsen & userId abgleichen ----
  let userId, sessions;
  try {
    const body = JSON.parse(event.body || '{}');
    userId   = body.userId;
    sessions = body.sessions;

    // Sicherheitscheck: User darf nur eigene Sessions analysieren
    if (userId !== user.id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Zugriff verweigert.' }) };
    }

    if (!userId || !Array.isArray(sessions) || sessions.length < 3) {
      throw new Error('userId und mind. 3 Sessions erforderlich.');
    }
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  // Session-Daten für Gemini aufbereiten
  const sessionSummaries = sessions.slice(0, 10).map((s, i) => {
    const date = new Date(s.created_at).toLocaleDateString('de-DE');
    const parts = [];
    if (s.state_answer)    parts.push(`Zustand: "${String(s.state_answer).slice(0, 300)}"`);
    if (s.topic_answer)    parts.push(`Thema: "${String(s.topic_answer).slice(0, 300)}"`);
    if (s.shadow_answer)   parts.push(`Schatten: "${String(s.shadow_answer).slice(0, 300)}"`);
    if (s.intention_answer) parts.push(`Intention: "${String(s.intention_answer).slice(0, 300)}"`);
    if (s.closing_insight) parts.push(`Erkenntnis: "${String(s.closing_insight).slice(0, 300)}"`);
    if (s.aha_moment)      parts.push(`AHA: "${String(s.aha_moment).slice(0, 200)}"`);
    return `Session ${i + 1} (${date}):\n${parts.join('\n')}`;
  }).join('\n\n---\n\n');

  const prompt = `Analysiere diese ${Math.min(sessions.length, 10)} Reflexions-Sessions eines Users.
Erkenne wiederkehrende Muster in seinen Themen, Schatten, Ausweichbewegungen und Erkenntnissen.

${sessionSummaries}

Antworte NUR als JSON (kein Markdown, kein erklärender Text davor oder danach):
{
  "patterns": [
    {
      "type": "Bezeichnung des Musters (z.B. Vermeidung, Perfektionismus, innerer Kritiker)",
      "description": "Kurze Beschreibung in 2-3 Sätzen, direkt an den User gerichtet",
      "evidence": "Konkrete Belege aus den Sessions (1-2 Sätze)",
      "frequency": "wie oft und in welchem Zusammenhang gesehen"
    }
  ]
}

Erkenne 1-3 Muster. Nur echte, belegbare Muster — keine Vermutungen.`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Ungültige Gemini-Antwort.', raw }) };
    }

    if (!Array.isArray(parsed.patterns) || parsed.patterns.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: 'Keine Muster erkannt.', patterns: [] }) };
    }

    const supabase   = createClient(supabaseUrl, supabaseServiceKey);
    const sessionIds = sessions.map(s => s.id);

    for (const p of parsed.patterns) {
      const patternType = String(p.type || 'Unbekannt').slice(0, 100);
      const description = String(p.description || '').slice(0, 1000);

      const { data: existing } = await supabase
        .from('patterns')
        .select('id, times_seen')
        .eq('user_id', userId)
        .eq('pattern_type', patternType)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('patterns')
          .update({ times_seen: existing.times_seen + 1, description, session_ids: sessionIds, acknowledged: false })
          .eq('id', existing.id);
      } else {
        await supabase.from('patterns').insert({
          user_id: userId,
          pattern_type: patternType,
          description,
          session_ids: sessionIds,
          times_seen: 1,
          acknowledged: false,
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `${parsed.patterns.length} Muster erkannt.`, patterns: parsed.patterns }),
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
