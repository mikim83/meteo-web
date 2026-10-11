# Meteo Cerdanyola - Ateneu — Instrucciones

Este documento describe cómo poner en marcha y usar la web **Meteo Cerdanyola - Ateneu**, y qué hace cada parte de lo que se ha implementado.

---

## 1. Qué es este proyecto

- **Nombre:** Meteo Cerdanyola - Ateneu  
- **Tecnología:** HTML, CSS y JavaScript (vanilla), sin Node ni frameworks.  
- **Contenido:**  
  - Pronóstico 5 días (Open-Meteo) para Cerdanyola del Vallès.  
  - Estación local: lectura actual y gráficos históricos del día desde un fichero de texto.  
  - Diagramas externos: imagen Wetterzentrale + mapa Windy en iframe.  
  - Previsión de **polen** en el aire (Open-Meteo Air Quality / CAMS Europa).  
  - Selector de tema claro/oscuro.

---

## 2. Estructura de archivos

```
newmeteo/
├── index.html        # Página principal
├── instrucciones.html  # Renderiza este archivo (INSTRUCCIONES.md) en HTML
├── styles.css        # Estilos (incl. tema claro/oscuro)
├── script.js         # Lógica: pronóstico, estación, gráficos, tema
├── today.txt         # Datos de la estación (generado por tu script)
└── INSTRUCCIONES.md  # Este archivo (instrucciones en Markdown)
```

- **today.txt** debe estar en la misma carpeta que `index.html` y ser accesible por el navegador (servido por el mismo origen).

---

## 3. Formato del fichero de estación (today.txt)

Tu script debe escribir **una línea por minuto** en `today.txt`, con **9 columnas separadas por comas**:

| Columna | Contenido | Ejemplo |
|--------|------------|--------|
| 1 | Hora y minuto (HH:MM) | 00:15 |
| 2 | Temperatura exterior (°C) | 10 |
| 3 | Humedad exterior (%) | 94 |
| 4 | Velocidad del viento (km/h) | 0.0 |
| 5 | Dirección del viento (grados) | 290 |
| 6 | Dirección del viento (cardinal) | WNW |
| 7 | Presión atmosférica (hPa) | 1019.1 |
| 8 | Temperatura interior (°C) | 20 |
| 9 | Humedad interior (%) | 67 |

Ejemplo de línea:

```
00:00,10,94,0.0,290,WNW,1019.1,20,67
```

- La web usa la **última línea** para la sección “Estación local” (valores actuales).  
- **Todas las líneas** del fichero se usan para los gráficos del “Histórico de hoy” (eje X = horas 0h–23h).

---

## 4. Cómo ejecutar la web

La página debe servirse por **HTTP** (no abriendo `index.html` con `file://`), para que pueda cargar `today.txt` y las APIs.

### Opción A: Servidor Python (recomendado)

1. Abre una terminal en la carpeta del proyecto:
   ```bash
   cd /ruta/a/newmeteo
   ```
2. Inicia el servidor:
   ```bash
   python3 -m http.server 8000
   ```
3. Abre en el navegador: **http://localhost:8000**

### Opción B: Otro servidor

- Asegúrate de que el directorio que contiene `index.html` y `today.txt` es la raíz del servidor (o que la URL de la página y la de `today.txt` comparten el mismo origen).

Si abres el HTML con doble clic (`file://`), verás el mensaje *“No se pueden cargar los datos”* en la estación local porque el navegador no permitirá cargar `today.txt`.

---

## 5. Funcionalidades implementadas (resumen)

### 5.1 Pronóstico (Open-Meteo, modelo ECMWF)

- Pronóstico de **5 días** para Cerdanyola del Vallès (coordenadas fijas).  
- Usa el **modelo ECMWF IFS** (9 km de resolución), más preciso para Europa, a través de la API de Open-Meteo.  
- Por día: **temperatura** (mín/máx), **humedad**, **viento**, **estado del tiempo** (sol, nubes, lluvia, etc.).  
- **Clic en un día:** la tarjeta se expande y muestra un **gráfico por horas** (temperatura y emojis del tiempo).  
- No requiere API key.

### 5.2 Previsión de polen

