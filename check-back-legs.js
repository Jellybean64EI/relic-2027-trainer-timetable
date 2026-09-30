#!/usr/bin/env node
/* v26 acceptance. Exits 1 if Back/Legs lock laws fail. */
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");

const fails = [];
function fail(msg) { fails.push(msg); }

const html = fs.readFileSync("index.html", "utf8");
if (html.indexOf('content="v26"') === -1 || html.indexOf("styles.css?v=v26") === -1 ||
    html.indexOf("data/schedule.js?v=v26") === -1 || html.indexOf("data/precondition.js?v=v26") === -1) {
  fail("index.html is not stamped ?v=v26");
}

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("data/schedule.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("data/precondition.js", "utf8"), ctx);
const S = ctx.window.RELIC_SCHEDULE;
const P = ctx.window.RELIC_PRECONDITION;

const oct1 = P.buildMonthDays(2026, 10).find(function (day) { return day.dateKey === "2026-10-01"; });
if (!oct1 || oct1.cabins[0] !== "Back" || String(oct1.doc1).indexOf("1. Back_Trainer_") !== 0) {
  fail("2026-10-01 is not Back first");
} else {
  console.log("2026-10-01", oct1.dayName, oct1.pair, oct1.cabins.join(" + "), oct1.doc1);
}

function tally(days, key) {
  return days.filter(function (day) {
    return day && !day.isRecovery && day.dayIndex < 6 && day.cabins.indexOf(key) !== -1;
  }).length;
}

const BEFORE = {
  bridge: { 10: { back: 7, legs: 7 }, 11: { back: 6, legs: 6 }, 12: { back: 7, legs: 6 } },
  year: { 1: { back: 6, legs: 4 }, 2: { back: 6, legs: 4 } }
};

[10, 11, 12].forEach(function (month) {
  const days = P.buildMonthDays(2026, month);
  const back = tally(days, "Back");
  const legs = tally(days, "Legs_Glutes");
  const prior = BEFORE.bridge[month];
  console.log("bridge " + month + " Back " + prior.back + " -> " + back + "  Legs " + prior.legs + " -> " + legs);
  if (back <= prior.back) fail("bridge " + month + " Back did not rise");
  if (legs <= prior.legs) fail("bridge " + month + " Legs did not rise");
  days.forEach(function (day) {
    if (day.dayName === "SUN" && !day.isRecovery) fail("Sunday is not recovery " + day.dateKey);
    if (day.isRecovery || day.dayIndex >= 6) return;
    ["Hanging", "Target_Weights", "Calisthenics"].forEach(function (key) {
      if (day.cabins.indexOf(key) !== -1) fail("bridge banned cabin " + key + " on " + day.dateKey);
    });
    if (day.cabins.length !== 2) fail("bridge row is not a pair " + day.dateKey);
    if (day.cabins.indexOf("Back") !== -1 && day.cabins[0] !== "Back") {
      fail("bridge Back is not first " + day.dateKey + " " + day.pair);
    }
    if (day.cabins.indexOf("Legs_Glutes") !== -1 && day.cabins[0] !== "Legs_Glutes" && day.cabins[0] !== "Back") {
      fail("bridge Legs is not first " + day.dateKey + " " + day.pair);
    }
  });
});

[1, 2].forEach(function (month) {
  const days = S.buildMonthDays(2027, month);
  const back = tally(days, "Back");
  const legs = tally(days, "Legs_Glutes");
  const prior = BEFORE.year[month];
  console.log("2027-" + month + " Back " + prior.back + " -> " + back + "  Legs " + prior.legs + " -> " + legs);
  if (back <= prior.back) fail("2027 month " + month + " Back did not rise");
  if (legs <= prior.legs) fail("2027 month " + month + " Legs did not rise");
  days.forEach(function (day) {
    if (day.dayName === "SUN" && !day.isRecovery) fail("Sunday is not recovery " + day.dateKey);
    if (day.isRecovery || day.dayIndex >= 6) return;
    if (day.cabins.length !== 2) fail("year row is not a pair " + day.dateKey);
    if (day.cabins.indexOf("Back") !== -1 && day.cabins[0] !== "Back") {
      fail("Back is not first " + day.dateKey + " " + day.pair);
    }
    if (day.cabins.indexOf("Legs_Glutes") !== -1 && day.cabins[0] !== "Legs_Glutes" && day.cabins[0] !== "Back") {
      fail("Legs is not first " + day.dateKey + " " + day.pair);
    }
  });
});

const marDec = {};
for (let month = 3; month <= 12; month++) marDec[month] = S.MONTH_ROTATIONS[month];
const hash = crypto.createHash("sha256").update(JSON.stringify(marDec)).digest("hex");
const EXPECT = "50154c8337cd7b86de3930de87ec2f8be7344d9291b955eb26e141be785bb902";
console.log("Mar-Dec sha256", hash);
if (hash !== EXPECT) fail("Mar-Dec MONTH_ROTATIONS changed");

if (fails.length) {
  console.error("FAIL", fails.length);
  fails.forEach(function (msg) { console.error(" -", msg); });
  process.exit(1);
}
console.log("OK back/legs v26");
