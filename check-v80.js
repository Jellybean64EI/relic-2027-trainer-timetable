/* Nexus v80: schedule cue lip, no leftover transport, cabin editor layout. */
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
var editor = fs.readFileSync("data/cueEditor.js", "utf8");

if (html.indexOf('content="v89"') === -1 || app.indexOf('build: "v89"') === -1) fail("cache stamp is not v80");
else ok("cache stamp is v80");
if (app.indexOf("function paintCueLip") === -1 || app.indexOf('id = "cue-lip"') === -1 && app.indexOf('lip.id = "cue-lip"') === -1) {
  fail("cue lip is missing");
} else ok("cue lip is painted from the current clip");
if (app.indexOf("removeChild(transport)") === -1) fail("schedule transport is still wired");
else ok("schedule transport buttons are removed at boot");
if (css.indexOf(".clip-label { display: none;") === -1 || css.indexOf(".player-controls {\n  display: none;") === -1) {
  fail("legacy banner or transport can still show");
} else ok("legacy banner and transport stay hidden");
if (editor.indexOf("Saving does not clear this clip") !== -1) fail("cabin editor still shows the disclaimer");
else ok("cabin editor disclaimer is gone");
if (editor.indexOf("vc-cue-id") === -1 || editor.indexOf("vc-cue-key") === -1) fail("identity lines were removed");
else ok("identity id and media key stay on the editor");
if (editor.indexOf("lead1") === -1 || editor.indexOf("sets") === -1) fail("editor fields were removed");
else ok("editor fields stay");
if (app.indexOf('stage.appendChild(closeBtn)') === -1) fail("close button mount was lost");
else ok("close button still leaves the idle hud");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v80") !== -1; })) {
  fail("new css starts with body.player-open");
} else ok("v80 css stays off the guard prefix");

if (failed) {
  console.error(failed + " v80 check(s) failed");
  process.exit(1);
}
console.log("OK v80");
