#!/usr/bin/env node
/* v28: full cue dump. Drive file id first, title fallback, original wording only. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

function parseTrainer(text) {
  const clips = [];
  text.split(/~{5,}/).forEach(function (chunk) {
    const lines = chunk.split(/\r?\n/).map(function (line) { return line.replace(/\s+$/, ""); });
    let title = "";
    let titleAt = -1;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^☐\s+\d+\.\s+(.+)$/);
      if (match) { title = match[1].trim(); titleAt = i; break; }
    }
    if (!title) return;
    const setsLine = lines.slice(titleAt + 1).find(function (line) { return line.indexOf("Sets:") === 0; });
    const leadLine = lines.find(function (line) { return line.indexOf("3 Lead Unique Rule:") === 0; });
    const urlLine = lines.find(function (line) { return line.indexOf("https://drive.google.com/file/d/") === 0; });
    const doAt = lines.findIndex(function (line) { return line === "Do this properly:"; });
    const avoidAt = lines.findIndex(function (line) { return line === "Avoid this:"; });
    if (!setsLine || !leadLine || !urlLine || doAt < 0 || avoidAt < doAt) return;
    const idMatch = urlLine.match(/\/file\/d\/([^/]+)/);
    if (!idMatch) return;
    const doBody = lines.slice(doAt + 1, avoidAt).join("\n").trim();
    const after = lines.slice(avoidAt + 1);
    const urlAt = after.findIndex(function (line) { return line.indexOf("https://drive.google.com/file/d/") === 0; });
    const avoidBody = after.slice(0, urlAt < 0 ? after.length : urlAt).join("\n").trim();
    clips.push({
      id: idMatch[1],
      title: title,
      metrics: setsLine.trim(),
      leadRule: leadLine.replace(/^3 Lead Unique Rule:\s*/, "").trim(),
      doThis: doBody,
      avoidThis: avoidBody
    });
  });
  return clips;
}

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const app = fs.readFileSync("app.js", "utf8");
if (html.indexOf(">CUE<") !== -1) fail("CUE text pill is still in index.html");
if (html.indexOf("forensic-date-key") !== -1) fail("debug meta is still in the cue sheet");
if (html.indexOf("data/cues/cues.js?v=v28") === -1) fail("cue dump script is not stamped v28");
if (css.indexOf(".player-stage.is-hud-idle:not(.is-forensic-open) .forensic-tab") === -1) {
  fail("cue handle does not fade with HUD idle");
}
if (app.indexOf("readClip") === -1) fail("paint path has no readClip");

