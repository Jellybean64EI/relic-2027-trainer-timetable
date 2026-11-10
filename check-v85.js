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
var touchStart = app.slice(app.indexOf('addEventListener("touchstart"'), app.indexOf('addEventListener("touchmove"'));

if (html.indexOf('content="v85"') === -1 || app.indexOf('build: "v85"') === -1) fail("cache stamp is not v85");
else ok("cache stamp is v85");
if (app.indexOf("var CUE_STAGE_CAP = 2") === -1) fail("stage 2 does not open");
else ok("a second swipe can open stage 2");
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
    await page.goto("http://127.0.0.1:8080/?v=v85", { waitUntil: "domcontentloaded" });
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
    await swipe(page, "#forensic-tab", 30, 6, 30, -90, 13);
    await page.waitForTimeout(450);
    var stage2 = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var sheet = document.getElementById("cue-stage2-clip").getBoundingClientRect();
      var video = document.querySelector(".player-stage .deck-video.is-front").getBoundingClientRect();
      var headings = Array.prototype.map.call(document.querySelectorAll("#cue-slides h3"), function (node) { return node.textContent; });
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        ratio: sheet.height / window.innerHeight,
        covered: video.bottom > sheet.top + 2,
        headings: headings,
        sets: document.querySelector("#cue-slide-dose dd").textContent,
        rules: document.querySelector("#cue-slide-leads").innerText,
        index: window.RelicArchitect.playerIndex,
        joe: (document.getElementById("cue-stage1").textContent + document.getElementById("cue-stage2").textContent).indexOf("Joe entered")
      };
    });
    if (!stage2.full || stage2.mid || stage2.ratio < 0.55 || stage2.ratio > 0.65 || stage2.covered || stage2.index !== index || stage2.joe !== -1) {
      fail(width + " stage 2 size or isolation is wrong " + JSON.stringify(stage2));
    } else if (stage2.headings.join("|") !== "Do This Properly|Avoid This|3 Lead Rules|Breathing" || stage2.sets !== "4" || stage2.rules.indexOf("Reach long") === -1 || stage2.rules.indexOf("Not added yet") === -1) {
      fail(width + " stage 2 slides are wrong " + JSON.stringify(stage2));
    } else ok(width + " stage 2 is the tall sheet with four slides");
    await swipe(page, "#cue-slides", width * 0.8, 40, 30, 40, 14);
    await page.waitForTimeout(400);
    var slid = await page.evaluate(function () {
      var track = document.getElementById("cue-slides");
      var width = track.clientWidth || 1;
      return {
        index: window.RelicArchitect.playerIndex,
        slide: Math.round(track.scrollLeft / width),
        dot: document.querySelector("#cue-dots .cue-dot.is-on").getAttribute("data-cue-dot"),
        avoid: document.getElementById("cue-slide-do").innerText.indexOf("Don't shrug") !== -1
      };
    });
    if (slid.index !== index || slid.slide !== 1 || slid.dot !== "1" || !slid.avoid) fail(width + " a slide swipe changed the clip or missed the slide " + JSON.stringify(slid));
    else ok(width + " a slide swipe stays on the same clip");
    await page.evaluate(function () {
      var track = document.getElementById("cue-slides");
      track.scrollLeft = track.clientWidth * 2;
    });
    var leads = await page.evaluate(function () { return document.getElementById("cue-slide-leads").textContent; });
    await page.evaluate(function () {
      var track = document.getElementById("cue-slides");
      track.scrollLeft = track.clientWidth * 3;
    });
    var breath = await page.evaluate(function () { return document.getElementById("cue-slide-breath").textContent; });
    if (leads.indexOf("3 Lead Rules") === -1 || leads.indexOf("Hips back") === -1 || breath.indexOf("Exhale as you push") === -1) {
      fail(width + " later slides lost the editor text");
    } else ok(width + " lead rules and breathing use the editor text");
    await swipe(page, "#forensic-tab", 20, 6, 20, 100, 15);
    await page.waitForTimeout(400);
    var back = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return { mid: stage.classList.contains("is-cue-mid"), full: stage.classList.contains("is-cue-full") };
    });
    if (!back.mid || back.full) fail(width + " swipe down from stage 2 did not return to stage 1 " + JSON.stringify(back));
    else ok(width + " swipe down returns to stage 1");
    await swipe(page, "#forensic-tab", 20, 6, 20, 100, 16);
    await page.waitForTimeout(400);
    var shut = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        sheet: document.getElementById("cue-stage2-clip").getBoundingClientRect().height,
        index: window.RelicArchitect.playerIndex
      };
    });
    if (shut.mid || shut.full || shut.sheet > 2 || shut.index !== index) fail(width + " the lip did not close " + JSON.stringify(shut));
    else ok(width + " swipe down from stage 1 closes to the lip");
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
