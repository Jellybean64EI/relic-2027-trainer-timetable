/* Nexus v68: cabin rows open a full-screen quick viewer. The schedule builder keeps its eye. */
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
var css = fs.readFileSync("styles.css", "utf8");
var builder = fs.readFileSync("builder.js", "utf8");

if (cards.indexOf("function openQuick") === -1 || cards.indexOf('quick.id = "vc-quick"') === -1) fail("quick viewer is missing");
else ok("quick viewer exists");
if (cards.indexOf("if (!building()) openQuick(") === -1) fail("a cabin row does not open the viewer");
else ok("cabin rows open the viewer");
if (cards.indexOf("if (!building() && !forceEye) return button") === -1 || cards.indexOf('class="vc-eye"') === -1) {
  fail("browse rows and the builder eye are not split");
} else ok("browse rows have no eye and the builder eye remains");
if (cards.indexOf("NexusBuilder.takeCard") === -1) fail("adding a card to a schedule was removed");
else ok("schedule add stays on the builder path");
if (cards.indexOf("openCatalogClip") !== -1 || cards.indexOf("openCatalogPlaylist") !== -1) fail("the cabin row opens the workout player");
else ok("the quick viewer is not the workout player");
if (cards.indexOf('class="vc-quick-next"') === -1 || cards.indexOf('class="vc-quick-back"') === -1) fail("Next and Back are missing");
if (cards.indexOf("stepQuick(dx < 0 ? 1 : -1)") === -1) fail("swipe does not step");
if (cards.indexOf("quickScroll") === -1 || cards.indexOf("window.scrollTo(0, quickScroll)") === -1) fail("close does not return to the same scroll spot");
if (cards.indexOf('class="vc-quick-move"') === -1 || cards.indexOf("moveFields(") === -1) fail("Move is not inside the viewer");
if (cards.indexOf('id="vc-quick-next"') === -1 || cards.indexOf('preload="metadata"') === -1) fail("the next clip is not metadata-only");
if (cards.indexOf('id="vc-quick-next" class="vc-quick-preload" preload="auto"') !== -1) fail("the next clip is fully prefetched");
else ok("Next, Back, swipe, close, Move, and metadata preload are wired");
if (builder.indexOf('id="sched-build"') === -1 && cards.indexOf("Save video to ") === -1) fail("upload save label changed");
if (cards.indexOf("Save video to ") === -1) fail("upload save label changed");
else ok("upload save label is unchanged");

var ctx = { window: {}, console: console };
ctx.window = ctx;
vm.createContext(ctx);
["tools/v64_placement.js", "data/videoCatalog.js", "cards.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
var api = ctx.window.NexusCards;
var clips = api.flatClips();
var first = clips[0];
if (!first || api.quickLabel(first) !== first.cabinName + " · " + first.moduleName + " · 1 of " + first.moduleCount) fail("label shape");
else ok("label is Cabin · Module · n of N");
var obliques = clips.filter(function (clip) { return clip.cabinId === "obliques" && clip.moduleId === "pre"; });
if (!obliques.length || obliques[0].title.indexOf("Side Bow") === -1) fail("Obliques Pre does not start with Side Bow Stretch");
else ok("Obliques Pre starts with Side Bow Stretch");
var boundary = false;
var i;
for (i = 1; i < clips.length; i++) {
  if (clips[i - 1].moduleId !== clips[i].moduleId || clips[i - 1].cabinId !== clips[i].cabinId) {
    if (clips[i - 1].indexInModule !== clips[i - 1].moduleCount - 1) fail("a module does not finish before the next one");
    if (clips[i].indexInModule !== 0) fail("the next module does not start at 1");
    boundary = true;
    break;
  }
}
if (!boundary) fail("Next cannot cross a module");
else ok("Next continues into the next module");
var ids = [];
clips.forEach(function (clip) { if (ids[ids.length - 1] !== clip.cabinId) ids.push(clip.cabinId); });
var layout = ctx.window.NEXUS_VIDEO_CATALOG.layout;
var want = layout.cabins.concat(layout.specials.subCabins);
var cursor = 0;
want.forEach(function (id) { if (ids[cursor] === id) cursor += 1; });
if (cursor !== ids.length || ids[0] !== "face" || ids[ids.length - 1].indexOf("sp-") !== 0) fail("cabin order " + ids.join(","));
else ok("order is Face through Feet, then Specials");

if (html.indexOf('content="v68"') === -1 || html.indexOf("?v=v66") !== -1) fail("cache stamp is not v68");
else ok("cache stamp is v68");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0; }) === false) {
  fail("player-open rules disappeared");
}
["food.js", "data/nutrition/shop.js", "data/nutrition/schedule.js"].forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  var expected = {
    "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
    "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
    "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
  }[file];
  if (digest !== expected) fail(file + " changed");
});
if (!failed) ok("food and smoothie files match v65");

if (failed) {
  console.error(failed + " v68 check(s) failed");
  process.exit(1);
}
console.log("OK v68");
