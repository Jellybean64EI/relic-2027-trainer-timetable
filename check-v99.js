/* Nexus v99: offline shell, write queue, and the backup export. */
var fs = require("fs");
var failed = 0;

function fail(message) {
  failed += 1;
  console.error("FAIL " + message);
}

function ok(message) {
  console.log("OK " + message);
}

var html = fs.readFileSync("index.html", "utf8");
var app = fs.readFileSync("app.js", "utf8");
var sw = fs.readFileSync("sw.js", "utf8");
if (html.indexOf('content="v100"') === -1 || app.indexOf('build: "v100"') === -1) fail("cache stamp is not v100");
else ok("cache stamp is v100");
var cacheName = (sw.match(/var CACHE = "([^"]+)"/) || [])[1];
if (!cacheName || html.indexOf('register("sw.js"') === -1) fail("the service worker is not registered");
else ok("the service worker is registered");
if (sw.indexOf("range") === -1) fail("the video cache decision is not recorded");
else ok("videos are left uncached");
if (html.indexOf('id="net-pill"') === -1) fail("the status pill is missing");
else ok("the status pill is in the header flow");

function addDays(iso, n) {
  var date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function memoryBucket(seed) {
  var objects = new Map(seed || []);
  return {
    objects: objects,
    async put(key, body) { objects.set(key, String(body)); },
    async get(key) {
      if (!objects.has(key)) return null;
      var text = objects.get(key);
      return { async text() { return text; } };
    },
    async delete(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(function (key) { objects.delete(key); }); },
    async list(opts) {
      var prefix = (opts && opts.prefix) || "";
      var keys = Array.from(objects.keys()).filter(function (key) { return key.indexOf(prefix) === 0; }).sort();
      return { objects: keys.map(function (key) { return { key: key }; }), truncated: false };
    }
  };
}

function backupDb(tables) {
  return {
    prepare: function (sql) {
      var stmt = {
        args: [],
        bind: function () { stmt.args = Array.prototype.slice.call(arguments); return stmt; },
        all: async function () {
          if (sql.indexOf("sqlite_master") !== -1) {
            return { results: Object.keys(tables).map(function (name) { return { name: name }; }) };
          }
          var match = /FROM ([A-Za-z0-9_]+)/.exec(sql);
          return { results: (match && tables[match[1]] || []).slice() };
        },
        run: async function () {
          var deleted = /DELETE FROM ([A-Za-z0-9_]+)/.exec(sql);
          if (deleted) tables[deleted[1]] = [];
          if (sql.indexOf("INSERT INTO") === 0) {
            var name = /INSERT INTO ([A-Za-z0-9_]+)/.exec(sql)[1];
            var cols = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",").map(function (col) { return col.trim(); });
            var row = {};
            cols.forEach(function (col, index) { row[col] = stmt.args[index]; });
            tables[name].push(row);
          }
          return { meta: { changes: 1 } };
        }
      };
      return stmt;
    }
  };
}

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  var backup = await import("./worker/backup.js");
  var dates = [];
  for (var i = 0; i < 32; i++) dates.push(addDays("2025-01-01", i));
  var seed = dates.map(function (date) { return ["backups/" + date + "/manifest.json", "{}"]; });
  var tables = { ticks: [{ date_key: "2027-01-01", level: 1, mask: 1 }], slots: [{ date_key: "2027-01-01", meal: "breakfast", food_id: "card-1" }] };
  var env = { DB: backupDb(tables), BACKUPS: memoryBucket(seed) };
  var exported = await backup.exportBackup(env, "2025-02-02");
  var tickFile = env.BACKUPS.objects.get("backups/2025-02-02/ticks.json");
  var keptDays = {};
  Array.from(env.BACKUPS.objects.keys()).forEach(function (key) {
    var match = /^backups\/(\d{4}-\d{2}-\d{2})\//.exec(key);
    if (match) keptDays[match[1]] = true;
  });
  if (!tickFile || JSON.parse(tickFile).length !== 1 || exported.pruned.length !== 3 || Object.keys(keptDays).length !== 30) {
    fail("backup export did not keep 30 days " + JSON.stringify({ pruned: exported.pruned, days: Object.keys(keptDays).length, file: !!tickFile }));
  } else ok("backup export writes the day and prunes to 30");
  tables.ticks = [];
  var restored = await backup.restoreBackup(env, "2025-02-02");
  var safety = Array.from(env.BACKUPS.objects.keys()).filter(function (key) { return key.indexOf("backups/" + restored.safety + "/ticks.json") === 0; });
  if (tables.ticks.length !== 1 || tables.ticks[0].date_key !== "2027-01-01" || !safety.length || restored.safety.indexOf("pre-restore-") !== 0) {
    fail("restore did not snapshot then replace rows " + JSON.stringify({ rows: tables.ticks, restored: restored, safety: safety.length }));
  } else ok("restore snapshots first, then puts the rows back");
  if (backup.datesToPrune(["2025-01-03", "2025-01-01", "2025-01-02"], 2).join() !== "2025-01-01") fail("prune order is wrong");
  else ok("prune drops the oldest days");

  var worker = await import("./worker/nexus-api.js");
  var idem = new Map();
  var tickWrites = 0;
  var tickDb = {
    prepare: function (sql) {
      var stmt = {
        args: [],
        bind: function () { stmt.args = Array.prototype.slice.call(arguments); return stmt; },
        run: async function () {
          if (sql.indexOf("INSERT OR IGNORE INTO idempotency_keys") === 0 && !idem.has(stmt.args[0])) {
            idem.set(stmt.args[0], { status: stmt.args[1], body: stmt.args[2] });
          }
          if (sql.indexOf("INSERT INTO ticks") === 0) tickWrites += 1;
          return {};
        },
        first: async function () {
          if (sql.indexOf("idempotency_keys") !== -1) return idem.get(stmt.args[0]) || null;
          return null;
        },
        all: async function () { return { results: [] }; }
      };
      return stmt;
    }
  };
  async function putTick(key) {
    return worker.default.fetch(new Request("https://nexus.test/ticks/2099-01-01", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Nexus-Key": "test-key", "X-Idempotency-Key": key },
      body: JSON.stringify({ mask: 1 })
    }), { NEXUS_KEY: "test-key", DB: tickDb });
  }
  var first = await putTick("tick-2099-once");
  var second = await putTick("tick-2099-once");
  if (first.status !== 200 || second.status !== 200 || second.headers.get("X-Idempotent-Replay") !== "1" || tickWrites !== 1) {
    fail("a repeated tick key was applied twice " + first.status + " " + second.status + " writes " + tickWrites);
  } else ok("the worker applies one tick per idempotency key");

  if (failed) {
    console.error(failed + " v99 check(s) failed");
    process.exit(1);
  }

  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"]
  });
  var context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    serviceWorkers: "allow",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  var puts = [];
  var blockWrites = false;
  await context.route("https://nexus-api.joesearle.workers.dev/**", function (route) {
    var req = route.request();
    var url = new URL(req.url());
    if (blockWrites && req.method() !== "GET" && req.method() !== "HEAD") return route.abort();
    if (req.method() === "PUT" && url.pathname === "/ticks/2099-01-01") {
      puts.push(req.headers()["x-idempotency-key"] || "none");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ date_key: "2099-01-01", mask: 1, level: 1, updated_at: "t" })
      });
    }
    if (req.method() === "GET" && url.pathname === "/ticks") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.continue();
  });
  var page = await context.newPage();
  var errors = [];
  page.on("console", function (msg) { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", function (err) { errors.push(String(err)); });
  await page.goto("http://127.0.0.1:8080/?v=v100", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect && navigator.serviceWorker.controller; }, null, { timeout: 20000 });
  await page.waitForFunction(async function (name) {
    var cache = await caches.open(name);
    return !!(await cache.match("/index.html"));
  }, cacheName, { timeout: 20000 });
  await page.evaluate(async function () {
    var cache = await caches.open("nexus-v98");
    await cache.put("/old.html", new Response("old"));
    var worker = navigator.serviceWorker.controller;
    await new Promise(function (resolve) {
      navigator.serviceWorker.addEventListener("message", function onMessage(event) {
        if (event.data && event.data.type === "purged") {
          navigator.serviceWorker.removeEventListener("message", onMessage);
          resolve();
        }
      });
      worker.postMessage({ type: "purge-old" });
    });
  });
  var cachesLeft = await page.evaluate(async function (name) {
    var names = await caches.keys();
    return { names: names, old: names.indexOf("nexus-v98") !== -1, current: names.indexOf(name) !== -1 };
  }, cacheName);
  if (cachesLeft.old || !cachesLeft.current) fail("the old cache was not cleaned " + JSON.stringify(cachesLeft));
  else ok("an old cache is cleaned");
  blockWrites = true;
  await context.setOffline(true);
  var doors = [
    ["/?door=hub", "Training Schedules"],
    ["/?door=training", "Training Schedules"],
    ["/?door=food", "Build a Meal Schedule"],
    ["/?door=account", "Account Profile"]
  ];
  var d;
  for (d = 0; d < doors.length; d++) {
    await page.goto("http://127.0.0.1:8080" + doors[d][0], { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect; }, null, { timeout: 10000 });
    var title = await page.locator("#page-title").innerText();
    if (title !== doors[d][1]) fail(doors[d][0] + " offline title is " + title);
    else ok(doors[d][0] + " renders offline");
  }
  await page.goto("http://127.0.0.1:8080/?door=hub", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect; });
  await page.evaluate(function () {
    return window.nexusFetch("/ticks/2099-01-01", { method: "PUT", body: { mask: 1 } });
  });
  await page.waitForTimeout(200);
  var queued = await page.evaluate(function () {
    var pill = document.getElementById("net-pill");
    var clock = document.getElementById("meta-clock").getBoundingClientRect();
    var card = document.querySelector(".hub-card").getBoundingClientRect();
    var box = pill.getBoundingClientRect();
    return {
      text: pill.textContent,
      hidden: pill.hidden,
      online: navigator.onLine,
      belowClock: box.top >= clock.bottom - 1,
      aboveCard: box.bottom <= card.top + 1
    };
  });
  if (queued.hidden || queued.text !== "Offline · will sync (1)" || !queued.belowClock || !queued.aboveCard) {
    fail("the offline banner is wrong " + JSON.stringify(queued));
  } else ok("the banner says it will sync");
  await page.screenshot({ path: "/opt/cursor/artifacts/v99-offline-banner.png" });
  blockWrites = false;
  await context.setOffline(false);
  await page.evaluate(function () { window.dispatchEvent(new Event("online")); });
  await page.waitForFunction(function () {
    var pill = document.getElementById("net-pill");
    return pill && pill.textContent === "Saved";
  }, null, { timeout: 8000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/v99-saved-banner.png" });
  await page.waitForTimeout(2300);
  var saved = await page.evaluate(function () {
    var pill = document.getElementById("net-pill");
    return { hidden: pill.hidden, puts: window.__puts || 0 };
  });
  if (!saved.hidden || puts.length !== 1) fail("the tick did not sync once " + JSON.stringify({ hidden: saved.hidden, puts: puts }));
  else ok("the queued tick syncs once and the banner hides");
  var unexpected = errors.filter(function (line) {
    return line.indexOf("Failed to load resource") === -1 && line.indexOf("Failed to fetch") === -1 && line.indexOf("offline") === -1;
  });
  if (unexpected.length) fail("console errors " + unexpected.join(" | "));
  else ok("no unexpected console errors");
  await browser.close();
  if (failed) {
    console.error(failed + " v99 check(s) failed");
    process.exit(1);
  }
  console.log("OK v99");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
