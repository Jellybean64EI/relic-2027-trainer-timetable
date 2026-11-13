/* Nexus v77: hub tabs are Training Schedules and Food Schedules. Stats sit in the header. */
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
var config = fs.readFileSync("data/nexusConfig.js", "utf8");

if (app.indexOf('build: "v101"') === -1 || html.indexOf('content="v101"') === -1 || html.indexOf("?v=v72") !== -1) {
  fail("cache stamp is not v77");
}
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v77") !== -1; })) {
  fail("a player-open rule was restamped");
}
else ok("cache stamp is v77");

var schedulesAt = html.indexOf('data-hub-tab="schedules"');
var foodAt = html.indexOf('data-hub-tab="food"');
if (schedulesAt < 0 || foodAt < schedulesAt) fail("Training Schedules is not the first hub tab");
if (html.indexOf(">Training Schedules<") === -1 || html.indexOf(">Meal Schedules<") === -1) fail("hub tab labels are missing");
if (html.indexOf('id="hub-panel-food"') === -1) fail("food schedules panel is missing");
if (html.indexOf("hub-panel-training") !== -1) fail("stats tab panel is still in the hub");
if (html.indexOf('data-os-panel="account"') === -1 || html.indexOf('id="hub-stats"') === -1 || html.indexOf(">Training Stats<") === -1) {
  fail("training stats is not on the account page");
}
if (html.indexOf('id="train-lock-slot"') === -1) fail("training lock slot is missing");
if (html.indexOf('id="hub-stats-x"') !== -1 || html.indexOf('id="hub-stats-open"') !== -1) fail("stats modal is still in the page");
if (html.indexOf("hub-stats-pill") !== -1) fail("stats pill is still in the header");
else ok("hub tabs and stats sheet");

if (app.indexOf("function schedulesOnHub") === -1 || app.indexOf("relic_hub_tab") === -1) fail("hub tab memory is missing");
if (app.indexOf('state.hubTab = "schedules"') === -1) fail("default hub tab is not schedules");
if (css.indexOf("body.is-hub:not(.hub-schedules)") === -1 || css.indexOf("body.hub-schedules") === -1) {
  fail("schedules tab does not reveal the training page");
}
if (html.indexOf('id="hub-lock"') === -1) fail("stats lock row is missing");
if (html.indexOf('data-os-door="hub"') === -1) fail("menu doors are missing");
else ok("schedules mount and menu doors");

if (config.indexOf("videoEditor: false") === -1) fail("video editor flag is not off");
if (css.indexOf("-webkit-tap-highlight-color: transparent") === -1) fail("tap highlight fix is missing");
if (css.indexOf("body.vc-quick-open .nav-toggle") === -1) fail("quick viewer menu slot is missing");
else ok("v71 and v72 behaviour stays");

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
