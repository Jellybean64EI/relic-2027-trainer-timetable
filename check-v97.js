/* Nexus v97: Back returns to the hub from meals and the video library. */
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
if (html.indexOf('content="v101"') === -1 || app.indexOf('build: "v101"') === -1) fail("cache stamp is not v101");
else ok("cache stamp is v101");
if ((html.match(/data-hub-back="food"/g) || []).length !== 3) fail("meals back buttons are missing");
else ok("each meals tab has a Back button");
if (fs.readFileSync("cards.js", "utf8").indexOf('data-hub-back="schedules"') === -1) fail("library back button is missing");
else ok("the library has a Back button");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v97 check(s) failed");
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
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  var page = await context.newPage();
  var errors = [];
  page.on("console", function (msg) { if (msg.type() === "error") errors.push(msg.text()); });
  var tabs = ["food", "smoothies", "porridge"];
  var t;
  for (t = 0; t < tabs.length; t++) {
    await page.goto("http://127.0.0.1:8080/?v=v101&door=" + tabs[t], { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect; });
    var back = await page.evaluate(function (tab) {
      var root = tab === "food" ? "deck-root-food" : tab === "smoothies" ? "deck-root-smoothie" : "deck-root-porridge";
      var button = document.querySelector("#" + root + " .page-back");
      var add = document.querySelector("#" + root + " .deck-add");
      var box = button.getBoundingClientRect();
      var row = button.parentElement.getBoundingClientRect();
      var mid = window.innerWidth / 2;
      var range = document.createRange();
      range.selectNodeContents(add);
      var textBox = range.getBoundingClientRect();
      return {
        text: button.textContent,
        shown: button.getClientRects().length > 0,
        size: Math.min(box.width, box.height),
        right: row.right - box.right < 2,
        centered: Math.abs((textBox.left + textBox.right) / 2 - mid) < 24
      };
    }, tabs[t]);
    if (!back.shown || back.text.indexOf("Back") === -1 || back.size < 44 || !back.right || !back.centered) {
      fail(tabs[t] + " back button is wrong " + JSON.stringify(back));
    } else ok(tabs[t] + " shows Back on the right of + Add cards");
    await page.locator("#" + (tabs[t] === "food" ? "deck-root-food" : tabs[t] === "smoothies" ? "deck-root-smoothie" : "deck-root-porridge") + " .page-back").click();
    await page.waitForTimeout(250);
    var hub = await page.evaluate(function () {
      return {
        title: document.getElementById("page-title").textContent,
        tab: document.getElementById("hub-tab-food").getAttribute("aria-selected"),
        door: new URL(location.href).searchParams.get("door"),
        stored: localStorage.getItem("relic_hub_tab")
      };
    });
    if (hub.title !== "Meal Schedules" || hub.tab !== "true" || hub.door !== "hub" || hub.stored !== "food") {
      fail(tabs[t] + " back did not open Meal Schedules " + JSON.stringify(hub));
    } else ok(tabs[t] + " Back opens the Meal Schedules hub");
  }
  await page.goto("http://127.0.0.1:8080/?v=v101&door=cards", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.querySelector("#vcards-root .page-back"); });
  var library = await page.evaluate(function () {
    var button = document.querySelector("#vcards-root .page-back");
    var upload = document.getElementById("vc-upload-btn");
    var box = button.getBoundingClientRect();
    var uploadBox = upload.getBoundingClientRect();
    return {
      shown: button.getClientRects().length > 0,
      size: Math.min(box.width, box.height),
      right: box.right > uploadBox.right,
      title: document.getElementById("page-title").textContent
    };
  });
  if (!library.shown || library.size < 44 || !library.right || library.title !== "Trainer Video Library") {
    fail("library back button is wrong " + JSON.stringify(library));
  } else ok("the library shows Back on the right of Upload video");
  await page.locator("#vcards-root .page-back").click();
  await page.waitForTimeout(250);
  var training = await page.evaluate(function () {
    return {
      title: document.getElementById("page-title").textContent,
      tab: document.getElementById("hub-tab-schedules").getAttribute("aria-selected"),
      door: new URL(location.href).searchParams.get("door"),
      stored: localStorage.getItem("relic_hub_tab")
    };
  });
  if (training.title !== "Training Schedules" || training.tab !== "true" || training.door !== "hub" || training.stored !== "schedules") {
    fail("library back did not open Training Schedules " + JSON.stringify(training));
  } else ok("library Back opens the Training Schedules hub");
  await page.goto("http://127.0.0.1:8080/?v=v101&door=training", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.getElementById("tt-body"); });
  var still = await page.evaluate(function () {
    return document.getElementById("page-title").textContent === "Training Schedules" && document.getElementById("tt-body").getClientRects().length > 0;
  });
  if (!still) fail("door=training no longer opens the timetable");
  else ok("door=training still opens the timetable");
  if (errors.length) fail("console errors " + errors.join(" | "));
  else ok("no console errors");
  await browser.close();
  if (failed) {
    console.error(failed + " v97 check(s) failed");
    process.exit(1);
  }
  console.log("OK v97");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
