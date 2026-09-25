/* Relic 2027 Trainer Timetable Card — calendar law + persistence + sexy ticks */
(function () {
  "use strict";

  var S = window.RELIC_SCHEDULE;
  var C = window.RELIC_CITATIONS;
  var STORAGE_KEY = "relic_trainer_2027_v1";
  var TZ = "Europe/London";

  var state = {
    now: null,
    viewYear: 2027,
    viewMonth: 1,
    viewWeek: 1,
    store: { completes: {}, skips: {}, version: 1 },
    isPreview: false,
    coachOverride: null,
    _userPickedMonth: false
  };

  function londonParts(d) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit",
      hour12: false
    });
    var parts = {};
    fmt.formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
    return {
      year: +parts.year,
      month: +parts.month,
      day: +parts.day,
      weekday: parts.weekday,
      hour: +parts.hour,
      minute: +parts.minute,
      dateKey: parts.year + "-" + parts.month + "-" + parts.day
    };
  }

  function parseDateOverride() {
    var m = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(location.search || "");
    if (!m) return null;
    var bits = m[1].split("-");
    return new Date(Date.UTC(+bits[0], +bits[1] - 1, +bits[2], 12, 0, 0));
  }

  function getNow() {
    var o = parseDateOverride();
    if (o) {
      state.coachOverride = londonParts(o).dateKey;
      return o;
    }
    state.coachOverride = null;
    return new Date();
  }

  /* Resolve Drive URL; visible label always = card citation string (day.doc1/doc2) */
  function resolveUrl(cabinKey, phase) {
    var cabins = (C && C.cabins) || {};
    var cabin = cabins[cabinKey];
    if (!cabin) return { url: null, gate: null };
    var entry = cabin[phase];
    var gate = null;
    if (!entry) {
      entry = cabin.Base;
      gate = cabin.gate || ("No " + phase + " Docx yet — Base linked");
    }
    return { url: entry && entry.url ? entry.url : null, gate: gate, folder: cabin.folder || null };
  }

  function docCellHtml(label, cabinKey, phase, isRecovery) {
    if (!label) return '<span class="empty">—</span>';
    if (isRecovery || !cabinKey) {
      return '<span class="cite-text">' + escapeHtml(label) + "</span>";
    }
    var r = resolveUrl(cabinKey, phase);
    var html;
    if (r.url) {
      html = '<a href="' + r.url + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(label) + "</a>";
    } else {
      html = '<span class="cite-text">' + escapeHtml(label) + "</span>";
    }
    if (r.gate) html += '<span class="gate-note">' + escapeHtml(r.gate) + "</span>";
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { completes: {}, skips: {}, version: 1 };
      var o = JSON.parse(raw);
      return { completes: o.completes || {}, skips: o.skips || {}, version: o.version || 1 };
    } catch (e) {
      return { completes: {}, skips: {}, version: 1 };
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  }

  function isLive(parts) { return parts.dateKey >= S.LIVE_START; }

  /**
   * RELIC CALENDAR SYSTEM
   * PREVIEW (before 2027-01-01): browse all months/weeks; practice ticks allowed.
   * LIVE (from 2027-01-01): browse any month to look ahead; COMPLETE/SKIP only for
   * today and past days. Future calendar days stay LOCKED until that date arrives.
   */
  function canTick(dateKey, parts) {
    if (!isLive(parts)) return true; /* PREVIEW practice */
    return dateKey <= parts.dateKey; /* LIVE lock */
  }

  function modeLabel(parts) {
    if (!isLive(parts)) return "MODE PREVIEW · unlocks LIVE 1 Jan 2027";
    if (parts.year === 2027) return "MODE LIVE · " + parts.dateKey + " sealed trail";
    if (parts.year > 2027) return "MODE ARCHIVE · 2027 complete";
    return "MODE PREVIEW";
  }

  function monthCompletion(month) {
    var days = S.buildMonthDays(2027, month);
    var total = days.length;
    var done = 0;
    days.forEach(function (d) {
      if (state.store.completes[d.dateKey] || state.store.skips[d.dateKey]) done++;
    });
    return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function spawnFlourish(el) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    for (var i = 0; i < 10; i++) {
      var p = document.createElement("div");
      p.className = "flourish";
      var angle = (Math.PI * 2 * i) / 10;
      var dist = 26 + Math.random() * 28;
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      document.body.appendChild(p);
      (function (node) { setTimeout(function () { node.remove(); }, 750); })(p);
    }
  }

  function statusBadge(status) {
    if (!status) return "";
    /* locked / locked-card / locked-nix / locked-card+nix → no badge */
    if (String(status).indexOf("locked") === 0) return "";
    if (status === "partial") return '<span class="card-badge partial">PARTIAL · W3–W4 provisional</span>';
    if (status === "provisional") return '<span class="card-badge provisional">PROVISIONAL · awaiting card lock</span>';
    return "";
  }

  function render() {
    state.now = getNow();
    var parts = londonParts(state.now);
    state.isPreview = !isLive(parts);

    if (!state._userPickedMonth) {
      if (state.isPreview) {
        state.viewMonth = 1;
        state.viewWeek = 1;
      } else if (parts.year === 2027) {
        state.viewMonth = parts.month;
        state.viewWeek = S.weekOfMonth(parts.day);
      } else if (parts.year > 2027) {
        state.viewMonth = 12;
        state.viewWeek = 4;
      } else {
        state.viewMonth = 1;
        state.viewWeek = 1;
      }
    }

    var phase = S.phaseForMonth(state.viewMonth);
    var meta = S.MONTH_META[state.viewMonth];
    var cardStatus = S.MONTH_CARD_STATUS[state.viewMonth];

    /* Unique cathedral mood per month */
    var card = document.getElementById("relic-card");
    card.setAttribute("data-month", String(state.viewMonth));
    card.setAttribute("data-phase", phase.suffix);
    document.body.setAttribute("data-month", String(state.viewMonth));
    document.body.setAttribute("data-phase", phase.suffix);

    var previewEl = document.getElementById("banner-preview");
    var liveEl = document.getElementById("banner-live");
    var coachEl = document.getElementById("banner-coach");
    previewEl.style.display = state.isPreview ? "block" : "none";
    liveEl.style.display = state.isPreview ? "none" : "block";
    if (state.coachOverride) {
      coachEl.style.display = "block";
      coachEl.textContent = "COACH OVERRIDE · ?date=" + state.coachOverride + " · Europe/London";
    } else {
      coachEl.style.display = "none";
    }

    document.getElementById("month-title").textContent =
      S.MONTH_NAMES[state.viewMonth] + "  ·  WEEK " + state.viewWeek + " OF 4";
    document.getElementById("phase-banner").textContent = meta.phaseLine;
    document.getElementById("month-blurb").textContent = meta.blurb;
    document.getElementById("card-status").innerHTML = statusBadge(cardStatus);

    var deloadEl = document.getElementById("deload-hint");
    if (state.viewWeek === 4) {
      deloadEl.style.display = "inline";
      deloadEl.textContent = " · DELOAD week — cut MAIN ~40–50%, Base soft, no TF";
    } else {
      deloadEl.style.display = "none";
    }

    document.getElementById("meta-today").innerHTML =
      "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday +
      " · " + S.pad2(parts.hour) + ":" + S.pad2(parts.minute) + " London";
    document.getElementById("meta-mode").textContent = modeLabel(parts);
    var law = document.getElementById("system-law");
    if (law) law.classList.toggle("collapsed-live", !state.isPreview);

    document.querySelectorAll(".phase").forEach(function (el) {
      el.classList.toggle("active", el.dataset.phase === phase.suffix);
    });

    /* Year wall */
    var yw = document.getElementById("year-wall");
    yw.innerHTML = "";
    for (var m = 1; m <= 12; m++) {
      var mc = monthCompletion(m);
      var cell = document.createElement("div");
      cell.className = "yw-month";
      if (m === state.viewMonth) cell.classList.add("selected");
      if (!state.isPreview && parts.year === 2027 && m === parts.month) cell.classList.add("current");
      cell.dataset.month = m;
      cell.innerHTML =
        '<span class="yw-label">' + S.MONTH_SHORT[m] + "</span>" +
        '<div class="yw-bar"><div class="yw-fill" style="width:' + mc.pct + '%"></div></div>' +
        '<span class="yw-pct">' + mc.pct + "%</span>";
      cell.addEventListener("click", (function (mm) {
        return function () { pickMonth(mm); };
      })(m));
      yw.appendChild(cell);
    }

    document.querySelectorAll(".mbtn").forEach(function (btn) {
      var mm = +btn.dataset.month;
      btn.classList.toggle("selected", mm === state.viewMonth);
      btn.classList.toggle("live-month", !state.isPreview && parts.year === 2027 && mm === parts.month);
      btn.classList.toggle("future", isLive(parts) && parts.year === 2027 && mm > parts.month);
      btn.classList.toggle("past", isLive(parts) && parts.year === 2027 && mm < parts.month);
      if (state.isPreview) {
        /* PREVIEW: all months browsable — no future greying */
        btn.classList.toggle("future", false);
        btn.classList.toggle("past", false);
        btn.classList.toggle("browseable", true);
      } else {
        /* LIVE: can still browse future months to look ahead; only ticks lock */
        btn.classList.toggle("browseable", true);
      }
    });

    document.querySelectorAll(".wtab").forEach(function (btn) {
      var w = +btn.dataset.week;
      btn.classList.toggle("selected", w === state.viewWeek);
      btn.classList.toggle("deload", w === 4);
      /* Feb W3/W4 provisional cue */
      var st = S.MONTH_CARD_STATUS[state.viewMonth] || "";
      var stub = (st === "partial" || st === "provisional");
      btn.classList.toggle("stub", stub && w === state.viewWeek);
    });

    var weekDays = S.daysInWeekOfMonth(2027, state.viewMonth, state.viewWeek);
    var rangeLabel = "";
    if (weekDays.length) {
      rangeLabel = weekDays[0].dateKey + " → " + weekDays[weekDays.length - 1].dateKey;
    }
    var stubNote = "";
    if (cardStatus === "partial" && state.viewWeek >= 3) stubNote = " · W" + state.viewWeek + " provisional";
    else if (cardStatus === "provisional") stubNote = " · provisional rotation";
    document.getElementById("week-meta").textContent = rangeLabel +
      (state.viewWeek === 4 ? " · DELOAD" : "") + stubNote;

    var tbody = document.getElementById("tt-body");
    tbody.innerHTML = "";
    weekDays.forEach(function (day) {
      var tr = document.createElement("tr");
      var isToday = day.dateKey === parts.dateKey;
      var isComplete = !!state.store.completes[day.dateKey];
      var isSkipped = !!state.store.skips[day.dateKey];
      var tickable = canTick(day.dateKey, parts);
      var isFutureDay = isLive(parts) && day.dateKey > parts.dateKey;

      if (isToday) tr.classList.add("today");
      if (isComplete) tr.classList.add("complete");
      if (isSkipped) tr.classList.add("skipped");
      if (day.isRecovery) tr.classList.add("recovery");
      if (isFutureDay) tr.classList.add("future-locked");

      var doc1 = docCellHtml(day.doc1, day.cabins[0], day.phase, day.isRecovery);
      var doc2 = docCellHtml(day.doc2, day.cabins[1], day.phase, day.isRecovery);

      var actions = "";
      if (!tickable) {
        actions = '<span class="lock-badge">LOCKED</span>';
      } else {
        var checked = isComplete ? " checked" : "";
        var skipActive = isSkipped ? " active" : "";
        actions =
          '<div class="actions">' +
            '<div class="tick-wrap">' +
              '<button type="button" class="tick-btn' + checked + '" data-act="complete" data-date="' + day.dateKey + '" aria-label="Complete"></button>' +
              '<span class="tick-label">COMPLETE</span>' +
            "</div>" +
            '<button type="button" class="skip-btn' + skipActive + '" data-act="skip" data-date="' + day.dateKey + '">' +
              (isSkipped ? "SKIPPED" : "SKIP") +
            "</button>";
        if (isComplete || isSkipped) {
          actions += '<button type="button" class="undo-btn" data-act="undo" data-date="' + day.dateKey + '">undo</button>';
        }
        actions += "</div>";
      }

      var mark = "";
      if (isComplete) mark = '<span class="status-mark done" title="Complete">✓</span> ';
      if (isSkipped) mark = '<span class="status-mark skip">SKIP</span> ';

      tr.innerHTML =
        '<td class="day-cell"><span class="dname">' + day.dayName + '</span>' +
          '<span class="ddate">' + day.dateKey + (isToday ? " · TODAY" : "") + "</span></td>" +
        '<td class="pair-cell">' + escapeHtml(day.pair) + "</td>" +
        '<td class="doc-cell">' + doc1 + "</td>" +
        '<td class="doc-cell">' + doc2 + "</td>" +
        '<td class="complete-cell">' + mark + actions + "</td>";

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", onAction);
    });
  }

  function pickMonth(m) {
    state._userPickedMonth = true;
    state.viewMonth = m;
    var parts = londonParts(state.now || getNow());
    if (!state.isPreview && parts.year === 2027 && m === parts.month) {
      state.viewWeek = S.weekOfMonth(parts.day);
    } else {
      state.viewWeek = 1;
    }
    render();
  }

  function pickWeek(w) {
    state._userPickedMonth = true;
    state.viewWeek = w;
    render();
  }

  function onAction(ev) {
    var btn = ev.currentTarget;
    var act = btn.dataset.act;
    var dateKey = btn.dataset.date;
    var parts = londonParts(state.now || getNow());
    if (!canTick(dateKey, parts)) return;

    if (act === "complete") {
      var turningOn = !state.store.completes[dateKey];
      if (turningOn) {
        state.store.completes[dateKey] = true;
        delete state.store.skips[dateKey];
        spawnFlourish(btn);
      } else {
        delete state.store.completes[dateKey];
      }
      saveStore();
      render();
    } else if (act === "skip") {
      if (state.store.skips[dateKey]) {
        delete state.store.skips[dateKey];
      } else {
        state.store.skips[dateKey] = true;
        delete state.store.completes[dateKey];
      }
      saveStore();
      render();
    } else if (act === "undo") {
      delete state.store.completes[dateKey];
      delete state.store.skips[dateKey];
      saveStore();
      render();
    }
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state.store, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relic_trainer_2027_v1.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.json";
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var o = JSON.parse(reader.result);
          state.store = {
            completes: o.completes || {},
            skips: o.skips || {},
            version: o.version || 1
          };
          saveStore();
          render();
        } catch (e) {
          alert("Import failed: invalid JSON");
        }
      };
      reader.readAsText(file);
    });
    inp.click();
  }

  function clearAll() {
    if (!confirm("Clear ALL completes and skips for 2027? This cannot be undone.")) return;
    state.store = { completes: {}, skips: {}, version: 1 };
    saveStore();
    render();
  }

  function jumpToday() {
    state._userPickedMonth = false;
    render();
  }

  function boot() {
    state.store = loadStore();
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      btn.addEventListener("click", function () { pickMonth(+btn.dataset.month); });
    });
    document.querySelectorAll(".wtab").forEach(function (btn) {
      btn.addEventListener("click", function () { pickWeek(+btn.dataset.week); });
    });
    document.getElementById("btn-export").addEventListener("click", exportJson);
    document.getElementById("btn-import").addEventListener("click", importJson);
    document.getElementById("btn-clear").addEventListener("click", clearAll);
    document.getElementById("btn-today").addEventListener("click", jumpToday);
    render();
    setInterval(function () {
      var prev = state.now && londonParts(state.now).dateKey;
      state.now = getNow();
      var lp = londonParts(state.now);
      if (prev !== lp.dateKey) {
        state._userPickedMonth = false;
        render();
      } else {
        document.getElementById("meta-today").innerHTML =
          "TODAY <strong>" + lp.dateKey + "</strong> · " + lp.weekday + " · " +
          S.pad2(lp.hour) + ":" + S.pad2(lp.minute) + " London";
      }
    }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
