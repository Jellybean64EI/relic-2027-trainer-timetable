#!/usr/bin/env node
/* v29: future training days tick. LOCKED stays off Done cells after the bridge opens. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");

if (html.indexOf('content="v29"') === -1 || html.indexOf("app.js?v=v29") === -1) {
  fail("index.html is not stamped v29");
}
if (app.indexOf('build: "v29"') === -1) fail("RelicArchitect.build is not v29");
if (/Future days locked/i.test(html) || /Future days locked/i.test(app)) {
  fail("live copy still says future days are locked");
}
if (app.indexOf("2027 LOCKED") !== -1) fail("meta-mode still says 2027 LOCKED");
if (app.indexOf("past and today tick") !== -1) fail("meta-mode still limits ticks to past and today");

const lockReturn = app.indexOf('return \'<td class="done-cell"><span class="lock-badge">LOCKED</span></td>\';');
const canGate = app.lastIndexOf("if (!canTick(day.dateKey, parts))", lockReturn);
if (lockReturn === -1 || canGate === -1 || lockReturn - canGate > 180) {
  fail("LOCKED badge is no longer gated by canTick");
}

const ctx = {
  console: console,
  setInterval: function () { return 0; },
  clearInterval: function () {},
  location: { search: "?date=2026-10-06", href: "http://127.0.0.1/?date=2026-10-06" },
  document: {
    readyState: "loading",
    addEventListener: function () {},
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  }
};
ctx.window = ctx;
vm.createContext(ctx);
["data/schedule.js", "data/precondition.js", "data/upperBody.js", "app.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});

const arch = ctx.RelicArchitect;
if (!arch || arch.build !== "v29" || typeof arch.canTickDate !== "function") {
  fail("canTickDate missing on v29");
} else if (arch.canTickDate("2026-10-06") !== true) {
  fail("today 2026-10-06 cannot tick");
} else {
  ["2026-10-07", "2026-12-31", "2027-01-01", "2027-10-07", "2027-12-31"].forEach(function (dateKey) {
    if (arch.canTickDate(dateKey) !== true) fail(dateKey + " is still locked");
  });
  if (arch.canTickDate("") !== false || arch.canTickDate(null) !== false) {
    fail("empty date must stay closed");
  }
  console.log("canTickDate", {
    today: arch.canTickDate("2026-10-06"),
    tomorrow: arch.canTickDate("2026-10-07"),
    year: arch.canTickDate("2027-10-07")
  });
}

if (fails.length) {
  fails.forEach(function (msg) { console.error("FAIL", msg); });
  process.exit(1);
}
console.log("OK ticks v29");
