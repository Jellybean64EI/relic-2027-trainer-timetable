/* Nexus v85: stage 2 is a taller sheet with four cue slides. */
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
var touchStart = app.slice(app.indexOf('forensicDock.addEventListener("touchstart"'), app.indexOf('forensicDock.addEventListener("touchmove"'));

if (html.indexOf('content="v96"') === -1 || app.indexOf('build: "v96"') === -1) fail("cache stamp is not v96");
else ok("cache stamp is v96");
if (app.indexOf("var CUE_STAGE_CAP = 1") === -1 || app.indexOf("bindCueSlides") !== -1) fail("a second stage is still in the player");
else ok("there is one sheet and no slide track");
if (touchStart.indexOf("tab: true") !== -1) fail("a tap inside the panel can close it");
else if (touchStart.indexOf("#forensic-tab, #cue-lip") === -1) fail("the touch path does not check the lip");
else ok("a tap inside the panel does not toggle it");
if (app.indexOf(">3 Lead Rules<") === -1 && app.indexOf("3 Lead Rules") === -1) fail("lead heading was not renamed");
else ok("the player says 3 Lead Rules");
["Do This Properly", "Avoid This", "Breathing", "Not added yet"].forEach(function (label) {
  if (app.indexOf(label) === -1) fail("missing slide text " + label);
});
if (!failed) ok("slide headings and the empty state are present");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

function swipe(page, selector, x1, y1, x2, y2, id) {
  return page.evaluate(function (spec) {
    var node = document.querySelector(spec.selector);
    var box = node.getBoundingClientRect();
    var startX = box.x + spec.x1;
    var startY = box.y + spec.y1;
    var endX = box.x + spec.x2;
    var endY = box.y + spec.y2;
    node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: startX, clientY: startY, pointerId: spec.id, isPrimary: true }));
    node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: (startX + endX) / 2, clientY: (startY + endY) / 2, pointerId: spec.id, isPrimary: true }));
    node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: endX, clientY: endY, pointerId: spec.id, isPrimary: true }));
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: endX, clientY: endY, pointerId: spec.id, isPrimary: true }));
  }, { selector: selector, x1: x1, y1: y1, x2: x2, y2: y2, id: id });
}

