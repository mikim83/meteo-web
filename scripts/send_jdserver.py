#!/usr/bin/env python3
"""Envía index.json (tal cual, sin modificar) a jdserver.es cada minuto.

URL, método y respuestas según las instrucciones de JDServer:
  202 -> lectura aceptada; 200 con status=duplicate -> ya recibida (no se reenvía);
  429 -> se espera lo que diga Retry-After antes de volver a intentarlo.
La clave va solo en la cabecera Authorization (fichero ~/.config/meteo/jdserver.key, chmod 600).
Tras un POST correcto (202 o 200 duplicate) hace un GET a Healthchecks (hc-ping.com).
Configuración:
  ~/.config/meteo/jdserver.key  clave privada de JDServer (una línea, chmod 600).
  HEALTHCHECKS_URL              (opcional, variable de entorno) URL de ping de Healthchecks,
                                p. ej. https://hc-ping.com/<uuid>. Hay que crear un check en
                                https://healthchecks.io y poner aquí su URL; si no se define,
                                no se hace ping.
Cron: * * * * * sleep 15; /data/meteo/scripts/send_jdserver.py >> /tmp/send_jdserver.log 2>&1
"""
import email.utils
import fcntl
import json
import os
import sys
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

URL = "https://www.jdserver.es/2026/api/ingest/cerdanyola_ateneu.php"
SRC = "/data/meteo/index.json"
KEY_FILE = os.path.expanduser("~/.config/meteo/jdserver.key")
STATE_FILE = os.path.expanduser("~/.local/state/meteo/jdserver.json")
MAX_BYTES = 16 * 1024
TIMEOUT = 20
PING_URL = os.environ.get("HEALTHCHECKS_URL")  # Healthchecks: solo si el POST fue bien; vacío = sin ping


def log(msg):
    print(f"{datetime.now().isoformat(timespec='seconds')} {msg}", flush=True)


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def retry_after(value, default=60):
    """Retry-After en segundos o como fecha HTTP."""
    value = (value or "").strip()
    if value.isdigit():
        return int(value)
    try:
        return max(0, int(email.utils.parsedate_to_datetime(value).timestamp() - time.time()))
    except (TypeError, ValueError):
        return default


def ping():
    if not PING_URL:
        return
    try:
        with urlopen(Request(PING_URL, headers={"User-Agent": "meteo-dob-world/1.0"}), timeout=10) as r:
            r.read(100)
        log("ping Healthchecks ok")
    except (URLError, OSError) as e:
        log(f"ping de Healthchecks falló: {e}")


def main():
    lock = open(STATE_FILE + ".lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # ya hay otro envío en marcha

    state = load_state()
    if state.get("retry_until", 0) > time.time():
        log(f"en espera por 429 hasta {datetime.fromtimestamp(state['retry_until']).strftime('%H:%M:%S')}")
        return

    with open(SRC, "rb") as f:
        body = f.read()
    if len(body) > MAX_BYTES:
        log(f"index.json pesa {len(body)} B (máximo {MAX_BYTES}): no se envía")
        return
    try:
        updated = json.loads(body).get("updated")
    except ValueError:
        log("index.json no es JSON válido: no se envía")
        return
    if updated and updated == state.get("last_updated"):
        return  # misma lectura que la última aceptada

    with open(KEY_FILE) as f:
        key = f.read().strip()
    req = Request(URL, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "User-Agent": "meteo-dob-world/1.0",
    })
    try:
        with urlopen(req, timeout=TIMEOUT) as r:  # verifica el certificado por defecto
            code, text, headers = r.status, r.read(2000).decode("utf-8", "replace"), r.headers
    except HTTPError as e:
        code, text, headers = e.code, e.read(2000).decode("utf-8", "replace"), e.headers
    except (URLError, OSError) as e:
        log(f"error de red: {e}")
        return

    if code == 202:
        state.update(last_updated=updated, retry_until=0)
        save_state(state)
        log(f"202 aceptada ({updated})")
        ping()
    elif code == 200:
        try:
            status = json.loads(text).get("status")
        except ValueError:
            status = None
        if status == "duplicate":
            state.update(last_updated=updated, retry_until=0)
            save_state(state)
            log(f"200 duplicada ({updated})")
            ping()
        else:
            log(f"200 respuesta inesperada: {text[:200]}")
    elif code == 429:
        wait = retry_after(headers.get("Retry-After"))
        state["retry_until"] = time.time() + wait
        save_state(state)
        log(f"429: espero {wait} s")
    else:
        log(f"HTTP {code}: {text[:200]}")


if __name__ == "__main__":
    sys.exit(main())
