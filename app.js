
// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
// Replace these values with your Supabase project URL and anon key
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const _sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ─── STATE ──────────────────────────────────────────────────────────────────
const state = {
  email: '',
  isPro: false,
  quoteCount: 0,
  bonusQuotes: 0,
  vatRate: 19,
  positions: [],
  previewTimer: null,
  accessToken: null,
};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const FREE_LIMIT = 5;
const FEATURES = [
  'Unbegrenzte Angebote',
  'Kein Wasserzeichen',
  'Logo hochladen',
  'E-Mail direkt versenden',
  'Angebots-Vorlagen',
  'DSGVO-konform',
  'E-Mail Support',
  'Vorschau & PDF-Download',
];


// ─── CUSTOM ALERT MODAL ───────────────────────────────────────────────────────
function showAlert(msg, title) {
  const el = document.getElementById('modal-alert');
  const msgEl = document.getElementById('modal-alert-msg');
  const titleEl = document.getElementById('modal-alert-title');
  if (!el) { window.alert(msg); return; }
  if (titleEl) titleEl.textContent = title || 'Hinweis';
  if (msgEl) msgEl.textContent = msg;
  el.style.display = 'flex';
}
function closeAlert() {
  const el = document.getElementById('modal-alert');
  if (el) el.style.display = 'none';
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmtEur(num) {
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function parseNum(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function sanitizeDisplay(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validatePlz(id) {
  const el = document.getElementById(id);
  const err = document.getElementById(id + '-err');
  if (!err) return;
  const val = el.value.trim();
  const invalid = val.length > 0 && !/^\d{5}$/.test(val);
  err.style.display = invalid ? 'block' : 'none';
  el.style.borderColor = invalid ? 'var(--danger)' : '';
}

function validateEmailField(id) {
  const el = document.getElementById(id);
  const err = document.getElementById(id + '-err');
  if (!err) return;
  const val = el.value.trim();
  const invalid = val.length > 0 && !isValidEmail(val);
  err.style.display = invalid ? 'block' : 'none';
  el.style.borderColor = invalid ? 'var(--danger)' : '';
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  const err = document.getElementById(id + '-err');
  if (!err) return;
  const val = el.value.trim();
  const isPlz = id.includes('plz');
  const isEmail = id.includes('email');
  const ok = isPlz ? (!val || /^\d{5}$/.test(val)) : isEmail ? (!val || isValidEmail(val)) : true;
  if (ok) { err.style.display = 'none'; el.style.borderColor = ''; }
}

function toggleSendBtn() {
  const btn = document.getElementById('send-btn');
  const checked = document.getElementById('agb-check').checked;
  btn.disabled = !checked;
  btn.style.opacity = checked ? '1' : '0.5';
  btn.style.cursor = checked ? 'pointer' : 'not-allowed';
}

function toggleRegBtn() {
  const btn = document.getElementById('auth-reg-btn');
  const checked = document.getElementById('auth-reg-agb').checked;
  btn.disabled = !checked;
  btn.style.opacity = checked ? '1' : '0.5';
  btn.style.cursor = checked ? 'pointer' : 'not-allowed';
}

function toggleZahlungCustom(val) {
  const el = document.getElementById('q-zahlung-custom');
  if (el) el.style.display = val === 'individuell' ? 'block' : 'none';
}

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

function getDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateDE(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}.${m}.${y}`;
}

function genQuoteNumber() {
  const year = new Date().getFullYear();
  const count = (state.quoteCount || 0) + 1;
  return `AN-${year}-${String(count).padStart(3, '0')}`;
}

function getFormData() {
  return {
    sFirma: document.getElementById('s-firma').value.trim(),
    sStrasse: document.getElementById('s-strasse').value.trim(),
    sPlz: document.getElementById('s-plz').value.trim(),
    sOrt: document.getElementById('s-ort').value.trim(),
    sTel: document.getElementById('s-tel').value.trim(),
    sEmail: document.getElementById('s-email').value.trim(),
    rName: document.getElementById('r-name').value.trim(),
    rStrasse: document.getElementById('r-strasse').value.trim(),
    rPlz: document.getElementById('r-plz').value.trim(),
    rOrt: document.getElementById('r-ort').value.trim(),
    rEmail: document.getElementById('r-email').value.trim(),
    qNummer: document.getElementById('q-nummer').value.trim(),
    qDatum: document.getElementById('q-datum').value,
    qGueltig: document.getElementById('q-gueltig').value,
    qZahlung: (function(){ const v = document.getElementById('q-zahlung').value; return v === 'individuell' ? (document.getElementById('q-zahlung-custom').value.trim() || 'Individuell') : v; })(),
    qAnmerkung: document.getElementById('q-anmerkung').value.trim(),
    sIban: (document.getElementById('s-iban') || {value:''}).value.trim(),
    sBic: (document.getElementById('s-bic') || {value:''}).value.trim(),
  };
}

// ─── COUNTER ─────────────────────────────────────────────────────────────────
function updateCounter() {
  const count = state.quoteCount;
  const pill = document.getElementById('quote-counter-pill');
  const text = document.getElementById('counter-text');
  const bar = document.getElementById('counter-bar');

  const effectiveLimit = FREE_LIMIT + state.bonusQuotes;
  text.textContent = state.isPro ? '∞ Pro' : `${count} / ${effectiveLimit} kostenlos`;
  const pct = state.isPro ? 100 : Math.min((count / effectiveLimit) * 100, 100);
  bar.style.width = pct + '%';

  pill.className = 'pill';
  if (state.isPro) {
    pill.classList.add('pill-primary');
    bar.style.background = 'var(--primary)';
  } else if (count >= effectiveLimit) {
    pill.classList.add('pill-danger');
    bar.style.background = 'var(--danger)';
  } else if (count >= effectiveLimit - 1) {
    pill.classList.add('pill-warning');
    bar.style.background = 'var(--warning)';
  } else {
    pill.classList.add('pill-primary');
    bar.style.background = 'var(--primary)';
  }
  // Pulse animation
  pill.style.animation = 'none';
  void pill.offsetWidth;
  pill.style.animation = 'pulse 0.4s ease';
}

function applyProStatus() {
  state.isPro = true;
  const upgradeBtn = document.getElementById('upgrade-btn');
  if (upgradeBtn) upgradeBtn.style.display = 'none';
  updateCounter();
  updateUserMenu();
  schedulePreview();
}

async function openPortal() {
  if (!state.email) { showToast('Bitte zuerst einloggen.'); return; }
  toggleUserMenu(false);
  showToast('Lädt…');
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
    const res = await fetch('/.netlify/functions/create-portal-session', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: state.email }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast(data.error || 'Portal konnte nicht geöffnet werden.');
    }
  } catch {
    showToast('Netzwerkfehler. Bitte erneut versuchen.');
  }
}

// ─── POSITIONS ───────────────────────────────────────────────────────────────
let posIdCounter = 0;

function addPosition(desc = '', qty = 1, unit = 'Stk.', ep = 0) {
  const id = ++posIdCounter;
  state.positions.push({ id, desc, qty, unit, ep });
  renderPositions();
  schedulePreview();
}

function removePosition(id) {
  state.positions = state.positions.filter(p => p.id !== id);
  renderPositions();
  updateTotals();
  schedulePreview();
}

const UNITS = ['pausch.', 'Stk.', 'Std.', 'm²', 'm', 'kg', 'pauschal', 'lfm', 'm³', 't', 'l', 'Set'];
function buildUnitSelect(posId, currentUnit) {
  const opts = UNITS.map(u => `<option value="${u}"${u === currentUnit ? ' selected' : ''}>${u}</option>`).join('');
  // Also add currentUnit if not in the list so existing data is preserved
  const extra = currentUnit && !UNITS.includes(currentUnit)
    ? `<option value="${currentUnit}" selected>${currentUnit}</option>` : '';
  return `<select onchange="updatePos(${posId},'unit',this.value)"
    style="font-size:13px;padding:5px 4px;width:100%;border:1.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">${extra}${opts}</select>`;
}

function renderPositions() {
  const tbody = document.getElementById('positions-body');
  tbody.innerHTML = '';
  state.positions.forEach((pos, idx) => {
    const gp = pos.qty * pos.ep;
    const tr = document.createElement('tr');
    tr.style.cssText = 'animation:slideIn 0.2s ease both;border-bottom:1px solid var(--border)';
    tr.dataset.id = pos.id;
    tr.innerHTML = `
      <td style="padding:6px 4px;font-size:12px;color:var(--muted)">${idx + 1}</td>
      <td style="padding:4px"><input type="text" value="${sanitizeDisplay(pos.desc)}" placeholder="Leistungsbeschreibung"
        onchange="updatePos(${pos.id},'desc',this.value)" style="font-size:13px;padding:6px 8px"></td>
      <td style="padding:4px"><input type="text" value="${pos.qty}" placeholder="1"
        onchange="updatePos(${pos.id},'qty',this.value)" style="font-size:13px;padding:6px 8px;text-align:right"></td>
      <td style="padding:4px">${buildUnitSelect(pos.id, pos.unit)}</td>
      <td style="padding:4px"><input type="text" value="${pos.ep.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}" placeholder="0,00"
        onchange="updatePos(${pos.id},'ep',this.value)" style="font-size:13px;padding:6px 8px;text-align:right"></td>
      <td style="padding:6px 4px;font-size:13px;font-weight:600;text-align:right;white-space:nowrap">${fmtEur(gp)}</td>
      <td style="padding:4px;text-align:center">
        <button onclick="removePosition(${pos.id})" style="background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:4px" title="Entfernen">×</button>
      </td>`;
    tbody.appendChild(tr);
  });
  updateTotals();
}

function updatePos(id, field, value) {
  const pos = state.positions.find(p => p.id === id);
  if (!pos) return;
  if (field === 'qty' || field === 'ep') pos[field] = parseNum(value);
  else pos[field] = value;
  renderPositions();
  schedulePreview();
}

// ─── TOTALS ───────────────────────────────────────────────────────────────────
function updateTotals() {
  const netto = state.positions.reduce((s, p) => s + p.qty * p.ep, 0);
  const vat = netto * (state.vatRate / 100);
  const total = netto + vat;
  document.getElementById('sum-netto').textContent = fmtEur(netto);
  document.getElementById('sum-vat').textContent = fmtEur(vat);
  document.getElementById('sum-total').textContent = fmtEur(total);
  document.getElementById('vat-pct').textContent = state.vatRate;
  document.getElementById('vat-row').style.display = state.vatRate === 0 ? 'none' : 'flex';
}

function setVat(rate) {
  state.vatRate = rate;
  [0, 7, 19].forEach(r => {
    const btn = document.getElementById(`vat-${r}`);
    if (r === rate) {
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--primary)';
    } else {
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text)';
      btn.style.borderColor = 'var(--border)';
    }
  });
  updateTotals();
  schedulePreview();
  const notice = document.getElementById('ustg-notice');
  if (notice) notice.style.display = rate === 0 ? 'block' : 'none';
}

// ─── LIVE PREVIEW ─────────────────────────────────────────────────────────────
function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(generatePreview, 300);
}

function generatePreview() {
  const f = getFormData();
  const netto = state.positions.reduce((s, p) => s + p.qty * p.ep, 0);
  const vatAmt = netto * (state.vatRate / 100);
  const total = netto + vatAmt;
  const watermark = !state.isPro
    ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:36px;font-weight:700;color:rgba(99,102,241,0.06);white-space:nowrap;pointer-events:none;z-index:0;user-select:none">AngebotGo</div>`
    : '';

  const rows = state.positions.map((p, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F8F9FF'}">
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;overflow:hidden">${i + 1}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;word-break:break-word">${sanitizeDisplay(p.desc)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">${p.qty.toLocaleString('de-DE')}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;overflow:hidden">${sanitizeDisplay(p.unit)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">${fmtEur(p.ep)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap;font-weight:600">${fmtEur(p.qty * p.ep)}</td>
    </tr>`).join('');

  const html = `
    <div style="position:relative;font-family:'Inter',sans-serif;font-size:12px;color:#111827">
      ${watermark}
      <div style="position:relative;z-index:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#111827">${sanitizeDisplay(f.sFirma) || 'Firmenname'}</div>
            <div style="color:#6B7280;margin-top:2px">${sanitizeDisplay(f.sStrasse)}</div>
            <div style="color:#6B7280">${sanitizeDisplay(f.sPlz)} ${sanitizeDisplay(f.sOrt)}</div>
            ${f.sTel ? `<div style="color:#6B7280">${sanitizeDisplay(f.sTel)}</div>` : ''}
            ${f.sEmail ? `<div style="color:#6366F1">${sanitizeDisplay(f.sEmail)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700;color:#6366F1;letter-spacing:-0.5px">ANGEBOT</div>
            <div style="margin-top:8px;font-size:11px;color:#6B7280">
              <div>Nr. <strong style="color:#111827">${sanitizeDisplay(f.qNummer)}</strong></div>
              <div>Datum: ${formatDateDE(f.qDatum)}</div>
              <div>Gültig bis: ${formatDateDE(f.qGueltig)}</div>
            </div>
          </div>
        </div>
        <div style="background:#F8F9FF;border-radius:6px;padding:12px;margin-bottom:16px">
          <div style="font-size:11px;color:#6B7280;margin-bottom:4px">Empfänger</div>
          <div style="font-weight:600">${sanitizeDisplay(f.rName) || '—'}</div>
          <div style="color:#6B7280">${sanitizeDisplay(f.rStrasse)}</div>
          <div style="color:#6B7280">${sanitizeDisplay(f.rPlz)} ${sanitizeDisplay(f.rOrt)}</div>
        </div>
        <div style="border-top:2px solid #6366F1;margin-bottom:12px"></div>
        <div style="overflow-x:hidden;width:100%">
        <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed">
          <colgroup>
            <col style="width:20px">
            <col>
            <col style="width:36px">
            <col style="width:36px">
            <col style="width:64px">
            <col style="width:64px">
          </colgroup>
          <thead>
            <tr style="background:#6366F1;color:#fff">
              <th style="padding:6px 4px;text-align:left;font-weight:600">#</th>
              <th style="padding:6px 4px;text-align:left;font-weight:600">Beschreibung</th>
              <th style="padding:6px 4px;text-align:right;font-weight:600">Mge</th>
              <th style="padding:6px 4px;text-align:left;font-weight:600">Einh.</th>
              <th style="padding:6px 4px;text-align:right;font-weight:600;white-space:nowrap">Einzelpr.</th>
              <th style="padding:6px 4px;text-align:right;font-weight:600;white-space:nowrap">Gesamt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <div style="min-width:min(200px,100%)">
            <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6B7280">
              <span>Zwischensumme</span><span>${fmtEur(netto)}</span>
            </div>
            ${state.vatRate > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#6B7280">
              <span>MwSt. (${state.vatRate}%)</span><span>${fmtEur(vatAmt)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:14px;color:#6366F1;border-top:2px solid #6366F1;margin-top:4px">
              <span>Gesamtbetrag</span><span>${fmtEur(total)}</span>
            </div>
          </div>
        </div>
        ${f.qAnmerkung ? `<div style="margin-top:16px;padding:12px;background:#F8F9FF;border-radius:6px;font-size:11px;color:#6B7280"><strong style="color:#111827">Anmerkungen:</strong><br>${sanitizeDisplay(f.qAnmerkung)}</div>` : ''}
        ${f.qZahlung !== 'keine' ? `<div style="margin-top:16px;font-size:11px;color:#6B7280">Zahlungsziel: ${sanitizeDisplay(f.qZahlung)}${/^\d+$/.test(f.qZahlung) ? ' Tage netto' : ''}</div>` : ''}
        ${state.vatRate === 0 ? `<div style="margin-top:10px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;font-size:10px;color:#92400E"><strong>Hinweis:</strong> Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</div>` : ''}
        ${(f.sIban || f.sBic) ? `<div style="margin-top:8px;font-size:10px;color:#6B7280">Bankverbindung: ${sanitizeDisplay(f.sIban)}${f.sBic ? ' · ' + sanitizeDisplay(f.sBic) : ''}</div>` : ''}
        ${!state.isPro ? `<div style="margin-top:20px;text-align:center;font-size:10px;color:#9CA3AF">Erstellt mit AngebotGo</div>` : ''}
      </div>
    </div>`;

  const container = document.getElementById('preview-content');
  container.style.opacity = '0';
  container.style.transition = 'opacity 0.2s';
  setTimeout(() => {
    container.innerHTML = html;
    container.style.opacity = '1';
  }, 100);
}


// ─── PDF GENERATION (jsPDF + AutoTable) ─────────────────────────────────────
function buildPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const f = getFormData();
  const netto = state.positions.reduce((s, p) => s + p.qty * p.ep, 0);
  const vatAmt = netto * (state.vatRate / 100);
  const total = netto + vatAmt;
  const margin = 20;
  const pageW = 210;
  const colRight = pageW - margin;
  let y = margin;

  // Header: Firmenname left | ANGEBOT right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(f.sFirma || 'Firmenname', margin, y);

  doc.setFontSize(20);
  doc.setTextColor(99, 102, 241);
  doc.text('ANGEBOT', colRight, y, { align: 'right' });
  y += 7;

  // Sender info block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  if (f.sStrasse) { doc.text(f.sStrasse, margin, y); y += 4.5; }
  if (f.sPlz || f.sOrt) { doc.text(`${f.sPlz} ${f.sOrt}`.trim(), margin, y); y += 4.5; }
  if (f.sTel) { doc.text(`Tel: ${f.sTel}`, margin, y); y += 4.5; }
  if (f.sEmail) { doc.setTextColor(99, 102, 241); doc.text(f.sEmail, margin, y); doc.setTextColor(107, 114, 128); y += 4.5; }

  // Meta info right
  let metaY = margin + 10;
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Nr: `, colRight - 40, metaY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(f.qNummer || '', colRight, metaY, { align: 'right' });
  metaY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`Datum: ${formatDateDE(f.qDatum)}`, colRight, metaY, { align: 'right' });
  metaY += 5;
  doc.text(`Gültig bis: ${formatDateDE(f.qGueltig)}`, colRight, metaY, { align: 'right' });

  y = Math.max(y, metaY) + 8;

  // Divider line indigo
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.7);
  doc.line(margin, y, colRight, y);
  y += 8;

  // Recipient box
  doc.setFillColor(248, 249, 255);
  doc.roundedRect(margin, y, pageW - 2 * margin, 22, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('Empfänger', margin + 4, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(f.rName || '—', margin + 4, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  const recipientLine = [f.rStrasse, `${f.rPlz} ${f.rOrt}`.trim()].filter(Boolean).join(' · ');
  if (recipientLine) doc.text(recipientLine, margin + 4, y + 16);
  y += 28;

  // Positions table
  const tableRows = state.positions.map((p, i) => [
    i + 1,
    p.desc,
    p.qty.toLocaleString('de-DE'),
    p.unit,
    fmtEur(p.ep),
    fmtEur(p.qty * p.ep),
  ]);

  doc.autoTable({
    startY: y,
    head: [['#', 'Beschreibung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamt']],
    body: tableRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3, textColor: [17, 24, 39] },
    headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    columnStyles: {
      0: { cellWidth: 8 },
      2: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => { y = data.cursor.y; },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Totals right-aligned
  const totalsX = colRight - 50;
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('Zwischensumme', totalsX, y);
  doc.text(fmtEur(netto), colRight, y, { align: 'right' });
  y += 5;
  if (state.vatRate > 0) {
    doc.text(`MwSt. (${state.vatRate}%)`, totalsX, y);
    doc.text(fmtEur(vatAmt), colRight, y, { align: 'right' });
    y += 5;
  }
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, colRight, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(99, 102, 241);
  doc.text('Gesamtbetrag', totalsX, y);
  doc.text(fmtEur(total), colRight, y, { align: 'right' });
  y += 8;

  // Zahlungsziel
  if (f.qZahlung !== 'keine') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    const zahlungText = /^\d+$/.test(f.qZahlung) ? `Zahlungsziel: ${f.qZahlung} Tage netto` : `Zahlungsziel: ${f.qZahlung}`;
    doc.text(zahlungText, margin, y);
    y += 6;
  }

  // Anmerkungen
  if (f.qAnmerkung) {
    doc.setFillColor(248, 249, 255);
    const lines = doc.splitTextToSize(f.qAnmerkung, pageW - 2 * margin - 8);
    const boxH = lines.length * 4.5 + 10;
    doc.roundedRect(margin, y, pageW - 2 * margin, boxH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('Anmerkungen:', margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(lines, margin + 4, y + 11);
    y += boxH + 6;
  }

  // §19 UStG notice
  if (state.vatRate === 0) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, y, pageW - 2 * margin, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14);
    doc.text('Hinweis:', margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', margin + 22, y + 6);
    y += 13;
  }

  // Bankverbindung
  if (f.sIban || f.sBic) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    const bankParts = ['Bankverbindung:'];
    if (f.sIban) bankParts.push(f.sIban);
    if (f.sBic) bankParts.push('·', f.sBic);
    doc.text(bankParts.join(' '), margin, y);
    y += 5;
  }

  // Signature
  const sigDataUrl = (typeof getSignatureDataUrl === 'function') ? getSignatureDataUrl() : null;
  if (sigDataUrl) {
    if (y > 240) { doc.addPage(); y = 20; }
    y += 6;
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + 65, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Unterschrift Auftraggeber:', margin, y);
    doc.text('Datum: ' + formatDateDE(getTodayISO()), colRight, y, { align: 'right' });
    y += 3;
    // Use fixed dimensions: 50mm wide × 14mm high (canvas is always wider than tall)
    doc.addImage(sigDataUrl, 'PNG', margin, y, 50, 14);
    y += 18;
  }

  // Diagonal watermark + footer for free users
  if (!state.isPro) {
    const GState = window.jspdf && window.jspdf.GState ? window.jspdf.GState : null;
    if (GState) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.07 }));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(52);
      doc.setTextColor(99, 102, 241);
      doc.text('AngebotGo', pageW / 2, 297 / 2, { align: 'center', angle: 30 });
      doc.restoreGraphicsState();
    }
    const pageH = 297;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const footerText = 'Erstellt mit AngebotGo';
    const footerTextW = doc.getTextWidth(footerText);
    doc.textWithLink(footerText, (pageW - footerTextW) / 2, pageH - 10, { url: 'https://angebotgo.de' });
  }

  return doc;
}

function getPDFBase64() {
  const doc = buildPDF();
  return doc.output('datauristring').split(',')[1];
}

function downloadPDF() {
  const f = getFormData();
  const doc = buildPDF();
  const filename = `${(f.sFirma || 'Angebot').replace(/[^a-zA-Z0-9\-_]/g, '_')}-Angebot-${f.qNummer || 'draft'}.pdf`;
  doc.save(filename);
}


// ─── VIEWS ────────────────────────────────────────────────────────────────────
function goToEmailGate() {
  showView('view-email');
  setTimeout(() => { const el = document.getElementById('auth-login-email'); if (el) el.focus(); }, 50);
}

const VIEW_DISPLAY = { 'view-email': 'flex', 'view-landing': 'block', 'view-generator': 'flex', 'view-profile': 'block' };

function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) {
    el.style.display = VIEW_DISPLAY[id] || 'block';
    el.classList.add('active');
  }
}

// ─── AUTH TABS ────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  const loginTab = document.getElementById('auth-login-tab');
  const regTab = document.getElementById('auth-register-tab');
  const btnLogin = document.getElementById('tab-login');
  const btnReg = document.getElementById('tab-register');
  const active = 'border-bottom:2.5px solid var(--primary);color:var(--primary);background:none;border-top:none;border-left:none;border-right:none;';
  const inactive = 'border-bottom:2.5px solid transparent;color:var(--muted);background:none;border-top:none;border-left:none;border-right:none;';
  if (tab === 'login') {
    loginTab.style.display = '';
    regTab.style.display = 'none';
    btnLogin.style.cssText += active;
    btnReg.style.cssText += inactive;
  } else {
    loginTab.style.display = 'none';
    regTab.style.display = '';
    btnLogin.style.cssText += inactive;
    btnReg.style.cssText += active;
  }
}

// ─── AUTH FUNCTIONS ───────────────────────────────────────────────────────────
function _setAuthBtnLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle"></span>'
    : label;
}

async function handleLogin() {
  if (!_sb) { showAlert('Supabase nicht konfiguriert.'); return; }
  const email = (document.getElementById('auth-login-email').value || '').trim().toLowerCase();
  const password = document.getElementById('auth-login-password').value;
  const errEl = document.getElementById('auth-login-error');
  errEl.style.display = 'none';
  if (!isValidEmail(email)) { errEl.textContent = 'Bitte eine gültige E-Mail-Adresse eingeben.'; errEl.style.display = 'block'; return; }
  if (!password) { errEl.textContent = 'Bitte Passwort eingeben.'; errEl.style.display = 'block'; return; }
  _setAuthBtnLoading('auth-login-btn', true, 'Anmelden');
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      errEl.textContent = error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : (error.message || 'Anmeldung fehlgeschlagen.');
      errEl.style.display = 'block';
    } else {
      await initAfterLogin(data.session);
    }
  } catch (e) {
    errEl.textContent = 'Netzwerkfehler. Bitte erneut versuchen.';
    errEl.style.display = 'block';
  } finally {
    _setAuthBtnLoading('auth-login-btn', false, 'Anmelden');
  }
}

async function handleRegister() {
  if (!_sb) { showAlert('Supabase nicht konfiguriert.'); return; }
  const email = (document.getElementById('auth-reg-email').value || '').trim().toLowerCase();
  const pw = document.getElementById('auth-reg-password').value;
  const pw2 = document.getElementById('auth-reg-password2').value;
  const errEl = document.getElementById('auth-reg-error');
  const sucEl = document.getElementById('auth-reg-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';
  if (!isValidEmail(email)) { errEl.textContent = 'Bitte eine gültige E-Mail-Adresse eingeben.'; errEl.style.display = 'block'; return; }
  if (pw.length < 8) { errEl.textContent = 'Passwort muss mindestens 8 Zeichen haben.'; errEl.style.display = 'block'; return; }
  if (pw !== pw2) { errEl.textContent = 'Passwörter stimmen nicht überein.'; errEl.style.display = 'block'; return; }
  _setAuthBtnLoading('auth-reg-btn', true, 'Konto erstellen');
  try {
    const { data, error } = await _sb.auth.signUp({ email, password: pw });
    if (error) {
      errEl.textContent = error.message || 'Registrierung fehlgeschlagen.';
      errEl.style.display = 'block';
    } else if (data.session) {
      // Auto-confirmed (email confirm disabled)
      await initAfterLogin(data.session);
    } else {
      sucEl.textContent = '✓ Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link gesendet.';
      sucEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Netzwerkfehler. Bitte erneut versuchen.';
    errEl.style.display = 'block';
  } finally {
    _setAuthBtnLoading('auth-reg-btn', false, 'Konto erstellen');
  }
}

async function handleMagicLink() {
  if (!_sb) { showAlert('Supabase nicht konfiguriert.'); return; }
  const email = (document.getElementById('auth-login-email').value || '').trim().toLowerCase();
  const errEl = document.getElementById('auth-login-error');
  const msgEl = document.getElementById('auth-magic-msg');
  errEl.style.display = 'none';
  msgEl.style.display = 'none';
  if (!isValidEmail(email)) { errEl.textContent = 'Bitte zuerst E-Mail-Adresse eingeben.'; errEl.style.display = 'block'; return; }
  _setAuthBtnLoading('auth-magic-btn', true, 'Magic Link senden');
  try {
    const { error } = await _sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    if (error) {
      errEl.textContent = error.message || 'Fehler beim Senden des Links.';
      errEl.style.display = 'block';
    } else {
      msgEl.textContent = '✓ Link gesendet! Prüfe dein Postfach.';
      msgEl.style.color = 'var(--success)';
      msgEl.style.background = 'rgba(16,185,129,0.08)';
      msgEl.style.borderRadius = '8px';
      msgEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Netzwerkfehler. Bitte erneut versuchen.';
    errEl.style.display = 'block';
  } finally {
    _setAuthBtnLoading('auth-magic-btn', false, 'Magic Link senden');
  }
}

async function handleForgotPassword() {
  if (!_sb) { showAlert('Supabase nicht konfiguriert.'); return; }
  const email = (document.getElementById('auth-login-email').value || '').trim().toLowerCase();
  const errEl = document.getElementById('auth-login-error');
  const msgEl = document.getElementById('auth-forgot-msg');
  errEl.style.display = 'none';
  msgEl.style.display = 'none';
  if (!isValidEmail(email)) { errEl.textContent = 'Bitte zuerst E-Mail-Adresse eingeben.'; errEl.style.display = 'block'; return; }
  try {
    const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    msgEl.textContent = error ? (error.message || 'Fehler.') : '✓ Reset-Link gesendet! Prüfe dein Postfach.';
    msgEl.style.color = error ? 'var(--danger)' : 'var(--success)';
    msgEl.style.background = error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';
    msgEl.style.borderRadius = '8px';
    msgEl.style.display = 'block';
  } catch (e) {
    errEl.textContent = 'Netzwerkfehler.';
    errEl.style.display = 'block';
  }
}

async function signOut() {
  if (_sb) await _sb.auth.signOut();
  state.email = '';
  state.accessToken = null;
  state.isPro = false;
  state.quoteCount = 0;
  toggleUserMenu(false);
  showView('view-email');
  setTimeout(() => { const el = document.getElementById('auth-login-email'); if (el) el.focus(); }, 50);
}


// ─── SERVER PROFILE LOAD ──────────────────────────────────────────────────────
function loadProfileFromServer(p) {
  const map = {
    firma: 's-firma', strasse: 's-strasse', plz: 's-plz', ort: 's-ort',
    tel: 's-tel', kontakt_email: 's-email', iban: 's-iban', bic: 's-bic',
  };
  let changed = false;
  Object.entries(map).forEach(([key, id]) => {
    if (p[key]) {
      const el = document.getElementById(id);
      if (el) { el.value = p[key]; changed = true; }
    }
  });
  if (changed) schedulePreview();
}


// Restore session state without navigating away from landing page
async function restoreSession(session) {
  state.email = session.user.email;
  state.accessToken = session.access_token;

  const saved = localStorage.getItem('saved_sender_info');
  if (saved) {
    try {
      const info = JSON.parse(saved);
      if (info.firma) document.getElementById('s-firma').value = info.firma;
      if (info.strasse) document.getElementById('s-strasse').value = info.strasse;
      if (info.plz) document.getElementById('s-plz').value = info.plz;
      if (info.ort) document.getElementById('s-ort').value = info.ort;
      if (info.tel) document.getElementById('s-tel').value = info.tel;
      if (info.sEmail) document.getElementById('s-email').value = info.sEmail;
      if (info.iban) document.getElementById('s-iban').value = info.iban;
      if (info.bic) document.getElementById('s-bic').value = info.bic;
    } catch {}
  }

  updateUserMenu();
  updateLandingNav();

  // Fetch quota/profile from server (non-blocking)
  fetch('/.netlify/functions/track-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify({ email: state.email, check_only: true }),
  }).then(r => r.ok ? r.json() : null).then(data => {
    if (!data) return;
    if (typeof data.quote_count === 'number') state.quoteCount = data.quote_count;
    if (typeof data.bonus_quotes === 'number') state.bonusQuotes = data.bonus_quotes;
    if (data.is_pro === true) applyProStatus();
    else updateCounter();
    if (data.profile) loadProfileFromServer(data.profile);
  }).catch(() => {});
}

// Update the landing page nav button based on login state
function updateLandingNav() {
  const btn = document.getElementById('landing-cta-btn');
  if (!btn) return;
  if (state.email) {
    btn.textContent = 'Weiter zum Generator →';
    btn.onclick = () => goToGenerator();
  } else {
    btn.textContent = 'Jetzt kostenlos starten';
    btn.onclick = () => goToEmailGate();
  }
}

function goToGenerator() {
  setTimeout(initSignatureCanvas, 60);
  updateCounter();
  generatePreview();
  showView('view-generator');
}

async function initAfterLogin(session) {
  state.email = session.user.email;
  state.accessToken = session.access_token;

  // Load saved sender info
  const saved = localStorage.getItem('saved_sender_info');
  if (saved) {
    try {
      const info = JSON.parse(saved);
      if (info.firma) document.getElementById('s-firma').value = info.firma;
      if (info.strasse) document.getElementById('s-strasse').value = info.strasse;
      if (info.plz) document.getElementById('s-plz').value = info.plz;
      if (info.ort) document.getElementById('s-ort').value = info.ort;
      if (info.tel) document.getElementById('s-tel').value = info.tel;
      if (info.sEmail) document.getElementById('s-email').value = info.sEmail;
      if (info.iban) document.getElementById('s-iban').value = info.iban;
      if (info.bic) document.getElementById('s-bic').value = info.bic;
    } catch {}
  }

  updateUserMenu();
  updateLandingNav();
  goToGenerator();

  // Fetch real Pro/quota status from server (non-blocking)
  fetch('/.netlify/functions/track-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ email: state.email, check_only: true }),
  }).then(r => r.ok ? r.json() : null).then(data => {
    if (!data) return;
    if (typeof data.quote_count === 'number') state.quoteCount = data.quote_count;
    if (typeof data.bonus_quotes === 'number') state.bonusQuotes = data.bonus_quotes;
    if (data.is_pro === true) applyProStatus();
    else updateCounter();
    if (data.profile) loadProfileFromServer(data.profile);
  }).catch(() => {});
}

// ─── USER MENU ────────────────────────────────────────────────────────────────
function updateUserMenu() {
  const avatarBtn = document.getElementById('user-avatar-btn');
  const emailEl = document.getElementById('user-dropdown-email');
  const portalEl = document.getElementById('user-dropdown-portal');
  const proBadge = document.getElementById('pro-badge');
  if (avatarBtn && state.email) {
    avatarBtn.textContent = state.email.charAt(0).toUpperCase();
    avatarBtn.onclick = showProfile;
  }
  if (emailEl && state.email) emailEl.textContent = '👤 ' + state.email;
  if (portalEl) portalEl.style.display = state.isPro ? '' : 'none';
  const upgradeWrap = document.getElementById('profile-upgrade-wrap');
  if (upgradeWrap) upgradeWrap.style.display = state.isPro ? 'none' : '';
  const portalWrap = document.getElementById('profile-portal-wrap');
  if (portalWrap) portalWrap.style.display = state.isPro ? '' : 'none';
  if (proBadge) proBadge.style.display = state.isPro ? '' : 'none';
}

function toggleUserMenu(forceClose) {
  const dropdown = document.getElementById('user-dropdown');
  if (!dropdown) return;
  if (forceClose === false || dropdown.style.display !== 'none') {
    dropdown.style.display = 'none';
  } else {
    dropdown.style.display = 'block';
  }
}

// Close user menu on outside click
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('user-menu-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
});

function showPaywall() {
  const el = document.getElementById('view-paywall');
  el.style.display = 'flex';
  el.classList.add('active');
  const f1 = document.getElementById('features-list');
  const f2 = document.getElementById('features-list-2');
  const half = Math.ceil(FEATURES.length / 2);
  const renderFeature = (feat, delay) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;animation:fadeUp 0.3s ${delay}ms ease both;opacity:0;animation-fill-mode:forwards">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
      ${sanitizeDisplay(feat)}
    </div>`;
  f1.innerHTML = FEATURES.slice(0, half).map((f, i) => renderFeature(f, i * 40)).join('');
  f2.innerHTML = FEATURES.slice(half).map((f, i) => renderFeature(f, (i + half) * 40)).join('');
}

function closePaywall() {
  const el = document.getElementById('view-paywall');
  el.style.display = 'none';
  el.classList.remove('active');
}

function showSuccess() {
  const el = document.getElementById('view-success');
  el.style.display = 'flex';
  el.classList.add('active');
  // Reset check animation
  const poly = document.getElementById('check-polyline');
  poly.style.animation = 'none';
  void poly.offsetWidth;
  poly.style.animation = 'checkDraw 0.6s 0.2s ease forwards';

  setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('active');
  }, 2500);
}

// (email gate replaced by Supabase Auth — see handleLogin / handleRegister above)


// ─── PROFILE VIEW ────────────────────────────────────────────────────────────
function showProfile() {
  toggleUserMenu(false);
  // Populate profile view with current state
  const emailEl = document.getElementById('profile-email');
  const planEl = document.getElementById('profile-plan');
  const countEl = document.getElementById('profile-count');
  if (emailEl) emailEl.textContent = state.email;
  if (planEl) {
    planEl.textContent = state.isPro ? '⭐ Pro' : 'Kostenlos';
    planEl.className = state.isPro ? 'pill pill-primary' : 'pill pill-warning';
  }
  if (countEl) countEl.textContent = state.quoteCount + ' Angebot' + (state.quoteCount !== 1 ? 'e' : '') + ' erstellt';

  // Populate form fields from current sender values
  const fields = { 'profile-firma': 's-firma', 'profile-strasse': 's-strasse', 'profile-plz': 's-plz',
    'profile-ort': 's-ort', 'profile-tel': 's-tel', 'profile-email-field': 's-email',
    'profile-iban': 's-iban', 'profile-bic': 's-bic' };
  Object.entries(fields).forEach(([profileId, generatorId]) => {
    const src = document.getElementById(generatorId);
    const dst = document.getElementById(profileId);
    if (src && dst) dst.value = src.value;
  });
  // Apply Pro/Free UI state fresh each time profile opens
  const upgradeWrap = document.getElementById('profile-upgrade-wrap');
  const portalWrap = document.getElementById('profile-portal-wrap');
  if (upgradeWrap) upgradeWrap.style.display = state.isPro ? 'none' : '';
  if (portalWrap) portalWrap.style.display = state.isPro ? '' : 'none';
  const saveBtn = document.getElementById('profile-save-btn');
  const saveHint = document.getElementById('profile-save-hint');
  if (saveBtn) saveBtn.style.display = state.isPro ? '' : 'none';
  if (saveHint) saveHint.style.display = state.isPro ? 'none' : '';

  showView('view-profile');
}

async function saveProfileView() {
  const fields = { 'profile-firma': 's-firma', 'profile-strasse': 's-strasse', 'profile-plz': 's-plz',
    'profile-ort': 's-ort', 'profile-tel': 's-tel', 'profile-email-field': 's-email',
    'profile-iban': 's-iban', 'profile-bic': 's-bic' };

  // Sync back to generator fields
  Object.entries(fields).forEach(([profileId, generatorId]) => {
    const src = document.getElementById(profileId);
    const dst = document.getElementById(generatorId);
    if (src && dst) dst.value = src.value;
  });

  // Save via existing function (localStorage + server)
  saveSenderInfo();

  const btn = document.getElementById('profile-save-btn');
  if (btn) {
    btn.textContent = '✓ Gespeichert';
    btn.style.background = 'var(--success)';
    setTimeout(() => { btn.textContent = 'Speichern'; btn.style.background = ''; }, 2000);
  }
}

// ─── SAVE SENDER INFO ─────────────────────────────────────────────────────────
function saveSenderInfo() {
  const info = {
    firma: document.getElementById('s-firma').value.trim(),
    strasse: document.getElementById('s-strasse').value.trim(),
    plz: document.getElementById('s-plz').value.trim(),
    ort: document.getElementById('s-ort').value.trim(),
    tel: document.getElementById('s-tel').value.trim(),
    sEmail: document.getElementById('s-email').value.trim(),
    iban: document.getElementById('s-iban').value.trim(),
    bic: document.getElementById('s-bic').value.trim(),
  };
  localStorage.setItem('saved_sender_info', JSON.stringify(info));
  // Persist profile to server (non-blocking)
  if (state.accessToken) {
    fetch('/.netlify/functions/save-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.accessToken },
      body: JSON.stringify({ firma: info.firma, strasse: info.strasse, plz: info.plz, ort: info.ort, tel: info.tel, kontakt_email: info.sEmail, iban: info.iban, bic: info.bic }),
    }).catch(() => {});
  }
}

// Auto-save sender info on change
['s-firma','s-strasse','s-plz','s-ort','s-tel','s-email','s-iban','s-bic'].forEach(id => {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveSenderInfo);
  });
});

// ─── SEND QUOTE ───────────────────────────────────────────────────────────────
async function handleSendQuote() {
  if (!state.isPro && state.quoteCount >= FREE_LIMIT + state.bonusQuotes) {
    showPaywall();
    return;
  }

  const f = getFormData();

  // Validation
  if (!f.sFirma) { showAlert('Bitte geben Sie einen Firmennamen ein.'); return; }
  if (!f.sEmail || !isValidEmail(f.sEmail)) {
    alert('Bitte geben Sie Ihre E-Mail-Adresse (Absender) ein.');
    document.getElementById('s-email').focus();
    return;
  }
  if (!f.rName) { showAlert('Bitte geben Sie einen Kundennamen ein.'); return; }

  // Signature required
  if (!hasSignature()) {
    const se = document.getElementById('sig-err');
    if (se) { se.style.display = 'block'; se.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return;
  }
  const seOk = document.getElementById('sig-err'); if (seOk) seOk.style.display = 'none';

  // Show confirmation modal (FIX 7)
  const modal = document.getElementById('modal-confirm-send');
  modal.style.display = 'flex';
}

async function redeemPromoCode() {
  const input = document.getElementById('promo-input');
  const msg = document.getElementById('promo-msg');
  const code = (input.value || '').trim().toUpperCase();
  if (!code) {
    msg.textContent = 'Bitte Promo-Code eingeben.';
    msg.style.color = 'var(--muted)';
    msg.style.display = 'block';
    return;
  }
  if (!state.email) {
    msg.textContent = 'Bitte zuerst einloggen.';
    msg.style.color = 'var(--danger)';
    msg.style.display = 'block';
    return;
  }
  msg.textContent = 'Wird geprüft…';
  msg.style.color = 'var(--muted)';
  msg.style.display = 'block';
  try {
    const res = await fetch('/.netlify/functions/redeem-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email: state.email }),
    });
    const data = await res.json();
    if (data.success) {
      // Update bonus quota immediately so counter reflects new limit right away
      if (typeof data.extra_quotes === 'number') {
        state.bonusQuotes += data.extra_quotes;
        updateCounter();
      }
      msg.textContent = `✓ Code eingelöst! +${data.extra_quotes} kostenlose Angebote freigeschaltet.`;
      msg.style.color = 'var(--success)';
      input.value = '';
      // Re-sync counter from server
      try {
        const syncHeaders = { 'Content-Type': 'application/json' };
        if (state.accessToken) syncHeaders['Authorization'] = `Bearer ${state.accessToken}`;
        const sr = await fetch('/.netlify/functions/track-quote', {
          method: 'POST',
          headers: syncHeaders,
          body: JSON.stringify({ email: state.email, check_only: true }),
        });
        if (sr.ok) {
          const sd = await sr.json();
          if (typeof sd.quote_count === 'number') {
            state.quoteCount = sd.quote_count;
            localStorage.setItem('quote_counter_local', String(sd.quote_count));
          }
          // Take max to prevent stale server value overwriting the fresh client increment
          if (typeof sd.bonus_quotes === 'number') state.bonusQuotes = Math.max(state.bonusQuotes, sd.bonus_quotes);
          if (typeof sd.is_pro === 'boolean' && sd.is_pro) applyProStatus();
          updateCounter();
        }
      } catch {}
    } else {
      msg.textContent = data.error || 'Ungültiger oder abgelaufener Code.';
      msg.style.color = 'var(--danger)';
    }
  } catch {
    msg.textContent = 'Netzwerkfehler. Bitte erneut versuchen.';
    msg.style.color = 'var(--danger)';
  }
}

async function confirmSendQuote() {
  document.getElementById('modal-confirm-send').style.display = 'none';
  await doSendQuote();
}

async function doSendQuote() {
  const f = getFormData();
  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  btn.style.opacity = '0.5';
  btn.innerHTML = '<span style="opacity:0.7">Wird gesendet…</span>';

  try {
    saveSenderInfo();
    const pdfBase64 = getPDFBase64();
    const safeFirma = f.sFirma.replace(/[^a-zA-Z0-9\-_äöüÄÖÜß ]/g, '').trim();
    const filename = `${safeFirma}-Angebot-${f.qNummer}`;
    const subject = `Angebot Nr. ${f.qNummer} von ${f.sFirma}`;
    const recipientName = f.rName || 'Kunde';
    const bodyText = f.rEmail && isValidEmail(f.rEmail)
      ? `Sehr geehrte/r ${recipientName},\n\nanbei finden Sie unser Angebot Nr. ${f.qNummer} vom ${formatDateDE(f.qDatum)}.\n\nDas Angebot ist gültig bis zum ${formatDateDE(f.qGueltig)}.${f.qZahlung !== 'keine' ? '\nZahlungsziel: ' + f.qZahlung + (/^\d+$/.test(f.qZahlung) ? ' Tage netto' : '') + '.' : ''}\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen,\n${f.sFirma}`
      : `Angebot Nr. ${f.qNummer} vom ${formatDateDE(f.qDatum)} für ${recipientName}.\n\nGültig bis: ${formatDateDE(f.qGueltig)}${f.qZahlung !== 'keine' ? ' · Zahlungsziel: ' + f.qZahlung + (/^\d+$/.test(f.qZahlung) ? ' Tage netto' : '') : ''}.\n\n${f.sFirma}`;

    const sendHeaders = { 'Content-Type': 'application/json' };
    if (state.accessToken) sendHeaders['Authorization'] = `Bearer ${state.accessToken}`;
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: sendHeaders,
      body: JSON.stringify({
        to: f.sEmail,
        cc: (f.rEmail && isValidEmail(f.rEmail)) ? f.rEmail : undefined,
        subject,
        pdfBase64,
        filename,
        bodyText,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Unbekannter Fehler');
    }

    await trackQuote();
    showSuccess();
  } catch (err) {
    showAlert('Fehler beim Senden: ' + err.message);
  } finally {
    const agbChecked = document.getElementById('agb-check').checked;
    btn.disabled = !agbChecked;
    btn.style.opacity = agbChecked ? '1' : '0.5';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Angebot senden`;
  }
}

async function trackQuote() {
  state.quoteCount += 1;
  updateCounter();

  // Update quote number for next quote
  document.getElementById('q-nummer').value = genQuoteNumber();

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
    const res = await fetch('/.netlify/functions/track-quote', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: state.email }),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.quote_count === 'number') state.quoteCount = data.quote_count;
      if (typeof data.is_pro === 'boolean') state.isPro = data.is_pro;
      updateCounter();
    }
  } catch {}
}

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────────
async function startCheckout(plan) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan, email: state.email }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showAlert('Fehler beim Starten des Bezahlvorgangs. Bitte versuchen Sie es erneut.');
    }
  } catch {
    showAlert('Netzwerkfehler. Bitte versuchen Sie es erneut.');
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, durationMs = 3500) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(80px)';
  }, durationMs);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Date defaults
  document.getElementById('q-datum').value = getTodayISO();
  document.getElementById('q-gueltig').value = getDatePlusDays(30);
  document.getElementById('q-nummer').value = genQuoteNumber();

  // VAT default
  setVat(19);

  // Demo data
  document.getElementById('s-firma').value = 'Sanitär Müller GmbH';
  addPosition('Erneuerung Heizungsanlage', 1, 'pausch.', 2400.00);
  addPosition('Montage Heizkörper (5 Stk.)', 5, 'Stk.', 180.00);

  // Live preview on all input changes
  document.getElementById('view-generator').addEventListener('input', () => schedulePreview());
  document.getElementById('view-generator').addEventListener('change', () => schedulePreview());

  generatePreview();

  // Stripe checkout redirect detection
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'success') {
    history.replaceState(null, '', window.location.pathname);
    state.isPro = true;
  }

  // Check for existing Supabase session (magic link return or persisted session)
  if (_sb) {
    // Handle magic link / password reset token in URL hash
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('type=recovery'))) {
      const { data: { session }, error } = await _sb.auth.getSession();
      if (session) {
        history.replaceState(null, '', window.location.pathname);
        if (hash.includes('type=recovery')) {
          // Password reset flow — stay on auth view for user to reset
          showView('view-email');
        } else {
          await initAfterLogin(session);
          if (urlParams.get('checkout') === 'success') {
            applyProStatus();
            setTimeout(() => showToast('✓ Upgrade erfolgreich! Du bist jetzt Pro.'), 600);
          }
          return;
        }
      }
    }

    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      await restoreSession(session);
      if (urlParams.get('checkout') === 'success') {
        applyProStatus();
        await initAfterLogin(session);
        setTimeout(() => showToast('✓ Upgrade erfolgreich! Du bist jetzt Pro.'), 600);
      }
    }

    // Listen for auth state changes (magic link auto-login)
    _sb.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && !state.email) {
        state.accessToken = session.access_token;
        await initAfterLogin(session);
      } else if (event === 'SIGNED_OUT') {
        state.email = '';
        state.accessToken = null;
      } else if (event === 'TOKEN_REFRESHED' && session) {
        state.accessToken = session.access_token;
      }
    });
  }
});


// Mobile: hide preview, show only form; add toggle button
window.addEventListener('resize', applyMobileLayout);
function applyMobileLayout() {
  const grid = document.querySelector('#view-generator > div[style*="grid-template-columns"]');
  if (!grid) return;
  if (window.innerWidth < 768) {
    grid.style.gridTemplateColumns = '1fr';
    document.getElementById('preview-panel').style.display = 'none';
  } else {
    grid.style.gridTemplateColumns = '1fr 1fr';
    document.getElementById('preview-panel').style.display = '';
    // Close mobile modal if viewport widens to desktop
    _closeMobilePreviewImmediate();
  }
}
document.addEventListener('DOMContentLoaded', applyMobileLayout);

// ─── MOBILE PREVIEW MODAL ─────────────────────────────────────────────────────
function handlePreviewBtn() {
  if (window.innerWidth < 768) {
    openMobilePreview();
  } else {
    generatePreview();
  }
}

function openMobilePreview() {
  generatePreview(); // ensure desktop preview is current
  // Sync content into modal
  const src = document.getElementById('preview-content');
  const dest = document.getElementById('mobile-preview-content');
  if (src && dest) dest.innerHTML = src.innerHTML;

  const backdrop = document.getElementById('mobile-preview-backdrop');
  const modal = document.getElementById('mobile-preview-modal');
  backdrop.style.display = 'block';
  modal.style.display = 'flex';
  // Slide-up animation
  modal.style.transform = 'translateY(100%)';
  modal.style.transition = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.style.transition = 'transform 400ms cubic-bezier(0.16,1,0.3,1)';
      modal.style.transform = 'translateY(0)';
    });
  });
  document.body.style.overflow = 'hidden';

  // Swipe-down to close
  _attachSwipeClose(modal);
}

function closeMobilePreview() {
  const modal = document.getElementById('mobile-preview-modal');
  const backdrop = document.getElementById('mobile-preview-backdrop');
  modal.style.transition = 'transform 300ms cubic-bezier(0.4,0,1,1)';
  modal.style.transform = 'translateY(100%)';
  backdrop.style.opacity = '0';
  backdrop.style.transition = 'opacity 300ms ease';
  setTimeout(() => {
    modal.style.display = 'none';
    backdrop.style.display = 'none';
    backdrop.style.opacity = '';
    backdrop.style.transition = '';
    document.body.style.overflow = '';
  }, 300);
}

function _closeMobilePreviewImmediate() {
  const modal = document.getElementById('mobile-preview-modal');
  const backdrop = document.getElementById('mobile-preview-backdrop');
  if (modal) { modal.style.display = 'none'; modal.style.transform = ''; }
  if (backdrop) backdrop.style.display = 'none';
  document.body.style.overflow = '';
}

function _attachSwipeClose(modal) {
  let startY = 0;
  function onTouchStart(e) { startY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) closeMobilePreview();
  }
  modal.removeEventListener('touchstart', modal._swipeStart);
  modal.removeEventListener('touchend', modal._swipeEnd);
  modal._swipeStart = onTouchStart;
  modal._swipeEnd = onTouchEnd;
  modal.addEventListener('touchstart', onTouchStart, { passive: true });
  modal.addEventListener('touchend', onTouchEnd, { passive: true });
}


// ─── DIGITAL SIGNATURE ────────────────────────────────────────────────────────
var _sigCanvas, _sigCtx, _sigDrawing = false, _sigHas = false, _sigInited = false;

function initSignatureCanvas() {
  _sigCanvas = document.getElementById('sig-canvas');
  if (!_sigCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  var w = _sigCanvas.offsetWidth || 560;
  _sigCanvas.width = Math.max(w, 100) * dpr;
  _sigCanvas.height = 150 * dpr;
  _sigCtx = _sigCanvas.getContext('2d');
  _sigCtx.scale(dpr, dpr);
  _sigCtx.strokeStyle = '#111827';
  _sigCtx.lineWidth = 2.5;
  _sigCtx.lineCap = 'round';
  _sigCtx.lineJoin = 'round';
  if (_sigInited) return;
  _sigInited = true;
  _sigCanvas.addEventListener('mousedown', _sigStart);
  _sigCanvas.addEventListener('mousemove', _sigMove);
  _sigCanvas.addEventListener('mouseup', _sigEnd);
  _sigCanvas.addEventListener('mouseleave', _sigEnd);
  _sigCanvas.addEventListener('touchstart', function(e) { e.preventDefault(); _sigStart(e.touches[0]); }, { passive: false });
  _sigCanvas.addEventListener('touchmove', function(e) { e.preventDefault(); _sigMove(e.touches[0]); }, { passive: false });
  _sigCanvas.addEventListener('touchend', _sigEnd, { passive: false });
}

function _sigGetPos(e) {
  var r = _sigCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function _sigStart(e) {
  _sigDrawing = true;
  var p = _sigGetPos(e);
  _sigCtx.beginPath();
  _sigCtx.moveTo(p.x, p.y);
  if (!_sigHas) {
    _sigHas = true;
    var ph = document.getElementById('sig-placeholder');
    if (ph) ph.style.display = 'none';
    var se = document.getElementById('sig-err');
    if (se) se.style.display = 'none';
  }
}
function _sigMove(e) {
  if (!_sigDrawing) return;
  var p = _sigGetPos(e);
  _sigCtx.lineTo(p.x, p.y);
  _sigCtx.stroke();
}
function _sigEnd() { _sigDrawing = false; }

function clearSignature() {
  if (!_sigCtx) return;
  _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);
  _sigHas = false;
  var ph = document.getElementById('sig-placeholder');
  if (ph) ph.style.display = 'flex';
}
function hasSignature() { return _sigHas; }
function getSignatureDataUrl() {
  if (!_sigHas || !_sigCanvas) return null;
  return _sigCanvas.toDataURL('image/png');
}

// ─── HOW-IT-WORKS STEPPER ─────────────────────────────────────────────────────
function showStep(n) {
  for (let i = 1; i <= 3; i++) {
    const content = document.getElementById('step-content-' + i);
    const btn = document.getElementById('step-btn-' + i);
    if (content) content.style.display = i === n ? '' : 'none';
    if (btn) {
      btn.classList.toggle('step-dark-active', i === n);
    }
  }
}

// ─── INTERSECTION OBSERVER (scroll animations) ────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        el.style.transitionDelay = (el.dataset.delay || 0) + 'ms';
        el.classList.add('visible');
        io.unobserve(el);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.scroll-anim').forEach(function(el) { io.observe(el); });

  // Navbar scroll behaviour — glass effect on scroll
  var nav = document.getElementById('landing-nav');
  var navLogoImg = document.getElementById('nav-logo-img');
  if (nav) {
    function _updateNav() {
      if (window.scrollY > 50) {
        nav.style.background = 'rgba(255,255,255,0.95)';
        nav.style.backdropFilter = 'blur(20px)';
        nav.style.borderBottom = '1px solid rgba(0,0,0,0.08)';
        nav.style.boxShadow = '0 2px 20px rgba(0,0,0,0.06)';
        if (navLogoImg) navLogoImg.src = '/assets/logo-blue.png';
      } else {
        nav.style.background = 'transparent';
        nav.style.backdropFilter = 'none';
        nav.style.borderBottom = 'none';
        nav.style.boxShadow = 'none';
        if (navLogoImg) navLogoImg.src = '/assets/logo-white.png';
      }
    }
    window.addEventListener('scroll', _updateNav, { passive: true });
    _updateNav();
  }
});
