/* Nexus v64: schedule bubbles, stars, stage labels, and weekly groups. */
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

function must(source, token, message) {
  if (source.indexOf(token) === -1) fail(message || token);
}

var builder = read("builder.js");
var css = read("styles.css");
var app = read("app.js");
var html = read("index.html");

must(builder, 'homeTab = ""', "home tab does not start closed");
must(builder, 'data-sched-tab="mine"', "My schedules bubble is missing");
must(builder, 'data-sched-tab="favs"', "Favourites bubble is missing");
must(builder, 'data-sched-tab="groups"', "Favourite Groups bubble is missing");
must(builder, "Favourite Groups 🌟", "groups bubble label is missing");
must(builder, "Favourites ⭐", "favourites bubble label is missing");
must(builder, 'homeTab = homeTab === nextTab ? "" : nextTab', "open bubble does not toggle closed");
must(builder, "host.hidden = !homeTab", "closed tab does not hide the list");
if (builder.indexOf('class="sched-h"') !== -1 || builder.indexOf(">My schedules</h2>") !== -1) {
  fail("My schedules heading is still always open");
} else ok("schedule list starts as three closed bubbles");

if (builder.indexOf("sched-play-count") !== -1) fail("schedule rows still render a play count");
else ok("schedule rows are a clean title");
must(builder, "data-sched-fav", "schedule star is missing");
must(builder, 'method: "PATCH"', "stars do not patch");
must(builder, "fav: !!draft.fav", "saving a schedule drops the star");
must(builder, "Tap ⭐ on any schedule in My schedules to keep your favourites here.", "favourites empty copy is missing");
must(css, "border-color: #ff8a00;", "star glow border is missing");
must(css, "background: rgba(255, 138, 0, 0.18);", "star glow fill is missing");
must(css, ".sched-tab.is-on", "active bubble style is missing");
if (css.indexOf("white-space: nowrap") === -1) fail("schedule titles can wrap");
else ok("stars and one-line titles are styled");

must(builder, '"Pre-stretch"', "pre stage label is missing");
must(builder, '"Exercise"', "exercise stage label is missing");
must(builder, '"Post-stretch"', "post stage label is missing");
must(builder, "stage: stage +", "clips do not carry a stage");
must(app, 'stage: String(clip.stage || "").trim()', "playlist drops the stage");
must(app, "(clip && clip.stage) || (clip && clip.cabin) || player.cabin", "player label ignores the stage");
ok("player can show the stage and the video name");

must(builder, '"nexus_training_groups_v1"', "groups cache key is missing");
must(builder, '"/training-groups"', "groups are not loaded");
must(builder, '"/training-plan-week"', "week placement route is missing");
must(builder, 'id="sched-group-new"', "Make a group button is missing");
must(builder, "+ Make a group", "Make a group label is missing");
must(builder, "data-group-fav", "group star is missing");
must(builder, "data-group-place", "Place in week is missing");
must(builder, "data-group-edit", "group edit is missing");
must(builder, "data-group-del", "group delete is missing");
must(builder, ">Yes</button>", "group delete confirm is missing Yes");
must(builder, ">No</button>", "group delete confirm is missing No");
must(builder, "Apply pair to Mon–Sat", "quick fill is missing");
must(builder, "Schedule 1 (top tick)", "slot 1 label is missing");
must(builder, "Schedule 2 (bottom tick)", "slot 2 label is missing");
must(builder, "Sunday (optional)", "Sunday row is missing");
must(builder, "Place a Weekly Group (fills whole week · 2 a day)", "timetable group section is missing");
must(builder, "Placed ", "placement toast is missing");
must(builder, "across this week", "picker placement toast is missing");
must(builder, "Could not place that group.", "placement error toast is missing");
must(builder, "Could not save the star.", "star error toast is missing");
must(builder, "function hideToast()", "a sheet can open under a leftover toast");
must(builder, "paintBoard: paintBoard", "paintBoard is not exported");
must(builder, "filledSlots", "slot badge is missing");
must(builder, '"/12 slots"', "slot badge is not out of 12");
ok("weekly groups and one-tap placement are wired");

if (app.indexOf('build: "v64"') === -1) fail("RelicArchitect.build is not v64");
else ok("build stamp is v64");

["styles.css?v=v64", "app.js?v=v64", "deck.js?v=v64", "cards.js?v=v64", "builder.js?v=v64"].forEach(function (stamp) {
  if (html.indexOf(stamp) === -1) fail("index.html is missing " + stamp);
});
if (html.indexOf('content="v64"') === -1) fail("relic-build is not v64");
if (html.indexOf("v62") !== -1) fail("index.html still says v62");
else ok("cache stamp is v64");

var protectedPaths = [
  "data/schedule.js",
  "data/upperBody.js",
  "data/videoArchive.js",
  "data/precondition.js",
  "data/citations.js",
  "data/forensic.js",
  "data/cues"
];
var diff = cp.spawnSync("git", ["diff", "--exit-code", "origin/master", "--"].concat(protectedPaths), { encoding: "utf8" });
if (diff.status !== 0) fail("protected training files differ from master");
else ok("protected training files match master");

if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v64") !== -1; })) {
  fail("a new player-open rule would move the guard hash");
}

if (builder.indexOf("vc-upload-box") !== -1) fail("builder should not own the upload box");
if (read("cards.js").indexOf("vc-upload-box") === -1) fail("upload box was removed");
else ok("upload box is still in the card catalogue");

if (failed) {
  console.error(failed + " v64 check(s) failed");
  process.exit(1);
}
console.log("OK v64");
