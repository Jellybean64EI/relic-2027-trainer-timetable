/* Nexus v96: hub cards, shorter menu, and a live London clock. */
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
if (html.indexOf('content="v97"') === -1 || app.indexOf('build: "v97"') === -1) fail("cache stamp is not v97");
else ok("cache stamp is v97");
if (app.indexOf("function startLiveClock") === -1 || app.indexOf("TODAY <strong>") !== -1) fail("the old clock overwrite remains");
else ok("the clock ticker replaced the 30 second overwrite");
if (app.indexOf("function setFutureLock") === -1 || app.indexOf("function canTick") === -1 || app.indexOf("function revealHubLock") === -1) {
  fail("lock functions were removed");
} else ok("setFutureLock, canTick and revealHubLock remain");
var drawer = html.slice(html.indexOf('id="nav-drawer"'), html.indexOf('id="relic-deck-park"'));
if (drawer.indexOf(">The Cabins<") === -1 || drawer.indexOf(">Training and Meal Schedules Hub<") === -1) fail("menu labels are wrong");
else if (drawer.indexOf(">Training Schedules<") !== -1 || drawer.indexOf(">Trainer Video Library<") !== -1 || drawer.indexOf(">Main Menu Hub<") !== -1) fail("old menu rows remain");
else ok("the menu is The Cabins, the hub, and Account Profile");
if (html.indexOf(">Meal Schedules<") === -1 || html.indexOf(">Food Schedules<") !== -1) fail("the meal tab label is wrong");
else ok("the hub tab says Meal Schedules");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v96 check(s) failed");
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
  await page.goto("http://127.0.0.1:8080/?v=v97", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return window.RelicArchitect && document.getElementById("page-title").textContent; });
  await page.evaluate(function () {
    var toast = document.getElementById("deck-toast");
    if (toast) toast.style.display = "none";
  });
  var landing = await page.evaluate(function () {
    var today = document.getElementById("meta-today").textContent;
    var lock = document.getElementById("btn-future-lock");
    var library = document.getElementById("hub-open-library");
    var meals = document.getElementById("meals-open");
    var tabs = document.querySelector(".hub-tabs").getBoundingClientRect();
    return {
      title: document.getElementById("page-title").textContent,
      today: today,
      todayIso: /TODAY|\d{4}-\d{2}-\d{2}/.test(today),
      lock: lock.hidden === true || getComputedStyle(lock).display === "none",
      library: library.hidden === false,
      meals: meals.hidden === true,
      slot: document.getElementById("hub-slot").getBoundingClientRect().height,
      tabs: tabs.top
    };
  });
  if (landing.title !== "Training Schedules" || landing.todayIso || !/^\d{1,2} [A-Z][a-z]{2} · [A-Z][a-z]{2}$/.test(landing.today)) {
    fail("landing date or title is wrong " + JSON.stringify(landing));
  } else ok("the hub lands on Training with " + landing.today);
  if (!landing.lock || !landing.library || !landing.meals) fail("the training hub card or lock is wrong " + JSON.stringify(landing));
  else ok("only the Trainer Video Library card is on the Training tab");
  await page.locator("#hub-tab-food").click();
  await page.waitForTimeout(200);
  var meal = await page.evaluate(function (before) {
    var library = document.getElementById("hub-open-library");
    var meals = document.getElementById("meals-open");
    var tabs = document.querySelector(".hub-tabs").getBoundingClientRect();
    return {
      title: document.getElementById("page-title").textContent,
      library: library.hidden === true,
      meals: meals.hidden === false,
      text: meals.innerText.replace(/\s+/g, " "),
      kicker: meals.innerText.indexOf("MODULE") !== -1,
      height: meals.getBoundingClientRect().height,
      slot: document.getElementById("hub-slot").getBoundingClientRect().height,
      jump: Math.abs(tabs.top - before)
    };
  }, landing.tabs);
  if (meal.title !== "Meal Schedules" || !meal.library || !meal.meals || meal.kicker || meal.text.indexOf("Build a Meal Schedule") === -1 || meal.height < 44 || meal.height > 56 || meal.jump > 1) {
    fail("the meal hub card jumped or kept the kicker " + JSON.stringify(meal));
  } else ok("only the meal card shows, and the tabs stay put");
  await page.locator("#meals-open").click();
  await page.waitForTimeout(250);
  var openedMeals = await page.evaluate(function () {
    return document.getElementById("page-title").textContent === "Build a Meal Schedule" && document.getElementById("deck-root-food").hidden === false;
  });
  if (!openedMeals) fail("the meal card did not open Food");
  else ok("the meal card opens Build a Meal Schedule");
  await page.evaluate(function () { window.RelicArchitect.applyOsDoor("hub"); });
  await page.waitForTimeout(200);
  await page.locator("#hub-tab-schedules").click();
  await page.locator("#hub-open-library").click();
  await page.waitForTimeout(250);
  var openedLibrary = await page.evaluate(function () {
    return document.getElementById("page-title").textContent === "Trainer Video Library" && document.getElementById("vcards-root").hidden === false;
  });
  if (!openedLibrary) fail("the library card did not open the video library");
  else ok("the library card opens Trainer Video Library");
  await page.evaluate(function () { window.RelicArchitect.applyOsDoor("training"); });
  var trainingLock = await page.evaluate(function () {
    var lock = document.getElementById("btn-future-lock");
    return lock.hidden === true || getComputedStyle(lock).display === "none";
  });
  if (!trainingLock) fail("the header lock is visible on Training");
  else ok("the header lock stays hidden on Training");
  await page.evaluate(function () { window.RelicArchitect.applyOsDoor("account"); });
  await page.locator("#account-open-stats").click();
  await page.waitForTimeout(200);
  var statsLock = await page.evaluate(function () {
    var row = document.getElementById("hub-lock");
    return row && row.textContent.indexOf("Training Lock") !== -1 && getComputedStyle(row).display !== "none";
  });
  if (!statsLock) fail("the Training Stats lock changed");
  else ok("the Training Stats lock is unchanged");
  var links = [
    ["&door=hub", "Training Schedules", "hub-root", "account-root"],
    ["&door=training", "Training Schedules", "tt-body", "hub-root"],
    ["&door=cards", "Trainer Video Library", "vcards-root", "hub-root"],
    ["&door=account", "Account Profile", "account-root", "hub-root"],
    ["&door=food", "Build a Meal Schedule", "deck-root-food", "hub-root"],
    ["&door=smoothies", "Build a Meal Schedule", "deck-root-smoothie", "hub-root"],
    ["&door=porridge", "Build a Meal Schedule", "deck-root-porridge", "hub-root"],
    ["&mode=upper", "Training Schedules", "tt-body", "hub-root"],
    ["&date=2027-01-04", "Training Schedules", "tt-body", "hub-root"],
    ["&door=hub&date=2027-01-04", "Training Schedules", "hub-root", "account-root"],
    ["&door=nope", "Training Schedules", "hub-root", "account-root"]
  ];
  var i;
  for (i = 0; i < links.length; i++) {
    await page.goto("http://127.0.0.1:8080/?v=v97" + links[i][0], { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect; });
    var got = await page.evaluate(function (ids) {
      function visible(id) {
        var node = document.getElementById(id);
        return !!(node && node.getClientRects().length);
      }
      return { title: document.getElementById("page-title").textContent, shown: visible(ids.show), hidden: !visible(ids.hide) };
    }, { show: links[i][2], hide: links[i][3] });
    if (got.title !== links[i][1] || !got.shown || !got.hidden) fail(links[i][0] + " landed on " + JSON.stringify(got));
    else ok(links[i][0] + " opens " + links[i][1]);
  }
  await page.goto("http://127.0.0.1:8080/?v=v97", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.getElementById("meta-clock").textContent.indexOf(":") !== -1; });
  var rolled = await page.evaluate(function () {
    var Real = Date;
    var stamp = new Real("2026-11-13T23:59:30Z").getTime();
    function Fake() {
      if (arguments.length) return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
      return new Real(stamp);
    }
    Fake.prototype = Real.prototype;
    Fake.UTC = Real.UTC;
    Fake.parse = Real.parse;
    Fake.now = function () { return stamp; };
    window.Date = Fake;
    document.dispatchEvent(new Event("visibilitychange"));
    stamp = new Real("2026-11-14T00:00:30Z").getTime();
    document.dispatchEvent(new Event("visibilitychange"));
    window.Date = Real;
    return document.getElementById("meta-today").textContent;
  });
  if (rolled !== "14 Nov · Sat") fail("midnight did not move the date (" + rolled + ")");
  else ok("a London midnight updates the date");
  if (errors.length) fail("console errors " + errors.join(" | "));
  else ok("no console errors");
  await browser.close();
  if (failed) {
    console.error(failed + " v96 check(s) failed");
    process.exit(1);
  }
  console.log("OK v96");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
