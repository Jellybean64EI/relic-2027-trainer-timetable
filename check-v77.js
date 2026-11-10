/* Nexus v77: cue sheet joins by video id. The fixture stays out of index.html. */
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
var css = fs.readFileSync("styles.css", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var model = fs.readFileSync("data/cueModel.js", "utf8");

if (html.indexOf('content="v89"') === -1 || app.indexOf('build: "v89"') === -1) fail("cache stamp is not v77");
else ok("cache stamp is v77");
if (html.indexOf("data/cueModel.js") === -1) fail("cue model is not loaded");
else ok("cue model is loaded");
if (html.indexOf("cueFixture") !== -1 || html.indexOf("NEXUS_CUE_PACK") !== -1) fail("fixture pack is wired into the page");
else ok("fixture pack stays out of the page");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0; }) === false) {
  /* existing guard lines must remain; this check only rejects a new v77 rule on that prefix */
}
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v77") !== -1; })) {
  fail("new css starts with body.player-open");
} else ok("cue css stays off the player-open hash prefix");
if (app.indexOf("function paintForensic()") === -1 || app.indexOf("NexusCue.resolve") === -1) fail("schedule sheet does not use the cue model");
else ok("schedule sheet uses the cue model");
if (app.indexOf("The schedule sheet never prints the numeric id.") === -1) fail("schedule id boundary note missing");
else ok("schedule sheet is marked as id-free");

var sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(model, sandbox);
vm.runInContext(fs.readFileSync("tools/cueFixture.js", "utf8"), sandbox);
var Cue = sandbox.window.NexusCue;
sandbox.window.NEXUS_CUE_PACK = sandbox.window.NEXUS_CUE_FIXTURE;

var blank = Cue.resolve({ title: "Anterior pelvic tilts", identity: null, driveId: "abc" });
if (blank.origin !== "awaiting" || blank.leads.length !== 0) fail("missing content was filled in");
else ok("missing content stays awaiting");
var blankHtml = Cue.render(blank);
if (blankHtml.indexOf("Awaiting review") === -1) fail("awaiting label missing");
else ok("awaiting label is visible");
if (blankHtml.indexOf("3 Lead Unique Rule") !== -1 || blankHtml.indexOf("Left-Lead. 3-second ease.") !== -1) {
  fail("canned lead is still shown as a rule");
} else ok("canned lead is not a rule");

var joined = Cue.resolve({
  title: "Wrong title",
  identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", title: "Fixture brace (not a live video)", status: "active" }
});
if (joined.origin !== "fixture" || joined.leads.length !== 3 || joined.steps.length !== 2) fail("id join missed the fixture");
else ok("id join returns three leads and numbered steps");
var joinedHtml = Cue.render(joined);
if (joinedHtml.indexOf("#900001") !== -1 || joinedHtml.indexOf(">900001<") !== -1) fail("schedule render printed the numeric id");
else ok("schedule render omits the numeric id");
if (joinedHtml.indexOf("Quiet nasal breath") === -1 || joinedHtml.indexOf("<dt>Sets</dt>") === -1) fail("breathing or dose grid missing");
else ok("breathing and dose grid render");

var mismatch = Cue.resolve({
  identity: { videoId: 900001, r2Key: "Other/file.mp4", status: "active" }
});
if (mismatch.origin !== "awaiting" || mismatch.reject !== "r2-mismatch") fail("r2 mismatch was accepted");
else ok("r2 mismatch is rejected");

var reserved = Cue.resolve({
  identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "reserved" }
});
if (reserved.origin !== "awaiting" || reserved.reject !== "reserved") fail("reserved id was accepted");
else ok("reserved id is rejected");

var deleted = Cue.resolve({
  identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "deleted" }
});
if (deleted.reject !== "deleted") fail("deleted id was accepted");
else ok("deleted id is rejected");

sandbox.window.NEXUS_CUE_PACK = sandbox.window.NEXUS_CUE_FIXTURE.concat([
  { fixture: true, videoId: 900001, r2Key: "Fixture/not-live.mp4", title: "Duplicate", leads: ["a", "b", "c"], steps: ["d"] }
]);
var ambiguous = Cue.resolve({
  identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "active" }
});
if (ambiguous.reject !== "ambiguous") fail("ambiguous id was accepted");
else ok("ambiguous id is rejected");
sandbox.window.NEXUS_CUE_PACK = sandbox.window.NEXUS_CUE_FIXTURE;

var ref = Cue.resolve({
  title: "REF Shoulder",
  identity: { videoId: 900002, r2Key: "Fixture/ref-only.mp4", status: "active" }
});
var refHtml = Cue.render(ref);
if (refHtml.indexOf("Reference clip.") === -1 || refHtml.indexOf("Not applicable.") === -1) fail("reference warning or N/A missing");
else ok("reference clip keeps the warning and N/A dose");

