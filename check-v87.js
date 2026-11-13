/* Nexus v87: fresh build, overlay stage 1 with the clip name, touches stay on the sheet. */
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
var vercel = fs.readFileSync("vercel.json", "utf8");

if (html.indexOf('content="v102"') === -1 || app.indexOf('build: "v102"') === -1) fail("cache stamp is not v102");
else ok("cache stamp is v102");
if (html.indexOf('id="nexus-build"') === -1) fail("build tag is missing");
else ok("build tag is in the menu");
if (html.indexOf("serviceWorker.getRegistrations") === -1 || html.indexOf("nexus-seen-build") === -1) fail("old builds are not reloaded");
else ok("a changed build reloads once and drops a service worker");
if (vercel.indexOf("no-store") === -1) fail("html and scripts can stay cached");
else ok("html and scripts are not stored");
if (css.indexOf("pointer-events: none") === -1 || app.indexOf('className = "video-hit"') === -1) fail("the video can still take the touch");
else ok("the video does not take the touch");
if (app.indexOf("clipCatalogueName") === -1 || app.indexOf('id="cue-stage1-title"') === -1 && app.indexOf('id = "cue-stage1-title"') === -1) {
  fail("the clip name is not on the cue");
} else ok("the clip name is painted on the cue");

var THORACIC = {
  leads: ["Reach through your fingertips while keeping your shoulders away from your ears.", "Let your hips travel backwards.", "Keep the lower spine quiet."],
  steps: ["Kneel on the mat facing the wall."],
  dose: { sets: "4", reps: "NONE", hold: "20 Secs", rest: "10 Secs" },
  breathing: "Inhale gently to prepare.",
  avoid: "Don't shrug the shoulders."
};

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
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
    console.error(failed + " v87 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var setups = [
    { width: 390, height: 844, dpr: 1 },
    { width: 412, height: 915, dpr: 3.5 }
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
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: width,
      height: height,
      deviceScaleFactor: setups[s].dpr,
      mobile: true
    });
    await page.goto("http://127.0.0.1:8080/?v=v102", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusCards && window.NexusCueEdit; });
    var build = await page.locator("#nexus-build").innerText();
    if (build !== "Nexus v102") fail(width + " menu build tag is " + build);
    else ok(width + " menu shows v102");
    await page.evaluate(function (cue) {
      var archive = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist;
      var clip = archive.filter(function (row) { return /Wall Thoracic Stretch/.test(row.title || ""); })[0];
      var next = archive[0] === clip ? archive[1] : archive[0];
      window.RelicArchitect.openCatalogPlaylist([
        { src: window.RelicArchitect.resolveClipSrc("Back", clip), title: clip.title },
        { src: window.RelicArchitect.resolveClipSrc("Back", next), title: next.title }
      ]);
      window.__cue = cue;
    }, THORACIC);
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var src = video ? (video.getAttribute("src") || "") : "";
      var match = src.match(/r2\.dev\/([^?#]+)/);
      var key = match ? decodeURIComponent(match[1]) : "";
      var cues = performance.getEntriesByType("resource").filter(function (row) { return row.name.indexOf("/video-cues") !== -1; }).length;
      return cues >= 2 && video && video.getBoundingClientRect().height > 200 && window.NexusCards.identityByKey(key);
    }, null, { timeout: 12000 });
    await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var key = decodeURIComponent(video.getAttribute("src").match(/r2\.dev\/([^?#]+)/)[1]);
      var identity = window.NexusCards.identityByKey(key);
      window.NexusCueEdit.load = function () { return Promise.resolve(); };
      window.NexusCueEdit.remember({ videoId: identity.videoId, r2Key: identity.r2Key, cue: window.__cue });
    });
    var before = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      var key = decodeURIComponent(video && document.querySelector(".player-stage .deck-video.is-front").getAttribute("src").match(/r2\.dev\/([^?#]+)/)[1]);
      return {
        video: { x: video.x, y: video.y, w: video.width, h: video.height },
        name: window.NexusCards.identityByKey(key).title
      };
    });
    var lip = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight - 6, rect.bottom - 4) };
    });
    await touchPath(client, page, [
      { x: lip.x, y: lip.y },
      { x: lip.x, y: lip.y - 50 },
      { x: lip.x, y: lip.y - 140 }
    ]);
    await page.waitForTimeout(350);
    var stage1 = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      var panel = document.getElementById("cue-stage1").getBoundingClientRect();
      var mute = document.querySelector("#cue-px-host .px-mute").getBoundingClientRect();
      var speed = document.querySelector("#cue-px-host .px-rate").getBoundingClientRect();
      return {
        mid: stage.classList.contains("is-cue-mid"),
        video: { x: video.x, y: video.y, w: video.width, h: video.height },
        ratio: panel.height / window.innerHeight,
        title: document.getElementById("cue-stage1-title").textContent,
        mute: mute.height > 8 && mute.bottom <= panel.bottom + 1,
        speed: speed.height > 8 && speed.bottom <= panel.bottom + 1
      };
    });
    var same = Math.abs(stage1.video.x - before.video.x) < 2 && Math.abs(stage1.video.y - before.video.y) < 2 &&
      Math.abs(stage1.video.w - before.video.w) < 2 && Math.abs(stage1.video.h - before.video.h) < 2;
    if (!stage1.mid || !same || stage1.ratio > 0.26 || stage1.ratio < 0.12 || stage1.title !== before.name || !stage1.mute || !stage1.speed) {
      fail(width + " stage 1 overlay, title, or controls are wrong " + JSON.stringify(stage1) + " expected " + before.name);
    } else ok(width + " stage 1 overlays the named clip without moving the video");
    var sheet = await page.evaluate(function () {
      var rect = document.getElementById("cue-stage1").getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width };
    });
    await touchPath(client, page, [
      { x: sheet.x + sheet.w * 0.8, y: sheet.y + 24 },
      { x: sheet.x + 12, y: sheet.y + 24 }
    ]);
    await page.waitForTimeout(200);
    var slid = await page.evaluate(function () {
      return {
        index: window.RelicArchitect.playerIndex,
        title: document.getElementById("cue-stage1-title").textContent
      };
    });
    if (slid.index !== 0 || slid.title !== before.name) {
      fail(width + " a sideways sheet swipe changed the clip " + JSON.stringify(slid));
    } else ok(width + " a sideways swipe keeps the clip and the title");
    var film = await page.evaluate(function () {
      var rect = document.querySelector(".video-hit").getBoundingClientRect();
      return { x: rect.x + rect.width * 0.8, y: rect.y + 80, x2: rect.x + rect.width * 0.15 };
    });
    await touchPath(client, page, [
      { x: film.x, y: film.y },
      { x: film.x2, y: film.y }
    ]);
    await page.waitForTimeout(400);
    var after = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var src = video.getAttribute("src") || "";
      var match = src.match(/r2\.dev\/([^?#]+)/);
      var key = match ? decodeURIComponent(match[1]) : "";
      var identity = window.NexusCards.identityByKey(key);
      var timer = document.getElementById("relic-set-timer").getBoundingClientRect();
      var style = getComputedStyle(document.getElementById("relic-set-timer"));
      return {
        index: window.RelicArchitect.playerIndex,
        title: document.getElementById("cue-stage1-title").textContent,
        name: identity ? identity.title : "",
        timer: timer.height > 10 && style.opacity !== "0" && style.visibility !== "hidden",
        text: document.getElementById("relic-set-timer").textContent
      };
    });
    if (after.index === 0 || after.title !== after.name || !after.timer || !/^\d/.test(after.text)) {
      fail(width + " the title or timer did not survive the clip change " + JSON.stringify(after));
    } else ok(width + " the title and timer stay after the clip changes");
    await context.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v87 check(s) failed");
    process.exit(1);
  }
  console.log("OK v87");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
