/* ============================================================
   SOCRATES — SUPABASE CLIENT & AUTH
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.SOCRATES_CONFIG?.supabaseUrl || '';
const SUPABASE_ANON_KEY = window.SOCRATES_CONFIG?.supabaseAnonKey || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/* ---- AUTH HELPERS ---- */

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/socrates/app.html`,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/socrates/index.html';
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/* ---- AUTH STATE LISTENER ---- */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

/* ---- PROFILE HELPERS ---- */

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createProfile(userId, name) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, name, onboarding_done: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function ensureProfile(userId) {
  let profile = await getProfile(userId);
  if (!profile) {
    profile = await createProfile(userId, '');
  }
  return profile;
}

/* ---- SESSION HELPERS ---- */

export async function getTodaySession(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createSession(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId, date: today })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSession(sessionId, updates) {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentSessions(userId, limit = 10) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function completeSession(sessionId, closingData) {
  return updateSession(sessionId, {
    ...closingData,
    completed: true,
  });
}

/* ---- INSIGHTS HELPERS ---- */

export async function createInsight(userId, sessionId, content, formRecognized) {
  const { data, error } = await supabase
    .from('insights')
    .insert({
      user_id: userId,
      session_id: sessionId,
      content,
      form_recognized: formRecognized,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getInsights(userId) {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function toggleInsightStar(insightId, isStarred) {
  const { data, error } = await supabase
    .from('insights')
    .update({ is_starred: isStarred })
    .eq('id', insightId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ---- PATTERNS HELPERS ---- */

export async function getPatterns(userId) {
  const { data, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('user_id', userId)
    .order('detected_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function acknowledgePattern(patternId) {
  const { error } = await supabase
    .from('patterns')
    .update({ acknowledged: true })
    .eq('id', patternId);
  if (error) throw error;
}

/* ---- SESSION HISTORY FOR CALENDAR ---- */

export async function getSessionDatesInMonth(userId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;
  return (data || []).map(s => s.date);
}

/* ---- ORB ENERGY UPDATE ---- */

export async function updateOrbEnergy(userId) {
  const profile = await getProfile(userId);
  if (!profile) return;

  const today = new Date().toISOString().split('T')[0];
  const lastDate = profile.last_session_date;
  let energy = parseFloat(profile.orb_energy) || 1.0;

  if (lastDate && lastDate !== today) {
    const daysSince = Math.floor(
      (new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24)
    );
    if (daysSince >= 2) {
      const decay = Math.min((daysSince - 1) * 0.05, 0.5);
      energy = Math.max(0.05, energy - decay);
      await updateProfile(userId, { orb_energy: energy });
    }
  }

  return energy;
}

/* ---- DELETE ACCOUNT ---- */

export async function deleteAccount(userId) {
  // Delete user data (cascading deletes handle related tables)
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (error) throw error;

  // Sign out
  await supabase.auth.signOut();
}
