/* ============================================================
   SOCRATES — GEMINI PROXY (Netlify Function)
   Endpoint: /.netlify/functions/gemini-proxy
   Methode:  POST
   Headers:  Authorization: Bearer <supabase-access-token>
   Body:     { messages: [...], systemPrompt: "..." }

   Sicherheit:
   - JWT-Validierung via Supabase auth.getUser()
   - Max. 20 Requests/Tag/User (api_request_counts)
   - Input-Längen-Limits
   - CORS auf erlaubte Origins beschränkt
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient }       = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://socrates.netlify.app',
  'http://localhost:8888',
  'http://localhost:3000',
];

const MAX_REQUESTS_PER_DAY = 20;
const MAX_SYSTEM_PROMPT_LEN = 12000;
const MAX_MESSAGE_TEXT_LEN  = 6000;
const MAX_MESSAGES_IN_CTX   = 30;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(statusCode, body, origin) {
  return { statusCode, headers: corsHeaders(origin), body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Methode nicht erlaubt.' }, origin);
  }

  // ---- Env-Prüfung ----
  const geminiApiKey      = process.env.GEMINI_API_KEY;
  const supabaseUrl       = process.env.SUPABASE_URL;
  const supabaseAnonKey   = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!geminiApiKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return json(500, { error: 'Server-Konfiguration unvollständig.' }, origin);
  }

  // ---- JWT-Validierung ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return json(401, { error: 'Authentifizierung erforderlich.' }, origin);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return json(401, { error: 'Ungültiges oder abgelaufenes Token.' }, origin);
  }

  const userId = user.id;

  // ---- Rate Limiting ----
  const today = new Date().toISOString().split('T')[0];
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  const { data: counter } = await supabaseService
    .from('api_request_counts')
    .select('count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  const currentCount = counter?.count || 0;

  if (currentCount >= MAX_REQUESTS_PER_DAY) {
    return json(429, {
      error: `Tageslimit erreicht (${MAX_REQUESTS_PER_DAY} Anfragen/Tag). Morgen geht es weiter.`,
    }, origin);
  }

  // Zähler erhöhen (Upsert)
  await supabaseService
    .from('api_request_counts')
    .upsert(
      { user_id: userId, date: today, count: currentCount + 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );

  // ---- Request Body parsen & validieren ----
  let messages, systemPrompt;
  try {
    const body = JSON.parse(event.body || '{}');
    messages     = body.messages;
    systemPrompt = body.systemPrompt;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages muss ein nicht-leeres Array sein.');
    }
    if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
      throw new Error('systemPrompt muss ein nicht-leerer String sein.');
    }
    if (systemPrompt.length > MAX_SYSTEM_PROMPT_LEN) {
      throw new Error(`systemPrompt zu lang (max ${MAX_SYSTEM_PROMPT_LEN} Zeichen).`);
    }
  } catch (err) {
    return json(400, { error: `Ungültiger Request: ${err.message}` }, origin);
  }

  // ---- Nachrichten sanitizen ----
  const safeMessages = messages
    .filter(m =>
      m &&
      typeof m.role === 'string' &&
      (m.role === 'user' || m.role === 'model') &&
      Array.isArray(m.parts) &&
      m.parts.length > 0 &&
      typeof m.parts[0]?.text === 'string'
    )
    .map(m => ({
      role: m.role,
      parts: [{ text: m.parts[0].text.slice(0, MAX_MESSAGE_TEXT_LEN) }],
    }))
    .slice(-MAX_MESSAGES_IN_CTX);

  if (safeMessages.length === 0) {
    return json(400, { error: 'Keine gültigen Nachrichten.' }, origin);
  }

  // ---- Gemini API aufrufen ----
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    });

    const history     = safeMessages.slice(0, -1);
    const lastMessage = safeMessages[safeMessages.length - 1];
    const lastText    = lastMessage.parts[0].text;

    const chat = model.startChat({
      history: history.map(m => ({ role: m.role, parts: m.parts })),
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.8,
      },
    });

    const result = await chat.sendMessage(lastText);
    const responseText = result.response.text();

    return json(200, { response: responseText }, origin);

  } catch (err) {
    const status = err.status || 500;
    return json(
      status >= 400 && status < 600 ? status : 500,
      { error: err.message || 'Gemini-Fehler.' },
      origin
    );
  }
};
