#!/usr/bin/env node
/* v49: Hub year stats, half days, focus date, drawer labels, footer and shopping gates. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const food = fs.readFileSync("food.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('id="footer"') !== -1 || html.indexOf('class="footer"') !== -1) fail("footer element remains");
if (/piece by piece/i.test(html + "\n" + app)) fail("motto still visible in app or html");
const wordmarks = html.split('class="nexus-mark">Nexus<').length - 1;
if (wordmarks !== 1) fail("Nexus wordmark count " + wordmarks);
[".hub-mark", ".hub-n", ".hub-exus", ".fuel-basket", ".fuel-tier", ".shop-line", ".basket-drafts", "#food-shop", ".food-shop-panel"].forEach(function (sel) {
  if (css.indexOf(sel) !== -1) fail("dead selector " + sel);
});
if (/M5 23V5/.test(html)) fail("N path remains");
["Shopping", "Prep &amp; Today", "Prep day", "Sainsbury"].forEach(function (word) {
  if (html.indexOf(word) !== -1) fail("visible html still has " + word);
});
const doors = [];
const doorRe = /data-os-door="(training|food|smoothies|hub|account)"/g;
let doorMatch;
const drawer = html.slice(html.indexOf('id="nav-drawer"'), html.indexOf('id="relic-deck-park"'));
while ((doorMatch = doorRe.exec(drawer))) doors.push(doorMatch[1]);
if (doors.join(",") !== "hub,training,food,smoothies,account") fail("door keys " + doors.join(","));
if (drawer.split(">Nexus<").length - 1) fail("drawer repeats Nexus");
const labels = ["Main Menu Hub", "Training Schedules", "Food deck", "Smoothies deck", "Account Profile"];
labels.forEach(function (label) {
  if (drawer.indexOf(">" + label + "<") === -1) fail("missing label " + label);
});
if (app.indexOf("function canTick") === -1 || app.indexOf("function saveMask") === -1 || app.indexOf("function upsertCompletion") === -1) fail("tick functions moved");
const focusLines = app.split("\n").filter(function (line) { return line.indexOf("planFocusDate") !== -1; });
focusLines.forEach(function (line) {
  if (!/function planFocusDate|planFocusDate\(\)|planFocusDate:/.test(line)) fail("planFocusDate outside hub " + line.trim());
});
["function canTick", "function saveMask", "function upsertCompletion", "function warmVisibleLeads", "function doneHtml"].forEach(function (name) {
  const start = app.indexOf(name);
  const slice = app.slice(start, start + 700);
  if (slice.indexOf("planFocusDate") !== -1) fail(name + " calls planFocusDate");
});

function mockDate(iso) {
  const Real = Date;
  function Mock() {
    if (arguments.length) return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
    return new Real(iso);
  }
  Mock.prototype = Real.prototype;
  Mock.UTC = Real.UTC;
  Mock.parse = Real.parse;
  Mock.now = function () { return new Real(iso).getTime(); };
  return Mock;
}

function loadApp(search, iso) {
  const ctx = {
    console: console,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    Date: mockDate(iso || "2026-10-16T11:00:00Z"),
    location: { search: search || "", href: "http://127.0.0.1/" + (search || "") },
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      removeItem: function () {}
    },
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
  return ctx.RelicArchitect;
}

function weekMap(from, to, tier) {
  const map = {};
  const start = Date.parse(from + "T12:00:00Z");
  const end = Date.parse(to + "T12:00:00Z");
  for (let t = start; t <= end; t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    map[key] = tier;
    map["upper:" + key] = tier;
  }
  return map;
}

const cold = loadApp("", "2026-10-16T11:00:00Z");
cold.loadTickMap({});
const empty = cold.hubSnapshot();
if (empty.focus !== "2027-01-01") fail("S3 focus " + empty.focus);
if (empty.upper.pct !== 0 || empty.upper.credit !== 0 || empty.full.pct !== 0) {
  fail("S3 zero " + JSON.stringify(empty.upper));
}
const total = empty.upper.days;
if (!total || empty.upper.days !== empty.full.days) fail("training day count " + empty.upper.days + "/" + empty.full.days);

const s1 = loadApp("", "2026-10-16T11:00:00Z");
s1.loadTickMap(weekMap("2027-01-01", "2027-01-07", 3));
const snap = s1.hubSnapshot();
const expectPct = Math.round((6 / total) * 100);
if (snap.focus !== "2027-01-01") fail("S1 focus " + snap.focus);
if (snap.upper.credit !== 6 || snap.full.credit !== 6) fail("S1 credit " + snap.upper.credit + "/" + snap.full.credit);
if (snap.upper.pct !== expectPct || snap.full.pct !== expectPct) fail("S1 pct " + snap.upper.pct + " expected " + expectPct);
if (!(snap.upper.streak === undefined && snap.full.best === undefined)) {
  fail("J-ST streak removed");
}
if (snap.upper.videos !== 12 || snap.full.videos !== 12) fail("S1 videos " + snap.upper.videos);

const half = loadApp("", "2026-10-16T11:00:00Z");
const halfMap = {};
["2027-01-01", "2027-01-02", "2027-01-04", "2027-01-05", "2027-01-06"].forEach(function (key) {
  halfMap[key] = 3;
  halfMap["upper:" + key] = 1;
});
half.loadTickMap(halfMap);
const halfSnap = half.hubSnapshot();
if (halfSnap.upper.credit !== 2.5 || halfSnap.full.credit !== 5) {
  fail("J-H 1-6 credit " + halfSnap.upper.credit + "/" + halfSnap.full.credit);
}
if (halfSnap.upper.pct !== Math.round((2.5 / total) * 100)) fail("J-H upper pct " + halfSnap.upper.pct);

const six = loadApp("", "2026-10-16T11:00:00Z");
const sixMap = {};
["2027-01-01", "2027-01-02", "2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"].forEach(function (key) {
  sixMap[key] = 3;
  sixMap["upper:" + key] = 1;
});
six.loadTickMap(sixMap);
const sixSnap = six.hubSnapshot();
if (sixSnap.upper.credit !== 3 || sixSnap.full.credit !== 6) fail("J-H six days " + sixSnap.upper.credit + "/" + sixSnap.full.credit);
if (sixSnap.upper.pct !== Math.round((3 / total) * 100)) fail("J-H six pct " + sixSnap.upper.pct);

const one = loadApp("", "2026-10-16T11:00:00Z");
one.loadTickMap({ "upper:2027-01-01": 1 });
const oneSnap = one.hubSnapshot();
if (oneSnap.upper.credit !== 0.5) fail("single day credit " + oneSnap.upper.credit);

const march = loadApp("", "2026-10-16T11:00:00Z");
march.loadTickMap({ "2027-03-02": 3, "upper:2027-03-02": 3 });
if (march.hubSnapshot().focus !== "2027-01-01") fail("J-1J focus moved");

const marchView = loadApp("?date=2027-03-10", "2026-10-16T11:00:00Z");
marchView.loadTickMap(weekMap("2027-01-01", "2027-01-07", 3));
const s2 = marchView.hubSnapshot();
if (s2.focus !== "2027-03-10") fail("S2 focus " + s2.focus);
if (s2.full.pct !== expectPct || s2.full.credit !== 6) fail("S2 year pct changed " + s2.full.pct);

function expectTick(arch, dateKey, want, label) {
  if (arch.canTickDate(dateKey) !== want) fail(label + " " + dateKey + " " + arch.canTickDate(dateKey));
}
[["2026-10-16T11:00:00Z", "?date=2026-10-16", "2026-10-16"], ["2027-03-05T11:00:00Z", "?date=2027-03-05", "2027-03-05"], ["2028-01-02T11:00:00Z", "?date=2028-01-02", "2028-01-02"]].forEach(function (row) {
  const open = loadApp(row[1], row[0]);
  expectTick(open, row[2], true, "T4 open");
  expectTick(open, "2027-06-01", true, "T4 open later");
  open.setFutureLock(true);
  expectTick(open, row[2], true, "T4 locked today");
  const next = row[2] === "2026-10-16" ? "2026-10-17" : (row[2] === "2027-03-05" ? "2027-03-06" : "2028-01-03");
  expectTick(open, next, false, "T4 locked tomorrow");
  open.setFutureLock(false);
});
const after = loadApp("", "2028-02-01T11:00:00Z");
if (after.hubSnapshot().focus !== "2027-12-31") fail("after 2027 focus");

function bootFood(search) {
  const store = {};
  const ctx = {
    localStorage: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem: function (key, value) { store[key] = String(value); }
    },
    document: {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      body: null
    },
    location: { search: search || "" },
    Date: mockDate("2026-10-16T11:00:00Z"),
    console: { log: function () {}, error: function () {} }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["data/nutrition/shop.js", "data/backup/845c93a/meals.js", "data/backup/845c93a/extractions.js", "data/nutrition/schedule.js", "data/backup/845c93a/pack001.js", "food.js"].forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  });
  return ctx.NexusFood;
}

const foodApi = bootFood("");
const ft = foodApi.testing;
if (ft.today() !== "2027-01-01") fail("food focus " + ft.today());
const view = foodApi.hubView("food", "2027-01-01");
if (!view || view.heading.indexOf("Fri 1 Jan") === -1 || view.empty !== true || view.lock !== "Draft") {
  fail("J-1J hub view " + JSON.stringify(view && { heading: view.heading, empty: view.empty, lock: view.lock }));
}
const egg = ft.commit({
  title: "Egg toast",
  types: ["lunch"],
  ingredients: [{ name: "egg", qty: 1, unit: "", multiple: 1, skuId: "", brazilNuts: 0 }],
  method: [{ verb: "Toast", detail: "the bread" }]
});
if (!egg.error) fail("F2 egg saved");
const meal = ft.commit({
  title: "Quiet plate",
  types: ["lunch", "evening"],
  fits: ["lunch", "evening"],
  ingredients: [{ name: "Rice", qty: 1, unit: "", multiple: 1, skuId: "", brazilNuts: 0 }],
  method: [{ verb: "Cook", detail: "the rice" }]
});
if (meal.error) fail("F1 card " + meal.error);
ft.door("food");
const slot = ft.nextSlot(meal.id);
if (!slot || slot.date !== "2027-01-01" || slot.slot !== "lunch") fail("F1 slot " + JSON.stringify(slot));
ft.setSlot("2027-01", "2027-01-01", "lunch", meal.id);
const placed = foodApi.hubView("food", "2027-01-01");
if (placed.empty || placed.rows.join(" | ").indexOf("Quiet plate") === -1) fail("F1 hub " + placed.rows.join(" | "));
ft.autoOrganise("2027-01");
ft.dates("2027-01").forEach(function (day) {
  ft.setSlot("2027-01", day.date, "morning", "cherry-banana-cream");
});
const foodLock = ft.lock("food", "2027-01");
if (foodLock.ok !== true || ft.lockOf("food", "2027-01").status !== "locked") {
  fail("F3 food lock " + JSON.stringify(foodLock));
}
const smoothLock = ft.lock("smoothies", "2027-01");
if (smoothLock.ok === true || ft.lockOf("smoothies", "2027-01").status === "locked") {
  fail("F3 smoothies locked with a missing nuts day");
}
const foodHub = foodApi.hubView("food", "2027-01-01");
const smoothHub = foodApi.hubView("smoothies", "2027-01-01");
if (foodHub.lock !== "Locked" || smoothHub.lock !== "Draft") {
  fail("F3 hub locks " + foodHub.lock + " / " + smoothHub.lock);
}

if (fails.length) {
  process.exit(1);
}
console.log("OK v49 spec", "days", total, "pct", expectPct);
