/* Nexus v102: the 2027 board stays hidden on the 2026 Pre page. */
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
if (html.indexOf('content="v102"') === -1 || app.indexOf('build: "v102"') === -1) fail("cache stamp is not v102");
else ok("cache stamp is v102");
if (sw.indexOf('CACHE = "nexus-v102"') === -1) fail("the shell cache is not v102");
else ok("the shell cache is v102");
if (fs.readFileSync("pre2026.css", "utf8").indexOf("body.is-pre2026 #training-board") === -1) fail("the 2027 board is not hidden");
else ok("the 2027 board is hidden in the cabin stylesheet");

var SELECTORS = [
  ".schedule-mode", ".live-stack", ".mode-pair", ".phase-bar", ".month-bar", ".week-tabs",
  ".week-meta", ".schedule-switch", "#btn-future-lock", "#training-board", "#planner-board",
  "#banner-live", "#banner-coach", ".card > .ambient-field"
];

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v102 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  var widths = [390, 412];
  var w;
  for (w = 0; w < widths.length; w++) {
    var width = widths[w];
    var context = await browser.newContext({
      viewport: { width: width, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2
    });
    var page = await context.newPage();
    await page.goto("http://127.0.0.1:8080/?door=pre2026", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () {
      var root = document.getElementById("pre2026-root");
      return document.body.classList.contains("is-pre2026") && root && root.getBoundingClientRect().height > 40;
    });
    var hidden = await page.evaluate(function (selectors) {
      function gone(selector) {
        var el = document.querySelector(selector);
        if (!el) return true;
        var style = getComputedStyle(el);
        var box = el.getBoundingClientRect();
        return style.display === "none" || style.visibility === "hidden" || el.hidden || (box.width === 0 && box.height === 0);
      }
      var root = document.getElementById("pre2026-root");
      var rootBox = root.getBoundingClientRect();
      var bad = selectors.filter(function (selector) { return !gone(selector); });
      return {
        bad: bad,
        root: root && !root.hidden && getComputedStyle(root).display !== "none" && rootBox.height > 0,
        label: document.getElementById("nexus-build").textContent
      };
    }, SELECTORS);
    if (!hidden.root || hidden.bad.length || hidden.label !== "Nexus v102") {
      fail(width + " the 2027 board still shows " + JSON.stringify(hidden));
    } else ok(width + " only the 2026 Pre page shows");
    await page.locator("#pre2026-root .page-back").click();
    await page.waitForFunction(function () { return !document.body.classList.contains("is-pre2026"); });
    var back = await page.evaluate(function () {
      var board = document.getElementById("training-board");
      var tabs = document.querySelector(".week-tabs");
      function shown(el) {
        if (!el) return false;
        var style = getComputedStyle(el);
        var box = el.getBoundingClientRect();
        return style.display !== "none" && !el.hidden && box.height > 0;
      }
      return {
        title: document.getElementById("page-title").textContent,
        board: shown(board),
        tabs: shown(tabs),
        klass: document.body.classList.contains("is-pre2026")
      };
    });
    if (back.klass || back.title !== "Training Schedules" || !back.board || !back.tabs) {
      fail(width + " Back did not restore the hub " + JSON.stringify(back));
    } else ok(width + " Back restores the hub Training board");
    await context.close();
  }
  var off = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  var configText = fs.readFileSync("data/nexusConfig.js", "utf8");
  await off.route("**/data/nexusConfig.js*", function (route) {
    route.fulfill({ contentType: "text/javascript", body: configText + "\nwindow.PRE2026_ENABLED = false;\n" });
  });
  var offPage = await off.newPage();
  await offPage.goto("http://127.0.0.1:8080/?door=hub", { waitUntil: "domcontentloaded" });
  await offPage.waitForFunction(function () { return window.RelicArchitect; });
  await offPage.waitForTimeout(300);
  var gone = await offPage.evaluate(function () {
    return {
      klass: document.body.classList.contains("is-pre2026"),
      door: !!document.querySelector('[data-os-door="pre2026"]'),
      root: !!document.getElementById("pre2026-root"),
      button: !!document.querySelector(".sched-pre")
    };
  });
  if (gone.klass || gone.door || gone.root || gone.button) fail("the flag off still changes the page " + JSON.stringify(gone));
  else ok("the flag off leaves the page unchanged");
  await browser.close();
  if (failed) {
    console.error(failed + " v102 check(s) failed");
    process.exit(1);
  }
  console.log("OK v102");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
