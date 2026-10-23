#!/usr/bin/env node
/* Rebuild data/videoCatalog.js from tools/videoCatalog.draft.json.
   The draft is the 393-row catalogue (one playlist entry each). This script
   does not read or write schedule.js, upperBody.js, videoArchive.js,
   precondition.js, citations.js, forensic.js, or cues/.
   Each r2Key is kept once per module. A file that is both a pre-stretch and
   a post-stretch is listed in both of those modules. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const draftPath = path.join(__dirname, "videoCatalog.draft.json");
const outPath = path.join(root, "data", "videoCatalog.js");

const CABIN_RANK = {
  Back: 0,
  Chest: 1,
  Upper_Arms: 2,
  Hand_Wrist_Forearm: 3,
  Legs_Glutes: 4,
  Abs_Pelvic: 5,
  Kegel_Hip_Flexors: 6,
  Posture_Mobility: 7,
  Neck: 8,
  Face: 9,
  Eyes: 10,
  Tongue: 11,
  Jaw: 12,
  Calisthenics: 13,
  Resistance_Bands: 14,
  Hanging: 15,
  Target_Weights: 16
};

const GROUPS = [
  { id: "back", name: "Back", source: "Back" },
  { id: "chest", name: "Chest", source: "Chest" },
  { id: "arms", name: "Arms", source: "Arms" },
  { id: "legs", name: "Legs & Glutes", source: "Legs & Glutes" },
  { id: "core", name: "Core & Pelvis", source: "Core & Pelvis" },
  { id: "neck", name: "Neck", source: "Neck" },
  { id: "posture", name: "Posture & Mobility", source: "Posture & Mobility" },
  { id: "face", name: "Face & Head", source: "Face & Head" },
  { id: "equipment", name: "Equipment", source: "Equipment / Mixed" }
];

const MODULES = [
  { id: "pre", name: "Pre-stretches" },
  { id: "exercise", name: "Exercises" },
  { id: "post", name: "Post-stretches" }
];

const PHASE_ORDER = ["Base", "Hard", "Expert", "Till Failure"];

const EXPECT = {
  back: { count: 33, pre: 7, exercise: 20, post: 6 },
  chest: { count: 34, pre: 7, exercise: 20, post: 7 },
  arms: { count: 51, pre: 13, exercise: 29, post: 12 },
  legs: { count: 36, pre: 8, exercise: 20, post: 8 },
  core: { count: 36, pre: 8, exercise: 20, post: 8 },
  neck: { count: 29, pre: 6, exercise: 17, post: 6 },
  posture: { count: 28, pre: 8, exercise: 20, post: 8 },
  face: { count: 77, pre: 13, exercise: 34, post: 30 },
  equipment: { count: 53, pre: 7, exercise: 43, post: 7 }
};

function cleanTitle(title) {
  return String(title || "").replace(/\.mp4$/i, "").replace(/^\d+\.\s*/, "").trim();
}

function modulesForType(type) {
  if (type === "pre-stretch") return ["pre"];
  if (type === "post-stretch") return ["post"];
  if (type === "exercise" || type === "exercise (guess)" || type === "needs review") return ["exercise"];
  if (type === "stretch (pre or post)") return ["pre", "post"];
  if (type === "stretch/mobility (guess)") return ["post"];
  throw new Error("Unknown catalogue type: " + type);
}

function phaseList(rows) {
  const found = new Set();
  rows.forEach(function (row) {
    String(row.phases || "").split("/").filter(Boolean).forEach(function (phase) {
      found.add(phase === "Till_Failure" ? "Till Failure" : phase.replace(/_/g, " "));
    });
  });
  return PHASE_ORDER.filter(function (phase) { return found.has(phase); });
}

