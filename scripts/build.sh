#!/bin/bash
# Regenera script-d3.min.js a partir de script-d3.js si el fuente ha cambiado.
# Uso manual:  ./build.sh
# Uso cron:    * * * * * /data/meteo/scripts/build.sh >> /data/meteo/build.log 2>&1
# Necesita las dependencias de package.json (npm install en la raíz del proyecto).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="script-d3.js"
MIN="script-d3.min.js"
TERSER="node_modules/.bin/terser"

if [ ! -x "$TERSER" ]; then
  echo "$(date -Iseconds) terser no encontrado, ejecuta: npm install" >&2
  exit 1
fi

if [ "$SRC" -nt "$MIN" ]; then
  TMP="$(mktemp --suffix=.js)"
  "$TERSER" "$SRC" -c -m -o "$TMP"
  node --check "$TMP"
  chmod 644 "$TMP"
  mv "$TMP" "$MIN"
  echo "$(date -Iseconds) rebuilt $MIN ($(wc -c < "$SRC") -> $(wc -c < "$MIN") bytes)"
fi
