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

  var combos = [];
  var planMap = {};
  var mode = "home";
  var active = "";
  var draft = { id: "", name: "", items: [] };
  var guideOpen = {};
  var confirmId = "";
  var picker = null;
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

  function isTillFailure(item) {
    var phases = item.phases || [];
    if (/till failure/.test(String(item.title || "").toLowerCase())) return true;
    return phases.indexOf("Till Failure") !== -1 && phases.indexOf("Base") === -1;
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
    if (list.some(isTillFailure)) notes.push("Till Failure is in this day.");
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
    var sorted = items.slice().sort(function (a, b) {
      return (SECTION_RANK[a.section] || 0) - (SECTION_RANK[b.section] || 0);
    });
    return sorted.filter(function (item) { return item.src; }).map(function (item) {
      return { title: item.title, src: item.src, cabin: item.cabin };
    });
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

  function paintList() {
    var host = document.getElementById("sched-list");
    if (!host) return;
    if (!combos.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = combos.map(function (combo) {
      var asking = confirmId === combo.id;
      var html = '<article class="sched-row">';
      html += '<button type="button" class="sched-play" data-sched-play="' + esc(combo.id) + '"><span class="sched-play-name">' + esc(combo.name) + '</span><span class="sched-play-count">' + esc(counts(combo.items)) + "</span></button>";
      html += '<span class="sched-row-actions">';
      html += '<button type="button" data-sched-edit="' + esc(combo.id) + '">Edit</button>';
      html += '<button type="button" data-sched-delete="' + esc(combo.id) + '">Delete</button>';
      html += "</span>";
      if (asking) {
        html += '<p class="sched-confirm">Delete this schedule?<button type="button" data-sched-yes="' + esc(combo.id) + '">Delete</button><button type="button" data-sched-no>Keep</button></p>';
      }
      html += "</article>";
      return html;
    }).join("");
  }

  function paintHome() {
    var root = document.getElementById("sched-root");
    if (!root) return;
    if (!document.getElementById("sched-home")) {
      root.innerHTML = '<div id="sched-home"><button type="button" class="sched-go" id="sched-build">Build a schedule</button><h2 class="sched-h">My schedules</h2><div id="sched-list"></div></div>' +
        '<form id="sched-form" hidden></form>';
    }
    document.getElementById("sched-home").hidden = mode !== "home";
    document.getElementById("sched-form").hidden = mode !== "build";
    if (mode === "home") paintList();
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
  }

  function refreshCards() {
    if (window.NexusCards && window.NexusCards.render && document.body && document.body.classList.contains("is-cards")) {
      window.NexusCards.render();
    }
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
      window.nexusFetch("/training-combos"),
      window.nexusFetch("/training-plan")
    ]).then(function (pair) {
      applyRemote((pair[0] && pair[0].combos) || [], (pair[1] && pair[1].plan) || []);
      paint();
      refreshPage();
    }).catch(function () {
      paint();
    });
  }

  function openBuild(combo) {
    mode = "build";
    active = "";
    confirmId = "";
    if (combo) {
      draft = {
        id: combo.id,
        name: combo.name || "",
        items: (combo.items || []).map(hydrate)
      };
    } else {
      draft = { id: "", name: "", items: [] };
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
    draft.items.splice(insertAt, 0, item);
    setMsg("");
    paintSections();
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
      body: { name: name, items: payloadItems(draft.items) }
    }).then(function (saved) {
      var row = saved && saved.id ? saved : { id: id, name: name, items: payloadItems(draft.items) };
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
    html += '<p class="plan-sheet-title">Choose schedule</p>';
    if (!combos.length) html += '<p class="sched-note">No saved schedules.</p>';
    combos.forEach(function (combo) {
      html += '<button type="button" class="plan-choice" data-plan-combo="' + esc(combo.id) + '"><span>' + esc(combo.name) + '</span><span class="sched-count">' + esc(counts(combo.items)) + "</span></button>";
    });
    html += '<button type="button" class="plan-clear" data-plan-clear>Use trainer schedule</button>';
    html += '<button type="button" class="plan-close" data-plan-close>Cancel</button>';
    html += "</div>";
    sheet.innerHTML = html;
    sheet.hidden = false;
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
      draft.items.splice(Number(remove.getAttribute("data-sched-remove")), 1);
      paintSections();
      refreshCards();
      return;
    }
    if (target.closest("#sched-auto")) {
      event.preventDefault();
      var organised = organise(draft.items);
      draft.items = organised.items;
      paintSections();
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

  window.NexusBuilder = {
    organise: organise,
    notes: dayNotes,
    placement: placement,
    picked: picked,
    takeCard: takeCard,
    building: function () { return mode === "build"; },
    remember: remember,
    forget: forget,
    reload: load
  };

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
