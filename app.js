/* Relic Architect V2.0 — timetable, Supabase completions, HTML5 cabin player.
   Playback is Supabase Storage only. Drive iframes, previews, and embeddedfolderview are refused.
   Completions upsert relic_completions. localStorage is not the source of truth. */
(function () {
  "use strict";

  var S = window.RELIC_SCHEDULE;
  var C = window.RELIC_CITATIONS;
  var TZ = "Europe/London";
  var SET_DURATION_SEC = 1200;
  var SET_MODIFIER_MINUTES = [2, 5, 10, 20];
  var EMPTY_MSG = "No video file IDs mapped for this cabin.";

  var state = {
    now: null,
    viewMonth: 1,
    viewWeek: 1,
    userPicked: false,
    coachOverride: null,
    completes: {},
    loaded: false,
    syncNote: "Loading completions from Supabase…",
    syncError: false,
    saveGen: {}
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
    historyPushed: false
  };

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

  function canTick(dateKey, parts) {
    if (!isLive(parts)) return true;
    return dateKey <= parts.dateKey;
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

  function setSync(note, isError) {
    state.syncNote = note;
    state.syncError = !!isError;
    var el = $("sync-status");
    if (!el) return;
    el.textContent = note;
    el.classList.toggle("is-error", !!isError);
  }

  function pullCompletions() {
    var cfg = supabaseCfg();
    if (!cfg.url || !cfg.anonKey) {
      state.loaded = true;
      setSync("Supabase config missing — ticks cannot sync.", true);
      return Promise.resolve();
    }
    return fetch(restUrl("/rest/v1/relic_completions?select=date_key,completed"), {
      headers: restHeaders()
    }).then(function (response) {
      if (!response.ok) throw new Error("load " + response.status);
      return response.json();
    }).then(function (rows) {
      var next = {};
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row && row.date_key && row.completed) next[row.date_key] = true;
        });
      }
      state.completes = next;
      state.loaded = true;
      setSync("Synced · relic_completions", false);
    }).catch(function () {
      state.loaded = true;
      setSync("Could not load relic_completions. Check the connection and try again.", true);
    });
  }

  function upsertCompletion(dateKey, completed) {
    var cfg = supabaseCfg();
    if (!cfg.url || !cfg.anonKey) return Promise.resolve(false);
    return fetch(restUrl("/rest/v1/relic_completions?on_conflict=date_key"), {
      method: "POST",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify({
        date_key: dateKey,
        completed: !!completed,
        updated_at: new Date().toISOString()
      })
    }).then(function (response) {
      return response.ok;
    }).catch(function () {
      return false;
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

  function activeDaysForWeek(month, week) {
    return S.daysInWeekOfMonth(2027, month, week)
      .filter(function (day) { return !day.isRecovery && day.dayIndex < 6; })
      .sort(function (a, b) {
        if (a.dateKey < b.dateKey) return -1;
        if (a.dateKey > b.dateKey) return 1;
        return 0;
      });
  }

  function activeDaysForView() {
    return activeDaysForWeek(state.viewMonth, state.viewWeek);
  }

  /* Every Mon–Sat row in a week bucket. Weeks 1–3 are six days.
     Week 4 runs through month end, so it completes only when those extra days are done too.
     Sunday stays out. Completions come from the relic_completions mirror, never localStorage.
     Each week of the viewed month is scored on its own. The badge stays on every complete chip.
     Gold checkbox styling applies only to the week currently on screen. */
  var GOLD_WEEK_BADGE = "Gold Week Complete Badge";

  function weekIsGolden(days) {
    if (!days || days.length < 6) return false;
    for (var i = 0; i < days.length; i++) {
      if (!state.completes[days[i].dateKey]) return false;
    }
    return true;
  }

  function applyGoldenLock(viewedDays) {
    var viewedGolden = weekIsGolden(viewedDays);
    var card = $("relic-card");
    if (card) {
      card.classList.toggle("is-golden-week", viewedGolden);
      card.setAttribute("data-golden-week", viewedGolden ? "true" : "false");
    }
    document.querySelectorAll(".wtab").forEach(function (btn) {
      var week = +btn.getAttribute("data-week");
      var days = week === state.viewWeek ? viewedDays : activeDaysForWeek(state.viewMonth, week);
      var complete = weekIsGolden(days);
      btn.classList.toggle("is-golden", complete);
      var badge = btn.querySelector(".golden-lock");
      if (!badge) return;
      badge.textContent = GOLD_WEEK_BADGE;
      badge.setAttribute("aria-label", GOLD_WEEK_BADGE);
      badge.hidden = !complete;
    });
    document.querySelectorAll("#tt-body .tick-hit").forEach(function (hit) {
      hit.classList.toggle("is-golden", viewedGolden);
      var input = hit.querySelector("input.tick");
      if (!input) return;
      var dateKey = input.getAttribute("data-date") || "";
      input.setAttribute("aria-label", viewedGolden
        ? "Completed " + dateKey + ", " + GOLD_WEEK_BADGE
        : "Completed " + dateKey);
    });
  }

  function doneHtml(day, parts) {
    if (!canTick(day.dateKey, parts)) {
      return '<td class="done-cell"><span class="lock-badge">LOCKED</span></td>';
    }
    var checked = state.completes[day.dateKey] ? " checked" : "";
    return (
      '<td class="done-cell"><label class="tick-hit">' +
      '<input type="checkbox" class="tick" data-date="' + day.dateKey + '"' + checked +
      ' aria-label="Completed ' + day.dateKey + '" />' +
      '<span class="tick-box" aria-hidden="true"></span>' +
      "</label></td>"
    );
  }

  function render() {
    if (!S) return;
    state.now = getNow();
    var parts = londonParts(state.now);
    var preview = !isLive(parts);

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
    var meta = S.MONTH_META[state.viewMonth] || { phaseLine: phase.label, blurb: "" };
    var card = $("relic-card");
    card.setAttribute("data-month", String(state.viewMonth));
    card.setAttribute("data-phase", phase.suffix);
    document.body.setAttribute("data-month", String(state.viewMonth));
    document.body.setAttribute("data-phase", phase.suffix);

    $("banner-preview").hidden = !preview;
    $("banner-live").hidden = preview;
    var coach = $("banner-coach");
    if (state.coachOverride) {
      coach.hidden = false;
      coach.textContent = "COACH OVERRIDE · ?date=" + state.coachOverride + " · Europe/London";
    } else {
      coach.hidden = true;
    }

    var phaseShort = String(meta.phaseLine || phase.label).replace(/^PHASE:\s*/i, "");
    $("identity-line").textContent =
      S.MONTH_NAMES[state.viewMonth] + " · WEEK " + state.viewWeek + " OF 4 · " + phaseShort;
    $("month-blurb").textContent = meta.blurb || "";
    $("deload-hint").hidden = state.viewWeek !== 4;
    $("meta-today").innerHTML = "TODAY <strong>" + parts.dateKey + "</strong> · " + parts.weekday;
    $("meta-mode").textContent = preview
      ? "PREVIEW · live 1 Jan 2027"
      : "LIVE · " + parts.dateKey;

    document.querySelectorAll(".phase").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-phase") === phase.suffix);
    });
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      var month = +btn.getAttribute("data-month");
      btn.classList.toggle("is-selected", month === state.viewMonth);
      btn.classList.toggle("is-live", !preview && parts.year === 2027 && month === parts.month);
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
      if (state.completes[day.dateKey]) classes.push("is-done");
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
    applyGoldenLock(weekDays);
  }

  function onTick(input) {
    var dateKey = input.getAttribute("data-date");
    var parts = londonParts(state.now || getNow());
    if (!dateKey || !canTick(dateKey, parts)) {
      input.checked = false;
      return;
    }
    var completed = !!input.checked;
    if (completed) state.completes[dateKey] = true;
    else delete state.completes[dateKey];
    var row = input.closest("tr");
    if (row) row.classList.toggle("is-done", completed);
    applyGoldenLock(activeDaysForView());

    var gen = (state.saveGen[dateKey] || 0) + 1;
    state.saveGen[dateKey] = gen;
    setSync("Saving " + dateKey + "…", false);
    upsertCompletion(dateKey, completed).then(function (ok) {
      if (state.saveGen[dateKey] !== gen) return;
      if (!ok) {
        if (completed) delete state.completes[dateKey];
        else state.completes[dateKey] = true;
        setSync("Could not save " + dateKey + " to relic_completions.", true);
        render();
        return;
      }
      setSync("Synced · relic_completions", false);
      applyGoldenLock(activeDaysForView());
    });
  }

  function pickMonth(month) {
    state.userPicked = true;
    state.viewMonth = month;
    var parts = londonParts(state.now || getNow());
    if (isLive(parts) && parts.year === 2027 && month === parts.month) {
      state.viewWeek = S.weekOfMonth(parts.day);
    } else {
      state.viewWeek = 1;
    }
    render();
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

  function assignVideoSrc(src) {
    var video = activeVideo();
    if (!video) return;
    var safe = src || "about:blank";
    if (safe !== "about:blank" && isBlockedMediaUrl(safe)) safe = "about:blank";
    video.autoplay = safe !== "about:blank";
    video.loop = safe !== "about:blank";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("loop", "");
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
    stopCountdown();
    player.remaining = SET_DURATION_SEC;
    paintTimer();
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
        /* A missing file must not freeze the 20-minute set. Only an autoplay block waits for a tap. */
        var blocked = err && err.name === "NotAllowedError";
        player.paused = !!blocked;
        setGate(!!blocked);
        paintPlayButton();
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
    setTimerModsOpen(false);
    stopCountdown();
    setTimerModsOpen(false);
    player.armed = false;
    player.paused = false;
    player.empty = false;
    player.clips = [];
    player.index = 0;
    player.cabin = null;
    setMediaNote(false);
    try {
      var video = activeVideo();
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (err) { /* closed */ }
    setEmptyOverlay(false);
    setGate(false);
    var root = $("relic-player");
    if (root) {
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

  function openCabin(cabinKey, phase) {
    if (!cabinKey) return;
    player.cabin = cabinKey;
    player.phase = phase || "Base";
    player.index = 0;
    player.clips = [];
    var archive = (window.RELIC_VIDEO_ARCHIVE && window.RELIC_VIDEO_ARCHIVE.cabins) || {};
    var cabin = archive[cabinKey];
    var raw = (cabin && cabin.playlist) || [];
    raw.forEach(function (clip) {
      if (!clip) return;
      var src = resolveClipSrc(cabinKey, clip);
      if (!src || isBlockedMediaUrl(src)) return;
      player.clips.push({
        title: clip.title || filenameFromTitle(clip.title) || "Clip",
        src: src
      });
    });

    var root = $("relic-player");
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("player-open");
    if (!player.historyPushed) {
      try {
        history.pushState({ relicPlayer: 1 }, "");
        player.historyPushed = true;
      } catch (err) { /* file:// may refuse */ }
    }

    if (!player.clips.length) {
      showEmptyFrame();
      $("relic-player-close").focus();
      return;
    }

    player.empty = false;
    player.paused = false;
    setEmptyOverlay(false);
    setGate(false);
    loadCurrentClip(true);
    startCountdown();
    paintPlayButton();
    $("relic-player-close").focus();
  }

  function wire() {
    document.querySelectorAll(".mbtn").forEach(function (btn) {
      btn.addEventListener("click", function () { pickMonth(+btn.getAttribute("data-month")); });
    });
    document.querySelectorAll(".wtab").forEach(function (btn) {
      btn.addEventListener("click", function () { pickWeek(+btn.getAttribute("data-week")); });
    });
    $("btn-today").addEventListener("click", function () {
      state.userPicked = false;
      render();
    });
    $("tt-body").addEventListener("change", function (event) {
      var input = event.target.closest("input.tick");
      if (!input) return;
      onTick(input);
    });
    $("tt-body").addEventListener("click", function (event) {
      var link = event.target.closest("a.cite-link");
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      openCabin(link.getAttribute("data-cabin"), link.getAttribute("data-phase") || "Base");
    });

    $("relic-player-close").addEventListener("click", closePlayer);
    $("relic-start-gate").addEventListener("click", togglePlayPause);
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
    });
    activeVideo().addEventListener("loadeddata", function () {
      setMediaNote(false);
    });

    document.addEventListener("keydown", function (event) {
      var root = $("relic-player");
      if (!root || root.hidden) return;
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
    get setSeconds() { return SET_DURATION_SEC; },
    get SET_DURATION_SEC() { return SET_DURATION_SEC; },
    get remaining() { return player.remaining; },
    resolveClipSrc: resolveClipSrc,
    openCabin: openCabin,
    playNextVideo: playNextVideo,
    applyDurationOverride: applyDurationOverride,
    applyAddMoreTime: applyAddMoreTime
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
