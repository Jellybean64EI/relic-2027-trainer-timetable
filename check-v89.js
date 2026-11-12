/* Nexus v89: a small phase tag between the close button and the timer. */
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

if (html.indexOf('content="v91"') === -1 || app.indexOf('build: "v91"') === -1) fail("cache stamp is not v91");
else ok("cache stamp is v91");
if (app.indexOf("PHASE_TAG_MS = 8000") === -1 || app.indexOf('id = "phase-tag"') === -1) fail("the phase tag is missing");
else ok("the phase tag has its own 8 second timer");
if (css.indexOf(".phase-tag") === -1 || css.split(".phase-tag")[1].indexOf("pointer-events: none") === -1) fail("the phase tag can take touches");
else ok("the phase tag ignores touches");
if (css.indexOf(".player-stage.is-chrome-idle .phase-tag") !== -1) fail("the phase tag follows the 4 second fade");
else ok("the phase tag is not tied to the close button fade");
if (css.indexOf(".cue-stage2") !== -1 || css.indexOf(".cue-slides") !== -1 || css.indexOf(".cue-dots") !== -1) fail("dead slide css is still present");
else ok("dead slide css is gone");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

function readTag(page) {
  return page.evaluate(function () {
    var tag = document.getElementById("phase-tag");
    var close = document.getElementById("relic-player-close").getBoundingClientRect();
    var timer = document.getElementById("relic-set-timer").getBoundingClientRect();
    var box = tag.getBoundingClientRect();
    var style = getComputedStyle(tag);
    var closeStyle = getComputedStyle(document.getElementById("relic-player-close"));
    var timerStyle = getComputedStyle(document.getElementById("relic-timer-dock"));
    function hit(a, b) {
      return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    }
    return {
      text: tag.textContent,
      shown: style.opacity !== "0" && style.visibility !== "hidden" && box.height > 8,
      pe: style.pointerEvents,
      hitClose: hit(box, close),
      hitTimer: hit(box, timer),
      between: box.left >= close.right - 1 && box.right <= timer.left + 1,
      closeOpacity: closeStyle.opacity,
      timerOpacity: timerStyle.opacity,
      idle: document.querySelector(".player-stage").classList.contains("is-chrome-idle")
    };
  });
}

async function openSchedule(page) {
  await page.evaluate(function () {
    var archive = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist;
    function row(index, stage) {
      var clip = archive[index];
      return {
        title: clip.title,
        src: window.RelicArchitect.resolveClipSrc("Back", clip),
        stage: stage
      };
    }
    window.RelicArchitect.openCatalogPlaylist([
      row(0, "Pre-stretch 1/2"),
      row(1, "Pre-stretch 2/2"),
      row(2, "Exercise 1/2"),
      row(3, "Exercise 2/2"),
      row(4, "Post-stretch 1/1")
    ]);
  });
  await page.waitForFunction(function () {
    var video = document.querySelector(".player-stage .deck-video.is-front");
    var tag = document.getElementById("phase-tag");
    return video && video.getBoundingClientRect().height > 200 && tag && tag.textContent === "Pre 1/2";
  }, null, { timeout: 12000 });
}

async function touchPath(client, page, points) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: points[0].x, y: points[0].y, id: 1 }]
  });
  var i;
  for (i = 1; i < points.length; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: points[i].x, y: points[i].y, id: 1 }]
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

