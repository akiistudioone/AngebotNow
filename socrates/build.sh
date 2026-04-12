#!/usr/bin/env bash
# ============================================================
# SOCRATES — BUILD SCRIPT
# Ersetzt %%PLACEHOLDER%% in allen HTML-Dateien.
# Wird von Netlify ausgeführt (base = socrates/).
# ============================================================

set -euo pipefail

echo "==> Ersetze Config-Platzhalter in HTML-Dateien..."

# Alle HTML-Dateien finden (außer node_modules / .netlify)
mapfile -t HTML_FILES < <(find . -name "*.html" \
  -not -path "./.netlify/*" \
  -not -path "./node_modules/*")

if [ ${#HTML_FILES[@]} -eq 0 ]; then
  echo "    Keine HTML-Dateien gefunden."
else
  for file in "${HTML_FILES[@]}"; do
    echo "    → $file"

    # SUPABASE_URL
    if [ -n "${SUPABASE_URL:-}" ]; then
      sed -i "s|%%SUPABASE_URL%%|${SUPABASE_URL}|g" "$file"
    fi

    # SUPABASE_ANON_KEY
    if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
      sed -i "s|%%SUPABASE_ANON_KEY%%|${SUPABASE_ANON_KEY}|g" "$file"
    fi

    # STRIPE_CHECKOUT_URL
    if [ -n "${STRIPE_CHECKOUT_URL:-}" ]; then
      sed -i "s|%%STRIPE_CHECKOUT_URL%%|${STRIPE_CHECKOUT_URL}|g" "$file"
    fi

    # VAPID_PUBLIC_KEY
    if [ -n "${VAPID_PUBLIC_KEY:-}" ]; then
      sed -i "s|%%VAPID_PUBLIC_KEY%%|${VAPID_PUBLIC_KEY}|g" "$file"
    fi
  done
fi

# npm-Abhängigkeiten der Netlify Functions installieren
if [ -f "netlify/functions/package.json" ]; then
  echo "==> Installiere Function-Dependencies..."
  cd netlify/functions
  npm install --production --silent
  cd ../..
fi

echo "==> Build abgeschlossen."
