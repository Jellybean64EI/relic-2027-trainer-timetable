#!/usr/bin/env node
/* v18: four Food OS namespaces stay separate from the training player. */
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
if (html.indexOf('content="v18"') === -1 || html.indexOf("styles.css?v=v18") === -1) {
  console.error("FAIL cache stamp");
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
