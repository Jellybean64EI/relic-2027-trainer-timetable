/* Nexus v82: the first schedule clip must reach the stage and start playing. */
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
var playAt = app.indexOf("function playFront(");
var playBody = app.slice(playAt, playAt + 700);
if (html.indexOf('content="v104"') === -1 || app.indexOf('build: "v104"') === -1) fail("cache stamp is not v104");
else ok("cache stamp is v104");
if (playBody.indexOf("stageFront(video)") > playBody.indexOf("video.play")) fail("first play still happens off the stage");
else ok("play moves the clip onto the stage first");
if (app.indexOf("function armPlayWatch") === -1 || app.indexOf("Tap to play") === -1) fail("watchdog or tap-to-play is missing");
else ok("watchdog and tap-to-play exist");
if (app.indexOf("pendingClockMs") === -1) fail("timer is not held until playback");
else ok("timer waits until the clip is playing");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v82 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var widths = [390, 473];
  var i;
  for (i = 0; i < widths.length; i++) {
    var page = await browser.newPage({ viewport: { width: widths[i], height: widths[i] === 390 ? 844 : 900 }, hasTouch: true });
    await require("./tools/regression-session").arm(page);
    await page.addInitScript(function () {
      localStorage.setItem("nexus-play-v78", JSON.stringify({
        "key:Back/1. Spine Circles.mp4": { muted: true, rate: 0.5, cycled: true },
        "id:10001": { muted: true, rate: 0.5, cycled: true }
      }));
    });
    await page.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusPlay; });
    await page.evaluate(function () {
      var orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        var self = this;
        var args = arguments;
        return new Promise(function (resolve, reject) {
          setTimeout(function () { orig.apply(self, args).then(resolve, reject); }, 350);
        });
      };
    });
    var srcs = await page.evaluate(function () {
      return window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist.slice(0, 2).map(function (clip) {
        return window.RelicArchitect.resolveClipSrc("Back", clip);
      });
    });
    await page.evaluate(function (urls) {
      window.RelicArchitect.openCatalogPlaylist([
        { title: "1. Spine Circles.mp4", src: urls[0], stage: "Pre-stretch 1/2" },
        { title: "2. Supine Windshield Wipers.mp4", src: urls[1], stage: "Pre-stretch 2/2" }
      ]);
    }, srcs);
    var early = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return {
        timer: document.getElementById("relic-set-timer").textContent,
        playing: !!(video && !video.paused && video.currentTime > 0.05)
      };
    });
    if (early.playing) fail("timer sample raced ahead of the delayed play");
    else if (early.timer !== "20:00") fail("timer moved before playback: " + early.timer);
    else ok(widths[i] + " timer stays at 20:00 until play");
    var live = await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && video.parentElement && video.parentElement.classList.contains("player-stage") && !video.paused && video.currentTime > 0.15;
    }, null, { timeout: 15000 }).then(function () { return true; }).catch(function () { return false; });
    if (!live) fail(widths[i] + " first clip did not reach playing");
    else ok(widths[i] + " first clip plays on the stage without a tap");
    var prefs = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return { muted: video.muted, rate: video.playbackRate, timer: document.getElementById("relic-set-timer").textContent };
    });
    if (!prefs.muted || Math.abs(prefs.rate - 0.5) > 0.001) fail(widths[i] + " saved sound or speed was dropped");
    else ok(widths[i] + " saved Off and 0.5x are applied");
    if (widths[i] === 390) {
      await page.evaluate(function () { document.querySelector("#relic-player .px-rate").click(); });
      var cycled = await page.evaluate(function () {
        var video = document.querySelector(".player-stage .deck-video.is-front");
        return { rate: video.playbackRate, text: document.querySelector("#relic-player .px-rate").innerText };
      });
      if (Math.abs(cycled.rate - 0.6) > 0.001) fail("speed tap did not move 0.5x to 0.6x");
      else ok("speed tap still cycles (" + cycled.text.replace(/\s+/g, " ") + ")");
      var moved = await page.evaluate(function () {
        var before = window.RelicArchitect.playerIndex;
        var video = document.querySelector(".player-stage .deck-video.is-front");
        var box = video.getBoundingClientRect();
        video.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.x + box.width * 0.7, clientY: box.y + 80, pointerId: 1, isPrimary: true }));
        video.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.x + box.width * 0.7 - 120, clientY: box.y + 80, pointerId: 1, isPrimary: true }));
        return { before: before, after: window.RelicArchitect.playerIndex };
      });
      if (moved.after !== moved.before + 1) fail("swipe did not advance one clip");
      else ok("swipe still advances one clip");
    }
    await page.waitForFunction(function () {
      return document.getElementById("relic-set-timer").textContent !== "20:00";
    }, null, { timeout: 4000 }).catch(function () { fail(widths[i] + " timer did not start after playback"); });
    if (widths[i] === 390) {
      var healed = await page.evaluate(async function () {
        var video = document.querySelector(".player-stage .deck-video.is-front");
        video.pause();
        video.autoplay = false;
        video.removeAttribute("autoplay");
        var calls = 0;
        video.play = function () {
          calls += 1;
          return Promise.reject(Object.assign(new Error("fail"), { name: "NetworkError" }));
        };
        function fire() { video.dispatchEvent(new Event("error")); }
        fire();
        await new Promise(function (resolve) { setTimeout(resolve, 450); });
        fire();
        await new Promise(function (resolve) { setTimeout(resolve, 450); });
        fire();
        await new Promise(function (resolve) { setTimeout(resolve, 450); });
        fire();
        return { calls: calls, tap: !document.getElementById("px-tap-play").hidden };
      });
      if (healed.calls < 2 || !healed.tap) fail("watchdog did not retry then offer tap-to-play");
      else ok("watchdog retries twice then shows tap-to-play");
    }
    await page.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v82 check(s) failed");
    process.exit(1);
  }
  console.log("OK v82");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
