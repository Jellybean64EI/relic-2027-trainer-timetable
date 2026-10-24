/* Nexus v62: accordion, named uploads, preview, and an untouched training lock. */
var fs = require("fs");
var cp = require("child_process");
var failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}

function ok(msg) {
  console.log("OK " + msg);
}

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function sliceFn(source, name, next) {
  var start = source.indexOf("function " + name);
  var end = source.indexOf("function " + next);
  if (start === -1 || end === -1 || end <= start) return "";
  return source.slice(start, end);
}

var cards = read("cards.js");
var builder = read("builder.js");
var css = read("styles.css");
var app = read("app.js");
var html = read("index.html");

if (css.indexOf(".sched-sec:not(.is-on) .sched-items { display: none; }") === -1) fail("inactive schedule sections stay open");
else ok("accordion hides inactive items");

if (builder.indexOf('active = "pre"') === -1) fail("a new draft does not open Pre-stretches");
else ok("new draft opens pre");

if (builder.indexOf('active = active === next ? "" : next') === -1) fail("the active section header does not toggle closed");
else ok("active section toggles closed");

var take = sliceFn(builder, "takeCard", "moveItem");
var hold = sliceFn(builder, "holdList", "takeCard");
if (take.indexOf("holdList(") === -1 || hold.indexOf('document.getElementById("vc-list")') === -1 || hold.indexOf("getBoundingClientRect") === -1 || hold.indexOf("window.scrollBy") === -1) {
  fail("takeCard does not hold #vc-list");
} else ok("takeCard holds the video list");

if (cards.indexOf("function syncPicked") === -1 || cards.indexOf("syncPicked: syncPicked") === -1) fail("syncPicked is not exposed");
else ok("syncPicked is exposed");

if (builder.indexOf("NexusCards.syncPicked") === -1) fail("refreshCards does not update picked badges in place");
else ok("refreshCards prefers syncPicked");

var sync = sliceFn(cards, "syncPicked", "anchorHeader");
if (!sync || /innerHTML\s*=/.test(sync)) fail("syncPicked replaces the card list");
else ok("syncPicked leaves the card list mounted");

if (cards.indexOf("chips(") !== -1) fail("phase chips are still rendered");
else ok("video cards have no phase chips");

if (builder.indexOf("Till Failure is in this day") !== -1 || builder.indexOf("function isTillFailure") !== -1) fail("Till Failure note is still in the builder");
else ok("builder has no Till Failure note");

["PENCIL", "TICK", "vc-pencil", "vc-tick", "vc-name-input", "startRename", "saveRename", "cancelRename", "has-mine", "vc-rename"].forEach(function (token) {
  if (cards.indexOf(token) !== -1) fail("cards.js still contains " + token);
});
[".vc-pencil", ".vc-tick", ".vc-name-input", ".vc-rename", ".has-mine"].forEach(function (token) {
  if (css.indexOf(token) !== -1) fail("styles.css still contains " + token);
});
if (failed) {
  /* rename tokens already reported */
} else ok("pencil and tick rename UI is gone");

if (cards.indexOf("function cardsHtml") === -1 || cards.indexOf("base.length + index + 1") === -1) fail("custom cards are not numbered after the catalogue");
else ok("custom cards continue the catalogue numbers");

if (cards.indexOf('data-vc-title="' + "' + esc(video.title)") === -1 && cards.indexOf("esc(video.title)") === -1) fail("data-vc-title is not the clean title");
else ok("data-vc-title stays the clean title");

["vc-upload-box", "vc-upload-title", "Video card name (e.g. Anterior pelvic tilts)", "Save video card", "Type a video card name first.", "Step 2: Open a muscle cabin below and tap Pre-stretches, Exercises, or Post-stretches (it glows orange).", "Destination: "].forEach(function (token) {
  if (cards.indexOf(token) === -1) fail("upload box missing " + token);
});
if (cards.indexOf('id="vc-status"') === -1 && cards.indexOf('getElementById("vc-status")') === -1) fail("status line is not #vc-status");
if (cards.indexOf("IMG_|VID_|MOV_|PXL_|trim\\.") === -1) fail("camera filenames are not left blank");
if (cards.indexOf("&title=") === -1) fail("upload does not send the typed title");
else ok("upload box names the card before saving");

if (cards.indexOf("openCatalogClip") !== -1) fail("browsing a card still opens the full player");
else ok("browse mode does not open the player");

if (cards.indexOf("scrollIntoView") === -1) fail("collapsing a cabin does not keep its header in view");
else ok("cabin and module headers stay in view");

if (css.indexOf("top: 50%") === -1 || css.indexOf("translateY(-50%)") === -1 || css.indexOf("width: 38px") === -1 || css.indexOf("height: 38px") === -1) {
  fail("the preview eye is not centred");
} else ok("preview eye is centred");

if (css.indexOf("padding-right: 52px") === -1 || css.indexOf("min-height: 48px") === -1) fail("eyed cards are missing the tap padding");
else ok("eyed cards keep room for the eye");

if (cards.indexOf('preload="auto"') === -1 || cards.indexOf("video.autoplay = true") === -1 || cards.indexOf("video.muted = true") === -1 || cards.indexOf("video.play()") === -1) {
  fail("preview does not autoplay");
} else ok("preview autoplays muted");

var promote = sliceFn(app, "promote", "assignVideoSrc");
if (promote.indexOf("wasWaiting") === -1 || promote.indexOf("showPlayerHud()") === -1) fail("the workout HUD never schedules its hide");
else ok("first frame shows the HUD so it can fade");

var advance = sliceFn(app, "advance", "reconcileVisibility");
if (!/if\s*\(\s*!manual\s*\)/.test(advance) || advance.indexOf("armClock(nextMs)") === -1) fail("skip still resets the 20:00 countdown");
else ok("manual skip keeps the countdown");

if (app.indexOf('build: "v63"') === -1) fail("RelicArchitect.build is not v63");
else ok("build stamp is v63");

["styles.css?v=v63", "app.js?v=v63", "deck.js?v=v63", "cards.js?v=v63", "builder.js?v=v63"].forEach(function (stamp) {
  if (html.indexOf(stamp) === -1) fail("index.html is missing " + stamp);
});
if (html.indexOf("v62") !== -1) fail("index.html still says v62");
else ok("cache stamp is v63");

var protectedPaths = [
  "data/schedule.js",
  "data/upperBody.js",
  "data/videoArchive.js",
  "data/videoCatalog.js",
  "data/precondition.js",
  "data/citations.js",
  "data/forensic.js",
  "data/cues"
];
var diff = cp.spawnSync("git", ["diff", "--exit-code", "origin/master", "--"].concat(protectedPaths), { encoding: "utf8" });
if (diff.status !== 0) fail("protected training files differ from master");
else ok("protected training files match master");

if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v62") !== -1; })) {
  fail("a new player-open rule would move the guard hash");
}

if (failed) {
  console.error(failed + " v62 check(s) failed");
  process.exit(1);
}
console.log("OK v62");
