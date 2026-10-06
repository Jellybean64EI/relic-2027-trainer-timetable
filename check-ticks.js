#!/usr/bin/env node
/* v30: future days tick unless Training lock is on. The row is Training-only. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v30"') === -1 || html.indexOf("app.js?v=v30") === -1) {
  fail("index.html is not stamped v30");
}
if (app.indexOf('build: "v30"') === -1) fail("RelicArchitect.build is not v30");
if (html.indexOf("Future days locked") !== -1) fail("default banner still says future days are locked");
if (html.indexOf("Any training day can tick") === -1) fail("default banner is missing");
if (html.indexOf('id="btn-future-lock"') === -1 || html.indexOf(">Training lock 🔒<") === -1) {
  fail("menu lock label is not Training lock 🔒");
}
if (html.indexOf("Lock future days") !== -1) fail("old lock label is still in the menu");
const lockMarkup = html.slice(html.indexOf('id="nav-lock"'), html.indexOf("</section>", html.indexOf('id="nav-lock"')));
if (/future days|training days/i.test(lockMarkup)) fail("lock row still says future days or training days");
if (lockMarkup.indexOf(">OFF<") === -1) fail("OFF tag missing");
if (html.indexOf('aria-label="Lock off"') === -1) fail("aria is not Lock off");
const lockClick = app.indexOf("setFutureLock(!state.futureLock)");
const lockClose = app.indexOf("setNavOpen(false)", lockClick);
if (lockClick === -1 || lockClose === -1 || lockClose - lockClick > 80) {
  fail("training lock tap does not close the menu");
}
if (app.indexOf('on ? "Lock on" : "Lock off"') === -1) fail("aria paint is not Lock on/off");
function panelSlice(name) {
  const marker = 'data-os-panel="' + name + '"';
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const next = html.indexOf('data-os-panel="', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}
const trainingPanel = panelSlice("training");
if (trainingPanel.indexOf('id="btn-future-lock"') === -1) fail("lock row is outside the training door");
if (panelSlice("food").indexOf("btn-future-lock") !== -1) fail("lock row is inside the food door");
if (panelSlice("smoothies").indexOf("btn-future-lock") !== -1) fail("lock row is inside the smoothies door");
if (app.indexOf("section.hidden = !training") === -1) fail("nav paint does not hide the lock row");
if (css.indexOf("#btn-future-lock") === -1 || css.indexOf("min-height: 44px") === -1) {
  fail("lock control is missing a 44px target");
}
if (app.indexOf("2027 LOCKED") !== -1) fail("meta-mode still says 2027 LOCKED");
if (app.indexOf("if (dateKey >= S.LIVE_START) return false") !== -1) {
  fail("2027 year wall is still in canTick");
}
if (app.indexOf('FUTURE_LOCK_KEY = "relic_future_lock"') === -1) fail("lock preference key missing");

const lockReturn = app.indexOf('return \'<td class="done-cell"><span class="lock-badge">LOCKED</span></td>\';');
const canGate = app.lastIndexOf("if (!canTick(day.dateKey, parts))", lockReturn);
if (lockReturn === -1 || canGate === -1 || lockReturn - canGate > 180) {
  fail("LOCKED badge is no longer gated by canTick");
}

function makeNode(attrs) {
  return {
    attrs: Object.assign({}, attrs),
    hidden: false,
    textContent: "",
    classList: { toggle: function () {} },
    getAttribute: function (key) { return this.attrs[key] == null ? null : String(this.attrs[key]); },
    setAttribute: function (key, value) { this.attrs[key] = String(value); }
  };
}

function load(search, store) {
  const memory = Object.assign({}, store || {});
  const nodes = {
    "nav-lock": makeNode({ id: "nav-lock" }),
    "btn-future-lock": makeNode({ id: "btn-future-lock" }),
    "future-lock-tag": makeNode({ id: "future-lock-tag" }),
    "nav-drawer-title": makeNode({ id: "nav-drawer-title" })
  };
  const doors = ["training", "food", "smoothies"].map(function (name) {
    return makeNode({ "data-os-door": name });
  });
  const panels = ["training", "food", "smoothies"].map(function (name) {
    return makeNode({ "data-os-panel": name });
  });
  const ctx = {
    console: console,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    location: { search: search, href: "http://127.0.0.1/" + search },
    localStorage: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
      setItem: function (key, value) { memory[key] = String(value); },
      removeItem: function (key) { delete memory[key]; }
    },
    document: {
      readyState: "loading",
      addEventListener: function () {},
      getElementById: function (id) { return nodes[id] || null; },
      querySelector: function () { return null; },
      querySelectorAll: function (sel) {
        if (sel === "[data-os-door]") return doors;
        if (sel === "[data-os-panel]") return panels;
        return [];
      }
    },
    memory: memory,
    nodes: nodes,
    panels: panels
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["data/schedule.js", "data/precondition.js", "data/upperBody.js", "app.js"].forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  });
  return ctx;
}

function expect(arch, dateKey, want, label) {
  const got = arch.canTickDate(dateKey);
  if (got !== want) fail(label + " canTickDate(" + dateKey + ") " + got);
}

const open = load("?date=2026-10-06");
const arch = open.RelicArchitect;
if (!arch || arch.build !== "v30" || arch.futureLock !== false) fail("default lock is not off");
else {
  expect(arch, "2026-10-06", true, "open today");
  ["2026-10-07", "2026-12-31", "2027-01-01", "2027-10-07"].forEach(function (dateKey) {
    expect(arch, dateKey, true, "open");
  });
  if (arch.canTickDate("") !== false || arch.canTickDate(null) !== false) fail("empty date must stay closed");

  arch.setFutureLock(true);
  if (open.memory.relic_future_lock !== "1" || arch.futureLock !== true) fail("lock on did not persist");
  expect(arch, "2026-10-06", true, "locked today");
  expect(arch, "2026-10-05", true, "locked past");
  expect(arch, "2026-10-07", false, "locked tomorrow");
  expect(arch, "2027-01-01", false, "locked while today is still 2026");

  open.location.search = "?date=2027-01-01";
  expect(arch, "2026-12-31", true, "2027 past");
  expect(arch, "2027-01-01", true, "2027 today unlocks");
  expect(arch, "2027-01-02", false, "2027 tomorrow stays locked");

  arch.setFutureLock(false);
  if (open.memory.relic_future_lock) fail("lock off did not clear storage");
  expect(arch, "2027-01-02", true, "unlocked again");
}

const kept = load("?date=2026-10-06", { relic_future_lock: "1" });
if (!kept.RelicArchitect || kept.RelicArchitect.futureLock !== true) fail("refresh did not restore lock on");
else expect(kept.RelicArchitect, "2026-10-07", false, "restored lock");

if (arch && typeof arch.applyOsDoor === "function") {
  if (arch.applyOsDoor("training") !== true || open.nodes["nav-lock"].hidden) {
    fail("lock row hidden while Training is open");
  }
  if (arch.applyOsDoor("food") !== false || !open.nodes["nav-lock"].hidden) {
    fail("lock row still visible on Food");
  }
  if (arch.applyOsDoor("smoothies") !== false || !open.nodes["nav-lock"].hidden) {
    fail("lock row still visible on Smoothies");
  }
  const foodPanel = open.panels.filter(function (panel) { return panel.getAttribute("data-os-panel") === "food"; })[0];
  const trainingPanelNode = open.panels.filter(function (panel) { return panel.getAttribute("data-os-panel") === "training"; })[0];
  if (!foodPanel || foodPanel.hidden !== true) fail("food panel stayed open");
  if (arch.applyOsDoor("training") !== true || open.nodes["nav-lock"].hidden || trainingPanelNode.hidden) {
    fail("lock row did not return with Training");
  }
  if (open.nodes["future-lock-tag"].textContent !== "OFF") fail("OFF tag was not kept");
  if (open.nodes["btn-future-lock"].getAttribute("aria-label") !== "Lock off") {
    fail("aria did not stay Lock off");
  }
} else {
  fail("applyOsDoor missing");
}

if (fails.length) {
  fails.forEach(function (msg) { console.error("FAIL", msg); });
  process.exit(1);
}
console.log("OK ticks v30");
