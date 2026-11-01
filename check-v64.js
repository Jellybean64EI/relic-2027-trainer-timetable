/* Nexus v64: 21 head-to-toe cabins, Specials, Pre/Main/Post, Check me. */
var fs = require("fs");
var cp = require("child_process");
var vm = require("vm");
var failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}

function ok(msg) {
  console.log("OK " + msg);
}

function loadCatalog(file) {
  var ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return ctx.window.NEXUS_VIDEO_CATALOG;
}

var CABINS = ["face", "eyes", "tongue", "jaw", "neck", "shoulders", "upper-arms", "forearms", "chest", "upper-back", "lower-back", "abs", "obliques", "pelvic", "kegel", "hip-flexors", "glutes", "quads", "hamstrings", "calves", "feet"];
var SPECIALS = ["sp-posture-mobility", "sp-calisthenics", "sp-resistance-bands", "sp-hanging", "sp-target-weights"];
var EXPECT = {
  face: { videos: 32, pre: 10, exercise: 12, post: 10 },
  eyes: { videos: 6, pre: 0, exercise: 6, post: 0 },
  tongue: { videos: 11, pre: 0, exercise: 3, post: 8 },
  jaw: { videos: 27, pre: 2, exercise: 14, post: 11 },
  neck: { videos: 27, pre: 6, exercise: 15, post: 6 },
  shoulders: { videos: 18, pre: 8, exercise: 7, post: 5 },
  "upper-arms": { videos: 19, pre: 3, exercise: 15, post: 1 },
  forearms: { videos: 10, pre: 2, exercise: 8, post: 0 },
  chest: { videos: 36, pre: 8, exercise: 20, post: 8 },
  "upper-back": { videos: 24, pre: 2, exercise: 19, post: 3 },
  "lower-back": { videos: 12, pre: 4, exercise: 1, post: 7 },
  abs: { videos: 16, pre: 0, exercise: 16, post: 0 },
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
  "sp-resistance-bands": { videos: 24, pre: 3, exercise: 20, post: 4 },
  "sp-hanging": { videos: 10, pre: 1, exercise: 9, post: 0 },
  "sp-target-weights": { videos: 11, pre: 0, exercise: 11, post: 0 }
};

var catalog = loadCatalog("data/videoCatalog.js");
var previous = loadCatalog("data/backup/videoCatalog.v63.js");
var html = fs.readFileSync("index.html", "utf8");
var byId = {};
(catalog.groups || []).forEach(function (group) { byId[group.id] = group; });

if (!catalog.layout || catalog.layout.cabins.join(",") !== CABINS.join(",")) fail("muscle cabins are out of order");
else ok("21 muscle cabins stay head to toe");
if (!catalog.layout.specials || catalog.layout.specials.subCabins.join(",") !== SPECIALS.join(",")) fail("specials sub-cabins are out of order");
else ok("specials stay last and in order");

var keys = {};
var homes = {};
Object.keys(EXPECT).forEach(function (id) {
  var group = byId[id];
  var want = EXPECT[id];
  if (!group) {
    fail("missing cabin " + id);
    return;
  }
  if (group.modules.map(function (mod) { return mod.id + ":" + mod.name; }).join(",") !== "pre:Pre,exercise:Main,post:Post") {
    fail(id + " modules are not Pre/Main/Post");
  }
  var seen = {};
  group.modules.forEach(function (mod) {
    if (mod.count !== want[mod.id] || mod.videos.length !== mod.count) fail(id + " " + mod.id + " count " + mod.count);
    mod.videos.forEach(function (video) {
      seen[video.key] = true;
      if (homes[video.key] && homes[video.key] !== id) fail(video.key + " is in two cabins");
      homes[video.key] = id;
      keys[video.key] = true;
      if (id.indexOf("sp-") === 0) {
        if (video.special !== true || !video.specialType) fail(video.key + " is not marked special");
      } else if (video.special) fail(video.key + " is special inside a muscle cabin");
    });
  });
  var n = Object.keys(seen).length;
  if (n !== want.videos || group.count !== want.videos) fail(id + " videos " + n);
});
if (byId.kegel && byId.kegel.count === 0 && byId.kegel.modules.every(function (mod) { return mod.count === 0; })) ok("empty Kegel stays visible at 0");
else fail("Kegel was hidden or counted");
if (Object.keys(keys).length === 368) ok("368 library videos");
else fail("library keys " + Object.keys(keys).length);

