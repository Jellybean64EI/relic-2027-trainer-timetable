/* Nexus v91: Account Profile is a page, and Training Stats lives only there. */
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

if (html.indexOf('content="v97"') === -1 || app.indexOf('build: "v97"') === -1) fail("cache stamp is not v97");
else ok("cache stamp is v97");
if (html.indexOf('data-os-panel="account"') === -1 || app.indexOf('account: "Account Profile"') === -1) fail("account is not a page");
else ok("account is a page");
if (html.indexOf("coming soon") !== -1 || html.indexOf('id="account-banner"') !== -1 || app.indexOf("showAccountBanner") !== -1) {
  fail("the account banner is still wired");
} else ok("the coming soon banner is gone");
if (html.indexOf('id="hub-stats-x"') !== -1 || app.indexOf("function openHubStats") !== -1 || css.indexOf("position: fixed") !== -1 && css.indexOf(".hub-stats {") !== -1 && css.split(".hub-stats {")[1].slice(0, 180).indexOf("position: fixed") !== -1) {
  fail("the stats modal can still cover another page");
} else ok("stats are in-page content");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

function creditText(value) {
  var doubled = Math.round(value * 2);
  if (doubled % 2 === 0) return String(doubled / 2);
  return (doubled / 2).toFixed(1);
}

async function touch(client, page, x, y) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x, y: y, id: 1 }] });
  await page.waitForTimeout(30);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openDrawer(page) {
  var open = await page.evaluate(function () { return document.body.classList.contains("nav-open"); });
  if (open) return;
  await page.locator("#btn-nav-toggle").click();
  await page.waitForTimeout(550);
}

