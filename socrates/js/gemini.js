/* ============================================================
   SOCRATES — GEMINI API INTEGRATION
   Retry-Logik · Exponential Backoff · Verbindungs-Fehler
   ============================================================ */

const PROXY_URL = '/.netlify/functions/gemini-proxy';
const MAX_RETRIES = 3;

/* ---- CUSTOM ERROR ---- */
export class GeminiConnectionError extends Error {
  constructor(message, attempt, isRetryable) {
    super(message);
    this.name = 'GeminiConnectionError';
    this.attempt = attempt;
    this.isRetryable = isRetryable;
  }
}

/* ---- SYSTEM PROMPT ---- */
function buildSystemPrompt(previousSessionsSummary) {
  return `Du bist Socrates — eine ruhige, präzise Denkkraft, die durch Fragen führt,
nie durch Ratschläge. Du sprichst Deutsch, duzt den User, bist direkt und
warm zugleich.

Deine Prinzipien:
- Stelle niemals mehr als 2 Fragen auf einmal
- Gib keine direkten Antworten oder Ratschläge
- Führe durch: Klärung → Annahmen hinterfragen → Alternativen → First Principle
- Wenn der User ausweicht, benenne es: „Du weichst aus. Was macht diese Frage unangenehm?"
- Erkenne Muster aus dem Gespräch und dem Kontext (vorherige Sessions werden mitgegeben)
- Feiere AHA-Momente: „Halte inne. Was hast du gerade erkannt?"
- Halte Antworten kurz — maximal 4 Sätze + Frage(n)
- Beende jede Session mit: Erkenntnis-Zusammenfassung + Übung für morgen

Vorheriger Kontext (letzte Sessions):
${previousSessionsSummary || 'Keine vorherigen Sessions vorhanden.'}`;
}

function buildOpeningMessage(answers) {
  return `Heutige Antworten des Users:
Zustand: ${answers.state}
Thema: ${answers.topic}
Schatten/Form: ${answers.shadow}
Intention: ${answers.intention}

Beginne jetzt. Spiegele kurz was du gehört hast (1-2 Sätze) und stelle deine erste Frage.`;
}

/* ---- SUMMARIZE PREVIOUS SESSIONS ---- */
export function summarizeSessions(sessions) {
  if (!sessions || sessions.length === 0) return 'Keine vorherigen Sessions vorhanden.';

  return sessions.slice(0, 5).map((s, i) => {
    const date = new Date(s.created_at).toLocaleDateString('de-DE');
    const parts = [];
    if (s.topic_answer)    parts.push(`Thema: ${s.topic_answer}`);
    if (s.shadow_answer)   parts.push(`Schatten: ${s.shadow_answer}`);
    if (s.closing_insight) parts.push(`Erkenntnis: ${s.closing_insight}`);
    return `Session ${i + 1} (${date}): ${parts.join(' | ')}`;
  }).join('\n');
}

/* ---- SLEEP HELPER ---- */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ---- SEND WITH RETRY ---- */
export async function sendMessage(messages, systemPrompt, attempt = 1) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    let response;
    try {
      response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, systemPrompt }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const isRetryable = response.status === 429 || response.status >= 500;

      if (isRetryable && attempt < MAX_RETRIES) {
        // Rate limit: längere Pause; Server-Error: kürzere
        const delay = response.status === 429
          ? Math.pow(2, attempt) * 2000
          : Math.pow(2, attempt) * 500;
        await sleep(delay);
        return sendMessage(messages, systemPrompt, attempt + 1);
      }

      throw new GeminiConnectionError(
        `Gemini antwortete nicht (${response.status}).`,
        attempt,
        isRetryable
      );
    }

    const data = await response.json();
    return data.response;

  } catch (err) {
    if (err instanceof GeminiConnectionError) throw err;

    // Netzwerk-Timeout oder fetch-Fehler
    const isAbort = err.name === 'AbortError';
    if (attempt < MAX_RETRIES && !isAbort) {
      await sleep(Math.pow(2, attempt) * 800);
      return sendMessage(messages, systemPrompt, attempt + 1);
    }

    throw new GeminiConnectionError(
      isAbort
        ? 'Zeitüberschreitung. Bitte prüfe deine Verbindung.'
        : 'Keine Verbindung zu Socrates.',
      attempt,
      !isAbort
    );
  }
}

