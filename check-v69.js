/* Nexus v71: delete a video from the viewer, and show trim sync status. */
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
var builder = fs.readFileSync("builder.js", "utf8");

["vc-quick-bin", "vc-bin", "vc-delete-yes", "vc-delete-cancel", "Are you sure you want to delete this video?", "This permanently deletes it from Nexus and Cloudflare storage.", "Deleting…", "Deleted · freed ", "/videos?r2Key=", "Shrinking tonight", "Synced ✓", "quickDelete"].forEach(function (token) {
  if (cards.indexOf(token) === -1) fail("missing " + token);
});
if (cards.indexOf("if (quickDelete) return") === -1 || cards.indexOf("if (quickMove || !quickList.length) return") === -1) {
  fail("delete does not block Back and Next the way Move does");
}
if (cards.indexOf("err.status === 404") === -1) fail("a missing object is not treated as deleted");
if (trim.indexOf("function bust") === -1 || trim.indexOf('"?v="') === -1 && trim.indexOf('"v="') === -1) fail("cut files are not cache-busted");
if (trim.indexOf("stampArchive") === -1) fail("the schedule player is not cache-busted");
if (builder.indexOf("NexusTrim.bust") === -1) fail("schedule playback does not cache-bust");
if (cards.indexOf("playSrc(") === -1) fail("the viewer and eye preview do not cache-bust");
if (app.indexOf('build: "v71"') === -1 || html.indexOf('content="v71"') === -1 || html.indexOf("?v=v68") !== -1) {
  fail("cache stamp is not v71");
}
if (cards.indexOf("if (!building() && !forceEye) return button") === -1 || cards.indexOf("NexusBuilder.takeCard") === -1) {
  fail("builder eye or tap-to-add changed");
}
else ok("delete, tags, cache-bust, and stamp source checks");

var ctx = { window: {}, console: console, Promise: Promise };
ctx.window = ctx;
ctx.nexusFetch = function (path) {
  if (path === "/video-trims") {
    return Promise.resolve({
      ok: true,
      trims: [{ r2Key: "Abs_Pelvic/1. Dead Bug Progression.mp4", start: 0, end: 18.28, status: "pending" }],
      synced: ["Face/4. Eyebrow Raise Control Drill.mp4"],
      cuts: { "Face/4. Eyebrow Raise Control Drill.mp4": "2026-11-01T02:00:12.000Z" }
    });
  }
  return Promise.reject(new Error("unexpected " + path));
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("trim.js", "utf8"), ctx, { filename: "trim.js" });
var api = ctx.window.NexusTrim;
api.load().then(function () {
  if (api.status("Abs_Pelvic/1. Dead Bug Progression.mp4") !== "pending") fail("pending trim has no status");
  if (api.status("Face/4. Eyebrow Raise Control Drill.mp4") !== "synced") fail("synced key has no status");
  if (api.status("Back/1. Spine Circles.mp4") !== "") fail("an untouched video has a tag");
  var plain = "https://pub.example/Face/4.%20Eyebrow%20Raise%20Control%20Drill.mp4";
  var busted = api.bust(plain);
  var stamp = encodeURIComponent("2026-11-01T02:00:12.000Z");
  if (busted.indexOf("?v=" + stamp) === -1) fail("bust url " + busted);
  if (api.bust(busted) !== busted) fail("bust is not stable");
  if (api.bust("https://pub.example/Back/1.mp4") !== "https://pub.example/Back/1.mp4") fail("uncut url changed");
  api.save("Face/4. Eyebrow Raise Control Drill.mp4", 0, 4).catch(function () {});
  if (api.status("Face/4. Eyebrow Raise Control Drill.mp4") !== "pending") fail("a new save does not shrink tonight");
  if (!failed) ok("status tags and cache-bust urls");

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
    console.error(failed + " v71 check(s) failed");
    process.exit(1);
  }
  console.log("OK v71");
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
