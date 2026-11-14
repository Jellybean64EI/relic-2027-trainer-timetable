/* On-device mute and speed, remembered per permanent video id or media key. */
window.NexusPlay = (function () {
  var STORE = "nexus-play-v78";
  var STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
  var cabinTokens = [];
  var scheduleTokens = [];

  function keyFromSrc(src) {
    var match = String(src || "").match(/r2\.dev\/([^?#]+)/) || String(src || "").match(/\/v\/([^?#]+)/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch (err) { return match[1]; }
  }

  function tokensFor(src, r2Key, videoId) {
    var key = r2Key || keyFromSrc(src);
    var row = window.NexusCards && window.NexusCards.identityByKey && key ? window.NexusCards.identityByKey(key) : null;
    var idNum = Number(videoId) || (row && Number(row.videoId)) || 0;
    var tokens = [];
    if (idNum >= 10001) tokens.push("id:" + idNum);
    if (key) tokens.push("key:" + key);
    return tokens;
  }

  function loadMap() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return {};
      var data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (err) {
      return null;
    }
  }

  function stepRate(rate) {
    var n = Number(rate);
    var i;
    for (i = 0; i < STEPS.length; i++) {
      if (Math.abs(STEPS[i] - n) < 0.001) return STEPS[i];
    }
    return null;
  }

  function read(tokens) {
    var map = loadMap();
    var found = null;
    if (map) {
      (tokens || []).forEach(function (token) {
        if (!found && map[token]) found = map[token];
      });
    }
    var step = found ? stepRate(found.rate) : null;
    if (!found || step == null) {
      return { muted: !!(found && found.muted), rate: 1, cycled: false };
    }
    return { muted: !!found.muted, rate: step, cycled: !!found.cycled };
  }

  function nextRate(pref) {
    if (!pref || (!pref.cycled && pref.rate === 1)) return 0.5;
    var i;
    for (i = 0; i < STEPS.length; i++) {
      if (STEPS[i] === pref.rate) return STEPS[(i + 1) % STEPS.length];
    }
    return 0.5;
  }

  function rateLabel(rate) {
    return rate === 1 ? "Normal" : rate.toFixed(1) + "x";
  }

  function write(tokens, patch) {
    var list = tokens || [];
    if (!list.length) return false;
    var map = loadMap();
    if (!map) return false;
    var current = read(list);
    var chosen = patch.rate == null ? current.rate : stepRate(patch.rate);
    var keptSeconds = null;
    list.forEach(function (token) {
      if (keptSeconds == null && map[token] && map[token].seconds >= 1) keptSeconds = map[token].seconds | 0;
    });
    var next = {
      muted: patch.muted == null ? current.muted : !!patch.muted,
      rate: chosen == null ? 1 : chosen,
      cycled: patch.cycled == null ? (chosen == null ? false : current.cycled) : !!patch.cycled,
      seconds: patch.seconds == null ? keptSeconds : (patch.seconds | 0)
    };
    if (!(next.seconds >= 1)) delete next.seconds;
    list.forEach(function (token) { map[token] = next; });
    try {
      localStorage.setItem(STORE, JSON.stringify(map));
      return true;
    } catch (err) {
      return false;
    }
  }

  function apply(video, tokens) {
    if (!video) return read(tokens);
    var pref = read(tokens);
    video.muted = pref.muted;
    video.defaultMuted = pref.muted;
    if (pref.muted) video.setAttribute("muted", "");
    else video.removeAttribute("muted");
    try { video.playbackRate = pref.rate; } catch (err) { /* rate is optional */ }
    return pref;
  }

  function activeTokens() {
    var schedule = document.getElementById("relic-player");
    if (schedule && !schedule.hidden) return scheduleTokens;
    var quick = document.getElementById("vc-quick");
    if (quick && !quick.hidden) return cabinTokens;
    return scheduleTokens.length ? scheduleTokens : cabinTokens;
  }

  function liveVideo() {
    var schedule = document.getElementById("relic-player");
    if (schedule && !schedule.hidden) {
      return document.querySelector(".player-stage .deck-video.is-front") || document.getElementById("relic-active-video");
    }
    var quick = document.getElementById("vc-quick");
    if (quick && !quick.hidden) return document.getElementById("vc-quick-video");
    return null;
  }

  function paintButtons(pref) {
    document.querySelectorAll(".px-mute").forEach(function (btn) {
      var on = !pref.muted;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.innerHTML = '<span aria-hidden="true">' + (on ? "🔈" : "🔇") + "</span> " + (on ? "On" : "Off");
      btn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
    });
    document.querySelectorAll(".px-rate").forEach(function (btn) {
      var label = rateLabel(pref.rate);
      btn.innerHTML = '<span class="px-gauge" aria-hidden="true"></span><span class="px-speed-read">' + label + "</span>";
      btn.setAttribute("aria-label", "Playback speed " + label);
    });
  }

  function readTimer(tokens) {
    var map = loadMap();
    if (!map) return 0;
    var i;
    var row;
    for (i = 0; i < (tokens || []).length; i++) {
      row = map[tokens[i]];
      if (row && row.seconds >= 1) return row.seconds | 0;
    }
    return 0;
  }

  function writeTimer(tokens, seconds) {
    return write(tokens || [], { seconds: seconds | 0 });
  }

  function sync(tokens) {
    paintButtons(read(tokens || activeTokens()));
  }

  function toggleMute(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var tokens = activeTokens();
    var video = liveVideo();
    var next = !(video ? video.muted : read(tokens).muted);
    write(tokens, { muted: next });
    if (video) {
      video.muted = next;
      video.defaultMuted = next;
      if (next) video.setAttribute("muted", "");
      else video.removeAttribute("muted");
    }
    sync(tokens);
  }

  function cycleRate(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var tokens = activeTokens();
    var next = nextRate(read(tokens));
    write(tokens, { rate: next, cycled: true });
    var video = liveVideo();
    if (video) {
      try { video.playbackRate = next; } catch (err) { /* keep the saved choice */ }
    }
    sync(tokens);
  }

  function button(className, label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = className + " px-hit";
    btn.textContent = label;
    return btn;
  }

  function mountPair(host, muteId) {
    if (!host || host.querySelector(".px-mute")) return;
    var mute = button("px-mute", "🔈 On");
    if (muteId) mute.id = muteId;
    mute.addEventListener("click", toggleMute);
    var rate = button("px-rate", "Normal");
    rate.addEventListener("click", cycleRate);
    host.appendChild(mute);
    host.appendChild(rate);
  }

  function setScheduleTokens(tokens) {
    scheduleTokens = tokens || [];
    sync(scheduleTokens);
  }

  function setCabinTokens(tokens) {
    cabinTokens = tokens || [];
    sync(cabinTokens);
  }

  return {
    STEPS: STEPS,
    tokensFor: tokensFor,
    read: read,
    write: write,
    apply: apply,
    nextRate: nextRate,
    readTimer: readTimer,
    writeTimer: writeTimer,
    sync: sync,
    toggleMute: toggleMute,
    cycleRate: cycleRate,
    mountPair: mountPair,
    setScheduleTokens: setScheduleTokens,
    setCabinTokens: setCabinTokens
  };
})();

if (typeof document !== "undefined") {
  var mountCabinChrome = function () {
    var host = document.getElementById("vc-px-corners");
    if (host) window.NexusPlay.mountPair(host, "vc-px-mute");
  };
  function hardenVideos() {
    document.querySelectorAll("video").forEach(function (video) {
      video.setAttribute("controlsList", "nodownload");
      video.disablePictureInPicture = true;
      video.setAttribute("disablepictureinpicture", "");
      if (video.dataset.nexusNoMenu) return;
      video.dataset.nexusNoMenu = "1";
      video.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mountCabinChrome(); hardenVideos(); });
  } else {
    mountCabinChrome();
    hardenVideos();
  }
}
