/* Nexus v104: health cron, smoke workflow, update pill, quiet error log. */
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
var worker = fs.readFileSync("worker/nexus-api.js", "utf8");
var yml = fs.readFileSync(".github/workflows/smoke.yml", "utf8");
var smoke = require("./tools/smoke.js");
if (html.indexOf('content="v104"') === -1 || app.indexOf('build: "v104"') === -1) fail("cache stamp is not v104");
else ok("cache stamp is v104");
if (sw.indexOf('CACHE = "nexus-v104"') === -1 || sw.indexOf("skip-waiting") === -1 || sw.indexOf("if (!self.registration.active)") === -1) {
  fail("the update worker is not waiting");
} else ok("a new service worker waits for a tap");
if (html.indexOf("Update ready · tap to refresh") === -1) fail("the update pill is missing");
else ok("the update pill is in the page");
if (worker.indexOf('version: "v103"') === -1 || worker.indexOf('event.cron === "*/15 * * * *"') === -1) fail("the health cron is not wired");
else ok("the health cron is wired");
if (yml.indexOf("workflow_dispatch") === -1 || yml.indexOf("git revert --no-edit HEAD") === -1 || yml.indexOf("github.event_name == 'workflow_dispatch'") === -1 || yml.indexOf("github.event_name == 'push'") === -1) {
  fail("rollback is not manual");
} else ok("rollback is a manual workflow");
if (!smoke.countsOk({ counts: { ticks: 74, ticks_2026: 73 } }) || !smoke.countsOk({ counts: { ticks: 80, ticks_2026: 90 } }) || smoke.countsOk({ counts: { ticks: 73, ticks_2026: 73 } })) {
  fail("smoke counts are wrong");
} else ok("smoke accepts higher tick counts");

function memoryDb() {
  var state = { checks: [], errors: [], id: 1, d1: true };
  function stmt(sql) {
    var bound = {
      args: [],
      bind: function () { bound.args = Array.prototype.slice.call(arguments); return bound; },
      run: async function () {
        if (sql.indexOf("INSERT INTO health_checks") === 0) {
          state.checks.push({ id: state.id++, checked_at: bound.args[0], ok: bound.args[1], detail: bound.args[2] });
        }
        if (sql.indexOf("DELETE FROM health_checks") === 0) {
          state.checks = state.checks.filter(function (row) { return row.checked_at >= bound.args[0]; });
        }
        if (sql.indexOf("INSERT INTO client_errors") === 0) {
          state.errors.push({ id: state.id++, message: bound.args[0], source: bound.args[1], page: bound.args[2], version: bound.args[3], user_agent: bound.args[4], created_at: bound.args[5] });
        }
        if (sql.indexOf("DELETE FROM client_errors") === 0) {
          state.errors = state.errors.filter(function (row) { return row.created_at >= bound.args[0]; });
        }
        return {};
      },
      all: async function () {
        if (sql.indexOf("FROM health_checks") !== -1) {
          return { results: state.checks.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 2) };
        }
        if (sql.indexOf("FROM client_errors") !== -1) return { results: state.errors.slice().sort(function (a, b) { return b.id - a.id; }) };
        return { results: [] };
      },
      first: async function () {
        if (sql.indexOf("SELECT 1") === 0) {
          if (!state.d1) throw new Error("d1 down");
          return { ok: 1 };
        }
        return null;
      }
    };
    return bound;
  }
  return {
    state: state,
    prepare: function (sql) { return stmt(sql); }
  };
}

