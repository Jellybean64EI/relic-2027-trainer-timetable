/* Nexus v95: Build a Meal Schedule, and the shorter menu. */
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
if (html.indexOf('content="v102"') === -1 || app.indexOf('build: "v102"') === -1) fail("cache stamp is not v102");
else ok("cache stamp is v102");
if (html.indexOf('id="meals-root"') === -1 || html.indexOf('id="meals-open"') === -1) fail("meals page is missing");
else ok("meals page is in the markup");
if (html.indexOf('data-os-door="food"') !== -1 || html.indexOf(">Food Deck<") !== -1) fail("food deck row remains");
else ok("the menu no longer lists the deck rows");
if (html.indexOf(">Trainer Video Library<") === -1) fail("library label is missing");
else ok("the library label is renamed");
if (css.indexOf("body.is-meals.is-deck .brand-bar") === -1) fail("meals header override is missing");
else ok("meals header override is present");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v95 check(s) failed");
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
  var errors = [];
  page.on("console", function (msg) { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto("http://127.0.0.1:8080/?v=v102&date=2026-11-13", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect; });
  await page.evaluate(function () {
    var toast = document.getElementById("deck-toast");
    if (toast) toast.style.display = "none";
    var real = window.nexusFetch;
    window.nexusFetch = function (path, opts) {
      var url = String(path || "");
      var method = String((opts && opts.method) || "GET").toUpperCase();
      if (url.indexOf("/upload") === 0 && method === "POST") return Promise.resolve({ key: "food/v95-test.png" });
      if (url === "/cards" && method === "POST") {
        var body = opts.body || {};
        return Promise.resolve({ id: "v95-" + body.deck, name: body.name, deck: body.deck, veg: body.veg || 0, fruit: body.fruit || 0, front_key: body.front_key, favourite: 0 });
      }
      if ((url.indexOf("/slots") === 0 || url.indexOf("/stacks") === 0) && method !== "GET") return Promise.resolve({ ok: true });
      return real(path, opts);
    };
  });
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(450);
  await page.locator('[data-os-door="hub"]').click();
  await page.waitForTimeout(250);
  var hiddenModule = await page.evaluate(function () {
    return document.getElementById("hub-panel-food").hidden;
  });
  if (!hiddenModule) fail("the meal module shows on Training Schedules");
  else ok("the meal module is off the Training Schedules tab");
  await page.locator("#hub-tab-food").click();
  await page.waitForTimeout(200);
  var placed = await page.evaluate(function () {
    var button = document.getElementById("meals-open");
    var step = document.querySelector("#hub-panel-food .deck-step");
    var box = button.getBoundingClientRect();
    return {
      before: !!(step && (button.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING)),
      text: button.innerText.replace(/\s+/g, " "),
      wide: box.width > 200,
      tall: box.height >= 44
    };
  });
  if (!placed.before || placed.text.indexOf("Build a Meal Schedule") === -1 || placed.text.indexOf("Food · Smoothies · Porridge cards") === -1 || !placed.wide || !placed.tall) {
    fail("the meal module is in the wrong place " + JSON.stringify(placed));
  } else ok("the meal module sits under the tabs and above the stepper");
  var copy = page.locator("[data-deck-copy]").first();
  if (await copy.count()) {
    await copy.click();
    await page.waitForTimeout(200);
    var copyOpen = await page.evaluate(function () { return document.getElementById("deck-copy").hidden === false; });
    if (!copyOpen) fail("copy did not open");
    else ok("Food Schedules copy opens");
    await page.evaluate(function () {
      var close = document.querySelector("#deck-copy [data-deck-close]");
      if (close) close.click();
    });
  } else ok("Food Schedules still has its add buttons");
  await page.locator("#meals-open").click();
  await page.waitForTimeout(300);
  var meals = await page.evaluate(function () {
    var title = document.getElementById("page-title");
    var bar = getComputedStyle(document.querySelector(".brand-bar"));
    var main = getComputedStyle(document.querySelector(".brand-main"));
    return {
      title: title.textContent,
      lines: title.getClientRects().length,
      display: bar.display,
      align: main.textAlign,
      food: document.getElementById("deck-root-food").hidden === false,
      tab: document.getElementById("meals-tab-food").getAttribute("aria-selected")
    };
  });
  if (meals.title !== "Build a Meal Schedule" || meals.lines !== 1 || meals.display !== "flex" || meals.align !== "left" || !meals.food || meals.tab !== "true") {
    fail("meals page header is wrong " + JSON.stringify(meals));
  } else ok("meals page opens on Food with a single left-aligned title");
  async function saveCard(tab, deck) {
    await page.locator("#meals-tab-" + tab).click();
    await page.waitForTimeout(200);
    await page.evaluate(function (which) {
      document.querySelector('[data-deck-add="' + which + '"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    }, tab === "smoothies" ? "smoothie" : tab);
    await page.setInputFiles("#deck-file", "/tmp/v95-card.png");
    await page.waitForTimeout(400);
    await page.locator("#deck-root-" + (tab === "smoothies" ? "smoothie" : tab) + " [data-deck-upload-save]").click();
    await page.waitForTimeout(700);
    var shown = await page.evaluate(function (rootId) {
      return document.querySelector("#" + rootId + " [data-deck-grid]").innerText;
    }, tab === "food" ? "deck-root-food" : tab === "smoothies" ? "deck-root-smoothie" : "deck-root-porridge");
    if (shown.indexOf("V95 Card") === -1) fail(tab + " did not save a card");
    else ok(tab + " saves a card");
  }
  await saveCard("food", "FOOD");
  await saveCard("smoothies", "SMOOTHIE");
  await saveCard("porridge", "PORRIDGE");
  var stored = await page.evaluate(function () { return localStorage.getItem("relic_meals_tab"); });
  if (stored !== "porridge") fail("last meals tab was not stored (" + stored + ")");
  else ok("the last meals tab is stored");
  await page.goto("http://127.0.0.1:8080/?v=v102&date=2026-11-13&door=smoothies", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect; });
  var smoothie = await page.evaluate(function () {
    return {
      title: document.getElementById("page-title").textContent,
      panel: document.getElementById("deck-root-smoothie").hidden === false,
      tab: document.getElementById("meals-tab-smoothies").getAttribute("aria-selected")
    };
  });
  if (smoothie.title !== "Build a Meal Schedule" || !smoothie.panel || smoothie.tab !== "true") fail("door=smoothies did not open that tab " + JSON.stringify(smoothie));
  else ok("door=smoothies opens the meals page");
  await page.goto("http://127.0.0.1:8080/?v=v102&date=2026-11-13&door=porridge", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.getElementById("deck-root-porridge"); });
  var porridge = await page.evaluate(function () {
    return document.getElementById("deck-root-porridge").hidden === false && document.getElementById("meals-tab-porridge").getAttribute("aria-selected") === "true";
  });
  if (!porridge) fail("door=porridge did not open that tab");
  else ok("door=porridge opens the meals page");
  await page.goto("http://127.0.0.1:8080/?v=v102&date=2026-11-13&door=food", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.getElementById("deck-root-food"); });
  var foodDoor = await page.evaluate(function () {
    return document.getElementById("deck-root-food").hidden === false;
  });
  if (!foodDoor) fail("door=food did not open the meals page");
  else ok("door=food opens the meals page");
  await page.goto("http://127.0.0.1:8080/?v=v102&date=2027-01-04", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.querySelector(".tick-hit"); });
  var ticks = await page.evaluate(function () { return document.querySelectorAll(".tick-hit").length; });
  if (!ticks) fail("training ticks are missing");
  else ok("training schedules still render ticks");
  if (errors.length) fail("console errors " + errors.join(" | "));
  else ok("no console errors");
  await browser.close();
  if (failed) {
    console.error(failed + " v95 check(s) failed");
    process.exit(1);
  }
  console.log("OK v95");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
