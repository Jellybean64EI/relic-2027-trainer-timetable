/* Nexus v77: the hub header follows the open tab. Training Stats opens from the account menu. */
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

if (app.indexOf('build: "v99"') === -1 || html.indexOf('content="v99"') === -1 || html.indexOf("?v=v74") !== -1) {
  fail("cache stamp is not v77");
} else ok("cache stamp is v77");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v77") !== -1; })) {
  fail("a player-open rule was restamped");
}

if (html.indexOf("hub-stats-pill") !== -1) fail("stats pill is still in the header");
if (html.indexOf(">Training and Meal Schedules Hub<") === -1) fail("menu label for the hub is missing");
var account = html.slice(html.indexOf('id="account-root"'), html.indexOf('id="deck-root-food"'));
if (account.indexOf(">Training Stats<") === -1 || account.indexOf('id="hub-lock"') === -1) fail("Training Stats is not on the account page");
if (html.indexOf("coming soon") !== -1 || html.indexOf('id="account-banner"') !== -1) fail("the account banner is still in the page");
var sheet = html.slice(html.indexOf('id="hub-stats"'), html.indexOf('id="deck-root-food"'));
if (sheet.indexOf('id="hub-lock"') === -1 || sheet.indexOf(">Training Lock<") === -1) fail("Training Lock is not in the stats sheet");
if (html.indexOf('id="btn-future-lock"') === -1 || html.indexOf(">Training lock<") === -1) fail("header lock control was removed");
if (html.slice(html.indexOf('id="nav-drawer"')).indexOf("btn-future-lock") !== -1) fail("lock moved into the menu");
else ok("header, account menu, and stats lock");

if (app.indexOf("function hubHeading()") === -1 || app.indexOf('"Meal Schedules"') === -1 || app.indexOf('"Training Schedules"') === -1) {
  fail("hub heading does not follow the tab");
}
if (app.indexOf("setFutureLock(!state.futureLock)") === -1) fail("lock handler was removed");
if (app.indexOf("btn.hidden = true") === -1) fail("header lock is still shown");
if (css.indexOf(".hub-lock[aria-pressed=\"true\"]") === -1 || css.indexOf(".account-tile") === -1) fail("lock or account styles missing");
if (config.indexOf("videoEditor: false") === -1) fail("video editor flag is not off");
else ok("tab title, lock handler, and editor flag");

["food.js", "data/nutrition/shop.js", "data/nutrition/schedule.js"].forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  var expected = {
    "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
    "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
    "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
  }[file];
  if (digest !== expected) fail(file + " changed");
});
if (!failed) ok("food files are unchanged");

if (failed) {
  console.error(failed + " v77 check(s) failed");
  process.exit(1);
}
console.log("OK v77");
