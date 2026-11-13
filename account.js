/* Account profile and weekly weight log. The server is the source of truth. */
window.NexusAccount = (function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var KG_PER_LB = 0.45359237;
  var profile = null;
  var weights = [];
  var loaded = false;
  var failed = false;
  var editing = false;
  var heightUnit = "cm";
  var logUnit = "kg";
  var startUnit = "kg";

  function $(id) { return document.getElementById(id); }

  function todayKey() {
    var match = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(location.search || "");
    if (match) return match[1];
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
    var map = {};
    fmt.formatToParts(new Date()).forEach(function (part) { map[part.type] = part.value; });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function formatDay(iso) {
    if (!iso) return "";
    var bits = String(iso).split("-");
    return (+bits[2]) + " " + MONTHS[(+bits[1]) - 1] + " " + bits[0];
  }

  function setLine(iso) {
    return iso ? "Set " + formatDay(iso) : "";
  }

  function ageOn(dob, today) {
    if (!dob || !today) return null;
    var born = dob.split("-").map(Number);
    var now = today.split("-").map(Number);
    var years = now[0] - born[0];
    if (now[1] < born[1] || (now[1] === born[1] && now[2] < born[2])) years -= 1;
    return years < 0 ? null : years;
  }

  function cmToFeet(cm) {
    var inches = Math.round(Number(cm) / 2.54);
    return { ft: Math.floor(inches / 12), inch: inches % 12 };
  }

  function feetToCm(ft, inch) {
    return round1(((Number(ft) || 0) * 12 + (Number(inch) || 0)) * 2.54);
  }

  function formatHeight(cm) {
    if (cm == null || cm === "" || !isFinite(Number(cm))) return "";
    var feet = cmToFeet(cm);
    return round1(cm).toFixed(1).replace(/\.0$/, "") + " cm · " + feet.ft + " ft " + feet.inch + " in";
  }

  function poundsOf(kg) {
    return Math.floor(Number(kg) / KG_PER_LB + 0.02);
  }

  function stonesOf(totalLb) {
    var whole = Math.abs(totalLb);
    var st = Math.floor(whole / 14);
    return { st: st, lb: whole - (st * 14) };
  }

  function formatWeight(kg) {
    var n = round1(kg);
    if (!isFinite(n)) return "";
    var parts = stonesOf(poundsOf(n));
    return n.toFixed(1) + " kg · " + parts.st + " st " + parts.lb + " lb";
  }

  function weightDelta(latest, anchor) {
    var diff = round1(latest - anchor);
    var sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
    var kg = (diff > 0 ? "+" : "") + diff.toFixed(1) + " kg";
    var pounds = poundsOf(latest) - poundsOf(anchor);
    var parts = stonesOf(pounds);
    var imp = diff === 0 ? "0 st 0 lb" : sign + parts.st + " st " + parts.lb + " lb";
    return kg + " · " + imp;
  }

  function isoWeek(iso) {
    var bits = String(iso).split("-").map(Number);
    var date = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2]));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((date - start) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + "-W" + (week < 10 ? "0" : "") + week;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function cite(label, value, when, extra) {
    var shown = value || "Tap Edit to add your " + label.toLowerCase();
    var date = value && when ? '<p class="account-cite-date">' + esc(when) + "</p>" : "";
    return '<div class="account-cite"><p class="account-cite-label">' + esc(label) + '</p><p class="account-cite-value">' +
      esc(shown) + (extra ? " " + esc(extra) : "") + "</p>" + date + "</div>";
  }

  function showError(message) {
    var node = $("account-error");
    if (!node) return;
    if (!message) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    var text = $("account-error-text");
    if (text) text.textContent = message;
  }

  function load() {
    if (!window.nexusFetch) {
      failed = true;
      loaded = true;
      return Promise.resolve();
    }
    return Promise.all([
      window.nexusFetch("/account").catch(function (err) { return { missing: true, status: err && err.status }; }),
      window.nexusFetch("/weights").catch(function (err) { return { missing: true, status: err && err.status }; })
    ]).then(function (pair) {
      var account = pair[0] || {};
      var log = pair[1] || {};
      failed = !!(account.missing && account.status !== 404) || !!(log.missing && log.status !== 404);
      profile = account.profile || null;
      weights = log.weights || [];
      loaded = true;
      showError(failed ? "Couldn't load, try again" : "");
    });
  }

  function savedStamp() {
    return profile && profile.updatedAt ? String(profile.updatedAt).slice(0, 10) : "";
  }

  function paintInfo() {
    var host = $("account-info-read");
    if (!host) return;
    var row = profile || {};
    var dob = row.dob || "2000-06-22";
    var name = row.name || "Joseph William Searle";
    var years = ageOn(dob, todayKey());
    var when = savedStamp();
    var html = cite("Name", name, when ? setLine(when) : "Tap Edit to save");
    html += cite("Date of birth", formatDay(dob), when ? setLine(when) : "Tap Edit to save", years == null ? "" : "· age " + years);
    html += row.heightCm == null ? cite("Height", "", "") : cite("Height", formatHeight(row.heightCm), setLine(when));
    if (row.startWeightKg == null) html += cite("Starting weight", "", "");
    else html += '<div class="account-cite"><p class="account-cite-label">Starting weight <span class="account-lock" aria-label="Locked">🔒</span></p><p class="account-cite-value">' +
      esc(formatWeight(row.startWeightKg)) + '</p><p class="account-cite-date">' + esc(setLine(row.startDate)) + "</p></div>";
    host.innerHTML = html;
    var form = $("account-info-form");
    if (form) form.hidden = !editing;
    host.hidden = editing;
    var edit = $("account-info-edit");
    if (edit) edit.hidden = editing;
  }

  function fillInfoForm() {
    var form = $("account-info-form");
    if (!form) return;
    var row = profile || {};
    form.elements.name.value = row.name || "Joseph William Searle";
    form.elements.dob.value = row.dob || "2000-06-22";
    var cm = row.heightCm == null ? "" : row.heightCm;
    form.elements.heightCm.value = cm;
    var feet = cm === "" ? { ft: "", inch: "" } : cmToFeet(cm);
    form.elements.heightFt.value = feet.ft;
    form.elements.heightIn.value = feet.inch;
    var locked = row.startWeightKg != null;
    form.elements.startKg.disabled = locked;
    form.elements.startSt.disabled = locked;
    form.elements.startLb.disabled = locked;
    form.elements.startDate.disabled = locked;
    form.elements.startKg.value = locked ? row.startWeightKg : "";
    form.elements.startDate.value = locked ? row.startDate : todayKey();
    if (locked) {
      var parts = stonesOf(poundsOf(row.startWeightKg));
      form.elements.startSt.value = parts.st;
      form.elements.startLb.value = parts.lb;
    } else {
      form.elements.startSt.value = "";
      form.elements.startLb.value = "";
    }
    paintHeightUnit();
    paintLogUnit("start");
    var fields = $("account-start-fields");
    var lockNote = $("account-start-locked");
    if (fields) fields.hidden = locked;
    if (lockNote) lockNote.hidden = !locked;
  }

  function paintHeightUnit() {
    var cm = $("account-height-cm");
    var ft = $("account-height-ft");
    if (cm) cm.hidden = heightUnit !== "cm";
    if (ft) ft.hidden = heightUnit !== "ft";
  }

  function readHeight() {
    var form = $("account-info-form");
    if (heightUnit === "ft") {
      if (form.elements.heightFt.value === "" && form.elements.heightIn.value === "") return null;
      return feetToCm(form.elements.heightFt.value, form.elements.heightIn.value);
    }
    if (form.elements.heightCm.value === "") return null;
    return round1(form.elements.heightCm.value);
  }

  function readStartKg() {
    var form = $("account-info-form");
    if (profile && profile.startWeightKg != null) return profile.startWeightKg;
    if (startUnit === "st") {
      if (form.elements.startSt.value === "" && form.elements.startLb.value === "") return null;
      return round1(((Number(form.elements.startSt.value) || 0) * 14 + (Number(form.elements.startLb.value) || 0)) * KG_PER_LB);
    }
    if (form.elements.startKg.value === "") return null;
    return round1(form.elements.startKg.value);
  }

  function paintInfoSave(event) {
    if (event) event.preventDefault();
    var form = $("account-info-form");
    var row = profile || {};
    var startKg = readStartKg();
    var startDate = form.elements.startDate.value || null;
    if (row.startWeightKg == null && startKg != null) {
      if (!window.confirm("This locks forever as your anchor")) return;
    }
    var body = {
      name: form.elements.name.value,
      dob: form.elements.dob.value,
      heightCm: readHeight(),
      startWeightKg: row.startWeightKg == null ? startKg : row.startWeightKg,
      startDate: row.startWeightKg == null ? (startKg == null ? null : startDate) : row.startDate
    };
    window.nexusFetch("/account", { method: "PUT", body: body }).then(function (payload) {
      profile = payload.profile;
      editing = false;
      failed = false;
      showError("");
      paintInfo();
    }).catch(function (err) {
      showError(err && err.status === 409 ? "Starting weight is locked" : "Couldn't save Account Info. Try again");
    });
  }

  function latestWeight() {
    var best = null;
    weights.forEach(function (row) {
      if (!best || row.date > best.date) best = row;
    });
    return best;
  }

  function nearestOnOrBefore(date) {
    var best = null;
    weights.forEach(function (row) {
      if (row.date <= date && (!best || row.date > best.date)) best = row;
    });
    return best;
  }

  function monthKey(date) { return String(date).slice(0, 7); }

  function monthRows() {
    var sums = {};
    var counts = {};
    weights.forEach(function (row) {
      var key = monthKey(row.date);
      sums[key] = (sums[key] || 0) + Number(row.weightKg);
      counts[key] = (counts[key] || 0) + 1;
    });
    var rows = [];
    Object.keys(counts).forEach(function (key) {
      if (key.slice(0, 4) === "2026" || key.slice(0, 4) === "2027") rows.push(key);
    });
    rows.sort();
    return rows.map(function (key) {
      var avg = counts[key] ? round1(sums[key] / counts[key]) : null;
      return { key: key, label: MONTHS[(+key.slice(5)) - 1] + " " + key.slice(0, 4), avg: avg };
    });
  }

  function paintChart() {
    var svg = $("account-weight-chart");
    if (!svg) return;
    var points = [];
    if (profile && profile.startWeightKg != null && profile.startDate) {
      points.push({ date: profile.startDate, kg: Number(profile.startWeightKg) });
    }
    weights.forEach(function (row) {
      if (row.date >= "2026-01-01" && row.date <= "2027-12-31") points.push({ date: row.date, kg: Number(row.weightKg) });
    });
    points.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (points.length < 2) {
      svg.innerHTML = "";
      return;
    }
    var min = points[0].kg;
    var max = points[0].kg;
    points.forEach(function (point) {
      if (point.kg < min) min = point.kg;
      if (point.kg > max) max = point.kg;
    });
    if (min === max) { min -= 1; max += 1; }
    var start = new Date(points[0].date + "T00:00:00Z").getTime();
    var end = new Date(points[points.length - 1].date + "T00:00:00Z").getTime();
    if (start === end) end += 86400000;
    var coords = points.map(function (point) {
      var x = ((new Date(point.date + "T00:00:00Z").getTime() - start) / (end - start)) * 280 + 10;
      var y = 110 - ((point.kg - min) / (max - min)) * 90;
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    svg.innerHTML = '<polyline points="' + coords + '" fill="none" stroke="#ff8a00" stroke-width="2"></polyline>';
  }

  function reviewCard(title, date, label) {
    var today = todayKey();
    if (today < date) return '<article class="account-review"><h3>' + title + '</h3><p>Unlocks ' + formatDay(date) + "</p></article>";
    if (!profile || profile.startWeightKg == null) return '<article class="account-review"><h3>' + title + "</h3><p>Set your starting weight in Account Info first</p></article>";
    var near = nearestOnOrBefore(date);
    if (!near) return '<article class="account-review"><h3>' + title + "</h3><p>No weigh-in on or before " + formatDay(date) + "</p></article>";
    return '<article class="account-review"><h3>' + title + "</h3><p>" + esc(formatWeight(profile.startWeightKg)) + " → " + esc(formatWeight(near.weightKg)) +
      "</p><p>" + esc(weightDelta(near.weightKg, profile.startWeightKg)) + "</p><p class=\"account-cite-date\">" + esc(formatDay(near.date)) + "</p></article>";
  }

  function paintWeight() {
    var host = $("account-weight-body");
    if (!host) return;
    if (!profile || profile.startWeightKg == null) {
      host.innerHTML = '<p class="account-empty">Set your starting weight in Account Info first</p><button type="button" class="account-back" id="account-need-anchor">Open Account Info</button>';
      var jump = $("account-need-anchor");
      if (jump) jump.addEventListener("click", function () { openView("info"); });
      return;
    }
    var latest = latestWeight();
    var html = '<article class="account-cite"><p class="account-cite-label">Latest weight</p><p class="account-cite-value">' +
      (latest ? esc(formatWeight(latest.weightKg)) : "Tap Log weigh-in to add a weight") + "</p>";
    if (latest) html += '<p class="account-cite-date">' + esc(formatDay(latest.date)) + " · " + esc(weightDelta(latest.weightKg, profile.startWeightKg)) + "</p>";
    html += "</article>";
    html += '<button type="button" class="account-tile" id="account-log-open">Log weigh-in</button>';
    html += '<form id="account-log-form" class="account-form" hidden>';
    html += '<p class="account-unit"><button type="button" data-log-unit="kg">kg</button><button type="button" data-log-unit="st">st/lb</button></p>';
    html += '<label id="account-log-kg">Kilograms<input name="kg" inputmode="decimal"></label>';
    html += '<div id="account-log-st" hidden><label>Stone<input name="st" inputmode="numeric"></label><label>Pounds<input name="lb" inputmode="decimal"></label></div>';
    html += '<label>Date<input name="date" type="date"></label>';
    html += '<p id="account-log-note" class="account-cite-date" hidden>Updated this week</p>';
    html += '<button type="submit">Save weigh-in</button></form>';
    html += '<div class="account-week-list">';
    var ordered = weights.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    ordered.forEach(function (row) {
      html += '<p class="account-week"><span>' + esc(formatDay(row.date)) + " · " + esc(formatWeight(row.weightKg)) +
        '</span><button type="button" data-weight-delete="' + esc(row.week) + '">Delete</button></p>';
    });
    html += "</div>";
    var months = monthRows();
    if (months.length) {
      html += '<table class="account-months"><tbody>';
      months.forEach(function (row) {
        html += "<tr><th>" + esc(row.label) + "</th><td>" + esc(formatWeight(row.avg)) + "</td></tr>";
      });
      html += "</tbody></table>";
    }
    html += '<svg id="account-weight-chart" class="account-chart" viewBox="0 0 300 120" role="img" aria-label="Weight from the anchor through 2027"></svg>';
    html += reviewCard("Halfway", "2027-06-30");
    html += reviewCard("End of 2027", "2027-12-31");
    host.innerHTML = html;
    paintChart();
    function refreshLogNote() {
      var form = $("account-log-form");
      var note = $("account-log-note");
      if (!form || !note) return;
      var week = isoWeek(form.elements.date.value || todayKey());
      note.hidden = !weights.some(function (row) { return row.week === week; });
    }
    var opener = $("account-log-open");
    if (opener) opener.addEventListener("click", function () {
      var form = $("account-log-form");
      form.hidden = false;
      if (!form.elements.date.value) form.elements.date.value = todayKey();
      refreshLogNote();
    });
    host.querySelectorAll("[data-log-unit]").forEach(function (button) {
      button.addEventListener("click", function () {
        logUnit = button.getAttribute("data-log-unit");
        $("account-log-kg").hidden = logUnit !== "kg";
        $("account-log-st").hidden = logUnit !== "st";
      });
    });
    var form = $("account-log-form");
    if (form) {
      form.addEventListener("submit", saveWeight);
      form.elements.date.addEventListener("input", refreshLogNote);
      form.elements.date.addEventListener("change", refreshLogNote);
    }
    host.querySelectorAll("[data-weight-delete]").forEach(function (button) {
      button.addEventListener("click", function () {
        var week = button.getAttribute("data-weight-delete");
        if (!window.confirm("Delete this week's weigh-in?")) return;
        window.nexusFetch("/weights/" + encodeURIComponent(week), { method: "DELETE" }).then(function () {
          weights = weights.filter(function (row) { return row.week !== week; });
          paintWeight();
        }).catch(function () { showError("Couldn't delete this weigh-in. Try again"); });
      });
    });
  }

  function saveWeight(event) {
    event.preventDefault();
    var form = event.target;
    var kg = logUnit === "st"
      ? round1(((Number(form.elements.st.value) || 0) * 14 + (Number(form.elements.lb.value) || 0)) * KG_PER_LB)
      : round1(form.elements.kg.value);
    var date = form.elements.date.value;
    window.nexusFetch("/weights", { method: "PUT", body: { date: date, weightKg: kg } }).then(function (payload) {
      var entry = payload.entry;
      weights = weights.filter(function (row) { return row.week !== entry.week; });
      weights.push(entry);
      paintWeight();
    }).catch(function () { showError("Couldn't save this weigh-in. Try again"); });
  }

  function paintLogUnit() {
    var kg = $("account-start-kg");
    var st = $("account-start-st");
    if (kg) kg.hidden = startUnit !== "kg";
    if (st) st.hidden = startUnit !== "st";
  }

  function openView(view) {
    if (window.RelicArchitectOpenAccount) window.RelicArchitectOpenAccount(view);
    else if (window.RelicArchitect && window.RelicArchitect.openAccount) window.RelicArchitect.openAccount(view);
  }

  function refresh(view) {
    var run = function () {
      if (view === "info" || view === "tiles") paintInfo();
      if (view === "weight" || view === "tiles") paintWeight();
    };
    if (!loaded) load().then(run);
    else run();
  }

  function bind() {
    var edit = $("account-info-edit");
    if (edit) edit.addEventListener("click", function (event) {
      event.preventDefault();
      editing = true;
      fillInfoForm();
      paintInfo();
    });
    var cancel = $("account-info-cancel");
    if (cancel) cancel.addEventListener("click", function (event) {
      event.preventDefault();
      editing = false;
      paintInfo();
    });
    var form = $("account-info-form");
    if (form) form.addEventListener("submit", paintInfoSave);
    document.querySelectorAll("[data-height-unit]").forEach(function (button) {
      button.addEventListener("click", function () {
        heightUnit = button.getAttribute("data-height-unit");
        paintHeightUnit();
      });
    });
    document.querySelectorAll("[data-start-unit]").forEach(function (button) {
      button.addEventListener("click", function () {
        startUnit = button.getAttribute("data-start-unit");
        paintLogUnit();
      });
    });
    var retry = $("account-retry");
    if (retry) retry.addEventListener("click", function () {
      loaded = false;
      refresh("tiles");
    });
  }

  return {
    refresh: refresh,
    bind: bind,
    formatWeight: formatWeight,
    formatHeight: formatHeight,
    ageOn: ageOn,
    isoWeek: isoWeek,
    round1: round1
  };
})();

if (typeof document !== "undefined") {
  var startAccount = function () { window.NexusAccount.bind(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startAccount);
  else startAccount();
}
