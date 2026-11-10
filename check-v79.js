/* Nexus v79: close, timer, and cue handle stay visible. Speed is one tap cycle. */
var fs = require("fs");
var vm = require("vm");
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
var chrome = fs.readFileSync("data/playerChrome.js", "utf8");

if (html.indexOf('content="v89"') === -1 || app.indexOf('build: "v89"') === -1) fail("cache stamp is not v79");
else ok("cache stamp is v79");
if (css.indexOf(".player-stage.is-hud-idle .player-hud") !== -1) fail("idle still fades the whole hud");
else ok("idle no longer fades the close button and timer");
if (css.indexOf(".player-stage.is-hud-idle:not(.is-forensic-open) .forensic-tab") !== -1) fail("idle still hides the cue handle");
else ok("the cue handle is not hidden when idle");
if (chrome.indexOf("px-sheet") !== -1) fail("the speed sheet is still built");
else ok("speed has no sheet");
if (app.indexOf('stage.appendChild(closeBtn)') === -1 || app.indexOf('stage.appendChild(timerDock)') === -1) {
  fail("close and timer stay inside the idle hud");
} else ok("close and timer are lifted out of the idle hud");

var memory = {};
var sandbox = {
  window: {},
  document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; }, addEventListener: function () {} },
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
    setItem: function (key, value) { memory[key] = String(value); }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(chrome, sandbox);
var play = sandbox.window.NexusPlay;
var tokens = play.tokensFor("https://pub.r2.dev/Back/a.mp4", "Back/a.mp4", 10001);
var steps = [];
var pref = play.read(tokens);
var i;
for (i = 0; i < 11; i++) {
  pref = { rate: play.nextRate(pref), cycled: true };
  steps.push(pref.rate);
  play.write(tokens, pref);
  pref = play.read(tokens);
}
var expect = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 0.5];
if (steps.join(",") !== expect.join(",")) fail("speed cycle is " + steps.join(","));
else ok("speed cycles through the ten steps and wraps");
if (play.read(tokens).cycled !== true || play.nextRate(play.read(tokens)) !== 0.6) fail("saved position did not resume");
else ok("reopen continues from the saved step");
play.write(tokens, { rate: 1, cycled: true });
if (play.nextRate(play.read(tokens)) !== 1.1) fail("Normal inside the cycle does not go to 1.1");
else ok("Normal inside the cycle goes to 1.1");
play.write(tokens, { rate: 2 });
if (play.read(tokens).rate !== 1 || play.read(tokens).cycled || play.nextRate(play.read(tokens)) !== 0.5) {
  fail("old 2x did not fall back to a fresh Normal");
} else ok("old 2x opens as a fresh Normal");

if (failed) {
  console.error(failed + " v79 check(s) failed");
  process.exit(1);
}
console.log("OK v79");
