/* ============================================================
   SOCRATES — WEB PUSH NOTIFICATIONS
   Service Worker Registration · Subscription Management
   ============================================================ */

const SW_PATH      = '/socrates/sw.js';
const SUBSCRIBE_URL = '/.netlify/functions/push-subscribe';

/* ---- SERVICE WORKER REGISTRIERUNG ---- */

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/socrates/' });
    return reg;
  } catch {
    return null;
  }
}

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.getRegistration(SW_PATH);
  } catch {
    return null;
  }
}

/* ---- PERMISSION ---- */

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  const result = await Notification.requestPermission();
  return result;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/* ---- PUSH SUBSCRIPTION ---- */

export async function subscribeToPush(userId) {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(`Benachrichtigungen nicht erlaubt: ${permission}`);
  }

  const reg = await getServiceWorkerRegistration()
    || await registerServiceWorker();
  if (!reg) throw new Error('Service Worker nicht verfügbar.');

  // Bestehende Subscription prüfen
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const vapidKey = window.SOCRATES_CONFIG?.vapidPublicKey;
    if (!vapidKey) throw new Error('VAPID Key fehlt.');

    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(vapidKey),
    });
  }

  // Subscription in Supabase speichern via Netlify Function
  await fetch(SUBSCRIBE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      subscription: subscription.toJSON(),
    }),
  });

  return subscription;
}

export async function unsubscribeFromPush(userId) {
  const reg = await getServiceWorkerRegistration();
  if (!reg) return;

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  await subscription.unsubscribe();

  // In Supabase deaktivieren
  await fetch(SUBSCRIBE_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
  });
}

export async function isPushSubscribed() {
  const reg = await getServiceWorkerRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/* ---- HELPER: VAPID Key konvertieren ---- */

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
