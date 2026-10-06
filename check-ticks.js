#!/usr/bin/env node
/* v29: future days tick unless the menu lock is on. Lock follows the London date. */
const fs = require("fs");
const vm = require("vm");

const fails = [];
function fail(msg) { fails.push(msg); }

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

if (html.indexOf('content="v29"') === -1 || html.indexOf("app.js?v=v29") === -1) {
  fail("index.html is not stamped v29");
}
if (app.indexOf('build: "v29"') === -1) fail("RelicArchitect.build is not v29");
if (html.indexOf("Future days locked") !== -1) fail("default banner still says future days are locked");
if (html.indexOf("Any training day can tick") === -1) fail("default banner is missing");
if (html.indexOf('id="btn-future-lock"') === -1 || html.indexOf("Lock future days") === -1) {
  fail("menu lock control is missing");
}
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

function load(search, store) {
  const memory = Object.assign({}, store || {});
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
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    },
    memory: memory
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
if (!arch || arch.build !== "v29" || arch.futureLock !== false) fail("default lock is not off");
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

if (fails.length) {
  fails.forEach(function (msg) { console.error("FAIL", msg); });
  process.exit(1);
}
console.log("OK ticks v29");
