/* Shared trim playback. Cuts are timestamps, not new files. */
(function (root) {
  "use strict";

  var trims = {};
  var synced = {};
  var cuts = {};
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
    var status = row.status === "synced" ? "synced" : "pending";
    return { r2Key: row.r2Key, start: start, end: end, updatedAt: row.updatedAt || row.updated_at || "", status: status };
  }

  function bust(src) {
    if (!src) return src || "";
    var key = keyFromSrc(src);
    var stamp = key && cuts[key];
    if (!stamp) return String(src);
    var base = String(src);
    var hash = "";
    var hashAt = base.indexOf("#");
    if (hashAt !== -1) {
      hash = base.slice(hashAt);
      base = base.slice(0, hashAt);
    }
    var queryAt = base.indexOf("?");
    var path = queryAt === -1 ? base : base.slice(0, queryAt);
    var query = queryAt === -1 ? "" : base.slice(queryAt + 1);
    var parts = [];
    if (query) {
      query.split("&").forEach(function (part) {
        if (part && part.slice(0, 2) !== "v=") parts.push(part);
      });
    }
    parts.push("v=" + encodeURIComponent(stamp));
    return path + "?" + parts.join("&") + hash;
  }

  function statusFor(key) {
    if (!key) return "";
    if (trims[key]) return trims[key].status === "synced" ? "synced" : "pending";
    if (synced[key]) return "synced";
    return "";
  }

  function plainArchiveSrc(cabinKey, clip) {
    if (clip.__plainSrc) return clip.__plainSrc;
    var src = clip.src ? String(clip.src) : "";
    if (src && /^https?:\/\//i.test(src)) return src.split("#")[0].split("?")[0];
    var path = clip.path ? String(clip.path) : "";
    if (path && /^https?:\/\//i.test(path)) return path.split("#")[0].split("?")[0];
    var name = String(clip.title || "").trim();
    if (name && !/\.(mp4|webm|mov)$/i.test(name)) name += ".mp4";
    var api = root.NEXUS_API || {};
    var base = String(api.videoBase || "").replace(/\/$/, "");
    if (!base || !cabinKey || !name) return src || path || "";
    return base + "/" + encodeURIComponent(cabinKey) + "/" + encodeURIComponent(name);
  }

  function stampArchive() {
    var archive = root.RELIC_VIDEO_ARCHIVE;
    if (!archive || !archive.cabins) return;
    Object.keys(archive.cabins).forEach(function (cabinKey) {
      var cabin = archive.cabins[cabinKey];
      ((cabin && cabin.playlist) || []).forEach(function (clip) {
        if (!clip) return;
        var plain = plainArchiveSrc(cabinKey, clip);
        if (!plain) return;
        clip.__plainSrc = plain;
        var next = bust(plain);
        if (next !== plain) {
          clip.__stamped = true;
          clip.src = next;
        } else if (clip.__stamped) {
          delete clip.src;
          clip.__stamped = false;
        }
      });
    });
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
      synced = {};
      cuts = {};
      ((payload && payload.trims) || []).forEach(function (row) {
        var trim = normalize(row);
        if (trim) trims[trim.r2Key] = trim;
      });
      ((payload && payload.synced) || []).forEach(function (key) {
        if (key) synced[key] = true;
      });
      var listed = payload && payload.cuts;
      if (listed && typeof listed === "object") cuts = listed;
      online = true;
      stampArchive();
    }).catch(function () {
      online = false;
      trims = {};
    });
  }

  function save(key, start, end) {
    var prev = trims[key] ? normalize(trims[key]) : null;
    var next = normalize({ r2Key: key, start: start, end: end, updatedAt: new Date().toISOString(), status: "pending" });
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

  function drop(key) {
    if (!key) return;
    delete trims[key];
    delete synced[key];
    if (cuts[key]) delete cuts[key];
  }

  root.NexusTrim = {
    get: get,
    keyFromSrc: keyFromSrc,
    watch: watch,
    load: load,
    save: save,
    clear: clear,
    bust: bust,
    status: statusFor,
    drop: drop,
    suspend: function (video, on) { if (video) video.__trimSuspend = !!on; }
  };

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})(typeof window !== "undefined" ? window : this);
