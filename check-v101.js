/* Nexus v104: the temporary 2026 Pre Schedules cabin. */
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
var config = fs.readFileSync("data/nexusConfig.js", "utf8");
if (html.indexOf('content="v104"') === -1 || app.indexOf('build: "v104"') === -1) fail("cache stamp is not v104");
else ok("cache stamp is v104");
if (html.indexOf("pre2026.css?v=v104") === -1 || html.indexOf("pre2026.js?v=v104") === -1) fail("the includes are missing");
else if (html.indexOf('data-os-door="pre2026"') !== -1 || html.indexOf('id="pre2026-root"') !== -1) fail("the cabin is hard-coded in the page");
else ok("the cabin is included, not hard-coded");
if (config.indexOf("PRE2026_ENABLED") === -1 || config.indexOf("2026-12-31") === -1) fail("the flag is missing");
else ok("the flag turns off after 31 Dec 2026");
if (app.indexOf("pre2026-hook") === -1 || fs.readFileSync("builder.js", "utf8").indexOf("pre2026-hook") === -1) fail("the hooks are missing");
else ok("the hooks are marked");
if (sw.indexOf('CACHE = "nexus-v104"') === -1 || sw.indexOf("/pre2026.js?v=v104") === -1 || sw.indexOf("/pre2026.css?v=v104") === -1) fail("the shell cache missed the cabin");
else ok("the shell cache includes the cabin");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v101 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  var context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  await require("./tools/regression-session").arm(context);
  var ticks = [];
  var planPuts = [];
  await context.route("https://nexus-api.joesearle.workers.dev/**", function (route) {
    var req = route.request();
    var url = new URL(req.url());
    if (url.pathname.indexOf("/ticks") === 0) ticks.push(req.method() + " " + url.pathname);
    if (req.method() === "PUT" && url.pathname === "/training-plan-week") {
      planPuts.push(req.postData() || "");
      return route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
    }
    return route.fallback();
  });
  var page = await context.newPage();
  await page.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect && document.querySelector('[data-os-door="pre2026"]'); }, null, { timeout: 20000 });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(400);
  var menu = await page.evaluate(function () {
    var labels = Array.prototype.map.call(document.querySelectorAll(".cabin-list .nav-row-label"), function (node) { return node.textContent; });
    var account = document.querySelector('[data-os-door="account"]');
    var pre = document.querySelector('[data-os-door="pre2026"]');
    return {
      labels: labels,
      build: document.getElementById("nexus-build").textContent,
      accountAfter: !!(account && pre && pre.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING)
    };
  });
  if (menu.labels.join("|") !== "Training and Meal Schedules Hub|2026 Pre Schedules" || menu.build !== "Nexus v104" || !menu.accountAfter) {
    fail("the drawer row is wrong " + JSON.stringify(menu));
  } else ok("the drawer lists Hub, 2026 Pre, then Account");
  ticks = [];
  await page.locator('[data-os-door="pre2026"]').click();
  await page.waitForTimeout(800);
  var pageInfo = await page.evaluate(function () {
    var root = document.getElementById("pre2026-root");
    return {
      title: document.getElementById("page-title").textContent,
      hidden: root.hidden,
      weeks: root.querySelectorAll("[data-pre-week]").length,
      phases: Array.prototype.map.call(root.querySelectorAll(".pre-phase"), function (node) { return node.textContent.replace(/\s+/g, " ").trim(); }),
      week1: root.querySelector('[data-pre-week="0"]').textContent.replace(/\s+/g, " "),
      selected: root.querySelector(".pre-week.is-on").getAttribute("data-pre-week"),
      rest: root.textContent.indexOf("Rest") !== -1,
      ticks: root.querySelectorAll(".tick-hit, .done-cell, .tick-pair").length,
      done: root.textContent.indexOf("DONE") !== -1,
      names: root.textContent.indexOf("2026 Pre") !== -1,
      dot: document.getElementById("sync-dot").hidden
    };
  });
  if (pageInfo.title !== "2026 Pre Schedules" || pageInfo.hidden || pageInfo.weeks !== 7 || pageInfo.selected !== "0" || pageInfo.week1.indexOf("16–21 Nov") === -1 || !pageInfo.rest || pageInfo.ticks || pageInfo.done || !pageInfo.dot) {
    fail("the page is wrong " + JSON.stringify(pageInfo));
  } else if (pageInfo.phases.join(" | ").indexOf("Weeks 1–2") === -1 || pageInfo.phases.join(" | ").indexOf("Wake Up") === -1 || pageInfo.phases.join(" | ").indexOf("Loosen") === -1 || pageInfo.phases.join(" | ").indexOf("Bridge to January") === -1) {
    fail("the phases are wrong " + pageInfo.phases.join(" | "));
  } else ok("week 1 opens with seven weeks, Rest, and no ticks");
  if (!pageInfo.names) fail("the live 2026 Pre names are missing");
  else ok("the page shows the placed 2026 Pre names");
  if (ticks.length) fail("the cabin called ticks " + ticks.join(", "));
  else ok("the cabin makes no tick requests");
  await page.locator("#pre2026-root .page-back").click();
  await page.waitForTimeout(300);
  var back = await page.evaluate(function () {
    return {
      title: document.getElementById("page-title").textContent,
      tab: document.querySelector('.hub-tab[data-hub-tab="schedules"]').getAttribute("aria-selected"),
      year: window.RelicArchitect.viewYear
    };
  });
  if (back.title !== "Training Schedules" || back.tab !== "true" || back.year !== 2027) fail("Back did not return to 2027 training " + JSON.stringify(back));
  else ok("Back returns to the 2027 Training tab");
  await page.evaluate(function () { window.RelicArchitect.applyOsDoor("cards"); });
  await page.locator('[data-sched-tab="mine"]').click();
  await page.waitForSelector(".sched-row .sched-pre", { timeout: 15000 });
  var library = await page.evaluate(function () {
    var rows = document.querySelectorAll("#sched-list .sched-row");
    var bad = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var actions = row.querySelector(".sched-row-actions");
      var html = actions ? actions.innerHTML : "";
      if (html.indexOf("data-sched-pre") === -1) bad += 1;
      if (html.indexOf("data-sched-fav") > html.indexOf("data-sched-pre") || html.indexOf("data-sched-pre") > html.indexOf("data-sched-edit")) bad += 1;
    });
    return { rows: rows.length, bad: bad };
  });
  if (!library.rows || library.bad) fail("the library button is missing " + JSON.stringify(library));
  else ok("every schedule row has → 2026 Pre between the star and Edit");
  ticks = [];
  await page.locator(".sched-pre").first().click();
  await page.waitForSelector("#pre2026-send .pre-day");
  var picker = await page.evaluate(function () {
    var options = Array.prototype.map.call(document.querySelectorAll("#pre2026-send .pre-day option"), function (option) { return option.value; });
    var sundays = options.filter(function (key) { return new Date(key + "T00:00:00Z").getUTCDay() === 0; });
    return {
      count: options.length,
      first: options[0],
      last: options[options.length - 1],
      sundays: sundays.length,
      lines: document.querySelectorAll("#pre2026-send .pre-line").length
    };
  });
  if (picker.count !== 40 || picker.first !== "2026-11-16" || picker.last !== "2026-12-31" || picker.sundays || picker.lines !== 2) {
    fail("the send sheet days are wrong " + JSON.stringify(picker));
  } else ok("the send sheet lists 40 Mon–Sat days");
  await page.locator("[data-pre-send]").click();
  await page.waitForTimeout(500);
  var body = planPuts[0] ? JSON.parse(planPuts[0]) : null;
  var entry = body && body.entries && body.entries[0];
  if (planPuts.length !== 1 || !entry || entry.plan_key !== "2026-11-16" || entry.line !== 1 || entry.plan_key.indexOf("upper:") === 0 || ticks.length) {
    fail("send did not write one bare 2026 key " + JSON.stringify({ puts: planPuts, ticks: ticks }));
  } else ok("send writes one bare 2026 plan entry and no ticks");

  var off = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await require("./tools/regression-session").arm(off);
  var configText = fs.readFileSync("data/nexusConfig.js", "utf8");
  await off.route("**/data/nexusConfig.js*", function (route) {
    route.fulfill({ contentType: "text/javascript", body: configText + "\nwindow.PRE2026_ENABLED = false;\n" });
  });
  var offPage = await off.newPage();
  await offPage.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  await offPage.waitForFunction(function () { return window.RelicArchitect; });
  await offPage.waitForTimeout(400);
  var gone = await offPage.evaluate(function () {
    return {
      door: document.querySelector('[data-os-door="pre2026"]'),
      root: document.getElementById("pre2026-root"),
      button: document.querySelector(".sched-pre")
    };
  });
  if (gone.door || gone.root || gone.button) fail("the flag off still left cabin markup");
  else ok("the flag off leaves the v100 DOM");
  await browser.close();
  if (failed) {
    console.error(failed + " v101 check(s) failed");
    process.exit(1);
  }
  console.log("OK v101");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
