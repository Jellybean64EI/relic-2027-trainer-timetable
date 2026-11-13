/* Nexus v98: drawer hairline and swipe-to-close. */
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
var css = fs.readFileSync("styles.css", "utf8");
if (html.indexOf('content="v100"') === -1 || app.indexOf('build: "v100"') === -1) fail("cache stamp is not v100");
else ok("cache stamp is v100");
if (html.indexOf("nav-drawer-rule") === -1 || css.indexOf(".nav-drawer-rule") === -1) fail("drawer hairline is missing");
else ok("drawer hairline is in the page");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

async function swipe(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 12 });
  await page.mouse.up();
}

(async function () {
  if (failed) {
    console.error(failed + " v98 check(s) failed");
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
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  var page = await context.newPage();
  var errors = [];
  page.on("console", function (msg) { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto("http://127.0.0.1:8080/?v=v100", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect; });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(450);
  var gap = await page.evaluate(function () {
    var burger = document.getElementById("btn-nav-toggle").getBoundingClientRect();
    var rule = document.querySelector(".nav-drawer-rule").getBoundingClientRect();
    var cabins = document.getElementById("nav-cabins-label").getBoundingClientRect();
    var style = getComputedStyle(document.querySelector(".nav-drawer-rule"));
    return {
      ruleBelow: rule.top >= burger.bottom - 2,
      gapBelow: cabins.top - rule.bottom,
      clear: cabins.top > burger.bottom + 4,
      line: parseFloat(style.borderBottomWidth),
      open: document.body.classList.contains("nav-open")
    };
  });
  if (!gap.open || !gap.ruleBelow || gap.gapBelow < 8 || !gap.clear || gap.line < 1) {
    fail("the hairline does not clear the burger " + JSON.stringify(gap));
  } else ok("the hairline sits under the burger with a gap");
  await page.evaluate(function () { document.getElementById("btn-nav-toggle").click(); });
  await page.waitForTimeout(200);
  var before = await page.evaluate(function () {
    window.scrollTo(0, 220);
    document.getElementById("btn-nav-toggle").click();
    return { title: document.getElementById("page-title").textContent, scroll: window.scrollY };
  });
  await page.waitForTimeout(200);
  var box = await page.locator("#nav-drawer").boundingBox();
  await swipe(page, box.x + box.width * 0.6, box.y + 260, box.x + 20, box.y + 264);
  await page.waitForTimeout(400);
  var closed = await page.evaluate(function (start) {
    return {
      open: document.body.classList.contains("nav-open"),
      title: document.getElementById("page-title").textContent,
      scroll: window.scrollY,
      sameScroll: Math.abs(window.scrollY - start.scroll) < 4
    };
  }, before);
  if (closed.open || closed.title !== before.title || !closed.sameScroll) {
    fail("swipe-left did not keep the page " + JSON.stringify(closed));
  } else ok("swipe-left closes the drawer and keeps the page");
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(450);
  await swipe(page, box.x + 70, box.y + 220, box.x + 74, box.y + 360);
  await page.waitForTimeout(200);
  var scrolled = await page.evaluate(function () { return document.body.classList.contains("nav-open"); });
  if (!scrolled) fail("a vertical drag closed the drawer");
  else ok("a vertical drag leaves the drawer open");
  await page.locator('[data-os-door="account"]').click();
  await page.waitForTimeout(300);
  var row = await page.evaluate(function () {
    return {
      open: document.body.classList.contains("nav-open"),
      title: document.getElementById("page-title").textContent
    };
  });
  if (row.open || row.title !== "Account Profile") fail("a row tap did not navigate " + JSON.stringify(row));
  else ok("a row tap still navigates");
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(500);
  var scrim = await page.locator("#nav-drawer").boundingBox();
  await page.mouse.click(scrim.x + scrim.width + 24, 400);
  await page.waitForTimeout(350);
  var backdrop = await page.evaluate(function () {
    return document.body.classList.contains("nav-open") === false && document.getElementById("page-title").textContent === "Account Profile";
  });
  if (!backdrop) fail("a backdrop tap did not close the drawer");
  else ok("a backdrop tap closes the drawer");
  if (errors.length) fail("console errors " + errors.join(" | "));
  else ok("no console errors");
  await browser.close();
  if (failed) {
    console.error(failed + " v98 check(s) failed");
    process.exit(1);
  }
  console.log("OK v98");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
