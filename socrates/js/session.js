/* ============================================================
   SOCRATES — REFLEXIONS-SESSION LOGIK
   Phase 1 (Fragen) · Phase 2 (Dialog) · Abschluss
   Resume-Logik für unterbrochene Sessions
   ============================================================ */

import {
  getCurrentUser,
  getTodaySession,
  createSession,
  updateSession,
  updateProfile,
  completeSession,
  createInsight,
  getRecentSessions,
  getProfile,
  getAccessToken,
} from './supabase.js';
import { DialogSession } from './gemini.js';
import { calculateNewEnergy } from './orb.js';
import { navigate } from './router.js';

const QUESTIONS = [
  {
    text: 'Wie bist du heute wirklich hier? Körper, Kopf, Energie — ein ehrliches Wort.',
    key: 'state_answer',
  },
  {
    text: 'Was beschäftigt dich heute am stärksten?',
    key: 'topic_answer',
  },
  {
    text: 'Was davon ist die Erscheinung — und was ahnst du dahinter?',
    key: 'shadow_answer',
  },
  {
    text: 'Was möchtest du heute erkennen, klären oder loslassen?',
    key: 'intention_answer',
  },
];

export class ReflectionManager {
  constructor() {
    this.user = null;
    this.session = null;
    this.answers = {};
    this.currentQuestion = 0;
    this.phase = 'questions';
    this.dialogSession = null;
    this.startTime = null;
    this.isResuming = false;
    this.resumePhase = null;
  }

  /* ---- INIT: Erkennt und verwaltet Resume-State ---- */
  async init() {
    this.user = await getCurrentUser();
    if (!this.user) {
      navigate('landing');
      return { ok: false };
    }

    this.session = await getTodaySession(this.user.id);

    // Abgeschlossene Session → zurück zur App
    if (this.session?.completed) {
      navigate('app');
      return { ok: false };
    }

    // Bestehende, unvollständige Session → Resume
    if (this.session) {
      this.isResuming = true;
      this.resumePhase = this._detectResumePhase(this.session);
      this._restoreAnswers(this.session);
    } else {
      // Neue Session anlegen
      this.session = await createSession(this.user.id);
    }

    this.startTime = Date.now();
    return { ok: true, isResuming: this.isResuming, resumePhase: this.resumePhase };
  }

  /* Wo war der User? */
  _detectResumePhase(session) {
    // Dialog war bereits gestartet
    if (session.dialogue_log?.length > 0) return 'dialog';
    // Alle 4 Antworten vorhanden
    if (session.intention_answer) return 'dialog_start';
    // Teilweise beantwortet
    if (session.shadow_answer)  return 'q3'; // war bei Frage 4
    if (session.topic_answer)   return 'q2'; // war bei Frage 3
    if (session.state_answer)   return 'q1'; // war bei Frage 2
    return 'q0'; // neu
  }

  _restoreAnswers(session) {
    this.answers = {
      state_answer:     session.state_answer     || '',
      topic_answer:     session.topic_answer     || '',
      shadow_answer:    session.shadow_answer    || '',
      intention_answer: session.intention_answer || '',
    };

    // currentQuestion auf letzter unbeantworteter setzen
    const map = { q0: 0, q1: 1, q2: 2, q3: 3 };
    this.currentQuestion = map[this.resumePhase] ?? 0;
  }

  /* Welche Frage ist die erste noch nicht beantwortete? */
  getResumeQuestionIndex() {
    if (!this.isResuming) return 0;
    const map = { q0: 0, q1: 1, q2: 2, q3: 3 };
    return map[this.resumePhase] ?? 0;
  }

  /* ---- PHASE 1: FRAGEN ---- */

  getQuestion(index) {
    return QUESTIONS[index] || null;
  }

  getTotalQuestions() {
    return QUESTIONS.length;
  }

  async saveAnswer(questionIndex, answer) {
    const q = QUESTIONS[questionIndex];
    if (!q) return;
    this.answers[q.key] = answer;
    await updateSession(this.session.id, { [q.key]: answer });
  }

  isLastQuestion() {
    return this.currentQuestion === QUESTIONS.length - 1;
  }

  /* ---- PHASE 2: DIALOG ---- */

