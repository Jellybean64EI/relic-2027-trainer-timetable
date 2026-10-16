#!/usr/bin/env node
/* v48: Hub door, separate Food and Smoothies locks, meal slots stay on their cabin. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }

const html = fs.readFileSync("index.html", "utf8");
const food = fs.readFileSync("food.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
if (html.indexOf('id="hub-root"') === -1 || html.indexOf('aria-label="Nexus"') === -1) fail("hub screen");
if (html.indexOf(">exus<") === -1) fail("exus wordmark");
if (html.indexOf('data-hub-mode="upper"') === -1 || html.indexOf('data-hub-mode="full"') === -1) fail("hub mode cards");
if (html.indexOf(">Upper Body<") === -1 || html.indexOf(">Full Body<") === -1) fail("hub card titles");
if (app.indexOf('state.osDoor === "training"') === -1) fail("training whitelist");
if (app.indexOf('osDoor !== "food" && state.osDoor !== "smoothies"') !== -1) fail("training still uses exclusion");
if (food.indexOf("nexus_food_lock_food_v1") === -1 || food.indexOf("nexus_food_lock_smoothies_v1") === -1) fail("lock keys");
if (food.indexOf("target.status = mergeValue") !== -1) fail("status is still merged");

function boot(mem, setItem) {
  const store = mem || {};
  const errors = [];
  const ctx = {
    localStorage: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem: setItem || function (key, value) { store[key] = String(value); }
    },
    document: {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      body: null
    },
    location: { search: "" },
    console: {
      log: function () {},
      error: function () { errors.push(Array.prototype.join.call(arguments, " ")); }
    },
    errors: errors,
    mem: store
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  [
    "data/nutrition/shop.js",
    "data/nutrition/meals.js",
    "data/nutrition/extractions.js",
    "data/nutrition/schedule.js",
    "data/food/pack001.js",
    "food.js"
  ].forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  });
  return ctx;
}

function fillFood(t, key) {
  t.autoOrganise(key);
}

function placeTwoNuts(t, key) {
  t.dates(key).forEach(function (day) {
    t.setSlot(key, day.date, "morning", "berry-banana-brazil");
  });
}

function slotSig(month) {
  const days = month.days || {};
  return JSON.stringify(Object.keys(days).sort().map(function (date) {
    const day = days[date];
    return date + "=" + [day.breakfast || "", day.morning || "", day.lunch || "", day.evening || ""].join(",");
  }));
}

const ctx = boot();
const t = ctx.NexusFood.testing;
if (t.enabledSlots("2027-02", "food").indexOf("Smoothie") !== -1) fail("food slots include smoothie");
if (t.enabledSlots("2027-02", "smoothies").join("|") !== "Smoothie") fail("smoothie slots " + t.enabledSlots("2027-02", "smoothies").join(","));
t.gaps("2027-02", "food");
const daySnap = slotSig(t.month("2027-02"));
t.door("smoothies");
t.gaps("2027-02", "smoothies");
t.door("food");
if (slotSig(t.month("2027-02")) !== daySnap) fail("door switch wrote day data");

fillFood(t, "2027-10");
placeTwoNuts(t, "2027-10");
const foodOnly = t.lock("food", "2027-10");
if (!foodOnly.ok || t.lockOf("food", "2027-10").status !== "locked") fail("L1 food lock " + JSON.stringify(foodOnly));
if (t.lockOf("smoothies", "2027-10").status !== "draft") fail("L1 smoothies locked");
if (t.month("2027-10").status === "locked") fail("L1 wrote legacy status");
const morningBefore = t.month("2027-10").days["2027-10-04"].morning;
t.setSlot("2027-10", "2027-10-04", "morning", morningBefore);
if (t.month("2027-10").days["2027-10-04"].morning !== morningBefore) fail("L1 smoothie edit blocked");
const octTpl = t.saveTemplate("2027-10", "October lock");
t.applyTemplate(octTpl, "2027-11", true);
const smoothBeforeApply = ctx.mem.nexus_food_lock_smoothies_v1;
t.lock("food", "2027-11");
if (t.lockOf("food", "2027-11").status !== "locked") fail("L1 template lock missed food");
if (ctx.mem.nexus_food_lock_smoothies_v1 !== smoothBeforeApply) fail("L1 template lock wrote smoothies");

t.unlock("food", "2027-10");
const smoothLock = t.lock("smoothies", "2027-10");
if (!smoothLock.ok || t.lockOf("smoothies", "2027-10").status !== "locked") fail("L2 smoothies lock " + JSON.stringify(smoothLock));
if (t.lockOf("food", "2027-10").status === "locked") fail("L2 food stayed locked");
t.unlock("smoothies", "2027-10");

const legacy = boot();
const lt = legacy.NexusFood.testing;
lt.read();
const seeded = JSON.parse(legacy.mem.nexus_food_v1);
seeded.months["2027-06"] = {
  status: "locked",
  lockedAt: "2026-06-01T00:00:00.000Z",
  wasLocked: false,
  slots: { breakfast: false, lunch: true, dinner: true, smoothie: true },
  days: {},
  ticks: {},
  prepTicks: {}
};
legacy.mem.nexus_food_v1 = JSON.stringify(seeded);
delete legacy.mem.nexus_food_lock_split_v1;
delete legacy.mem.nexus_food_lock_food_v1;
delete legacy.mem.nexus_food_lock_smoothies_v1;
lt.reset();
lt.read();
if (lt.marker() !== "done") fail("L3 marker " + lt.marker());
if (lt.lockOf("food", "2027-06").status !== "locked" || lt.lockOf("smoothies", "2027-06").status !== "locked") fail("L3 copy");
if (JSON.parse(legacy.mem.nexus_food_v1).months["2027-06"].status !== "locked") fail("L3 dropped legacy status");
const foodRaw = legacy.mem.nexus_food_lock_food_v1;
const smoothRaw = legacy.mem.nexus_food_lock_smoothies_v1;
const markerRaw = legacy.mem.nexus_food_lock_split_v1;
lt.reset();
lt.read();
if (legacy.mem.nexus_food_lock_food_v1 !== foodRaw || legacy.mem.nexus_food_lock_smoothies_v1 !== smoothRaw || legacy.mem.nexus_food_lock_split_v1 !== markerRaw) {
  fail("L3 second load changed the keys");
}

fillFood(t, "2027-08");
placeTwoNuts(t, "2027-08");
if (!t.lock("food", "2027-08").ok) fail("L4 lock");
t.reset();
t.read();
if (t.lockOf("food", "2027-08").status !== "locked" || t.lockOf("smoothies", "2027-08").status !== "draft") fail("L4 reload");
t.unlock("food", "2027-08");
t.reset();
t.read();
if (t.lockOf("food", "2027-08").status !== "draft") fail("L4 unlock reload");

fillFood(t, "2027-03");
const foodGaps = t.lock("food", "2027-03");
const smoothGaps = t.lock("smoothies", "2027-03");
if (!foodGaps.ok) fail("L5 empty smoothie blocked food " + JSON.stringify(foodGaps));
if (smoothGaps.ok) fail("L5 empty smoothie locked smoothies");
if (!t.undo() || t.lockOf("food", "2027-03").status === "locked") fail("L5 undo kept the food lock");
if (t.lockOf("smoothies", "2027-03").status === "locked") fail("L5 undo locked smoothies");
placeTwoNuts(t, "2027-03");
t.dates("2027-03").forEach(function (day) {
  t.month("2027-03").days[day.date].lunch = "";
  t.month("2027-03").days[day.date].evening = "";
});
if (t.lock("smoothies", "2027-03").ok !== true) fail("L5 food gaps blocked smoothies");
if (t.lock("food", "2027-03").ok) fail("L5 food gaps still locked");

const quotaMem = {};
const quotaErrors = [];
const quota = boot(quotaMem, function (key, value) {
  if (String(key).indexOf("nexus_food_lock") === 0) throw new Error("quota");
  quotaMem[key] = String(value);
});
quota.console = { error: function () { quotaErrors.push("x"); } };
const qt = quota.NexusFood.testing;
qt.read();
const qStore = JSON.parse(quotaMem.nexus_food_v1);
qStore.months["2027-06"] = {
  status: "locked",
  lockedAt: "2026-06-01T00:00:00.000Z",
  wasLocked: false,
  slots: { breakfast: false, lunch: true, dinner: true, smoothie: true },
  days: {},
  ticks: {},
  prepTicks: {}
};
quotaMem.nexus_food_v1 = JSON.stringify(qStore);
delete quotaMem.nexus_food_lock_split_v1;
qt.reset();
qt.read();
if (qt.marker() === "done") fail("L6 marker was set");
if (!qt.legacyLock()) fail("L6 fallback off");
if (qt.lockOf("food", "2027-06").status !== "locked") fail("L6 fallback missed the lock");
if (quota.errors.length) fail("L6 console error");

fillFood(t, "2027-09");
const plain = t.commit({
  title: "Plain glass",
  types: ["smoothie"],
  ingredients: [{ name: "Banana", qty: 1, unit: "", multiple: 1, skuId: "", brazilNuts: 0 }],
  method: [{ verb: "Blend", detail: "until smooth" }]
});
if (plain.error) fail("L7 card " + plain.error);
t.dates("2027-09").forEach(function (day) {
  t.setSlot("2027-09", day.date, "morning", plain.id);
});
const nutProblems = t.validate("2027-09", "smoothies").filter(function (item) { return item.slot === "brazil"; });
const foodNuts = t.validate("2027-09", "food").filter(function (item) { return item.slot === "brazil"; });
if (!nutProblems.length) fail("L7 no-nut day did not block smoothies");
if (foodNuts.length) fail("L7 food saw brazil");
if (t.gaps("2027-09", "smoothies").length) fail("L7 smoothies still had gaps");
const foodNutLock = t.lock("food", "2027-09");
const smoothNutLock = t.lock("smoothies", "2027-09");
if (!foodNutLock.ok) fail("L7 food lock " + JSON.stringify(foodNutLock));
if (smoothNutLock.ok) fail("L7 smoothies locked with no brazil nuts");
if (food.indexOf(' problem"') === -1 && food.indexOf(" problems") === -1) fail("L7 button has no problem label");
if (t.validate("2027-10").filter(function (item) { return item.slot === "brazil" && item.reason.indexOf("(3") !== -1; }).length) {
  fail("L7 unscoped validate changed");
}
t.setNuts("berry-banana-brazil", 3);
if (!t.validate("2027-10").some(function (item) { return item.slot === "brazil"; })) fail("unscoped 3 nuts");
t.undo();

let threw = false;
try { t.lockKey("account"); } catch (err) { threw = true; }
if (!threw) fail("bad lock door did not throw");

const summary = ctx.NexusFood.todaySummary("food");
if (!summary || typeof summary.empty !== "boolean") fail("today summary");
const smoothSummary = ctx.NexusFood.todaySummary("smoothies");
if (!smoothSummary || typeof smoothSummary.prep !== "boolean") fail("smoothie summary");

if (fails.length) {
  console.error(fails.length + " failed");
  process.exit(1);
}
console.log("OK hub v48");
