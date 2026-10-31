#!/usr/bin/env node
/* Rebuild data/videoCatalog.js (schema v2) from tools/videoCatalog.draft.json.
   Placement comes from tools/v64_placement.js and must match tools/v64_mapping.json.
   Does not read schedule.js, upperBody.js, videoArchive.js, precondition.js,
   citations.js, forensic.js, or cues/. Does not write R2 or D1. */
const fs = require("fs");
const path = require("path");
const placeApi = require("./v64_placement.js");

const root = path.join(__dirname, "..");
const draftPath = path.join(__dirname, "videoCatalog.draft.json");
const mapPath = path.join(__dirname, "v64_mapping.json");
const backupPath = path.join(root, "data", "backup", "videoCatalog.v63.js");
const outPath = path.join(root, "data", "videoCatalog.js");

const MODULES = [
  { id: "pre", name: "Pre" },
  { id: "exercise", name: "Main" },
  { id: "post", name: "Post" }
];
const PHASE_ORDER = ["Base", "Hard", "Expert", "Till Failure"];
const LEGACY_SOURCE = {
  "Back": "back",
  "Chest": "chest",
  "Arms": "arms",
  "Legs & Glutes": "legs",
  "Core & Pelvis": "core",
  "Neck": "neck",
  "Posture & Mobility": "posture",
  "Face & Head": "face",
  "Equipment / Mixed": "equipment"
};
const EXPECT = {
  face: { videos: 33, pre: 10, exercise: 12, post: 11 },
  eyes: { videos: 6, pre: 0, exercise: 6, post: 0 },
  tongue: { videos: 11, pre: 0, exercise: 3, post: 8 },
  jaw: { videos: 27, pre: 3, exercise: 13, post: 11 },
  neck: { videos: 26, pre: 6, exercise: 13, post: 7 },
  shoulders: { videos: 18, pre: 8, exercise: 7, post: 5 },
  "upper-arms": { videos: 22, pre: 3, exercise: 15, post: 4 },
  forearms: { videos: 10, pre: 2, exercise: 8, post: 1 },
  chest: { videos: 36, pre: 8, exercise: 20, post: 8 },
  "upper-back": { videos: 22, pre: 2, exercise: 19, post: 1 },
  "lower-back": { videos: 13, pre: 4, exercise: 1, post: 8 },
  abs: { videos: 17, pre: 0, exercise: 17, post: 0 },
  obliques: { videos: 6, pre: 2, exercise: 3, post: 1 },
  pelvic: { videos: 12, pre: 8, exercise: 0, post: 4 },
  kegel: { videos: 0, pre: 0, exercise: 0, post: 0 },
  "hip-flexors": { videos: 9, pre: 4, exercise: 0, post: 5 },
  glutes: { videos: 6, pre: 0, exercise: 5, post: 1 },
  quads: { videos: 11, pre: 1, exercise: 9, post: 1 },
  hamstrings: { videos: 1, pre: 0, exercise: 1, post: 0 },
  calves: { videos: 2, pre: 0, exercise: 2, post: 0 },
  feet: { videos: 3, pre: 1, exercise: 2, post: 0 },
  "sp-posture-mobility": { videos: 28, pre: 8, exercise: 20, post: 8 },
  "sp-calisthenics": { videos: 7, pre: 2, exercise: 3, post: 2 },
  "sp-resistance-bands": { videos: 25, pre: 4, exercise: 20, post: 5 },
  "sp-hanging": { videos: 10, pre: 1, exercise: 9, post: 0 },
  "sp-target-weights": { videos: 11, pre: 0, exercise: 11, post: 0 },
  "check-me": { videos: 5, pre: 0, exercise: 4, post: 1 }
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

function leaves() {
  const muscle = placeApi.CABINS.map(function (row, index) {
    return { id: row[0], name: row[1], order: index + 1, parent: null, special: false, specialType: null };
  });
  const specials = placeApi.SPECIALS.map(function (row, index) {
    return { id: row[0], name: row[1], order: index + 1, parent: "specials", special: true, specialType: row[2] };
  });
  return muscle.concat(specials, [{ id: "check-me", name: "Check me", order: 1, parent: null, special: false, specialType: null }]);
}

function build(rows, mapped) {
  const byKey = new Map();
  rows.forEach(function (row) {
    if (!byKey.has(row.r2Key)) byKey.set(row.r2Key, []);
    byKey.get(row.r2Key).push(row);
  });
  const bags = {};
  leaves().forEach(function (leaf) {
    bags[leaf.id] = { pre: [], exercise: [], post: [] };
  });
  byKey.forEach(function (list, key) {
    const rep = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })[0];
    const folder = key.split("/")[0];
    const title = cleanTitle(rep.title);
    const mods = [];
    list.forEach(function (row) {
      modulesForType(row.type).forEach(function (id) {
        if (mods.indexOf(id) === -1) mods.push(id);
      });
    });
    const needsReview = list.some(function (row) { return row.type === "needs review" || /NEEDS_REVIEW/.test(row.title || ""); });
    const placed = placeApi.place(folder, title);
    const legacy = LEGACY_SOURCE[rep.group];
    if (!legacy) throw new Error("Unknown v63 group " + rep.group + " for " + key);
    let cabin = placed ? placed.cabin : "check-me";
    let special = placed ? placed.special : false;
    let specialType = placed ? placed.special_type : null;
    let confidence = placed ? placed.confidence : "low";
    let rule = placed ? placed.rule : "no keyword match in multi-target folder " + folder;
    let suggested = null;
    if (!placed || needsReview) {
      suggested = placed ? placed.cabin : null;
      cabin = "check-me";
      special = placed ? placed.special : false;
      specialType = placed ? placed.special_type : null;
      confidence = "low";
      rule = !placed ? "no keyword match in multi-target folder " + folder : "module flagged 'needs review' in source catalogue";
    }
    const expected = mapped.get(key);
    if (!expected) throw new Error("mapping missing " + key);
    if (expected.cabin !== cabin) throw new Error(key + " cabin " + cabin + " != " + expected.cabin);
    if (expected.modules.join(",") !== mods.join(",")) throw new Error(key + " modules " + mods.join(",") + " != " + expected.modules.join(","));
    const card = {
      key: key,
      title: title,
      src: rep.url,
      phases: phaseList(list),
      guess: list.some(function (row) { return String(row.typeSource || "").indexOf("title guess") === 0; }),
      check: needsReview,
      cabin: rep.cabin,
      origin: folder,
      legacyGroup: legacy,
      special: !!special,
      specialType: specialType,
      alsoTargets: placeApi.alsoTargets(title, cabin === "check-me" ? suggested : cabin),
      confidence: confidence,
      rule: rule
    };
    if (cabin === "check-me") card.suggestedCabin = suggested;
    mods.forEach(function (id) { bags[cabin][id].push(Object.assign({}, card)); });
  });
  return leaves().map(function (leaf) {
    MODULES.forEach(function (mod) {
      bags[leaf.id][mod.id].sort(function (a, b) { return a.key.localeCompare(b.key); });
    });
    const seen = new Set();
    MODULES.forEach(function (mod) {
      bags[leaf.id][mod.id].forEach(function (video) { seen.add(video.key); });
    });
    return {
      id: leaf.id,
      name: leaf.name,
      order: leaf.order,
      parent: leaf.parent,
      special: leaf.special,
      specialType: leaf.specialType,
      count: seen.size,
      modules: MODULES.map(function (mod) {
        return { id: mod.id, name: mod.name, count: bags[leaf.id][mod.id].length, videos: bags[leaf.id][mod.id] };
      })
    };
  });
}

