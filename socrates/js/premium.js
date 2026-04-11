/* ============================================================
   SOCRATES — PAYWALL & PREMIUM GATE
   Free: 3 Sessions · Premium: Alles
   ============================================================ */

const FREE_SESSION_LIMIT = 3;

/* ---- CHECKS ---- */

export function isPremium(profile) {
  return profile?.is_premium === true;
}

export function canStartNewSession(profile) {
  if (isPremium(profile)) return true;
  return (profile?.total_sessions || 0) < FREE_SESSION_LIMIT;
}

export function getRemainingFreeSessions(profile) {
  if (isPremium(profile)) return Infinity;
  return Math.max(0, FREE_SESSION_LIMIT - (profile?.total_sessions || 0));
}

export function canViewPatterns(profile) {
  return isPremium(profile);
}

export function canViewWeeklyDigest(profile) {
  return isPremium(profile);
}

/* ---- UPGRADE MODAL ---- */

const UPGRADE_BENEFITS = [
  { icon: '◎', text: 'Unbegrenzte tägliche Reflexionen' },
  { icon: '◐', text: 'Vollständige Muster-Erkennung' },
  { icon: '◇', text: 'Wöchentliche Zusammenfassung' },
  { icon: '◈', text: 'Vollständiger Sitzungsverlauf' },
  { icon: '☽', text: 'Jahresrückblick & Deep Insights' },
];

export function showUpgradeModal(reason = 'default') {
  // Entferne existierendes Modal
  document.getElementById('upgrade-modal-overlay')?.remove();

  const reasons = {
    session_limit: 'Du hast deine 3 kostenlosen Sessions genutzt.',
    patterns:      'Muster-Erkennung ist ein Premium-Feature.',
    digest:        'Wöchentliche Zusammenfassungen sind Premium.',
    default:       'Starte deine tiefere Reise.',
  };

  const overlay = document.createElement('div');
  overlay.id        = 'upgrade-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal upgrade-modal" role="dialog" aria-labelledby="upgrade-title">

      <!-- Gold-Glow oben -->
      <div style="
        position:absolute;top:-1px;left:0;right:0;height:3px;
        background:linear-gradient(90deg,transparent,var(--accent-gold),transparent);
        border-radius:4px 4px 0 0;
      "></div>

      <p class="text-upper text-muted" style="margin-bottom:var(--space-1)">Premium</p>
      <h3 class="modal-title" id="upgrade-title" style="font-size:1.6rem">
        Socrates vollständig erleben
      </h3>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin:var(--space-1) 0 var(--space-3)">
        ${reasons[reason] || reasons.default}
      </p>

      <!-- Benefits -->
      <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:var(--space-4)">
        ${UPGRADE_BENEFITS.map(b => `
          <li style="display:flex;align-items:center;gap:12px;font-size:0.9rem;color:var(--text-secondary)">
            <span style="color:var(--accent-gold);font-size:1rem;width:20px;text-align:center">${b.icon}</span>
            ${b.text}
          </li>
        `).join('')}
      </ul>

      <!-- Preis -->
      <div style="
        background:rgba(201,169,110,0.06);
        border:1px solid rgba(201,169,110,0.2);
        border-radius:var(--radius);
        padding:var(--space-2) var(--space-3);
        text-align:center;
        margin-bottom:var(--space-3);
      ">
        <p style="font-family:var(--font-display);font-size:2rem;font-weight:300;color:var(--accent-gold)">
          €4.99
          <span style="font-size:0.9rem;color:var(--text-muted);font-family:var(--font-body)">/Monat</span>
        </p>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">
          Oder €39.99 / Jahr — 33% sparen
        </p>
      </div>

      <!-- CTA -->
      <button class="btn btn-primary btn-full" id="upgrade-cta-btn">
        Jetzt upgraden
      </button>
      <button class="btn btn-subtle btn-full" id="upgrade-close-btn" style="margin-top:var(--space-1)">
        Vielleicht später
      </button>

    </div>
  `;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('open'));

  overlay.querySelector('#upgrade-cta-btn').addEventListener('click', () => {
    // Stripe Checkout URL — wird später via env var gesetzt
    const checkoutUrl = window.SOCRATES_CONFIG?.stripeCheckoutUrl;
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      // Fallback: Platzhalter-Seite
      alert('Payment-Integration folgt bald. Bitte versuche es später.');
    }
  });

  overlay.querySelector('#upgrade-close-btn').addEventListener('click', () => {
    closeUpgradeModal();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeUpgradeModal();
  });
}

export function closeUpgradeModal() {
  const overlay = document.getElementById('upgrade-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 400);
}

/* ---- FREE SESSION COUNTER BANNER ---- */
export function renderFreeSessionsBanner(profile) {
  if (isPremium(profile)) return '';
  const remaining = getRemainingFreeSessions(profile);
  if (remaining <= 0) return '';

  return `
    <div style="
      background:rgba(201,169,110,0.06);
      border:1px solid rgba(201,169,110,0.15);
      border-radius:var(--radius-sm);
      padding:10px 16px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom:var(--space-2);
      font-size:0.8rem;
    ">
      <span style="color:var(--text-muted)">
        Noch <strong style="color:var(--accent-gold)">${remaining}</strong> kostenlose Session${remaining !== 1 ? 'en' : ''}
      </span>
      <button
        onclick="import('./js/premium.js').then(m=>m.showUpgradeModal())"
        style="font-size:0.7rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent-gold);cursor:pointer;background:none;border:none;padding:0"
      >Upgrade →</button>
    </div>
  `;
}

/* ---- PREMIUM GATE OVERLAY für gesperrte Features ---- */
export function renderLockedFeature(reason = 'patterns') {
  const messages = {
    patterns: 'Muster werden sichtbar, wenn du Premium nutzt.',
    digest:   'Wöchentliche Zusammenfassungen sind ab Premium verfügbar.',
  };

  return `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:var(--space-6) var(--space-3);text-align:center;gap:var(--space-2);
    ">
      <div style="
        width:56px;height:56px;border-radius:50%;
        background:rgba(201,169,110,0.1);
        border:1px solid rgba(201,169,110,0.2);
        display:flex;align-items:center;justify-content:center;
        font-size:1.4rem;margin-bottom:var(--space-1);
      ">◈</div>
      <p style="font-family:var(--font-display);font-size:1.2rem;font-weight:300">
        Premium Feature
      </p>
      <p style="color:var(--text-muted);font-size:0.875rem;line-height:1.6;max-width:280px">
        ${messages[reason] || messages.patterns}
      </p>
      <button class="btn btn-primary btn-sm" id="unlock-btn" style="margin-top:var(--space-1)">
        Jetzt freischalten
      </button>
    </div>
  `;
}
