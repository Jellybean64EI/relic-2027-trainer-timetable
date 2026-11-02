/* Nexus v71: the quick viewer header clears the menu, and editor chrome stays gated. */
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

var cards = fs.readFileSync("cards.js", "utf8");
var html = fs.readFileSync("index.html", "utf8");
var css = fs.readFileSync("styles.css", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var config = fs.readFileSync("data/nexusConfig.js", "utf8");

if (config.indexOf("videoEditor: false") === -1 || config.indexOf("videoEditor: true") !== -1) fail("editor flag is not off");
if (cards.indexOf('class="vc-quick-bar vc-quick-head"') === -1) fail("viewer header bar is missing");
if (cards.indexOf("syncEditorClass") === -1 || cards.indexOf('classList.toggle("vc-editor-on"') === -1) fail("editor class is not tied to the flag");
if (cards.indexOf("vc-preview-open") === -1 || cards.indexOf('class="vc-preview-bar"') === -1) fail("eye preview header was not updated");
if (css.indexOf("body.vc-quick-open .nav-toggle") === -1 || css.indexOf("overflow-wrap: anywhere") === -1) fail("menu and title layout is missing");
if (css.indexOf("body:not(.vc-editor-on) .vc-quick-edit") === -1 || css.indexOf("body:not(.vc-editor-on) .vc-bin") === -1) {
  fail("editor remnants are not hidden when the flag is off");
}
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v71") !== -1; })) {
  fail("a player-open rule was restamped");
}
if (app.indexOf('build: "v71"') === -1 || html.indexOf('content="v71"') === -1 || html.indexOf("?v=v70") !== -1) {
  fail("cache stamp is not v71");
}
if (cards.indexOf("openTrim") === -1 || cards.indexOf('class="vc-quick-bin"') === -1) fail("editor code was deleted");
else ok("header, flag gate, and stamp");

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
