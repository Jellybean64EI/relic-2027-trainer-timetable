#!/usr/bin/env node
/* relics22: assert all 48 week buckets sort chronologically by dateKey */
const fs = require("fs");
const vm = require("vm");
const path = process.argv[2] || "/workspace/relic-2027-trainer/platform/data/schedule.js";
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path, "utf8"), ctx);
const S = ctx.window.RELIC_SCHEDULE;
if (!S) { console.error("FAIL: RELIC_SCHEDULE missing"); process.exit(2); }
const fails = [];
let janW1 = [];
for (let m = 1; m <= 12; m++) {
  for (let w = 1; w <= 4; w++) {
    const all = S.daysInWeekOfMonth(2027, m, w);
    const ui = all
      .filter((d) => !d.isRecovery && d.dayIndex < 6)
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
    for (let i = 1; i < ui.length; i++) {
      if (ui[i].dateKey < ui[i - 1].dateKey) {
        fails.push({ m, w, a: ui[i - 1].dateKey, b: ui[i].dateKey });
      }
    }
    for (let i = 1; i < all.length; i++) {
      if (all[i].dateKey <= all[i - 1].dateKey) {
        fails.push({ m, w, kind: "bucket", a: all[i - 1].dateKey, b: all[i].dateKey });
      }
    }
    const days = all.map((d) => d.day);
    const min = Math.min(...days), max = Math.max(...days);
    const expect = w === 1 ? [1, 7] : w === 2 ? [8, 14] : w === 3 ? [15, 21] : [22, S.daysInMonth(2027, m)];
    if (min < expect[0] || max > expect[1]) fails.push({ m, w, kind: "range", min, max, expect });
    if (m === 1 && w === 1) janW1 = ui.map((d) => d.dayName + " " + d.day);
  }
}
console.log("Jan W1:", janW1.join(" → "));
if (fails.length) {
  console.error("FAIL:", fails.length, JSON.stringify(fails.slice(0, 20), null, 2));
  process.exit(1);
}
console.log("OK: all 48 weeks chronological by ISO dateKey");
process.exit(0);
