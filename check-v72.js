/* Nexus v77: no blue tap flash on the menu, and a short orange press. */
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

var css = fs.readFileSync("styles.css", "utf8");
var html = fs.readFileSync("index.html", "utf8");
var app = fs.readFileSync("app.js", "utf8");

if (css.indexOf("-webkit-tap-highlight-color: transparent") === -1) fail("tap highlight is not cleared");
["a,", "button,", "label,", "input,", "summary,", '[role="button"]'].forEach(function (token) {
  if (css.indexOf(token) === -1) fail("interactive tap rule missing " + token);
});
if (css.indexOf(".nav-toggle:focus {") === -1 || css.indexOf("outline: none") === -1) fail("menu keeps the default focus outline");
if (css.indexOf(".nav-toggle:focus-visible") === -1 || css.indexOf("outline: 2px solid var(--gold)") === -1) {
  fail("keyboard focus ring is missing");
}
if (css.indexOf(".nav-toggle:active") === -1 || css.indexOf("scale(0.94)") === -1 || css.indexOf("120ms") === -1) {
  fail("menu press is missing");
}
if (css.indexOf("-webkit-touch-callout: none") === -1 || css.indexOf("user-select: none") === -1) {
  fail("long-press highlight is not suppressed");
}
if (css.indexOf("body.vc-quick-open .nav-toggle") === -1) fail("v71 menu slot was removed");
if (app.indexOf('build: "v95"') === -1 || html.indexOf('content="v95"') === -1 || html.indexOf("?v=v71") !== -1) {
  fail("cache stamp is not v77");
}
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v77") !== -1; })) {
  fail("a player-open rule was restamped");
}
else ok("tap highlight, focus ring, and stamp");

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
  console.error(failed + " v77 check(s) failed");
  process.exit(1);
}
console.log("OK v77");
