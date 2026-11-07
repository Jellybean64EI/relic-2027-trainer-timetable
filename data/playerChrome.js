/* On-device mute and speed, remembered per permanent video id or media key. */
window.NexusPlay = (function () {
  var STORE = "nexus-play-v78";
  var RATES = [0.5, 1, 1.5, 2];
  var cabinTokens = [];
  var scheduleTokens = [];
  var sheetOpen = false;

  function keyFromSrc(src) {
    var match = String(src || "").match(/r2\.dev\/([^?#]+)/);
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

  function normalRate(rate) {
    var n = Number(rate);
    return RATES.indexOf(n) === -1 ? 1 : n;
  }

  function read(tokens) {
    var map = loadMap();
    var found = null;
    if (map) {
      (tokens || []).forEach(function (token) {
        if (!found && map[token]) found = map[token];
      });
    }
    return {
      muted: !!(found && found.muted),
      rate: normalRate(found && found.rate)
    };
  }

  function write(tokens, patch) {
    var list = tokens || [];
    if (!list.length) return false;
    var map = loadMap();
    if (!map) return false;
    var current = read(list);
    var next = {
      muted: patch.muted == null ? current.muted : !!patch.muted,
      rate: patch.rate == null ? current.rate : normalRate(patch.rate)
    };
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
      var label = pref.rate === 1 ? "1x" : pref.rate + "x";
      btn.textContent = label;
      btn.setAttribute("aria-label", "Playback speed " + label);
    });
    document.querySelectorAll(".px-sheet [data-rate]").forEach(function (btn) {
      var on = Number(btn.getAttribute("data-rate")) === pref.rate;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", on);
    });
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

  function setRate(rate, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var tokens = activeTokens();
    var chosen = normalRate(rate);
    write(tokens, { rate: chosen });
    var video = liveVideo();
    if (video) {
      try { video.playbackRate = chosen; } catch (err) { /* keep the saved choice */ }
    }
    sync(tokens);
    closeSheet();
  }

  function ensureSheet() {
    if (document.getElementById("px-sheet")) return;
    var sheet = document.createElement("div");
    sheet.id = "px-sheet";
    sheet.className = "px-sheet";
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="px-sheet-card" role="dialog" aria-modal="true" aria-label="Playback speed">' +
        '<button type="button" class="px-sheet-x px-hit" aria-label="Close">×</button>' +
        '<button type="button" class="px-hit" data-rate="0.5">0.5x</button>' +
        '<button type="button" class="px-hit" data-rate="1">Normal</button>' +
        '<button type="button" class="px-hit" data-rate="1.5">1.5x</button>' +
        '<button type="button" class="px-hit" data-rate="2">2x</button>' +
      "</div>";
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function (event) {
      event.stopPropagation();
      if (event.target === sheet || event.target.closest(".px-sheet-x")) {
        event.preventDefault();
        closeSheet();
        return;
      }
      var choice = event.target.closest("[data-rate]");
      if (choice) setRate(choice.getAttribute("data-rate"), event);
    });
  }

  function openSheet(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    ensureSheet();
    sheetOpen = true;
    var sheet = document.getElementById("px-sheet");
    sheet.hidden = false;
    sync(activeTokens());
  }

  function closeSheet() {
    sheetOpen = false;
    var sheet = document.getElementById("px-sheet");
    if (sheet) sheet.hidden = true;
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
    var rate = button("px-rate", "1x");
    rate.addEventListener("click", openSheet);
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
    RATES: RATES,
    tokensFor: tokensFor,
    read: read,
    write: write,
    apply: apply,
    sync: sync,
    toggleMute: toggleMute,
    setRate: setRate,
    openSheet: openSheet,
    closeSheet: closeSheet,
    mountPair: mountPair,
    setScheduleTokens: setScheduleTokens,
    setCabinTokens: setCabinTokens,
    sheetOpen: function () { return sheetOpen; }
  };
})();

if (typeof document !== "undefined") {
  var mountCabinChrome = function () {
    var host = document.getElementById("vc-px-corners");
    if (host) window.NexusPlay.mountPair(host, "vc-px-mute");
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCabinChrome);
  else mountCabinChrome();
}
