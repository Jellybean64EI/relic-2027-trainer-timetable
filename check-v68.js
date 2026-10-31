/* Nexus v68: precise trim editor, and Back/Next/swipe stay inside the current cabin. */
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

var cards = fs.readFileSync("cards.js", "utf8");
var html = fs.readFileSync("index.html", "utf8");
var trim = fs.readFileSync("trim.js", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var css = fs.readFileSync("styles.css", "utf8");

if (cards.indexOf("quickList = cabinClips(") === -1) fail("the viewer still walks every cabin");
if (cards.indexOf("quickList = flatClips(") !== -1) fail("the viewer still assigns the full cabin-to-cabin list");
if (cards.indexOf("if (quickMove || !quickList.length) return") === -1) fail("Move does not block Back and Next");
if (cards.indexOf("back.disabled = !!quickMove") === -1) fail("Back stays tappable while Move is open");
if (cards.indexOf("rebindQuick(") === -1) fail("a move does not stay on the same video");
if (cards.indexOf("function wrapIndex") === -1) fail("Back and Next do not wrap inside the cabin");
if (cards.indexOf('id="vc-quick-progress"') === -1) fail("the viewer has no progress bar");
if (cards.indexOf("stepQuick(dx < 0 ? 1 : -1)") === -1) fail("swipe no longer steps");
if (cards.indexOf('class="vc-quick-head"') === -1 || cards.indexOf('class="vc-quick-meta"') === -1) fail("title row or Edit row is missing");
if (cards.indexOf("durationchange") === -1 || cards.indexOf("awaitMeta") === -1) fail("duration is still trusted before the current file is ready");
if (cards.indexOf("video.duration") === -1) fail("duration is never read from the current video");
if (cards.indexOf("fastSeek") !== -1) fail("edit seeks with fastSeek");
if (cards.indexOf("requestAnimationFrame") === -1 || cards.indexOf("currentTime") === -1) fail("edit does not seek to the exact frame");
if (cards.indexOf("var FRAME = 1 / 30") === -1) fail("frame nudge is not 1/30 second");
if (cards.indexOf('data-trim-delta="-1"') === -1 || cards.indexOf('data-trim-delta="-0.1"') === -1 || cards.indexOf('data-trim-delta="-frame"') === -1) {
  fail("nudge row is missing a step");
}
if (cards.indexOf('Save trim "') === -1 || cards.indexOf("Reset this trim and play the full video?") === -1) fail("Save or Reset has no confirm");
if (cards.indexOf("Abs_Pelvic/1. Dead Bug Progression.mp4") !== -1) fail("the saved Dead Bug trim was hardcoded");
if (trim.indexOf("if (!trim) return") === -1) fail("a player can cut a clip that has no saved trim");
if (trim.indexOf("fastSeek") !== -1) fail("shared helper seeks with fastSeek");
if (app.indexOf('build: "v68"') === -1 || html.indexOf('content="v68"') === -1 || html.indexOf("trim.js?v=v68") === -1 || html.indexOf("?v=v67") !== -1) {
  fail("cache stamp is not v68");
}
if (css.indexOf(".vc-quick-progress") === -1 || css.indexOf("height: 44px") === -1) fail("progress bar or trim track styling is missing");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v68") !== -1; })) {
  fail("a player-open rule was restamped");
}
else ok("viewer, editor, and stamp source checks");

var ctx = { window: {}, console: console };
ctx.window = ctx;
vm.createContext(ctx);
["tools/v64_placement.js", "data/videoCatalog.js", "cards.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
var api = ctx.window.NexusCards;
if (api.fmtTime(0) !== "0:00.000" || api.fmtTime(8.1) !== "0:08.100" || api.fmtTime(18.24) !== "0:18.240" || api.fmtTime(18.28) !== "0:18.280") {
  fail("clock is not m:ss.mmm (" + [api.fmtTime(0), api.fmtTime(8.1), api.fmtTime(18.24), api.fmtTime(18.28)].join(" ") + ")");
} else ok("clock is m:ss.mmm");

if (api.resolveTrimEnd(null, 8.1, false) !== null) fail("handles paint before duration is known");
if (api.resolveTrimEnd(null, 8.1, true) !== 8.1) fail("a known short duration is ignored");
if (api.resolveTrimEnd(null, 23.4, true) !== 23.4) fail("an unsaved trim stays locked to the early duration");
if (api.resolveTrimEnd(18.28, 23.4, true) !== 18.28) fail("a saved end is replaced by the full duration");
else ok("unsaved trims use the latest real duration and saved ends stay put");

var layout = ctx.window.NEXUS_VIDEO_CATALOG.layout;
var cabinIds = layout.cabins.concat(layout.specials.subCabins);
var crossed = false;
cabinIds.forEach(function (id) {
  var clips = api.cabinClips(id);
  if (!clips.length) return;
  var i;
  for (i = 0; i < clips.length; i++) {
    if (clips[i].cabinId !== id) crossed = true;
  }
  var next = clips[api.wrapIndex(clips.length - 1, clips.length, 1)];
  var prev = clips[api.wrapIndex(0, clips.length, -1)];
  if (!next || next.cabinId !== id || !prev || prev.cabinId !== id) crossed = true;
  if (api.quickLabel(clips[0]) !== clips[0].cabinName + " · " + clips[0].moduleName + " · 1 of " + clips[0].moduleCount) crossed = true;
});
if (crossed) fail("Back or Next can leave the current cabin");
else ok("Back and Next wrap inside the current cabin");

if (api.wrapIndex(0, 9, -1) !== 8 || api.wrapIndex(8, 9, 1) !== 0) fail("wrap math");
else ok("wrap math");

var abs = api.cabinClips("abs");
function titled(list, text) {
  return list.filter(function (clip) { return clip.title.indexOf(text) !== -1; });
}
var plank = titled(abs, "Plank And Mountain Climber");
var dead = titled(abs, "Dead Bug Progression");
if (plank.length !== 1 || dead.length !== 1) fail("Abs examples are missing from the Abs cabin");
else if (plank[0].moduleName !== "Main" || dead[0].moduleName !== "Main") fail("Abs examples are not in Main");
else ok("Abs Main examples stay in the Abs cabin");

var orderOk = true;
var seen = "";
abs.forEach(function (clip) {
  if (seen && clip.moduleId !== seen && "pre,exercise,post".indexOf(seen) > "pre,exercise,post".indexOf(clip.moduleId)) orderOk = false;
  seen = clip.moduleId;
});
if (!orderOk) fail("Abs modules are not Pre, Main, Post");
else ok("cabin sequence is Pre, then Main, then Post");

["food.js", "data/nutrition/shop.js", "data/nutrition/schedule.js"].forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  var expected = {
    "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
    "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
    "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
  }[file];
  if (digest !== expected) fail(file + " changed");
});
if (!failed) ok("food and smoothie files are unchanged");

if (failed) {
  console.error(failed + " v68 check(s) failed");
  process.exit(1);
}
console.log("OK v68");
