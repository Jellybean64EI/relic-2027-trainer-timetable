#!/usr/bin/env node
/* v48: planner starts January 2027. Food and Smoothies locks are separate. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const food = fs.readFileSync("food.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v68"') === -1 || html.indexOf("food.js?v=v68") === -1) fail("cache stamp");
if (css.indexOf("#planner-sheet-host") === -1 || css.indexOf("safe-area-inset-bottom") === -1 || css.indexOf("100dvh") === -1) fail("sheet viewport");
if (/^\.planner-sheet \{[^}]*position:\s*sticky/m.test(css)) fail("sheet still sticky");
["recipes", "plan", "today"].forEach(function (screen) {
  if (html.indexOf('data-food-room="' + screen + '"') !== -1) fail("food screen " + screen);
  if (html.indexOf('data-smoothie-room="' + screen + '"') !== -1) fail("smoothie screen " + screen);
});
if (html.indexOf('id="deck-root-food"') === -1 || html.indexOf('id="deck-root-smoothie"') === -1) fail("deck rooms");
if (html.indexOf("Monthly Shop") !== -1 || html.indexOf('data-food-room="shop"') !== -1) fail("shop module remains");
if (html.indexOf('data-os-door="food"') === -1 || html.indexOf('data-os-door="smoothies"') === -1) fail("cabins");
if (html.indexOf('data-os-door="training"') === -1) fail("training cabin");
if (html.indexOf('data-os-door="notes"') !== -1 || html.indexOf('data-cabin="notes"') !== -1) fail("notes cabin remains");
if (html.indexOf('data-os-door="hub"') === -1 || html.indexOf('data-os-door="account"') === -1) fail("hub doors");
if (food.indexOf('cabin: "notes"') !== -1 || food.indexOf("notes:") !== -1) fail("notes banner");
if (html.indexOf(">Today<") !== -1 || html.indexOf("Prep &amp; Today") !== -1) fail("today label");
["paintFuelWeek", "finishWeek", "placeHg", "btn-food-close", "relic_food_cards_v20", "relic_food_week_v20", "relic_food_shop_v19"].forEach(function (needle) {
  if (app.indexOf(needle) !== -1 || food.indexOf(needle) !== -1 || html.indexOf(needle) !== -1) fail("dead " + needle);
});
if (/\beggs?\b/i.test(fs.readFileSync("data/backup/845c93a/meals.js", "utf8"))) fail("eggs in meals");
if (/\beggs?\b/i.test(fs.readFileSync("data/backup/845c93a/pack001.js", "utf8"))) fail("eggs in pack");
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
  "data/backup/845c93a/meals.js",
  "data/backup/845c93a/extractions.js",
  "data/nutrition/schedule.js",
  "data/backup/845c93a/pack001.js",
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
t.setSlot("2027-10", "2027-10-12", "lunch", saved.id);
if (t.usage(saved.id).length !== 1) fail("usage");
t.deleteRecipe(saved.id);
if (t.recipes()[saved.id] || t.month("2027-10").days["2027-10-12"].lunch) fail("delete");
if (!t.undo()) fail("undo missing");
if (!t.recipes()[saved.id] || t.month("2027-10").days["2027-10-12"].lunch !== saved.id) fail("undo restore");

const seedId = "berry-banana-brazil";
if (!t.recipes()[seedId]) fail("seed smoothie missing");
t.hideRecipe(seedId);
if (!t.recipes()[seedId].hidden) fail("hide");
t.undo();

const weeks = t.weeks("2027-10");
const dates = weeks.reduce(function (all, week) { return all.concat(week.map(function (day) { return day.date; })); }, []);
if (dates.length !== 31 || dates[0] !== "2027-10-01" || dates[dates.length - 1] !== "2027-10-31") fail("october dates");
if (dates.some(function (date) { return date.slice(0, 7) !== "2027-10"; })) fail("spill");
const nov = t.dates("2027-11").map(function (day) { return day.date; });
if (nov[0] !== "2027-11-01" || dates.indexOf("2027-11-01") !== -1) fail("november");

t.setSlot("2027-10", "2027-10-05", "lunch", "plate-batch-chicken-veg");
const held = t.month("2027-10").days["2027-10-05"].lunch;
t.autoOrganise("2027-10");
if (t.month("2027-10").days["2027-10-05"].lunch !== held) fail("auto replaced a filled slot");
t.dates("2027-10").forEach(function (day) {
  const row = t.month("2027-10").days[day.date];
  if (row.morning) fail("food auto filled smoothie " + day.date);
  if (!row.lunch || !row.evening) fail("food auto left a meal " + day.date);
  const evening = t.recipes()[row.evening];
  if (evening && (evening.types || []).indexOf("smoothie") !== -1) fail("evening smoothie " + day.date);
  const nuts = t.nuts("2027-10", day.date);
  if (nuts.total !== 0 && nuts.total !== 2) fail("brazil " + day.date + " " + nuts.total);
});
const week = weeks[1];
const snapshot = JSON.stringify(t.month("2027-10").days);
t.clearRange("2027-10", week[0].date, week[week.length - 1].date);
if (week.length !== 7) fail("week length");
week.forEach(function (day) {
  const row = t.month("2027-10").days[day.date];
  if (row.morning || row.lunch || row.evening) fail("clear " + day.date);
});
t.undo();
if (JSON.stringify(t.month("2027-10").days) !== snapshot) fail("clear undo");

t.clearRange("2027-10", "2027-10-01", "2027-10-01");
["morning", "lunch", "evening"].forEach(function (slot) {
  t.month("2027-10").days["2027-10-01"][slot] = "";
});
const gapList = t.gaps("2027-10");
if (gapList.length < 3) fail("gap count " + gapList.length);
const locked = t.lock("food", "2027-10");
if (locked.ok) fail("locked with gaps");

t.autoOrganise("2027-10");
const mealsBeforeSmoothie = t.dates("2027-10").map(function (day) {
  const row = t.month("2027-10").days[day.date];
  return row.breakfast + "|" + row.lunch + "|" + row.evening;
}).join(",");
t.autoOrganise("2027-10", "smoothies");
const mealsAfterSmoothie = t.dates("2027-10").map(function (day) {
  const row = t.month("2027-10").days[day.date];
  return row.breakfast + "|" + row.lunch + "|" + row.evening;
}).join(",");
if (mealsBeforeSmoothie !== mealsAfterSmoothie) fail("smoothie auto changed food slots");
t.dates("2027-10").forEach(function (day) {
  const card = t.recipes()[t.month("2027-10").days[day.date].morning];
  if (!card || card.fits.indexOf("smoothie") === -1) fail("smoothie auto left " + day.date);
});
if (!t.toast() || t.toast().text.indexOf("empty slots.") === -1 || t.toast().text.indexOf("cites") !== -1) fail("auto banner " + JSON.stringify(t.toast()));
const first = t.lock("food", "2027-10");
if (!first.ok || t.lockOf("food", "2027-10").status !== "locked") fail("lock " + JSON.stringify(first));
if (t.month("2027-10").status === "locked") fail("legacy month status was written");
if (t.lockOf("smoothies", "2027-10").status === "locked") fail("food lock wrote the smoothies key");
t.toggleTick("2027-10-12", "lunch");
const again = t.lock("food", "2027-10");
if (again.ok || !again.locked) fail("second lock " + JSON.stringify(again));
const frozen = JSON.stringify(t.month("2027-10"));
t.lock("food", "2027-10");
if (JSON.stringify(t.month("2027-10")) !== frozen) fail("second lock mutated");

t.setNuts(seedId, 3);
const over = t.validate("2027-10").filter(function (item) { return item.slot === "brazil"; });
if (!over.length) fail("3 brazil nuts allowed");
t.undo();

const tpl = t.saveTemplate("2027-10", "October base");
t.applyTemplate(tpl, "2027-11");
const octMon = t.month("2027-10").days["2027-10-05"];
const novMon = t.month("2027-11").days["2027-11-02"];
if (!novMon || novMon.morning !== octMon.morning) fail("template apply");
if (!t.renameTemplate(tpl, "Base month").name) fail("rename");
t.deleteTemplate(tpl);
if (t.read().templates[tpl]) fail("template delete");

const prep = t.prep("2027-10-11");
if (prep.brazilTin !== 14 || prep.lines.join(" ").toLowerCase().indexOf("egg") !== -1) fail("prep " + JSON.stringify(prep));
if (t.defaultDate("2027-10") !== "2027-10-01") fail("past default " + t.defaultDate("2027-10"));
if (t.allows(t.recipes()[seedId], "evening")) fail("smoothie offered at evening");

const months = t.futureMonths();
if (months[0] !== "2027-01" || months.indexOf("2027-02") === -1 || months.indexOf("2026-09") !== -1 || months.indexOf("2026-10") !== -1 || months.indexOf("2026-11") !== -1) fail("future months " + months.slice(0, 4));
if (t.clampMonth("2026-09") !== "2027-01" || t.clampMonth("2026-10") !== "2027-01" || t.clampMonth("2027-01") !== "2027-01") fail("clamp month");
if (t.duplicateTitles().length) fail("duplicate titles " + t.duplicateTitles().join(","));
const lunchIds = t.candidates("lunch");
if (lunchIds.length !== new Set(lunchIds).size) fail("picker ids repeat");
const lunchTitles = lunchIds.map(function (id) { return t.recipes()[id].title; });
if (lunchTitles.indexOf("Cheesy Potato Toast") !== lunchTitles.lastIndexOf("Cheesy Potato Toast")) fail("toast listed twice");
Object.keys(t.recipes()).forEach(function (id) {
  const issues = t.lint(id);
  if (issues.length) fail("seed text " + id + " " + issues.join(" "));
});
const eggDraft = t.beginNew("meal");
const eggSave = t.commit(Object.assign(eggDraft, { title: "Egg plate", ingredients: [{ name: "eggs", qty: 2 }], method: [] }));
if (!eggSave.error) fail("egg card saved");
t.cancelNew();
const nutDraft = t.beginNew("meal");
const nutSave = t.commit(Object.assign(nutDraft, { title: "Nut note", tip: "one Brazil nut a day", ingredients: [{ name: "Chicken" }], method: [] }));
if (!nutSave.error) fail("one brazil card saved");
t.cancelNew();
t.setSlot("2027-10", "2027-10-12", "lunch", "cheesy-potato-toast");
t.recipes()["cheesy-potato-toast"].tip = "1 Brazil nut maximum";
if (!t.validate("2027-10").some(function (item) { return item.slot === "text"; })) fail("validator ignored brazil text");
t.recipes()["cheesy-potato-toast"].tip = "Seal the mozzarella inside the round so it stays in the middle.";

t.setSlot("2027-12", "2027-12-01", "lunch", "cheesy-potato-toast");
const december = t.saveTemplate("2027-12", "December");
t.setSlot("2027-12", "2027-12-02", "lunch", "salmon-rice-plate");
const beforeApply = JSON.stringify(t.month("2027-12").days);
const ask = t.applyTemplate(december, "2027-12", false);
if (!ask.needsConfirm || JSON.stringify(t.month("2027-12").days) !== beforeApply) fail("apply confirm " + JSON.stringify(ask));
t.applyTemplate(december, "2027-12", true);
if (t.month("2027-12").days["2027-12-02"].lunch === "salmon-rice-plate") fail("confirmed apply kept the old lunch");
if (!t.undo() || t.month("2027-12").days["2027-12-02"].lunch !== "salmon-rice-plate") fail("apply undo");

const staleRev = t.rev();
const disk = JSON.parse(mem.nexus_food_v1);
disk.rev = staleRev + 2;
disk.months["2027-10"].days["2027-10-20"] = disk.months["2027-10"].days["2027-10-20"] || { breakfast: "", morning: "", lunch: "", evening: "", why: {}, brazilExtra: 2 };
disk.months["2027-10"].days["2027-10-20"].lunch = "salmon-rice-plate";
mem.nexus_food_v1 = JSON.stringify(disk);
const merged = t.setSlot("2027-10", "2027-10-21", "lunch", "turkey-mince-rice-skillet");
if (merged.stale) fail("merge refused a different slot");
if (t.month("2027-10").days["2027-10-20"].lunch !== "salmon-rice-plate") fail("lost other tab lunch");
if (t.month("2027-10").days["2027-10-21"].lunch !== "turkey-mince-rice-skillet") fail("lost this tab lunch");
if (t.syncNote().indexOf("Merged") === -1) fail("merge notice " + t.syncNote());
const clash = JSON.parse(mem.nexus_food_v1);
clash.rev = t.rev() + 3;
clash.months["2027-10"].days["2027-10-12"].evening = "salmon-rice-plate";
mem.nexus_food_v1 = JSON.stringify(clash);
const refused = t.setSlot("2027-10", "2027-10-12", "evening", "beef-stuffed-potato-boats");
if (!refused.stale || t.month("2027-10").days["2027-10-12"].evening !== "salmon-rice-plate") fail("stale write won " + JSON.stringify(refused));
if (t.syncNote().indexOf("This plan changed in another tab. Reload") === -1) fail("stale notice " + t.syncNote());

t.reset();
mem.relic_food_meals_v22 = JSON.stringify({ cards: {
  audit: { cardId: "audit", title: "AUDIT Meal Card 1", noteCode: "AUDIT-01", ingredients: [{ text: "oats" }], method: [] },
  "dup-boats": { cardId: "dup-boats", title: "Beef-Stuffed Potato Boats", ingredients: [{ text: "Beef" }], method: [] },
  cathedral: { cardId: "cathedral", title: "Cathedral City Mini Extra Mature with Cheesy Roasted Garlic Bread", tip: "Cook egg whites when eggs are in the pan. One Brazil nut a day only if that tin was purchased.", ingredients: [{ text: "Cheddar" }, { text: "eggs" }], method: [{ verb: "Cook", detail: "egg whites when eggs are in the pan." }] }
} });
mem.relic_smoothie_meals_v22 = JSON.stringify({ cards: {
  audits: { cardId: "audits", title: "AUDIT Smoothie 1", ingredients: [], method: [] },
  "berry-banana-brazil": { cardId: "berry-banana-brazil", title: "Berry Banana Brazil", tip: "FOOD_LIVE lock: one Brazil nut a day", ingredients: [{ text: "1 Brazil nut maximum", skuId: "brazil", qty: 1 }], method: [{ verb: "Eat", detail: "One Brazil nut maximum" }] }
} });
mem.relic_food_hg_v22 = JSON.stringify({ months: { "2026-10": { placements: { "2026-10-01": { lunch: "audit" } } } } });
mem.relic_food_final_v22 = JSON.stringify({ months: {
  "2026-10": { placements: { "2026-10-02": { dinner: "audit" } } },
  "2026-11": { placements: { "2026-11-02": { lunch: "dup-boats" } } },
  "2027-01": { placements: { "2027-01-04": { lunch: "dup-boats" } } }
} });
["relic_food_cabinet_v22", "relic_food_savelater_v22", "relic_food_shop_v22", "relic_food_flylog_v22", "relic_smoothie_cabinet_v22", "relic_smoothie_hg_v22", "relic_smoothie_final_v22", "relic_smoothie_savelater_v22", "relic_smoothie_flylog_v22"].forEach(function (key) {
  mem[key] = "{}";
});
delete mem.nexus_food_v1;
const migrated = t.read();
const backup = JSON.parse(mem.nexus_food_backup_v22);
if (Object.keys(backup).length !== 13) fail("backup " + Object.keys(backup).length);
if (migrated.recipes.audit || migrated.recipes.audits) fail("audit cards kept");
if (migrated.months["2026-10"] || migrated.months["2026-11"]) fail("2026 plan kept");
if (migrated.view.month < "2027-01") fail("view month " + migrated.view.month);
if (migrated.recipes["dup-boats"]) fail("duplicate boats kept");
const boats = Object.keys(migrated.recipes).filter(function (id) { return migrated.recipes[id].title === "Beef-Stuffed Potato Boats"; });
if (boats.length !== 1) fail("boats " + boats.join(","));
const janLunch = migrated.months["2027-01"] && migrated.months["2027-01"].days["2027-01-04"];
if (!janLunch || janLunch.lunch !== boats[0]) fail("2027 slot not remapped " + JSON.stringify(janLunch));
const cathedral = migrated.recipes.cathedral;
const berry = migrated.recipes["berry-banana-brazil"];
if (!cathedral || /\beggs?\b|egg white|one brazil nut|1 brazil nut/i.test(JSON.stringify(cathedral))) fail("cathedral text " + JSON.stringify(cathedral));
if (!berry || /one brazil nut|1 brazil nut|maximum|strain|beside the glass|Sainsbury/i.test(berry.title + JSON.stringify(berry.ingredients))) fail("berry text " + JSON.stringify(berry.ingredients));
if (!berry.ingredients.some(function (item) { return item.name === "2 Brazil nuts" && item.brazilNuts === 2; })) fail("berry nuts " + JSON.stringify(berry.ingredients));
const once = mem.nexus_food_v1;
t.read();
if (mem.nexus_food_v1 !== once) fail("second migrate wrote");

t.reset();
const live = JSON.parse(mem.nexus_food_v1);
const recipeCount = Object.keys(live.recipes).length;
live.months["2026-11"] = { days: { "2026-11-02": { breakfast: "", morning: "", lunch: "salmon-rice-plate", evening: "", why: {}, brazilExtra: 2 } }, ticks: {}, status: "draft", slots: { breakfast: false, lunch: true, dinner: true, smoothie: true } };
live.months["2027-05"] = { days: { "2027-05-03": { breakfast: "", morning: "", lunch: "salmon-rice-plate", evening: "", why: {}, brazilExtra: 2 } }, ticks: {}, status: "draft", slots: { breakfast: false, lunch: true, dinner: true, smoothie: true } };
live.view = { month: "2026-11" };
live.templates.drop2026 = { id: "drop2026", name: "December 2026 base", fromMonth: "2026-12", weekdayPattern: { Mon: { breakfast: "", morning: "", lunch: "", evening: "" } } };
live.undo = live.undo || [];
live.undo.push({ id: "u-drop", label: "Locked December 2026", months: { "2026-11": { days: {} }, "2027-05": { days: { "2027-05-03": { lunch: "salmon-rice-plate" } } } }, recipes: {}, templates: {} });
live.scrubbed = 41;
live.notice = "";
mem.nexus_food_v1 = JSON.stringify(live);
const dropped = t.read();
if (dropped.months["2026-11"] || dropped.months["2026-12"]) fail("2026 months kept on read");
if (!dropped.months["2027-05"] || dropped.months["2027-05"].days["2027-05-03"].lunch !== "salmon-rice-plate") fail("2027 plan dropped");
if (Object.keys(dropped.recipes).length !== recipeCount) fail("recipe count " + Object.keys(dropped.recipes).length);
if (dropped.view.month !== "2027-01") fail("stored view " + dropped.view.month);
if (!dropped.templates.drop2026 || dropped.templates.drop2026.name.indexOf("2026") !== -1 || dropped.templates.drop2026.fromMonth) fail("template year " + JSON.stringify(dropped.templates.drop2026));
const undoDrop = dropped.undo.filter(function (entry) { return entry.id === "u-drop"; })[0];
if (!undoDrop || undoDrop.label.indexOf("2026") !== -1 || undoDrop.months["2026-11"] || !undoDrop.months["2027-05"]) fail("undo year " + JSON.stringify(undoDrop));
const savedDrop = mem.nexus_food_v1;
t.reset();
t.read();
if (mem.nexus_food_v1 !== savedDrop) fail("2026 drop wrote twice");

const botanical = t.cardView("recovery-botanical-extraction");
if (!botanical || botanical.title !== "Botanical" || botanical.tag.indexOf("Smoothie") === -1 || botanical.tag.indexOf("Recovery") === -1 || botanical.blend !== "Blend all until smooth.") {
  fail("botanical view " + JSON.stringify(botanical));
}
if (botanical.lines.some(function (line) { return /sainsbury|strain|beside the glass|SO Organic|joe v38/i.test(line); })) fail("botanical lines " + botanical.lines.join(" | "));
if (botanical.source && botanical.title.indexOf(botanical.source) !== -1) fail("source in title");
const morning = t.cardView("morning-cell-shatter");
if (!morning || morning.title !== "Morning Blend" || /3000W|smoothie/i.test(morning.title)) fail("morning title " + JSON.stringify(morning));
const toast = t.cardView("cheesy-potato-toast");
if (!toast || toast.tag.indexOf("Breakfast") === -1 || toast.tag === "Lunch" || toast.blend) fail("meal tag " + JSON.stringify(toast));
if (food.indexOf("Source: ") !== -1 || food.indexOf("planner-brazil") !== -1 || food.indexOf("Joe v38") !== -1) fail("citation still rendered");
const mealTags = Object.keys(t.recipes()).map(function (id) { return t.cardView(id); }).filter(function (card) {
  return card && card.tag.indexOf("Smoothie") === -1;
}).map(function (card) { return card.tag; });
if (!mealTags.length || mealTags.every(function (tag) { return tag === "Lunch"; })) fail("tags all lunch " + mealTags.slice(0, 6).join(" | "));
const mince = t.cardView("turkey-mince-rice-skillet");
if (!mince || mince.fits.indexOf("lunch") === -1 || mince.fits.indexOf("evening") === -1) fail("mince fits " + JSON.stringify(mince));
const oats = t.commit({ title: "Morning oats", types: ["breakfast"], ingredients: [{ name: "Oats", qty: 40 }], method: [] });
if (oats.error || t.allows(t.recipes()[oats.id], "evening") || t.allows(t.recipes()[oats.id], "lunch") || !t.allows(t.recipes()[oats.id], "breakfast")) {
  fail("oats fits " + JSON.stringify(t.recipes()[oats.id] && t.recipes()[oats.id].fits));
}
t.setFlag("2027-04", "breakfast", true);
t.setFlag("2027-04", "lunch", false);
t.setFlag("2027-04", "dinner", false);
t.setFlag("2027-04", "smoothie", false);
if (t.enabledSlots("2027-04").join("|") !== "Breakfast") fail("breakfast row " + t.enabledSlots("2027-04").join(","));
t.autoOrganise("2027-04");
t.dates("2027-04").forEach(function (day) {
  const row = t.month("2027-04").days[day.date];
  if (row.lunch || row.evening || row.morning) fail("inactive slot filled " + day.date);
  const placed = t.recipes()[row.breakfast];
  if (!placed || placed.fits.indexOf("breakfast") === -1) fail("auto ignored fits " + day.date + " " + (placed && placed.title));
});
t.setSlot("2027-04", "2027-04-02", "breakfast", oats.id);
t.setFlag("2027-04", "breakfast", false);
t.setFlag("2027-04", "lunch", true);
if (t.enabledSlots("2027-04").indexOf("Breakfast") !== -1) fail("toggle hid breakfast");
if (t.month("2027-04").days["2027-04-02"].breakfast !== oats.id) fail("hidden breakfast dropped");
t.setFlag("2027-04", "breakfast", true);
if (t.enabledSlots("2027-04").indexOf("Breakfast") === -1 || t.month("2027-04").days["2027-04-02"].breakfast !== oats.id) fail("breakfast restore");
if (food.indexOf("Meals each day") === -1 || food.indexOf("Choose meals each day") === -1) fail("plan helper missing");

t.autoOrganise("2027-06");
t.autoOrganise("2027-06", "smoothies");
const juneLunch = t.month("2027-06").days["2027-06-01"].lunch;
const juneLock = t.lock("food", "2027-06");
if (!juneLock.ok || t.lockOf("food", "2027-06").status !== "locked") fail("june lock " + JSON.stringify(juneLock));
if (t.lockOf("smoothies", "2027-06").status === "locked") fail("apply path locked smoothies");
if (!t.undo() || t.lockOf("food", "2027-06").status === "locked" || t.month("2027-06").days["2027-06-01"].lunch !== juneLunch) fail("lock undo emptied the month");
if (t.toast()) fail("undo follow-up banner " + JSON.stringify(t.toast()));
const juneTpl = t.saveTemplate("2027-06", "June");
t.applyTemplate(juneTpl, "2027-06", true);
t.lock("food", "2027-06");
if (t.lockOf("food", "2027-06").status !== "locked" || t.lockOf("smoothies", "2027-06").status === "locked" || !t.month("2027-06").days["2027-06-02"].lunch) fail("apply then lock");
if (!t.undo() || t.lockOf("food", "2027-06").status === "locked" || !t.month("2027-06").days["2027-06-02"].lunch) fail("undo after lock kept the lock");
const filled = t.filled("2027-06");
const askClear = t.requestClear("2027-06");
if (!filled || !askClear.needsConfirm || askClear.count !== filled) fail("clear confirm " + filled + " " + JSON.stringify(askClear));
t.clearMonth("2027-06");
if (t.filled("2027-06")) fail("month still filled");
if (!t.undo() || !t.filled("2027-06")) fail("clear undo");
t.setSlot("2027-06", "2027-06-08", "lunch", "");
t.setSlot("2027-06", "2027-06-09", "lunch", "salmon-rice-plate");
t.applyTemplate(juneTpl, "2027-06", "fill");
if (t.month("2027-06").days["2027-06-09"].lunch !== "salmon-rice-plate") fail("fill replaced a meal");
if (!t.month("2027-06").days["2027-06-08"].lunch) fail("fill left an empty lunch");
if (t.slotTitle("2027-12-01", "morning") !== "Wed 1 Dec · Smoothie") fail("slot title " + t.slotTitle("2027-12-01", "morning"));
t.setMonth("2027-12");
const oneWeek = t.weekDates("2027-12");
if (!oneWeek.length || oneWeek.length > 7) fail("week length " + oneWeek.length);
t.shiftWeek(1);
const nextWeek = t.weekDates("2027-12");
if (!nextWeek.length || nextWeek[0].date === oneWeek[0].date || nextWeek.length > 7) fail("next week " + (nextWeek[0] && nextWeek[0].date));
t.setSlot("2027-08", "2027-08-04", "lunch", "salmon-rice-plate");
ctx.NexusBanner.clear();
const plain = t.place("2027-08", "2027-08-04", "lunch", "cheesy-potato-toast");
if (plain.error || t.toast()) fail("plain swap banner " + JSON.stringify(t.toast()));
t.toggleTick("2027-08-04", "lunch");
const beforeLunch = t.month("2027-08").days["2027-08-04"].lunch;
const swapped = t.place("2027-08", "2027-08-04", "lunch", "turkey-mince-rice-skillet");
if (swapped.error || !swapped.cleared || !t.toast() || !t.toast().undoId || t.toast().text.indexOf("tick cleared") === -1) fail("tick banner " + JSON.stringify(t.toast()));
if (!t.undo() || t.month("2027-08").days["2027-08-04"].lunch !== beforeLunch || t.toast()) fail("tick undo");
const stale = JSON.parse(mem.nexus_food_v1);
stale.toast = { text: "Stuck banner", undoId: "old" };
mem.nexus_food_v1 = JSON.stringify(stale);
t.reset();
t.read();
if (t.toast()) fail("reloaded banner");
if (JSON.parse(mem.nexus_food_v1).toast) fail("toast key kept");
if (food.indexOf("Replace it with this version") !== -1) fail("relock sheet remains");
if (food.indexOf("Unlock the month to change a slot") !== -1) fail("stale unlock copy");
if (food.indexOf("Synced") !== -1) fail("food says Synced");
if (food.indexOf("This plan changed in another tab. Reload") === -1) fail("stale copy missing");
if (food.indexOf("Unlock to edit") === -1 || food.indexOf("Fill only empty") === -1 || food.indexOf("Clear all ") === -1) fail("confirm copy");
if (food.indexOf('data-planner-act="week-prev"') === -1) fail("week nav");
if (css.indexOf("#nexus-banner") === -1 || css.indexOf(".planner-prep-toggle") === -1) fail("banner css");
if (css.indexOf("#planner-toast-host") !== -1 || css.indexOf(".food-toast") !== -1) fail("dead toast css");
if (food.indexOf("planner-toast-host") !== -1 || food.indexOf("Undone:") !== -1) fail("toast host remains");
if (app.indexOf("foodToastUntil") !== -1 || app.indexOf("smoothieToastUntil") !== -1) fail("dead toast fields");

if (fails.length) {
  console.error(fails.length + " failed");
  process.exit(1);
}
console.log("OK food OS v49");
