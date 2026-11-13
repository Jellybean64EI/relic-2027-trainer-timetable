/* Nexus v78: per-video mute and speed, and schedule tap or swipe. */
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
var cards = fs.readFileSync("cards.js", "utf8");

if (html.indexOf('content="v94"') === -1 || app.indexOf('build: "v94"') === -1 || html.indexOf("playerChrome.js?v=v94") === -1) {
  fail("cache stamp is not v78");
} else ok("cache stamp is v78");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v78") !== -1; })) {
  fail("new css starts with body.player-open");
} else ok("player chrome css stays off the guard prefix");
if (app.indexOf("noteSetComplete()") !== -1 && app.indexOf("closePlayer();\n      return false;") === -1) {
  fail("last clip does not close without an auto tick");
} else ok("last manual clip closes the player");
var advanceAt = app.indexOf("function advance(");
var advanceBody = app.slice(advanceAt, app.indexOf("function reconcileVisibility("));
if (advanceBody.indexOf("noteSetComplete") !== -1) fail("manual advance ticks the schedule");
else ok("manual advance does not tick the schedule");
if (advanceBody.indexOf("player.index <= 0") === -1) fail("first clip can still wrap backward");
else ok("first clip does not wrap backward");
var playAt = app.indexOf("function playFront(");
var playBody = app.slice(playAt, app.indexOf("\n  function promote("));
if (playBody.indexOf("applyFrontPrefs") === -1 || playBody.indexOf("video.play") === -1 || playBody.indexOf("applyFrontPrefs") > playBody.indexOf("video.play")) fail("sound is applied after play");
else ok("mute and speed are applied before play");
if (app.indexOf("onClockTick") !== -1 && app.slice(app.indexOf("function onClockTick"), app.indexOf("function armClock")).indexOf("playbackRate") !== -1) {
  fail("the set timer follows playback speed");
} else ok("the set timer does not follow playback speed");
if (cards.indexOf("vc-quick-back") === -1 || cards.indexOf("vc-quick-next") === -1) fail("cabin next and back were removed");
else ok("cabin next and back stay");
if (html.indexOf('class="vc-quick-id"') !== -1 && app.indexOf("The schedule sheet never prints the numeric id.") === -1) {
  fail("schedule player gained a numeric id");
} else ok("schedule player still has no numeric id");

var memory = {};
var sandbox = {
  window: {},
  document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; }, addEventListener: function () {} },
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
    setItem: function (key, value) { memory[key] = String(value); }
  },
  console: console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("data/playerChrome.js", "utf8"), sandbox);
var play = sandbox.window.NexusPlay;
var idTokens = play.tokensFor("https://pub.r2.dev/Face/a.mp4", "Face/a.mp4", 10001);
var other = play.tokensFor("https://pub.r2.dev/Face/b.mp4", "Face/b.mp4", 10002);
if (idTokens[0] !== "id:10001" || idTokens.join("|").indexOf("Temporal") !== -1) fail("prefs followed a title");
else ok("prefs use the permanent id and media key");
play.write(idTokens, { muted: true, rate: 0.7 });
if (!play.read(idTokens).muted || play.read(idTokens).rate !== 0.7) fail("prefs did not save");
else ok("mute and speed save per video");
play.write(idTokens, { rate: 1.5 });
if (play.read(idTokens).rate !== 1 || play.read(idTokens).cycled) fail("old 1.5 stayed a speed");
else ok("old 1.5 and 2 become Normal");
if (play.read(other).muted || play.read(other).rate !== 1) fail("another video inherited the setting");
else ok("another video keeps the defaults");
play.write(idTokens, { rate: 9 });
if (play.read(idTokens).rate !== 1) fail("an unknown speed was stored");
else ok("unsupported speed becomes Normal");
sandbox.localStorage.setItem = function () { throw new Error("full"); };
if (play.write(idTokens, { muted: false }) !== false || play.read(other).rate !== 1) fail("storage failure did not fall back");
else ok("storage failure keeps the defaults");

if (failed) {
  console.error(failed + " v78 check(s) failed");
  process.exit(1);
}
console.log("OK v78");
