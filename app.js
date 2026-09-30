/* Relic Architect V2.0 — timetable, Supabase completions, HTML5 cabin player.
   Playback is Supabase Storage only. Drive iframes, previews, and embeddedfolderview are refused.
   Completions upsert relic_completions. localStorage is not the source of truth.
   Schedule mode (full | upper) swaps the rotation and its own completion namespace.
   Full Body keeps the legacy bare YYYY-MM-DD key. Upper Body uses upper:YYYY-MM-DD.
   v14: each day has two trainer videos. tier is a bitmask (1 first, 2 second, 3 dual).
   Badge paint reads normalizeTier(tier) only. completed never invents a shield.
   Mode preference stays in memory.
   v15: viewYear 2026 is the Q4 bridge; 2027 is the year timetable.
   Month-row cache keys are year:mode:month. canTick locks future days from 1 Oct 2026
   and locks every 2027 day until 1 Jan 2027.
   v16: the CUE panel slides up from the bottom of the stage. A finished citation
   set closes the player and returns to the timetable. Week chips keep a single
   slot and a dual slot. Calisthenics is Q4 2027 only.
   v18: Food OS is four rooms behind the drawer. It does not write
   relic_completions, move the player timer, or open the CUE panel.
   v19: day ticks glow, cabin switches keep their scroll, weekly rows carry
   portions, and the Sainsbury’s list locks into localStorage only. */
