/* Nexus v65: no Check me tray. Eight reviewed clips are baked into real cabins. */
var fs = require("fs");
var vm = require("vm");
var crypto = require("crypto");
var failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}

function ok(msg) {
  console.log("OK " + msg);
}

function load(file) {
  var ctx = { window: {}, console: console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return ctx;
}

var ALLOWED = ["face", "eyes", "tongue", "jaw", "neck", "shoulders", "upper-arms", "forearms", "chest", "upper-back", "lower-back", "abs", "obliques", "pelvic", "kegel", "hip-flexors", "glutes", "quads", "hamstrings", "calves", "feet", "sp-posture-mobility", "sp-calisthenics", "sp-resistance-bands", "sp-hanging", "sp-target-weights"];
var FINAL = [
  ["Legs_Glutes/1. Childs Pose.mp4", "lower-back", "post", "Childs Pose"],
  ["Neck/1. NEEDS_REVIEW_Unnamed_B.mp4", "neck", "exercise", "Suprahyoid Neck Curl Off Bench"],
  ["Neck/2. NEEDS_REVIEW_Unnamed_C.mp4", "neck", "exercise", "Wall and Floor Chin Tucks"],
  ["Neck/3. NEEDS_REVIEW_Neck And Facial Exercise.mp4", "jaw", "exercise", "Neck Tilt Jawline Exercise"],
  ["Neck/4. NEEDS_REVIEW_Neck And Jawline Exercises.mp4", "jaw", "exercise", "Neck and Jawline Tilts"],
  ["Upper_Arms/6. childs pose side veritable.mp4", "upper-back", "post", "Childs Pose Side Variation"],
  ["Upper_Arms/7. Thread the needle.mp4", "upper-back", "post", "Thread the Needle"],
  ["Hand_Wrist_Forearm/1. Wrist Mobility Warm Up.mp4", "forearms", "pre", "Wrist Mobility Warm Up"]
];
var FOOD = {
  "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
  "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
  "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
};

var catalog = load("data/videoCatalog.js").window.NEXUS_VIDEO_CATALOG;
var html = fs.readFileSync("index.html", "utf8");
var cards = fs.readFileSync("cards.js", "utf8");
var placement = fs.readFileSync("tools/v64_placement.js", "utf8");
var banned = /check-me|checkme|needs[_ ]review/i;

if (catalog.version !== "v65") fail("catalogue version " + catalog.version);
if (catalog.layout && catalog.layout.checkMe) fail("layout still lists a review tray");
if ((catalog.layout.cabins || []).length !== 21 || (catalog.layout.specials.subCabins || []).length !== 5) fail("layout cabin count");
else ok("layout is 21 cabins plus 5 specials");

var found = {};
(catalog.groups || []).forEach(function (group) {
  if (ALLOWED.indexOf(group.id) === -1) fail("group is not a real cabin " + group.id);
  if (banned.test(group.id) || banned.test(group.name || "")) fail("banned name " + group.id);
  (group.modules || []).forEach(function (mod) {
    (mod.videos || []).forEach(function (video) {
      if (banned.test(video.title || "") || banned.test(video.rule || "")) fail("banned text on " + video.key);
      if (!found[video.key]) found[video.key] = { cabin: group.id, modules: [], title: video.title };
      if (found[video.key].cabin !== group.id) fail(video.key + " is in two cabins");
      if (found[video.key].modules.indexOf(mod.id) === -1) found[video.key].modules.push(mod.id);
    });
  });
});

FINAL.forEach(function (row) {
  var got = found[row[0]];
  if (!got) {
    fail("missing " + row[0]);
    return;
  }
  if (got.cabin !== row[1] || got.title !== row[3] || got.modules.join(",") !== row[2]) {
    fail(row[0] + " -> " + got.cabin + " " + got.modules.join(",") + " " + got.title);
  }
});
var wrist = found["Hand_Wrist_Forearm/1. Wrist Mobility Warm Up.mp4"];
if (!wrist || wrist.modules.join(",") !== "pre") fail("wrist warm-up is not pre only");
else ok("eight reviewed clips are in their cabins");

var ctx = { window: {}, console: console };
ctx.window = ctx;
vm.createContext(ctx);
["tools/v64_placement.js", "data/videoCatalog.js", "cards.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
var api = ctx.window.NexusCards;
if (!api || api.moveButtonText("face", "post") !== "Move to Face · Post") fail("face move label");
else ok("Move to Face · Post");
if (!api || api.moveButtonText("lower-back", "post") !== "Move to Lower Back · Post") fail("lower back move label");
else ok("Move to Lower Back · Post");
["back", "equipment", "chest", "face", "", "zz"].forEach(function (area) {
  var decided = api.decideCustom({ area: area, title: "zzz", type: "exercise" });
  if (!decided || ALLOWED.indexOf(decided.cabin) === -1) fail("decideCustom " + area + " -> " + (decided && decided.cabin));
});
if (!failed) ok("decideCustom stays on a real cabin");

if (banned.test(cards) || banned.test(placement)) fail("tray wording is still in the card code");
else ok("card code has no review tray");
if (html.indexOf('content="v65"') === -1 || html.indexOf("?v=v64") !== -1) fail("cache stamp is not v65");
else ok("cache stamp is v65");

Object.keys(FOOD).forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (digest !== FOOD[file]) fail(file + " hash " + digest);
});
if (!failed) ok("food and smoothie files match master 568d228");

if (failed) {
  console.error(failed + " v65 check(s) failed");
  process.exit(1);
}
console.log("OK v65");
