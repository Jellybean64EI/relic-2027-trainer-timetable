/* Nexus v86: real Android touches stay on the cue sheet, and stage 1 overlays the video. */
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

if (html.indexOf('content="v95"') === -1 || app.indexOf('build: "v95"') === -1) fail("cache stamp is not v95");
else ok("cache stamp is v95");
if (app.indexOf("function cuePanelTarget") === -1 || app.indexOf('!node.closest(".deck-video")') === -1) {
  fail("video swipes are not limited to the video");
} else ok("only a swipe that starts on the video changes clips");
if (app.indexOf("translate3d(0,") === -1 || css.indexOf("will-change: transform") === -1) fail("the sheet does not track with a transform");
else ok("the sheet tracks the finger with a transform");
if (css.indexOf(".player-stage.is-cue-mid { --cue-cover: 0px; }") === -1) fail("stage 1 still shrinks the video");
else ok("stage 1 does not reserve video space");
if (css.indexOf("touch-action: pan-y") === -1 || css.indexOf("touch-action: none") === -1) fail("touch-action is missing");
else ok("the sheet scrolls vertically and the lip does not");
if (app.indexOf("Kneel on the mat") !== -1) fail("fixture text was copied into the player");
else ok("the thoracic cue stays in the test fixture");

var THORACIC = {
  leads: [
    "Reach through your fingertips while keeping your shoulders away from your ears.",
    "Let your hips travel backwards as your chest moves towards the floor.",
    "Create the stretch through your upper back without forcing your lower spine to arch."
  ],
  steps: [
    "Kneel on the mat facing the wall, with enough space to move your hips backwards.",
    "Place both hands against the wall above shoulder height, as demonstrated."
  ],
  dose: { sets: "4", reps: "NONE", hold: "20 Secs", rest: "10 Secs" },
  breathing: "Inhale gently to prepare. Exhale slowly as you press into the wall and allow your chest to sink towards the floor.",
  avoid: "Forcing your chest towards the floor, arching excessively through your lower back, shrugging your shoulders."
};

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

function boxOf(page, selector) {
  return page.evaluate(function (sel) {
    var node = document.querySelector(sel);
    var rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, bottom: rect.bottom };
  }, selector);
}

async function touchPath(client, page, points, sample) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: points[0].x, y: points[0].y, id: 1 }]
  });
  var seen = null;
  var i;
  for (i = 1; i < points.length; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: points[i].x, y: points[i].y, id: 1 }]
    });
    if (sample && i === sample.at) seen = await sample.read();
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return seen;
}

