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
   v17: Food & Prep Schedule pairs each training day with a fuel cue from
   RELIC_NUTRITION. Training rotations, the player, and completions stay put. */
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
    foodOpen: false,
    foodCard: null,
    foodBasketOpen: false
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
    return SHIELD_SVG_OPEN + SHIELD_BODY + (doubleTick ? SHIELD_TWO : SHIELD_ONE) + "</svg>";
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
      complete: total >= 6 && fullDays === total
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

  /* Single slot tracks first-session bits. Dual slot tracks full days.
     At 100% the dual slot keeps the orange double shield and the tick total. */
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
    var dualSlot = btn.querySelector(".week-slot-dual");
    if (dualSlot) dualSlot.classList.toggle("is-full", complete);
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

  function nutritionApi() {
    return window.RELIC_NUTRITION || null;
  }

  function cabinLines(day) {
    var phase = day.phase || "Base";
    if (day.isRecovery) {
      return '<span class="cabin-line">' + escapeHtml(day.doc1 || "Rest / Light Mobility") + "</span>";
    }
    return (day.cabins || []).map(function (cabinKey) {
      if (!cabinKey) return "";
      return '<span class="cabin-line">' + escapeHtml(S.citationLabel(cabinKey, phase)) + "</span>";
    }).join("");
  }

  function paintFoodJumps() {
    var host = $("food-jumps");
    if (!host) return;
    var jumps = [
      ["crispy-potato-snack", "Crispy Potato Snack"],
      ["cheesy-roasted-garlic-bread", "Cheesy Roasted Garlic Bread"],
      ["beef-stuffed-potato-boats", "Beef-Stuffed Potato Boats"]
    ];
    host.innerHTML = jumps.map(function (jump) {
      return '<button type="button" class="food-jump" data-food-meal="' + jump[0] + '">' +
        escapeHtml(jump[1]) + "</button>";
    }).join("");
  }

  function paintBasket(api, list) {
    var btn = $("btn-fuel-basket");
    var box = $("fuel-basket");
    if (!btn || !box) return;
    if (!list) {
      btn.hidden = true;
      box.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.textContent = "Monthly basket · " + api.formatGbp(list.totalPence) + " of " + list.budgetLabel;
    btn.setAttribute("aria-expanded", state.foodBasketOpen ? "true" : "false");
    box.hidden = !state.foodBasketOpen;
    if (!state.foodBasketOpen) {
      box.innerHTML = "";
      return;
    }
    var html = '<p class="fuel-basket-note">' + escapeHtml(list.vegNote || "") + '</p><ul class="fuel-basket-list">';
    list.items.forEach(function (item) {
      var entry = api.skus[item.skuId];
      if (!entry) return;
      html += "<li><span>" + item.qty + " × " + escapeHtml(entry.name) + "</span><span>" +
        api.formatGbp(entry.pricePence * item.qty) + "</span></li>";
    });
    html += '</ul><p class="fuel-basket-total">Total ' + api.formatGbp(list.totalPence) +
      " · Fits " + escapeHtml(list.budgetLabel) + "</p>";
    box.innerHTML = html;
  }

  function paintFuelWeek(api, list) {
    var days = activeDaysForView();
    var html = "";
    days.forEach(function (day) {
      var cue = api.cueForDay(day);
      var morning = (cue.morning || []).map(function (dose) {
        return dose.name + " " + dose.text;
      }).join(" · ");
      var align = cue.protein === cue.rotationProtein
        ? cue.protein
        : (cue.rotationProtein + " → " + cue.protein);
      var extractLabel = cue.band === "restorative"
        ? "HEAVY BOTANICAL EXTRACTION"
        : "AM EXTRACTION · 3000W";
      html += '<tr class="fuel-row is-' + cue.band + '">' +
        '<td class="day-cell">' +
          '<span class="day-name">' + escapeHtml(day.dayName) + "</span>" +
          '<span class="day-key">' + escapeHtml(day.dateKey) + "</span>" +
        "</td>" +
        '<td class="relics-cell"><div class="relic-stack">' +
          '<span class="doc-text">' + escapeHtml(day.pair || "") + "</span>" +
          cabinLines(day) +
          '<button type="button" class="fuel-cue" data-food-meal="' + escapeHtml(cue.mealId) +
            '" data-food-band="' + escapeHtml(cue.band) + '">FUEL CUE · ' + escapeHtml(cue.cue) + "</button>" +
          '<p class="fuel-meta">' + escapeHtml(cue.band) + " · " + escapeHtml(align) +
            " · " + escapeHtml(cue.carb) + "</p>" +
          '<button type="button" class="fuel-cue fuel-cue-extract" data-food-extraction="' +
            escapeHtml(cue.extractionId) + '" data-food-band="' + escapeHtml(cue.band) + '">' +
            escapeHtml(extractLabel) + "</button>" +
          '<p class="fuel-morning">Morning · ' + escapeHtml(morning) + "</p>" +
        "</div></td></tr>";
    });
    var body = $("fuel-body");
    if (body) body.innerHTML = html;
    var sunday = $("fuel-sunday");
    if (sunday) {
      sunday.textContent = "Sunday stays off this list. Recovery fuel is the Omega-3 Egg Rest Plate and the heavy botanical extraction.";
    }
    paintFoodJumps();
    paintBasket(api, list);
  }

  function paintFoodCard(api, tier) {
    var host = $("food-card-host");
    if (!host || !state.foodCard) return;
    var card = api.presentRecipe(state.foodCard.id, tier.id, state.foodCard.band);
    if (!card) {
      host.innerHTML = "";
      return;
    }
    var kicker = card.kind === "extraction" ? "3000W EXTRACTION CARD" : "MEAL RECIPE CARD";
    var appliances = (card.appliances || []).map(function (item) {
      return item.name + " · " + item.params;
    }).join(" · ");
    var ingredients = card.ingredients.map(function (item) {
      return "<li>" + escapeHtml(item.line) + "</li>";
    }).join("");
    var method = card.method.map(function (step) {
      return "<li>" + escapeHtml(step) + "</li>";
    }).join("");
    host.innerHTML =
      '<button type="button" class="food-back" id="btn-food-card-back">Food & Prep Schedule</button>' +
      '<article class="recipe-card" data-kind="' + escapeHtml(card.kind) + '">' +
        '<p class="recipe-kicker">' + kicker + "</p>" +
        "<h3>" + escapeHtml(card.name) + "</h3>" +
        '<p class="recipe-params">Prep ' + card.prepMin + " min · " + escapeHtml(appliances) + "</p>" +
        "<h4>Ingredients:</h4><ul>" + ingredients + "</ul>" +
        "<h4>Method:</h4><ol>" + method + "</ol>" +
        '<p class="macro-tag">' + escapeHtml(card.macroLine) + "</p>" +
      "</article>";
  }

  function openFoodCard(id, band) {
    state.foodCard = { id: id, band: band || "moderate" };
    render();
    var back = $("btn-food-card-back");
    if (back && back.scrollIntoView) back.scrollIntoView({ block: "start" });
  }

  function paintFoodBoard() {
    var board = $("food-board");
    var training = $("training-board");
    var open = !!state.foodOpen;
    if (board) board.hidden = !open;
    if (training) training.hidden = open;
    document.body.classList.toggle("is-food", open);
    var row = $("btn-food-prep");
    if (row) {
      row.classList.toggle("is-active", open);
      row.setAttribute("aria-pressed", open ? "true" : "false");
    }
    if (!open) return;
    var api = nutritionApi();
    if (!api) return;
    var tier = api.tierFor(state.viewYear, state.viewMonth);
    var card = $("relic-card");
    if (card) card.setAttribute("data-budget-tier", String(tier.id));
    var tierEl = $("fuel-tier");
    if (tierEl) tierEl.setAttribute("data-tier", String(tier.id));
    var label = $("fuel-tier-label");
    if (label) label.textContent = "TIER " + tier.id + " · " + tier.budgetLabel + "/MONTH";
    var range = $("fuel-tier-range");
    if (range) range.textContent = tier.rangeLabel + " · " + tier.stores.join(" / ");
    var list = api.shoppingListFor(state.viewYear, state.viewMonth);
    var basketLine = $("fuel-tier-basket");
    if (basketLine) {
      basketLine.textContent = list
        ? ("Basket " + api.formatGbp(list.totalPence) + " of " + tier.budgetLabel +
          " · " + api.formatGbp(list.headroomPence) + " headroom")
        : "";
    }
    var showingCard = !!state.foodCard;
    var schedule = $("food-schedule");
    var host = $("food-card-host");
    var closeBtn = $("btn-food-close");
    if (schedule) schedule.hidden = showingCard;
    if (host) host.hidden = !showingCard;
    if (closeBtn) closeBtn.hidden = showingCard;
    if (showingCard) paintFoodCard(api, tier);
    else paintFuelWeek(api, list);
    var blurb = $("month-blurb");
    if (blurb && blurb.textContent.indexOf("Food & Prep") === -1) {
      blurb.textContent = (blurb.textContent ? blurb.textContent + " · " : "") + "Food & Prep dual-sync";
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

  function pickMonth(month) {
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
    state.mode = mode;
    render();
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
    var foodBtn = $("btn-food-prep");
    if (foodBtn) {
      foodBtn.addEventListener("click", function () {
        state.foodOpen = true;
        state.foodCard = null;
        setNavOpen(false);
        render();
        var title = $("food-board-title");
        if (title) {
          try { title.focus({ preventScroll: true }); } catch (err) {
            try { title.focus(); } catch (err2) { /* focus is optional */ }
          }
        }
      });
    }
    var foodBoard = $("food-board");
    if (foodBoard) {
      foodBoard.addEventListener("click", function (event) {
        if (event.target.closest("#btn-food-close")) {
          state.foodOpen = false;
          state.foodCard = null;
          state.foodBasketOpen = false;
          render();
          return;
        }
        if (event.target.closest("#btn-food-card-back")) {
          state.foodCard = null;
          render();
          return;
        }
        if (event.target.closest("#btn-fuel-basket")) {
          state.foodBasketOpen = !state.foodBasketOpen;
          render();
          return;
        }
        var meal = event.target.closest("[data-food-meal]");
        if (meal) {
          openFoodCard(meal.getAttribute("data-food-meal"), meal.getAttribute("data-food-band"));
          return;
        }
        var extraction = event.target.closest("[data-food-extraction]");
        if (extraction) {
          openFoodCard(extraction.getAttribute("data-food-extraction"), extraction.getAttribute("data-food-band"));
        }
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
      if (!document.body.classList.contains("nav-open")) return;
      var playerRoot = $("relic-player");
      if (playerRoot && !playerRoot.hidden) return;
      event.preventDefault();
      setNavOpen(false);
      if (navBtn) navBtn.focus();
    });
    setNavOpen(false);
    $("tt-body").addEventListener("click", function (event) {
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
      stage.addEventListener("click", onStageHudClickCapture, true);
    }
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
    build: "v17",
    get nutrition() { return nutritionApi(); },
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
