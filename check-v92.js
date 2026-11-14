/* Nexus v92: Account Info and Live Weight, with the storage path still hidden. */
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
if (html.indexOf('content="v104"') === -1 || app.indexOf('build: "v104"') === -1) fail("cache stamp is not v104");
else ok("cache stamp is v104");
if (html.indexOf("In design") !== -1 || app.indexOf("In design") !== -1) fail("In design is still in the page");
else ok("In design is gone");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

async function touch(client, page, x, y) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x, y: y, id: 1 }] });
  await page.waitForTimeout(20);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openDoor(page, client, name) {
  var has = await page.$('[data-os-door="' + name + '"]');
  if (!has) {
    await page.evaluate(function (door) { window.RelicArchitect.applyOsDoor(door); }, name);
    await page.waitForTimeout(300);
    return;
  }
  if (!await page.evaluate(function () { return document.body.classList.contains("nav-open"); })) {
    await page.locator("#btn-nav-toggle").click();
    await page.waitForTimeout(500);
  }
  var point = await page.evaluate(function (door) {
    var rect = document.querySelector('[data-os-door="' + door + '"]').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + Math.min(20, rect.height / 2) };
  }, name);
  await touch(client, page, point.x, point.y);
  await page.waitForTimeout(300);
}

async function tapId(page, client, id) {
  var point = await page.evaluate(function (nodeId) {
    var rect = document.getElementById(nodeId).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, id);
  await touch(client, page, point.x, point.y);
  await page.waitForTimeout(200);
}

(async function () {
  if (failed) {
    console.error(failed + " v92 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"]
  });
  var setups = [
    { width: 360, height: 740, dpr: 1, deep: false },
    { width: 390, height: 844, dpr: 1, deep: true },
    { width: 412, height: 915, dpr: 3.5, deep: false }
  ];
  var s;
  for (s = 0; s < setups.length; s++) {
    var width = setups[s].width;
    var context = await browser.newContext({
      viewport: { width: width, height: setups[s].height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: setups[s].dpr,
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    });
    await require("./tools/regression-session").arm(context);
    await context.addInitScript(function () {
      function read() {
        try { return JSON.parse(localStorage.getItem("v92-mock")) || { profile: null, weights: [] }; }
        catch (err) { return { profile: null, weights: [] }; }
      }
      function write(data) { localStorage.setItem("v92-mock", JSON.stringify(data)); }
      window.__v92 = { read: read, write: write };
    });
    var page = await context.newPage();
    var client = await context.newCDPSession(page);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    page.on("dialog", function (dialog) { dialog.accept(); });
    await page.goto("http://127.0.0.1:8080/?v=v104&date=2026-11-12", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusAccount; });
    await page.evaluate(function () {
      var toast = document.getElementById("deck-toast");
      if (toast) toast.style.display = "none";
      var real = window.nexusFetch;
      window.nexusFetch = function (path, opts) {
        var url = String(path || "");
        var method = String((opts && opts.method) || "GET").toUpperCase();
        var store = window.__v92.read();
        if (url.indexOf("/account") !== 0 && url.indexOf("/weights") !== 0) return real(path, opts);
        if (url === "/account" && method === "GET") return Promise.resolve({ ok: true, profile: store.profile || { name: null, dob: null, heightCm: null, startWeightKg: null, startDate: null, updatedAt: null } });
        if (url === "/account" && method === "PUT") {
          var body = opts.body;
          var current = store.profile;
          if (current && current.startWeightKg != null && body.startWeightKg != null && Number(body.startWeightKg) !== Number(current.startWeightKg)) {
            var error = new Error("starting weight is locked");
            error.status = 409;
            return Promise.reject(error);
          }
          var next = {
            name: body.name,
            dob: body.dob,
            heightCm: body.heightCm,
            startWeightKg: current && current.startWeightKg != null ? current.startWeightKg : body.startWeightKg,
            startDate: current && current.startWeightKg != null ? current.startDate : body.startDate,
            updatedAt: "2026-11-12T00:00:00.000Z"
          };
          store.profile = next;
          window.__v92.write(store);
          return Promise.resolve({ ok: true, profile: next });
        }
        if (url === "/weights" && method === "GET") return Promise.resolve({ ok: true, weights: store.weights });
        if (url === "/weights" && method === "PUT") {
          var entry = { week: window.NexusAccount.isoWeek(opts.body.date), date: opts.body.date, weightKg: window.NexusAccount.round1(opts.body.weightKg), updatedAt: "2026-11-12" };
          var updated = store.weights.some(function (row) { return row.week === entry.week; });
          store.weights = store.weights.filter(function (row) { return row.week !== entry.week; });
          store.weights.push(entry);
          window.__v92.write(store);
          return Promise.resolve({ ok: true, updated: updated, entry: entry });
        }
        if (url.indexOf("/weights/") === 0 && method === "DELETE") {
          var week = decodeURIComponent(url.slice("/weights/".length));
          store.weights = store.weights.filter(function (row) { return row.week !== week; });
          window.__v92.write(store);
          return Promise.resolve({ ok: true, week: week });
        }
        return real(path, opts);
      };
    });
    await page.evaluate(function () {
      var toast = document.getElementById("deck-toast");
      if (toast) toast.style.display = "none";
    });
    await openDoor(page, client, "account");
    var tiles = await page.evaluate(function () {
      return {
        labels: Array.prototype.map.call(document.querySelectorAll("#account-tiles .account-tile"), function (node) { return node.textContent.replace(/\s+/g, " ").trim(); }),
        stray: document.body.innerText.indexOf("In design") !== -1
      };
    });
    if (tiles.stray || tiles.labels.join("|").toLowerCase() !== "account info|live weight stats|training stats|log out") {
      fail(width + " tile order is wrong " + JSON.stringify(tiles));
    } else ok(width + " tiles are Account Info, Live Weight, Training Stats, and Log out");
    await tapId(page, client, "account-open-weight");
    var empty = await page.evaluate(function () {
      return document.getElementById("account-weight-body").innerText;
    });
    if (empty.indexOf("Set your starting weight in Account Info first") === -1) fail(width + " missing the no-anchor state");
    else ok(width + " Live Weight asks for a starting weight");
    await tapId(page, client, "account-need-anchor");
    var infoOpen = await page.evaluate(function () {
      return getComputedStyle(document.getElementById("account-info")).display !== "none";
    });
    if (!infoOpen) fail(width + " the anchor button did not open Account Info");
    else ok(width + " Account Info opens");
    await page.locator("#account-info [data-account-back]").click();
    await tapId(page, client, "account-open-stats");
    var statsOpen = await page.evaluate(function () {
      return getComputedStyle(document.getElementById("hub-stats")).display !== "none" && getComputedStyle(document.getElementById("account-tiles")).display === "none";
    });
    if (!statsOpen) fail(width + " Training Stats did not open");
    else ok(width + " Training Stats opens");
    await page.locator("#account-stats-back").click();
    if (!setups[s].deep) {
      await context.close();
      continue;
    }
    await tapId(page, client, "account-open-info");
    var age = await page.evaluate(function () { return document.getElementById("account-info-read").innerText; });
    if (age.indexOf("age 26") === -1 || age.indexOf("Joseph William Searle") === -1) fail("age or default name is wrong " + age);
    else ok("age is 26 on 12 Nov 2026");
    await page.locator("#account-info-edit").click();
    await page.evaluate(function () {
      var form = document.getElementById("account-info-form");
      form.elements.heightCm.value = "178";
      form.elements.startKg.value = "82.4";
      form.elements.startDate.value = "2026-01-01";
    });
    await page.locator("#account-info-form button[type=submit]").click();
    await page.waitForTimeout(200);
    var filled = await page.evaluate(function () { return document.getElementById("account-info-read").innerText; });
    if (filled.indexOf("178 cm · 5 ft 10 in") === -1 || filled.indexOf("82.4 kg") === -1) {
      fail("saved account info is wrong " + filled);
    } else ok("Account Info saves height and the anchor");
    await page.locator("#account-info-edit").click();
    var lockedFields = await page.evaluate(function () {
      var form = document.getElementById("account-info-form");
      return form.elements.startKg.disabled && form.elements.startDate.disabled;
    });
    if (!lockedFields) fail("the anchor inputs are still editable");
    else ok("the anchor inputs lock after confirm");
    var refused = await page.evaluate(function () {
      return window.nexusFetch("/account", { method: "PUT", body: { name: "Joseph William Searle", dob: "2000-06-22", heightCm: 178, startWeightKg: 70, startDate: "2026-02-01" } }).then(function () {
        return 200;
      }).catch(function (err) { return err.status; });
    });
    if (refused !== 409) fail("anchor edit was not refused (" + refused + ")");
    else ok("an anchor edit is refused");
    await page.locator("#account-info-cancel").click();
    await page.locator("#account-info [data-account-back]").click();
    await tapId(page, client, "account-open-weight");
    await page.locator("#account-log-open").click();
    await page.evaluate(function () {
      var form = document.getElementById("account-log-form");
      form.elements.kg.value = "80";
      form.elements.date.value = "2027-01-04";
      form.elements.date.dispatchEvent(new Event("input"));
    });
    await page.locator("#account-log-form button[type=submit]").click();
    await page.waitForTimeout(150);
    await page.locator("#account-log-open").click();
    await page.evaluate(function () {
      var form = document.getElementById("account-log-form");
      form.elements.kg.value = "82";
      form.elements.date.value = "2027-01-11";
      form.elements.date.dispatchEvent(new Event("input"));
    });
    await page.locator("#account-log-form button[type=submit]").click();
    await page.waitForTimeout(150);
    await page.locator("#account-log-open").click();
    await page.evaluate(function () {
      var form = document.getElementById("account-log-form");
      form.elements.kg.value = "84";
      form.elements.date.value = "2027-01-13";
      form.elements.date.dispatchEvent(new Event("input"));
    });
    var updated = await page.evaluate(function () {
      return document.getElementById("account-log-note").hidden === false;
    });
    if (!updated) fail("a same-week weigh-in did not say Updated this week");
    else ok("a same-week weigh-in says Updated this week");
    await page.locator("#account-log-form button[type=submit]").click();
    await page.waitForTimeout(200);
    var weight = await page.evaluate(function () {
      var text = document.getElementById("account-weight-body").innerText;
      var rows = document.querySelectorAll(".account-week").length;
      var chart = document.querySelector("#account-weight-chart polyline");
      var jan = document.querySelector(".account-months tr").innerText;
      return { text: text, rows: rows, chart: !!(chart && chart.getAttribute("points")), jan: jan };
    });
    if (weight.rows !== 2 || weight.jan.indexOf("82.0 kg") === -1 || !weight.chart || weight.text.indexOf("Unlocks 30 Jun 2027") === -1 || weight.text.indexOf("Unlocks 31 Dec 2027") === -1) {
      fail("averages, chart, or locked reviews are wrong " + JSON.stringify(weight));
    } else ok("same-week update, January average, chart, and locked reviews");
    var units = await page.evaluate(function () {
      return {
        weight: window.NexusAccount.formatWeight(82.4),
        height: window.NexusAccount.formatHeight(178),
        week: window.NexusAccount.isoWeek("2027-01-04"),
        age: window.NexusAccount.ageOn("2000-06-22", "2026-11-12")
      };
    });
    if (units.weight !== "82.4 kg · 12 st 13 lb" || units.height !== "178 cm · 5 ft 10 in" || units.week !== "2027-W01" || units.age !== 26) {
      fail("unit conversion is wrong " + JSON.stringify(units));
    } else ok("kg, stone, height, week, and age conversions");
    await openDoor(page, client, "porridge");
    await openDoor(page, client, "food");
    await openDoor(page, client, "training");
    var leak = await page.evaluate(function () {
      var card = document.getElementById("relic-card").innerText;
      return {
        porridge: card.indexOf("Porridge") !== -1,
        account: card.indexOf("Log weigh-in") !== -1 || card.indexOf("Joseph William Searle") !== -1,
        training: document.getElementById("page-title").textContent
      };
    });
    if (leak.account || leak.training !== "Training Schedules") fail("account content leaked " + JSON.stringify(leak));
    else ok("Account Profile stays off Porridge, Food, and Training");
    await context.close();
  }
  var later = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await require("./tools/regression-session").arm(later);
  var laterPage = await later.newPage();
  await laterPage.goto("http://127.0.0.1:8080/?v=v104&date=2027-07-01", { waitUntil: "domcontentloaded" });
  await laterPage.waitForFunction(function () { return window.NexusAccount; });
  await laterPage.evaluate(function () {
    var real = window.nexusFetch;
    window.nexusFetch = function (path, opts) {
      if (String(path) === "/account") return Promise.resolve({ ok: true, profile: { name: "Joseph William Searle", dob: "2000-06-22", heightCm: 178, startWeightKg: 80, startDate: "2026-01-01", updatedAt: "2026-01-01" } });
      if (String(path) === "/weights") return Promise.resolve({ ok: true, weights: [{ week: "2027-W25", date: "2027-06-20", weightKg: 78, updatedAt: "2027-06-20" }] });
      return real(path, opts);
    };
  });
  await laterPage.locator("#btn-nav-toggle").click();
  await laterPage.waitForTimeout(400);
  await laterPage.locator('[data-os-door="account"]').click();
  await laterPage.waitForTimeout(200);
  await laterPage.locator("#account-open-weight").click();
  await laterPage.waitForTimeout(200);
  var reviews = await laterPage.evaluate(function () { return document.getElementById("account-weight-body").innerText; });
  if (reviews.indexOf("Unlocks 30 Jun 2027") !== -1 || reviews.indexOf("Unlocks 31 Dec 2027") === -1 || reviews.indexOf("78.0 kg") === -1) {
    fail("halfway review did not unlock " + reviews);
  } else ok("halfway is filled and the year end stays locked");
  await later.close();
  var offline = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  await require("./tools/regression-session").arm(offline);
  var offlinePage = await offline.newPage();
  await offlinePage.goto("http://127.0.0.1:8080/?v=v104&date=2026-11-12", { waitUntil: "domcontentloaded" });
  await offlinePage.waitForFunction(function () { return window.NexusAccount; });
  await offlinePage.evaluate(function () {
    var real = window.nexusFetch;
    window.__v92status = 404;
    window.nexusFetch = function (path, opts) {
      var url = String(path || "");
      if (url.indexOf("/account") === 0 || url.indexOf("/weights") === 0) {
        var err = new Error("missing");
        err.status = window.__v92status;
        return Promise.reject(err);
      }
      return real(path, opts);
    };
  });
  await offlinePage.locator("#btn-nav-toggle").click();
  await offlinePage.waitForTimeout(400);
  await offlinePage.locator('[data-os-door="account"]').click();
  await offlinePage.waitForTimeout(250);
  var missing = await offlinePage.evaluate(function () {
    return document.getElementById("account-error").hidden && document.getElementById("account-info-read").textContent.indexOf("Tap Edit to add your height") !== -1;
  });
  if (!missing) fail("a missing account did not stay usable");
  else ok("a 404 account stays on the empty prompts");
  await offlinePage.evaluate(function () {
    window.__v92status = 0;
    document.getElementById("account-retry").click();
  });
  await offlinePage.waitForTimeout(200);
  var down = await offlinePage.evaluate(function () {
    return document.getElementById("account-error").hidden === false && document.getElementById("account-error-text").textContent.indexOf("Couldn't load, try again") !== -1;
  });
  if (!down) fail("an offline account crashed instead of showing the retry");
  else ok("an offline account shows Couldn't load, try again");
  await offline.close();
  await browser.close();
  if (failed) {
    console.error(failed + " v92 check(s) failed");
    process.exit(1);
  }
  console.log("OK v92");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
