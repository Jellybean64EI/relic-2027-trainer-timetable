/* Nexus v88: one fixed-height cue sheet. It follows the finger by transform only. */
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

if (html.indexOf('content="v98"') === -1 || app.indexOf('build: "v98"') === -1) fail("cache stamp is not v98");
else ok("cache stamp is v98");
if (app.indexOf("bindCueSlides") !== -1 || app.indexOf('id="cue-slides"') !== -1) fail("the slide track is still built");
else ok("the slide track is gone");
if (app.indexOf("var CUE_STAGE_CAP = 1") === -1) fail("the sheet still has a second stage");
else ok("there is one open position");
if (css.indexOf("height: 25vh") === -1 || css.indexOf("overflow-y: auto") === -1 || css.indexOf("-webkit-overflow-scrolling: touch") === -1 || css.indexOf("overscroll-behavior: contain") === -1) {
  fail("the sheet is not a fixed native scroller");
} else ok("the sheet height is fixed and the body scrolls natively");
if (app.indexOf("translate3d(0,") === -1) fail("the sheet does not move by transform");
else ok("the sheet moves by transform");

var THORACIC = {
  leads: [
    "Reach through your fingertips while keeping your shoulders away from your ears.",
    "Let your hips travel backwards as your chest moves towards the floor.",
    "Create the stretch through your upper back without forcing your lower spine to arch."
  ],
  steps: [
    "Kneel on the mat facing the wall.",
    "Place both hands against the wall.",
    "Extend your arms upwards.",
    "Slowly move your hips backwards towards your heels."
  ],
  dose: { sets: "4", reps: "NONE", hold: "20 Secs", rest: "10 Secs" },
  breathing: "Inhale gently to prepare. Exhale slowly as you press into the wall.",
  avoid: "Forcing your chest towards the floor, arching excessively through your lower back."
};

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
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

function readShift(page) {
  return page.evaluate(function () {
    var dock = document.getElementById("forensic-dock");
    var raw = getComputedStyle(dock).transform;
    var y = 0;
    if (raw && raw !== "none") {
      var parts = raw.match(/matrix(?:3d)?\((.+)\)/);
      if (parts) {
        var nums = parts[1].split(",").map(function (item) { return Number(item); });
        y = nums.length === 16 ? nums[13] : nums[5];
      }
    }
    var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
    return { y: y, videoH: video.height, videoY: video.y };
  });
}

