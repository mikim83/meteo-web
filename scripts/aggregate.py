#!/usr/bin/python3
"""Agrega todos los CSV diarios (/data/meteo/YYYY/MM/DD/today.txt) en:
  - historico_meta.json: récords, extremos, resúmenes por año, medias mensuales
    (datos ligeros, para todos los años) + "days" con el detalle diario del año en curso.
  - historico_<YEAR>.json: detalle diario completo de cada año (carga perezosa
    desde el selector de año del calendario de temperaturas).
"""

import datetime
import glob
import json
import os

basedir = "/data/meteo/"


TEMP_MIN, TEMP_MAX = -10.0, 50.0
HEATWAVE_TMAX = 34
HEATWAVE_MIN_DAYS = 3


def to_float(s):
    try:
        v = float(s)
        return v
    except (ValueError, TypeError):
        return None


def to_temp(s):
    v = to_float(s)
    if v is None or v < TEMP_MIN or v > TEMP_MAX:
        return None
    return v


def parse_line(parts):
    """Acepta filas legacy de 5, 7 o 14 columnas."""
    n = len(parts)
    row = {"time": parts[0], "ext_temp": to_temp(parts[1]), "ext_hum": to_float(parts[2])}
    if n >= 5:
        row["wind_speed"] = to_float(parts[3])
    if n >= 7:
        row["pressure"] = to_float(parts[6])
    if n >= 14:
        row["rain_daily"] = to_float(parts[12])
    return row


def summarize_day(date_str, filepath):
    temps, hums, press, winds = [], [], [], []
    tmax_time, tmin_time = None, None
    tmax_val, tmin_val = None, None
    rain_last = None
    with open(filepath, errors="replace") as f:
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 3:
                continue
            row = parse_line(parts)
            if row["ext_temp"] is not None:
                t = row["ext_temp"]
                temps.append(t)
                if tmax_val is None or t > tmax_val:
                    tmax_val, tmax_time = t, row["time"]
                if tmin_val is None or t < tmin_val:
                    tmin_val, tmin_time = t, row["time"]
            if row["ext_hum"] is not None:
                hums.append(row["ext_hum"])
            if row.get("pressure") is not None:
                press.append(row["pressure"])
            if row.get("wind_speed") is not None:
                winds.append(row["wind_speed"])
            if row.get("rain_daily") is not None:
                rain_last = row["rain_daily"]

    if not temps:
        return None

    day = {
        "date": date_str,
        "tmin": round(tmin_val, 1),
        "tmin_time": tmin_time,
        "tmax": round(tmax_val, 1),
        "tmax_time": tmax_time,
        "tavg": round(sum(temps) / len(temps), 1),
        "n": len(temps),
    }
    if hums:
        day["havg"] = round(sum(hums) / len(hums), 1)
    if press:
        day["pmin"] = round(min(press), 1)
        day["pmax"] = round(max(press), 1)
        day["pavg"] = round(sum(press) / len(press), 1)
    if winds:
        day["wmax"] = round(max(winds), 1)
        day["wavg"] = round(sum(winds) / len(winds), 1)
    if rain_last is not None:
        day["rain"] = round(rain_last, 1)
    return day


def compute_records(days):
    hottest = max(days, key=lambda d: d["tmax"])
    coldest = min(days, key=lambda d: d["tmin"])
    with_wind = [d for d in days if d.get("wmax") is not None]
    with_rain = [d for d in days if d.get("rain") is not None]
    with_hum = [d for d in days if d.get("havg") is not None]

    def pick(dataset, key, cmp):
        if not dataset:
            return None
        return cmp(dataset, key=lambda d: d[key])

    windiest = pick(with_wind, "wmax", max)
    rainiest = pick(with_rain, "rain", max)
    most_humid = pick(with_hum, "havg", max)
    driest = pick(with_hum, "havg", min)

    def slim(d, *keys):
        if d is None:
            return None
        return {k: d[k] for k in ("date",) + keys if k in d}

    return {
        "hottest": slim(hottest, "tmax", "tmax_time"),
        "coldest": slim(coldest, "tmin", "tmin_time"),
        "windiest": slim(windiest, "wmax"),
        "rainiest": slim(rainiest, "rain"),
        "mostHumid": slim(most_humid, "havg"),
        "driest": slim(driest, "havg"),
    }


def longest_streak(days_sorted, predicate):
    best = {"len": 0, "start": None, "end": None}
    cur_len, cur_start = 0, None
    for d in days_sorted:
        if predicate(d):
            if cur_len == 0:
                cur_start = d["date"]
            cur_len += 1
            if cur_len > best["len"]:
                best = {"len": cur_len, "start": cur_start, "end": d["date"]}
        else:
            cur_len, cur_start = 0, None
    return best if best["len"] > 0 else None


