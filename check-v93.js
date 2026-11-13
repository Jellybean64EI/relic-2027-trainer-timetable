/* Nexus v93: mobile polish. Workshop, tap targets, food reminder, chrome, favicon. */
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
var deck = fs.readFileSync("deck.js", "utf8");
if (html.indexOf('content="v99"') === -1 || app.indexOf('build: "v99"') === -1) fail("cache stamp is not v99");
else ok("cache stamp is v99");
if (html.indexOf('rel="icon"') === -1 || html.indexOf("assets/nexus-icon.png") === -1 || html.indexOf("apple-touch-icon.png") === -1) fail("favicon link is missing");
else ok("favicon is linked");
if (html.indexOf('id="hub-daily"') === -1 || deck.indexOf('body.appendChild(el("p", "hub-daily"') !== -1) fail("Brazil nuts are not pinned under the stepper");
else ok("Brazil nuts sit under the month stepper");
if (app.indexOf("btn.hidden = true") === -1) fail("the header lock is still shown on the hub");
else ok("the header lock stays off the hub");
if (css.indexOf(".plan-pick") === -1 || css.indexOf("width: 44px") === -1) fail("44px targets are missing");
else ok("44px targets are in the stylesheet");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v93 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"]
  });
  var context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3.5,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  });
  var page = await context.newPage();
  var client = await context.newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  var consoleErrors = [];
  var missing = [];
  page.on("console", function (msg) {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", function (res) {
    var url = res.url();
    if (res.status() >= 400 && (url.indexOf("favicon") !== -1 || url.indexOf("nexus-icon") !== -1)) missing.push(res.status() + " " + url);
  });
  await page.goto("http://127.0.0.1:8080/?v=v99&date=2026-11-13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect; });
  await page.evaluate(function () {
    var toast = document.getElementById("deck-toast");
    if (toast) toast.style.display = "none";
  });
  var chrome = await page.evaluate(function () {
    var today = document.getElementById("meta-today").textContent;
    var meta = document.getElementById("week-meta").textContent;
    var cite = document.body.innerText;
    var pick = document.querySelector(".plan-pick");
    var probe = document.createElement("button");
    probe.className = "plan-pick";
    document.body.appendChild(probe);
    var size = probe.getBoundingClientRect();
    probe.remove();
    return {
      today: today,
      meta: meta,
      underscore: cite.indexOf("_Trainer_") !== -1,
      numbered: cite.indexOf("1. Back Trainer") !== -1 || cite.indexOf("1. Back_Trainer") !== -1,
      pick: size.width,
      live: pick ? pick.getBoundingClientRect().width : 0
    };
  });
  if (chrome.today !== "13 Nov · Fri") fail("today is " + chrome.today);
  else ok("today reads 13 Nov · Fri");
  if (chrome.meta.indexOf("calendar order") !== -1 || chrome.meta.indexOf("–") === -1 || chrome.meta.indexOf("2027") === -1) fail("week meta is " + chrome.meta);
  else ok("week meta is " + chrome.meta);
  if (chrome.underscore || chrome.numbered) fail("citation labels are still raw");
  else ok("citation labels use spaces and drop the 1.");
  if (chrome.pick < 44) fail("plan-pick is " + chrome.pick);
  else ok("plan-pick hit area is " + chrome.pick);
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(500);
  await page.locator('[data-os-door="hub"]').click();
  await page.waitForTimeout(300);
  var hub = await page.evaluate(function () {
    var lock = document.getElementById("btn-future-lock");
    var daily = document.getElementById("hub-daily");
    var body = document.getElementById("hub-month-body");
    var prev = document.getElementById("hub-month-prev");
    var firstDay = body.querySelector(".deck-day");
    return {
      lock: lock.hidden === true || getComputedStyle(lock).display === "none",
      dailyBefore: !!(daily && firstDay && daily.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING),
      dailyText: daily ? daily.textContent : "",
      prev: prev.disabled,
      prevOpacity: getComputedStyle(prev).opacity,
      five: body.innerText.indexOf("5 a day: 0") !== -1,
      ambient: getComputedStyle(document.querySelector(".ambient-field")).display
    };
  });
  if (!hub.lock) fail("hub training tab shows the header lock");
  else ok("hub training tab hides the header lock");
  await page.locator("#hub-tab-food").click();
  await page.waitForTimeout(250);
  var food = await page.evaluate(function () {
    var lock = document.getElementById("btn-future-lock");
    var daily = document.getElementById("hub-daily");
    var body = document.getElementById("hub-month-body");
    var firstDay = body.querySelector(".deck-day");
    var prev = document.getElementById("hub-month-prev");
    return {
      lockHidden: lock.hidden === true || getComputedStyle(lock).display === "none",
      dailyBefore: !!(daily && firstDay && daily.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING),
      dailyText: daily ? daily.textContent : "",
      prev: prev.disabled,
      prevOpacity: getComputedStyle(prev).opacity,
      five: body.innerText.indexOf("5 a day: 0") !== -1
    };
  });
  if (!food.lockHidden) fail("the lock stays on Food Schedules");
  else ok("the lock hides on Food Schedules");
  if (!food.dailyBefore || food.dailyText !== "Daily: 2 Brazil nuts") fail("Brazil nuts are not above the days " + food.dailyText);
  else ok("Daily: 2 Brazil nuts is above the days");
  if (!food.prev || Number(food.prevOpacity) > 0.5) fail("the disabled month arrow is not dim " + food.prevOpacity);
  else ok("the disabled month arrow is dim");
  if (food.five) fail("empty days still say 5 a day: 0");
  else ok("empty days do not say 5 a day: 0");
  await page.locator("#meals-open").click();
  await page.waitForTimeout(300);
  var workshop = await page.evaluate(function () {
    var mount = document.querySelector("#deck-root-food [data-deck-bubble]");
    var before = mount.textContent.trim();
    document.querySelector('[data-deck-add="food"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    var after = mount.textContent;
    var clear = mount.querySelector(".deck-x");
    var clearSize = clear ? clear.getBoundingClientRect() : { width: 0, height: 0 };
    if (clear) clear.click();
    return { before: before, opened: after.indexOf("Front") !== -1 && after.indexOf("Save") !== -1, closed: mount.textContent.trim() === "", clear: clearSize.width };
  });
  if (workshop.before || !workshop.opened || !workshop.closed || workshop.clear < 44) fail("the add-card workshop is wrong " + JSON.stringify(workshop));
  else ok("the add-card workshop stays closed until + Add cards");
  await page.evaluate(function () {
    var real = window.nexusFetch;
    window.nexusFetch = function (path, opts) {
      var url = String(path || "");
      if (url.indexOf("/account") === 0) return Promise.resolve({ ok: true, profile: { name: null, dob: null, heightCm: null, startWeightKg: null, startDate: null, updatedAt: null } });
      if (url.indexOf("/weights") === 0) return Promise.resolve({ ok: true, weights: [] });
      return real(path, opts);
    };
  });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(500);
  await page.locator('[data-os-door="account"]').click();
  await page.waitForTimeout(250);
  await page.locator("#account-open-weight").click();
  await page.waitForTimeout(200);
  var account = await page.evaluate(function () {
    var unit = document.querySelector(".account-unit button");
    var probe = document.createElement("button");
    probe.className = "account-unit";
    var btn = document.createElement("button");
    var wrap = document.createElement("p");
    wrap.className = "account-unit";
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    var height = btn.getBoundingClientRect().height;
    wrap.remove();
    return {
      ambient: getComputedStyle(document.querySelector(".ambient-field")).display,
      months: document.querySelectorAll(".account-months tr").length,
      unit: height,
      liveUnit: unit ? unit.getBoundingClientRect().height : height
    };
  });
  if (account.ambient !== "none") fail("account ambient is " + account.ambient);
  else ok("account hides the ambient field");
  if (account.months !== 0) fail("empty 2027 months are still listed");
  else ok("an anchor-less weight page lists no empty months");
  if (account.unit < 44) fail("unit toggle is " + account.unit);
  else ok("unit toggles are " + account.unit + "px");
  await page.evaluate(function () { window.RelicArchitect.applyOsDoor("cards"); });
  await page.waitForTimeout(200);
  var cards = await page.evaluate(function () {
    return getComputedStyle(document.querySelector(".ambient-field")).display;
  });
  if (cards !== "none") fail("video cards still show the ambient field");
  else ok("video cards hide the ambient field");
  var icons = await page.evaluate(function () {
    return Promise.all(["favicon.ico", "assets/nexus-icon.png", "assets/nexus-icon-192.png", "apple-touch-icon.png"].map(function (path) {
      return fetch(path).then(function (res) { return res.status + " " + path; });
    }));
  });
  var sized = await page.evaluate(function () {
    function load(path) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(path + " " + img.naturalWidth + "x" + img.naturalHeight); };
        img.onerror = function () { resolve(path + " error"); };
        img.src = path;
      });
    }
    return Promise.all([load("assets/nexus-icon.png"), load("assets/nexus-icon-192.png"), load("apple-touch-icon.png")]);
  });
  if (icons.join(" ") !== "200 favicon.ico 200 assets/nexus-icon.png 200 assets/nexus-icon-192.png 200 apple-touch-icon.png" || sized.join(" ") !== "assets/nexus-icon.png 512x512 assets/nexus-icon-192.png 192x192 apple-touch-icon.png 180x180" || missing.length || consoleErrors.length) {
    fail("console or favicon " + JSON.stringify({ icons: icons, sized: sized, missing: missing, consoleErrors: consoleErrors }));
  } else ok("no console errors and the Nexus icons load");
  await browser.close();
  if (failed) {
    console.error(failed + " v93 check(s) failed");
    process.exit(1);
  }
  console.log("OK v93");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
