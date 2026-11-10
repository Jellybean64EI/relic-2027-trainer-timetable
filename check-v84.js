/* Nexus v84: last clip closes, and the cue sheet is a thin lip plus a short dose panel. */
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
var tick = app.slice(app.indexOf("function onClockTick("), app.indexOf("function setGate("));
var reconcile = app.slice(app.indexOf("function reconcileVisibility("), app.indexOf("function onVisibility("));

if (html.indexOf('content="v86"') === -1 || app.indexOf('build: "v86"') === -1) fail("cache stamp is not v86");
else ok("cache stamp is v86");
if (app.indexOf('stage.classList.toggle("is-cue-mid", next === 1)') === -1) fail("stage 1 no longer opens");
else ok("stage 1 still opens on the first swipe");
if (tick.indexOf("noteSetComplete()") === -1 || tick.indexOf("closePlayer()") < tick.indexOf("noteSetComplete()")) {
  fail("the last clip does not close after it is marked complete");
} else if (tick.indexOf('advance(1, "timer")') !== -1) fail("the last clip still wraps");
else ok("the last clip is marked complete and the player closes");
if (reconcile.indexOf("closePlayer()") === -1 || reconcile.indexOf('advance(steps') !== -1) fail("a hidden last clip still wraps");
else ok("returning on the last clip closes instead of wrapping");
if (app.indexOf('corners.className = "px-corners"') !== -1) fail("mute and speed are still mounted over the video");
else ok("mute and speed leave the video overlay");
if (app.indexOf('id="cue-stage1"') === -1 && app.indexOf('stage1.id = "cue-stage1"') === -1) fail("stage 1 panel is missing");
else ok("stage 1 panel exists");
if (css.indexOf(".cue-lip-tags") === -1 || css.split(".cue-lip-tags")[1].indexOf("display: none") === -1) {
  fail("closed lip still shows the pills");
} else ok("closed lip hides the pills and title");
if (app.indexOf("Joe entered. Not footage-verified.") !== -1 && app.indexOf('html.replace(/<p class="cue-manual">') === -1) {
  fail("the player can still show the Joe entered line");
} else ok("the player strips the Joe entered line");
if (css.indexOf("touch-action: none") === -1 || css.indexOf("translate3d") === -1 && app.indexOf("translate3d") === -1) {
  fail("cue gestures have no touch-action or transform");
} else ok("cue gestures use touch-action and a transform");

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
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: endX, clientY: endY, pointerId: spec.id, isPrimary: true }));
  }, { selector: selector, x1: x1, y1: y1, x2: x2, y2: y2, id: id });
}

