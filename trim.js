/* Shared trim playback. Cuts are timestamps, not new files. */
(function (root) {
  "use strict";

  var trims = {};
  var online = true;

  function keyFromSrc(src) {
    if (!src) return "";
    var path = String(src);
    var query = path.indexOf("?");
    if (query !== -1) path = path.slice(0, query);
    var hash = path.indexOf("#");
    if (hash !== -1) path = path.slice(0, hash);
    var scheme = path.indexOf("://");
    if (scheme !== -1) {
      var rest = path.slice(scheme + 3);
      var slash = rest.indexOf("/");
      path = slash === -1 ? "" : rest.slice(slash + 1);
    } else path = path.replace(/^\//, "");
    try { return decodeURIComponent(path); } catch (err) { return path; }
  }

  function normalize(row) {
    if (!row || !row.r2Key) return null;
    var start = Number(row.start);
    if (!isFinite(start) || start < 0) start = 0;
    var end = row.end == null || row.end === "" ? null : Number(row.end);
    if (end != null && (!isFinite(end) || end <= start)) end = null;
    return { r2Key: row.r2Key, start: start, end: end, updatedAt: row.updatedAt || row.updated_at || "" };
  }

  function get(key) {
    return key && trims[key] ? trims[key] : null;
  }

  function keyFor(video) {
    if (!video) return "";
    return video.getAttribute("data-r2-key") || keyFromSrc(video.currentSrc || video.getAttribute("src") || "");
  }

  function applyStart(video) {
    if (!video || video.__trimSuspend) return;
    var trim = get(keyFor(video));
    if (!trim) return;
    var time = video.currentTime || 0;
    if (time < trim.start - 0.04 || (trim.end != null && time >= trim.end - 0.04)) {
      try { video.currentTime = trim.start; } catch (err) { /* metadata not ready */ }
    }
  }

  function onTime(video) {
    if (!video || video.__trimSuspend) return;
    var trim = get(keyFor(video));
    if (!trim || trim.end == null) return;
    if ((video.currentTime || 0) < trim.end - 0.04) return;
    if (video.loop) {
      try { video.currentTime = trim.start; } catch (err) { /* loop inside the trim */ }
      return;
    }
    try { video.pause(); } catch (err2) { /* stop at the cut */ }
  }

  function watch(video) {
    if (!video || video.__nexusTrim || video.classList.contains("vc-quick-preload")) return;
    video.__nexusTrim = true;
    video.addEventListener("loadedmetadata", function () { applyStart(video); });
    video.addEventListener("play", function () { applyStart(video); });
    video.addEventListener("timeupdate", function () { onTime(video); });
    video.addEventListener("seeked", function () { applyStart(video); });
  }

  function scan(node) {
    if (!node || !node.querySelectorAll) return;
    if (node.tagName === "VIDEO") watch(node);
    node.querySelectorAll("video").forEach(watch);
  }

  function install() {
    ["relic-player", "relic-deck-park"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      scan(el);
      new MutationObserver(function () { scan(el); }).observe(el, { childList: true, subtree: true });
    });
  }

  function load() {
    if (typeof root.nexusFetch !== "function") {
      online = false;
      return Promise.resolve();
    }
    return root.nexusFetch("/video-trims").then(function (payload) {
      trims = {};
      ((payload && payload.trims) || []).forEach(function (row) {
        var trim = normalize(row);
        if (trim) trims[trim.r2Key] = trim;
      });
      online = true;
    }).catch(function () {
      online = false;
      trims = {};
    });
  }

  function save(key, start, end) {
    var prev = trims[key] ? normalize(trims[key]) : null;
    var next = normalize({ r2Key: key, start: start, end: end, updatedAt: new Date().toISOString() });
    trims[key] = next;
    if (typeof root.nexusFetch !== "function") {
      if (prev) trims[key] = prev;
      else delete trims[key];
      return Promise.reject(new Error("offline"));
    }
    return root.nexusFetch("/video-trims", { method: "PUT", body: { r2Key: key, start: next.start, end: next.end } }).then(function (payload) {
      var saved = normalize((payload && payload.trim) || next);
      if (saved) trims[key] = saved;
      online = true;
      return trims[key];
    }).catch(function (err) {
      if (prev) trims[key] = prev;
      else delete trims[key];
      throw err;
    });
  }

  function clear(key) {
    var prev = trims[key] ? normalize(trims[key]) : null;
    delete trims[key];
    if (typeof root.nexusFetch !== "function") {
      if (prev) trims[key] = prev;
      return Promise.reject(new Error("offline"));
    }
    return root.nexusFetch("/video-trims?r2Key=" + encodeURIComponent(key), { method: "DELETE" }).catch(function (err) {
      if (prev) trims[key] = prev;
      throw err;
    });
  }

  root.NexusTrim = {
    get: get,
    keyFromSrc: keyFromSrc,
    watch: watch,
    load: load,
    save: save,
    clear: clear,
    suspend: function (video, on) { if (video) video.__trimSuspend = !!on; }
  };

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})(typeof window !== "undefined" ? window : this);
