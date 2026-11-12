/* Nexus v83: each clip has its own countdown. Only the close button and timer auto-hide. */
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
var chrome = fs.readFileSync("data/playerChrome.js", "utf8");

if (html.indexOf('content="v92"') === -1 || app.indexOf('build: "v92"') === -1) fail("cache stamp is not v83");
else ok("cache stamp is v83");
if (app.indexOf("HUD_IDLE_MS = 4000") === -1) fail("auto-hide is not 4 seconds");
else ok("auto-hide waits 4 seconds");
if (app.indexOf("if (manual) beginClipClock();") === -1) fail("a new clip does not reset its countdown");
else ok("each clip starts its own countdown");
var clockTick = app.slice(app.indexOf("function onClockTick("), app.indexOf("function setGate("));
if (clockTick.indexOf("player.index < player.clips.length - 1") === -1 || clockTick.indexOf('advance(1, "next")') === -1) {
  fail("a mid-list expiry does not advance like a swipe");
} else if (clockTick.indexOf("noteSetComplete()") < clockTick.indexOf('advance(1, "next")')) {
  fail("a mid-list expiry can still mark the day complete");
} else ok("only the last clip's expiry marks the day complete");
var reconcile = app.slice(app.indexOf("function reconcileVisibility("), app.indexOf("function onVisibility("));
if (reconcile.indexOf("noteSetComplete()") < reconcile.indexOf('advance(1, "next")')) {
  fail("returning to a mid-list clip can still mark the day complete");
} else ok("a hidden mid-list expiry does not mark the day complete");
if (chrome.indexOf("function readTimer") === -1 || chrome.indexOf("function writeTimer") === -1) fail("timer duration is not stored with the video");
else ok("timer duration uses the mute and speed store");
if (css.indexOf(".player-stage.is-chrome-idle .player-close") === -1 || css.indexOf(".player-stage.is-chrome-idle .timer-dock") === -1) {
  fail("close or timer does not auto-hide");
} else ok("close and timer auto-hide");
if (css.indexOf(".player-stage.is-chrome-idle .px-mute") !== -1 || css.indexOf(".player-stage.is-chrome-idle .px-rate") !== -1) {
  fail("mute or speed is included in the auto-hide");
} else ok("mute and speed are not auto-hidden");