(async function () {
  if (failed) {
    console.error(failed + " v84 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });
  var sizes = [[390, 844], [473, 900], [412, 915]];
  var i;
  for (i = 0; i < sizes.length; i++) {
    var width = sizes[i][0];
    var height = sizes[i][1];
    var page = await browser.newPage({ viewport: { width: width, height: height }, hasTouch: true });
    await page.goto("http://127.0.0.1:8080/?v=v86", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return window.RelicArchitect && window.NexusPlay; });
    await page.evaluate(function () {
      var toast = document.getElementById("deck-toast");
      if (toast) toast.style.display = "none";
      var list = window.RELIC_VIDEO_ARCHIVE.cabins.Back.playlist.slice(0, 2).map(function (clip) {
        return { src: window.RelicArchitect.resolveClipSrc("Back", clip), title: clip.title };
      });
      window.RelicArchitect.openCatalogPlaylist(list);
    });
    await page.waitForFunction(function () {
      var video = document.querySelector(".player-stage .deck-video.is-front");
      return video && video.getBoundingClientRect().height > 200;
    }, null, { timeout: 15000 });
    var closed = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var lip = document.getElementById("cue-lip");
      var handle = document.querySelector(".forensic-handle");
      var stage1 = document.getElementById("cue-stage1-clip");
      var sr = stage.getBoundingClientRect();
      var vr = video.getBoundingClientRect();
      var hr = handle.getBoundingClientRect();
      var s1 = stage1.getBoundingClientRect();
      return {
        lip: lip.clientHeight,
        pills: getComputedStyle(document.querySelector(".cue-lip-tags")).display,
        handleW: hr.width,
        handleBottom: Math.abs(hr.bottom - sr.bottom),
        stage1: s1.height,
        videoW: Math.abs(vr.width - sr.width),
        videoH: vr.height / sr.height,
        overlay: !!document.querySelector(".player-stage > .px-corners"),
        joe: document.getElementById("relic-player").textContent.indexOf("Joe entered") !== -1,
        full: stage.classList.contains("is-cue-full")
      };
    });
    if (closed.lip !== 0 || closed.pills !== "none" || closed.stage1 > 2 || closed.joe || closed.overlay || closed.full) {
      fail(width + " closed player still shows cue content " + JSON.stringify(closed));
    } else if (closed.handleW < width * 0.9 || closed.handleBottom > 6 || closed.videoW > 2 || closed.videoH < 0.9) {
      fail(width + " video or lip does not fill the player " + JSON.stringify(closed));
    } else ok(width + " closed player is full-screen video and a thin lip");
    var before = await page.evaluate(function () { return window.RelicArchitect.playerIndex; });
    var pass;
    await swipe(page, "#forensic-tab", 40, 8, 40, -70, 20);
    await page.waitForTimeout(380);
    var opened = await page.evaluate(function () {
      var stage = document.querySelector(".player-stage");
      var video = document.querySelector(".player-stage .deck-video.is-front");
      var panel = document.getElementById("cue-stage1");
      var sets = document.querySelector("#cue-stage1-dose div:nth-child(1)");
      var rest = document.querySelector("#cue-stage1-dose div:nth-child(4)");
      var mute = document.querySelector("#cue-px-host .px-mute");
      var speed = document.querySelector("#cue-px-host .px-rate");
      var sr = sets.getBoundingClientRect();
      var rr = rest.getBoundingClientRect();
      var mr = mute.getBoundingClientRect();
      var pr = speed.getBoundingClientRect();
      var vr = video.getBoundingClientRect();
      var prTop = panel.getBoundingClientRect().top;
      var text = panel.innerText;
      return {
        mid: stage.classList.contains("is-cue-mid"),
        full: stage.classList.contains("is-cue-full"),
        index: window.RelicArchitect.playerIndex,
        labels: document.querySelectorAll("#cue-stage1-dose dt").length,
        white: getComputedStyle(document.querySelector("#cue-stage1-dose dd")).color,
        orange: getComputedStyle(document.querySelector("#cue-stage1-dose dt")).color,
        muteX: Math.abs(mr.x - sr.x),
        speedX: Math.abs((pr.x + pr.width) - (rr.x + rr.width)),
        muteBelow: mr.y > sr.y,
        leads: text.indexOf("Lead") !== -1 || text.indexOf("Do this") !== -1 || text.indexOf("Avoid") !== -1 || text.indexOf("Breathing") !== -1,
        joe: document.getElementById("relic-player").textContent.indexOf("Joe entered") !== -1,
        covered: vr.bottom > prTop + 8,
        videoFill: vr.height / stage.getBoundingClientRect().height,
        playing: !video.paused
      };
    });
    if (!opened.mid || opened.full || opened.index !== before || opened.labels !== 4 || opened.leads || opened.joe || !opened.covered || opened.videoFill < 0.9) {
      fail(width + " stage 1 is wrong " + JSON.stringify(opened));
    } else if (opened.muteX > 20 || opened.speedX > 24 || !opened.muteBelow) {
      fail(width + " mute or speed is not under the dose boxes " + JSON.stringify(opened));
    } else ok(width + " stage 1 shows dose, mute and speed without changing the clip");
    for (pass = 0; pass < 4; pass++) {
      await swipe(page, "#forensic-tab", 30, 6, 30, 90, 40 + pass);
      await page.waitForTimeout(380);
    }
    var shut = await page.evaluate(function () {
      return {
        mid: document.querySelector(".player-stage").classList.contains("is-cue-mid"),
        index: window.RelicArchitect.playerIndex,
        stage1: document.getElementById("cue-stage1-clip").getBoundingClientRect().height
      };
    });
    if (shut.mid || shut.index !== before || shut.stage1 > 2) fail(width + " repeated swipe down did not close the lip " + JSON.stringify(shut));
    else ok(width + " repeated swipes open and close the lip");
    await swipe(page, ".player-stage .deck-video.is-front", width * 0.7, 80, width * 0.7 - 140, 80, 7);
    await page.waitForTimeout(300);
    var moved = await page.evaluate(function () { return window.RelicArchitect.playerIndex; });
    if (moved !== before + 1) fail(width + " a video swipe did not change clips");
    else ok(width + " a video swipe still changes clips");
    await page.close();
  }

  var expiry = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
  await expiry.goto("http://127.0.0.1:8080/?v=v86&setsec=2", { waitUntil: "domcontentloaded" });
  await expiry.waitForFunction(function () { return window.RelicArchitect; });
  var primed = await expiry.evaluate(function () {
    window.RelicArchitect.setFutureLock(false);
    localStorage.removeItem("nexus_ticks_dirty_v2");
    window.RelicArchitect.openCabin("Eyes", "Base", "2099-06-15", 0);
    return (window.RELIC_VIDEO_ARCHIVE.cabins.Eyes.playlist || []).length;
  });
  var guard = 0;
  while (guard < 12) {
    var at = await expiry.evaluate(function () { return window.RelicArchitect.playerIndex; });
    if (at >= primed - 1) break;
    await expiry.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await expiry.waitForTimeout(420);
    guard += 1;
  }
  await expiry.evaluate(function () { window.RelicArchitect.playNextVideo(); });
  await expiry.waitForTimeout(400);
  var manual = await expiry.evaluate(function () {
    var root = document.getElementById("relic-player");
    return {
      closed: !!(root && root.hidden),
      dirty: JSON.parse(localStorage.getItem("nexus_ticks_dirty_v2") || "{}")
    };
  });
  if (!manual.closed || manual.dirty["2099-06-15"]) fail("a manual swipe past the last clip ticked or stayed open " + JSON.stringify(manual));
  else ok("a manual swipe past the last clip closes without a tick");
  await expiry.evaluate(function () {
    localStorage.removeItem("nexus_ticks_dirty_v2");
    window.RelicArchitect.openCabin("Eyes", "Base", "2099-06-15", 0);
  });
  guard = 0;
  while (guard < 12) {
    var atAgain = await expiry.evaluate(function () { return window.RelicArchitect.playerIndex; });
    if (atAgain >= primed - 1) break;
    await expiry.evaluate(function () { window.RelicArchitect.playNextVideo(); });
    await expiry.waitForTimeout(420);
    guard += 1;
  }
  await expiry.waitForFunction(function () {
    var root = document.getElementById("relic-player");
    return root && root.hidden;
  }, null, { timeout: 15000 });
  var done = await expiry.evaluate(function () {
    var root = document.getElementById("relic-player");
    return {
      closed: !!(root && root.hidden),
      schedules: !document.body.classList.contains("player-open"),
      dirty: JSON.parse(localStorage.getItem("nexus_ticks_dirty_v2") || "{}")
    };
  });
  var puts = tickPuts.filter(function (url) { return url.indexOf("/ticks/") !== -1; }).length;
  if (!done.closed || !done.schedules || done.dirty["2099-06-15"] !== 1 || puts !== 1) {
    fail("last-clip expiry did not complete once and return to schedules " + JSON.stringify(done) + " puts " + puts);
  } else ok("last-clip expiry completes once and returns to schedules");
  await expiry.close();
  await browser.close();
  if (failed) {
    console.error(failed + " v84 check(s) failed");
    process.exit(1);
  }
  console.log("OK v84");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
