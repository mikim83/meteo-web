#!/bin/bash
# Copia al repositorio los ficheros públicos de /data/meteo (lista blanca: lo que no está aquí no se sube).
# Uso:  scripts/sync-to-repo.sh [ruta_del_repo]     (por defecto, el repo que contiene este script)
# No copia credenciales, datos generados (index.json, forecast.json, historico_*.json...), históricos
# (meteo_*.txt, YYYY/MM/DD) ni logs. Las credenciales se documentan con los *.example del repo.
set -euo pipefail

SRC="/data/meteo"
DST="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

WEB="index.html script-d3.js styles.css historico.html historico.css historico.js
     incendios.html incendios.css incendios.js instrucciones.html INSTRUCCIONES.md
     robots.txt sitemap.xml llms.txt package.json package-lock.json"
SCRIPTS="fetch.py fetch_forecast.py aggregate.py export_yearly.py render_summary.py send_jdserver.py
         build.sh run_news_agent.sh run_heatwave_agent.sh run_incendios_agent.sh sync-to-repo.sh"

mkdir -p "$DST/scripts/prompts"
for f in $WEB; do cp -p "$SRC/$f" "$DST/$f"; done
for f in $SCRIPTS; do cp -p "$SRC/scripts/$f" "$DST/scripts/$f"; done
cp -p "$SRC"/scripts/prompts/*.txt "$DST/scripts/prompts/"

# index.html lleva un resumen en texto que render_summary.py reescribe cada minuto: se deja vacío
python3 - "$DST/index.html" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = re.sub(r"(<!-- RESUMEN:START -->).*?(<!-- RESUMEN:END -->)", r"\1\n\2", s, flags=re.S)
open(p, "w", encoding="utf-8").write(s)
PY

# Comprobación: ningún secreto conocido en lo copiado
for secret in "$SRC/.cf_env" "$SRC/.aemet_env" "$HOME/.config/meteo/jdserver.key" "$HOME/.config/meteo/aemet.key"; do
  [ -f "$secret" ] || continue
  val="$(sed -E 's/^(export )?[A-Z_0-9]+=//' "$secret" | tr -d '"'"'" | tr -d '\r')"
  while IFS= read -r v; do
    [ ${#v} -ge 12 ] || continue
    if grep -rqF --exclude-dir=.git -e "$v" "$DST"; then echo "¡SECRETO de $secret encontrado en el repo!" >&2; exit 1; fi
  done <<< "$val"
done
echo "Sincronizado en $DST"