  async startDialog(previousSessions) {
    this.phase = 'dialog';
    this.dialogSession = new DialogSession(previousSessions);

    // Versuche gespeicherte History wiederherzustellen (Resume nach Absturz)
    const restored = this.dialogSession.restoreHistory();

    if (restored) {
      // History aus sessionStorage vorhanden — kein neuer API-Call nötig
      return null;
    }

    const openingReply = await this.dialogSession.openDialog({
      state:     this.answers.state_answer     || '',
      topic:     this.answers.topic_answer     || '',
      shadow:    this.answers.shadow_answer    || '',
      intention: this.answers.intention_answer || '',
    });

    return openingReply;
  }

  /* Dialog aus gespeicherter History neu aufbauen (nach Reconnect) */
  getRestoredDialogLog() {
    return this.dialogSession?.getVisibleHistory() || [];
  }

  async sendUserMessage(text) {
    if (!this.dialogSession) return null;
    const reply = await this.dialogSession.respond(text);
    await updateSession(this.session.id, {
      dialogue_log: this.dialogSession.getLog(),
    });
    return reply;
  }

  isReadyToClose() {
    return this.dialogSession?.exchangeCount >= 5;
  }

  isClosingTriggered() {
    return this.dialogSession?.isClosing || false;
  }

  /* ---- AHA MOMENT ---- */

  async markAhaMoment(content) {
    const insight = await createInsight(this.user.id, this.session.id, content, null);
    await updateSession(this.session.id, { aha_moment: content });
    return insight;
  }

  /* ---- PHASE 3: ABSCHLUSS ---- */

  async finishSession(finalUserResponse) {
    this.phase = 'closing';

    const closing = await this.dialogSession.generateClosing(finalUserResponse);
    const durationSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    await completeSession(this.session.id, {
      closing_insight:   closing.closing_insight,
      exercise_tomorrow: closing.exercise_tomorrow,
      daily_quote:       closing.daily_quote || null,
      dialogue_log:      this.dialogSession.getLog(),
      completed:         true,
      duration_seconds:  durationSeconds,
    });

    if (closing.closing_insight) {
      await createInsight(
        this.user.id, this.session.id,
        closing.closing_insight, closing.form_recognized
      );
    }

    this.dialogSession.clearPersistedHistory();

    const profileUpdate = await this._updateProfileAfterSession();
    await this._triggerPatternAnalysis();

    return { ...closing, ...profileUpdate };
  }

  async _updateProfileAfterSession() {
    const today  = new Date().toISOString().split('T')[0];
    const profile = await getProfile(this.user.id);

    const lastDate = profile?.last_session_date;
    let streak = profile?.streak_count || 0;

    if (lastDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      streak = (lastDate === yStr || lastDate === today) ? streak + 1 : 1;
    } else {
      streak = 1;
    }

    const currentEnergy = parseFloat(profile?.orb_energy) || 1.0;
    const newEnergy     = calculateNewEnergy(currentEnergy, 'session_complete');

    await updateProfile(this.user.id, {
      last_session_date: today,
      streak_count:      streak,
      orb_energy:        newEnergy,
      total_sessions:    (profile?.total_sessions || 0) + 1,
    });

    return { streak, newEnergy };
  }

  async _triggerPatternAnalysis() {
    const profile       = await getProfile(this.user.id);
    const totalSessions = profile?.total_sessions || 0;

    if (totalSessions > 0 && totalSessions % 5 === 0) {
      const sessions = await getRecentSessions(this.user.id, 10);
      if (sessions.length >= 3) {
        const token = await getAccessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch('/.netlify/functions/insights-engine', {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId: this.user.id, sessions }),
        }).catch(() => {});
      }
    }
  }
}

/* ---- SESSION STATUS FÜR app.html ---- */
export async function getTodaySessionStatus(userId) {
  const session = await getTodaySession(userId);
  if (!session) return { status: 'none' };
  if (session.completed) return { status: 'done', session };

  // Berechne Fortschritt der unterbrochenen Session
  const answeredCount = [
    session.state_answer,
    session.topic_answer,
    session.shadow_answer,
    session.intention_answer,
  ].filter(Boolean).length;

  const hasDialog = session.dialogue_log?.length > 0;

  return {
    status: 'incomplete',
    session,
    answeredCount,
    hasDialog,
    progressPercent: hasDialog ? 70 : (answeredCount / 4) * 50,
  };
}

export async function loadRecentSessions(userId) {
  return getRecentSessions(userId, 5);
}
