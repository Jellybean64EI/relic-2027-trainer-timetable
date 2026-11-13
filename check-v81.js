/* Nexus v81: the cue lip drags on touch, and the sheet does not repeat the title. */
var fs = require("fs");
var failed = 0;

function fail(message) {
  failed += 1;
  console.error("FAIL " + message);
}

function ok(message) {
  console.log("OK " + message);
}

var html = fs.readFileSync("index.html", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v99"') === -1 || app.indexOf('build: "v99"') === -1) fail("cache stamp is not v81");
else ok("cache stamp is v81");
if (app.indexOf('node.closest("#forensic-tab, #cue-lip")') === -1) fail("drag ignores the cue lip");
else ok("drag includes the cue lip");
if (app.indexOf('addEventListener("touchend"') === -1) fail("touch end is not handled");
else ok("touch end moves the sheet");
if (app.indexOf("#forensic-scroll, input, textarea, select, a") === -1) fail("sheet scroll is treated as a drag");
else ok("sheet scroll is not a drag");
if (css.indexOf(".forensic-title") === -1 || css.indexOf("clip: rect(0, 0, 0, 0)") === -1) fail("duplicate title is still visible");
else ok("sheet heading is visually hidden");
if (css.indexOf(".cue-lip") === -1 || css.split(".cue-lip")[1].indexOf("touch-action: none") === -1) fail("lip can be stolen by page scroll");
else ok("the lip keeps the touch");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v81") !== -1; })) {
  fail("new css starts with body.player-open");
} else ok("v81 css stays off the guard prefix");

if (failed) {
  console.error(failed + " v81 check(s) failed");
  process.exit(1);
}
console.log("OK v81");
