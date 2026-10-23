#!/usr/bin/env node
/* v48: future days tick unless Training lock is on. Notes is gone. The Hub is a door. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v58"') === -1 || html.indexOf("app.js?v=v58") === -1) {
  fail("index.html is not stamped v58");
}
if (app.indexOf('build: "v58"') === -1) fail("RelicArchitect.build is not v58");
if (html.indexOf("JOSEPH · LONDON") !== -1 || html.indexOf("corner-who") !== -1 || html.indexOf("meta-mode") !== -1) {
  fail("public corner still has the name or lock status");
}
if (html.indexOf("ambient-nix is-orange") !== -1 || html.indexOf("ambient-orb is-orange") !== -1) {
  fail("orange NiX ambient is still in the page");
}
if (app.indexOf("NAV_GUARD_MS") === -1) fail("menu tap guard is missing");
if (app.indexOf("meta-mode") !== -1) fail("corner lock status is still painted");
if (html.indexOf("Future days locked") !== -1) fail("default banner still says future days are locked");
if (html.indexOf("Any training day can tick") !== -1 || html.indexOf("LIVE · Europe/London") !== -1) {
  fail("live banner is still in the page");
}
if (html.indexOf('id="btn-future-lock"') === -1 || html.indexOf(">Training lock<") === -1) {
  fail("page lock label is not Training lock");
}
if ((html.match(/>The Cabins</g) || []).length !== 1) fail("The Cabins header must appear once");
if (html.indexOf('data-cabin="notes"') !== -1 || html.indexOf('data-os-door="notes"') !== -1) {
  fail("Notes cabin remains");
}
if (html.indexOf(">Notes &amp; Ideas<") !== -1 || html.indexOf(">Notes & Ideas<") !== -1) {
  fail("Notes label remains");
}
if (html.indexOf('data-os-door="hub"') === -1 || html.indexOf(">Main Menu Hub<") === -1) {
  fail("Hub door is missing");
}
if (html.indexOf('data-os-door="account"') === -1 || html.indexOf("Account Profile: coming soon.") === -1) {
  fail("Account door is missing");
}
const drawer = html.slice(html.indexOf('id="nav-drawer"'), html.indexOf('id="relic-deck-park"'));
const doorOrder = [];
const doorRe = /data-os-door="(training|food|smoothies|porridge|hub|account)"/g;
let doorMatch;
while ((doorMatch = doorRe.exec(drawer))) doorOrder.push(doorMatch[1]);
if (doorOrder.join(",") !== "hub,training,food,smoothies,porridge,account") {
  fail("drawer order " + doorOrder.join(","));
}
if (/🔒|🏋️|🛍️|🍎|🍌|os-door-icon/.test(drawer)) fail("menu still has emoji or door pills");
if (html.indexOf("Lock future days") !== -1) fail("old lock label is still in the menu");
if (html.indexOf('id="nav-lock"') !== -1) fail("lock section is still in the menu");
if (html.indexOf('id="btn-year-schedules"') !== -1 || html.indexOf("2027 Training Schedules") !== -1) {
  fail("year schedule rows are still in the menu");
}
if (html.indexOf("cabin-panel-training") !== -1 || html.indexOf('class="phase-bar"') !== -1) {
  fail("training drop-down or quarter boxes remain");
}
const drawerStart = html.indexOf('id="nav-drawer"');
if (html.slice(drawerStart).indexOf("btn-future-lock") !== -1) fail("lock is still inside the menu");
if (html.indexOf("nav-row-tag") !== -1) fail("drawer still has a module tag");
if (html.indexOf("2026 pre Training") !== -1) fail("2026 module remains");
if (app.indexOf("BRIDGE_LOCK_START") !== -1 || app.indexOf("Q4 2026") !== -1) fail("bridge logic remains");
if (html.indexOf('aria-label="Lock off"') === -1) fail("aria is not Lock off");
const lockClick = app.indexOf("setFutureLock(!state.futureLock)");
const lockHandler = app.slice(lockClick, lockClick + 160);
if (lockClick === -1 || lockHandler.indexOf("setNavOpen") !== -1) {
  fail("training lock toggle still closes the menu");
}
if (app.indexOf('on ? "Lock on" : "Lock off"') === -1) fail("aria paint is not Lock on/off");
function panelSlice(name) {
  const marker = 'data-os-panel="' + name + '"';
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const next = html.indexOf('data-os-panel="', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}
if (panelSlice("food").indexOf("btn-future-lock") !== -1) fail("lock row is inside the food door");
if (panelSlice("smoothies").indexOf("btn-future-lock") !== -1) fail("lock row is inside the smoothies door");
if (html.indexOf('data-os-door="training"') === -1) fail("training door is missing");
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
if (!arch || arch.build !== "v58" || arch.futureLock !== false) fail("default lock is not off");
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

const auto = load("?date=2027-01-01");
if (!auto.RelicArchitect || auto.RelicArchitect.futureLock !== true) fail("lock did not turn on for 1 Jan 2027");
else {
  auto.RelicArchitect.setFutureLock(false);
  if (auto.memory.relic_future_lock_override !== "off") fail("manual off did not store the override");
  if (auto.memory.relic_future_lock) fail("manual off left the old lock key");
  expect(auto.RelicArchitect, "2027-01-02", true, "manual off opens the next day");
}
const keptOff = load("?date=2027-01-01", { relic_future_lock_override: "off" });
if (!keptOff.RelicArchitect || keptOff.RelicArchitect.futureLock !== false) fail("manual off did not persist");
else {
  keptOff.RelicArchitect.setFutureLock(true);
  if (keptOff.memory.relic_future_lock_override) fail("turning the lock back on left the override");
  if (keptOff.RelicArchitect.futureLock !== true) fail("lock did not turn back on");
}
const beforeDate = load("?date=2026-12-31");
if (!beforeDate.RelicArchitect || beforeDate.RelicArchitect.futureLock !== false) fail("lock changed before 1 Jan 2027");
const beforeOn = load("?date=2026-12-31", { relic_future_lock: "1" });
if (!beforeOn.RelicArchitect || beforeOn.RelicArchitect.futureLock !== true) fail("saved lock was cleared before 1 Jan 2027");
beforeOn.RelicArchitect.setFutureLock(false);
if (beforeOn.memory.relic_future_lock_override) fail("turning the lock off before 1 Jan stored an override");

if (arch && typeof arch.applyOsDoor === "function") {
  if (arch.applyOsDoor("training") !== true || open.nodes["btn-future-lock"].hidden) {
    fail("lock hidden while Training is open");
  }
  if (arch.applyOsDoor("food") !== false || !open.nodes["btn-future-lock"].hidden) {
    fail("lock still visible on Food");
  }
  if (arch.applyOsDoor("smoothies") !== false || !open.nodes["btn-future-lock"].hidden) {
    fail("lock still visible on Smoothies");
  }
  const foodPanel = open.panels.filter(function (panel) { return panel.getAttribute("data-os-panel") === "food"; })[0];
  if (!foodPanel || foodPanel.hidden !== true) fail("food panel stayed open");
  if (arch.applyOsDoor("training") !== true || open.nodes["btn-future-lock"].hidden) {
    fail("lock did not return with Training");
  }
  if (open.nodes["btn-future-lock"].getAttribute("aria-label") !== "Lock off") {
    fail("aria did not stay Lock off");
  }
  if (arch.applyOsDoor("notes") !== false || !open.nodes["btn-future-lock"].hidden) {
    fail("notes door did not land on the Hub");
  }
  if (open.nodes["nav-drawer-title"].textContent !== "Main Menu Hub") fail("notes door title");
  if (arch.applyOsDoor("hub") !== false || !open.nodes["btn-future-lock"].hidden) fail("hub shows the lock");
  if (arch.applyOsDoor("account") !== false || !open.nodes["btn-future-lock"].hidden) fail("account shows the lock");
  if (arch.applyOsDoor("training") !== true || open.nodes["btn-future-lock"].hidden) fail("training lock did not return");
} else {
  fail("applyOsDoor missing");
}

if (fails.length) {
  fails.forEach(function (msg) { console.error("FAIL", msg); });
  process.exit(1);
}
console.log("OK ticks v49");
