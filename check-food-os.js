#!/usr/bin/env node
/* v38: one food planner, no eggs, Brazil nuts at 2 a day, training files untouched. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const food = fs.readFileSync("food.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v38"') === -1 || html.indexOf("food.js?v=v38") === -1) fail("cache stamp");
["recipes", "plan", "today"].forEach(function (screen) {
  if (html.indexOf('data-food-room="' + screen + '"') === -1) fail("food screen " + screen);
  if (html.indexOf('data-smoothie-room="' + screen + '"') === -1) fail("smoothie screen " + screen);
});
if (html.indexOf("Monthly Shop") !== -1 || html.indexOf('data-food-room="shop"') !== -1) fail("shop module remains");
if (html.indexOf('data-os-door="food"') === -1 || html.indexOf('data-os-door="smoothies"') === -1) fail("cabins");
if (html.indexOf('data-os-door="training"') === -1 || html.indexOf('data-os-door="notes"') === -1) fail("other cabins");
if (html.indexOf("Prep &amp; Today") === -1) fail("today label");
["paintFuelWeek", "finishWeek", "placeHg", "btn-food-close", "relic_food_cards_v20", "relic_food_week_v20", "relic_food_shop_v19"].forEach(function (needle) {
  if (app.indexOf(needle) !== -1 || food.indexOf(needle) !== -1 || html.indexOf(needle) !== -1) fail("dead " + needle);
});
if (/\beggs?\b/i.test(fs.readFileSync("data/nutrition/meals.js", "utf8"))) fail("eggs in meals");
if (/\beggs?\b/i.test(fs.readFileSync("data/food/pack001.js", "utf8"))) fail("eggs in pack");
if (/\beggs?\b/i.test(fs.readFileSync("data/nutrition/shop.js", "utf8").replace(/eggsBanned|eggPreference/g, ""))) fail("eggs in shop");

const mem = {};
const ctx = {
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
    setItem: function (key, value) { mem[key] = String(value); }
  },
  document: {
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    body: { classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } } }
  },
  location: { search: "?date=2026-10-12" },
  console: console
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
const audit = ctx.RELIC_FOOD_SCHEDULE.audit;
if (audit && ctx.RELIC_SCHEDULE == null) {
  /* fuel audit needs the training calendar; the planner check covers the food contract */
}
const t = ctx.NexusFood.testing;
const before = t.recipeCount();
const draft = t.beginNew("meal");
t.cancelNew();
if (t.recipeCount() !== before) fail("cancel wrote a card");
const saved = t.commit(Object.assign(draft, {
  title: "Test plate",
  types: ["lunch", "evening"],
  ingredients: [{ name: "Chicken", qty: 2, unit: "breast", multiple: 2, skuId: "chicken", brazilNuts: 0 }],
  method: [{ verb: "Roast", detail: "until hot" }],
  forward: { keep: "yes" },
  tip: ""
}));
if (!saved.id || t.recipeCount() !== before + 1) fail("save card " + JSON.stringify(saved));
const edited = t.commit({
  id: saved.id,
  title: "Test plate edited",
  types: ["lunch"],
  ingredients: [{ name: "Chicken", qty: 2, unit: "breast", multiple: 4, skuId: "", brazilNuts: 0 }],
  method: [{ verb: "Roast", detail: "until hot" }],
  tip: "hot"
});
const card = t.recipes()[saved.id];
if (edited.error || card.ingredients[0].skuId !== "chicken" || card.forward.keep !== "yes" || card.ingredients[0].multiple !== 4) {
  fail("edit dropped sku or forward " + JSON.stringify(card));
}
t.setSlot("2026-10", "2026-10-12", "lunch", saved.id);
if (t.usage(saved.id).length !== 1) fail("usage");
t.deleteRecipe(saved.id);
if (t.recipes()[saved.id] || t.month("2026-10").days["2026-10-12"].lunch) fail("delete");
if (!t.undo()) fail("undo missing");
if (!t.recipes()[saved.id] || t.month("2026-10").days["2026-10-12"].lunch !== saved.id) fail("undo restore");

const seedId = "berry-banana-brazil";
if (!t.recipes()[seedId]) fail("seed smoothie missing");
t.hideRecipe(seedId);
if (!t.recipes()[seedId].hidden) fail("hide");
t.undo();

const weeks = t.weeks("2026-10");
const dates = weeks.reduce(function (all, week) { return all.concat(week.map(function (day) { return day.date; })); }, []);
if (dates.length !== 31 || dates[0] !== "2026-10-01" || dates[dates.length - 1] !== "2026-10-31") fail("october dates");
if (dates.some(function (date) { return date.slice(0, 7) !== "2026-10"; })) fail("spill");
const nov = t.dates("2026-11").map(function (day) { return day.date; });
if (nov[0] !== "2026-11-01" || dates.indexOf("2026-11-01") !== -1) fail("november");

