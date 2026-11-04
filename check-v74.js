/* Nexus v75: the five Specials sub-cabins are normal cabins after Feet. */
var fs = require("fs");
var vm = require("vm");
var crypto = require("crypto");
var failed = 0;

function fail(msg) {
  failed += 1;
  console.error("FAIL " + msg);
}

function ok(msg) {
  console.log("OK " + msg);
}

var LAST = [
  ["feet", "Feet"],
  ["sp-posture-mobility", "Posture & Mobility"],
  ["sp-calisthenics", "Calisthenics"],
  ["sp-resistance-bands", "Resistance Bands"],
  ["sp-hanging", "Hanging"],
  ["sp-target-weights", "Target Weights"]
];
var FIVE = LAST.slice(1);
var SAME = {
  "data/videoCatalog.js": "ac5ed403433cf18c644731b6c2baffe9efd144873cfdb64f2a2e9e4419629686",
  "builder.js": "7ce71eaf6a0dfd6842f385002d0e788b2e88e0542d4dcbb966f71866832f4ba0",
  "tools/v64_placement.js": "282878b4e4edbf24bd289f872aab9ac6069cbd0f390d4bd2bac6dad346f820ab",
  "food.js": "7c9d302f6699ea742209379f0735fbb429464ca3a6e5adf381d32cbca80c8b8a",
  "data/nutrition/shop.js": "32227afb65d23f62a7407c33577627b36b3eb0f37405618ba5a9a7b6197e783b",
  "data/nutrition/schedule.js": "9c6ef838f521368c272991551a622f12c2fbd16fb13fedb17db9d94f667ef2c8"
};

var html = fs.readFileSync("index.html", "utf8");
var cards = fs.readFileSync("cards.js", "utf8");
var css = fs.readFileSync("styles.css", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var config = fs.readFileSync("data/nexusConfig.js", "utf8");

if (app.indexOf('build: "v75"') === -1 || html.indexOf('content="v75"') === -1 || html.indexOf("cards.js?v=v75") === -1 || html.indexOf("?v=v73") !== -1) {
  fail("cache stamp is not v75");
} else ok("cache stamp is v75");
if (css.split("\n").some(function (line) { return line.indexOf("body.player-open") === 0 && line.indexOf("v75") !== -1; })) {
  fail("a player-open rule was restamped");
}
if (config.indexOf("videoEditor: false") === -1) fail("video editor flag is not off");

["specialsOpen", "data-vc-specials", "Specials › ", "vc-specials"].forEach(function (token) {
  if (cards.indexOf(token) !== -1) fail("cards.js still has " + token);
});
if (cards.indexOf("function cabinOrder()") === -1 || cards.indexOf("cabinOrder: cabinOrder") === -1) fail("cabinOrder is not wired");
if (css.indexOf("vc-specials") !== -1) fail("styles.css still has vc-specials");
if (css.indexOf(".vc-move-go {") === -1 || css.indexOf("min-height: 44px") === -1 || css.indexOf("background: #ff8a00") === -1) {
  fail("Move button styling changed");
}
if (!failed) ok("Specials sheet is gone and Move styling stays");

Object.keys(SAME).forEach(function (file) {
  var digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (digest !== SAME[file]) fail(file + " changed");
});
if (!failed) ok("catalogue, builder, placement, and food files are unchanged");

var list = { innerHTML: "" };
var documentStub = {
  readyState: "loading",
  body: { classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } } },
  addEventListener: function () {},
  getElementById: function (id) { return id === "vc-list" ? list : null; },
  querySelector: function () { return null; },
  createElement: function () { return { remove: function () {} }; }
};
var ctx = { window: {}, console: console, document: documentStub };
ctx.window = ctx;
vm.createContext(ctx);
["tools/v64_placement.js", "data/videoCatalog.js", "cards.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
});
var api = ctx.window.NexusCards;
if (!api || typeof api.cabinOrder !== "function" || typeof api.render !== "function") fail("NexusCards did not load");
else {
  var order = api.cabinOrder();
  if (order.length !== 26) fail("cabinOrder length " + order.length);
  var tail = order.slice(-6).join(",");
  if (tail !== LAST.map(function (row) { return row[0]; }).join(",")) fail("cabin order tail " + tail);
  api.render();
  var rendered = list.innerHTML;
  if (rendered.indexOf("Specials") !== -1 || rendered.indexOf("data-vc-specials") !== -1 || rendered.indexOf("vc-specials") !== -1) {
    fail("rendered list still has a Specials row");
  }
  var rows = [];
  var re = /class="vc-cabin" data-vc-group="([^"]+)" aria-expanded="false"><span class="vc-name">([^<]*)<\/span><span class="vc-count">(\d+)<\/span>/g;
  var match;
  while ((match = re.exec(rendered))) rows.push({ id: match[1], name: match[2], count: Number(match[3]) });
  if (rows.length !== 26) fail("rendered cabin rows " + rows.length);
  var names = rows.slice(-6).map(function (row) {
    return row.name.replace(/&amp;/g, "&");
  }).join("|");
  if (names !== LAST.map(function (row) { return row[1]; }).join("|")) fail("last cabin names " + names);
  rows.forEach(function (row) {
    if (!row.id) fail("a cabin row has no data-vc-group");
  });
  var catalog = ctx.window.NEXUS_VIDEO_CATALOG;
  var byId = {};
  (catalog.groups || []).forEach(function (group) { byId[group.id] = group; });
  FIVE.forEach(function (row) {
    var group = byId[row[0]];
    var mods = group && group.modules ? group.modules.map(function (mod) { return mod.id + ":" + mod.name; }).join(",") : "";
    if (mods !== "pre:Pre,exercise:Main,post:Post") fail(row[1] + " does not expand as Pre/Main/Post (" + mods + ")");
    var label = api.moveButtonText(row[0], "exercise");
    if (label !== "Move to " + row[1] + " · Main" || label.indexOf("Specials") !== -1 || label.indexOf("›") !== -1) {
      fail("move label " + label);
    }
  });
  var clips = api.flatClips();
  var seen = [];
  clips.forEach(function (clip) { if (seen[seen.length - 1] !== clip.cabinId) seen.push(clip.cabinId); });
  var feetAt = seen.indexOf("feet");
  var after = seen.slice(feetAt).join(",");
  if (feetAt < 0 || after !== LAST.map(function (row) { return row[0]; }).join(",")) fail("quick order after Feet " + after);
  if (cards.indexOf('class="vc-mod') === -1 || cards.indexOf("data-vc-module") === -1) fail("inline module rows are missing");
  if (!failed) ok("26 cabins, inline Pre/Main/Post, and Move labels");
}

if (failed) {
  console.error(failed + " v75 check(s) failed");
  process.exit(1);
}
console.log("OK v75");
