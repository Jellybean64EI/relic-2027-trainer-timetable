/* Forensic execution profiles — window.RELIC_FORENSIC.
   Every cabin uses the same typographical blocks:
     Sets: X | Reps: X | Hold: X | Rest: X
     3-Lead Unique Rule: Left-Lead. 3-second ease.
     Do this properly: ...
     Avoid this: ...
   Breathing is part of the profile:
     Box Breathing (4-4-4-4) — isometric holds and posture resets
     Relaxation Breathing (4-7-8) — deep restorative stretches
     Controlled Nasal Cadence — synced with the 3-second negative eccentric
   Q4 2026 bridge refuses Hanging, Target_Weights, and Calisthenics.
   Calisthenics is prescribed only on the 2027 Till Failure year. */
window.RELIC_FORENSIC = (function () {
  var LEAD = "Left-Lead. 3-second ease.";
  var BREATH = {
    box: "Box Breathing (4-4-4-4)",
    relax: "Relaxation Breathing (4-7-8)",
    nasal: "Controlled Nasal Cadence synced with the 3-second negative eccentric tempo"
  };

  function dose(sets, reps, holdSec, restSec, breathing, doThis, avoidThis, bridgeBlock) {
    return {
      allowed: true,
      sets: sets,
      reps: reps,
      holdSec: holdSec,
      restSec: restSec,
      leadRule: LEAD,
      breathing: breathing,
      doThis: doThis,
      avoidThis: avoidThis,
      bridgeBlock: bridgeBlock || ""
    };
  }

  var PROFILES = {
    Back: dose(
      3, 8, 2, 90, BREATH.nasal,
      "Brace the trunk, lead with the left side, and lower for 3 seconds. Keep the ribs stacked over the pelvis.",
      "Jerky drops, lumbar collapse, and pulling the neck forward."
    ),
    Chest: dose(
      3, 8, 2, 90, BREATH.nasal,
      "Set the shoulders down, lead left, and ease the lowering for 3 seconds. Keep the neck long.",
      "Bouncing the lockout, flaring the ribs, and shrugging into the ears."
    ),
    Legs_Glutes: dose(
      3, 8, 2, 90, BREATH.nasal,
      "Track the knees over the toes, lead left, and lower for 3 seconds. Keep the feet quiet.",
      "Knee cave, bouncing out of the bottom, and holding the breath."
    ),
    Upper_Arms: dose(
      3, 8, 2, 75, BREATH.nasal,
      "Pin the elbows where the drill asks, lead left, and ease the lowering for 3 seconds.",
      "Swinging the torso and snapping the elbow lock."
    ),
    Abs_Pelvic: dose(
      3, 8, 2, 60, BREATH.box,
      "Stack the ribs over the pelvis and hold the shape. This is an isometric brace, so use Box Breathing (4-4-4-4).",
      "Doming the abdomen, yanking the neck, and forcing the pelvis into a hard tuck."
    ),
    Calisthenics: dose(
      2, 6, 2, 90, BREATH.nasal,
      "Own the gymnastic line. Lead left and ease the negative for 3 seconds. Stop while the shape is still clean.",
      "Kipping through a shape you cannot lower, and grinding into a shake.",
      "Calisthenics is reserved for Q4 2027 Till Failure. The bridge uses joint mobility, posture, and core alignment."
    ),
    Resistance_Bands: dose(
      3, 10, 2, 60, BREATH.nasal,
      "Keep tension on the band, lead left, and ease back for 3 seconds.",
      "Letting the band snap home and leaning the spine off the anchor."
    ),
    Hand_Wrist_Forearm: dose(
      2, 10, 2, 45, BREATH.box,
      "Move the wrist and forearm through a pain-free range and hold the end shape with Box Breathing (4-4-4-4).",
      "Pinching through a sharp joint line and loading a cold wrist."
    ),
    Posture_Mobility: dose(
      2, 6, 3, 45,
      BREATH.box + " for posture resets. " + BREATH.relax + " for deep restorative stretches.",
      "Reset the stack with Box Breathing (4-4-4-4). On a deep restorative stretch, switch to Relaxation Breathing (4-7-8) and let the exhale lengthen the shape.",
      "Forcing a stretch that changes the breath or the joint line."
    ),
    Neck: dose(
      2, 6, 2, 45, BREATH.box,
      "Lengthen the crown, keep the jaw soft, and reset the neck with Box Breathing (4-4-4-4).",
      "Circling into a pinch and bracing the shoulders up."
    ),
    Face: dose(
      2, 6, 2, 45, BREATH.box,
      "Hold each face shape still. Box Breathing (4-4-4-4) sets the isometric tempo.",
      "Gripping the jaw and rushing the hold."
    ),
    Eyes: dose(
      2, 6, 2, 45, BREATH.box,
      "Move the eyes smoothly and hold the end gaze. Box Breathing (4-4-4-4) keeps the hold quiet.",
      "Straining the brow and skipping the hold."
    ),
    Tongue: dose(
      2, 6, 2, 45, BREATH.box,
      "Place the tongue and hold. Box Breathing (4-4-4-4) matches the isometric.",
      "Clenching the teeth and forcing the swallow."
    ),
    Jaw: dose(
      2, 6, 2, 45, BREATH.box,
      "Keep the jaw heavy and hold the open or close shape with Box Breathing (4-4-4-4).",
      "Clicking the joint and grinding the molars."
    ),
    Hanging: dose(
      3, 5, 8, 90, BREATH.box,
      "Set the shoulders before the feet leave, then hold with Box Breathing (4-4-4-4). Step down before a shake.",
      "Shrugging into a dead hang and adding load.",
      "No hanging on the Q4 2026 bridge."
    ),
    Target_Weights: dose(
      3, 8, 2, 90, BREATH.nasal,
      "Choose a load you can lower for 3 seconds on the left lead. Keep the nasal cadence on the eccentric.",
      "Failed reps and bouncing the plates.",
      "No added load on the Q4 2026 bridge."
    )
  };

  function metricsLine(sets, reps, holdSec, restSec) {
    return "Sets: " + sets + " | Reps: " + reps + " | Hold: " + holdSec + "s | Rest: " + restSec + "s";
  }

  function emptyRead(branch, cabinKey) {
    return {
      branch: branch,
      cabinKey: cabinKey || "",
      allowed: branch === "bridge" ? false : null,
      sets: null,
      reps: null,
      holdSec: null,
      restSec: null,
      leadRule: LEAD,
      breathing: "",
      doThis: "",
      avoidThis: "",
      metrics: "",
      note: ""
    };
  }

  function read(branch, cabinKey) {
    var key = branch === "bridge" ? "bridge" : "year";
    var profile = cabinKey && PROFILES[cabinKey] ? PROFILES[cabinKey] : null;
    if (!profile) return emptyRead(key, cabinKey);
    var blocked = key === "bridge" && !!profile.bridgeBlock;
    var sets = blocked ? 0 : profile.sets;
    var reps = blocked ? 0 : profile.reps;
    var holdSec = blocked ? 0 : profile.holdSec;
    var restSec = blocked ? 0 : profile.restSec;
    var avoid = profile.avoidThis;
    if (blocked) avoid = profile.bridgeBlock + " " + avoid;
    return {
      branch: key,
      cabinKey: cabinKey,
      allowed: !blocked,
      sets: sets,
      reps: reps,
      holdSec: holdSec,
      restSec: restSec,
      leadRule: profile.leadRule,
      breathing: profile.breathing,
      doThis: profile.doThis,
      avoidThis: avoid,
      metrics: metricsLine(sets, reps, holdSec, restSec),
      note: blocked ? profile.bridgeBlock : "",
      ruleId: blocked ? "bridge-block" : ""
    };
  }

  /* Clip cues keyed by Drive file id. Cabin profiles stay the fallback. */
  var clipsById = {};
  var clipsByTitle = {};

  function phaseKey(phase) {
    var raw = String(phase || "Base").replace(/\s+/g, "_");
    if (raw === "Till_Failure" || raw === "TillFailure") return "Till_Failure";
    if (raw === "Hard" || raw === "Expert" || raw === "Base") return raw;
    return raw || "Base";
  }

  function normTitle(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/\.mp4$/i, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function titleKey(cabin, title) {
    return String(cabin || "") + "|" + normTitle(title);
  }

  var SECTION_RANK = { PRE: 0, MAIN: 1, POST: 2 };

  function ingestClips(list) {
    (list || []).forEach(function (raw) {
      if (!raw) return;
      var id = String(raw.id || raw.driveFileId || "");
      var title = raw.title || "";
      if (!id && !title) return;
      var clip = {
        id: id,
        cabin: raw.cabin || raw.cabinKey || "",
        phase: phaseKey(raw.phase || "Base"),
        title: title,
        section: raw.section || "",
        number: raw.number || 0,
        metrics: raw.metrics || "",
        leadRule: raw.leadRule || "",
        doThis: raw.doThis || "",
        avoidThis: raw.avoidThis || "",
        breathing: raw.breathing || ""
      };
      if (id) {
        var bucket = clipsById[id] || (clipsById[id] = []);
        bucket.push(clip);
      }
      var tkey = titleKey(clip.cabin, clip.title) + "|" + clip.phase;
      var titled = clipsByTitle[tkey] || (clipsByTitle[tkey] = []);
      titled.push(clip);
    });
    return stats();
  }

  function bestBlock(list, title) {
    var pool = list.slice();
    if (title) {
      var want = normTitle(title);
      var titled = pool.filter(function (clip) { return normTitle(clip.title) === want; });
      if (titled.length) pool = titled;
    }
    pool.sort(function (a, b) {
      var ra = SECTION_RANK[a.section] == null ? 9 : SECTION_RANK[a.section];
      var rb = SECTION_RANK[b.section] == null ? 9 : SECTION_RANK[b.section];
      if (ra !== rb) return ra - rb;
      return (a.number || 0) - (b.number || 0);
    });
    return pool[0] || null;
  }

  function pickClip(list, phase, cabinKey, title) {
    if (!list || !list.length) return null;
    var pool = list.filter(function (clip) {
      return !cabinKey || !clip.cabin || clip.cabin === cabinKey;
    });
    if (!pool.length) pool = list;
    var want = phaseKey(phase);
    var phased = pool.filter(function (clip) { return clip.phase === want; });
    if (!phased.length) phased = pool.filter(function (clip) { return clip.phase === "Base"; });
    if (!phased.length) phased = pool;
    return bestBlock(phased, title);
  }

  function titleHits(cabinKey, title, phase) {
    var exact = clipsByTitle[titleKey(cabinKey, title) + "|" + phaseKey(phase)];
    if (exact && exact.length) return exact;
    var base = clipsByTitle[titleKey(cabinKey, title) + "|Base"];
    if (base && base.length) return base;
    var loose = titleKey(cabinKey, title);
    var bag = [];
    Object.keys(clipsByTitle).forEach(function (key) {
      if (key.indexOf(loose + "|") === 0) bag = bag.concat(clipsByTitle[key]);
    });
    return bag;
  }

  function readClip(query) {
    var q = query || {};
    var cabinKey = q.cabinKey || "";
    var phase = phaseKey(q.phase || "Base");
    var branch = q.branch === "bridge" ? "bridge" : "year";
    var found = null;
    if (q.clipId && clipsById[q.clipId]) found = pickClip(clipsById[q.clipId], phase, cabinKey, q.title);
    if (!found && q.title) found = pickClip(titleHits(cabinKey, q.title, phase), phase, cabinKey, q.title);
    if (found && (found.doThis || found.avoidThis || found.metrics)) {
      return {
        source: "clip",
        branch: branch,
        cabinKey: found.cabin || cabinKey,
        phase: found.phase,
        clipId: found.id,
        title: found.title,
        section: found.section || "",
        allowed: true,
        leadRule: found.leadRule,
        breathing: found.breathing || "",
        doThis: found.doThis,
        avoidThis: found.avoidThis,
        metrics: found.metrics,
        note: ""
      };
    }
    var profile = read(branch, cabinKey);
    profile.source = "profile";
    profile.title = "";
    profile.clipId = q.clipId || "";
    profile.phase = phase;
    return profile;
  }

  function stats() {
    var blocks = 0;
    var titleOnly = 0;
    Object.keys(clipsById).forEach(function (id) { blocks += clipsById[id].length; });
    Object.keys(clipsByTitle).forEach(function (key) {
      clipsByTitle[key].forEach(function (clip) { if (!clip.id) titleOnly += 1; });
    });
    return { ids: Object.keys(clipsById).length, blocks: blocks, titleOnly: titleOnly };
  }

  return {
    leadRule: LEAD,
    breathing: BREATH,
    profiles: PROFILES,
    read: read,
    readClip: readClip,
    ingestClips: ingestClips,
    stats: stats,
    normTitle: normTitle
  };
})();
