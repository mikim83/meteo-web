#!/usr/bin/python3
"""Junta la previsión de varias fuentes en /data/meteo/forecast.json.

Fuentes:
  - AEMET (XML público del municipio 08266, Cerdanyola del Vallès): estado del
    cielo, probabilidad de lluvia y de tormenta, temperaturas máx/mín de 7 días.
  - Météo-France AROME HD (vía Open-Meteo, ~57 h): temperatura, viento y rachas
    con resolución de 1,5 km.
  - Lluvia (mm): media por hora de ECMWF IFS (9 km, 7 días), DWD ICON-EU (~5 días)
    y AROME HD (~57 h) mientras haya datos de cada uno. Así un solo modelo que
    discrepe del resto no decide la cantidad de lluvia.
  - Open-Meteo, modelo combinado (7 días): el resto de variables (UV, nubosidad,
    isoterma de 0 °C, presión...) y todo lo que las otras fuentes no cubren.

Se ejecuta por cron cada 30 minutos. Si una fuente falla se sigue con las demás;
si todas fallan no se toca el fichero anterior.
"""

import json
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "/data/meteo/"
OUT = BASE + "forecast.json"
LAT, LON = 41.4911, 2.1401
AEMET_ID = "08266"
TZ = ZoneInfo("Europe/Madrid")
UA = {"User-Agent": "meteo.dob-world.com forecast (contacto: dob-world.com)"}
DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]

HOURLY_VARS = ("temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,"
               "precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,"
               "wind_gusts_10m,uv_index,freezing_level_height,is_day")
DAILY_VARS = "weather_code,sunrise,sunset,uv_index_max,wind_gusts_10m_max"

# código WMO de Open-Meteo -> (emoji, etiqueta, código neutro de icono)
WMO = {
    0: ("☀️", "Despejado", "clear"), 1: ("🌤️", "Poco nuboso", "mostly_clear"), 2: ("⛅", "Intervalos nubosos", "partly_cloudy"),
    3: ("☁️", "Cubierto", "overcast"),
    45: ("🌫️", "Niebla", "fog"), 48: ("🌫️", "Niebla", "fog"),
    51: ("🌦️", "Llovizna", "light_rain"), 53: ("🌦️", "Llovizna", "light_rain"), 55: ("🌧️", "Llovizna fuerte", "rain"),
    56: ("🌧️", "Llovizna helada", "light_rain"), 57: ("🌧️", "Llovizna helada", "rain"),
    61: ("🌦️", "Lluvia débil", "light_rain"), 63: ("🌧️", "Lluvia", "rain"), 65: ("🌧️", "Lluvia fuerte", "heavy_rain"),
    66: ("🌧️", "Lluvia helada", "rain"), 67: ("🌧️", "Lluvia helada", "rain"),
    71: ("🌨️", "Nieve débil", "snow"), 73: ("🌨️", "Nieve", "snow"), 75: ("🌨️", "Nieve fuerte", "snow"), 77: ("🌨️", "Granizo fino", "snow"),
    80: ("🌦️", "Chubascos", "light_rain"), 81: ("🌧️", "Chubascos", "rain"), 82: ("🌧️", "Chubascos fuertes", "heavy_rain"),
    85: ("🌨️", "Chubascos de nieve", "snow"), 86: ("🌨️", "Chubascos de nieve", "snow"),
    95: ("⛈️", "Tormenta", "thunder"), 96: ("⛈️", "Tormenta con granizo", "thunder"), 99: ("⛈️", "Tormenta con granizo", "thunder"),
}
RAIN_CODES = {"light_rain", "rain", "heavy_rain", "thunder"}


def log(msg):
    print(f"{datetime.now().isoformat(timespec='seconds')} {msg}", flush=True)


