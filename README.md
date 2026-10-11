# meteo-web

Código de [meteo.dob-world.com](https://meteo.dob-world.com): web y scripts de una estación meteorológica personal (Davis Vantage Vue) en Cerdanyola del Vallès, Barcelona.

Proyecto personal. Los datos de la estación son aficionados y no oficiales. Este repositorio contiene el código y ejemplos de los formatos de datos; los datos reales (tiempo real, histórico, previsión) se sirven desde la propia web y **no** están en el repositorio.

## Qué hace

- **Tiempo real:** lee la estación cada minuto y publica `index.json` y un CSV por día.
- **Previsión:** combina AEMET, Météo-France AROME, ECMWF IFS, DWD ICON y Open-Meteo en `forecast.json` (cada 30 minutos). El esquema está en [`llms.txt`](llms.txt).
- **Histórico:** agregados diarios por año y un fichero de texto anual con todas las lecturas.
- **Web:** página principal con gráficos de 24 h, arco solar, fase lunar y previsión (pestañas «Próximas horas» y «7 días»), más las páginas de histórico e incendios.
- **Agentes (Claude):** actualizan `news.json` (noticias), `incendios.json` y `heatwave_status.json` (ola de calor) dos veces al día.
- **Envío a JDServer:** `index.json` se envía cada minuto a [meteocerdanyola.com](https://meteocerdanyola.com).
- **Para IA y lectores sin JavaScript:** `llms.txt`, `robots.txt`, `sitemap.xml`, un resumen en texto dentro de `index.html` y `index.md` (nginx lo sirve con `Accept: text/markdown`).

## Arquitectura

```
Estación Davis ─► WiFiLogger 2 (LAN) ─► scripts/fetch.py ─► /data/meteo/index.json + YYYY/MM/DD/today.txt
                                                              │
        scripts/render_summary.py  ◄──────────────────────────┤──► scripts/send_jdserver.py ─► JDServer (+ ping Healthchecks)
        (resumen en index.html e index.md)                    │
                                                              ▼
 scripts/fetch_forecast.py ─► forecast.json          nginx (Docker) ─► Cloudflare Tunnel ─► meteo.dob-world.com
 scripts/aggregate.py ─► historico_*.json                         ▲
 scripts/export_yearly.py ─► meteo_<año>.txt                      │ purga de caché
 scripts/run_*_agent.sh (Claude) ─► news / incendios / ola de calor ┘
```

La estación publica sus datos mediante un [WiFiLogger 2](https://wifilogger.net) en la red local. El servidor lo consulta cada minuto.

La web se sirve con nginx en Docker, detrás de un túnel de Cloudflare. Por eso, cuando un agente cambia un fichero, hay que **invalidar la caché de Cloudflare** (los agentes lo hacen con la API de Cloudflare y las credenciales de `.cf_env`).

## Estructura

El repositorio replica la estructura de `/data/meteo` en el servidor (raíz que sirve nginx):

```
index.html, script-d3.js, styles.css      # página principal
historico.{html,css,js}                   # histórico
incendios.{html,css,js}                   # incendios en Cataluña
instrucciones.html, INSTRUCCIONES.md      # cómo se usa la web
llms.txt, robots.txt, sitemap.xml         # para IA y buscadores
package.json                              # terser, para minificar script-d3.js
requirements.txt                          # dependencias de Python (requests, pytz)
scripts/                                  # todo lo que se ejecuta en el servidor
├── fetch.py                              # lectura de la estación (WiFiLogger 2)
├── fetch_forecast.py                     # previsión (forecast.json)
├── aggregate.py                          # histórico diario (historico_*.json)
├── export_yearly.py                      # export anual (meteo_<año>.txt)
├── render_summary.py                     # resumen en index.html e index.md
├── send_jdserver.py                      # envío de index.json a JDServer + ping Healthchecks
├── build.sh                              # minifica script-d3.js
├── run_{news,heatwave,incendios}_agent.sh# agentes de Claude + purga de caché de Cloudflare
├── prompts/                              # instrucciones de los agentes
├── crontab.example                       # tareas programadas
└── sync-to-repo.sh                       # copia al repo los ficheros públicos del servidor
examples/                                 # ejemplos de los formatos de datos (no son datos reales)
config/                                   # ejemplos de ficheros de credenciales
```

## Instalación

```bash
git clone git@github.com:mikim83/meteo-web.git /data/meteo
cd /data/meteo
pip install -r requirements.txt      # requests, pytz (el resto de scripts usa la biblioteca estándar)
npm install                          # terser, para build.sh
crontab -e                           # pega y ajusta scripts/crontab.example
```

Requiere Python 3.9 o superior (usa `zoneinfo`).

## Credenciales (nunca en el repositorio)

| Fichero | Para qué | Ejemplo |
|---|---|---|
| `/data/meteo/.cf_env` | Token y zona de Cloudflare para purgar la caché | [`.cf_env.example`](.cf_env.example) |
| `/data/meteo/.aemet_env` | Clave de AEMET OpenData (reservada, ningún script la usa todavía) | [`.aemet_env.example`](.aemet_env.example) |
| `~/.config/meteo/jdserver.key` | Clave privada de JDServer | [`config/jdserver.key.example`](config/jdserver.key.example) |

Ponles permisos `600`. Además, `.gitignore` los excluye, y `scripts/sync-to-repo.sh` comprueba que ningún valor secreto se cuela en lo que copia al repositorio.

**Importante:** como `/data/meteo` es la raíz que sirve nginx, hay que impedir que se sirvan los ficheros internos. Bloque de nginx para el servidor de la web:

```nginx
# Accept: text/markdown -> versión Markdown de la home
location = / { if ($meteo_wants_md) { rewrite ^ /index.md last; } }
location = /index.md { default_type "text/markdown; charset=utf-8"; }

# Ficheros internos que no deben servirse nunca
location ~ /\.(?!well-known) { deny all; }
location ~ ^/(scripts|node_modules|old-web|old-new-web|backup-[^/]+|__pycache__)(/|$) { deny all; }
location ~* ^/(package(-lock)?\.json)$ { deny all; }
location ~* \.(log|py|sh)$ { deny all; }
```

(`map $http_accept $meteo_wants_md { default 0; "~*text/markdown" 1; }` va fuera del `server`.)

## Variables de entorno

| Variable | Script | Descripción |
|---|---|---|
| `WIFILOGGER_URL` | `fetch.py` | URL de tiempo real del WiFiLogger 2, p. ej. `http://192.168.2.15/rtd` (obligatoria) |
| `HEALTHCHECKS_URL` | `send_jdserver.py` | URL de ping de [Healthchecks](https://healthchecks.io); hay que crear un check y poner aquí su URL. Opcional: sin ella no se hace ping |

Se definen al principio del crontab (ver [`scripts/crontab.example`](scripts/crontab.example)).

## Ejemplos de datos

En [`examples/`](examples) hay muestras muy pequeñas de los formatos:

- [`index.example.json`](examples/index.example.json): lectura en tiempo real (`index.json`).
- [`meteo_2026.example.txt`](examples/meteo_2026.example.txt): 6 líneas del fichero anual (CSV sin cabecera: fecha y hora, temperatura exterior, humedad, viento, dirección en grados y en rosa, presión, temperatura y humedad interiores, sensación térmica, punto de rocío, racha, lluvia del día y tendencia de presión).
- [`historico_2026.example.json`](examples/historico_2026.example.json): 3 días del histórico agregado.

Los datos completos se pueden descargar de la web (por ejemplo `https://meteo.dob-world.com/meteo_2025.txt`).

## Relacionados

- [meteocerdanyola-trmnl-dashboard](https://github.com/mikim83/meteocerdanyola-trmnl-dashboard) y [cerdanyola-trmnl-forecast](https://github.com/mikim83/cerdanyola-trmnl-forecast): plugins de TRMNL.
- [cloudflare-session-token](https://github.com/mikim83/cloudflare-session-token): Worker de Cloudflare que añade la cabecera `Session-Token`.

## Licencia

Código bajo licencia [MIT](LICENSE).
