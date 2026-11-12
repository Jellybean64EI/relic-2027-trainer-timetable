/* Nexus v77: every video has a persistent numeric id, shown only in the cabin player. */
var fs = require("fs");
var crypto = require("crypto");
var failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}

function ok(msg) {
  console.log("OK " + msg);
}

var html = fs.readFileSync("index.html", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var css = fs.readFileSync("styles.css", "utf8");
var cards = fs.readFileSync("cards.js", "utf8");
var config = fs.readFileSync("data/nexusConfig.js", "utf8");
var seed = JSON.parse(fs.readFileSync("data/videoIdentity.json", "utf8"));
var rows = seed.identities || [];

if (app.indexOf('build: "v91"') === -1 || html.indexOf('content="v91"') === -1 || html.indexOf("cards.js?v=v91") === -1 || html.indexOf("?v=v75") !== -1) {
  fail("cache stamp is not v77");
} else ok("cache stamp is v77");

if (cards.indexOf("vc-quick-id") === -1 || cards.indexOf("function identityId") === -1) fail("cabin player id is missing");
if (cards.indexOf('return item.cabinName + " · " + item.moduleName') === -1) fail("quick label no longer is the module line");
if (html.indexOf("vc-quick-id") !== -1) fail("the id markup leaked into the schedule page");
if (app.indexOf("vc-quick-id") !== -1 || app.indexOf("video-ids") !== -1) fail("schedule app gained video ids");
if (css.indexOf(".vc-quick-idline") === -1) fail("id line layout is missing");
else ok("id is only on the cabin player line");

var ids = {};
var keys = {};
rows.forEach(function (row) {
  if (ids[row.videoId]) fail("duplicate id " + row.videoId);
  ids[row.videoId] = true;
  if (row.r2Key) {
    if (keys[row.r2Key]) fail("duplicate key " + row.r2Key);
    keys[row.r2Key] = row.videoId;
  }
});
if (rows.length !== 497) fail("seed count " + rows.length);
var reserved = rows.filter(function (row) { return row.videoId === 10420; })[0];
if (!reserved || reserved.status !== "reserved" || !reserved.r2Key) fail("10420 is not reserved");
var first = rows.filter(function (row) { return row.videoId === 10001; })[0];
if (!first || first.r2Key.indexOf("Temporal Fascial Twist") === -1) fail("10001 was renumbered");
var uploaded = rows.filter(function (row) { return row.videoId === 10438; })[0];
if (!uploaded || uploaded.r2Key.indexOf("Custom/face/pre/") !== 0) fail("10438 is not bound to the live upload");
if (JSON.stringify(seed).indexOf("autoScheduleEligible") !== -1) fail("seed includes schedule gates");
if (config.indexOf("videoEditor: false") === -1) fail("video editor flag is not off");
else ok("seed preserves 10001, 10420 and 10438");

["food.js", "data/nutrition/shop.js", "data/nutrition/schedule.js", "data/videoCatalog.js", "builder.js"].forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  var expected = {
    "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
    "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
    "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
  }[file];
  if (expected && digest !== expected) fail(file + " changed");
});
if (!failed) ok("food files are unchanged");

if (failed) {
  console.error(failed + " v77 check(s) failed");
  process.exit(1);
}
console.log("OK v77");