const ctx = { window: {} };
vm.createContext(ctx);
["data/forensic.js", "data/cues/cues.js", "data/forensicClips.js", "data/videoArchive.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
const lib = ctx.window.RELIC_FORENSIC;
const archive = ctx.window.RELIC_VIDEO_ARCHIVE;
if (!lib || typeof lib.ingestClips !== "function" || typeof lib.readClip !== "function") {
  fail("RELIC_FORENSIC.ingestClips/readClip missing");
}
const info = lib.stats();
console.log("ingest", info);
if (info.ids !== 539) fail("expected 539 drive ids, got " + info.ids);
if (info.titleOnly !== 121) fail("expected 121 title-only blocks, got " + info.titleOnly);
if (info.blocks !== 2033) fail("expected 2033 id-backed blocks, got " + info.blocks);

const blocks = parseTrainer(fs.readFileSync("data/cues/Back_Base_Trainer.txt", "utf8"));
if (blocks.length !== 39) fail("expected 39 Back Base blocks, got " + blocks.length);
blocks.forEach(function (block) {
  const hit = lib.readClip({
    branch: "year",
    cabinKey: "Back",
    clipId: block.id,
    title: block.title,
    phase: "Base"
  });
  if (!hit || hit.source !== "clip" || hit.clipId !== block.id) fail("drive id did not resolve " + block.id);
  ["title", "metrics", "leadRule", "doThis", "avoidThis"].forEach(function (key) {
    if (!hit || hit[key] !== block[key]) fail(block.title + " " + key + " drifted");
  });
});

const golden = {
  title: "Supine Windshield Wipers",
  metrics: "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
  leadRule: "Left-Lead on sided sweeps. 3-second lower of the legs. Head stays heavy.",
  doThis: "Run the clip order: prone opposite-limb reach — switch side — then supine 90° windshield wipers.\nHands under the head on the floor series. Legs move. Torso stays quiet.\nUse a strict 3-Second Negative on every lowering / return phase.",
  avoidThis: "Letting the opposite shoulder peel off the floor.\nKicking the legs to fake range."
};
const wipers = lib.readClip({
  branch: "bridge",
  cabinKey: "Back",
  clipId: "19NojjFZ4WJigtiQUcsrfJ5xhzUV8FjtZ",
  title: "2. Supine Windshield Wipers.mp4",
  phase: "Base"
});
Object.keys(golden).forEach(function (key) {
  if (!wipers || wipers[key] !== golden[key]) fail("Windshield Wipers " + key + " mismatch");
});
const wipersHard = lib.readClip({
  cabinKey: "Back",
  clipId: "19NojjFZ4WJigtiQUcsrfJ5xhzUV8FjtZ",
  title: "2. Supine Windshield Wipers.mp4",
  phase: "Hard"
});
if (!wipersHard || wipersHard.source !== "clip" || wipersHard.phase !== "Hard") {
  fail("Hard Windshield Wipers did not use the Hard block");
}

const byTitle = lib.readClip({
  cabinKey: "Calisthenics",
  title: "Pistol Squat",
  phase: "Till_Failure"
});
if (!byTitle || byTitle.source !== "clip" || byTitle.clipId || byTitle.phase !== "Base") {
  fail("title-only Calisthenics block did not fall back to Base");
}
if (byTitle && byTitle.doThis.indexOf("Brace the trunk") !== -1) fail("title fallback invented a cabin cue");

const face = lib.readClip({
  cabinKey: "Face",
  clipId: "1MNhdl1A4tE_-rF57FHj6nRx0_cuKmB7Y",
  title: "1. Temporal Fascial Twist for Skull Asymmetry.mp4",
  phase: "Base"
});
if (!face || face.source !== "clip" || face.leadRule) fail("empty Face lead was filled in");

const byDrive = JSON.parse(fs.readFileSync("data/cues/cues-by-driveId.json", "utf8"));
function asList(value) { return Array.isArray(value) ? value : (value ? [value] : []); }
const dumpIds = {};
Object.keys(byDrive).forEach(function (id) { dumpIds[id] = true; });
let archiveWithId = 0;
let present = 0;
let resolved = 0;
Object.keys(archive.cabins).forEach(function (cabin) {
  (archive.cabins[cabin].playlist || []).forEach(function (clip) {
    if (!clip.id) return;
    archiveWithId += 1;
    if (!dumpIds[clip.id]) return;
    present += 1;
    const hit = lib.readClip({ cabinKey: cabin, clipId: clip.id, title: clip.title, phase: "Base" });
    if (hit && hit.source === "clip" && hit.clipId === clip.id) resolved += 1;
    else fail("archive id in the dump did not resolve " + cabin + " " + clip.title);
  });
});
console.log("archive ids", archiveWithId, "present in dump", present, "resolved", resolved);
if (!present || resolved !== present) fail("drive-id coverage " + resolved + "/" + present);

lib.ingestClips([{
  id: "ingest-probe",
  cabin: "Chest",
  phase: "Hard",
  title: "Probe Press",
  metrics: "Sets: 1 | Reps: 1 | Hold: 1 sec | Rest: 1 sec",
  leadRule: "Probe lead.",
  doThis: "Probe do.",
  avoidThis: "Probe avoid."
}]);
const probe = lib.readClip({ cabinKey: "Chest", clipId: "ingest-probe", phase: "Hard" });
if (!probe || probe.source !== "clip" || probe.leadRule !== "Probe lead.") fail("ingestClips did not accept a follow-up clip");
const chestFallback = lib.readClip({ cabinKey: "Chest", clipId: "missing-clip", title: "No Such Clip.mp4", phase: "Base" });
if (!chestFallback || chestFallback.source !== "profile" || !chestFallback.doThis) fail("cabin profile fallback missing");

if (fails.length) {
  console.error("FAIL", fails.length);
  fails.slice(0, 20).forEach(function (msg) { console.error(" -", msg); });
  process.exit(1);
}
console.log("OK cues v28", info.blocks + info.titleOnly, "blocks");