- **Open-Meteo Air Quality API** (dominio europeo CAMS), resolución ~11 km.  
- Tipos: aliso, abedul, gramíneas, artemisia, olivo, ambrosía.  
- Se muestra el **máximo diario** (granos/m³) por tipo, hasta 5 días.  
- Fuera de temporada o sin datos en el modelo, algunos valores pueden aparecer como «—».  
- No requiere API key.

### 5.3 Estación local

- Lee **today.txt** por HTTP.  
- Muestra los **valores actuales** (última línea) en la sección “Estación local”.  
- Se **actualiza cada 60 segundos**.

### 5.4 Histórico de hoy (gráficos)

- **7 gráficos** (Chart.js), uno por magnitud:  
  temp. exterior, humedad exterior, viento, **dirección viento**, presión, temp. interior, humedad interior.  
- **Dirección del viento:** en lugar de una línea de grados se muestran **flechas** que indican la dirección (0° = Norte, 90° = Este, etc.); las flechas se muestran muestreadas a lo largo del tiempo.  
- Eje X: **horas (0h–23h)**.  
- Eje Y: escala automática; en **porcentajes** (humedad) el eje va de **0 a 100**; en dirección viento el eje no se muestra (solo flechas).  
- **Tooltip** al pasar el ratón (hora y valor).  
- Líneas finas (`borderWidth: 1`).  
- En escritorio (≥ 900px) se muestran **4 gráficos por fila**; cada gráfico tiene **200px de altura**.

### 5.5 Diagramas externos (al final de la página)

- **Izquierda:** imagen de **Wetterzentrale** (GFS ENS).  
  - La **fecha de la imagen** es la del día actual (generada en JavaScript).  
  - **Clic** en la imagen abre en una nueva pestaña la página de diagramas de Wetterzentrale.  
- **Derecha:** **Windy** (radar) en un **iframe** con la URL indicada.  
- Ambos ocupan **mitad del ancho** cada uno (en móvil se apilan).

### 5.6 Tema claro / oscuro

- **Botón** en la cabecera (arriba a la derecha): “Modo claro” / “Modo oscuro”.  
- Al hacer clic se cambia el tema y se **redibujan los gráficos** con los colores del tema.  
- La **preferencia se guarda** en `localStorage` (clave `meteo-theme`) y se aplica al recargar.

### 5.7 Diseño

- **Diseño responsive.**  
- **Más espacio lateral:** `max-width: 1600px`, menos padding en pantallas grandes.  
- **Imagen Wetterzentrale:** `object-fit: contain` para que se vea entera dentro del recuadro.  
- **Pronóstico:** en escritorio (≥ 900px) se muestran **4 tarjetas por fila** (en lugar de 5) para que cada día ocupe más espacio.  
- **Gráficos del histórico:** 4 por fila en escritorio y mayor altura (200px) para que se vean más grandes.

---

## 6. Dependencias externas (sin instalación)

- **Chart.js:** cargado por CDN en `index.html` para los gráficos del histórico.  
- **Open-Meteo:** API de pronóstico con modelo **ECMWF IFS** (parámetro `models=ecmwf_ifs`).  
- **Open-Meteo Air Quality:** previsión de polen (`air-quality-api.open-meteo.com`, dominio `cams_europe`).  
- **Google Fonts:** fuente “Outfit” (opcional; la web funciona si falla la carga).  
- **Wetterzentrale:** imagen y enlace externos.  
- **Windy:** iframe de embed.

No hace falta `npm`, Node ni ningún build.

---

## 7. Resumen de pasos para tener todo funcionando

1. **Generar o copiar `today.txt`** en la carpeta del proyecto, con el formato de 9 columnas indicado (por ejemplo con tu script que escribe cada minuto).  
2. **Servir la carpeta por HTTP** (p. ej. `python3 -m http.server 8000` en la carpeta del proyecto).  
3. **Abrir en el navegador** la URL del servidor (p. ej. `http://localhost:8000`).  
4. Comprobar que:  
   - Se ve el pronóstico de 5 días.  
   - Aparece la sección “Previsión de polen en el aire”.  
   - La sección “Estación local” muestra datos y no el mensaje de error.  
   - Aparece la sección “Histórico de hoy” con los 7 gráficos.  
   - Abajo se ven la imagen de Wetterzentrale y el mapa Windy.  
   - El botón de tema cambia entre modo claro y oscuro y se mantiene al recargar.

Con esto tienes todas las instrucciones para reproducir y usar lo que se ha implementado en el proyecto.