async function goDoor(page, client, name) {
  if (name === "training" || name === "cards" || name === "food" || name === "smoothies" || name === "porridge") {
    await page.evaluate(function (door) { window.RelicArchitect.applyOsDoor(door); }, name);
    await page.waitForTimeout(350);
    return;
  }
  await openDrawer(page);
  var point = await page.evaluate(function (door) {
    var node = document.querySelector('[data-os-door="' + door + '"]');
    var rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, name);
  await touch(client, page, point.x, point.y);
  await page.waitForTimeout(350);
}

(async function () {
  if (failed) {
    console.error(failed + " v91 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var setups = [
    { width: 360, height: 740, dpr: 1 },
    { width: 412, height: 915, dpr: 3.5 }
  ];
  var doors = ["hub", "training", "cards", "food", "smoothies", "porridge"];
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
    var page = await context.newPage();
    var client = await context.newCDPSession(page);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    if (setups[s].dpr > 1) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: width,
        height: setups[s].height,
        deviceScaleFactor: setups[s].dpr,
        mobile: true
      });
    }
    await page.goto("http://127.0.0.1:8080/?v=v97", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && document.getElementById("page-title"); });
    await page.evaluate(function () {
      var toast = document.getElementById("deck-toast");
      if (toast) toast.style.display = "none";
    });
    await openDrawer(page);
    var menu = await page.evaluate(function () {
      var nav = document.querySelector(".nav-drawer-nav");
      var account = document.querySelector('[data-os-door="account"]');
      var tag = document.getElementById("nexus-build");
      var labels = Array.prototype.map.call(document.querySelectorAll(".cabin-list .nav-row-label"), function (node) { return node.textContent; });
      return {
        text: nav.innerText,
        labels: labels,
        accountBeforeTag: account.compareDocumentPosition(tag) === Node.DOCUMENT_POSITION_FOLLOWING
      };
    });
    if (menu.text.indexOf("Training Stats") !== -1 || menu.text.indexOf("coming soon") !== -1) {
      fail(width + " the drawer still has stats or coming soon");
    } else if (menu.labels.join("|") !== "Training and Meal Schedules Hub" || menu.text.indexOf("Food Deck") !== -1 || menu.text.indexOf("Trainer Video Library") !== -1 || !menu.accountBeforeTag) {
      fail(width + " the cabin list is wrong " + JSON.stringify(menu.labels));
    } else ok(width + " the drawer lists the cabins and Account Profile");
    var before = await page.evaluate(function () {
      return document.querySelector('[data-os-door="account"]').getBoundingClientRect().top;
    });
    await goDoor(page, client, "account");
    var landed = await page.evaluate(function (top) {
      var title = document.getElementById("page-title").textContent;
      var mark = document.querySelector(".nexus-mark").textContent;
      var clock = document.getElementById("meta-clock");
      var today = document.getElementById("meta-today");
      var tiles = Array.prototype.map.call(document.querySelectorAll("#account-tiles .account-tile"), function (node) { return node.innerText.replace(/\s+/g, " ").trim(); });
      var account = document.querySelector('[data-os-door="account"]').getBoundingClientRect().top;
      return {
        title: title,
        mark: mark,
        clock: clock.textContent,
        today: today.textContent,
        clockShown: getComputedStyle(clock).display !== "none" && clock.getClientRects().length > 0,
        tiles: tiles,
        drawer: document.body.classList.contains("nav-open"),
        jumped: Math.abs(account - top) > 2 && document.body.classList.contains("nav-open")
      };
    }, before);
    var tileText = landed.tiles.join(" ").toLowerCase();
    if (landed.drawer || landed.jumped || landed.title !== "Account Profile" || landed.mark !== "Nexus" || !landed.clockShown || landed.tiles.length !== 3 || tileText.indexOf("in design") !== -1 || landed.tiles[0].toLowerCase().indexOf("account info") === -1 || landed.tiles[1].toLowerCase().indexOf("live weight") === -1 || landed.tiles[2].toLowerCase().indexOf("training stats") === -1) {
      fail(width + " Account Profile did not open cleanly " + JSON.stringify(landed));
    } else ok(width + " Account Profile opens with the header, clock, and three tiles");
    var clockA = landed.clock;
    await page.waitForTimeout(1100);
    var clockB = await page.evaluate(function () { return document.getElementById("meta-clock").textContent; });
    if (!clockA || clockA === clockB || !/\d/.test(clockB)) fail(width + " the clock is not ticking (" + clockA + " -> " + clockB + ")");
    else ok(width + " the clock ticks");
    var info = await page.evaluate(function () {
      var node = document.getElementById("account-open-info");
      var rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await touch(client, page, info.x, info.y);
    await page.waitForTimeout(200);
    var infoView = await page.evaluate(function () {
      var panel = document.getElementById("account-info");
      return {
        open: getComputedStyle(panel).display !== "none",
        label: panel.querySelector(".account-section-label").textContent,
        stray: document.body.innerText.indexOf("In design") !== -1
      };
    });
    if (!infoView.open || infoView.label !== "Account Info" || infoView.stray) fail(width + " Account Info did not open " + JSON.stringify(infoView));
    else ok(width + " Account Info opens inside the page");
    var infoBack = await page.evaluate(function () {
      var rect = document.querySelector("#account-info [data-account-back]").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await touch(client, page, infoBack.x, infoBack.y);
    await page.waitForTimeout(150);
    var tile = await page.evaluate(function () {
      var node = document.getElementById("account-open-stats");
      var rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await touch(client, page, tile.x, tile.y);
    await page.waitForTimeout(200);
    var stats = await page.evaluate(function () {
      function creditText(value) {
        var doubled = Math.round(value * 2);
        if (doubled % 2 === 0) return String(doubled / 2);
        return (doubled / 2).toFixed(1);
      }
      var snap = window.RelicArchitect.hubSnapshot();
      var upper = document.querySelector('[data-hub-stats="upper"]').innerText;
      var full = document.querySelector('[data-hub-stats="full"]').innerText;
      function matches(text, score) {
        return text.indexOf("DAYS " + creditText(score.credit) + " / " + score.days) !== -1 &&
          text.indexOf("VIDEOS " + score.videos + " / " + (score.days * 2)) !== -1 &&
          text.indexOf(score.pct + "%") !== -1 &&
          text.indexOf(score.videoPct + "%") !== -1;
      }
      return {
        title: document.getElementById("page-title").textContent,
        label: document.querySelector("#hub-stats .account-section-label").textContent,
        tilesHidden: getComputedStyle(document.getElementById("account-tiles")).display === "none",
        days: snap.upper.days,
        videos: snap.upper.days * 2,
        upperOk: matches(upper, snap.upper),
        fullOk: matches(full, snap.full),
        lock: document.getElementById("hub-lock").getAttribute("aria-pressed"),
        header: document.getElementById("btn-future-lock").getAttribute("aria-pressed")
      };
    });
    if (stats.title !== "Account Profile" || stats.label !== "Training Stats" || !stats.tilesHidden || stats.days !== 313 || stats.videos !== 626 || !stats.upperOk || !stats.fullOk || stats.lock !== stats.header) {
      fail(width + " Training Stats numbers do not match " + JSON.stringify(stats));
    } else ok(width + " Training Stats matches the tick totals");
    var lockPoint = await page.evaluate(function () {
      var rect = document.getElementById("hub-lock").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await touch(client, page, lockPoint.x, lockPoint.y);
    await page.waitForTimeout(200);
    var locked = await page.evaluate(function () {
      return {
        row: document.getElementById("hub-lock").getAttribute("aria-pressed"),
        header: document.getElementById("btn-future-lock").getAttribute("aria-pressed")
      };
    });
    if (locked.row !== "true" || locked.header !== "true") fail(width + " the lock did not stay in sync " + JSON.stringify(locked));
    else ok(width + " the training lock stays in sync");
    await touch(client, page, lockPoint.x, lockPoint.y);
    await page.waitForTimeout(150);
    var back = await page.evaluate(function () {
      var rect = document.getElementById("account-stats-back").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await touch(client, page, back.x, back.y);
    await page.waitForTimeout(150);
    var tilesBack = await page.evaluate(function () {
      return {
        tiles: getComputedStyle(document.getElementById("account-tiles")).display !== "none",
        stats: getComputedStyle(document.getElementById("hub-stats")).display === "none",
        title: document.getElementById("page-title").textContent
      };
    });
    if (!tilesBack.tiles || !tilesBack.stats || tilesBack.title !== "Account Profile") fail(width + " back did not return to the tiles " + JSON.stringify(tilesBack));
    else ok(width + " back returns to the tiles");
    var d;
    for (d = 0; d < doors.length; d++) {
      await goDoor(page, client, doors[d]);
      var stray = await page.evaluate(function () {
        var panel = document.querySelector('[data-os-panel="account"]');
        var statsNode = document.getElementById("hub-stats");
        var visible = statsNode && !statsNode.hidden && !panel.hidden;
        return { door: document.body.className, hidden: panel.hidden, visible: !!visible };
      });
      if (!stray.hidden || stray.visible) fail(width + " stats leaked onto " + doors[d] + " " + JSON.stringify(stray));
    }
    if (!failed) ok(width + " stats stay off every other cabin");
    await goDoor(page, client, "porridge");
    var porridge = await page.evaluate(function () {
      var head = document.querySelector("#deck-root-porridge [data-deck-count]");
      var title = document.getElementById("page-title").textContent;
      var panel = document.querySelector('[data-os-panel="account"]');
      return {
        title: title,
        count: head ? head.textContent : "",
        accountHidden: panel.hidden,
        statsHidden: document.getElementById("hub-stats").hidden
      };
    });
    if (porridge.title !== "Build a Meal Schedule" || porridge.count.indexOf("Porridge") !== 0 || !porridge.accountHidden) {
      fail(width + " Porridge is not clean " + JSON.stringify(porridge));
    } else ok(width + " Porridge sits under its own header");
    await goDoor(page, client, "account");
    var clean = await page.evaluate(function () {
      return {
        tiles: getComputedStyle(document.getElementById("account-tiles")).display !== "none",
        stats: getComputedStyle(document.getElementById("hub-stats")).display === "none",
        title: document.getElementById("page-title").textContent
      };
    });
    if (!clean.tiles || !clean.stats || clean.title !== "Account Profile") fail(width + " returning to Account Profile kept the subview " + JSON.stringify(clean));
    else ok(width + " returning to Account Profile starts on the tiles");
    if (width === 412) {
      await page.evaluate(function () {
        var archive = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist;
        var clip = archive[0];
        window.RelicArchitect.openCatalogPlaylist([
          { title: clip.title, src: window.RelicArchitect.resolveClipSrc("Back", clip), stage: "Pre-stretch 1/1" }
        ]);
      });
      await page.waitForFunction(function () {
        var tag = document.getElementById("phase-tag");
        var video = document.querySelector(".player-stage .deck-video.is-front");
        return tag && tag.textContent === "Pre 1/1" && video && video.getBoundingClientRect().height > 200;
      }, null, { timeout: 12000 });
      var videoBefore = await page.evaluate(function () {
        var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
        return { h: video.height, y: video.y };
      });
      var lip = await page.evaluate(function () {
        var rect = document.getElementById("forensic-tab").getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight - 4, rect.bottom - 6) };
      });
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: lip.x, y: lip.y, id: 1 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: lip.x, y: lip.y - 120, id: 1 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(400);
      var sheet = await page.evaluate(function (before) {
        var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
        return {
          mid: document.querySelector(".player-stage").classList.contains("is-cue-mid"),
          h: video.height,
          y: video.y,
          beforeH: before.h,
          beforeY: before.y
        };
      }, videoBefore);
      if (!sheet.mid || Math.abs(sheet.h - sheet.beforeH) > 2 || Math.abs(sheet.y - sheet.beforeY) > 2) {
        fail("the cue sheet moved the video " + JSON.stringify(sheet));
      } else ok("the cue sheet still opens without moving the video");
    }
    await context.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v91 check(s) failed");
    process.exit(1);
  }
  console.log("OK v91");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