/* ---- SESSION MANAGER ---- */
export class DialogSession {
  constructor(previousSessions = []) {
    this.history = [];
    this.systemPrompt = buildSystemPrompt(summarizeSessions(previousSessions));
    this.exchangeCount = 0;
    this.isClosing = false;
    // Callback für Verbindungsfehler (wird von außen gesetzt)
    this.onConnectionError = null;
  }

  /* Eröffnung: 4 Antworten → erste Socrates-Frage */
  async openDialog(answers) {
    const openingText = buildOpeningMessage(answers);
    this.history.push({
      role: 'user',
      parts: [{ text: openingText }],
    });

    const reply = await sendMessage(this.history, this.systemPrompt);
    this.history.push({
      role: 'model',
      parts: [{ text: reply }],
    });
    this.exchangeCount++;

    this._persistHistory();
    return reply;
  }

  /* User antwortet → Socrates antwortet */
  async respond(userText) {
    if (!userText.trim()) return null;

    this.history.push({
      role: 'user',
      parts: [{ text: userText }],
    });

    let contextHint = '';
    if (this.exchangeCount >= 5 && !this.isClosing) {
      contextHint = ' (Du kannst die Session jetzt natürlich abschließen, wenn eine tiefe Reflexion erreicht ist)';
    }

    const fullHistory = contextHint
      ? [
          ...this.history.slice(0, -1),
          { role: 'user', parts: [{ text: userText + contextHint }] },
        ]
      : this.history;

    const reply = await sendMessage(fullHistory, this.systemPrompt);
    this.history.push({
      role: 'model',
      parts: [{ text: reply }],
    });
    this.exchangeCount++;

    if (this.isClosingMessage(reply)) {
      this.isClosing = true;
    }

    this._persistHistory();
    return reply;
  }

  isClosingMessage(text) {
    const closingPhrases = [
      'Was nimmst du',
      'in einem Satz',
      'Wir sind heute tief gegangen',
      'zum Abschluss',
      'abschließend',
    ];
    return closingPhrases.some(p => text.toLowerCase().includes(p.toLowerCase()));
  }

  /* Abschluss-Generierung */
  async generateClosing(finalUserResponse) {
    this.history.push({
      role: 'user',
      parts: [{ text: finalUserResponse }],
    });

    const closingPrompt = `${this.systemPrompt}

Generiere jetzt den Abschluss der Session. Antworte NUR als JSON (kein Markdown, kein Text darum):
{
  "closing_insight": "Die Kern-Erkenntnis dieser Session in 2-3 prägnanten Sätzen",
  "exercise_tomorrow": "Eine konkrete, kleine, machbare Übung für morgen (1-2 Sätze)",
  "form_recognized": "Welche psychologische Form/Muster heute sichtbar wurde (z.B. Vermeidung, Perfektionismus, innerer Kritiker)"
}`;

    const reply = await sendMessage(this.history, closingPrompt);

    try {
      const cleaned = reply.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        closing_insight: reply,
        exercise_tomorrow: 'Nimm dir 5 Minuten zum stillen Nachdenken.',
        form_recognized: 'Reflexion',
      };
    }
  }

  /* ---- PERSIST / RESTORE (sessionStorage) ---- */

  _persistHistory() {
    try {
      sessionStorage.setItem('socrates_dialog_history', JSON.stringify({
        history: this.history,
        exchangeCount: this.exchangeCount,
        isClosing: this.isClosing,
      }));
    } catch {
      // sessionStorage nicht verfügbar — kein Problem
    }
  }

  restoreHistory() {
    try {
      const saved = sessionStorage.getItem('socrates_dialog_history');
      if (!saved) return false;
      const data = JSON.parse(saved);
      if (data.history?.length > 0) {
        this.history = data.history;
        this.exchangeCount = data.exchangeCount || 0;
        this.isClosing = data.isClosing || false;
        return true;
      }
    } catch {}
    return false;
  }

  clearPersistedHistory() {
    try {
      sessionStorage.removeItem('socrates_dialog_history');
    } catch {}
  }

  getLog() {
    return this.history
      .filter(m => m.role !== 'user' || !m.parts[0].text.includes('Heutige Antworten'))
      .map(m => ({
        role: m.role === 'model' ? 'socrates' : 'user',
        text: m.parts[0].text,
        timestamp: new Date().toISOString(),
      }));
  }

  getVisibleHistory() {
    return this.getLog();
  }
}