(async function () {
  if (failed) {
    console.error(failed + " v89 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var setups = [
    { width: 360, height: 740, dpr: 1, full: false },
    { width: 390, height: 844, dpr: 1, full: true },
    { width: 412, height: 915, dpr: 3.5, full: true }
  ];
  var s;
  for (s = 0; s < setups.length; s++) {
    var width = setups[s].width;
    var height = setups[s].height;
    var context = await browser.newContext({
      viewport: { width: width, height: height },
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
        height: height,
        deviceScaleFactor: setups[s].dpr,
        mobile: true
      });
    }
    await page.goto("http://127.0.0.1:8080/?v=v91", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect; });
    await openSchedule(page);
    var first = await readTag(page);
    if (first.text !== "Pre 1/2" || !first.shown || first.pe !== "none" || first.hitClose || first.hitTimer || !first.between) {
      fail(width + " the first phase tag is wrong " + JSON.stringify(first));
    } else ok(width + " Pre 1/2 sits between the close button and the timer");
    if (!setups[s].full) {
      await context.close();
      continue;
    }
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && !video.paused && video.currentTime > 0.15;
    }, null, { timeout: 12000 });
    var started = Date.now();
    await page.waitForTimeout(4500);
    var mid = await readTag(page);
    if (mid.closeOpacity !== "0" || mid.timerOpacity !== "0" || !mid.shown || mid.text !== "Pre 1/2") {
      fail(width + " the close button faded with the phase tag " + JSON.stringify(mid));
    } else ok(width + " the close button and timer fade at 4 seconds while the tag stays");
    var untilSeven = 7000 - (Date.now() - started);
    if (untilSeven > 0) await page.waitForTimeout(untilSeven);
    var seven = await readTag(page);
    if (!seven.shown || seven.text !== "Pre 1/2") fail(width + " the tag was gone at 7 seconds " + JSON.stringify(seven));
    else ok(width + " the tag is still visible at 7 seconds");
    var untilNine = 9300 - (Date.now() - started);
    if (untilNine > 0) await page.waitForTimeout(untilNine);
    var nine = await readTag(page);
    if (nine.shown) fail(width + " the tag was still visible after 9 seconds " + JSON.stringify(nine));
    else ok(width + " the tag fades out after about 9 seconds");
    await page.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await page.waitForTimeout(450);
    var second = await readTag(page);
    if (second.text !== "Pre 2/2" || !second.shown) fail(width + " a new clip did not bring the tag back " + JSON.stringify(second));
    else ok(width + " the next clip shows Pre 2/2");
    await page.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await page.waitForTimeout(450);
    var main = await readTag(page);
    if (main.text !== "Main 1/2" || !main.shown) fail(width + " Pre did not cross into Main " + JSON.stringify(main));
    else ok(width + " the tag crosses into Main 1/2");
    await page.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await page.waitForTimeout(450);
    await page.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await page.waitForTimeout(450);
    var post = await readTag(page);
    if (post.text !== "Post 1/1" || !post.shown) fail(width + " Main did not cross into Post " + JSON.stringify(post));
    else ok(width + " the tag crosses into Post 1/1");
    var before = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      return { x: video.x, y: video.y, w: video.width, h: video.height };
    });
    var lip = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight - 4, rect.bottom - 6) };
    });
    await touchPath(client, page, [
      { x: lip.x, y: lip.y },
      { x: lip.x, y: lip.y - 40 },
      { x: lip.x, y: lip.y - 140 }
    ]);
    await page.waitForTimeout(400);
    var opened = await page.evaluate(function (videoBefore) {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      return {
        mid: stage.classList.contains("is-cue-mid"),
        h: video.height,
        y: video.y,
        beforeH: videoBefore.h,
        beforeY: videoBefore.y
      };
    }, before);
    if (!opened.mid || Math.abs(opened.h - opened.beforeH) > 2 || Math.abs(opened.y - opened.beforeY) > 2) {
      fail(width + " the sheet moved the video " + JSON.stringify(opened));
    } else ok(width + " the sheet still opens without moving the video");
    var port = await page.evaluate(function () {
      var rect = document.getElementById("cue-stage1").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 30 };
    });
    await client.send("Input.synthesizeScrollGesture", {
      x: port.x,
      y: port.y,
      yDistance: -160,
      speed: 700,
      preventFling: true,
      gestureSourceType: "mouse"
    });
    await page.waitForTimeout(200);
    var scrolled = await page.evaluate(function () { return document.getElementById("cue-stage1").scrollTop; });
    if (!(scrolled > 20)) fail(width + " the sheet did not scroll (" + scrolled + ")");
    else ok(width + " the sheet still scrolls");
    var handle = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 8 };
    });
    await touchPath(client, page, [
      { x: handle.x, y: handle.y },
      { x: handle.x, y: handle.y + 70 },
      { x: handle.x, y: handle.y + 150 }
    ]);
    await page.waitForTimeout(400);
    var shut = await page.evaluate(function () {
      return document.querySelector(".player-stage").classList.contains("is-cue-mid");
    });
    if (shut) fail(width + " the sheet did not close");
    else ok(width + " the sheet still closes");
    await context.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v89 check(s) failed");
    process.exit(1);
  }
  console.log("OK v89");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
