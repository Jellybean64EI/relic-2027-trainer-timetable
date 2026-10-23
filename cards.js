/* Training Video Cards. Reads the generated catalogue and plays one clip
   in the existing player. Cards render only for the open module.
   Builder mode adds an orange preview eye. Custom uploads merge in here. */
(function () {
  "use strict";

  var MAX_BYTES = 26214400;
  var openGroup = "";
  var openModule = "";
  var custom = [];
  var pendingFile = null;
  var pendingType = "";
  var uploadTarget = null;
  var uploading = false;
  var confirmKey = "";
  var renamingKey = "";
  var renameDraft = "";
  var focusRename = false;
  var blurTimer = 0;

  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="12" r="2.5" fill="currentColor"/>' +
    "</svg>";
  var PENCIL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path d="M4 20h4L18 10l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M13 7l4 4" fill="none" stroke="currentColor" stroke-width="2"/>' +
    "</svg>";
  var TICK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
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

  function chips(video) {
    var html = "";
    (video.phases || []).forEach(function (phase) {
      html += '<span class="vc-chip">' + esc(phase) + "</span>";
    });
    if (video.guess) html += '<span class="vc-chip is-mark">guess</span>';
    if (video.check) html += '<span class="vc-chip is-mark">check</span>';
    return html ? '<span class="vc-chips">' + html + "</span>" : "";
  }

  function cardHtml(video, group) {
    var picked = window.NexusBuilder && window.NexusBuilder.picked && window.NexusBuilder.picked(video.key);
    var groupId = video.group || (group && group.id) || "";
    var showEye = building();
    var button = '<button type="button" class="vc-card" data-vc-key="' + esc(video.key) + '" data-vc-src="' + esc(video.src) + '" data-vc-cabin="' + esc(video.cabin) + '" data-vc-title="' + esc(video.title) + '" data-vc-group="' + esc(groupId) + '">' +
      '<span class="vc-card-top"><span class="vc-card-title">' + esc(video.title) + "</span>" +
      (picked ? '<span class="vc-in" aria-label="In this section">✓</span>' : "") +
      "</span>" +
      chips(video) +
      "</button>";
    if (!showEye && !video.mine) return button;
    var editing = !!(video.mine && renamingKey === video.key);
    var side = "";
    if (showEye) {
      side += '<button type="button" class="vc-eye" aria-label="Preview ' + esc(video.title) + '" data-vc-src="' + esc(video.src) + '" data-vc-title="' + esc(video.title) + '">' + EYE + "</button>";
    }
    if (editing) {
      side += '<input class="vc-name-input" type="text" maxlength="80" autocomplete="off" enterkeyhint="done" aria-label="Video name" value="' + esc(renameDraft) + '">';
    }
    if (video.mine) {
      side += '<span class="vc-rename">';
      if (editing) side += '<button type="button" class="vc-tick" data-vc-key="' + esc(video.key) + '" aria-label="Save name">' + TICK + "</button>";
      side += '<button type="button" class="vc-pencil" data-vc-key="' + esc(video.key) + '" aria-label="Rename ' + esc(video.title) + '">' + PENCIL + "</button>";
      side += "</span>";
    }
    var cls = "vc-card-wrap";
    if (showEye) cls += " has-eye";
    if (video.mine) cls += " has-mine";
    if (editing) cls += " is-renaming";
    return '<div class="' + cls + '">' + button + side + "</div>";
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
          if (modOpen) {
            html += '<div class="vc-cards">';
            mod.videos.forEach(function (video) { html += cardHtml(video, group); });
            mineVideos(group, mod).forEach(function (video) { html += cardHtml(video, group); });
            html += "</div>";
          }
          html += "</div>";
        });
        html += "</div></div>";
      }
      html += "</section>";
    });
    root.innerHTML = html;
    var input = root.querySelector(".vc-name-input");
    if (input && focusRename) {
      focusRename = false;
      input.focus();
      input.select();
    }
  }

  function setUploadMsg(text, warn) {
    var el = document.getElementById("vc-upload-msg");
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

  function showProgress(on, pct) {
    var bar = document.getElementById("vc-progress");
    if (!bar) return;
    bar.hidden = !on;
    var fill = bar.firstElementChild;
    if (fill) fill.style.width = (pct || 0) + "%";
  }

  function putVideo(file, area, type, name, contentType) {
    return new Promise(function (resolve, reject) {
      var api = window.NEXUS_API || {};
      var xhr = new XMLHttpRequest();
      var url = String(api.base || "").replace(/\/$/, "") +
        "/custom-video?area=" + encodeURIComponent(area) +
        "&type=" + encodeURIComponent(type) +
        "&name=" + encodeURIComponent(name);
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

  function saveUpload() {
    if (uploading || !pendingFile || !uploadTarget) return;
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
    putVideo(file, group.id, mod.id, file.name, type).then(function () {
      pendingFile = null;
      pendingType = "";
      uploadTarget = null;
      uploading = false;
      showProgress(false, 0);
      setUploadMsg("Saved.");
      return Promise.all([loadCustom(), loadStorage()]);
    }).catch(function (err) {
      uploading = false;
      showProgress(false, 0);
      setUploadMsg(uploadError(err), true);
      render();
    });
  }

  function startRename(key, title) {
    clearTimeout(blurTimer);
    renamingKey = key || "";
    renameDraft = title || "";
    focusRename = true;
    render();
  }

  function cancelRename() {
    clearTimeout(blurTimer);
    renamingKey = "";
    renameDraft = "";
    focusRename = false;
    render();
  }

  function saveRename() {
    clearTimeout(blurTimer);
    var key = renamingKey;
    var title = String(renameDraft || "").trim().slice(0, 80);
    if (!key) return;
    if (!title) {
      setUploadMsg("Give it a name.", true);
      var empty = document.querySelector(".vc-name-input");
      if (empty) {
        empty.focus();
        empty.select();
      }
      return;
    }
    var current = null;
    custom.forEach(function (video) {
      if (video.r2Key === key) current = video;
    });
    var previous = current ? current.title : "";
    if (previous === title) {
      cancelRename();
      return;
    }
    renamingKey = "";
    renameDraft = "";
    if (current) current.title = title;
    render();
    if (!window.nexusFetch) return;
    window.nexusFetch("/custom-video?key=" + encodeURIComponent(key), {
      method: "PATCH",
      body: { title: title }
    }).then(function (payload) {
      var saved = (payload && payload.title) || title;
      if (current) current.title = saved;
      if (window.NexusBuilder && window.NexusBuilder.retitle) window.NexusBuilder.retitle(key, saved);
      else if (window.NexusBuilder && window.NexusBuilder.remember && current) {
        window.NexusBuilder.remember({
          key: key,
          title: saved,
          src: current.url,
          cabin: "",
          group: current.area,
          phases: []
        });
      }
      var preview = document.getElementById("vc-preview");
      var previewVideo = document.getElementById("vc-preview-video");
      if (preview && !preview.hidden && previewVideo && current && previewVideo.currentSrc === current.url) {
        var label = preview.querySelector(".vc-preview-title");
        if (label) label.textContent = saved;
      }
      render();
    }).catch(function (err) {
      if (current) current.title = previous;
      if (window.NexusBuilder && window.NexusBuilder.retitle) window.NexusBuilder.retitle(key, previous);
      setUploadMsg((err && err.message) || "Could not rename.", true);
      render();
    });
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
    video.pause();
    video.preload = "metadata";
    video.src = src;
    root.hidden = false;
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
      fresh.setAttribute("playsinline", "");
      fresh.preload = "metadata";
      video.replaceWith(fresh);
    }
    if (root) root.hidden = true;
  }

  function onFile(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      pendingFile = null;
      pendingType = "";
      uploadTarget = null;
      setUploadMsg("That video is over 25 MB. Choose a smaller one.", true);
      render();
      return;
    }
    var type = fileType(file);
    if (!type) {
      pendingFile = null;
      pendingType = "";
      setUploadMsg("Use an mp4, mov, or webm.", true);
      return;
    }
    pendingFile = file;
    pendingType = type;
    setUploadMsg("Choose a cabin, then a module.");
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
    if (event.target.closest(".vc-tick")) {
      event.preventDefault();
      event.stopPropagation();
      saveRename();
      return;
    }
    var pencil = event.target.closest(".vc-pencil");
    if (pencil) {
      event.preventDefault();
      event.stopPropagation();
      var pencilKey = pencil.getAttribute("data-vc-key");
      var row = null;
      custom.forEach(function (video) {
        if (video.r2Key === pencilKey) row = video;
      });
      startRename(pencilKey, row ? row.title : "");
      return;
    }
    if (event.target.closest(".vc-name-input") || event.target.closest(".vc-rename")) {
      event.preventDefault();
      event.stopPropagation();
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
    if (event.target.closest("#vc-save")) {
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
      if (window.RelicArchitect && window.RelicArchitect.openCatalogClip) {
        window.RelicArchitect.openCatalogClip({
          title: card.getAttribute("data-vc-title"),
          src: card.getAttribute("data-vc-src"),
          cabin: card.getAttribute("data-vc-cabin"),
          key: card.getAttribute("data-vc-key")
        });
      }
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
      if (pendingFile) setUploadMsg(uploadTarget ? "" : "Choose a cabin, then a module.");
      render();
      return;
    }
    var cabin = event.target.closest(".vc-cabin");
    if (!cabin) return;
    event.preventDefault();
    var next = cabin.getAttribute("data-vc-group") || "";
    uploadTarget = null;
    if (pendingFile) setUploadMsg("Choose a cabin, then a module.");
    if (openGroup === next) {
      openGroup = "";
      openModule = "";
    } else {
      openGroup = next;
      openModule = "";
    }
    render();
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
        '<p id="vc-upload-msg" class="vc-upload-msg"></p>' +
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
          '<video id="vc-preview-video" controls playsinline preload="metadata"></video>' +
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
      root.addEventListener("mousedown", function (event) {
        if (event.target.closest(".vc-tick")) event.preventDefault();
      });
      root.addEventListener("input", function (event) {
        if (event.target.classList && event.target.classList.contains("vc-name-input")) renameDraft = event.target.value;
      });
      root.addEventListener("keydown", function (event) {
        if (!event.target.classList || !event.target.classList.contains("vc-name-input")) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          saveRename();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelRename();
        }
      });
      root.addEventListener("focusout", function (event) {
        if (!event.target.classList || !event.target.classList.contains("vc-name-input")) return;
        var key = renamingKey;
        if (!key) return;
        clearTimeout(blurTimer);
        blurTimer = setTimeout(function () {
          var active = document.activeElement;
          if (active && active.classList && active.classList.contains("vc-name-input")) return;
          if (key && renamingKey === key) cancelRename();
        }, 250);
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !(event.target.classList && event.target.classList.contains("vc-name-input"))) closePreview();
    });
    if (document.body && document.body.classList.contains("is-cards")) render();
    loadCustom();
    loadStorage();
  }

  window.NexusCards = { render: render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