function build(rows) {
  const byGroup = new Map();
  rows.forEach(function (row) {
    const source = row.group === "Equipment / Mixed" ? "Equipment / Mixed" : row.group;
    if (!byGroup.has(source)) byGroup.set(source, new Map());
    const bag = byGroup.get(source);
    if (!bag.has(row.r2Key)) bag.set(row.r2Key, []);
    bag.get(row.r2Key).push(row);
  });

  return GROUPS.map(function (group) {
    const bag = byGroup.get(group.source) || new Map();
    const modules = {
      pre: [],
      exercise: [],
      post: []
    };
    bag.forEach(function (list, key) {
      const mods = new Set();
      list.forEach(function (row) {
        modulesForType(row.type).forEach(function (id) { mods.add(id); });
      });
      const rep = list.slice().sort(function (a, b) {
        return (CABIN_RANK[a.cabin] || 0) - (CABIN_RANK[b.cabin] || 0) || (a.order || 0) - (b.order || 0);
      })[0];
      const card = {
        title: cleanTitle(rep.title),
        phases: phaseList(list),
        guess: list.some(function (row) { return String(row.typeSource || "").indexOf("title guess") === 0; }),
        check: list.some(function (row) { return row.type === "needs review" || /NEEDS_REVIEW/.test(row.title || ""); }),
        src: rep.url,
        cabin: rep.cabin,
        key: key,
        rank: CABIN_RANK[rep.cabin] == null ? 99 : CABIN_RANK[rep.cabin],
        order: rep.order || 0
      };
      mods.forEach(function (id) { modules[id].push(Object.assign({}, card)); });
    });
    MODULES.forEach(function (mod) {
      modules[mod.id].sort(function (a, b) {
        return a.rank - b.rank || a.order - b.order || a.key.localeCompare(b.key);
      });
      modules[mod.id].forEach(function (card) {
        delete card.rank;
        delete card.order;
      });
    });
    return {
      id: group.id,
      name: group.name,
      count: bag.size,
      modules: MODULES.map(function (mod) {
        return { id: mod.id, name: mod.name, count: modules[mod.id].length, videos: modules[mod.id] };
      })
    };
  });
}

function assertCatalog(groups) {
  const keys = new Set();
  groups.forEach(function (group) {
    const want = EXPECT[group.id];
    if (!want) throw new Error("Unexpected group " + group.id);
    if (group.count !== want.count) throw new Error(group.name + " count " + group.count);
    const seen = new Set();
    group.modules.forEach(function (mod) {
      if (mod.count !== want[mod.id]) throw new Error(group.name + " " + mod.name + " " + mod.count);
      if (mod.videos.length !== mod.count) throw new Error(group.name + " " + mod.id + " length");
      mod.videos.forEach(function (video) {
        keys.add(video.key);
        seen.add(video.key);
        if (!video.title || !video.src || !video.cabin) throw new Error("incomplete card " + video.key);
      });
    });
    if (seen.size !== group.count) throw new Error(group.name + " unique " + seen.size);
  });
  if (keys.size !== 377) throw new Error("unique keys " + keys.size);
  const neckExercise = groups.find(function (group) { return group.id === "neck"; }).modules[1];
  const checks = neckExercise.videos.filter(function (video) { return video.check; });
  if (checks.length !== 4) throw new Error("neck checks " + checks.length);
  const guesses = [];
  groups.forEach(function (group) {
    group.modules.forEach(function (mod) {
      mod.videos.forEach(function (video) { if (video.guess) guesses.push(video.key + "|" + mod.id); });
    });
  });
  if (guesses.length !== 47) throw new Error("guess cards " + guesses.length);
}

function main() {
  const rows = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  if (!Array.isArray(rows) || rows.length !== 393) throw new Error("draft rows " + (rows && rows.length));
  const groups = build(rows);
  assertCatalog(groups);
  const body = "/* Read-only video card catalogue. Generated by tools/build_catalog.js. Do not edit by hand. */\n" +
    "window.NEXUS_VIDEO_CATALOG = " + JSON.stringify({ groups: groups }) + ";\n";
  fs.writeFileSync(outPath, body);
  console.log("OK video catalog", groups.map(function (group) {
    return group.name + " " + group.count;
  }).join(" · "));
}

main();
