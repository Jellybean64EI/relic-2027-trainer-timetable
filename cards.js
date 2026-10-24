/* Training Video Cards. Catalogue cabins, builder eyes, and named uploads. */
(function () {
  "use strict";

  var MAX_BYTES = 26214400;
  var openGroup = "";
  var openModule = "";
  var custom = [];
  var pendingFile = null;
  var pendingType = "";
  var pendingTitle = "";
  var uploadTarget = null;
  var uploading = false;
  var confirmKey = "";

  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="12" r="2.5" fill="currentColor"/>' +
    "</svg>";

  function catalog() {
    return window.NEXUS_VIDEO_CATALOG && window.NEXUS_VIDEO_CATALOG.groups;
  }

  function building() {
    return !!(window.NexusBuilder && window.NexusBuilder.building && window.NexusBuilder.building());
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function gb(mb) {
    var n = Math.round((Number(mb) / 1024) * 10) / 10;
    if (!isFinite(n)) n = 0;
    return (n % 1 === 0 ? String(n) : n.toFixed(1)) + " GB";
  }

  function extras(group, modId) {
    return custom.filter(function (video) {
      return video && video.area === group.id && (!modId || video.type === modId);
    });
  }

  function mineVideos(group, mod) {
    return extras(group, mod.id).map(function (video) {
      return {
        key: video.r2Key,
        src: video.url,
        title: video.title || "Video",
        cabin: "",
        group: group.id,
        phases: [],
        mine: true
      };
    });
  }

  function labelFor(title, number) {
    var text = String(title || "");
    if (/^\d+\.\s/.test(text)) return text;
    return number + ". " + text;
  }

  function cardHtml(video, group, number) {
    var picked = window.NexusBuilder && window.NexusBuilder.picked && window.NexusBuilder.picked(video.key);
    var groupId = video.group || (group && group.id) || "";
    var label = labelFor(video.title, number);
    var button = '<button type="button" class="vc-card" data-vc-key="' + esc(video.key) + '" data-vc-src="' + esc(video.src) + '" data-vc-cabin="' + esc(video.cabin) + '" data-vc-title="' + esc(video.title) + '" data-vc-group="' + esc(groupId) + '">' +
      '<span class="vc-card-top"><span class="vc-card-title">' + esc(label) + "</span>" +
      (picked ? '<span class="vc-in" aria-label="In this section">✓</span>' : "") +
      "</span></button>";
    if (!building()) return button;
    return '<div class="vc-card-wrap has-eye">' + button +
      '<button type="button" class="vc-eye" aria-label="Preview ' + esc(video.title) + '" data-vc-src="' + esc(video.src) + '" data-vc-title="' + esc(video.title) + '">' + EYE + "</button></div>";
  }

  function cardsHtml(group, mod) {
    var html = "";
    var base = mod.videos || [];
    base.forEach(function (video, index) {
      html += cardHtml(video, group, index + 1);
    });
    mineVideos(group, mod).forEach(function (video, index) {
      html += cardHtml(video, group, base.length + index + 1);
    });
    return html;
  }

  function syncPicked() {
    if (!building()) return false;
    var root = document.getElementById("vc-list");
    if (!root) return false;
    var cards = root.querySelectorAll(".vc-card");
    var i;
    for (i = 0; i < cards.length; i++) {
      if (!cards[i].closest(".vc-card-wrap")) return false;
    }
    cards.forEach(function (card) {
      var key = card.getAttribute("data-vc-key");
      var on = !!(window.NexusBuilder && window.NexusBuilder.picked && window.NexusBuilder.picked(key));
      card.classList.toggle("is-in", on);
      var badge = card.querySelector(".vc-in");
      if (on && !badge) {
        var top = card.querySelector(".vc-card-top");
        if (!top) return;
        var span = document.createElement("span");
        span.className = "vc-in";
        span.setAttribute("aria-label", "In this section");
        span.textContent = "✓";
        top.appendChild(span);
      } else if (!on && badge) {
        badge.remove();
      }
    });
    return true;
  }

  function anchorHeader(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "nearest" });
  }

  function render() {
    var root = document.getElementById("vc-list");
    var groups = catalog();
    if (!root || !groups) return;
    var html = "";
    groups.forEach(function (group) {
      var open = group.id === openGroup;
      var cabinCount = group.count + extras(group).length;
      html += '<section class="vc-block' + (open ? " is-open" : "") + '">';
      html += '<button type="button" class="vc-cabin" data-vc-group="' + esc(group.id) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<span class="vc-name">' + esc(group.name) + '</span><span class="vc-count">' + cabinCount + "</span></button>";
      if (open) {
        html += '<div class="vc-mods"><div class="vc-mods-inner">';
        group.modules.forEach(function (mod) {
          var modOpen = openModule === mod.id;
          var marked = !!(pendingFile && uploadTarget && uploadTarget.groupId === group.id && uploadTarget.moduleId === mod.id);
          var modCount = mod.count + extras(group, mod.id).length;
          html += '<div class="vc-mod-block' + (modOpen ? " is-open" : "") + '">';
          html += '<button type="button" class="vc-mod' + (marked ? " is-upload" : "") + '" data-vc-module="' + esc(mod.id) + '" aria-expanded="' + (modOpen ? "true" : "false") + '">' +
            '<span class="vc-name">' + esc(mod.name) + '</span><span class="vc-count">' + modCount + "</span></button>";
          if (marked && modOpen) {
            html += '<button type="button" class="vc-save" id="vc-save"' + (uploading ? " disabled" : "") + ">Save video to " + esc(group.name) + " · " + esc(mod.name) + "</button>";
          }
          if (modOpen) html += '<div class="vc-cards">' + cardsHtml(group, mod) + "</div>";
          html += "</div>";
        });
        html += "</div></div>";
      }
      html += "</section>";
    });
    root.innerHTML = html;
    paintUploadBox();
  }

  function setUploadMsg(text, warn) {
    var el = document.getElementById("vc-status");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-warn", !!warn);
  }

  function paintStorage(payload) {
    var bar = document.getElementById("vc-storage");
    var label = document.getElementById("vc-storage-label");
    var fill = document.getElementById("vc-storage-fill");
    if (!bar || !payload || payload.usedMB == null || !payload.limitMB) return;
    var pct = Math.max(0, Math.min(100, (Number(payload.usedMB) / Number(payload.limitMB)) * 100));
    bar.hidden = false;
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = gb(payload.usedMB) + " of " + gb(payload.limitMB) + " used";
  }

  function rememberAll() {
    if (!window.NexusBuilder || !window.NexusBuilder.remember) return;
    custom.forEach(function (video) {
      window.NexusBuilder.remember({
        key: video.r2Key,
        title: video.title,
        src: video.url,
        cabin: "",
        group: video.area,
        phases: []
      });
    });
  }

  function loadCustom() {
    if (!window.nexusFetch) return Promise.resolve();
    return window.nexusFetch("/custom-videos").then(function (payload) {
      custom = (payload && payload.videos) || [];
      rememberAll();
      render();
    }).catch(function () {
      custom = [];
    });
  }

  function loadStorage() {
    if (!window.nexusFetch) return Promise.resolve();
    return window.nexusFetch("/storage").then(paintStorage).catch(function () {});
  }

  function fileType(file) {
    var type = String(file.type || "").toLowerCase();
    if (type === "video/mp4" || type === "video/quicktime" || type === "video/webm") return type;
    var name = String(file.name || "").toLowerCase();
    if (/\.mp4$/.test(name)) return "video/mp4";
    if (/\.mov$/.test(name)) return "video/quicktime";
    if (/\.webm$/.test(name)) return "video/webm";
    return "";
  }

  function stemOf(name) {
    var base = String(name || "").replace(/^.*[\\/]/, "");
    var dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
  }

  function cleanStem(stem) {
    return String(stem || "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  }

  function rawCapture(stem) {
    var s = String(stem || "").trim();
    if (!s) return true;
    if (/^\d+$/.test(s)) return true;
    if (/^(IMG_|VID_|MOV_|PXL_|trim\.)/i.test(s)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
    return false;
  }

  function extOf(file) {
    var name = String((file && file.name) || "");
    var match = name.match(/(\.[A-Za-z0-9]{1,8})$/);
    if (match) return match[1];
    if (pendingType === "video/quicktime") return ".mov";
    if (pendingType === "video/webm") return ".webm";
    return ".mp4";
  }

  function showProgress(on, pct) {
    var bar = document.getElementById("vc-progress");
    if (!bar) return;
    bar.hidden = !on;
    var fill = bar.firstElementChild;
    if (fill) fill.style.width = (pct || 0) + "%";
  }

  function targetLabels() {
    if (!uploadTarget) return null;
    var groups = catalog() || [];
    var group = null;
    var mod = null;
    groups.forEach(function (item) {
      if (item.id === uploadTarget.groupId) group = item;
    });
    if (group) {
      (group.modules || []).forEach(function (item) {
        if (item.id === uploadTarget.moduleId) mod = item;
      });
    }
    if (!group || !mod) return null;
    return { group: group.name, mod: mod.name };
  }

  function paintUploadBox(focus) {
    var tools = document.getElementById("vc-tools");
    var box = document.getElementById("vc-upload-box");
    if (!pendingFile) {
      if (box) box.remove();
      return;
    }
    if (!tools) return;
    var created = !box;
    if (created) {
      box = document.createElement("div");
      box.id = "vc-upload-box";
      box.innerHTML =
        '<div class="vc-upload-head">' +
          '<input id="vc-upload-title" type="text" class="vc-upload-title" placeholder="Video card name (e.g. Anterior pelvic tilts)" maxlength="80" autocomplete="off" />' +
          '<button type="button" id="vc-upload-cancel" class="vc-upload-cancel" aria-label="Cancel">×</button>' +
        "</div>" +
        '<p id="vc-upload-dest" class="vc-upload-dest"></p>' +
        '<button type="button" id="vc-upload-save" class="vc-upload-save" hidden>Save video card</button>';
      var msg = document.getElementById("vc-status");
      if (msg && msg.parentNode === tools) msg.parentNode.insertBefore(box, msg);
      else tools.appendChild(box);
    }
    var titleInput = document.getElementById("vc-upload-title");
    if (titleInput && (created || focus)) {
      titleInput.value = pendingTitle || "";
      if (focus) titleInput.focus();
    }
    var labels = targetLabels();
    var dest = document.getElementById("vc-upload-dest");
    var save = document.getElementById("vc-upload-save");
    if (dest) {
      dest.textContent = labels
        ? ("Destination: " + labels.group + " · " + labels.mod)
        : "Step 2: Open a muscle cabin below and tap Pre-stretches, Exercises, or Post-stretches (it glows orange).";
    }
    if (save) {
      save.hidden = !labels;
      save.disabled = !!uploading;
    }
  }

  function putVideo(file, area, type, name, contentType, title) {
    return new Promise(function (resolve, reject) {
      var api = window.NEXUS_API || {};
      var xhr = new XMLHttpRequest();
      var url = String(api.base || "").replace(/\/$/, "") +
        "/custom-video?area=" + encodeURIComponent(area) +
        "&type=" + encodeURIComponent(type) +
        "&name=" + encodeURIComponent(name) +
        "&title=" + encodeURIComponent(title || "");
      xhr.open("PUT", url);
      xhr.setRequestHeader("X-Nexus-Key", api.key || "");
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = function (event) {
        if (!event.lengthComputable) return;
        showProgress(true, Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = function () {
        var payload = null;
        try { payload = JSON.parse(xhr.responseText); } catch (err) { payload = null; }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }
        var error = new Error((payload && (payload.error || payload.message)) || ("HTTP " + xhr.status));
        error.status = xhr.status;
        reject(error);
      };
      xhr.onerror = function () {
        reject(new Error("Upload failed"));
      };
      xhr.send(file);
    });
  }

  function uploadError(err) {
    var status = err && err.status;
    if (status === 413) return "That video is over 25 MB. Choose a smaller one.";
    if (status === 507) return "Storage is full (5 GB).";
    if (status === 404) return "Upload is not ready.";
    return (err && err.message) || "Upload failed.";
  }

  function typedTitle() {
    var input = document.getElementById("vc-upload-title");
    var typed = input ? input.value : pendingTitle;
    typed = String(typed || "").trim().slice(0, 80);
    pendingTitle = typed;
    if (input) input.value = typed;
    return typed;
  }

  function saveUpload() {
    if (uploading || !pendingFile || !uploadTarget) return;
    var title = typedTitle();
    var input = document.getElementById("vc-upload-title");
    if (!title) {
      setUploadMsg("Type a video card name first.", true);
      if (input) input.focus();
      return;
    }
    var groups = catalog() || [];
    var group = null;
    var mod = null;
    groups.forEach(function (item) {
      if (item.id === uploadTarget.groupId) group = item;
    });
    if (group) {
      (group.modules || []).forEach(function (item) {
        if (item.id === uploadTarget.moduleId) mod = item;
      });
    }
    if (!group || !mod) return;
    uploading = true;
    render();
    showProgress(true, 0);
    setUploadMsg("Uploading…");
    var file = pendingFile;
    var type = pendingType;
    putVideo(file, group.id, mod.id, title + extOf(file), type, title).then(function () {
      pendingFile = null;
      pendingType = "";
      pendingTitle = "";
      uploadTarget = null;
      uploading = false;
      showProgress(false, 0);
      setUploadMsg("Saved.");
      paintUploadBox();
      return Promise.all([loadCustom(), loadStorage()]);
    }).catch(function (err) {
      uploading = false;
      showProgress(false, 0);
      setUploadMsg(uploadError(err), true);
      render();
    });
  }

  function cancelUpload() {
    if (uploading) return;
    pendingFile = null;
    pendingType = "";
    pendingTitle = "";
    uploadTarget = null;
    setUploadMsg("");
    paintUploadBox();
    render();
  }

  function deleteVideo(key) {
    confirmKey = "";
    if (!key || !window.nexusFetch) return;
    window.nexusFetch("/custom-video?key=" + encodeURIComponent(key), { method: "DELETE" }).then(function () {
      if (window.NexusBuilder && window.NexusBuilder.forget) window.NexusBuilder.forget(key);
      setUploadMsg("Deleted.");
      return Promise.all([loadCustom(), loadStorage()]);
    }).catch(function (err) {
      setUploadMsg((err && err.message) || "Could not delete that video.", true);
      render();
    });
  }

  function openPreview(title, src) {
    var root = document.getElementById("vc-preview");
    var video = document.getElementById("vc-preview-video");
    if (!root || !video || !src) return;
    var label = root.querySelector(".vc-preview-title");
    if (label) label.textContent = title || "Preview";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.src = src;
    root.hidden = false;
    var play = video.play();
    if (play && typeof play.catch === "function") play.catch(function () {});
  }

  function closePreview() {
    var root = document.getElementById("vc-preview");
    var video = document.getElementById("vc-preview-video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      var fresh = document.createElement("video");
      fresh.id = "vc-preview-video";
      fresh.controls = true;
      fresh.autoplay = true;
      fresh.muted = true;
      fresh.loop = true;
      fresh.playsInline = true;
      fresh.preload = "auto";
      fresh.setAttribute("autoplay", "");
      fresh.setAttribute("muted", "");
      fresh.setAttribute("loop", "");
      fresh.setAttribute("playsinline", "");
      video.replaceWith(fresh);
    }
    if (root) root.hidden = true;
  }

  function onFile(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    input.value = "";
    if (!file || uploading) return;
    if (file.size > MAX_BYTES) {
      pendingFile = null;
      pendingType = "";
      pendingTitle = "";
      uploadTarget = null;
      setUploadMsg("That video is over 25 MB. Choose a smaller one.", true);
      paintUploadBox();
      render();
      return;
    }
    var type = fileType(file);
    if (!type) {
      pendingFile = null;
      pendingType = "";
      pendingTitle = "";
      setUploadMsg("Use an mp4, mov, or webm.", true);
      paintUploadBox();
      return;
    }
    var stem = stemOf(file.name);
    pendingFile = file;
    pendingType = type;
    pendingTitle = rawCapture(stem) ? "" : cleanStem(stem).slice(0, 80);
    setUploadMsg("");
    paintUploadBox(true);
    render();
  }

  function onClick(event) {
    var eye = event.target.closest(".vc-eye");
    if (eye) {
      event.preventDefault();
      event.stopPropagation();
      openPreview(eye.getAttribute("data-vc-title"), eye.getAttribute("data-vc-src"));
      return;
    }
    if (event.target.closest("#vc-upload-cancel")) {
      event.preventDefault();
      event.stopPropagation();
      cancelUpload();
      return;
    }
    var yes = event.target.closest(".vc-del-yes");
    if (yes) {
      event.preventDefault();
      event.stopPropagation();
      deleteVideo(yes.getAttribute("data-vc-key"));
      return;
    }
    if (event.target.closest(".vc-del-no")) {
      event.preventDefault();
      event.stopPropagation();
      confirmKey = "";
      render();
      return;
    }
    var del = event.target.closest(".vc-del");
    if (del) {
      event.preventDefault();
      event.stopPropagation();
      confirmKey = del.getAttribute("data-vc-key") || "";
      render();
      return;
    }
    if (event.target.closest("#vc-save") || event.target.closest("#vc-upload-save")) {
      event.preventDefault();
      event.stopPropagation();
      saveUpload();
      return;
    }
    var card = event.target.closest(".vc-card");
    if (card) {
      event.preventDefault();
      if (window.NexusBuilder && window.NexusBuilder.takeCard && window.NexusBuilder.takeCard({
        key: card.getAttribute("data-vc-key"),
        src: card.getAttribute("data-vc-src"),
        cabin: card.getAttribute("data-vc-cabin"),
        title: card.getAttribute("data-vc-title"),
        group: card.getAttribute("data-vc-group")
      })) return;
      return;
    }
    var mod = event.target.closest(".vc-mod");
    if (mod) {
      event.preventDefault();
      var nextMod = mod.getAttribute("data-vc-module") || "";
      var opening = openModule !== nextMod;
      openModule = opening ? nextMod : "";
      if (pendingFile && opening) uploadTarget = { groupId: openGroup, moduleId: nextMod };
      else uploadTarget = null;
      render();
      paintUploadBox();
      anchorHeader('.vc-mod[data-vc-module="' + nextMod + '"]');
      return;
    }
    var cabin = event.target.closest(".vc-cabin");
    if (!cabin) return;
    event.preventDefault();
    var next = cabin.getAttribute("data-vc-group") || "";
    uploadTarget = null;
    if (openGroup === next) {
      openGroup = "";
      openModule = "";
    } else {
      openGroup = next;
      openModule = "";
    }
    render();
    paintUploadBox();
    anchorHeader('.vc-cabin[data-vc-group="' + next + '"]');
  }

  function ensureChrome() {
    var host = document.getElementById("vcards-root");
    var list = document.getElementById("vc-list");
    if (host && list && !document.getElementById("vc-tools")) {
      var tools = document.createElement("div");
      tools.id = "vc-tools";
      tools.innerHTML =
        '<div class="vc-storage" id="vc-storage" hidden>' +
          '<div class="vc-storage-track"><div class="vc-storage-fill" id="vc-storage-fill"></div></div>' +
          '<span id="vc-storage-label"></span>' +
        "</div>" +
        '<button type="button" id="vc-upload-btn">Upload video</button>' +
        '<input id="vc-file" type="file" accept="video/*" hidden>' +
        '<p id="vc-status" class="vc-upload-msg"></p>' +
        '<div id="vc-progress" class="vc-progress" hidden><div></div></div>';
      host.insertBefore(tools, list);
      var uploadBtn = document.getElementById("vc-upload-btn");
      var file = document.getElementById("vc-file");
      if (uploadBtn && file) uploadBtn.addEventListener("click", function () { file.click(); });
      if (file) file.addEventListener("change", onFile);
    }
    if (!document.getElementById("vc-preview")) {
      var preview = document.createElement("div");
      preview.id = "vc-preview";
      preview.hidden = true;
      preview.innerHTML =
        '<div class="vc-preview-card" role="dialog" aria-modal="true" aria-label="Preview">' +
          '<button type="button" class="vc-preview-x" aria-label="Close">×</button>' +
          '<p class="vc-preview-title"></p>' +
          '<video id="vc-preview-video" controls autoplay muted loop playsinline preload="auto"></video>' +
        "</div>";
      document.body.appendChild(preview);
      preview.addEventListener("click", function (event) {
        if (event.target === preview || event.target.closest(".vc-preview-x")) {
          event.preventDefault();
          closePreview();
        }
      });
    }
  }

  function boot() {
    ensureChrome();
    var root = document.getElementById("vcards-root");
    if (root) {
      root.addEventListener("click", onClick);
      root.addEventListener("input", function (event) {
        if (event.target && event.target.id === "vc-upload-title") pendingTitle = event.target.value;
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !(event.target && event.target.id === "vc-upload-title")) closePreview();
    });
    if (document.body && document.body.classList.contains("is-cards")) render();
    loadCustom();
    loadStorage();
  }

  window.NexusCards = { render: render, syncPicked: syncPicked };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
