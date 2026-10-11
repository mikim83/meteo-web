#!/usr/bin/python3
"""Escribe un resumen en texto de index.json dentro de index.html (entre los
marcadores RESUMEN:START/END) y una versión Markdown (index.md, que nginx sirve
con Accept: text/markdown) para que lectores sin JavaScript vean los datos.
index.json solo se LEE; este script nunca lo modifica."""

import html
import json
import os
import re
import tempfile
from datetime import datetime

BASE = "/data/meteo/"
TRENDS = {
    "Rising Rapidly": "subiendo rápido",
    "Rising Slowly": "subiendo despacio",
    "Steady": "estable",
    "Falling Slowly": "bajando despacio",
    "Falling Rapidly": "bajando rápido",
}


def num(d, key, unit="", dec=None):
    v = d.get(key)
    if v in (None, "", "---"):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    s = f"{f:.{dec}f}" if dec is not None else f"{f:g}"
    return f"{s.replace('.', ',')}{unit}"


def direction(v):
    return v.replace("W", "O") if v and v != "---" else None


def when_of(d):
    when = d.get("updated", "")
    try:
        return datetime.fromisoformat(when).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return when


def rows_of(d):
    wind = num(d, "wind_speed", " km/h")
    wdir = direction(d.get("wind_dir"))
    gust = num(d, "wind_gust", " km/h")
    gdir = direction(d.get("gust_dir"))
    trend = TRENDS.get(d.get("pressure_trend"), d.get("pressure_trend"))
    return [
        ("Temperatura exterior", num(d, "ext_temp", " °C")),
        ("Humedad exterior", num(d, "ext_hum", " %")),
        ("Sensación térmica", num(d, "heat_index", " °C")),
        ("Punto de rocío", num(d, "dew_point", " °C")),
        ("Temperatura interior", num(d, "int_temp", " °C")),
        ("Humedad interior", num(d, "int_hum", " %")),
        ("Máxima 24 h", (num(d, "max_temp_24h", " °C") or "") + (f" a las {d['max_temp_24h_time']}" if d.get("max_temp_24h_time") else "") or None),
        ("Mínima 24 h", (num(d, "min_temp_24h", " °C") or "") + (f" a las {d['min_temp_24h_time']}" if d.get("min_temp_24h_time") else "") or None),
        ("Viento", f"{wind}{' del ' + wdir if wdir else ''}" if wind else None),
        ("Viento medio 10 min", num(d, "wind_avg10", " km/h")),
        ("Racha", f"{gust}{' del ' + gdir if gdir else ''}" if gust else None),
        ("Presión", (num(d, "pressure", " mbar") or "") + (f", {trend}" if trend else "") or None),
        ("Lluvia hoy", num(d, "rain_daily", " mm")),
        ("Lluvia últimas 24 h", num(d, "rain_24h", " mm")),
        ("Intensidad de lluvia", num(d, "rain_rate", " mm/h")),
    ]


def build(d):
    when = when_of(d)
    rows = rows_of(d)
    items = "\n".join(
        f"        <li>{html.escape(k)}: {html.escape(v)}</li>" for k, v in rows if v
    )
    return (
        f'      <h2>Datos actuales en Cerdanyola del Vallès (lectura de las {html.escape(when)}, hora de Madrid)</h2>\n'
        f"      <ul>\n{items}\n      </ul>\n"
        '      <p>Datos en JSON: <a href="index.json">index.json</a>. Descripción de los campos: <a href="llms.txt">llms.txt</a>.</p>'
    )


def build_md(d):
    when = when_of(d)
    lines = "\n".join(f"- {k}: {v}" for k, v in rows_of(d) if v)
    return f"""---
title: Meteo Cerdanyola del Vallès — Datos en tiempo real
description: Estación meteorológica Davis Vantage Vue en Cerdanyola del Vallès (Barcelona). Datos actuales, histórico, noticias e incendios.
url: https://meteo.dob-world.com/
updated: {d.get("updated", "")}
lang: es
location: Cerdanyola del Vallès, Barcelona (41.4911, 2.1401)
---

# Meteo Cerdanyola del Vallès

Datos actuales de la estación (lectura de las {when}, hora de Madrid). Se actualizan cada minuto.

## Ahora

{lines}

## Más datos

- [index.json](https://meteo.dob-world.com/index.json): última lectura en JSON, con todos los campos.
- [llms.txt](https://meteo.dob-world.com/llms.txt): descripción de los campos, unidades y ficheros de histórico.
- [Histórico](https://meteo.dob-world.com/historico.html): récords, extremos y resúmenes por mes y año.
- [forecast.json](https://meteo.dob-world.com/forecast.json): previsión de 7 días (AEMET, Météo-France AROME y Open-Meteo), con resumen de las próximas 24 h.
- [Noticias meteorológicas](https://meteo.dob-world.com/news.json) (JSON).
- [Incendios en Cataluña](https://meteo.dob-world.com/incendios.html) ([JSON](https://meteo.dob-world.com/incendios.json)).

Estación aficionada: los datos no son oficiales. Avisos oficiales en Meteocat (meteo.cat) y AEMET (aemet.es).
"""


def write_atomic(path, content):
    fd, tmp = tempfile.mkstemp(dir=BASE, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def main():
    with open(BASE + "index.json", encoding="utf-8") as f:
        d = json.load(f)
    path = BASE + "index.html"
    with open(path, encoding="utf-8") as f:
        page = f.read()
    new = re.sub(
        r"<!-- RESUMEN:START -->.*?<!-- RESUMEN:END -->",
        lambda m: f"<!-- RESUMEN:START -->\n{build(d)}\n<!-- RESUMEN:END -->",
        page,
        count=1,
        flags=re.S,
    )
    if new != page:
        write_atomic(path, new)
    write_atomic(BASE + "index.md", build_md(d))


if __name__ == "__main__":
    main()
