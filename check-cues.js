#!/usr/bin/env node
/* v28: Back Base cues match Joe's trainer document, keyed by Drive file id. */
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
if (html.indexOf("data/forensicClips.js?v=v28") === -1) fail("forensicClips.js is not stamped v28");
if (css.indexOf(".player-stage.is-hud-idle:not(.is-forensic-open) .forensic-tab") === -1) {
  fail("cue handle does not fade with HUD idle");
}
if (app.indexOf("readClip") === -1) fail("paint path has no readClip");

const ctx = { window: {} };
vm.createContext(ctx);
["data/forensic.js", "data/forensicClips.js", "data/videoArchive.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
const lib = ctx.window.RELIC_FORENSIC;
const archive = ctx.window.RELIC_VIDEO_ARCHIVE;
if (!lib || typeof lib.ingestClips !== "function" || typeof lib.readClip !== "function") {
  fail("RELIC_FORENSIC.ingestClips/readClip missing");
}

const blocks = parseTrainer(fs.readFileSync("data/cues/Back_Base_Trainer.txt", "utf8"));
console.log("Back Base blocks", blocks.length);
if (blocks.length < 39) fail("expected 39 Back Base blocks, got " + blocks.length);

blocks.forEach(function (block) {
  const hit = lib.readClip({
    branch: "year",
    cabinKey: "Back",
    clipId: block.id,
    title: block.title + ".mp4",
    phase: "Hard"
  });
  if (!hit || hit.source !== "clip" || hit.clipId !== block.id) fail("drive id did not resolve " + block.id + " " + block.title);
  if (!hit.leadRule || !hit.doThis || !hit.avoidThis) fail("empty cue " + block.title);
  if (hit.phase !== "Base") fail("Hard request did not fall back to Base for " + block.title);
  ["title", "metrics", "leadRule", "doThis", "avoidThis"].forEach(function (key) {
    if (hit[key] !== block[key]) fail(block.title + " " + key + " drifted");
  });
});

const wipers = lib.readClip({
  branch: "bridge",
  cabinKey: "Back",
  clipId: "19NojjFZ4WJigtiQUcsrfJ5xhzUV8FjtZ",
  title: "2. Supine Windshield Wipers.mp4",
  phase: "Base"
});
const golden = {
  title: "Supine Windshield Wipers",
  metrics: "Sets: 3 | Reps: 8–10 each | Hold: 1 sec | Rest: 45 sec",
  leadRule: "Left-Lead on sided sweeps. 3-second lower of the legs. Head stays heavy.",
  doThis: "Run the clip order: prone opposite-limb reach — switch side — then supine 90° windshield wipers.\nHands under the head on the floor series. Legs move. Torso stays quiet.\nUse a strict 3-Second Negative on every lowering / return phase.",
  avoidThis: "Letting the opposite shoulder peel off the floor.\nKicking the legs to fake range."
};
Object.keys(golden).forEach(function (key) {
  if (!wipers || wipers[key] !== golden[key]) fail("Windshield Wipers " + key + " mismatch");
});
if (wipers && wipers.doThis.indexOf("Brace the trunk") !== -1) fail("Windshield Wipers still uses the generic Back cue");

const byTitle = lib.readClip({
  branch: "year",
  cabinKey: "Back",
  title: "2. Supine Windshield Wipers.mp4",
  phase: "Till Failure"
});
if (!byTitle || byTitle.clipId !== "19NojjFZ4WJigtiQUcsrfJ5xhzUV8FjtZ") fail("title fallback missed Windshield Wipers");

(archive.cabins.Back.playlist || []).forEach(function (clip) {
  const hit = lib.readClip({ cabinKey: "Back", clipId: clip.id, title: clip.title, phase: "Base" });
  if (!hit || hit.source !== "clip" || hit.clipId !== clip.id) fail("playlist clip has no cue " + clip.title);
});

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
  fails.forEach(function (msg) { console.error(" -", msg); });
  process.exit(1);
}
console.log("OK cues v28", blocks.length, "back base");
