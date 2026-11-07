/* Cabin cue editor. Notes are manual and are not footage-verified.
   Saves go to PUT /video-cues, which uses the same X-Nexus-Key gate as other writes. */
window.NexusCueEdit = (function () {
  var byId = {};
  var snapshot = "";
  var editing = false;
  var saving = false;

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
  }

  function emptyCue() {
    return {
      leads: ["", "", ""],
      steps: [],
      dose: { sets: "", reps: "", hold: "", rest: "" },
      breathing: "",
      avoid: "",
      source: ""
    };
  }

  function normalize(input) {
    var src = input || {};
    var leadsIn = Array.isArray(src.leads) ? src.leads : [];
    var dose = src.dose || {};
    return {
      leads: [0, 1, 2].map(function (index) { return clean(leadsIn[index], 180); }),
      steps: (Array.isArray(src.steps) ? src.steps : []).map(function (step) { return clean(step, 280); }).filter(Boolean).slice(0, 8),
      dose: {
        sets: clean(dose.sets, 40),
        reps: clean(dose.reps, 40),
        hold: clean(dose.hold, 40),
        rest: clean(dose.rest, 40)
      },
      breathing: clean(src.breathing, 280),
      avoid: clean(src.avoid, 280),
      source: clean(src.source, 200)
    };
  }

  function blank(cue) {
    var row = normalize(cue);
    return !row.leads.some(Boolean) && !row.steps.length && !row.dose.sets && !row.dose.reps && !row.dose.hold && !row.dose.rest && !row.breathing && !row.avoid && !row.source;
  }

  function identityError(identity, videoId, r2Key) {
    if (!identity || !identity.videoId) return "This video has no permanent id yet.";
    if (identity.status === "reserved" || identity.status === "deleted") return "This id is " + identity.status + " and cannot store cues.";
    if (Number(identity.videoId) !== Number(videoId) || !identity.r2Key || identity.r2Key !== r2Key) return "The id does not match this video.";
    return "";
  }

  function remember(row) {
    if (!row || !row.videoId || !row.r2Key) return;
    byId[Number(row.videoId)] = {
      videoId: Number(row.videoId),
      r2Key: row.r2Key,
      origin: "manual",
      cue: normalize(row.cue),
      updatedAt: row.updatedAt || ""
    };
  }

  function forget(videoId) {
    delete byId[Number(videoId)];
  }

  function forIdentity(identity) {
    if (!identity || !identity.videoId || identity.status === "reserved" || identity.status === "deleted") return null;
    var row = byId[Number(identity.videoId)];
    if (!row || row.r2Key !== identity.r2Key) return null;
    return row;
  }

  function load() {
    if (!window.nexusFetch) return Promise.resolve();
    return window.nexusFetch("/video-cues").then(function (payload) {
      byId = {};
      ((payload && payload.cues) || []).forEach(remember);
      if (window.repaintCueSheet) window.repaintCueSheet();
      paint();
    }).catch(function () {});
  }

  function field(form, name) {
    var node = form.elements[name];
    return node ? node.value : "";
  }

  function readForm(form) {
    var steps = String(field(form, "steps") || "").split(/\n+/);
    return normalize({
      leads: [field(form, "lead1"), field(form, "lead2"), field(form, "lead3")],
      steps: steps,
      dose: {
        sets: field(form, "sets"),
        reps: field(form, "reps"),
        hold: field(form, "hold"),
        rest: field(form, "rest")
      },
      breathing: field(form, "breathing"),
      avoid: field(form, "avoid"),
      source: field(form, "source")
    });
  }

  function prefill(identity, manual, view) {
    if (manual && manual.cue) return normalize(manual.cue);
    var cue = emptyCue();
    if (!view) return cue;
    (view.leads || []).slice(0, 3).forEach(function (lead, index) { cue.leads[index] = lead; });
    cue.steps = (view.steps || []).slice();
    if (view.dose && view.dose.state === "value") {
      cue.dose.sets = view.dose.sets || "";
      cue.dose.reps = view.dose.reps || "";
      cue.dose.hold = view.dose.hold || "";
      cue.dose.rest = view.dose.rest || "";
    }
    if (view.breathing && view.breathing.state === "text") cue.breathing = view.breathing.text;
    if (view.avoid && view.avoid.state === "text") cue.avoid = view.avoid.text;
    return normalize(cue);
  }

  function setStatus(text, kind) {
    var node = document.getElementById("vc-cue-status");
    if (!node) return;
    node.textContent = text || "";
    node.className = "vc-cue-status" + (kind ? " is-" + kind : "");
  }

  function currentIdentity() {
    if (!window.NexusCards || !window.NexusCards.identityByKey) return null;
    var key = window.NexusCards.previewKey ? window.NexusCards.previewKey() : "";
    return key ? window.NexusCards.identityByKey(key) : null;
  }

  function currentTitle() {
    var node = document.querySelector("#vc-quick .vc-quick-title");
    return node ? node.textContent : "";
  }

  function viewFor(identity) {
    if (!window.NexusCue) return null;
    return window.NexusCue.resolve({
      title: (identity && identity.title) || currentTitle(),
      identity: identity,
      manual: forIdentity(identity)
    });
  }

  function paint() {
    var read = document.getElementById("vc-cue-read");
    var form = document.getElementById("vc-cue-form");
    var edit = document.getElementById("vc-cue-edit");
    if (!read || !form) return;
    var identity = currentIdentity();
    var manual = forIdentity(identity);
    var view = viewFor(identity);
    form.hidden = !editing;
    read.hidden = editing;
    if (edit) edit.hidden = editing;
    if (!editing) {
      var html = "";
      if (!manual && (!view || view.origin === "awaiting")) html += '<p class="vc-cue-add">Add your cues</p>';
      if (view && window.NexusCue) html += window.NexusCue.render(view);
      read.innerHTML = html;
    }
  }

  function fillForm(cue) {
    var form = document.getElementById("vc-cue-form");
    if (!form) return;
    form.elements.lead1.value = cue.leads[0] || "";
    form.elements.lead2.value = cue.leads[1] || "";
    form.elements.lead3.value = cue.leads[2] || "";
    form.elements.steps.value = (cue.steps || []).join("\n");
    form.elements.sets.value = cue.dose.sets || "";
    form.elements.reps.value = cue.dose.reps || "";
    form.elements.hold.value = cue.dose.hold || "";
    form.elements.rest.value = cue.dose.rest || "";
    form.elements.breathing.value = cue.breathing || "";
    form.elements.avoid.value = cue.avoid || "";
    form.elements.source.value = cue.source || "";
    snapshot = JSON.stringify(readForm(form));
  }

  function dirty() {
    var form = document.getElementById("vc-cue-form");
    if (!editing || !form) return false;
    return JSON.stringify(readForm(form)) !== snapshot;
  }

  function open() {
    var identity = currentIdentity();
    var blocked = identityError(identity, identity && identity.videoId, identity && identity.r2Key);
    if (blocked && (!identity || !identity.videoId || identity.status === "reserved" || identity.status === "deleted")) {
      setStatus(blocked, "error");
      return;
    }
    editing = true;
    saving = false;
    fillForm(prefill(identity, forIdentity(identity), viewFor(identity)));
    var lock = document.getElementById("vc-cue-idlock");
    if (lock) {
      lock.textContent = "";
      if (identity && identity.videoId) {
        var idLine = document.createElement("span");
        idLine.className = "vc-cue-id";
        idLine.textContent = "#" + identity.videoId;
        lock.appendChild(idLine);
      }
      if (identity && identity.r2Key) {
        var keyLine = document.createElement("span");
        keyLine.className = "vc-cue-key";
        keyLine.textContent = identity.r2Key;
        lock.appendChild(keyLine);
      }
    }
    setStatus("", "");
    paint();
    var first = document.querySelector("#vc-cue-form [name=lead1]");
    if (first) {
      try { first.focus({ preventScroll: false }); } catch (err) { first.focus(); }
    }
  }

  function close(force) {
    if (!force && dirty() && !window.confirm("Discard unsaved cue edits?")) return false;
    editing = false;
    saving = false;
    snapshot = "";
    setStatus("", "");
    paint();
    return true;
  }

  function save(event) {
    if (event) event.preventDefault();
    if (saving) return;
    var form = document.getElementById("vc-cue-form");
    var identity = currentIdentity();
    var cue = readForm(form);
    var blocked = identityError(identity, identity && identity.videoId, identity && identity.r2Key);
    if (blocked) {
      setStatus(blocked, "error");
      return;
    }
    if (blank(cue) && forIdentity(identity) && !window.confirm("Clear the saved cues for this video?")) return;
    saving = true;
    setStatus("Saving…", "saving");
    var body = {
      videoId: identity.videoId,
      r2Key: identity.r2Key,
      cue: cue,
      confirmClear: blank(cue)
    };
    window.nexusFetch("/video-cues", { method: "PUT", body: body }).then(function (payload) {
      saving = false;
      if (payload && payload.cleared) forget(identity.videoId);
      else remember(payload);
      editing = false;
      snapshot = "";
      setStatus("Saved", "saved");
      paint();
      if (window.repaintCueSheet) window.repaintCueSheet();
    }).catch(function (err) {
      saving = false;
      setStatus((err && err.message) || "Could not save. Your edits are still here.", "error");
    });
  }

  function mount() {
    var host = document.getElementById("vc-cue");
    if (!host || host.getAttribute("data-ready") === "1") return;
    host.setAttribute("data-ready", "1");
    host.innerHTML =
      '<div class="vc-cue-bar">' +
        '<button type="button" id="vc-cue-edit">Edit cues</button>' +
        '<p id="vc-cue-status" class="vc-cue-status" role="status"></p>' +
      "</div>" +
      '<div id="vc-cue-read" class="vc-cue-read"></div>' +
      '<form id="vc-cue-form" class="vc-cue-form" hidden>' +
        '<p class="vc-cue-idlock" id="vc-cue-idlock"></p>' +
        "<label>Lead 1<input name=\"lead1\" maxlength=\"180\" autocomplete=\"off\" enterkeyhint=\"next\"></label>" +
        "<label>Lead 2<input name=\"lead2\" maxlength=\"180\" autocomplete=\"off\" enterkeyhint=\"next\"></label>" +
        "<label>Lead 3<input name=\"lead3\" maxlength=\"180\" autocomplete=\"off\" enterkeyhint=\"next\"></label>" +
        "<label>Do this steps<textarea name=\"steps\" rows=\"4\" maxlength=\"2000\" placeholder=\"One step on each line\"></textarea></label>" +
        '<div class="vc-cue-dose">' +
          "<label>Sets<input name=\"sets\" maxlength=\"40\" autocomplete=\"off\" inputmode=\"text\"></label>" +
          "<label>Reps<input name=\"reps\" maxlength=\"40\" autocomplete=\"off\"></label>" +
          "<label>Hold<input name=\"hold\" maxlength=\"40\" autocomplete=\"off\"></label>" +
          "<label>Rest<input name=\"rest\" maxlength=\"40\" autocomplete=\"off\"></label>" +
        "</div>" +
        "<label>Breathing<textarea name=\"breathing\" rows=\"2\" maxlength=\"280\"></textarea></label>" +
        "<label>Avoid<textarea name=\"avoid\" rows=\"2\" maxlength=\"280\"></textarea></label>" +
        "<label>Source, optional<input name=\"source\" maxlength=\"200\" autocomplete=\"off\"></label>" +
        '<div class="vc-cue-actions">' +
          '<button type="submit">Save</button>' +
          '<button type="button" id="vc-cue-cancel">Cancel</button>' +
        "</div>" +
      "</form>";
    document.getElementById("vc-cue-edit").addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });
    document.getElementById("vc-cue-cancel").addEventListener("click", function (event) {
      event.preventDefault();
      close(false);
    });
    document.getElementById("vc-cue-form").addEventListener("submit", save);
    paint();
  }

  return {
    emptyCue: emptyCue,
    normalize: normalize,
    blank: blank,
    identityError: identityError,
    remember: remember,
    forget: forget,
    forIdentity: forIdentity,
    prefill: prefill,
    dirty: dirty,
    load: load,
    mount: mount,
    paint: paint,
    open: open,
    close: close,
    editing: function () { return editing; }
  };
})();

if (typeof document !== "undefined") {
  var startCueEdit = function () {
    window.NexusCueEdit.mount();
    window.NexusCueEdit.load();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startCueEdit);
  else startCueEdit();
}
