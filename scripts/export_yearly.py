#!/usr/bin/python3
"""Concatena todos los CSV diarios (/data/meteo/YYYY/MM/DD/today.txt) en un
único fichero de texto por año: /data/meteo/meteo_<YEAR>.txt

Mismo formato CSV que los ficheros diarios (sin cabecera, columnas separadas
por comas), pero con la fecha antepuesta al campo de hora (antes solo
"HH:MM", ahora "YYYY-MM-DD HH:MM") para que las líneas sigan siendo legibles
al juntar los 365 días en un solo fichero.

Se guarda directamente en /data/meteo/ (la raíz servida por nginx en
meteo.dob-world.com) para poder descargarse por URL directa, p. ej.:
  https://meteo.dob-world.com/meteo_2025.txt
"""

import glob
import os

basedir = "/data/meteo/"


def main():
    files = sorted(glob.glob(os.path.join(basedir, "[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/today.txt")))

    by_year = {}
    for filepath in files:
        parts = filepath.replace(basedir, "").split("/")
        year, month, day = parts[0], parts[1], parts[2]
        date_str = f"{year}-{month}-{day}"
        by_year.setdefault(year, []).append((date_str, filepath))

    for year, entries in sorted(by_year.items()):
        outpath = os.path.join(basedir, f"meteo_{year}.txt")
        n_lines = 0
        with open(outpath, "w") as out:
            for date_str, filepath in entries:
                with open(filepath, errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        # primer campo es "HH:MM" -> lo convertimos en "YYYY-MM-DD HH:MM"
                        time_part, _, rest = line.partition(",")
                        out.write(f"{date_str} {time_part},{rest}\n")
                        n_lines += 1
        print(f"{year}: {n_lines} líneas -> {outpath}")


if __name__ == "__main__":
    main()
