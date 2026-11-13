/* Temporary 2026 Pre Schedules cabin. Remove this file on 31 Dec 2026. */
(function () {
  if (!window.PRE2026_ENABLED) return;

  var WEEKS = [
    { n: 1, phase: "Wake Up", start: "2026-11-16", end: "2026-11-21", sunday: "2026-11-22", label: "16–21 Nov" },
    { n: 2, phase: "Wake Up", start: "2026-11-23", end: "2026-11-28", sunday: "2026-11-29", label: "23–28 Nov" },
    { n: 3, phase: "Loosen", start: "2026-11-30", end: "2026-12-05", sunday: "2026-12-06", label: "30 Nov–5 Dec" },
    { n: 4, phase: "Loosen", start: "2026-12-07", end: "2026-12-12", sunday: "2026-12-13", label: "7–12 Dec" },
    { n: 5, phase: "Bridge to January", start: "2026-12-14", end: "2026-12-19", sunday: "2026-12-20", label: "14–19 Dec" },
    { n: 6, phase: "Bridge to January", start: "2026-12-21", end: "2026-12-26", sunday: "2026-12-27", label: "21–26 Dec" },
    { n: 7, phase: "Bridge to January", start: "2026-12-28", end: "2026-12-31", sunday: "", label: "28–31 Dec" }
  ];
  var PHASES = [
    { label: "Weeks 1–2", name: "Wake Up", week: 0 },
    { label: "Weeks 3–4", name: "Loosen", week: 2 },
    { label: "Weeks 5–7", name: "Bridge to January", week: 4 }
  ];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var plan = {};
  var names = {};
  var weekIndex = 0;
  var sendCombo = null;
  var sendLine = 1;
  var loaded = false;

  function londonKey(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date || new Date());
      var map = {};
      parts.forEach(function (part) { map[part.type] = part.value; });
      return map.year + "-" + map.month + "-" + map.day;
    } catch (err) {
      return "2026-11-16";
    }
  }

  function weekday(key) {
    return new Date(key + "T00:00:00Z").getUTCDay();
  }

  function allowedKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= "2026-11-16" && key <= "2026-12-31" && weekday(key) !== 0 && key.indexOf("upper:") !== 0 && key.slice(0, 4) === "2026";
  }

  function dayLabel(key) {
    var date = new Date(key + "T00:00:00Z");
    return DAYS[date.getUTCDay()] + " " + date.getUTCDate() + " " + MONTHS[date.getUTCMonth()];
  }

  function rangeLabel(week) {
    var start = new Date(week.start + "T00:00:00Z");
    var endKey = week.sunday || week.end;
    var end = new Date(endKey + "T00:00:00Z");
    return start.getUTCDate() + " " + MONTHS[start.getUTCMonth()] + " – " + end.getUTCDate() + " " + MONTHS[end.getUTCMonth()] + " " + end.getUTCFullYear();
  }

  function weekFor(key) {
    var i;
    if (!key || key < WEEKS[0].start) return 0;
    if (key > "2026-12-31") return 6;
    for (i = 0; i < WEEKS.length; i++) {
      if (key >= WEEKS[i].start && key <= (WEEKS[i].sunday || WEEKS[i].end)) return i;
    }
    return 0;
  }

  function daysOf(week) {
    var rows = [];
    var cursor = new Date(week.start + "T00:00:00Z");
    var last = week.end;
    while (cursor.toISOString().slice(0, 10) <= last) {
      rows.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (week.sunday) rows.push(week.sunday);
    return rows;
  }

  function sendDays() {
    var rows = [];
    var cursor = new Date("2026-11-16T00:00:00Z");
    while (cursor.toISOString().slice(0, 10) <= "2026-12-31") {
      var key = cursor.toISOString().slice(0, 10);
      if (cursor.getUTCDay() !== 0) rows.push(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return rows;
  }

  function esc(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function placed(key, line) {
    var id = plan[key + "#" + line];
    if (!id && window.NexusBuilder && window.NexusBuilder.placement) {
      var known = window.NexusBuilder.placement(key, line);
      if (known) return known;
    }
    if (!id) return null;
    return { id: id, name: names[id] || id };
  }

  function toast(text) {
    var el = document.getElementById("pre2026-toast");
    if (!el) {
      el = document.createElement("p");
      el.id = "pre2026-toast";
      el.className = "pre-toast";
      el.hidden = true;
      document.body.appendChild(el);
    }
    el.textContent = text || "";
    el.hidden = !text;
    clearTimeout(toast.timer);
    if (text) toast.timer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function load() {
    if (loaded || typeof window.nexusFetch !== "function") return Promise.resolve();
    return Promise.all([
      window.nexusFetch("/training-plan"),
      window.nexusFetch("/training-combos")
    ]).then(function (pair) {
      var rows = (pair[0] && pair[0].plan) || [];
      var combos = (pair[1] && (pair[1].combos || pair[1])) || [];
      rows.forEach(function (row) {
        if (!row || !allowedKey(row.plan_key) || (row.line !== 1 && row.line !== 2)) return;
        if (row.combo_id) plan[row.plan_key + "#" + row.line] = row.combo_id;
      });
      (Array.isArray(combos) ? combos : []).forEach(function (combo) {
        if (combo && combo.id) names[combo.id] = combo.name || combo.id;
      });
      loaded = true;
    }).catch(function () { loaded = true; });
  }

  function lineHtml(key, line) {
    var item = placed(key, line);
    if (!item) {
      return '<div class="relic-line"><button type="button" class="plan-pick" data-pre-edit="' + key + '" data-pre-line="' + line + '" aria-label="Choose a schedule">+</button></div>';
    }
    return '<div class="relic-line"><button type="button" class="combo-play" data-pre-play="' + esc(item.id) + '">' + esc(item.name) + '</button><button type="button" class="plan-pick" data-pre-edit="' + key + '" data-pre-line="' + line + '" aria-label="Change schedule">✎</button></div>';
  }

  function render() {
    var root = document.getElementById("pre2026-root");
    if (!root) return;
    var week = WEEKS[weekIndex];
    var html = '<div class="pre-top"><p class="pre-kicker">WEEK ' + week.n + " OF 7 · " + week.phase.toUpperCase() + '</p><button type="button" class="page-back" data-hub-back="schedules">‹ Back</button></div>';
    html += '<div class="pre-phases">';
    PHASES.forEach(function (phase) {
      html += '<button type="button" class="pre-phase' + (phase.name === week.phase ? " is-on" : "") + '" data-pre-phase="' + phase.week + '"><span>' + phase.label + "</span><small>" + phase.name + "</small></button>";
    });
    html += '</div><div class="pre-weeks">';
    WEEKS.forEach(function (item, index) {
      html += '<button type="button" class="pre-week' + (index === weekIndex ? " is-on" : "") + '" data-pre-week="' + index + '">WEEK ' + item.n + "<small>" + item.label + "</small></button>";
    });
    html += '</div><p class="pre-range">' + rangeLabel(week) + '</p>';
    html += '<table class="timetable pre-table"><colgroup><col class="col-day"><col class="col-relics"></colgroup><thead><tr><th>DAY</th><th>TRAINING RELICS</th></tr></thead><tbody>';
    daysOf(week).forEach(function (key) {
      var date = new Date(key + "T00:00:00Z");
      var rest = date.getUTCDay() === 0;
      html += '<tr><td class="day-cell"><span class="day-name">' + DAYS[date.getUTCDay()] + '</span><span class="day-key">' + key + "</span></td><td>";
      html += rest ? '<span class="pre-rest">Rest</span>' : lineHtml(key, 1) + lineHtml(key, 2);
      html += "</td></tr>";
    });
    html += '</tbody></table><p class="pre-note">No ticks on this page.</p>';
    root.innerHTML = html;
  }

  function defaultSendDay() {
    var today = londonKey(new Date());
    if (allowedKey(today)) return today;
    return "2026-11-16";
  }

  function paintSend() {
    var sheet = document.getElementById("pre2026-send");
    if (!sheet) return;
    if (!sendCombo) {
      sheet.hidden = true;
      return;
    }
    var key = sheet.querySelector(".pre-day") ? sheet.querySelector(".pre-day").value : defaultSendDay();
    if (!allowedKey(key)) key = defaultSendDay();
    var item = placed(key, sendLine);
    var days = sendDays();
    var html = '<div class="plan-sheet-card" role="dialog" aria-label="Send to 2026 Pre Schedules">';
    html += '<h2 class="plan-sheet-title">Send to 2026 Pre Schedules</h2>';
    html += '<p class="pre-send-name">' + esc(names[sendCombo] || sendCombo) + "</p>";
    html += '<label>Day (Mon–Sat, 16 Nov – 31 Dec)<select class="pre-day">';
    days.forEach(function (day) {
      html += '<option value="' + day + '"' + (day === key ? " selected" : "") + ">" + dayLabel(day) + " 2026</option>";
    });
    html += "</select></label>";
    html += '<div class="pre-lines"><button type="button" class="pre-line' + (sendLine === 1 ? " is-on" : "") + '" data-pre-send-line="1">Line 1 · Lower</button><button type="button" class="pre-line' + (sendLine === 2 ? " is-on" : "") + '" data-pre-send-line="2">Line 2 · Upper</button></div>';
    html += '<p class="pre-status">' + (item ? "Currently: " + esc(item.name) + ". It will be swapped and stays in your library." : dayLabel(key) + " line " + sendLine + " is empty.") + "</p>";
    html += '<button type="button" class="sched-save" data-pre-send>Send to ' + dayLabel(key) + " · Line " + sendLine + '</button>';
    html += '<button type="button" class="plan-close" data-pre-cancel>Cancel</button></div>';
    sheet.innerHTML = html;
    sheet.hidden = false;
  }

  function paintEdit(key, line) {
    var sheet = document.getElementById("pre2026-send");
    var ids = Object.keys(names);
    var html = '<div class="plan-sheet-card" role="dialog" aria-label="Choose a schedule">';
    html += "<h2 class=\"plan-sheet-title\">" + dayLabel(key) + " · Line " + line + "</h2>";
    if (!ids.length) html += '<p class="pre-status">No schedules loaded.</p>';
    ids.forEach(function (id) {
      html += '<button type="button" class="plan-choice" data-pre-choose="' + esc(id) + '" data-pre-key="' + key + '" data-pre-line="' + line + '">' + esc(names[id]) + "</button>";
    });
    html += '<button type="button" class="plan-close" data-pre-cancel>Cancel</button></div>';
    sheet.innerHTML = html;
    sheet.hidden = false;
  }

  function openSend(id) {
    sendCombo = id;
    sendLine = 1;
    load().then(paintSend);
  }

  function boot() {
    var list = document.querySelector(".cabin-list");
    var hub = list && list.querySelector('[data-os-door="hub"]');
    if (list && hub && !list.querySelector('[data-os-door="pre2026"]')) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "nav-row drawer-door";
      row.setAttribute("data-os-door", "pre2026");
      row.innerHTML = '<span class="nav-row-label">2026 Pre Schedules</span>';
      hub.insertAdjacentElement("afterend", row);
    }
    var card = document.getElementById("relic-card");
    var hubRoot = document.getElementById("hub-root");
    if (card && hubRoot && !document.getElementById("pre2026-root")) {
      var panel = document.createElement("section");
      panel.id = "pre2026-root";
      panel.setAttribute("data-os-panel", "pre2026");
      panel.hidden = true;
      hubRoot.insertAdjacentElement("afterend", panel);
    }
    if (!document.getElementById("pre2026-send")) {
      var sheet = document.createElement("div");
      sheet.id = "pre2026-send";
      sheet.className = "pre-send";
      sheet.hidden = true;
      document.body.appendChild(sheet);
    }
    weekIndex = weekFor(londonKey(new Date()));
    load().then(render);
  }

  window.NexusExtraDoors = window.NexusExtraDoors || [];
  window.NexusExtraDoors.push({
    id: "pre2026",
    title: "2026 Pre Schedules",
    hideSync: true,
    onShow: function () { load().then(render); }
  });

  if (window.NexusBuilder && window.NexusBuilder.onRowActions) {
    window.NexusBuilder.onRowActions(function (combo) {
      return '<button type="button" class="sched-pre" data-sched-pre="' + esc(combo.id) + '">→ 2026 Pre</button>';
    });
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var weekBtn = target.closest("[data-pre-week]");
    if (weekBtn) {
      weekIndex = Number(weekBtn.getAttribute("data-pre-week")) || 0;
      render();
      return;
    }
    var phaseBtn = target.closest("[data-pre-phase]");
    if (phaseBtn) {
      weekIndex = Number(phaseBtn.getAttribute("data-pre-phase")) || 0;
      render();
      return;
    }
    var play = target.closest("[data-pre-play]");
    if (play && window.NexusBuilder && window.NexusBuilder.playCombo) {
      window.NexusBuilder.playCombo(play.getAttribute("data-pre-play"));
      return;
    }
    var edit = target.closest("[data-pre-edit]");
    if (edit) {
      load().then(function () { paintEdit(edit.getAttribute("data-pre-edit"), Number(edit.getAttribute("data-pre-line"))); });
      return;
    }
    var choose = target.closest("[data-pre-choose]");
    if (choose) {
      var key = choose.getAttribute("data-pre-key");
      var line = Number(choose.getAttribute("data-pre-line"));
      var id = choose.getAttribute("data-pre-choose");
      if (!allowedKey(key) || (line !== 1 && line !== 2)) return;
      window.nexusFetch("/training-plan/" + key + "/" + line, { method: "PUT", body: { combo_id: id } }).then(function () {
        plan[key + "#" + line] = id;
        document.getElementById("pre2026-send").hidden = true;
        render();
        toast("Placed on " + dayLabel(key) + " · Line " + line);
      }).catch(function () { toast("Could not place that schedule."); });
      return;
    }
    var pre = target.closest("[data-sched-pre]");
    if (pre) {
      names[pre.getAttribute("data-sched-pre")] = names[pre.getAttribute("data-sched-pre")] || (pre.closest(".sched-row") && pre.closest(".sched-row").querySelector(".sched-play-name") ? pre.closest(".sched-row").querySelector(".sched-play-name").textContent : pre.getAttribute("data-sched-pre"));
      openSend(pre.getAttribute("data-sched-pre"));
      return;
    }
    if (target.closest("[data-pre-send-line]")) {
      sendLine = Number(target.closest("[data-pre-send-line]").getAttribute("data-pre-send-line")) || 1;
      paintSend();
      return;
    }
    if (target.closest("[data-pre-cancel]")) {
      sendCombo = null;
      document.getElementById("pre2026-send").hidden = true;
      return;
    }
    if (target.closest("[data-pre-send]")) {
      var select = document.querySelector("#pre2026-send .pre-day");
      var chosen = select ? select.value : "";
      if (!sendCombo || !allowedKey(chosen) || (sendLine !== 1 && sendLine !== 2)) return;
      window.nexusFetch("/training-plan-week", {
        method: "PUT",
        body: { entries: [{ plan_key: chosen, line: sendLine, combo_id: sendCombo }] }
      }).then(function () {
        plan[chosen + "#" + sendLine] = sendCombo;
        sendCombo = null;
        document.getElementById("pre2026-send").hidden = true;
        render();
        toast("Sent to " + dayLabel(chosen) + " · Line " + sendLine + " on 2026 Pre Schedules");
        if (window.NexusBuilder && window.NexusBuilder.reload) window.NexusBuilder.reload();
      }).catch(function () { toast("Could not send that schedule."); });
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.classList && event.target.classList.contains("pre-day")) paintSend();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
