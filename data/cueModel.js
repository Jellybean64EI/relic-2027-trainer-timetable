/* Cue view model. Production does not load the fixture pack.
   A validated cue is joined by video id and must name the same r2 key.
   Missing clip notes stay "Awaiting review". They are not filled from the title. */
window.NexusCue = (function () {
  var CANNED_LEAD = "Left-Lead. 3-second ease.";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function referenceKind(title) {
    var text = String(title || "").trim();
    if (/^\[?REF\]?\b/i.test(text) || /^REF\b/.test(text)) return "REF";
    if (/^\[?EDU\]?\b/i.test(text) || /^EDU\b/.test(text)) return "EDU";
    return "";
  }

  function awaitingField(kind) {
    return { state: "awaiting", text: "", kind: kind || "" };
  }

  function textField(text, source) {
    var value = clean(text);
    if (!value) return awaitingField(source);
    return { state: "text", text: value, source: source || "" };
  }

  function naField(reason) {
    return { state: "na", text: clean(reason) || "Not used for this clip.", kind: "na" };
  }

  function linesOf(text) {
    return String(text || "").split(/\n+/).map(clean).filter(Boolean);
  }

  function packRows() {
    var pack = window.NEXUS_CUE_PACK;
    return Array.isArray(pack) ? pack : [];
  }

  function identityBlocks(identity) {
    return !!(identity && (identity.status === "reserved" || identity.status === "deleted"));
  }

  function packFor(identity) {
    if (!identity || !identity.videoId || identityBlocks(identity)) {
      return { row: null, reject: identityBlocks(identity) ? identity.status : "" };
    }
    var hits = packRows().filter(function (row) { return row && Number(row.videoId) === Number(identity.videoId); });
    if (!hits.length) return { row: null, reject: "" };
    if (hits.length > 1) return { row: null, reject: "ambiguous" };
    var row = hits[0];
    if (row.r2Key && identity.r2Key && row.r2Key !== identity.r2Key) return { row: null, reject: "r2-mismatch" };
    return { row: row, reject: "" };
  }

  function fromPack(row, identity) {
    var dose = row.dose || {};
    var doseState = dose.state === "na" ? naField(dose.reason) : (dose.sets || dose.reps || dose.hold || dose.rest)
      ? { state: "value", sets: dose.sets, reps: dose.reps, hold: dose.hold, rest: dose.rest }
      : awaitingField();
    var leads = Array.isArray(row.leads) ? row.leads.map(clean).filter(Boolean).slice(0, 3) : [];
    var steps = Array.isArray(row.steps) ? row.steps.map(clean).filter(Boolean) : [];
    return {
      origin: row.fixture ? "fixture" : "pack",
      videoId: identity.videoId,
      title: clean(row.title) || clean(identity.title),
      reference: row.reference || referenceKind(row.title),
      dose: doseState,
      leads: leads,
      leadsState: leads.length === 3 ? "text" : "awaiting",
      steps: steps,
      breathing: row.breathing === false ? naField(row.breathingReason) : textField(row.breathing, row.fieldSource && row.fieldSource.breathing),
      avoid: textField(row.avoid, row.fieldSource && row.fieldSource.avoid),
      sources: Array.isArray(row.sources) ? row.sources.map(clean).filter(Boolean) : [],
      progressions: Array.isArray(row.progressions) ? row.progressions.map(clean).filter(Boolean) : [],
      reject: ""
    };
  }

  function doseFromMetrics(text) {
    var raw = clean(text);
    if (!raw) return awaitingField();
    var parts = { sets: "", reps: "", hold: "", rest: "" };
    raw.split("|").forEach(function (piece) {
      var match = /^\s*(sets|reps|hold|rest)\s*:\s*(.+)$/i.exec(piece);
      if (match) parts[match[1].toLowerCase()] = clean(match[2]);
    });
    if (parts.sets && parts.reps && parts.hold && parts.rest) {
      return { state: "value", sets: parts.sets, reps: parts.reps, hold: parts.hold, rest: parts.rest };
    }
    return { state: "legacy", text: raw };
  }

  function fromLegacyClip(entry) {
    var lead = clean(entry.leadRule);
    var leads = lead && lead !== CANNED_LEAD ? [lead] : [];
    return {
      origin: "legacy-id",
      videoId: 0,
      title: clean(entry.title),
      reference: referenceKind(entry.title),
      dose: doseFromMetrics(entry.metrics),
      leads: leads,
      leadsState: leads.length ? "partial" : "awaiting",
      steps: linesOf(entry.doThis),
      breathing: textField(entry.breathing),
      avoid: textField(entry.avoidThis),
      sources: ["Existing clip note"],
      progressions: [],
      reject: ""
    };
  }

  function awaiting(title) {
    var kind = referenceKind(title);
    return {
      origin: "awaiting",
      videoId: 0,
      title: clean(title),
      reference: kind,
      dose: awaitingField(),
      leads: [],
      leadsState: "awaiting",
      steps: [],
      breathing: awaitingField(),
      avoid: awaitingField(),
      sources: [],
      progressions: [],
      reject: ""
    };
  }

  function resolve(input) {
    var query = input || {};
    var identity = query.identity || null;
    var title = query.title || (identity && identity.title) || "";
    var packed = packFor(identity);
    if (packed.row) return fromPack(packed.row, identity);
    var legacy = query.legacy;
    if (legacy && legacy.source === "clip" && legacy.clipId && query.driveId && String(legacy.clipId) === String(query.driveId)) {
      return fromLegacyClip(legacy);
    }
    var blank = awaiting(title);
    blank.reject = packed.reject || "";
    return blank;
  }

  function fieldText(field) {
    if (!field || field.state === "awaiting") return "Awaiting review";
    if (field.state === "na") return "Not applicable. " + (field.text || "");
    return field.text || "Awaiting review";
  }

  function doseHtml(dose) {
    if (!dose || dose.state === "awaiting") {
      return '<p class="cue-await">Awaiting review</p>';
    }
    if (dose.state === "na") return '<p class="cue-na">' + esc(fieldText(dose)) + "</p>";
    if (dose.state === "legacy") return '<p class="cue-legacy">' + esc(dose.text) + "</p>";
    return '<dl class="cue-dose">' +
      "<div><dt>Sets</dt><dd>" + esc(dose.sets) + "</dd></div>" +
      "<div><dt>Reps</dt><dd>" + esc(dose.reps) + "</dd></div>" +
      "<div><dt>Hold</dt><dd>" + esc(dose.hold) + "</dd></div>" +
      "<div><dt>Rest</dt><dd>" + esc(dose.rest) + "</dd></div>" +
      "</dl>";
  }

  function listHtml(items, awaitingLabel) {
    if (!items || !items.length) return '<p class="cue-await">' + esc(awaitingLabel || "Awaiting review") + "</p>";
    return "<ol>" + items.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ol>";
  }

  function render(view) {
    var cue = view || awaiting("");
    var banner = "";
    if (cue.reference === "REF" || cue.reference === "EDU") {
      banner = '<p class="cue-ref">' + (cue.reference === "EDU" ? "Education clip." : "Reference clip.") + " Not a home drill.</p>";
    }
    var leadsNote = cue.leadsState === "partial" ? '<p class="cue-await">The other lead notes are awaiting review.</p>' : "";
    var extra = "";
    if ((cue.sources && cue.sources.length) || (cue.progressions && cue.progressions.length)) {
      extra = "<details class=\"cue-more\"><summary>Sources and progressions</summary>";
      if (cue.sources.length) extra += "<p>" + cue.sources.map(esc).join("<br>") + "</p>";
      if (cue.progressions.length) extra += "<ol>" + cue.progressions.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ol>";
      extra += "</details>";
    }
    return banner +
      '<h2 class="forensic-title" id="forensic-title">' + esc(cue.title || "Clip") + "</h2>" +
      '<section class="cue-block"><h3>Dose</h3>' + doseHtml(cue.dose) + "</section>" +
      '<section class="cue-block" id="forensic-lead"><h3>3 lead notes</h3>' + listHtml(cue.leads) + leadsNote + "</section>" +
      '<section class="cue-block" id="forensic-do"><h3>Do this</h3>' + listHtml(cue.steps) + "</section>" +
      '<section class="cue-block" id="forensic-breath"><h3>Breathing</h3><p>' + esc(fieldText(cue.breathing)) + "</p></section>" +
      '<section class="cue-block" id="forensic-avoid"><h3>Avoid</h3><p>' + esc(fieldText(cue.avoid)) + "</p></section>" +
      extra;
  }

  return {
    CANNED_LEAD: CANNED_LEAD,
    resolve: resolve,
    render: render,
    referenceKind: referenceKind
  };
})();