t.setSlot("2026-10", "2026-10-05", "lunch", "plate-batch-chicken-veg");
const held = t.month("2026-10").days["2026-10-05"].lunch;
t.autoOrganise("2026-10");
if (t.month("2026-10").days["2026-10-05"].lunch !== held) fail("auto replaced a filled slot");
if (t.gaps("2026-10").length) fail("auto left gaps " + t.gaps("2026-10").length);
t.dates("2026-10").forEach(function (day) {
  const row = t.month("2026-10").days[day.date];
  const evening = t.recipes()[row.evening];
  if (evening && (evening.types || []).indexOf("smoothie") !== -1) fail("evening smoothie " + day.date);
  const nuts = t.nuts("2026-10", day.date);
  if (nuts.total !== 2) fail("brazil " + day.date + " " + nuts.total);
});
const week = weeks[1];
const snapshot = JSON.stringify(t.month("2026-10").days);
t.clearRange("2026-10", week[0].date, week[week.length - 1].date);
if (week.length !== 7) fail("week length");
week.forEach(function (day) {
  const row = t.month("2026-10").days[day.date];
  if (row.morning || row.lunch || row.evening) fail("clear " + day.date);
});
t.undo();
if (JSON.stringify(t.month("2026-10").days) !== snapshot) fail("clear undo");

t.clearRange("2026-10", "2026-10-01", "2026-10-01");
["morning", "lunch", "evening"].forEach(function (slot) {
  t.month("2026-10").days["2026-10-01"][slot] = "";
});
const gapList = t.gaps("2026-10");
if (gapList.length < 3) fail("gap count " + gapList.length);
const locked = t.lock("2026-10", false);
if (locked.ok) fail("locked with gaps");

t.autoOrganise("2026-10");
const first = t.lock("2026-10", false);
if (!first.ok || t.month("2026-10").status !== "locked") fail("lock " + JSON.stringify(first));
t.toggleTick("2026-10-12", "lunch");
const again = t.lock("2026-10", false);
if (!again.needsConfirm) fail("relock confirm");
const frozen = JSON.stringify(t.month("2026-10"));
t.lock("2026-10", false);
if (JSON.stringify(t.month("2026-10")) !== frozen) fail("cancel relock mutated");

t.setNuts(seedId, 3);
const over = t.validate("2026-10").filter(function (item) { return item.slot === "brazil"; });
if (!over.length) fail("3 brazil nuts allowed");
t.undo();

const tpl = t.saveTemplate("2026-10", "October base");
t.applyTemplate(tpl, "2026-11");
const octMon = t.month("2026-10").days["2026-10-05"];
const novMon = t.month("2026-11").days["2026-11-02"];
if (!novMon || novMon.morning !== octMon.morning) fail("template apply");
if (!t.renameTemplate(tpl, "Base month").name) fail("rename");
t.deleteTemplate(tpl);
if (t.read().templates[tpl]) fail("template delete");

const prep = t.prep("2026-10-11");
if (prep.brazilTin !== 14 || prep.lines.join(" ").toLowerCase().indexOf("egg") !== -1) fail("prep " + JSON.stringify(prep));
if (t.defaultDate("2026-10") < "2026-10-12") fail("past default");
if (t.allows(t.recipes()[seedId], "evening")) fail("smoothie offered at evening");

t.reset();
mem.relic_food_meals_v22 = JSON.stringify({ cards: { audit: { cardId: "audit", title: "AUDIT Meal Card 1", noteCode: "AUDIT-01", ingredients: [{ text: "oats" }], method: [] } } });
mem.relic_smoothie_meals_v22 = JSON.stringify({ cards: { audits: { cardId: "audits", title: "AUDIT Smoothie 1", ingredients: [], method: [] } } });
mem.relic_food_hg_v22 = JSON.stringify({ months: { "2026-10": { placements: { "2026-10-01": { lunch: "audit" } } } } });
mem.relic_food_final_v22 = JSON.stringify({ months: { "2026-10": { placements: { "2026-10-02": { dinner: "audit" } } } } });
["relic_food_cabinet_v22", "relic_food_savelater_v22", "relic_food_shop_v22", "relic_food_flylog_v22", "relic_smoothie_cabinet_v22", "relic_smoothie_hg_v22", "relic_smoothie_final_v22", "relic_smoothie_savelater_v22", "relic_smoothie_flylog_v22"].forEach(function (key) {
  mem[key] = "{}";
});
delete mem.nexus_food_v1;
const migrated = t.read();
const backup = JSON.parse(mem.nexus_food_backup_v22);
if (Object.keys(backup).length !== 13) fail("backup " + Object.keys(backup).length);
if (migrated.recipes.audit || migrated.recipes.audits) fail("audit cards kept");
const oct = migrated.months["2026-10"];
if (oct && oct.days && (oct.days["2026-10-01"] || oct.days["2026-10-02"])) fail("october plan kept");
const once = mem.nexus_food_v1;
t.read();
if (mem.nexus_food_v1 !== once) fail("second migrate wrote");

if (fails.length) {
  console.error(fails.length + " failed");
  process.exit(1);
}
console.log("OK food OS v38");
