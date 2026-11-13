/* Relic Architect V2.0 — timetable and HTML5 cabin player.
   Playback uses the Nexus video base. Drive iframes, previews, and embeddedfolderview are refused.
   Ticks sync through the Nexus API. The phone is not the source of truth.
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
   training ticks, move the player timer, or open the CUE panel.
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
  var HUD_IDLE_MS = 4000;
  var PHASE_TAG_MS = 8000;
  var TAP_SLOP = 18;
  var PICK_GAP_MS = 320;
  var lastPickAt = 0;
  var hudGesture = null;
  var viewScroll = {};
  var surfacePress = null;
  var EMPTY_MSG = "No video file IDs mapped for this cabin.";
  var FUTURE_LOCK_KEY = "relic_future_lock";
  var LOCK_OVERRIDE_KEY = "relic_future_lock_override";

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
    hubTab: "schedules",
    hubWeek: 0,
    hubArtLoaded: false,
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
  state.hubTab = readHubTab();
  state.accountView = "tiles";

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

  function lockDateReached() {
    var parts = londonParts(getNow());
    return !!(parts && parts.dateKey >= "2027-01-01");
  }

  /* Before 1 Jan 2027 the saved switch is the lock. From that London date the
     lock is on unless Joe has turned it off since then. */
  function readFutureLock() {
    var stored = false;
    try { stored = localStorage.getItem(FUTURE_LOCK_KEY) === "1"; }
    catch (err) { return false; }
    if (!lockDateReached()) return stored;
    try { if (localStorage.getItem(LOCK_OVERRIDE_KEY) === "off") return false; }
    catch (err) { return true; }
    return true;
  }

  function writeFutureLock(on) {
    try {
      if (on) localStorage.setItem(FUTURE_LOCK_KEY, "1");
      else localStorage.removeItem(FUTURE_LOCK_KEY);
      if (!lockDateReached()) return;
      if (on) localStorage.removeItem(LOCK_OVERRIDE_KEY);
      else localStorage.setItem(LOCK_OVERRIDE_KEY, "off");
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
    if (v === "training" || v === "cards" || v === "food" || v === "smoothies" || v === "porridge" || v === "hub" || v === "account") return v;
    return "hub";
  }

  function trainingDeepLink() {
    return /[?&]mode=(upper|full)\b/.test(location.search || "") || /[?&]date=\d{4}-\d{2}-\d{2}/.test(location.search || "");
  }

  function doorOverride() {
    var match = /[?&]door=([a-z]+)/.exec(location.search || "");
    return match ? normDoor(match[1]) : "";
  }

  function readHubTab() {
    try {
      var saved = localStorage.getItem("relic_hub_tab");
      if (saved === "food" || saved === "schedules") return saved;
    } catch (err) { /* private mode */ }
    return "schedules";
  }

  function writeHubTab(tab) {
    try { localStorage.setItem("relic_hub_tab", tab); } catch (err) { /* private mode */ }
  }

  function schedulesOnHub() {
    return state.osDoor === "hub" && state.hubTab === "schedules";
  }

  function syncHubClass() {
    if (!document.body) return;
    document.body.classList.toggle("hub-schedules", schedulesOnHub());
  }

  function paintFutureLock() {
    var btn = $("btn-future-lock");
    if (!btn) return;
    var on = !!state.futureLock;
    var training = state.osDoor === "training" || schedulesOnHub();
    btn.hidden = !training;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Lock on" : "Lock off");
  }

  function hubHeading() {
    return state.hubTab === "food" ? "Food Schedules" : "Training Schedules";
  }

  function paintHeading(text) {
    var pageTitle = $("page-title");
    if (pageTitle) pageTitle.textContent = text;
    document.title = text;
  }

  function revealHubLock() {
    var row = $("hub-lock");
    if (!row) return;
    var on = !!state.futureLock;
    row.setAttribute("aria-pressed", on ? "true" : "false");
    row.setAttribute("aria-label", on ? "Lock on" : "Lock off");
    var icon = row.querySelector(".hub-lock-icon");
    if (icon) icon.textContent = on ? "🔒" : "🔓";
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

  var TICK_DIRTY_KEY = "nexus_ticks_dirty_v2";
  var tickLoadFailed = false;
  var ticksUseMask = false;
  var pendingTickBit = 0;
  var trainToastTimer = 0;

  function maskFromLevel(level) {
    var n = Number(level) || 0;
    if (n >= 2) return 3;
    if (n === 1) return 1;
    return 0;
  }

  function readTickDirty() {
    try {
      var raw = JSON.parse(localStorage.getItem(TICK_DIRTY_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (err) { return {}; }
  }

  function writeTickDirty(map) {
    try { localStorage.setItem(TICK_DIRTY_KEY, JSON.stringify(map)); } catch (err) { /* private mode */ }
  }

  function rememberTickDirty(storageKey, mask) {
    var map = readTickDirty();
    map[storageKey] = normalizeTier(mask);
    writeTickDirty(map);
  }

  function forgetTickDirty(storageKey) {
    var map = readTickDirty();
    if (!Object.prototype.hasOwnProperty.call(map, storageKey)) return;
    delete map[storageKey];
    writeTickDirty(map);
  }

  function trainToast(message) {
    if (state.osDoor !== "training") return;
    var el = $("deck-toast");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    if (trainToastTimer) clearTimeout(trainToastTimer);
    trainToastTimer = setTimeout(function () {
      el.hidden = true;
      el.textContent = "";
    }, 4000);
  }

  function paintSyncDot() {
    var dot = $("sync-dot");
    if (!dot) return;
    var busy = state.syncPending > 0;
    dot.classList.toggle("is-busy", busy);
    dot.classList.toggle("is-error", !!state.syncError && !busy);
    var dirty = Object.keys(readTickDirty()).length > 0;
    var label = busy ? "Syncing completions" : (state.syncError ? state.syncNote : (dirty ? "Saved on this phone" : "Synced"));
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

  function tickMarks(count) {
    var one = '<svg class="mark-tick" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path d="M4.5 14.8 11 21.2 23.8 6.6" fill="none" stroke="#ff8c00" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-6 14 14)"/></svg>';
    if (count < 2) return one;
    return '<svg class="mark-tick is-pair" viewBox="0 0 40 28" aria-hidden="true" focusable="false"><path d="M2 15.2 8.2 21.2 18.4 8" fill="none" stroke="#ff8c00" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 15.2 22.2 21.2 37 7.2" fill="none" stroke="#ff8c00" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function shieldSvg(doubleTick) {
    var open = doubleTick
      ? SHIELD_SVG_OPEN.replace('class="shield-tick"', 'class="shield-tick is-dual"')
      : SHIELD_SVG_OPEN;
    var body = doubleTick ? SHIELD_BODY.replace("#ff8c00", "#3dff7a") : SHIELD_BODY;
    return open + body + (doubleTick ? SHIELD_TWO : SHIELD_ONE) + "</svg>";
  }

  function pullCompletions() {
    var api = window.NEXUS_API || {};
    if (!api.base || typeof window.nexusFetch !== "function") {
      state.loaded = true;
      tickLoadFailed = true;
      console.error("Nexus API missing — ticks cannot sync.");
      return Promise.resolve();
    }
    beginSyncActivity();
    return window.nexusFetch("/ticks").then(function (rows) {
      var next = {};
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (!row) return;
          var mask;
          if (row.mask != null) {
            ticksUseMask = true;
            mask = normalizeTier(row.mask);
          } else {
            mask = maskFromLevel(row.level);
          }
          absorbCompletionRow(next, row.date_key, Number(row.level) > 0, mask);
        });
      }
      var dirty = readTickDirty();
      Object.keys(dirty).forEach(function (key) {
        var mask = normalizeTier(dirty[key]);
        if (mask) next[key] = mask;
        else delete next[key];
      });
      state.videos = next;
      state.loaded = true;
      tickLoadFailed = false;
      setSync("", false);
    }).catch(function (err) {
      state.loaded = true;
      tickLoadFailed = true;
      console.error(err && err.message ? err.message : err);
    }).then(function () {
      endSyncActivity();
      if (!tickLoadFailed) flushTickDirty();
    });
  }

  function flushTickDirty() {
    var map = readTickDirty();
    Object.keys(map).forEach(function (key) {
      upsertCompletion(key, map[key]).then(function (row) {
        if (!row) return;
        forgetTickDirty(key);
        applyReturnedCompletion(key, row);
      });
    });
  }

  function upsertCompletion(storageKey, mask) {
    var api = window.NEXUS_API || {};
    if (!api.base || typeof window.nexusFetch !== "function") return Promise.resolve(null);
    var bits = normalizeTier(mask);
    var level = popcount(bits);
    var body = ticksUseMask ? { mask: bits } : { level: level };
    return window.nexusFetch("/ticks/" + encodeURIComponent(storageKey), {
      method: "PUT",
      body: body
    }).then(function (row) {
      if (row && row.date_key) return row;
      return ticksUseMask
        ? { date_key: storageKey, mask: bits, level: level }
        : { date_key: storageKey, level: level };
    }).catch(function () {
      return null;
    });
  }

  function applyReturnedCompletion(storageKey, row) {
    var key = storageKeyFromRow(row && row.date_key) || storageKey;
    if (ticksUseMask && (!row || row.mask == null)) return;
    var mask = ticksUseMask ? normalizeTier(row.mask) : (row && row.level != null ? maskFromLevel(row.level) : 0);
    if (mask) state.videos[key] = mask;
    else delete state.videos[key];
  }

  function saveMask(storageKey, mask, dateKey, restoreFocus) {
    var bits = normalizeTier(mask);
    if (bits) state.videos[storageKey] = bits;
    else delete state.videos[storageKey];
    rememberTickDirty(storageKey, bits);
    state.restoreTickDate = restoreFocus ? dateKey : "";
    if (restoreFocus) state.restoreTickBit = pendingTickBit;
    render();

    var gen = (state.saveGen[storageKey] || 0) + 1;
    state.saveGen[storageKey] = gen;
    beginSyncActivity();
    upsertCompletion(storageKey, bits).then(function (row) {
      if (state.saveGen[storageKey] !== gen) return;
      if (!row) {
        trainToast("Tick saved on this phone");
        return;
      }
      forgetTickDirty(storageKey);
      applyReturnedCompletion(storageKey, row);
      state.restoreTickDate = restoreFocus ? dateKey : "";
      if (restoreFocus) state.restoreTickBit = pendingTickBit;
      render();
      setSync("", false);
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
      var lineMask = normalizeTier(maskFor(day.dateKey));
      (day.cabins || []).forEach(function (cabinKey, index) {
        if (!cabinKey) return;
        var label = S.citationLabel(cabinKey, phase);
        var href = citationHref(cabinKey, phase);
        var bit = index === 1 ? 2 : 1;
        var marked = (lineMask & bit) === bit;
        var lineNo = index === 1 ? 2 : 1;
        var planKey = completionStorageKey(day.dateKey);
        var placed = window.NexusBuilder && window.NexusBuilder.placement
          ? window.NexusBuilder.placement(planKey, lineNo)
          : null;
        var pickable = canTick(day.dateKey, londonParts(state.now || getNow()));
        var pick = pickable
          ? '<button type="button" class="plan-pick" data-plan-key="' + escapeHtml(planKey) + '" data-line="' + lineNo + '" aria-label="' + (placed ? "Change schedule" : "Choose schedule") + '">' + (placed ? "✎" : "+") + "</button>"
          : "";
        var body;
        if (placed) {
          body = '<button type="button" class="combo-play' + (marked ? " is-line-on" : "") + '" data-combo="' + escapeHtml(placed.id) + '">' + escapeHtml(placed.name) + "</button>";
        } else {
          body = '<a class="cite-link' + (index === 0 ? " is-lead" : "") + (marked ? " is-line-on" : "") + '" data-cabin="' + escapeHtml(cabinKey) +
            '" data-phase="' + escapeHtml(phase) +
            '" data-date="' + escapeHtml(day.dateKey) +
            '" data-slot="' + (index === 1 ? "1" : "0") +
            '" href="' + escapeHtml(href || "#") +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(label || (index === 0 ? day.doc1 : day.doc2) || "") +
            "</a>";
        }
        blocks.push('<div class="relic-line">' + body + pick + "</div>");
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

  function tickDateLabel(day) {
    var raw = String(day.dayName || "");
    var name = raw ? raw.charAt(0) + raw.slice(1).toLowerCase() : "";
    var parts = String(day.dateKey || "").split("-");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var dom = parts[2] ? String(Number(parts[2])) : "";
    var mon = months[(Number(parts[1]) || 1) - 1] || "";
    return (name + " " + dom + " " + mon).trim();
  }

  function tickCheckSvg() {
    return '<svg class="mark-tick" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path d="M6 14.5 11.5 20 22 8" fill="none" stroke="#ff8a00" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function doneHtml(day, parts) {
    if (!canTick(day.dateKey, parts)) {
      return '<td class="done-cell"><span class="lock-badge">LOCKED</span></td>';
    }
    var mask = normalizeTier(maskFor(day.dateKey));
    var cabins = (day.cabins || []).filter(Boolean);
    var lines = (!day.isRecovery && cabins.length > 1) ? 2 : 1;
    var label = escapeHtml(tickDateLabel(day));
    var html = '<td class="done-cell"><div class="tick-pair">';
    var i;
    for (i = 0; i < lines; i++) {
      var bit = i === 0 ? 1 : 2;
      var on = (mask & bit) === bit;
      html += '<button type="button" class="tick-hit' + (on ? " is-on" : "") + '" data-date="' + day.dateKey +
        '" data-bit="' + bit + '" role="checkbox" aria-checked="' + (on ? "true" : "false") +
        '" aria-label="Tick ' + (i === 0 ? "top" : "bottom") + " schedule, " + label + '">' +
        '<span class="tick-box" aria-hidden="true">' + (on ? tickCheckSvg() : "") + "</span></button>";
    }
    return html + "</div></td>";
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

  function paintHubStats() {
    document.querySelectorAll("[data-hub-stats]").forEach(function (node) {
      node.innerHTML = hubStatsHtml(node.getAttribute("data-hub-stats"));
    });
  }

  function loadHubArt() {
    if (state.hubArtLoaded) return;
    document.querySelectorAll("#hub-stats .hub-tile img").forEach(function (img) {
      var src = img.getAttribute("data-src");
      if (src && !img.getAttribute("src")) img.setAttribute("src", src);
    });
    state.hubArtLoaded = true;
  }

  function paintHub() {
    var root = $("hub-root");
    if (!root) return;
    if (state.hubTab !== "food" && state.hubTab !== "schedules") state.hubTab = "schedules";
    syncHubClass();
    if (state.osDoor === "hub") paintHeading(hubHeading());
    root.querySelectorAll("[data-hub-tab]").forEach(function (tab) {
      var on = tab.getAttribute("data-hub-tab") === state.hubTab;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    });
    var foodPanel = $("hub-panel-food");
    if (foodPanel) foodPanel.hidden = state.hubTab !== "food";
    paintFutureLock();
    revealHubLock();
    paintHubStats();
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

  function showAccountView() {
    if (state.osDoor !== "account") state.accountView = "tiles";
    var view = state.accountView || "tiles";
    var on = state.osDoor === "account";
    var tiles = $("account-tiles");
    var stats = $("hub-stats");
    var info = $("account-info");
    var weight = $("account-weight");
    if (tiles) tiles.hidden = !on || view !== "tiles";
    if (info) info.hidden = !on || view !== "info";
    if (weight) weight.hidden = !on || view !== "weight";
    if (stats) stats.hidden = !on || view !== "stats";
    if (on && view === "stats") {
      loadHubArt();
      paintHubStats();
      revealHubLock();
    }
    if (on && window.NexusAccount) window.NexusAccount.refresh(view);
  }

  function paintOsDoors() {
    var door = normDoor(state.osDoor);
    state.paintedDoor = door;
    state.osDoor = door;
    var titles = {
      training: "Training Schedules",
      cards: "Training Video Cards",
      food: "Food Deck",
      smoothies: "Smoothies Deck",
      porridge: "Porridge Deck",
      hub: "Main Menu Hub",
      account: "Account Profile"
    };
    var title = $("nav-drawer-title");
    if (title) title.textContent = titles[door];
    paintHeading(door === "hub" ? hubHeading() : titles[door]);
    document.querySelectorAll("[data-os-door]").forEach(function (btn) {
      var on = btn.getAttribute("data-os-door") === door;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-os-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-os-panel") !== door;
    });
    paintFutureLock();
    paintModeChrome();
    paintBranchChrome();
    if (document.body) {
      document.body.classList.toggle("is-hub", door === "hub");
      document.body.classList.toggle("is-deck", door === "food" || door === "smoothies" || door === "porridge");
      document.body.classList.toggle("is-cards", door === "cards");
      document.body.classList.toggle("is-account", door === "account");
      syncHubClass();
    }
    if (door === "cards" && window.NexusCards && window.NexusCards.render) window.NexusCards.render();
    if (door === "hub") paintHub();
    showAccountView();
    revealHubLock();
    if ((door === "food" || door === "smoothies" || door === "porridge") && window.NexusDeck && window.NexusDeck.renderDeck) {
      var deckName = door === "smoothies" ? "smoothie" : door === "porridge" ? "porridge" : "food";
      window.NexusDeck.renderDeck(deckName);
    }
  }

  function friendlyToday(parts) {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return parts.day + " " + months[parts.month - 1] + " · " + parts.weekday;
  }

  function friendlySpan(startKey, endKey) {
    var months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function short(key) {
      var bits = String(key).split("-");
      return (+bits[2]) + " " + months[+bits[1]];
    }
    if (String(startKey).slice(0, 4) === String(endKey).slice(0, 4)) {
      return short(startKey) + " – " + short(endKey) + " " + String(endKey).slice(0, 4);
    }
    return short(startKey) + " " + String(startKey).slice(0, 4) + " – " + short(endKey) + " " + String(endKey).slice(0, 4);
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
    $("meta-today").textContent = friendlyToday(parts);
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
      metaLine = friendlySpan(weekDays[0].dateKey, weekDays[weekDays.length - 1].dateKey);
    }
    $("week-meta").textContent = metaLine;

    var tbody = $("tt-body");
    var html = "";
    weekDays.forEach(function (day) {
      var isToday = day.dateKey === parts.dateKey;
      var classes = [];
      if (isToday) classes.push("today");
      if (normalizeTier(maskFor(day.dateKey))) classes.push("is-ticked");
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
      var bitSel = state.restoreTickBit ? '[data-bit="' + state.restoreTickBit + '"]' : "";
      var again = tbody.querySelector('button.tick-hit[data-date="' + state.restoreTickDate + '"]' + bitSel);
      state.restoreTickDate = "";
      state.restoreTickBit = 0;
      if (again) {
        try { again.focus({ preventScroll: true }); } catch (err) {
          try { again.focus(); } catch (err2) { /* focus is optional */ }
        }
      }
    }
  }

  function onTick(btn) {
    var dateKey = btn.getAttribute("data-date");
    var parts = londonParts(state.now || getNow());
    if (!dateKey || !canTick(dateKey, parts)) return;
    var bit = Number(btn.getAttribute("data-bit")) || 1;
    if (bit !== 2) bit = 1;
    var current = normalizeTier(maskFor(dateKey));
    var next;
    if (ticksUseMask) next = (current ^ bit) & 3;
    else if (bit === 2 && (current & 3) === 0) next = 3;
    else if (bit === 1 && (current & 3) === 3) next = 0;
    else {
      next = (current ^ bit) & 3;
      if (next === 2) next = 0;
    }
    pendingTickBit = bit;
    state.restoreTickBit = bit;
    saveMask(completionStorageKey(dateKey), next, dateKey, true);
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
      paintOsDoors();
    }
    if (!next) navToggleAt = 0;
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
    var api = window.NEXUS_API || {};
    var key = (objectParts || []).filter(function (part) { return !!part; }).map(function (part) {
      return encodeURIComponent(part);
    }).join("/");
    var base = String(api.videoBase || "").replace(/\/$/, "");
    if (!base || !key) return "";
    return base + "/" + key;
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
    el.setAttribute("data-seconds", String(player.clipSeconds || SET_DURATION_SEC));
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
      var selected = ((+mods[i].getAttribute("data-duration-min") * 60) === (player.clipSeconds || SET_DURATION_SEC));
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
    return !!node.closest(".player-close, .player-controls, .timer-dock, .start-gate, .forensic-tab, .forensic-panel, .forensic-dock, .px-hit, .px-sheet, .px-corners, .px-tap-play, .px-spin");
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

  function clipMediaKey(clip) {
    if (clip && clip.r2Key) return String(clip.r2Key);
    var src = clip && clip.src ? String(clip.src) : "";
    var match = src.match(/r2\.dev\/([^?#]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (err) { return match[1]; }
  }

  function archiveDriveId(clip) {
    if (clip && clip.id) return String(clip.id);
    var archive = window.RELIC_VIDEO_ARCHIVE && window.RELIC_VIDEO_ARCHIVE.cabins;
    var cabin = archive && player.cabin && archive[player.cabin];
    var raw = (cabin && cabin.playlist) || [];
    var src = clip && clip.src ? String(clip.src) : "";
    if (!src) return "";
    var i;
    for (i = 0; i < raw.length; i++) {
      if (!raw[i] || !raw[i].id) continue;
      if (resolveClipSrc(player.cabin, raw[i]) === src) return String(raw[i].id);
    }
    return "";
  }

  function currentCueView() {
    if (!window.NexusCue) return null;
    var clip = currentClip();
    var mediaKey = clipMediaKey(clip);
    var identity = window.NexusCards && window.NexusCards.identityByKey ? window.NexusCards.identityByKey(mediaKey) : null;
    var driveId = archiveDriveId(clip);
    var legacy = null;
    var lib = window.RELIC_FORENSIC;
    if (lib && typeof lib.readClip === "function" && driveId) {
      legacy = lib.readClip({
        branch: "year",
        cabinKey: player.cabin || "",
        clipId: driveId,
        title: clip && clip.title,
        phase: player.phase || "Base"
      });
    }
    var manual = window.NexusCueEdit && identity ? window.NexusCueEdit.forIdentity(identity) : null;
    return window.NexusCue.resolve({
      title: clipDisplayTitle(clip, null),
      identity: identity,
      driveId: driveId,
      legacy: legacy,
      manual: manual
    });
  }

  function cueText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function editorCue() {
    var clip = currentClip();
    var mediaKey = clipMediaKey(clip);
    var identity = window.NexusCards && window.NexusCards.identityByKey ? window.NexusCards.identityByKey(mediaKey) : null;
    var row = window.NexusCueEdit && identity ? window.NexusCueEdit.forIdentity(identity) : null;
    var cue = row && row.cue;
    if (!cue) {
      return { leads: ["", "", ""], steps: [], dose: { sets: "", reps: "", hold: "", rest: "" }, breathing: "", avoid: "" };
    }
    return cue;
  }

  function doseCells(dose) {
    dose = dose || {};
    function cell(label, value) {
      var text = String(value || "").trim();
      return "<div><dt>" + label + "</dt><dd>" + (text ? cueText(text) : "—") + "</dd></div>";
    }
    return cell("Sets", dose.sets) + cell("Reps", dose.reps) + cell("Hold", dose.hold) + cell("Rest", dose.rest);
  }

  function addedOrPending(value) {
    var text = String(value || "").trim();
    return text ? "<p>" + cueText(text) + "</p>" : '<p class="cue-empty">Not added yet</p>';
  }

  function listOrPending(items) {
    var list = (items || []).filter(function (item) { return String(item || "").trim(); });
    if (!list.length) return '<p class="cue-empty">Not added yet</p>';
    return "<ol>" + list.map(function (item) { return "<li>" + cueText(item) + "</li>"; }).join("") + "</ol>";
  }

  function sheetClosedY() {
    var dock = $("forensic-dock");
    var tab = $("forensic-tab");
    if (!dock || !dock.offsetHeight) return 0;
    var lip = tab && tab.offsetHeight ? tab.offsetHeight : 36;
    return Math.max(0, Math.round(dock.offsetHeight - lip));
  }

  function currentSheetY() {
    var dock = $("forensic-dock");
    if (!dock) return 0;
    var raw = dock.getAttribute("data-cue-shift");
    if (raw === null || raw === "") return sheetClosedY();
    return Number(raw) || 0;
  }

  function placeSheet(y, animate) {
    var dock = $("forensic-dock");
    if (!dock) return;
    var closed = sheetClosedY();
    if (!closed && !dock.offsetHeight) return;
    if (y < 0) y = 0;
    if (closed && y > closed) y = closed;
    y = Math.round(y);
    dock.style.transition = animate ? "transform 280ms ease-out" : "none";
    dock.style.transform = "translate3d(0," + y + "px,0)";
    dock.setAttribute("data-cue-shift", String(y));
  }

  function parkSheet() {
    if (player.cueDrag || (player.cueLevel | 0) > 0) return;
    var dock = $("forensic-dock");
    var closed = sheetClosedY();
    if (!dock || !closed) return;
    if (dock.getAttribute("data-cue-shift") === String(closed)) return;
    placeSheet(closed, false);
  }

  function ensureCueStage1() {
    var dock = $("forensic-dock");
    if (!dock || $("cue-stage1")) return;
    var stage1 = document.createElement("div");
    stage1.id = "cue-stage1";
    stage1.className = "cue-stage1";
    var clip = document.createElement("div");
    clip.id = "cue-stage1-clip";
    clip.className = "cue-stage1-clip";
    clip.innerHTML = '<p class="cue-title" id="cue-stage1-title"></p>' +
      '<dl class="cue-dose" id="cue-stage1-dose"></dl>' +
      '<div class="cue-px" id="cue-px-host">' +
      '<span class="cue-px-label cue-px-label-mute">Mute</span>' +
      '<span class="cue-px-label cue-px-label-speed">Playback speed</span>' +
      "</div>" +
      '<section id="cue-sec-rules"></section>' +
      '<section id="cue-sec-do"></section>' +
      '<section id="cue-sec-avoid"></section>' +
      '<section id="cue-sec-breath"></section>';
    stage1.appendChild(clip);
    var panel = $("forensic-panel");
    if (panel) dock.insertBefore(stage1, panel);
    else dock.appendChild(stage1);
    if (window.NexusPlay) window.NexusPlay.mountPair($("cue-px-host"), "px-mute");
    bindCueScroll(stage1);
    parkSheet();
  }

  function bindCueScroll(scroll) {
    if (!scroll || scroll.getAttribute("data-cue-scroll") === "1") return;
    scroll.setAttribute("data-cue-scroll", "1");
    var pull = null;
    function begin(x, y) {
      pull = { x: x, y: y, top: scroll.scrollTop, pulling: false, shift: currentSheetY() };
    }
    function move(x, y, event) {
      if (!pull) return;
      var dx = x - pull.x;
      var dy = y - pull.y;
      if (!pull.pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (scroll.scrollTop <= 0 && dy > 0 && Math.abs(dy) > Math.abs(dx)) pull.pulling = true;
        else return;
      }
      if (event && event.cancelable) event.preventDefault();
      player.cueDrag = true;
      var stage = playerStage();
      if (stage) stage.classList.add("is-cue-dragging");
      placeSheet(pull.shift + dy, false);
    }
    function end(x, y) {
      if (!pull) return;
      var was = pull;
      pull = null;
      if (!was.pulling) return;
      player.cueDrag = false;
      var stage = playerStage();
      if (stage) stage.classList.remove("is-cue-dragging");
      var dy = y - was.y;
      var next = dy > 28 ? 0 : (currentSheetY() > sheetClosedY() * 0.35 ? 0 : 1);
      setCueLevel(next);
    }
    scroll.addEventListener("touchstart", function (event) {
      event.stopPropagation();
      if (!event.touches || event.touches.length !== 1) return;
      var touch = event.touches[0];
      if (event.target.closest && event.target.closest(".px-hit, .px-mute, .px-rate, button, a, input")) return;
      begin(touch.clientX, touch.clientY);
    }, { passive: true });
    scroll.addEventListener("touchmove", function (event) {
      event.stopPropagation();
      if (!pull || !event.touches || !event.touches.length) return;
      var touch = event.touches[0];
      move(touch.clientX, touch.clientY, event);
    }, { passive: false });
    scroll.addEventListener("touchend", function (event) {
      event.stopPropagation();
      if (!pull || !event.changedTouches || !event.changedTouches.length) return;
      var touch = event.changedTouches[0];
      end(touch.clientX, touch.clientY);
    }, { passive: false });
    scroll.addEventListener("touchcancel", function () {
      if (pull && pull.pulling) end(pull.x, pull.y);
      pull = null;
    });
  }

  function placeCueControls() {
    var host = $("cue-px-host");
    var home = $("cue-stage1-clip");
    if (host && home && host.parentNode !== home) {
      var dose = $("cue-stage1-dose");
      if (dose && dose.nextSibling) home.insertBefore(host, dose.nextSibling);
      else home.appendChild(host);
    }
  }

  function clipCatalogueName() {
    var clip = currentClip();
    var key = clipMediaKey(clip);
    var identity = window.NexusCards && window.NexusCards.identityByKey && key ? window.NexusCards.identityByKey(key) : null;
    if (identity && identity.title) return String(identity.title);
    return tidyClipTitle(clip && clip.title);
  }

  function paintCueTitle() {
    var name = clipCatalogueName();
    var stageTitle = $("cue-stage1-title");
    if (stageTitle) stageTitle.textContent = name;
  }

  function paintCueStage1() {
    ensureCueStage1();
    paintCueTitle();
    var cue = editorCue();
    var host = $("cue-stage1-dose");
    if (host) host.innerHTML = doseCells(cue.dose);
    var leads = $("cue-sec-rules");
    if (leads) {
      var rows = [0, 1, 2].map(function (index) {
        var text = String((cue.leads || [])[index] || "").trim();
        return '<li><span class="cue-num">' + (index + 1) + "</span><p>" +
          (text ? cueText(text) : '<span class="cue-empty">Not added yet</span>') + "</p></li>";
      }).join("");
      leads.innerHTML = "<h3>3 Lead Rules</h3><ol class=\"cue-rules\">" + rows + "</ol>";
    }
    var steps = $("cue-sec-do");
    if (steps) steps.innerHTML = "<h3>Do This Properly</h3>" + listOrPending(cue.steps);
    var avoid = $("cue-sec-avoid");
    if (avoid) avoid.innerHTML = "<h3>Avoid This</h3>" + addedOrPending(cue.avoid);
    var breath = $("cue-sec-breath");
    if (breath) breath.innerHTML = "<h3>Breathing</h3>" + addedOrPending(cue.breathing);
    parkSheet();
    if (!player.cueRefresh) {
      player.cueRefresh = true;
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        paintCueStage1();
        if (tries >= 8) clearInterval(timer);
      }, 400);
    }
  }

  function paintForensic() {
    var host = $("forensic-scroll");
    if (!host || !window.NexusCue) return;
    var view = currentCueView();
    /* The schedule sheet never prints the numeric id. */
    var html = window.NexusCue.render(view);
    html = html.replace(/<p class="cue-manual">[\s\S]*?<\/p>/g, "");
    html = html.replace(/Joe entered\. Not footage-verified\./g, "");
    host.innerHTML = html;
    paintCueStage1();
  }

  var CUE_STAGE_CAP = 1;

  function setCueLevel(level) {
    var panel = $("forensic-panel");
    var tab = $("forensic-tab");
    if (!panel || !tab) return;
    var next = Math.max(0, Math.min(CUE_STAGE_CAP, level | 0));
    player.cueLevel = next;
    var open = next > 0;
    /* Move the sheet with a transform only. Leave playback and the video size alone. */
    tab.setAttribute("aria-expanded", open ? "true" : "false");
    tab.setAttribute("aria-valuenow", String(next));
    tab.setAttribute("aria-valuemin", "0");
    tab.setAttribute("aria-valuemax", "1");
    panel.setAttribute("aria-hidden", "true");
    if ("inert" in panel) panel.inert = true;
    var stage = playerStage();
    if (stage) {
      stage.classList.toggle("is-forensic-open", open);
      stage.classList.toggle("is-cue-mid", next === 1);
      stage.classList.remove("is-cue-full");
    }
    if (!player.cueDrag) placeSheet(open ? 0 : sheetClosedY(), true);
    placeCueControls();
    if (open) paintForensic();
  }

  function setForensicOpen(open) {
    setCueLevel(open ? (player.cueLevel > 0 ? player.cueLevel : 1) : 0);
  }

  function stopForensicEvent(event) {
    if (event && event.stopPropagation) event.stopPropagation();
  }

  function chromeMustStay() {
    if (player.paused) return true;
    var stage = playerStage();
    if (stage && stage.classList.contains("is-clip-loading")) return true;
    var tap = $("px-tap-play");
    if (tap && !tap.hidden) return true;
    var mods = $("relic-timer-mods");
    if (mods && !mods.hidden) return true;
    return false;
  }

  function showPlayerHud() {
    var root = $("relic-player");
    if (!root || root.hidden) return;
    var stage = playerStage();
    var hud = $("relic-player-hud");
    if (hud) hud.classList.add("is-hud-instant");
    if (stage) {
      stage.classList.remove("is-hud-idle");
      stage.classList.remove("is-chrome-idle");
    }
    if (hud) {
      hud.inert = false;
      hud.setAttribute("aria-hidden", "false");
      void hud.offsetWidth;
      hud.classList.remove("is-hud-instant");
    }
    if (player.hudTimer) clearTimeout(player.hudTimer);
    player.hudTimer = setTimeout(function () { hidePlayerHud(false); }, HUD_IDLE_MS);
    showPhaseTag();
  }

  function catalogPhaseMap() {
    if (player.phaseMap) return player.phaseMap;
    var map = {};
    var catalog = window.NEXUS_VIDEO_CATALOG;
    if (!catalog || !catalog.groups) {
      player.phaseMap = map;
      return map;
    }
    catalog.groups.forEach(function (group) {
      (group.modules || []).forEach(function (mod) {
        var id = mod.id === "pre" ? "pre" : mod.id === "post" ? "post" : mod.id === "exercise" ? "main" : "";
        if (!id) return;
        (mod.videos || []).forEach(function (video) {
          if (video.key) map["k:" + video.key] = id;
          if (video.src) map["s:" + String(video.src).split("?")[0]] = id;
          if (video.title) map["t:" + video.title] = id;
        });
      });
    });
    player.phaseMap = map;
    return map;
  }

  function phaseKeyForClip(clip) {
    var staged = clipPhase(clip);
    if (staged) return staged;
    var map = catalogPhaseMap();
    var key = clipMediaKey(clip);
    if (key && map["k:" + key]) return map["k:" + key];
    var src = clip && clip.src ? String(clip.src).split("?")[0] : "";
    if (src && map["s:" + src]) return map["s:" + src];
    var title = tidyClipTitle(clip && clip.title);
    if (title && map["t:" + title]) return map["t:" + title];
    return "";
  }

  function phaseTagText() {
    var clips = player.clips || [];
    var labels = { pre: "Pre", main: "Main", post: "Post" };
    var counts = { pre: 0, main: 0, post: 0 };
    var here = { pre: 0, main: 0, post: 0 };
    var keys = clips.map(phaseKeyForClip);
    keys.forEach(function (key, index) {
      if (!counts.hasOwnProperty(key)) return;
      counts[key] += 1;
      if (index === player.index) here[key] = counts[key];
    });
    var current = keys[player.index] || "";
    if (!current || !counts[current]) return "";
    return labels[current] + " " + here[current] + "/" + counts[current];
  }

  function ensurePhaseTag() {
    var stage = playerStage();
    if (!stage) return null;
    var el = $("phase-tag");
    if (el) return el;
    el = document.createElement("p");
    el.id = "phase-tag";
    el.className = "phase-tag is-phase-idle";
    el.setAttribute("aria-hidden", "true");
    stage.appendChild(el);
    return el;
  }

  function showPhaseTag() {
    var el = ensurePhaseTag();
    if (!el) return;
    var text = phaseTagText();
    el.textContent = text;
    if (player.phaseTimer) clearTimeout(player.phaseTimer);
    player.phaseTimer = null;
    if (!text) {
      el.classList.add("is-phase-idle");
      el.setAttribute("aria-hidden", "true");
      return;
    }
    el.classList.remove("is-phase-idle");
    el.setAttribute("aria-hidden", "false");
    player.phaseTimer = setTimeout(function () {
      el.classList.add("is-phase-idle");
      el.setAttribute("aria-hidden", "true");
    }, PHASE_TAG_MS);
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
    if (chromeMustStay()) {
      if (stage) stage.classList.remove("is-chrome-idle");
      player.hudTimer = setTimeout(function () { hidePlayerHud(false); }, HUD_IDLE_MS);
      return;
    }
    if (instant && hud) hud.classList.add("is-hud-instant");
    if (stage) {
      stage.classList.add("is-hud-idle");
      stage.classList.add("is-chrome-idle");
    }
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

  function cuePanelTarget(node) {
    return !!(node && node.closest && node.closest("#forensic-dock, .forensic-dock, #forensic-tab, #cue-lip, #cue-stage1"));
  }

  function onStageHudPointerDown(event) {
    if (!event || event.button > 0 || event.isPrimary === false) return;
    var node = eventElement(event);
    if (cuePanelTarget(node) || isForensicChrome(node)) return;
    if (node && node.closest && node.closest(".px-hit, .px-sheet, input, textarea, select, button")) return;
    if (isHudChromeTarget(node)) {
      showPlayerHud();
      return;
    }
    if (!node || !node.closest || (!node.closest(".deck-video") && !node.closest(".video-hit"))) return;
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
    if (cuePanelTarget(eventElement(event))) return;
    var dx = event.clientX - startX;
    var dy = event.clientY - startY;
    var edge = startX < 28 || startX > window.innerWidth - 28;
    var node = eventElement(event);
    if (!edge && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) {
      player.swallowSurface = true;
      advance(dx < 0 ? 1 : -1, dx < 0 ? "next" : "prev");
      return;
    }
    if (moved) return;
    var stageNow = playerStage();
    if (stageNow && (player.cueLevel | 0) > 0 && node && node.closest && (node.closest(".video-hit") || node.closest(".deck-video"))) {
      player.swallowSurface = true;
      setCueLevel(0);
      return;
    }
    if (isForensicChrome(node) || isHudChromeTarget(node)) return;
    if (node && node.closest && node.closest("input, textarea, select")) return;
    player.swallowSurface = true;
    if (stageNow && stageNow.classList.contains("is-chrome-idle")) {
      showPlayerHud();
      return;
    }
    togglePlayPause();
    showPlayerHud();
  }

  function onStageHudClickCapture(event) {
    if (player.swallowSurface) {
      player.swallowSurface = false;
      if (!isHudChromeTarget(eventElement(event))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
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

  function clipSavedSeconds() {
    var fallback = SET_DURATION_SEC;
    if (!window.NexusPlay || !window.NexusPlay.readTimer) return fallback;
    var saved = window.NexusPlay.readTimer(currentPlayTokens());
    if (!(saved >= 1) || saved > 7200) return fallback;
    return saved | 0;
  }

  function rememberClipSeconds(seconds) {
    player.clipSeconds = seconds | 0;
    if (window.NexusPlay && window.NexusPlay.writeTimer) {
      window.NexusPlay.writeTimer(currentPlayTokens(), player.clipSeconds);
    }
  }

  function beginClipClock() {
    armClock(Math.max(1000, (clipSavedSeconds() | 0) * 1000));
    player.clipSeconds = Math.round((player.pendingClockMs || (player.remaining * 1000) || SET_DURATION_SEC * 1000) / 1000);
    paintTimer();
  }

  function applyDurationOverride(minutes) {
    var mins = minutes | 0;
    if (SET_MODIFIER_MINUTES.indexOf(mins) === -1) return;
    var next = mins * 60;
    rememberClipSeconds(next);
    player.remaining = next;
    player.pendingClockMs = next * 1000;
    if (player.armed && !player.paused && frontIsPlaying()) {
      player.pendingClockMs = 0;
      player.setEndsAt = Date.now() + (next * 1000);
      syncRemaining();
    } else {
      player.setEndsAt = 0;
    }
    paintTimer();
    ensureClock();
    dismissTimerMods();
    showPlayerHud();
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
      player.pendingClockMs = (player.remaining | 0) * 1000;
    }
    rememberClipSeconds(Math.max(1, player.remaining | 0));
    paintTimer();
    ensureClock();
    dismissTimerMods();
    showPlayerHud();
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

  function frontIsPlaying() {
    var video = frontVideo();
    var stage = playerStage();
    if (!video || !stage || video.parentNode !== stage) return false;
    if (video.paused || video.ended || video.readyState < 2) return false;
    return true;
  }

  function releaseDeferredClock() {
    if (!player.armed || player.paused || player.empty || player.setEndsAt) return;
    if (!frontIsPlaying()) return;
    var span = player.pendingClockMs || Math.max(1000, (player.remaining || SET_DURATION_SEC) * 1000);
    player.pendingClockMs = 0;
    player.setEndsAt = Date.now() + span;
    syncRemaining();
    paintTimer();
    ensureClock();
    showPlayerHud();
  }

  function armClock(ms) {
    var span = ms > 0 ? ms : (SET_DURATION_SEC * 1000);
    player.armed = true;
    if (!frontIsPlaying()) {
      player.pendingClockMs = span;
      player.setEndsAt = 0;
      player.remaining = Math.ceil(span / 1000);
      paintTimer();
      ensureClock();
      return;
    }
    player.pendingClockMs = 0;
    player.setEndsAt = Date.now() + span;
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
    if (player.clips.length && player.index < player.clips.length - 1) {
      advance(1, "next");
      return;
    }
    noteSetComplete();
    closePlayer();
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

  function tidyClipTitle(title) {
    return String(title || "Clip").replace(/\.mp4$/i, "").replace(/^\d+\.\s*/, "").trim() || "Clip";
  }

  function clipPhase(clip) {
    var stage = String((clip && clip.stage) || "");
    if (/pre/i.test(stage)) return "pre";
    if (/post/i.test(stage)) return "post";
    if (/exercise|main/i.test(stage)) return "main";
    return "";
  }

  function ensureCueLip() {
    var dock = $("forensic-dock");
    var tab = $("forensic-tab");
    if (!dock || !tab || $("cue-lip")) return;
    var lip = document.createElement("div");
    lip.id = "cue-lip";
    lip.className = "cue-lip";
    lip.innerHTML = '<div class="cue-lip-tags" id="cue-lip-tags"></div><p class="cue-lip-name" id="cue-lip-name"></p>';
    tab.insertAdjacentElement("afterend", lip);
  }

  function paintCueLip() {
    ensureCueLip();
    var tags = $("cue-lip-tags");
    var name = $("cue-lip-name");
    if (!tags || !name) return;
    var clips = player.clips || [];
    var clip = clips[player.index] || null;
    var labels = { pre: "Pre", main: "Main", post: "Post" };
    var counts = { pre: 0, main: 0, post: 0 };
    var here = { pre: 0, main: 0, post: 0 };
    var any = false;
    clips.forEach(function (item, index) {
      var key = clipPhase(item);
      if (!key) return;
      any = true;
      counts[key] += 1;
      if (index === player.index) here[key] = counts[key];
    });
    var current = clipPhase(clip);
    var html = "";
    ["pre", "main", "post"].forEach(function (key) {
      if (!any) return;
      var on = key === current;
      var text = labels[key];
      if (counts[key]) text += on ? " " + here[key] + "/" + counts[key] : " " + counts[key];
      html += '<span class="cue-tag' + (on ? " is-on" : "") + '">' + text + "</span>";
    });
    if (clips.length) html = '<span class="cue-tag cue-tag-pos">' + (player.index + 1) + "/" + clips.length + "</span>" + html;
    tags.innerHTML = html;
    if (!clip) name.textContent = player.cabin ? player.cabin + " · " + EMPTY_MSG : "";
    else name.textContent = tidyClipTitle(clip.title);
  }

  function paintClipLabel() {
    var el = $("relic-clip-label");
    if (el) el.textContent = "";
    if (!player.empty && player.clips.length) {
      var clip = player.clips[player.index];
      var lead = (clip && clip.stage) || (clip && clip.cabin) || player.cabin || "";
      if (el) el.setAttribute("data-stage", lead);
    }
    paintCueLip();
    paintForensic();
    showPhaseTag();
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
        applyFrontPrefs(video);
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

  function currentPlayTokens() {
    var clip = player.clips[player.index];
    if (!window.NexusPlay || !clip) return [];
    return window.NexusPlay.tokensFor(clip.src, clip.r2Key || clipMediaKey(clip), 0);
  }

  function applyFrontPrefs(video) {
    if (!video || !window.NexusPlay) return;
    var tokens = currentPlayTokens();
    window.NexusPlay.apply(video, tokens);
    window.NexusPlay.setScheduleTokens(tokens);
  }

  function showClipLoading(on) {
    var stage = playerStage();
    if (stage) stage.classList.toggle("is-clip-loading", !!on);
  }

  function showTapPlay(on) {
    var btn = $("px-tap-play");
    if (btn) btn.hidden = !on;
    if (on) showClipLoading(false);
  }

  function clearPlayWatch() {
    if (player.playWatch) {
      clearTimeout(player.playWatch);
      player.playWatch = 0;
    }
  }

  function markClipPlaying(video) {
    player.playMark = performance.now();
    player.playTries = 0;
    showClipLoading(false);
    showTapPlay(false);
    releaseDeferredClock();
    if (video && video.parentNode !== playerStage()) {
      var stage = playerStage();
      if (stage) stageFront(video);
    }
  }

  function shouldHeal(video) {
    if (!video || player.paused || player.empty) return false;
    if (performance.now() - (player.playArmedAt || 0) < 400) return false;
    var clip = player.clips[player.index];
    if (!clip || (video.getAttribute("src") || "") !== clip.src) return false;
    if (!video.paused && video.readyState >= 2 && video.currentTime > 0.2) return false;
    return true;
  }

  function healClip(video) {
    if (!shouldHeal(video)) return;
    if ((player.playTries | 0) >= 2) {
      showTapPlay(true);
      return;
    }
    player.playTries = (player.playTries | 0) + 1;
    player.playArmedAt = performance.now();
    showTapPlay(false);
    showClipLoading(true);
    try {
      var stage = playerStage();
      if (stage && video.parentNode !== stage) stageFront(video);
      if (window.NexusPlay) applyFrontPrefs(video);
      video.load();
      var pending = video.play();
      if (pending && typeof pending.catch === "function") {
        pending.catch(function (err) {
          if (err && err.name === "NotAllowedError") showTapPlay(true);
        });
      }
    } catch (err) {
      showTapPlay(true);
    }
    armPlayWatch(video);
  }

  function armPlayWatch(video) {
    clearPlayWatch();
    var gen = player.generation;
    var started = performance.now();
    player.playMark = 0;
    player.playArmedAt = started;
    showClipLoading(true);
    player.playWatch = setTimeout(function () {
      if (gen !== player.generation || !video) return;
      var progressed = (player.playMark || 0) > started;
      var playing = frontIsPlaying() && video.currentTime > 0.05;
      if (progressed || playing) {
        showClipLoading(false);
        showTapPlay(false);
        releaseDeferredClock();
        return;
      }
      healClip(video);
    }, 2000);
  }

  function playFront(video) {
    if (!video) return;
    var stage = playerStage();
    if (stage && video.parentNode !== stage) stageFront(video);
    player.playTries = 0;
    showTapPlay(false);
    showClipLoading(true);
    if (window.NexusPlay) applyFrontPrefs(video);
    else {
      video.muted = false;
      video.defaultMuted = false;
      video.removeAttribute("muted");
    }
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
        markClipPlaying(video);
        preloadNext();
      }).catch(function (err) {
        if (player.playToken !== token) return;
        if (err && err.name === "AbortError") return;
        if (err && err.name === "NotAllowedError") {
          player.playTries = 2;
          showTapPlay(true);
          paintPlayButton();
          return;
        }
        healClip(video);
        paintPlayButton();
      });
    }
    armPlayWatch(video);
  }

  function promote(video, shouldPlay) {
    if (!video) return;
    var wasWaiting = !!player.awaitingReveal;
    stageFront(video);
    video.classList.add("is-frame-ready");
    var root = $("relic-player");
    if (root) {
      root.classList.remove("is-awaiting-frame");
      if (!root.hidden) root.setAttribute("aria-hidden", "false");
    }
    player.awaitingReveal = false;
    stopFlushWatch();
    if (wasWaiting) showPlayerHud();
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
      if (video.currentTime > 0.05) markClipPlaying(video);
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
      if (video === frontVideo()) {
        var stageNow = playerStage();
        if (stageNow && video.parentNode !== stageNow && bufferReady(video, src)) {
          promote(video, !player.paused && !player.empty);
        }
        setMediaNote(player.unavailable);
      }
    }, { signal: signal });
    video.addEventListener("playing", function () {
      if (!live() || video !== frontVideo()) return;
      var stageLive = playerStage();
      if (stageLive && video.parentNode !== stageLive) stageFront(video);
      player.phaseState = "playing";
      player.progressAt = performance.now();
      noteMediaProgress(video);
      markClipPlaying(video);
      if (video.videoWidth) revealActiveFrame();
      preloadNext();
    }, { signal: signal });
    video.addEventListener("stalled", function () {
      if (!live() || video !== frontVideo()) return;
      if (performance.now() - (player.playArmedAt || 0) < 2000) return;
      healClip(video);
    }, { signal: signal });
    video.addEventListener("emptied", function () {
      if (!live() || video !== frontVideo()) return;
      healClip(video);
    }, { signal: signal });
    video.addEventListener("error", function () {
      if (!live() || video !== frontVideo()) return;
      healClip(video);
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
    if (manual && (delta | 0) < 0 && player.index <= 0) return false;
    if (manual && (delta | 0) > 0 && player.index >= player.clips.length - 1) {
      player.lastManualAt = now;
      closePlayer();
      return false;
    }
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
    if (manual) beginClipClock();
    if (!manual) {
      var durationMs = Math.max(1000, (SET_DURATION_SEC | 0) * 1000);
      var nextMs = reason === "reconcile" && leftoverMs > 0 ? leftoverMs : durationMs;
      if (reason === "timer") nextMs = Math.max(1000, (clipSavedSeconds() | 0) * 1000);
      armClock(nextMs);
    }
    player.phaseState = player.unavailable ? "playing" : "loading";
    var front = frontVideo();
    if (front && !front.paused && !player.unavailable) player.phaseState = "playing";
    paintPlayButton();
    paintMediaSession();
    preloadNext();
    showPlayerHud();
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
        applyFrontPrefs(video);
        var pending = video.play();
        if (pending && typeof pending.catch === "function") pending.catch(function () {});
      }
      preloadNext();
      return;
    }
    if (player.clips.length && player.index < player.clips.length - 1) {
      advance(1, "next");
      return;
    }
    noteSetComplete();
    closePlayer();
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
    setCueLevel(0);
    beginClipClock();
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
        applyFrontPrefs(video);
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
    showPlayerHud();
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

  function openCatalogClip(clip) {
    if (!clip || !clip.src || isBlockedMediaUrl(clip.src)) return;
    setNavOpen(false);
    player.credit = null;
    player.cabin = clip.cabin || "";
    player.phase = "Base";
    player.index = 0;
    player.clips = [{ title: clip.title || "Clip", src: String(clip.src) }];
    player.generation = (player.generation | 0) + 1;
    player.phaseState = "loading";
    player.unavailable = false;
    player.stallReloaded = false;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* new clip */ }
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

  function openCatalogPlaylist(clips) {
    var list = [];
    (clips || []).forEach(function (clip) {
      if (!clip || !clip.src || isBlockedMediaUrl(clip.src)) return;
      list.push({
        title: clip.title || "Clip",
        src: String(clip.src),
        cabin: clip.cabin || "",
        stage: String(clip.stage || "").trim(),
        r2Key: clip.r2Key || "",
        id: clip.id || ""
      });
    });
    if (!list.length) return;
    setNavOpen(false);
    player.credit = null;
    player.cabin = list[0].cabin || "";
    player.phase = "Base";
    player.index = 0;
    player.clips = list;
    player.generation = (player.generation | 0) + 1;
    player.phaseState = "loading";
    player.unavailable = false;
    player.stallReloaded = false;
    if (player.clipAbort) {
      try { player.clipAbort.abort(); } catch (err) { /* new list */ }
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
    function openAccount(view) {
      state.accountView = view || "tiles";
      showAccountView();
    }
    window.RelicArchitectOpenAccount = openAccount;
    ["account-open-info", "account-open-weight", "account-open-stats"].forEach(function (id) {
      var tile = $(id);
      if (!tile) return;
      tile.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openAccount(id === "account-open-info" ? "info" : id === "account-open-weight" ? "weight" : "stats");
      });
    });
    document.querySelectorAll("[data-account-back]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openAccount("tiles");
      });
    });
    var hubLock = $("hub-lock");
    if (hubLock) hubLock.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setFutureLock(!state.futureLock);
    });
    var futureLockBtn = $("btn-future-lock");
    if (futureLockBtn) {
      futureLockBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        setFutureLock(!state.futureLock);
      });
    }
    document.querySelectorAll("[data-hub-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.hubTab = tab.getAttribute("data-hub-tab") || "schedules";
        if (state.hubTab !== "food") state.hubTab = "schedules";
        writeHubTab(state.hubTab);
        paintHub();
      });
      tab.addEventListener("keydown", function (event) {
        var order = ["schedules", "food"];
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
        writeHubTab(state.hubTab);
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
          state.osDoor = "account";
          state.accountView = "tiles";
          setNavOpen(false);
          render();
          return;
        }
        if (name === "hub") {
          state.osDoor = "hub";
          setNavOpen(false);
          render();
          return;
        }
        if (name === "food" || name === "smoothies" || name === "porridge" || name === "cards") {
          state.osDoor = name;
          setNavOpen(false);
          render();
          return;
        }
        if (name !== "training") return;
        setNavOpen(false);
        openTrainingDoor();
      });
    });
    var forensicTab = $("forensic-tab");
    var forensicPanel = $("forensic-panel");
    var forensicDock = $("forensic-dock");
    var forensicScroll = $("forensic-scroll");
    if (forensicScroll) forensicScroll.tabIndex = 0;
    if (forensicDock) {
      forensicDock.addEventListener("pointerdown", stopForensicEvent);
      forensicDock.addEventListener("click", stopForensicEvent);
    }
    var cueGesture = null;
    function cueDelta(event) {
      if (!cueGesture || event.pointerId !== cueGesture.id) return null;
      return {
        dx: event.clientX - cueGesture.x,
        dy: event.clientY - cueGesture.y,
        dt: Date.now() - cueGesture.t
      };
    }
    function cueDragHandle(node) {
      if (!node || !node.closest) return false;
      if (node.closest("#forensic-scroll, input, textarea, select, a")) return false;
      if (node.closest("#cue-stage1, .px-hit, .px-mute, .px-rate")) return false;
      return !!node.closest("#forensic-tab, #cue-lip");
    }
    function cueFollow(dy) {
      if (!cueGesture) return;
      var stage = playerStage();
      player.cueDrag = true;
      if (stage) stage.classList.add("is-cue-dragging");
      placeSheet(cueGesture.shift + dy, false);
    }
    function cueReleaseFollow() {
      var stage = playerStage();
      player.cueDrag = false;
      if (stage) stage.classList.remove("is-cue-dragging");
      var closed = sheetClosedY();
      setCueLevel(currentSheetY() < closed * 0.5 ? 1 : 0);
    }
    function finishCueDrag(id, x, y, event) {
      var delta = cueDelta({ pointerId: id, clientX: x, clientY: y });
      var fromTab = !!(cueGesture && cueGesture.tab);
      cueGesture = null;
      if (event) event.stopPropagation();
      var stage = playerStage();
      player.cueDrag = false;
      if (stage) stage.classList.remove("is-cue-dragging");
      if (!delta) return;
      if (event && event.cancelable && (Math.abs(delta.dy) > 8 || Math.abs(delta.dx) > 8)) event.preventDefault();
      var from = player.cueLevel || 0;
      var speed = delta.dy / Math.max(16, delta.dt);
      var vertical = Math.abs(delta.dy) >= Math.abs(delta.dx);
      var tap = fromTab && Math.abs(delta.dy) < 12 && Math.abs(delta.dx) < 12;
      var up = vertical && (delta.dy < -28 || speed < -0.45);
      var down = vertical && (delta.dy > 28 || speed > 0.45);
      var next = from;
      if (tap) next = from ? 0 : 1;
      else if (up) next = 1;
      else if (down) next = 0;
      else next = currentSheetY() < sheetClosedY() * 0.5 ? 1 : 0;
      setCueLevel(next);
    }
    if (forensicDock) {
      var cueUsedPointer = false;
      forensicDock.addEventListener("pointerdown", function (event) {
        if (event.button > 0 || event.isPrimary === false) return;
        if (!cueDragHandle(event.target)) return;
        cueUsedPointer = true;
        player.cueSnap = (player.cueSnap || 0) + 1;
        var node = event.target;
        cueGesture = {
          x: event.clientX,
          y: event.clientY,
          t: Date.now(),
          id: event.pointerId,
          shift: currentSheetY(),
          tab: !!(node && node.closest && node.closest("#forensic-tab, #cue-lip"))
        };
        try { forensicDock.setPointerCapture(event.pointerId); } catch (err) { /* capture is optional */ }
        stopForensicEvent(event);
      });
      function cuePointerMove(event) {
        if (!cueGesture || event.pointerId !== cueGesture.id) return;
        var dy = event.clientY - cueGesture.y;
        var dx = event.clientX - cueGesture.x;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dy) < 8) return;
        if (event.cancelable) event.preventDefault();
        cueFollow(dy);
      }
      function cuePointerUp(event) {
        if (!cueGesture || event.pointerId !== cueGesture.id) return;
        finishCueDrag(event.pointerId, event.clientX, event.clientY, event);
        cueUsedPointer = false;
      }
      forensicDock.addEventListener("pointermove", cuePointerMove);
      document.addEventListener("pointermove", cuePointerMove);
      forensicDock.addEventListener("pointerup", cuePointerUp);
      document.addEventListener("pointerup", cuePointerUp);
      forensicDock.addEventListener("pointercancel", function () {
        cueGesture = null;
        cueReleaseFollow();
        cueUsedPointer = false;
      });
      forensicDock.addEventListener("touchstart", function (event) {
        event.stopPropagation();
        if (cueUsedPointer || !event.changedTouches || event.changedTouches.length !== 1) return;
        var touch = event.changedTouches[0];
        if (!cueDragHandle(event.target)) return;
        var touchNode = event.target;
        cueGesture = {
          x: touch.clientX,
          y: touch.clientY,
          t: Date.now(),
          id: "touch",
          shift: currentSheetY(),
          tab: !!(touchNode && touchNode.closest && touchNode.closest("#forensic-tab, #cue-lip"))
        };
        if (event.cancelable) event.preventDefault();
      }, { passive: false });
      forensicDock.addEventListener("touchmove", function (event) {
        event.stopPropagation();
        if (player.cueDrag && event.cancelable) event.preventDefault();
        if (cueUsedPointer || !cueGesture || cueGesture.id !== "touch" || !event.changedTouches) return;
        var touch = event.changedTouches[0];
        if (event.cancelable) event.preventDefault();
        cueFollow(touch.clientY - cueGesture.y);
      }, { passive: false });
      forensicDock.addEventListener("touchend", function (event) {
        event.stopPropagation();
        if (cueUsedPointer || !event.changedTouches || !event.changedTouches.length) return;
        var touch = event.changedTouches[0];
        finishCueDrag("touch", touch.clientX, touch.clientY, event);
      }, { passive: false });
    }
    if (forensicTab) {
      forensicTab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
      forensicTab.addEventListener("keydown", function (event) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setCueLevel((player.cueLevel || 0) + 1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          setCueLevel((player.cueLevel || 0) - 1);
        }
      });
    }
    if (forensicPanel) {
      forensicPanel.addEventListener("pointerdown", stopForensicEvent);
      forensicPanel.addEventListener("click", stopForensicEvent);
    }
    document.addEventListener("touchmove", function (event) {
      if (!player.cueDrag || !event.cancelable) return;
      event.preventDefault();
    }, { passive: false });
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
    if (stage && window.NexusPlay) {
      var closeBtn = $("relic-player-close");
      var timerDock = $("relic-timer-dock");
      if (closeBtn) stage.appendChild(closeBtn);
      if (timerDock) stage.appendChild(timerDock);
      var hit = document.createElement("div");
      hit.className = "video-hit";
      hit.setAttribute("aria-hidden", "true");
      stage.appendChild(hit);
      ensureCueStage1();
      var spin = document.createElement("div");
      spin.className = "px-spin";
      spin.setAttribute("aria-hidden", "true");
      stage.appendChild(spin);
      var tap = document.createElement("button");
      tap.type = "button";
      tap.id = "px-tap-play";
      tap.className = "px-tap-play";
      tap.textContent = "Tap to play";
      tap.hidden = true;
      tap.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var video = frontVideo();
        if (!video) return;
        player.paused = false;
        player.playTries = 0;
        if (video.parentNode !== stage) stageFront(video);
        if (window.NexusPlay) applyFrontPrefs(video);
        showTapPlay(false);
        showClipLoading(true);
        var pending = video.play();
        if (pending && typeof pending.then === "function") {
          pending.then(function () { markClipPlaying(video); }).catch(function () { showTapPlay(true); });
        }
      });
      stage.appendChild(tap);
    }
    if (stage) {
      stage.addEventListener("pointerdown", onStageHudPointerDown);
      stage.addEventListener("pointermove", onStageHudPointerMove);
      stage.addEventListener("pointerup", onStageHudPointerUp);
      stage.addEventListener("pointercancel", function () { hudGesture = null; });
      stage.addEventListener("click", onStageHudClickCapture, true);
    }
    document.addEventListener("pointerdown", function (event) {
      var calm = event.target.closest(".mbtn, .wtab, .mode-choice, [data-set-mode], [data-set-branch]");
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
      if (!event.target.closest(".mbtn, .wtab, .mode-choice, [data-set-mode], [data-set-branch]")) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    document.addEventListener("click", function () {
      if (surfacePress && surfacePress.moved) surfacePress = null;
    });
    var transport = document.querySelector("#relic-player .player-controls");
    if (transport && transport.parentNode) transport.parentNode.removeChild(transport);

    var timerBadge = $("relic-set-timer");
    if (timerBadge) {
      timerBadge.addEventListener("click", function (event) {
        event.stopPropagation();
        showPlayerHud();
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
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && tickLoadFailed) pullCompletions().then(render);
    });
    window.addEventListener("focus", function () {
      if (tickLoadFailed) pullCompletions().then(render);
    });
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

    window.repaintCueSheet = function () {
      var root = $("relic-player");
      if (!root || root.hidden || !(player.cueLevel > 0)) return;
      paintForensic();
    };
    window.playNextVideo = playNextVideo;
  window.RelicArchitect = {
    version: "2.0",
    build: "v94",
    planFocusDate: planFocusDate,
    openAccount: function (view) {
      if (window.RelicArchitectOpenAccount) window.RelicArchitectOpenAccount(view);
    },
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
      var btn = $("btn-future-lock");
      return !!(btn && state.osDoor === "training" && btn.hidden !== true);
    },
    get setSeconds() { return SET_DURATION_SEC; },
    get SET_DURATION_SEC() { return SET_DURATION_SEC; },
    get remaining() { return player.remaining; },
    resolveClipSrc: resolveClipSrc,
    openCabin: openCabin,
    openCatalogClip: openCatalogClip,
    openCatalogPlaylist: openCatalogPlaylist,
    refresh: render,
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