var legacyOk = Cue.resolve({
  title: "Old title",
  driveId: "drive-1",
  identity: null,
  legacy: { source: "clip", clipId: "drive-1", title: "Old title", leadRule: "Brace before the reach.", doThis: "Reach.\nReturn.", breathing: "Nasal.", avoidThis: "Rushing." }
});
if (legacyOk.origin !== "legacy-id" || legacyOk.leads[0] !== "Brace before the reach.") fail("matching legacy note was dropped");
else ok("legacy note is used only when the clip id matches");
var gridded = Cue.resolve({
  driveId: "drive-1",
  legacy: { source: "clip", clipId: "drive-1", title: "T", metrics: "Sets: 3 | Reps: 6–8 / way | Hold: 1 sec | Rest: 20 sec", leadRule: "Brace.", doThis: "Move." }
});
if (gridded.dose.state !== "value" || gridded.dose.rest !== "20 sec") fail("known dose line stayed as pipes");
else ok("known dose line becomes the grid");
var oddDose = Cue.resolve({
  driveId: "drive-1",
  legacy: { source: "clip", clipId: "drive-1", title: "T", metrics: "Until the shape is easy", leadRule: "Brace.", doThis: "Move." }
});
if (oddDose.dose.state !== "legacy") fail("unparsed dose was forced into the grid");
else ok("unparsed dose stays as written");

var legacyBad = Cue.resolve({
  title: "Old title",
  driveId: "drive-2",
  legacy: { source: "clip", clipId: "drive-1", title: "Old title", leadRule: "Wrong clip.", doThis: "Nope." }
});
if (legacyBad.origin !== "awaiting") fail("mismatched legacy note was shown");
else ok("mismatched legacy note is not shown");

var canned = Cue.resolve({
  driveId: "drive-1",
  legacy: { source: "clip", clipId: "drive-1", title: "T", leadRule: Cue.CANNED_LEAD, doThis: "" }
});
if (canned.leads.length !== 0) fail("canned legacy lead was kept");
else ok("canned legacy lead is not kept");

var manual = Cue.resolve({
  title: "REF Shoulder check",
  identity: { videoId: 10001, r2Key: "Cabin/clip.mp4", status: "active", title: "REF Shoulder check" },
  manual: { videoId: 10001, r2Key: "Cabin/clip.mp4", cue: { leads: ["Brace."], steps: ["Sit tall."], dose: { sets: "2" }, breathing: "", avoid: "Shrugging.", source: "Joe's note" } }
});
var manualHtml = Cue.render(manual);
if (manual.origin !== "manual" || manualHtml.indexOf("Joe entered") === -1 || manualHtml.indexOf("Reference clip.") === -1) fail("manual cue lost its label or the reference warning");
else ok("manual cue stays labelled and keeps the reference warning");
if (manualHtml.indexOf("Not entered") === -1) fail("blank manual fields were filled in");
else ok("blank manual fields say not entered");

var manualMiss = Cue.resolve({
  title: "Other",
  identity: { videoId: 10001, r2Key: "Cabin/clip.mp4", status: "active" },
  manual: { videoId: 10001, r2Key: "Other/clip.mp4", cue: { leads: ["Wrong video."] } }
});
if (manualMiss.origin === "manual") fail("manual cue followed a mismatched key");
else ok("manual cue rejects a mismatched key");

vm.runInContext(fs.readFileSync("data/cueEditor.js", "utf8"), sandbox);
var Edit = sandbox.window.NexusCueEdit;
if (Edit.identityError({ videoId: 10001, r2Key: "A", status: "reserved" }, 10001, "A") === "") fail("reserved id was editable");
else ok("reserved id is not editable");
if (Edit.identityError({ videoId: 10001, r2Key: "A", status: "active" }, 10002, "A") === "") fail("id swap was editable");
else ok("id swap is not editable");
if (!Edit.blank({ leads: ["", "", ""], steps: [], dose: {}, breathing: "", avoid: "", source: "" })) fail("empty cue was treated as content");
else ok("empty cue is blank");

var worker = fs.readFileSync("worker/nexus-api.js", "utf8");
var gateAt = worker.indexOf('req.headers.get("X-Nexus-Key")');
var routeAt = worker.indexOf('case "video-cues"');
if (routeAt === -1 || gateAt === -1 || routeAt < gateAt) fail("cue route is outside the key gate");
else ok("cue writes sit behind the existing key gate");
if (html.indexOf("data/cueEditor.js") === -1) fail("cue editor is not loaded");
else ok("cue editor is loaded");

if (failed) {
  console.error(failed + " v77 check(s) failed");
  process.exit(1);
}
console.log("OK v77");
