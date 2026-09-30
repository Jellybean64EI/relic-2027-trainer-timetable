#!/usr/bin/env node
/* v27: every bridge and 2027 Full Body training cabin resolves to a real trainer doc. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");
if (app.indexOf("relic-pair") !== -1) fail("app.js still renders relic-pair");
if (css.indexOf(".relic-pair") !== -1) fail("styles.css still defines .relic-pair");
if (app.indexOf('build: "v28"') === -1 || html.indexOf('content="v28"') === -1) {
  fail("build stamp is not v28");
}

const ctx = { window: {} };
vm.createContext(ctx);
["data/schedule.js", "data/precondition.js", "data/citations.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
const S = ctx.window.RELIC_SCHEDULE;
const P = ctx.window.RELIC_PRECONDITION;
const C = ctx.window.RELIC_CITATIONS;

function resolveEntry(cabinKey, phase) {
  const cabin = C && C.cabins && C.cabins[cabinKey];
  if (!cabin) return null;
  let entry = cabin[phase];
  if (!entry || !entry.url) entry = cabin.Base;
  return entry || null;
}

let checked = 0;
function checkDays(days, label) {
  days.forEach(function (day) {
    if (!day || day.isRecovery || day.dayIndex >= 6) return;
    const phase = day.phase || "Base";
    (day.cabins || []).forEach(function (cabinKey, index) {
      checked += 1;
      const where = label + " " + day.dateKey + " " + cabinKey;
      if (!cabinKey) {
        fail(where + " empty cabin");
        return;
      }
      const expected = "1. " + cabinKey + "_Trainer_" + phase;
      const labelText = S.citationLabel(cabinKey, phase);
      if (labelText !== expected) fail(where + " label " + labelText);
      const shown = index === 0 ? day.doc1 : day.doc2;
      if (shown !== expected) fail(where + " day doc is " + shown);
      const entry = resolveEntry(cabinKey, phase);
      if (!entry || !entry.url || !entry.id) {
        fail(where + " citation points nowhere for " + phase);
        return;
      }
      if (entry.url.indexOf("https://docs.google.com/document/d/" + entry.id + "/") !== 0) {
        fail(where + " href does not carry doc id " + entry.id);
      }
    });
  });
}

[10, 11, 12].forEach(function (month) {
  checkDays(P.buildMonthDays(2026, month), "bridge");
});
for (let month = 1; month <= 12; month++) {
  checkDays(S.buildMonthDays(2027, month), "2027");
}

const oct1 = P.buildMonthDays(2026, 10).find(function (day) { return day.dateKey === "2026-10-01"; });
if (!oct1 || oct1.cabins[0] !== "Back" || oct1.doc1 !== "1. Back_Trainer_Base" || oct1.pair !== "Back + Grip") {
  fail("2026-10-01 is not Back + Grip with 1. Back_Trainer_Base");
}

console.log("citations checked", checked);
if (oct1) console.log("2026-10-01", oct1.pair, oct1.doc1, oct1.doc2);
if (fails.length) {
  console.error("FAIL", fails.length);
  fails.forEach(function (msg) { console.error(" -", msg); });
  process.exit(1);
}
console.log("OK citations v28");
