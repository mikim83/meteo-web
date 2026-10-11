# Meteo Cerdanyola - Ateneu — Instrucciones

Guía de uso de [meteo.dob-world.com](https://meteo.dob-world.com): qué se ve en cada página, de dónde salen los datos y cómo reutilizarlos.

> Es una estación meteorológica **aficionada** (Davis Vantage Vue, en Cerdanyola del Vallès, Barcelona). Los datos y el pronóstico son orientativos; para avisos oficiales consulta [Meteocat](https://www.meteo.cat) y [AEMET](https://www.aemet.es).

---

## 1. Página principal

De arriba abajo:

- **Cabecera con el tiempo actual:** temperatura exterior (grande), temperatura interior y sensación térmica (solo cuando difiere al menos 2 °C), máxima y mínima de las últimas 24 horas con su hora, y la hora de la última lectura.
- **Datos rápidos:** humedad exterior, viento (con dirección y racha), presión y su tendencia, punto de rocío, lluvia de hoy y lluvia del mes.
- **Aviso de ola de calor:** aparece solo cuando AEMET o Meteocat la declaran para la zona.
- **Arco solar y fase lunar:** posición del sol durante el día, orto y ocaso, y fase de la luna.
- **Noticias meteorológicas:** titulares recientes sobre el tiempo en Catalunya y España.
- **Últimas 24 horas:** ocho gráficos con la temperatura exterior, la humedad exterior, el viento, la dirección del viento (con flechas), la presión, la temperatura interior, la humedad interior y la lluvia acumulada. Al pasar el ratón (o tocar en el móvil) se ve el valor de cada momento.
- **Pronóstico:** con dos pestañas, ver el apartado 2.
- **Pronóstico de polen:** máximo diario de aliso, abedul, gramíneas, artemisia, olivo y ambrosía (granos/m³), hasta 5 días, del modelo CAMS Europa (~11 km). Fuera de temporada, algunos tipos salen como «—».
- **Diagramas externos:** conjunto de modelos GFS de Wetterzentrale (al pulsarlo se abre su página) y el radar de Windy, que se carga al pulsar «Cargar radar Windy».
- **Tema claro y oscuro:** el botón de la esquina superior derecha cambia el tema; la web recuerda tu elección.

La página se actualiza sola: la estación cada minuto y el pronóstico cada 15 minutos.

## 2. Pronóstico

Hay dos pestañas:

- **Próximas horas:** resumen de las próximas 24 horas (máxima y mínima con su hora, lluvia prevista por tramos, viento y UV), un gráfico con la temperatura y la lluvia hora a hora, y una tabla con el detalle (cielo, temperatura, probabilidad y cantidad de lluvia, viento). Al pasar el ratón por el gráfico, se ilumina esa hora en la tabla y aparece un cuadro con todos los datos; la tabla se desplaza sola para seguirla.
- **7 días:** un meteograma con la temperatura, la lluvia y el estado del cielo de la semana. También tiene cuadro de datos al pasar el ratón.

**De dónde sale cada dato:**

| Dato | Fuente |
|---|---|
| Estado del cielo, probabilidad de lluvia, máximas y mínimas | AEMET (predicción oficial de Cerdanyola del Vallès) |
| Temperatura y viento de las primeras ~57 horas | Météo-France AROME (1,5 km) |
| Cantidad de lluvia | Media de ECMWF IFS, DWD ICON-EU y AROME |
| Resto de variables y días lejanos | Open-Meteo |

Si AEMET marca lluvia o tormenta en una hora pero la media de los modelos no ve nada de agua (menos de 0,2 mm), el icono pasa a cielo nuboso. La probabilidad de AEMET se conserva y se ve en el cuadro de datos.

El pronóstico se recalcula en el servidor cada 30 minutos.

## 3. Histórico

[`historico.html`](historico.html) recoge los datos de la estación desde junio de 2023:

- **Un día como hoy:** qué pasó este mismo día en años anteriores.
- **Récords:** día más caluroso y más frío, racha más fuerte, día más lluvioso, más húmedo y más seco.
- **Rachas y días extremos:** ola de calor y racha de frío más largas, racha de lluvia, noches tropicales (mínima ≥ 20 °C), días de helada y días muy calurosos (máxima ≥ 35 °C).
- **Calendario de temperaturas:** la máxima de cada día del año, con una escala de color.
- **Temperatura mensual** (mínima, media y máxima) y **lluvia acumulada por mes**.
- **Resumen por año.**

## 4. Incendios en Catalunya

[`incendios.html`](incendios.html) sigue los incendios forestales desde el verano de 2026:

- **Mapa** con las noticias de incendios. Los colores indican la antigüedad de la noticia (últimas 48 h, última semana, más antiguo), no si el incendio sigue activo. Las ubicaciones son aproximadas.
- **Fuentes:** Bombers de la Generalitat (datos oficiales), la prensa (ACN, La Vanguardia y otros) y EFFIS / Copernicus para el contexto europeo.
- **Olas de calor del verano:** días con máxima ≥ 34 °C durante 3 días seguidos o más en Cerdanyola del Vallès.

## 5. Cuándo se actualiza cada cosa

| Qué | Con qué frecuencia |
|---|---|
| Lectura de la estación (`index.json`) | Cada minuto |
| Pronóstico (`forecast.json`) | Cada 30 minutos |
| Noticias meteorológicas, incendios y aviso de ola de calor | Dos veces al día (un agente automático) |
| Histórico agregado | Una vez al día, de madrugada |
| Ficheros anuales (`meteo_AAAA.txt`) | Una vez al día |

## 6. Datos abiertos y uso desde programas

Se pueden leer sin clave y sin ejecutar JavaScript. La descripción completa de los campos está en [`llms.txt`](llms.txt).

| Fichero | Contenido |
|---|---|
| [`index.json`](index.json) | Última lectura de la estación |
| [`forecast.json`](forecast.json) | Pronóstico de 7 días, hora a hora y por día |
| [`meteo_2026.txt`](meteo_2026.txt) | Todas las lecturas minuto a minuto del año (también `meteo_2023.txt`, `meteo_2024.txt` y `meteo_2025.txt`) |
| [`historico_meta.json`](historico_meta.json) y `historico_AAAA.json` | Récords, extremos y agregados diarios |
| [`news.json`](news.json) y [`incendios.json`](incendios.json) | Noticias e incendios |
| [`index.md`](index.md) | La página principal en Markdown (también con la cabecera `Accept: text/markdown`) |

Los ficheros `meteo_AAAA.txt` son CSV **sin cabecera**, con estas columnas: fecha y hora (`AAAA-MM-DD HH:MM`), temperatura exterior (°C), humedad exterior (%), viento (km/h), dirección del viento (grados), dirección del viento (rosa de 16 puntos en inglés), presión (hPa), temperatura interior (°C), humedad interior (%), sensación térmica de calor (°C), punto de rocío (°C), racha (km/h), lluvia del día (mm) y tendencia de la presión. Las filas antiguas tienen menos columnas: las que no existían se omiten por el final.

Ejemplo de línea:

```
2026-10-11 05:03,13.2,81,0.0,223,SW,1013.4,23.1,56,13.3,10.0,6.4,0.00,Falling Slowly
```

## 7. Cómo está hecho

HTML, CSS y JavaScript sin frameworks. Los gráficos son SVG dibujados a mano con D3 (cargado desde una CDN) y el mapa de incendios usa Leaflet. Los scripts del servidor leen la estación a través de un WiFiLogger 2, generan los ficheros de datos y los publica nginx detrás de Cloudflare.

El código está en [github.com/mikim83/meteo-web](https://github.com/mikim83/meteo-web). Hay también dos plugins para pantallas e-ink TRMNL: [tiempo en directo](https://github.com/mikim83/meteocerdanyola-trmnl-dashboard) y [pronóstico](https://github.com/mikim83/cerdanyola-trmnl-forecast).