(async function () {
  if (failed) {
    console.error(failed + " v86 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var sizes = [[390, 844], [412, 915]];
  var s;
  for (s = 0; s < sizes.length; s++) {
    var width = sizes[s][0];
    var height = sizes[s][1];
    var context = await browser.newContext({
      viewport: { width: width, height: height },
      hasTouch: true,
      isMobile: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    });
    var page = await context.newPage();
    var client = await context.newCDPSession(page);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.goto("http://127.0.0.1:8080/?v=v95", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusCards && window.NexusCueEdit; });
    await page.evaluate(function () {
      var archive = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist;
      var clip = null;
      var i;
      for (i = 0; i < archive.length; i++) {
        if (/Wall Thoracic Stretch/.test(archive[i].title || "")) clip = archive[i];
      }
      var next = archive[0] === clip ? archive[1] : archive[0];
      window.RelicArchitect.openCatalogPlaylist([
        { src: window.RelicArchitect.resolveClipSrc("Back", clip), title: clip.title },
        { src: window.RelicArchitect.resolveClipSrc("Back", next), title: next.title }
      ]);
    });
    await page.waitForFunction(function () {
      var entries = performance.getEntriesByType("resource").filter(function (row) { return row.name.indexOf("/video-cues") !== -1; }).length;
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var src = video ? (video.getAttribute("src") || "") : "";
      var match = src.match(/r2\.dev\/([^?#]+)/);
      var key = "";
      try { key = match ? decodeURIComponent(match[1]) : ""; } catch (err) { key = match ? match[1] : ""; }
      return entries >= 2 && video && video.getBoundingClientRect().height > 200 && window.NexusCards.identityByKey(key);
    }, null, { timeout: 12000 });
    var seeded = await page.evaluate(function (cue) {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var src = video.getAttribute("src") || "";
      var match = src.match(/r2\.dev\/([^?#]+)/);
      var key = match ? decodeURIComponent(match[1]) : "";
      var identity = window.NexusCards.identityByKey(key);
      if (!identity) return null;
      window.NexusCueEdit.load = function () { return Promise.resolve(); };
      window.NexusCueEdit.remember({ videoId: identity.videoId, r2Key: identity.r2Key, cue: cue });
      return identity.videoId;
    }, THORACIC);
    if (seeded !== 10197) fail(width + " Wall Thoracic Stretch did not open (" + seeded + ")");
    else ok(width + " opened Wall Thoracic Stretch");
    await page.waitForTimeout(700);
    var idle = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return stage.classList.contains("is-cue-mid") || stage.classList.contains("is-cue-full");
    });
    if (idle) fail(width + " the cue opened by itself");
    else ok(width + " the cue stays closed until a swipe");
    var videoBox = await boxOf(page, ".player-stage .deck-video.is-front");
    await touchPath(client, page, [
      { x: videoBox.x + videoBox.w * 0.5, y: videoBox.y + videoBox.h * 0.55 },
      { x: videoBox.x + videoBox.w * 0.5, y: videoBox.y + videoBox.h * 0.55 - 36 }
    ]);
    var still = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return { mid: stage.classList.contains("is-cue-mid"), index: window.RelicArchitect.playerIndex };
    });
    if (still.mid || still.index !== 0) fail(width + " a small video drag opened the cue");
    else ok(width + " a video drag does not open the cue");
    var lip = await boxOf(page, "#forensic-tab");
    await touchPath(client, page, [
      { x: lip.x + lip.w * 0.5, y: Math.min(height - 8, lip.bottom - 4) },
      { x: lip.x + lip.w * 0.5, y: Math.min(height - 8, lip.bottom - 4) - 40 },
      { x: lip.x + lip.w * 0.5, y: Math.min(height - 8, lip.bottom - 4) - 120 }
    ]);
    await page.waitForTimeout(320);
    var stage1 = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      var panel = document.getElementById("cue-stage1").getBoundingClientRect();
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        video: { x: video.x, y: video.y, w: video.width, h: video.height },
        ratio: panel.height / window.innerHeight,
        sets: document.querySelector("#cue-stage1-dose dd").textContent
      };
    });
    var sameVideo = Math.abs(stage1.video.x - videoBox.x) < 2 && Math.abs(stage1.video.y - videoBox.y) < 2 &&
      Math.abs(stage1.video.w - videoBox.w) < 2 && Math.abs(stage1.video.h - videoBox.h) < 2;
    if (!stage1.mid || stage1.full || !sameVideo || stage1.ratio > 0.22 || stage1.ratio < 0.08 || stage1.sets !== "4") {
      fail(width + " stage 1 does not overlay a compact dose row " + JSON.stringify(stage1));
    } else ok(width + " stage 1 overlays the video without moving it");
    var panel = await boxOf(page, "#cue-stage1");
    var tracked = await touchPath(client, page, [
      { x: panel.x + 40, y: panel.y + 24 },
      { x: panel.x + 40, y: panel.y + 70 },
      { x: panel.x + 40, y: panel.y + panel.h + 40 }
    ], { at: 1, read: function () { return page.evaluate(function () { return document.getElementById("forensic-dock").getAttribute("data-cue-shift"); }); } });
    if (!(Number(tracked) > 12)) fail(width + " the panel did not follow the finger (" + tracked + ")");
    else ok(width + " the panel follows the finger");
    await page.waitForTimeout(400);
    var closed = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return { mid: stage.classList.contains("is-cue-mid"), full: stage.classList.contains("is-cue-full") };
    });
    if (closed.mid || closed.full) fail(width + " one downward swipe did not close stage 1");
    else ok(width + " one downward swipe closes stage 1");
    var repeat;
    var repeatOk = true;
    for (repeat = 0; repeat < 10; repeat++) {
      var handle = await boxOf(page, "#forensic-tab");
      var y0 = Math.min(height - 6, handle.bottom - 3);
      await touchPath(client, page, [
        { x: width * 0.5, y: y0 },
        { x: width * 0.5, y: y0 - 50 },
        { x: width * 0.5, y: y0 - 130 }
      ]);
      await page.waitForTimeout(280);
      var up = await page.evaluate(function () { return document.querySelector(".player-stage").classList.contains("is-cue-mid"); });
      var openPanel = await boxOf(page, "#cue-stage1");
      await touchPath(client, page, [
        { x: openPanel.x + 30, y: openPanel.y + 20 },
        { x: openPanel.x + 30, y: openPanel.y + 80 },
        { x: openPanel.x + 30, y: openPanel.bottom + 30 }
      ]);
      await page.waitForTimeout(320);
      var down = await page.evaluate(function () {
        var stage = document.querySelector(".player-stage");
        return stage.classList.contains("is-cue-mid") || stage.classList.contains("is-cue-full");
      });
      if (!up || down) repeatOk = false;
    }
    if (!repeatOk) fail(width + " repeated lip swipes did not open and close every time");
    else ok(width + " ten lip swipes open and close the first time");
    var again = await boxOf(page, "#forensic-tab");
    var yLip = Math.min(height - 6, again.bottom - 3);
    await touchPath(client, page, [
      { x: width * 0.5, y: yLip },
      { x: width * 0.5, y: yLip - 50 },
      { x: width * 0.5, y: yLip - 140 }
    ]);
    await page.waitForTimeout(400);
    var sheetBox = await boxOf(page, "#cue-stage1");
    await touchPath(client, page, [
      { x: sheetBox.x + sheetBox.w * 0.8, y: sheetBox.y + 28 },
      { x: sheetBox.x + 16, y: sheetBox.y + 28 }
    ]);
    await page.waitForTimeout(200);
    var words = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        index: window.RelicArchitect.playerIndex,
        kneel: document.getElementById("cue-sec-do").textContent.indexOf("Kneel on the mat") !== -1,
        shrug: document.getElementById("cue-sec-avoid").textContent.indexOf("shrugging your shoulders") !== -1,
        fingers: document.getElementById("cue-sec-rules").textContent.indexOf("fingertips") !== -1,
        arch: document.getElementById("cue-sec-rules").textContent.indexOf("lower spine") !== -1,
        breath: document.getElementById("cue-sec-breath").textContent.indexOf("Inhale gently") !== -1,
        rules: document.getElementById("cue-sec-rules").textContent.indexOf("3 Lead Rules") !== -1
      };
    });
    if (!words.mid || words.full || words.index !== 0 || !words.kneel || !words.shrug || !words.fingers || !words.arch || !words.breath || !words.rules) {
      fail(width + " the sheet lost the editor text or the clip " + JSON.stringify(words));
    } else ok(width + " sideways swipes keep the clip and the editor text");
    var header = await boxOf(page, "#forensic-tab");
    await touchPath(client, page, [
      { x: width * 0.5, y: header.y + 6 },
      { x: width * 0.5, y: header.y + 90 },
      { x: width * 0.5, y: header.y + 170 }
    ]);
    await page.waitForTimeout(360);
    var backTo1 = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return { mid: stage.classList.contains("is-cue-mid"), full: stage.classList.contains("is-cue-full"), index: window.RelicArchitect.playerIndex };
    });
    if (backTo1.mid || backTo1.full || backTo1.index !== 0) fail(width + " swipe down did not close the sheet " + JSON.stringify(backTo1));
    else ok(width + " swipe down closes the sheet");
    var dose = await boxOf(page, "#cue-stage1");
    await touchPath(client, page, [
      { x: dose.x + 36, y: dose.y + 18 },
      { x: dose.x + 36, y: dose.y + 90 },
      { x: dose.x + 36, y: dose.bottom + 40 }
    ]);
    await page.waitForTimeout(360);
    var shut = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return stage.classList.contains("is-cue-mid") || stage.classList.contains("is-cue-full");
    });
    if (shut) fail(width + " stage 1 did not close");
    else ok(width + " stage 1 steps down to the lip");
    var film = await boxOf(page, ".player-stage .deck-video.is-front");
    await touchPath(client, page, [
      { x: film.x + film.w * 0.8, y: film.y + 90 },
      { x: film.x + film.w * 0.2, y: film.y + 90 }
    ]);
    await page.waitForTimeout(250);
    var moved = await page.evaluate(function () { return window.RelicArchitect.playerIndex; });
    if (moved === 0) fail(width + " a video swipe did not change the clip");
    else ok(width + " a video swipe still changes the clip");
    await context.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v86 check(s) failed");
    process.exit(1);
  }
  console.log("OK v86");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