function assertCatalog(groups, v63keys) {
  const keys = new Set();
  const homes = {};
  groups.forEach(function (group) {
    const want = EXPECT[group.id];
    if (!want) throw new Error("Unexpected group " + group.id);
    if (group.modules.map(function (mod) { return mod.id; }).join(",") !== "pre,exercise,post") throw new Error(group.id + " modules");
    if (group.modules.map(function (mod) { return mod.name; }).join(",") !== "Pre,Main,Post") throw new Error(group.id + " labels");
    const seen = new Set();
    group.modules.forEach(function (mod) {
      if (mod.count !== want[mod.id]) throw new Error(group.id + " " + mod.id + " " + mod.count + " != " + want[mod.id]);
      if (mod.videos.length !== mod.count) throw new Error(group.id + " " + mod.id + " length");
      mod.videos.forEach(function (video) {
        seen.add(video.key);
        keys.add(video.key);
        if (homes[video.key] && homes[video.key] !== group.id) throw new Error(video.key + " in two cabins");
        homes[video.key] = group.id;
        if (!video.title || !video.src || !video.origin || !video.legacyGroup) throw new Error("incomplete " + video.key);
      });
    });
    if (seen.size !== want.videos || group.count !== want.videos) throw new Error(group.id + " videos " + seen.size);
  });
  if (keys.size !== 377) throw new Error("unique keys " + keys.size);
  if (v63keys.size !== 377) throw new Error("v63 keys " + v63keys.size);
  v63keys.forEach(function (key) { if (!keys.has(key)) throw new Error("missing v63 key " + key); });
  keys.forEach(function (key) { if (!v63keys.has(key)) throw new Error("new key " + key); });
  const guesses = [];
  groups.forEach(function (group) {
    group.modules.forEach(function (mod) {
      mod.videos.forEach(function (video) { if (video.guess) guesses.push(video.key + "|" + mod.id); });
    });
  });
  if (guesses.length !== 47) throw new Error("guess cards " + guesses.length);
  const check = groups.find(function (group) { return group.id === "check-me"; });
  if (check.count !== 5) throw new Error("check-me " + check.count);
}

function v63Keys() {
  const text = fs.readFileSync(backupPath, "utf8");
  const keys = new Set();
  const re = /"key":"([^"]+)"/g;
  let match;
  while ((match = re.exec(text))) keys.add(match[1]);
  return keys;
}

function main() {
  const rows = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  if (!Array.isArray(rows) || rows.length !== 393) throw new Error("draft rows " + (rows && rows.length));
  const mapping = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const mapped = new Map();
  (mapping.entries || []).forEach(function (entry) {
    if (!entry.custom) mapped.set(entry.r2Key, entry);
  });
  if (mapped.size !== 377) throw new Error("mapping library keys " + mapped.size);
  const groups = build(rows, mapped);
  assertCatalog(groups, v63Keys());
  const body = {
    version: "v64",
    moduleLabels: { pre: "Pre", exercise: "Main", post: "Post" },
    layout: {
      cabins: placeApi.CABINS.map(function (row) { return row[0]; }),
      specials: {
        id: "specials",
        name: "Specials",
        subCabins: placeApi.SPECIALS.map(function (row) { return row[0]; })
      },
      checkMe: "check-me"
    },
    groups: groups
  };
  const text = "/* Read-only video card catalogue. Generated by tools/build_catalog.js. Do not edit by hand. */\n" +
    "window.NEXUS_VIDEO_CATALOG = " + JSON.stringify(body) + ";\n";
  fs.writeFileSync(outPath, text);
  console.log("OK v64 catalog", groups.map(function (group) { return group.id + " " + group.count; }).join(" · "));
}

main();
