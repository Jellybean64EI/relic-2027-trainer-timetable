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
  var DRIVE_ROOT = "https://drive.google.com/drive/folders/1321NsxqCbzqarZFSZeg1moq7PFohasx4";

  function resolveUrl(cabinKey, phase) {
    var root = (C && C.rootFolder) || DRIVE_ROOT;
    var cabins = (C && C.cabins) || {};
    var cabin = cabins[cabinKey];
    if (!cabin) return { url: root, gate: null, folder: root };
    var entry = cabin[phase];
    var gate = null;
    if (!entry || entry === null) {
      entry = cabin.Base;
      if (cabin.gate) gate = cabin.gate;
      else if (!cabin[phase]) gate = "No " + phase + " Docx yet — Base linked";
    }
    var url = (entry && entry.url) ? entry.url : (cabin.folder || root);
    if (!url) url = root;
    return { url: url, gate: gate, folder: cabin.folder || root };
  }

  /* Exact: 1. {CabinKey}_Trainer_{Phase} — always visible <a> for training days */
  function citationLaw(cabinKey, phase) {
    return "1. " + cabinKey + "_Trainer_" + phase;
  }

  function relicLinkHtml(label, cabinKey, phase, isRecovery) {
    var plain = label ? String(label) : "";
    var isRest = isRecovery ||
      /Rest\s*\/\s*Light Mobility/i.test(plain) ||
      /Weekly Reset/i.test(plain) ||
      ((!cabinKey) && (!plain || plain === "—"));
    if (isRest && (!cabinKey || isRecovery)) {
      if (!plain) plain = "Rest / Light Mobility";
      return '<span class="doc-text">' + escapeHtml(plain) + "</span>";
    }
    if (!cabinKey) {
      return '<span class="doc-text">' + escapeHtml(plain || "—") + "</span>";
    }
    /* Always rebuild from cabin+phase so we never show blank/dash */
    plain = citationLaw(cabinKey, phase || "Base");
    var ph = phase || "Base";
    return (
      '<button type="button" class="doc-link" data-cabin="' + escapeHtml(cabinKey) +
      '" data-phase="' + escapeHtml(ph) +
      '" title="' + escapeHtml(plain) + '">' +
      escapeHtml(plain) + "</button>"
    );
  }

  function relicsCellHtml(day) {
    var c0 = (day.cabins && day.cabins[0]) || null;
    var c1 = (day.cabins && day.cabins[1]) || null;
    var links = [];
    if (day.isRecovery) {
      links.push(relicLinkHtml(day.doc1 || "Rest / Light Mobility", null, day.phase, true));
      if (day.doc2) links.push(relicLinkHtml(day.doc2, null, day.phase, true));
    } else {
      if (c0 || day.doc1) links.push(relicLinkHtml(day.doc1, c0, day.phase, false));
      if (c1 || (day.doc2 && day.doc2 !== "—" && day.doc2 !== day.doc1)) {
        links.push(relicLinkHtml(day.doc2, c1, day.phase, false));
      }
    }
    if (!links.length) {
      links.push('<span class="doc-text">—</span>');
    }
    return (
      '<td class="doc-cell relics-cell" data-label="TRAINING RELICS">' +
        '<div class="relic-links-container">' + links.join("") + "</div>" +
      "</td>"
    );
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
   * LIVE (from 2027-01-01): browse any month to look ahead; COMPLETE only for
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


  var MONTH_RANKS = {
    1:  { lv: "LV01", code: "SEED",  phase: "BASE",         phaseClass: "phase-base" },
    2:  { lv: "LV02", code: "ROOT",  phase: "BASE",         phaseClass: "phase-base" },
    3:  { lv: "LV03", code: "STEM",  phase: "BASE",         phaseClass: "phase-base" },
    4:  { lv: "LV04", code: "FORGE", phase: "HARD",         phaseClass: "phase-hard" },
    5:  { lv: "LV05", code: "IRON",  phase: "HARD",         phaseClass: "phase-hard" },
    6:  { lv: "LV06", code: "STEEL", phase: "HARD",         phaseClass: "phase-hard" },
    7:  { lv: "LV07", code: "EDGE",  phase: "EXPERT",       phaseClass: "phase-expert" },
    8:  { lv: "LV08", code: "CRAFT", phase: "EXPERT",       phaseClass: "phase-expert" },
    9:  { lv: "LV09", code: "MARK",  phase: "EXPERT",       phaseClass: "phase-expert" },
    10: { lv: "LV10", code: "PEAK",  phase: "TILL FAILURE", phaseClass: "phase-till" },
    11: { lv: "LV11", code: "APEX",  phase: "TILL FAILURE", phaseClass: "phase-till" },
    12: { lv: "LV12", code: "SEAL",  phase: "TILL FAILURE", phaseClass: "phase-till" }
  };

  function rankClassForPct(pct) {
    if (pct >= 100) return "rank-clear";
    if (pct >= 75) return "rank-hot";
    if (pct >= 50) return "rank-half";
    if (pct >= 25) return "rank-rise";
    if (pct >= 1) return "rank-warm";
    return "rank-empty";
  }

  function ensureMonthBadge(btn) {
    var nameEl = btn.querySelector(".m-name");
    if (!nameEl) {
      var label = "";
      Array.prototype.forEach.call(btn.childNodes, function (n) {
        if (n.nodeType === 3) label += n.textContent;
      });
      label = label.trim() || (btn.textContent || "").trim();
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      nameEl = document.createElement("span");
      nameEl.className = "m-name";
      nameEl.textContent = label;
      btn.appendChild(nameEl);
    }
    var badge = btn.querySelector(".m-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "m-badge";
      btn.appendChild(badge);
    }
    return badge;
  }

  function updateMonthBadge(btn, mm) {
    var badge = ensureMonthBadge(btn);
    var rank = MONTH_RANKS[mm] || MONTH_RANKS[1];
    var comp = monthCompletion(mm);
    var pct = comp.pct || 0;
    var rankCls = rankClassForPct(pct);
    var text;
    if (pct >= 100) text = "MAX";
    else if (pct >= 1) text = pct + "%";
    else text = rank.lv;
    badge.textContent = text;
    badge.title = rank.lv + " · " + rank.code + " · " + rank.phase;
    badge.className = "m-badge " + rankCls + " " + rank.phaseClass;
    ["rank-empty", "rank-warm", "rank-rise", "rank-half", "rank-hot", "rank-clear"].forEach(function (c) {
      btn.classList.toggle(c, c === rankCls);
    });
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


  function fitScheduleToViewport() {
    /* Flush lock: natural row height only — no forced viewport stretch */
    var wrap = document.querySelector(".table-wrap");
    if (!wrap) return;
    var table = wrap.querySelector("table.tt");
    wrap.style.minHeight = "";
    wrap.style.height = "";
    if (table) {
      table.style.height = "";
      table.querySelectorAll("tbody tr").forEach(function (r) {
        r.style.height = "";
      });
    }
  }

  function render() {
    try {
      _renderInner();
      fitScheduleToViewport();
      requestAnimationFrame(function () {
        fitScheduleToViewport();
        requestAnimationFrame(fitScheduleToViewport);
      });
    } catch (err) {
      console.error("Relic render failed", err);
      var tw = document.querySelector(".table-wrap");
      if (tw) {
        tw.innerHTML = '<div class="relic-render-error" style="padding:1rem;color:#ffe9a8;background:#4a2010;border:1px solid #c9842a;font-family:monospace;font-size:0.75rem;">Schedule render error — hard refresh. ' + String(err && err.message ? err.message : err) + "</div>";
      }
    }
  }

  function _renderInner() {
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

    var phaseShort = (meta.phaseLine || "").replace(/^PHASE:\s*/i, "");
    document.getElementById("identity-line").textContent =
      S.MONTH_NAMES[state.viewMonth] + " · WEEK " + state.viewWeek + " OF 4 · " + phaseShort;
    document.getElementById("month-blurb").textContent = meta.blurb;
    document.getElementById("card-status").innerHTML = statusBadge(cardStatus);

    var deloadEl = document.getElementById("deload-hint");
    if (state.viewWeek === 4) {
      deloadEl.style.display = "inline";
      deloadEl.textContent = " · DELOAD — cut MAIN ~40–50%";
    } else {
      deloadEl.style.display = "none";
    }

    document.getElementById("meta-today").innerHTML =
      "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday;
    document.getElementById("meta-mode").textContent = modeLabel(parts);
    var lawSum = document.getElementById("law-summary");
    if (lawSum) {
      lawSum.textContent = state.isPreview
        ? "PREVIEW · browse all months · seals LIVE 1 Jan 2027"
        : "LIVE · browse any month · ticks lock to calendar";
    }

    document.querySelectorAll(".phase").forEach(function (el) {
      el.classList.toggle("active", el.dataset.phase === phase.suffix);
    });

    /* Year wall removed — duplicate of month-bar (Joseph clean layout) */
    var yw = document.getElementById("year-wall");
    if (yw) { yw.innerHTML = ""; yw.hidden = true; }

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
      updateMonthBadge(btn, mm);
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

    /* Training week: Mon→Sat forensic order. Sunday recovery hidden (Joseph knows). */
    /* Calendar-true order: sort by dateKey, never by weekday index.
       Day-of-month weeks (1–7/8–14/15–21/22–end) can mix Fri–Sat before Mon;
       weekday sort was scrambling Jan 01–02 after Jan 04–07. */
    var weekDays = S.daysInWeekOfMonth(2027, state.viewMonth, state.viewWeek)
      .filter(function (d) { return !d.isRecovery && d.dayIndex < 6; })
      .sort(function (a, b) {
        if (a.dateKey < b.dateKey) return -1;
        if (a.dateKey > b.dateKey) return 1;
        return 0;
      });
    var rangeLabel = "";
    if (weekDays.length) {
      var first = weekDays[0];
      var last = weekDays[weekDays.length - 1];
      var span = first.dayName + "–" + last.dayName;
      rangeLabel = first.dateKey + " → " + last.dateKey + " · " + span + " · calendar order";
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

      var tickHtml = "";
      if (!tickable) {
        tickHtml = '<span class="lock-badge">LOCKED</span>';
      } else {
        var checked = isComplete ? " checked" : "";
        tickHtml =
          '<button type="button" class="tick-btn' + checked +
          '" data-act="complete" data-date="' + day.dateKey +
          '" aria-label="Mark complete"></button>';
      }

      var todayPill = isToday ? '<span class="today-pill">TODAY</span>' : "";

      tr.innerHTML =
        '<td class="day-cell" data-label="DAY">' +
          '<span class="dname">' + day.dayName + "</span>" + todayPill +
          '<span class="ddate">' + day.dateKey + "</span></td>" +
        relicsCellHtml(day) +
        '<td class="complete-cell" data-label="DONE">' +
          '<div class="actions">' + tickHtml + "</div></td>";

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
    if (!confirm("Clear ALL completes for 2027? This cannot be undone.")) return;
    state.store = { completes: {}, skips: {}, version: 1 };
    saveStore();
    render();
  }

  function jumpToday() {
    state._userPickedMonth = false;
    render();
  }


  /* ——— Relic FULLSCREEN trainer player (relics25) ———
   * LAW: iframe src is ONLY https://drive.google.com/file/d/{FILE_ID}/preview
   * or about:blank. folderEmbedUrl / folderUrl / embeddedfolderview / drive/folders
   * are NEVER written into the iframe. Empty playlist → empty overlay (no grid).
   * Timer: strict 360s set; at 00:00 auto-advance playlist; soft remount 45s.
   */
  var RELIC_BUILD = "relics25b";
  var SET_DURATION_SEC = 360; /* STRICT 6-minute set — never 180 */
  var CONTROLS_FADE_MS = 2500;
  var SOFT_REEMBED_MAX_SEC = 45;
  var FILE_PREVIEW_RE = /^https:\/\/drive\.google\.com\/file\/d\/[^/]+\/preview$/i;

  var player = {
    activeTimer: null,
    controlsTimeout: null,
    reembedInterval: null,
    secondsRemaining: SET_DURATION_SEC,
    timerPaused: false,
    visuallyPaused: false,
    playlist: [],
    videoQueue: [],
    playlistIndex: 0,
    currentCabin: null,
    currentPhase: null,
    setDuration: SET_DURATION_SEC,
    historyPushed: false
  };

  function archiveCabin(cabinKey) {
    var A = window.RELIC_VIDEO_ARCHIVE || {};
    var cabins = A.cabins || {};
    return cabins[cabinKey] || null;
  }

  function isBareFileId(fileId) {
    if (!fileId) return false;
    var id = String(fileId).trim();
    if (!id) return false;
    if (/folders\//i.test(id) || /embeddedfolderview/i.test(id) || /folderEmbedUrl/i.test(id)) {
      return false;
    }
    if (/^https?:\/\//i.test(id)) return false;
    if (id.indexOf("/") !== -1) return false;
    return true;
  }

  function filePreviewUrl(fileId) {
    if (!isBareFileId(fileId)) return "";
    return "https://drive.google.com/file/d/" + String(fileId).trim() + "/preview";
  }

  function formatTimer(sec) {
    var s = Math.max(0, sec | 0);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function fsEl(id) {
    return document.getElementById(id);
  }

  function updateTimerDisplay() {
    var el = fsEl("video-inside-timer");
    if (!el) return;
    if (player.secondsRemaining <= 0) {
      el.textContent = "00:00";
      el.classList.add("timer-done");
    } else {
      el.textContent = formatTimer(player.secondsRemaining);
      el.classList.remove("timer-done");
    }
  }

  function clearSixMinuteTimer() {
    if (player.activeTimer) {
      clearInterval(player.activeTimer);
      player.activeTimer = null;
    }
  }

  function clearReembed() {
    if (player.reembedInterval) {
      clearInterval(player.reembedInterval);
      player.reembedInterval = null;
    }
  }

  function clearControlsTimeout() {
    if (player.controlsTimeout) {
      clearTimeout(player.controlsTimeout);
      player.controlsTimeout = null;
    }
  }

  function setPlayPauseVisual(paused) {
    var btn = fsEl("btn-play-pause");
    var veil = fsEl("relic-fs-pause-veil");
    player.visuallyPaused = !!paused;
    if (btn) {
      btn.textContent = paused ? "▶" : "❚❚";
      btn.setAttribute("aria-label", paused ? "Play" : "Pause");
    }
    if (veil) {
      veil.hidden = !paused;
      veil.setAttribute("aria-hidden", paused ? "false" : "true");
    }
  }

  function showControlsTemporarily() {
    var controls = fsEl("relic-fs-controls");
    var root = fsEl("relic-fullscreen-player");
    if (!controls) return;
    controls.classList.add("is-visible");
    if (root) root.classList.add("controls-visible");
    clearControlsTimeout();
    player.controlsTimeout = setTimeout(function () {
      controls.classList.remove("is-visible");
      if (root) root.classList.remove("controls-visible");
      player.controlsTimeout = null;
    }, CONTROLS_FADE_MS);
  }

  function remountFrame(src) {
    var frame = fsEl("relic-video-frame");
    if (!frame) return;
    /* Hard block: never load Drive folder grids into the player */
    if (src && (/\/drive\/folders\//i.test(src) || /embeddedfolderview/i.test(src) || /folderEmbedUrl/i.test(src))) {
      src = "";
    }
    var safe = src || "about:blank";
    if (!FILE_PREVIEW_RE.test(safe) && safe !== "about:blank") {
      safe = "about:blank";
    }
    frame.src = "about:blank";
    setTimeout(function () {
      var f = fsEl("relic-video-frame");
      if (f) f.src = safe;
    }, 30);
  }

  function currentPreviewSrc() {
    if (player.videoQueue && player.videoQueue.length) {
      return player.videoQueue[player.playlistIndex] || "";
    }
    return "";
  }

  function setEmptyOverlay(visible) {
    var overlay = fsEl("relic-fs-empty-overlay");
    if (!overlay) return;
    overlay.hidden = !visible;
    overlay.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      overlay.textContent = "No video file IDs mapped for this cabin — folder grids are blocked.";
    }
  }

  function showNoClipsMessage(cabinKey) {
    var frame = fsEl("relic-video-frame");
    var clipLabel = fsEl("player-clip-label");
    if (frame) frame.src = "about:blank";
    setEmptyOverlay(true);
    if (clipLabel) {
      clipLabel.textContent = "No video file IDs mapped for this cabin — folder grids are blocked.";
    }
  }

  function updateClipLabel() {
    var clipLabel = fsEl("player-clip-label");
    if (!clipLabel) return;
    if (player.playlist && player.playlist.length) {
      var clip = player.playlist[player.playlistIndex];
      var title = (clip && clip.title) ? clip.title : ("Clip " + (player.playlistIndex + 1));
      clipLabel.textContent =
        RELIC_BUILD + " · " + (player.playlistIndex + 1) + " / " + player.playlist.length + " · " + title;
    } else {
      clipLabel.textContent = RELIC_BUILD;
    }
  }

  function startSoftReembed() {
    clearReembed();
    if (!player.videoQueue.length) return;
    var intervalSec = SOFT_REEMBED_MAX_SEC;
    player.reembedInterval = setInterval(function () {
      if (player.timerPaused || player.visuallyPaused) return;
      if (player.secondsRemaining <= 0) return;
      var src = currentPreviewSrc();
      if (src) remountFrame(src);
    }, intervalSec * 1000);
  }

  function loadCurrentVideo() {
    setEmptyOverlay(false);
    updateClipLabel();
    remountFrame(currentPreviewSrc());
    startSoftReembed();
    setPlayPauseVisual(false);
  }

  function startSixMinuteTimer() {
    clearSixMinuteTimer();
    player.setDuration = SET_DURATION_SEC;
    player.secondsRemaining = SET_DURATION_SEC;
    player.timerPaused = false;
    updateTimerDisplay();
    player.activeTimer = setInterval(function () {
      if (player.timerPaused || player.visuallyPaused) return;
      player.secondsRemaining -= 1;
      if (player.secondsRemaining <= 0) {
        player.secondsRemaining = 0;
        updateTimerDisplay();
        clearSixMinuteTimer();
        try {
          if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
        } catch (e) { /* ignore */ }
        playNextVideo();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  function playNextVideo() {
    if (!player.videoQueue.length) {
      startSixMinuteTimer();
      showNoClipsMessage(player.currentCabin);
      setPlayPauseVisual(false);
      showControlsTemporarily();
      return;
    }
    player.playlistIndex = (player.playlistIndex + 1) % player.videoQueue.length;
    loadCurrentVideo();
    startSixMinuteTimer();
    showControlsTemporarily();
  }

  function playPreviousVideo() {
    if (!player.videoQueue.length) {
      startSixMinuteTimer();
      showNoClipsMessage(player.currentCabin);
      setPlayPauseVisual(false);
      showControlsTemporarily();
      return;
    }
    player.playlistIndex =
      (player.playlistIndex - 1 + player.videoQueue.length) % player.videoQueue.length;
    loadCurrentVideo();
    startSixMinuteTimer();
    showControlsTemporarily();
  }

  function togglePlayPause() {
    if (player.visuallyPaused) {
      player.visuallyPaused = false;
      player.timerPaused = false;
      setPlayPauseVisual(false);
      remountFrame(currentPreviewSrc());
      startSoftReembed();
    } else {
      player.visuallyPaused = true;
      player.timerPaused = true;
      setPlayPauseVisual(true);
      clearReembed();
    }
    showControlsTemporarily();
  }

  function closeFullscreenPlayer() {
    clearSixMinuteTimer();
    clearReembed();
    clearControlsTimeout();
    var frame = fsEl("relic-video-frame");
    if (frame) frame.src = "about:blank";
    setEmptyOverlay(false);
    var root = fsEl("relic-fullscreen-player");
    if (root) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.classList.remove("controls-visible");
    }
    var controls = fsEl("relic-fs-controls");
    if (controls) controls.classList.remove("is-visible");
    document.documentElement.classList.remove("relic-fs-open");
    document.body.classList.remove("relic-fs-open", "modal-open");
    setPlayPauseVisual(false);
    var shouldPop = player.historyPushed;
    player.historyPushed = false;
    player.playlist = [];
    player.videoQueue = [];
    player.playlistIndex = 0;
    player.currentCabin = null;
    player.timerPaused = false;
    player.visuallyPaused = false;
    if (shouldPop) {
      try {
        if (history.state && history.state.relicFs) history.back();
      } catch (e) { /* ignore */ }
    }
  }

  function closeVideoPlayer() {
    closeFullscreenPlayer();
  }

  function openRelicVideo(cabinKey, phase) {
    /* relics25 physical law: FILE_ID → file/d/{FILE_ID}/preview only. No folderEmbedUrl. */
    player.currentCabin = cabinKey;
    player.currentPhase = phase || "Base";
    var cabin = archiveCabin(cabinKey);
    var raw = (cabin && cabin.playlist && cabin.playlist.length) ? cabin.playlist : [];
    player.playlist = [];
    player.videoQueue = [];
    for (var i = 0; i < raw.length; i++) {
      var clip = raw[i];
      if (!clip || !clip.id) continue;
      /* Never use cabin.folderUrl / cabin.folderId / folderEmbedUrl as iframe src */
      var url = filePreviewUrl(clip.id);
      if (!url) continue;
      player.playlist.push({
        id: String(clip.id).trim(),
        title: clip.title || ("Clip " + (player.playlist.length + 1))
      });
      player.videoQueue.push(url);
    }
    player.playlistIndex = 0;
    setEmptyOverlay(false);

    var root = fsEl("relic-fullscreen-player");
    if (root) {
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-relic-build", RELIC_BUILD);
    }
    document.documentElement.classList.add("relic-fs-open");
    document.body.classList.add("relic-fs-open", "modal-open");

    if (!player.historyPushed) {
      try {
        history.pushState({ relicFs: 1 }, "");
        player.historyPushed = true;
      } catch (e) { /* ignore */ }
    }

    if (!player.videoQueue.length) {
      showNoClipsMessage(cabinKey);
      startSixMinuteTimer();
      showControlsTemporarily();
      return;
    }

    loadCurrentVideo();
    startSixMinuteTimer();
    showControlsTemporarily();
  }

  function startRelicTrainerSession(cabinKey, phase) {
    openRelicVideo(cabinKey, phase);
  }


  function wireVideoPlayer() {
    var viewport = fsEl("relic-fs-viewport");
    var closeBtn = fsEl("relic-fs-close");
    var prev = fsEl("btn-prev-ex");
    var next = fsEl("btn-next-ex");
    var playPause = fsEl("btn-play-pause");

    if (closeBtn) closeBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      closeFullscreenPlayer();
    });
    if (prev) prev.addEventListener("click", function (ev) {
      ev.stopPropagation();
      playPreviousVideo();
    });
    if (next) next.addEventListener("click", function (ev) {
      ev.stopPropagation();
      playNextVideo();
    });
    if (playPause) playPause.addEventListener("click", function (ev) {
      ev.stopPropagation();
      togglePlayPause();
    });

    if (viewport) {
      viewport.addEventListener("click", function (ev) {
        if (ev.target.closest(".relic-fs-ctrl") || ev.target.closest(".relic-fs-close")) return;
        showControlsTemporarily();
      });
      viewport.addEventListener("touchstart", function (ev) {
        if (ev.target.closest(".relic-fs-ctrl") || ev.target.closest(".relic-fs-close")) return;
        showControlsTemporarily();
      }, { passive: true });
    }

    var tbody = fsEl("tt-body");
    if (tbody) {
      tbody.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".doc-link[data-cabin]");
        if (!btn) return;
        ev.preventDefault();
        startRelicTrainerSession(
          btn.getAttribute("data-cabin"),
          btn.getAttribute("data-phase") || "Base"
        );
      });
    }

    document.addEventListener("keydown", function (ev) {
      var r = fsEl("relic-fullscreen-player");
      if (!r || r.hidden) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeFullscreenPlayer();
      } else if (ev.key === " " || ev.key === "k") {
        ev.preventDefault();
        togglePlayPause();
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        playNextVideo();
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        playPreviousVideo();
      }
    });

    window.addEventListener("popstate", function () {
      var r = fsEl("relic-fullscreen-player");
      if (r && !r.hidden) {
        /* Android back: close without a second history.back() */
        player.historyPushed = false;
        closeFullscreenPlayer();
      }
    });
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
    wireVideoPlayer();
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
          "TODAY <strong>" + lp.dateKey + "</strong> · " + lp.weekday;
      }
    }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("resize", fitScheduleToViewport);
  window.addEventListener("orientationchange", function () { setTimeout(fitScheduleToViewport, 120); });
})();
