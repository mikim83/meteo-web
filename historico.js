(function () {
  'use strict';

  var THEME_KEY = 'meteo-theme';
  if (localStorage.getItem(THEME_KEY) === 'light') {
    document.body.classList.add('theme-light');
  }

  var MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function fmtDate(dateStr) {
    var p = dateStr.split('-');
    return p[2] + ' ' + MONTH_NAMES[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function fetchMeta() {
    return fetch('historico_meta.json').then(function (r) { return r.json(); });
  }

  var yearDaysCache = {};
  function fetchYearDays(year) {
    if (yearDaysCache[year]) return Promise.resolve(yearDaysCache[year]);
    return fetch('historico_' + year + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        yearDaysCache[year] = data.days || [];
        return yearDaysCache[year];
      });
  }

  function renderRecords(records) {
    var el = document.getElementById('hist-records-grid');
    var section = document.getElementById('hist-records');
    if (!records || !records.hottest) return;

    var hottest = records.hottest, coldest = records.coldest;
    var windiest = records.windiest, rainiest = records.rainiest;
    var mostHumid = records.mostHumid, driest = records.driest;

    var cards = [
      { title: '🔥 Día más caluroso', value: hottest.tmax.toFixed(1) + '\u00a0°C', sub: fmtDate(hottest.date) + (hottest.tmax_time ? ' · ' + hottest.tmax_time : '') },
      { title: '❄️ Día más frío', value: coldest.tmin.toFixed(1) + '\u00a0°C', sub: fmtDate(coldest.date) + (coldest.tmin_time ? ' · ' + coldest.tmin_time : '') },
    ];
    if (windiest) cards.push({ title: '💨 Racha más fuerte', value: windiest.wmax.toFixed(1) + ' km/h', sub: fmtDate(windiest.date) });
    if (rainiest && rainiest.rain > 0) cards.push({ title: '🌧️ Día más lluvioso', value: rainiest.rain.toFixed(1) + ' mm', sub: fmtDate(rainiest.date) });
    if (mostHumid) cards.push({ title: '💧 Más húmedo (media)', value: mostHumid.havg.toFixed(0) + '%', sub: fmtDate(mostHumid.date) });
    if (driest) cards.push({ title: '🏜️ Más seco (media)', value: driest.havg.toFixed(0) + '%', sub: fmtDate(driest.date) });

    el.innerHTML = cards.map(function (c) {
      return '<div class="history-card"><div class="history-card-title">' + c.title + '</div>' +
        '<div class="hist-record-value">' + c.value + '</div>' +
        '<div class="history-card-subtitle">' + c.sub + '</div></div>';
    }).join('');
    section.hidden = false;
  }

  function renderOnThisDay(matches) {
    var el = document.getElementById('hist-onthisday-grid');
    var section = document.getElementById('hist-onthisday');
    if (!matches || !matches.length) return;

    el.innerHTML = matches.map(function (d) {
      var year = d.date.slice(0, 4);
      var rainTxt = d.rain != null && d.rain > 0 ? ' · 🌧️ ' + d.rain.toFixed(1) + ' mm' : '';
      var maxTimeTxt = d.tmax_time ? ' (' + d.tmax_time + ')' : '';
      var minTimeTxt = d.tmin_time ? ' (' + d.tmin_time + ')' : '';
      return '<div class="hist-otd-card"><div class="hist-otd-year">' + year + '</div>' +
        '<div class="hist-otd-temps"><span class="hist-otd-max">↑' + d.tmax.toFixed(1) + '°' + maxTimeTxt + '</span> <span class="hist-otd-min">↓' + d.tmin.toFixed(1) + '°' + minTimeTxt + '</span></div>' +
        '<div class="hist-otd-extra">media ' + d.tavg.toFixed(1) + '°' + rainTxt + '</div></div>';
    }).join('');
    section.hidden = false;
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

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function drawMonthlyTempSvg(months, wide) {
    var wrap = document.getElementById('hist-monthly-chart');
    var minBarSpacing = wide ? 46 : 70;
    var W = Math.max(months.length * minBarSpacing, 320), H = 220;
    var padL = 34, padB = 26, padT = 10;
    var allTemps = [];
    months.forEach(function (m) { allTemps.push(m.tmin, m.tmax); });
    var tMin = Math.floor(Math.min.apply(null, allTemps) - 2);
    var tMax = Math.ceil(Math.max.apply(null, allTemps) + 2);
    var scaleY = function (t) { return H - padB - ((t - tMin) / (tMax - tMin)) * (H - padB - padT); };
    var barW = (W - padL) / months.length;

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hist-svg' });

    // gridlines
    var steps = 4;
    for (var i = 0; i <= steps; i++) {
      var t = tMin + (i / steps) * (tMax - tMin);
      var y = scaleY(t);
      svg.appendChild(svgEl('line', { x1: padL, x2: W, y1: y, y2: y, class: 'hist-grid-line' }));
      var lbl = svgEl('text', { x: 2, y: y + 4, class: 'hist-axis-label' });
      lbl.textContent = Math.round(t) + '°';
      svg.appendChild(lbl);
    }

    var labelStep = wide ? Math.ceil(months.length / 14) : 1;
    months.forEach(function (m, idx) {
      var x = padL + idx * barW;
      var yMax = scaleY(m.tmax), yMin = scaleY(m.tmin), yAvg = scaleY(m.tavg);
      svg.appendChild(svgEl('line', {
        x1: x + barW / 2, x2: x + barW / 2, y1: yMax, y2: yMin, class: 'hist-range-line',
      }));
      svg.appendChild(svgEl('circle', { cx: x + barW / 2, cy: yAvg, r: 3, class: 'hist-avg-dot' }));
      if (idx % labelStep === 0) {
        var xlbl = svgEl('text', { x: x + barW / 2, y: H - 8, class: 'hist-axis-label', 'text-anchor': 'middle' });
        xlbl.textContent = m.label;
        svg.appendChild(xlbl);
      }

      var hit = svgEl('rect', {
        x: x, y: padT, width: barW, height: H - padB - padT,
        fill: 'transparent', class: 'hist-hit-area',
      });
      attachTooltip(hit, m.label + ': ↑' + m.tmax.toFixed(1) + '° · media ' + m.tavg.toFixed(1) + '° · ↓' + m.tmin.toFixed(1) + '°');
      svg.appendChild(hit);
    });

    wrap.innerHTML = '';
    wrap.appendChild(svg);
  }

  function renderMonthlyTempChart(months) {
    var section = document.getElementById('hist-monthly');
    var select = document.getElementById('hist-monthly-year');
    if (!months.length) return;

    var years = Array.from(new Set(months.map(function (m) { return m.key.slice(0, 4); }))).sort();
    select.innerHTML = years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') +
      '<option value="all">Todos los años</option>';
    select.value = years[years.length - 1];

    function render() {
      if (select.value === 'all') {
        drawMonthlyTempSvg(months, true);
      } else {
        var yearMonths = months.filter(function (m) { return m.key.slice(0, 4) === select.value; })
          .map(function (m) { return Object.assign({}, m, { label: MONTH_NAMES[parseInt(m.key.slice(5, 7), 10) - 1] }); });
        drawMonthlyTempSvg(yearMonths, false);
      }
    }

    select.onchange = render;
    render();
    section.hidden = false;
  }

  function renderRainChart(months) {
    var wrap = document.getElementById('hist-rain-chart');
    var section = document.getElementById('hist-rain');
    var withRain = months.filter(function (m) { return m.rain > 0; });
    if (!withRain.length) return;

    var W = Math.max(months.length * 46, 320), H = 180;
    var padL = 34, padB = 26, padT = 18;
    var rMax = Math.max.apply(null, months.map(function (m) { return m.rain; })) || 1;
    var scaleY = function (r) { return H - padB - (r / rMax) * (H - padB - padT); };
    var barW = (W - padL) / months.length;

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hist-svg' });
    var steps = 4;
    for (var i = 0; i <= steps; i++) {
      var r = (i / steps) * rMax;
      var y = scaleY(r);
      svg.appendChild(svgEl('line', { x1: padL, x2: W, y1: y, y2: y, class: 'hist-grid-line' }));
      var lbl = svgEl('text', { x: 0, y: y + 4, class: 'hist-axis-label' });
      lbl.textContent = Math.round(r) + 'mm';
      svg.appendChild(lbl);
    }

    months.forEach(function (m, idx) {
      var x = padL + idx * barW + 2;
      var y = scaleY(m.rain);
      svg.appendChild(svgEl('rect', { x: x, y: y, width: barW - 4, height: (H - padB) - y, class: 'hist-rain-bar' }));
      if (m.rain > 0) {
        var vlbl = svgEl('text', { x: x + (barW - 4) / 2, y: y - 3, class: 'hist-bar-value', 'text-anchor': 'middle' });
        vlbl.textContent = Math.round(m.rain);
        svg.appendChild(vlbl);
      }
      if (idx % Math.ceil(months.length / 14) === 0) {
        var xlbl = svgEl('text', { x: x + (barW - 4) / 2, y: H - 8, class: 'hist-axis-label', 'text-anchor': 'middle' });
        xlbl.textContent = m.label;
        svg.appendChild(xlbl);
      }
    });

    wrap.innerHTML = '';
    wrap.appendChild(svg);
    section.hidden = false;
  }

  function renderExtremes(extremes) {
    var el = document.getElementById('hist-extremes-grid');
    var section = document.getElementById('hist-extremes');
    if (!extremes) return;

    var heatStreak = extremes.heatStreak, coldStreak = extremes.coldStreak, rainStreak = extremes.rainStreak;

    var cards = [];
    if (heatStreak) cards.push({ title: '🥵 Ola de calor más larga', value: heatStreak.len + ' días', sub: fmtDate(heatStreak.start) + ' – ' + fmtDate(heatStreak.end) + ' (≥30°C)' });
    if (coldStreak) cards.push({ title: '🥶 Racha de frío más larga', value: coldStreak.len + ' días', sub: fmtDate(coldStreak.start) + ' – ' + fmtDate(coldStreak.end) + ' (≤10°C máx.)' });
    if (rainStreak) cards.push({ title: '🌦️ Racha de lluvia más larga', value: rainStreak.len + ' días', sub: fmtDate(rainStreak.start) + ' – ' + fmtDate(rainStreak.end) });
    cards.push({ title: '🌴 Noches tropicales', value: extremes.tropicalNights, sub: 'días con mínima ≥20\u00a0°C (total histórico)' });
    cards.push({ title: '🧊 Días de helada', value: extremes.frostDays, sub: 'días con mínima <0\u00a0°C (total histórico)' });
    cards.push({ title: '🔥 Días muy calurosos', value: extremes.hotDays, sub: 'días con máxima ≥35\u00a0°C (total histórico)' });

    el.innerHTML = cards.map(function (c) {
      return '<div class="history-card"><div class="history-card-title">' + c.title + '</div>' +
        '<div class="hist-record-value">' + c.value + '</div>' +
        '<div class="history-card-subtitle">' + c.sub + '</div></div>';
    }).join('');
    section.hidden = false;
  }

  var HEATWAVE_TMAX = 34;
  var HEATWAVE_MIN_DAYS = 3;
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
          if (t != null) map[dateStr] = t;
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

  function colorForTemp(t) {
    // Escala fija -5..40°C: azul -> verde -> amarillo -> naranja -> rojo
    var domain = [-5, 5, 15, 25, 35, 40];
    var colors = [
      [58, 116, 191],   // azul
      [77, 171, 168],   // verde azulado
      [140, 191, 90],   // verde
      [230, 200, 70],   // amarillo
      [224, 138, 60],   // naranja
      [196, 60, 60],    // rojo
    ];
    var clamped = Math.max(domain[0], Math.min(domain[domain.length - 1], t));
    var i = 0;
    while (i < domain.length - 2 && clamped > domain[i + 1]) i++;
    var t0 = domain[i], t1 = domain[i + 1];
    var frac = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;
    var c0 = colors[i], c1 = colors[i + 1];
    var rgb = c0.map(function (v, idx) { return Math.round(v + (c1[idx] - v) * frac); });
    return 'rgb(' + rgb.join(',') + ')';
  }

  function renderHeatmapYear(year) {
    var wrap = document.getElementById('hist-heatmap-chart');
    wrap.innerHTML = '<p class="inc-empty">Cargando…</p>';

    Promise.all([fetchYearDays(year), fetchForecastTmax(), fetchHeatwaveStatusForToday()]).then(function (results) {
      var yearDays = results[0];
      var forecastTmax = results[1] || {};
      var heatwaveStatus = results[2];
      var byDate = {};
      yearDays.forEach(function (d) { byDate[d.date] = { date: d.date, tmax: d.tmax, tmin: d.tmin, source: 'estación' }; });
      Object.keys(forecastTmax).forEach(function (dateStr) {
        if (dateStr.slice(0, 4) !== year) return;
        var existing = byDate[dateStr];
        byDate[dateStr] = { date: dateStr, tmax: forecastTmax[dateStr], tmin: existing ? existing.tmin : null, source: 'Open-Meteo' };
      });
      var mergedDays = Object.keys(byDate).map(function (k) { return byDate[k]; });
      var heatwaveDates = applyOfficialStatusForToday(computeHeatwaveDates(mergedDays), heatwaveStatus);

      var yearNum = parseInt(year, 10);
      var jan1 = new Date(Date.UTC(yearNum, 0, 1));
      var isLeap = (yearNum % 4 === 0 && yearNum % 100 !== 0) || yearNum % 400 === 0;
      var totalDays = isLeap ? 366 : 365;
      var firstWeekday = (jan1.getUTCDay() + 6) % 7; // lunes=0 .. domingo=6

      var cell = 12, gap = 3, colW = cell + gap;
      var totalCols = Math.ceil((totalDays + firstWeekday) / 7);
      var padL = 26, padT = 16;
      var W = padL + totalCols * colW + 6, H = padT + 7 * colW + 6;

      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hist-svg hist-heatmap-svg hist-heatmap-year' });

      var DOW = ['L', '', 'X', '', 'V', '', ''];
      DOW.forEach(function (lbl, row) {
        if (!lbl) return;
        var t = svgEl('text', { x: 0, y: padT + row * colW + cell, class: 'hist-axis-label' });
        t.textContent = lbl;
        svg.appendChild(t);
      });

      var lastMonthLabeled = -1;
      for (var i = 0; i < totalDays; i++) {
        var date = new Date(Date.UTC(yearNum, 0, 1 + i));
        var dateStr = date.toISOString().slice(0, 10);
        var col = Math.floor((i + firstWeekday) / 7);
        var row = (i + firstWeekday) % 7;
        var d = byDate[dateStr];

        if (date.getUTCDate() === 1 && date.getUTCMonth() !== lastMonthLabeled) {
          lastMonthLabeled = date.getUTCMonth();
          var mLbl = svgEl('text', { x: padL + col * colW, y: 10, class: 'hist-axis-label' });
          mLbl.textContent = MONTH_NAMES[date.getUTCMonth()];
          svg.appendChild(mLbl);
        }

        var isHeatwave = d && heatwaveDates[d.date];
        var cellClass = d ? 'hist-heatmap-cell' : 'hist-heatmap-cell hist-heatmap-cell-empty';
        if (isHeatwave) cellClass += ' hist-heatmap-cell-heatwave';
        var rect = svgEl('rect', {
          x: padL + col * colW, y: padT + row * colW, width: cell, height: cell,
          fill: d ? colorForTemp(d.tmax) : 'transparent',
          rx: 2,
          class: cellClass,
        });
        var minTxt = d && d.tmin != null ? ' · ↓' + d.tmin.toFixed(1) + '°' : '';
        var tipText = d ? (fmtDate(d.date) + ': ↑' + d.tmax.toFixed(1) + '°' + minTxt + (isHeatwave ? ' · 🔥 ola de calor' : '')) : fmtDate(dateStr);
        attachTooltip(rect, tipText);
        svg.appendChild(rect);
      }

      wrap.innerHTML = '';
      wrap.appendChild(svg);
    }).catch(function () {
      wrap.innerHTML = '<p class="inc-empty">No se han podido cargar los datos de ' + year + '.</p>';
    });
  }

  function renderHeatmap(years, currentYear) {
    var section = document.getElementById('hist-heatmap');
    var select = document.getElementById('hist-heatmap-year');
    if (!years.length) return;

    select.innerHTML = years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    select.value = currentYear;

    select.onchange = function () { renderHeatmapYear(select.value); };
    renderHeatmapYear(select.value);
    section.hidden = false;
  }

  function renderYearSummary(yearSummaries) {
    var el = document.getElementById('hist-years-grid');
    var section = document.getElementById('hist-years');
    if (!yearSummaries || !yearSummaries.length) return;

    el.innerHTML = yearSummaries.map(function (g) {
      return '<div class="history-card"><div class="history-card-title">' + g.year + '</div>' +
        '<div class="hist-record-value">' + g.tavg.toFixed(1) + '\u00a0°C media</div>' +
        '<div class="history-card-subtitle">↑' + g.tmax.toFixed(1) + '° · ↓' + g.tmin.toFixed(1) + '° · 🌧️ ' + g.rain.toFixed(0) + ' mm · ' + g.n + ' días</div></div>';
    }).join('');
    section.hidden = false;
  }

  fetchMeta().then(function (meta) {
    if (!meta || !meta.years || !meta.years.length) return;
    yearDaysCache[meta.currentYear] = meta.days || [];
    renderOnThisDay(meta.onThisDay);
    renderRecords(meta.records);
    renderExtremes(meta.extremes);
    renderHeatmap(meta.years, meta.currentYear);
    renderMonthlyTempChart(meta.months || []);
    renderRainChart(meta.months || []);
    renderYearSummary(meta.yearSummaries);
  }).catch(function (err) {
    console.error('Error cargando historico_meta.json', err);
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
    });
  }
})();
