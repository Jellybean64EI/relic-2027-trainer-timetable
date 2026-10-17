#!/usr/bin/env node
/* v50a: hub week view, display-only stripBrands, F-P2 and F-P3. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { spawnSync } = require("child_process");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }
function assert(cond, msg) { if (!cond) fail(msg); }

const html = fs.readFileSync("index.html", "utf8");
const hub = html.slice(html.indexOf('id="hub-root"'), html.indexOf("</section>", html.indexOf('id="hub-root"')));
assert((hub.match(/<button/g) || []).length === 6, "H2 button count");
assert((hub.match(/role="tab"/g) || []).length === 2, "H2 tabs");
assert((hub.match(/class="hub-week"/g) || []).length === 4, "H2 weeks");
assert((hub.match(/tabindex=/g) || []).length === 2, "H2 tabindex");
assert(hub.indexOf("<a ") === -1, "H2 links");
assert(hub.indexOf("<svg") === -1, "H4 svg");
assert(hub.indexOf(' src="assets/hub/') === -1, "H4 eager src");
assert((hub.match(/loading="lazy" decoding="async" fetchpriority="low"/g) || []).length === 2, "H4 lazy");

["assets/hub/upper-face.webp", "assets/hub/full-body.webp"].forEach(function (file) {
  const buf = fs.readFileSync(file);
  assert(buf.length <= 15360, "P1 size " + file);
  assert(buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP", "P1 webp " + file);
});

const stripSrc = fs.readFileSync("food.js", "utf8");
const stripStart = stripSrc.indexOf("  var BRANDS = [");
const stripEnd = stripSrc.indexOf("  function ingredientLine");
fs.writeFileSync("/tmp/strip-ship.js", stripSrc.slice(stripStart, stripEnd) + "\nmodule.exports = { stripBrands: stripBrands };\n");
const shipped = require("/tmp/strip-ship.js");
const vectorSrc = fs.readFileSync("v50/guard/stripBrands.ref.js", "utf8").replace("if (typeof module", "if (false && typeof module");
const VECTORS = vm.runInNewContext(vectorSrc + "\nVECTORS;", { module: { exports: {} } });
VECTORS.forEach(function (row) {
  const got = shipped.stripBrands(row[0]);
  if (got !== row[1]) fail("vector " + JSON.stringify(row[0]) + " -> " + JSON.stringify(got));
});
const watch = spawnSync(process.execPath, ["v50/guard/brandWatch.ref.js", "--after-strip", "/tmp/strip-ship.js"], { encoding: "utf8" });
if (watch.status !== 0) fail("B2 brand watch\n" + watch.stdout + watch.stderr);

const forbidden = ["scrubText", "plainName", "cleanTitle", "scrubRecipe", "scrubStore", "normaliseFits", "read", "save", "mergeFood"];
forbidden.forEach(function (name) {
  const at = stripSrc.indexOf("function " + name + "(");
  const open = stripSrc.indexOf("{", at);
  let depth = 0;
  let body = "";
  for (let i = open; i < stripSrc.length; i++) {
    if (stripSrc[i] === "{") depth += 1;
    else if (stripSrc[i] === "}") {
      depth -= 1;
      if (!depth) { body = stripSrc.slice(at, i); break; }
    }
  }
  if (body.indexOf("stripBrands(") !== -1) fail("stripBrands inside " + name);
});

function bootFood(file, seed, iso) {
  const mem = Object.assign({}, seed || {});
  const Real = Date;
  function MockDate() {
    if (arguments.length) return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
    return new Real(iso || "2026-10-17T11:00:00Z");
  }
  MockDate.prototype = Real.prototype;
  MockDate.UTC = Real.UTC;
  MockDate.parse = Real.parse;
  MockDate.now = function () { return new Real(iso || "2026-10-17T11:00:00Z").getTime(); };
  const ctx = {
    localStorage: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
      setItem: function (key, value) { mem[key] = String(value); },
      removeItem: function (key) { delete mem[key]; }
    },
    document: {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { addEventListener: function () {} }; },
      body: null
    },
    location: { search: "" },
    Date: MockDate,
    console: { log: function () {}, error: function () {} },
    addEventListener: function () {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["data/nutrition/shop.js", "data/nutrition/meals.js", "data/nutrition/extractions.js", "data/nutrition/schedule.js", "data/food/pack001.js", file].forEach(function (src) {
    vm.runInContext(fs.readFileSync(src, "utf8"), ctx, { filename: src });
  });
  return { ctx: ctx, mem: mem, api: ctx.NexusFood };
}

function foodKeys(mem) {
  const out = {};
  Object.keys(mem).sort().forEach(function (key) {
    if (key.indexOf("nexus_food") !== 0) return;
    try {
      const value = JSON.parse(mem[key]);
      if (value && typeof value === "object") delete value.updatedAt;
      out[key] = JSON.stringify(value);
    } catch (err) {
      out[key] = mem[key];
    }
  });
  return out;
}

function sameKeys(a, b, label) {
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
  keys.forEach(function (key) {
    if (a[key] !== b[key]) fail(label + " " + key);
  });
}

const v49 = "/tmp/food-v49.js";
const shown = spawnSync("git", ["show", "6e530f6:food.js"], { encoding: "utf8" });
if (shown.status !== 0) fail("git show v49 food.js");
else fs.writeFileSync(v49, shown.stdout);

const brandRecipe = {
  id: "brand-card",
  title: "TtD Beef Burger & Brioche",
  tip: "Cathedral City stands in, Flora Buttery spread and Waitrose peas. Sainsbury's chicken.",
  ingredients: [{ name: "Sainsbury's chicken", qty: 1 }],
  method: [{ verb: "Cook", detail: "the Waitrose peas" }],
  fits: ["lunch", "evening"],
  types: ["lunch", "evening"],
  kind: "meal"
};
function store(scrubbed, extra) {
  return {
    nexus_food_v1: JSON.stringify(Object.assign({
      schema: 1,
      scrubbed: scrubbed,
      recipes: { "brand-card": JSON.parse(JSON.stringify(brandRecipe)) },
      months: {},
      templates: {},
      undo: [],
      view: { month: "2027-01" },
      rev: 3
    }, extra || {}))
  };
}
[["empty", null], ["scrub39", store(39)], ["scrub41", store(41)], ["scrub40", store(40, { recipes: { bare: { id: "bare", title: "Rice plate", ingredients: [], method: [] } } })], ["year2026", store(41, { months: { "2026-11": { status: "draft", days: {}, slots: {}, ticks: {} } } })], ["toast", store(41, { toast: { text: "saved toast" } })]].forEach(function (row) {
  const seed = row[1] ? JSON.parse(JSON.stringify(row[1])) : null;
  const oldBoot = bootFood(v49, seed ? JSON.parse(JSON.stringify(seed)) : null);
  const newBoot = bootFood("food.js", seed ? JSON.parse(JSON.stringify(seed)) : null);
  oldBoot.api.testing.read();
  newBoot.api.testing.read();
  sameKeys(foodKeys(oldBoot.mem), foodKeys(newBoot.mem), "F-P2 " + row[0]);
});

const branded = bootFood("food.js", store(41));
branded.api.testing.read();
const kept = JSON.parse(branded.mem.nexus_food_v1).recipes["brand-card"];
assert(kept.title === "TtD Beef Burger & Brioche", "F-P3 stored title");
assert(/Sainsbury's|Cathedral City|Flora Buttery spread|Waitrose|TtD/.test(JSON.stringify(kept)), "F-P3 brands remain stored");
const afterBoot = foodKeys(branded.mem);
for (let i = 0; i < 50; i++) branded.api.weekView("2027-01-01", (i % 4) + 1);
sameKeys(afterBoot, foodKeys(branded.mem), "F-P3 weekView");

const live = bootFood("food.js", null, "2026-10-17T11:00:00Z");
const api = live.api;
const t = api.testing;
t.read();
const w1 = api.weekView("2027-01-01", 0);
assert(w1.block === 1 && w1.week === 1 && w1.days.length === 7, "F-W1 block");
assert(w1.label === "FRI 1 – THU 7 JAN 2027", "F-W1 label " + w1.label);
assert(w1.aria === "Week 1, 1 to 7 January", "F-W1 aria");
assert(w1.days[0].date === "2027-01-01" && w1.days[6].date === "2027-01-07", "F-W1 dates");
assert(api.weekView("2027-01-01", 2).label === "FRI 8 – THU 14 JAN 2027", "F-W2 week 2");
assert(api.weekView("2027-01-01", 3).label === "FRI 15 – THU 21 JAN 2027", "F-W2 week 3");
assert(api.weekView("2027-01-01", 4).label === "FRI 22 – THU 28 JAN 2027", "F-W2 week 4");
const mar = api.weekView("2027-03-10", 0);
assert(mar.block === 3 && mar.week === 2 && mar.label === "FRI 5 – THU 11 MAR 2027", "F-W3 march " + mar.label);
const cross = api.weekView("2027-01-30", 0);
assert(cross.block === 2 && cross.week === 1 && cross.label === "FRI 29 JAN – THU 4 FEB 2027", "F-W3 cross " + cross.label);
assert(cross.aria === "Week 1, 29 January to 4 February", "F-W9 cross aria");
const end = api.weekView("2027-12-31", 0);
assert(end.block === 14 && end.weeksInBlock === 1 && end.days.length === 1 && end.aria === "Week 1, 31 December", "F-W3 block 14");
[1, 2, 3, 4].forEach(function (n) {
  const row = api.weekView("2027-01-30", n);
  assert(/^Week [1-4], \d{1,2}( [A-Z][a-z]+)?( to \d{1,2} [A-Z][a-z]+)?$/.test(row.aria), "F-W9 " + row.aria);
});

const mealId = "turkey-mince-rice-skillet";
const s1 = "berry-banana-brazil";
const s2 = "morning-cell-shatter";
const s0 = "cherry-banana-cream";
function putDay(date, day) {
  const store = JSON.parse(live.mem.nexus_food_v1);
  const key = date.slice(0, 7);
  store.months[key] = store.months[key] || { status: "draft", days: {}, slots: { breakfast: true, lunch: true, dinner: true, smoothie: true }, ticks: {} };
  store.months[key].days = store.months[key].days || {};
  store.months[key].days[date] = Object.assign({ breakfast: "", morning: "", lunch: "", evening: "", why: {}, brazilExtra: 2 }, day);
  live.mem.nexus_food_v1 = JSON.stringify(store);
  t.reset();
}
putDay("2027-01-01", {
  breakfast: mealId,
  lunch: "",
  evening: "",
  morning: "",
  smoothies: [{ id: s1, at: "breakfast" }, { id: s2, at: "breakfast" }, { id: s0, at: "dinner" }]
});
putDay("2027-01-02", { breakfast: "", lunch: mealId, evening: mealId, morning: "" });
putDay("2027-01-03", { breakfast: "", lunch: "", evening: "", morning: "" });
const seeded = api.weekView("2027-01-01", 1);
const fri = seeded.days[0];
const sat = seeded.days[1];
const sun = seeded.days[2];
assert(fri.meals.breakfast && !fri.meals.lunch && !fri.meals.dinner, "F-W4 fri meals");
assert(fri.smoothies.length === 3 && fri.smoothies[0].at === "breakfast" && fri.smoothies[2].at === "dinner", "F-W4 fri smoothies");
assert(!sat.smoothies.length && sat.meals.lunch && sat.meals.dinner && !sat.meals.breakfast, "F-W4 sat");
assert(!sun.meals.breakfast && !sun.meals.lunch && !sun.meals.dinner && !sun.smoothies.length, "F-W4 sun");
putDay("2027-01-04", { breakfast: s1, morning: s2, lunch: "", evening: "" });
const mon = api.weekView("2027-01-01", 1).days[3];
assert(mon.meals.breakfast === "" && mon.smoothies.length === 2 && mon.smoothies[0].title && mon.smoothies[1].title, "A7 monday " + JSON.stringify(mon.smoothies));
const titles = mon.smoothies.map(function (row) { return row.title; });
assert(titles[0].indexOf("Morning") !== -1 || titles[0].length > 0, "A7 order");
const storeNow = t.recipes();
assert(mon.smoothies[0].title === shipped.stripBrands(storeNow[s2].title), "A7 first is morning card");
assert(mon.smoothies[1].title === shipped.stripBrands(storeNow[s1].title), "A7 second is breakfast card");
putDay("2027-01-05", {
  breakfast: "",
  evening: "mango-banana-nut",
  smoothies: [{ id: s1, at: "breakfast" }, { id: s2, at: "dinner" }, { id: s0, at: "breakfast" }]
});
const tue = api.weekView("2027-01-01", 1).days[4];
assert(tue.smoothies.length === 3 && tue.more === 1 && tue.meals.dinner === "", "A7 tuesday " + tue.more + " " + tue.meals.dinner);
putDay("2027-01-06", { breakfast: "", lunch: "", evening: s1, morning: "" });
const wed = api.weekView("2027-01-01", 1).days[5];
assert(wed.meals.dinner === "" && wed.smoothies.length === 1 && wed.smoothies[0].at === "dinner", "A7 wednesday");

live.mem.nexus_food_lock_food_v1 = JSON.stringify({ "2027-01": { status: "locked", lockedAt: "2027-01-01T00:00:00.000Z" } });
t.reset();
const locked = api.weekView("2027-01-30", 1);
assert(locked.days[0].locks.food === "Locked" && locked.days[3].locks.food === "Draft", "F-W6 day locks");
assert(locked.months.length === 2 && locked.months[0].food === "Locked" && locked.months[1].food === "Draft", "F-W6 months");
const feb = api.weekView("2027-01-30", 4);
assert(feb.months.length === 1 && feb.months[0].month === "2027-02" && feb.months[0].food === "Draft", "F-W6 week 4");

const burger = t.recipes()["plate-ttd-burger-brioche"];
assert(shipped.stripBrands(burger.title) === "Beef Burger & Brioche", "B2 burger");
const crisp = t.recipes()["crispy-potato-snack"];
const step = shipped.stripBrands(((crisp.method[0].verb || "") + " " + (crisp.method[0].detail || "")).trim());
assert(step === "Rinse 400 g diced Maris Piper Potatoes and place them in a microwave-safe bowl.", "B2 potato " + step);
const pack = fs.readFileSync("data/food/pack001.js", "utf8");
const tipSrc = pack.match(/Cathedral City stands in for mozzarella[^"]+/)[0];
const tip = shipped.stripBrands(tipSrc);
assert(tip.indexOf("Cheddar stands in for mozzarella, buttery spread for butter") === 0, "B2 garlic " + tip);

if (fails.length) {
  console.error(fails.length + " failed");
  process.exit(1);
}
console.log("OK v50a", VECTORS.length, "vectors");
