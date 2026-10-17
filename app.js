/* Relic Architect V2.0 — timetable, Supabase completions, HTML5 cabin player.
   Playback is Supabase Storage only. Drive iframes, previews, and embeddedfolderview are refused.
   Completions upsert relic_completions. localStorage is not the source of truth.
   Schedule mode (full | upper) swaps the rotation and its own completion namespace.
   Full Body keeps the legacy bare YYYY-MM-DD key. Upper Body uses upper:YYYY-MM-DD.
   v14: each day has two trainer videos. tier is a bitmask (1 first, 2 second, 3 dual).
   Badge paint reads normalizeTier(tier) only. completed never invents a shield.
   Mode preference stays in memory.
   v15: viewYear 2026 was the Q4 bridge. v45 keeps the timetable on 2027.
   v46: the 2027 row opens and closes Upper Body and Full Body.
   v47: that row sits above Training lock. The Ambient Hub label is gone.
   v48: the Hub is the start screen. Notes is gone. Food and Smoothies locks are separate.
   v49: the Hub reads 2027 ticks from 1 Jan, view-only, with separate year stats.
   Month-row cache keys are year:mode:month. v29 ticks every day unless the menu
   lock is on. Lock on allows today and past only, and each day opens on its London date.
   v16: the CUE panel slides up from the bottom of the stage. Week chips keep a single
   slot and a dual slot. Calisthenics is Q4 2027 only.
   v18: Food OS is four rooms behind the drawer. It does not write
   relic_completions, move the player timer, or open the CUE panel.
   v19: day ticks glow, cabin switches keep their scroll, and weekly rows carry
   portions. */
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
  var FUTURE_LOCK_KEY = "relic_future_lock";

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
    hgWindow: "2027-01",
    hgMonth: 1,
    hgYear: 2027,
    hgWeek: 1,
    foodGrid: null,
    foodPackAsk: "",
    foodLandCell: "",
    foodOffer: "",
    foodFlyError: "",
    smoothieRoom: "",
    smoothieFocusId: "",
    smoothieEditing: false,
    smoothiePick: "",
    smoothieWindow: "2027-01",
    smoothieMonth: 1,
    smoothieYear: 2027,
    smoothieWeek: 1,
    smoothieGrid: null,
    smoothiePackAsk: "",
    smoothieLandCell: "",
    smoothieOffer: "",
    smoothieFlyError: "",
    osDoor: "hub",
    hubTab: "food",
    hubWeek: 0,
    hubArtLoaded: false,
    menuCabin: null,
    futureLock: false,
    foodRefuse: "",
    foodUndo: null,
    foodFilter: "all",
    foodDrag: null,
    foodFocusId: "",
    foodFocusBand: "moderate",
    foodEditing: false,
    scanPreview: null
  };
  state.futureLock = readFutureLock();

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
    credit: null,
    retries: {},
    phaseState: "idle",
    generation: 0,
    setEndsAt: 0,
    lastManualAt: 0,
    progressAt: 0,
    progressTime: 0,
    progressAhead: 0,
    hasProgressed: false,
    stallReloaded: false,
    unavailable: false,
    advanceCount: 0,
    clipAbort: null,
    watchId: null,
    mediaBound: false
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

  var SCHEDULE_MODE_KEY = "relic_schedule_mode";
  var NAV_MARK_KEY = "relic_nav_mark";

  function parseModeOverride() {
    var match = /[?&]mode=(upper|full)\b/.exec(location.search || "");
    if (!match) return "";
    return match[1] === "upper" ? "upper" : "full";
  }

  function readStoredMode() {
    try {
      var stored = localStorage.getItem(SCHEDULE_MODE_KEY);
      if (stored === "upper" || stored === "full") return stored;
    } catch (err) { /* private mode */ }
    return "";
  }

  function writeStoredMode(mode) {
    try { localStorage.setItem(SCHEDULE_MODE_KEY, mode); } catch (err) { /* private mode */ }
  }

  function readStoredMark() {
    try {
      var stored = localStorage.getItem(NAV_MARK_KEY);
      if (stored === "mode") return stored;
    } catch (err) { /* private mode */ }
    return "";
  }

  function writeStoredMark(mark) {
    try { localStorage.setItem(NAV_MARK_KEY, mark); } catch (err) { /* private mode */ }
  }

  function upperSchedule() {
    return window.RELIC_UPPER_BODY || null;
  }

  /* 2027 Full Body stays on RELIC_SCHEDULE. Upper Body stays on RELIC_UPPER_BODY. */
  function timetableSource() {
    if (viewingUpper()) return upperSchedule() || S;
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

  function readFutureLock() {
    try { return localStorage.getItem(FUTURE_LOCK_KEY) === "1"; }
    catch (err) { return false; }
  }

  function writeFutureLock(on) {
    try {
      if (on) localStorage.setItem(FUTURE_LOCK_KEY, "1");
      else localStorage.removeItem(FUTURE_LOCK_KEY);
    } catch (err) { /* private mode */ }
  }

  /* Lock off (default): any real training day can tick.
     Lock on: today and earlier tick. A later day becomes a tick when London
     reaches that date, including dates in 2027. An empty date stays closed. */
  function canTick(dateKey, parts) {
    if (!dateKey || !parts || !parts.dateKey) return false;
    if (!state.futureLock) return true;
    return dateKey <= parts.dateKey;
  }

  function normDoor(v) {
    if (v === "training" || v === "food" || v === "smoothies" || v === "hub" || v === "account") return v;
    return "hub";
  }

  function trainingDeepLink() {
    return /[?&]mode=(upper|full)\b/.test(location.search || "") || /[?&]date=\d{4}-\d{2}-\d{2}/.test(location.search || "");
  }

  function doorOverride() {
    var match = /[?&]door=([a-z]+)/.exec(location.search || "");
    return match ? normDoor(match[1]) : "";
  }

  function paintFutureLock() {
    var section = $("nav-lock");
    var training = state.osDoor === "training";
    if (section) section.hidden = !training;
    var btn = $("btn-future-lock");
    if (!btn) return;
    var on = !!state.futureLock;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Lock on" : "Lock off");
  }

  function setFutureLock(on) {
    state.futureLock = !!on;
    writeFutureLock(state.futureLock);
    if ($("relic-card")) render();
    else paintFutureLock();
  }

  function syncBranch() {
    state.viewYear = 2027;
    state.branch = "year";
  }

  function periodMonths() {
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
      var source = timetableSource();
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

  function planFocusDate() {
    var override = parseDateOverride();
    var parts = londonParts(override || new Date());
    if (parts.year < 2027) return new Date(Date.UTC(2027, 0, 1, 12, 0, 0));
    if (parts.year > 2027) return new Date(Date.UTC(2027, 11, 31, 12, 0, 0));
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  }

  function hubTrainingDays(mode) {
    var source = mode === "upper" ? (upperSchedule() || S) : S;
    var days = [];
    if (!source || !source.buildMonthDays) return days;
    var month;
    for (month = 1; month <= 12; month++) {
      source.buildMonthDays(2027, month).forEach(function (day) {
        if (!day.isRecovery && day.dayIndex < 6) days.push(day);
      });
    }
    return days;
  }

  function hubCredit(tier) {
    if (tier === 3) return 1;
    if (tier === 1 || tier === 2) return 0.5;
    return 0;
  }

  function hubCreditText(value) {
    var doubled = Math.round(value * 2);
    if (doubled % 2 === 0) return String(doubled / 2);
    return (doubled / 2).toFixed(1);
  }

  function hubYear(mode) {
    var days = hubTrainingDays(mode);
    var credit = 0;
    var videos = 0;
    days.forEach(function (day) {
      var tier = state.loaded ? normalizeTier(maskFor(day.dateKey, mode)) : 0;
      credit += hubCredit(tier);
      videos += popcount(tier);
    });
    var focusKey = londonParts(planFocusDate()).dateKey;
    var total = days.length;
    var videoTotal = total * 2;
    return {
      days: total,
      credit: credit,
      videos: videos,
      pct: total ? Math.round((credit / total) * 100) : 0,
      videoPct: videoTotal ? Math.round((videos / videoTotal) * 100) : 0,
      focus: focusKey
    };
  }

  function hubEsc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hubStatsHtml(mode) {
    var score = hubYear(mode);
    var dayWidth = score.days ? Math.max(0, Math.min(100, (score.credit / score.days) * 100)) : 0;
    var videoTotal = score.days * 2;
    var videoWidth = videoTotal ? Math.max(0, Math.min(100, (score.videos / videoTotal) * 100)) : 0;
    return '<div class="hub-metric"><span class="hub-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + score.days +
      '" aria-valuenow="' + score.credit + '" aria-label="Training days"><span class="hub-fill" style="width:' + dayWidth +
      '%"></span></span><p class="hub-metric-line"><span>DAYS ' + hubCreditText(score.credit) + " / " + score.days +
      '</span><span class="hub-pct">' + score.pct + '%</span></p></div>' +
      '<div class="hub-metric"><span class="hub-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + videoTotal +
      '" aria-valuenow="' + score.videos + '" aria-label="Videos"><span class="hub-fill" style="width:' + videoWidth +
      '%"></span></span><p class="hub-metric-line"><span>VIDEOS ' + score.videos + " / " + videoTotal +
      '</span><span class="hub-pct">' + score.videoPct + "%</span></p></div>";
  }

  function hubLockChips(months) {
    var many = months.length > 1;
    var html = "";
    months.forEach(function (month) {
      [["food", "FOOD", month.food], ["smoothies", "SMOOTHIES", month.smoothies]].forEach(function (row) {
        var prefix = many ? month.name.slice(0, 3).toUpperCase() + " " : "";
        var word = row[2] === "Locked" ? "LOCKED" : "DRAFT";
        html += '<span class="hub-lock">' + hubEsc(prefix + row[1] + " · " + word) + "</span>";
      });
    });
    return html;
  }

  function hubWeekHtml(view, planStart) {
    if (!view) return '<p class="hub-empty-week">No schedule yet.</p>';
    var head = "WEEK " + view.week + " · " + view.label;
    if (planStart) head += " · PLAN START";
    var html = '<p class="hub-week-head">' + hubEsc(head) + "</p>";
    html += '<div class="hub-locks">' + hubLockChips(view.months || []) + "</div>";
    if (view.empty) html += '<p class="hub-empty-week">No schedule yet.</p>';
    html += '<div class="hub-days">';
    (view.days || []).forEach(function (day) {
      html += '<article class="hub-day' + (day.focus ? " is-focus" : "") + '" data-date="' + hubEsc(day.date) + '">';
      html += '<div class="hub-day-date"><span class="hub-dow">' + hubEsc((day.label || "").split(" ")[0] || "") +
        '</span><span class="hub-date">' + hubEsc(String(+String(day.date).slice(8))) + "</span></div>";
      html += '<div class="hub-day-slots">';
      var meals = day.meals || {};
      var groups = [
        ["Breakfast", meals.breakfast, (day.smoothies || []).filter(function (row) { return row.at === "breakfast"; })],
        ["Lunch", meals.lunch, []],
        ["Dinner", meals.dinner, (day.smoothies || []).filter(function (row) { return row.at === "dinner"; })]
      ];
      var drawn = false;
      groups.forEach(function (group) {
        if (!group[1] && !group[2].length) return;
        drawn = true;
        html += '<p class="hub-slot-label">' + group[0] + "</p>";
        if (group[1]) html += '<p class="hub-meal">' + hubEsc(group[1]) + "</p>";
        group[2].forEach(function (row) {
          html += '<p class="hub-smoothie">Smoothie · ' + hubEsc(row.title) + "</p>";
        });
      });
      if (day.more) html += '<p class="hub-more">+' + day.more + " more</p>";
      if (!drawn) html += '<p class="hub-quiet">Nothing planned</p>';
      var count = (day.smoothies || []).length + (day.more || 0);
      if (count && !day.nutsOk) html += '<p class="hub-brazil">Brazil nuts: ' + day.nuts + " (needs 2)</p>";
      html += "</div></article>";
    });
    html += '</div><p class="hub-daily">Daily: 2 Brazil nuts</p>';
    return html;
  }

  function paintHub() {
    var root = $("hub-root");
    if (!root) return;
    if (state.hubTab !== "training") state.hubTab = "food";
    root.querySelectorAll("[data-hub-tab]").forEach(function (tab) {
      var on = tab.getAttribute("data-hub-tab") === state.hubTab;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    });
    var foodPanel = $("hub-panel-food");
    var trainPanel = $("hub-panel-training");
    if (foodPanel) foodPanel.hidden = state.hubTab !== "food";
    if (trainPanel) trainPanel.hidden = state.hubTab !== "training";
    if (state.hubTab === "training" && !state.hubArtLoaded) {
      root.querySelectorAll(".hub-tile img").forEach(function (img) {
        var src = img.getAttribute("data-src");
        if (src && !img.getAttribute("src")) img.setAttribute("src", src);
      });
      state.hubArtLoaded = true;
    }
    root.querySelectorAll("[data-hub-stats]").forEach(function (node) {
      node.innerHTML = hubStatsHtml(node.getAttribute("data-hub-stats"));
    });
    var clock = londonParts(parseDateOverride() || new Date());
    if (window.NexusDeck && window.NexusDeck.renderHubMonth) {
      var focusKey = clock.year < 2027 ? "2027-01-01" : (clock.year > 2027 ? "2027-12-31" : clock.dateKey);
      window.NexusDeck.renderHubMonth({ year: clock.year, month: clock.month, focus: focusKey });
    }
  }

  function openTrainingDoor(mode) {
    if (mode) setScheduleMode(mode);
    state.foodRoom = "";
    state.smoothieRoom = "";
    state.foodFocusId = "";
    state.smoothieFocusId = "";
    state.foodEditing = false;
    state.smoothieEditing = false;
    state.osDoor = "training";
    render();
    warmVisibleLeads();
  }

  var accountTimer = 0;
  function dismissAccountBanner() {
    var host = $("account-banner");
    if (accountTimer) clearTimeout(accountTimer);
    accountTimer = 0;
    if (!host) return;
    host.classList.remove("is-in");
    host.classList.add("is-out");
    host.hidden = true;
  }

  function showAccountBanner() {
    var host = $("account-banner");
    if (!host) return;
    host.hidden = false;
    host.classList.remove("is-out");
    host.classList.add("is-in");
    if (accountTimer) clearTimeout(accountTimer);
    accountTimer = setTimeout(dismissAccountBanner, 4000);
  }

  function paintOsDoors() {
    var prevPainted = state.paintedDoor;
    var door = normDoor(state.osDoor);
    if (prevPainted && prevPainted !== door && state.menuCabin && state.menuCabin !== door) state.menuCabin = null;
    state.paintedDoor = door;
    state.osDoor = door;
    var titles = {
      training: "Training Schedules",
      food: "Food deck",
      smoothies: "Smoothies deck",
      hub: "Main Menu Hub",
      account: "Account Profile"
    };
    var shown = state.menuCabin && titles[state.menuCabin] ? state.menuCabin : door;
    var title = $("nav-drawer-title");
    if (title) title.textContent = titles[shown];
    var pageTitle = $("page-title");
    if (pageTitle) pageTitle.textContent = titles[door];
    document.querySelectorAll("[data-os-door]").forEach(function (btn) {
      var on = btn.getAttribute("data-os-door") === door;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-os-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-os-panel") !== door;
    });
    var open = state.menuCabin || "";
    document.querySelectorAll(".cabin").forEach(function (cabin) {
      var name = cabin.getAttribute("data-cabin");
      var on = !!open && name === open;
      cabin.classList.toggle("is-open", on);
      var toggle = cabin.querySelector(".cabin-toggle");
      if (toggle) {
        toggle.setAttribute("aria-expanded", on ? "true" : "false");
        toggle.setAttribute("aria-pressed", on ? "true" : "false");
      }
      var panel = cabin.querySelector(".cabin-panel");
      if (panel) {
        panel.setAttribute("aria-hidden", on ? "false" : "true");
        if (on) panel.removeAttribute("inert");
        else panel.setAttribute("inert", "");
      }
    });
    paintFutureLock();
    paintModeChrome();
    paintBranchChrome();
    if (document.body) {
      document.body.classList.toggle("is-hub", door === "hub");
      document.body.classList.toggle("is-deck", door === "food" || door === "smoothies");
    }
    if (door === "hub") paintHub();
    if ((door === "food" || door === "smoothies") && window.NexusDeck && window.NexusDeck.renderDeck) {
      window.NexusDeck.renderDeck(door === "smoothies" ? "smoothie" : "food");
    }
  }

  function render() {
    if (!S) return;
    state.now = getNow();
    var parts = londonParts(state.now);
    var preview = !isLive(parts);
    syncBranch();

    if (!state.userPicked) {
      if (preview || parts.year < 2027) {
        state.viewMonth = 1;
        state.viewWeek = 1;
      } else if (parts.year === 2027) {
        state.viewMonth = parts.month;
        state.viewWeek = S.weekOfMonth(parts.day);
      } else {
        state.viewMonth = 12;
        state.viewWeek = 4;
      }
    }

    var phase = S.phaseForMonth(state.viewMonth);
    var metaSource = viewingUpper() ? upperSchedule() : S;
    var meta = (metaSource.MONTH_META && metaSource.MONTH_META[state.viewMonth]) ||
      S.MONTH_META[state.viewMonth] || { phaseLine: phase.label, blurb: "" };
    paintModeChrome();
    paintBranchChrome();
    paintFutureLock();
    var card = $("relic-card");
    card.setAttribute("data-month", String(state.viewMonth));
    card.setAttribute("data-year", String(state.viewYear));
    card.setAttribute("data-branch", state.branch);
    card.setAttribute("data-phase", phase.suffix);
    document.body.setAttribute("data-month", String(state.viewMonth));
    document.body.setAttribute("data-year", String(state.viewYear));
    document.body.setAttribute("data-branch", state.branch);
    document.body.setAttribute("data-phase", phase.suffix);

    var onTraining = state.osDoor === "training";
    var coach = $("banner-coach");
    if (state.coachOverride && onTraining) {
      coach.hidden = false;
      coach.textContent = "COACH OVERRIDE · ?date=" + state.coachOverride + " · Europe/London";
    } else {
      coach.hidden = true;
    }

    var phaseShort = String(meta.phaseLine || phase.label).replace(/^PHASE:\s*/i, "");
    var monthTitle = S.MONTH_NAMES[state.viewMonth] || "";
    $("identity-line").textContent =
      monthTitle + " · WEEK " + state.viewWeek + " OF 4 · " + phaseShort;
    var blurb = meta.blurb || "";
    $("month-blurb").textContent = blurb;
    $("meta-today").innerHTML = "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday;
    paintLondonClock();

    document.querySelectorAll(".phase").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-phase") === phase.suffix);
    });
    var allowedMonths = periodMonths();
    var monthBar = document.querySelector(".month-bar");
    if (monthBar) {
      monthBar.setAttribute("data-branch", state.branch);
      monthBar.setAttribute("aria-label", "Months of 2027");
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
    paintOsDoors();
    if (state.osDoor === "training") warmVisibleLeads();
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

  /* The opened citation's shield bit. The player does not close on it:
     the set clock advances exactly one clip and the playlist loops. */
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

  function resolvedMark() {
    if (state.navMark === "branch" || state.navMark === "mode") return state.navMark;
    if (state.mode === "upper") return "mode";
    return "mode";
  }

  function paintModeChrome() {
    var currentKey = viewingUpper() ? "upper" : "full";
    var otherKey = currentKey === "upper" ? "full" : "upper";
    var training = state.osDoor === "training";
    var line = $("schedule-mode");
    if (line) {
      line.hidden = !training;
      line.textContent = training ? MODE_LABEL[currentKey] : "";
    }
    var btn = $("btn-schedule-mode");
    if (btn) {
      btn.textContent = MODE_LABEL[otherKey];
      btn.setAttribute("data-mode", currentKey);
      btn.setAttribute("aria-label", "Show " + MODE_LABEL[otherKey]);
    }
    var markMode = training && resolvedMark() === "mode";
    document.querySelectorAll("[data-set-mode]").forEach(function (opt) {
      var on = opt.getAttribute("data-set-mode") === currentKey;
      opt.classList.toggle("is-active", markMode && on);
      opt.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var card = $("relic-card");
    if (card) card.setAttribute("data-schedule", currentKey);
    if (document.body) document.body.setAttribute("data-schedule", currentKey);
  }

  function setScheduleMode(mode) {
    if (!upperSchedule()) return;
    if (mode !== "full" && mode !== "upper") return;
    state.navMark = "mode";
    writeStoredMode(mode);
    writeStoredMark("mode");
    if (state.mode === mode) {
      render();
      return;
    }
    rememberViewScroll();
    state.mode = mode;
    render();
    restoreViewScroll();
  }

  function toggleScheduleMode() {
    setScheduleMode(state.mode === "upper" ? "full" : "upper");
  }

  function paintBranchChrome() {
    var training = state.osDoor === "training";
    var markBranch = training && resolvedMark() === "branch";
    document.querySelectorAll("[data-set-branch]").forEach(function (opt) {
      var on = opt.getAttribute("data-set-branch") === state.branch;
      opt.classList.toggle("is-active", markBranch && on);
      opt.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setBranch(branch) {
    if (branch === "bridge") return;
    state.navMark = "branch";
    writeStoredMark("branch");
    var changing = state.viewYear !== 2027;
    clearClientCache();
    state.viewYear = 2027;
    syncBranch();
    if (changing) {
      var parts = londonParts(state.now || getNow());
      if (parts.year === 2027) {
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

  var navToggleAt = 0;
  var NAV_GUARD_MS = 420;

  function setNavOpen(open) {
    var next = !!open;
    var wasOpen = document.body.classList.contains("nav-open");
    if (next && !wasOpen) {
      navToggleAt = Date.now();
      state.menuCabin = null;
      paintOsDoors();
    }
    if (!next) {
      navToggleAt = 0;
      dismissAccountBanner();
    }
    var drawer = $("nav-drawer");
    var scrim = $("nav-scrim");
    var btn = $("btn-nav-toggle");
    if (document.body) document.body.classList.toggle("nav-open", next);
    if (!next && document.body) paintModeChrome();
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
    }).join("/") + "?v=v34";
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

  function deckPark() { return $("relic-deck-park"); }

  function deckVideos() {
    return Array.prototype.slice.call(document.querySelectorAll(".deck-video"));
  }

  function frontVideo() {
    return document.querySelector(".deck-video.is-front") || $("relic-active-video");
  }

  function activeVideo() { return frontVideo(); }

  function parkedVideos() {
    return deckVideos().filter(function (video) { return video !== frontVideo(); });
  }

  function stageFront(video) {
    var stage = playerStage();
    var park = deckPark();
    if (!stage || !video) return;
    deckVideos().forEach(function (other) {
      if (other === video) return;
      other.classList.remove("is-front");
      try { other.pause(); } catch (err) { /* parked */ }
      if (park && other.parentNode !== park) park.appendChild(other);
    });
    var previous = $("relic-active-video");
    if (previous && previous !== video) previous.removeAttribute("id");
    video.id = "relic-active-video";
    video.classList.add("is-front");
    if (video.parentNode !== stage) stage.insertBefore(video, stage.firstChild);
  }

  function bufferReady(video, src) {
    if (!video || !src) return false;
    if ((video.getAttribute("src") || "") !== src) return false;
    if (video.error) return false;
    return video.readyState >= 2 && video.videoWidth > 0;
  }

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

  function currentClip() {
    if (!player.clips || !player.clips.length) return null;
    return player.clips[player.index] || null;
  }

  function clipDisplayTitle(clip, entry) {
    if (entry && entry.title) return entry.title;
    var raw = clip && clip.title ? String(clip.title) : "";
    raw = raw.replace(/\.mp4$/i, "").replace(/^\d+\.\s*/, "").trim();
    return raw || player.cabin || "—";
  }

  function paintForensic() {
    var cabinKey = player.cabin || "";
    var clip = currentClip();
    var entry = null;
    var lib = window.RELIC_FORENSIC;
    if (lib && typeof lib.readClip === "function") {
      entry = lib.readClip({
        branch: "year",
        cabinKey: cabinKey,
        clipId: clip && clip.id,
        title: clip && clip.title,
        phase: player.phase || "Base"
      });
    } else if (lib && typeof lib.read === "function") {
      entry = lib.read("year", cabinKey);
    }
    var cabinEl = $("forensic-cabin");
    if (cabinEl) cabinEl.textContent = cabinKey ? cabinKey.replace(/_/g, " ") : "";
    var titleEl = $("forensic-title");
    if (titleEl) titleEl.textContent = clipDisplayTitle(clip, entry);
    var leadEl = $("forensic-lead");
    var leadBody = $("forensic-lead-body");
    if (leadEl && leadBody) {
      var lead = entry && entry.leadRule ? entry.leadRule : "";
      if (entry && entry.source === "clip" && !lead) {
        leadEl.hidden = true;
        leadBody.textContent = "";
      } else {
        leadEl.hidden = false;
        leadBody.textContent = lead || "Left-Lead. 3-second ease.";
      }
    }
    var doEl = $("forensic-do");
    if (doEl) doEl.textContent = (entry && entry.doThis) ? entry.doThis : "—";
    var avoidEl = $("forensic-avoid");
    if (avoidEl) avoidEl.textContent = (entry && entry.avoidThis) ? entry.avoidThis : "—";
    var breathEl = $("forensic-breath");
    if (breathEl) {
      var breath = entry && entry.breathing ? String(entry.breathing) : "";
      breathEl.hidden = !breath;
      breathEl.textContent = breath ? ("Breathing: " + breath) : "";
    }
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

  function swipeOpensCue(startX, startY, endX, endY) {
    var dx = endX - startX;
    var dy = endY - startY;
    if (Math.abs(dx) >= Math.abs(dy)) return false;
    if (dy > -36) return false;
    var stage = playerStage();
    if (!stage) return false;
    var rect = stage.getBoundingClientRect();
    return startY > rect.bottom - 88;
  }

  function onStageHudPointerUp(event) {
    if (!hudGesture || event.pointerId !== hudGesture.id) return;
    var startX = hudGesture.x;
    var startY = hudGesture.y;
    var moved = hudGesture.moved;
    hudGesture = null;
    if (swipeOpensCue(startX, startY, event.clientX, event.clientY)) {
      setForensicOpen(true);
      showPlayerHud();
      return;
    }
    if (moved) return;
    var node = eventElement(event);
    if (isForensicChrome(node) || isHudChromeTarget(node)) return;
    var stage = playerStage();
    if (stage && stage.classList.contains("is-forensic-open")) {
      setForensicOpen(false);
      showPlayerHud();
      return;
    }
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

  var ADVANCE_GAP_MS = 350;
  var STALL_GAP_MS = 8000;

  function resumeCountdownIfLive() {
    if (!player.armed || player.empty || player.paused) return;
    thawClock();
    ensureClock();
  }

  function applyDurationOverride(minutes) {
    var mins = minutes | 0;
    if (SET_MODIFIER_MINUTES.indexOf(mins) === -1) return;
    var next = mins * 60;
    SET_DURATION_SEC = next;
    player.remaining = next;
    if (player.armed && !player.paused) player.setEndsAt = Date.now() + (next * 1000);
    paintTimer();
    ensureClock();
    dismissTimerMods();
  }

  function applyAddMoreTime(minutes) {
    var mins = minutes | 0;
    if (SET_MODIFIER_MINUTES.indexOf(mins) === -1) return;
    var extraMs = mins * 60 * 1000;
    if (player.setEndsAt) {
      player.setEndsAt += extraMs;
      syncRemaining();
    } else {
      player.remaining = Math.max(0, (player.remaining | 0) + (mins * 60));
    }
    paintTimer();
    ensureClock();
    dismissTimerMods();
  }

  function stopCountdown() {
    if (player.timerId) {
      clearInterval(player.timerId);
      player.timerId = null;
    }
  }

  function syncRemaining() {
    if (!player.setEndsAt) return player.remaining | 0;
    var left = Math.ceil((player.setEndsAt - Date.now()) / 1000);
    if (left < 0) left = 0;
    player.remaining = left;
    return left;
  }

  function ensureClock() {
    if (player.timerId || !player.armed) return;
    player.timerId = setInterval(onClockTick, 250);
  }

  function armClock(ms) {
    var span = ms > 0 ? ms : (SET_DURATION_SEC * 1000);
    player.setEndsAt = Date.now() + span;
    player.armed = true;
    syncRemaining();
    paintTimer();
    ensureClock();
  }

  function freezeClock() {
    if (!player.setEndsAt) return;
    player.remaining = Math.max(0, Math.ceil((player.setEndsAt - Date.now()) / 1000));
    player.setEndsAt = 0;
  }

  function thawClock() {
    if (player.paused || !player.armed || player.setEndsAt) return;
    player.setEndsAt = Date.now() + Math.max(0, player.remaining | 0) * 1000;
  }

  function onClockTick() {
    if (!player.armed || player.paused || player.empty) return;
    if (document.hidden || player.phaseState === "advancing" || !player.setEndsAt) return;
    var leftMs = player.setEndsAt - Date.now();
    if (leftMs > 0) {
      var secs = Math.ceil(leftMs / 1000);
      if (secs !== (player.remaining | 0)) {
        player.remaining = secs;
        paintTimer();
      }
      preloadNext();
      return;
    }
    player.remaining = 0;
    paintTimer();
    noteSetComplete();
    advance(1, "timer");
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
    paintForensic();
  }

  function stripVideoChrome(video) {
    video.removeAttribute("poster");
    video.removeAttribute("controls");
    video.controls = false;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    try { video.disablePictureInPicture = true; } catch (err) { /* optional */ }
    try { video.disableRemotePlayback = true; } catch (err2) { /* optional */ }
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

  function nudgeFirstFrame(video) {
    if (!video || !player.wantsFlushFrame) return;
    if (video.readyState >= 2 && video.videoWidth) revealActiveFrame();
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
      try { video.requestVideoFrameCallback(onPresented); } catch (err2) { /* frame callback is optional */ }
    }
    function poll() {
      if (token !== player.flushToken || !player.wantsFlushFrame) return;
      if (video.readyState >= 2 && video.videoWidth && !video.paused) {
        revealActiveFrame();
        return;
      }
      if (token !== player.flushToken || !player.wantsFlushFrame) return;
      if (video.error || (Date.now() - started) > 8000) {
        revealActiveFrame();
        return;
      }
      player.flushFallback = setTimeout(poll, 120);
    }
    player.flushFallback = setTimeout(poll, 120);
  }

  function bufferedAhead(video) {
    try {
      var time = video.currentTime || 0;
      var ranges = video.buffered;
      var ahead = 0;
      var i;
      for (i = 0; i < ranges.length; i++) {
        var start = ranges.start(i);
        var end = ranges.end(i);
        if (end >= time && start <= time + 0.35) ahead = Math.max(ahead, end - time);
      }
      return ahead;
    } catch (err) {
      return 0;
    }
  }

  function noteMediaProgress(video) {
    if (!video) return false;
    var moved = false;
    var time = video.currentTime || 0;
    if (Math.abs(time - (player.progressTime || 0)) > 0.04) {
      player.progressTime = time;
      player.hasProgressed = true;
      moved = true;
    }
    var ahead = bufferedAhead(video);
    if (ahead > (player.progressAhead || 0) + 0.25) {
      player.progressAhead = ahead;
      moved = true;
    }
    if (moved) player.progressAt = performance.now();
    return moved;
  }

  function holdBuffer(video, src, preloadMode) {
    if (!video || !src) return false;
    stripVideoChrome(video);
    var front = video === frontVideo();
    var mode = preloadMode || (front ? "auto" : "metadata");
    if (!front && document.hidden) mode = "none";
    var prior = video.getAttribute("preload") || "";
    video.preload = mode;
    video.setAttribute("preload", mode);
    if (!front) {
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = false;
      video.loop = false;
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
    } else {
      video.loop = true;
      video.setAttribute("loop", "");
    }
    if (bufferReady(video, src)) return true;
    if (!front && document.hidden) return false;
    var same = (video.getAttribute("src") || "") === src && !video.error;
    if (!same) {
      try { video.pause(); } catch (err) { /* swapping source */ }
      video.__relicToken = {};
      video.src = src;
      try { video.load(); } catch (err2) { /* about:blank is not a media file */ }
      return false;
    }
    if (prior === mode) return false;
    if (mode === "auto" && video.readyState < 2 && video.networkState !== 2) {
      try { video.load(); } catch (err3) { /* upgrade a metadata fetch once */ }
    }
    return false;
  }

  function checkStall() {
    if (document.hidden || !player.armed || player.paused || player.empty || player.unavailable) return;
    if (player.phaseState === "advancing" || player.phaseState === "idle") return;
    var video = frontVideo();
    if (!video || video.error) return;
    var clip = player.clips[player.index];
    if (!clip || (video.getAttribute("src") || "") !== clip.src) return;
    noteMediaProgress(video);
    if (!player.progressAt) player.progressAt = performance.now();
    if (performance.now() - player.progressAt < STALL_GAP_MS) return;
    if (player.stallReloaded) return;
    player.stallReloaded = true;
    var pos = video.currentTime || 0;
    var gen = player.generation;
    var src = clip.src;
    try { video.load(); } catch (err) { return; }
    var onMeta = function () {
      video.removeEventListener("loadedmetadata", onMeta);
      if (gen !== player.generation) return;
      if ((video.getAttribute("src") || "") !== src) return;
      player.progressAt = performance.now();
      player.progressAhead = 0;
      if (pos > 0.25) {
        try { video.currentTime = pos; } catch (err2) { /* same-position resume */ }
      }
      if (!player.paused && !document.hidden) {
        var pending = video.play();
        if (pending && typeof pending.catch === "function") pending.catch(function () {});
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
  }

  function markUnavailable() {
    if (player.unavailable) return;
    player.unavailable = true;
    player.phaseState = "playing";
    var note = $("relic-media-note");
    if (note) note.textContent = "Clip unavailable. The set timer still runs.";
    setMediaNote(true);
    revealActiveFrame();
    paintPlayButton();
  }

  function nextClipSrc() {
    var clips = player.clips || [];
    if (clips.length < 2) return "";
    var clip = clips[(player.index + 1) % clips.length];
    return clip && clip.src ? clip.src : "";
  }

  function slotFor(src) {
    var videos = parkedVideos();
    var blank = null;
    var i;
    for (i = 0; i < videos.length; i++) {
      var have = videos[i].getAttribute("src") || "";
      if (src && have === src) return videos[i];
      if (!blank && !have) blank = videos[i];
    }
    return blank || videos[0] || null;
  }

  function releaseUnneeded(keepSrcs) {
    var keep = keepSrcs || [];
    parkedVideos().forEach(function (video) {
      var src = video.getAttribute("src") || "";
      if (src && keep.indexOf(src) !== -1) return;
      video.preload = "metadata";
      video.setAttribute("preload", "metadata");
      if (!src || video.networkState !== 2) return;
      try { video.pause(); } catch (err) { /* stop a competing fetch */ }
      video.__relicToken = null;
      video.removeAttribute("src");
      try { video.load(); } catch (err2) { /* released */ }
    });
  }

  function activeBufferedEnough(video) {
    if (!video || video.error) return false;
    var duration = video.duration;
    if (!(isFinite(duration) && duration > 0)) return video.readyState >= 4 && bufferedAhead(video) >= 8;
    try {
      var ranges = video.buffered;
      var end = 0;
      var i;
      for (i = 0; i < ranges.length; i++) end = Math.max(end, ranges.end(i));
      if (end >= duration - 0.35) return true;
    } catch (err) { /* buffered ranges can throw while detached */ }
    return false;
  }

  function preloadNext() {
    if (document.hidden || player.phaseState === "advancing" || player.empty) return;
    var clips = player.clips || [];
    if (clips.length < 2) return;
    var front = frontVideo();
    if (!front) return;
    var nextSrc = nextClipSrc();
    if (!nextSrc || nextSrc === (front.getAttribute("src") || "")) return;
    var enough = !!player.unavailable || activeBufferedEnough(front);
    var slot = slotFor(nextSrc);
    if (!slot || slot === front) return;
    holdBuffer(slot, nextSrc, enough ? "auto" : "metadata");
  }

  function warmCabinLead(cabinKey) {
    var root = $("relic-player");
    if ((root && !root.hidden) || document.hidden) return;
    var clips = clipsForCabin(cabinKey);
    var src = clips.length ? clips[0].src : "";
    if (!src) return;
    if (deckVideos().some(function (video) { return (video.getAttribute("src") || "") === src; })) return;
    var busy = deckVideos().some(function (video) { return video.networkState === 2; });
    var slot = deckVideos().filter(function (video) { return !(video.getAttribute("src") || ""); })[0] || parkedVideos()[0];
    if (!slot) return;
    holdBuffer(slot, src, busy ? "metadata" : "auto");
  }

  function warmVisibleLeads() {
    var root = $("relic-player");
    if ((root && !root.hidden) || document.hidden) return;
    var parts = londonParts(state.now || getNow());
    var links = Array.prototype.slice.call(document.querySelectorAll("#tt-body a.cite-link"));
    if (!links.length) return;
    var today = links.filter(function (link) { return link.getAttribute("data-date") === parts.dateKey; });
    var chosen = (today.length ? today : links)[0];
    if (!chosen) return;
    var clips = clipsForCabin(chosen.getAttribute("data-cabin"));
    var src = clips[0] && clips[0].src;
    deckVideos().forEach(function (video, index) {
      if (src && index === 0) return;
      if (!(video.getAttribute("src") || "")) {
        video.preload = "metadata";
        video.setAttribute("preload", "metadata");
      }
    });
    if (src) holdBuffer(deckVideos()[0], src, "auto");
  }

  function playFront(video) {
    if (!video) return;
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute("muted");
    video.loop = true;
    video.autoplay = true;
    video.preload = "auto";
    video.setAttribute("loop", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("preload", "auto");
    var token = {};
    player.playToken = token;
    var pending = video.play();
    if (pending && typeof pending.then === "function") {
      pending.then(function () {
        if (player.playToken !== token) return;
        player.paused = false;
        player.phaseState = "playing";
        setGate(false);
        paintPlayButton();
        preloadNext();
      }).catch(function (err) {
        if (player.playToken !== token) return;
        if (err && err.name === "AbortError") return;
        var blocked = err && err.name === "NotAllowedError";
        player.paused = !!blocked;
        setGate(!!blocked);
        paintPlayButton();
      });
    }
  }

  function promote(video, shouldPlay) {
    if (!video) return;
    stageFront(video);
    video.classList.add("is-frame-ready");
    var root = $("relic-player");
    if (root) {
      root.classList.remove("is-awaiting-frame");
      if (!root.hidden) root.setAttribute("aria-hidden", "false");
    }
    player.awaitingReveal = false;
    stopFlushWatch();
    if (!player.unavailable) setMediaNote(false);
    video.loop = true;
    video.setAttribute("loop", "");
    if (shouldPlay && !player.paused) playFront(video);
    else {
      try { video.pause(); } catch (err) { /* held */ }
    }
  }

  function assignVideoSrc(src) {
    var video = activeVideo();
    if (!video) return;
    var safe = src || "about:blank";
    if (safe !== "about:blank" && isBlockedMediaUrl(safe)) safe = "about:blank";
    stripVideoChrome(video);
    video.autoplay = false;
    video.loop = false;
    video.removeAttribute("autoplay");
    video.removeAttribute("loop");
    video.classList.remove("is-frame-ready");
    stopFlushWatch();
    var root = $("relic-player");
    if (root) root.classList.remove("is-awaiting-frame");
    setMediaNote(false);
    if (video.getAttribute("src") !== safe) {
      video.src = safe;
      try { video.load(); } catch (err) { /* about:blank is not a media file */ }
    }
  }

  function showEmptyFrame() {
    player.empty = true;
    player.armed = false;
    player.paused = true;
    player.phaseState = "idle";
    player.unavailable = false;
    player.awaitingReveal = false;
    player.setEndsAt = 0;
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

  function bindFront(video, gen) {
    if (!video) return;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* replace clip listeners */ }
    }
    var ac = new AbortController();
    player.clipAbort = ac;
    var signal = ac.signal;
    function live() {
      if (gen !== player.generation) return false;
      var clip = player.clips[player.index];
      return !!(clip && (video.getAttribute("src") || "") === clip.src);
    }
    video.addEventListener("error", function () {
      var token = video.__relicToken;
      setTimeout(function () {
        if (signal.aborted || !token || video.__relicToken !== token) return;
        if (!live()) return;
        if (!video.error || video.error.code === 1) return;
        var clip = player.clips[player.index];
        var front = frontVideo();
        if (video !== front && front && clip && (front.getAttribute("src") || "") === clip.src && front.readyState >= 2) return;
        markUnavailable();
      }, 40);
    }, { signal: signal });
    video.addEventListener("timeupdate", function () {
      if (!live() || video !== frontVideo()) return;
      noteMediaProgress(video);
    }, { signal: signal });
    video.addEventListener("loadeddata", function () {
      if (!live()) return;
      var src = video.getAttribute("src") || "";
      if (video !== frontVideo() && bufferReady(video, src)) {
        var front = frontVideo();
        if (front && (front.getAttribute("src") || "") === src && front.readyState >= 2) return;
        promote(video, !player.paused && !player.empty);
        player.phaseState = player.paused ? "loading" : "playing";
        return;
      }
      if (video === frontVideo()) setMediaNote(player.unavailable);
    }, { signal: signal });
    video.addEventListener("playing", function () {
      if (!live() || video !== frontVideo()) return;
      player.phaseState = "playing";
      player.progressAt = performance.now();
      noteMediaProgress(video);
      if (video.videoWidth) revealActiveFrame();
      preloadNext();
    }, { signal: signal });
    video.addEventListener("canplaythrough", function () {
      if (!live() || video !== frontVideo()) return;
      preloadNext();
    }, { signal: signal });
  }

  function stopCompeting(keepSrc) {
    var root = $("relic-player");
    var covered = !!(root && root.classList.contains("is-awaiting-frame"));
    deckVideos().forEach(function (video) {
      var src = video.getAttribute("src") || "";
      if (!src || src === keepSrc) return;
      var showing = video === frontVideo() && !covered && video.readyState >= 2 && video.videoWidth;
      video.preload = showing ? "none" : "metadata";
      video.setAttribute("preload", video.preload);
      if (showing || video.networkState !== 2) return;
      try { video.pause(); } catch (err) { /* drop a rival fetch */ }
      video.__relicToken = null;
      video.removeAttribute("src");
      try { video.load(); } catch (err2) { /* released */ }
    });
  }

  function loadCurrentClip(shouldPlay) {
    var clip = player.clips[player.index];
    if (!clip || !clip.src) {
      showEmptyFrame();
      return;
    }
    stopCompeting(clip.src);
    player.empty = false;
    player.unavailable = false;
    player.stallReloaded = false;
    player.progressTime = 0;
    player.progressAhead = 0;
    player.progressAt = performance.now();
    player.hasProgressed = false;
    setEmptyOverlay(false);
    var note = $("relic-media-note");
    if (note && note.hidden) note.textContent = "Clip unavailable. The set timer still runs.";
    setMediaNote(false);
    paintClipLabel();
    paintMediaSession();
    var ready = null;
    var videos = deckVideos();
    var i;
    for (i = 0; i < videos.length; i++) {
      if (bufferReady(videos[i], clip.src)) {
        ready = videos[i];
        break;
      }
    }
    if (ready) {
      promote(ready, shouldPlay);
      bindFront(ready, player.generation);
      releaseUnneeded([clip.src, nextClipSrc()]);
      return;
    }
    var front = frontVideo();
    var frontSrc = front ? (front.getAttribute("src") || "") : "";
    var holding = !!(front && frontSrc && frontSrc !== clip.src && front.readyState >= 2 && front.videoWidth);
    var target = holding ? (slotFor(clip.src) || front) : front;
    if (!target) return;
    if (!holding) armFlushFrame(target);
    holdBuffer(target, clip.src, "auto");
    bindFront(target, player.generation);
    if (shouldPlay && target === frontVideo() && !player.paused) playFront(target);
    else if (!shouldPlay && target === frontVideo()) {
      try { target.pause(); } catch (err) { /* not playing yet */ }
    }
    releaseUnneeded([clip.src, nextClipSrc()]);
  }

  function advance(delta, reason, leftoverMs) {
    if (!player.clips.length || player.empty) return false;
    if (player.phaseState === "advancing") return false;
    var manual = reason === "next" || reason === "prev" || reason === "media" || reason === "key";
    var now = Date.now();
    if (manual && (now - (player.lastManualAt || 0)) < ADVANCE_GAP_MS) return false;
    player.phaseState = "advancing";
    if (manual) player.lastManualAt = now;
    player.advanceCount = (player.advanceCount | 0) + 1;
    player.generation = (player.generation | 0) + 1;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* cancel the clip that is leaving */ }
      player.clipAbort = null;
    }
    var len = player.clips.length;
    var steps = delta | 0;
    if (!steps) steps = 1;
    player.index = (player.index + ((steps % len) + len)) % len;
    player.paused = false;
    player.unavailable = false;
    setGate(false);
    loadCurrentClip(true);
    var durationMs = Math.max(1000, (SET_DURATION_SEC | 0) * 1000);
    var nextMs = reason === "reconcile" && leftoverMs > 0 ? leftoverMs : durationMs;
    player.phaseState = player.unavailable ? "playing" : "loading";
    armClock(nextMs);
    var front = frontVideo();
    if (front && !front.paused && !player.unavailable) player.phaseState = "playing";
    paintPlayButton();
    paintMediaSession();
    preloadNext();
    return true;
  }

  function reconcileVisibility() {
    if (document.hidden || !player.armed || player.paused || player.empty || !player.clips.length) return;
    if (player.phaseState === "advancing" || !player.setEndsAt) return;
    var now = Date.now();
    if (now < player.setEndsAt) {
      syncRemaining();
      paintTimer();
      var video = frontVideo();
      if (video && video.paused && !player.paused && !player.unavailable) {
        var pending = video.play();
        if (pending && typeof pending.catch === "function") pending.catch(function () {});
      }
      preloadNext();
      return;
    }
    var durationMs = Math.max(1000, (SET_DURATION_SEC | 0) * 1000);
    var overdue = now - player.setEndsAt;
    var steps = Math.floor(overdue / durationMs) + 1;
    var leftover = durationMs - (overdue % durationMs);
    if (leftover < 1) leftover = durationMs;
    noteSetComplete();
    advance(steps, "reconcile", leftover);
  }

  function onVisibility() {
    if (document.hidden) {
      parkedVideos().forEach(function (video) {
        video.preload = "none";
        video.setAttribute("preload", "none");
        if (video.networkState !== 2 || video.readyState >= 4) return;
        try { video.pause(); } catch (err) { /* hidden */ }
        video.__relicToken = null;
        video.removeAttribute("src");
        try { video.load(); } catch (err2) { /* dropped standby fetch */ }
      });
      return;
    }
    reconcileVisibility();
    if (state.osDoor === "hub") paintHub();
  }

  function bindMediaSession() {
    var session = navigator.mediaSession;
    if (!session || player.mediaBound) return;
    player.mediaBound = true;
    try {
      session.setActionHandler("nexttrack", function () { advance(1, "media"); });
      session.setActionHandler("previoustrack", function () { advance(-1, "media"); });
    } catch (err) { /* session actions are optional */ }
  }

  function paintMediaSession() {
    var session = navigator.mediaSession;
    if (!session) return;
    bindMediaSession();
    var clip = player.clips[player.index];
    try {
      if (typeof MediaMetadata === "function") {
        session.metadata = new MediaMetadata({
          title: clip && clip.title ? clip.title : "Relic trainer",
          artist: "NiX",
          album: player.cabin || "Training"
        });
      }
      session.playbackState = player.paused || !player.armed ? "paused" : "playing";
    } catch (err) { /* metadata is optional */ }
  }

  function startCountdown() {
    armClock(Math.max(1000, (SET_DURATION_SEC | 0) * 1000));
  }

  function playNextVideo() {
    if (!player.clips.length) {
      showEmptyFrame();
      return;
    }
    advance(1, "next");
  }

  function playPreviousVideo() {
    if (!player.clips.length) {
      showEmptyFrame();
      return;
    }
    advance(-1, "prev");
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
      paintMediaSession();
      return;
    }
    if (player.paused) {
      player.paused = false;
      setGate(false);
      thawClock();
      ensureClock();
      if (video && !player.unavailable) {
        var pending = video.play();
        if (pending && typeof pending.catch === "function") {
          pending.catch(function (err) {
            if (err && err.name === "NotAllowedError") {
              player.paused = true;
              freezeClock();
              setGate(true);
              paintPlayButton();
            }
          });
        }
      }
    } else {
      player.paused = true;
      freezeClock();
      if (video) {
        try { video.pause(); } catch (err) { /* already paused */ }
      }
    }
    paintPlayButton();
    paintMediaSession();
  }

  function closePlayer() {
    stopHudTimer();
    stopFlushWatch();
    player.awaitingReveal = false;
    player.phaseState = "idle";
    player.generation = (player.generation | 0) + 1;
    player.setEndsAt = 0;
    player.unavailable = false;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* closing */ }
      player.clipAbort = null;
    }
    setTimerModsOpen(false);
    setForensicOpen(false);
    stopCountdown();
    player.armed = false;
    player.paused = false;
    player.empty = false;
    player.clips = [];
    player.index = 0;
    player.cabin = null;
    player.credit = null;
    setMediaNote(false);
    try {
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "none";
    } catch (err2) { /* session is optional */ }
    var park = deckPark();
    deckVideos().forEach(function (video) {
      try { video.pause(); } catch (err) { /* closed */ }
      video.classList.remove("is-frame-ready");
      if (park && video.parentNode !== park) park.appendChild(video);
    });
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
      } catch (err3) { /* no history entry */ }
    }
  }

  function openCabin(cabinKey, phase, dateKey, slot) {
    if (!cabinKey) return;
    setNavOpen(false);
    player.credit = null;
    player.cabin = cabinKey;
    player.phase = phase || "Base";
    player.index = 0;
    player.clips = clipsForCabin(cabinKey);
    player.generation = (player.generation | 0) + 1;
    player.phaseState = "loading";
    player.unavailable = false;
    player.stallReloaded = false;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* new cabin */ }
      player.clipAbort = null;
    }

    var root = $("relic-player");
    var wasHidden = !root || root.hidden;
    if (!player.historyPushed) {
      try {
        history.pushState({ relicPlayer: 1 }, "");
        player.historyPushed = true;
      } catch (err2) { /* file:// may refuse */ }
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
    paintMediaSession();
    if (!player.awaitingReveal) $("relic-player-close").focus();
  }

  function setYearSchedulesOpen(open) {
    var cabin = $("year-schedules");
    var btn = $("btn-year-schedules");
    var panel = $("year-schedule-panel");
    if (!cabin || !btn || !panel) return;
    var next = !!open;
    cabin.classList.toggle("is-open", next);
    btn.setAttribute("aria-expanded", next ? "true" : "false");
    panel.setAttribute("aria-hidden", next ? "false" : "true");
    if (next) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
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
        event.preventDefault();
        event.stopPropagation();
        var open = document.body.classList.contains("nav-open");
        if (open && Date.now() - navToggleAt < NAV_GUARD_MS) return;
        setNavOpen(!open);
      });
    }
    var navScrim = $("nav-scrim");
    if (navScrim) {
      navScrim.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() - navToggleAt < NAV_GUARD_MS) return;
        setNavOpen(false);
      });
    }
    document.querySelectorAll("[data-set-mode]").forEach(function (opt) {
      opt.addEventListener("click", function (event) {
        event.stopPropagation();
        setScheduleMode(opt.getAttribute("data-set-mode"));
        setNavOpen(false);
      });
    });
    document.querySelectorAll("[data-set-branch]").forEach(function (opt) {
      opt.addEventListener("click", function (event) {
        event.stopPropagation();
        setBranch(opt.getAttribute("data-set-branch"));
        setNavOpen(false);
      });
    });
    var yearSchedulesBtn = $("btn-year-schedules");
    if (yearSchedulesBtn) {
      yearSchedulesBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var cabin = $("year-schedules");
        setYearSchedulesOpen(!(cabin && cabin.classList.contains("is-open")));
      });
    }
    var futureLockBtn = $("btn-future-lock");
    if (futureLockBtn) {
      futureLockBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        setFutureLock(!state.futureLock);
        setNavOpen(false);
      });
    }
    document.querySelectorAll("[data-hub-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.hubTab = tab.getAttribute("data-hub-tab") || "food";
        paintHub();
      });
      tab.addEventListener("keydown", function (event) {
        var order = ["food", "training"];
        var index = order.indexOf(state.hubTab);
        if (index < 0) index = 0;
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % order.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + order.length - 1) % order.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = order.length - 1;
        else return;
        event.preventDefault();
        state.hubTab = order[next];
        paintHub();
        var selected = document.querySelector('.hub-tab[data-hub-tab="' + state.hubTab + '"]');
        if (selected && selected.focus) selected.focus();
      });
    });
    document.querySelectorAll("[data-os-door]").forEach(function (doorBtn) {
      doorBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var name = doorBtn.getAttribute("data-os-door");
        if (name === "account") {
          showAccountBanner();
          return;
        }
        if (name === "hub") {
          state.osDoor = "hub";
          state.menuCabin = "";
          setNavOpen(false);
          render();
          return;
        }
        if (name === "food" || name === "smoothies") {
          state.osDoor = name;
          state.menuCabin = "";
          setNavOpen(false);
          render();
          return;
        }
        if (name !== "training") return;
        var current = state.menuCabin || "";
        if (current === name) {
          state.menuCabin = "";
          paintOsDoors();
          return;
        }
        state.menuCabin = name;
        openTrainingDoor();
      });
    });
    var accountDismiss = $("account-banner-dismiss");
    if (accountDismiss) {
      accountDismiss.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        dismissAccountBanner();
      });
    }
    window.addEventListener("pagehide", dismissAccountBanner);
    var forensicTab = $("forensic-tab");
    var forensicPanel = $("forensic-panel");
    var forensicDock = $("forensic-dock");
    if (forensicDock) {
      forensicDock.addEventListener("pointerdown", stopForensicEvent);
      forensicDock.addEventListener("click", stopForensicEvent);
    }
    var cueGesture = null;
    function cueDelta(event) {
      if (!cueGesture || event.pointerId !== cueGesture.id) return null;
      return {
        dx: event.clientX - cueGesture.x,
        dy: event.clientY - cueGesture.y
      };
    }
    if (forensicTab) {
      forensicTab.addEventListener("pointerdown", function (event) {
        if (event.button > 0) return;
        cueGesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
        try { forensicTab.setPointerCapture(event.pointerId); } catch (err) { /* capture is optional */ }
        stopForensicEvent(event);
      });
      forensicTab.addEventListener("pointerup", function (event) {
        var delta = cueDelta(event);
        cueGesture = null;
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        if (Math.abs(delta.dx) > Math.abs(delta.dy) && Math.abs(delta.dx) > TAP_SLOP) return;
        if (delta.dy < -28) {
          setForensicOpen(true);
          return;
        }
        if (delta.dy > 28) {
          setForensicOpen(false);
          return;
        }
        if (Math.abs(delta.dx) < TAP_SLOP && Math.abs(delta.dy) < TAP_SLOP) setForensicOpen(true);
      });
      forensicTab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
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
      var calm = event.target.closest(".mbtn, .wtab, #btn-schedule-mode, [data-set-mode], [data-set-branch], #btn-year-schedules");
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
      if (!event.target.closest(".mbtn, .wtab, #btn-schedule-mode, [data-set-mode], [data-set-branch], #btn-year-schedules")) return;
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

    if (!player.watchId) player.watchId = setInterval(checkStall, 1000);
    document.addEventListener("visibilitychange", onVisibility);
    bindMediaSession();

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
        advance(1, "key");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        advance(-1, "key");
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
    state.futureLock = readFutureLock();
    state.mode = parseModeOverride() || readStoredMode() || "full";
    state.navMark = readStoredMark();
    if (state.mode === "upper" && !upperSchedule()) state.mode = "full";
    if (window.NexusDeck && window.NexusDeck.boot) window.NexusDeck.boot();
    if (trainingDeepLink()) state.osDoor = "training";
    else if (doorOverride()) state.osDoor = doorOverride();
    else state.osDoor = "hub";
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
    build: "v53",
    planFocusDate: planFocusDate,
    hubSnapshot: function () {
      return { focus: londonParts(planFocusDate()).dateKey, upper: hubYear("upper"), full: hubYear("full") };
    },
    loadTickMap: function (map) {
      state.videos = map || {};
      state.loaded = true;
    },
    get phaseState() { return player.phaseState || "idle"; },
    get advanceCount() { return player.advanceCount | 0; },
    get playerIndex() { return player.index | 0; },
    get deadline() { return player.setEndsAt || 0; },
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
    get futureLock() { return !!state.futureLock; },
    setFutureLock: setFutureLock,
    applyOsDoor: function (door) {
      state.osDoor = normDoor(door);
      paintOsDoors();
      var section = $("nav-lock");
      return !section || section.hidden !== true;
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
