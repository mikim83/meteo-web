#!/usr/bin/python3
"""Lee la lectura en tiempo real de la estación y escribe los ficheros de datos.

La estación (Davis Vantage Vue) publica sus datos a través de un WiFiLogger 2
(https://wifilogger.net) en la red local. Este script consulta su API /rtd y guarda:
  - /data/meteo/YYYY/MM/DD/today.txt  (una línea CSV por minuto)
  - /data/meteo/index.json            (última lectura)
  - /data/meteo/today.txt             (enlace simbólico al CSV del día)

Configuración (variable de entorno):
  WIFILOGGER_URL  URL de datos en tiempo real del WiFiLogger 2,
                  p. ej. http://192.168.2.15/rtd
Se define en el crontab (ver scripts/crontab.example).
"""

import requests, json, os, pytz, sys
from datetime import datetime, timedelta

headers = {'Accept': 'application/json'}
WIFILOGGER_URL = os.environ.get("WIFILOGGER_URL")
if not WIFILOGGER_URL:
    sys.exit("Falta la variable de entorno WIFILOGGER_URL (p. ej. http://192.168.2.15/rtd)")
r = requests.get(WIFILOGGER_URL, headers=headers, timeout=20)
json_data = r.json()
basedir = "/data/meteo/"

D = json_data["DATA"]

def val(index, subindex=0, fallback="---"):
    try:
        v = D[index][subindex]
        return v if v not in ("---", "&nbsp;", None) else fallback
    except (IndexError, KeyError):
        return fallback

current_int_temp     = val(0, 0)
current_ext_temp     = val(1, 0)
current_heat_index   = val(5, 0)
current_wind_chill   = val(7, 0)
current_int_hum      = val(8, 0)
current_ext_hum      = val(9, 0)
current_dew_point    = str(val(12, 0)).split("/")[0]
current_wind_speed   = val(13, 0)
current_wind_degree  = val(14, 0)
current_wind_dir     = val(14, 1)
current_wind_avg2    = val(15, 0)
current_wind_avg10   = val(16, 0)
current_wind_gust    = val(17, 0)
current_gust_degree  = val(18, 0)
current_gust_dir     = val(18, 1)
current_barometer    = val(19, 0)
current_bar_trend    = val(20, 0)
current_rain_rate    = val(21, 0)
rain_daily           = val(36, 0)
rain_24h             = val(36, 5)
rain_month           = val(36, 2)
rain_year            = val(36, 3)

now = datetime.now(pytz.timezone('Europe/Madrid'))
dirname = basedir + now.strftime("%Y/%m/%d")
filename = dirname + "/today.txt"

# CSV line: 14 columns
line = ",".join([
    now.strftime("%H:%M"),
    str(current_ext_temp),
    str(current_ext_hum),
    str(current_wind_speed),
    str(current_wind_degree),
    str(current_wind_dir),
    str(current_barometer),
    str(current_int_temp),
    str(current_int_hum),
    str(current_heat_index),
    str(current_dew_point),
    str(current_wind_gust),
    str(rain_daily),
    str(current_bar_trend),
])

os.makedirs(dirname, exist_ok=True)
with open(filename, "a") as f:
    f.write(line + "\n")

# --- Últimas 24h: max/min temp exterior leyendo ayer + hoy ---
def read_ext_temps(filepath):
    temps = []
    try:
        with open(filepath) as f:
            for line in f:
                parts = line.strip().split(",")
                if len(parts) >= 2:
                    try:
                        temps.append((parts[0], float(parts[1])))
                    except ValueError:
                        pass
    except FileNotFoundError:
        pass
    return temps

all_temps = read_ext_temps(filename)

if all_temps:
    max_entry = max(all_temps, key=lambda x: x[1])
    min_entry = min(all_temps, key=lambda x: x[1])
    max_temp_24h = max_entry[1]
    max_temp_24h_time = max_entry[0]
    min_temp_24h = min_entry[1]
    min_temp_24h_time = min_entry[0]
else:
    max_temp_24h = max_temp_24h_time = min_temp_24h = min_temp_24h_time = None

# --- index.json ---
json_out = {
    "updated": now.isoformat(),
    "ext_temp": current_ext_temp,
    "int_temp": current_int_temp,
    "ext_hum": current_ext_hum,
    "int_hum": current_int_hum,
    "heat_index": current_heat_index,
    "wind_chill": current_wind_chill,
    "dew_point": current_dew_point,
    "wind_speed": current_wind_speed,
    "wind_dir": current_wind_dir,
    "wind_degree": current_wind_degree,
    "wind_avg2": current_wind_avg2,
    "wind_avg10": current_wind_avg10,
    "wind_gust": current_wind_gust,
    "gust_dir": current_gust_dir,
    "gust_degree": current_gust_degree,
    "pressure": current_barometer,
    "pressure_trend": current_bar_trend,
    "rain_rate": current_rain_rate,
    "rain_daily": rain_daily,
    "rain_24h": rain_24h,
    "rain_month": rain_month,
    "rain_year": rain_year,
    "max_temp_24h": max_temp_24h,
    "max_temp_24h_time": max_temp_24h_time,
    "min_temp_24h": min_temp_24h,
    "min_temp_24h_time": min_temp_24h_time,
}

with open(basedir + "index.json", "w") as f:
    json.dump(json_out, f, indent=2, ensure_ascii=False)

# Actualizar enlace simbólico today.txt
symlink = basedir + "today.txt"
if os.path.islink(symlink):
    os.remove(symlink)
os.symlink(filename, symlink)