(async function () {
  if (failed) {
    console.error(failed + " v88 check(s) failed");
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
    await page.goto("http://127.0.0.1:8080/?v=v98", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusCards && window.NexusCueEdit; });
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
    var before = await readShift(page);
    var lip = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight - 4, rect.bottom - 6) };
    });
    var samples = [before.y];
    var finger = [0];
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: lip.x, y: lip.y, id: 1 }]
    });
    var step;
    for (step = 1; step <= 8; step++) {
      var dy = step * 8;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: lip.x, y: lip.y - dy, id: 1 }]
      });
      await page.waitForTimeout(16);
      var sample = await readShift(page);
      samples.push(sample.y);
      finger.push(-dy);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    var jump = false;
    var matched = true;
    var monotonic = true;
    var n;
    for (n = 1; n < samples.length; n++) {
      var delta = samples[n] - samples[n - 1];
      if (delta > 1) monotonic = false;
      if (Math.abs(delta) > 30) jump = true;
      if (Math.abs((samples[n] - samples[0]) - finger[n]) > 8) matched = false;
    }
    if (jump || !matched || !monotonic) {
      fail(width + " the sheet jumped away from the finger " + JSON.stringify({ samples: samples, finger: finger }));
    } else ok(width + " the sheet rises with the finger");
    await page.waitForTimeout(400);
    var opened = await page.evaluate(function (videoBefore) {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      var dock = document.getElementById("forensic-dock").getBoundingClientRect();
      var key = decodeURIComponent(document.querySelector(".player-stage .deck-video.is-front").getAttribute("src").match(/r2\.dev\/([^?#]+)/)[1]);
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        videoH: video.height,
        videoY: video.y,
        beforeH: videoBefore.videoH,
        beforeY: videoBefore.videoY,
        ratio: dock.height / window.innerHeight,
        title: document.getElementById("cue-stage1-title").textContent,
        name: window.NexusCards.identityByKey(key).title,
        index: window.RelicArchitect.playerIndex
      };
    }, before);
    if (!opened.mid || opened.full || opened.index !== 0 || opened.title !== opened.name || Math.abs(opened.videoH - opened.beforeH) > 2 || Math.abs(opened.videoY - opened.beforeY) > 2 || opened.ratio > 0.27 || opened.ratio < 0.2) {
      fail(width + " opening moved the video or missed the title " + JSON.stringify(opened));
    } else ok(width + " the open sheet keeps the video still and names the clip");
    var port = await page.evaluate(function () {
      var rect = document.getElementById("cue-stage1").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    var seen = {};
    var pass;
    for (pass = 0; pass < 8; pass++) {
      var hit = await page.evaluate(function () {
        var scroller = document.getElementById("cue-stage1");
        var box = scroller.getBoundingClientRect();
        function shown(id) {
          var node = document.getElementById(id);
          if (!node) return false;
          var rect = node.getBoundingClientRect();
          return rect.top < box.bottom - 2 && rect.bottom > box.top + 2;
        }
        return {
          rules: shown("cue-sec-rules"),
          steps: shown("cue-sec-do"),
          avoid: shown("cue-sec-avoid"),
          breath: shown("cue-sec-breath"),
          top: scroller.scrollTop
        };
      });
      if (hit.rules) seen.rules = true;
      if (hit.steps) seen.steps = true;
      if (hit.avoid) seen.avoid = true;
      if (hit.breath) seen.breath = true;
      await client.send("Input.synthesizeScrollGesture", {
        x: port.x,
        y: port.y,
        yDistance: -220,
        speed: 800,
        preventFling: true,
        gestureSourceType: "mouse"
      });
      await page.waitForTimeout(80);
    }
    var indexAfterScroll = await page.evaluate(function () {
      return {
        index: window.RelicArchitect.playerIndex,
        mid: document.querySelector(".player-stage").classList.contains("is-cue-mid")
      };
    });
    if (!seen.rules || !seen.steps || !seen.avoid || !seen.breath || indexAfterScroll.index !== 0 || !indexAfterScroll.mid) {
      fail(width + " scrolling did not reach every section " + JSON.stringify(seen) + " index " + indexAfterScroll);
    } else ok(width + " native scrolling reaches all four sections without changing the clip");
    var side = await page.evaluate(function () {
      var rect = document.getElementById("cue-stage1").getBoundingClientRect();
      return { x: rect.x + rect.width * 0.85, x2: rect.x + 12, y: rect.y + 20 };
    });
    await touchPath(client, page, [
      { x: side.x, y: side.y },
      { x: side.x2, y: side.y }
    ]);
    await page.waitForTimeout(150);
    var kept = await page.evaluate(function () { return window.RelicArchitect.playerIndex; });
    if (kept !== 0) fail(width + " a sideways sheet swipe changed the clip");
    else ok(width + " a sideways swipe does nothing to the clip");
    var handle = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 8 };
    });
    await touchPath(client, page, [
      { x: handle.x, y: handle.y },
      { x: handle.x, y: handle.y + 80 },
      { x: handle.x, y: handle.y + 160 }
    ]);
    await page.waitForTimeout(400);
    var shut = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var box = document.getElementById("cue-stage1").getBoundingClientRect();
      return {
        mid: stage.classList.contains("is-cue-mid"),
        off: box.top >= stage.getBoundingClientRect().bottom - 8
      };
    });
    if (shut.mid || !shut.off) fail(width + " swipe down did not close to the lip " + JSON.stringify(shut));
    else ok(width + " swipe down closes to the lip");
    var lipAgain = await page.evaluate(function () {
      var rect = document.getElementById("forensic-tab").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight - 4, rect.bottom - 6) };
    });
    await touchPath(client, page, [{ x: lipAgain.x, y: lipAgain.y }, { x: lipAgain.x, y: lipAgain.y }]);
    await page.waitForTimeout(400);
    var film = await page.evaluate(function () {
      var rect = document.querySelector(".video-hit").getBoundingClientRect();
      return { x: rect.x + rect.width * 0.5, y: rect.y + 80 };
    });
    await touchPath(client, page, [{ x: film.x, y: film.y }, { x: film.x, y: film.y }]);
    await page.waitForTimeout(350);
    var tapped = await page.evaluate(function () {
      return document.querySelector(".player-stage").classList.contains("is-cue-mid");
    });
    if (tapped) fail(width + " a tap on the video left the sheet open");
    else ok(width + " a tap on the video closes the sheet");
    await touchPath(client, page, [
      { x: lipAgain.x, y: lipAgain.y },
      { x: lipAgain.x, y: lipAgain.y - 40 },
      { x: lipAgain.x, y: lipAgain.y - 140 }
    ]);
    await page.waitForTimeout(400);
    var flick = await page.evaluate(function () {
      var rect = document.querySelector(".video-hit").getBoundingClientRect();
      return { x: rect.x + rect.width * 0.8, y: rect.y + 70, x2: rect.x + rect.width * 0.15 };
    });
    await touchPath(client, page, [
      { x: flick.x, y: flick.y },
      { x: flick.x2, y: flick.y }
    ]);
    await page.waitForTimeout(400);
    var after = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var key = decodeURIComponent((video.getAttribute("src") || "").match(/r2\.dev\/([^?#]+)/)[1]);
      var identity = window.NexusCards.identityByKey(key);
      var timer = document.getElementById("relic-set-timer");
      var style = getComputedStyle(timer);
      var box = timer.getBoundingClientRect();
      return {
        index: window.RelicArchitect.playerIndex,
        title: document.getElementById("cue-stage1-title").textContent,
        name: identity ? identity.title : "",
        timer: box.height > 10 && style.opacity !== "0" && style.visibility !== "hidden" && /^\d/.test(timer.textContent)
      };
    });
    if (after.index === 0 || after.title !== after.name || !after.timer) {
      fail(width + " the title or timer did not follow the clip change " + JSON.stringify(after));
    } else ok(width + " the title and timer stay with the new clip");
    await context.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v88 check(s) failed");
    process.exit(1);
  }
  console.log("OK v88");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
