/* Relic Architect V2.0 — timetable, Supabase completions, HTML5 cabin player.
   Playback is Supabase Storage only. Drive iframes, previews, and embeddedfolderview are refused.
   Completions upsert relic_completions. localStorage is not the source of truth.
   Schedule mode (full | upper) swaps the rotation and its own completion namespace.
   Full Body keeps the legacy bare YYYY-MM-DD key. Upper Body uses upper:YYYY-MM-DD.
   v14: each day has two trainer videos. tier is a bitmask (1 first, 2 second, 3 dual).
   completed=true is dual/full only. Legacy completed=true with tier 0 still reads as dual.
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
    foodFocusId: "",
    foodFocusBand: "moderate",
    foodEditing: false,
    scanPreview: null
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

  /* completed=true is always a full day (legacy rows included).
     Partial days live in tier 1 or 2 with completed=false.
     A stale tier 3 with completed=false is treated as cleared. */
  function normalizeMask(completed, tier) {
    var hasTier = !(tier === undefined || tier === null || tier === "");
    var mask = hasTier ? (Number(tier) | 0) : 0;
    if (mask < 0 || mask > 3) mask = 0;
    if (completed) return 3;
    if (!hasTier || mask === 3) return 0;
    return mask & 3;
  }

  function absorbCompletionRow(next, dateKey, completed, tier) {
    var storageKey = storageKeyFromRow(dateKey);
    if (!storageKey) return;
    var mask = normalizeMask(!!completed, tier);
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
    var body = doubleTick ? SHIELD_BODY.replace("#ff8c00", "#3dff7a") : SHIELD_BODY;
    return SHIELD_SVG_OPEN + body + (doubleTick ? SHIELD_TWO : SHIELD_ONE) + "</svg>";
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
    if (!cfg.url || !cfg.anonKey) return Promise.resolve(false);
    var bits = mask & 3;
    return fetch(restUrl("/rest/v1/relic_completions?on_conflict=date_key"), {
      method: "POST",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify({
        date_key: storageKey,
        completed: bits === 3,
        tier: bits,
        updated_at: new Date().toISOString()
      })
    }).then(function (response) {
      return response.ok;
    }).catch(function () {
      return false;
    });
  }

  function saveMask(storageKey, mask, dateKey, restoreFocus) {
    var bits = mask & 3;
    var previous = state.videos[storageKey] || 0;
    if (bits) state.videos[storageKey] = bits;
    else delete state.videos[storageKey];
    state.restoreTickDate = restoreFocus ? dateKey : "";
    render();

    var gen = (state.saveGen[storageKey] || 0) + 1;
    state.saveGen[storageKey] = gen;
    beginSyncActivity();
    setSync("Saving " + dateKey + "…", false);
    upsertCompletion(storageKey, bits).then(function (ok) {
      if (state.saveGen[storageKey] !== gen) return;
      if (!ok) {
        if (previous) state.videos[storageKey] = previous;
        else delete state.videos[storageKey];
        setSync("Could not save " + dateKey + " to relic_completions.", true);
        state.restoreTickDate = "";
        render();
        return;
      }
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
          '<a class="cite-link" data-cabin="' + escapeHtml(cabinKey) +
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
    var fullDays = 0;
    var firstSessions = 0;
    var total = days ? days.length : 0;
    for (var i = 0; i < total; i++) {
      var mask = maskFor(days[i].dateKey);
      ticks += popcount(mask);
      if ((mask & 1) === 1) firstSessions += 1;
      if ((mask & 3) === 3) fullDays += 1;
    }
    return {
      total: total,
      fullDays: fullDays,
      firstSessions: firstSessions,
      ticks: ticks,
      complete: total > 0 && fullDays === total
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

  /* Single slot tracks first-session bits and stays gold.
     Dual slot tracks full days. Any dual day turns that slot green.
     The week chip itself is green only when every training day is dual. */
  function paintWeekChip(btn, score) {
    var complete = !!score.complete;
    btn.classList.toggle("is-complete", complete);
    btn.classList.remove("is-golden");
    btn.setAttribute("data-tick-count", String(score.ticks));
    btn.setAttribute("data-full-days", String(score.fullDays));
    btn.setAttribute("data-first-sessions", String(score.firstSessions));
    var total = score.total;
    var singleCount = btn.querySelector("[data-single-count]");
    var dualCount = btn.querySelector("[data-dual-count]");
    if (singleCount) singleCount.textContent = score.firstSessions + "/" + total;
    if (dualCount) dualCount.textContent = complete ? String(score.ticks) : (score.fullDays + "/" + total);
    var singleSlot = btn.querySelector(".week-slot-single");
    if (singleSlot) {
      singleSlot.classList.toggle("is-started", score.firstSessions > 0 && !complete);
      singleSlot.classList.toggle("is-full", total > 0 && score.firstSessions === total);
    }
    var dualSlot = btn.querySelector(".week-slot-dual");
    if (dualSlot) {
      dualSlot.classList.toggle("is-started", score.fullDays > 0 && !complete);
      dualSlot.classList.toggle("is-full", complete);
    }
    var badge = btn.querySelector(".week-slot-dual .shield-complete");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "shield-complete";
      badge.hidden = true;
      var row = btn.querySelector(".week-slot-dual-row");
      if (row) row.insertBefore(badge, row.firstChild);
    }
    if (!complete) {
      badge.hidden = true;
      badge.innerHTML = "";
    } else {
      badge.hidden = false;
      badge.innerHTML = shieldSvg(true);
    }
    var week = btn.getAttribute("data-week") || "";
    btn.setAttribute("aria-label",
      "WEEK " + week +
      ", single sessions " + score.firstSessions + " of " + total +
      ", dual " + score.fullDays + " of " + total +
      (complete ? ", " + score.ticks + " ticks" : ""));
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
    var mask = maskFor(day.dateKey);
    var tier = popcount(mask);
    var checked = tier >= 2 ? "true" : (tier === 1 ? "mixed" : "false");
    var emblem = tier >= 2 ? shieldSvg(true) : (tier === 1 ? shieldSvg(false) : "");
    return (
      '<td class="done-cell"><button type="button" class="tick-hit" data-date="' + day.dateKey +
      '" data-tier="' + tier + '" data-videos="' + (mask & 3) +
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
    weekly: "Weekly Food Schedule",
    shop: "Monthly Foods (Sainsbury’s)",
    meals: "Meal Recipe Cards",
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
      '<article class="recipe-card" data-kind="' + escapeHtml(card.kind) + '">' +
        '<p class="recipe-kicker">' + (card.kind === "extraction" ? "SMOOTHIE / EXTRACTION" : "MEAL RECIPE") + "</p>" +
        "<h3>" + escapeHtml(card.name) + "</h3>" +
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
        "<h4>Ingredients</h4><ul class=\"recipe-ingredients\">" + ingredients + "</ul>" +
        "<h4>Method</h4><ol class=\"recipe-method\">" + method + "</ol>" +
        '<section class="recipe-weekbox">' +
          "<h4>Weekly Timetable</h4>" +
          "<p><strong>Best for</strong> " + escapeHtml(card.timetable.bestFor) + "</p>" +
          "<p><strong>Best eaten</strong> " + escapeHtml(card.timetable.bestEaten) + "</p>" +
          "<p><strong>Reheat</strong> " + escapeHtml(card.timetable.reheat) + "</p>" +
        "</section>" +
        '<p class="recipe-tip">Tip: ' + escapeHtml(card.tip) + "</p>" +
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
      if (patch[key]) row[key] = patch[key];
      else delete row[key];
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

  function overlayCard(card, overlay) {
    var next = {};
    Object.keys(card).forEach(function (key) { next[key] = card[key]; });
    ["name", "tagline", "script", "tip"].forEach(function (key) {
      if (overlay[key]) next[key] = overlay[key];
    });
    if (overlay.ingredients && overlay.ingredients.length) next.ingredients = overlay.ingredients;
    if (overlay.method && overlay.method.length) next.method = overlay.method;
    if (overlay.scanImage) next.scanImage = overlay.scanImage;
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
      scanImage: raw.scanImage || ""
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
    return "custom-" + Date.now().toString(36);
  }

  function foodToolsHtml(room) {
    return '<div class="food-tools" data-food-room-tools="' + room + '">' +
      '<button type="button" data-food-tool="export">Export JSON</button>' +
      '<button type="button" data-food-tool="import">Import JSON</button>' +
      '<button type="button" data-food-tool="reset">Reset this room</button>' +
      '<label class="food-json-label">JSON for ChatGPT, Gemini, or NiX' +
      '<textarea id="food-json-' + room + '" class="food-json" rows="5"></textarea></label>' +
      "</div>";
  }

  function roomExport(room) {
    if (room === "shop") {
      return {
        room: "shop",
        build: "v20",
        month: foodMonthKey(state.viewYear, state.viewMonth),
        draft: draftFor(state.viewYear, state.viewMonth, true)
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
    var pasteLabel = room === "shop" ? "Paste shop notes" : (room === "extractions" ? "Paste smoothie notes" : "Paste meal notes");
    return '<section class="scan-strip" aria-label="Scan / Import">' +
      "<h3>Scan / Import</h3>" +
      '<label class="scan-label">' + pasteLabel +
      '<textarea id="scan-paste-' + room + '" class="scan-paste" rows="4"></textarea></label>' +
      '<button type="button" data-scan-action="parse">Parse</button>' +
      '<label class="scan-file">JSON file<input type="file" accept="application/json,.json" data-scan-file="json" aria-label="Import JSON file"></label>' +
      '<label class="scan-file">attach label photo; fill fields<input type="file" accept="image/*" capture="environment" data-scan-file="photo" aria-label="attach label photo; fill fields"></label>' +
      "</section>";
  }

  function photoMarker(url) {
    if (!url) return "";
    if (url.length < 96) return url;
    return url.slice(0, 48) + "…[label photo attached]";
  }

  function normalizeIngredients(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) {
      if (typeof item === "string") return { text: item };
      return { text: (item && item.text) || "" };
    }).filter(function (item) { return item.text; });
  }

  function normalizeMethod(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (step) {
      if (typeof step === "string") return methodFromLines(step)[0] || { verb: "Do", detail: step };
      return { verb: (step && step.verb) || "Do", detail: (step && step.detail) || "" };
    }).filter(function (step) { return step.verb || step.detail; });
  }

  function cardFromRecord(data, kind) {
    var ingredients = normalizeIngredients(data.ingredients);
    var method = normalizeMethod(data.method);
    return {
      id: data.id || newCardId(),
      custom: true,
      kind: kind,
      name: data.name || "",
      tagline: data.tagline || "",
      ingredients: ingredients.length ? ingredients : [{ text: "" }],
      method: method.length ? method : [{ verb: "", detail: "" }],
      tip: data.tip || "",
      scanImage: typeof data.scanImage === "string" ? data.scanImage : ""
    };
  }

  function shopLinesFromText(text) {
    var chunks = String(text || "").split(/\n|;/).map(function (line) {
      return line.replace(/^[-*•]\s+/, "").replace(/^\d+[\.\)]\s+/, "").trim();
    }).filter(Boolean);
    if (chunks.length === 1 && chunks[0].indexOf(",") !== -1) {
      chunks = chunks[0].split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    }
    return chunks.map(function (name) {
      return { customName: name, qty: 1, ticked: true, pricePence: 0 };
    });
  }

  function sectionName(line) {
    var head = String(line || "").toLowerCase().replace(/:$/, "").trim();
    if (head === "ingredients" || head.indexOf("ingredient") === 0) return "ingredients";
    if (head === "method" || head === "steps" || head === "instructions" || head === "directions") return "method";
    if (head === "tip" || head === "tips" || head === "note" || head === "notes") return "tip";
    return "";
  }

  function parseFreeform(text, room) {
    var raw = String(text || "").trim();
    if (!raw) return { room: room, error: "Paste a note first." };
    if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
      try { return previewFromJson(JSON.parse(raw), room); } catch (err) { /* keep reading it as notes */ }
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
        tip: tip
      }, kind)
    };
  }

  function previewFromJson(data, room) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { room: room, error: "That paste is not Relic JSON." };
    }
    if (data.room && data.room !== room) {
      return { room: room, error: "That JSON belongs to the " + data.room + " room." };
    }
    if (room === "weekly") {
      if (!data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) {
        return { room: room, error: "Weekly JSON needs a notes object." };
      }
      return { room: room, mode: "notes", module: data };
    }
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft && draft.locked) return { room: room, error: "Unlock this month’s shop before importing a list." };
      var items = data.draft && Array.isArray(data.draft.items) ? data.draft.items : (Array.isArray(data.items) ? data.items : null);
      if (!items) return { room: room, error: "Shop JSON needs a list of lines." };
      return { room: room, mode: "module", module: data };
    }
    if (data.cards && typeof data.cards === "object" && !Array.isArray(data.cards)) {
      return { room: room, mode: "module", module: data };
    }
    if (data.name) {
      return { room: room, mode: "card", card: cardFromRecord(data, room === "extractions" ? "extraction" : "meal") };
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
      return {
        id: card.id,
        name: card.name,
        tagline: card.tagline,
        ingredients: card.ingredients,
        method: card.method,
        tip: card.tip,
        scanImage: photoMarker(card.scanImage)
      };
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
        '<pre class="scan-json">' + json + "</pre>" +
        '<button type="button" data-scan-action="save">Save</button>' +
        '<button type="button" data-scan-action="cancel">Cancel</button>' +
        "</section>";
    }
    if (preview.mode === "shop") {
      var fields = (preview.lines || []).map(function (line, index) {
        return "<label>Line " + (index + 1) +
          '<input data-scan-line="' + index + '" value="' + escapeHtml(line.customName || line.label || "") + '"></label>';
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
      preview.card.name = fieldValue("name").trim();
      preview.card.tagline = fieldValue("tagline").trim();
      preview.card.ingredients = linesOf(fieldValue("ingredients")).map(function (text) { return { text: text }; });
      preview.card.method = methodFromLines(fieldValue("method"));
      preview.card.tip = fieldValue("tip").trim();
      return preview;
    }
    if (preview.mode === "shop") {
      root.querySelectorAll("[data-scan-line]").forEach(function (el) {
        var index = +el.getAttribute("data-scan-line");
        if (preview.lines[index]) preview.lines[index].customName = el.value.trim();
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
    if (!data || typeof data !== "object" || Array.isArray(data)) return "That paste is not Relic JSON.";
    if (data.room && data.room !== room) return "That JSON belongs to the " + data.room + " room.";
    if (room === "weekly") {
      if (!data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) return "Weekly JSON needs a notes object.";
      writeJsonStore(FOOD_WEEK_KEY, data.notes);
      return "";
    }
    if (room === "shop") {
      var draft = draftFor(state.viewYear, state.viewMonth, true);
      if (draft.locked) return "Unlock this month’s shop before importing a list.";
      var items = data.draft && Array.isArray(data.draft.items) ? data.draft.items : (Array.isArray(data.items) ? data.items : null);
      if (!items) return "Shop JSON needs a list of lines.";
      draft.items = items;
      saveDraft(draft);
      return "";
    }
    var store = readCardStore();
    var cards = data.cards && typeof data.cards === "object" && !Array.isArray(data.cards) ? data.cards : null;
    if (!cards && data.name) {
      cards = {};
      cards[data.id || newCardId()] = data;
    }
    if (!cards) return "That JSON has no card.";
    if (room === "extractions") {
      store.extractions = cards;
      if (Array.isArray(data.hidden)) store.hiddenExtractions = data.hidden;
    } else {
      store.meals = cards;
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
      if (!card.ingredients.length) card.ingredients = [{ text: "Add an ingredient" }];
      if (!card.method.length) {
        card.method = card.scanImage
          ? [{ verb: "Fill", detail: "the fields from the label" }]
          : [{ verb: "Cook", detail: "until done" }];
      }
      saveCardRecord(kind, card.id, {
        id: card.id,
        custom: true,
        name: card.name,
        tagline: card.tagline,
        ingredients: card.ingredients,
        method: card.method,
        tip: card.tip,
        scanImage: card.scanImage || ""
      });
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
          scanImage: preview.scanImage || ""
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
      try {
        state.scanPreview = previewFromJson(JSON.parse(String(textReader.result || "")), room);
      } catch (err) {
        state.scanPreview = { room: room, error: "That file is not JSON." };
      }
      render();
    };
    textReader.readAsText(file);
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
      saveCardRecord(kind, id, {
        id: id,
        custom: true,
        name: kind === "extraction" ? "New smoothie" : "New meal",
        tagline: "",
        ingredients: [{ text: "" }],
        method: [{ verb: "Cook", detail: "" }],
        tip: ""
      });
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
      var store = readCardStore();
      var bucket = kind === "extraction" ? store.extractions : store.meals;
      var existing = bucket[id] || {};
      var record = {
        id: id,
        custom: !!existing.custom,
        name: nameEl ? nameEl.value.trim() : "",
        tagline: tagEl ? tagEl.value.trim() : "",
        ingredients: linesOf(ingEl ? ingEl.value : "").map(function (text) { return { text: text }; }),
        method: methodFromLines(methodEl ? methodEl.value : ""),
        tip: tipEl ? tipEl.value.trim() : ""
      };
      if (!existing.custom && !record.name) record.name = existing.name || "";
      if (existing.custom) record.custom = true;
      if (existing.scanImage) record.scanImage = existing.scanImage;
      saveCardRecord(kind, id, record);
      state.foodEditing = false;
      render();
      return;
    }
    if (action === "duplicate") {
      var source = cardView(kind, id, tierId);
      if (!source) return;
      var copyId = newCardId();
      saveCardRecord(kind, copyId, {
        id: copyId,
        custom: true,
        name: source.name + " copy",
        tagline: source.tagline,
        script: source.script,
        ingredients: source.ingredients,
        method: source.method,
        tip: source.tip,
        timetable: source.timetable,
        scanImage: source.scanImage || ""
      });
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
    render();
  }

  function unlockShopMonth() {
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    draft.locked = false;
    draft.plan = null;
    saveDraft(draft);
    render();
  }

  function onShopAction(btn) {
    var action = btn.getAttribute("data-shop-action");
    if (action === "lock") {
      lockShopMonth();
      return;
    }
    if (action === "unlock") {
      unlockShopMonth();
      return;
    }
    var draft = draftFor(state.viewYear, state.viewMonth, true);
    if (draft.locked) return;
    if (action === "add-custom") {
      var nameInput = $("shop-custom-name");
      var customName = nameInput ? nameInput.value.trim() : "";
      if (!customName) return;
      draft.items.push({
        skuId: "custom-" + Date.now().toString(36),
        qty: 1,
        ticked: true,
        customName: customName,
        pricePence: 0
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

  function paintFuelWeek() {
    var api = foodSchedule();
    var days = activeDaysForView();
    var html = "";
    var draft = draftFor(state.viewYear, state.viewMonth, false);
    var lockedPlan = draft && draft.locked && draft.plan;
    days.forEach(function (day) {
      var cue = lockedPlan && lockedPlan[day.dateKey] ? lockedPlan[day.dateKey] : api.cueForDay(day);
      var note = weekNote(day.dateKey) || {};
      var mealId = cue.mealId;
      var mealName = cue.mealName;
      var plate = (cue.portions && cue.portions.label) || "";
      if (!lockedPlan && note.mealId) {
        var picked = cardView("meal", note.mealId, cue.tier || 1);
        if (picked) {
          mealId = picked.id;
          mealName = picked.name;
        }
      }
      if (!lockedPlan && note.evening) plate = note.evening;
      var lunch = note.lunch || cue.lunch || "";
      var cabins = (cue.cabins || []).join(" · ");
      html += '<tr class="fuel-row is-' + cue.band + '">' +
        '<td class="day-cell">' +
          '<button type="button" class="food-date" data-open-room="meals" data-food-meal="' +
            escapeHtml(mealId) + '" data-food-band="' + escapeHtml(cue.band) + '">' +
            '<span class="day-name">' + escapeHtml(day.dayName) + "</span>" +
            '<span class="day-key">' + escapeHtml(day.dateKey) + "</span>" +
          "</button>" +
        "</td>" +
        '<td class="relics-cell"><div class="relic-stack">' +
          '<button type="button" class="fuel-morning" data-food-extraction="' + escapeHtml(cue.extractionId) +
            '" data-food-band="' + escapeHtml(cue.band) + '">Morning · ' + escapeHtml(cue.smoothieName || cue.extractionName) + "</button>" +
          '<button type="button" class="fuel-meal-name" data-food-meal="' + escapeHtml(mealId) +
            '" data-food-band="' + escapeHtml(cue.band) + '">' + escapeHtml(mealName) + "</button>" +
          '<p class="fuel-meta">' + escapeHtml(plate) + "</p>" +
          (lunch ? '<p class="fuel-meta">' + escapeHtml("Lunch · " + lunch) + "</p>" : "") +
          '<label class="food-note">Lunch note' +
            '<input data-week-date="' + escapeHtml(day.dateKey) + '" data-week-field="lunch" value="' +
              escapeHtml(note.lunch || "") + '" placeholder="' + escapeHtml(cue.lunch || "Lunch") + '">' +
          "</label>" +
          (lockedPlan
            ? '<label class="food-note">Day note<input data-week-date="' + escapeHtml(day.dateKey) +
              '" data-week-field="note" value="' + escapeHtml(note.note || "") + '"></label>' +
              (note.note ? '<p class="fuel-meta">' + escapeHtml(note.note) + "</p>" : "")
            : '<label class="food-note">Evening meal<select data-week-date="' + escapeHtml(day.dateKey) +
              '" data-week-field="mealId"><option value="">Suggested plate</option>' +
              idsForKind("meal").map(function (id) {
                var card = cardView("meal", id, 1);
                if (!card) return "";
                return '<option value="' + escapeHtml(id) + '"' + (note.mealId === id ? " selected" : "") + ">" +
                  escapeHtml(card.name) + "</option>";
              }).join("") +
              "</select></label>" +
              '<label class="food-note">Evening plate<input data-week-date="' + escapeHtml(day.dateKey) +
              '" data-week-field="evening" value="' + escapeHtml(note.evening || "") + '"></label>') +
          '<p class="fuel-portions"><span>' + (cue.fruitPortions || 2) + " fruit</span><span>" +
            (cue.vegPortions || 3) + " veg</span></p>" +
          (cabins ? '<p class="food-cabin-chip">' + escapeHtml(cabins) + "</p>" : "") +
        "</div></td></tr>";
    });
    var body = $("fuel-body");
    if (body) body.innerHTML = html;
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
    if (sunday) {
      sunday.textContent = lockedPlan
        ? "Locked prep plan. Sunday is a 45-minute prep, not a plate on this list. Boil eggs for two days and cook the whites. Seven Brazil nuts, one a day. Cabin names are read-only."
        : "Suggested rotation until you lock the Sainsbury’s list. Sunday is a 45-minute prep, not a plate on this list. Boil eggs for two days and cook the whites. Seven Brazil nuts, one a day. Cabin names are read-only.";
    }
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
    var html = '<section class="fuel-tier" data-tier="' + tier.id + '">' +
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
    html += '<h3 class="food-subhead">This month’s list</h3><ul class="fuel-basket-list shop-editor">';
    (draft.items || []).forEach(function (item, index) {
      var entry = api.skus[item.skuId];
      var label = item.label || item.customName || (entry ? entry.name : "");
      if (!label) return;
      var linePrice = entry ? entry.pricePence * item.qty : (item.pricePence || 0) * item.qty;
      html += '<li class="shop-line' + (item.ticked ? " is-ticked" : "") + '">' +
        '<button type="button" class="shop-tick" data-shop-action="tick" data-shop-index="' + index +
          '" aria-pressed="' + (item.ticked ? "true" : "false") + '">' + (item.ticked ? "In" : "Out") + "</button>" +
        '<input class="shop-name" data-shop-index="' + index + '" data-shop-field="name" value="' +
          escapeHtml(label) + '" aria-label="Rename line">' +
        (item.scanImage ? '<span class="scan-flag">Label photo</span>' : "") +
        "<span class=\"sr-only\">" + escapeHtml(label) + "</span>" +
        '<span class="shop-qty">' +
          '<button type="button" data-shop-action="qty" data-shop-index="' + index + '" data-shop-delta="-1" aria-label="Fewer">−</button>' +
          "<strong>" + item.qty + "</strong>" +
          '<button type="button" data-shop-action="qty" data-shop-index="' + index + '" data-shop-delta="1" aria-label="More">+</button>' +
        "</span>" +
        "<span>" + api.formatGbp(entry ? entry.pricePence * item.qty : linePrice) + "</span>" +
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
    host.innerHTML = foodToolsHtml("meals") + scanStripHtml("meals") + scanPreviewHtml("meals") +
      '<button type="button" class="food-jump" data-card-action="add">Add a meal card<span>Name, ingredients, method, tip</span></button>' +
      idsForKind("meal").map(function (id) {
        var meal = cardView("meal", id, tier.id);
        if (!meal) return "";
        return '<button type="button" class="food-jump" data-food-meal="' + escapeHtml(id) + '">' +
          escapeHtml(meal.name) + "<span>" + escapeHtml(meal.tagline) + "</span></button>";
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
        return '<button type="button" class="food-jump" data-food-extraction="' + escapeHtml(id) + '">' +
          escapeHtml(row.name) + "<span>" + escapeHtml(row.tagline) + "</span></button>";
      }).join("");
  }

  function openFoodRoom(room, focusId, band) {
    if (!FOOD_TITLES[room]) return;
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
    render();
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
    ["weekly", "shop", "meals", "extractions"].forEach(function (name) {
      var panel = $("food-" + name);
      if (panel) panel.hidden = name !== room;
    });
    if (!open) return;
    var title = $("food-board-title");
    if (title) title.textContent = FOOD_TITLES[room];
    if (room === "weekly") paintFuelWeek();
    if (room === "shop") paintShop();
    if (room === "meals") paintMeals();
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
      if (state.viewYear === 2026) {
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
      });
    });
    document.querySelectorAll("[data-set-branch]").forEach(function (opt) {
      opt.addEventListener("click", function () {
        setBranch(opt.getAttribute("data-set-branch"));
      });
    });
    document.querySelectorAll("[data-food-room]").forEach(function (foodBtn) {
      foodBtn.addEventListener("click", function () {
        openFoodRoom(foodBtn.getAttribute("data-food-room"));
        setNavOpen(false);
      });
    });
    var foodBoard = $("food-board");
    if (foodBoard) {
      foodBoard.addEventListener("click", function (event) {
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
          patch[weekField.getAttribute("data-week-field")] = weekField.value.trim();
          saveWeekNote(weekField.getAttribute("data-week-date"), patch);
          render();
          return;
        }
        var shopName = event.target.closest("[data-shop-field='name']");
        if (!shopName) return;
        var draft = draftFor(state.viewYear, state.viewMonth, true);
        if (draft.locked) return;
        var item = draft.items[+shopName.getAttribute("data-shop-index")];
        if (!item) return;
        if (item.customName) item.customName = shopName.value.trim() || item.customName;
        else item.label = shopName.value.trim();
        saveDraft(draft);
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
      }
    }, 30000);
  }

  window.playNextVideo = playNextVideo;
  window.RelicArchitect = {
    version: "2.0",
    build: "v20",
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
