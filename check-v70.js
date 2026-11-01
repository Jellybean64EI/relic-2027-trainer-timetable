/* Nexus v70: the editor and delete UI are off. Trim playback and deleted-file hiding stay. */
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
var config = fs.readFileSync("data/nexusConfig.js", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var catalog = fs.readFileSync("data/videoCatalog.js", "utf8");
var restore = fs.readFileSync("RESTORE.md", "utf8");

if (config.indexOf("videoEditor: false") === -1) fail("FEATURES.videoEditor is not false");
if (config.indexOf("videoEditor: true") !== -1) fail("the editor flag is left on");
if (cards.indexOf("function editorOn()") === -1 || cards.indexOf("window.FEATURES && window.FEATURES.videoEditor === true") === -1) {
  fail("the editor is not gated on FEATURES.videoEditor");
}
if (cards.indexOf("URLSearchParams") !== -1 || cards.indexOf("location.search") !== -1 || cards.indexOf("location.hash") !== -1) {
  fail("a URL can turn the editor on");
}
if (cards.indexOf('class="vc-quick-edit"') === -1 || cards.indexOf('class="vc-quick-bin"') === -1 || cards.indexOf("openTrim") === -1) {
  fail("editor code was deleted instead of gated");
}
if (cards.indexOf("editorOn() ?") === -1) fail("editor markup is not behind the flag");
if (cards.indexOf('"/video-sync-log"') === -1) fail("deleted files are not hidden from the sync log");
if (cards.indexOf("NexusTrim.watch") === -1 || cards.indexOf("playSrc(") === -1) fail("trim playback was removed");
if (app.indexOf('build: "v70"') === -1 || html.indexOf('content="v70"') === -1 || html.indexOf("?v=v69") !== -1) {
  fail("cache stamp is not v70");
}
[
  "Face/2. Under-Eye Knuckle Massage.mp4",
  "Jaw/25. V-Line Cheek and Jaw Sculpting Sequence.mp4",
  "Jaw/2. Jaw Rest Position Reset.mp4",
  "Neck/3. Neck Lacrosse Balls.mp4",
  "Upper_Arms/1. tricep stretch cooldown.mp4",
  "Abs_Pelvic/13. Prone Bed Hang.mp4",
  "Abs_Pelvic/1. Supine Knee to Chest Gentle Rock.mp4",
  "Abs_Pelvic/6. Wide Leg Wall Crunches Workout.mp4",
  "Resistance_Bands/1. Seated Yellow Mini-Band Around-the-World.mp4"
].forEach(function (key) {
  if (catalog.indexOf(key) !== -1) fail("deleted file still in the catalogue: " + key);
});
if (catalog.indexOf("Back/5. Seated Forward Fold.mp4") === -1) fail("Seated Forward Fold was removed");
if (catalog.indexOf('"version":"v65"') === -1) fail("catalogue version changed");
if (restore.indexOf("archive/v69-editor-delete") === -1 || restore.indexOf("videoEditor: true") === -1) {
  fail("RESTORE.md does not explain how to bring the editor back");
}
if (restore.indexOf("cut_trims.sh") === -1 || restore.indexOf("DELETE /videos") === -1) fail("RESTORE.md misses the worker or cutter");
else ok("flag, ghosts, restore note, and stamp");

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

var ctx = { console: console, FEATURES: { videoEditor: false } };
ctx.window = ctx;
vm.createContext(ctx);
["tools/v64_placement.js", "data/videoCatalog.js", "cards.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
var bands = ctx.window.NexusCards.cabinClips("sp-resistance-bands");
if (bands.some(function (clip) { return clip.title.indexOf("Around-the-World") !== -1; })) fail("Resistance Bands still lists the deleted mini-band");
else ok("Resistance Bands cabin has no Around-the-World card");
var fold = ctx.window.NexusCards.flatClips().filter(function (clip) { return clip.key === "Back/5. Seated Forward Fold.mp4"; });
if (fold.length !== 1) fail("Seated Forward Fold is missing from playback");
else ok("Seated Forward Fold stays in the catalogue");

if (failed) {
  console.error(failed + " v70 check(s) failed");
  process.exit(1);
}
console.log("OK v70");
