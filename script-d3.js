(function () {
  'use strict';

  var THEME_KEY = 'meteo-theme';

  if (localStorage.getItem(THEME_KEY) === 'light') {
    document.body.classList.add('theme-light');
  }

  const COORDS = { lat: 41.4911, lon: 2.1401 };
  const TIMEZONE = 'Europe/Madrid';

  // ─── Session-Token (prueba de concepto con Cloudflare Worker) ─────────────────
  // El Worker delante del dominio añade/renueva este header con expiración
  // deslizante de 15 min de inactividad. Se guarda en sessionStorage (no cookie,
  // no localStorage) para sobrevivir a un refresh de la misma pestaña, pero se
  // pierde al cerrarla, y se reenvía en cada fetch a los endpoints de datos.
  var SESSION_TOKEN_KEY = 'sessionToken';

  function getSessionToken() {
    try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch (e) { return null; }
  }

  function setSessionToken(t) {
    try { sessionStorage.setItem(SESSION_TOKEN_KEY, t); } catch (e) {}
  }

  function sessionFetch(url) {
    var headers = {};
    var sessionToken = getSessionToken();
    if (sessionToken) headers['Session-Token'] = sessionToken;
    return fetch(url, { headers: headers }).then(function (res) {
      var t = res.headers.get('Session-Token');
      if (t) setSessionToken(t);
      return res;
    });
  }

  const errorEl = document.getElementById('error');
  const forecastEl = document.getElementById('forecast');
  const historySectionEl = document.getElementById('history');
  const historyGridEl = document.getElementById('history-grid');
  const pollenSectionEl = document.getElementById('pollen');
  const pollenGridEl = document.getElementById('pollen-grid');
  const pollenErrorEl = document.getElementById('pollen-error');
  const heroEl = document.getElementById('hero');
  const heroExtTempEl = document.getElementById('hero-ext-temp');
  const heroIntTempEl = document.getElementById('hero-int-temp');
  const heroFeelsEl = document.getElementById('hero-feels');
  const heroMinmaxEl = document.getElementById('hero-minmax');
  const heroChipsEl = document.getElementById('hero-chips');
  const heroUpdatedEl = document.getElementById('hero-updated');
  const heatwaveBannerEl = document.getElementById('heatwave-banner');
  const astroEl = document.getElementById('astro');
  const astroSolarEl = document.getElementById('astro-solar');
  const astroLunarEl = document.getElementById('astro-lunar');
  const newsEl = document.getElementById('news');
  const newsListEl = document.getElementById('news-list');
  const newsUpdatedEl = document.getElementById('news-updated');

  const POLLEN_TYPES = [
    { key: 'alder_pollen', label: 'Aliso' },
    { key: 'birch_pollen', label: 'Abedul' },
    { key: 'grass_pollen', label: 'Gramíneas' },
    { key: 'mugwort_pollen', label: 'Artemisia' },
    { key: 'olive_pollen', label: 'Olivo' },
    { key: 'ragweed_pollen', label: 'Ambrosía' }
  ];

  const HISTORY_SERIES = [
    { key: 'tempOut', title: 'Temp. exterior', unit: '°C' },
    { key: 'humidityOut', title: 'Humedad exterior', unit: '%' },
    { key: 'windSpeed', title: 'Viento', unit: 'km/h' },
    { key: 'windDeg', title: 'Dirección viento', unit: '°', subtitleKey: 'windDir', windArrows: true },
    { key: 'pressure', title: 'Presión', unit: 'hPa' },
    { key: 'tempIn', title: 'Temp. interior', unit: '°C' },
    { key: 'humidityIn', title: 'Humedad interior', unit: '%' },
    { key: 'rainDaily', title: 'Lluvia acumulada', unit: 'mm' }
  ];

  var CACHE_TTL_MS = 10 * 60 * 1000;

  function getCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || typeof entry.ts !== 'number') return null;
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
      return entry.data;
    } catch (e) {
      return null;
    }
  }

  function setCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function showError() {
    errorEl.hidden = false;
    forecastEl.hidden = true;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ─── Hero ───────────────────────────────────────────────────────────────────

  function tempColor(t) {
    if (isNaN(t)) return 'var(--accent-light)';
    if (t <= 5)  return '#7ec8f0';
    if (t <= 12) return '#52c99d';
    if (t <= 20) return '#a8d96a';
    if (t <= 27) return '#f5c842';
    if (t <= 33) return '#f08040';
    return '#e04030';
  }

  function renderHero(json) {
    var extTemp = parseFloat(json.ext_temp);
    var intTemp = parseFloat(json.int_temp);
    var hum = parseFloat(json.ext_hum);
    var wind = parseFloat(json.wind_speed);
    var gust = parseFloat(json.wind_gust);
    var pressure = parseFloat(json.pressure);
    var dewPoint = parseFloat(json.dew_point);
    var maxT = parseFloat(json.max_temp_24h);
    var minT = parseFloat(json.min_temp_24h);
    var maxTime = json.max_temp_24h_time || '';
    var minTime = json.min_temp_24h_time || '';

    var intHum = parseFloat(json.int_hum);
    var heatIndex = parseFloat(json.heat_index);
    var rainDaily = parseFloat(json.rain_daily);

    heroExtTempEl.textContent = isNaN(extTemp) ? '—' : extTemp.toFixed(1) + '\u00a0°C';
    heroExtTempEl.style.color = tempColor(extTemp);
    heroEl.style.setProperty('--hero-accent', tempColor(extTemp));

    heroIntTempEl.textContent = isNaN(intTemp) ? '' : intTemp.toFixed(1) + '\u00a0°C interior' + (isNaN(intHum) ? '' : ' · ' + Math.round(intHum) + '%');
    heroFeelsEl.textContent = (!isNaN(heatIndex) && Math.abs(heatIndex - extTemp) >= 2) ? 'Sensación ' + heatIndex.toFixed(0) + '\u00a0°C' : '';

    heroMinmaxEl.innerHTML =
      '<span class="hero-max">↑ ' + (isNaN(maxT) ? '—' : maxT.toFixed(1) + '°') + (maxTime ? ' <em>' + maxTime + '</em>' : '') + '</span>' +
      '<span class="hero-min">↓ ' + (isNaN(minT) ? '—' : minT.toFixed(1) + '°') + (minTime ? ' <em>' + minTime + '</em>' : '') + '</span>';

    var windVal = isNaN(wind) ? '—' : wind.toFixed(1) + ' km/h ' + (json.wind_dir || '');
    if (!isNaN(gust) && gust > wind + 2) windVal += ' · racha ' + gust.toFixed(1);

    var chips = [
      { icon: '💧', label: 'Humedad ext.', value: isNaN(hum) ? '—' : Math.round(hum) + '%' },
      { icon: '💨', label: 'Viento', value: windVal },
      { icon: '🌡', label: 'Presión', value: isNaN(pressure) ? '—' : pressure.toFixed(1) + ' hPa' + (json.pressure_trend ? '  ' + translateTrend(json.pressure_trend) : '') },
      { icon: '🌫', label: 'Punto de rocío', value: isNaN(dewPoint) ? '—' : dewPoint.toFixed(1) + '\u00a0°C' },
      { icon: '🌧', label: 'Lluvia hoy', value: isNaN(rainDaily) ? '—' : rainDaily.toFixed(1) + ' mm' },
      { icon: '📅', label: 'Lluvia mes', value: isNaN(parseFloat(json.rain_month)) ? '—' : parseFloat(json.rain_month).toFixed(1) + ' mm' }
    ];
    heroChipsEl.innerHTML = chips.map(function (c) {
      return '<div class="hero-chip"><span class="hero-chip-icon">' + c.icon + '</span><span class="hero-chip-text"><span class="hero-chip-label">' + c.label + '</span><span class="hero-chip-value">' + c.value + '</span></span></div>';
    }).join('');

    var updated = json.updated ? new Date(json.updated) : null;
    heroUpdatedEl.textContent = updated ? 'Actualizado ' + updated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

    heroEl.hidden = false;

    // Actualizar título y meta description
    if (!isNaN(extTemp)) {
      document.title = extTemp.toFixed(1) + ' °C · Meteo Cerdanyola';
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', 'Temperatura exterior: ' + extTemp.toFixed(1) + ' °C. Humedad: ' + Math.round(hum) + '%. Presión: ' + pressure.toFixed(1) + ' hPa. Cerdanyola del Vallès en tiempo real.');
    }
  }

  function translateTrend(trend) {
    var map = {
      'Rising Rapidly': '↑↑ subiendo rápido',
      'Rising Slowly': '↑ subiendo',
      'Steady': '→ estable',
      'Falling Slowly': '↓ bajando',
      'Falling Rapidly': '↓↓ bajando rápido'
    };
    return map[trend] || trend;
  }

  // ─── Arco solar ─────────────────────────────────────────────────────────────

  function solarCalc(date, lat, lon) {
    var jd = date.getTime() / 86400000 + 2440587.5;
    var n = jd - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360;
    var g = (357.528 + 0.9856003 * n) % 360;
    var gRad = g * Math.PI / 180;
    var lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
    var lambdaRad = lambda * Math.PI / 180;
    var eps = (23.439 - 0.0000004 * n) * Math.PI / 180;
    var sinDec = Math.sin(eps) * Math.sin(lambdaRad);
    var dec = Math.asin(sinDec);
    var RA = Math.atan2(Math.cos(eps) * Math.sin(lambdaRad), Math.cos(lambdaRad));
    var GMST = (18.697375 + 24.0657098244 * n) % 24;
    var LMST = (GMST + lon / 15) % 24;
    var HA = (LMST - RA * 12 / Math.PI) * 15 * Math.PI / 180;
    var latRad = lat * Math.PI / 180;
    var sinAlt = Math.sin(latRad) * Math.sin(dec) + Math.cos(latRad) * Math.cos(dec) * Math.cos(HA);
    var alt = Math.asin(sinAlt) * 180 / Math.PI;
    var cosAz = (Math.sin(dec) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));
    cosAz = Math.max(-1, Math.min(1, cosAz));
    var az = Math.acos(cosAz) * 180 / Math.PI;
    if (Math.sin(HA) > 0) az = 360 - az;

    // Amanecer y atardecer (altitud -0.833°)
    var cosHA0 = (Math.sin(-0.833 * Math.PI / 180) - Math.sin(latRad) * Math.sin(dec)) / (Math.cos(latRad) * Math.cos(dec));
    var riseSet = null;
    if (Math.abs(cosHA0) <= 1) {
      var HA0 = Math.acos(cosHA0) * 180 / Math.PI;
      var eqTime = (LMST - n * 0 - (RA * 12 / Math.PI)) * 60; // aproximación
      // Usamos cálculo simple con la longitud
      var noon = 12 - lon / 15;
      var rise = noon - HA0 / 15;
      var set = noon + HA0 / 15;
      // Ajuste de huso horario: detectamos offset local
      var offsetH = -date.getTimezoneOffset() / 60;
      rise += offsetH;
      set += offsetH;
      // Normalizar al día
      rise = ((rise % 24) + 24) % 24;
      set = ((set % 24) + 24) % 24;
      riseSet = { rise: rise, set: set, ha0: HA0 };
    }

    return { alt: alt, az: az, dec: dec * 180 / Math.PI, riseSet: riseSet };
  }

  function hoursToHHMM(h) {
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh++; mm = 0; }
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function season(date, lat) {
    var m = date.getMonth() + 1;
    var names = lat >= 0
      ? ['Invierno', 'Invierno', 'Primavera', 'Primavera', 'Primavera', 'Verano', 'Verano', 'Verano', 'Otoño', 'Otoño', 'Otoño', 'Invierno']
      : ['Verano', 'Verano', 'Otoño', 'Otoño', 'Otoño', 'Invierno', 'Invierno', 'Invierno', 'Primavera', 'Primavera', 'Primavera', 'Verano'];
    return names[m - 1];
  }

  function renderSolarArc() {
    var now = new Date();
    var sol = solarCalc(now, COORDS.lat, COORDS.lon);
    var rs = sol.riseSet;

    var riseStr = rs ? hoursToHHMM(rs.rise) : '—';
    var setStr = rs ? hoursToHHMM(rs.set) : '—';

    var dayMinutes = rs ? (rs.set - rs.rise) * 60 : 0;
    var dayHours = Math.floor(dayMinutes / 60);
    var dayMins = Math.round(dayMinutes % 60);
    var dayDurStr = rs ? dayHours + 'h ' + dayMins + 'min' : '—';

    var seasonName = season(now, COORDS.lat);

    // Progreso del sol en el arco (0=amanecer, 1=atardecer)
    var nowH = now.getHours() + now.getMinutes() / 60;
    var progress = rs ? Math.max(0, Math.min(1, (nowH - rs.rise) / (rs.set - rs.rise))) : 0.5;
    var isDay = rs ? (nowH >= rs.rise && nowH <= rs.set) : (sol.alt > 0);

    // SVG del arco solar — viewBox ajustado para arco compacto con etiquetas
    var W = 280, H = 110;
    var cx = W / 2, cy = H - 22;
    var rx = (W - 48) / 2, ry = cy - 8;
    var angle = Math.PI * progress;
    var sunX = cx - rx * Math.cos(angle);
    var sunY = cy - ry * Math.sin(angle);
    var sunVisible = sol.alt > 0;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="solar-svg" aria-hidden="true">';
    svg += '<path d="M ' + (cx - rx) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 0 1 ' + (cx + rx) + ' ' + cy + '" fill="none" class="solar-arc-bg"/>';
    if (progress > 0 && isDay) {
      var ex = cx - rx * Math.cos(angle);
      var ey = cy - ry * Math.sin(angle);
      svg += '<path d="M ' + (cx - rx) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 0 1 ' + ex + ' ' + ey + '" fill="none" class="solar-arc-done"/>';
    }
    svg += '<line x1="' + (cx - rx - 8) + '" y1="' + cy + '" x2="' + (cx + rx + 8) + '" y2="' + cy + '" class="solar-horizon"/>';
    if (sunVisible) {
      svg += '<circle cx="' + sunX + '" cy="' + sunY + '" r="8" class="solar-sun"/>';
      svg += '<circle cx="' + sunX + '" cy="' + sunY + '" r="12" class="solar-sun-glow"/>';
    } else {
      svg += '<circle cx="' + sunX + '" cy="' + (cy + 8) + '" r="6" class="solar-sun solar-sun-down"/>';
    }
    svg += '<text x="' + (cx - rx) + '" y="' + (cy + 14) + '" class="solar-label solar-label-rise">🌅 ' + riseStr + '</text>';
    svg += '<text x="' + (cx + rx) + '" y="' + (cy + 14) + '" class="solar-label solar-label-set">🌇 ' + setStr + '</text>';
    svg += '</svg>';

    astroSolarEl.innerHTML =
      '<div class="astro-title">☀️ Sol · ' + seasonName + '</div>' +
      svg +
      '<div class="solar-info">' +
        '<span>Duración: <strong>' + dayDurStr + '</strong></span>' +
        '<span>Elevación: <strong>' + sol.alt.toFixed(1) + '°</strong></span>' +
      '</div>';
  }

  // ─── Fase lunar ─────────────────────────────────────────────────────────────

  function lunarPhase(date) {
    var NEW_MOON_REF = new Date('2000-01-06T18:14:00Z');
    var CYCLE = 29.530589;
    var diffDays = (date - NEW_MOON_REF) / 86400000;
    var age = ((diffDays % CYCLE) + CYCLE) % CYCLE;
    var illumination = (1 - Math.cos(2 * Math.PI * age / CYCLE)) / 2;

    var name, emoji;
    var p = age / CYCLE;
    if (p < 0.025 || p >= 0.975)      { name = 'Luna nueva';        emoji = '🌑'; }
    else if (p < 0.25)                 { name = 'Cuarto creciente';  emoji = '🌒'; }
    else if (p < 0.275)               { name = 'Cuarto creciente';  emoji = '🌓'; }
    else if (p < 0.475)               { name = 'Luna casi llena creciente'; emoji = '🌔'; }
    else if (p < 0.525)               { name = 'Luna llena';        emoji = '🌕'; }
    else if (p < 0.725)               { name = 'Luna casi llena menguante'; emoji = '🌖'; }
    else if (p < 0.775)               { name = 'Cuarto menguante';  emoji = '🌗'; }
    else                               { name = 'Luna menguante';    emoji = '🌘'; }

    var daysToFull = ((0.5 * CYCLE) - age + CYCLE) % CYCLE;
    var daysToNew = (CYCLE - age) % CYCLE;

    return { age: age, illumination: illumination, name: name, emoji: emoji, daysToFull: daysToFull, daysToNew: daysToNew };
  }

  function renderLunarPhase() {
    var moon = lunarPhase(new Date());
    var illPct = Math.round(moon.illumination * 100);
    var nextLabel = moon.daysToFull < moon.daysToNew
      ? 'Luna llena en ' + Math.round(moon.daysToFull) + ' días'
      : 'Luna nueva en ' + Math.round(moon.daysToNew) + ' días';

    astroLunarEl.innerHTML =
      '<div class="astro-title">🌙 Luna</div>' +
      '<div class="lunar-emoji">' + moon.emoji + '</div>' +
      '<div class="lunar-name">' + moon.name + '</div>' +
      '<div class="lunar-ill">' + illPct + '% iluminada</div>' +
      '<div class="lunar-next">' + nextLabel + '</div>' +
      '<div class="lunar-age">Día ' + Math.floor(moon.age) + ' del ciclo</div>';

    astroEl.hidden = false;
  }

  // ─── Fetch index.json ────────────────────────────────────────────────────────

  function fetchIndexJson() {
    return sessionFetch('index.json?t=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('No encontrado');
        return res.json();
      })
      .then(function (json) {
        renderHero(json);
        renderSolarArc();
        renderLunarPhase();
      })
      .catch(function () {
        // Si falla index.json, el hero queda oculto; la estación sigue con today.txt
        renderSolarArc();
        renderLunarPhase();
      });
  }

  // ─── Pronóstico ───────────────────────────────────────────────────────────────
  // Datos de forecast.json (lo genera fetch_forecast.py cada 30 min): AEMET (cielo,
  // probabilidad de lluvia, máx/mín), Météo-France AROME (temperatura, lluvia y
  // viento de las primeras ~57 h) y Open-Meteo (resto de variables y días 4-7).

  var fcData = null;
  var fcTab = 'summary';
  var summaryEl = document.getElementById('forecast-summary');
  var weekEl = document.getElementById('forecast-week');
  var fcSourcesEl = document.getElementById('forecast-sources');

  function fcEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fcNum(v, d) {
    return v == null ? '—' : Number(v).toFixed(d || 0).replace('.', ',');
  }

  function fcHour(t) { return t.slice(11, 13) + 'h'; }

  function fcDayName(date, i) {
    if (i === 0) return 'Hoy';
    if (i === 1) return 'Mañana';
    return capitalize(new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long' }));
  }

  function fcDayDate(date) {
    return new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  // La dirección es "de dónde viene": la flecha apunta hacia donde sopla (+180°).
  function fcArrow(deg) {
    if (deg == null) return '';
    return '<svg class="fc-arrow" viewBox="-8 -8 16 16" width="14" height="14" aria-hidden="true"><g transform="rotate(' + ((deg + 180) % 360) + ')">' +
      '<line x1="0" y1="6" x2="0" y2="-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<polygon points="0,-7 -3.5,-2 3.5,-2" fill="currentColor"/></g></svg>';
  }

  function fcSummaryText(s) {
    var parts = [];
    if (!s.rain || !s.rain.length) {
      parts.push('Sin lluvia prevista en las próximas 24 horas.');
    } else {
      var today = s.now && s.now.t ? s.now.t.slice(0, 10) : '';
      var wins = s.rain.slice(0, 3).map(function (w) {
        return (today && w.from_t.slice(0, 10) !== today ? 'mañana ' : '') + w.from + 'h–' + w.to + 'h';
      }).join(', ');
      if (s.precip_mm >= 0.5) {
        parts.push('Lluvia prevista (' + wins + '): ' + fcNum(s.precip_mm, 1) + ' mm en 24 h.');
      } else {
        parts.push('Posible lluvia débil o chubascos aislados (' + wins + '), con poca cantidad: ' + (s.precip_mm >= 0.1 ? fcNum(s.precip_mm, 1) + ' mm en 24 h' : 'menos de 0,1 mm') + '.');
      }
    }
    parts.push('Temperatura de ' + fcNum(s.tmin) + '° (' + s.tmin_time + ') a ' + fcNum(s.tmax) + '° (' + s.tmax_time + ').');
    if (s.gust_max != null) parts.push('Rachas de hasta ' + fcNum(s.gust_max) + ' km/h.');
    return parts.join(' ');
  }

  function fcStat(label, value, sub) {
    return '<div class="fc-stat"><div class="fc-stat-label">' + label + '</div><div class="fc-stat-value">' + value +
      '</div>' + (sub ? '<div class="fc-stat-sub">' + sub + '</div>' : '') + '</div>';
  }

  // Gráfico de las próximas 24 h: línea de temperatura y barras de lluvia (mm/h).
  function renderSummaryChart(hours) {
    var n = hours.length;
    if (n < 2) return '';
    var vbW = 720, vbH = 230, padL = 34, padR = 14, padT = 22, padB = 26;
    var plotW = vbW - padL - padR, plotH = vbH - padT - padB, bottom = padT + plotH;
    var temps = hours.map(function (h) { return h.temp; }).filter(function (v) { return v != null; });
    if (!temps.length) return '';
    var tMin = Math.floor(Math.min.apply(null, temps) - 1), tMax = Math.ceil(Math.max.apply(null, temps) + 1);
    var toX = function (i) { return padL + (i / (n - 1)) * plotW; };
    var toY = function (v) { return padT + (1 - (v - tMin) / ((tMax - tMin) || 1)) * plotH; };
    var maxR = Math.max(2, Math.max.apply(null, hours.map(function (h) { return h.precip || 0; })));
    var barW = Math.max(3, plotW / n * 0.62);
    var svg = '<svg class="fc-chart" viewBox="0 0 ' + vbW + ' ' + vbH + '" role="img" aria-label="Temperatura y lluvia previstas en las próximas 24 horas">';
    fcSum = { vbW: vbW, X: [], Y: [] };
    hours.forEach(function (h, i) { fcSum.X.push(toX(i)); fcSum.Y.push(h.temp != null ? toY(h.temp) : null); });
    var step = (tMax - tMin) <= 6 ? 1 : (tMax - tMin) <= 12 ? 2 : 5;
    for (var t = Math.ceil(tMin / step) * step; t <= tMax; t += step) {
      svg += '<line class="chart-grid-line" x1="' + padL + '" y1="' + toY(t) + '" x2="' + (vbW - padR) + '" y2="' + toY(t) + '"/>';
      svg += '<text class="chart-axis-label" x="' + (padL - 6) + '" y="' + (toY(t) + 3.5) + '" text-anchor="end">' + t + '°</text>';
    }
    hours.forEach(function (h, i) {
      var x = toX(i);
      var mm = h.precip || 0;
      if (mm > 0) {
        var bh = Math.max(2, (mm / maxR) * plotH * 0.42);
        svg += '<rect class="fc-bar" x="' + (x - barW / 2) + '" y="' + (bottom - bh) + '" width="' + barW + '" height="' + bh + '" rx="2"/>';
        if (mm >= 0.3) svg += '<text class="fc-bar-label" x="' + x + '" y="' + (bottom - bh - 3) + '" text-anchor="middle">' + fcNum(mm, 1) + '</text>';
      }
      if (i % 3 === 0) {
        svg += '<text class="chart-axis-label" x="' + x + '" y="' + (vbH - 8) + '" text-anchor="middle">' + fcHour(h.t) + '</text>';
      }
      if (i > 0 && h.t.slice(11, 13) === '00') {
        svg += '<line class="chart-grid-line fc-daysep" x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + bottom + '"/>';
      }
    });
    var path = '';
    hours.forEach(function (h, i) {
      if (h.temp == null) return;
      path += (path ? ' L ' : 'M ') + toX(i) + ' ' + toY(h.temp);
    });
    if (path) svg += '<path class="chart-line" d="' + path + '" fill="none"/>';
    hours.forEach(function (h, i) {
      if (h.temp == null || i % 3 !== 0) return;
      svg += '<circle class="chart-dot" cx="' + toX(i) + '" cy="' + toY(h.temp) + '" r="3"/>';
      if (i > 0) svg += '<text class="fc-temp-label" x="' + toX(i) + '" y="' + (toY(h.temp) - 8) + '" text-anchor="middle">' + Math.round(h.temp) + '°</text>';
    });
    svg += fcHoverLayer(padT, bottom, vbH - 6);
    var cw = plotW / (n - 1);
    hours.forEach(function (h, i) {
      svg += '<rect class="fc-mg-hit" data-i="' + i + '" x="' + (toX(i) - cw / 2).toFixed(1) + '" y="0" width="' + cw.toFixed(1) + '" height="' + vbH + '"/>';
    });
    return svg + '</svg>';
  }

  function renderSummary() {
    var s = fcData.summary;
    var hours = fcData.hours.slice(0, 24);
    var now = s.now || {};
    var sky = now.sky || {};
    var html = '<div class="fc-lead"><div class="fc-lead-sky"><span class="fc-lead-emoji">' + fcEsc(sky.emoji) + '</span>' +
      '<div><div class="fc-lead-temp">' + fcNum(now.temp, 1) + '<span>°C</span></div><div class="fc-lead-label">' + fcEsc(sky.label) + '</div></div></div>' +
      '<p class="fc-lead-text">' + fcSummaryText(s) + '</p></div>';

    html += '<div class="fc-stats">' +
      fcStat('Sensación', fcNum(now.feels, 1) + '°') +
      fcStat('Prob. de lluvia', fcNum(now.pop) + '%', 'máx. 24 h: ' + fcNum(s.pop_max) + '%') +
      fcStat('Índice UV', fcNum(now.uv, 1), 'máx. hoy: ' + fcNum(s.uv_max_today, 1)) +
      fcStat('Nubosidad', fcNum(now.cloud) + '%') +
      fcStat('Isoterma 0 °C', now.freezing != null ? Math.round(now.freezing).toLocaleString('es-ES') + ' m' : '—') +
      fcStat('Presión', fcNum(now.pressure) + ' hPa') +
      fcStat('Sol', (s.sunrise || '—') + ' – ' + (s.sunset || '—'), 'orto – ocaso') +
      '</div>';

    html += '<div class="fc-chart-box"><div class="fc-chart-wrap">' + renderSummaryChart(hours) + '</div><div class="fc-tip" hidden></div></div>';

    var row = function (label, cell) {
      return '<tr><th scope="row">' + label + '</th>' + hours.map(function (h, i) {
        return cell(h).replace('<td', '<td data-i="' + i + '"');
      }).join('') + '</tr>';
    };
    html += '<div class="fc-table-wrap"><table class="fc-table"><thead><tr><th></th>' +
      hours.map(function (h, i) { return '<th scope="col" data-i="' + i + '">' + fcHour(h.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      row('', function (h) { return '<td class="fc-cell-emoji" title="' + fcEsc(h.sky.label) + '">' + fcEsc(h.sky.emoji) + '</td>'; }) +
      row('Temp.', function (h) { return '<td class="fc-cell-temp">' + fcNum(h.temp) + '°</td>'; }) +
      row('Lluvia (mm)', function (h) {
        var mm = h.precip || 0;
        var a = Math.min(0.55, mm / 3);
        return '<td' + (mm > 0 ? ' class="fc-wet" style="background:rgba(80,160,255,' + a.toFixed(2) + ')"' : '') + '>' + (mm > 0 ? fcNum(mm, 1) : '–') + '</td>';
      }) +
      row('Prob. lluvia', function (h) { return '<td class="fc-muted">' + (h.pop != null ? fcNum(h.pop) + '%' : '–') + '</td>'; }) +
      row('Viento (km/h)', function (h) { return '<td>' + fcArrow(h.wind_deg) + '<span>' + fcNum(h.wind) + '</span></td>'; }) +
      row('Rachas', function (h) { return '<td class="fc-muted">' + fcNum(h.gust) + '</td>'; }) +
      '</tbody></table></div>';
    summaryEl.innerHTML = html;
    var chartSvg = summaryEl.querySelector('.fc-chart');
    var tableWrap = summaryEl.querySelector('.fc-table-wrap');
    if (chartSvg) {
      var api = fcBindHover('sum', summaryEl.querySelector('.fc-chart-box'), chartSvg, fcSum, hours, function (i, source) {
        summaryEl.querySelectorAll('.fc-table [data-i].is-hl').forEach(function (c) { c.classList.remove('is-hl'); });
        if (i == null) return;
        summaryEl.querySelectorAll('.fc-table [data-i="' + i + '"]').forEach(function (c) { c.classList.add('is-hl'); });
        if (source === 'chart') {
          // desde el gráfico: la tabla se desplaza para mostrar la columna de esa hora
          var cell = summaryEl.querySelector('.fc-table thead [data-i="' + i + '"]');
          var fixed = summaryEl.querySelector('.fc-table tbody th');
          if (cell) {
            var cr = cell.getBoundingClientRect();
            fcReveal(tableWrap, cr.left, cr.right, fixed ? fixed.getBoundingClientRect().width : 0);
          }
        }
      }, [tableWrap]);
      // desde la tabla: se ilumina la hora en el gráfico (y se desplaza si hace falta)
      var cellHour = function (e) {
        var c = e.target.closest ? e.target.closest('[data-i]') : null;
        return c ? parseInt(c.getAttribute('data-i'), 10) : null;
      };
      var fromTable = function (e) {
        var i = cellHour(e);
        if (i == null) api.hide(); else api.activate(i);
      };
      tableWrap.addEventListener('pointermove', fromTable);
      tableWrap.addEventListener('pointerdown', fromTable);
      tableWrap.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') api.hide(); });
    }
  }

  // ─── Meteograma de 7 días ────────────────────────────────────────────────────
  // Iconos de línea (24×24, estilo Lucide). Cada icono es una lista de trazos
  // independientes: no se pueden unir en un solo path porque algunos usan "m" relativo.
  var FC_CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
  var FC_CLOUD2 = 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242';
  var FC_ICONS = {
    sun: ['<circle cx="12" cy="12" r="4"/>', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
    moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
    cloud_sun: ['M12 2v2', 'm4.93 4.93 1.41 1.41', 'M20 12h2', 'm19.07 4.93-1.41 1.41', 'M15.947 12.65a4 4 0 0 0-5.925-4.128', 'M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z'],
    cloud_moon: ['M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6Z', 'M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36'],
    cloud: [FC_CLOUD],
    fog: [FC_CLOUD2, 'M16 17H7', 'M17 21H9'],
    drizzle: [FC_CLOUD2, 'M8 19v1', 'M8 14v1', 'M16 19v1', 'M16 14v1', 'M12 21v1', 'M12 16v1'],
    rain: [FC_CLOUD2, 'M16 14v6', 'M8 14v6', 'M12 16v6'],
    snow: [FC_CLOUD2, 'M8 15h.01', 'M8 19h.01', 'M12 17h.01', 'M12 21h.01', 'M16 15h.01', 'M16 19h.01'],
    thunder: ['M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973', 'm13 12-3 5h4l-3 5']
  };

  // Código neutro de cielo (forecast.json) -> icono y color
  function fcIconFor(sky) {
    var night = !!sky.night;
    switch (sky.code) {
      case 'clear': return night ? 'moon' : 'sun';
      case 'mostly_clear':
      case 'partly_cloudy': return night ? 'cloud_moon' : 'cloud_sun';
      case 'fog': return 'fog';
      case 'light_rain': return 'drizzle';
      case 'rain':
      case 'heavy_rain': return 'rain';
      case 'thunder': return 'thunder';
      case 'snow': return 'snow';
      default: return 'cloud';
    }
  }

  function fcIconBody(name) {
    var parts = FC_ICONS[name] || FC_ICONS.cloud;
    return parts.map(function (d) { return d.charAt(0) === '<' ? d : '<path d="' + d + '"/>'; }).join('');
  }

  function fcIconSvg(name, x, y, size) {
    return '<svg class="fc-ic fc-ic--' + name + '" x="' + (x - size / 2) + '" y="' + (y - size / 2) + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + fcIconBody(name) + '</svg>';
  }

  function fcIconHtml(name, size) {
    return '<svg class="fc-ic fc-ic--' + name + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + fcIconBody(name) + '</svg>';
  }

  // Curva suave que no sobrepasa los puntos (interpolación cúbica monótona)
  function fcSmooth(pts) {
    var n = pts.length, i;
    if (n < 2) return '';
    var dx = [], m = [], t = [];
    for (i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
    }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C ' + (pts[i][0] + h).toFixed(1) + ' ' + (pts[i][1] + t[i] * h).toFixed(1) + ' ' +
        (pts[i + 1][0] - h).toFixed(1) + ' ' + (pts[i + 1][1] - t[i + 1] * h).toFixed(1) + ' ' +
        pts[i + 1][0].toFixed(1) + ' ' + pts[i + 1][1].toFixed(1);
    }
    return d;
  }

  var fcMg = null; // geometría del último meteograma (posiciones en unidades del viewBox)
  var fcSum = null; // ídem para el gráfico de las próximas horas

  function fcTipHtml(h) {
    var d = new Date(h.t.slice(0, 10) + 'T12:00:00');
    var when = capitalize(d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + fcHour(h.t);
    // `extra`: filas que se ocultan en la versión compacta (pantallas estrechas)
    var row = function (label, value, extra) {
      var c = extra ? ' class="fc-tip-x"' : '';
      return '<span' + c + '>' + label + '</span><strong' + c + '>' + value + '</strong>';
    };
    return '<div class="fc-tip-head">' + fcEsc(when) + '</div>' +
      '<div class="fc-tip-sky">' + fcIconHtml(fcIconFor(h.sky), 22) + '<span>' + fcEsc(h.sky.label) + '</span></div>' +
      '<div class="fc-tip-grid">' +
      row('<span class="fc-tip-full">Temperatura</span><i class="fc-tip-abbr">Temp.</i>', fcNum(h.temp, 1) + '°<em>sens. ' + fcNum(h.feels, 1) + '°</em>') +
      row('Lluvia', fcNum(h.precip, 1) + ' mm<em>prob. ' + fcNum(h.pop) + '%</em>') +
      (h.pop_storm ? row('Tormenta', 'prob. ' + fcNum(h.pop_storm) + '%') : '') +
      row('Viento', fcArrow(h.wind_deg) + fcNum(h.wind) + ' km/h' + (h.wind_dir ? ' ' + fcEsc(h.wind_dir) : '') + '<em>rachas ' + fcNum(h.gust) + '</em>') +
      row('Humedad', fcNum(h.hum) + '%', true) +
      row('Nubosidad', fcNum(h.cloud) + '%', true) +
      row('Índice UV', fcNum(h.uv, 1), true) +
      row('Presión', fcNum(h.pressure) + ' hPa', true) +
      '</div>';
  }

  function fcMeteogramSvg() {
    var hrs = fcData.hours, n = hrs.length;
    var vbW = 1400, vbH = 400, padL = 46, padR = 54, padT = 66, padB = 32;
    var plotW = vbW - padL - padR, plotH = vbH - padT - padB, bottom = padT + plotH;
    var temps = hrs.map(function (h) { return h.temp; }).filter(function (v) { return v != null; });
    var tLo = Math.floor((Math.min.apply(null, temps) - 2) / 5) * 5, tHi = Math.ceil((Math.max.apply(null, temps) + 3) / 5) * 5;
    var maxP = Math.max.apply(null, hrs.map(function (h) { return h.precip || 0; }));
    var rStep = maxP <= 4 ? 1 : maxP <= 8 ? 2 : maxP <= 16 ? 4 : 5;
    var rMax = Math.max(rStep * 3, Math.ceil(maxP / rStep) * rStep);
    var X = function (i) { return padL + (i / (n - 1)) * plotW; };
    var YT = function (v) { return padT + (1 - (v - tLo) / (tHi - tLo)) * plotH; };
    var YR = function (v) { return bottom - (v / rMax) * plotH; };
    var svg = '<svg class="fc-mg-svg" viewBox="0 0 ' + vbW + ' ' + vbH + '" role="img" aria-label="Meteograma de 7 días: temperatura, lluvia y estado del cielo">';

    // ejes y rejilla
    for (var t = tLo; t <= tHi; t += 5) {
      svg += '<line class="chart-grid-line" x1="' + padL + '" y1="' + YT(t) + '" x2="' + (vbW - padR) + '" y2="' + YT(t) + '"/>';
      svg += '<text class="chart-axis-label fc-mg-axis-t" x="' + (padL - 7) + '" y="' + (YT(t) + 3.5) + '" text-anchor="end">' + t + '°</text>';
    }
    for (var r = 0; r <= rMax; r += rStep) {
      svg += '<text class="chart-axis-label fc-mg-axis-r" x="' + (vbW - padR + 7) + '" y="' + (YR(r) + 3.5) + '" text-anchor="start">' + r + ' mm</text>';
    }
    svg += '<line class="fc-mg-axis-line fc-mg-axis-line--t" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + bottom + '"/>';
    svg += '<line class="fc-mg-axis-line fc-mg-axis-line--r" x1="' + (vbW - padR) + '" y1="' + padT + '" x2="' + (vbW - padR) + '" y2="' + bottom + '"/>';
    svg += '<line class="fc-mg-axis-line" x1="' + padL + '" y1="' + bottom + '" x2="' + (vbW - padR) + '" y2="' + bottom + '"/>';

    // días: separadores a medianoche y cabecera (nombre y máx/mín)
    var starts = [0];
    hrs.forEach(function (h, i) { if (i > 0 && h.t.slice(11, 13) === '00') starts.push(i); });
    starts.forEach(function (i0, k) {
      var i1 = k + 1 < starts.length ? starts[k + 1] : n - 1;
      if (k > 0) svg += '<line class="fc-mg-daysep" x1="' + X(i0) + '" y1="' + (padT - 40) + '" x2="' + X(i0) + '" y2="' + bottom + '"/>';
      var width = X(i1) - X(i0);
      if (width < 70) return;
      var date = hrs[i0].t.slice(0, 10);
      var day = fcData.days.filter(function (d) { return d.date === date; })[0];
      var name = k === 0 ? 'Hoy' : (k === 1 ? 'Mañana' : capitalize(new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })));
      var cx = X(i0) + width / 2;
      svg += '<text class="fc-mg-day" x="' + cx + '" y="' + (padT - 40) + '" text-anchor="middle" dy="12">' + fcEsc(name) + '</text>';
      if (day && day.tmax != null && day.tmin != null && width > 110) {
        svg += '<text class="fc-mg-daytemps" x="' + cx + '" y="' + (padT - 40) + '" text-anchor="middle" dy="27"><tspan class="fc-mg-tmax">' + Math.round(day.tmax) + '°</tspan> / <tspan class="fc-mg-tmin">' + Math.round(day.tmin) + '°</tspan></text>';
      }
    });

    // barras de lluvia (mm por hora, eje derecho)
    var bw = Math.max(2, plotW / n * 0.78);
    hrs.forEach(function (h, i) {
      var mm = h.precip || 0;
      if (mm <= 0) return;
      svg += '<rect class="fc-mg-bar" x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + YR(mm).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1.5, bottom - YR(mm)).toFixed(1) + '" rx="1"/>';
    });

    fcMg = { vbW: vbW, X: [], Y: [] };
    hrs.forEach(function (h, i) { fcMg.X.push(X(i)); fcMg.Y.push(h.temp != null ? YT(h.temp) : null); });

    // curva de temperatura
    var pts = [];
    hrs.forEach(function (h, i) { if (h.temp != null) pts.push([X(i), YT(h.temp)]); });
    svg += '<path class="fc-mg-line" d="' + fcSmooth(pts) + '" fill="none"/>';

    // etiquetas de hora e iconos (cada 6 h y en la primera hora)
    var lastIcon = -99;
    hrs.forEach(function (h, i) {
      var hh = parseInt(h.t.slice(11, 13), 10);
      var tick = hh % 6 === 0;
      if (tick || i === 0) {
        svg += '<text class="chart-axis-label" x="' + X(i) + '" y="' + (vbH - 10) + '" text-anchor="middle">' + hh + 'h</text>';
        if (h.temp != null && (tick || i - lastIcon >= 3) && i - lastIcon >= 3) {
          svg += fcIconSvg(fcIconFor(h.sky), X(i), Math.max(padT - 6, YT(h.temp) - 24), 26);
          lastIcon = i;
        }
      }
    });

    // guía vertical, punto, etiqueta de hora y zonas sensibles (una por hora)
    svg += fcHoverLayer(padT, bottom, vbH - 9);
    fcMg.pillY = vbH - 9;
    var cw = plotW / n;
    hrs.forEach(function (h, i) {
      svg += '<rect class="fc-mg-hit" data-i="' + i + '" x="' + (X(i) - cw / 2).toFixed(1) + '" y="0" width="' + cw.toFixed(1) + '" height="' + vbH + '"/>';
    });
    return svg + '</svg>';
  }

  function renderMeteogram() {
    var hrs = fcData.hours;
    var a = new Date(hrs[0].t.slice(0, 10) + 'T12:00:00'), b = new Date(hrs[hrs.length - 1].t.slice(0, 10) + 'T12:00:00');
    var range = a.getMonth() === b.getMonth()
      ? a.getDate() + ' – ' + b.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      : a.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' – ' + b.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    weekEl.innerHTML = '<div class="fc-mg">' +
      '<div class="fc-mg-head"><div><div class="fc-mg-title">Meteograma · Cerdanyola del Vallès</div>' +
      '<div class="fc-mg-sub">AEMET · ECMWF · ICON · AROME · 7 días · ' + range + '</div></div>' +
      '<div class="fc-mg-legend"><span><i class="fc-lg-line"></i>Temp.</span><span><i class="fc-lg-bar"></i>Precip.</span></div></div>' +
      '<p class="fc-mg-hint">Desliza el gráfico para ver los 7 días →</p>' +
      '<div class="fc-mg-scroll">' + fcMeteogramSvg() + '</div>' +
      '<div class="fc-tip" hidden></div></div>';
    fcBindHover('mg', weekEl.querySelector('.fc-mg'), weekEl.querySelector('.fc-mg-svg'), fcMg, fcData.hours, null);
  }

  // Hover de los gráficos (próximas horas y 7 días): guía vertical, punto sobre la curva, etiqueta
  // de la hora en el eje y tarjeta con los datos. Cada hora tiene una zona sensible de toda la
  // altura del gráfico, así no hace falta acertar con la línea. `onHover(i|null)` avisa de la hora activa.
  var fcDocHandlers = {};

  function fcPillLabel(h, hours) {
    if (h.t.slice(0, 10) === hours[0].t.slice(0, 10)) return 'Hoy · ' + fcHour(h.t);
    var d = new Date(h.t.slice(0, 10) + 'T12:00:00');
    return capitalize(d.toLocaleDateString('es-ES', { weekday: 'short' })) + ' · ' + fcHour(h.t);
  }

  // Desplaza horizontalmente `scroller` lo justo para que el tramo [from, to] (px de ventana) quede
  // a la vista. `inset` reserva sitio a la izquierda (columna fija de la tabla).
  function fcReveal(scroller, from, to, inset) {
    var r = scroller.getBoundingClientRect();
    var left = r.left + (inset || 0) + 8, right = r.right - 8;
    if (from < left) scroller.scrollLeft -= (left - from);
    else if (to > right) scroller.scrollLeft += (to - right);
  }

  // Hover de los gráficos (próximas horas y 7 días): guía vertical, punto sobre la curva, etiqueta
  // de la hora en el eje y tarjeta con los datos. Cada hora tiene una zona sensible de toda la
  // altura del gráfico, así no hace falta acertar con la línea.
  // `onHover(i|null, origen)` avisa de la hora activa ('chart' o 'table'). `keepInside` son otros
  // elementos que no cuentan como "fuera" al tocar (la tabla). Devuelve { activate(i), hide() }:
  // activate permite encender una hora desde fuera (la tabla), desplazando el gráfico si hace falta.
  function fcBindHover(key, box, svg, geom, hours, onHover, keepInside) {
    var tip = box.querySelector('.fc-tip');
    var cross = svg.querySelector('.fc-mg-cross');
    var mark = svg.querySelector('.fc-mg-mark');
    var pill = svg.querySelector('.fc-pill');
    var pillBg = pill.querySelector('rect');
    var pillTx = pill.querySelector('text');
    var scroller = svg.parentNode;
    var current = null;

    function hide() {
      current = null;
      tip.hidden = true;
      cross.classList.remove('is-on');
      mark.classList.remove('is-on');
      pill.classList.remove('is-on');
      if (onHover) onHover(null, null);
    }

    function render(i, clientX, source) {
      var h = hours[i];
      if (!h) { hide(); return; }
      current = i;
      var x = geom.X[i];
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.classList.add('is-on');
      if (geom.Y[i] != null) {
        mark.setAttribute('cx', x);
        mark.setAttribute('cy', geom.Y[i]);
        mark.classList.add('is-on');
      } else {
        mark.classList.remove('is-on');
      }
      var label = fcPillLabel(h, hours);
      var w = label.length * 7 + 18;
      var px = Math.min(Math.max(x, w / 2 + 2), geom.vbW - w / 2 - 2);
      pillTx.textContent = label;
      pillTx.setAttribute('x', px);
      pillBg.setAttribute('x', px - w / 2);
      pillBg.setAttribute('width', w);
      pill.classList.add('is-on');

      tip.innerHTML = fcTipHtml(h);
      tip.hidden = false;
      var outer = box.getBoundingClientRect();
      var tw = tip.offsetWidth;
      var left = clientX - outer.left + 18;
      if (left + tw > outer.width - 4) left = clientX - outer.left - tw - 18;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = '8px';
      if (onHover) onHover(i, source);
    }

    function show(e) {
      var hit = e.target.closest ? e.target.closest('.fc-mg-hit') : null;
      if (!hit) { hide(); return; }
      render(parseInt(hit.getAttribute('data-i'), 10), e.clientX, 'chart');
    }

    function activate(i) {
      if (i === current || !hours[i]) return;
      var r = svg.getBoundingClientRect();
      var px = r.left + geom.X[i] / geom.vbW * r.width;
      fcReveal(scroller, px - 56, px + 56, 0);
      r = svg.getBoundingClientRect();
      render(i, r.left + geom.X[i] / geom.vbW * r.width, 'table');
    }

    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    // Con el dedo, "salir" ocurre al levantarlo: el tooltip se mantiene hasta tocar fuera.
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hide(); });
    if (fcDocHandlers[key]) document.removeEventListener('pointerdown', fcDocHandlers[key]);
    fcDocHandlers[key] = function (e) {
      var inside = box.contains(e.target) || (keepInside || []).some(function (el) { return el && el.contains(e.target); });
      if (!inside) hide();
    };
    document.addEventListener('pointerdown', fcDocHandlers[key]);
    return { activate: activate, hide: hide };
  }

  // Elementos SVG comunes: guía, punto, etiqueta de hora (los mueve fcBindHover)
  function fcHoverLayer(padT, bottom, pillY) {
    return '<line class="fc-mg-cross" x1="0" y1="' + padT + '" x2="0" y2="' + bottom + '"/><circle class="fc-mg-mark" cx="0" cy="0" r="5"/>' +
      '<g class="fc-pill"><rect x="0" y="' + (pillY - 13) + '" width="40" height="19" rx="9.5"/><text x="0" y="' + pillY + '" text-anchor="middle"></text></g>';
  }

  function fcSetTab(tab, push) {
    fcTab = tab === 'week' ? 'week' : 'summary';
    document.querySelectorAll('.forecast-tab').forEach(function (b) {
      var on = b.dataset.tab === fcTab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    summaryEl.hidden = fcTab !== 'summary';
    weekEl.hidden = fcTab !== 'week';
    if (push) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set('tab', fcTab);
        history.replaceState(null, '', u.toString());
      } catch (e) {}
    }
  }

  function renderForecast() {
    renderSummary();
    renderMeteogram();
    var src = fcData.sources || {};
    var names = [];
    if (src.aemet && src.aemet.ok) names.push('AEMET');
    if (src.ecmwf && src.ecmwf.ok) names.push('ECMWF');
    if (src.icon && src.icon.ok) names.push('DWD ICON');
    if (src.arome && src.arome.ok) names.push('Météo-France (AROME)');
    if (src['open-meteo'] && src['open-meteo'].ok) names.push('Open-Meteo');
    var upd = fcData.updated ? new Date(fcData.updated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    fcSourcesEl.textContent = 'Fuentes: ' + names.join(' · ') + (upd ? ' · actualizado a las ' + upd : '') + '. Cielo y probabilidad de lluvia: AEMET. Cantidad de lluvia: media de los modelos ECMWF, ICON y AROME. Pronóstico orientativo; los avisos oficiales están en AEMET y Meteocat.';
  }

  function initForecastTabs() {
    document.querySelectorAll('.forecast-tab').forEach(function (b) {
      b.addEventListener('click', function () { fcSetTab(b.dataset.tab, true); });
    });
    var q = new URLSearchParams(window.location.search).get('tab');
    fcSetTab(q === 'week' ? 'week' : 'summary', false);
  }

  function fetchForecast() {
    fetch('forecast.json?t=' + Math.floor(Date.now() / 300000))
      .then(function (res) { if (!res.ok) throw new Error('Error de red'); return res.json(); })
      .then(function (data) {
        if (!data.hours || !data.hours.length || !data.days || !data.summary) throw new Error('Datos no válidos');
        // El JSON puede tener hasta ~30 min: descarta las horas ya pasadas
        var h0 = Math.floor(Date.now() / 3600000) * 3600;
        var keep = data.hours.filter(function (h) { return h.ts >= h0; });
        if (keep.length) data.hours = keep;
        fcData = data;
        renderForecast();
        forecastEl.hidden = false;
        errorEl.hidden = true;
      })
      .catch(function () { if (!fcData) showError(); });
  }

  // ─── Ola de calor ────────────────────────────────────────────────────────────
  // El estado (activa/no activa) lo decide un agente que consulta fuentes
  // oficiales (AEMET, Meteocat) y lo escribe en heatwave_status.json — no se
  // calcula aquí con un umbral local, para evitar discrepancias con lo que
  // dicen las fuentes oficiales.

  function renderHeatwaveBanner(status) {
    if (!heatwaveBannerEl) return;
    if (!status || !status.active) { heatwaveBannerEl.hidden = true; return; }

    heatwaveBannerEl.innerHTML =
      '<span class="heatwave-icon">🔥</span>' +
      '<span class="heatwave-text">Ola de calor' + (status.headline ? ': <strong>' + status.headline + '</strong>' : '') + '</span>';
    heatwaveBannerEl.hidden = false;
  }

  function fetchHeatwave() {
    fetch('heatwave_status.json?t=' + Date.now())
      .then(function (res) { if (!res.ok) throw new Error('Error de red'); return res.json(); })
      .then(function (data) { renderHeatwaveBanner(data); })
      .catch(function () {
        if (heatwaveBannerEl) heatwaveBannerEl.hidden = true;
      });
  }

  // ─── Polen ───────────────────────────────────────────────────────────────────

  function aggregatePollenByDay(hourly) {
    if (!hourly || !hourly.time) return [];
    var times = hourly.time;
    var byDay = {};
    for (var i = 0; i < times.length; i++) {
      var dateStr = times[i].slice(0, 10);
      if (!byDay[dateStr]) {
        byDay[dateStr] = {};
        POLLEN_TYPES.forEach(function (t) { byDay[dateStr][t.key] = []; });
      }
      POLLEN_TYPES.forEach(function (t) {
        var arr = hourly[t.key];
        if (!arr || i >= arr.length) return;
        var v = arr[i];
        if (v != null && !isNaN(v)) byDay[dateStr][t.key].push(v);
      });
    }
    var sortedDays = Object.keys(byDay).sort();
    return sortedDays.slice(0, 5).map(function (d) {
      var row = { date: d };
      POLLEN_TYPES.forEach(function (t) {
        var vals = byDay[d][t.key];
        row[t.key] = vals.length ? Math.max.apply(null, vals) : null;
      });
      return row;
    });
  }

  function formatPollenValue(v) {
    if (v == null || isNaN(v)) return '—';
    return v.toFixed(1) + ' gr/m³';
  }

  function renderPollen(dailyRows) {
    if (!dailyRows || dailyRows.length === 0) {
      pollenErrorEl.hidden = false;
      pollenGridEl.innerHTML = '';
      pollenSectionEl.hidden = false;
      return;
    }
    pollenErrorEl.hidden = true;
    pollenGridEl.innerHTML = '';
    dailyRows.forEach(function (day) {
      var card = document.createElement('div');
      card.className = 'pollen-card';
      var rowsHtml = POLLEN_TYPES.map(function (t) {
        return '<div class="pollen-row"><span class="pollen-type">' + t.label + '</span><span class="pollen-value">' + formatPollenValue(day[t.key]) + '</span></div>';
      }).join('');
      card.innerHTML = '<div class="pollen-card-date">' + capitalize(formatDate(day.date)) + '</div>' + rowsHtml;
      pollenGridEl.appendChild(card);
    });
    pollenSectionEl.hidden = false;
  }

  function fetchPollen() {
    var cacheKey = 'meteo-cache-pollen';
    var cached = getCache(cacheKey);
    if (cached) { renderPollen(cached); return; }
    var params = new URLSearchParams({
      latitude: COORDS.lat,
      longitude: COORDS.lon,
      hourly: POLLEN_TYPES.map(function (t) { return t.key; }).join(','),
      timezone: TIMEZONE,
      forecast_days: 5,
      domains: 'cams_europe'
    });
    fetch('https://air-quality-api.open-meteo.com/v1/air-quality?' + params.toString())
      .then(function (res) { if (!res.ok) throw new Error('Error de red'); return res.json(); })
      .then(function (data) {
        if (!data.hourly) throw new Error('Sin datos');
        var rows = aggregatePollenByDay(data.hourly);
        setCache(cacheKey, rows);
        renderPollen(rows);
      })
      .catch(function () {
        pollenErrorEl.hidden = false;
        pollenGridEl.innerHTML = '';
        pollenSectionEl.hidden = false;
      });
  }

  // ─── Estación (today.txt) ────────────────────────────────────────────────────

  function parseStationRow(line) {
    const parts = line.trim().split(',');
    if (parts.length < 9) return null;
    var row = {
      time: parts[0],
      tempOut: parseFloat(parts[1]),
      humidityOut: parseInt(parts[2], 10),
      windSpeed: parseFloat(parts[3]),
      windDeg: parseInt(parts[4], 10),
      windDir: parts[5],
      pressure: parseFloat(parts[6]),
      tempIn: parseFloat(parts[7]),
      humidityIn: parseInt(parts[8], 10)
    };
    if (parts.length >= 14) {
      row.heatIndex = parseFloat(parts[9]);
      row.dewPoint = parseFloat(parts[10]);
      row.windGust = parseFloat(parts[11]);
      row.rainDaily = parseFloat(parts[12]);
      row.barTrend = parts[13];
    }
    return row;
  }

  function formatStationValue(value, unit) {
    if (value == null || isNaN(value)) return '—';
    if (unit === '°C') return value.toFixed(1) + '\u00a0' + unit;
    if (unit === '%') return value + unit;
    if (unit === 'km/h') return value.toFixed(1) + ' ' + unit;
    if (unit === '°') return value + unit;
    if (unit === 'hPa') return value.toFixed(1) + ' ' + unit;
    return String(value);
  }

  function getChartColors() {
    var s = getComputedStyle(document.documentElement);
    return {
      text: s.getPropertyValue('--text-muted').trim() || '#8b9cb3',
      grid: s.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)',
      line: s.getPropertyValue('--accent').trim() || '#3b9b7a'
    };
  }

  // ─── D3 History Charts ───────────────────────────────────────────────────────

  function renderHistoryCharts(history) {
    if (!history || history.length === 0) return;
    historySectionEl.hidden = false;
    historyGridEl.innerHTML = '';
    var colors = getChartColors();

    // Pass 1 (write): build and append every card up front, no reads in between.
    var items = [];
    HISTORY_SERIES.forEach(function (series, idx) {
      var values = history.map(function (r) {
        var v = r[series.key];
        return (v != null && !isNaN(v)) ? v : null;
      });
      var hasData = values.some(function (v) { return v != null; });
      if (!hasData) return;

      var isWindDir = series.windArrows === true;

      var card = document.createElement('div');
      card.className = 'history-card';
      var subtitle = series.subtitleKey && history[history.length - 1]
        ? history[history.length - 1][series.subtitleKey] : '';
      card.innerHTML =
        '<div class="history-card-title">' + series.title + '</div>' +
        (subtitle ? '<div class="history-card-subtitle">' + subtitle + '</div>' : '') +
        '<div class="history-chart-wrap" id="history-wrap-' + idx + '"></div>';
      historyGridEl.appendChild(card);

      items.push({ series: series, idx: idx, values: values, isWindDir: isWindDir });
    });

    // Defer rendering until the cards are in DOM
    requestAnimationFrame(function () {
      // Pass 2 (read): measure every wrap together, before any chart writes to the DOM.
      items.forEach(function (item) {
        var wrap = document.getElementById('history-wrap-' + item.idx);
        if (!wrap) return;
        var rect = wrap.getBoundingClientRect();
        item.wrap = wrap;
        item.totalW = rect.width || 300;
        item.totalH = rect.height || 200;
      });

      // Pass 3 (write): build every chart using the cached measurements.
      items.forEach(function (item) {
        var series = item.series, isWindDir = item.isWindDir, values = item.values;
        var wrap = item.wrap;
        if (!wrap) return;

        var totalW = item.totalW;
        var totalH = item.totalH;
        var margin = { top: 8, right: 8, bottom: 20, left: isWindDir ? 4 : 30 };
        var width = totalW - margin.left - margin.right;
        var height = totalH - margin.top - margin.bottom;
        var n = history.length;

        // X scale (index-based)
        var xScale = d3.scaleLinear().domain([0, n - 1]).range([0, width]);

        // Y scale
        var validVals = values.filter(function (v) { return v != null; });
        var yMin, yMax;
        if (isWindDir) {
          yMin = 0; yMax = 1;
        } else if (series.unit === '%') {
          yMin = 0; yMax = 100;
        } else {
          var vMin = d3.min(validVals);
          var vMax = d3.max(validVals);
          var pad = (vMax - vMin) * 0.1 || 1;
          yMin = vMin - pad;
          yMax = vMax + pad;
        }
        var yScale = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

        // Build SVG
        var svgEl = d3.select(wrap).append('svg')
          .attr('width', '100%')
          .attr('height', totalH)
          .attr('viewBox', '0 0 ' + totalW + ' ' + totalH)
          .attr('preserveAspectRatio', 'none');

        var g = svgEl.append('g')
          .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        // Determine X tick step from pixel width
        var step = totalW < 400 ? 6 : totalW < 600 ? 3 : 2;

        // Collect X tick positions (indices where time is HH:00 and H % step === 0)
        var xTicks = [];
        history.forEach(function (r, i) {
          var label = r.time;
          if (!label) return;
          var colon = label.indexOf(':');
          if (colon < 0) return;
          if (parseInt(label.slice(colon + 1), 10) !== 0) return;
          var h = parseInt(label.slice(0, colon), 10);
          if (h % step === 0) xTicks.push({ i: i, label: label.slice(0, colon + 3) });
        });

        // Grid horizontal lines (from Y axis, skip for windDir)
        if (!isWindDir) {
          var yAxisTicks = yScale.ticks(5);
          yAxisTicks.forEach(function (t) {
            g.append('line')
              .attr('x1', 0).attr('y1', yScale(t))
              .attr('x2', width).attr('y2', yScale(t))
              .attr('stroke', colors.grid)
              .attr('stroke-width', 1);
          });
        }

        if (isWindDir) {
          // Rosa de los vientos — barras radiales por frecuencia de dirección
          var sectors = 8;
          var sectorAngle = 360 / sectors;
          var counts = new Array(sectors).fill(0);
          values.forEach(function (v) {
            if (v == null) return;
            var s = Math.round(((v % 360) + 360) / sectorAngle) % sectors;
            counts[s]++;
          });
          var maxCount = d3.max(counts) || 1;
          var cx2 = width / 2;
          var cy2 = height / 2;
          var maxR = Math.min(cx2, cy2) - 18;
          var roseG = g.append('g').attr('transform', 'translate(' + cx2 + ',' + cy2 + ')');
          var cardinals = ['N','NE','E','SE','S','SW','W','NW'];
          var roseColors = ['#5b9bd5','#6ab187','#4caf6e','#f0b429','#e07b39','#d94f4f','#9b59b6','#7090c0'];

          // Círculos de referencia (25%, 50%, 75%, 100%)
          [0.25, 0.5, 0.75, 1].forEach(function (f) {
            roseG.append('circle')
              .attr('r', maxR * f)
              .attr('fill', 'none')
              .attr('stroke', colors.grid)
              .attr('stroke-width', 1);
          });
          // Líneas de ejes
          cardinals.forEach(function (_, si) {
            var angle = (si * sectorAngle - 90) * Math.PI / 180;
            roseG.append('line')
              .attr('x1', 0).attr('y1', 0)
              .attr('x2', Math.cos(angle) * maxR)
              .attr('y2', Math.sin(angle) * maxR)
              .attr('stroke', colors.grid)
              .attr('stroke-width', 1);
          });
          var windNames = ['Tramuntana','Gregal','Llevant','Xaloc','Migjorn','Llebeig','Ponent','Mestral'];

          // Tooltip element
          var roseTooltip = d3.select(wrap).append('div')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', 'var(--surface)')
            .style('border', '1px solid ' + colors.line)
            .style('border-radius', '6px')
            .style('padding', '5px 10px')
            .style('font-size', '12px')
            .style('font-family', 'Outfit, sans-serif')
            .style('font-weight', '600')
            .style('color', colors.text)
            .style('white-space', 'nowrap')
            .style('opacity', '0')
            .style('transition', 'opacity 0.15s');

          // Barras por sector
          counts.forEach(function (c, si) {
            if (c === 0) return;
            var r = (c / maxCount) * maxR;
            var startAngle = (si * sectorAngle - sectorAngle / 2 - 90) * Math.PI / 180;
            var endAngle   = (si * sectorAngle + sectorAngle / 2 - 90) * Math.PI / 180;
            var arc = d3.arc()
              .innerRadius(0)
              .outerRadius(r)
              .startAngle(startAngle + Math.PI / 2)
              .endAngle(endAngle + Math.PI / 2);
            var pct = Math.round((c / values.filter(function(v){return v!=null;}).length) * 100);
            roseG.append('path')
              .attr('d', arc())
              .attr('fill', roseColors[si])
              .attr('opacity', 0.85)
              .style('cursor', 'pointer')
              .on('mouseenter', function (event) {
                var wrapRect = wrap.getBoundingClientRect();
                var ex = event.clientX - wrapRect.left + 10;
                var ey = event.clientY - wrapRect.top - 10;
                roseTooltip
                  .html('<span style="color:' + roseColors[si] + '">' + windNames[si] + '</span> (' + cardinals[si] + ')' +
                        '<br><span style="font-weight:400;font-size:11px">' + pct + '% del temps</span>')
                  .style('left', ex + 'px')
                  .style('top', ey + 'px')
                  .style('opacity', '1');
              })
              .on('mousemove', function (event) {
                var wrapRect = wrap.getBoundingClientRect();
                roseTooltip
                  .style('left', (event.clientX - wrapRect.left + 10) + 'px')
                  .style('top', (event.clientY - wrapRect.top - 10) + 'px');
              })
              .on('mouseleave', function () {
                roseTooltip.style('opacity', '0');
              });
          });
          // Etiquetas cardinales
          cardinals.forEach(function (lbl, si) {
            var angle = (si * sectorAngle - 90) * Math.PI / 180;
            var labelR = maxR + 13;
            roseG.append('text')
              .attr('x', Math.cos(angle) * labelR)
              .attr('y', Math.sin(angle) * labelR + 4)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10')
              .attr('font-weight', '700')
              .attr('font-family', 'Outfit, sans-serif')
              .attr('fill', roseColors[si])
              .text(lbl);
          });

        } else {
          // X tick labels
          xTicks.forEach(function (t) {
            g.append('text')
              .attr('x', xScale(t.i))
              .attr('y', height + 15)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10')
              .attr('font-family', 'Outfit, sans-serif')
              .attr('fill', colors.text)
              .text(t.label);
          });

          var lineData = values.map(function (v, i) { return { i: i, v: v }; });

          // Area fill
          var area = d3.area()
            .defined(function (d) { return d.v != null; })
            .x(function (d) { return xScale(d.i); })
            .y0(height)
            .y1(function (d) { return yScale(d.v); })
            .curve(d3.curveCatmullRom.alpha(0.5));

          g.append('path')
            .datum(lineData)
            .attr('d', area)
            .attr('fill', colors.line + '18');

          if (series.unit === '°C') {
            // Colored segments per temperature
            for (var i = 0; i < lineData.length - 1; i++) {
              var d0 = lineData[i], d1 = lineData[i + 1];
              if (d0.v == null || d1.v == null) continue;
              g.append('line')
                .attr('x1', xScale(d0.i)).attr('y1', yScale(d0.v))
                .attr('x2', xScale(d1.i)).attr('y2', yScale(d1.v))
                .attr('stroke', tempColor(d0.v))
                .attr('stroke-width', 1.5)
                .attr('stroke-linecap', 'round');
            }
          } else {
            var line = d3.line()
              .defined(function (d) { return d.v != null; })
              .x(function (d) { return xScale(d.i); })
              .y(function (d) { return yScale(d.v); })
              .curve(d3.curveCatmullRom.alpha(0.5));

            g.append('path')
              .datum(lineData)
              .attr('d', line)
              .attr('fill', 'none')
              .attr('stroke', colors.line)
              .attr('stroke-width', 1.5);
          }

          // Y axis labels (left, max 5 ticks). Rango muy estrecho (p.ej. temp.
          // interior variando 2°C en un día) hace que D3 elija un paso
          // fraccionario (0.5, 0.2...) — redondear siempre a entero con
          // Math.round producía etiquetas duplicadas ("33°/33°", "32°/32°",
          // bug real detectado 2026-08-08). Usamos tantos decimales como
          // pida el paso real entre ticks, no un redondeo fijo.
          var yTicks = yScale.ticks(5);
          var yTickStep = yTicks.length > 1 ? Math.abs(yTicks[1] - yTicks[0]) : 1;
          var yDecimals = yTickStep < 1 ? (yTickStep < 0.2 ? 2 : 1) : 0;
          yTicks.forEach(function (t) {
            var label;
            if (series.unit === '°C') label = t.toFixed(yDecimals) + '°';
            else if (series.unit === '%') label = t.toFixed(yDecimals) + '%';
            else label = t.toFixed(yDecimals);
            g.append('text')
              .attr('x', -4)
              .attr('y', yScale(t) + 4)
              .attr('text-anchor', 'end')
              .attr('font-size', '10')
              .attr('font-family', 'Outfit, sans-serif')
              .attr('fill', colors.text)
              .text(label);
          });

          // Tooltip overlay
          var tooltipLine = g.append('line')
            .attr('y1', 0).attr('y2', height)
            .attr('stroke', colors.text)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .attr('opacity', 0)
            .attr('pointer-events', 'none');

          var tooltipDot = g.append('circle')
            .attr('r', 4)
            .attr('fill', colors.line)
            .attr('stroke', colors.text)
            .attr('stroke-width', 1.5)
            .attr('opacity', 0)
            .attr('pointer-events', 'none');

          var tooltipBox = g.append('g').attr('opacity', 0).attr('pointer-events', 'none');
          var tooltipRect = tooltipBox.append('rect')
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', 'var(--surface)')
            .attr('stroke', colors.line)
            .attr('stroke-width', 1);
          var tooltipText = tooltipBox.append('text')
            .attr('font-size', '11')
            .attr('font-family', 'Outfit, sans-serif')
            .attr('font-weight', '600')
            .attr('fill', colors.text);

          svgEl.append('rect')
            .attr('width', totalW).attr('height', totalH)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('mousemove', function (event) {
              var mx = (event.offsetX || d3.pointer(event, this)[0]) - margin.left;
              var idx0 = Math.round(xScale.invert(mx));
              idx0 = Math.max(0, Math.min(n - 1, idx0));
              var v = values[idx0];
              if (v == null) return;
              var cx = xScale(idx0);
              var cy = yScale(v);
              var labelStr;
              if (series.unit === '°C') labelStr = v.toFixed(1) + '\u00a0°C';
              else if (series.unit === '%') labelStr = Math.round(v) + '%';
              else if (series.unit === 'km/h' || series.unit === 'hPa' || series.unit === 'mm') labelStr = v.toFixed(1) + ' ' + series.unit;
              else labelStr = v.toFixed(1);
              var timeLabel = history[idx0] ? history[idx0].time : '';
              var fullLabel = timeLabel ? timeLabel + '  ' + labelStr : labelStr;
              tooltipLine.attr('x1', cx).attr('x2', cx).attr('opacity', 0.6);
              tooltipDot.attr('cx', cx).attr('cy', cy).attr('opacity', 1);
              tooltipText.text(fullLabel);
              var bbox = tooltipText.node().getBBox();
              var pad = 5;
              var bw = bbox.width + pad * 2;
              var bh = bbox.height + pad * 2;
              var bx = cx + 8;
              if (bx + bw > width) bx = cx - bw - 8;
              var by = Math.max(0, cy - bh / 2);
              if (by + bh > height) by = height - bh;
              tooltipRect.attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh);
              tooltipText.attr('x', bx + pad).attr('y', by + pad + bbox.height - 2);
              tooltipBox.attr('opacity', 1);
            })
            .on('mouseleave', function () {
              tooltipLine.attr('opacity', 0);
              tooltipDot.attr('opacity', 0);
              tooltipBox.attr('opacity', 0);
            });
        }
      });
    });
  }

  function datePath(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '/' + m + '/' + day + '/today.txt';
  }

  function fetchStation() {
    historySectionEl.hidden = true;

    var now = new Date();
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    var todayFetch = sessionFetch('today.txt?t=' + Date.now())
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; });

    var yesterdayFetch = sessionFetch(datePath(yesterday) + '?t=' + Date.now())
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; });

    Promise.all([yesterdayFetch, todayFetch])
      .then(function (texts) {
        var all = [];
        texts.forEach(function (text) {
          if (!text) return;
          text.trim().split('\n').forEach(function (l) {
            var row = parseStationRow(l);
            if (row) all.push(row);
          });
        });
        if (all.length > 1440) all = all.slice(all.length - 1440);
        if (all.length === 0) return;
        renderHistoryCharts(all);
      })
      .catch(function (err) {
        console.error('Error cargando datos de estación:', err);
      });
  }

  // ─── Noticias ────────────────────────────────────────────────────────────────

  function fetchNews() {
    fetch('news.json?t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        if (!data.items || !data.items.length) throw new Error();
        var items = data.items.slice().sort(function (a, b) {
          return new Date(b.date || 0) - new Date(a.date || 0);
        });
        newsListEl.innerHTML = items.map(function (item) {
          var dateLabel = item.date ? new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
          return '<a class="news-chip" href="' + item.url + '" target="_blank" rel="noopener">' +
            '<span class="news-chip-meta"><span class="news-chip-source">' + (item.source || '') + '</span><span class="news-chip-date">' + dateLabel + '</span></span>' +
            '<span class="news-chip-title">' + item.title + '</span>' +
            (item.summary ? '<span class="news-chip-summary">' + item.summary + '</span>' : '') +
            '<span class="news-chip-arrow">↗</span>' +
          '</a>';
        }).join('');
        if (data.updated) {
          var d = new Date(data.updated);
          newsUpdatedEl.textContent = 'Actualizado ' + d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }
        newsEl.hidden = false;
      })
      .catch(function () {
        // Si no hay news.json aún, la sección queda oculta
      });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  fetchIndexJson();
  fetchNews();
  initForecastTabs();
  fetchForecast();
  fetchHeatwave();
  fetchPollen();
  fetchStation();
  setInterval(function () {
    fetchIndexJson();
    fetchStation();
  }, 60000);
  setInterval(fetchForecast, 15 * 60 * 1000);

  var wzImg = document.getElementById('wz-ens-img');
  if (wzImg && wzImg.dataset.src) {
    var today = new Date();
    var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    wzImg.src = wzImg.dataset.src.replace('DATE', dateStr);
  }

  // Facade: don't load the heavy Windy embed (JS/CSS) until the user asks for it
  var windyFacade = document.getElementById('windy-facade');
  if (windyFacade) {
    var loadWindy = function () {
      var iframe = document.createElement('iframe');
      iframe.className = 'diagram-iframe';
      iframe.title = 'Windy - Radar';
      iframe.src = windyFacade.dataset.src;
      windyFacade.replaceWith(iframe);
    };
    windyFacade.addEventListener('click', loadWindy);
    windyFacade.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadWindy();
      }
    });
  }

  function updateThemeLabel() {
    var btn = document.getElementById('theme-toggle');
    var label = btn && btn.querySelector('.theme-toggle-label');
    if (label) label.textContent = document.body.classList.contains('theme-light') ? 'Modo oscuro' : 'Modo claro';
  }

  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    updateThemeLabel();
    themeBtn.addEventListener('click', function () {
      document.body.classList.toggle('theme-light');
      localStorage.setItem(THEME_KEY, document.body.classList.contains('theme-light') ? 'light' : 'dark');
      updateThemeLabel();
      fetchStation();
    });
  }
})();