(function () {
  "use strict";

  var S = window.RELIC_SCHEDULE;
  var C = window.RELIC_CITATIONS;
  var TZ = "Europe/London";
  var SET_DURATION_SEC = 1200;
  var SET_MODIFIER_MINUTES = [2, 5, 10, 20];

  /* Coach-only shorter set. Absent unless ?setsec=1..1200 is in the URL. */
  (function applySetSecondsOverride() {
    var match = /[?&]setsec=(\d{1,4})\b/.exec(location.search || "");
    if (!match) return;
    var seconds = +match[1];
    if (seconds >= 1 && seconds <= 1200) SET_DURATION_SEC = seconds;
  })();
  var HUD_IDLE_MS = 2000;
  var TAP_SLOP = 18;
  var PICK_GAP_MS = 320;
  var lastPickAt = 0;
  var hudGesture = null;
  var viewScroll = {};
  var surfacePress = null;
  var EMPTY_MSG = "No video file IDs mapped for this cabin.";
  var BRIDGE_LOCK_START = "2026-10-01";

  var MODE_LABEL = {
    full: "Full Body Trainer Schedules",
    upper: "Upper Body Trainer Schedules"
  };

  var state = {
    now: null,
    viewMonth: 1,
    viewWeek: 1,
    userPicked: false,
    coachOverride: null,
    videos: {},
    monthCache: {},
    viewYear: 2027,
    branch: "year",
    loaded: false,
    syncNote: "Loading completions",
    syncError: false,
    syncPending: 0,
    saveGen: {},
    mode: "full",
    foodRoom: "",
    hgPick: "",
    hgWindow: "2026-10",
    hgMonth: 10,
    hgYear: 2026,
    hgWeek: 1,
    foodGrid: null,
    foodPackAsk: "",
    foodLandCell: "",
    foodOffer: "",
    foodToast: "",
    foodToastUntil: 0,
    foodFlyError: "",
    smoothieRoom: "",
    smoothieFocusId: "",
    smoothieEditing: false,
    smoothiePick: "",
    smoothieWindow: "2026-10",
    smoothieMonth: 10,
    smoothieYear: 2026,
    smoothieWeek: 1,
    smoothieGrid: null,
    smoothiePackAsk: "",
    smoothieLandCell: "",
    smoothieOffer: "",
    smoothieFlyError: "",
    smoothieToast: "",
    smoothieToastUntil: 0,
    osDoor: "training",
    foodRefuse: "",
    foodUndo: null,
    foodFilter: "all",
    foodDrag: null,
    foodFocusId: "",
    foodFocusBand: "moderate",
    foodEditing: false,
    scanPreview: null,
    shopFilter: "all",
    basketDrafts: null,
    basketOpen: false
  };

  var player = {
    cabin: null,
    phase: null,
    clips: [],
    index: 0,
    remaining: SET_DURATION_SEC,
    timerId: null,
    paused: false,
    armed: false,
    empty: false,
    historyPushed: false,
    hudTimer: null,
    swallowChromeClick: false,
    flushToken: 0,
    flushFallback: null,
    wantsFlushFrame: false,
    awaitingReveal: false,
    credit: null
  };

  var SHIELD_SVG_OPEN = '<svg class="shield-tick" viewBox="0 0 24 28" aria-hidden="true" focusable="false">';
  var SHIELD_BODY = '<path fill="#ff8c00" stroke="#000" stroke-width="1.15" stroke-linejoin="round" d="M12 1.4 21 5v8.6c0 5.7-3.6 9.9-9 12.6-5.4-2.7-9-6.9-9-12.6V5l9-3.6z"/>';
  var SHIELD_ONE = '<path fill="none" stroke="#000" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.2 10.6 17.3 16.7 10.1"/>';
  var SHIELD_TWO = '<path fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M5.0 15.0 7.15 17.15 10.15 13.15"/><path fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M13.55 15.0 15.7 17.15 18.85 13.0"/>';

  function $(id) { return document.getElementById(id); }

  function londonParts(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });
    var map = {};
    fmt.formatToParts(date).forEach(function (part) { map[part.type] = part.value; });
    return {
      year: +map.year,
      month: +map.month,
      day: +map.day,
      weekday: map.weekday,
      dateKey: map.year + "-" + map.month + "-" + map.day
    };
  }

  function paintLondonClock() {
    var el = $("meta-clock");
    if (!el) return;
    var text = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(new Date());
    if (el.textContent !== text) el.textContent = text;
  }

  function parseModeOverride() {
    var match = /[?&]mode=(upper|full)\b/.exec(location.search || "");
    if (!match) return "full";
    return match[1] === "upper" ? "upper" : "full";
  }

  function upperSchedule() {
    return window.RELIC_UPPER_BODY || null;
  }

  function preconditionSchedule() {
    return window.RELIC_PRECONDITION || null;
  }

  /* Full Body bridge months come from RELIC_PRECONDITION.
     The 2027 year stays on RELIC_SCHEDULE. Upper Body stays on RELIC_UPPER_BODY. */
  function timetableSource(year) {
    if (viewingUpper()) return upperSchedule() || S;
    if (year === 2026 && preconditionSchedule()) return preconditionSchedule();
    return S;
  }

  function viewingUpper() {
    return state.mode === "upper" && !!upperSchedule();
  }

  function parseDateOverride() {
    var match = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(location.search || "");
    if (!match) return null;
    var bits = match[1].split("-");
    return new Date(Date.UTC(+bits[0], +bits[1] - 1, +bits[2], 12, 0, 0));
  }

  function getNow() {
    var override = parseDateOverride();
    if (override) {
      state.coachOverride = londonParts(override).dateKey;
      return override;
    }
    state.coachOverride = null;
    return new Date();
  }

  function isLive(parts) {
    return parts.dateKey >= S.LIVE_START;
  }

  /* Before 1 Oct 2026 every shown day can tick (practice).
     1 Oct 2026–31 Dec 2026: 2026 days on or before London today tick; later 2026 days
     and every 2027 day stay locked.
     From 1 Jan 2027: past and today tick; future days stay locked. */
  function canTick(dateKey, parts) {
    if (!dateKey || !parts || !parts.dateKey) return false;
    var today = parts.dateKey;
    if (today < BRIDGE_LOCK_START) return true;
    if (today < S.LIVE_START) {
      if (dateKey >= S.LIVE_START) return false;
      return dateKey <= today;
    }
    return dateKey <= today;
  }

  function syncBranch() {
    if (state.viewYear !== 2026 && state.viewYear !== 2027) state.viewYear = 2027;
    state.branch = state.viewYear === 2026 ? "bridge" : "year";
  }

  function periodMonths() {
    if (state.viewYear === 2026) return [10, 11, 12];
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  function monthCacheKey(year, mode, month) {
    return String(year) + ":" + (mode || "full") + ":" + String(month);
  }

  function clearClientCache() {
    state.monthCache = {};
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function supabaseCfg() {
    return window.RELIC_SUPABASE || {};
  }

  function restUrl(pathAndQuery) {
    var cfg = supabaseCfg();
    return String(cfg.url || "").replace(/\/$/, "") + pathAndQuery;
  }

  function restHeaders(extra) {
    var cfg = supabaseCfg();
    var headers = {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + cfg.anonKey
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) { headers[key] = extra[key]; });
    }
    return headers;
  }

  function paintSyncDot() {
    var dot = $("sync-dot");
    if (!dot) return;
    var busy = state.syncPending > 0;
    dot.classList.toggle("is-busy", busy);
    dot.classList.toggle("is-error", !!state.syncError && !busy);
    var label = busy ? "Syncing completions" : (state.syncError ? state.syncNote : "Synced");
    dot.setAttribute("aria-label", label);
    var text = $("sync-dot-text");
    if (text) text.textContent = label;
  }

  function beginSyncActivity() {
    state.syncPending += 1;
    paintSyncDot();
  }

  function endSyncActivity() {
    state.syncPending = Math.max(0, state.syncPending - 1);
    paintSyncDot();
  }

  function setSync(note, isError) {
    state.syncNote = note;
    state.syncError = !!isError;
    var el = $("sync-status");
    if (el) {
      el.classList.toggle("is-error", !!isError);
      if (isError) {
        el.hidden = false;
        el.textContent = note;
      } else {
        el.hidden = true;
        el.textContent = "";
      }
    }
    paintSyncDot();
  }

  /* Full Body history is the bare London date. Upper Body never writes that key.
     A full: prefix, if one appears, is read as Full Body and is not the write path. */
  function activeMode() {
    return viewingUpper() ? "upper" : "full";
  }

  function completionStorageKey(dateKey, mode) {
    var which = mode || activeMode();
    if (which === "upper") return "upper:" + dateKey;
    return dateKey;
  }

  function storageKeyFromRow(dateKey) {
    if (!dateKey) return "";
    var upperMatch = /^upper:(\d{4}-\d{2}-\d{2})$/.exec(dateKey);
    if (upperMatch) return "upper:" + upperMatch[1];
    var fullMatch = /^full:(\d{4}-\d{2}-\d{2})$/.exec(dateKey);
    if (fullMatch) return fullMatch[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
    return "";
  }

  /* Badge source of truth is the tier bitmask. completed is not a second store. */
  function normalizeTier(value) {
    return (Number(value) || 0) & 3;
  }

  function absorbCompletionRow(next, dateKey, completed, tier) {
    var storageKey = storageKeyFromRow(dateKey);
    if (!storageKey) return;
    var mask = normalizeTier(tier);
    if (!mask) return;
    next[storageKey] = mask;
  }

  function maskFor(dateKey, mode) {
    return state.videos[completionStorageKey(dateKey, mode)] || 0;
  }

  function popcount(mask) {
    var bits = mask & 3;
    return (bits & 1) + ((bits >> 1) & 1);
  }

  function displayTier(dateKey, mode) {
    return popcount(maskFor(dateKey, mode));
  }

  function shieldSvg(doubleTick) {
    var open = doubleTick
      ? SHIELD_SVG_OPEN.replace('class="shield-tick"', 'class="shield-tick is-dual"')
      : SHIELD_SVG_OPEN;
    var body = doubleTick ? SHIELD_BODY.replace("#ff8c00", "#3dff7a") : SHIELD_BODY;
    return open + body + (doubleTick ? SHIELD_TWO : SHIELD_ONE) + "</svg>";
  }

  function pullCompletions() {
    var cfg = supabaseCfg();
    if (!cfg.url || !cfg.anonKey) {
      state.loaded = true;
      setSync("Supabase config missing — ticks cannot sync.", true);
      return Promise.resolve();
    }
    beginSyncActivity();
    return fetch(restUrl("/rest/v1/relic_completions?select=date_key,completed,tier"), {
      headers: restHeaders()
    }).then(function (response) {
      if (!response.ok) throw new Error("load " + response.status);
      return response.json();
    }).then(function (rows) {
      var next = {};
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row) absorbCompletionRow(next, row.date_key, row.completed, row.tier);
        });
      }
      state.videos = next;
      state.loaded = true;
      setSync("Synced", false);
    }).catch(function () {
      state.loaded = true;
      setSync("Could not load relic_completions. Check the connection and try again.", true);
    }).then(function () {
      endSyncActivity();
    });
  }

  function upsertCompletion(storageKey, mask) {
    var cfg = supabaseCfg();
    if (!cfg.url || !cfg.anonKey) return Promise.resolve(null);
    var bits = normalizeTier(mask);
    return fetch(restUrl("/rest/v1/relic_completions?on_conflict=date_key"), {
      method: "POST",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      }),
      body: JSON.stringify({
        date_key: storageKey,
        completed: bits !== 0,
        tier: bits,
        updated_at: new Date().toISOString()
      })
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json().catch(function () { return null; }).then(function (payload) {
        var row = Array.isArray(payload) ? payload[0] : payload;
        if (row && row.tier !== undefined && row.tier !== null) return row;
        return { date_key: storageKey, tier: bits, completed: bits !== 0 };
      });
    }).catch(function () {
      return null;
    });
  }

  function applyReturnedCompletion(storageKey, row) {
    var key = storageKeyFromRow(row && row.date_key) || storageKey;
    var mask = normalizeTier(row ? row.tier : 0);
    if (mask) state.videos[key] = mask;
    else delete state.videos[key];
  }

  function saveMask(storageKey, mask, dateKey, restoreFocus) {
    var bits = normalizeTier(mask);
    var previous = state.videos[storageKey] || 0;
    if (bits) state.videos[storageKey] = bits;
    else delete state.videos[storageKey];
    state.restoreTickDate = restoreFocus ? dateKey : "";
    render();

    var gen = (state.saveGen[storageKey] || 0) + 1;
    state.saveGen[storageKey] = gen;
    beginSyncActivity();
    setSync("Saving " + dateKey + "…", false);
    upsertCompletion(storageKey, bits).then(function (row) {
      if (state.saveGen[storageKey] !== gen) return;
      if (!row) {
        if (previous) state.videos[storageKey] = previous;
        else delete state.videos[storageKey];
        setSync("Could not save " + dateKey + " to relic_completions.", true);
        state.restoreTickDate = "";
        render();
        return;
      }
      applyReturnedCompletion(storageKey, row);
      state.restoreTickDate = restoreFocus ? dateKey : "";
      render();
      setSync("Synced", false);
    }).then(function () {
      endSyncActivity();
    }, function () {
      endSyncActivity();
    });
  }

  function citationHref(cabinKey, phase) {
    var cabin = C && C.cabins && C.cabins[cabinKey];
    if (!cabin) return "";
    var entry = cabin[phase];
    if (!entry) entry = cabin.Base;
    return (entry && entry.url) ? entry.url : "";
  }

  function relicsHtml(day) {
    var phase = day.phase || "Base";
    var blocks = [];
    if (day.isRecovery) {
      blocks.push('<span class="doc-text">' + escapeHtml(day.doc1 || "Rest / Light Mobility") + "</span>");
      if (day.doc2) blocks.push('<span class="doc-text">' + escapeHtml(day.doc2) + "</span>");
    } else {
      if (day.pair) blocks.push('<span class="relic-pair">' + escapeHtml(day.pair) + "</span>");
      (day.cabins || []).forEach(function (cabinKey, index) {
        if (!cabinKey) return;
        var label = S.citationLabel(cabinKey, phase);
        var href = citationHref(cabinKey, phase);
        blocks.push(
          '<a class="cite-link' + (index === 0 ? " is-lead" : "") + '" data-cabin="' + escapeHtml(cabinKey) +
          '" data-phase="' + escapeHtml(phase) +
          '" data-date="' + escapeHtml(day.dateKey) +
          '" data-slot="' + (index === 1 ? "1" : "0") +
          '" href="' + escapeHtml(href || "#") +
          '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(label || (index === 0 ? day.doc1 : day.doc2) || "") +
          "</a>"
        );
      });
    }
    if (!blocks.length) blocks.push('<span class="doc-text">—</span>');
    return '<td class="relics-cell"><div class="relic-stack">' + blocks.join("") + "</div></td>";
  }

  function trainingDaysForMonth(month, year) {
    var y = year || state.viewYear || 2027;
    var mode = activeMode();
    if (!state.monthCache) state.monthCache = {};
    var key = monthCacheKey(y, mode, month);
    if (!state.monthCache[key]) {
      var source = timetableSource(y);
      var days = source.buildMonthDays(y, month).filter(function (day) {
        return !day.isRecovery && day.dayIndex < 6;
      });
      days.sort(function (a, b) {
        if (a.dateKey < b.dateKey) return -1;
        if (a.dateKey > b.dateKey) return 1;
        return 0;
      });
      state.monthCache[key] = days;
    }
    return state.monthCache[key];
  }

  function activeDaysForWeek(month, week) {
    return trainingDaysForMonth(month).filter(function (day) {
      return day.weekOfMonth === week;
    });
  }

  function activeDaysForView() {
    return activeDaysForWeek(state.viewMonth, state.viewWeek);
  }

  /* Mon–Sat only. Weeks 1–3 are days 1–7 / 8–14 / 15–21. Week 4 is the 22nd through month end.
     A period lights up only when every training day in it is dual-tier (both videos).
     Tick count is the number of finished trainer videos (0–2 per day). Sunday stays out. */

  function scoreDays(days) {
    var ticks = 0;
    var dualCount = 0;
    var singleCount = 0;
    var total = days ? days.length : 0;
    for (var i = 0; i < total; i++) {
      var tier = normalizeTier(maskFor(days[i].dateKey));
      var bits = popcount(tier);
      ticks += bits;
      if (bits >= 1) singleCount += 1;
      if (tier === 3) dualCount += 1;
    }
    return {
      total: total,
      fullDays: dualCount,
      dualCount: dualCount,
      firstSessions: singleCount,
      singleCount: singleCount,
      ticks: ticks,
      complete: total > 0 && dualCount === total
    };
  }

  function paintChip(btn, score) {
    var complete = !!score.complete;
    btn.classList.toggle("is-complete", complete);
    btn.classList.remove("is-golden");
    btn.setAttribute("data-tick-count", String(score.ticks));
    btn.setAttribute("data-full-days", String(score.fullDays));
    var badge = btn.querySelector(".shield-complete");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "shield-complete";
      badge.hidden = true;
      btn.appendChild(badge);
    }
    if (!complete) {
      badge.hidden = true;
      badge.innerHTML = "";
      return;
    }
    badge.hidden = false;
    badge.innerHTML = shieldSvg(true) +
      '<span class="shield-count">' + score.ticks + '<span class="sr-only"> ticks</span></span>';
  }

  /* SINGLE counts any day with at least one tier bit. DUAL counts tier === 3 only.
     The week chip is rich green only when every training day is tier 3. */
  function paintWeekChip(btn, score) {
    var total = score.total;
    var singleCount = score.singleCount;
    var dualCount = score.dualCount;
    var singleTarget = total > 0 && singleCount === total;
    var dualTarget = total > 0 && dualCount === total;
    btn.classList.toggle("is-complete", dualTarget);
    btn.classList.toggle("is-week-complete", dualTarget);
    btn.classList.remove("is-golden");
    btn.setAttribute("data-tick-count", String(score.ticks));
    btn.setAttribute("data-full-days", String(dualCount));
    btn.setAttribute("data-first-sessions", String(singleCount));
    var singleCountEl = btn.querySelector("[data-single-count]");
    var dualCountEl = btn.querySelector("[data-dual-count]");
    if (singleCountEl) singleCountEl.textContent = singleCount + "/" + total;
    if (dualCountEl) dualCountEl.textContent = dualCount + "/" + total;
    var singleSlot = btn.querySelector(".week-slot-single");
    if (singleSlot) {
      singleSlot.classList.toggle("is-started", singleCount > 0 && !singleTarget);
      singleSlot.classList.toggle("is-full", singleTarget);
      singleSlot.classList.toggle("is-target", singleTarget);
    }
    var singleBadge = btn.querySelector(".week-slot-single .shield-complete");
    if (!singleBadge && singleSlot) {
      singleBadge = document.createElement("span");
      singleBadge.className = "shield-complete";
      singleBadge.hidden = true;
      var singleRow = singleSlot.querySelector(".week-slot-single-row");
      if (singleRow) singleRow.insertBefore(singleBadge, singleRow.firstChild);
    }
    if (singleBadge) {
      if (!singleTarget) {
        singleBadge.hidden = true;
        singleBadge.innerHTML = "";
      } else {
        singleBadge.hidden = false;
        singleBadge.innerHTML = shieldSvg(false);
      }
    }
    var dualSlot = btn.querySelector(".week-slot-dual");
    if (dualSlot) {
      dualSlot.classList.toggle("is-started", dualCount > 0 && !dualTarget);
      dualSlot.classList.toggle("is-full", dualTarget);
      dualSlot.classList.toggle("is-target", dualTarget);
    }
    var badge = btn.querySelector(".week-slot-dual .shield-complete");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "shield-complete";
      badge.hidden = true;
      var row = btn.querySelector(".week-slot-dual-row");
      if (row) row.insertBefore(badge, row.firstChild);
    }
    if (!dualTarget) {
      badge.hidden = true;
      badge.innerHTML = "";
    } else {
      badge.hidden = false;
      badge.innerHTML = shieldSvg(true);
    }
    var week = btn.getAttribute("data-week") || "";
    btn.setAttribute("aria-label",
      "WEEK " + week +
      ", single sessions " + singleCount + " of " + total +
      ", dual " + dualCount + " of " + total +
      (dualTarget ? ", " + score.ticks + " ticks" : ""));
  }

  function paintYear(score) {
    var badge = $("year-badge");
    if (!badge) return;
    var label = String(state.viewYear || 2027);
    badge.setAttribute("data-tick-count", String(score.ticks));
    badge.setAttribute("data-year-complete", score.complete ? "true" : "false");
    badge.setAttribute("data-view-year", label);
    if (!score.complete) {
      badge.hidden = true;
      badge.classList.remove("is-complete");
      badge.innerHTML = "";
      return;
    }
    badge.hidden = false;
    badge.classList.add("is-complete");
    badge.innerHTML = shieldSvg(true) +
      '<span class="shield-count">' + score.ticks + '<span class="sr-only"> ticks</span></span>' +
      '<span class="year-badge-label">' + label + "</span>";
  }

  function applyPeriodMarks(viewedDays) {
    var months = periodMonths();
    var monthScores = {};
    var yearTicks = 0;
    var yearFull = 0;
    var yearTotal = 0;
    var monthsComplete = 0;
    for (var i = 0; i < months.length; i++) {
      var month = months[i];
      var score = scoreDays(trainingDaysForMonth(month));
      monthScores[month] = score;
      yearTicks += score.ticks;
      yearFull += score.fullDays;
      yearTotal += score.total;
      if (score.complete) monthsComplete += 1;
    }
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      var month = +btn.getAttribute("data-month");
      paintChip(btn, monthScores[month] || scoreDays([]));
    });
    document.querySelectorAll(".wtab").forEach(function (btn) {
      var week = +btn.getAttribute("data-week");
      var days = week === state.viewWeek ? viewedDays : activeDaysForWeek(state.viewMonth, week);
      paintWeekChip(btn, scoreDays(days));
    });
    var yearComplete = monthsComplete === months.length && yearTotal >= 6 && yearFull === yearTotal;
    paintYear({
      total: yearTotal,
      fullDays: yearFull,
      ticks: yearTicks,
      complete: yearComplete
    });
    var viewed = scoreDays(viewedDays);
    var card = $("relic-card");
    if (!card) return;
    var monthScore = monthScores[state.viewMonth];
    card.setAttribute("data-week-complete", viewed.complete ? "true" : "false");
    card.setAttribute("data-week-ticks", String(viewed.ticks));
    card.setAttribute("data-month-complete", monthScore && monthScore.complete ? "true" : "false");
    card.setAttribute("data-month-ticks", String(monthScore ? monthScore.ticks : 0));
    card.setAttribute("data-year-complete", yearComplete ? "true" : "false");
    card.setAttribute("data-year-ticks", String(yearTicks));
  }

  function tierLabel(dateKey, mask) {
    var bits = mask & 3;
    if (bits === 3) return "Both trainer videos done " + dateKey;
    if (bits === 1) return "First trainer video done " + dateKey;
    if (bits === 2) return "Second trainer video done " + dateKey;
    return "No trainer video done " + dateKey;
  }

  function doneHtml(day, parts) {
    if (!canTick(day.dateKey, parts)) {
      return '<td class="done-cell"><span class="lock-badge">LOCKED</span></td>';
    }
    var mask = normalizeTier(maskFor(day.dateKey));
    var tier = popcount(mask);
    var dayState = tier >= 2 ? "dual" : (tier === 1 ? "partial" : "empty");
    var checked = tier >= 2 ? "true" : (tier === 1 ? "mixed" : "false");
    var emblem = tier >= 2 ? shieldSvg(true) : (tier === 1 ? shieldSvg(false) : "");
    return (
      '<td class="done-cell"><button type="button" class="tick-hit is-' + dayState + '" data-date="' + day.dateKey +
      '" data-tier="' + tier + '" data-videos="' + mask +
      '" role="checkbox" aria-checked="' + checked +
      '" aria-label="' + tierLabel(day.dateKey, mask) + '">' +
      '<span class="tick-box" aria-hidden="true">' + emblem + "</span>" +
      "</button></td>"
    );
  }

  function foodShop() { return window.RELIC_FOOD_SHOP || null; }
  function foodMeals() { return window.RELIC_FOOD_MEALS || null; }
  function foodExtractions() { return window.RELIC_FOOD_EXTRACTIONS || null; }
  function foodSchedule() { return window.RELIC_FOOD_SCHEDULE || null; }

  var FOOD_TITLES = {
    meals: "Meal Recipe Cards",
    cabinet: "Main Meal Cabinet",
    hg: "Draft Food Schedule",
    final: "My 4-Week Food Timetable",
    savelater: "Save later",
    shop: "Monthly Shop",
    extractions: "Smoothie / Extraction Cards"
  };

  function magazineCardHtml(card) {
    var ingredients = card.ingredients.map(function (item) {
      return "<li>" + escapeHtml(item.text) + "</li>";
    }).join("");
    var method = card.method.map(function (step, index) {
      return '<li><span class="method-num" aria-hidden="true">' + (index + 1) +
        '</span><p><strong>' + escapeHtml(step.verb) + "</strong> " + escapeHtml(step.detail) + "</p></li>";
    }).join("");
    var kcal = card.macros.kcal === "—" || card.macros.kcal === "-" ? "—" : card.macros.kcal + " kcal";
    if (card.macros.basis) kcal += " · " + card.macros.basis;
    return (
      '<article class="recipe-card food-forensic" data-kind="' + escapeHtml(card.kind) + '">' +
        '<p class="recipe-kicker">' + (card.kind === "extraction" ? "SMOOTHIE / EXTRACTION" : (card.family ? String(card.family).toUpperCase() : "MEAL RECIPE")) + "</p>" +
        "<h3>" + escapeHtml(card.name) + "</h3>" +
        '<p class="food-quick"><span>' + escapeHtml(card.yield || "1") + '</span><span>' +
          (card.prepMin ? card.prepMin + " min" : "Prep") + "</span><span>" + escapeHtml(card.cookLabel || "Cook") + "</span></p>" +
        (card.scanImage ? '<img class="scan-photo" alt="Label photo" src="' + escapeHtml(card.scanImage) + '">' : "") +
        '<p class="recipe-tagline">' + escapeHtml(card.tagline) + "</p>" +
        '<p class="recipe-script">' + escapeHtml(card.script) + "</p>" +
        '<ul class="recipe-facts">' +
          "<li><span>Yield</span><strong>" + escapeHtml(card.yield) + "</strong></li>" +
          "<li><span>Prep</span><strong>" + card.prepMin + " min</strong></li>" +
          "<li><span>Cook</span><strong>" + escapeHtml(card.cookLabel) + "</strong></li>" +
          "<li><span>Cals</span><strong>" + escapeHtml(kcal) + "</strong></li>" +
          "<li><span>£ tier</span><strong>" + escapeHtml(card.tierFact) + "</strong></li>" +
        "</ul>" +
        (card.lock ? '<p class="recipe-lock">' + escapeHtml(card.lock) + "</p>" : "") +
        (card.sequence ? '<ol class="extract-sequence">' + card.sequence.map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        }).join("") + "</ol>" : "") +
        '<div class="food-body">' +
          '<div class="food-col"><h4>Ingredients</h4><ul class="recipe-ingredients">' + ingredients + "</ul></div>" +
          '<div class="food-col"><h4>Method</h4><ol class="recipe-method">' + method + "</ol></div>" +
        "</div>" +
        '<section class="recipe-weekbox">' +
          "<h4>Weekly Timetable</h4>" +
          "<p><strong>Best for</strong> " + escapeHtml(card.timetable.bestFor) + "</p>" +
          "<p><strong>Best eaten</strong> " + escapeHtml(card.timetable.bestEaten) + "</p>" +
          "<p><strong>Reheat</strong> " + escapeHtml(card.timetable.reheat) + "</p>" +
        "</section>" +
        '<p class="recipe-tip">Tip: ' + escapeHtml(card.tip) + "</p>" +
        citationsBlockHtml(card) +
      "</article>"
    );
  }

  var FOOD_STORE_KEY = "relic_food_shop_v19";

  function foodMonthKey(year, month) {
    var m = +month;
    return (+year) + "-" + (m < 10 ? "0" : "") + m;
  }

  function readFoodStore() {
    try {
      var raw = localStorage.getItem(FOOD_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeFoodStore(store) {
    try { localStorage.setItem(FOOD_STORE_KEY, JSON.stringify(store)); } catch (err) { /* private mode */ }
  }

  var FOOD_CARDS_KEY = "relic_food_cards_v20";
  var FOOD_WEEK_KEY = "relic_food_week_v20";

  function readJsonStore(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeJsonStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
  }

  function readCardStore() {
    var store = readJsonStore(FOOD_CARDS_KEY);
    store.meals = store.meals || {};
    store.extractions = store.extractions || {};
    store.hiddenMeals = store.hiddenMeals || [];
    store.hiddenExtractions = store.hiddenExtractions || [];
    return store;
  }

  function readWeekNotes() {
    return readJsonStore(FOOD_WEEK_KEY);
  }

  function weekNote(dateKey) {
    var notes = readWeekNotes();
    return notes[dateKey] || null;
  }

  function saveWeekNote(dateKey, patch) {
    var notes = readWeekNotes();
    var row = notes[dateKey] || {};
    Object.keys(patch).forEach(function (key) {
      var value = patch[key];
      var empty = value == null || value === "" || (Array.isArray(value) && !value.length);
      if (empty) delete row[key];
      else row[key] = value;
    });
    if (Object.keys(row).length) notes[dateKey] = row;
    else delete notes[dateKey];
    writeJsonStore(FOOD_WEEK_KEY, notes);
  }

  function linesOf(text) {
    return String(text || "").split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function methodFromLines(text) {
    return linesOf(text).map(function (line) {
      var parts = line.split(/\s+/);
      return { verb: parts.shift() || "Do", detail: parts.join(" ") };
    });
  }

  function methodToText(method) {
    return (method || []).map(function (step) {
      return (step.verb ? step.verb + " " : "") + (step.detail || "");
    }).join("\n");
  }

  function ingredientsToText(items) {
    return (items || []).map(function (item) { return item.text || ""; }).join("\n");
  }

  var SHOP_TAG_ORDER = ["protein", "veg", "fruit", "dairy", "freezer", "botanical", "other"];
  var SHOP_TAGS = {
    chicken: "protein", turkey: "protein", beef10: "protein", beef5: "protein",
    salmonFrozen: "protein", salmonFresh: "protein", salmonWaitrose: "protein",
    eggsPasture: "protein", eggsSo: "protein", eggsOmega: "protein", tuna: "protein",
    carrots: "veg", cabbage: "veg", mushrooms: "veg", garlic: "veg", onion: "veg",
    spinachFresh: "veg", tenderstem: "veg", lettuce: "veg", ginger: "veg",
    avocado: "fruit", lemons: "fruit", berries: "fruit", berriesW: "fruit",
    banana: "fruit", apples: "fruit", kiwi: "fruit", oranges: "fruit", pears: "fruit", pineapple: "fruit",
    cheddar: "dairy", cheddarPremium: "dairy", mozzarella: "dairy", butter: "dairy",
    milk: "dairy", yogurt: "dairy", yogurtW: "dairy", kefir: "dairy",
    fruit: "freezer", spinachF: "freezer", broccoliF: "freezer", peas: "freezer",
    mixedVeg: "freezer", greenBeans: "freezer", mango: "freezer", cherries: "freezer",
    ashwagandha: "botanical", lionsMane: "botanical", spirulina: "botanical", psyllium: "botanical",
    shilajit: "botanical", hemp: "botanical"
  };

  function normalizeTag(tag) {
    var value = String(tag || "").toLowerCase();
    return SHOP_TAG_ORDER.indexOf(value) === -1 ? "" : value;
  }

  function shopTag(item) {
    var chosen = normalizeTag(item && item.tag);
    if (chosen) return chosen;
    return SHOP_TAGS[item && item.skuId] || "other";
  }

  function tagSelectHtml(selected, attrs, allowEmpty) {
    var current = normalizeTag(selected) || (allowEmpty ? "" : "other");
    var tags = allowEmpty ? [""].concat(SHOP_TAG_ORDER) : SHOP_TAG_ORDER;
    return "<select " + attrs + ">" + tags.map(function (tag) {
      return '<option value="' + tag + '"' + (tag === current ? " selected" : "") + ">" + (tag || "none") + "</option>";
    }).join("") + "</select>";
  }

  function normalizeCitations(list) {
    var rows = list;
    if (typeof rows === "string") rows = rows.split("\n");
    if (!Array.isArray(rows)) return [];
    return rows.map(function (item) {
      if (typeof item === "string") return item.trim();
      if (item && item.text) return String(item.text).trim();
      return "";
    }).filter(Boolean);
  }

  function citationsToText(list) {
    return normalizeCitations(list).join("\n");
  }

  function derivedCitations(card) {
    var found = normalizeCitations(card && card.citations);
    if (found.length) return found;
    found = [];
    ((card && card.ingredients) || []).forEach(function (item) {
      var text = (item && item.text) || "";
      if (/Sainsbury|Waitrose/i.test(text) && found.indexOf(text) === -1) found.push(text);
    });
    var blob = [(card && card.tip) || "", (card && card.tagline) || "", (card && card.script) || ""].join(" ");
    if (/FOOD_LIVE/.test(blob) && found.indexOf("FOOD_LIVE") === -1) found.push("FOOD_LIVE");
    if (card && card.seed && found.indexOf("Drive recipe card") === -1) found.push("Drive recipe card");
    return found;
  }

  function carriedCitations(card) {
    var lines = derivedCitations(card);
    if (lines.length) return lines;
    ((card && card.ingredients) || []).forEach(function (item) {
      var text = (item && item.text) || "";
      if (text && lines.indexOf(text) === -1) lines.push(text);
    });
    if (!lines.length) lines.push(card && card.scanImage ? "Label photo" : "FOOD_LIVE");
    return lines;
  }

  function citationsBlockHtml(card) {
    var lines = derivedCitations(card);
    if (!lines.length) lines = carriedCitations(card);
    if (!lines.length) return "";
    return '<h4>Citations</h4><ul class="recipe-citations">' +
      lines.map(function (line) { return "<li>" + escapeHtml(line) + "</li>"; }).join("") +
      "</ul>";
  }

  function importKindRoom(data) {
    var kind = String((data && data.kind) || "").toLowerCase();
    if (kind === "smoothie" || kind === "extraction") return "extractions";
    if (kind === "meal") return "meals";
    if (kind === "shop") return "shop";
    if (kind === "weekday" || kind === "week" || kind === "week-day") return "weekly";
    return "";
  }

  function shopItemLabel(item) {
    if (!item) return "";
    if (item.label || item.customName) return item.label || item.customName;
    var api = foodShop();
    var entry = api && item.skuId && api.skus[item.skuId];
    return entry ? entry.name : (item.skuId || "");
  }

  function shopItemCitations(item) {
    var lines = normalizeCitations(item && item.citations);
    if (lines.length) return lines;
    var label = shopItemLabel(item);
    return label ? [label] : ["FOOD_LIVE"];
  }

  function overlayCard(card, overlay) {
    var next = {};
    Object.keys(card).forEach(function (key) { next[key] = card[key]; });
    ["name", "tagline", "script", "tip"].forEach(function (key) {
      if (overlay[key]) next[key] = overlay[key];
    });
    if (overlay.ingredients && overlay.ingredients.length) next.ingredients = overlay.ingredients;
    if (overlay.method && overlay.method.length) next.method = overlay.method;
    if (overlay.scanImage) next.scanImage = overlay.scanImage;
    if (overlay.citations && overlay.citations.length) next.citations = overlay.citations;
    if (overlay.tag) next.tag = overlay.tag;
    return next;
  }

  function customCardView(raw, kind) {
    return {
      id: raw.id,
      kind: kind,
      name: raw.name || "Untitled",
      tagline: raw.tagline || "",
      script: raw.script || "Your card.",
      yield: raw.yield || "1",
      prepMin: raw.prepMin || 10,
      cookLabel: raw.cookLabel || "Your method",
      tierFact: "Your card",
      macros: raw.macros || { kcal: "—", basis: "your portion" },
      lock: kind === "extraction" ? "Not dinner." : "",
      sequence: kind === "extraction" ? ["Your blend"] : null,
      ingredients: raw.ingredients && raw.ingredients.length ? raw.ingredients : [{ text: "Add an ingredient" }],
      method: raw.method && raw.method.length ? raw.method : [{ verb: "Cook", detail: "until done" }],
      timetable: raw.timetable || { bestFor: "Your plan", bestEaten: "Fresh", reheat: "Heat until hot" },
      tip: raw.tip || "",
      scanImage: raw.scanImage || "",
      citations: normalizeCitations(raw.citations),
      tag: normalizeTag(raw.tag)
    };
  }

  function packApi() {
    return window.RELIC_FOOD_PACK001 || null;
  }

  function presentPack(record) {
    if (!record) return null;
    var kind = record.kind === "extraction" ? "extraction" : (record.kind === "collection" ? "collection" : "meal");
    return {
      id: record.id,
      kind: kind,
      name: record.name,
      tagline: record.tagline || "",
      script: record.script || "",
      yield: record.yield || "",
      prepMin: record.prepMin || 0,
      cookLabel: record.cookLabel || "",
      protein: record.protein || "",
      carb: record.carb || "",
      timetable: record.timetable || { bestFor: "", bestEaten: "Fresh", reheat: "" },
      tip: record.tip || "",
      macros: record.macros || { kcal: "—", basis: "Pack 001" },
      ingredients: record.ingredients || [],
      method: record.method || [],
      lock: record.lock || (kind === "extraction" ? "Not dinner." : ""),
      tierFact: record.tierFact || "Pack 001",
      family: record.family || kind,
      blockedWithoutAdds: !!record.blockedWithoutAdds,
      cookEggWhites: !!record.cookEggWhites,
      visualOnly: !!record.visualOnly,
      childCardIds: record.childCardIds || null,
      pack001: true,
      seed: true,
      citations: normalizeCitations(record.citations)
    };
  }

  function cardView(kind, id, tierId) {
    var store = readCardStore();
    var bucket = kind === "extraction" ? store.extractions : store.meals;
    var overlay = bucket[id];
    var api = kind === "extraction" ? foodExtractions() : foodMeals();
    var base = null;
    if (api && api.present) {
      if (kind === "extraction" && api.cards && api.cards[id]) base = api.present(id, tierId || 1);
      if (kind !== "extraction" && api.meals && api.meals[id]) base = api.present(id, tierId || 1);
    }
    if (!base) {
      var pack = packApi();
      var seeded = null;
      if (pack && kind === "extraction") seeded = pack.extractions[id];
      else if (pack && kind === "collection") seeded = pack.collections[id];
      else if (pack) seeded = pack.meals[id];
      if (seeded) base = presentPack(seeded);
    }
    if (overlay && overlay.custom) return customCardView(overlay, kind);
    if (base && overlay) return overlayCard(base, overlay);
    return base;
  }

  function idsForKind(kind) {
    var store = readCardStore();
    var api = kind === "extraction" ? foodExtractions() : foodMeals();
    var hidden = kind === "extraction" ? store.hiddenExtractions : store.hiddenMeals;
    var bucket = kind === "extraction" ? store.extractions : store.meals;
    var ids = (api && api.order ? api.order : []).filter(function (id) {
      return hidden.indexOf(id) === -1;
    });
    var pack = packApi();
    var seeded = pack ? (kind === "extraction" ? pack.extractions : pack.meals) : null;
    if (seeded) {
      Object.keys(seeded).forEach(function (id) {
        if (hidden.indexOf(id) === -1 && ids.indexOf(id) === -1) ids.push(id);
      });
    }
    Object.keys(bucket).forEach(function (id) {
      if (bucket[id] && bucket[id].custom && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  function saveCardRecord(kind, id, record) {
    var store = readCardStore();
    var bucketName = kind === "extraction" ? "extractions" : "meals";
    store[bucketName][id] = record;
    writeJsonStore(FOOD_CARDS_KEY, store);
  }

  function newCardId() {
    return "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function foodToolsHtml(room) {
    return "";
  }

  function roomExport(room) {
    if (room === "shop") {
      var shopDraft = draftFor(state.viewYear, state.viewMonth, true);
      var shopCopy = JSON.parse(JSON.stringify(shopDraft || { items: [] }));
      (shopCopy.items || []).forEach(function (item) {
        item.citations = shopItemCitations(item);
        item.tag = shopTag(item);
      });
      return {
        room: "shop",
        build: "v20",
        month: foodMonthKey(state.viewYear, state.viewMonth),
        draft: shopCopy
      };
    }
    if (room === "weekly") return { room: "weekly", build: "v20", notes: readWeekNotes() };
    var store = readCardStore();
    if (room === "extractions") {
      return { room: "extractions", build: "v20", cards: store.extractions, hidden: store.hiddenExtractions };
    }
    return { room: "meals", build: "v20", cards: store.meals, hidden: store.hiddenMeals };
  }

  function fillFoodJson(room) {
    var box = $("food-json-" + room);
    if (!box) return;
    box.value = JSON.stringify(roomExport(room), null, 2);
    try { box.focus(); box.select(); } catch (err) { /* selection is optional */ }
  }

  function importFoodJson(room) {
    var box = $("food-json-" + room);
    var text = box ? box.value.trim() : "";
    if (!text) {
      state.scanPreview = { room: room, error: "Paste JSON first." };
      render();
      return;
    }
    if (looksLikeZip(text)) {
      state.scanPreview = { room: room, error: "Import accepts a JSON object, not a ZIP." };
      render();
      return;
    }
    if (text.charAt(0) === "[") {
      state.scanPreview = { room: room, error: "Import accepts a JSON object, not a list." };
      render();
      return;
    }
    try {
      state.scanPreview = previewFromJson(JSON.parse(text), room);
    } catch (err) {
      state.scanPreview = { room: room, error: "That paste is not JSON yet." };
    }
    render();
  }

  function resetFoodRoom(room) {
    state.foodJsonHold = JSON.stringify(roomExport(room), null, 2);
    if (room === "weekly") writeJsonStore(FOOD_WEEK_KEY, {});
    else if (room === "shop") {
      var store = readFoodStore();
      delete store[foodMonthKey(state.viewYear, state.viewMonth)];
      writeFoodStore(store);
    } else {
      var cards = readCardStore();
      if (room === "extractions") {
        cards.extractions = {};
        cards.hiddenExtractions = [];
      } else {
        cards.meals = {};
        cards.hiddenMeals = [];
      }
      writeJsonStore(FOOD_CARDS_KEY, cards);
    }
    state.foodEditing = false;
    state.scanPreview = null;
    render();
  }

  function scanStripHtml(room) {
    return "";
  }

  function photoMarker(url) {
    if (!url) return "";
    if (url.length < 96) return url;
    return url.slice(0, 48) + "…[label photo attached]";
  }

  function normalizeIngredients(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) { return ingredientRecord(item); }).filter(function (item) { return item.text || item.skuId; });
  }

  function normalizeMethod(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (step) { return methodRecord(step); }).filter(function (step) { return step.verb || step.detail; });
  }

  var CARD_FORWARD = ["macros", "tags", "timetable", "band", "lock", "provenance", "citations", "tag", "script", "sequence", "yield", "prepMin", "cookLabel", "protein", "carb"];

  function looksLikeZip(text, name) {
    if (name && /\.zip$/i.test(name)) return true;
    var raw = String(text || "");
    return raw.charCodeAt(0) === 80 && raw.charCodeAt(1) === 75 && raw.charCodeAt(2) === 3 && raw.charCodeAt(3) === 4;
  }

  function runtimeKind(kind) {
    var value = String(kind || "").toLowerCase();
    if (value === "smoothie" || value === "extraction") return "extraction";
    if (value === "meal") return "meal";
    return "";
  }

  function copyForward(target, source, overwrite) {
    if (!source) return target;
    CARD_FORWARD.forEach(function (key) {
      if (key === "citations" || key === "tag") return;
      var value = source[key];
      if (value == null || value === "") return;
      if (Array.isArray(value) && !value.length) return;
      if (!overwrite) {
        var current = target[key];
        if (current != null && current !== "" && !(Array.isArray(current) && !current.length)) return;
      }
      target[key] = value;
    });
    return target;
  }

  function ingredientRecord(item, prior) {
    var text = typeof item === "string" ? item : ((item && item.text) || "");
    var row = { text: text };
    var source = item && typeof item === "object" ? item : null;
    if (source) {
      Object.keys(source).forEach(function (key) {
        if (key === "text") return;
        if (source[key] != null && source[key] !== "") row[key] = source[key];
      });
    }
    if (!row.skuId && prior && prior.skuId && prior.text === text) row.skuId = prior.skuId;
    return row;
  }

  function methodRecord(step, prior) {
    var base = typeof step === "string"
      ? (methodFromLines(step)[0] || { verb: "Do", detail: step })
      : { verb: (step && step.verb) || "", detail: (step && step.detail) || "" };
    if (prior && prior.verb === base.verb && prior.detail === base.detail) {
      Object.keys(prior).forEach(function (key) {
        if (key === "verb" || key === "detail") return;
        if (prior[key] != null && prior[key] !== "") base[key] = prior[key];
      });
    }
    if (step && typeof step === "object") {
      Object.keys(step).forEach(function (key) {
        if (key === "verb" || key === "detail") return;
        if (step[key] != null && step[key] !== "") base[key] = step[key];
      });
    }
    return base;
  }

  function overlayRecord(data, kind, existing) {
    var source = data || {};
    var prior = existing || {};
    var ingredients = (source.ingredients || []).map(function (item, index) {
      return ingredientRecord(item, (prior.ingredients || [])[index]);
    }).filter(function (row) { return row.text || row.skuId; });
    var method = (source.method || []).map(function (step, index) {
      return methodRecord(step, (prior.method || [])[index]);
    }).filter(function (step) { return step.verb || step.detail; });
    var record = {
      id: source.id || prior.id || newCardId(),
      name: source.name || "",
      tagline: source.tagline || "",
      ingredients: ingredients,
      method: method,
      tip: source.tip || "",
      scanImage: typeof source.scanImage === "string" ? source.scanImage : (prior.scanImage || "")
    };
    if (source.custom || prior.custom) record.custom = true;
    var storedKind = runtimeKind(source.kind || prior.kind || kind || "");
    if (storedKind) record.kind = storedKind;
    copyForward(record, prior, false);
    copyForward(record, source, true);
    if (Object.prototype.hasOwnProperty.call(source, "citations")) {
      var cites = normalizeCitations(source.citations);
      if (cites.length) record.citations = cites;
      else delete record.citations;
    } else if (prior.citations) {
      var keptCites = normalizeCitations(prior.citations);
      if (keptCites.length) record.citations = keptCites;
    }
    if (Object.prototype.hasOwnProperty.call(source, "tag")) {
      var tag = normalizeTag(source.tag);
      if (tag) record.tag = tag;
      else delete record.tag;
    } else {
      var keptTag = normalizeTag(prior.tag);
      if (keptTag) record.tag = keptTag;
    }
    return record;
  }

  function weekNoteRecord(note) {
    if (!note || typeof note !== "object" || Array.isArray(note)) return null;
    var next = {};
    ["lunch", "mealId", "note", "evening", "extractionId", "morning", "snack"].forEach(function (key) {
      if (note[key]) next[key] = note[key];
    });
    if (note.pinned) next.pinned = true;
    if (note.cleared) next.cleared = true;
    var cites = normalizeCitations(note.citations);
    if (cites.length) next.citations = cites;
    return Object.keys(next).length ? next : null;
  }

  function cardFromRecord(data, kind) {
    var runtime = runtimeKind(data && data.kind) || runtimeKind(kind) || "meal";
    var record = overlayRecord(data, runtime, data);
    record.custom = true;
    record.kind = runtime;
    if (!record.ingredients.length) record.ingredients = [{ text: "" }];
    if (!record.method.length) record.method = [{ verb: "", detail: "" }];
    return record;
  }

  function shopLinesFromText(text) {
    var chunks = String(text || "").split(/\n|;/).map(function (line) {
      return line.replace(/^[-*•]\s+/, "").replace(/^\d+[\.\)]\s+/, "").trim();
    }).filter(Boolean);
    if (chunks.length === 1 && chunks[0].indexOf(",") !== -1) {
      chunks = chunks[0].split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    }
    return chunks.map(function (name) {
      return { customName: name, qty: 1, ticked: true, pricePence: 0, tag: "other", citations: [name] };
    });
  }

  function sectionName(line) {
    var head = String(line || "").toLowerCase().replace(/:$/, "").trim();
    if (head === "ingredients" || head.indexOf("ingredient") === 0) return "ingredients";
    if (head === "method" || head === "steps" || head === "instructions" || head === "directions") return "method";
    if (head === "tip" || head === "tips" || head === "note" || head === "notes") return "tip";
    if (head === "citations" || head === "citation" || head === "sources") return "citations";
    return "";
  }

  function parseFreeform(text, room) {
    var raw = String(text || "").trim();
    if (!raw) return { room: room, error: "Paste a note first." };
    if (looksLikeZip(raw)) return { room: room, error: "Import accepts a JSON object, not a ZIP." };
    if (raw.charAt(0) === "[") return { room: room, error: "Import accepts a JSON object, not a list." };
    if (raw.charAt(0) === "{") {
      try { return previewFromJson(JSON.parse(raw), room); }
      catch (err) { return { room: room, error: "That paste is not JSON yet." }; }
    }
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft && draft.locked) return { room: room, error: "Unlock this month’s shop before importing a list." };
      var lines = shopLinesFromText(raw);
      if (!lines.length) return { room: room, error: "No shop lines in that paste." };
      return { room: room, mode: "shop", lines: lines };
    }
    if (room !== "meals" && room !== "extractions") {
      return { room: room, error: "Open Meal cards, Smoothie cards, or the shop to scan a note." };
    }
    var name = "";
    var tagline = "";
    var tip = "";
    var ingredients = [];
    var method = [];
    var citations = [];
    var section = "";
    raw.split("\n").forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var bare = trimmed.replace(/^[-*•]\s+/, "").replace(/^\*\*/, "").replace(/\*\*$/, "").replace(/^#+\s*/, "").trim();
      var headed = sectionName(bare);
      if (headed) { section = headed; return; }
      if (/^tip\s*:/i.test(bare)) {
        tip = bare.replace(/^tip\s*:/i, "").trim();
        section = "tip";
        return;
      }
      if (/^cite\s*:/i.test(bare) || section === "citations") {
        citations.push(bare.replace(/^cite\s*:/i, "").trim());
        section = "citations";
        return;
      }
      if (!name) { name = bare; return; }
      if (section === "tip") { tip = tip ? tip + " " + bare : bare; return; }
      if (section === "method" || /^\d+[\.\)]\s+/.test(trimmed)) {
        method.push(bare.replace(/^\d+[\.\)]\s+/, ""));
        return;
      }
      if (section === "ingredients" || /^[-*•]\s+/.test(trimmed)) {
        ingredients.push(bare);
        return;
      }
      if (!tagline && !section) { tagline = bare; return; }
      ingredients.push(bare);
    });
    var kind = room === "extractions" ? "extraction" : "meal";
    return {
      room: room,
      mode: "card",
      card: cardFromRecord({
        name: name || (kind === "extraction" ? "Scanned smoothie" : "Scanned meal"),
        tagline: tagline,
        ingredients: ingredients,
        method: method,
        tip: tip,
        citations: citations
      }, kind)
    };
  }

  function previewFromJson(data, room) {
    if (Array.isArray(data) || !data || typeof data !== "object") {
      return { room: room, error: "Import accepts a JSON object, not a list." };
    }
    var kindRoom = importKindRoom(data);
    if ((data.room && data.room !== room) || (kindRoom && kindRoom !== room)) {
      return { room: room, error: "That JSON belongs to the " + (data.room || kindRoom) + " room." };
    }
    if (room === "weekly") {
      if (kindRoom === "weekly" || (data.dateKey && !data.notes)) {
        if (!data.dateKey) return { room: room, error: "A week day needs a dateKey." };
        var dayNote = weekNoteRecord(data);
        if (!dayNote) return { room: room, error: "Weekly JSON needs lunch, mealId, or note." };
        var dayNotes = {};
        dayNotes[data.dateKey] = dayNote;
        return { room: room, mode: "notes", module: { notes: dayNotes } };
      }
      if (!data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) {
        return { room: room, error: "Weekly JSON needs a notes object." };
      }
      var notes = {};
      Object.keys(data.notes).forEach(function (key) {
        var next = weekNoteRecord(data.notes[key]);
        if (next) notes[key] = next;
      });
      return { room: room, mode: "notes", module: { notes: notes } };
    }
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft && draft.locked) return { room: room, error: "Unlock this month’s shop before importing a list." };
      var items = data.draft && Array.isArray(data.draft.items) ? data.draft.items : (Array.isArray(data.items) ? data.items : (Array.isArray(data.lines) ? data.lines : null));
      if (!items) return { room: room, error: "Shop JSON needs a list of lines." };
      return { room: room, mode: "module", module: data };
    }
    if (data.cards && typeof data.cards === "object" && !Array.isArray(data.cards)) {
      return { room: room, mode: "module", module: data };
    }
    if (data.name) {
      var cardKind = runtimeKind(data.kind) || (room === "extractions" || kindRoom === "extractions" ? "extraction" : "meal");
      return { room: room, mode: "card", card: cardFromRecord(data, cardKind) };
    }
    return { room: room, error: "That JSON has no card." };
  }

  function previewFromPhoto(dataUrl, room, note) {
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft && draft.locked) return { room: room, error: "Unlock this month’s shop before importing a list." };
      return {
        room: room,
        mode: "shop",
        scanImage: dataUrl || "",
        note: note || "attach label photo; fill fields",
        lines: [{ customName: "", qty: 1, ticked: true, pricePence: 0 }]
      };
    }
    if (room !== "meals" && room !== "extractions") {
      return { room: room, error: "Open Meal cards or Smoothie cards to attach a label photo." };
    }
    var kind = room === "extractions" ? "extraction" : "meal";
    return {
      room: room,
      mode: "photo",
      note: note || "attach label photo; fill fields",
      card: cardFromRecord({
        name: "",
        tagline: "attach label photo; fill fields",
        ingredients: [],
        method: [],
        tip: "",
        scanImage: dataUrl || ""
      }, kind)
    };
  }

  function scanExport(preview) {
    if (!preview) return {};
    if (preview.mode === "card" || preview.mode === "photo") {
      var card = preview.card || {};
      var exported = {
        id: card.id,
        name: card.name,
        tagline: card.tagline,
        ingredients: card.ingredients,
        method: card.method,
        tip: card.tip,
        scanImage: photoMarker(card.scanImage)
      };
      if (card.kind) exported.kind = card.kind;
      copyForward(exported, card, false);
      if (card.citations && card.citations.length) exported.citations = card.citations;
      if (card.tag) exported.tag = card.tag;
      return exported;
    }
    if (preview.mode === "shop") {
      return { room: "shop", lines: preview.lines || [], scanImage: photoMarker(preview.scanImage) };
    }
    return preview.module || {};
  }

  function scanPreviewHtml(room) {
    var preview = state.scanPreview;
    if (!preview || preview.room !== room) return "";
    if (preview.error) {
      return '<section class="scan-preview" aria-label="Scan preview">' +
        "<h3>Preview</h3><p>" + escapeHtml(preview.error) + "</p>" +
        '<button type="button" data-scan-action="cancel">Cancel</button></section>';
    }
    var note = preview.note || ((preview.mode === "module" || preview.mode === "notes")
      ? "Edit the JSON, then save. Cancel discards this draft."
      : "Edit the fields, then save. Cancel discards this draft.");
    var json = escapeHtml(JSON.stringify(scanExport(preview), null, 2));
    if (preview.mode === "card" || preview.mode === "photo") {
      var card = preview.card;
      return '<section class="scan-preview" aria-label="Scan preview">' +
        "<h3>Preview</h3>" +
        (card.scanImage ? '<img class="scan-photo" alt="Label photo" src="' + escapeHtml(card.scanImage) + '">' : "") +
        '<p class="scan-note">' + escapeHtml(note) + "</p>" +
        '<label>Name <input data-scan-field="name" value="' + escapeHtml(card.name) + '"></label>' +
        '<label>Tagline <input data-scan-field="tagline" value="' + escapeHtml(card.tagline) + '"></label>' +
        '<label>Ingredients, one line each <textarea data-scan-field="ingredients" rows="5">' +
          escapeHtml(ingredientsToText(card.ingredients)) + "</textarea></label>" +
        '<label>Method, one step each line <textarea data-scan-field="method" rows="5">' +
          escapeHtml(methodToText(card.method)) + "</textarea></label>" +
        '<label>Tip <textarea data-scan-field="tip" rows="3">' + escapeHtml(card.tip) + "</textarea></label>" +
        "<label>Category " + tagSelectHtml(card.tag, 'data-scan-field="tag"', true) + "</label>" +
        '<label>Citations, one line each <textarea data-scan-field="citations" rows="4">' +
          escapeHtml(citationsToText(card.citations)) + "</textarea></label>" +
        '<pre class="scan-json">' + json + "</pre>" +
        '<button type="button" data-scan-action="save">Save</button>' +
        '<button type="button" data-scan-action="cancel">Cancel</button>' +
        "</section>";
    }
    if (preview.mode === "shop") {
      var fields = (preview.lines || []).map(function (line, index) {
        return "<label>Line " + (index + 1) +
          '<input data-scan-line="' + index + '" value="' + escapeHtml(line.customName || line.label || "") + '"></label>' +
          "<label>Category " + tagSelectHtml(line.tag, 'data-scan-tag="' + index + '"') + "</label>" +
          '<label>Citations <textarea data-scan-cites="' + index + '" rows="2">' +
            escapeHtml(citationsToText(line.citations)) + "</textarea></label>";
      }).join("");
      return '<section class="scan-preview" aria-label="Scan preview">' +
        "<h3>Preview</h3>" +
        (preview.scanImage ? '<img class="scan-photo" alt="Label photo" src="' + escapeHtml(preview.scanImage) + '">' : "") +
        '<p class="scan-note">' + escapeHtml(note) + "</p>" +
        fields +
        '<pre class="scan-json">' + json + "</pre>" +
        '<button type="button" data-scan-action="save">Save</button>' +
        '<button type="button" data-scan-action="cancel">Cancel</button>' +
        "</section>";
    }
    return '<section class="scan-preview" aria-label="Scan preview">' +
      "<h3>Preview</h3>" +
      '<p class="scan-note">' + escapeHtml(note) + "</p>" +
      '<textarea data-scan-field="module" rows="10">' + json + "</textarea>" +
      '<button type="button" data-scan-action="save">Save</button>' +
      '<button type="button" data-scan-action="cancel">Cancel</button>' +
      "</section>";
  }

  function readScanForm() {
    var preview = state.scanPreview;
    if (!preview || preview.error) return preview;
    var root = document.querySelector("#food-" + preview.room + " .scan-preview");
    if (!root) return preview;
    if (preview.mode === "card" || preview.mode === "photo") {
      function fieldValue(name) {
        var el = root.querySelector('[data-scan-field="' + name + '"]');
        return el ? el.value : "";
      }
      var priorIngredients = (preview.card.ingredients || []).slice();
      var priorMethod = (preview.card.method || []).slice();
      preview.card.name = fieldValue("name").trim();
      preview.card.tagline = fieldValue("tagline").trim();
      preview.card.ingredients = linesOf(fieldValue("ingredients")).map(function (text, index) {
        return ingredientRecord(text, priorIngredients[index]);
      });
      preview.card.method = methodFromLines(fieldValue("method")).map(function (step, index) {
        return methodRecord(step, priorMethod[index]);
      });
      preview.card.tip = fieldValue("tip").trim();
      preview.card.citations = linesOf(fieldValue("citations"));
      preview.card.tag = normalizeTag(fieldValue("tag"));
      return preview;
    }
    if (preview.mode === "shop") {
      root.querySelectorAll("[data-scan-line]").forEach(function (el) {
        var index = +el.getAttribute("data-scan-line");
        if (preview.lines[index]) preview.lines[index].customName = el.value.trim();
      });
      root.querySelectorAll("[data-scan-tag]").forEach(function (el) {
        var index = +el.getAttribute("data-scan-tag");
        if (preview.lines[index]) preview.lines[index].tag = normalizeTag(el.value) || "other";
      });
      root.querySelectorAll("[data-scan-cites]").forEach(function (el) {
        var index = +el.getAttribute("data-scan-cites");
        if (preview.lines[index]) preview.lines[index].citations = linesOf(el.value);
      });
      return preview;
    }
    var moduleBox = root.querySelector('[data-scan-field="module"]');
    if (moduleBox) {
      try {
        preview.module = JSON.parse(moduleBox.value);
        if (preview.note === "That preview is not JSON yet.") preview.note = "";
      } catch (err) {
        preview.module = null;
        preview.note = "That preview is not JSON yet.";
      }
    }
    return preview;
  }

  function applyFoodModule(room, data) {
    if (Array.isArray(data) || !data || typeof data !== "object") return "Import accepts a JSON object, not a list.";
    if (data.room && data.room !== room) return "That JSON belongs to the " + data.room + " room.";
    if (room === "weekly") {
      if (!data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) return "Weekly JSON needs a notes object.";
      var notes = {};
      Object.keys(data.notes).forEach(function (key) {
        var next = weekNoteRecord(data.notes[key]);
        if (next) notes[key] = next;
      });
      writeJsonStore(FOOD_WEEK_KEY, notes);
      return "";
    }
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft.locked) return "Unlock this month’s shop before importing a list.";
      var items = data.draft && Array.isArray(data.draft.items) ? data.draft.items : (Array.isArray(data.items) ? data.items : (Array.isArray(data.lines) ? data.lines : null));
      if (!items) return "Shop JSON needs a list of lines.";
      draft.items = items.map(function (item) {
        var next = {};
        Object.keys(item).forEach(function (key) { next[key] = item[key]; });
        var known = foodShop() && next.skuId && foodShop().skus[next.skuId];
        if (!next.customName && next.name && !known) next.customName = next.name;
        if (!next.skuId) next.skuId = "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (next.qty == null) next.qty = 1;
        if (next.ticked == null) next.ticked = true;
        next.citations = shopItemCitations(next);
        next.tag = shopTag(next);
        return next;
      });
      saveDraft(draft);
      return "";
    }
    var store = readCardStore();
    var fallbackKind = room === "extractions" ? "extraction" : "meal";
    var cards = data.cards && typeof data.cards === "object" && !Array.isArray(data.cards) ? data.cards : null;
    if (!cards && data.name) {
      var one = overlayRecord(data, runtimeKind(data.kind) || fallbackKind, data);
      one.custom = true;
      one.kind = runtimeKind(data.kind) || fallbackKind;
      cards = {};
      cards[one.id] = one;
    }
    if (!cards) return "That JSON has no card.";
    var saved = {};
    Object.keys(cards).forEach(function (key) {
      var card = cards[key];
      if (!card || typeof card !== "object" || Array.isArray(card)) return;
      var runtime = runtimeKind(card.kind) || fallbackKind;
      var record = overlayRecord(Object.assign({ id: key }, card), runtime, card);
      record.kind = runtime;
      if (card.custom) record.custom = true;
      saved[record.id || key] = record;
    });
    if (room === "extractions") {
      store.extractions = saved;
      if (Array.isArray(data.hidden)) store.hiddenExtractions = data.hidden;
    } else {
      store.meals = saved;
      if (Array.isArray(data.hidden)) store.hiddenMeals = data.hidden;
    }
    writeJsonStore(FOOD_CARDS_KEY, store);
    return "";
  }

  function commitScan() {
    var preview = readScanForm();
    if (!preview || preview.error) {
      state.scanPreview = preview;
      render();
      return;
    }
    if (preview.mode === "card" || preview.mode === "photo") {
      var card = preview.card;
      var kind = preview.room === "extractions" ? "extraction" : "meal";
      if (!card.name) card.name = card.scanImage ? "Label photo" : (kind === "extraction" ? "Scanned smoothie" : "Scanned meal");
      card.ingredients = (card.ingredients || []).filter(function (row) { return row && (row.text || row.skuId); });
      card.method = (card.method || []).filter(function (step) { return step && (step.verb || step.detail); });
      if (!card.ingredients.length) card.ingredients = [{ text: "Add an ingredient" }];
      if (!card.method.length) {
        card.method = card.scanImage
          ? [{ verb: "Fill", detail: "the fields from the label" }]
          : [{ verb: "Cook", detail: "until done" }];
      }
      var savedCard = overlayRecord(card, kind, card);
      savedCard.custom = true;
      savedCard.kind = kind;
      savedCard.id = card.id;
      saveCardRecord(kind, card.id, savedCard);
      state.foodFocusId = card.id;
      state.foodEditing = false;
    } else if (preview.mode === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft.locked) {
        preview.error = "Unlock this month’s shop before importing a list.";
        state.scanPreview = preview;
        render();
        return;
      }
      var added = 0;
      (preview.lines || []).forEach(function (line) {
        if (!line.customName) return;
        added += 1;
        draft.items.push({
          skuId: "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          qty: line.qty || 1,
          ticked: line.ticked !== false,
          customName: line.customName,
          pricePence: line.pricePence || 0,
          tag: normalizeTag(line.tag) || "other",
          citations: normalizeCitations(line.citations).length ? normalizeCitations(line.citations) : [line.customName],
          scanImage: preview.scanImage || line.scanImage || ""
        });
      });
      if (!added) {
        preview.note = "Name a shop line before saving.";
        state.scanPreview = preview;
        render();
        return;
      }
      saveDraft(draft);
    } else {
      if (!preview.module) {
        preview.note = preview.note || "That preview is not JSON yet.";
        state.scanPreview = preview;
        render();
        return;
      }
      var problem = applyFoodModule(preview.room, preview.module);
      if (problem) {
        preview.error = problem;
        state.scanPreview = preview;
        render();
        return;
      }
    }
    state.scanPreview = null;
    render();
  }

  function onScanAction(btn) {
    var action = btn.getAttribute("data-scan-action");
    var room = state.foodRoom;
    if (action === "cancel") {
      state.scanPreview = null;
      render();
      return;
    }
    if (action === "parse") {
      var box = $("scan-paste-" + room);
      state.scanPreview = parseFreeform(box ? box.value : "", room);
      render();
      return;
    }
    if (action === "save") commitScan();
  }

  function readScanFile(input) {
    var file = input.files && input.files[0];
    var kind = input.getAttribute("data-scan-file");
    var room = state.foodRoom;
    if (!file) return;
    if (kind === "photo") {
      if (file.size > 900000) {
        state.scanPreview = previewFromPhoto("", room, "That photo is too large to keep on this device. Fill the fields instead.");
        render();
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        state.scanPreview = previewFromPhoto(String(reader.result || ""), room);
        render();
      };
      reader.readAsDataURL(file);
      return;
    }
    var textReader = new FileReader();
    textReader.onload = function () {
      var text = String(textReader.result || "");
      if (looksLikeZip(text, file.name)) {
        state.scanPreview = { room: room, error: "Import accepts a JSON object, not a ZIP." };
        render();
        return;
      }
      var trimmed = text.trim();
      if (trimmed.charAt(0) === "[") {
        state.scanPreview = { room: room, error: "Import accepts a JSON object, not a list." };
        render();
        return;
      }
      try {
        state.scanPreview = previewFromJson(JSON.parse(trimmed), room);
      } catch (err) {
        state.scanPreview = { room: room, error: "That file is not JSON." };
      }
      render();
    };
    textReader.readAsText(file);
  }

  function readShopPhoto(input) {
    var file = input.files && input.files[0];
    var index = +input.getAttribute("data-shop-photo");
    if (!file || file.size > 900000) return;
    var reader = new FileReader();
    reader.onload = function () {
      var fresh = draftFor(state.viewYear, state.viewMonth, true);
      var row = fresh.items[index];
      if (!row) return;
      row.scanImage = String(reader.result || "");
      if (!normalizeCitations(row.citations).length) row.citations = shopItemCitations(row);
      saveDraft(fresh);
      render();
    };
    reader.readAsDataURL(file);
  }

  function editorHtml(card) {
    return '<form class="card-editor" data-card-editor="' + escapeHtml(card.id) + '">' +
      "<label>Name <input data-field=\"name\" value=\"" + escapeHtml(card.name) + "\"></label>" +
      "<label>Tagline <input data-field=\"tagline\" value=\"" + escapeHtml(card.tagline) + "\"></label>" +
      "<label>Ingredients, one line each <textarea data-field=\"ingredients\" rows=\"6\">" +
        escapeHtml(ingredientsToText(card.ingredients)) + "</textarea></label>" +
      "<label>Method, one step each line <textarea data-field=\"method\" rows=\"6\">" +
        escapeHtml(methodToText(card.method)) + "</textarea></label>" +
      "<label>Tip <textarea data-field=\"tip\" rows=\"3\">" + escapeHtml(card.tip) + "</textarea></label>" +
      "<label>Category " + tagSelectHtml(card.tag, 'data-field="tag"', true) + "</label>" +
      '<label>Citations, one line each <textarea data-field="citations" rows="4">' +
        escapeHtml(citationsToText(derivedCitations(card))) +
        "</textarea></label>" +
      '<button type="button" data-card-action="save">Save card</button>' +
      '<button type="button" data-card-action="cancel">Cancel</button>' +
      "</form>";
  }

  function cardActionsHtml(id) {
    return '<div class="card-actions">' +
      '<button type="button" data-card-action="edit" data-card-id="' + escapeHtml(id) + '">Edit</button>' +
      '<button type="button" data-card-action="duplicate" data-card-id="' + escapeHtml(id) + '">Duplicate</button>' +
      '<button type="button" data-card-action="delete" data-card-id="' + escapeHtml(id) + '">Delete</button>' +
      "</div>";
  }

  function onCardAction(btn) {
    var action = btn.getAttribute("data-card-action");
    var kind = state.foodRoom === "extractions" ? "extraction" : "meal";
    var id = btn.getAttribute("data-card-id") || state.foodFocusId;
    var shop = foodShop();
    var tierId = shop ? shop.tierFor(state.viewYear, state.viewMonth).id : 1;
    if (action === "add") {
      id = newCardId();
      var fresh = overlayRecord({
        id: id,
        custom: true,
        kind: kind,
        name: kind === "extraction" ? "New smoothie" : "New meal",
        tagline: "",
        ingredients: [{ text: "" }],
        method: [{ verb: "Cook", detail: "" }],
        tip: "",
        citations: ["FOOD_LIVE"]
      }, kind);
      if (!fresh.ingredients.length) fresh.ingredients = [{ text: "" }];
      if (!fresh.method.length) fresh.method = [{ verb: "Cook", detail: "" }];
      fresh.custom = true;
      fresh.kind = kind;
      saveCardRecord(kind, id, fresh);
      state.foodFocusId = id;
      state.foodEditing = true;
      render();
      return;
    }
    if (action === "cancel") {
      state.foodEditing = false;
      render();
      return;
    }
    if (action === "edit") {
      state.foodFocusId = id;
      state.foodEditing = true;
      render();
      return;
    }
    if (action === "save") {
      var form = btn.closest("[data-card-editor]");
      if (!form) return;
      var nameEl = form.querySelector('[data-field="name"]');
      var tagEl = form.querySelector('[data-field="tagline"]');
      var ingEl = form.querySelector('[data-field="ingredients"]');
      var methodEl = form.querySelector('[data-field="method"]');
      var tipEl = form.querySelector('[data-field="tip"]');
      var citeEl = form.querySelector('[data-field="citations"]');
      var tagField = form.querySelector('[data-field="tag"]');
      var store = readCardStore();
      var bucket = kind === "extraction" ? store.extractions : store.meals;
      var existing = bucket[id] || {};
      var viewed = cardView(kind, id, tierId) || {};
      var priorIngredients = (existing.ingredients && existing.ingredients.length) ? existing.ingredients : (viewed.ingredients || []);
      var priorMethod = (existing.method && existing.method.length) ? existing.method : (viewed.method || []);
      var form = {
        id: id,
        kind: runtimeKind(existing.kind) || kind,
        name: nameEl ? nameEl.value.trim() : "",
        tagline: tagEl ? tagEl.value.trim() : "",
        ingredients: linesOf(ingEl ? ingEl.value : "").map(function (text, index) {
          return ingredientRecord(text, priorIngredients[index]);
        }),
        method: methodFromLines(methodEl ? methodEl.value : "").map(function (step, index) {
          return methodRecord(step, priorMethod[index]);
        }),
        tip: tipEl ? tipEl.value.trim() : "",
        citations: linesOf(citeEl ? citeEl.value : ""),
        tag: tagField ? normalizeTag(tagField.value) : "",
        scanImage: existing.scanImage || ""
      };
      if (existing.custom) form.custom = true;
      if (!existing.custom && !form.name) form.name = existing.name || viewed.name || "";
      var record = overlayRecord(form, kind, existing);
      if (!existing.custom) copyForward(record, viewed, false);
      if (existing.custom) record.custom = true;
      record.kind = runtimeKind(record.kind) || kind;
      saveCardRecord(kind, id, record);
      state.foodEditing = false;
      render();
      return;
    }
    if (action === "duplicate") {
      var source = cardView(kind, id, tierId);
      if (!source) return;
      var copyId = newCardId();
      var copy = overlayRecord(source, kind, source);
      copy.id = copyId;
      copy.custom = true;
      copy.kind = runtimeKind(source.kind) || kind;
      copy.name = (source.name || "") + " copy";
      saveCardRecord(kind, copyId, copy);
      state.foodFocusId = copyId;
      state.foodEditing = true;
      render();
      return;
    }
    if (action === "delete") {
      var cards = readCardStore();
      var bag = kind === "extraction" ? cards.extractions : cards.meals;
      if (bag[id] && bag[id].custom) delete bag[id];
      else {
        var hidden = kind === "extraction" ? cards.hiddenExtractions : cards.hiddenMeals;
        if (hidden.indexOf(id) === -1) hidden.push(id);
      }
      writeJsonStore(FOOD_CARDS_KEY, cards);
      state.foodFocusId = "";
      state.foodEditing = false;
      render();
    }
  }

  function suggestedDraft() {
    var api = foodShop();
    var list = api && api.shoppingListFor(state.viewYear, state.viewMonth);
    return {
      items: (list && list.items ? list.items : []).map(function (item) {
        return { skuId: item.skuId, qty: item.qty, ticked: true };
      }),
      locked: false,
      lockedAt: "",
      plan: null
    };
  }

  function draftFor(year, month, create) {
    var store = readFoodStore();
    var key = foodMonthKey(year, month);
    if (!store[key] && create) {
      store[key] = suggestedDraft();
      writeFoodStore(store);
    }
    return store[key] || null;
  }

  function saveDraft(draft) {
    var store = readFoodStore();
    store[foodMonthKey(state.viewYear, state.viewMonth)] = draft;
    writeFoodStore(store);
  }

  function tickedSkuIds(draft) {
    var ids = [];
    (draft.items || []).forEach(function (item) {
      if (item.ticked && item.qty > 0 && ids.indexOf(item.skuId) === -1) ids.push(item.skuId);
    });
    return ids;
  }

  function lockShopMonth() {
    var api = foodSchedule();
    if (!api || !api.composeFromBasket) return;
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    var plan = {};
    trainingDaysForMonth(state.viewMonth, state.viewYear).forEach(function (day) {
      plan[day.dateKey] = api.composeFromBasket(day, tickedSkuIds(draft));
    });
    draft.locked = true;
    draft.lockedAt = new Date().toISOString();
    draft.plan = plan;
    saveDraft(draft);
    state.basketDrafts = draftsFromBasket();
    state.basketOpen = true;
    render();
  }

  function unlockShopMonth() {
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    draft.locked = false;
    draft.plan = null;
    saveDraft(draft);
    render();
  }

  function draftsFromBasket() {
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    var rows = [];
    (draft.items || []).forEach(function (item) {
      if (!item.ticked || !(item.qty > 0)) return;
      var name = shopItemLabel(item);
      if (!name) return;
      rows.push({
        name: name,
        tag: shopTag(item),
        citations: shopItemCitations(item)
      });
    });
    var fruits = rows.filter(function (row) {
      return row.tag === "fruit" || (row.tag === "freezer" && /mango|cherr|berr|fruit|pineapple/i.test(row.name));
    });
    var proteins = rows.filter(function (row) { return row.tag === "protein"; });
    var sides = rows.filter(function (row) {
      return (row.tag === "veg" || row.tag === "freezer") && fruits.indexOf(row) === -1;
    });
    var dairy = rows.filter(function (row) {
      return row.tag === "dairy" && /milk|yogurt|kefir/i.test(row.name);
    });
    var botanicals = rows.filter(function (row) { return row.tag === "botanical"; });
    var staples = rows.filter(function (row) {
      return row.tag === "other" && /rice|potato|pasta|bread/i.test(row.name);
    });
    var stamp = draft.locked ? ["FOOD_LIVE basket", "Locked Sainsbury’s list"] : ["FOOD_LIVE basket"];
    function withStamp(parts) {
      var citations = [];
      parts.forEach(function (row) {
        (row.citations || []).forEach(function (line) {
          if (citations.indexOf(line) === -1) citations.push(line);
        });
      });
      stamp.forEach(function (line) {
        if (citations.indexOf(line) === -1) citations.push(line);
      });
      return citations;
    }
    function shortName(product) {
      return String(product || "").replace(/^Sainsbury's /, "").replace(/^Waitrose /, "").split(" ").slice(0, 3).join(" ");
    }
    var meals = [];
    proteins.slice(0, 6).forEach(function (protein, index) {
      var parts = [protein];
      if (sides.length) parts.push(sides[index % sides.length]);
      if (staples.length) parts.push(staples[index % staples.length]);
      meals.push({
        id: newCardId(),
        kind: "meal",
        name: shortName(protein.name) + " plate",
        tagline: "Draft from the ticked basket.",
        ingredients: parts.map(function (row) { return { text: row.name }; }),
        method: [
          { verb: "Heat", detail: "the pan or tray." },
          { verb: "Cook", detail: protein.name + " until hot." },
          { verb: "Plate", detail: "with the ticked veg and staple." }
        ],
        tip: /egg/i.test(protein.name) ? "Cook the whites. Editable draft from the basket." : "Editable draft from the basket.",
        citations: withStamp(parts),
        tag: "protein"
      });
    });
    if (!meals.length && sides.length) {
      meals.push({
        id: newCardId(),
        kind: "meal",
        name: shortName(sides[0].name) + " plate",
        tagline: "Draft from the ticked basket.",
        ingredients: sides.slice(0, 3).map(function (row) { return { text: row.name }; }),
        method: [
          { verb: "Heat", detail: "the pan." },
          { verb: "Cook", detail: "the ticked vegetables until hot." }
        ],
        tip: "Editable draft from the basket.",
        citations: withStamp(sides.slice(0, 3)),
        tag: "veg"
      });
    }
    var smoothies = [];
    if (fruits.length || dairy.length) {
      var glass = fruits.concat(dairy).concat(botanicals.filter(function (row) { return /hemp/i.test(row.name); }));
      var whisk = botanicals.filter(function (row) { return !/hemp/i.test(row.name); });
      var bowl = glass.length ? glass : whisk;
      smoothies.push({
        id: newCardId(),
        kind: "extraction",
        name: "Basket morning glass",
        tagline: "Morning only. Not dinner.",
        ingredients: bowl.concat(whisk).filter(function (row, index, list) {
          return list.indexOf(row) === index;
        }).map(function (row) { return { text: row.name }; }),
        method: [
          { verb: "Pour", detail: "the milk or yogurt." },
          { verb: "Add", detail: "the ticked fruit." },
          { verb: "Blend", detail: "then strain." },
          { verb: "Whisk", detail: "botanicals in after the strain." }
        ],
        tip: "Not dinner.",
        citations: withStamp(bowl.concat(whisk)).concat(["Not dinner."]),
        tag: "fruit"
      });
    }
    return meals.concat(smoothies);
  }

  function basketDraftsHtml() {
    if (!state.basketOpen || !state.basketDrafts) return "";
    if (!state.basketDrafts.length) {
      return '<section class="basket-drafts"><h3>Drafts from the basket</h3><p>No ticked lines to turn into cards.</p></section>';
    }
    return '<section class="basket-drafts" aria-label="Drafts from the basket">' +
      "<h3>Drafts from the basket</h3>" +
      "<p>Editable drafts. Save keeps the card. Discard drops it.</p>" +
      state.basketDrafts.map(function (card, index) {
        var lines = (card.ingredients || []).map(function (item) { return item.text; }).join(", ");
        var cites = (card.citations || []).map(function (line) { return "<li>" + escapeHtml(line) + "</li>"; }).join("");
        return '<article class="basket-card">' +
          "<h4>" + escapeHtml(card.name) + "</h4>" +
          "<p>" + escapeHtml(card.tagline || "") + "</p>" +
          "<p>" + escapeHtml(card.tip || "") + "</p>" +
          "<p>" + escapeHtml(lines) + "</p>" +
          '<ul class="recipe-citations">' + cites + "</ul>" +
          '<button type="button" data-shop-action="save-draft" data-draft-index="' + index + '">Save draft</button>' +
          '<button type="button" data-shop-action="discard-draft" data-draft-index="' + index + '">Discard</button>' +
          "</article>";
      }).join("") +
      "</section>";
  }

  function onShopAction(btn) {
    var action = btn.getAttribute("data-shop-action");
    if (action === "pack001") {
      var packDraft = draftFor(state.viewYear, state.viewMonth, true);
      if (packDraft.locked) return;
      var pack = packApi();
      if (!pack) return;
      var seen = {};
      (packDraft.items || []).forEach(function (item) { if (item.skuId) seen[item.skuId] = true; });
      pack.shop.items.forEach(function (item) {
        if (seen[item.skuId]) return;
        packDraft.items.push(JSON.parse(JSON.stringify(item)));
      });
      saveDraft(packDraft);
      render();
      return;
    }
    if (action === "lock") {
      lockShopMonth();
      return;
    }
    if (action === "unlock") {
      unlockShopMonth();
      return;
    }
    if (action === "filter") {
      state.shopFilter = btn.getAttribute("data-shop-tag") || "all";
      render();
      return;
    }
    if (action === "build-cards") {
      state.basketDrafts = draftsFromBasket();
      state.basketOpen = true;
      render();
      return;
    }
    if (action === "save-draft" || action === "discard-draft") {
      var draftIndex = +btn.getAttribute("data-draft-index");
      var picked = state.basketDrafts && state.basketDrafts[draftIndex];
      if (!picked) return;
      if (action === "save-draft") {
        var pickedKind = picked.kind === "extraction" ? "extraction" : "meal";
        var drafted = overlayRecord(picked, pickedKind, picked);
        drafted.custom = true;
        drafted.kind = pickedKind;
        drafted.id = picked.id;
        saveCardRecord(pickedKind, picked.id, drafted);
      }
      state.basketDrafts.splice(draftIndex, 1);
      render();
      return;
    }
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    if (action === "sort-name" || action === "sort-tag") {
      draft.items.sort(function (a, b) {
        if (action === "sort-tag") {
          var tagDelta = SHOP_TAG_ORDER.indexOf(shopTag(a)) - SHOP_TAG_ORDER.indexOf(shopTag(b));
          if (tagDelta) return tagDelta;
        }
        return shopItemLabel(a).localeCompare(shopItemLabel(b));
      });
      saveDraft(draft);
      render();
      return;
    }
    if (action === "move") {
      var from = +btn.getAttribute("data-shop-index");
      var delta = +btn.getAttribute("data-shop-delta") || 0;
      var visible = [];
      draft.items.forEach(function (item, index) {
        if (state.shopFilter === "all" || shopTag(item) === state.shopFilter) visible.push(index);
      });
      var place = visible.indexOf(from);
      var target = visible[place + delta];
      if (place === -1 || target == null) return;
      var moved = draft.items[from];
      draft.items[from] = draft.items[target];
      draft.items[target] = moved;
      saveDraft(draft);
      render();
      return;
    }
    if (action === "add-custom") {
      var nameInput = $("shop-custom-name");
      var customName = nameInput ? nameInput.value.trim() : "";
      if (!customName) return;
      draft.items.push({
        skuId: "custom-" + Date.now().toString(36),
        qty: 1,
        ticked: true,
        customName: customName,
        pricePence: 0,
        tag: "other",
        citations: [customName]
      });
      saveDraft(draft);
      render();
      return;
    }
    if (action === "add") {
      var select = $("shop-add-sku");
      var skuId = select ? select.value : "";
      if (!skuId) return;
      var found = false;
      draft.items.forEach(function (item) {
        if (item.skuId === skuId) {
          item.qty += 1;
          item.ticked = true;
          found = true;
        }
      });
      if (!found) draft.items.push({ skuId: skuId, qty: 1, ticked: true });
    } else {
      var index = +btn.getAttribute("data-shop-index");
      var item = draft.items[index];
      if (!item) return;
      if (action === "tick") item.ticked = !item.ticked;
      if (action === "qty") item.qty = Math.max(1, item.qty + (+btn.getAttribute("data-shop-delta") || 0));
      if (action === "remove") draft.items.splice(index, 1);
    }
    saveDraft(draft);
    render();
  }

  function foodWeekDays() {
    var year = state.viewYear || 2027;
    var month = state.viewMonth || 1;
    var week = state.viewWeek || 1;
    var last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var startDay = week <= 1 ? 1 : week === 2 ? 8 : week === 3 ? 15 : 22;
    if (startDay > last) startDay = last;
    var anchor = londonParts(new Date(Date.UTC(year, month - 1, startDay, 12, 0, 0)));
    var names = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    var index = names[String(anchor.weekday || "").slice(0, 3)];
    if (index == null) index = 0;
    var monday = Date.UTC(anchor.year, anchor.month - 1, anchor.day, 12, 0, 0) - index * 86400000;
    var days = [];
    for (var i = 0; i < 7; i++) {
      var parts = londonParts(new Date(monday + i * 86400000));
      parts.sunday = i === 6;
      days.push(parts);
    }
    return days;
  }

  function foodDayModel(dateKey) {
    var note = weekNote(dateKey) || {};
    var pack = packApi();
    var seed = !note.cleared && pack && pack.week ? (pack.week[dateKey] || {}) : {};
    function pick(key) {
      if (note.cleared) return note[key] || "";
      if (note[key]) return note[key];
      return seed[key] || "";
    }
    return {
      extractionId: pick("extractionId"),
      morning: pick("morning"),
      lunch: pick("lunch"),
      mealId: pick("mealId"),
      snack: pick("snack"),
      note: pick("note"),
      pinned: !!note.pinned
    };
  }

  function foodSlotLabel(slot, model) {
    if (slot === "morning") {
      if (model.morning && !model.extractionId) return model.morning;
      var glass = model.extractionId ? cardView("extraction", model.extractionId, 1) : null;
      return glass ? glass.name : "Add an extraction";
    }
    if (slot === "lunch") {
      var lunchCard = model.lunch ? (cardView("meal", model.lunch, 1) || cardView("extraction", model.lunch, 1)) : null;
      return lunchCard ? lunchCard.name : (model.lunch || "Add lunch");
    }
    var evening = model.mealId ? cardView("meal", model.mealId, 1) : null;
    return evening ? evening.name : "Add an evening meal";
  }

  function onFoodWeekAction(btn) {
    var action = btn.getAttribute("data-week-action");
    if (action === "pack-week") {
      state.viewYear = 2026;
      state.viewMonth = 10;
      state.viewWeek = 1;
      state.branch = "bridge";
      state.userPicked = true;
      state.foodRefuse = "";
      render();
      return;
    }
    if (action === "undo" && state.foodUndo) {
      writeJsonStore(FOOD_WEEK_KEY, state.foodUndo);
      state.foodUndo = null;
      state.foodRefuse = "";
      render();
      return;
    }
    var date = btn.getAttribute("data-date");
    if (!date) return;
    if (action === "pin") {
      var pinned = !!foodDayModel(date).pinned;
      saveWeekNote(date, { pinned: pinned ? false : true });
      render();
      return;
    }
    if (action === "copy-lunch") {
      var days = foodWeekDays();
      var index = -1;
      days.forEach(function (day, i) { if (day.dateKey === date) index = i; });
      if (index <= 0) {
        state.foodRefuse = "No yesterday in this food week.";
        render();
        return;
      }
      saveWeekNote(date, { lunch: foodDayModel(days[index - 1].dateKey).lunch, cleared: "" });
      state.foodRefuse = "";
      render();
      return;
    }
    if (action === "fav-evening") {
      var pins = readCardStore().pins || {};
      if (!pins.evening) {
        state.foodRefuse = "Pin a meal first.";
        render();
        return;
      }
      saveWeekNote(date, { mealId: pins.evening, cleared: "" });
      state.foodRefuse = "";
      render();
      return;
    }
    if (action === "clear") {
      state.foodUndo = readWeekNotes();
      var notes = readWeekNotes();
      notes[date] = { cleared: true };
      writeJsonStore(FOOD_WEEK_KEY, notes);
      state.foodRefuse = "";
      render();
    }
  }

  function dropFoodCard(date, slot, kind, id) {
    if (kind === "collection") {
      state.foodRefuse = "Collections are visual only.";
      return;
    }
    if (slot === "evening" && kind === "extraction") {
      state.foodRefuse = "Extractions aren't dinner.";
      return;
    }
    if (slot === "morning" && kind !== "extraction") {
      state.foodRefuse = "Morning wants an extraction.";
      return;
    }
    state.foodRefuse = "";
    if (slot === "morning") saveWeekNote(date, { extractionId: id, morning: "", cleared: "" });
    if (slot === "lunch") saveWeekNote(date, { lunch: id, cleared: "" });
    if (slot === "evening") saveWeekNote(date, { mealId: id, cleared: "" });
  }

  function paintFuelWeek() {
    var days = foodWeekDays();
    var html = "";
    if (state.foodRefuse) {
      html += '<p class="food-refuse" role="status">' + escapeHtml(state.foodRefuse) + "</p>";
    }
    if (state.foodUndo) {
      html += '<p class="food-undo"><button type="button" data-week-action="undo">Undo clear notes</button></p>';
    }
    html += '<p class="food-week-range">' + escapeHtml(days[0].dateKey) + " → " + escapeHtml(days[6].dateKey) +
      ' · Monday to Sunday</p>';
    html += '<button type="button" class="food-pack-jump" data-week-action="pack-week">Pack 001 week</button>';
    days.forEach(function (day) {
      var model = foodDayModel(day.dateKey);
      var snackCard = model.snack ? cardView("meal", model.snack, 1) : null;
      html += '<article class="food-day' + (day.sunday ? " is-sunday" : "") + (model.pinned ? " is-pinned" : "") + '" data-date="' + escapeHtml(day.dateKey) + '">' +
        '<header class="food-day-head"><h3>' + escapeHtml(day.weekday) + "</h3>" +
        "<p>" + escapeHtml(day.dateKey) + "</p>" +
        (day.sunday ? '<p class="food-sunday-label">Food Prep + Fuel Day</p>' : "") +
        "</header>" +
        '<div class="food-slot" data-food-slot="morning" data-date="' + escapeHtml(day.dateKey) + '"><span>Morning</span><strong>' + escapeHtml(foodSlotLabel("morning", model)) + "</strong></div>" +
        '<div class="food-slot" data-food-slot="lunch" data-date="' + escapeHtml(day.dateKey) + '"><span>Lunch</span><strong>' + escapeHtml(foodSlotLabel("lunch", model)) + "</strong></div>" +
        '<div class="food-slot" data-food-slot="evening" data-date="' + escapeHtml(day.dateKey) + '"><span>Evening</span><strong>' + escapeHtml(foodSlotLabel("evening", model)) + "</strong></div>" +
        '<label class="food-note">Notes<textarea data-week-date="' + escapeHtml(day.dateKey) +
          '" data-week-field="note" rows="2">' + escapeHtml(model.note || "") + "</textarea></label>" +
        (snackCard ? '<p class="food-snack">Snack · ' + escapeHtml(snackCard.name) +
          (snackCard.blockedWithoutAdds ? " · if ESTIMATE adds landed" : "") + "</p>" : "") +
        '<div class="food-day-actions">' +
          '<button type="button" data-week-action="pin" data-date="' + escapeHtml(day.dateKey) + '">' + (model.pinned ? "Unpin" : "Pin") + "</button>" +
          '<button type="button" data-week-action="copy-lunch" data-date="' + escapeHtml(day.dateKey) + '">Copy yesterday lunch</button>' +
          '<button type="button" data-week-action="fav-evening" data-date="' + escapeHtml(day.dateKey) + '">Favourite evening</button>' +
          '<button type="button" data-week-action="clear" data-date="' + escapeHtml(day.dateKey) + '">Clear notes</button>' +
        "</div></article>";
    });
    html += '<div class="food-library" aria-label="Pack 001 library">';
    idsForKind("extraction").forEach(function (id) {
      var row = cardView("extraction", id, 1);
      if (!row || !row.pack001) return;
      html += '<button type="button" class="food-chip" data-drag-kind="extraction" data-drag-id="' + escapeHtml(id) + '">' + escapeHtml(row.name) + "</button>";
    });
    idsForKind("meal").forEach(function (id) {
      var row = cardView("meal", id, 1);
      if (!row || !row.pack001) return;
      html += '<button type="button" class="food-chip" data-drag-kind="meal" data-drag-id="' + escapeHtml(id) + '">' + escapeHtml(row.name) + "</button>";
    });
    html += "</div>";
    var host = $("food-week-days");
    if (host) host.innerHTML = html;
    var body = $("fuel-body");
    if (body) body.innerHTML = "";
    var weekHost = $("food-weekly");
    if (weekHost && !weekHost.querySelector(".food-tools")) {
      weekHost.insertAdjacentHTML("afterbegin", foodToolsHtml("weekly"));
    }
    if (weekHost && !weekHost.querySelector(".scan-preview-host")) {
      var weekTools = weekHost.querySelector(".food-tools");
      if (weekTools) weekTools.insertAdjacentHTML("afterend", '<div class="scan-preview-host"></div>');
    }
    var weekPreview = weekHost && weekHost.querySelector(".scan-preview-host");
    if (weekPreview) weekPreview.innerHTML = scanPreviewHtml("weekly");
    var sunday = $("fuel-sunday");
    if (sunday) sunday.textContent = "";
  }

  function paintShop() {
    var host = $("food-shop");
    var api = foodShop();
    if (!host || !api) return;
    var tier = api.tierFor(state.viewYear, state.viewMonth);
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    var stretch = tier.stretchPence || tier.budgetPence;
    var total = 0;
    (draft.items || []).forEach(function (item) {
      var entry = api.skus[item.skuId];
      if (!item.ticked) return;
      if (entry) total += entry.pricePence * item.qty;
      else if (item.customName) total += (item.pricePence || 0) * item.qty;
    });
    var capNote = total <= tier.budgetPence
      ? "Inside " + tier.budgetLabel
      : (total <= stretch ? "Soft stretch to " + (tier.stretchLabel || api.formatGbp(stretch)) : "Over the stretch cap");
    var pack = packApi();
    var budget = pack && pack.budget ? pack.budget : null;
    var html = "";
    if (budget) {
      html += '<section class="food-budget">' +
        "<p>Trolley £" + budget.trolleyGbp.toFixed(2) + " RECEIPT_TRUE</p>" +
        "<p>Household £" + budget.householdGbp.toFixed(2) + " out</p>" +
        "<p>Meal + water £" + budget.mealWaterGbp.toFixed(2) + "</p>" +
        "<p>Critical Pack 001 adds ESTIMATE ~£" + budget.criticalAddsGbp.toFixed(2) + " → ~£" + budget.mealPlusCriticalGbp.toFixed(2) + "</p>" +
        (budget.softLockGbp != null ? "<p>Meal-engine soft lock £" + budget.softLockGbp.toFixed(2) + "</p>" : "") +
        (budget.fullAddsGbp != null ? "<p>Full recommended adds ESTIMATE ~£" + budget.fullAddsGbp.toFixed(2) + "</p>" : "") +
        '<button type="button" data-shop-action="pack001">Add Pack 001 trolley</button>' +
        "</section>";
    }
    html += '<section class="fuel-tier" data-tier="' + tier.id + '">' +
      '<p class="fuel-tier-label">TIER ' + tier.id + " · " + escapeHtml(tier.budgetLabel) + "/MONTH</p>" +
      '<p class="fuel-tier-range">' + escapeHtml(tier.rangeLabel) + " · " + escapeHtml(tier.stores.join(" / ")) + "</p>" +
      '<p class="fuel-tier-basket">Ticked ' + api.formatGbp(total) + " · " + escapeHtml(capNote) +
        (tier.stretchLabel ? " · stretch " + escapeHtml(tier.stretchLabel) : "") + "</p>" +
      '<p class="fuel-basket-note">' + (draft.locked ? "Locked. The weekly schedule is this month’s prep plan." : "Suggested list. Lock it to fill the weekly schedule.") + "</p>" +
      "</section>";
    html += '<ol class="food-laws">';
    api.laws.forEach(function (law) { html += "<li>" + escapeHtml(law) + "</li>"; });
    html += "</ol>";
    html += '<h3 class="food-subhead">Protect stock</h3><ul class="fuel-basket-list">';
    api.protect.forEach(function (row) {
      html += "<li><span>" + escapeHtml(row.item) + " · " + escapeHtml(row.stock) + "</span><span>" +
        escapeHtml(row.action) + "</span></li>";
    });
    html += '</ul><h3 class="food-subhead">Fruit first</h3><ul class="food-plain">';
    api.fruitFirst.forEach(function (item) { html += "<li>" + escapeHtml(item) + "</li>"; });
    html += '</ul><h3 class="food-subhead">Food second</h3><ul class="food-plain">';
    api.foodSecond.forEach(function (item) { html += "<li>" + escapeHtml(item) + "</li>"; });
    html += '</ul><h3 class="food-subhead">On the Sainsbury’s shelf</h3><ul class="food-plain">';
    api.citations.forEach(function (item) { html += "<li>" + escapeHtml(item) + "</li>"; });
    html += "</ul>";
    if (api.aisles && api.aisles.length) {
      html += '<h3 class="food-subhead">Aisle table</h3><ul class="food-plain">';
      api.aisles.forEach(function (row) {
        html += "<li><strong>" + escapeHtml(row.aisle) + ".</strong> " + escapeHtml(row.prefer) +
          " Fallback: " + escapeHtml(row.fallback) + "</li>";
      });
      html += "</ul>";
    }
    if (api.fruitFirstBuys && api.fruitFirstBuys.length) {
      html += '<h3 class="food-subhead">Fruit buys</h3><ul class="food-plain">';
      api.fruitFirstBuys.forEach(function (row) {
        html += "<li>" + escapeHtml(row.item) + " · " + escapeHtml(row.buy) + " · " + escapeHtml(row.why) + "</li>";
      });
      html += "</ul>";
    }
    if (api.sundayPrep && api.sundayPrep.length) {
      html += '<h3 class="food-subhead">Sunday 45-minute prep</h3><ol class="food-plain">';
      api.sundayPrep.forEach(function (line) { html += "<li>" + escapeHtml(line) + "</li>"; });
      html += "</ol>";
    }
    html += '<div class="shop-sort">' +
      '<button type="button" data-shop-action="sort-name">Sort by name</button>' +
      '<button type="button" data-shop-action="sort-tag">Sort by category</button>' +
      '<button type="button" data-shop-action="build-cards">Build cards from basket</button>' +
      "</div>";
    html += '<div class="shop-filters" role="group" aria-label="Category">';
    ["all"].concat(SHOP_TAG_ORDER).forEach(function (tag) {
      html += '<button type="button" class="shop-chip' + (state.shopFilter === tag ? " is-on" : "") +
        '" data-shop-action="filter" data-shop-tag="' + tag + '">' + tag + "</button>";
    });
    html += "</div>";
    html += basketDraftsHtml();
    html += '<h3 class="food-subhead">This month’s list</h3><ul class="fuel-basket-list shop-editor">';
    (draft.items || []).forEach(function (item, index) {
      var entry = api.skus[item.skuId];
      var label = shopItemLabel(item);
      if (!label) return;
      var tag = shopTag(item);
      if (state.shopFilter !== "all" && tag !== state.shopFilter) return;
      var linePrice = entry ? entry.pricePence * item.qty : (item.pricePence || 0) * item.qty;
      var cites = shopItemCitations(item).map(function (line) {
        return "<li>" + escapeHtml(line) + "</li>";
      }).join("");
      html += '<li class="shop-line' + (item.ticked ? " is-ticked" : "") + '">' +
        '<button type="button" class="shop-tick" data-shop-action="tick" data-shop-index="' + index +
          '" aria-pressed="' + (item.ticked ? "true" : "false") + '">' + (item.ticked ? "In" : "Out") + "</button>" +
        '<input class="shop-name" data-shop-index="' + index + '" data-shop-field="name" value="' +
          escapeHtml(label) + '" aria-label="Rename line">' +
        tagSelectHtml(tag, 'data-shop-index="' + index + '" data-shop-field="tag" aria-label="Category"') +
        '<button type="button" data-shop-action="move" data-shop-index="' + index + '" data-shop-delta="-1" aria-label="Move up">Up</button>' +
        '<button type="button" data-shop-action="move" data-shop-index="' + index + '" data-shop-delta="1" aria-label="Move down">Down</button>' +
        (item.scanImage ? '<img class="scan-photo" alt="Label photo" src="' + escapeHtml(item.scanImage) + '">' : "") +
        '<label class="scan-file">attach label photo; fill fields<input type="file" accept="image/*" capture="environment" data-shop-photo="' +
          index + '" aria-label="attach label photo; fill fields"></label>' +
        '<ul class="line-citations">' + cites + "</ul>" +
        '<label class="shop-cites">Citations<textarea data-shop-index="' + index + '" data-shop-field="citations" rows="2">' +
          escapeHtml(citationsToText(shopItemCitations(item))) + "</textarea></label>" +
        '<span class="shop-qty">' +
          '<button type="button" data-shop-action="qty" data-shop-index="' + index + '" data-shop-delta="-1" aria-label="Fewer">−</button>' +
          "<strong>" + item.qty + "</strong>" +
          '<button type="button" data-shop-action="qty" data-shop-index="' + index + '" data-shop-delta="1" aria-label="More">+</button>' +
        "</span>" +
        "<span>" + api.formatGbp(entry ? entry.pricePence * item.qty : linePrice) +
          (item.priceStatus ? " " + escapeHtml(item.priceStatus) : "") +
          (item.household ? " household" : "") + "</span>" +
        '<button type="button" data-shop-action="remove" data-shop-index="' + index + '">Remove</button>' +
        "</li>";
    });
    html += "</ul>";
    var options = "";
    Object.keys(api.skus).forEach(function (id) {
      var entry = api.skus[id];
      if (entry.tierMin > tier.id) return;
      options += '<option value="' + escapeHtml(id) + '">' + escapeHtml(entry.name) + "</option>";
    });
    html += '<div class="shop-add"><label>Add a Sainsbury’s line <select id="shop-add-sku">' + options +
      '</select></label><button type="button" data-shop-action="add">Add</button></div>';
    html += '<div class="shop-custom"><label>Custom line<input id="shop-custom-name" placeholder="Name a line"></label>' +
      '<button type="button" data-shop-action="add-custom">Add custom line</button></div>';
    html += '<p class="fuel-basket-total">Ticked total ' + api.formatGbp(total) + " · " + escapeHtml(capNote) + "</p>";
    html += draft.locked
      ? '<button type="button" class="shop-lock" data-shop-action="unlock">Unlock this month’s shop</button>'
      : '<button type="button" class="shop-lock" data-shop-action="lock">Lock this month’s shop</button>';
    host.innerHTML = foodToolsHtml("shop") + scanStripHtml("shop") + scanPreviewHtml("shop") + html;
  }

  function paintMeals() {
    var host = $("food-meals");
    var api = foodMeals();
    var shop = foodShop();
    if (!host || !api || !shop) return;
    var tier = shop.tierFor(state.viewYear, state.viewMonth);
    if (state.foodFocusId) {
      var card = cardView("meal", state.foodFocusId, tier.id);
      host.innerHTML = foodToolsHtml("meals") + scanStripHtml("meals") + scanPreviewHtml("meals") +
        '<button type="button" class="food-back" data-food-index="meals">All meal cards</button>' +
        (card ? cardActionsHtml(card.id) + (state.foodEditing ? editorHtml(card) : magazineCardHtml(card)) : "");
      return;
    }
    var filter = state.foodFilter || "all";
    var filters = ["all", "meal", "plate", "side", "snack"];
    var pack = packApi();
    var posters = "";
    if (pack && pack.collections) {
      Object.keys(pack.collections).forEach(function (id) {
        var poster = presentPack(pack.collections[id]);
        posters += '<article class="food-forensic food-collection"><h3>' + escapeHtml(poster.name) +
          "</h3><p>Visual only. Not a schedule slot.</p>" +
          (poster.childCardIds || []).map(function (child) {
            var kid = cardView("meal", child, 1);
            return '<button type="button" class="food-jump" data-food-meal="' + escapeHtml(child) + '">' +
              escapeHtml(kid ? kid.name : child) + "</button>";
          }).join("") + "</article>";
      });
    }
    host.innerHTML = foodToolsHtml("meals") + scanStripHtml("meals") + scanPreviewHtml("meals") +
      '<div class="food-filters">' + filters.map(function (name) {
        return '<button type="button" data-food-filter="' + name + '"' + (filter === name ? ' aria-pressed="true"' : "") + ">" + name + "</button>";
      }).join("") + "</div>" +
      '<button type="button" class="food-jump" data-card-action="add">Add a meal card<span>Name, ingredients, method, tip</span></button>' +
      posters +
      idsForKind("meal").map(function (id) {
        var meal = cardView("meal", id, tier.id);
        if (!meal) return "";
        var family = meal.family || "meal";
        if (filter !== "all" && family !== filter) return "";
        return '<div class="food-lib-row"><button type="button" class="food-jump" data-drag-kind="meal" data-drag-id="' +
          escapeHtml(id) + '" data-food-meal="' + escapeHtml(id) + '">' +
          escapeHtml(meal.name) + "<span>" + escapeHtml(meal.tagline) + "</span></button>" +
          '<button type="button" data-card-pin="' + escapeHtml(id) + '">Pin evening</button></div>';
      }).join("");
  }

  function paintExtractions() {
    var host = $("food-extractions");
    var api = foodExtractions();
    var shop = foodShop();
    if (!host || !api || !shop) return;
    var tier = shop.tierFor(state.viewYear, state.viewMonth);
    if (state.foodFocusId) {
      var card = cardView("extraction", state.foodFocusId, tier.id);
      host.innerHTML = foodToolsHtml("extractions") + scanStripHtml("extractions") + scanPreviewHtml("extractions") +
        '<button type="button" class="food-back" data-food-index="extractions">All extraction cards</button>' +
        (card ? cardActionsHtml(card.id) + (state.foodEditing ? editorHtml(card) : magazineCardHtml(card)) : "");
      return;
    }
    host.innerHTML = foodToolsHtml("extractions") + scanStripHtml("extractions") + scanPreviewHtml("extractions") +
      '<p class="fuel-sunday">Morning lock. Liquid, frozen fruit, citrus, hemp, 3000W blend, cheesecloth strain, then botanicals. Not dinner.</p>' +
      '<button type="button" class="food-jump" data-card-action="add">Add a smoothie card<span>Name, ingredients, method, tip</span></button>' +
      idsForKind("extraction").map(function (id) {
        var row = cardView("extraction", id, tier.id);
        if (!row) return "";
        return '<button type="button" class="food-jump" data-drag-kind="extraction" data-drag-id="' +
          escapeHtml(id) + '" data-food-extraction="' + escapeHtml(id) + '">' +
          escapeHtml(row.name) + "<span>" + escapeHtml(row.tagline) + "</span></button>";
      }).join("");
  }

  function openFoodRoom(room, focusId, band) {
    if (!FOOD_TITLES[room]) return;
    state.smoothieRoom = "";
    state.osDoor = "food";
    if (state.foodRoom !== room) state.scanPreview = null;
    state.foodRoom = room;
    state.foodFocusId = focusId || "";
    state.foodFocusBand = band || "moderate";
    state.foodEditing = false;
    render();
    var title = $("food-board-title");
    if (title && title.focus) {
      try { title.focus({ preventScroll: true }); } catch (err) {
        try { title.focus(); } catch (err2) { /* focus is optional */ }
      }
    }
  }

  function closeFoodRoom() {
    state.foodRoom = "";
    state.foodFocusId = "";
    state.foodEditing = false;
    state.scanPreview = null;
    state.osDoor = "training";
    render();
  }

  function paintOsDoors() {
    var door = state.osDoor === "food" || state.osDoor === "smoothies" ? state.osDoor : "training";
    state.osDoor = door;
    var titles = { training: "NiX Training Schedules", food: "Food", smoothies: "Smoothies" };
    var title = $("nav-drawer-title");
    if (title) title.textContent = titles[door];
    document.querySelectorAll("[data-os-door]").forEach(function (btn) {
      var on = btn.getAttribute("data-os-door") === door;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-os-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-os-panel") !== door;
    });
  }

  var FOOD_V22 = {
    meals: "relic_food_meals_v22",
    cabinet: "relic_food_cabinet_v22",
    hg: "relic_food_hg_v22",
    final: "relic_food_final_v22",
    later: "relic_food_savelater_v22",
    shop: "relic_food_shop_v22",
    fly: "relic_food_flylog_v22"
  };
  var FLY_ALLOW = {
    meals: { add_cabinet: "cabinet", add_hg: "hg" },
    cabinet: { add_hg: "hg" },
    hg: { finished_week: "savelater", month_complete: "final" },
    savelater: { reuse_hg: "hg" },
    shop: { create_meal: "meals" }
  };
  var WEEKDAY_ALL = { Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays", Sun: "Sundays" };
  var MONTH_LABEL = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function readV22(key) {
    var store = readJsonStore(key);
    return store && typeof store === "object" && !Array.isArray(store) ? store : {};
  }

  function writeV22(key, value) {
    writeJsonStore(key, value);
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function ensureMealSeed() {
    var store = readV22(FOOD_V22.meals);
    store.cards = store.cards || {};
    if (!store.seeded) {
      var pack = packApi();
      if (pack && pack.meals) {
        Object.keys(pack.meals).forEach(function (id) {
          var row = pack.meals[id];
          if (!row || row.kind === "collection" || row.visualOnly) return;
          store.cards[id] = {
            cardId: id,
            title: row.name,
            madeOn: "2026-10-01",
            noteCode: "",
            kind: "meal",
            family: row.family || "meal",
            tagline: row.tagline || "",
            ingredients: row.ingredients || [],
            method: row.method || [],
            tip: row.tip || "",
            cookEggWhites: !!row.cookEggWhites,
            fresh: true
          };
        });
      }
      store.seeded = true;
      writeV22(FOOD_V22.meals, store);
      var cab = readV22(FOOD_V22.cabinet);
      if (!cab.order || !cab.order.length) {
        cab.order = Object.keys(store.cards);
        writeV22(FOOD_V22.cabinet, cab);
      }
    }
    return store;
  }

  function mealById(id) {
    var store = ensureMealSeed();
    return store.cards[id] || null;
  }

  function foodBannersHtml() {
    var html = "";
    if (state.foodFlyError) html += '<p class="food-refuse" role="status">' + escapeHtml(state.foodFlyError) + "</p>";
    if (state.foodToast && state.foodToastUntil > Date.now()) {
      html += '<p class="food-toast" role="status">' + escapeHtml(state.foodToast) + "</p>";
    }
    return html;
  }

  function logFly(entry) {
    var log = readV22(FOOD_V22.fly);
    log.events = log.events || [];
    log.events.push(entry);
    if (log.events.length > 40) log.events = log.events.slice(-40);
    writeV22(FOOD_V22.fly, log);
  }

  function runFlyVisual(toCabin, title, done) {
    state.osDoor = "food";
    paintOsDoors();
    setNavOpen(true);
    document.querySelectorAll("[data-food-room]").forEach(function (row) {
      row.classList.toggle("is-fly-target", row.getAttribute("data-food-room") === toCabin);
    });
    var target = document.querySelector('.nav-drawer [data-food-room="' + toCabin + '"]');
    var ghost = document.createElement("div");
    ghost.className = "food-fly-ghost";
    ghost.textContent = title || "Meal";
    document.body.appendChild(ghost);
    setTimeout(function () {
      var rect = target ? target.getBoundingClientRect() : { left: 16, top: 120 };
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      ghost.style.width = "44px";
      ghost.style.height = "44px";
    }, 340);
    setTimeout(function () {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      document.querySelectorAll(".is-fly-target").forEach(function (row) { row.classList.remove("is-fly-target"); });
      setNavOpen(false);
      done();
    }, 1100);
  }

  function flyFood(fromCabin, action, cardId, extra) {
    extra = extra || {};
    var toCabin = FLY_ALLOW[fromCabin] && FLY_ALLOW[fromCabin][action];
    if (!toCabin) {
      state.foodFlyError = "That move is not allowed.";
      render();
      return;
    }
    if (action === "finished_week" || action === "month_complete") {
      state.foodFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return;
    }
    if (action === "finished_week") {
      var later = readV22(FOOD_V22.later);
      later.cards = later.cards || {};
      later.order = later.order || [];
      if (later.cards[cardId]) {
        state.foodToast = "This card has already been added to save later.";
        state.foodToastUntil = Date.now() + 4000;
        state.foodFlyError = "";
        render();
        setTimeout(function () {
          if (state.foodToastUntil && Date.now() >= state.foodToastUntil) {
            state.foodToast = "";
            render();
          }
        }, 4100);
        return;
      }
      later.cards[cardId] = extra.card;
      later.order.push(cardId);
      writeV22(FOOD_V22.later, later);
      var hgDone = readV22(FOOD_V22.hg);
      hgDone.finished = hgDone.finished || {};
      hgDone.finished[cardId] = true;
      writeV22(FOOD_V22.hg, hgDone);
    }
    if (action === "add_cabinet") {
      var cab = readV22(FOOD_V22.cabinet);
      cab.order = cab.order || [];
      if (cab.order.indexOf(cardId) === -1) cab.order.push(cardId);
      writeV22(FOOD_V22.cabinet, cab);
    }
    if (action === "add_hg" || action === "reuse_hg") {
      var hg = readV22(FOOD_V22.hg);
      hg.pool = hg.pool || [];
      var ids = action === "reuse_hg" && extra.card ? (extra.card.mealIds || []) : [cardId];
      ids.forEach(function (id) {
        if (id && hg.pool.indexOf(id) === -1) hg.pool.push(id);
      });
      if (action === "add_hg") landFoodCard(hg, cardId);
      if (action === "reuse_hg" && extra.card) restoreFoodMonth(hg, extra.card);
      writeV22(FOOD_V22.hg, hg);
    }
    if (action === "month_complete") {
      var fin = readV22(FOOD_V22.final);
      fin.cards = fin.cards || {};
      fin.order = fin.order || [];
      fin.cards[cardId] = extra.card;
      if (fin.order.indexOf(cardId) === -1) fin.order.push(cardId);
      writeV22(FOOD_V22.final, fin);
      state.foodFocusId = cardId;
    }
    if (action === "create_meal") {
      var meals = ensureMealSeed();
      meals.cards[cardId] = extra.card;
      writeV22(FOOD_V22.meals, meals);
      state.foodFocusId = cardId;
      state.foodEditing = true;
    }
    logFly({
      fromCabin: fromCabin,
      toCabin: toCabin,
      cardId: cardId,
      action: action,
      at: new Date().toISOString()
    });
    state.foodFlyError = "";
    var title = (extra.card && extra.card.title) || (mealById(cardId) && mealById(cardId).title) || cardId;
    runFlyVisual(toCabin, title, function () {
      if (action === "month_complete" || action === "create_meal") openFoodRoom(toCabin, cardId);
      else openFoodRoom(toCabin, "");
    });
  }

  function hgWindowMonths() {
    var start = state.hgWindow === "2027-01" ? { year: 2027, month: 1 } : { year: 2026, month: 10 };
    var out = [];
    for (var i = 0; i < 3; i++) {
      var date = new Date(Date.UTC(start.year, start.month - 1 + i, 1, 12));
      var parts = londonParts(date);
      out.push({ year: parts.year, month: parts.month });
    }
    return out;
  }

  function hgWeeks(year, month) {
    var anchor = londonParts(new Date(Date.UTC(year, month - 1, 1, 12)));
    var names = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    var index = names[String(anchor.weekday || "").slice(0, 3)];
    if (index == null) index = 0;
    var monday = Date.UTC(anchor.year, anchor.month - 1, anchor.day, 12) - index * 86400000;
    var weeks = [[], [], [], []];
    var seen = {};
    for (var w = 0; w < 4; w++) {
      for (var i = 0; i < 7; i++) {
        var parts = londonParts(new Date(monday + (w * 7 + i) * 86400000));
        parts.sunday = String(parts.weekday || "").slice(0, 3) === "Sun";
        weeks[w].push(parts);
        if (parts.year === year && parts.month === month) seen[parts.dateKey] = true;
      }
    }
    var last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (var day = 1; day <= last; day++) {
      var extra = londonParts(new Date(Date.UTC(year, month - 1, day, 12)));
      if (!seen[extra.dateKey]) {
        extra.sunday = String(extra.weekday || "").slice(0, 3) === "Sun";
        weeks[3].push(extra);
      }
    }
    return weeks;
  }

  function placeHg(dateKey, slot, cardId, mode, weekday) {
    var card = mealById(cardId);
    if (!card) {
      state.foodFlyError = "Pick a meal from the HG pool first.";
      render();
      return;
    }
    if (slot === "dinner" && card.kind === "extraction") {
      state.foodFlyError = "Extractions aren't dinner.";
      render();
      return;
    }
    var hg = readV22(FOOD_V22.hg);
    hg.placements = hg.placements || {};
    var dates = [dateKey];
    if (mode === "all") {
      dates = [];
      hgWindowMonths().forEach(function (entry) {
        hgWeeks(entry.year, entry.month).forEach(function (week) {
          week.forEach(function (day) {
            if (String(day.weekday || "").slice(0, 3) === weekday && dates.indexOf(day.dateKey) === -1) dates.push(day.dateKey);
          });
        });
      });
    }
    dates.forEach(function (key) {
      var row = hg.placements[key] || {};
      row[slot] = cardId;
      hg.placements[key] = row;
    });
    writeV22(FOOD_V22.hg, hg);
    state.foodFlyError = "";
    render();
  }

  function weekPlacements(year, month, weekIndex) {
    var days = hgWeeks(year, month)[weekIndex] || [];
    var hg = readV22(FOOD_V22.hg);
    var placements = {};
    var mealIds = [];
    var complete = days.length > 0;
    days.forEach(function (day) {
      var row = (hg.placements && hg.placements[day.dateKey]) || {};
      placements[day.dateKey] = { breakfast: row.breakfast || "", lunch: row.lunch || "", dinner: row.dinner || "" };
      ["breakfast", "lunch", "dinner"].forEach(function (slot) {
        if (!row[slot]) complete = false;
        else if (mealIds.indexOf(row[slot]) === -1) mealIds.push(row[slot]);
      });
    });
    return { days: days, placements: placements, mealIds: mealIds, complete: complete };
  }

  function weekCardId(year, month, week) {
    return "week-" + year + "-" + pad2(month) + "-w" + week;
  }

  function finishWeek(year, month, week) {
    var packed = weekPlacements(year, month, week - 1);
    if (!packed.complete) {
      state.foodFlyError = "Fill every breakfast, lunch, and dinner in this week first.";
      render();
      return;
    }
    var id = weekCardId(year, month, week);
    flyFood("hg", "finished_week", id, {
      card: {
        cardId: id,
        title: MONTH_LABEL[month] + " " + year + " · Week " + week,
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        month: year + "-" + pad2(month),
        week: week,
        placements: packed.placements,
        mealIds: packed.mealIds
      }
    });
  }

  function finishMonth(year, month) {
    var weeks = [];
    for (var w = 1; w <= 4; w++) {
      var id = weekCardId(year, month, w);
      var later = readV22(FOOD_V22.later);
      if (!later.cards || !later.cards[id]) {
        state.foodFlyError = "Finish weeks 1 to 4 into Save later before this month can fly to Final.";
        render();
        return;
      }
      weeks.push(later.cards[id]);
    }
    var finalId = "final-" + year + "-" + pad2(month);
    flyFood("hg", "month_complete", finalId, {
      card: {
        cardId: finalId,
        title: MONTH_LABEL[month] + " " + year,
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        weeks: weeks
      }
    });
  }

  var FOOD_SLOTS = ["breakfast", "lunch", "dinner"];
  var PACK_ASK = "All 4 weeks complete — add this timetable to Save later?";

  function monthKey(year, month) {
    return year + "-" + pad2(month);
  }

  function ensureMonthStore(record) {
    record.months = record.months || {};
    if (!record.monthsMigrated && record.placements && Object.keys(record.placements).length) {
      var legacy = record.months["2026-10"] || { placements: {} };
      legacy.placements = legacy.placements || {};
      Object.keys(record.placements).forEach(function (date) {
        if (!legacy.placements[date]) legacy.placements[date] = record.placements[date];
      });
      record.months["2026-10"] = legacy;
      record.monthsMigrated = true;
    }
    return record;
  }

  function monthBucket(record, year, month) {
    ensureMonthStore(record);
    var key = monthKey(year, month);
    if (!record.months[key]) record.months[key] = { placements: {} };
    record.months[key].placements = record.months[key].placements || {};
    return record.months[key];
  }

  function firstEmptyCell(record, year, month, slots) {
    var weeks = hgWeeks(year, month);
    for (var w = 0; w < weeks.length; w++) {
      for (var d = 0; d < weeks[w].length; d++) {
        var day = weeks[w][d];
        var row = monthBucket(record, year, month).placements[day.dateKey] || {};
        for (var s = 0; s < slots.length; s++) {
          if (!row[slots[s]]) return { date: day.dateKey, slot: slots[s], week: w + 1 };
        }
      }
    }
    return null;
  }

  function requiredTokens(year, month, slots) {
    var tokens = [];
    hgWeeks(year, month).forEach(function (week, index) {
      week.forEach(function (day) {
        slots.forEach(function (slot) {
          tokens.push({ date: day.dateKey, slot: slot, week: index + 1 });
        });
      });
    });
    return tokens;
  }

  function weekdayShort(dateKey) {
    return String(londonParts(new Date(dateKey + "T12:00:00Z")).weekday || "").slice(0, 3);
  }

  function copyPlacementsInto(bucket, card, slots) {
    function writeRow(date, row) {
      var next = bucket.placements[date] ? Object.assign({}, bucket.placements[date]) : {};
      slots.forEach(function (slot) {
        if (row && row[slot]) next[slot] = row[slot];
      });
      bucket.placements[date] = next;
    }
    (card.weeks || []).forEach(function (week) {
      Object.keys(week.placements || {}).forEach(function (date) {
        writeRow(date, week.placements[date]);
      });
    });
    if (card.placements) {
      Object.keys(card.placements).forEach(function (date) {
        writeRow(date, card.placements[date]);
      });
    }
  }

  function landFoodCard(hg, cardId) {
    ensureMonthStore(hg);
    var drop = firstEmptyCell(hg, state.hgYear, state.hgMonth, FOOD_SLOTS);
    if (!drop) return;
    var row = monthBucket(hg, state.hgYear, state.hgMonth).placements[drop.date] || {};
    row[drop.slot] = cardId;
    monthBucket(hg, state.hgYear, state.hgMonth).placements[drop.date] = row;
    state.foodLandCell = drop.date + "|" + drop.slot;
    state.hgWeek = drop.week;
  }

  function restoreFoodMonth(hg, card) {
    var parts = String(card.month || monthKey(state.hgYear, state.hgMonth)).split("-");
    var year = +parts[0] || state.hgYear;
    var month = +parts[1] || state.hgMonth;
    copyPlacementsInto(monthBucket(hg, year, month), card, FOOD_SLOTS);
    state.hgYear = year;
    state.hgMonth = month;
    state.hgWindow = month >= 10 ? "2026-10" : "2027-01";
    state.hgWeek = 1;
  }

  function foodMonthRecord() {
    var fin = readV22(FOOD_V22.final);
    fin.months = fin.months || {};
    return fin;
  }

  function resetFoodTick(date, slot) {
    var fin = foodMonthRecord();
    var pack = fin.months[monthKey(state.hgYear, state.hgMonth)];
    if (!pack || !pack.ticks) return;
    delete pack.ticks[date + "|" + slot];
    writeV22(FOOD_V22.final, fin);
  }

  function placeFoodCell(date, slot, cardId) {
    var card = mealById(cardId);
    if (!card) {
      state.foodFlyError = "Pick a meal from the pool first.";
      render();
      return;
    }
    if (slot === "dinner" && card.kind === "extraction") {
      state.foodFlyError = "Extractions aren't dinner.";
      render();
      return;
    }
    var hg = readV22(FOOD_V22.hg);
    var bucket = monthBucket(hg, state.hgYear, state.hgMonth);
    var row = bucket.placements[date] || {};
    if (row[slot] && row[slot] !== cardId) resetFoodTick(date, slot);
    row[slot] = cardId;
    bucket.placements[date] = row;
    writeV22(FOOD_V22.hg, hg);
    state.foodLandCell = date + "|" + slot;
    state.foodFlyError = "";
    state.foodGrid = null;
    render();
  }

  function clearFoodCell(date, slot) {
    var hg = readV22(FOOD_V22.hg);
    var bucket = monthBucket(hg, state.hgYear, state.hgMonth);
    var row = bucket.placements[date] || {};
    delete row[slot];
    bucket.placements[date] = row;
    writeV22(FOOD_V22.hg, hg);
    var fin = foodMonthRecord();
    var key = monthKey(state.hgYear, state.hgMonth);
    var pack = fin.months[key];
    if (pack) {
      if (pack.cards) delete pack.cards[date + "|" + slot];
      if (pack.ticks) delete pack.ticks[date + "|" + slot];
      writeV22(FOOD_V22.final, fin);
    }
    state.foodGrid = null;
    state.foodPackAsk = "";
    render();
  }

  function copyFoodWeekday(date, slot, cardId, weekday) {
    var hg = readV22(FOOD_V22.hg);
    var bucket = monthBucket(hg, state.hgYear, state.hgMonth);
    hgWeeks(state.hgYear, state.hgMonth).forEach(function (week) {
      week.forEach(function (day) {
        if (String(day.weekday || "").slice(0, 3) !== weekday) return;
        var row = bucket.placements[day.dateKey] || {};
        if (row[slot] && row[slot] !== cardId) resetFoodTick(day.dateKey, slot);
        row[slot] = cardId;
        bucket.placements[day.dateKey] = row;
      });
    });
    writeV22(FOOD_V22.hg, hg);
    state.foodLandCell = date + "|" + slot;
    state.foodGrid = null;
    render();
  }

  function lockFoodMonth() {
    var year = state.hgYear;
    var month = state.hgMonth;
    var hg = readV22(FOOD_V22.hg);
    var bucket = monthBucket(hg, year, month);
    var tokens = requiredTokens(year, month, FOOD_SLOTS);
    var missing = tokens.some(function (token) {
      return !((bucket.placements[token.date] || {})[token.slot]);
    });
    if (missing) {
      state.foodFlyError = "Fill every breakfast, lunch, and dinner across Weeks 1–4 before locking.";
      render();
      return;
    }
    var fin = foodMonthRecord();
    var key = monthKey(year, month);
    var prev = fin.months[key] || { cards: {}, ticks: {} };
    var cards = {};
    var ticks = {};
    var weeks = [];
    hgWeeks(year, month).forEach(function (week, index) {
      var placements = {};
      week.forEach(function (day) {
        var row = bucket.placements[day.dateKey] || {};
        placements[day.dateKey] = {
          breakfast: row.breakfast || "",
          lunch: row.lunch || "",
          dinner: row.dinner || ""
        };
      });
      weeks.push({ week: index + 1, placements: placements });
    });
    tokens.forEach(function (token) {
      var id = bucket.placements[token.date][token.slot];
      var mark = token.date + "|" + token.slot;
      cards[mark] = id;
      if (prev.cards && prev.cards[mark] === id && prev.ticks && prev.ticks[mark]) ticks[mark] = true;
    });
    fin.months[key] = {
      month: key,
      title: MONTH_LABEL[month] + " " + year,
      weeks: weeks,
      cards: cards,
      ticks: ticks,
      locked: true
    };
    fin.order = fin.order || [];
    if (fin.order.indexOf(key) === -1) fin.order.push(key);
    writeV22(FOOD_V22.final, fin);
    state.foodGrid = null;
    state.foodPackAsk = "";
    state.foodFlyError = "";
    openFoodRoom("final");
  }

  function foodAllTicked() {
    var fin = foodMonthRecord();
    var pack = fin.months[monthKey(state.hgYear, state.hgMonth)];
    if (!pack || !pack.locked) return false;
    return requiredTokens(state.hgYear, state.hgMonth, FOOD_SLOTS).every(function (token) {
      var mark = token.date + "|" + token.slot;
      return pack.cards && pack.cards[mark] && pack.ticks && pack.ticks[mark];
    });
  }

  function syncFoodPackAsk() {
    if (!foodAllTicked()) {
      state.foodPackAsk = "";
      return;
    }
    if (state.foodPackAsk !== "dismissed") state.foodPackAsk = "ask";
  }

  function rememberFoodToast() {
    state.foodToastUntil = Date.now() + 4000;
    setTimeout(function () {
      if (state.foodToastUntil && Date.now() >= state.foodToastUntil) {
        state.foodToast = "";
        render();
      }
    }, 4100);
  }

  function saveFoodPack() {
    if (!foodAllTicked()) {
      state.foodFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return;
    }
    var key = monthKey(state.hgYear, state.hgMonth);
    var id = "pack-" + key;
    var later = readV22(FOOD_V22.later);
    later.cards = later.cards || {};
    later.order = later.order || [];
    if (later.cards[id]) {
      state.foodToast = "This card has already been added to save later.";
      state.foodFlyError = "";
      state.foodPackAsk = "";
      rememberFoodToast();
      render();
      return;
    }
    var pack = foodMonthRecord().months[key];
    later.cards[id] = {
      cardId: id,
      title: pack.title + " timetable",
      madeOn: londonParts(new Date()).dateKey,
      month: key,
      weeks: pack.weeks,
      cards: pack.cards,
      ticks: pack.ticks
    };
    later.order.push(id);
    writeV22(FOOD_V22.later, later);
    state.foodPackAsk = "";
    state.foodOffer = id;
    state.foodFlyError = "";
    openFoodRoom("savelater");
  }

  function reopenFoodPack(cardId) {
    var card = (readV22(FOOD_V22.later).cards || {})[cardId];
    if (!card) return;
    var hg = readV22(FOOD_V22.hg);
    restoreFoodMonth(hg, card);
    writeV22(FOOD_V22.hg, hg);
    state.foodGrid = null;
    state.foodOffer = "";
    openFoodRoom("hg");
  }

  function cleanFoodMonth() {
    var hg = readV22(FOOD_V22.hg);
    var bucket = monthBucket(hg, state.hgYear, state.hgMonth);
    bucket.placements = {};
    writeV22(FOOD_V22.hg, hg);
    state.foodOffer = "";
    state.foodGrid = null;
    openFoodRoom("hg");
  }

  function toggleFoodTick(date, slot) {
    var fin = foodMonthRecord();
    var pack = fin.months[monthKey(state.hgYear, state.hgMonth)];
    if (!pack || !pack.cards || !pack.cards[date + "|" + slot]) return;
    pack.ticks = pack.ticks || {};
    var mark = date + "|" + slot;
    if (pack.ticks[mark]) delete pack.ticks[mark];
    else pack.ticks[mark] = true;
    writeV22(FOOD_V22.final, fin);
    state.foodGrid = null;
    syncFoodPackAsk();
    render();
  }

  function foodFiltersHtml() {
    var months = hgWindowMonths();
    var html = '<div class="food-filters">';
    html += '<button type="button" data-v22="window" data-window="2026-10"' + (state.hgWindow === "2026-10" ? ' aria-pressed="true"' : "") + ">Oct–Dec</button>";
    html += '<button type="button" data-v22="window" data-window="2027-01"' + (state.hgWindow === "2027-01" ? ' aria-pressed="true"' : "") + ">Jan–Mar</button>";
    html += "</div><div class=\"food-filters\">";
    months.forEach(function (entry) {
      html += '<button type="button" data-v22="month" data-year="' + entry.year + '" data-month="' + entry.month + '"' +
        (entry.month === state.hgMonth && entry.year === state.hgYear ? ' aria-pressed="true"' : "") + ">" +
        MONTH_LABEL[entry.month] + "</button>";
    });
    html += "</div>";
    return html;
  }

  function foodGridHtml() {
    var grid = state.foodGrid;
    if (!grid) return "";
    var card = mealById(grid.cardId);
    if (!card) return "";
    var short = weekdayShort(grid.date);
    var html = '<div class="grid-recipe">';
    html += '<button type="button" class="food-fly-btn" data-v22="back-grid">Back to grid</button>';
    html += v22CardHtml(card);
    html += '<div class="recipe-actions">';
    if (grid.where === "draft") {
      html += '<button type="button" class="draft-remove" data-v22="clear-cell" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '">Remove</button>';
      html += '<button type="button" class="food-fly-btn" data-v22="copy-weekday" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '" data-card="' + escapeHtml(grid.cardId) + '" data-weekday="' + short + '">Copy to other ' + escapeHtml(WEEKDAY_ALL[short] || "days") + "</button>";
    } else {
      var pack = foodMonthRecord().months[monthKey(state.hgYear, state.hgMonth)];
      var on = pack && pack.ticks && pack.ticks[grid.date + "|" + grid.slot];
      html += '<button type="button" class="draft-remove" data-v22="clear-final" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '">Remove</button>';
      html += '<button type="button" class="slot-tick" data-v22="tick" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '" aria-pressed="' + (on ? "true" : "false") + '">' + (on ? "Done" : "Tick") + "</button>";
    }
    html += "</div></div>";
    return html;
  }

  function v22CardHtml(card) {
    var ingredients = (card.ingredients || []).map(function (item) {
      return "<li>" + escapeHtml(item.text || "") + "</li>";
    }).join("");
    var method = (card.method || []).map(function (step, index) {
      return "<li><strong>" + escapeHtml(step.verb || "") + "</strong> " + escapeHtml(step.detail || "") + "</li>";
    }).join("");
    return '<article class="recipe-card food-forensic" data-kind="meal" id="card-' + escapeHtml(card.cardId) + '">' +
      '<p class="recipe-kicker">' + escapeHtml((card.family || "meal").toUpperCase()) + "</p>" +
      "<h3>" + escapeHtml(card.title) + "</h3>" +
      '<p class="food-made">Made ' + escapeHtml(card.madeOn || "") + (card.noteCode ? " · " + escapeHtml(card.noteCode) : "") + "</p>" +
      (card.tagline ? '<p class="recipe-tagline">' + escapeHtml(card.tagline) + "</p>" : "") +
      "<h4>Ingredients</h4><ul class=\"recipe-ingredients\">" + ingredients + "</ul>" +
      "<h4>Method</h4><ol class=\"recipe-method\">" + method + "</ol>" +
      (card.tip ? '<p class="recipe-tip">' + escapeHtml(card.tip) + "</p>" : "") +
      "</article>";
  }

  function paintMealsV22() {
    var host = $("food-meals");
    if (!host) return;
    var store = ensureMealSeed();
    var card = state.foodFocusId ? store.cards[state.foodFocusId] : null;
    var html = foodBannersHtml();
    if (card && state.foodEditing) {
      html += '<form class="food-editor" data-v22="editor">' +
        '<label>Title<input name="title" value="' + escapeHtml(card.title) + '"></label>' +
        '<label>Note code<input name="noteCode" value="' + escapeHtml(card.noteCode || "") + '"></label>' +
        '<p class="food-made">Made ' + escapeHtml(card.madeOn) + "</p>" +
        '<label>Ingredients, one line each<textarea name="ingredients" rows="6">' +
          escapeHtml((card.ingredients || []).map(function (item) { return item.text; }).join("\n")) + "</textarea></label>" +
        '<label>Method, one step each line<textarea name="method" rows="6">' +
          escapeHtml((card.method || []).map(function (step) { return (step.verb || "Cook") + " " + (step.detail || ""); }).join("\n")) + "</textarea></label>" +
        '<label>Notes<textarea name="tip" rows="3">' + escapeHtml(card.tip || "") + "</textarea></label>" +
        '<button type="button" data-v22="save-meal" data-card="' + escapeHtml(card.cardId) + '">Save meal</button>' +
        "</form>";
    } else if (card) {
      html += '<button type="button" class="food-fly-btn" data-v22="back-meals">All meal cards</button>' + v22CardHtml(card) +
        '<div class="food-fly-actions">' +
        '<button type="button" class="food-fly-btn" data-v22="edit-meal" data-card="' + escapeHtml(card.cardId) + '">Edit</button>' +
        '<button type="button" class="food-fly-btn" data-v22="fly" data-from="meals" data-action="add_cabinet" data-card="' + escapeHtml(card.cardId) + '">Add to Main Meal Cabinet</button>' +
        '<button type="button" class="food-fly-btn" data-v22="fly" data-from="meals" data-action="add_hg" data-card="' + escapeHtml(card.cardId) + '">Add to Draft Food Schedule</button>' +
        "</div>";
    } else {
      html += '<button type="button" class="food-fly-btn" data-v22="new-meal">New meal card</button>';
      Object.keys(store.cards).forEach(function (id) {
        var row = store.cards[id];
        html += '<button type="button" class="food-jump" data-v22="open-meal" data-card="' + escapeHtml(id) + '">' +
          escapeHtml(row.title) + "<span>Made " + escapeHtml(row.madeOn || "") + "</span></button>";
      });
    }
    host.innerHTML = html;
  }

  function paintCabinet() {
    var host = $("food-cabinet");
    if (!host) return;
    ensureMealSeed();
    var cab = readV22(FOOD_V22.cabinet);
    var order = cab.order || [];
    var html = foodBannersHtml();
    var focus = state.foodFocusId ? mealById(state.foodFocusId) : null;
    if (focus) {
      html += '<button type="button" class="food-fly-btn" data-v22="back-cabinet">Cabinet</button>' + v22CardHtml(focus) +
        '<div class="food-fly-actions"><button type="button" class="food-fly-btn" data-v22="fly" data-from="cabinet" data-action="add_hg" data-card="' +
        escapeHtml(focus.cardId) + '">Add to Draft Food Schedule</button></div>';
    } else {
      html += '<div class="food-cabinet-scroller" aria-label="Main Meal Cabinet">';
      order.forEach(function (id) {
        var card = mealById(id);
        if (!card) return;
        html += '<button type="button" class="food-mini" data-v22="open-cabinet" data-card="' + escapeHtml(id) + '">' +
          "<strong>" + escapeHtml(card.title) + "</strong><span>" + escapeHtml(card.madeOn || "") + "</span></button>";
      });
      html += "</div>";
    }
    host.innerHTML = html;
  }

  function syncHgMonth() {
    if (state.hgMonth < 1) state.hgMonth = 10;
    var months = hgWindowMonths();
    var active = months.filter(function (entry) { return entry.year === state.hgYear && entry.month === state.hgMonth; })[0] || months[0];
    state.hgYear = active.year;
    state.hgMonth = active.month;
    return active;
  }

  function paintHg() {
    var host = $("food-hg");
    if (!host) return;
    ensureMealSeed();
    if (state.foodGrid && state.foodGrid.where === "draft") {
      host.innerHTML = foodBannersHtml() + foodGridHtml();
      return;
    }
    var hg = readV22(FOOD_V22.hg);
    ensureMonthStore(hg);
    var pool = hg.pool || [];
    syncHgMonth();
    var bucket = monthBucket(hg, state.hgYear, state.hgMonth);
    var weeks = hgWeeks(state.hgYear, state.hgMonth);
    var html = foodBannersHtml() + foodFiltersHtml();
    html += '<div class="food-filters">';
    for (var w = 1; w <= 4; w++) {
      html += '<button type="button" data-v22="hg-week" data-week="' + w + '"' + (state.hgWeek === w ? ' aria-pressed="true"' : "") + ">Week " + w + "</button>";
    }
    html += "</div>";
    html += '<div class="food-cabinet-scroller" aria-label="Draft pool">';
    if (!pool.length) html += '<p class="food-made">Fly a meal here from Meal Recipe Cards or the Cabinet.</p>';
    pool.forEach(function (id) {
      var card = mealById(id);
      if (!card) return;
      html += '<button type="button" class="food-mini" data-v22="pick" data-card="' + escapeHtml(id) + '"' +
        (state.hgPick === id ? ' aria-pressed="true"' : "") + "><strong>" + escapeHtml(card.title) + "</strong></button>";
    });
    html += "</div>";
    (weeks[state.hgWeek - 1] || weeks[0] || []).forEach(function (day) {
      var placed = bucket.placements[day.dateKey] || {};
      html += '<article class="food-day' + (day.sunday ? " is-sunday" : "") + '">';
      html += "<header class=\"food-day-head\"><h3>" + escapeHtml(day.weekday) + "</h3><p>" + escapeHtml(day.dateKey) + "</p>";
      if (day.sunday) html += '<p class="food-sunday-label">Food Prep + Fuel Day</p>';
      html += "</header>";
      FOOD_SLOTS.forEach(function (slot) {
        var chosen = placed[slot] ? mealById(placed[slot]) : null;
        var landed = state.foodLandCell === day.dateKey + "|" + slot ? " is-landed" : "";
        html += '<div class="draft-cell' + landed + '"><span class="draft-slot">' + slot + "</span>";
        if (chosen) {
          html += '<button type="button" class="draft-card" data-v22="open-grid" data-where="draft" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" data-card="' + escapeHtml(chosen.cardId) + '">' + escapeHtml(chosen.title) + "</button>";
          html += '<button type="button" class="draft-remove" data-v22="clear-cell" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '">Remove</button>';
        } else {
          html += '<button type="button" class="draft-empty" data-v22="place-cell" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '">Empty</button>';
        }
        html += "</div>";
      });
      html += "</article>";
    });
    html += '<button type="button" class="food-fly-btn" data-v22="lock-month">Lock into Final Timetable</button>';
    host.innerHTML = html;
  }

  function paintFinal() {
    var host = $("food-final");
    if (!host) return;
    ensureMealSeed();
    if (state.foodGrid && state.foodGrid.where === "final") {
      host.innerHTML = foodBannersHtml() + foodGridHtml();
      return;
    }
    syncHgMonth();
    syncFoodPackAsk();
    var fin = foodMonthRecord();
    var pack = fin.months[monthKey(state.hgYear, state.hgMonth)];
    var weeks = hgWeeks(state.hgYear, state.hgMonth);
    var html = foodBannersHtml() + foodFiltersHtml();
    html += '<button type="button" class="food-fly-btn" data-v22="edit-draft">Edit draft</button>';
    if (state.foodPackAsk === "ask") {
      html += '<div class="pack-ask" role="dialog" aria-label="Save later"><p>' + PACK_ASK + '</p>' +
        '<button type="button" data-v22="save-pack">Add</button>' +
        '<button type="button" data-v22="dismiss-pack">Not yet</button></div>';
    }
    for (var w = 1; w <= 4; w++) {
      var days = weeks[w - 1] || [];
      html += '<section class="food-final-week"><h3>Week ' + w + "</h3>";
      if (!pack || !pack.locked) html += '<p class="food-made">Empty until this month is locked from the Draft Food Schedule.</p>';
      days.forEach(function (day) {
        var row = pack && pack.locked ? (((pack.weeks[w - 1] || {}).placements || {})[day.dateKey] || {}) : {};
        html += '<article class="food-day"><header class="food-day-head"><h3>' + escapeHtml(day.weekday) + "</h3><p>" + escapeHtml(day.dateKey) + "</p></header>";
        FOOD_SLOTS.forEach(function (slot) {
          var meal = row[slot] ? mealById(row[slot]) : null;
          var mark = day.dateKey + "|" + slot;
          var on = pack && pack.ticks && pack.ticks[mark];
          html += '<div class="draft-cell"><span class="draft-slot">' + slot + "</span>";
          if (meal) {
            html += '<button type="button" class="draft-card" data-v22="open-grid" data-where="final" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" data-card="' + escapeHtml(meal.cardId) + '">' + escapeHtml(meal.title) + "</button>";
            html += '<button type="button" class="slot-tick" data-v22="tick" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="Tick ' + slot + '">' + (on ? "✓" : "") + "</button>";
          } else {
            html += '<span class="draft-empty">Empty</span>';
          }
          html += "</div>";
        });
        html += "</article>";
      });
      html += "</section>";
    }
    host.innerHTML = html;
  }

  function paintSaveLater() {
    var host = $("food-savelater");
    if (!host) return;
    var later = readV22(FOOD_V22.later);
    var html = foodBannersHtml();
    if (state.foodOffer && later.cards && later.cards[state.foodOffer]) {
      html += '<p class="food-made">Saved. Amend this draft, or clear this month and build again.</p>';
      html += '<button type="button" class="food-fly-btn" data-v22="reopen-pack" data-card="' + escapeHtml(state.foodOffer) + '">Amend in Draft Food Schedule</button>';
      html += '<button type="button" class="food-fly-btn" data-v22="clean-month">Clean slate</button>';
    }
    html += '<div class="food-cabinet-scroller" aria-label="Save later">';
    (later.order || []).forEach(function (id) {
      var card = later.cards[id];
      if (!card) return;
      html += '<button type="button" class="food-mini" data-v22="reopen-pack" data-card="' + escapeHtml(id) + '"><strong>' +
        escapeHtml(card.title) + "</strong><span>" + escapeHtml(card.madeOn || "") + "</span></button>";
    });
    html += "</div>";
    host.innerHTML = html;
  }

  function shopGroupName(tag) {
    if (tag === "protein") return "protein";
    if (tag === "dairy") return "dairy";
    if (tag === "veg" || tag === "fruit") return "produce";
    if (tag === "freezer") return "frozen";
    return "cupboard";
  }

  function paintShopV22() {
    var host = $("food-shop");
    if (!host) return;
    var pack = packApi();
    var items = pack && pack.shop ? pack.shop.items : [];
    var meals = ensureMealSeed().cards;
    var tagged = {};
    Object.keys(meals).forEach(function (id) {
      (meals[id].ingredients || []).forEach(function (item) {
        if (item.skuId) tagged[item.skuId] = true;
      });
    });
    var groups = { protein: [], dairy: [], produce: [], cupboard: [], frozen: [] };
    var gaps = [];
    var untagged = null;
    items.forEach(function (item) {
      if (item.household) return;
      var line = escapeHtml(item.customName || item.name) + " · " + item.qty + " · £" + ((item.pricePence || 0) * item.qty / 100).toFixed(2);
      if (item.priceStatus === "ESTIMATE") gaps.push("<li>" + line + " · ESTIMATE</li>");
      if (item.priceStatus === "RECEIPT_TRUE") {
        groups[shopGroupName(item.tag)].push("<li>" + line + "</li>");
        if (!tagged[item.skuId] && !untagged && item.tag !== "other") untagged = item;
      }
    });
    if (!untagged) {
      items.forEach(function (item) {
        if (!untagged && item.priceStatus === "ESTIMATE" && !item.household && !tagged[item.skuId]) untagged = item;
      });
    }
    var suggestions = [];
    if (untagged) {
      var partners = Object.keys(meals).slice(0, 6);
      partners.forEach(function (id, index) {
        var base = meals[id];
        var cardId = "suggest-" + String(untagged.skuId || "line").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + (index + 1);
        suggestions.push({
          cardId: cardId,
          title: (untagged.customName || untagged.name) + " with " + base.title,
          madeOn: londonParts(new Date()).dateKey,
          noteCode: "",
          kind: "meal",
          family: "meal",
          tagline: "Pairs with a Cabinet meal.",
          ingredients: (base.ingredients || []).concat([{ text: untagged.customName || untagged.name, skuId: untagged.skuId }]),
          method: base.method || [],
          tip: "Cook egg whites when eggs are in the pan. One Brazil nut a day only if that tin was purchased.",
          fresh: true
        });
      });
    }
    state.foodSuggestions = suggestions;
    writeV22(FOOD_V22.shop, {
      softLockGbp: 200,
      untaggedSku: untagged ? untagged.skuId : "",
      suggestionIds: suggestions.map(function (card) { return card.cardId; })
    });
    var html = foodBannersHtml();
    html += '<section class="food-shop-panel"><h3>This month’s trolley</h3><p class="food-made">Soft lock £200</p>';
    ["protein", "dairy", "produce", "cupboard", "frozen"].forEach(function (name) {
      if (!groups[name].length) return;
      html += "<h4>" + name + "</h4><ul>" + groups[name].join("") + "</ul>";
    });
    html += "</section>";
    html += '<section class="food-shop-panel"><h3>Gaps</h3><ul>' + (gaps.join("") || "<li>No ESTIMATE gaps on this trolley.</li>") + "</ul></section>";
    html += '<section class="food-shop-panel"><h3>New product → 6 meals</h3>';
    if (!suggestions.length) html += "<p>Every trolley food already has a meal card.</p>";
    suggestions.forEach(function (card, index) {
      html += '<button type="button" class="food-fly-btn" data-v22="suggest" data-index="' + index + '">' + escapeHtml(card.title) + "</button>";
    });
    html += "</section>";
    host.innerHTML = html;
  }

  function onV22Click(event) {
    var node = event.target.closest("[data-v22]");
    if (!node) return false;
    var kind = node.getAttribute("data-v22");
    var cardId = node.getAttribute("data-card") || "";
    if (kind === "open-meal" || kind === "open-cabinet" || kind === "open-later") {
      state.foodFocusId = cardId;
      state.foodEditing = false;
      render();
      return true;
    }
    if (kind === "back-meals" || kind === "back-cabinet" || kind === "back-later") {
      state.foodFocusId = "";
      state.foodEditing = false;
      render();
      return true;
    }
    if (kind === "edit-meal") {
      state.foodEditing = true;
      render();
      return true;
    }
    if (kind === "new-meal") {
      var id = newCardId();
      var meals = ensureMealSeed();
      meals.cards[id] = {
        cardId: id,
        title: "New meal",
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        kind: "meal",
        family: "meal",
        tagline: "",
        ingredients: [{ text: "" }],
        method: [{ verb: "Cook", detail: "" }],
        tip: "",
        fresh: true
      };
      writeV22(FOOD_V22.meals, meals);
      state.foodFocusId = id;
      state.foodEditing = true;
      render();
      return true;
    }
    if (kind === "save-meal") {
      var form = node.closest("form");
      var existing = mealById(cardId);
      if (form && existing) {
        existing.title = form.querySelector('[name="title"]').value.trim() || existing.title;
        existing.noteCode = form.querySelector('[name="noteCode"]').value.trim();
        existing.ingredients = form.querySelector('[name="ingredients"]').value.split("\n").map(function (line) {
          return { text: line.trim() };
        }).filter(function (item) { return item.text; });
        existing.method = form.querySelector('[name="method"]').value.split("\n").map(function (line) {
          var parts = line.trim().split(/\s+/);
          return { verb: parts.shift() || "Cook", detail: parts.join(" ") };
        }).filter(function (step) { return step.verb || step.detail; });
        existing.tip = form.querySelector('[name="tip"]').value.trim();
        var store = ensureMealSeed();
        store.cards[cardId] = existing;
        writeV22(FOOD_V22.meals, store);
      }
      state.foodEditing = false;
      render();
      return true;
    }
    if (kind === "fly") {
      var from = node.getAttribute("data-from");
      var action = node.getAttribute("data-action");
      var extra = {};
      if (from === "savelater") {
        var saved = readV22(FOOD_V22.later).cards || {};
        extra.card = saved[cardId];
      }
      flyFood(from, action, cardId, extra);
      return true;
    }
    if (kind === "pick") {
      state.hgPick = cardId;
      state.foodFlyError = "";
      render();
      return true;
    }
    if (kind === "place" || kind === "place-cell") {
      if (!state.hgPick) {
        state.foodFlyError = "Pick a meal from the pool first.";
        render();
        return true;
      }
      placeFoodCell(node.getAttribute("data-date"), node.getAttribute("data-slot"), state.hgPick);
      return true;
    }
    if (kind === "open-grid") {
      state.foodGrid = {
        cardId: cardId,
        date: node.getAttribute("data-date"),
        slot: node.getAttribute("data-slot"),
        where: node.getAttribute("data-where") || "draft"
      };
      render();
      return true;
    }
    if (kind === "back-grid") {
      state.foodGrid = null;
      render();
      return true;
    }
    if (kind === "clear-cell" || kind === "clear-final") {
      clearFoodCell(node.getAttribute("data-date"), node.getAttribute("data-slot"));
      return true;
    }
    if (kind === "copy-weekday") {
      copyFoodWeekday(node.getAttribute("data-date"), node.getAttribute("data-slot"), cardId, node.getAttribute("data-weekday"));
      return true;
    }
    if (kind === "lock-month") {
      lockFoodMonth();
      return true;
    }
    if (kind === "tick") {
      toggleFoodTick(node.getAttribute("data-date"), node.getAttribute("data-slot"));
      return true;
    }
    if (kind === "save-pack") {
      saveFoodPack();
      return true;
    }
    if (kind === "dismiss-pack") {
      state.foodPackAsk = "dismissed";
      render();
      return true;
    }
    if (kind === "reopen-pack") {
      reopenFoodPack(cardId);
      return true;
    }
    if (kind === "edit-draft") {
      state.foodGrid = null;
      openFoodRoom("hg");
      return true;
    }
    if (kind === "clean-month") {
      cleanFoodMonth();
      return true;
    }
    if (kind === "window") {
      state.hgWindow = node.getAttribute("data-window");
      var first = hgWindowMonths()[0];
      state.hgYear = first.year;
      state.hgMonth = first.month;
      state.hgWeek = 1;
      render();
      return true;
    }
    if (kind === "month") {
      state.hgYear = +node.getAttribute("data-year");
      state.hgMonth = +node.getAttribute("data-month");
      state.hgWeek = 1;
      render();
      return true;
    }
    if (kind === "hg-week") {
      state.hgWeek = +node.getAttribute("data-week") || 1;
      render();
      return true;
    }
    if (kind === "finish-week" || kind === "finish-month") {
      state.foodFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return true;
    }
    if (kind === "suggest") {
      var suggestion = (state.foodSuggestions || [])[+node.getAttribute("data-index")];
      if (!suggestion) return true;
      flyFood("shop", "create_meal", suggestion.cardId, { card: suggestion });
    }
    return true;
  }

  var SMOOTHIE_V22 = {
    meals: "relic_smoothie_meals_v22",
    cabinet: "relic_smoothie_cabinet_v22",
    hg: "relic_smoothie_hg_v22",
    final: "relic_smoothie_final_v22",
    later: "relic_smoothie_savelater_v22",
    fly: "relic_smoothie_flylog_v22"
  };
  var SMOOTHIE_ALLOW = {
    meals: { add_cabinet: "cabinet", add_hg: "hg" },
    cabinet: { add_hg: "hg" },
    hg: { finished_week: "savelater", month_complete: "final" },
    savelater: { reuse_hg: "hg" }
  };
  var SMOOTHIE_TITLES = {
    meals: "Smoothie Recipe Cards",
    cabinet: "Main Smoothie Cabinet",
    hg: "Draft Smoothie Schedule",
    final: "My 4-Week Smoothie Timetable",
    savelater: "Smoothie Save later"
  };
  var SMOOTHIE_SLOTS = ["morning", "lunch"];

  function smoothieRecord(id, row) {
    return {
      cardId: id,
      title: row.name || row.title || id,
      madeOn: "2026-10-01",
      noteCode: "",
      kind: "extraction",
      family: "extraction",
      tagline: row.tagline || "Morning or lunch.",
      ingredients: (row.ingredients || []).map(function (item) {
        return { text: item.text || "", skuId: item.skuId || "" };
      }),
      method: (row.method || []).map(function (step) {
        return { verb: step.verb || "Blend", detail: step.detail || "" };
      }),
      tip: row.tip || "Morning or lunch only. Extractions aren't dinner.",
      fresh: true
    };
  }

  function ensureSmoothieSeed() {
    var store = readV22(SMOOTHIE_V22.meals);
    store.cards = store.cards || {};
    if (!store.seeded) {
      var pack = packApi();
      if (pack && pack.extractions) {
        Object.keys(pack.extractions).forEach(function (id) {
          var row = pack.extractions[id];
          if (!row || row.kind === "collection" || row.visualOnly) return;
          store.cards[id] = smoothieRecord(id, row);
        });
      }
      var api = foodExtractions();
      if (api && api.order && api.present) {
        api.order.forEach(function (id) {
          if (store.cards[id]) return;
          var row = api.present(id, 1);
          if (!row) return;
          store.cards[id] = smoothieRecord(id, row);
        });
      }
      store.seeded = true;
      writeV22(SMOOTHIE_V22.meals, store);
      var cab = readV22(SMOOTHIE_V22.cabinet);
      if (!cab.order || !cab.order.length) {
        cab.order = Object.keys(store.cards);
        writeV22(SMOOTHIE_V22.cabinet, cab);
      }
    }
    return store;
  }

  function smoothieById(id) {
    return ensureSmoothieSeed().cards[id] || null;
  }

  function smoothieBannersHtml() {
    var html = "";
    if (state.smoothieFlyError) html += '<p class="food-refuse" role="status">' + escapeHtml(state.smoothieFlyError) + "</p>";
    if (state.smoothieToast && state.smoothieToastUntil > Date.now()) {
      html += '<p class="food-toast" role="status">' + escapeHtml(state.smoothieToast) + "</p>";
    }
    return html;
  }

  function logSmoothieFly(entry) {
    var log = readV22(SMOOTHIE_V22.fly);
    log.events = log.events || [];
    log.events.push(entry);
    if (log.events.length > 40) log.events = log.events.slice(-40);
    writeV22(SMOOTHIE_V22.fly, log);
  }

  function runSmoothieFly(toCabin, title, done) {
    state.osDoor = "smoothies";
    paintOsDoors();
    setNavOpen(true);
    document.querySelectorAll("[data-smoothie-room]").forEach(function (row) {
      row.classList.toggle("is-smoothie-target", row.getAttribute("data-smoothie-room") === toCabin);
    });
    var target = document.querySelector('.nav-drawer [data-smoothie-room="' + toCabin + '"]');
    var ghost = document.createElement("div");
    ghost.className = "smoothie-fly-ghost";
    ghost.setAttribute("data-fly", "smoothie");
    ghost.textContent = title || "Smoothie";
    document.body.appendChild(ghost);
    setTimeout(function () {
      var rect = target ? target.getBoundingClientRect() : { left: 16, top: 280 };
      ghost.classList.add("is-pouring");
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      ghost.style.width = "44px";
      ghost.style.height = "44px";
    }, 340);
    setTimeout(function () {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      document.querySelectorAll(".is-smoothie-target").forEach(function (row) { row.classList.remove("is-smoothie-target"); });
      setNavOpen(false);
      done();
    }, 1400);
  }

  function flySmoothie(fromCabin, action, cardId, extra) {
    extra = extra || {};
    var toCabin = SMOOTHIE_ALLOW[fromCabin] && SMOOTHIE_ALLOW[fromCabin][action];
    if (!toCabin) {
      state.smoothieFlyError = "That move is not allowed.";
      render();
      return;
    }
    if (action === "finished_week" || action === "month_complete") {
      state.smoothieFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return;
    }
    if (action === "finished_week") {
      var later = readV22(SMOOTHIE_V22.later);
      later.cards = later.cards || {};
      later.order = later.order || [];
      if (later.cards[cardId]) {
        state.smoothieToast = "This card has already been added to save later.";
        state.smoothieToastUntil = Date.now() + 4000;
        state.smoothieFlyError = "";
        render();
        setTimeout(function () {
          if (state.smoothieToastUntil && Date.now() >= state.smoothieToastUntil) {
            state.smoothieToast = "";
            render();
          }
        }, 4100);
        return;
      }
      later.cards[cardId] = extra.card;
      later.order.push(cardId);
      writeV22(SMOOTHIE_V22.later, later);
      var hgDone = readV22(SMOOTHIE_V22.hg);
      hgDone.finished = hgDone.finished || {};
      hgDone.finished[cardId] = true;
      writeV22(SMOOTHIE_V22.hg, hgDone);
    }
    if (action === "add_cabinet") {
      var cab = readV22(SMOOTHIE_V22.cabinet);
      cab.order = cab.order || [];
      if (cab.order.indexOf(cardId) === -1) cab.order.push(cardId);
      writeV22(SMOOTHIE_V22.cabinet, cab);
    }
    if (action === "add_hg" || action === "reuse_hg") {
      var hg = readV22(SMOOTHIE_V22.hg);
      hg.pool = hg.pool || [];
      var ids = action === "reuse_hg" && extra.card ? (extra.card.mealIds || []) : [cardId];
      ids.forEach(function (id) {
        if (id && hg.pool.indexOf(id) === -1) hg.pool.push(id);
      });
      if (action === "add_hg") landSmoothieCard(hg, cardId);
      if (action === "reuse_hg" && extra.card) restoreSmoothieMonth(hg, extra.card);
      writeV22(SMOOTHIE_V22.hg, hg);
    }
    if (action === "month_complete") {
      var fin = readV22(SMOOTHIE_V22.final);
      fin.cards = fin.cards || {};
      fin.order = fin.order || [];
      fin.cards[cardId] = extra.card;
      if (fin.order.indexOf(cardId) === -1) fin.order.push(cardId);
      writeV22(SMOOTHIE_V22.final, fin);
      state.smoothieFocusId = cardId;
    }
    logSmoothieFly({
      fromCabin: fromCabin,
      toCabin: toCabin,
      cardId: cardId,
      action: action,
      at: new Date().toISOString()
    });
    state.smoothieFlyError = "";
    var label = (extra.card && extra.card.title) || (smoothieById(cardId) && smoothieById(cardId).title) || cardId;
    runSmoothieFly(toCabin, label, function () {
      if (action === "month_complete") openSmoothieRoom(toCabin, cardId);
      else openSmoothieRoom(toCabin, "");
    });
  }

  function smoothieWindowMonths() {
    var start = state.smoothieWindow === "2027-01" ? { year: 2027, month: 1 } : { year: 2026, month: 10 };
    var out = [];
    for (var i = 0; i < 3; i++) {
      var date = new Date(Date.UTC(start.year, start.month - 1 + i, 1, 12));
      var parts = londonParts(date);
      out.push({ year: parts.year, month: parts.month });
    }
    return out;
  }

  function placeSmoothie(dateKey, slot, cardId, mode, weekday) {
    if (slot === "dinner" || SMOOTHIE_SLOTS.indexOf(slot) === -1) {
      state.smoothieFlyError = "Extractions aren't dinner.";
      render();
      return;
    }
    var card = smoothieById(cardId);
    if (!card) {
      state.smoothieFlyError = "Pick a smoothie from the HG pool first.";
      render();
      return;
    }
    var hg = readV22(SMOOTHIE_V22.hg);
    hg.placements = hg.placements || {};
    var dates = [dateKey];
    if (mode === "all") {
      dates = [];
      smoothieWindowMonths().forEach(function (entry) {
        hgWeeks(entry.year, entry.month).forEach(function (week) {
          week.forEach(function (day) {
            if (String(day.weekday || "").slice(0, 3) === weekday && dates.indexOf(day.dateKey) === -1) dates.push(day.dateKey);
          });
        });
      });
    }
    dates.forEach(function (key) {
      var row = hg.placements[key] || {};
      row[slot] = cardId;
      delete row.dinner;
      hg.placements[key] = row;
    });
    writeV22(SMOOTHIE_V22.hg, hg);
    state.smoothieFlyError = "";
    render();
  }

  function smoothieWeekPlacements(year, month, weekIndex) {
    var days = hgWeeks(year, month)[weekIndex] || [];
    var hg = readV22(SMOOTHIE_V22.hg);
    var placements = {};
    var mealIds = [];
    var complete = days.length > 0;
    days.forEach(function (day) {
      var row = (hg.placements && hg.placements[day.dateKey]) || {};
      placements[day.dateKey] = { morning: row.morning || "", lunch: row.lunch || "" };
      SMOOTHIE_SLOTS.forEach(function (slot) {
        if (!row[slot]) complete = false;
        else if (mealIds.indexOf(row[slot]) === -1) mealIds.push(row[slot]);
      });
    });
    return { days: days, placements: placements, mealIds: mealIds, complete: complete };
  }

  function smoothieWeekCardId(year, month, week) {
    return "smoothie-week-" + year + "-" + pad2(month) + "-w" + week;
  }

  function finishSmoothieWeek(year, month, week) {
    var packed = smoothieWeekPlacements(year, month, week - 1);
    if (!packed.complete) {
      state.smoothieFlyError = "Fill every morning and lunch in this week first.";
      render();
      return;
    }
    var id = smoothieWeekCardId(year, month, week);
    flySmoothie("hg", "finished_week", id, {
      card: {
        cardId: id,
        title: MONTH_LABEL[month] + " " + year + " · Week " + week,
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        month: year + "-" + pad2(month),
        week: week,
        placements: packed.placements,
        mealIds: packed.mealIds
      }
    });
  }

  function finishSmoothieMonth(year, month) {
    var weeks = [];
    for (var w = 1; w <= 4; w++) {
      var id = smoothieWeekCardId(year, month, w);
      var later = readV22(SMOOTHIE_V22.later);
      if (!later.cards || !later.cards[id]) {
        state.smoothieFlyError = "Finish weeks 1 to 4 into Save later before this month can fly to Final.";
        render();
        return;
      }
      weeks.push(later.cards[id]);
    }
    var finalId = "smoothie-final-" + year + "-" + pad2(month);
    flySmoothie("hg", "month_complete", finalId, {
      card: {
        cardId: finalId,
        title: MONTH_LABEL[month] + " " + year,
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        weeks: weeks
      }
    });
  }

  function smoothieCardHtml(card) {
    var ingredients = (card.ingredients || []).map(function (item) {
      return "<li>" + escapeHtml(item.text || "") + "</li>";
    }).join("");
    var method = (card.method || []).map(function (step) {
      return "<li><strong>" + escapeHtml(step.verb || "") + "</strong> " + escapeHtml(step.detail || "") + "</li>";
    }).join("");
    return '<article class="recipe-card food-forensic" data-kind="extraction" id="card-' + escapeHtml(card.cardId) + '">' +
      '<p class="recipe-kicker">SMOOTHIE / EXTRACTION</p>' +
      "<h3>" + escapeHtml(card.title) + "</h3>" +
      '<p class="food-made">Made ' + escapeHtml(card.madeOn || "") + (card.noteCode ? " · " + escapeHtml(card.noteCode) : "") + "</p>" +
      (card.tagline ? '<p class="recipe-tagline">' + escapeHtml(card.tagline) + "</p>" : "") +
      '<p class="recipe-lock">Morning or lunch only. Extractions aren\'t dinner.</p>' +
      "<h4>Ingredients</h4><ul class=\"recipe-ingredients\">" + ingredients + "</ul>" +
      "<h4>Method</h4><ol class=\"recipe-method\">" + method + "</ol>" +
      (card.tip ? '<p class="recipe-tip">' + escapeHtml(card.tip) + "</p>" : "") +
      "</article>";
  }

  function paintSmoothieMeals() {
    var host = $("smoothie-meals");
    if (!host) return;
    var store = ensureSmoothieSeed();
    var card = state.smoothieFocusId ? store.cards[state.smoothieFocusId] : null;
    var html = smoothieBannersHtml();
    if (card && state.smoothieEditing) {
      html += '<form class="food-editor" data-sm22="editor">' +
        '<label>Title<input name="title" value="' + escapeHtml(card.title) + '"></label>' +
        '<label>Note code<input name="noteCode" value="' + escapeHtml(card.noteCode || "") + '"></label>' +
        '<p class="food-made">Made ' + escapeHtml(card.madeOn) + "</p>" +
        '<label>Ingredients, one line each<textarea name="ingredients" rows="6">' +
          escapeHtml((card.ingredients || []).map(function (item) { return item.text; }).join("\n")) + "</textarea></label>" +
        '<label>Method, one step each line<textarea name="method" rows="6">' +
          escapeHtml((card.method || []).map(function (step) { return (step.verb || "Blend") + " " + (step.detail || ""); }).join("\n")) + "</textarea></label>" +
        '<label>Notes<textarea name="tip" rows="3">' + escapeHtml(card.tip || "") + "</textarea></label>" +
        '<button type="button" data-sm22="save-meal" data-card="' + escapeHtml(card.cardId) + '">Save smoothie</button>' +
        "</form>";
    } else if (card) {
      html += '<button type="button" class="food-fly-btn" data-sm22="back-meals">All smoothie cards</button>' + smoothieCardHtml(card) +
        '<div class="food-fly-actions">' +
        '<button type="button" class="food-fly-btn" data-sm22="edit-meal" data-card="' + escapeHtml(card.cardId) + '">Edit</button>' +
        '<button type="button" class="food-fly-btn" data-sm22="fly" data-from="meals" data-action="add_cabinet" data-card="' + escapeHtml(card.cardId) + '">Add to Main Smoothie Cabinet</button>' +
        '<button type="button" class="food-fly-btn" data-sm22="fly" data-from="meals" data-action="add_hg" data-card="' + escapeHtml(card.cardId) + '">Add to Draft Smoothie Schedule</button>' +
        "</div>";
    } else {
      html += '<button type="button" class="food-fly-btn" data-sm22="new-meal">New smoothie card</button>';
      Object.keys(store.cards).forEach(function (id) {
        var row = store.cards[id];
        html += '<button type="button" class="food-jump" data-sm22="open-meal" data-card="' + escapeHtml(id) + '">' +
          escapeHtml(row.title) + "<span>Made " + escapeHtml(row.madeOn || "") + "</span></button>";
      });
    }
    host.innerHTML = html;
  }

  function paintSmoothieCabinet() {
    var host = $("smoothie-cabinet");
    if (!host) return;
    ensureSmoothieSeed();
    var cab = readV22(SMOOTHIE_V22.cabinet);
    var html = smoothieBannersHtml();
    var focus = state.smoothieFocusId ? smoothieById(state.smoothieFocusId) : null;
    if (focus) {
      html += '<button type="button" class="food-fly-btn" data-sm22="back-cabinet">Cabinet</button>' + smoothieCardHtml(focus) +
        '<div class="food-fly-actions"><button type="button" class="food-fly-btn" data-sm22="fly" data-from="cabinet" data-action="add_hg" data-card="' +
        escapeHtml(focus.cardId) + '">Add to Draft Smoothie Schedule</button></div>';
    } else {
      html += '<div class="food-cabinet-scroller" aria-label="Main Smoothie Cabinet">';
      (cab.order || []).forEach(function (id) {
        var card = smoothieById(id);
        if (!card) return;
        html += '<button type="button" class="food-mini" data-sm22="open-cabinet" data-card="' + escapeHtml(id) + '">' +
          "<strong>" + escapeHtml(card.title) + "</strong><span>" + escapeHtml(card.madeOn || "") + "</span></button>";
      });
      html += "</div>";
    }
    host.innerHTML = html;
  }

  function landSmoothieCard(hg, cardId) {
    ensureMonthStore(hg);
    var drop = firstEmptyCell(hg, state.smoothieYear, state.smoothieMonth, SMOOTHIE_SLOTS);
    if (!drop) return;
    var bucket = monthBucket(hg, state.smoothieYear, state.smoothieMonth);
    var row = bucket.placements[drop.date] || {};
    delete row.dinner;
    row[drop.slot] = cardId;
    bucket.placements[drop.date] = row;
    state.smoothieLandCell = drop.date + "|" + drop.slot;
    state.smoothieWeek = drop.week;
  }

  function restoreSmoothieMonth(hg, card) {
    var parts = String(card.month || monthKey(state.smoothieYear, state.smoothieMonth)).split("-");
    var year = +parts[0] || state.smoothieYear;
    var month = +parts[1] || state.smoothieMonth;
    copyPlacementsInto(monthBucket(hg, year, month), card, SMOOTHIE_SLOTS);
    var bucket = monthBucket(hg, year, month);
    Object.keys(bucket.placements).forEach(function (date) { delete bucket.placements[date].dinner; });
    state.smoothieYear = year;
    state.smoothieMonth = month;
    state.smoothieWindow = month >= 10 ? "2026-10" : "2027-01";
    state.smoothieWeek = 1;
  }

  function smoothieMonthRecord() {
    var fin = readV22(SMOOTHIE_V22.final);
    fin.months = fin.months || {};
    return fin;
  }

  function resetSmoothieTick(date, slot) {
    var fin = smoothieMonthRecord();
    var pack = fin.months[monthKey(state.smoothieYear, state.smoothieMonth)];
    if (!pack || !pack.ticks) return;
    delete pack.ticks[date + "|" + slot];
    writeV22(SMOOTHIE_V22.final, fin);
  }

  function placeSmoothieCell(date, slot, cardId) {
    if (slot === "dinner" || SMOOTHIE_SLOTS.indexOf(slot) === -1) {
      state.smoothieFlyError = "Extractions aren't dinner.";
      render();
      return;
    }
    var card = smoothieById(cardId);
    if (!card) {
      state.smoothieFlyError = "Pick a smoothie from the pool first.";
      render();
      return;
    }
    var hg = readV22(SMOOTHIE_V22.hg);
    var bucket = monthBucket(hg, state.smoothieYear, state.smoothieMonth);
    var row = bucket.placements[date] || {};
    delete row.dinner;
    if (row[slot] && row[slot] !== cardId) resetSmoothieTick(date, slot);
    row[slot] = cardId;
    bucket.placements[date] = row;
    writeV22(SMOOTHIE_V22.hg, hg);
    state.smoothieLandCell = date + "|" + slot;
    state.smoothieFlyError = "";
    state.smoothieGrid = null;
    render();
  }

  function clearSmoothieCell(date, slot) {
    var hg = readV22(SMOOTHIE_V22.hg);
    var bucket = monthBucket(hg, state.smoothieYear, state.smoothieMonth);
    var row = bucket.placements[date] || {};
    delete row[slot];
    delete row.dinner;
    bucket.placements[date] = row;
    writeV22(SMOOTHIE_V22.hg, hg);
    var fin = smoothieMonthRecord();
    var pack = fin.months[monthKey(state.smoothieYear, state.smoothieMonth)];
    if (pack) {
      if (pack.cards) delete pack.cards[date + "|" + slot];
      if (pack.ticks) delete pack.ticks[date + "|" + slot];
      writeV22(SMOOTHIE_V22.final, fin);
    }
    state.smoothieGrid = null;
    state.smoothiePackAsk = "";
    render();
  }

  function copySmoothieWeekday(date, slot, cardId, weekday) {
    if (SMOOTHIE_SLOTS.indexOf(slot) === -1) return;
    var hg = readV22(SMOOTHIE_V22.hg);
    var bucket = monthBucket(hg, state.smoothieYear, state.smoothieMonth);
    hgWeeks(state.smoothieYear, state.smoothieMonth).forEach(function (week) {
      week.forEach(function (day) {
        if (String(day.weekday || "").slice(0, 3) !== weekday) return;
        var row = bucket.placements[day.dateKey] || {};
        delete row.dinner;
        if (row[slot] && row[slot] !== cardId) resetSmoothieTick(day.dateKey, slot);
        row[slot] = cardId;
        bucket.placements[day.dateKey] = row;
      });
    });
    writeV22(SMOOTHIE_V22.hg, hg);
    state.smoothieLandCell = date + "|" + slot;
    state.smoothieGrid = null;
    render();
  }

  function lockSmoothieMonth() {
    var year = state.smoothieYear;
    var month = state.smoothieMonth;
    var hg = readV22(SMOOTHIE_V22.hg);
    var bucket = monthBucket(hg, year, month);
    var tokens = requiredTokens(year, month, SMOOTHIE_SLOTS);
    var missing = tokens.some(function (token) {
      return !((bucket.placements[token.date] || {})[token.slot]);
    });
    if (missing) {
      state.smoothieFlyError = "Fill every morning and lunch across Weeks 1–4 before locking.";
      render();
      return;
    }
    var fin = smoothieMonthRecord();
    var key = monthKey(year, month);
    var prev = fin.months[key] || { cards: {}, ticks: {} };
    var cards = {};
    var ticks = {};
    var weeks = [];
    hgWeeks(year, month).forEach(function (week, index) {
      var placements = {};
      week.forEach(function (day) {
        var row = bucket.placements[day.dateKey] || {};
        placements[day.dateKey] = { morning: row.morning || "", lunch: row.lunch || "" };
      });
      weeks.push({ week: index + 1, placements: placements });
    });
    tokens.forEach(function (token) {
      var id = bucket.placements[token.date][token.slot];
      var mark = token.date + "|" + token.slot;
      cards[mark] = id;
      if (prev.cards && prev.cards[mark] === id && prev.ticks && prev.ticks[mark]) ticks[mark] = true;
    });
    fin.months[key] = {
      month: key,
      title: MONTH_LABEL[month] + " " + year,
      weeks: weeks,
      cards: cards,
      ticks: ticks,
      locked: true
    };
    fin.order = fin.order || [];
    if (fin.order.indexOf(key) === -1) fin.order.push(key);
    writeV22(SMOOTHIE_V22.final, fin);
    state.smoothieGrid = null;
    state.smoothiePackAsk = "";
    state.smoothieFlyError = "";
    openSmoothieRoom("final");
  }

  function smoothieAllTicked() {
    var pack = smoothieMonthRecord().months[monthKey(state.smoothieYear, state.smoothieMonth)];
    if (!pack || !pack.locked) return false;
    return requiredTokens(state.smoothieYear, state.smoothieMonth, SMOOTHIE_SLOTS).every(function (token) {
      var mark = token.date + "|" + token.slot;
      return pack.cards && pack.cards[mark] && pack.ticks && pack.ticks[mark];
    });
  }

  function syncSmoothiePackAsk() {
    if (!smoothieAllTicked()) {
      state.smoothiePackAsk = "";
      return;
    }
    if (state.smoothiePackAsk !== "dismissed") state.smoothiePackAsk = "ask";
  }

  function rememberSmoothieToast() {
    state.smoothieToastUntil = Date.now() + 4000;
    setTimeout(function () {
      if (state.smoothieToastUntil && Date.now() >= state.smoothieToastUntil) {
        state.smoothieToast = "";
        render();
      }
    }, 4100);
  }

  function saveSmoothiePack() {
    if (!smoothieAllTicked()) {
      state.smoothieFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return;
    }
    var key = monthKey(state.smoothieYear, state.smoothieMonth);
    var id = "smoothie-pack-" + key;
    var later = readV22(SMOOTHIE_V22.later);
    later.cards = later.cards || {};
    later.order = later.order || [];
    if (later.cards[id]) {
      state.smoothieToast = "This card has already been added to save later.";
      state.smoothieFlyError = "";
      state.smoothiePackAsk = "";
      rememberSmoothieToast();
      render();
      return;
    }
    var pack = smoothieMonthRecord().months[key];
    later.cards[id] = {
      cardId: id,
      title: pack.title + " smoothie timetable",
      madeOn: londonParts(new Date()).dateKey,
      month: key,
      weeks: pack.weeks,
      cards: pack.cards,
      ticks: pack.ticks
    };
    later.order.push(id);
    writeV22(SMOOTHIE_V22.later, later);
    state.smoothiePackAsk = "";
    state.smoothieOffer = id;
    state.smoothieFlyError = "";
    openSmoothieRoom("savelater");
  }

  function reopenSmoothiePack(cardId) {
    var card = (readV22(SMOOTHIE_V22.later).cards || {})[cardId];
    if (!card) return;
    var hg = readV22(SMOOTHIE_V22.hg);
    restoreSmoothieMonth(hg, card);
    writeV22(SMOOTHIE_V22.hg, hg);
    state.smoothieGrid = null;
    state.smoothieOffer = "";
    openSmoothieRoom("hg");
  }

  function cleanSmoothieMonth() {
    var hg = readV22(SMOOTHIE_V22.hg);
    monthBucket(hg, state.smoothieYear, state.smoothieMonth).placements = {};
    writeV22(SMOOTHIE_V22.hg, hg);
    state.smoothieOffer = "";
    state.smoothieGrid = null;
    openSmoothieRoom("hg");
  }

  function toggleSmoothieTick(date, slot) {
    if (SMOOTHIE_SLOTS.indexOf(slot) === -1) return;
    var fin = smoothieMonthRecord();
    var pack = fin.months[monthKey(state.smoothieYear, state.smoothieMonth)];
    if (!pack || !pack.cards || !pack.cards[date + "|" + slot]) return;
    pack.ticks = pack.ticks || {};
    var mark = date + "|" + slot;
    if (pack.ticks[mark]) delete pack.ticks[mark];
    else pack.ticks[mark] = true;
    writeV22(SMOOTHIE_V22.final, fin);
    state.smoothieGrid = null;
    syncSmoothiePackAsk();
    render();
  }

  function smoothieFiltersHtml() {
    var months = smoothieWindowMonths();
    var html = '<div class="food-filters">';
    html += '<button type="button" data-sm22="window" data-window="2026-10"' + (state.smoothieWindow === "2026-10" ? ' aria-pressed="true"' : "") + ">Oct–Dec</button>";
    html += '<button type="button" data-sm22="window" data-window="2027-01"' + (state.smoothieWindow === "2027-01" ? ' aria-pressed="true"' : "") + ">Jan–Mar</button>";
    html += "</div><div class=\"food-filters\">";
    months.forEach(function (entry) {
      html += '<button type="button" data-sm22="month" data-year="' + entry.year + '" data-month="' + entry.month + '"' +
        (entry.month === state.smoothieMonth && entry.year === state.smoothieYear ? ' aria-pressed="true"' : "") + ">" +
        MONTH_LABEL[entry.month] + "</button>";
    });
    html += "</div>";
    return html;
  }

  function syncSmoothieMonth() {
    if (state.smoothieMonth < 1) state.smoothieMonth = 10;
    var months = smoothieWindowMonths();
    var active = months.filter(function (entry) { return entry.year === state.smoothieYear && entry.month === state.smoothieMonth; })[0] || months[0];
    state.smoothieYear = active.year;
    state.smoothieMonth = active.month;
  }

  function smoothieGridHtml() {
    var grid = state.smoothieGrid;
    if (!grid) return "";
    var card = smoothieById(grid.cardId);
    if (!card) return "";
    var short = weekdayShort(grid.date);
    var html = '<div class="grid-recipe">';
    html += '<button type="button" class="food-fly-btn" data-sm22="back-grid">Back to grid</button>';
    html += smoothieCardHtml(card);
    html += '<div class="recipe-actions">';
    if (grid.where === "draft") {
      html += '<button type="button" class="draft-remove" data-sm22="clear-cell" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '">Remove</button>';
      html += '<button type="button" class="food-fly-btn" data-sm22="copy-weekday" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '" data-card="' + escapeHtml(grid.cardId) + '" data-weekday="' + short + '">Copy to other ' + escapeHtml(WEEKDAY_ALL[short] || "days") + "</button>";
    } else {
      var pack = smoothieMonthRecord().months[monthKey(state.smoothieYear, state.smoothieMonth)];
      var on = pack && pack.ticks && pack.ticks[grid.date + "|" + grid.slot];
      html += '<button type="button" class="draft-remove" data-sm22="clear-final" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '">Remove</button>';
      html += '<button type="button" class="slot-tick" data-sm22="tick" data-date="' + escapeHtml(grid.date) + '" data-slot="' + escapeHtml(grid.slot) + '" aria-pressed="' + (on ? "true" : "false") + '">' + (on ? "Done" : "Tick") + "</button>";
    }
    html += "</div></div>";
    return html;
  }

  function paintSmoothieHg() {
    var host = $("smoothie-hg");
    if (!host) return;
    ensureSmoothieSeed();
    if (state.smoothieGrid && state.smoothieGrid.where === "draft") {
      host.innerHTML = smoothieBannersHtml() + smoothieGridHtml();
      return;
    }
    var hg = readV22(SMOOTHIE_V22.hg);
    ensureMonthStore(hg);
    syncSmoothieMonth();
    var bucket = monthBucket(hg, state.smoothieYear, state.smoothieMonth);
    var weeks = hgWeeks(state.smoothieYear, state.smoothieMonth);
    var html = smoothieBannersHtml() + smoothieFiltersHtml();
    html += '<div class="food-filters">';
    for (var w = 1; w <= 4; w++) {
      html += '<button type="button" data-sm22="hg-week" data-week="' + w + '"' + (state.smoothieWeek === w ? ' aria-pressed="true"' : "") + ">Week " + w + "</button>";
    }
    html += "</div>";
    html += '<div class="food-cabinet-scroller" aria-label="Smoothie draft pool">';
    if (!(hg.pool || []).length) html += '<p class="food-made">Fly a smoothie here from Smoothie Recipe Cards or the Cabinet.</p>';
    (hg.pool || []).forEach(function (id) {
      var card = smoothieById(id);
      if (!card) return;
      html += '<button type="button" class="food-mini" data-sm22="pick" data-card="' + escapeHtml(id) + '"' +
        (state.smoothiePick === id ? ' aria-pressed="true"' : "") + "><strong>" + escapeHtml(card.title) + "</strong></button>";
    });
    html += "</div>";
    (weeks[state.smoothieWeek - 1] || weeks[0] || []).forEach(function (day) {
      var placed = bucket.placements[day.dateKey] || {};
      html += '<article class="food-day' + (day.sunday ? " is-sunday" : "") + '">';
      html += "<header class=\"food-day-head\"><h3>" + escapeHtml(day.weekday) + "</h3><p>" + escapeHtml(day.dateKey) + "</p>";
      if (day.sunday) html += '<p class="food-sunday-label">Smoothie Prep Day</p>';
      html += "</header>";
      SMOOTHIE_SLOTS.forEach(function (slot) {
        var chosen = placed[slot] ? smoothieById(placed[slot]) : null;
        var landed = state.smoothieLandCell === day.dateKey + "|" + slot ? " is-landed" : "";
        html += '<div class="draft-cell' + landed + '"><span class="draft-slot">' + slot + "</span>";
        if (chosen) {
          html += '<button type="button" class="draft-card" data-sm22="open-grid" data-where="draft" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" data-card="' + escapeHtml(chosen.cardId) + '">' + escapeHtml(chosen.title) + "</button>";
          html += '<button type="button" class="draft-remove" data-sm22="clear-cell" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '">Remove</button>';
        } else {
          html += '<button type="button" class="draft-empty" data-sm22="place-cell" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '">Empty</button>';
        }
        html += "</div>";
      });
      html += "</article>";
    });
    html += '<button type="button" class="food-fly-btn" data-sm22="lock-month">Lock into Final Timetable</button>';
    host.innerHTML = html;
  }

  function paintSmoothieFinal() {
    var host = $("smoothie-final");
    if (!host) return;
    ensureSmoothieSeed();
    if (state.smoothieGrid && state.smoothieGrid.where === "final") {
      host.innerHTML = smoothieBannersHtml() + smoothieGridHtml();
      return;
    }
    syncSmoothieMonth();
    syncSmoothiePackAsk();
    var pack = smoothieMonthRecord().months[monthKey(state.smoothieYear, state.smoothieMonth)];
    var weeks = hgWeeks(state.smoothieYear, state.smoothieMonth);
    var html = smoothieBannersHtml() + smoothieFiltersHtml();
    html += '<button type="button" class="food-fly-btn" data-sm22="edit-draft">Edit draft</button>';
    if (state.smoothiePackAsk === "ask") {
      html += '<div class="pack-ask" role="dialog" aria-label="Save later"><p>' + PACK_ASK + '</p>' +
        '<button type="button" data-sm22="save-pack">Add</button>' +
        '<button type="button" data-sm22="dismiss-pack">Not yet</button></div>';
    }
    for (var sw = 1; sw <= 4; sw++) {
      var days = weeks[sw - 1] || [];
      html += '<section class="food-final-week"><h3>Week ' + sw + "</h3>";
      if (!pack || !pack.locked) html += '<p class="food-made">Empty until this month is locked from the Draft Smoothie Schedule.</p>';
      days.forEach(function (day) {
        var row = pack && pack.locked ? (((pack.weeks[sw - 1] || {}).placements || {})[day.dateKey] || {}) : {};
        html += '<article class="food-day"><header class="food-day-head"><h3>' + escapeHtml(day.weekday) + "</h3><p>" + escapeHtml(day.dateKey) + "</p></header>";
        SMOOTHIE_SLOTS.forEach(function (slot) {
          var meal = row[slot] ? smoothieById(row[slot]) : null;
          var on = pack && pack.ticks && pack.ticks[day.dateKey + "|" + slot];
          html += '<div class="draft-cell"><span class="draft-slot">' + slot + "</span>";
          if (meal) {
            html += '<button type="button" class="draft-card" data-sm22="open-grid" data-where="final" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" data-card="' + escapeHtml(meal.cardId) + '">' + escapeHtml(meal.title) + "</button>";
            html += '<button type="button" class="slot-tick" data-sm22="tick" data-date="' + escapeHtml(day.dateKey) + '" data-slot="' + slot + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="Tick ' + slot + '">' + (on ? "✓" : "") + "</button>";
          } else {
            html += '<span class="draft-empty">Empty</span>';
          }
          html += "</div>";
        });
        html += "</article>";
      });
      html += "</section>";
    }
    host.innerHTML = html;
  }

  function paintSmoothieSaveLater() {
    var host = $("smoothie-savelater");
    if (!host) return;
    var later = readV22(SMOOTHIE_V22.later);
    var html = smoothieBannersHtml();
    if (state.smoothieOffer && later.cards && later.cards[state.smoothieOffer]) {
      html += '<p class="food-made">Saved. Amend this draft, or clear this month and build again.</p>';
      html += '<button type="button" class="food-fly-btn" data-sm22="reopen-pack" data-card="' + escapeHtml(state.smoothieOffer) + '">Amend in Draft Smoothie Schedule</button>';
      html += '<button type="button" class="food-fly-btn" data-sm22="clean-month">Clean slate</button>';
    }
    html += '<div class="food-cabinet-scroller" aria-label="Smoothie Save later">';
    (later.order || []).forEach(function (id) {
      var card = later.cards[id];
      if (!card) return;
      html += '<button type="button" class="food-mini" data-sm22="reopen-pack" data-card="' + escapeHtml(id) + '"><strong>' +
        escapeHtml(card.title) + "</strong><span>" + escapeHtml(card.madeOn || "") + "</span></button>";
    });
    html += "</div>";
    host.innerHTML = html;
  }

  function onSmoothieClick(event) {
    var node = event.target.closest("[data-sm22]");
    if (!node) return false;
    var kind = node.getAttribute("data-sm22");
    var cardId = node.getAttribute("data-card") || "";
    if (kind === "open-meal" || kind === "open-cabinet" || kind === "open-later") {
      state.smoothieFocusId = cardId;
      state.smoothieEditing = false;
      render();
      return true;
    }
    if (kind === "back-meals" || kind === "back-cabinet" || kind === "back-later") {
      state.smoothieFocusId = "";
      state.smoothieEditing = false;
      render();
      return true;
    }
    if (kind === "edit-meal") {
      state.smoothieEditing = true;
      render();
      return true;
    }
    if (kind === "new-meal") {
      var id = "smoothie-" + newCardId();
      var meals = ensureSmoothieSeed();
      meals.cards[id] = {
        cardId: id,
        title: "New smoothie",
        madeOn: londonParts(new Date()).dateKey,
        noteCode: "",
        kind: "extraction",
        family: "extraction",
        tagline: "Morning or lunch.",
        ingredients: [{ text: "" }],
        method: [{ verb: "Blend", detail: "" }],
        tip: "Morning or lunch only. Extractions aren't dinner.",
        fresh: true
      };
      writeV22(SMOOTHIE_V22.meals, meals);
      state.smoothieFocusId = id;
      state.smoothieEditing = true;
      render();
      return true;
    }
    if (kind === "save-meal") {
      var form = node.closest("form");
      var existing = smoothieById(cardId);
      if (form && existing) {
        existing.title = form.querySelector('[name="title"]').value.trim() || existing.title;
        existing.noteCode = form.querySelector('[name="noteCode"]').value.trim();
        existing.ingredients = form.querySelector('[name="ingredients"]').value.split("\n").map(function (line) {
          return { text: line.trim() };
        }).filter(function (item) { return item.text; });
        existing.method = form.querySelector('[name="method"]').value.split("\n").map(function (line) {
          var parts = line.trim().split(/\s+/);
          return { verb: parts.shift() || "Blend", detail: parts.join(" ") };
        }).filter(function (step) { return step.verb || step.detail; });
        existing.tip = form.querySelector('[name="tip"]').value.trim();
        existing.kind = "extraction";
        var store = ensureSmoothieSeed();
        store.cards[cardId] = existing;
        writeV22(SMOOTHIE_V22.meals, store);
      }
      state.smoothieEditing = false;
      render();
      return true;
    }
    if (kind === "fly") {
      var from = node.getAttribute("data-from");
      var action = node.getAttribute("data-action");
      var extra = {};
      if (from === "savelater") extra.card = (readV22(SMOOTHIE_V22.later).cards || {})[cardId];
      flySmoothie(from, action, cardId, extra);
      return true;
    }
    if (kind === "pick") {
      state.smoothiePick = cardId;
      state.smoothieFlyError = "";
      render();
      return true;
    }
    if (kind === "place" || kind === "place-cell") {
      if (!state.smoothiePick) {
        state.smoothieFlyError = "Pick a smoothie from the pool first.";
        render();
        return true;
      }
      placeSmoothieCell(node.getAttribute("data-date"), node.getAttribute("data-slot"), state.smoothiePick);
      return true;
    }
    if (kind === "open-grid") {
      state.smoothieGrid = {
        cardId: cardId,
        date: node.getAttribute("data-date"),
        slot: node.getAttribute("data-slot"),
        where: node.getAttribute("data-where") || "draft"
      };
      render();
      return true;
    }
    if (kind === "back-grid") {
      state.smoothieGrid = null;
      render();
      return true;
    }
    if (kind === "clear-cell" || kind === "clear-final") {
      clearSmoothieCell(node.getAttribute("data-date"), node.getAttribute("data-slot"));
      return true;
    }
    if (kind === "copy-weekday") {
      copySmoothieWeekday(node.getAttribute("data-date"), node.getAttribute("data-slot"), cardId, node.getAttribute("data-weekday"));
      return true;
    }
    if (kind === "lock-month") {
      lockSmoothieMonth();
      return true;
    }
    if (kind === "tick") {
      toggleSmoothieTick(node.getAttribute("data-date"), node.getAttribute("data-slot"));
      return true;
    }
    if (kind === "save-pack") {
      saveSmoothiePack();
      return true;
    }
    if (kind === "dismiss-pack") {
      state.smoothiePackAsk = "dismissed";
      render();
      return true;
    }
    if (kind === "reopen-pack") {
      reopenSmoothiePack(cardId);
      return true;
    }
    if (kind === "edit-draft") {
      state.smoothieGrid = null;
      openSmoothieRoom("hg");
      return true;
    }
    if (kind === "clean-month") {
      cleanSmoothieMonth();
      return true;
    }
    if (kind === "window") {
      state.smoothieWindow = node.getAttribute("data-window");
      var first = smoothieWindowMonths()[0];
      state.smoothieYear = first.year;
      state.smoothieMonth = first.month;
      state.smoothieWeek = 1;
      render();
      return true;
    }
    if (kind === "month") {
      state.smoothieYear = +node.getAttribute("data-year");
      state.smoothieMonth = +node.getAttribute("data-month");
      state.smoothieWeek = 1;
      render();
      return true;
    }
    if (kind === "hg-week") {
      state.smoothieWeek = +node.getAttribute("data-week") || 1;
      render();
      return true;
    }
    if (kind === "finish-week" || kind === "finish-month") {
      state.smoothieFlyError = "Lock the draft into the final timetable. Save later waits until every slot is ticked.";
      render();
      return true;
    }
    return true;
  }

  function openSmoothieRoom(room, focusId) {
    if (!SMOOTHIE_TITLES[room]) return;
    state.foodRoom = "";
    state.osDoor = "smoothies";
    state.smoothieRoom = room;
    state.smoothieFocusId = focusId || "";
    state.smoothieEditing = false;
    render();
    var title = $("smoothie-board-title");
    if (title && title.focus) {
      try { title.focus({ preventScroll: true }); } catch (err) {
        try { title.focus(); } catch (err2) { /* focus is optional */ }
      }
    }
  }

  function closeSmoothieRoom() {
    state.smoothieRoom = "";
    state.smoothieFocusId = "";
    state.smoothieEditing = false;
    state.osDoor = "training";
    render();
  }

  function paintSmoothieBoard() {
    var board = $("smoothie-board");
    var training = $("training-board");
    var food = $("food-board");
    var room = SMOOTHIE_TITLES[state.smoothieRoom] ? state.smoothieRoom : "";
    var open = !!room;
    if (board) board.hidden = !open;
    if (open) {
      if (food) food.hidden = true;
      if (training) training.hidden = true;
      document.body.classList.add("is-food");
    }
    document.querySelectorAll("[data-smoothie-room]").forEach(function (row) {
      var on = row.getAttribute("data-smoothie-room") === room;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-pressed", on ? "true" : "false");
    });
    ["meals", "cabinet", "hg", "final", "savelater"].forEach(function (name) {
      var panel = $("smoothie-" + name);
      if (panel) panel.hidden = name !== room;
    });
    if (!open) return;
    var title = $("smoothie-board-title");
    if (title) title.textContent = SMOOTHIE_TITLES[room];
    if (room === "meals") paintSmoothieMeals();
    if (room === "cabinet") paintSmoothieCabinet();
    if (room === "hg") paintSmoothieHg();
    if (room === "final") paintSmoothieFinal();
    if (room === "savelater") paintSmoothieSaveLater();
  }

  function paintFoodBoard() {
    var board = $("food-board");
    var training = $("training-board");
    var room = FOOD_TITLES[state.foodRoom] ? state.foodRoom : "";
    var open = !!room;
    if (board) board.hidden = !open;
    if (training) training.hidden = open;
    document.body.classList.toggle("is-food", open);
    document.querySelectorAll("[data-food-room]").forEach(function (row) {
      var on = row.getAttribute("data-food-room") === room;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-pressed", on ? "true" : "false");
    });
    ["meals", "cabinet", "hg", "final", "savelater", "shop", "extractions", "weekly"].forEach(function (name) {
      var panel = $("food-" + name);
      if (panel) panel.hidden = name !== room;
    });
    if (!open) return;
    var title = $("food-board-title");
    if (title) title.textContent = FOOD_TITLES[room];
    if (room === "meals") paintMealsV22();
    if (room === "cabinet") paintCabinet();
    if (room === "hg") paintHg();
    if (room === "final") paintFinal();
    if (room === "savelater") paintSaveLater();
    if (room === "shop") paintShopV22();
    if (room === "extractions") paintExtractions();
    if (state.foodJsonHold) {
      var held = $("food-json-" + room);
      if (held) held.value = state.foodJsonHold;
      state.foodJsonHold = "";
    }
  }

  function render() {
    if (!S) return;
    state.now = getNow();
    var parts = londonParts(state.now);
    var preview = !isLive(parts);
    syncBranch();

    if (!state.userPicked) {
      /* Q4 2026 is the live Full Body cabin. Cold open must land on that
         bridge month, not January 2027 or the October 2027 Till Failure grid. */
      if (parts.dateKey >= BRIDGE_LOCK_START && parts.dateKey < S.LIVE_START) {
        state.viewYear = 2026;
        state.branch = "bridge";
        state.viewMonth = parts.month;
        state.viewWeek = S.weekOfMonth(parts.day);
      } else if (state.viewYear === 2026) {
        if (parts.year === 2026 && parts.month >= 10 && parts.month <= 12) {
          state.viewMonth = parts.month;
          state.viewWeek = S.weekOfMonth(parts.day);
        } else {
          state.viewMonth = 10;
          state.viewWeek = 1;
        }
      } else if (preview || parts.year < 2027) {
        state.viewYear = 2027;
        state.branch = "year";
        state.viewMonth = 1;
        state.viewWeek = 1;
      } else if (parts.year === 2027) {
        state.viewYear = 2027;
        state.branch = "year";
        state.viewMonth = parts.month;
        state.viewWeek = S.weekOfMonth(parts.day);
      } else {
        state.viewYear = 2027;
        state.branch = "year";
        state.viewMonth = 12;
        state.viewWeek = 4;
      }
    } else if (state.branch === "bridge" && (state.viewMonth < 10 || state.viewMonth > 12)) {
      state.viewMonth = 10;
      state.viewWeek = 1;
    }

    var bridgeFull = state.branch === "bridge" && !viewingUpper() && preconditionSchedule();
    var phase = bridgeFull
      ? preconditionSchedule().phaseForMonth(state.viewMonth)
      : S.phaseForMonth(state.viewMonth);
    var metaSource = viewingUpper() ? upperSchedule() : (bridgeFull ? preconditionSchedule() : S);
    var meta = (metaSource.MONTH_META && metaSource.MONTH_META[state.viewMonth]) ||
      S.MONTH_META[state.viewMonth] || { phaseLine: phase.label, blurb: "" };
    paintModeChrome();
    paintBranchChrome();
    var card = $("relic-card");
    card.setAttribute("data-month", String(state.viewMonth));
    card.setAttribute("data-year", String(state.viewYear));
    card.setAttribute("data-branch", state.branch);
    card.setAttribute("data-phase", phase.suffix);
    document.body.setAttribute("data-month", String(state.viewMonth));
    document.body.setAttribute("data-year", String(state.viewYear));
    document.body.setAttribute("data-branch", state.branch);
    document.body.setAttribute("data-phase", phase.suffix);

    $("banner-live").hidden = preview;
    var coach = $("banner-coach");
    if (state.coachOverride) {
      coach.hidden = false;
      coach.textContent = "COACH OVERRIDE · ?date=" + state.coachOverride + " · Europe/London";
    } else {
      coach.hidden = true;
    }

    var phaseShort = String(meta.phaseLine || phase.label).replace(/^PHASE:\s*/i, "");
    var monthTitle = S.MONTH_NAMES[state.viewMonth] || "";
    if (state.branch === "bridge") monthTitle += " " + state.viewYear;
    $("identity-line").textContent =
      monthTitle + " · WEEK " + state.viewWeek + " OF 4 · " + phaseShort;
    var blurb = meta.blurb || "";
    if (state.branch === "bridge") blurb = "Q4 2026 Pre-Recondition · " + blurb;
    $("month-blurb").textContent = blurb;
    $("meta-today").innerHTML = "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday;
    paintLondonClock();
    var modeText = "LIVE · " + parts.dateKey;
    if (parts.dateKey < BRIDGE_LOCK_START) modeText = "PREVIEW · live 1 Jan 2027";
    else if (parts.dateKey < S.LIVE_START) {
      modeText = state.branch === "bridge"
        ? "Q4 2026 · past and today tick"
        : "2027 LOCKED · until 1 Jan";
    }
    $("meta-mode").textContent = modeText;

    document.querySelectorAll(".phase").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-phase") === phase.suffix);
    });
    var allowedMonths = periodMonths();
    var monthBar = document.querySelector(".month-bar");
    if (monthBar) {
      monthBar.setAttribute("data-branch", state.branch);
      monthBar.setAttribute("aria-label", state.branch === "bridge" ? "Q4 2026 Pre-Recondition" : "Months of 2027");
    }
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      var month = +btn.getAttribute("data-month");
      var shown = allowedMonths.indexOf(month) !== -1;
      btn.hidden = !shown;
      btn.classList.toggle("is-selected", shown && month === state.viewMonth);
      btn.classList.toggle("is-live", shown && parts.year === state.viewYear && month === parts.month);
    });
    document.querySelectorAll(".wtab").forEach(function (btn) {
      btn.classList.toggle("is-selected", +btn.getAttribute("data-week") === state.viewWeek);
    });

    var weekDays = activeDaysForView();

    var metaLine = "";
    if (weekDays.length) {
      metaLine = weekDays[0].dateKey + " → " + weekDays[weekDays.length - 1].dateKey + " · calendar order";
    }
    $("week-meta").textContent = metaLine;

    var tbody = $("tt-body");
    var html = "";
    weekDays.forEach(function (day) {
      var isToday = day.dateKey === parts.dateKey;
      var classes = [];
      if (isToday) classes.push("today");
      var tier = displayTier(day.dateKey);
      if (tier === 1) classes.push("is-tier-1");
      if (tier >= 2) classes.push("is-tier-2", "is-done");
      html += '<tr class="' + classes.join(" ") + '">' +
        '<td class="day-cell">' +
          '<span class="day-name">' + day.dayName + "</span>" +
          (isToday ? '<span class="today-pill">TODAY</span>' : "") +
          '<span class="day-key">' + day.dateKey + "</span>" +
        "</td>" +
        relicsHtml(day) +
        doneHtml(day, parts) +
      "</tr>";
    });
    tbody.innerHTML = html;
    applyPeriodMarks(weekDays);
    paintForensic();
    paintFoodBoard();
    paintSmoothieBoard();
    paintOsDoors();
    if (state.restoreTickDate) {
      var again = tbody.querySelector('button.tick-hit[data-date="' + state.restoreTickDate + '"]');
      state.restoreTickDate = "";
      if (again) {
        try { again.focus({ preventScroll: true }); } catch (err) {
          try { again.focus(); } catch (err2) { /* focus is optional */ }
        }
      }
    }
  }

  /* Empty → first video (bit 0). Single shield → both videos. Double shield → clear.
     A single shield that is only the second video still advances to dual, then a later tap clears. */
  function onTick(btn) {
    var dateKey = btn.getAttribute("data-date");
    var parts = londonParts(state.now || getNow());
    if (!dateKey || !canTick(dateKey, parts)) return;
    var tier = displayTier(dateKey);
    var nextMask = tier <= 0 ? 1 : (tier === 1 ? 3 : 0);
    saveMask(completionStorageKey(dateKey), nextMask, dateKey, true);
  }

  function noteSetComplete() {
    var credit = player.credit;
    if (!credit || !credit.dateKey || !credit.storageKey) return false;
    var parts = londonParts(state.now || getNow());
    if (!canTick(credit.dateKey, parts)) return false;
    var storageKey = credit.storageKey;
    var current = state.videos[storageKey] || 0;
    var bit = credit.slot === 1 ? 2 : 1;
    if ((current & bit) === bit) return false;
    saveMask(storageKey, (current | bit) & 3, credit.dateKey, false);
    return true;
  }

  /* The opened citation's set is finished once its tier bit is on.
     A playlist with no credit still ends on its last clip instead of looping. */
  function citationSetIsFinished() {
    var credit = player.credit;
    if (credit && credit.storageKey) {
      var bit = credit.slot === 1 ? 2 : 1;
      var current = state.videos[credit.storageKey] || 0;
      if ((current & bit) === bit) return true;
    }
    return player.clips.length > 0 && player.index >= player.clips.length - 1;
  }

  function pickSettled() {
    var now = Date.now();
    if (now - lastPickAt < PICK_GAP_MS) return false;
    lastPickAt = now;
    return true;
  }

  function viewScrollKey() {
    return state.viewYear + ":" + (state.mode || "full") + ":" + state.viewMonth + ":" + state.viewWeek;
  }

  function rememberViewScroll() {
    viewScroll[viewScrollKey()] = window.scrollY || 0;
  }

  function restoreViewScroll() {
    var y = viewScroll[viewScrollKey()];
    if (typeof y !== "number") return;
    try { window.scrollTo(0, y); } catch (err) { /* scroll restore is optional */ }
  }

  function pickMonth(month) {
    if (!pickSettled()) return;
    if (periodMonths().indexOf(month) === -1) return;
    state.userPicked = true;
    state.viewMonth = month;
    var parts = londonParts(state.now || getNow());
    if (parts.year === state.viewYear && month === parts.month) {
      state.viewWeek = S.weekOfMonth(parts.day);
    } else {
      state.viewWeek = 1;
    }
    render();
  }

  function paintModeChrome() {
    var currentKey = viewingUpper() ? "upper" : "full";
    var otherKey = currentKey === "upper" ? "full" : "upper";
    var line = $("schedule-mode");
    if (line) line.textContent = MODE_LABEL[currentKey];
    var btn = $("btn-schedule-mode");
    if (btn) {
      btn.textContent = MODE_LABEL[otherKey];
      btn.setAttribute("data-mode", currentKey);
      btn.setAttribute("aria-label", "Show " + MODE_LABEL[otherKey]);
    }
    document.querySelectorAll("[data-set-mode]").forEach(function (opt) {
      var on = opt.getAttribute("data-set-mode") === currentKey;
      opt.classList.toggle("is-active", on);
      opt.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var card = $("relic-card");
    if (card) card.setAttribute("data-schedule", currentKey);
    document.body.setAttribute("data-schedule", currentKey);
  }

  function setScheduleMode(mode) {
    if (!upperSchedule()) return;
    if (mode !== "full" && mode !== "upper") return;
    if (state.mode === mode) return;
    rememberViewScroll();
    state.mode = mode;
    render();
    restoreViewScroll();
  }

  function toggleScheduleMode() {
    setScheduleMode(state.mode === "upper" ? "full" : "upper");
  }

  function paintBranchChrome() {
    document.querySelectorAll("[data-set-branch]").forEach(function (opt) {
      var on = opt.getAttribute("data-set-branch") === state.branch;
      opt.classList.toggle("is-active", on);
      opt.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setBranch(branch) {
    var year = branch === "bridge" ? 2026 : 2027;
    var changing = state.viewYear !== year;
    clearClientCache();
    state.viewYear = year;
    syncBranch();
    if (changing) {
      var parts = londonParts(state.now || getNow());
      if (state.branch === "bridge") {
        if (parts.year === 2026 && parts.month >= 10 && parts.month <= 12) {
          state.viewMonth = parts.month;
          state.viewWeek = S.weekOfMonth(parts.day);
        } else {
          state.viewMonth = 10;
          state.viewWeek = 1;
        }
      } else if (parts.year === 2027) {
        state.viewMonth = parts.month;
        state.viewWeek = S.weekOfMonth(parts.day);
      } else if (parts.dateKey < S.LIVE_START) {
        state.viewMonth = 1;
        state.viewWeek = 1;
      }
    }
    state.userPicked = true;
    render();
  }

  function setNavOpen(open) {
    var next = !!open;
    var drawer = $("nav-drawer");
    var scrim = $("nav-scrim");
    var btn = $("btn-nav-toggle");
    document.body.classList.toggle("nav-open", next);
    if (drawer) {
      drawer.setAttribute("aria-hidden", next ? "false" : "true");
      if ("inert" in drawer) drawer.inert = !next;
    }
    if (scrim && "inert" in scrim) scrim.inert = !next;
    if (btn) {
      btn.setAttribute("aria-expanded", next ? "true" : "false");
      btn.setAttribute("aria-label", next ? "Close menu" : "Open menu");
    }
  }

  function pickWeek(week) {
    if (!pickSettled()) return;
    state.userPicked = true;
    state.viewWeek = week;
    render();
  }

  function isBlockedMediaUrl(url) {
    return /drive\.google\.com|docs\.google\.com|embeddedfolderview|googleusercontent\.com|\/preview/i.test(url);
  }

  function filenameFromTitle(title) {
    var name = String(title || "").trim();
    if (!name) return "";
    if (!/\.(mp4|webm|mov)$/i.test(name)) name += ".mp4";
    return name;
  }

  function storagePublicUrl(objectParts) {
    var cfg = supabaseCfg();
    var base = String(cfg.url || "").replace(/\/$/, "");
    var bucket = cfg.bucket || "relic-videos";
    if (!base) return "";
    var parts = [bucket].concat(objectParts).filter(function (part) { return !!part; });
    return base + "/storage/v1/object/public/" + parts.map(function (part) {
      return encodeURIComponent(part);
    }).join("/");
  }

  function resolveClipSrc(cabinKey, clip) {
    if (!clip) return "";
    var src = clip.src ? String(clip.src).trim() : "";
    if (src && /^https?:\/\//i.test(src) && !isBlockedMediaUrl(src)) return src;
    var path = clip.path ? String(clip.path).trim() : "";
    if (path && /^https?:\/\//i.test(path) && !isBlockedMediaUrl(path)) return path;
    if (path && !/^https?:\/\//i.test(path)) {
      var relative = path.replace(/^\/+/, "").split("/").filter(Boolean);
      if (relative.length) return storagePublicUrl(relative);
    }
    var file = filenameFromTitle(clip.title);
    if (!file || !cabinKey) return "";
    return storagePublicUrl([cabinKey, file]);
  }

  function clipsForCabin(cabinKey) {
    var archive = (window.RELIC_VIDEO_ARCHIVE && window.RELIC_VIDEO_ARCHIVE.cabins) || {};
    var cabin = archive[cabinKey];
    var raw = (cabin && cabin.playlist) || [];
    var clips = [];
    raw.forEach(function (clip) {
      if (!clip) return;
      var src = resolveClipSrc(cabinKey, clip);
      if (!src || isBlockedMediaUrl(src)) return;
      clips.push({
        title: clip.title || filenameFromTitle(clip.title) || "Clip",
        src: src
      });
    });
    return clips;
  }

  function activeVideo() { return $("relic-active-video"); }

  function formatTimer(seconds) {
    var safe = Math.max(0, seconds | 0);
    var mins = Math.floor(safe / 60);
    var secs = safe % 60;
    return (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  function paintTimer() {
    var el = $("relic-set-timer");
    if (!el) return;
    var remaining = Math.max(0, player.remaining | 0);
    el.textContent = formatTimer(remaining);
    el.setAttribute("data-seconds", String(SET_DURATION_SEC));
    el.setAttribute("data-remaining", String(remaining));
    el.setAttribute("aria-label", "Set timer " + formatTimer(remaining) + ". Open timer controls.");
    paintGateLabel();
    paintModifierSelection();
  }

  function paintGateLabel() {
    var gate = $("relic-start-gate");
    if (!gate) return;
    gate.textContent = "TAP TO START · " + formatTimer(player.remaining);
  }

  function paintModifierSelection() {
    var mods = document.querySelectorAll(".timer-mod[data-duration-min]");
    for (var i = 0; i < mods.length; i++) {
      var selected = ((+mods[i].getAttribute("data-duration-min") * 60) === SET_DURATION_SEC);
      mods[i].classList.toggle("is-selected", selected);
      mods[i].setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function setTimerModsOpen(open) {
    var panel = $("relic-timer-mods");
    var badge = $("relic-set-timer");
    if (!panel || !badge) return;
    panel.hidden = !open;
    badge.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleTimerMods() {
    var panel = $("relic-timer-mods");
    setTimerModsOpen(!(panel && !panel.hidden));
  }

  function dismissTimerMods() {
    setTimerModsOpen(false);
    var video = activeVideo();
    if (!video) return;
    try { video.focus({ preventScroll: true }); } catch (err) { /* viewport focus is optional */ }
  }

  function playerStage() {
    var root = $("relic-player");
    return root ? root.querySelector(".player-stage") : null;
  }

  function hudIsHidden() {
    var stage = playerStage();
    return !!(stage && stage.classList.contains("is-hud-idle"));
  }

  function eventElement(event) {
    var node = event && event.target;
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function isForensicChrome(node) {
    if (!node || !node.closest) return false;
    return !!node.closest(".forensic-tab, .forensic-panel, .forensic-dock");
  }

  function isHudChromeTarget(node) {
    if (!node || !node.closest) return false;
    return !!node.closest(".player-close, .player-controls, .timer-dock, .start-gate, .forensic-tab, .forensic-panel, .forensic-dock");
  }

  function paintForensic() {
    var stage = playerStage();
    if (!stage || !stage.classList.contains("is-forensic-open")) return;
    var credit = player.credit;
    var dateKey = credit && credit.dateKey ? String(credit.dateKey) : "";
    var parts = londonParts(state.now || getNow());
    var mask = dateKey ? (maskFor(dateKey) & 3) : 0;
    var dateEl = $("forensic-date-key");
    if (dateEl) dateEl.textContent = dateKey || "—";
    var tierEl = $("forensic-tier");
    if (tierEl) tierEl.textContent = dateKey ? String(mask) : "—";
    var branchEl = $("forensic-branch");
    if (branchEl) branchEl.textContent = state.branch;
    var yearEl = $("forensic-year");
    if (yearEl) yearEl.textContent = String(state.viewYear);
    var tickEl = $("forensic-cantick");
    if (tickEl) tickEl.textContent = dateKey ? (canTick(dateKey, parts) ? "true" : "false") : "—";
    var cabinKey = player.cabin || "";
    var entry = null;
    var lib = window.RELIC_FORENSIC;
    if (lib && typeof lib.read === "function") {
      entry = lib.read(state.branch === "bridge" ? "bridge" : "year", cabinKey);
    }
    var cabinEl = $("forensic-cabin");
    if (cabinEl) cabinEl.textContent = cabinKey || "—";
    var leadEl = $("forensic-lead");
    if (leadEl) {
      leadEl.textContent = "3-Lead Unique Rule: " + ((entry && entry.leadRule) ? entry.leadRule : "Left-Lead. 3-second ease.");
    }
    var doEl = $("forensic-do");
    if (doEl) doEl.textContent = "Do this properly: " + ((entry && entry.doThis) ? entry.doThis : "—");
    var avoidEl = $("forensic-avoid");
    if (avoidEl) avoidEl.textContent = "Avoid this: " + ((entry && entry.avoidThis) ? entry.avoidThis : "—");
    var breathEl = $("forensic-breath");
    if (breathEl) breathEl.textContent = "Breathing: " + ((entry && entry.breathing) ? entry.breathing : "—");
    var metrics = $("forensic-metrics");
    if (metrics) {
      metrics.textContent = (entry && entry.metrics)
        ? entry.metrics
        : "Sets: — | Reps: — | Hold: — | Rest: —";
    }
  }

  function setForensicOpen(open) {
    var panel = $("forensic-panel");
    var tab = $("forensic-tab");
    if (!panel || !tab) return;
    var next = !!open;
    /* Slide only. Leave player.timerId, the countdown, and the video src alone. */
    tab.setAttribute("aria-expanded", next ? "true" : "false");
    panel.setAttribute("aria-hidden", next ? "false" : "true");
    if ("inert" in panel) panel.inert = !next;
    var stage = playerStage();
    if (stage) stage.classList.toggle("is-forensic-open", next);
    if (next) paintForensic();
  }

  function stopForensicEvent(event) {
    if (event && event.stopPropagation) event.stopPropagation();
  }

  function showPlayerHud() {
    var root = $("relic-player");
    if (!root || root.hidden) return;
    var stage = playerStage();
    var hud = $("relic-player-hud");
    if (hud) hud.classList.add("is-hud-instant");
    if (stage) stage.classList.remove("is-hud-idle");
    if (hud) {
      hud.inert = false;
      hud.setAttribute("aria-hidden", "false");
      void hud.offsetWidth;
      hud.classList.remove("is-hud-instant");
    }
    if (player.hudTimer) clearTimeout(player.hudTimer);
    player.hudTimer = setTimeout(function () { hidePlayerHud(false); }, HUD_IDLE_MS);
  }

  function hidePlayerHud(instant) {
    if (player.hudTimer) {
      clearTimeout(player.hudTimer);
      player.hudTimer = null;
    }
    var root = $("relic-player");
    if (!root || root.hidden) return;
    var stage = playerStage();
    var hud = $("relic-player-hud");
    if (hud && document.activeElement && hud.contains(document.activeElement)) {
      var video = activeVideo();
      if (video) {
        try { video.focus({ preventScroll: true }); } catch (err) { /* viewport focus is optional */ }
      }
    }
    if (instant && hud) hud.classList.add("is-hud-instant");
    if (stage) stage.classList.add("is-hud-idle");
    if (hud) {
      hud.inert = true;
      hud.setAttribute("aria-hidden", "true");
      if (instant) {
        void hud.offsetWidth;
        hud.classList.remove("is-hud-instant");
      }
    }
    setTimeout(function () {
      var live = $("relic-player");
      var current = playerStage();
      if (!live || live.hidden) return;
      if (current && current.classList.contains("is-hud-idle")) setTimerModsOpen(false);
    }, instant ? 0 : 420);
  }

  function onStageHudPointerDown(event) {
    if (!event || event.button > 0) return;
    var node = eventElement(event);
    if (isForensicChrome(node)) return;
    if (isHudChromeTarget(node)) {
      showPlayerHud();
      return;
    }
    hudGesture = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      moved: false
    };
  }

  function onStageHudPointerMove(event) {
    if (!hudGesture || event.pointerId !== hudGesture.id) return;
    if (Math.abs(event.clientX - hudGesture.x) > TAP_SLOP || Math.abs(event.clientY - hudGesture.y) > TAP_SLOP) {
      hudGesture.moved = true;
    }
  }

  function onStageHudPointerUp(event) {
    if (!hudGesture || event.pointerId !== hudGesture.id) return;
    var moved = hudGesture.moved;
    hudGesture = null;
    if (moved) return;
    var node = eventElement(event);
    if (isForensicChrome(node) || isHudChromeTarget(node)) return;
    if (hudIsHidden()) {
      showPlayerHud();
      player.swallowChromeClick = true;
      setTimeout(function () { player.swallowChromeClick = false; }, 450);
      return;
    }
    hidePlayerHud(true);
  }

  function onStageHudClickCapture(event) {
    if (!player.swallowChromeClick) return;
    player.swallowChromeClick = false;
    if (!isHudChromeTarget(eventElement(event))) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function stopHudTimer() {
    if (player.hudTimer) {
      clearTimeout(player.hudTimer);
      player.hudTimer = null;
    }
  }

  function resumeCountdownIfLive() {
    if (!player.armed || player.empty || player.paused) return;
    if ((player.remaining | 0) <= 0) return;
    if (player.timerId) return;
    player.timerId = setInterval(tickCountdown, 1000);
  }

  function applyDurationOverride(minutes) {
    var mins = minutes | 0;
    if (SET_MODIFIER_MINUTES.indexOf(mins) === -1) return;
    var next = mins * 60;
    SET_DURATION_SEC = next;
    player.remaining = next;
    paintTimer();
    resumeCountdownIfLive();
    dismissTimerMods();
  }

  function applyAddMoreTime(minutes) {
    var mins = minutes | 0;
    if (SET_MODIFIER_MINUTES.indexOf(mins) === -1) return;
    player.remaining = Math.max(0, player.remaining | 0) + (mins * 60);
    paintTimer();
    resumeCountdownIfLive();
    dismissTimerMods();
  }

  function stopCountdown() {
    if (player.timerId) {
      clearInterval(player.timerId);
      player.timerId = null;
    }
  }

  function setGate(visible) {
    var gate = $("relic-start-gate");
    if (!gate) return;
    gate.hidden = !visible;
  }

  function setEmptyOverlay(visible) {
    var overlay = $("relic-empty-overlay");
    if (!overlay) return;
    overlay.hidden = !visible;
    if (visible) overlay.textContent = EMPTY_MSG;
  }

  function setMediaNote(visible) {
    var note = $("relic-media-note");
    var video = activeVideo();
    if (note) note.hidden = !visible;
    if (video) video.style.visibility = visible ? "hidden" : "visible";
  }

  function paintPlayButton() {
    var btn = $("btn-play-pause");
    if (!btn) return;
    var paused = player.paused || !player.armed;
    btn.textContent = paused ? "▶" : "❚❚";
    btn.setAttribute("aria-label", paused ? "Play" : "Pause");
  }

  function paintClipLabel() {
    var el = $("relic-clip-label");
    if (!el) return;
    if (player.empty || !player.clips.length) {
      el.textContent = player.cabin ? player.cabin + " · " + EMPTY_MSG : "";
      return;
    }
    var clip = player.clips[player.index];
    el.textContent = (player.cabin || "") + " · " +
      (player.index + 1) + "/" + player.clips.length + " · " +
      (clip && clip.title ? clip.title : "Clip");
  }

  function stripVideoChrome(video) {
    video.removeAttribute("poster");
    video.removeAttribute("controls");
    video.controls = false;
    video.preload = "auto";
    video.setAttribute("preload", "auto");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    try { video.disablePictureInPicture = true; } catch (err) { /* optional */ }
    try { video.disableRemotePlayback = true; } catch (err) { /* optional */ }
  }

  function stopFlushWatch() {
    player.flushToken = (player.flushToken | 0) + 1;
    player.wantsFlushFrame = false;
    if (player.flushFallback) {
      clearTimeout(player.flushFallback);
      player.flushFallback = null;
    }
  }

  function revealActiveFrame() {
    var video = activeVideo();
    var root = $("relic-player");
    var wasWaiting = !!player.awaitingReveal;
    var pending = !!player.wantsFlushFrame || wasWaiting;
    if (!pending && video && video.classList.contains("is-frame-ready")) return;
    if (video) video.classList.add("is-frame-ready");
    if (root) {
      root.classList.remove("is-awaiting-frame");
      if (!root.hidden) root.setAttribute("aria-hidden", "false");
    }
    player.awaitingReveal = false;
    stopFlushWatch();
    if (!wasWaiting) return;
    showPlayerHud();
    var closeBtn = $("relic-player-close");
    if (!closeBtn) return;
    try { closeBtn.focus({ preventScroll: true }); } catch (err) {
      try { closeBtn.focus(); } catch (err2) { /* focus is optional */ }
    }
  }

  function resumeIfNudged(video) {
    if (!video || player.paused || player.empty || !video.paused) return;
    var pending = video.play();
    if (pending && typeof pending.catch === "function") {
      pending.catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (err && err.name === "NotAllowedError") {
          player.paused = true;
          setGate(true);
          paintPlayButton();
        }
      });
    }
  }

  function nudgeFirstFrame(video) {
    if (!video || !player.wantsFlushFrame) return;
    if (video.readyState < 2) return;
    if (video.currentTime >= 0.05) {
      revealActiveFrame();
      return;
    }
    if (!video.paused || video.seeking) return;
    if (Math.abs(video.currentTime - 0.001) < 0.0001) {
      revealActiveFrame();
      return;
    }
    try {
      video.currentTime = 0.001;
    } catch (err) {
      revealActiveFrame();
    }
  }

  function armFlushFrame(video) {
    stopFlushWatch();
    var token = player.flushToken;
    var started = Date.now();
    player.wantsFlushFrame = true;
    video.classList.remove("is-frame-ready");
    if (typeof video.requestVideoFrameCallback === "function") {
      var onPresented = function () {
        if (token !== player.flushToken || !player.wantsFlushFrame) return;
        if (video.readyState < 2 || !video.videoWidth) {
          try { video.requestVideoFrameCallback(onPresented); } catch (err) { /* keep waiting */ }
          return;
        }
        revealActiveFrame();
      };
      try { video.requestVideoFrameCallback(onPresented); } catch (err) { /* frame callback is optional */ }
    }
    function poll() {
      if (token !== player.flushToken || !player.wantsFlushFrame) return;
      if (video.readyState >= 2 && !video.paused && video.videoWidth) {
        revealActiveFrame();
        return;
      }
      if (video.readyState >= 2 && video.paused && !video.seeking && video.videoWidth) nudgeFirstFrame(video);
      if (token !== player.flushToken || !player.wantsFlushFrame) return;
      if (video.error || (Date.now() - started) > 8000) {
        revealActiveFrame();
        return;
      }
      player.flushFallback = setTimeout(poll, 120);
    }
    player.flushFallback = setTimeout(poll, 120);
  }

  function warmCabinLead(cabinKey) {
    var clips = clipsForCabin(cabinKey);
    var src = clips.length ? clips[0].src : "";
    var warm = $("relic-frame-warm");
    if (!warm || !src) return;
    if (warm.getAttribute("src") === src) return;
    stripVideoChrome(warm);
    warm.muted = true;
    warm.defaultMuted = true;
    warm.setAttribute("muted", "");
    warm.removeAttribute("autoplay");
    warm.autoplay = false;
    warm.src = src;
    try { warm.load(); } catch (err) { /* warm is best-effort */ }
  }

  function assignVideoSrc(src) {
    var video = activeVideo();
    if (!video) return;
    var safe = src || "about:blank";
    if (safe !== "about:blank" && isBlockedMediaUrl(safe)) safe = "about:blank";
    stripVideoChrome(video);
    var playable = safe !== "about:blank";
    video.autoplay = playable;
    video.loop = playable;
    if (playable) {
      video.setAttribute("autoplay", "");
      video.setAttribute("loop", "");
      armFlushFrame(video);
    } else {
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
      video.classList.remove("is-frame-ready");
      stopFlushWatch();
      var root = $("relic-player");
      if (root) root.classList.remove("is-awaiting-frame");
    }
    setMediaNote(false);
    if (video.getAttribute("src") !== safe) {
      video.src = safe;
      try { video.load(); } catch (err) { /* about:blank is not a media file */ }
    } else if (playable && video.readyState >= 2) {
      nudgeFirstFrame(video);
    }
  }

  function showEmptyFrame() {
    player.empty = true;
    player.armed = false;
    player.paused = true;
    player.awaitingReveal = false;
    stopCountdown();
    player.remaining = SET_DURATION_SEC;
    paintTimer();
    var root = $("relic-player");
    if (root) {
      root.classList.remove("is-awaiting-frame");
      if (!root.hidden) root.setAttribute("aria-hidden", "false");
    }
    assignVideoSrc("about:blank");
    setEmptyOverlay(true);
    setGate(false);
    paintClipLabel();
    paintPlayButton();
  }

  function loadCurrentClip(shouldPlay) {
    var clip = player.clips[player.index];
    if (!clip || !clip.src) {
      showEmptyFrame();
      return;
    }
    player.empty = false;
    setEmptyOverlay(false);
    assignVideoSrc(clip.src);
    paintClipLabel();
    if (!shouldPlay) {
      try { activeVideo().pause(); } catch (err) { /* not playing yet */ }
      return;
    }
    var token = {};
    player.playToken = token;
    var pending = activeVideo().play();
    if (pending && typeof pending.then === "function") {
      pending.then(function () {
        if (player.playToken !== token) return;
        player.paused = false;
        setGate(false);
        paintPlayButton();
      }).catch(function (err) {
        if (player.playToken !== token) return;
        /* A seek that paints frame 0 aborts the first play(); start it again from seeked. */
        if (err && err.name === "AbortError") return;
        /* A missing file must not freeze the 20-minute set. Only an autoplay block waits for a tap. */
        var blocked = err && err.name === "NotAllowedError";
        player.paused = !!blocked;
        setGate(!!blocked);
        paintPlayButton();
        if (blocked) nudgeFirstFrame(activeVideo());
      });
    }
  }

  function tickCountdown() {
    if (!player.armed || player.paused || player.empty) return;
    player.remaining -= 1;
    if (player.remaining <= 0) {
      player.remaining = 0;
      paintTimer();
      stopCountdown();
      noteSetComplete();
      if (citationSetIsFinished()) {
        setTimeout(closePlayer, 0);
        return;
      }
      setTimeout(playNextVideo, 0);
      return;
    }
    paintTimer();
  }

  function startCountdown() {
    stopCountdown();
    player.remaining = SET_DURATION_SEC;
    player.armed = true;
    paintTimer();
    player.timerId = setInterval(tickCountdown, 1000);
  }

  function playNextVideo() {
    if (!player.clips.length) {
      showEmptyFrame();
      return;
    }
    player.index = (player.index + 1) % player.clips.length;
    player.paused = false;
    setGate(false);
    loadCurrentClip(true);
    startCountdown();
    paintPlayButton();
  }

  function playPreviousVideo() {
    if (!player.clips.length) {
      showEmptyFrame();
      return;
    }
    player.index = (player.index - 1 + player.clips.length) % player.clips.length;
    player.paused = false;
    setGate(false);
    loadCurrentClip(true);
    startCountdown();
    paintPlayButton();
  }

  function togglePlayPause() {
    if (player.empty) return;
    var video = activeVideo();
    if (!player.armed) {
      player.paused = false;
      setGate(false);
      loadCurrentClip(true);
      startCountdown();
      paintPlayButton();
      return;
    }
    if (player.paused) {
      player.paused = false;
      setGate(false);
      var pending = video.play();
      if (pending && typeof pending.catch === "function") {
        pending.catch(function (err) {
          if (err && err.name === "NotAllowedError") {
            player.paused = true;
            setGate(true);
            paintPlayButton();
          }
        });
      }
    } else {
      player.paused = true;
      try { video.pause(); } catch (err) { /* already paused */ }
    }
    paintPlayButton();
  }

  function closePlayer() {
    stopHudTimer();
    stopFlushWatch();
    player.awaitingReveal = false;
    setTimerModsOpen(false);
    setForensicOpen(false);
    stopCountdown();
    setTimerModsOpen(false);
    player.armed = false;
    player.paused = false;
    player.empty = false;
    player.clips = [];
    player.index = 0;
    player.cabin = null;
    player.credit = null;
    setMediaNote(false);
    try {
      var video = activeVideo();
      video.pause();
      video.classList.remove("is-frame-ready");
      video.removeAttribute("poster");
      video.removeAttribute("src");
      video.load();
    } catch (err) { /* closed */ }
    setEmptyOverlay(false);
    setGate(false);
    var root = $("relic-player");
    if (root) {
      root.classList.remove("is-awaiting-frame");
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("player-open");
    var shouldPop = player.historyPushed;
    player.historyPushed = false;
    if (shouldPop) {
      try {
        if (history.state && history.state.relicPlayer) history.back();
      } catch (err) { /* no history entry */ }
    }
  }

  function openCabin(cabinKey, phase, dateKey, slot) {
    if (!cabinKey) return;
    player.credit = null;
    player.cabin = cabinKey;
    player.phase = phase || "Base";
    player.index = 0;
    player.clips = clipsForCabin(cabinKey);
    warmCabinLead(cabinKey);

    var root = $("relic-player");
    var wasHidden = !root || root.hidden;
    if (!player.historyPushed) {
      try {
        history.pushState({ relicPlayer: 1 }, "");
        player.historyPushed = true;
      } catch (err) { /* file:// may refuse */ }
    }

    if (!player.clips.length) {
      player.credit = null;
      player.awaitingReveal = false;
      if (root) {
        root.classList.remove("is-awaiting-frame");
        root.hidden = false;
        root.setAttribute("aria-hidden", "false");
      }
      document.body.classList.add("player-open");
      showPlayerHud();
      showEmptyFrame();
      $("relic-player-close").focus();
      return;
    }

    player.awaitingReveal = !!wasHidden;
    if (root) {
      if (wasHidden) {
        root.classList.add("is-awaiting-frame");
        root.setAttribute("aria-hidden", "true");
      }
      root.hidden = false;
    }
    document.body.classList.add("player-open");
    if (!player.awaitingReveal) showPlayerHud();

    if (dateKey) {
      player.credit = {
        dateKey: String(dateKey),
        slot: String(slot) === "1" ? 1 : 0,
        storageKey: completionStorageKey(String(dateKey))
      };
    }
    player.empty = false;
    player.paused = false;
    setEmptyOverlay(false);
    setGate(false);
    loadCurrentClip(true);
    startCountdown();
    paintPlayButton();
    if (!player.awaitingReveal) $("relic-player-close").focus();
  }

  function wire() {
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      btn.addEventListener("click", function () { pickMonth(+btn.getAttribute("data-month")); });
    });
    document.querySelectorAll(".wtab").forEach(function (btn) {
      btn.addEventListener("click", function () { pickWeek(+btn.getAttribute("data-week")); });
    });
    var modeBtn = $("btn-schedule-mode");
    if (modeBtn) {
      modeBtn.addEventListener("click", function () {
        toggleScheduleMode();
      });
    }
    var navBtn = $("btn-nav-toggle");
    if (navBtn) {
      navBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        setNavOpen(!document.body.classList.contains("nav-open"));
      });
    }
    var navScrim = $("nav-scrim");
    if (navScrim) {
      navScrim.addEventListener("click", function () { setNavOpen(false); });
    }
    document.querySelectorAll("[data-set-mode]").forEach(function (opt) {
      opt.addEventListener("click", function () {
        setScheduleMode(opt.getAttribute("data-set-mode"));
        setNavOpen(false);
      });
    });
    document.querySelectorAll("[data-set-branch]").forEach(function (opt) {
      opt.addEventListener("click", function () {
        setBranch(opt.getAttribute("data-set-branch"));
        setNavOpen(false);
      });
    });
    document.querySelectorAll("[data-os-door]").forEach(function (doorBtn) {
      doorBtn.addEventListener("click", function () {
        var name = doorBtn.getAttribute("data-os-door");
        if (name === "training") {
          state.foodRoom = "";
          state.smoothieRoom = "";
          state.foodFocusId = "";
          state.smoothieFocusId = "";
          state.foodEditing = false;
          state.smoothieEditing = false;
          state.osDoor = "training";
          render();
          return;
        }
        state.osDoor = name;
        paintOsDoors();
      });
    });
    document.querySelectorAll("[data-food-room]").forEach(function (foodBtn) {
      foodBtn.addEventListener("click", function () {
        openFoodRoom(foodBtn.getAttribute("data-food-room"));
        setNavOpen(false);
      });
    });
    document.querySelectorAll("[data-smoothie-room]").forEach(function (smoothieBtn) {
      smoothieBtn.addEventListener("click", function () {
        openSmoothieRoom(smoothieBtn.getAttribute("data-smoothie-room"));
        setNavOpen(false);
      });
    });
    var smoothieBoard = $("smoothie-board");
    if (smoothieBoard) {
      smoothieBoard.addEventListener("click", function (event) {
        if (event.target.closest("#btn-smoothie-close")) {
          closeSmoothieRoom();
          return;
        }
        onSmoothieClick(event);
      });
    }
    var foodBoard = $("food-board");
    if (foodBoard) {
      var dragTimer = 0;
      foodBoard.addEventListener("pointerdown", function (event) {
        var chip = event.target.closest("[data-drag-kind]");
        if (!chip) return;
        clearTimeout(dragTimer);
        dragTimer = setTimeout(function () {
          state.foodDrag = {
            kind: chip.getAttribute("data-drag-kind"),
            id: chip.getAttribute("data-drag-id")
          };
          foodBoard.classList.add("is-food-drag");
          document.querySelectorAll("[data-food-slot]").forEach(function (slot) {
            var name = slot.getAttribute("data-food-slot");
            var kind = state.foodDrag.kind;
            var ok = !(name === "evening" && kind === "extraction") && !(name === "morning" && kind !== "extraction");
            slot.classList.toggle("is-valid", ok);
            slot.classList.toggle("is-invalid", !ok);
          });
        }, 420);
      });
      foodBoard.addEventListener("pointerup", function (event) {
        clearTimeout(dragTimer);
        if (!state.foodDrag) return;
        state.foodDragMoved = true;
        var slot = document.elementFromPoint(event.clientX, event.clientY);
        var target = slot && slot.closest ? slot.closest("[data-food-slot]") : null;
        if (target) dropFoodCard(target.getAttribute("data-date"), target.getAttribute("data-food-slot"), state.foodDrag.kind, state.foodDrag.id);
        state.foodDrag = null;
        foodBoard.classList.remove("is-food-drag");
        document.querySelectorAll("[data-food-slot]").forEach(function (node) {
          node.classList.remove("is-valid");
          node.classList.remove("is-invalid");
        });
        render();
      });
      foodBoard.addEventListener("pointercancel", function () {
        clearTimeout(dragTimer);
        state.foodDrag = null;
        foodBoard.classList.remove("is-food-drag");
      });
      foodBoard.addEventListener("click", function (event) {
        if (state.foodDragMoved) {
          state.foodDragMoved = false;
          event.preventDefault();
          return;
        }
        if (onV22Click(event)) return;
        var weekAct = event.target.closest("[data-week-action]");
        if (weekAct) {
          onFoodWeekAction(weekAct);
          return;
        }
        var filterBtn = event.target.closest("[data-food-filter]");
        if (filterBtn) {
          state.foodFilter = filterBtn.getAttribute("data-food-filter") || "all";
          render();
          return;
        }
        var pinBtn = event.target.closest("[data-card-pin]");
        if (pinBtn) {
          var store = readCardStore();
          store.pins = { evening: pinBtn.getAttribute("data-card-pin") };
          writeJsonStore(FOOD_CARDS_KEY, store);
          state.foodRefuse = "";
          render();
          return;
        }
        if (event.target.closest("#btn-food-close")) {
          closeFoodRoom();
          return;
        }
        var scanAct = event.target.closest("[data-scan-action]");
        if (scanAct) {
          onScanAction(scanAct);
          return;
        }
        var tool = event.target.closest("[data-food-tool]");
        if (tool) {
          var room = state.foodRoom;
          var which = tool.getAttribute("data-food-tool");
          if (which === "export") fillFoodJson(room);
          if (which === "import") importFoodJson(room);
          if (which === "reset") resetFoodRoom(room);
          return;
        }
        var cardAct = event.target.closest("[data-card-action]");
        if (cardAct) {
          onCardAction(cardAct);
          return;
        }
        var indexBtn = event.target.closest("[data-food-index]");
        if (indexBtn) {
          state.foodFocusId = "";
          state.foodEditing = false;
          render();
          return;
        }
        var meal = event.target.closest("[data-food-meal]");
        if (meal) {
          openFoodRoom("meals", meal.getAttribute("data-food-meal"), meal.getAttribute("data-food-band"));
          return;
        }
        var extraction = event.target.closest("[data-food-extraction]");
        if (extraction) {
          openFoodRoom("extractions", extraction.getAttribute("data-food-extraction"), extraction.getAttribute("data-food-band"));
          return;
        }
        var shopAct = event.target.closest("[data-shop-action]");
        if (shopAct) onShopAction(shopAct);
      });
      foodBoard.addEventListener("input", function (event) {
        if (!event.target.closest(".scan-preview")) return;
        var preview = readScanForm();
        if (!preview || preview.error) return;
        var pre = event.target.closest(".scan-preview").querySelector(".scan-json");
        if (pre) pre.textContent = JSON.stringify(scanExport(preview), null, 2);
      });
      foodBoard.addEventListener("change", function (event) {
        var scanFile = event.target.closest("[data-scan-file]");
        if (scanFile) {
          readScanFile(scanFile);
          return;
        }
        var weekField = event.target.closest("[data-week-field]");
        if (weekField) {
          var patch = {};
          var weekName = weekField.getAttribute("data-week-field");
          patch[weekName] = weekName === "citations" ? linesOf(weekField.value) : weekField.value.trim();
          saveWeekNote(weekField.getAttribute("data-week-date"), patch);
          render();
          return;
        }
        var shopPhoto = event.target.closest("[data-shop-photo]");
        if (shopPhoto) {
          readShopPhoto(shopPhoto);
          return;
        }
        var shopField = event.target.closest("[data-shop-field]");
        if (!shopField) return;
        var draft = draftFor(state.viewYear, state.viewMonth, true);
        var item = draft.items[+shopField.getAttribute("data-shop-index")];
        if (!item) return;
        var fieldName = shopField.getAttribute("data-shop-field");
        if (fieldName === "name") {
          var previous = shopItemLabel(item);
          var nextName = shopField.value.trim();
          if (item.customName) item.customName = nextName || item.customName;
          else if (nextName) item.label = nextName;
          var cites = normalizeCitations(item.citations);
          if (!cites.length || (cites.length === 1 && cites[0] === previous)) item.citations = [shopItemLabel(item)];
        }
        if (fieldName === "tag") item.tag = normalizeTag(shopField.value) || "other";
        if (fieldName === "citations") item.citations = linesOf(shopField.value);
        if (!normalizeCitations(item.citations).length) item.citations = shopItemCitations(item);
        saveDraft(draft);
        if (fieldName !== "name") render();
      });
    }
    var forensicTab = $("forensic-tab");
    var forensicPanel = $("forensic-panel");
    var forensicDock = $("forensic-dock");
    if (forensicDock) {
      forensicDock.addEventListener("pointerdown", stopForensicEvent);
      forensicDock.addEventListener("click", stopForensicEvent);
    }
    if (forensicTab) {
      forensicTab.addEventListener("pointerdown", stopForensicEvent);
      forensicTab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var stage = playerStage();
        setForensicOpen(!(stage && stage.classList.contains("is-forensic-open")));
      });
    }
    if (forensicPanel) {
      forensicPanel.addEventListener("pointerdown", stopForensicEvent);
      forensicPanel.addEventListener("click", stopForensicEvent);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var playerRoot = $("relic-player");
      var playerOpen = playerRoot && !playerRoot.hidden;
      if (state.foodRoom && !playerOpen && !document.body.classList.contains("nav-open")) {
        event.preventDefault();
        closeFoodRoom();
        return;
      }
      if (!document.body.classList.contains("nav-open")) return;
      if (playerOpen) return;
      event.preventDefault();
      setNavOpen(false);
      if (navBtn) navBtn.focus();
    });
    setNavOpen(false);
    $("tt-body").addEventListener("pointerdown", function (event) {
      surfacePress = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    });
    $("tt-body").addEventListener("pointermove", function (event) {
      if (!surfacePress || event.pointerId !== surfacePress.id || surfacePress.moved) return;
      if (Math.abs(event.clientX - surfacePress.x) > TAP_SLOP || Math.abs(event.clientY - surfacePress.y) > TAP_SLOP) {
        surfacePress.moved = true;
      }
    });
    $("tt-body").addEventListener("click", function (event) {
      if (surfacePress && surfacePress.moved) return;
      var hit = event.target.closest("button.tick-hit");
      if (!hit) return;
      event.preventDefault();
      onTick(hit);
    });
    $("tt-body").addEventListener("pointerover", function (event) {
      var link = event.target.closest("a.cite-link");
      if (!link) return;
      warmCabinLead(link.getAttribute("data-cabin"));
    });
    $("tt-body").addEventListener("pointerdown", function (event) {
      var link = event.target.closest("a.cite-link");
      if (!link) return;
      warmCabinLead(link.getAttribute("data-cabin"));
    });
    $("tt-body").addEventListener("click", function (event) {
      if (surfacePress && surfacePress.moved) return;
      var link = event.target.closest("a.cite-link");
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      openCabin(
        link.getAttribute("data-cabin"),
        link.getAttribute("data-phase") || "Base",
        link.getAttribute("data-date"),
        link.getAttribute("data-slot")
      );
    });

    $("relic-player-close").addEventListener("click", closePlayer);
    $("relic-start-gate").addEventListener("click", togglePlayPause);
    var stage = playerStage();
    if (stage) {
      stage.addEventListener("pointerdown", onStageHudPointerDown);
      stage.addEventListener("pointermove", onStageHudPointerMove);
      stage.addEventListener("pointerup", onStageHudPointerUp);
      stage.addEventListener("pointercancel", function () { hudGesture = null; });
      stage.addEventListener("click", onStageHudClickCapture, true);
    }
    document.addEventListener("pointerdown", function (event) {
      var calm = event.target.closest(".mbtn, .wtab, #btn-schedule-mode, [data-set-mode], [data-set-branch]");
      if (!calm || event.button > 0) return;
      surfacePress = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    }, true);
    document.addEventListener("pointermove", function (event) {
      if (!surfacePress || event.pointerId !== surfacePress.id || surfacePress.moved) return;
      if (Math.abs(event.clientX - surfacePress.x) > TAP_SLOP || Math.abs(event.clientY - surfacePress.y) > TAP_SLOP) {
        surfacePress.moved = true;
      }
    }, true);
    document.addEventListener("click", function (event) {
      if (!surfacePress || !surfacePress.moved) return;
      if (!event.target.closest(".mbtn, .wtab, #btn-schedule-mode, [data-set-mode], [data-set-branch]")) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    document.addEventListener("click", function () {
      if (surfacePress && surfacePress.moved) surfacePress = null;
    });
    $("btn-prev-clip").addEventListener("click", playPreviousVideo);
    $("btn-next-clip").addEventListener("click", playNextVideo);
    $("btn-play-pause").addEventListener("click", togglePlayPause);

    var timerBadge = $("relic-set-timer");
    if (timerBadge) {
      timerBadge.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleTimerMods();
      });
    }
    var timerMods = $("relic-timer-mods");
    if (timerMods) {
      timerMods.addEventListener("click", function (event) {
        event.stopPropagation();
        var durationBtn = event.target.closest("[data-duration-min]");
        if (durationBtn) {
          applyDurationOverride(+durationBtn.getAttribute("data-duration-min"));
          return;
        }
        var addBtn = event.target.closest("[data-add-min]");
        if (!addBtn) return;
        applyAddMoreTime(+addBtn.getAttribute("data-add-min"));
      });
    }
    document.addEventListener("click", function (event) {
      var panel = $("relic-timer-mods");
      if (!panel || panel.hidden) return;
      var dock = $("relic-timer-dock");
      if (dock && event.target && dock.contains(event.target)) return;
      setTimerModsOpen(false);
    });

    activeVideo().addEventListener("error", function () {
      if (player.empty) return;
      var src = activeVideo().getAttribute("src") || "";
      if (!src || src === "about:blank") return;
      setMediaNote(true);
      revealActiveFrame();
    });
    activeVideo().addEventListener("loadeddata", function () {
      setMediaNote(false);
      nudgeFirstFrame(activeVideo());
    });
    activeVideo().addEventListener("playing", function () {
      var video = activeVideo();
      if (!video || !player.wantsFlushFrame || !video.videoWidth) return;
      revealActiveFrame();
    });
    activeVideo().addEventListener("seeked", function () {
      var video = activeVideo();
      if (!video || !player.wantsFlushFrame) return;
      if (video.currentTime < 0.0005) return;
      var resume = !player.paused && !player.empty && video.paused;
      revealActiveFrame();
      if (resume) resumeIfNudged(video);
    });

    document.addEventListener("keydown", function (event) {
      var root = $("relic-player");
      if (!root || root.hidden) return;
      if (event.key === "Escape" || event.key === " " || event.key === "ArrowRight" || event.key === "ArrowLeft") {
        showPlayerHud();
      }
      if (event.key === "Escape") {
        var modsPanel = $("relic-timer-mods");
        if (modsPanel && !modsPanel.hidden) {
          event.preventDefault();
          setTimerModsOpen(false);
          return;
        }
        event.preventDefault();
        closePlayer();
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlayPause();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        playNextVideo();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        playPreviousVideo();
      }
    });

    window.addEventListener("popstate", function () {
      var root = $("relic-player");
      if (root && !root.hidden) {
        player.historyPushed = false;
        closePlayer();
      }
    });
  }

  function boot() {
    if (!S) {
      setSync("Schedule data failed to load.", true);
      return;
    }
    state.mode = parseModeOverride();
    if (state.mode === "upper" && !upperSchedule()) state.mode = "full";
    wire();
    render();
    pullCompletions().then(render);
    setInterval(function () {
      var previous = state.now && londonParts(state.now).dateKey;
      state.now = getNow();
      var next = londonParts(state.now).dateKey;
      if (previous !== next) {
        state.userPicked = false;
        render();
      } else {
        var parts = londonParts(state.now);
        var today = $("meta-today");
        if (today) today.innerHTML = "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday;
        paintLondonClock();
      }
    }, 30000);
    setInterval(paintLondonClock, 1000);
  }

  window.playNextVideo = playNextVideo;
  window.RelicArchitect = {
    version: "2.0",
    build: "v26",
    get nutrition() {
      return {
        shop: foodShop(),
        meals: foodMeals(),
        extractions: foodExtractions(),
        schedule: foodSchedule()
      };
    },
    get viewYear() { return state.viewYear; },
    get branch() { return state.branch; },
    setBranch: setBranch,
    monthCacheKey: monthCacheKey,
    canTickDate: function (dateKey) {
      return canTick(dateKey, londonParts(state.now || getNow()));
    },
    get setSeconds() { return SET_DURATION_SEC; },
    get SET_DURATION_SEC() { return SET_DURATION_SEC; },
    get remaining() { return player.remaining; },
    resolveClipSrc: resolveClipSrc,
    openCabin: openCabin,
    playNextVideo: playNextVideo,
    applyDurationOverride: applyDurationOverride,
    applyAddMoreTime: applyAddMoreTime,
    get mode() { return state.mode; },
    toggleScheduleMode: toggleScheduleMode,
    setScheduleMode: setScheduleMode,
    MODE_LABEL: MODE_LABEL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
