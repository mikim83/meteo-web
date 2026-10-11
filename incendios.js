(function () {
  'use strict';

  var THEME_KEY = 'meteo-theme';
  if (localStorage.getItem(THEME_KEY) === 'light') {
    document.body.classList.add('theme-light');
  }

  var MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var CATALUNYA_CENTER = [41.82, 1.7];
  var map, markersLayer;
  var allItems = [];

  function fmtDate(dateStr) {
    var p = dateStr.split('-');
    return p[2] + ' ' + MONTH_NAMES[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fetchIncendios() {
    return fetch('incendios.json').then(function (r) { return r.json(); });
  }

  var yearDaysCache = {};
  function fetchHistoricoYear(year) {
    if (yearDaysCache[year]) return Promise.resolve(yearDaysCache[year]);
    return fetch('historico_' + year + '.json')
      .then(function (r) { if (!r.ok) throw new Error('no data'); return r.json(); })
      .then(function (data) {
        yearDaysCache[year] = data.days || [];
        return yearDaysCache[year];
      })
      .catch(function () {
        yearDaysCache[year] = [];
        return [];
      });
  }

  var HEATWAVE_TMAX = 34;
  var HEATWAVE_MIN_DAYS = 3;
  var SUMMER_START_MD = '06-21';
  var SUMMER_END_MD = '09-21';
  var COORDS = { lat: 41.4911, lon: 2.1401 };
  var TIMEZONE = 'Europe/Madrid';

  // Ventana de Open-Meteo (últimos 6 días + próximos 7, modelo ecmwf_ifs) para
  // rellenar temperaturas de días recientes cuyo dato de estación aún esté
  // incompleto. El día de HOY, en cambio, se marca como "ola de calor" o no
  // según heatwave_status.json (fuente oficial AEMET/Meteocat), igual que el
  // hero de index.html — no según este umbral local — para que ambos
  // coincidan siempre. Ver fetchHeatwaveStatusForToday() más abajo.
  var forecastCache = null;
  function fetchForecastTmax() {
    if (forecastCache) return Promise.resolve(forecastCache);
    var params = new URLSearchParams({
      latitude: COORDS.lat,
      longitude: COORDS.lon,
      daily: 'temperature_2m_max',
      timezone: TIMEZONE,
      past_days: 6,
      forecast_days: 7,
      models: 'ecmwf_ifs'
    });
    return fetch('https://api.open-meteo.com/v1/forecast?' + params.toString())
      .then(function (r) { if (!r.ok) throw new Error('no forecast'); return r.json(); })
      .then(function (data) {
        var map = {};
        (data.daily && data.daily.time || []).forEach(function (dateStr, idx) {
          var t = data.daily.temperature_2m_max[idx];
          if (t != null) map[dateStr] = { tmax: t, tmin: null, source: 'Open-Meteo' };
        });
        forecastCache = map;
        return map;
      })
      .catch(function () {
        forecastCache = {};
        return {};
      });
  }

  function isNextCalendarDay(a, b) {
    return (Date.parse(b) - Date.parse(a)) === 86400000;
  }

  function todayLocalStr() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
  }

  var heatwaveStatusCache = null;
  function fetchHeatwaveStatusForToday() {
    if (heatwaveStatusCache) return Promise.resolve(heatwaveStatusCache);
    return fetch('heatwave_status.json?t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('no status'); return r.json(); })
      .then(function (data) { heatwaveStatusCache = data; return data; })
      .catch(function () { return null; });
  }

  // Aplica sobre `heatwaveDates` (mutándolo) el estado oficial de HOY, si lo
  // hay, sustituyendo lo que diga el umbral local solo para la fecha de hoy.
  function applyOfficialStatusForToday(heatwaveDates, status) {
    if (!status) return heatwaveDates;
    var todayStr = todayLocalStr();
    if (status.active) heatwaveDates[todayStr] = true;
    else delete heatwaveDates[todayStr];
    return heatwaveDates;
  }

  function computeHeatwaveDates(days) {
    var sorted = days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var hot = {};
    var i = 0;
    while (i < sorted.length) {
      if (sorted[i].tmax >= HEATWAVE_TMAX) {
        var j = i;
        while (j + 1 < sorted.length && sorted[j + 1].tmax >= HEATWAVE_TMAX && isNextCalendarDay(sorted[j].date, sorted[j + 1].date)) j++;
        if (j - i + 1 >= HEATWAVE_MIN_DAYS) {
          for (var k = i; k <= j; k++) hot[sorted[k].date] = true;
        }
        i = j + 1;
      } else {
        i++;
      }
    }
    return hot;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  var tooltipEl = null;
  function getTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'hist-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function positionTooltip(evt) {
    var tip = getTooltip();
    var x = evt.clientX, y = evt.clientY;
    var pad = 14;
    var rect = tip.getBoundingClientRect();
    var left = x + pad;
    var top = y - rect.height - pad;
    if (left + rect.width > window.innerWidth - 4) left = x - rect.width - pad;
    if (left < 4) left = 4;
    if (top < 4) top = y + pad;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function showTooltip(evt, text) {
    var tip = getTooltip();
    tip.textContent = text;
    tip.classList.add('visible');
    positionTooltip(evt);
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }
  document.addEventListener('pointerdown', hideTooltip, true);

  function attachTooltip(el, text) {
    el.addEventListener('pointerenter', function (e) { showTooltip(e, text); });
    el.addEventListener('pointermove', function (e) { positionTooltip(e); });
    el.addEventListener('pointerleave', hideTooltip);
    el.addEventListener('pointerdown', function (e) { showTooltip(e, text); });
  }

  function renderHeatwaveTimeline(year, historicoDays, forecastTmax, heatwaveStatus) {
    var wrap = document.getElementById('inc-heatwave-chart');
    if (!wrap) return;

    var byDate = {};
    (historicoDays || []).forEach(function (d) { byDate[d.date] = { tmax: d.tmax, tmin: d.tmin, source: 'estación' }; });

    // Dentro de la ventana de Open-Meteo (últimos 6 días + próximos 7) su
    // valor manda para rellenar temperaturas recientes sin dato de estación
    // completo. El booleano de "ola de calor" para HOY se corrige aparte con
    // la fuente oficial (applyOfficialStatusForToday), no con este umbral.
    Object.keys(forecastTmax || {}).forEach(function (dateStr) {
      var f = forecastTmax[dateStr];
      var existing = byDate[dateStr];
      byDate[dateStr] = { tmax: f.tmax, tmin: f.tmin != null ? f.tmin : (existing ? existing.tmin : null), source: f.source };
    });

    var mergedDays = Object.keys(byDate).map(function (dateStr) {
      return { date: dateStr, tmax: byDate[dateStr].tmax };
    });
    var heatwaveDates = applyOfficialStatusForToday(computeHeatwaveDates(mergedDays), heatwaveStatus);

    var start = new Date(year + '-' + SUMMER_START_MD + 'T00:00:00Z');
    var end = new Date(year + '-' + SUMMER_END_MD + 'T00:00:00Z');
    var totalDays = Math.round((end - start) / 86400000) + 1;

    var cell = 7, gap = 1, colW = cell + gap;
    var padL = 4, padT = 16, padB = 4;
    var W = padL + totalDays * colW + 4, H = padT + cell + padB;

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hist-svg inc-heatwave-svg' });
    var lastMonthLabeled = -1;
    var anyHeatwave = false;

    for (var i = 0; i < totalDays; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      var dateStr = d.toISOString().slice(0, 10);
      var x = padL + i * colW;

      if (d.getUTCDate() === 1 && d.getUTCMonth() !== lastMonthLabeled) {
        lastMonthLabeled = d.getUTCMonth();
        var mLbl = svgEl('text', { x: x, y: 10, class: 'hist-axis-label' });
        mLbl.textContent = MONTH_NAMES[d.getUTCMonth()];
        svg.appendChild(mLbl);
      }

      var dayData = byDate[dateStr];
      var isHeatwave = !!heatwaveDates[dateStr];
      if (isHeatwave) anyHeatwave = true;
      var cellClass = 'inc-heatwave-cell';
      if (isHeatwave) cellClass += ' inc-heatwave-cell-hot';
      else if (dayData) cellClass += ' inc-heatwave-cell-normal';
      else cellClass += ' inc-heatwave-cell-empty';

      var rect = svgEl('rect', { x: x, y: padT, width: cell, height: cell, rx: 1.5, class: cellClass });
      var titleText;
      if (dayData) {
        var minTxt = dayData.tmin != null ? ' · mín ' + dayData.tmin.toFixed(1) + '\u00a0°C' : '';
        titleText = fmtDate(dateStr) + ': máx ' + dayData.tmax.toFixed(1) + '\u00a0°C' + minTxt +
          (isHeatwave ? ' · 🔥 ola de calor' : ' · sin ola de calor') + ' (' + dayData.source + ')';
      } else {
        titleText = fmtDate(dateStr) + ': sin datos';
      }
      attachTooltip(rect, titleText);
      svg.appendChild(rect);
    }

    wrap.innerHTML = '';
    wrap.appendChild(svg);
    if (!anyHeatwave) {
      var note = document.createElement('p');
      note.className = 'inc-empty';
      note.textContent = 'No se han detectado olas de calor (≥3 días seguidos con máxima ≥34\u00a0°C) en este periodo.';
      wrap.appendChild(note);
    }
  }

  function yearOf(item) {
    return item.date ? item.date.slice(0, 4) : '';
  }

  // Paleta inspirada en incendiosespaña.es: rojo = reciente/activo, naranja =
  // de la última semana, amarillo = más antiguo dentro del año seleccionado.
  // No tenemos estado real por incendio (activo/controlado/extinguido), así
  // que se aproxima por antigüedad de la noticia, que es lo que sí sabemos.
  var FIRE_COLORS = { recent: '#ff3b30', week: '#ff8c1a', old: '#e8b923' };

  function fireColorFor(dateStr) {
    var days = Math.floor((Date.now() - Date.parse(dateStr + 'T00:00:00Z')) / 86400000);
    if (days <= 2) return FIRE_COLORS.recent;
    if (days <= 7) return FIRE_COLORS.week;
    return FIRE_COLORS.old;
  }

  var tileLayer = null;
  function tileConfigForTheme() {
    var dark = !document.body.classList.contains('theme-light');
    return dark
      ? { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' }
      : { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };
  }

  function applyMapTheme() {
    if (!map) return;
    if (tileLayer) map.removeLayer(tileLayer);
    var cfg = tileConfigForTheme();
    tileLayer = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 18, subdomains: 'abcd' }).addTo(map);
    tileLayer.bringToBack();
  }

  function initMap() {
    map = L.map('inc-map', { scrollWheelZoom: false }).setView(CATALUNYA_CENTER, 8);
    applyMapTheme();
    markersLayer = L.layerGroup().addTo(map);
  }

  function renderMap(items) {
    markersLayer.clearLayers();
    var pts = items.filter(function (i) { return i.lat != null && i.lon != null; });
    pts.forEach(function (item) {
      var color = fireColorFor(item.date);
      var marker = L.circleMarker([item.lat, item.lon], {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.7,
        weight: 2
      }).addTo(markersLayer);
      var html = '<div class="inc-popup-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="inc-popup-meta">' + escapeHtml(item.location || '') + ' · ' + fmtDate(item.date) + '</div>' +
        (item.url ? '<p><a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">Leer noticia &rarr;</a></p>' : '');
      marker.bindPopup(html);
    });
    if (pts.length) {
      var bounds = L.latLngBounds(pts.map(function (i) { return [i.lat, i.lon]; }));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
    } else {
      map.setView(CATALUNYA_CENTER, 8);
    }
  }

  function renderList(items) {
    var el = document.getElementById('inc-list');
    if (!items.length) {
      el.innerHTML = '<p class="inc-empty">No hay noticias registradas para este año todavía.</p>';
      return;
    }
    var sorted = items.slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    el.innerHTML = sorted.map(function (item) {
      return '<a class="news-chip" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' +
        '<div class="news-chip-meta">' +
        '<span class="news-chip-source">' + escapeHtml(item.source || '') + '</span>' +
        '<span class="news-chip-date">' + fmtDate(item.date) + (item.location ? ' · ' + escapeHtml(item.location) : '') + '</span>' +
        '</div>' +
        '<div class="news-chip-title">' + escapeHtml(item.title) + '</div>' +
        (item.summary ? '<div class="news-chip-summary">' + escapeHtml(item.summary) + '</div>' : '') +
        '<span class="news-chip-arrow">&#8599;</span>' +
        '</a>';
    }).join('');
  }

  function populateYearSelect(years, selected) {
    var sel = document.getElementById('inc-year');
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === selected ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
    sel.onchange = function () {
      applyYear(sel.value);
    };
  }

  function applyYear(year) {
    var items = allItems.filter(function (i) { return yearOf(i) === year; });
    renderMap(items);
    renderList(items);
    var wrap = document.getElementById('inc-heatwave-chart');
    if (wrap) wrap.innerHTML = '<p class="inc-empty">Cargando…</p>';
    Promise.all([fetchHistoricoYear(year), fetchForecastTmax(), fetchHeatwaveStatusForToday()]).then(function (results) {
      renderHeatwaveTimeline(year, results[0], results[1], results[2]);
    });
  }

  initMap();

  fetchIncendios().then(function (data) {
    allItems = data.items || [];
    document.getElementById('inc-updated').textContent = data.updated
      ? 'Actualizado: ' + data.updated.replace('T', ' ').slice(0, 16)
      : '';

    var years = Array.from(new Set(allItems.map(yearOf))).filter(Boolean).sort().reverse();
    if (!years.length) years = [String(new Date().getFullYear())];
    populateYearSelect(years, years[0]);
    applyYear(years[0]);
  }).catch(function (err) {
    console.error('Error cargando incendios.json', err);
    document.getElementById('inc-list').innerHTML = '<p class="inc-empty">No se ha podido cargar la información de incendios.</p>';
  });

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
      applyMapTheme();
    });
  }
})();
