/* ============================================================
   SOCRATES — ERKENNTNIS TEILEN
   Canvas-basierte Share-Karte (1080×1080 PNG)
   ============================================================ */

/**
 * Zeichnet eine elegante Erkenntnis-Karte und lädt sie als PNG herunter.
 * @param {string} text       – Die Erkenntnis
 * @param {string} dateLabel  – z.B. "11. April 2026"
 */
export async function shareInsight(text, dateLabel) {
  const SIZE  = 1080;
  const PAD   = 80;

  const canvas  = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx     = canvas.getContext('2d');

  // ---- Hintergrund ----
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ---- Noise-Textur (subtil) ----
  _drawNoise(ctx, SIZE);

  // ---- Orb-Glow oben ----
  const orbGrad = ctx.createRadialGradient(SIZE / 2, 200, 0, SIZE / 2, 200, 360);
  orbGrad.addColorStop(0,   'rgba(201,169,110,0.12)');
  orbGrad.addColorStop(0.5, 'rgba(201,169,110,0.04)');
  orbGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = orbGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ---- Logo ----
  ctx.font         = '300 36px "Cormorant Garamond", Georgia, serif';
  ctx.letterSpacing = '0.2em';
  ctx.fillStyle    = 'rgba(201,169,110,0.7)';
  ctx.textAlign    = 'center';
  ctx.fillText('SOCRATES', SIZE / 2, PAD + 20);

  // ---- Trennlinie oben ----
  _drawLine(ctx, PAD, PAD + 44, SIZE - PAD, PAD + 44, 'rgba(201,169,110,0.2)');

  // ---- Datum ----
  ctx.font      = '400 22px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText(dateLabel || '', SIZE / 2, PAD + 84);

  // ---- Erkenntnis-Text (mehrzeilig, italik) ----
  ctx.font         = '300 italic 52px "Cormorant Garamond", Georgia, serif';
  ctx.fillStyle    = '#F0EDE8';
  ctx.textAlign    = 'center';
  ctx.letterSpacing = '0.01em';

  const lines    = _wrapText(ctx, text, SIZE - PAD * 2.8, 52);
  const lineH    = 72;
  const blockH   = lines.length * lineH;
  let   textY    = (SIZE - blockH) / 2 - 20;
  textY          = Math.max(textY, PAD + 130);

  lines.forEach((line, i) => {
    ctx.fillText(line, SIZE / 2, textY + i * lineH);
  });

  // ---- Trennlinie unten ----
  const bottomY = SIZE - PAD - 60;
  _drawLine(ctx, PAD, bottomY, SIZE - PAD, bottomY, 'rgba(201,169,110,0.2)');

  // ---- Watermark ----
  ctx.font      = '400 20px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'center';
  ctx.fillText('socrates.app', SIZE / 2, SIZE - PAD + 10);

  // ---- Download ----
  const filename = `socrates-${(dateLabel || 'erkenntnis').replace(/\s/g, '-').toLowerCase()}.png`;
  await _downloadCanvas(canvas, filename);
}

/* ---- HELPERS ---- */

function _wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let   line  = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  // Maximal 7 Zeilen; Rest abschneiden mit …
  if (lines.length > 7) {
    lines.splice(7);
    lines[6] = lines[6].replace(/\s\S+$/, '') + '…';
  }
  return lines;
}

function _drawLine(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function _drawNoise(ctx, size) {
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = (Math.random() > 0.5 ? 1 : 0) * (Math.random() * 8);
    imageData.data[i]     = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = Math.floor(Math.random() * 12);
  }
  ctx.putImageData(imageData, 0, 0);
}

async function _downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(); return; }
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
        resolve();
      }, 300);
    }, 'image/png');
  });
}

/* ---- QUICK SHARE (Web Share API falls verfügbar) ---- */
export async function nativeShareInsight(text, dateLabel) {
  if (!navigator.share) {
    await shareInsight(text, dateLabel);
    return;
  }
  try {
    await navigator.share({
      title: 'Meine Erkenntnis — Socrates',
      text: `${text}\n\n— Socrates, ${dateLabel}`,
    });
  } catch (err) {
    // User hat abgebrochen oder Share fehlgeschlagen — Fallback
    if (err.name !== 'AbortError') {
      await shareInsight(text, dateLabel);
    }
  }
}
