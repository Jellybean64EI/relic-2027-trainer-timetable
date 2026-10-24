/* Training schedule builder. Combos and day placements live on the Nexus API.
   Auto-organise only reorders the videos already in the draft. */
(function () {
  "use strict";

  var SECTIONS = [
    { id: "pre", name: "Pre-stretches" },
    { id: "exercise", name: "Exercises" },
    { id: "post", name: "Post-stretches" }
  ];
  var SECTION_RANK = { pre: 0, exercise: 1, post: 2 };
  var SIZE = { back: 0, chest: 1, legs: 2, core: 3, arms: 4, equipment: 5, posture: 6, neck: 7, face: 8 };

  var DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var DAY_ROWS = [
    { id: "mon", name: "Monday" },
    { id: "tue", name: "Tuesday" },
    { id: "wed", name: "Wednesday" },
    { id: "thu", name: "Thursday" },
    { id: "fri", name: "Friday" },
    { id: "sat", name: "Saturday" },
    { id: "sun", name: "Sunday (optional)" }
  ];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var GROUPS_KEY = "nexus_training_groups_v1";
  var PLAN_KEY = "nexus_training_plan_v1";

  var combos = [];
  var groups = [];
  var planMap = {};
  var mode = "home";
  var homeTab = "";
  var active = "";
  var draft = { id: "", name: "", fav: false, items: [] };
  var groupDraft = null;
  var guideOpen = {};
  var confirmId = "";
  var groupConfirmId = "";
  var picker = null;
  var placeTarget = "";
  var toastTimer = 0;
  var byKey = {};

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function indexCatalog() {
    byKey = {};
    var groups = window.NEXUS_VIDEO_CATALOG && window.NEXUS_VIDEO_CATALOG.groups;
    (groups || []).forEach(function (group) {
      (group.modules || []).forEach(function (mod) {
        (mod.videos || []).forEach(function (video) {
          if (!video || !video.key || byKey[video.key]) return;
          byKey[video.key] = {
            r2Key: video.key,
            title: video.title || video.key,
            src: video.src || "",
            cabin: video.cabin || "",
            group: group.id,
            phases: video.phases || []
          };
        });
      });
    });
  }

  function hydrate(item) {
    var meta = byKey[item.r2Key] || {};
    return {
      r2Key: item.r2Key,
      section: item.section,
      title: meta.title || item.title || item.r2Key,
      src: meta.src || item.src || "",
      cabin: meta.cabin || item.cabin || "",
      group: meta.group || item.group || "",
      phases: meta.phases || item.phases || []
    };
  }

  function counts(items) {
    var tally = { pre: 0, exercise: 0, post: 0 };
    (items || []).forEach(function (item) {
      if (tally[item.section] != null) tally[item.section] += 1;
    });
    return tally.pre + " pre · " + tally.exercise + " ex · " + tally.post + " post";
  }

  function isGentlePre(item) {
    var title = String(item.title || "").toLowerCase();
    return /spine circle|windshield|pelvic|lumbar|cat\b|camel|hip opener|hip sit|butterfly|knee to chest|child|supine foot|sitting all day|sit a lot/.test(title);
  }

  function isLowerBackRelief(item) {
    var title = String(item.title || "").toLowerCase();
    return /lower[- ]back|lumbar|cobra|child|knee to chest|pelvic tilt|cat cow|sphinx|breath/.test(title);
  }

  function armSide(item) {
    var title = String(item.title || "").toLowerCase();
    if (/tricep|skull|pushdown/.test(title)) return "triceps";
    if (/wrist|forearm|reverse curl|grip|pronation|towel|sand hand|hand trainer|hand gripper/.test(title)) return "";
    if (/bicep|hammer curl|preacher|\bcurl\b/.test(title)) return "biceps";
    return "";
  }

  function isHangingOrWeighted(item) {
    var title = String(item.title || "").toLowerCase();
    return item.cabin === "Hanging" || item.cabin === "Target_Weights" || /\bhang\b|dead hang|weighted/.test(title);
  }

  function organisePres(items) {
    var gentle = [];
    var rest = [];
    items.forEach(function (item) {
      if (isGentlePre(item)) gentle.push(item);
      else rest.push(item);
    });
    return gentle.concat(rest);
  }

  function exerciseBucket(item) {
    var side = armSide(item);
    if (side) return side;
    if (item.group && SIZE[item.group] != null) return item.group === "arms" ? "arms" : item.group;
    return "other";
  }

  function alternate(first, second) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < first.length || j < second.length) {
      if (i < first.length) out.push(first[i++]);
      if (j < second.length) out.push(second[j++]);
    }
    return out;
  }

  function organiseExercises(items) {
    var buckets = {
      back: [], chest: [], legs: [], core: [], biceps: [], triceps: [],
      arms: [], equipment: [], posture: [], neck: [], face: [], other: []
    };
    items.forEach(function (item) {
      var bucket = exerciseBucket(item);
      (buckets[bucket] || buckets.other).push(item);
    });
    return alternate(buckets.back, buckets.chest)
      .concat(alternate(buckets.legs, buckets.core))
      .concat(alternate(buckets.biceps, buckets.triceps))
      .concat(buckets.arms, buckets.equipment, buckets.posture, buckets.neck, buckets.face, buckets.other);
  }

  function organisePosts(items, exercises) {
    var seen = [];
    exercises.forEach(function (item) {
      if (item.group && seen.indexOf(item.group) === -1) seen.push(item.group);
    });
    var ranked = items.map(function (item, index) {
      var at = seen.indexOf(item.group);
      return { item: item, index: index, rank: at === -1 ? 1000 + index : at };
    });
    ranked.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.index - b.index;
    });
    var rest = [];
    var relief = [];
    ranked.forEach(function (row) {
      if (isLowerBackRelief(row.item)) relief.push(row.item);
      else rest.push(row.item);
    });
    return rest.concat(relief);
  }

  function dayNotes(items) {
    var notes = [];
    var list = items || [];
    var pres = list.filter(function (item) { return item.section === "pre"; });
    var exercises = list.filter(function (item) { return item.section === "exercise"; });
    var warm = pres.some(function (item) { return item.group === "back" || item.group === "core"; });
    if (pres.length && !warm) notes.push("No back or core warm-up.");
    if (!pres.length && exercises.length) notes.push("No back or core warm-up.");
    if (exercises.length > 10) notes.push("About 8 to 10 exercises is plenty.");
    if (list.some(isHangingOrWeighted)) notes.push("Hanging or weighted is in this day.");
    return notes;
  }

  function organise(items) {
    var list = (items || []).map(hydrate);
    var pres = organisePres(list.filter(function (item) { return item.section === "pre"; }));
    var exercises = organiseExercises(list.filter(function (item) { return item.section === "exercise"; }));
    var posts = organisePosts(list.filter(function (item) { return item.section === "post"; }), exercises);
    var next = pres.concat(exercises, posts);
    return { items: next, notes: dayNotes(next) };
  }

  function slugId(name) {
    var slug = String(name || "day").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "day";
    var rand = Math.random().toString(36).slice(2, 6).replace(/[^a-z0-9]/g, "x");
    return (slug + "-" + rand).replace(/[^a-z0-9-]/g, "").slice(0, 40);
  }

  function payloadItems(items) {
    return (items || []).slice(0, 80).map(function (item) {
      return { r2Key: item.r2Key, section: item.section };
    });
  }

  function clipsFor(combo) {
    var items = (combo.items || []).map(hydrate);
    var ranked = items.map(function (item, index) { return { item: item, index: index }; });
    ranked.sort(function (a, b) {
      var rank = (SECTION_RANK[a.item.section] || 0) - (SECTION_RANK[b.item.section] || 0);
      if (rank) return rank;
      return a.index - b.index;
    });
    var playable = ranked.map(function (row) { return row.item; }).filter(function (item) { return item.src; });
    var totals = { pre: 0, exercise: 0, post: 0 };
    playable.forEach(function (item) {
      if (totals[item.section] != null) totals[item.section] += 1;
    });
    var seen = { pre: 0, exercise: 0, post: 0 };
    return playable.map(function (item) {
      var section = totals[item.section] != null ? item.section : "exercise";
      seen[section] = (seen[section] || 0) + 1;
      var stage = "Exercise";
      if (section === "pre") stage = "Pre-stretch";
      else if (section === "post") stage = "Post-stretch";
      return {
        title: item.title,
        src: item.src,
        cabin: item.cabin,
        stage: stage + " " + seen[section] + "/" + (totals[section] || seen[section])
      };
    });
  }

  function isFav(value) {
    return value === true || value === 1;
  }

  function displayName(name, number) {
    var text = String(name || "Schedule");
    if (/^\d+\.\s/.test(text)) return text;
    return number + ". " + text;
  }

  function emptyDays() {
    var days = {};
    DAY_KEYS.forEach(function (key) { days[key] = { line1: "", line2: "" }; });
    return days;
  }

  function normalizeDays(days) {
    var out = emptyDays();
    var src = days || {};
    DAY_KEYS.forEach(function (key) {
      var row = src[key] || {};
      out[key] = { line1: row.line1 || "", line2: row.line2 || "" };
    });
    return out;
  }

  function normalizeGroup(group) {
    group = group || {};
    return {
      id: group.id || "",
      name: group.name || "",
      fav: isFav(group.fav),
      days: normalizeDays(group.days),
      updated_at: group.updated_at || ""
    };
  }

  function freshGroup() {
    return { id: "", name: "", fav: false, days: emptyDays() };
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (err) { return null; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
  }

  function writeGroupsCache() {
    writeJson(GROUPS_KEY, groups);
  }

  function writePlanCache() {
    var rows = Object.keys(planMap).map(function (key) {
      var at = key.lastIndexOf("#");
      return { plan_key: key.slice(0, at), line: Number(key.slice(at + 1)), combo_id: planMap[key] };
    });
    writeJson(PLAN_KEY, rows);
  }

  function favCount() {
    return combos.filter(function (combo) { return isFav(combo.fav); }).length;
  }

  function filledSlots(days) {
    var n = 0;
    ["mon", "tue", "wed", "thu", "fri", "sat"].forEach(function (key) {
      var row = (days && days[key]) || {};
      if (row.line1) n += 1;
      if (row.line2) n += 1;
    });
    return n + "/12 slots";
  }

  function comboById(id) {
    return combos.filter(function (combo) { return combo.id === id; })[0] || null;
  }

  function groupById(id) {
    return groups.filter(function (group) { return group.id === id; })[0] || null;
  }

  function sortedCombos() {
    return combos.slice().sort(function (a, b) {
      var fav = (isFav(a.fav) ? 0 : 1) - (isFav(b.fav) ? 0 : 1);
      if (fav) return fav;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function comboOptions(selected) {
    var html = '<option value="">— None —</option>';
    sortedCombos().forEach(function (combo) {
      var label = (isFav(combo.fav) ? "⭐ " : "") + (combo.name || "Schedule");
      html += '<option value="' + esc(combo.id) + '"' + (combo.id === selected ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    return html;
  }

  function toast(text) {
    var el = document.getElementById("sched-toast");
    if (!el) {
      el = document.createElement("p");
      el.id = "sched-toast";
      el.className = "sched-toast";
      el.hidden = true;
      document.body.appendChild(el);
    }
    el.textContent = text || "";
    el.hidden = !text;
    clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function trainingDaysInWeek(year, month, week) {
    var sched = window.RELIC_SCHEDULE;
    if (!sched || !sched.daysInWeekOfMonth) return [];
    return sched.daysInWeekOfMonth(year, month, week).filter(function (day) { return day.dayIndex < 6; });
  }

  function weekFromPlanKey(planKey) {
    var raw = String(planKey || "");
    var upper = raw.indexOf("upper:") === 0;
    raw = raw.replace(/^upper:/, "");
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    var sched = window.RELIC_SCHEDULE;
    if (!match || !sched || !sched.buildMonthDays) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var found = sched.buildMonthDays(year, month).filter(function (row) { return row.day === day; })[0];
    if (!found) return null;
    return { year: year, month: month, week: found.weekOfMonth, upper: upper };
  }

  function entriesFor(group, year, month, week, upper) {
    var entries = [];
    trainingDaysInWeek(year, month, week).forEach(function (day) {
      var slot = (group.days && group.days[DAY_KEYS[day.dayIndex]]) || {};
      var planKey = (upper ? "upper:" : "") + day.dateKey;
      entries.push({ plan_key: planKey, line: 1, combo_id: slot.line1 || "" });
      entries.push({ plan_key: planKey, line: 2, combo_id: slot.line2 || "" });
    });
    return entries;
  }

  function rememberEntries(entries) {
    (entries || []).forEach(function (entry) {
      if (!entry || !entry.plan_key) return;
      var key = entry.plan_key + "#" + entry.line;
      if (entry.combo_id) planMap[key] = entry.combo_id;
      else delete planMap[key];
    });
    writePlanCache();
  }

  function paintBoard() {
    if (window.RelicArchitect && window.RelicArchitect.refresh) window.RelicArchitect.refresh();
  }

  function placement(planKey, line) {
    var id = planMap[String(planKey) + "#" + String(line)];
    if (!id) return null;
    var combo = combos.filter(function (row) { return row.id === id; })[0];
    if (!combo) return null;
    return { id: combo.id, name: combo.name };
  }

  function picked(key) {
    if (mode !== "build" || !active || !key) return false;
    return draft.items.some(function (item) { return item.section === active && item.r2Key === key; });
  }

  function setMsg(text) {
    var el = document.getElementById("sched-msg");
    if (el) el.textContent = text || "";
  }

  function paintNotes() {
    var el = document.getElementById("sched-notes");
    if (!el) return;
    var notes = dayNotes(draft.items);
    el.innerHTML = notes.map(function (note) {
      return '<p class="sched-note">' + esc(note) + "</p>";
    }).join("");
  }

  function paintSections() {
    var host = document.getElementById("sched-sections");
    if (!host) return;
    var html = "";
    SECTIONS.forEach(function (section) {
      var items = draft.items.filter(function (item) { return item.section === section.id; });
      var on = active === section.id;
      html += '<section class="sched-sec' + (on ? " is-on" : "") + '">';
      html += '<button type="button" class="sched-sec-btn" data-sched-sec="' + section.id + '" aria-pressed="' + (on ? "true" : "false") + '">' +
        '<span>' + esc(section.name) + '</span><span class="sched-count">' + items.length + "</span></button>";
      html += '<div class="sched-items">';
      items.forEach(function (item) {
        var at = draft.items.indexOf(item);
        var inSection = draft.items.filter(function (row) { return row.section === section.id; });
        var pos = inSection.indexOf(item);
        html += '<div class="sched-item">';
        html += '<span class="sched-item-title">' + esc(item.title) + "</span>";
        html += '<span class="sched-item-moves">';
        html += '<button type="button" data-sched-move="up" data-sched-at="' + at + '"' + (pos === 0 ? " disabled" : "") + ' aria-label="Move up">↑</button>';
        html += '<button type="button" data-sched-move="down" data-sched-at="' + at + '"' + (pos === inSection.length - 1 ? " disabled" : "") + ' aria-label="Move down">↓</button>';
        html += '<button type="button" data-sched-remove="' + at + '" aria-label="Remove">×</button>';
        html += "</span></div>";
      });
      html += "</div></section>";
    });
    host.innerHTML = html;
    paintNotes();
  }

  var GUIDE = [
    {
      title: "Warm up first",
      html: "<ul><li>5 to 10 minutes of easy movement. A walk, marching on the spot, gentle arm circles. <em>(My plan.)</em></li><li>Then your <strong>Pre-stretches</strong>. Pick moving ones (dynamic: you move through the stretch, not hold it).</li><li>Keep any still holds <strong>under 60 seconds</strong> before lifting.</li><li>Why: a big review (Behm 2016) found holds of 60 seconds or more slightly cut strength straight after (about 4.6%). Holds under 60 seconds made only a tiny difference (about 1.1%).</li></ul>"
    },
    {
      title: "How much per session",
      html: "<table class=\"sched-table\"><thead><tr><th>Part</th><th>Beginner amount</th></tr></thead><tbody><tr><td>Exercises</td><td>4 to 6 <em>(my plan)</em></td></tr><tr><td>Sets (rounds of one move)</td><td>1 to 3 <em>(my plan)</em></td></tr><tr><td>Reps (times you do the move)</td><td>8 to 12 <em>(ACSM 2009, for people coming back after years off)</em></td></tr><tr><td>Strength days</td><td>At least 2 a week <em>(NHS)</em>. 2 to 3 for beginners <em>(ACSM 2009)</em></td></tr><tr><td>Other activity</td><td>At least 150 minutes a week of moderate activity, like brisk walking <em>(NHS)</em></td></tr></tbody></table><ul><li>Pick a weight where the last rep feels hard but tidy.</li><li>Do big moves before small ones <em>(ACSM 2009)</em>.</li><li>Moderate means you can talk, but not sing <em>(NHS)</em>.</li></ul>"
    },
    {
      title: "Good pairings",
      html: "<p>Work opposite muscles one after the other. One rests while the other works. <em>(My plan.)</em></p><ul><li><strong>Back + Chest</strong> (pull, then push)</li><li><strong>Biceps + Triceps</strong> (bend the arm, then straighten it)</li><li><strong>Legs &amp; Glutes + Core &amp; Pelvis</strong></li><li><strong>Neck + Posture &amp; Mobility</strong> (light)</li></ul><p><strong>Two schedules a day:</strong></p><ul><li>Morning: the strength pairing.</li><li>Evening: gentle Posture &amp; Mobility, or a walk.</li><li>Do <strong>not</strong> train the same area hard twice in one day. <em>(My plan.)</em></li></ul>"
    },
    {
      title: "Cool down",
      html: "<ol><li>3 to 5 minutes of easy movement. <em>(My plan.)</em></li><li>Then your <strong>Post-stretches</strong>.</li><li>Hold each one still, about 15 to 30 seconds. Repeat to reach about <strong>60 seconds</strong> per stretch <em>(ACSM 2011 advises 60 seconds total)</em>.</li><li>Stretch to mild tightness. Not pain.</li></ol>"
    },
    {
      title: "Rest days",
      html: "<ul><li>Leave about <strong>2 days (48 hours)</strong> before working the same muscle hard again. <em>(My plan, fits ACSM's 2 to 3 days a week.)</em></li><li>Have at least <strong>1 to 2 rest or gentle days</strong> each week. <em>(My plan.)</em></li><li>Gentle days are fine: walks, Posture &amp; Mobility.</li></ul>"
    },
    {
      title: "Low back care",
      html: "<p><strong>Do</strong></p><ul><li>Stay active. Keep doing normal daily things <em>(NHS, NICE NG59)</em>.</li><li>Exercise helps back pain <em>(NICE NG59)</em>.</li><li>Do not stay in bed for long periods <em>(NHS)</em>.</li><li>Gentle moves only while sore.</li></ul><p><strong>Don't</strong></p><ul><li>No heavy loaded back moves (weight on your shoulders or spine), like heavy squats or deadlifts. <em>(My plan.)</em></li><li>Do not hold your breath and strain (called Valsalva). Breathe out as you push. <em>(My plan.)</em></li></ul><p><strong>Normal vs stop</strong></p><ul><li>Normal: a dull ache or stiffness that eases as you move.</li><li>Stop: sharp pain, pain that spreads down a leg, or pain that gets worse as you go <em>(NHS: stop if pain gets worse)</em>.</li></ul><p><strong>See a GP or call NHS 111 if</strong></p><ul><li>You feel hot, cold, shivery or unwell.</li><li>Pain is severe, came on suddenly, or is getting worse fast.</li><li>Pain is worse at night, or not better after a few weeks.</li></ul><p><strong>Call 999 or go to A&amp;E if</strong></p><ul><li>Numbness around your bottom or genitals.</li><li>Changes in your bladder or bowels.</li><li>Pain, tingling, weakness or numbness in both legs.</li><li>Pain after a serious accident or fall.</li><li>Do not drive yourself.</li></ul>"
    },
    {
      title: "Epilepsy safety",
      html: "<ul><li>Train with someone nearby when you can. Make sure they know seizure first aid.</li><li>No heavy weights over your head when alone. <em>(My plan.)</em></li><li>Keep water handy <em>(NHS strength exercises)</em>.</li><li>Skip or go light if you are very tired, slept badly, or feel unwell <em>(Epilepsy Action)</em>.</li><li>Tiredness can trigger seizures. A diary can help spot triggers <em>(NHS)</em>.</li></ul>"
    },
    {
      title: "Example days to copy",
      html: "<p>Each day: Pre-stretches → Exercises → Post-stretches. Times are rough. <em>(My plan.)</em></p><table class=\"sched-table\"><thead><tr><th>Day</th><th>Pre</th><th>Exercises</th><th>Post</th><th>About</th></tr></thead><tbody><tr><td><strong>Gentle back day</strong> (best now)</td><td>2 Back + 1 Posture &amp; Mobility</td><td>3 gentle Back, light or no weight</td><td>3 Back</td><td>25 min</td></tr><tr><td><strong>Chest + Back</strong></td><td>1 Chest + 1 Back</td><td>2 Back + 2 Chest, in turns</td><td>1 Chest + 1 Back</td><td>35 min</td></tr><tr><td><strong>Arms</strong> (biceps + triceps)</td><td>2 Arms</td><td>2 biceps + 2 triceps, in turns</td><td>2 Arms</td><td>30 min</td></tr><tr><td><strong>Legs &amp; Glutes + Core</strong></td><td>1 Legs + 1 Core</td><td>3 Legs + 2 Core</td><td>1 Legs + 1 Core</td><td>40 min</td></tr><tr><td><strong>Posture &amp; Mobility</strong> (rest day)</td><td>2 Posture</td><td>3 easy mobility moves</td><td>2 Posture</td><td>20 min</td></tr><tr><td><strong>Neck + Face &amp; Head</strong> (light)</td><td>1 Neck</td><td>2 Neck + 2 Face &amp; Head</td><td>1 Neck</td><td>15 min</td></tr></tbody></table><p>While your back is sore, use light or no weight on Legs and Chest + Back days.</p>"
    },
    {
      title: "Sample week",
      html: "<table class=\"sched-table\"><thead><tr><th>Day</th><th>Morning</th><th>Evening</th></tr></thead><tbody><tr><td>Mon</td><td>Gentle back day</td><td>Walk</td></tr><tr><td>Tue</td><td>Arms</td><td>Posture &amp; Mobility</td></tr><tr><td>Wed</td><td><strong>Rest</strong></td><td>Short walk</td></tr><tr><td>Thu</td><td>Chest + Back</td><td>Neck + Face &amp; Head</td></tr><tr><td>Fri</td><td>Legs &amp; Glutes + Core</td><td>Posture &amp; Mobility</td></tr><tr><td>Sat</td><td>Walk 30 min</td><td>Rest</td></tr><tr><td>Sun</td><td><strong>Rest</strong></td><td>Rest</td></tr></tbody></table><p>Walks help reach 150 minutes a week <em>(NHS)</em>.</p>"
    },
    {
      title: "Sources",
      html: "<ul class=\"sched-sources\"><li><a href=\"https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/\" target=\"_blank\" rel=\"noopener noreferrer\">NHS – Physical activity guidelines for adults</a></li><li><a href=\"https://www.nhs.uk/live-well/exercise/strength-exercises/\" target=\"_blank\" rel=\"noopener noreferrer\">NHS – Strength exercises</a></li><li><a href=\"https://pubmed.ncbi.nlm.nih.gov/19204579/\" target=\"_blank\" rel=\"noopener noreferrer\">ACSM 2009 – Progression models in resistance training</a></li><li><a href=\"https://pubmed.ncbi.nlm.nih.gov/21694556/\" target=\"_blank\" rel=\"noopener noreferrer\">ACSM 2011 – Quantity and quality of exercise</a></li><li><a href=\"https://www.nice.org.uk/guidance/ng59\" target=\"_blank\" rel=\"noopener noreferrer\">NICE NG59 – Low back pain and sciatica</a></li><li><a href=\"https://pubmed.ncbi.nlm.nih.gov/26642915/\" target=\"_blank\" rel=\"noopener noreferrer\">Behm et al. 2016 – Acute effects of muscle stretching</a></li><li><a href=\"https://www.nhs.uk/conditions/back-pain/\" target=\"_blank\" rel=\"noopener noreferrer\">NHS – Back pain</a></li><li><a href=\"https://www.nhs.uk/conditions/epilepsy/\" target=\"_blank\" rel=\"noopener noreferrer\">NHS – Epilepsy</a></li><li><a href=\"https://www.epilepsy.org.uk/living/sports-and-leisure\" target=\"_blank\" rel=\"noopener noreferrer\">Epilepsy Action – Sport, exercise and leisure</a></li></ul>"
    }
  ];

  function paintGuide() {
    var host = document.getElementById("sched-guide");
    if (!host) return;
    var html = '<button type="button" class="sched-guide-btn" id="sched-guide-toggle" aria-expanded="' + (guideOpen.card ? "true" : "false") + '">How to build a good day</button>';
    if (guideOpen.card) {
      html += '<div class="sched-guide-body"><p class="sched-guide-lead">A short guide for Joe. One idea per section. “My plan” means a simple plan inside NHS or ACSM ranges, not a rule from them.</p>';
      GUIDE.forEach(function (section, index) {
        var open = !!guideOpen[index];
        html += '<button type="button" class="sched-guide-sec" data-guide="' + index + '" aria-expanded="' + (open ? "true" : "false") + '">' + esc(section.title) + "</button>";
        if (open) html += '<div class="sched-guide-copy">' + section.html + "</div>";
      });
      html += "</div>";
    }
    host.innerHTML = html;
  }

  function scheduleRow(combo, number) {
    var asking = confirmId === combo.id;
    var html = '<article class="sched-row">';
    html += '<button type="button" class="sched-play" data-sched-play="' + esc(combo.id) + '"><span class="sched-play-name">' + esc(displayName(combo.name, number)) + "</span></button>";
    html += '<span class="sched-row-actions">';
    html += '<button type="button" class="sched-fav' + (isFav(combo.fav) ? " is-on" : "") + '" data-sched-fav="' + esc(combo.id) + '" aria-pressed="' + (isFav(combo.fav) ? "true" : "false") + '" aria-label="Favourite">⭐</button>';
    html += '<button type="button" data-sched-edit="' + esc(combo.id) + '">Edit</button>';
    html += '<button type="button" data-sched-delete="' + esc(combo.id) + '">Delete</button>';
    html += "</span>";
    if (asking) {
      html += '<p class="sched-confirm">Delete this schedule?<button type="button" data-sched-yes="' + esc(combo.id) + '">Delete</button><button type="button" data-sched-no>Keep</button></p>';
    }
    html += "</article>";
    return html;
  }

  function groupRow(group, number) {
    var asking = groupConfirmId === group.id;
    var html = '<article class="sched-row sched-group-row">';
    html += '<button type="button" class="sched-group-play" data-group-edit="' + esc(group.id) + '"><span class="sched-play-name">' + esc(displayName(group.name, number)) + '</span><span class="sched-slot-badge">' + esc(filledSlots(group.days)) + "</span></button>";
    html += '<span class="sched-row-actions">';
    html += '<button type="button" class="sched-fav' + (isFav(group.fav) ? " is-on" : "") + '" data-group-fav="' + esc(group.id) + '" aria-pressed="' + (isFav(group.fav) ? "true" : "false") + '" aria-label="Favourite group">🌟</button>';
    html += '<button type="button" data-group-place="' + esc(group.id) + '">Place in week</button>';
    html += '<button type="button" data-group-edit="' + esc(group.id) + '">Edit</button>';
    html += '<button type="button" data-group-del="' + esc(group.id) + '">Delete</button>';
    html += "</span>";
    if (asking) {
      html += '<p class="sched-confirm">Delete? <button type="button" data-group-yes="' + esc(group.id) + '">Yes</button><button type="button" data-group-no>No</button></p>';
    }
    html += "</article>";
    return html;
  }

  function paintTabs() {
    [
      { id: "mine", label: "My schedules", count: combos.length },
      { id: "favs", label: "Favourites ⭐", count: favCount() },
      { id: "groups", label: "Favourite Groups 🌟", count: groups.length }
    ].forEach(function (tab) {
      var btn = document.querySelector('.sched-tab[data-sched-tab="' + tab.id + '"]');
      if (!btn) return;
      var on = homeTab === tab.id;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      btn.innerHTML = tab.label + ' <span class="sched-tab-count">' + tab.count + "</span>";
    });
  }

  function paintList() {
    var host = document.getElementById("sched-list");
    if (!host) return;
    host.hidden = !homeTab;
    if (!homeTab) {
      host.innerHTML = "";
      return;
    }
    if (homeTab === "groups") {
      var html = '<button type="button" class="sched-group-new" id="sched-group-new">+ Make a group</button>';
      if (!groups.length) html += '<p class="sched-empty">No weekly groups yet.</p>';
      groups.forEach(function (group, index) { html += groupRow(group, index + 1); });
      host.innerHTML = html;
      return;
    }
    var rows = homeTab === "favs" ? combos.filter(function (combo) { return isFav(combo.fav); }) : combos.slice();
    if (homeTab === "favs" && !rows.length) {
      host.innerHTML = '<p class="sched-empty">Tap ⭐ on any schedule in My schedules to keep your favourites here.</p>';
      return;
    }
    host.innerHTML = rows.map(function (combo, index) { return scheduleRow(combo, index + 1); }).join("");
  }

  function readGroupForm() {
    if (!groupDraft) groupDraft = freshGroup();
    var name = document.getElementById("group-name");
    if (name) groupDraft.name = name.value;
    DAY_ROWS.forEach(function (day) {
      var first = document.getElementById("group-" + day.id + "-1");
      var second = document.getElementById("group-" + day.id + "-2");
      if (!first && !second) return;
      groupDraft.days[day.id] = {
        line1: first ? first.value : "",
        line2: second ? second.value : ""
      };
    });
  }

  function paintGroupForm(force) {
    var form = document.getElementById("sched-group-form");
    if (!form) return;
    if (!groupDraft) groupDraft = freshGroup();
    if (!force && form.querySelector("#group-name")) return;
    var name = groupDraft.name || "";
    var html = '<input id="group-name" class="sched-name" maxlength="60" autocomplete="off" aria-label="Group name" placeholder="Group name (e.g. Lower Back &amp; Hips · Week 1)" value="' + esc(name) + '">';
    html += '<div class="group-quick"><p class="group-quick-label">Quick fill all days:</p>';
    html += '<label>Slot 1 default<select id="group-fill-1">' + comboOptions("") + "</select></label>";
    html += '<label>Slot 2 default<select id="group-fill-2">' + comboOptions("") + "</select></label>";
    html += '<button type="button" id="group-fill">Apply pair to Mon–Sat</button></div>';
    DAY_ROWS.forEach(function (day) {
      var slot = groupDraft.days[day.id] || { line1: "", line2: "" };
      html += '<section class="group-day"><h3>' + esc(day.name) + "</h3>";
      html += '<label>Schedule 1 (top tick)<select id="group-' + day.id + '-1">' + comboOptions(slot.line1) + "</select></label>";
      html += '<label>Schedule 2 (bottom tick)<select id="group-' + day.id + '-2">' + comboOptions(slot.line2) + "</select></label>";
      html += "</section>";
    });
    html += '<div class="sched-actions"><button type="button" class="sched-save" id="group-save">Save group</button><button type="button" class="sched-cancel" id="group-cancel">Cancel</button></div>';
    html += '<p id="group-msg" class="sched-msg"></p>';
    form.innerHTML = html;
  }

  function paintHome() {
    var root = document.getElementById("sched-root");
    if (!root) return;
    if (!document.getElementById("sched-home")) {
      root.innerHTML = '<div id="sched-home"><button type="button" class="sched-go" id="sched-build">Build a schedule</button>' +
        '<div class="sched-tabs" id="sched-tabs" role="tablist">' +
          '<button type="button" class="sched-tab" data-sched-tab="mine" aria-expanded="false">My schedules <span class="sched-tab-count">0</span></button>' +
          '<button type="button" class="sched-tab" data-sched-tab="favs" aria-expanded="false">Favourites ⭐ <span class="sched-tab-count">0</span></button>' +
          '<button type="button" class="sched-tab" data-sched-tab="groups" aria-expanded="false">Favourite Groups 🌟 <span class="sched-tab-count">0</span></button>' +
        '</div><div id="sched-list" hidden></div></div>' +
        '<form id="sched-form" hidden></form><form id="sched-group-form" hidden></form>';
    }
    var home = document.getElementById("sched-home");
    var form = document.getElementById("sched-form");
    var groupForm = document.getElementById("sched-group-form");
    if (home) home.hidden = mode !== "home";
    if (form) form.hidden = mode !== "build";
    if (groupForm) groupForm.hidden = mode !== "group";
    paintTabs();
    if (mode === "home") paintList();
    if (mode === "group") paintGroupForm();
  }

  function paintForm() {
    var form = document.getElementById("sched-form");
    if (!form) return;
    if (!document.getElementById("sched-name")) {
      form.innerHTML = '<input id="sched-name" class="sched-name" maxlength="60" autocomplete="off" aria-label="Schedule name" placeholder="Name">' +
        '<div id="sched-sections"></div><div id="sched-notes"></div>' +
        '<button type="button" class="sched-auto" id="sched-auto">Auto-organise</button>' +
        '<div id="sched-guide"></div>' +
        '<div class="sched-actions"><button type="button" class="sched-save" id="sched-save">Save</button><button type="button" class="sched-cancel" id="sched-cancel">Cancel</button></div>' +
        '<p id="sched-msg" class="sched-msg"></p>';
    }
    var input = document.getElementById("sched-name");
    if (input && document.activeElement !== input) input.value = draft.name;
    paintSections();
    paintGuide();
  }

  function paint() {
    paintHome();
    if (mode === "build") paintForm();
    paintSheet();
    paintPlaceSheet();
  }

  function refreshCards() {
    if (!document.body || !document.body.classList.contains("is-cards") || !window.NexusCards) return;
    if (mode === "build" && window.NexusCards.syncPicked && window.NexusCards.syncPicked()) return;
    if (window.NexusCards.render) window.NexusCards.render();
  }

  function refreshPage() {
    if (window.RelicArchitect && window.RelicArchitect.refresh) window.RelicArchitect.refresh();
  }

  function applyRemote(comboRows, planRows) {
    combos = Array.isArray(comboRows) ? comboRows : [];
    planMap = {};
    (planRows || []).forEach(function (row) {
      if (!row || !row.plan_key || !row.combo_id) return;
      planMap[String(row.plan_key) + "#" + String(row.line)] = row.combo_id;
    });
  }

  function load() {
    if (typeof window.nexusFetch !== "function") return Promise.resolve();
    return Promise.all([
      window.nexusFetch("/training-combos").catch(function () { return null; }),
      window.nexusFetch("/training-plan").catch(function () { return null; }),
      window.nexusFetch("/training-groups").catch(function () { return null; })
    ]).then(function (triple) {
      if (triple[0]) applyRemote(triple[0].combos || [], (triple[1] && triple[1].plan) || []);
      else if (triple[1]) applyRemote(combos, triple[1].plan || []);
      if (triple[1]) writePlanCache();
      else {
        var cachedPlan = readJson(PLAN_KEY);
        if (Array.isArray(cachedPlan) && !Object.keys(planMap).length) applyRemote(combos, cachedPlan);
      }
      if (triple[2] && Array.isArray(triple[2].groups)) {
        groups = triple[2].groups.map(normalizeGroup);
        writeGroupsCache();
      } else {
        var cachedGroups = readJson(GROUPS_KEY);
        if (Array.isArray(cachedGroups)) groups = cachedGroups.map(normalizeGroup);
      }
      paint();
      refreshPage();
    });
  }

  function openBuild(combo) {
    mode = "build";
    active = "pre";
    confirmId = "";
    if (combo) {
      draft = {
        id: combo.id,
        name: combo.name || "",
        fav: isFav(combo.fav),
        items: (combo.items || []).map(hydrate)
      };
    } else {
      draft = { id: "", name: "", fav: false, items: [] };
    }
    paint();
    var input = document.getElementById("sched-name");
    if (input) input.value = draft.name;
    refreshCards();
  }

  function closeBuild() {
    mode = "home";
    active = "";
    draft = { id: "", name: "", items: [] };
    paint();
    refreshCards();
  }

  function holdList(mutate) {
    var anchorEl = document.getElementById("vc-list");
    var beforeTop = anchorEl ? anchorEl.getBoundingClientRect().top : null;
    mutate();
    if (!anchorEl || beforeTop === null) return;
    var afterTop = anchorEl.getBoundingClientRect().top;
    if (Math.abs(afterTop - beforeTop) > 1) window.scrollBy(0, afterTop - beforeTop);
  }

  function takeCard(video) {
    if (mode !== "build" || !video || !video.key) return false;
    if (!active) {
      setMsg("Tap a section first.");
      return true;
    }
    if (draft.items.length >= 80) {
      setMsg("80 videos is the limit.");
      return true;
    }
    var item = hydrate({
      r2Key: video.key,
      section: active,
      title: video.title,
      src: video.src,
      cabin: video.cabin,
      group: video.group
    });
    var insertAt = draft.items.length;
    var rank = SECTION_RANK[active];
    for (var i = 0; i < draft.items.length; i++) {
      if ((SECTION_RANK[draft.items[i].section] || 0) > rank) {
        insertAt = i;
        break;
      }
    }
    holdList(function () {
      draft.items.splice(insertAt, 0, item);
      setMsg("");
      paintSections();
    });
    refreshCards();
    return true;
  }

  function moveItem(at, dir) {
    var item = draft.items[at];
    if (!item) return;
    var sibling = dir < 0 ? at - 1 : at + 1;
    while (sibling >= 0 && sibling < draft.items.length && draft.items[sibling].section !== item.section) {
      sibling += dir;
    }
    if (sibling < 0 || sibling >= draft.items.length) return;
    var swap = draft.items[sibling];
    draft.items[sibling] = item;
    draft.items[at] = swap;
    paintSections();
  }

  function playCombo(id) {
    var combo = combos.filter(function (row) { return row.id === id; })[0];
    if (!combo || !window.RelicArchitect || !window.RelicArchitect.openCatalogPlaylist) return;
    window.RelicArchitect.openCatalogPlaylist(clipsFor(combo));
  }

  function saveDraft() {
    var input = document.getElementById("sched-name");
    var name = String((input && input.value) || draft.name || "").trim();
    if (!name || name.length > 60) {
      setMsg("Add a name.");
      return Promise.resolve();
    }
    var id = draft.id || slugId(name);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) id = slugId(name);
    return window.nexusFetch("/training-combos/" + encodeURIComponent(id), {
      method: "PUT",
      body: { name: name, fav: !!draft.fav, items: payloadItems(draft.items) }
    }).then(function (saved) {
      var savedCombo = (saved && saved.combo) || saved || {};
      var row = {
        id: savedCombo.id || id,
        name: savedCombo.name || name,
        fav: savedCombo.fav != null ? isFav(savedCombo.fav) : !!draft.fav,
        items: savedCombo.items || payloadItems(draft.items)
      };
      var found = false;
      combos = combos.map(function (combo) {
        if (combo.id !== row.id) return combo;
        found = true;
        return row;
      });
      if (!found) combos.push(row);
      closeBuild();
    }).catch(function (err) {
      setMsg(err && err.message ? err.message : "Save failed.");
    });
  }

  function deleteCombo(id) {
    return window.nexusFetch("/training-combos/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
      confirmId = "";
      return load();
    }).catch(function (err) {
      setMsg(err && err.message ? err.message : "Delete failed.");
    });
  }

  function paintSheet() {
    var sheet = document.getElementById("plan-sheet");
    if (!sheet) return;
    if (!picker) {
      sheet.hidden = true;
      sheet.innerHTML = "";
      return;
    }
    var html = '<div class="plan-sheet-card" role="dialog" aria-label="Choose schedule">';
    if (groups.length) {
      html += '<p class="plan-sheet-title">Place a Weekly Group (fills whole week · 2 a day)</p>';
      groups.slice().sort(function (a, b) {
        return (isFav(a.fav) ? 0 : 1) - (isFav(b.fav) ? 0 : 1);
      }).forEach(function (group, index) {
        var star = isFav(group.fav) ? "🌟 " : "";
        html += '<button type="button" class="plan-choice" data-plan-group="' + esc(group.id) + '"><span>' + esc(star + displayName(group.name, index + 1)) + "</span></button>";
      });
    }
    html += '<p class="plan-sheet-title">Choose schedule</p>';
    if (!combos.length) html += '<p class="sched-note">No saved schedules.</p>';
    combos.forEach(function (combo, index) {
      html += '<button type="button" class="plan-choice" data-plan-combo="' + esc(combo.id) + '"><span>' + esc(displayName(combo.name, index + 1)) + "</span></button>";
    });
    html += '<button type="button" class="plan-clear" data-plan-clear>Use trainer schedule</button>';
    html += '<button type="button" class="plan-close" data-plan-close>Cancel</button>';
    html += "</div>";
    sheet.innerHTML = html;
    sheet.hidden = false;
  }

  function paintPlaceSheet() {
    var sheet = document.getElementById("group-place-sheet");
    if (!sheet) return;
    var group = placeTarget ? groupById(placeTarget) : null;
    if (!group) {
      sheet.hidden = true;
      sheet.innerHTML = "";
      return;
    }
    var board = window.RelicArchitect && window.RelicArchitect.mode === "upper" ? "upper" : "full";
    var month = 1;
    var card = document.getElementById("relic-card");
    if (card && card.getAttribute("data-month")) month = Number(card.getAttribute("data-month")) || 1;
    var html = '<div class="plan-sheet-card" role="dialog" aria-label="Place group in week">';
    html += '<p class="plan-sheet-title">Place ' + esc(group.name || "group") + "</p>";
    html += '<label>Board<select id="group-place-board"><option value="full"' + (board === "full" ? " selected" : "") + '>Full Body</option><option value="upper"' + (board === "upper" ? " selected" : "") + ">Upper Body</option></select></label>";
    html += '<label>Month<select id="group-place-month">';
    MONTHS.forEach(function (label, index) {
      html += '<option value="' + (index + 1) + '"' + (index + 1 === month ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    html += "</select></label>";
    html += '<label>Week<select id="group-place-week">';
    for (var week = 1; week <= 4; week++) {
      html += '<option value="' + week + '">Week ' + week + "</option>";
    }
    html += "</select></label>";
    html += '<button type="button" class="sched-save" id="group-place-go">Place group in week</button>';
    html += '<button type="button" class="plan-close" id="group-place-cancel">Cancel</button>';
    html += "</div>";
    sheet.innerHTML = html;
    sheet.hidden = false;
  }

  function setGroupMsg(text) {
    var el = document.getElementById("group-msg");
    if (el) el.textContent = text || "";
  }

  function openGroup(group) {
    mode = "group";
    homeTab = "groups";
    groupConfirmId = "";
    placeTarget = "";
    groupDraft = group ? normalizeGroup(group) : freshGroup();
    var form = document.getElementById("sched-group-form");
    if (form) form.innerHTML = "";
    paint();
  }

  function closeGroup() {
    mode = "home";
    homeTab = "groups";
    groupDraft = null;
    paint();
  }

  function applyPair() {
    readGroupForm();
    var first = document.getElementById("group-fill-1");
    var second = document.getElementById("group-fill-2");
    var line1 = first ? first.value : "";
    var line2 = second ? second.value : "";
    ["mon", "tue", "wed", "thu", "fri", "sat"].forEach(function (key) {
      groupDraft.days[key] = { line1: line1, line2: line2 };
    });
    paintGroupForm(true);
  }

  function saveGroup() {
    readGroupForm();
    var name = String(groupDraft.name || "").trim();
    if (!name || name.length > 60) {
      setGroupMsg("Add a group name.");
      return Promise.resolve();
    }
    var id = groupDraft.id || slugId(name);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) id = slugId(name);
    var body = { name: name, fav: !!groupDraft.fav, days: normalizeDays(groupDraft.days) };
    return window.nexusFetch("/training-groups/" + encodeURIComponent(id), {
      method: "PUT",
      body: body
    }).then(function (saved) {
      var row = normalizeGroup((saved && saved.group) || saved || body);
      if (!row.id) row.id = id;
      var found = false;
      groups = groups.map(function (group) {
        if (group.id !== row.id) return group;
        found = true;
        return row;
      });
      if (!found) groups.push(row);
      writeGroupsCache();
      closeGroup();
    }).catch(function (err) {
      setGroupMsg(err && err.message ? err.message : "Save failed.");
    });
  }

  function deleteGroup(id) {
    return window.nexusFetch("/training-groups/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
      groups = groups.filter(function (group) { return group.id !== id; });
      groupConfirmId = "";
      writeGroupsCache();
      paint();
    }).catch(function (err) {
      toast(err && err.message ? err.message : "Could not delete that group.");
    });
  }

  function toggleComboFav(id) {
    var combo = comboById(id);
    if (!combo) return;
    var next = !isFav(combo.fav);
    combo.fav = next;
    if (draft.id === id) draft.fav = next;
    paintTabs();
    paintList();
    window.nexusFetch("/training-combos/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { fav: next }
    }).then(function (saved) {
      var savedCombo = (saved && saved.combo) || saved;
      if (savedCombo && savedCombo.fav != null) combo.fav = isFav(savedCombo.fav);
      paintTabs();
      paintList();
    }).catch(function () {
      combo.fav = !next;
      if (draft.id === id) draft.fav = combo.fav;
      paintTabs();
      paintList();
      toast("Could not save the star.");
    });
  }

  function toggleGroupFav(id) {
    var group = groupById(id);
    if (!group) return;
    var next = !isFav(group.fav);
    group.fav = next;
    paintTabs();
    paintList();
    window.nexusFetch("/training-groups/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { fav: next }
    }).then(function (saved) {
      var savedGroup = (saved && saved.group) || saved;
      if (savedGroup && savedGroup.fav != null) group.fav = isFav(savedGroup.fav);
      writeGroupsCache();
      paintTabs();
      paintList();
    }).catch(function () {
      group.fav = !next;
      paintTabs();
      paintList();
      toast("Could not save the star.");
    });
  }

  function placeGroup(group, year, month, week, upper, message) {
    var entries = entriesFor(group, year, month, week, upper);
    if (!entries.length) {
      toast("That week has no training days.");
      return Promise.resolve();
    }
    return window.nexusFetch("/training-plan-week", {
      method: "PUT",
      body: { entries: entries }
    }).then(function () {
      rememberEntries(entries);
      picker = null;
      placeTarget = "";
      paintSheet();
      paintPlaceSheet();
      paintBoard();
      toast(message);
    }).catch(function (err) {
      toast(err && err.message ? err.message : "Could not place that group.");
    });
  }

  function placeGroupInPicker(id) {
    var group = groupById(id);
    var when = picker && weekFromPlanKey(picker.planKey);
    if (!group || !when) return Promise.resolve();
    return placeGroup(group, when.year, when.month, when.week, when.upper, "Placed " + group.name + " across this week");
  }

  function placeGroupFromSheet() {
    var group = groupById(placeTarget);
    if (!group) return Promise.resolve();
    var board = document.getElementById("group-place-board");
    var monthEl = document.getElementById("group-place-month");
    var weekEl = document.getElementById("group-place-week");
    var month = Number(monthEl && monthEl.value) || 1;
    var week = Number(weekEl && weekEl.value) || 1;
    var upper = board && board.value === "upper";
    return placeGroup(group, 2027, month, week, upper, "Placed " + group.name + " in " + MONTHS[month - 1] + " · Week " + week);
  }

  function openPicker(planKey, line) {
    picker = { planKey: planKey, line: String(line) };
    paintSheet();
  }

  function placeCombo(id) {
    if (!picker) return Promise.resolve();
    var path = "/training-plan/" + encodeURIComponent(picker.planKey) + "/" + encodeURIComponent(picker.line);
    return window.nexusFetch(path, { method: "PUT", body: { combo_id: id } }).then(function () {
      planMap[picker.planKey + "#" + picker.line] = id;
      picker = null;
      paintSheet();
      refreshPage();
    });
  }

  function clearPlacement() {
    if (!picker) return Promise.resolve();
    var key = picker.planKey + "#" + picker.line;
    var path = "/training-plan/" + encodeURIComponent(picker.planKey) + "/" + encodeURIComponent(picker.line);
    return window.nexusFetch(path, { method: "DELETE" }).then(function () {
      delete planMap[key];
      picker = null;
      paintSheet();
      refreshPage();
    }).catch(function () {
      picker = null;
      paintSheet();
    });
  }

  function onRootClick(event) {
    var target = event.target;
    var tab = target.closest("[data-sched-tab]");
    if (tab) {
      event.preventDefault();
      var nextTab = tab.getAttribute("data-sched-tab") || "";
      homeTab = homeTab === nextTab ? "" : nextTab;
      placeTarget = "";
      paintTabs();
      paintList();
      paintPlaceSheet();
      return;
    }
    var star = target.closest("[data-sched-fav]");
    if (star) {
      event.preventDefault();
      toggleComboFav(star.getAttribute("data-sched-fav"));
      return;
    }
    var groupStar = target.closest("[data-group-fav]");
    if (groupStar) {
      event.preventDefault();
      toggleGroupFav(groupStar.getAttribute("data-group-fav"));
      return;
    }
    var groupPlace = target.closest("[data-group-place]");
    if (groupPlace) {
      event.preventDefault();
      placeTarget = groupPlace.getAttribute("data-group-place") || "";
      paintPlaceSheet();
      return;
    }
    var groupYes = target.closest("[data-group-yes]");
    if (groupYes) {
      event.preventDefault();
      deleteGroup(groupYes.getAttribute("data-group-yes"));
      return;
    }
    if (target.closest("[data-group-no]")) {
      event.preventDefault();
      groupConfirmId = "";
      paintList();
      return;
    }
    var groupDel = target.closest("[data-group-del]");
    if (groupDel) {
      event.preventDefault();
      groupConfirmId = groupDel.getAttribute("data-group-del") || "";
      paintList();
      return;
    }
    var groupEdit = target.closest("[data-group-edit]");
    if (groupEdit) {
      event.preventDefault();
      openGroup(groupById(groupEdit.getAttribute("data-group-edit")));
      return;
    }
    if (target.closest("#sched-group-new")) {
      event.preventDefault();
      openGroup(null);
      return;
    }
    if (target.closest("#group-fill")) {
      event.preventDefault();
      applyPair();
      return;
    }
    if (target.closest("#group-save")) {
      event.preventDefault();
      saveGroup();
      return;
    }
    if (target.closest("#group-cancel")) {
      event.preventDefault();
      closeGroup();
      return;
    }
    if (target.closest("#sched-build")) {
      event.preventDefault();
      openBuild(null);
      return;
    }
    var sec = target.closest("[data-sched-sec]");
    if (sec) {
      event.preventDefault();
      var next = sec.getAttribute("data-sched-sec") || "";
      active = active === next ? "" : next;
      setMsg("");
      paintSections();
      refreshCards();
      return;
    }
    var move = target.closest("[data-sched-move]");
    if (move) {
      event.preventDefault();
      moveItem(Number(move.getAttribute("data-sched-at")), move.getAttribute("data-sched-move") === "up" ? -1 : 1);
      return;
    }
    var remove = target.closest("[data-sched-remove]");
    if (remove) {
      event.preventDefault();
      holdList(function () {
        draft.items.splice(Number(remove.getAttribute("data-sched-remove")), 1);
        paintSections();
      });
      refreshCards();
      return;
    }
    if (target.closest("#sched-auto")) {
      event.preventDefault();
      holdList(function () {
        var organised = organise(draft.items);
        draft.items = organised.items;
        paintSections();
      });
      refreshCards();
      return;
    }
    if (target.closest("#sched-guide-toggle")) {
      event.preventDefault();
      guideOpen.card = !guideOpen.card;
      paintGuide();
      return;
    }
    var guide = target.closest("[data-guide]");
    if (guide) {
      event.preventDefault();
      var index = guide.getAttribute("data-guide");
      guideOpen[index] = !guideOpen[index];
      paintGuide();
      return;
    }
    if (target.closest("#sched-save")) {
      event.preventDefault();
      saveDraft();
      return;
    }
    if (target.closest("#sched-cancel")) {
      event.preventDefault();
      closeBuild();
      return;
    }
    var play = target.closest("[data-sched-play]");
    if (play) {
      event.preventDefault();
      playCombo(play.getAttribute("data-sched-play"));
      return;
    }
    var edit = target.closest("[data-sched-edit]");
    if (edit) {
      event.preventDefault();
      var editing = combos.filter(function (row) { return row.id === edit.getAttribute("data-sched-edit"); })[0];
      if (editing) openBuild(editing);
      return;
    }
    var yes = target.closest("[data-sched-yes]");
    if (yes) {
      event.preventDefault();
      deleteCombo(yes.getAttribute("data-sched-yes"));
      return;
    }
    if (target.closest("[data-sched-no]")) {
      event.preventDefault();
      confirmId = "";
      paintList();
      return;
    }
    var del = target.closest("[data-sched-delete]");
    if (del) {
      event.preventDefault();
      confirmId = del.getAttribute("data-sched-delete");
      paintList();
    }
  }

  function onDocClick(event) {
    var pick = event.target.closest(".plan-pick");
    if (pick) {
      event.preventDefault();
      openPicker(pick.getAttribute("data-plan-key"), pick.getAttribute("data-line"));
      return;
    }
    var comboPlay = event.target.closest(".combo-play");
    if (comboPlay) {
      event.preventDefault();
      playCombo(comboPlay.getAttribute("data-combo"));
      return;
    }
    if (event.target.closest("[data-plan-group]")) {
      event.preventDefault();
      placeGroupInPicker(event.target.closest("[data-plan-group]").getAttribute("data-plan-group"));
      return;
    }
    if (event.target.closest("[data-plan-combo]")) {
      event.preventDefault();
      placeCombo(event.target.closest("[data-plan-combo]").getAttribute("data-plan-combo"));
      return;
    }
    if (event.target.closest("[data-plan-clear]")) {
      event.preventDefault();
      clearPlacement();
      return;
    }
    if (event.target.closest("#group-place-go")) {
      event.preventDefault();
      placeGroupFromSheet();
      return;
    }
    if (event.target.closest("#group-place-cancel") || event.target.id === "group-place-sheet") {
      event.preventDefault();
      placeTarget = "";
      paintPlaceSheet();
      return;
    }
    if (event.target.closest("[data-plan-close]") || event.target.id === "plan-sheet") {
      event.preventDefault();
      picker = null;
      paintSheet();
    }
  }

  function boot() {
    indexCatalog();
    var root = document.getElementById("sched-root");
    if (root) root.addEventListener("click", onRootClick);
    document.addEventListener("click", onDocClick);
    var sheet = document.createElement("div");
    sheet.id = "plan-sheet";
    sheet.hidden = true;
    document.body.appendChild(sheet);
    var placeSheet = document.createElement("div");
    placeSheet.id = "group-place-sheet";
    placeSheet.hidden = true;
    document.body.appendChild(placeSheet);
    var form = document.getElementById("sched-form");
    paint();
    if (form) {
      form.addEventListener("submit", function (event) { event.preventDefault(); saveDraft(); });
    }
    var name = document.getElementById("sched-name");
    if (!name) {
      /* Form is created only in build mode. Listen later via the root click path. */
    }
    document.addEventListener("input", function (event) {
      if (event.target && event.target.id === "sched-name") draft.name = event.target.value;
      if (event.target && event.target.id === "group-name" && groupDraft) groupDraft.name = event.target.value;
    });
    document.addEventListener("change", function (event) {
      var id = event.target && event.target.id;
      var match = id && /^group-(mon|tue|wed|thu|fri|sat|sun)-([12])$/.exec(id);
      if (!match || !groupDraft) return;
      var key = match[1];
      if (!groupDraft.days[key]) groupDraft.days[key] = { line1: "", line2: "" };
      groupDraft.days[key][match[2] === "1" ? "line1" : "line2"] = event.target.value;
    });
    load();
  }

  function remember(video) {
    if (!video || !video.key) return;
    byKey[video.key] = {
      r2Key: video.key,
      title: video.title || video.key,
      src: video.src || "",
      cabin: video.cabin || "",
      group: video.group || "",
      phases: video.phases || []
    };
  }

  function forget(key) {
    if (key) delete byKey[key];
  }

  function retitle(key, title) {
    if (!key) return;
    if (byKey[key]) byKey[key].title = title;
    draft.items.forEach(function (item) {
      if (item.r2Key === key) item.title = title;
    });
    if (mode === "build") paintSections();
  }

  window.NexusBuilder = {
    organise: organise,
    notes: dayNotes,
    placement: placement,
    picked: picked,
    takeCard: takeCard,
    building: function () { return mode === "build"; },
    remember: remember,
    forget: forget,
    retitle: retitle,
    reload: load,
    paintBoard: paintBoard
  };

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