def compute_extremes(days_sorted):
    heat_streak = longest_streak(days_sorted, lambda d: d["tmax"] >= 30)
    cold_streak = longest_streak(days_sorted, lambda d: d["tmax"] <= 10)
    rain_streak = longest_streak(days_sorted, lambda d: d.get("rain") is not None and d["rain"] > 0.2)

    return {
        "heatStreak": heat_streak,
        "coldStreak": cold_streak,
        "rainStreak": rain_streak,
        "tropicalNights": sum(1 for d in days_sorted if d["tmin"] >= 20),
        "frostDays": sum(1 for d in days_sorted if d["tmin"] < 0),
        "hotDays": sum(1 for d in days_sorted if d["tmax"] >= 35),
    }


def is_next_calendar_day(a, b):
    da = datetime.date.fromisoformat(a)
    db = datetime.date.fromisoformat(b)
    return (db - da).days == 1


def compute_heatwave_dates(days_sorted):
    hot = set()
    i, n = 0, len(days_sorted)
    while i < n:
        if days_sorted[i]["tmax"] >= HEATWAVE_TMAX:
            j = i
            while (
                j + 1 < n
                and days_sorted[j + 1]["tmax"] >= HEATWAVE_TMAX
                and is_next_calendar_day(days_sorted[j]["date"], days_sorted[j + 1]["date"])
            ):
                j += 1
            if j - i + 1 >= HEATWAVE_MIN_DAYS:
                for k in range(i, j + 1):
                    hot.add(days_sorted[k]["date"])
            i = j + 1
        else:
            i += 1
    return hot


MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def compute_months(days_sorted):
    by_month = {}
    for d in days_sorted:
        key = d["date"][:7]
        m = by_month.setdefault(key, {"tmins": [], "tmaxs": [], "tavgs": [], "rain": 0.0})
        m["tmins"].append(d["tmin"])
        m["tmaxs"].append(d["tmax"])
        m["tavgs"].append(d["tavg"])
        if d.get("rain") is not None:
            m["rain"] += d["rain"]

    months = []
    for key in sorted(by_month.keys()):
        m = by_month[key]
        months.append({
            "key": key,
            "label": MONTH_NAMES[int(key[5:7]) - 1] + " '" + key[2:4],
            "tmin": round(sum(m["tmins"]) / len(m["tmins"]), 1),
            "tmax": round(sum(m["tmaxs"]) / len(m["tmaxs"]), 1),
            "tavg": round(sum(m["tavgs"]) / len(m["tavgs"]), 1),
            "rain": round(m["rain"], 1),
        })
    return months


def compute_years(days_sorted):
    by_year = {}
    for d in days_sorted:
        y = d["date"][:4]
        g = by_year.setdefault(y, {"year": y, "tmax": -999, "tmin": 999, "rain": 0.0, "n": 0, "tavgSum": 0.0})
        g["tmax"] = max(g["tmax"], d["tmax"])
        g["tmin"] = min(g["tmin"], d["tmin"])
        if d.get("rain") is not None:
            g["rain"] += d["rain"]
        g["tavgSum"] += d["tavg"]
        g["n"] += 1

    years = []
    for y in sorted(by_year.keys()):
        g = by_year[y]
        years.append({
            "year": g["year"],
            "tmax": round(g["tmax"], 1),
            "tmin": round(g["tmin"], 1),
            "rain": round(g["rain"], 1),
            "tavg": round(g["tavgSum"] / g["n"], 1),
            "n": g["n"],
        })
    return years


def compute_on_this_day(days_sorted, today):
    suffix = "-" + today.strftime("%m-%d")
    matches = [d for d in days_sorted if d["date"].endswith(suffix) and d["date"][:4] != str(today.year)]
    matches.sort(key=lambda d: d["date"], reverse=True)
    return matches


def main():
    files = sorted(glob.glob(os.path.join(basedir, "[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/today.txt")))
    days = []
    for filepath in files:
        parts = filepath.replace(basedir, "").split("/")
        date_str = f"{parts[0]}-{parts[1]}-{parts[2]}"
        day = summarize_day(date_str, filepath)
        if day:
            days.append(day)

    if not days:
        print("Sin datos, no se genera nada")
        return

    days.sort(key=lambda d: d["date"])
    today = datetime.date.today()
    current_year = str(today.year)

    by_year = {}
    for d in days:
        by_year.setdefault(d["date"][:4], []).append(d)

    for year, year_days in by_year.items():
        with open(os.path.join(basedir, f"historico_{year}.json"), "w") as f:
            json.dump({"year": year, "days": year_days}, f, separators=(",", ":"))

    meta = {
        "generated": days[-1]["date"],
        "years": [y["year"] for y in compute_years(days)],
        "records": compute_records(days),
        "extremes": compute_extremes(days),
        "onThisDay": compute_on_this_day(days, today),
        "months": compute_months(days),
        "yearSummaries": compute_years(days),
        "currentYear": current_year,
        "days": by_year.get(current_year, []),
    }
    with open(os.path.join(basedir, "historico_meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    # Fichero legacy (historico.json) eliminado: sustituido por historico_meta.json + historico_<YEAR>.json
    legacy = os.path.join(basedir, "historico.json")
    if os.path.exists(legacy):
        os.remove(legacy)

    print(f"{len(days)} días agregados -> historico_meta.json + {len(by_year)} ficheros historico_<YEAR>.json")


if __name__ == "__main__":
    main()
