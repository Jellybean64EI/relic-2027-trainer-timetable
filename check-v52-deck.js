#!/usr/bin/env node
/* v53: card names, portions, picker, copy, clear-out, header, viewer, and edit. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); console.error("FAIL", msg); }
function assert(cond, msg) { if (!cond) fail(msg); }

const html = fs.readFileSync("index.html", "utf8");
const deckSrc = fs.readFileSync("deck.js", "utf8");
["data/schedule.js", "data/nutrition/schedule.js", "food.js", "data/supabaseConfig.js", "app.js"].forEach(function (file) {
  if (html.indexOf('<script src="' + file + "?v=") === -1) fail("missing script " + file);
});
["data/nutrition/meals.js", "data/nutrition/extractions.js", "data/food/pack001.js"].forEach(function (file) {
  if (html.indexOf(file) !== -1) fail("seed script still loaded " + file);
});
const accept = html.split('accept="image/*,android/allowDrive"').length - 1;
assert(accept === 1, "accept count " + accept);
assert(deckSrc.indexOf("relic-videos") === -1, "deck touches relic-videos");
assert(deckSrc.indexOf("nexus_food_lock") === -1, "deck touches lock keys");
assert(!/removeItem|relic_completions/.test(deckSrc), "deck deletes storage or ticks");
assert(deckSrc.indexOf("stripBrands") !== -1, "names skip stripBrands");
assert(!/<footer|n-mark|--c-surface|fbf3e4/.test(html + "\n" + deckSrc + "\n" + fs.readFileSync("styles.css", "utf8")), "cream or footer");

const ctx = {
  console: console,
  document: { getElementById: function () { return null; }, addEventListener: function () {} },
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  addEventListener: function () {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("food.js", "utf8"), ctx, { filename: "food.js" });
vm.runInContext(deckSrc, ctx, { filename: "deck.js" });
const api = ctx.NexusDeck;

assert(api.tidyName("garlic_bread.png") === "Garlic Bread", "tidy garlic");
assert(api.tidyName("potato-pan_4.png") === "Potato Pan 4", "tidy potato");
assert(api.tidyName("soup.PNG") === "Soup", "tidy png");
assert(api.tidyName("__x--y") === "X Y", "tidy messy");
assert(api.tidyName("") === "Untitled card", "tidy empty");
assert(api.tidyName("---.jpg") === "Untitled card", "tidy dashes");

assert(api.portionsLine({ veg: 0, fruit: 0 }) === "Veg 0 · Fruit 0", "veg fruit words");
assert(api.portionsLine({ veg: 1.5, fruit: 2 }) === "Veg 1.5 · Fruit 2", "veg fruit halves");
assert(api.stepPortion(0, -1) === 0, "stepper floor");
assert(api.stepPortion(0, 1) === 0.5, "stepper half");
assert(api.stepPortion(9.5, 1) === 10, "stepper up");
assert(api.stepPortion(10, 1) === 10, "stepper ceiling");
assert(api.stepPortion(1, -1) === 0.5, "stepper down");
assert(api.clampPortion(10.5) === 10 && api.clampPortion(-1) === 0 && api.clampPortion(2.25) === 2.5, "clamp portions");
assert(deckSrc.indexOf("parseLine") === -1, "paste parser removed");
assert(deckSrc.indexOf("Use 4 parts") === -1, "paste error removed");
assert(deckSrc.indexOf("downloadBackup") === -1, "backup download removed");
assert(deckSrc.indexOf("deck-paste") === -1, "paste host removed");
assert(deckSrc.indexOf("nexus_food_clearout_backup_v52") !== -1, "backup key stays");
assert(deckSrc.indexOf("deck-x-fixed") !== -1, "viewer close is fixed");
assert(html.indexOf("Download old food backup") === -1, "backup link removed");
assert(html.indexOf("deck-paste") === -1 && html.indexOf("data-deck-backup") === -1, "no paste or backup control");
assert(html.indexOf("Use 4 parts") === -1, "paste error not in the page");
const css = fs.readFileSync("styles.css", "utf8");
assert(css.indexOf("body.is-deck .card > .ambient-field") !== -1, "deck ambient hidden");
assert(css.indexOf("body.is-deck .brand-main") !== -1, "deck title centred");
assert(css.indexOf(".deck-x-fixed") !== -1 && css.indexOf("position: fixed") !== -1, "close stays fixed");
assert(css.indexOf("touch-action: none") !== -1, "page pinch does not zoom the layout");

assert(api.fiveADay([{ veg: 2, fruit: 1 }], []) === 3, "five food");
assert(api.fiveADay([], [{ veg: 1, fruit: 2 }, { veg: 2, fruit: 0 }]) === 1, "five smoothies capped");
assert(api.formatPortions(3) === "3" && api.formatPortions(3.5) === "3.5", "format portions");

let pick = { food: null, smoothie: null };
pick = api.reducePick(pick, "food", "a");
pick = api.reducePick(pick, "food", "b");
assert(pick.food === "b" && pick.smoothie == null, "same column moves the tick");
pick = api.reducePick(pick, "smoothie", "s");
pick = api.reducePick(pick, "food", "c");
assert(pick.food === "c" && pick.smoothie === "s", "third tap does not add a second food");

const cards = {
  food1: { id: "food1", deck: "food", name: "Garlic Bread", veg: 2, fruit: 1, hidden: false },
  gone: { id: "gone", deck: "food", name: "Hidden", veg: 9, fruit: 9, hidden: true },
  sm1: { id: "sm1", deck: "smoothie", name: "Berry", veg: 1, fruit: 2, hidden: false }
};
assert(api.slotHalf({ f: "gone", s: null }, cards, "food") == null, "hidden card renders empty");
assert(api.slotHalf({ f: "food1", s: "sm1" }, cards, "smoothie").name === "Berry", "visible smoothie");

const days = [];
for (let n = 4; n <= 15; n++) days.push("2027-01-" + String(n).padStart(2, "0"));
const slots = {};
["2027-01-04", "2027-01-05", "2027-01-06"].forEach(function (date) {
  slots[date + "|lunch"] = { f: "food1", s: null };
});
slots["2027-01-07|lunch"] = { f: "gone", s: null };
const source = { date: "2027-01-03", food_id: "food1", smoothie_id: "sm1" };
const fill = api.planCopy(slots, source, days.concat(["2027-01-03"]), "lunch", "fill", cards, "2027-01-01T00:00:00.000Z");
assert(fill.rows.length === 9 && fill.skipped === 3, "fill-only " + fill.rows.length + " " + fill.skipped);
assert(fill.rows.every(function (row) { return row.date_key !== "2027-01-03"; }), "source day is not a target");
assert(fill.rows.some(function (row) { return row.date_key === "2027-01-07"; }), "stale hidden id counts empty");
const over = api.planCopy(slots, source, days, "lunch", "overwrite", cards, "2027-01-01T00:00:00.000Z");
assert(over.rows.length === 12 && over.replaced === 3, "overwrite " + over.rows.length + " " + over.replaced);
over.rows.forEach(function (row) {
  assert(Object.prototype.hasOwnProperty.call(row, "food_id"), "row food_id");
  assert(Object.prototype.hasOwnProperty.call(row, "smoothie_id"), "row smoothie_id");
  assert(row.updated_at === "2027-01-01T00:00:00.000Z", "row updated_at");
  assert(row.food_id === "food1" && row.smoothie_id === "sm1", "source pair");
  assert(typeof row.food_id !== "object" && typeof row.smoothie_id !== "object", "one id each");
});

function memory(seed, opts) {
  const data = Object.assign({}, seed);
  return {
    data: data,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) {
      if (opts && opts.throwOn === key) throw new Error("quota");
      if (opts && opts.badRead === key) {
        data[key] = "NOT-THE-WRITE";
        return;
      }
      data[key] = String(value);
    },
    removeItem: function () { throw new Error("removeItem called"); }
  };
}

const plan = JSON.stringify({ schema: 1, rev: 4, recipes: { garlic: true }, months: { "2027-01": { days: { "2027-01-01": true } } }, scrubbed: 41 });
const locks = {
  "nexus_food_lock_food_v1": "food-lock",
  "nexus_food_lock_smoothies_v1": "smoothie-lock",
  "nexus_food_lock_split_v1": "done",
  nexus_food_backup_v22: "v22",
  relic_future_lock: "off"
};
const store = memory(Object.assign({ nexus_food_v1: plan }, locks));
let planAtBackup = null;
const wrapped = {
  getItem: function (key) { return store.getItem(key); },
  setItem: function (key, value) {
    if (key === "nexus_food_clearout_backup_v52" && planAtBackup == null) planAtBackup = store.getItem("nexus_food_v1");
    store.setItem(key, value);
  },
  removeItem: store.removeItem
};
const cleared = api.clearOut(wrapped);
assert(cleared.ok && cleared.reason === "cleared", "clearOut ran");
assert(planAtBackup === plan, "backup captured the plan before it changed");
const backup = JSON.parse(store.getItem("nexus_food_clearout_backup_v52"));
assert(backup.from === "845c93a" && backup.keys.nexus_food_v1 === plan, "backup bytes");
const shell = JSON.parse(store.getItem("nexus_food_v1"));
assert(shell.recipes && Object.keys(shell.recipes).length === 0 && shell.scrubbed === 41 && shell.rev === 5, "empty shell");
assert(store.getItem("nexus_food_clearout_v52") === "done", "done flag");
Object.keys(locks).forEach(function (key) {
  assert(store.getItem(key) === locks[key], "untouched " + key);
});
const backupRaw = store.getItem("nexus_food_clearout_backup_v52");
const shellRaw = store.getItem("nexus_food_v1");
const again = api.clearOut(store);
assert(again.reason === "done", "second run");
assert(store.getItem("nexus_food_clearout_backup_v52") === backupRaw, "backup not overwritten");
assert(store.getItem("nexus_food_v1") === shellRaw, "shell stays");

const blocked = memory({ nexus_food_v1: plan, "nexus_food_lock_split_v1": "no" });
const stopped = api.clearOut(blocked);
assert(!stopped.ok && stopped.reason === "lock", "stops until lock split is done");
assert(blocked.getItem("nexus_food_v1") === plan, "lock stop keeps the plan");
assert(blocked.getItem("nexus_food_clearout_backup_v52") == null, "lock stop writes no backup");

const quota = memory(Object.assign({ nexus_food_v1: plan }, locks), { throwOn: "nexus_food_clearout_backup_v52" });
const quotaResult = api.clearOut(quota);
assert(!quotaResult.ok && quotaResult.reason === "quota", "quota stops");
assert(quota.getItem("nexus_food_v1") === plan, "failed backup leaves the plan");

const mismatch = memory(Object.assign({
  nexus_food_v1: plan,
  nexus_food_clearout_backup_v52: JSON.stringify({ at: "t", from: "845c93a", keys: { nexus_food_v1: "other" } })
}, locks));
const mismatchRaw = mismatch.getItem("nexus_food_clearout_backup_v52");
const mismatchResult = api.clearOut(mismatch);
assert(!mismatchResult.ok && mismatchResult.reason === "backup", "mismatched backup stops");
assert(mismatch.getItem("nexus_food_v1") === plan, "mismatch keeps the plan");
assert(mismatch.getItem("nexus_food_clearout_backup_v52") === mismatchRaw, "mismatch keeps the backup");

const readback = memory(Object.assign({ nexus_food_v1: plan }, locks), { badRead: "nexus_food_v1" });
const readbackResult = api.clearOut(readback);
assert(!readbackResult.ok && readbackResult.reason === "shell", "shell read-back stops");
assert(readback.getItem("nexus_food_clearout_v52") !== "done", "shell failure does not finish");

if (fails.length) {
  console.error(fails.length + " failed");
  process.exit(1);
}
console.log("OK v53 deck");
