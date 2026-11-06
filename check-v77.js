/* Nexus v77: cue sheet joins by video id. The fixture is not live content. */
var fs = require("fs");
var vm = require("vm");
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
if (html.indexOf("cueFixture.js") !== -1) fail("fixture is loaded in production");
if (html.indexOf("data/cueModel.js?v=v77") === -1 || html.indexOf('content="v77"') === -1) fail("cue model is not stamped v77");
if (app.indexOf("Left-Lead. 3-second ease.") !== -1) fail("the canned lead is still painted");
if (app.indexOf("vc-quick-id") !== -1) fail("schedule app prints the cabin id");
else ok("production page does not load the fixture");

var ctx = { window: {}, console: console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("data/cueModel.js", "utf8"), ctx, { filename: "cueModel.js" });
vm.runInContext(fs.readFileSync("data/cues/cueFixture.js", "utf8"), ctx, { filename: "cueFixture.js" });
ctx.window.NEXUS_CUE_PACK = ctx.window.NEXUS_CUE_FIXTURE;
var cue = ctx.window.NexusCue;

var live = cue.resolve({ title: "Anterior pelvic tilts", identity: { videoId: 10252, r2Key: "Custom/back/pre/1792796779275-1000262848.mp4", status: "active", title: "Anterior pelvic tilts" } });
var liveHtml = cue.render(live);
if (live.origin !== "awaiting" || liveHtml.indexOf("Awaiting review") === -1 || liveHtml.indexOf(cue.CANNED_LEAD) !== -1) {
  fail("unverified clip did not stay awaiting");
} else ok("unverified clip stays awaiting review");

var fit = cue.resolve({ identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "active" } });
var fitHtml = cue.render(fit);
if (fit.leads.length !== 3 || fitHtml.indexOf("cue-dose") === -1 || fitHtml.indexOf("#900001") !== -1) fail("fixture render");
else ok("fixture has three leads, a dose grid, and no id");

var ref = cue.resolve({ identity: { videoId: 900002, r2Key: "Fixture/ref-only.mp4", status: "active" } });
var refHtml = cue.render(ref);
if (refHtml.indexOf("Reference clip") === -1 || refHtml.indexOf("Not applicable") === -1) fail("reference fixture");
else ok("reference fixture withholds a home dose");

var reserved = cue.resolve({
  identity: { videoId: 10420, r2Key: "Hanging/3. Four-Intent Pull-Up Outdoor Duplicate.mp4", status: "reserved" }
});
ctx.window.NEXUS_CUE_PACK = ctx.window.NEXUS_CUE_FIXTURE.concat([{ videoId: 10420, r2Key: "Hanging/3. Four-Intent Pull-Up Outdoor Duplicate.mp4", title: "Should not show", leads: ["no"] }]);
reserved = cue.resolve({ identity: { videoId: 10420, r2Key: "Hanging/3. Four-Intent Pull-Up Outdoor Duplicate.mp4", status: "reserved" } });
if (reserved.origin !== "awaiting" || reserved.reject !== "reserved") fail("reserved id was not rejected");
else ok("reserved id is rejected");

ctx.window.NEXUS_CUE_PACK = [{ videoId: 900001, r2Key: "Other/file.mp4", fixture: true, title: "Wrong file", leads: ["a", "b", "c"], steps: ["s"], dose: { sets: "1", reps: "1", hold: "1", rest: "1" } }];
var mismatch = cue.resolve({ identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "active" } });
if (mismatch.origin !== "awaiting" || mismatch.reject !== "r2-mismatch") fail("r2 mismatch was accepted");
else ok("r2 mismatch is rejected");

ctx.window.NEXUS_CUE_PACK = [
  { videoId: 900001, r2Key: "Fixture/not-live.mp4", title: "One", leads: ["a"] },
  { videoId: 900001, r2Key: "Fixture/not-live.mp4", title: "Two", leads: ["b"] }
];
var ambiguous = cue.resolve({ identity: { videoId: 900001, r2Key: "Fixture/not-live.mp4", status: "active" } });
if (ambiguous.reject !== "ambiguous") fail("ambiguous id was accepted");
else ok("ambiguous id is rejected");

var legacy = cue.resolve({
  title: "Saved combo clip",
  driveId: "drive-1",
  legacy: { source: "clip", clipId: "drive-1", title: "Saved combo clip", leadRule: "A real saved note.", doThis: "Step one.\nStep two.", avoidThis: "Do not bounce.", breathing: "Nasal." }
});
if (legacy.origin !== "legacy-id" || legacy.steps.length !== 2 || legacy.leads.length !== 1) fail("drive-id fallback");
else ok("old drive id still joins one note");

if (failed) {
  console.error(failed + " v77 check(s) failed");
  process.exit(1);
}
console.log("OK v77");