(async function () {
  if (failed) {
    console.error(failed + " v85 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var sizes = [[390, 844], [412, 915], [473, 900]];
  var i;
  for (i = 0; i < sizes.length; i++) {
    var width = sizes[i][0];
    var height = sizes[i][1];
    var page = await browser.newPage({ viewport: { width: width, height: height }, hasTouch: true });
    await page.goto("http://127.0.0.1:8080/?v=v96", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusCueEdit && window.NexusCards; });
    await page.evaluate(function () {
      var list = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist.slice(0, 2).map(function (clip) {
        return { src: window.RelicArchitect.resolveClipSrc("Back", clip), title: clip.title };
      });
      window.RelicArchitect.openCatalogPlaylist(list);
    });
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && video.getBoundingClientRect().height > 200;
    }, null, { timeout: 15000 });
    await page.waitForFunction(function () {
      var src = window.RelicArchitect.resolveClipSrc("Back", window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist[0]);
      var match = String(src).match(/r2\.dev\/([^?#]+)/);
      var key = "";
      try { key = match ? decodeURIComponent(match[1]) : ""; } catch (err) { key = match ? match[1] : ""; }
      var cues = performance.getEntriesByType("resource").filter(function (row) { return row.name.indexOf("/video-cues") !== -1; }).length;
      return cues >= 2 && !!(key && window.NexusCards.identityByKey(key));
    }, null, { timeout: 10000 });
    var saved = await page.evaluate(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var src = video ? (video.getAttribute("src") || "") : "";
      var match = src.match(/r2\.dev\/([^?#]+)/);
      var key = "";
      try { key = match ? decodeURIComponent(match[1]) : ""; } catch (err) { key = match ? match[1] : ""; }
      var identity = key && window.NexusCards.identityByKey ? window.NexusCards.identityByKey(key) : null;
      if (!identity) return null;
      window.NexusCueEdit.load = function () { return Promise.resolve(); };
      window.NexusCueEdit.remember({
        videoId: identity.videoId,
        r2Key: identity.r2Key,
        cue: {
          leads: ["Reach long", "Hips back", ""],
          steps: ["Place hands on the wall"],
          dose: { sets: "4", reps: "8", hold: "20s", rest: "10s" },
          breathing: "Exhale as you push",
          avoid: "Don't shrug"
        }
      });
      return identity.videoId;
    });
    if (!saved) fail(width + " the playing clip has no permanent id");
    var index = await page.evaluate(function () { return window.RelicArchitect.playerIndex; });
    await swipe(page, "#forensic-tab", 40, 8, 40, -80, 11);
    await page.waitForTimeout(400);
    var stage1 = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        sets: document.querySelector("#cue-stage1-dose dd").textContent
      };
    });
    if (!stage1.mid || stage1.full || stage1.sets !== "4") fail(width + " stage 1 did not show the editor dose " + JSON.stringify(stage1));
    else ok(width + " stage 1 shows the editor dose");
    var mutedBefore = await page.evaluate(function () { return document.querySelector(".player-stage .deck-video.is-front").muted; });
    await page.evaluate(function () { document.querySelector("#relic-player .px-mute").click(); });
    await swipe(page, "#cue-stage1-dose", 16, 8, 18, 10, 12);
    await page.waitForTimeout(200);
    var tapped = await page.evaluate(function () {
      return {
        mid: document.querySelector(".player-stage").classList.contains("is-cue-mid"),
        muted: document.querySelector(".player-stage .deck-video.is-front").muted
      };
    });
    if (!tapped.mid || tapped.muted === mutedBefore) fail(width + " a mute or dose tap changed the panel " + JSON.stringify(tapped));
    else ok(width + " mute and dose taps leave the panel open");
    await swipe(page, "#cue-stage1", width * 0.8, 30, 24, 30, 14);
    await page.waitForTimeout(200);
    var slid = await page.evaluate(function () {
      var sheet = document.getElementById("cue-stage1");
      return {
        index: window.RelicArchitect.playerIndex,
        mid: document.querySelector(".player-stage").classList.contains("is-cue-mid"),
        rules: document.getElementById("cue-sec-rules").textContent,
        avoid: document.getElementById("cue-sec-avoid").textContent,
        breath: document.getElementById("cue-sec-breath").textContent,
        doText: document.getElementById("cue-sec-do").textContent,
        joe: sheet.textContent.indexOf("Joe entered")
      };
    });
    if (slid.index !== index || !slid.mid || slid.joe !== -1 || slid.rules.indexOf("3 Lead Rules") === -1 || slid.rules.indexOf("Hips back") === -1 || slid.avoid.indexOf("Don't shrug") === -1 || slid.breath.indexOf("Exhale as you push") === -1 || slid.doText.indexOf("Place hands on the wall") === -1) {
      fail(width + " a sideways sheet swipe changed the clip or dropped the editor text " + JSON.stringify(slid));
    } else ok(width + " a sideways swipe stays on the clip and keeps the editor text");
    await swipe(page, "#forensic-tab", 20, 6, 20, 120, 16);
    await page.waitForTimeout(400);
    var shut = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var box = document.getElementById("cue-stage1").getBoundingClientRect();
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        off: box.top >= stage.getBoundingClientRect().bottom - 8,
        index: window.RelicArchitect.playerIndex
      };
    });
    if (shut.mid || shut.full || !shut.off || shut.index !== index) fail(width + " the lip did not close " + JSON.stringify(shut));
    else ok(width + " swipe down closes to the lip");
    await page.close();
  }
  await browser.close();
  if (failed) {
    console.error(failed + " v85 check(s) failed");
    process.exit(1);
  }
  console.log("OK v85");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
