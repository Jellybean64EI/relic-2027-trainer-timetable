/* Training Video Cards. Catalogue cabins, builder eyes, and named uploads. */
(function () {
  "use strict";

  var MAX_BYTES = 26214400;
  var openGroup = "";
  var openModule = "";
  var specialsOpen = false;
  var custom = [];
  var placements = null;
  var previewKey = "";
  var previewCabin = "";
  var previewModule = "exercise";
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

  function catalogRoot() {
    return window.NEXUS_VIDEO_CATALOG || null;
  }

  function catalog() {
    return catalogRoot() && catalogRoot().groups;
  }

  function groupById(id) {
    var groups = catalog() || [];
    var i;
    for (i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
    return null;
  }

  function moduleLabel(id) {
    var labels = catalogRoot() && catalogRoot().moduleLabels;
    if (labels && labels[id]) return labels[id];
    if (id === "pre") return "Pre";
    if (id === "post") return "Post";
    return "Main";
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

  function cardHtml(video, number, cabinId, moduleId, forceEye) {
    var picked = window.NexusBuilder && window.NexusBuilder.picked && window.NexusBuilder.picked(video.key);
    var groupId = video.legacyGroup || video.group || "";
    var label = labelFor(video.title, number);
    var button = '<button type="button" class="vc-card" data-vc-key="' + esc(video.key) + '" data-vc-src="' + esc(video.src) + '" data-vc-cabin="' + esc(video.cabin) + '" data-vc-title="' + esc(video.title) + '" data-vc-group="' + esc(groupId) + '" data-vc-cabin-id="' + esc(cabinId) + '" data-vc-module="' + esc(moduleId) + '">' +
      '<span class="vc-card-top"><span class="vc-card-title">' + esc(label) + "</span>" +
      (picked ? '<span class="vc-in" aria-label="In this section">✓</span>' : "") +
      "</span></button>";
    if (!building() && !forceEye) return button;
    return '<div class="vc-card-wrap has-eye">' + button +
      '<button type="button" class="vc-eye" aria-label="Preview ' + esc(video.title) + '" data-vc-key="' + esc(video.key) + '" data-vc-src="' + esc(video.src) + '" data-vc-title="' + esc(video.title) + '" data-vc-cabin-id="' + esc(cabinId) + '" data-vc-module="' + esc(moduleId) + '">' + EYE + "</button></div>";
  }

  function cardsHtml(videos, cabinId, moduleId) {
    var base = [];
    var mine = [];
    (videos || []).forEach(function (video) {
      if (video.mine) mine.push(video);
      else base.push(video);
    });
    var html = "";
    base.forEach(function (video, index) {
      html += cardHtml(video, index + 1, cabinId, moduleId, false);
    });
    mine.forEach(function (video, index) {
      html += cardHtml(video, base.length + index + 1, cabinId, moduleId, false);
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

  function cabinChoices() {
    var root = catalogRoot();
    var layout = root && root.layout;
    var list = [];
    if (!layout) return list;
    (layout.cabins || []).forEach(function (id) {
      var group = groupById(id);
      if (group) list.push({ id: id, label: group.name });
    });
    var subs = layout.specials && layout.specials.subCabins || [];
    subs.forEach(function (id) {
      var group = groupById(id);
      if (group) list.push({ id: id, label: "Specials › " + group.name });
    });
    return list;
  }

  function decideCustom(video) {
    var area = video.area || "";
    var title = video.title || "";
    var type = video.type === "pre" || video.type === "post" || video.type === "exercise" ? video.type : "exercise";
    var api = window.V64Place;
    if (api && api.cabinMeta && api.cabinMeta(area)) {
      var meta = api.cabinMeta(area);
      return { cabin: area, modules: [type], special: meta.special, specialType: meta.specialType };
    }
    var hit = api && api.placeCustom ? api.placeCustom(area, title) : null;
    if (hit && hit.cabin && api.cabinMeta && api.cabinMeta(hit.cabin)) {
      return { cabin: hit.cabin, modules: [type], special: hit.special, specialType: hit.special_type };
    }
    var cabin = api && api.cabinForArea ? api.cabinForArea(area) : "sp-posture-mobility";
    var meta = api && api.cabinMeta ? api.cabinMeta(cabin) : null;
    if (!meta) {
      cabin = "sp-posture-mobility";
      meta = api && api.cabinMeta ? api.cabinMeta(cabin) : null;
    }
    return { cabin: cabin, modules: [type], special: !!(meta && meta.special), specialType: (meta && meta.specialType) || null };
  }

  function moveButtonText(cabinId, moduleId) {
    var choices = cabinChoices();
    var choice = null;
    var i;
    for (i = 0; i < choices.length; i++) if (choices[i].id === cabinId) choice = choices[i];
    if (!choice && choices.length) choice = choices[0];
    var mod = moduleId === "pre" || moduleId === "post" || moduleId === "exercise" ? moduleId : "exercise";
    return "Move to " + (choice ? choice.label : "Face") + " · " + moduleLabel(mod);
  }

  function emptyMods() {
    return { pre: [], exercise: [], post: [] };
  }

  function viewBuckets() {
    var groups = catalog() || [];
    var buckets = {};
    var home = {};
    groups.forEach(function (group) {
      buckets[group.id] = emptyMods();
      (group.modules || []).forEach(function (mod) {
        (mod.videos || []).forEach(function (video) {
          buckets[group.id][mod.id].push(video);
          if (!home[video.key]) home[video.key] = [];
          home[video.key].push({ id: group.id, mod: mod.id });
        });
      });
    });
    function removeKey(key) {
      (home[key] || []).forEach(function (at) {
        if (!buckets[at.id]) return;
        buckets[at.id][at.mod] = buckets[at.id][at.mod].filter(function (video) { return video.key !== key; });
      });
      delete home[key];
    }
    function addVideo(cabin, mods, video) {
      if (!buckets[cabin]) return;
      (mods || []).forEach(function (mod) {
        if (buckets[cabin][mod]) buckets[cabin][mod].push(video);
      });
    }
    if (placements && placements !== false) {
      Object.keys(placements).forEach(function (key) {
        var place = placements[key];
        if (!place || !place.cabin || !home[key]) return;
        var existing = null;
        (home[key] || []).forEach(function (at) {
          if (existing || !buckets[at.id]) return;
          buckets[at.id][at.mod].some(function (video) {
            if (video.key === key) { existing = video; return true; }
            return false;
          });
        });
        removeKey(key);
        if (existing) addVideo(place.cabin, place.modules || ["exercise"], existing);
      });
    }
    custom.forEach(function (video) {
      var place = placements && placements !== false ? placements[video.r2Key] : null;
      var decided = place
        ? { cabin: place.cabin, modules: place.modules || [video.type || "exercise"], special: !!place.special, specialType: place.specialType || null }
        : decideCustom(video);
      addVideo(decided.cabin, decided.modules, {
        key: video.r2Key,
        src: video.url,
        title: video.title || "Video",
        cabin: "",
        group: video.area || "",
        legacyGroup: window.V64Place ? window.V64Place.legacyGroupFor(video.area || decided.cabin) : (video.area || ""),
        phases: [],
        mine: true,
        special: !!decided.special,
        specialType: decided.specialType || null
      });
    });
    return buckets;
  }

  function uniqueCount(mods) {
    var seen = {};
    var n = 0;
    ["pre", "exercise", "post"].forEach(function (id) {
      (mods[id] || []).forEach(function (video) {
        if (seen[video.key]) return;
        seen[video.key] = true;
        n += 1;
      });
    });
    return n;
  }

  function moveFields(selectedCabin, selectedModule) {
    var locked = placements === false;
    var html = '<div class="vc-move">';
    if (locked) {
      html += '<p class="vc-move-hint">Moving videos unlocks after the v64 server update.</p>';
      html += '<button type="button" class="vc-move-go" disabled>Move</button></div>';
      return html;
    }
    html += '<label>Cabin<select class="vc-move-cabin">';
    cabinChoices().forEach(function (choice) {
      html += '<option value="' + esc(choice.id) + '"' + (choice.id === selectedCabin ? " selected" : "") + ">" + esc(choice.label) + "</option>";
    });
    html += "</select></label>";
    html += '<label>Module<select class="vc-move-module">';
    ["pre", "exercise", "post"].forEach(function (id) {
      html += '<option value="' + id + '"' + (id === selectedModule ? " selected" : "") + ">" + esc(moduleLabel(id)) + "</option>";
    });
    html += "</select></label>";
    var picked = moveButtonText(selectedCabin, selectedModule);
    html += '<button type="button" class="vc-move-go">' + esc(picked) + "</button>";
    html += "</div>";
    return html;
  }

  function cabinSection(group, buckets) {
    if (!group) return "";
    var mods = buckets[group.id] || emptyMods();
    var open = openGroup === group.id;
    var html = '<section class="vc-block' + (open ? " is-open" : "") + '">';
    html += '<button type="button" class="vc-cabin" data-vc-group="' + esc(group.id) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
      '<span class="vc-name">' + esc(group.name) + '</span><span class="vc-count">' + uniqueCount(mods) + "</span></button>";
    if (open) {
      html += '<div class="vc-mods"><div class="vc-mods-inner">';
      (group.modules || []).forEach(function (mod) {
        var list = mods[mod.id] || [];
        var modOpen = openModule === mod.id;
        var marked = !!(pendingFile && uploadTarget && uploadTarget.groupId === group.id && uploadTarget.moduleId === mod.id);
        html += '<div class="vc-mod-block' + (modOpen ? " is-open" : "") + '">';
        html += '<button type="button" class="vc-mod' + (marked ? " is-upload" : "") + '" data-vc-module="' + esc(mod.id) + '" aria-expanded="' + (modOpen ? "true" : "false") + '">' +
          '<span class="vc-name">' + esc(mod.name) + '</span><span class="vc-count">' + list.length + "</span></button>";
        if (marked && modOpen) {
          html += '<button type="button" class="vc-save" id="vc-save"' + (uploading ? " disabled" : "") + ">Save video to " + esc(group.name) + " · " + esc(mod.name) + "</button>";
        }
        if (modOpen) html += '<div class="vc-cards">' + cardsHtml(list, group.id, mod.id) + "</div>";
        html += "</div>";
      });
      html += "</div></div>";
    }
    html += "</section>";
    return html;
  }

  function render() {
    var root = document.getElementById("vc-list");
    var catalogRootNow = catalogRoot();
    var groups = catalog();
    if (!root || !groups || !catalogRootNow || !catalogRootNow.layout) return;
    var buckets = viewBuckets();
    var layout = catalogRootNow.layout;
    var html = "";
    if (specialsOpen) {
      html += '<button type="button" class="vc-specials-back" data-vc-specials-back>‹ Specials</button>';
      (layout.specials.subCabins || []).forEach(function (id) {
        html += cabinSection(groupById(id), buckets);
      });
    } else {
      (layout.cabins || []).forEach(function (id) {
        html += cabinSection(groupById(id), buckets);
      });
      var specialsCount = 0;
      (layout.specials.subCabins || []).forEach(function (id) {
        specialsCount += uniqueCount(buckets[id] || emptyMods());
      });
      html += '<section class="vc-block">';
      html += '<button type="button" class="vc-cabin vc-specials" data-vc-specials="open" aria-expanded="false">' +
        '<span class="vc-name">Specials</span><span class="vc-count">' + specialsCount + "</span></button>";
      html += "</section>";
    }
    root.innerHTML = html;
    paintUploadBox();
    paintPreviewMove();
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
      var decided = decideCustom(video);
      var legacy = window.V64Place ? window.V64Place.legacyGroupFor(video.area || decided.cabin) : (video.area || "");
      window.NexusBuilder.remember({
        key: video.r2Key,
        title: video.title,
        src: video.url,
        cabin: "",
        cabinId: decided.cabin,
        group: legacy,
        legacyGroup: legacy,
        special: !!decided.special,
        specialType: decided.specialType || "",
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
        : "Step 2: Open a cabin below and tap Pre, Main or Post (it glows orange).";
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

  function paintPreviewMove() {
    var panel = document.getElementById("vc-preview-move");
    if (!panel || !previewKey) return;
    panel.innerHTML = moveFields(previewCabin, previewModule);
  }

  function openPreview(title, src, key, cabinId, moduleId) {
    var root = document.getElementById("vc-preview");
    var video = document.getElementById("vc-preview-video");
    if (!root || !video || !src) return;
    previewKey = key || "";
    previewCabin = cabinId || "neck";
    previewModule = moduleId || "exercise";
    var label = root.querySelector(".vc-preview-title");
    if (label) label.textContent = title || "Preview";
    paintPreviewMove();
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.src = src;
    if (window.NexusTrim) window.NexusTrim.watch(video);
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
    previewKey = "";
  }

  function moveVideo(key, cabin, moduleId) {
    if (placements === false || !key || !cabin || !window.nexusFetch) return;
    var row = document.querySelector('.vc-card[data-vc-key="' + key + '"]');
    var article = row && row.closest(".vc-card-wrap, .vc-block");
    if (article) article.classList.add("is-leaving");
    window.nexusFetch("/video-placements", {
      method: "PUT",
      body: { r2Key: key, cabin: cabin, modules: [moduleId] }
    }).then(function (saved) {
      var got = (saved && (saved.placement || saved)) || {};
      if (!placements || placements === false) placements = {};
      placements[key] = {
        cabin: got.cabin || cabin,
        modules: got.modules || [moduleId],
        special: !!got.special,
        specialType: got.specialType || got.special_type || null
      };
      render();
    }).catch(function (err) {
      if (article) article.classList.remove("is-leaving");
      setUploadMsg((err && err.message) || "Could not move that video.", true);
    });
  }

  function readMove(panel) {
    if (!panel) return null;
    var cabin = panel.querySelector(".vc-move-cabin");
    var mod = panel.querySelector(".vc-move-module");
    if (!cabin || !mod) return null;
    return { cabin: cabin.value, moduleId: mod.value };
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

  var quickList = [];
  var quickIndex = 0;
  var quickScroll = 0;
  var quickMove = false;
  var quickSwipe = null;

  function flatClips() {
    var root = catalogRoot();
    var layout = root && root.layout;
    var buckets = viewBuckets();
    var order = [];
    if (layout) {
      (layout.cabins || []).forEach(function (id) { order.push(id); });
      ((layout.specials && layout.specials.subCabins) || []).forEach(function (id) { order.push(id); });
    }
    var list = [];
    order.forEach(function (id) {
      var group = groupById(id);
      var mods = buckets[id] || emptyMods();
      if (!group) return;
      (group.modules || []).forEach(function (mod) {
        var videos = mods[mod.id] || [];
        videos.forEach(function (video, index) {
          list.push({
            key: video.key,
            src: video.src,
            title: video.title || "Video",
            cabinId: group.id,
            cabinName: group.name,
            moduleId: mod.id,
            moduleName: mod.name,
            indexInModule: index,
            moduleCount: videos.length
          });
        });
      });
    });
    return list;
  }

  function quickLabel(item) {
    return item.cabinName + " · " + item.moduleName + " · " + (item.indexInModule + 1) + " of " + item.moduleCount;
  }

  function showQuick(keepPlaying) {
    var item = quickList[quickIndex];
    var root = document.getElementById("vc-quick");
    var video = document.getElementById("vc-quick-video");
    var ahead = document.getElementById("vc-quick-next");
    if (!item || !root || !video) return;
    previewKey = item.key;
    previewCabin = item.cabinId;
    previewModule = item.moduleId;
    root.querySelector(".vc-quick-title").textContent = item.title;
    root.querySelector(".vc-quick-label").textContent = quickLabel(item);
    if (!keepPlaying || video.getAttribute("src") !== item.src) {
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.src = item.src;
      if (window.NexusTrim) window.NexusTrim.watch(video);
      var play = video.play();
      if (play && typeof play.catch === "function") play.catch(function () {});
    }
    var following = quickList[quickIndex + 1];
    if (ahead) {
      ahead.preload = "metadata";
      if (following && following.src) ahead.src = following.src;
      else ahead.removeAttribute("src");
    }
    var sheet = document.getElementById("vc-quick-move");
    if (sheet) {
      sheet.hidden = !quickMove;
      sheet.innerHTML = quickMove ? moveFields(item.cabinId, item.moduleId) : "";
    }
    var trimPanel = document.getElementById("vc-trim");
    if (trimPanel) trimPanel.hidden = !trimOpen;
    if (!trimOpen && window.NexusTrim) window.NexusTrim.suspend(video, false);
  }

  function openQuick(key) {
    quickList = flatClips();
    quickIndex = 0;
    var i;
    for (i = 0; i < quickList.length; i++) {
      if (quickList[i].key === key) { quickIndex = i; break; }
    }
    if (!quickList.length) return;
    quickScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    quickMove = false;
    var root = document.getElementById("vc-quick");
    if (!root) return;
    root.hidden = false;
    document.body.classList.add("vc-quick-open");
    showQuick(false);
  }

  function closeQuick() {
    var root = document.getElementById("vc-quick");
    var video = document.getElementById("vc-quick-video");
    var ahead = document.getElementById("vc-quick-next");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (ahead) {
      ahead.removeAttribute("src");
      ahead.load();
    }
    if (root) root.hidden = true;
    document.body.classList.remove("vc-quick-open");
    quickMove = false;
    window.scrollTo(0, quickScroll);
  }

  function stepQuick(dir) {
    var next = quickIndex + dir;
    if (next < 0 || next >= quickList.length) return;
    quickIndex = next;
    quickMove = false;
    trimOpen = false;
    showQuick(false);
  }

  var trimOpen = false;
  var trimDraft = { start: 0, end: 0 };
  var trimDrag = "";
  var trimToastTimer = 0;

  function fmtTime(value) {
    var t = Math.max(0, Number(value) || 0);
    var mins = Math.floor(t / 60);
    var secs = t - mins * 60;
    var whole = Math.floor(secs);
    var tenth = Math.min(9, Math.floor((secs - whole) * 10 + 1e-4));
    return mins + ":" + (whole < 10 ? "0" : "") + whole + "." + tenth;
  }

  function quickDuration() {
    var video = document.getElementById("vc-quick-video");
    return video && isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }

  function paintTrim() {
    var panel = document.getElementById("vc-trim");
    if (!panel) return;
    panel.hidden = !trimOpen;
    if (!trimOpen) return;
    var duration = quickDuration();
    var end = trimDraft.end > 0 ? trimDraft.end : duration;
    if (duration && end > duration) end = duration;
    trimDraft.end = end;
    var startPct = duration ? (trimDraft.start / duration) * 100 : 0;
    var endPct = duration ? (end / duration) * 100 : 100;
    panel.querySelector(".vc-trim-span").style.left = startPct + "%";
    panel.querySelector(".vc-trim-span").style.width = Math.max(0, endPct - startPct) + "%";
    panel.querySelector(".vc-trim-start").style.left = startPct + "%";
    panel.querySelector(".vc-trim-end").style.left = endPct + "%";
    panel.querySelector(".vc-trim-start-time").textContent = fmtTime(trimDraft.start);
    panel.querySelector(".vc-trim-end-time").textContent = fmtTime(end);
  }

  function trimToast(text) {
    var el = document.getElementById("vc-trim-toast");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    clearTimeout(trimToastTimer);
    if (text) trimToastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function openTrim() {
    var video = document.getElementById("vc-quick-video");
    var duration = quickDuration();
    var saved = window.NexusTrim && previewKey ? window.NexusTrim.get(previewKey) : null;
    trimDraft = {
      start: saved ? saved.start : 0,
      end: saved && saved.end != null ? saved.end : duration
    };
    trimOpen = true;
    if (window.NexusTrim) window.NexusTrim.suspend(video, true);
    paintTrim();
  }

  function closeTrim() {
    var video = document.getElementById("vc-quick-video");
    trimOpen = false;
    if (window.NexusTrim) window.NexusTrim.suspend(video, false);
    paintTrim();
  }

  function seekTrim(which) {
    var video = document.getElementById("vc-quick-video");
    if (!video) return;
    try { video.currentTime = which === "end" ? trimDraft.end : trimDraft.start; } catch (err) { /* still loading */ }
  }

  function moveTrimHandle(clientX, which) {
    var track = document.querySelector("#vc-trim .vc-trim-track");
    var duration = quickDuration();
    if (!track || !duration) return;
    var rect = track.getBoundingClientRect();
    var ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
    var time = Math.min(duration, Math.max(0, ratio * duration));
    if (which === "start") trimDraft.start = Math.min(time, trimDraft.end - 0.5);
    else trimDraft.end = Math.max(time, trimDraft.start + 0.5);
    if (trimDraft.start < 0) trimDraft.start = 0;
    if (trimDraft.end > duration) trimDraft.end = duration;
    seekTrim(which);
    paintTrim();
  }

  function nudgeTrim(which, delta) {
    var duration = quickDuration();
    if (!duration) return;
    if (which === "start") trimDraft.start = Math.min(Math.max(0, trimDraft.start + delta), trimDraft.end - 0.5);
    else trimDraft.end = Math.max(Math.min(duration, trimDraft.end + delta), trimDraft.start + 0.5);
    seekTrim(which);
    paintTrim();
  }

  function previewTrim() {
    var video = document.getElementById("vc-quick-video");
    if (!video) return;
    try { video.currentTime = trimDraft.start; } catch (err) { /* wait */ }
    var play = video.play();
    if (play && typeof play.catch === "function") play.catch(function () {});
  }

  function saveTrim() {
    var item = quickList[quickIndex];
    var duration = quickDuration();
    if (!item || !window.NexusTrim) {
      trimToast("Could not save the trim.");
      return;
    }
    var end = trimDraft.end;
    if (duration && end >= duration - 0.05) end = null;
    window.NexusTrim.save(item.key, trimDraft.start, end).then(function () {
      closeTrim();
      seekTrim("start");
    }).catch(function () {
      trimToast("Could not save the trim.");
      paintTrim();
    });
  }

  function resetTrim() {
    var item = quickList[quickIndex];
    if (!item || !window.NexusTrim) {
      trimToast("Could not save the trim.");
      return;
    }
    window.NexusTrim.clear(item.key).then(function () {
      trimDraft = { start: 0, end: quickDuration() };
      seekTrim("start");
      paintTrim();
    }).catch(function () {
      trimToast("Could not save the trim.");
    });
  }

  function onClick(event) {
    var eye = event.target.closest(".vc-eye");
    if (eye) {
      event.preventDefault();
      event.stopPropagation();
      openPreview(
        eye.getAttribute("data-vc-title"),
        eye.getAttribute("data-vc-src"),
        eye.getAttribute("data-vc-key"),
        eye.getAttribute("data-vc-cabin-id"),
        eye.getAttribute("data-vc-module")
      );
      return;
    }
    if (event.target.closest(".vc-move-go")) {
      event.preventDefault();
      event.stopPropagation();
      var panel = event.target.closest(".vc-move");
      var pickedMove = readMove(panel);
      if (pickedMove && previewKey) moveVideo(previewKey, pickedMove.cabin, pickedMove.moduleId);
      return;
    }
    if (event.target.closest("[data-vc-specials-back]")) {
      event.preventDefault();
      specialsOpen = false;
      openGroup = "";
      openModule = "";
      uploadTarget = null;
      render();
      return;
    }
    if (event.target.closest("[data-vc-specials]")) {
      event.preventDefault();
      specialsOpen = true;
      openGroup = "";
      openModule = "";
      uploadTarget = null;
      render();
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
      if (building() && window.NexusBuilder && window.NexusBuilder.takeCard && window.NexusBuilder.takeCard({
        key: card.getAttribute("data-vc-key"),
        src: card.getAttribute("data-vc-src"),
        cabin: card.getAttribute("data-vc-cabin"),
        title: card.getAttribute("data-vc-title"),
        group: card.getAttribute("data-vc-group")
      })) return;
      if (!building()) openQuick(card.getAttribute("data-vc-key"));
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
    if (!document.getElementById("vc-quick")) {
      var quick = document.createElement("div");
      quick.id = "vc-quick";
      quick.hidden = true;
      quick.innerHTML =
        '<div class="vc-quick-card" role="dialog" aria-modal="true" aria-label="Video">' +
          '<div class="vc-quick-top">' +
            '<button type="button" class="vc-quick-edit">Edit</button>' +
            '<button type="button" class="vc-quick-x" aria-label="Close">×</button>' +
          "</div>" +
          '<p class="vc-quick-title"></p>' +
          '<p class="vc-quick-label"></p>' +
          '<video id="vc-quick-video" playsinline preload="metadata"></video>' +
          '<div id="vc-trim" class="vc-trim" hidden>' +
            '<div class="vc-trim-track">' +
              '<div class="vc-trim-rail"></div>' +
              '<div class="vc-trim-span"></div>' +
              '<button type="button" class="vc-trim-handle vc-trim-start" data-trim-handle="start" aria-label="Trim start"></button>' +
              '<button type="button" class="vc-trim-handle vc-trim-end" data-trim-handle="end" aria-label="Trim end"></button>' +
            "</div>" +
            '<div class="vc-trim-times">' +
              '<span><button type="button" data-trim-nudge="start" data-trim-delta="-0.1">-0.1</button><span class="vc-trim-start-time">0:00.0</span><button type="button" data-trim-nudge="start" data-trim-delta="0.1">+0.1</button></span>' +
              '<span><button type="button" data-trim-nudge="end" data-trim-delta="-0.1">-0.1</button><span class="vc-trim-end-time">0:00.0</span><button type="button" data-trim-nudge="end" data-trim-delta="0.1">+0.1</button></span>' +
            "</div>" +
            '<div class="vc-trim-actions">' +
              '<button type="button" class="vc-trim-preview">Preview</button>' +
              '<button type="button" class="vc-trim-save">Save</button>' +
              '<button type="button" class="vc-trim-reset">Reset</button>' +
              '<button type="button" class="vc-trim-cancel">Cancel</button>' +
            "</div>" +
          "</div>" +
          '<video id="vc-quick-next" class="vc-quick-preload" preload="metadata" muted playsinline></video>' +
          '<div class="vc-quick-nav">' +
            '<button type="button" class="vc-quick-back">Back</button>' +
            '<button type="button" class="vc-quick-move" aria-label="Move">Move</button>' +
            '<button type="button" class="vc-quick-next">Next</button>' +
          "</div>" +
          '<div id="vc-quick-move" hidden></div>' +
          '<p id="vc-trim-toast" class="vc-trim-toast" hidden></p>' +
        "</div>";
      document.body.appendChild(quick);
      quick.addEventListener("click", function (event) {
        if (event.target.closest(".vc-quick-x") || event.target === quick) {
          event.preventDefault();
          closeQuick();
          return;
        }
        if (event.target.closest(".vc-quick-next")) {
          event.preventDefault();
          stepQuick(1);
          return;
        }
        if (event.target.closest(".vc-quick-back")) {
          event.preventDefault();
          stepQuick(-1);
          return;
        }
        if (event.target.closest(".vc-quick-edit")) {
          event.preventDefault();
          if (trimOpen) closeTrim();
          else openTrim();
          return;
        }
        if (event.target.closest(".vc-trim-preview")) { event.preventDefault(); previewTrim(); return; }
        if (event.target.closest(".vc-trim-save")) { event.preventDefault(); saveTrim(); return; }
        if (event.target.closest(".vc-trim-reset")) { event.preventDefault(); resetTrim(); return; }
        if (event.target.closest(".vc-trim-cancel")) { event.preventDefault(); closeTrim(); return; }
        var nudge = event.target.closest("[data-trim-nudge]");
        if (nudge) {
          event.preventDefault();
          nudgeTrim(nudge.getAttribute("data-trim-nudge"), Number(nudge.getAttribute("data-trim-delta")));
          return;
        }
        if (event.target.closest(".vc-quick-move")) {
          event.preventDefault();
          quickMove = !quickMove;
          showQuick(true);
          return;
        }
        if (event.target.closest(".vc-move-go")) {
          event.preventDefault();
          var pickedMove = readMove(document.getElementById("vc-quick-move"));
          if (pickedMove && previewKey) moveVideo(previewKey, pickedMove.cabin, pickedMove.moduleId);
        }
      });
      var trimPanel = document.getElementById("vc-trim");
      trimPanel.addEventListener("pointerdown", function (event) {
        var handle = event.target.closest(".vc-trim-handle");
        if (!handle) return;
        event.preventDefault();
        event.stopPropagation();
        trimDrag = handle.getAttribute("data-trim-handle");
        handle.setPointerCapture(event.pointerId);
        moveTrimHandle(event.clientX, trimDrag);
      });
      trimPanel.addEventListener("pointermove", function (event) {
        if (!trimDrag) return;
        moveTrimHandle(event.clientX, trimDrag);
      });
      trimPanel.addEventListener("pointerup", function () { trimDrag = ""; });
      trimPanel.addEventListener("pointercancel", function () { trimDrag = ""; });
      document.getElementById("vc-quick-video").addEventListener("loadedmetadata", paintTrim);
      document.getElementById("vc-quick-video").addEventListener("timeupdate", function () {
        var video = document.getElementById("vc-quick-video");
        if (!trimOpen || !video) return;
        var end = trimDraft.end || video.duration;
        if (video.currentTime >= end - 0.04) {
          video.pause();
          try { video.currentTime = end; } catch (err) { /* hold the out point */ }
        }
      });
      quick.addEventListener("pointerdown", function (event) {
        if (event.target.closest("button, select, a, .vc-trim")) return;
        quickSwipe = { x: event.clientX, y: event.clientY };
      });
      quick.addEventListener("pointerup", function (event) {
        if (!quickSwipe) return;
        var dx = event.clientX - quickSwipe.x;
        var dy = event.clientY - quickSwipe.y;
        quickSwipe = null;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        stepQuick(dx < 0 ? 1 : -1);
      });
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
          '<div id="vc-preview-move"></div>' +
        "</div>";
      document.body.appendChild(preview);
      preview.addEventListener("click", function (event) {
        if (event.target.closest(".vc-move-go")) {
          event.preventDefault();
          var pickedMove = readMove(document.getElementById("vc-preview-move"));
          if (pickedMove && previewKey) moveVideo(previewKey, pickedMove.cabin, pickedMove.moduleId);
          return;
        }
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
    function paintMoveLabel(event) {
      var panel = event.target && event.target.closest && event.target.closest(".vc-move");
      if (!panel) return;
      var cabin = panel.querySelector(".vc-move-cabin");
      var mod = panel.querySelector(".vc-move-module");
      var go = panel.querySelector(".vc-move-go");
      if (!cabin || !mod || !go || go.disabled) return;
      go.textContent = moveButtonText(cabin.value, mod.value);
    }
    document.addEventListener("change", paintMoveLabel);
    document.addEventListener("input", paintMoveLabel);
    loadCustom();
    loadStorage();
    loadPlacements();
    if (window.NexusTrim) window.NexusTrim.load();
  }

  function loadPlacements() {
    if (!window.nexusFetch) {
      placements = false;
      render();
      return Promise.resolve();
    }
    return window.nexusFetch("/video-placements").then(function (payload) {
      placements = {};
      ((payload && payload.placements) || []).forEach(function (row) {
        if (!row || !row.r2Key) return;
        placements[row.r2Key] = {
          cabin: row.cabin,
          modules: row.modules || ["exercise"],
          special: !!row.special,
          specialType: row.specialType || null
        };
      });
      render();
    }).catch(function () {
      placements = false;
      render();
    });
  }

  window.NexusCards = {
    render: render,
    syncPicked: syncPicked,
    moveButtonText: moveButtonText,
    decideCustom: decideCustom,
    flatClips: flatClips,
    quickLabel: quickLabel
  };

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
