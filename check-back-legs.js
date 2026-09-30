#!/usr/bin/env node
/* v26 acceptance. Every bridge month and every 2027 month must raise Back and Legs. */
const fs = require("fs");
const vm = require("vm");

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

/* Pre-v26 calendar training-day counts (origin/master before this bump). */
const BEFORE = {
  bridge: { 10: { back: 7, legs: 7 }, 11: { back: 6, legs: 6 }, 12: { back: 7, legs: 6 } },
  year: {
    1: { back: 6, legs: 4 }, 2: { back: 6, legs: 4 }, 3: { back: 5, legs: 5 },
    4: { back: 4, legs: 4 }, 5: { back: 4, legs: 4 }, 6: { back: 5, legs: 4 },
    7: { back: 4, legs: 4 }, 8: { back: 4, legs: 4 }, 9: { back: 4, legs: 5 },
    10: { back: 4, legs: 4 }, 11: { back: 4, legs: 4 }, 12: { back: 5, legs: 5 }
  }
};
const CALI_BEFORE = { 10: 4, 11: 4, 12: 5 };

function orderLaws(days, label) {
  days.forEach(function (day) {
    if (day.dayName === "SUN" && !day.isRecovery) fail("Sunday is not recovery " + day.dateKey);
    if (day.isRecovery || day.dayIndex >= 6) return;
    if (day.cabins.length !== 2) fail(label + " row is not a pair " + day.dateKey);
    if (day.cabins.indexOf("Back") !== -1 && day.cabins[0] !== "Back") {
      fail(label + " Back is not first " + day.dateKey + " " + day.pair);
    }
    if (day.cabins.indexOf("Legs_Glutes") !== -1 && day.cabins[0] !== "Legs_Glutes" && day.cabins[0] !== "Back") {
      fail(label + " Legs is not first " + day.dateKey + " " + day.pair);
    }
  });
}

console.log("\n2026 bridge (training days)");
[10, 11, 12].forEach(function (month) {
  const days = P.buildMonthDays(2026, month);
  const back = tally(days, "Back");
  const legs = tally(days, "Legs_Glutes");
  const prior = BEFORE.bridge[month];
  console.log("bridge " + month + " Back " + prior.back + " -> " + back + "  Legs " + prior.legs + " -> " + legs);
  if (back <= prior.back) fail("bridge " + month + " Back did not rise");
  if (legs <= prior.legs) fail("bridge " + month + " Legs did not rise");
  days.forEach(function (day) {
    if (day.isRecovery || day.dayIndex >= 6) return;
    ["Hanging", "Target_Weights", "Calisthenics"].forEach(function (key) {
      if (day.cabins.indexOf(key) !== -1) fail("bridge banned cabin " + key + " on " + day.dateKey);
    });
  });
  orderLaws(days, "bridge");
});

console.log("\n2027 Full Body (training days)");
for (let month = 1; month <= 12; month++) {
  const days = S.buildMonthDays(2027, month);
  const back = tally(days, "Back");
  const legs = tally(days, "Legs_Glutes");
  const cali = tally(days, "Calisthenics");
  const prior = BEFORE.year[month];
  console.log("2027-" + String(month).padStart(2, "0") +
    " Back " + prior.back + " -> " + back +
    "  Legs " + prior.legs + " -> " + legs +
    "  Calisthenics " + cali);
  if (back <= prior.back) fail("2027 month " + month + " Back did not rise");
  if (legs <= prior.legs) fail("2027 month " + month + " Legs did not rise");
  if (month <= 9 && cali !== 0) fail("Calisthenics outside Q4 in month " + month);
  if (month >= 10 && cali !== CALI_BEFORE[month]) {
    fail("2027 month " + month + " Calisthenics " + cali + " expected " + CALI_BEFORE[month]);
  }
  orderLaws(days, "2027");
}

if (fails.length) {
  console.error("FAIL", fails.length);
  fails.forEach(function (msg) { console.error(" -", msg); });
  process.exit(1);
}
console.log("\nOK back/legs v26");
