  // ------------------------------------------------------------------
  // Configuration Supabase (lecture seule, clé publiable)
  // ------------------------------------------------------------------
  var CFG = {
    url: "https://gvmogpbbcllkfqmryvwz.supabase.co",
    key: "sb_publishable_F4IH5ndz17UAPgHC7ihdRg_LiZikjIb",
    table: "MyMeteoData",
    page: 1000 // limite par défaut de PostgREST sur Supabase
  };

  var COLS = encodeURIComponent(
    '"DateTime","Temperature","Humidity","Baro Pressure","Wind Gust","UVI","Hourly Rain","Solar Radiation"'
  );

  var charts = {};
  var lastDaily = [];

  var VIEW_CHARTS = {
    daily: ["chDailyTemp", "chDailyRain", "chDailyPress", "chDailyGust"],
    monthly: ["chMonthlyTemp", "chMonthlyRain", "chMonthlyPress", "chMonthlyGust"]
  };

  function setStatus(msg, isError) {
    var el = document.getElementById("status");
    el.textContent = msg;
    el.className = "status" + (isError ? " error" : "");
  }

  function fmt(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function isoDay(d) { return d.toISOString().slice(0, 10); }

  // ------------------------------------------------------------------
  // Récupération paginée des données via l'API REST (PostgREST)
  // ------------------------------------------------------------------
  function fetchRows(from, to) {
    var all = [];
    var offset = 0;
    function page() {
      var u = CFG.url + "/rest/v1/" + CFG.table +
        "?select=" + COLS +
        '&"DateTime"=gte.' + from +
        (to ? '&"DateTime"=lt.' + to : "") +
        '&order="DateTime".asc&limit=' + CFG.page + "&offset=" + offset;
      return fetch(u, {
        headers: {
          "apikey": CFG.key,
          "Authorization": "Bearer " + CFG.key
        }
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error("Erreur HTTP " + r.status + " — " + t.slice(0, 180));
          });
        }
        return r.json();
      }).then(function (rows) {
        all = all.concat(rows);
        setStatus(fmt(all.length, 0) + " enregistrements chargés…");
        if (rows.length < CFG.page) return all;
        offset += CFG.page;
        return page();
      });
    }
    setStatus("Interrogation de la base Supabase…");
    return page();
  }

  // ------------------------------------------------------------------
  // Agrégation côté client (par jour et par mois)
  // ------------------------------------------------------------------
  function aggregate(rows) {
    var days = {}, months = {}, hours = {};
    var k = {
      n: 0, tSum: 0, tMax: -Infinity, tMaxDt: null, tMin: Infinity, tMinDt: null,
      gustMax: -Infinity, gustDt: null, uvMax: -Infinity, humSum: 0, rainHours: 0
    };

    function dayObj(key) {
      if (!days[key]) days[key] = {
        n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0,
        gust: -1, gustDt: null, rain: 0,
        pressSum: 0, pressN: 0, pressHi: -Infinity, pressLo: Infinity
      };
      return days[key];
    }
    function monthObj(key) {
      if (!months[key]) months[key] = {
        n: 0, tSum: 0, lo: Infinity, hi: -Infinity, humSum: 0, pressSum: 0, pressN: 0,
        gust: -1, uv: -1, windSum: 0, rain: 0
      };
      return months[key];
    }

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var dt = r["DateTime"];
      if (!dt) continue;
      var day = dt.slice(0, 10);
      var month = dt.slice(0, 7);
      var hour = dt.slice(0, 13);
      var t = r["Temperature"];
      var tVal = (t === null || t === undefined) ? null : Number(t);
      var hum = r["Humidity"];
      var gust = r["Wind Gust"];
      var uv = r["UVI"];
      var press = r["Baro Pressure"];

      k.n++;
      if (tVal !== null) {
        k.tSum += tVal;
        if (tVal > k.tMax) { k.tMax = tVal; k.tMaxDt = dt; }
        if (tVal < k.tMin) { k.tMin = tVal; k.tMinDt = dt; }
      }
      if (hum !== null && hum !== undefined) k.humSum += Number(hum);
      if (gust !== null && gust !== undefined && Number(gust) > k.gustMax) { k.gustMax = Number(gust); k.gustDt = dt; }
      if (uv !== null && uv !== undefined) k.uvMax = Math.max(k.uvMax, Number(uv));

      var d = dayObj(day);
      d.n++;
      if (tVal !== null) {
        d.tSum += tVal;
        if (tVal > d.hi) d.hi = tVal;
        if (tVal < d.lo) d.lo = tVal;
      }
      if (hum !== null && hum !== undefined) d.humSum += Number(hum);
      if (gust !== null && gust !== undefined) d.gust = Math.max(d.gust, Number(gust));
      if (press !== null && press !== undefined) {
        var pv = Number(press);
        d.pressSum += pv;
        d.pressN++;
        if (pv > d.pressHi) d.pressHi = pv;
        if (pv < d.pressLo) d.pressLo = pv;
      }

      var m = monthObj(month);
      m.n++;
      if (tVal !== null) {
        m.tSum += tVal;
        if (tVal > m.hi) m.hi = tVal;
        if (tVal < m.lo) m.lo = tVal;
      }
      if (hum !== null && hum !== undefined) m.humSum += Number(hum);
      if (press !== null && press !== undefined) { m.pressSum += Number(press); m.pressN++; }
      if (gust !== null && gust !== undefined) m.gust = Math.max(m.gust, Number(gust));
      if (uv !== null && uv !== undefined) m.uv = Math.max(m.uv, Number(uv));

      var hr = r["Hourly Rain"];
      if (hr !== null && hr !== undefined) {
        var hv = Number(hr);
        if (!(hour in hours)) hours[hour] = { sum: 0, n: 0 };
        hours[hour].sum += hv;
        hours[hour].n++;
      }
    }

    // Moyenne horaire de la pluie, puis répartition par jour et par mois
    for (var h in hours) {
      var dk = h.slice(0, 10);
      var mk = h.slice(0, 7);
      var hAvg = hours[h].sum / hours[h].n;
      dayObj(dk).rain += hAvg;
      monthObj(mk).rain += hAvg;
      k.rainHours++;
    }

    return { k: k, days: days, months: months };
  }

  // ------------------------------------------------------------------
  // Rendu des indicateurs et graphiques
  // ------------------------------------------------------------------
  var MONTH_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function frDate(iso) {
    if (!iso) return "—";
    return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
  }
  function frDateTime(iso) {
    if (!iso) return "—";
    return frDate(iso) + " " + iso.slice(11, 16);
  }
  function monthLabel(key) {
    return MONTH_FR[Number(key.slice(5, 7)) - 1] + " " + key.slice(2, 4);
  }

  function destroyCharts() {
    for (var id in charts) { charts[id].destroy(); }
    charts = {};
  }

  function renderKpis(agg, rows) {
    var k = agg.k;
    var items = [
      { label: "Relevés chargés", value: fmt(k.n, 0), sub: rows.length ? "Du " + frDate(rows[0]["DateTime"]) + " au " + frDate(rows[rows.length - 1]["DateTime"]) : "—" },
      { label: "Température moyenne", value: fmt(k.n ? k.tSum / k.n : null, 1), unit: "°C", sub: "Moyenne sur la période" },
      { label: "Maximale absolue", value: fmt(k.tMax, 1), unit: "°C", sub: k.tMaxDt ? "Le " + frDateTime(k.tMaxDt) : "", cls: "red" },
      { label: "Minimale absolue", value: fmt(k.tMin, 1), unit: "°C", sub: k.tMinDt ? "Le " + frDateTime(k.tMinDt) : "" },
      { label: "Pluviométrie estimée", value: fmt(k.n ? k.rainHours ? aggRainTotal(agg) : 0 : null, 0), unit: "mm", sub: "Cumul estimé (dédup. horaire)" },
      { label: "Rafale maximale", value: fmt(k.gustMax, 0), sub: k.gustDt ? "Le " + frDateTime(k.gustDt) : "", cls: "red" },
      { label: "UV maximal", value: fmt(k.uvMax, 1), sub: "Indice UV", cls: "magenta" },
      { label: "Humidité moyenne", value: fmt(k.n ? k.humSum / k.n : null, 0), unit: "%", sub: "Moyenne sur la période" }
    ];
    document.getElementById("kpis").innerHTML = items.map(function (it) {
      return '<div class="kpi">' +
        '<div class="label">' + it.label + '</div>' +
        '<div class="value ' + (it.cls || "") + '">' + it.value +
        (it.unit ? '<span class="unit">' + it.unit + '</span>' : '') +
        '</div><div class="sub">' + (it.sub || "") + '</div></div>';
    }).join("");
  }

  function aggRainTotal(agg) {
    var tot = 0;
    for (var mk in agg.months) tot += agg.months[mk].rain;
    return tot;
  }

  function renderLatest(rows) {
    if (!rows.length) { document.getElementById("latest").innerHTML = ""; return; }
    var r = rows[rows.length - 1];
    var items = [
      ["Horodatage", frDateTime(r["DateTime"])],
      ["Température", fmt(Number(r["Temperature"]), 1) + " °C"],
      ["Humidité", fmt(Number(r["Humidity"]), 0) + " %"],
      ["Pression", fmt(Number(r["Baro Pressure"]), 1) + " hPa"],
      ["Rafale", fmt(Number(r["Wind Gust"]), 0)],
      ["UV", fmt(Number(r["UVI"]), 1)],
      ["Rayonnement", fmt(Number(r["Solar Radiation"]), 1) + " W/m²"]
    ];
    document.getElementById("latest").innerHTML = items.map(function (x) {
      return '<div class="item"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>';
    }).join("");
  }

  function baseOpts(extra) {
    var o = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { font: { family: "Sora" }, color: "#33515E", boxWidth: 14 } },
        tooltip: {
          titleFont: { family: "Sora", weight: "700" },
          bodyFont: { family: "Sora" },
          backgroundColor: "#ffffff",
          titleColor: "#003748",
          bodyColor: "#003748",
          borderColor: "#003748",
          borderWidth: 1
        }
      },
      scales: {
        x: { ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { display: false } },
        y: { ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { color: "rgba(0,55,72,0.10)" } }
      }
    };
    for (var e in extra) o[e] = extra[e];
    return o;
  }

  function renderCharts(agg) {
    var C = { primary: "#003748", cyan: "#00DBDB", magenta: "#FF00D3", red: "#ED0036", gray: "#809BA3" };
    Chart.defaults.font.family = "Sora";

    // --- Agrégats journaliers ---
    var dayKeys = Object.keys(agg.days).sort();
    var daily = dayKeys.map(function (dk) {
      var d = agg.days[dk];
      return {
        key: dk,
        label: dk.slice(8, 10) + "/" + dk.slice(5, 7),
        tAvg: d.n ? d.tSum / d.n : null,
        tHi: d.hi === -Infinity ? null : d.hi,
        tLo: d.lo === Infinity ? null : d.lo,
        rain: +d.rain.toFixed(1),
        pAvg: d.pressN ? +(d.pressSum / d.pressN).toFixed(1) : null,
        pHi: d.pressHi === -Infinity ? null : d.pressHi,
        pLo: d.pressLo === Infinity ? null : d.pressLo,
        gust: d.gust === -1 ? null : d.gust
      };
    });
    lastDaily = daily.slice();
    var xLbl = daily.map(function (x) { return x.label; });
    var xDaily = { scales: {
      x: { ticks: { font: { family: "Sora", size: 10 }, color: "#33515E", maxTicksLimit: 24, autoSkip: true }, grid: { display: false } },
      y: { ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { color: "rgba(0,55,72,0.10)" } }
    } };
    var xDailyZero = { scales: {
      x: { ticks: { font: { family: "Sora", size: 10 }, color: "#33515E", maxTicksLimit: 24, autoSkip: true }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { color: "rgba(0,55,72,0.10)" } }
    } };

    // Vue journalière — 4 cartes pleine largeur
    charts["chDailyTemp"] = new Chart(document.getElementById("chDailyTemp"), {
      type: "line",
      data: {
        labels: xLbl,
        datasets: [
          { label: "Max (°C)", data: daily.map(function (x) { return x.tHi; }), borderColor: C.red, backgroundColor: C.red, borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
          { label: "Moyenne (°C)", data: daily.map(function (x) { return x.tAvg; }), borderColor: C.primary, backgroundColor: "rgba(0,219,219,0.35)", borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true },
          { label: "Min (°C)", data: daily.map(function (x) { return x.tLo; }), borderColor: C.gray, backgroundColor: C.gray, borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
        ]
      },
      options: baseOpts(xDaily)
    });

    charts["chDailyRain"] = new Chart(document.getElementById("chDailyRain"), {
      type: "bar",
      data: {
        labels: xLbl,
        datasets: [{ label: "Pluie estimée (mm)", data: daily.map(function (x) { return x.rain; }), backgroundColor: C.cyan, borderRadius: 4 }]
      },
      options: baseOpts(xDailyZero)
    });

    charts["chDailyPress"] = new Chart(document.getElementById("chDailyPress"), {
      type: "line",
      data: {
        labels: xLbl,
        datasets: [
          { label: "Max (hPa)", data: daily.map(function (x) { return x.pHi; }), borderColor: C.red, backgroundColor: C.red, borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
          { label: "Moyenne (hPa)", data: daily.map(function (x) { return x.pAvg; }), borderColor: C.primary, backgroundColor: "rgba(0,219,219,0.35)", borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true },
          { label: "Min (hPa)", data: daily.map(function (x) { return x.pLo; }), borderColor: C.gray, backgroundColor: C.gray, borderWidth: 1.5, pointRadius: 0, tension: 0.25 }
        ]
      },
      options: baseOpts(xDaily)
    });

    charts["chDailyGust"] = new Chart(document.getElementById("chDailyGust"), {
      type: "bar",
      data: {
        labels: xLbl,
        datasets: [{ label: "Rafale max", data: daily.map(function (x) { return x.gust; }), backgroundColor: C.primary, borderRadius: 4 }]
      },
      options: baseOpts(xDailyZero)
    });

    // --- Agrégats mensuels ---
    var mKeys = Object.keys(agg.months).sort();
    var mLbl = mKeys.map(monthLabel);
    var mAvg = mKeys.map(function (k) { var m = agg.months[k]; return m.n ? +(m.tSum / m.n).toFixed(1) : null; });
    var mHi = mKeys.map(function (k) { return agg.months[k].hi === -Infinity ? null : agg.months[k].hi; });
    var mLo = mKeys.map(function (k) { return agg.months[k].lo === Infinity ? null : agg.months[k].lo; });
    var mRain = mKeys.map(function (k) { return +agg.months[k].rain.toFixed(1); });
    var mPress = mKeys.map(function (k) { var m = agg.months[k]; return m.pressN ? +(m.pressSum / m.pressN).toFixed(1) : null; });
    var mGust = mKeys.map(function (k) { return agg.months[k].gust === -1 ? null : agg.months[k].gust; });

    // Vue mensuelle — 4 cartes en barres
    charts["chMonthlyTemp"] = new Chart(document.getElementById("chMonthlyTemp"), {
      type: "bar",
      data: {
        labels: mLbl,
        datasets: [
          { label: "Moyenne (°C)", data: mAvg, backgroundColor: C.cyan, borderRadius: 6 },
          { type: "line", label: "Maximale (°C)", data: mHi, borderColor: C.red, backgroundColor: C.red, borderWidth: 2, pointRadius: 3, tension: 0.3 },
          { type: "line", label: "Minimale (°C)", data: mLo, borderColor: C.gray, backgroundColor: C.gray, borderWidth: 2, pointRadius: 3, tension: 0.3 }
        ]
      },
      options: baseOpts({})
    });

    charts["chMonthlyRain"] = new Chart(document.getElementById("chMonthlyRain"), {
      type: "bar",
      data: {
        labels: mLbl,
        datasets: [{ label: "Pluie estimée (mm)", data: mRain, backgroundColor: C.cyan, borderRadius: 6 }]
      },
      options: baseOpts({})
    });

    charts["chMonthlyPress"] = new Chart(document.getElementById("chMonthlyPress"), {
      type: "bar",
      data: {
        labels: mLbl,
        datasets: [{ label: "Pression moyenne (hPa)", data: mPress, backgroundColor: C.gray, borderRadius: 6 }]
      },
      options: baseOpts({ scales: {
        x: { ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { display: false } },
        y: { beginAtZero: false, ticks: { font: { family: "Sora", size: 11 }, color: "#33515E" }, grid: { color: "rgba(0,55,72,0.10)" } }
      } })
    });

    charts["chMonthlyGust"] = new Chart(document.getElementById("chMonthlyGust"), {
      type: "bar",
      data: {
        labels: mLbl,
        datasets: [{ label: "Rafale max", data: mGust, backgroundColor: C.primary, borderRadius: 6 }]
      },
      options: baseOpts({})
    });
  }

  function toggleView() {
    var v = document.getElementById("view").value;
    document.getElementById("viewDaily").hidden = (v !== "daily");
    document.getElementById("viewMonthly").hidden = (v !== "monthly");
    (VIEW_CHARTS[v] || []).forEach(function (id) {
      if (charts[id]) charts[id].resize();
    });
  }

  // ------------------------------------------------------------------
  // Export CSV des agrégats journaliers
  // ------------------------------------------------------------------
  function exportCsv() {
    if (!lastDaily.length) { setStatus("Aucune donnée chargée : cliquez d'abord sur Actualiser.", true); return; }
    var lines = ["Jour;Temp moy (°C);Temp max (°C);Temp min (°C);Pluie (mm);Pression moy (hPa);Rafale max"];
    lastDaily.forEach(function (d) {
      lines.push(frDate(d.key) + ";" +
        (d.tAvg !== null ? d.tAvg.toString().replace(".", ",") : "") + ";" +
        (d.tHi !== null ? d.tHi.toString().replace(".", ",") : "") + ";" +
        (d.tLo !== null ? d.tLo.toString().replace(".", ",") : "") + ";" +
        (d.rain !== null ? d.rain.toString().replace(".", ",") : "") + ";" +
        (d.pAvg !== null ? d.pAvg.toString().replace(".", ",") : "") + ";" +
        (d.gust !== null ? d.gust.toString().replace(".", ",") : ""));
    });
    var blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meteo_journalier.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ------------------------------------------------------------------
  // Chargement principal
  // ------------------------------------------------------------------
  function nextDay(iso) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function toggleCustomDates() {
    var isCustom = document.getElementById("period").value === "custom";
    document.getElementById("customDates").style.display = isCustom ? "inline-flex" : "none";
    if (isCustom) {
      var today = isoDay(new Date());
      if (!document.getElementById("dateFrom").value) document.getElementById("dateFrom").value = today;
      if (!document.getElementById("dateTo").value) document.getElementById("dateTo").value = today;
    }
  }

  // ------------------------------------------------------------------
  // Années disponibles : bornes min/max de "DateTime" dans la table
  // ------------------------------------------------------------------
  function fetchOneDateTime(order) {
    var u = CFG.url + "/rest/v1/" + CFG.table +
      "?select=" + encodeURIComponent('"DateTime"') +
      '&order="DateTime".' + order + "&limit=1";
    return fetch(u, {
      headers: {
        "apikey": CFG.key,
        "Authorization": "Bearer " + CFG.key
      }
    }).then(function (r) {
      if (!r.ok) throw new Error("Erreur HTTP " + r.status);
      return r.json();
    }).then(function (rows) {
      return rows.length ? rows[0]["DateTime"] : null;
    });
  }

  function refreshYearOptions() {
    var sel = document.getElementById("period");
    var prev = sel.value;
    return Promise.all([fetchOneDateTime("asc"), fetchOneDateTime("desc")]).then(function (b) {
      if (!b[0] || !b[1]) return;
      var yMin = Number(b[0].slice(0, 4));
      var yMax = Number(b[1].slice(0, 4));
      for (var i = sel.options.length - 1; i >= 0; i--) {
        if (/^y\d{4}$/.test(sel.options[i].value)) sel.remove(i);
      }
      var ref = sel.options[0] || null;
      for (var y = yMax; y >= yMin; y--) {
        var o = document.createElement("option");
        o.value = "y" + y;
        o.textContent = String(y);
        sel.insertBefore(o, ref);
      }
      var stillThere = false;
      for (var k = 0; k < sel.options.length; k++) {
        if (sel.options[k].value === prev) stillThere = true;
      }
      if (stillThere) {
        sel.value = prev;
      } else {
        var now = new Date().getFullYear();
        sel.value = (now >= yMin && now <= yMax) ? "y" + now : "y" + yMax;
      }
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === "all") {
          sel.options[j].textContent = "Tout l'historique (depuis " +
            MONTH_FR[Number(b[0].slice(5, 7)) - 1] + " " + b[0].slice(0, 4) + ")";
        }
      }
      toggleCustomDates();
      syncYearSelects();
    }).catch(function () {
      // Bornes indisponibles : on conserve les options d'années en place.
    });
  }

  function periodRange(value) {
    var today = new Date();
    if (/^y\d{4}$/.test(value)) {
      var y = Number(value.slice(1));
      return { from: y + "-01-01", to: (y + 1) + "-01-01" };
    }
    switch (value) {
      case "d30": { var d = new Date(today.getTime() - 29 * 86400000); return { from: isoDay(d), to: null }; }
      case "d90": { var d2 = new Date(today.getTime() - 89 * 86400000); return { from: isoDay(d2), to: null }; }
      case "m12": { var d3 = new Date(today.getTime() - 365 * 86400000); return { from: isoDay(d3), to: null }; }
      case "all": return { from: "2023-01-01", to: null };
      case "custom": {
        var from = document.getElementById("dateFrom").value;
        var to = document.getElementById("dateTo").value;
        return { from: from, to: to ? nextDay(to) : null };
      }
      default: { var yc = today.getFullYear(); return { from: yc + "-01-01", to: (yc + 1) + "-01-01" }; }
    }
  }

  function load() {
    var btn = document.getElementById("refresh");
    btn.disabled = true;
    destroyCharts();
    refreshYearOptions().then(function () {
      var p = document.getElementById("period").value;
      if (p === "custom") {
        var from = document.getElementById("dateFrom").value;
        var to = document.getElementById("dateTo").value;
        if (!from) { setStatus("Sélectionnez une date de début.", true); btn.disabled = false; return false; }
        if (to && from > to) { setStatus("La date de début doit être antérieure ou égale à la date de fin.", true); btn.disabled = false; return false; }
      }
      var range = periodRange(p);
      return fetchRows(range.from, range.to);
    }).then(function (rows) {
      if (rows === false) return;
      if (!rows.length) {
        setStatus("Aucun enregistrement sur cette période.", true);
        btn.disabled = false;
        return;
      }
      var agg = aggregate(rows);
      renderKpis(agg, rows);
      renderLatest(rows);
      renderCharts(agg);
      toggleView();
      setStatus("Terminé — " + fmt(rows.length, 0) + " relevés, du " + frDate(rows[0]["DateTime"]) + " au " + frDate(rows[rows.length - 1]["DateTime"]) + ".");
      btn.disabled = false;
    }).catch(function (err) {
      setStatus("Échec : " + err.message + " — vérifiez votre connexion Internet.", true);
      btn.disabled = false;
    });
  }

  // ------------------------------------------------------------------
  // Onglets "normales" : comparaison mensuelle station vs ville
  // ------------------------------------------------------------------
  var normLoaded = { smh: false, gre: false };

  function switchTab(key) {
    var pages = { dash: "page-dash", smh: "page-smh", gre: "page-gre" };
    for (var k in pages) {
      if (pages[k]) document.getElementById(pages[k]).hidden = (k !== key);
    }
    var btns = document.querySelectorAll(".tab");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("onclick") === "switchTab('" + key + "')");
    }
    if (key === "dash") {
      (VIEW_CHARTS.daily.concat(VIEW_CHARTS.monthly)).forEach(function (id) {
        if (charts[id]) charts[id].resize();
      });
    } else {
      ["chNormTemp-" + key, "chNormRain-" + key].forEach(function (id) {
        if (charts[id]) charts[id].resize();
      });
      if (!normLoaded[key]) loadNormale(key);
    }
  }

  function syncYearSelects() {
    var src = document.getElementById("period");
    ["smh", "gre"].forEach(function (key) {
      var sel = document.getElementById("year-" + key);
      if (!sel) return;
      var prev = sel.value;
      sel.innerHTML = "";
      for (var i = 0; i < src.options.length; i++) {
        var v = src.options[i].value;
        if (/^y\d{4}$/.test(v)) {
          var o = document.createElement("option");
          o.value = v;
          o.textContent = v.slice(1);
          sel.appendChild(o);
        }
      }
      if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
      else if (sel.options.length) sel.value = sel.options[0].value;
    });
  }

  function loadNormale(key) {
    var sel = document.getElementById("year-" + key);
    var st = document.getElementById("status-" + key);
    function nStatus(msg, isErr) { st.textContent = msg; st.className = "status" + (isErr ? " error" : ""); }
    if (!sel.value) { nStatus("Aucune année disponible.", true); return; }
    var y = Number(sel.value.slice(1));
    nStatus("Chargement de l'année " + y + "…");
    fetchRows(y + "-01-01", (y + 1) + "-01-01").then(function (rows) {
      normLoaded[key] = true;
      var agg = aggregate(rows);
      renderNormale(key, y, agg);
      nStatus("Année " + y + " — " + fmt(rows.length, 0) + " relevés. Normales : " + NORMALES[key].source + ".");
    }).catch(function (err) {
      nStatus("Échec : " + err.message + " — vérifiez votre connexion Internet.", true);
    });
  }

  function renderNormale(key, y, agg) {
    var C = { primary: "#003748", cyan: "#00DBDB", magenta: "#FF00D3", red: "#ED0036", gray: "#809BA3" };
    var N = NORMALES[key];
    var ids = ["chNormTemp-" + key, "chNormRain-" + key];
    ids.forEach(function (id) {
      if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    });

    var labels = MONTH_FR.slice();
    var stMoy = [], stRain = [];
    for (var m = 1; m <= 12; m++) {
      var mk = y + "-" + (m < 10 ? "0" + m : "" + m);
      var mo = agg.months[mk];
      stMoy.push(mo && mo.n ? +(mo.tSum / mo.n).toFixed(1) : null);
      stRain.push(mo ? +mo.rain.toFixed(1) : 0);
    }

    charts["chNormTemp-" + key] = new Chart(document.getElementById("chNormTemp-" + key), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Ma station — moy. mensuelle (°C)", data: stMoy, backgroundColor: C.cyan, borderRadius: 6 },
          { type: "line", label: "Normale max (°C)", data: N.tempMax, borderColor: C.red, backgroundColor: C.red, borderWidth: 2, pointRadius: 3, tension: 0.3 },
          { type: "line", label: "Normale moy (°C)", data: N.tempMoy, borderColor: C.primary, backgroundColor: C.primary, borderWidth: 2, pointRadius: 3, tension: 0.3 },
          { type: "line", label: "Normale min (°C)", data: N.tempMin, borderColor: C.gray, backgroundColor: C.gray, borderWidth: 2, pointRadius: 3, tension: 0.3 }
        ]
      },
      options: baseOpts({})
    });

    charts["chNormRain-" + key] = new Chart(document.getElementById("chNormRain-" + key), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Ma station — cumul mensuel (mm)", data: stRain, backgroundColor: C.cyan, borderRadius: 6 },
          { type: "line", label: "Normale cumul moyen (mm)", data: N.rainMoy, borderColor: C.magenta, backgroundColor: C.magenta, borderWidth: 2, pointRadius: 3, tension: 0.3, borderDash: [6, 4] }
        ]
      },
      options: baseOpts({})
    });
  }

  load();