function githubFetch(bucket) {
  return async function (url, opts) {
    var address = String(url);
    var method = (opts && opts.method) || "GET";
    if (address.indexOf("api.github.com") !== -1) {
      bucket.calls.push(method + " " + address);
      if (method === "GET") {
        var open = bucket.issues.filter(function (issue) { return issue.state === "open"; });
        return { status: 200, text: async function () { return JSON.stringify(open); }, json: async function () { return open; } };
      }
      if (method === "POST" && /\/issues$/.test(address)) {
        var created = JSON.parse(opts.body);
        var issue = { number: bucket.issues.length + 1, title: created.title, state: "open" };
        bucket.issues.push(issue);
        return { status: 201, text: async function () { return JSON.stringify(issue); }, json: async function () { return issue; } };
      }
      if (method === "POST" && address.indexOf("/comments") !== -1) {
        bucket.comments.push(address);
        return { status: 201, text: async function () { return "{}"; }, json: async function () { return {}; } };
      }
      if (method === "PATCH") {
        var number = Number(address.split("/issues/")[1]);
        bucket.issues.forEach(function (issue) { if (issue.number === number) issue.state = "closed"; });
        return { status: 200, text: async function () { return "{}"; }, json: async function () { return {}; } };
      }
      return { status: 201, text: async function () { return "{}"; }, json: async function () { return {}; } };
    }
    if (address.indexOf("/health") !== -1) {
      return { status: bucket.healthStatus, json: async function () { return bucket.healthBody; }, text: async function () { return ""; } };
    }
    return {
      status: bucket.siteStatus,
      text: async function () { return bucket.siteStatus === 200 ? '<meta name="relic-build" content="v104">' : "down"; },
      json: async function () { return {}; }
    };
  };
}

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  var health = await import("./worker/health.js");
  var errors = await import("./worker/errors.js");
  var db = memoryDb();
  var bucket = { calls: [], issues: [], comments: [], siteStatus: 200, healthStatus: 200, healthBody: { counts: { ticks: 74, ticks_2026: 73 } } };
  var logs = [];
  db.state.checks.push({ id: 1, checked_at: "2020-01-01T00:00:00.000Z", ok: 1, detail: "{}" });
  db.state.id = 2;
  var env = { DB: db, SITE_URL: "https://site.test", WORKER_URL: "https://worker.test", GITHUB_ALERT_TOKEN: "token" };
  var deps = { fetch: githubFetch(bucket), log: function (line) { logs.push(line); }, now: function () { return "2026-11-13T18:00:00.000Z"; } };
  var pass = await health.runHealthCheck(env, deps);
  if (!pass.ok || db.state.checks.some(function (row) { return row.checked_at.indexOf("2020") === 0; })) fail("a passing check did not prune old rows");
  else ok("a passing health check is stored and old rows are pruned");
  bucket.siteStatus = 500;
  var firstFail = await health.runHealthCheck(env, deps);
  var opened = await health.runHealthCheck(env, deps);
  var again = await health.runHealthCheck(env, deps);
  if (bucket.issues.length !== 1 || firstFail.alert.opened || !opened.alert.opened || !again.alert.duplicate) fail("the alert was not one issue " + JSON.stringify({ issues: bucket.issues, firstFail: firstFail.alert, opened: opened.alert, again: again.alert }));
  else ok("two failures open one issue and a third does not duplicate it");
  bucket.siteStatus = 200;
  var recovered = await health.runHealthCheck(env, deps);
  if (bucket.issues[0].state !== "closed" || !bucket.comments.length || !recovered.ok) fail("recovery did not close the issue");
  else ok("recovery comments and closes the issue");
  var quiet = memoryDb();
  var quietCalls = [];
  var quietLogs = [];
  await health.runHealthCheck({ DB: quiet, SITE_URL: "https://site.test", WORKER_URL: "https://worker.test" }, {
    fetch: async function () { quietCalls.push("fetch"); return { status: 500, async text() { return ""; }, async json() { return {}; } }; },
    log: function (line) { quietLogs.push(line); },
    now: function () { return "2026-11-13T18:00:00.000Z"; }
  });
  await health.runHealthCheck({ DB: quiet, SITE_URL: "https://site.test", WORKER_URL: "https://worker.test" }, {
    fetch: async function (url) {
      quietCalls.push(String(url));
      if (String(url).indexOf("api.github.com") !== -1) throw new Error("github was called");
      return { status: 500, async text() { return ""; }, async json() { return {}; } };
    },
    log: function (line) { quietLogs.push(line); },
    now: function () { return "2026-11-13T18:01:00.000Z"; }
  });
  if (quietLogs.join(" ").indexOf("GITHUB_ALERT_TOKEN unset") === -1 || quietCalls.some(function (url) { return url.indexOf("api.github.com") !== -1; })) {
    fail("a missing token called GitHub");
  } else ok("a missing token only logs");

  var errorDb = memoryDb();
  var stored = await errors.saveClientErrors(errorDb, {
    errors: [
      { message: "boom", source: "app.js:1", page: "/?door=hub", version: "v100", userAgent: "Test", email: "a@b.c" },
      { message: "mail a@b.c failed", source: "x", page: "/", version: "v100", userAgent: "Test" }
    ]
  }, "2026-11-13T18:00:00.000Z");
  errorDb.state.errors.push({ id: 99, message: "old", source: "", page: "", version: "", user_agent: "", created_at: "2020-01-01T00:00:00.000Z" });
  await errors.pruneClientErrors(errorDb, "2026-11-13T18:00:00.000Z");
  var listed = await errors.listClientErrors(errorDb);
  if (stored !== 2 || listed.length !== 2 || listed.some(function (row) { return row.message.indexOf("a@b.c") !== -1; })) {
    fail("errors were not stored or redacted " + JSON.stringify(listed));
  } else ok("client errors are stored for 30 days without addresses");
  var api = await import("./worker/nexus-api.js");
  var denied = await api.default.fetch(new Request("https://nexus.test/errors"), { DB: errorDb, BACKUP_TOKEN: "secret" });
  var allowed = await api.default.fetch(new Request("https://nexus.test/errors", { headers: { "X-Backup-Token": "secret" } }), { DB: errorDb, BACKUP_TOKEN: "secret" });
  if (denied.status !== 401 || allowed.status !== 200) fail("GET /errors is not protected " + denied.status + " " + allowed.status);
  else ok("GET /errors requires the backup token");

  if (failed) {
    console.error(failed + " v100 check(s) failed");
    process.exit(1);
  }

  var pw = playwright();
  var browser = await pw.chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  var context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    serviceWorkers: "allow",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  await require("./tools/regression-session").arm(context);
  var posts = [];
  await context.route("https://nexus-api.joesearle.workers.dev/ticks/**", function (route) {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{\"date_key\":\"2099-01-02\",\"mask\":1,\"level\":1}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await context.route("https://nexus-api.joesearle.workers.dev/errors", function (route) {
    posts.push(JSON.parse(route.request().postData() || "{\"errors\":[]}"));
    return route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true,\"stored\":1}" });
  });
  var page = await context.newPage();
  await page.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect && navigator.serviceWorker.controller && window.nexusNoteUpdate; }, null, { timeout: 20000 });
  var resting = await page.evaluate(function () {
    var meta = document.querySelector('meta[name="relic-build"]').getAttribute("content");
    var tag = document.getElementById("nexus-build");
    var style = getComputedStyle(tag);
    return { text: tag.textContent, meta: meta, size: parseFloat(style.fontSize), align: style.textAlign };
  });
  if (resting.text !== "Nexus " + resting.meta || resting.size > 12 || resting.align !== "center") {
    fail("the drawer version is not the build tag " + JSON.stringify(resting));
  } else ok("the drawer shows Nexus " + resting.meta);
  await page.evaluate(function () {
    window.onerror("Same boom", "app.js", 4);
    window.onerror("Same boom", "app.js", 4);
    window.onerror("Other boom", "app.js", 8);
  });
  await page.waitForTimeout(500);
  var sent = posts.reduce(function (sum, body) { return sum + body.errors.length; }, 0);
  var messages = posts.reduce(function (all, body) { return all.concat(body.errors.map(function (row) { return row.message; })); }, []);
  if (sent !== 2 || messages.indexOf("Same boom") === -1 || messages.indexOf("Other boom") === -1 || messages.indexOf("@") !== -1) {
    fail("errors were not deduped " + JSON.stringify(posts));
  } else ok("errors are batched and deduped");
  await page.evaluate(function () {
    var i;
    for (i = 0; i < 25; i++) window.onerror("Extra " + i, "app.js", i);
  });
  await page.waitForTimeout(500);
  var total = posts.reduce(function (sum, body) { return sum + body.errors.length; }, 0);
  if (total !== 20) fail("the session sent " + total + " errors");
  else ok("a session sends at most 20 errors");
  var before = posts.length;
  await context.setOffline(true);
  await page.evaluate(function () { window.onerror("Offline boom", "app.js", 1); });
  await page.waitForTimeout(400);
  if (posts.length !== before) fail("an offline error was posted");
  else ok("an offline error is dropped");
  await context.setOffline(false);
  await page.evaluate(function () {
    window.nexusNoteUpdate({ postMessage: function (data) { window.__skip = data; } });
  });
  var shown = await page.evaluate(function () {
    var pill = document.getElementById("update-pill");
    var clock = document.getElementById("meta-clock").getBoundingClientRect();
    var card = document.querySelector(".hub-card").getBoundingClientRect();
    var box = pill.getBoundingClientRect();
    var color = getComputedStyle(pill).color;
    return {
      text: pill.textContent,
      hidden: pill.hidden,
      color: color,
      belowClock: box.top >= clock.bottom - 1,
      aboveCard: box.bottom <= card.top + 1
    };
  });
  var versionWhileWaiting = await page.evaluate(function () { return document.getElementById("nexus-build").textContent; });
  if (shown.hidden || shown.text !== "Update ready · tap to refresh" || versionWhileWaiting !== "Nexus v104 · update ready" || !shown.belowClock || !shown.aboveCard || shown.color.indexOf("255, 140, 0") === -1) {
    fail("the update pill is wrong " + JSON.stringify(shown) + " " + versionWhileWaiting);
  } else ok("the update pill sits under the clock");
  await page.screenshot({ path: "/opt/cursor/artifacts/v100-update-pill.png" });
  await page.evaluate(function () {
    var toast = document.getElementById("deck-toast");
    if (toast) toast.style.display = "none";
  });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: "/opt/cursor/artifacts/v100-drawer-version.png" });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(200);
  var hiddenWhilePlaying = await page.evaluate(async function () {
    document.body.classList.add("player-open");
    await new Promise(function (resolve) { setTimeout(resolve, 40); });
    var hidden = document.getElementById("update-pill").hidden;
    var during = document.getElementById("nexus-build").textContent;
    document.body.classList.remove("player-open");
    await new Promise(function (resolve) { setTimeout(resolve, 40); });
    return {
      hidden: hidden,
      during: during,
      back: document.getElementById("update-pill").hidden === false,
      label: document.getElementById("nexus-build").textContent
    };
  });
  if (!hiddenWhilePlaying.hidden || hiddenWhilePlaying.during !== "Nexus v104" || !hiddenWhilePlaying.back || hiddenWhilePlaying.label !== "Nexus v104 · update ready") fail("the pill shows over a video " + JSON.stringify(hiddenWhilePlaying));
  else ok("the pill waits until the video closes");
  await context.setOffline(true);
  await page.evaluate(function () {
    return window.nexusFetch("/ticks/2099-01-02", { method: "PUT", body: { mask: 1 } });
  });
  await page.waitForTimeout(200);
  var queued = await page.evaluate(function () { return document.getElementById("update-pill").hidden; });
  if (!queued) fail("the pill shows while a write is queued");
  else ok("the pill waits for an empty outbox");
  await context.setOffline(false);
  await page.evaluate(function () { window.dispatchEvent(new Event("online")); });
  await page.waitForFunction(function () { return document.getElementById("update-pill").hidden === false; }, null, { timeout: 8000 });
  var tapped = await page.evaluate(function () {
    window.nexusReload = function () { window.__reloaded = true; };
    document.getElementById("update-pill").click();
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
    return { skip: window.__skip, reloaded: window.__reloaded === true };
  });
  if (!tapped.skip || tapped.skip.type !== "skip-waiting" || !tapped.reloaded) fail("a tap did not refresh " + JSON.stringify(tapped));
  else ok("a tap asks the worker to take over and reloads");
  await browser.close();
  if (failed) {
    console.error(failed + " v100 check(s) failed");
    process.exit(1);
  }
  console.log("OK v100");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