def get(url, timeout=40):
    with urlopen(Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def num(v, nd=None):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if nd is not None else f


def cardinal(deg):
    return None if deg is None else DIRS[round((deg % 360) / 22.5) % 16]


def sky_wmo(code, is_day=True):
    """Cielo según el código WMO: emoji (web), etiqueta, código neutro (icono en otras pantallas) y noche."""
    if code is None or int(code) not in WMO:
        return {"code": "unknown", "emoji": "", "label": "", "night": not is_day}
    emoji, label, icon = WMO[int(code)]
    if icon in ("clear", "mostly_clear") and not is_day:
        emoji = "🌙"
    return {"code": icon, "emoji": emoji, "label": label, "night": not is_day}


def sky_aemet(code, desc):
    """Cielo según el estado de AEMET (código p. ej. '12', '26', '11n' + descripción)."""
    code = (code or "").strip()
    desc = (desc or "").strip()
    if not code and not desc:
        return None
    night = code.endswith("n")
    t = desc.lower()
    if "tormenta" in t:
        icon, emoji = "thunder", "⛈️"
    elif "nieve" in t:
        icon, emoji = "snow", "🌨️"
    elif "lluvia" in t:
        icon, emoji = ("light_rain", "🌦️") if "escasa" in t else ("rain", "🌧️")
    elif "niebla" in t or "bruma" in t or "calima" in t:
        icon, emoji = "fog", "🌫️"
    elif "despejado" in t:
        icon, emoji = "clear", "🌙" if night else "☀️"
    elif "poco nuboso" in t:
        icon, emoji = "mostly_clear", "☁️" if night else "🌤️"
    elif "intervalos" in t or "nubes altas" in t:
        icon, emoji = "partly_cloudy", "☁️" if night else "⛅"
    elif "cubierto" in t:
        icon, emoji = "overcast", "☁️"
    else:
        icon, emoji = "cloudy", "☁️"
    return {"code": icon, "emoji": emoji, "label": desc, "night": night}


# ---------------------------------------------------------------- AEMET ----

def parse_xml(raw):
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        s = raw.decode("iso-8859-15")
    return ET.fromstring(re.sub(r"^<\?xml[^>]*\?>", "", s.strip()))


def aemet_hourly():
    root = parse_xml(get(f"https://www.aemet.es/xml/municipios_h/localidad_h_{AEMET_ID}.xml"))
    out = {}   # "YYYY-MM-DDTHH:00" -> dict

    def slot(date, hour):
        return out.setdefault(f"{date}T{hour:02d}:00", {})

    for dia in root.iter("dia"):
        date = dia.get("fecha")
        for el in dia:
            per = el.get("periodo") or ""
            if len(per) == 2:
                h = int(per)
                if el.tag == "estado_cielo":
                    slot(date, h)["sky"] = sky_aemet(el.text, el.get("descripcion"))
                elif el.tag == "viento":
                    d = el.findtext("direccion"); v = el.findtext("velocidad")
                    slot(date, h)["wind_dir"] = (d or "").strip() or None
                    slot(date, h)["wind"] = num(v)
                elif el.tag in ("temperatura", "sens_termica", "humedad_relativa", "racha_max", "precipitacion"):
                    key = {"temperatura": "temp", "sens_termica": "feels", "humedad_relativa": "hum",
                           "racha_max": "gust", "precipitacion": "precip"}[el.tag]
                    slot(date, h)[key] = num(el.text)
            elif len(per) == 4 and el.tag in ("prob_precipitacion", "prob_tormenta"):
                start, end = int(per[:2]), int(per[2:])
                d0 = datetime.strptime(date, "%Y-%m-%d")
                n = (end - start) % 24 or 24
                for k in range(n):
                    t = d0 + timedelta(hours=start + k)
                    key = "pop" if el.tag == "prob_precipitacion" else "pop_storm"
                    out.setdefault(t.strftime("%Y-%m-%dT%H:00"), {})[key] = num(el.text)
    return out, root.findtext("elaborado")


def aemet_daily():
    root = parse_xml(get(f"https://www.aemet.es/xml/municipios/localidad_{AEMET_ID}.xml"))
    days = {}
    for dia in root.iter("dia"):
        date = dia.get("fecha")
        d = {}
        pops, skies, winds = {}, {}, {}
        for el in dia:
            per = el.get("periodo")
            if el.tag == "prob_precipitacion" and (el.text or "").strip():
                pops[per] = num(el.text)
            elif el.tag == "estado_cielo" and (el.text or "").strip():
                skies[per] = sky_aemet(el.text, el.get("descripcion"))
            elif el.tag == "viento" and (el.findtext("velocidad") or "").strip():
                winds[per] = ((el.findtext("direccion") or "").strip() or None, num(el.findtext("velocidad")))
            elif el.tag == "temperatura":
                d["tmax"] = num(el.findtext("maxima")); d["tmin"] = num(el.findtext("minima"))
            elif el.tag == "sens_termica":
                d["feels_max"] = num(el.findtext("maxima")); d["feels_min"] = num(el.findtext("minima"))
            elif el.tag == "humedad_relativa":
                d["hum_max"] = num(el.findtext("maxima")); d["hum_min"] = num(el.findtext("minima"))
            elif el.tag == "uv_max":
                d["uv_max"] = num(el.text)
        d["pop"] = pops.get("00-24") if pops.get("00-24") is not None else (max(pops.values()) if pops else None)
        for per in ("00-24", "06-12", "12-24", "12-18", "00-12"):
            if per in skies:
                d["sky"] = skies[per]; break
        for per in ("00-24", "06-12", "12-24", "00-12"):
            if per in winds:
                d["wind_dir"], d["wind"] = winds[per]; break
        days[date] = d
    return days, root.findtext("elaborado")


# ----------------------------------------------------------- Open-Meteo ----

def open_meteo(models=None, days=7, hourly=HOURLY_VARS, daily=DAILY_VARS):
    q = {"latitude": LAT, "longitude": LON, "hourly": hourly, "daily": daily,
         "timezone": "Europe/Madrid", "forecast_days": days, "wind_speed_unit": "kmh"}
    if models:
        q["models"] = models
    return json.loads(get("https://api.open-meteo.com/v1/forecast?" + urlencode(q)))


def hourly_rows(data):
    h = data.get("hourly", {})
    rows = {}
    for i, t in enumerate(h.get("time", [])):
        rows[t] = {k: (h[k][i] if i < len(h.get(k, [])) else None) for k in h if k != "time"}
    return rows


# --------------------------------------------------------------- fusión ----

def rain_windows(hrs):
    """Tramos consecutivos con lluvia prevista: [{"from": "15", "to": "19", "mm": 2.4}] (hora local, 'to' exclusiva)."""
    wins, cur = [], None
    for hr in hrs:
        wet = (hr["precip"] or 0) >= 0.1 or ((hr["pop"] or 0) >= 60 and hr["sky"]["code"] in RAIN_CODES)
        if wet and cur is None:
            cur = {"from": hr["t"], "mm": 0.0}
        if wet:
            cur["mm"] += hr["precip"] or 0
            cur["to"] = hr["t"]
        elif cur is not None:
            wins.append(cur); cur = None
    if cur is not None:
        wins.append(cur)
    out = []
    for w in wins:
        end = datetime.strptime(w["to"], "%Y-%m-%dT%H:%M") + timedelta(hours=1)
        out.append({"from": w["from"][11:13], "to": end.strftime("%H"), "mm": round(w["mm"], 1),
                    "from_t": w["from"], "to_t": end.strftime("%Y-%m-%dT%H:00")})
    return out


def summarize(hours, days):
    """Resumen de las próximas 24 h (se calcula aquí para que la web y otros consumidores usen lo mismo)."""
    nxt = hours[:24]
    temps = [h for h in nxt if h["temp"] is not None]
    tmax = max(temps, key=lambda h: h["temp"]) if temps else None
    tmin = min(temps, key=lambda h: h["temp"]) if temps else None
    gust = max((h["gust"] for h in nxt if h["gust"] is not None), default=None)
    wind = max((h["wind"] for h in nxt if h["wind"] is not None), default=None)
    wins = rain_windows(nxt)
    total = round(sum(h["precip"] or 0 for h in nxt), 1)
    cur = nxt[0] if nxt else {}
    return {
        "hours": len(nxt),
        "tmax": tmax["temp"] if tmax else None, "tmax_time": tmax["t"][11:16] if tmax else None,
        "tmin": tmin["temp"] if tmin else None, "tmin_time": tmin["t"][11:16] if tmin else None,
        "precip_mm": total,
        "pop_max": max((h["pop"] for h in nxt if h["pop"] is not None), default=None),
        "rain": wins,
        "rain_expected": bool(wins),
        "wind_max": wind, "gust_max": gust,
        "uv_max_today": days[0]["uv"] if days else None,
        "sunrise": days[0]["sunrise"] if days else None, "sunset": days[0]["sunset"] if days else None,
        "now": {k: cur.get(k) for k in ("t", "ts", "sky", "temp", "feels", "pop", "uv", "cloud", "freezing", "pressure", "hum", "dew")},
    }


def build():
    sources = {}
    try:
        base = open_meteo()
        sources["open-meteo"] = {"ok": True, "model": "combinado"}
    except Exception as e:
        log(f"open-meteo FALLÓ: {e}")
        return None
    base_h = hourly_rows(base)
    try:
        arome = hourly_rows(open_meteo("meteofrance_arome_france_hd", 3))
        sources["arome"] = {"ok": True, "model": "Météo-France AROME HD 1,5 km"}
    except Exception as e:
        log(f"AROME falló: {e}"); arome = {}; sources["arome"] = {"ok": False}
    rain_models = {"AROME": arome}
    for key, label, model in (("ecmwf", "ECMWF IFS 9 km", "ecmwf_ifs"), ("icon", "DWD ICON-EU 7 km", "icon_eu")):
        try:
            rain_models[key.upper()] = hourly_rows(open_meteo(model, 7, hourly="precipitation", daily="weather_code"))
            sources[key] = {"ok": True, "model": label}
        except Exception as e:
            log(f"{label} falló: {e}"); sources[key] = {"ok": False}
    try:
        ah, ah_el = aemet_hourly(); sources["aemet"] = {"ok": True, "elaborado": ah_el}
    except Exception as e:
        log(f"AEMET horaria falló: {e}"); ah = {}; sources["aemet"] = {"ok": False}
    try:
        ad, ad_el = aemet_daily(); sources["aemet"]["elaborado_diaria"] = ad_el
    except Exception as e:
        log(f"AEMET diaria falló: {e}"); ad = {}

    now = datetime.now()
    start = now.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:00")
    hours = []
    for t in sorted(base_h):
        if t < start:
            continue
        b = base_h[t]; a = arome.get(t, {}); m = ah.get(t, {})
        is_day = bool(b.get("is_day", 1))
        use_arome = a.get("temperature_2m") is not None
        temp = a.get("temperature_2m") if use_arome else b.get("temperature_2m")
        votes = {k: rows.get(t, {}).get("precipitation") for k, rows in rain_models.items()}
        votes = {k: v for k, v in votes.items() if v is not None}
        if votes:
            precip = sum(votes.values()) / len(votes)
            precip_src = "+".join(sorted(votes))
        else:
            precip, precip_src = b.get("precipitation"), "Open-Meteo"
        wind = a.get("wind_speed_10m") if a.get("wind_speed_10m") is not None else b.get("wind_speed_10m")
        gust = a.get("wind_gusts_10m") if a.get("wind_gusts_10m") is not None else b.get("wind_gusts_10m")
        wdir = a.get("wind_direction_10m") if a.get("wind_direction_10m") is not None else b.get("wind_direction_10m")
        sky = m.get("sky") or sky_wmo(b.get("weather_code"), is_day)
        sky_adjusted = False
        # AEMET marca lluvia/tormenta, pero los modelos no ven nada de agua: el icono pasa
        # a cielo cubierto/nuboso según la nubosidad (el % de AEMET se conserva en pop/pop_storm).
        if sky["code"] in RAIN_CODES and precip is not None and precip < 0.2:
            cl = b.get("cloud_cover")
            cl = 100 if cl is None else cl
            wmo = 3 if cl >= 70 else 2 if cl >= 35 else 1 if cl >= 10 else 0
            sky = sky_wmo(wmo, is_day)
            sky_adjusted = True
        pop = m.get("pop") if m.get("pop") is not None else b.get("precipitation_probability")
        hours.append({
            "t": t,
            "ts": int(datetime.strptime(t, "%Y-%m-%dT%H:%M").replace(tzinfo=TZ).timestamp()),
            "temp": num(temp, 1),
            "feels": num(b.get("apparent_temperature"), 1),
            "hum": num(b.get("relative_humidity_2m"), 0),
            "dew": num(b.get("dew_point_2m"), 1),
            "pop": num(pop, 0),
            "pop_storm": m.get("pop_storm"),
            "precip": num(precip, 1),
            "wind": num(wind, 0),
            "gust": num(gust, 0),
            "wind_dir": cardinal(wdir),
            "wind_deg": num(wdir, 0),
            "pressure": num(b.get("pressure_msl"), 0),
            "cloud": num(b.get("cloud_cover"), 0),
            "uv": num(b.get("uv_index"), 1),
            "freezing": num(b.get("freezing_level_height"), 0),
            "is_day": is_day,
            "sky": sky,
            "src": {"temp": "AROME" if use_arome else "Open-Meteo", "sky": ("AEMET" if m.get("sky") else "Open-Meteo") + (" (ajustado por modelos)" if sky_adjusted else ""), "precip": precip_src},
        })

    # días: AEMET manda en máx/mín, cielo, probabilidad y viento; el resto, del modelo
    d = base.get("daily", {})
    by_date = {}
    for hr in hours:
        by_date.setdefault(hr["t"][:10], []).append(hr)
    days = []
    for i, date in enumerate(d.get("time", [])):
        ae = ad.get(date, {})
        hs = by_date.get(date, [])
        temps = [x["temp"] for x in hs if x["temp"] is not None]
        precips = [x["precip"] for x in hs if x["precip"] is not None]
        pops = [x["pop"] for x in hs if x["pop"] is not None]
        winds = [x["wind"] for x in hs if x["wind"] is not None]
        sky = ae.get("sky") or sky_wmo(d.get("weather_code", [None] * 9)[i])
        days.append({
            "date": date,
            "sky": sky,
            "tmax": ae.get("tmax") if ae.get("tmax") is not None else (max(temps) if temps else None),
            "tmin": ae.get("tmin") if ae.get("tmin") is not None else (min(temps) if temps else None),
            "feels_max": ae.get("feels_max"),
            "pop": ae.get("pop") if ae.get("pop") is not None else (max(pops) if pops else None),
            "precip": round(sum(precips), 1) if precips else None,
            "wind": ae.get("wind") if ae.get("wind") is not None else (max(winds) if winds else None),
            "wind_dir": ae.get("wind_dir"),
            "gust": num(d.get("wind_gusts_10m_max", [None] * 9)[i], 0),
            "uv": ae.get("uv_max") if ae.get("uv_max") is not None else num(d.get("uv_index_max", [None] * 9)[i], 1),
            "sunrise": (d.get("sunrise", [None] * 9)[i] or "")[11:16] or None,
            "sunset": (d.get("sunset", [None] * 9)[i] or "")[11:16] or None,
            "hours_complete": len(hs) >= 20,
            "src": {"temp": "AEMET" if ae.get("tmax") is not None else "Open-Meteo",
                    "sky": "AEMET" if ae.get("sky") else "Open-Meteo"},
        })
    return {
        "schema": 1,
        "updated": now.astimezone().isoformat(timespec="seconds"),
        "timezone": "Europe/Madrid",
        "units": {"temp": "°C", "wind": "km/h", "gust": "km/h", "precip": "mm", "pop": "%", "pressure": "hPa",
                  "uv": "índice", "cloud": "%", "freezing": "m", "hum": "%"},
        "location": {"name": "Cerdanyola del Vallès", "lat": LAT, "lon": LON, "aemet_id": AEMET_ID},
        "sources": sources,
        "summary": summarize(hours, days),
        "hours": hours,
        "days": days,
    }


def main():
    data = build()
    if not data or not data["hours"] or not data["days"]:
        log("sin datos válidos: se conserva el fichero anterior")
        return 1
    fd, tmp = tempfile.mkstemp(dir=BASE, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)
    log(f"ok: {len(data['hours'])} horas, {len(data['days'])} días, fuentes {json.dumps(data['sources'], ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
