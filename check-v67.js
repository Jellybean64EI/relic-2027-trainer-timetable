/* Nexus v70: trim TikTok outros, and a slimmer viewer bar. */
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

["vc-quick-edit", "vc-trim-handle", "vc-trim-save", "vc-trim-reset", "vc-trim-cancel", "vc-trim-preview", "data-trim-nudge", "-0.1", "+0.1"].forEach(function (token) {
  if (cards.indexOf(token) === -1) fail("trimmer missing " + token);
});
if (cards.indexOf('class="vc-quick-back"') === -1 || cards.indexOf('class="vc-quick-next"') === -1 || cards.indexOf('class="vc-quick-move"') === -1) {
  fail("slim bar lost Back, Next, or Move");
}
if (cards.indexOf("NexusTrim.watch") === -1 || cards.indexOf("NexusTrim.load") === -1 || cards.indexOf("NexusTrim.save") === -1) {
  fail("the viewer does not use the shared trim helper");
}
if (trim.indexOf("loadedmetadata") === -1 || trim.indexOf("timeupdate") === -1 || trim.indexOf('"/video-trims"') === -1) {
  fail("shared helper does not apply trims or talk to the worker");
}
if (trim.indexOf("video.loop") === -1) fail("looping players do not restart at the trim");
if (html.indexOf("trim.js?v=v70") === -1) fail("trim.js is not loaded");
if (app.indexOf('build: "v70"') === -1 || html.indexOf('content="v70"') === -1 || html.indexOf("?v=v66") !== -1) {
  fail("cache stamp is not v70");
}
if (cards.indexOf("if (!building() && !forceEye) return button") === -1 || cards.indexOf("NexusBuilder.takeCard") === -1) {
  fail("builder eye or tap-to-add changed");
}
else ok("trimmer, shared helper, slim bar, and builder path are present");

var ctx = { window: {}, console: console, location: { href: "https://local/" } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("trim.js", "utf8"), ctx, { filename: "trim.js" });
var api = ctx.window.NexusTrim;
if (api.keyFromSrc("https://pub.example/Back/1.%20Spine%20Circles.mp4") !== "Back/1. Spine Circles.mp4") fail("src does not map back to the r2 key");
else ok("playback can find a trim from the video address");

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
  console.error(failed + " v70 check(s) failed");
  process.exit(1);
}
console.log("OK v70");
