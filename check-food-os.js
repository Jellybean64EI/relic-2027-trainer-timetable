#!/usr/bin/env node
/* v20: four Food OS rooms, portioned cues, and no training binds in food data. */
const fs = require("fs");
const vm = require("vm");
const ctx = { window: {} };
vm.createContext(ctx);
[
  "data/schedule.js",
  "data/precondition.js",
  "data/nutrition/shop.js",
  "data/nutrition/meals.js",
  "data/nutrition/extractions.js",
  "data/nutrition/schedule.js"
].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
const audit = ctx.window.RELIC_FOOD_SCHEDULE.audit();
if (!audit.ok) {
  console.error("FAIL", JSON.stringify(audit.problems, null, 2));
  process.exit(1);
}
const html = fs.readFileSync("index.html", "utf8");
const rooms = ["weekly", "shop", "meals", "extractions"];
rooms.forEach(function (room) {
  if (html.indexOf('data-food-room="' + room + '"') === -1) {
    console.error("FAIL missing drawer room " + room);
    process.exit(1);
  }
});
if (html.indexOf("data/nutrition.js") !== -1) {
  console.error("FAIL mashed nutrition.js still linked");
  process.exit(1);
}
if (html.indexOf('content="v20.2"') === -1 || html.indexOf("styles.css?v=v20.2") === -1) {
  console.error("FAIL cache stamp");
  process.exit(1);
}
const css = fs.readFileSync("styles.css", "utf8");
if (/\.recipe-card li \{[^}]*color:\s*var\(--text\)/.test(css)) {
  console.error("FAIL ingredient ink still uses --text");
  process.exit(1);
}
if (css.indexOf(".recipe-card .recipe-ingredients li") === -1 || css.indexOf("#1f1812") === -1) {
  console.error("FAIL dark ingredient ink");
  process.exit(1);
}
if (css.indexOf(".week-slot-dual.is-full") === -1 || css.indexOf("#3dff7a") === -1) {
  console.error("FAIL dual green glow");
  process.exit(1);
}
if (css.indexOf('.tick-hit[data-tier="2"] .tick-box svg path:first-of-type') === -1 || css.indexOf("fill: #3dff7a") === -1) {
  console.error("FAIL dual shield fill");
  process.exit(1);
}
if (css.indexOf(".wtab.is-complete .week-slot-single.is-full") === -1 || css.indexOf(".week-slot-single.is-target") === -1) {
  console.error("FAIL single slot green");
  process.exit(1);
}
const app = fs.readFileSync("app.js", "utf8");
if (app.indexOf("var singleTarget = total > 0 && singleCount === total") === -1 || app.indexOf('".week-slot-single .shield-complete"') === -1) {
  console.error("FAIL single slot paint");
  process.exit(1);
}
if (app.indexOf("function normalizeTier(value)") === -1 || app.indexOf("return (Number(value) || 0) & 3") === -1) {
  console.error("FAIL normalizeTier");
  process.exit(1);
}
if (app.indexOf("if (bits >= 1) singleCount += 1") === -1 || app.indexOf("if (tier === 3) dualCount += 1") === -1) {
  console.error("FAIL week counts");
  process.exit(1);
}
if (app.indexOf("is-week-complete") === -1 || app.indexOf('completed: bits !== 0') === -1) {
  console.error("FAIL week complete or completed write");
  process.exit(1);
}
if (app.indexOf("if (completed) return 3") !== -1) {
  console.error("FAIL completed still invents a dual badge");
  process.exit(1);
}
function normalizeTier(value) { return (Number(value) || 0) & 3; }
function popcount(mask) {
  var bits = mask & 3;
  return (bits & 1) + ((bits >> 1) & 1);
}
if (normalizeTier(2) !== 2 || popcount(normalizeTier(2)) !== 1 || normalizeTier(3) !== 3 || popcount(3) !== 2 || normalizeTier(0) !== 0 || normalizeTier(null) !== 0) {
  console.error("FAIL tier bit law");
  process.exit(1);
}
if (app.indexOf("Export JSON") === -1 || app.indexOf("relic_food_cards_v20") === -1 || app.indexOf("relic_food_week_v20") === -1) {
  console.error("FAIL food editor");
  process.exit(1);
}
if (app.indexOf("Scan / Import") === -1 || app.indexOf("attach label photo; fill fields") === -1 || app.indexOf('data-scan-action="parse"') === -1) {
  console.error("FAIL scan strip");
  process.exit(1);
}
if (app.indexOf("Build cards from basket") === -1 || app.indexOf("Sort by category") === -1 || app.indexOf("recipe-citations") === -1) {
  console.error("FAIL citations or basket drafts");
  process.exit(1);
}
if (css.indexOf(".scan-preview") === -1 || css.indexOf(".scan-preview h3,\n.scan-preview label") === -1) {
  console.error("FAIL scan preview ink");
  process.exit(1);
}
if (css.indexOf(".recipe-citations") === -1 || css.indexOf(".recipe-citations li") === -1) {
  console.error("FAIL citation ink");
  process.exit(1);
}
if (app.indexOf("Import accepts a JSON object, not a list.") === -1 || app.indexOf("Import accepts a JSON object, not a ZIP.") === -1) {
  console.error("FAIL object-only import");
  process.exit(1);
}
if (app.indexOf('["protein", "veg", "fruit", "dairy", "freezer", "botanical", "other"]') === -1) {
  console.error("FAIL shop sort tags");
  process.exit(1);
}
const spec = fs.readFileSync("PLATFORM_SPEC.md", "utf8");
if (spec.indexOf("ZIP plus a manifest is future") === -1 || spec.indexOf("extractionId") === -1 || spec.indexOf("no dinner smoothie") === -1 || spec.indexOf("docs/FOOD_OS_HANDSHAKE.md") === -1) {
  console.error("FAIL handshake spec");
  process.exit(1);
}
const handshake = fs.readFileSync("docs/FOOD_OS_HANDSHAKE.md", "utf8");
["2026-09-29", "JSON **object**", "not a ZIP", "runtime kind `extraction`", "{ \"notes\": { \"dateKey\": { \"lunch\": \"\", \"mealId\": \"\", \"note\": \"\" } } }", "CARD_FORWARD", "extractionId", "no dinner smoothie", "relic_completions", "eggsPasture", "one a day", "protein", "ZIP plus a manifest", "OCR"].forEach(function (needle) {
  if (handshake.indexOf(needle) === -1) {
    console.error("FAIL handshake contract missing " + needle);
    process.exit(1);
  }
});
const meals = ctx.window.RELIC_FOOD_MEALS;
const extract = ctx.window.RELIC_FOOD_EXTRACTIONS;
["berry-banana-brazil", "cherry-banana-cream", "mango-banana-nut", "berry-oat-almond", "orange-berry-yogurt"].forEach(function (id) {
  const card = extract.present(id, 1);
  if (!card || card.method.map(function (step) { return step.verb; }).join("|") !== "Pour|Add|Add|Add|Blend|Strain|Whisk") {
    console.error("FAIL smoothie " + id);
    process.exit(1);
  }
});
["chicken-rice-broccoli", "mince-pasta-frozen-veg", "tuna-avocado-lettuce"].forEach(function (id) {
  const card = meals.present(id, 1);
  if (!card || !card.ingredients.length) {
    console.error("FAIL meal " + id);
    process.exit(1);
  }
});
if (!ctx.window.RELIC_FOOD_SCHEDULE.composeFromBasket) {
  console.error("FAIL missing composeFromBasket");
  process.exit(1);
}
if (!ctx.window.RELIC_FOOD_SHOP.tiers[1].stretchPence) {
  console.error("FAIL missing tier 1 stretch");
  process.exit(1);
}
const shop = ctx.window.RELIC_FOOD_SHOP;
if (shop.eggsBanned || shop.proteins.indexOf("Eggs") === -1) {
  console.error("FAIL eggs missing");
  process.exit(1);
}
if ((shop.eggPreference || []).join("|") !== "eggsPasture|eggsSo|eggsOmega") {
  console.error("FAIL egg preference");
  process.exit(1);
}
if (!shop.aisles || shop.aisles.length < 7 || !shop.sundayPrep || shop.sundayPrep.length < 6) {
  console.error("FAIL aisle or sunday prep");
  process.exit(1);
}
["live-mon-banana-blueberry", "live-fri-pineapple-ginger", "live-sat-banana-blueberry"].forEach(function (id) {
  const card = extract.present(id, 1);
  if (!card || card.lock.indexOf("Not dinner") === -1) {
    console.error("FAIL live smoothie " + id);
    process.exit(1);
  }
});
const berryText = extract.present("berry-banana-brazil", 1).method.map(function (step) {
  return step.verb + " " + step.detail;
}).join(" ");
if (/4\s*[-\u2013]\s*5/.test(berryText) || berryText.indexOf("One Brazil nut") === -1 && berryText.indexOf("one a day") === -1) {
  console.error("FAIL brazil cap");
  process.exit(1);
}
if (!meals.present("paprika-potato-egg-skillet", 1) || !meals.present("omega3-egg-rest-plate", 1) || !meals.present("eggs-mushroom-greens", 1)) {
  console.error("FAIL egg card missing");
  process.exit(1);
}
if (meals.order.indexOf("eggs-mushroom-greens") === -1) {
  console.error("FAIL meal order");
  process.exit(1);
}
const fuel = ctx.window.RELIC_FOOD_SCHEDULE.buildFuelDays();
const jan1 = fuel["2027-01-01"];
const jan6 = fuel["2027-01-06"];
if (!jan1 || !jan1.portions || !jan1.portions.label || jan1.portions.precise || jan1.lunch.indexOf("Eggs") === -1) {
  console.error("FAIL jan 1 household plate");
  process.exit(1);
}
if (!jan6 || jan6.protein !== "Eggs" || jan6.mealId !== "eggs-mushroom-greens") {
  console.error("FAIL wednesday eggs");
  process.exit(1);
}
["data/nutrition/shop.js", "data/nutrition/meals.js", "data/nutrition/extractions.js", "data/nutrition/schedule.js"].forEach(function (file) {
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/relic_completions|relic-active-video|forensic-tab|localStorage/.test(text)) {
    console.error("FAIL training bind in " + file);
    process.exit(1);
  }
});
console.log("OK food OS", "bridge", audit.bridgeCount, "year", audit.yearCount);