function secs(text) {
  var parts = String(text || "").split(":");
  if (parts.length !== 2) return -1;
  return (Number(parts[0]) * 60) + Number(parts[1]);
}

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v83 check(s) failed");
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
    await page.goto("http://127.0.0.1:8080/?v=v92", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusPlay; });
    var srcs = await page.evaluate(function () {
      return window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist.slice(0, 2).map(function (clip) {
        return { src: window.RelicArchitect.resolveClipSrc("Back", clip), title: clip.title };
      });
    });
    await page.evaluate(function (list) {
      window.RelicArchitect.openCatalogPlaylist(list);
    }, srcs);
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && !video.paused && video.currentTime > 0.2;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    var before = secs(await page.locator("#relic-set-timer").innerText());
    await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var box = video.getBoundingClientRect();
      video.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.x + box.width * 0.7, clientY: box.y + 70, pointerId: 1, isPrimary: true }));
      video.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.x + box.width * 0.7 - 130, clientY: box.y + 70, pointerId: 1, isPrimary: true }));
    });
    await page.waitForTimeout(400);
    var after = secs(await page.locator("#relic-set-timer").innerText());
    if (!(after > before)) fail(widths[i] + " swipe did not reset the countdown (" + before + " -> " + after + ")");
    else ok(widths[i] + " swipe resets the countdown");
    await page.evaluate(function () { window.RelicArchitect.applyDurationOverride(2); });
    var two = secs(await page.locator("#relic-set-timer").innerText());
    if (two > 120 || two < 100) fail(widths[i] + " 2 minute override did not apply (" + two + ")");
    else ok(widths[i] + " 2 minute override applies to this clip");
    await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var box = video.getBoundingClientRect();
      video.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.x + 80, clientY: box.y + 70, pointerId: 2, isPrimary: true }));
      video.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.x + 220, clientY: box.y + 70, pointerId: 2, isPrimary: true }));
    });
    await page.waitForTimeout(500);
    var back = secs(await page.locator("#relic-set-timer").innerText());
    if (back < 1100) fail(widths[i] + " the other clip lost the default countdown (" + back + ")");
    else ok(widths[i] + " a clip without a saved time stays at the default");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusPlay; });
    await page.evaluate(function (list) {
      window.RelicArchitect.openCatalogPlaylist([list[1], list[0]]);
    }, srcs);
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && video.currentTime > 0.05;
    }, null, { timeout: 15000 });
    var restored = secs(await page.locator("#relic-set-timer").innerText());
    if (restored > 120 || restored < 90) fail(widths[i] + " saved 2 minutes did not survive reload (" + restored + ")");
    else ok(widths[i] + " saved duration survives reload");
    if (widths[i] === 390) {
      var added = await page.evaluate(function () {
        window.RelicArchitect.applyAddMoreTime(10);
        var text = document.getElementById("relic-set-timer").textContent;
        var parts = text.split(":");
        var shown = (Number(parts[0]) * 60) + Number(parts[1]);
        var map = JSON.parse(localStorage.getItem("nexus-play-v78") || "{}");
        var saved = 0;
        Object.keys(map).forEach(function (token) {
          if (map[token] && map[token].seconds > saved) saved = map[token].seconds;
        });
        return { shown: shown, saved: saved };
      });
      if (added.shown < 680 || added.shown > 730 || added.saved < 680 || added.saved > 730) {
        fail("adding 10 minutes did not remember the new total (" + added.shown + " / " + added.saved + ")");
      } else ok("adding time remembers the new total for that video");
    }
    await page.evaluate(function () { window.RelicArchitect.applyDurationOverride(10); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect; });
    await page.evaluate(function (list) {
      window.RelicArchitect.openCatalogPlaylist([list[1]]);
    }, srcs);
    await page.waitForTimeout(600);
    var ten = secs(await page.locator("#relic-set-timer").innerText());
    if (ten > 600 || ten < 500) fail(widths[i] + " overwrite did not stick (" + ten + ")");
    else ok(widths[i] + " a new duration overwrites the saved one");
    if (widths[i] === 390) {
      await page.waitForFunction(function () {
        var video = document.querySelector(".player-stage .deck-video.is-front");
        return video && !video.paused && video.currentTime > 0.2;
      }, null, { timeout: 15000 });
      await page.waitForTimeout(4800);
      var hidden = await page.evaluate(function () {
        var stage = document.querySelector(".player-stage");
        var close = document.getElementById("relic-player-close");
        var timer = document.getElementById("relic-timer-dock");
        return {
          idle: stage.classList.contains("is-chrome-idle"),
          close: getComputedStyle(close).opacity,
          closePe: getComputedStyle(close).pointerEvents,
          timer: getComputedStyle(timer).opacity,
          timerPe: getComputedStyle(timer).pointerEvents,
          overlay: !!document.querySelector(".player-stage > .px-corners"),
          paused: document.querySelector(".player-stage .deck-video.is-front").paused
        };
      });
      if (!hidden.idle || hidden.close !== "0" || hidden.closePe !== "none" || hidden.timer !== "0" || hidden.timerPe !== "none") fail("close and timer did not hide after 4 seconds");
      else ok("close and timer hide after 4 seconds");
      if (hidden.overlay) fail("mute or speed is still over the video");
      else ok("mute and speed are not over the video");
      var revealed = await page.evaluate(function () {
        var video = document.querySelector(".player-stage .deck-video.is-front");
        var box = video.getBoundingClientRect();
        var was = video.paused;
        video.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + 90, pointerId: 3, isPrimary: true }));
        video.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + 90, pointerId: 3, isPrimary: true }));
        return { was: was, paused: video.paused, idle: document.querySelector(".player-stage").classList.contains("is-chrome-idle") };
      });
      if (revealed.paused || revealed.idle) fail("first tap did not only reveal the close button and timer");
      else ok("first tap while hidden only reveals the close button and timer");
      await page.evaluate(function () {
        var video = document.querySelector(".player-stage .deck-video.is-front");
        var box = video.getBoundingClientRect();
        video.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + 90, pointerId: 4, isPrimary: true }));
        video.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + 92, pointerId: 4, isPrimary: true }));
      });
      await page.waitForTimeout(200);
      var paused = await page.evaluate(function () { return document.querySelector(".player-stage .deck-video.is-front").paused; });
      await page.waitForTimeout(4300);
      var stayed = await page.evaluate(function () {
        return {
          paused: document.querySelector(".player-stage .deck-video.is-front").paused,
          idle: document.querySelector(".player-stage").classList.contains("is-chrome-idle"),
          close: getComputedStyle(document.getElementById("relic-player-close")).opacity
        };
      });
      if (!paused || !stayed.paused || stayed.idle || stayed.close === "0") fail("controls hid while paused");
      else ok("a visible tap pauses and the close button stays while paused");
    }
    await page.close();
  }

  for (i = 0; i < widths.length; i++) {
    var expiry = await browser.newPage({ viewport: { width: widths[i], height: widths[i] === 390 ? 844 : 900 }, hasTouch: true });
    var tickPuts = [];
    await expiry.route("**/*", function (route) {
      if (route.request().method() === "PUT") {
        tickPuts.push(route.request().url());
        route.fulfill({ status: 500, body: "" });
        return;
      }
      route.continue();
    });
    await expiry.addInitScript(function () {
      try { localStorage.removeItem("nexus_ticks_dirty_v2"); } catch (err) { /* private mode */ }
    });
    await expiry.goto("http://127.0.0.1:8080/?v=v92&setsec=2", { waitUntil: "domcontentloaded" });
    await expiry.waitForFunction(function () { return window.RelicArchitect && window.NexusPlay; });
    var primed = await expiry.evaluate(function () {
      window.RelicArchitect.setFutureLock(false);
      var cabin = window.RELIC_VIDEO_ARCHIVE.cabins.Eyes;
      var list = (cabin && cabin.playlist) || [];
      var second = list[1];
      if (!second) return { n: list.length, tokens: [] };
      var src = window.RelicArchitect.resolveClipSrc("Eyes", second);
      var tokens = window.NexusPlay.tokensFor(src, "", 0);
      list.forEach(function (clip, index) {
        var clipSrc = window.RelicArchitect.resolveClipSrc("Eyes", clip);
        var clipTokens = window.NexusPlay.tokensFor(clipSrc, "", 0);
        if (index === 1) window.NexusPlay.writeTimer(clipTokens, 8);
        else window.NexusPlay.write(clipTokens, { seconds: 0 });
      });
      localStorage.removeItem("nexus_ticks_dirty_v2");
      window.RelicArchitect.openCabin("Eyes", "Base", "2099-06-15", 0);
      return { n: list.length, tokens: tokens };
    });
    if (primed.n < 2) fail(widths[i] + " Eyes playlist is too short to test expiry");
    else {
      await expiry.waitForFunction(function () { return window.RelicArchitect.playerIndex === 1; }, null, { timeout: 20000 });
      var advanced = secs(await expiry.locator("#relic-set-timer").innerText());
      var mid = await expiry.evaluate(function () {
        return JSON.parse(localStorage.getItem("nexus_ticks_dirty_v2") || "{}");
      });
      if (advanced < 6 || advanced > 8) fail(widths[i] + " auto-advance did not use the next clip's saved duration (" + advanced + ")");
      else ok(widths[i] + " auto-advance keeps the next clip's saved duration");
      if (mid["2099-06-15"] || tickPuts.length) fail(widths[i] + " a mid-list expiry wrote completion");
      else ok(widths[i] + " a mid-list expiry does not write completion");
      var guard = 0;
      var playlistLength = primed.n;
      while (guard < 12) {
        var at = await expiry.evaluate(function () { return window.RelicArchitect.playerIndex; });
        if (at >= playlistLength - 1) break;
        await expiry.evaluate(function () { window.RelicArchitect.playNextVideo(); });
        await expiry.waitForTimeout(420);
        guard += 1;
      }
      await expiry.waitForFunction(function () {
        var root = document.getElementById("relic-player");
        return root && root.hidden;
      }, null, { timeout: 15000 });
      var once = await expiry.evaluate(function () {
        var root = document.getElementById("relic-player");
        return {
          dirty: JSON.parse(localStorage.getItem("nexus_ticks_dirty_v2") || "{}"),
          closed: !!(root && root.hidden),
          open: document.body.classList.contains("player-open")
        };
      });
      var putsAfterFirst = tickPuts.filter(function (url) { return url.indexOf("/ticks/") !== -1; }).length;
      if (once.dirty["2099-06-15"] !== 1 || putsAfterFirst !== 1 || !once.closed || once.open) {
        fail(widths[i] + " the last clip did not complete once and close (" + JSON.stringify(once) + ", puts " + putsAfterFirst + ")");
      } else ok(widths[i] + " the last clip's expiry completes the day once and closes");
    }
    await expiry.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v83 check(s) failed");
    process.exit(1);
  }
  console.log("OK v83");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
