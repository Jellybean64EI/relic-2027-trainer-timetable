#!/usr/bin/env node
/* v19: four Food OS rooms, portioned cues, and no training binds in food data. */
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
if (html.indexOf('content="v19"') === -1 || html.indexOf("styles.css?v=v19") === -1) {
  console.error("FAIL cache stamp");
  process.exit(1);
}
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
["data/nutrition/shop.js", "data/nutrition/meals.js", "data/nutrition/extractions.js", "data/nutrition/schedule.js"].forEach(function (file) {
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/relic_completions|relic-active-video|forensic-tab|localStorage/.test(text)) {
    console.error("FAIL training bind in " + file);
    process.exit(1);
  }
});
console.log("OK food OS", "bridge", audit.bridgeCount, "year", audit.yearCount);