var removedFiles = {
  "Face/2. Under-Eye Knuckle Massage.mp4": true,
  "Jaw/25. V-Line Cheek and Jaw Sculpting Sequence.mp4": true,
  "Jaw/2. Jaw Rest Position Reset.mp4": true,
  "Neck/3. Neck Lacrosse Balls.mp4": true,
  "Upper_Arms/1. tricep stretch cooldown.mp4": true,
  "Abs_Pelvic/13. Prone Bed Hang.mp4": true,
  "Abs_Pelvic/1. Supine Knee to Chest Gentle Rock.mp4": true,
  "Abs_Pelvic/6. Wide Leg Wall Crunches Workout.mp4": true,
  "Resistance_Bands/1. Seated Yellow Mini-Band Around-the-World.mp4": true
};

var oldKeys = {};
(previous.groups || []).forEach(function (group) {
  (group.modules || []).forEach(function (mod) {
    (mod.videos || []).forEach(function (video) { oldKeys[video.key] = true; });
  });
});
var missing = Object.keys(oldKeys).filter(function (key) { return !keys[key] && !removedFiles[key]; });
var extra = Object.keys(keys).filter(function (key) { return !oldKeys[key]; });
if (!missing.length && !extra.length && Object.keys(oldKeys).length === 377) ok("library keeps every v63 key except deleted files");
else fail("key drift missing " + missing.join(",") + " extra " + extra.join(","));

var combos = JSON.parse(fs.readFileSync("tools/fixtures/combos_v63.json", "utf8")).combos || [];
var comboKeys = {};
combos.forEach(function (combo) {
  (combo.items || []).forEach(function (item) { comboKeys[item.r2Key] = true; });
});
var unresolved = Object.keys(comboKeys).filter(function (key) {
  return !keys[key] && key.indexOf("Custom/") !== 0 && !removedFiles[key];
});
if (Object.keys(comboKeys).length === 229 && !unresolved.length) ok("229 combo keys still resolve");
else fail("combo keys " + Object.keys(comboKeys).length + " unresolved " + unresolved.join(", "));

var shoulders = byId.shoulders;
var hasRaise = shoulders && shoulders.modules.some(function (mod) {
  return mod.videos.some(function (video) { return video.key === "Upper_Arms/3. lateral raises.mp4"; });
});
if (shoulders && shoulders.count >= 18 && hasRaise) ok("shoulders include lateral raises");
else fail("shoulders placement");
var feet = byId.feet;
var hasFoot = feet && feet.modules.some(function (mod) {
  return mod.videos.some(function (video) { return video.key === "Legs_Glutes/6. Foot Mobility Complex.mp4"; });
});
if (feet && feet.count >= 3 && hasFoot) ok("feet include the foot mobility complex");
else fail("feet placement");

if (html.indexOf('content="v70"') === -1) fail("relic-build is not v70");
if (html.indexOf("?v=v64") !== -1) fail("index.html still says v64");
else ok("cache stamp is v70");

["food.js", "data/nutrition"].forEach(function (file) {
  var diff = cp.spawnSync("git", ["diff", "--exit-code", "origin/master", "--", file], { encoding: "utf8" });
  if (diff.status !== 0) fail(file + " changed");
});
if (!failed) ok("food and nutrition files match master");

if (failed) {
  console.error(failed + " v64 check(s) failed");
  process.exit(1);
}
console.log("OK v64");
