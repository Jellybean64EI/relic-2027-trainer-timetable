/* Nexus v90: the cue editor keeps the id and hides the storage path. */
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
var editor = fs.readFileSync("data/cueEditor.js", "utf8");
var identities = JSON.parse(fs.readFileSync("data/videoIdentity.json", "utf8")).identities;
var legacy = identities.filter(function (row) { return row.videoId === 10001; })[0];
var uploaded = identities.filter(function (row) { return row.videoId === 10438; })[0];

if (html.indexOf('content="v97"') === -1 || app.indexOf('build: "v97"') === -1) fail("cache stamp is not v97");
else ok("cache stamp is v97");
if (editor.indexOf("vc-cue-id") === -1) fail("the id line was removed");
else ok("the id line is still built");
if (editor.indexOf("keyLine.textContent = identity.r2Key") !== -1) fail("the editor still paints the storage path");
else ok("the editor does not paint the storage path");
if (editor.indexOf("r2Key: identity.r2Key") === -1) fail("save no longer sends the media key");
else ok("save still sends the media key");
if (!legacy || !uploaded || uploaded.r2Key.indexOf("Custom/") !== 0) fail("fixture identities are missing");
else ok("legacy and uploaded fixtures are present");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

async function openEditor(page, row) {
  await page.evaluate(function (item) {
    var btn = document.createElement("button");
    btn.className = "vc-card";
    btn.setAttribute("data-vc-key", item.r2Key);
    btn.setAttribute("data-vc-cabin-id", item.cabin);
    btn.setAttribute("data-vc-title", item.title);
    var host = document.getElementById("vcards-root") || document.body;
    host.appendChild(btn);
    btn.click();
    btn.remove();
  }, row);
  await page.locator("#vc-cue-edit").click();
  await page.waitForFunction(function (id) {
    var lock = document.getElementById("vc-cue-idlock");
    return lock && lock.innerText.indexOf("#" + id) !== -1;
  }, row.videoId);
}

async function visibleEditor(page, row) {
  return page.evaluate(function (item) {
    var lock = document.getElementById("vc-cue-idlock");
    var form = document.getElementById("vc-cue-form");
    var cue = document.getElementById("vc-cue");
    var keyNode = document.querySelector(".vc-cue-key");
    var keyStyle = keyNode ? getComputedStyle(keyNode) : null;
    return {
      id: lock ? lock.innerText : "",
      form: form ? form.innerText : "",
      cue: cue ? cue.innerText : "",
      keyInDom: !!keyNode,
      keyShown: !!(keyNode && keyStyle.display !== "none" && keyStyle.visibility !== "hidden" && keyNode.getClientRects().length),
      path: item.r2Key
    };
  }, row);
}

(async function () {
  if (failed) {
    console.error(failed + " v90 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"]
  });
  var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:8080/?v=v97", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function (keys) {
    return window.NexusCards && window.NexusCueEdit && window.NexusCards.identityByKey(keys[0]) && window.NexusCards.identityByKey(keys[1]) && document.getElementById("vc-cue-edit");
  }, [legacy.r2Key, uploaded.r2Key], { timeout: 12000 });
  await page.waitForFunction(function () {
    return performance.getEntriesByType("resource").some(function (row) {
      return row.name.indexOf("/custom-videos") !== -1;
    });
  }, null, { timeout: 12000 });
  var rows = [uploaded, legacy];
  var i;
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    await openEditor(page, row);
    var seen = await visibleEditor(page, row);
    var blob = seen.id + "\n" + seen.form + "\n" + seen.cue;
    if (seen.id.indexOf("#" + row.videoId) === -1) fail(row.videoId + " id is hidden " + seen.id);
    else if (blob.indexOf(row.r2Key) !== -1 || seen.keyShown) fail(row.videoId + " still shows its path");
    else ok(row.videoId + " shows the id and hides the path");
    await page.locator("#vc-cue-cancel").click();
  }
  await openEditor(page, legacy);
  await page.evaluate(function () {
    var toast = document.getElementById("deck-toast");
    if (toast) toast.style.display = "none";
  });
  await page.screenshot({ path: "/opt/cursor/artifacts/v90-cue-editor.png" });
  var marker = "v90 path check " + Date.now();
  var put = await page.evaluate(function (note) {
    var saved = null;
    var real = window.nexusFetch;
    window.nexusFetch = function (url, opts) {
      var path = String(url || "");
      if (path.indexOf("/video-cues") !== -1 && opts && opts.method === "PUT") {
        saved = opts.body;
        return Promise.resolve({
          videoId: saved.videoId,
          r2Key: saved.r2Key,
          cue: saved.cue
        });
      }
      if (path.indexOf("/video-cues") !== -1) {
        return Promise.resolve({ cues: saved ? [saved] : [] });
      }
      return real(url, opts);
    };
    document.querySelector("#vc-cue-form [name=lead1]").value = note;
    document.getElementById("vc-cue-form").requestSubmit();
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(saved);
      }, 300);
    });
  }, marker);
  if (!put || put.videoId !== legacy.videoId || put.r2Key !== legacy.r2Key || !put.cue || put.cue.leads[0] !== marker) {
    fail("save dropped the id or media key " + JSON.stringify(put));
  } else ok("save still stores the id and media key");
  await page.evaluate(function () { return window.NexusCueEdit.load(); });
  await page.locator("#vc-cue-edit").click();
  var reloaded = await page.evaluate(function () {
    return document.querySelector("#vc-cue-form [name=lead1]").value;
  });
  var after = await visibleEditor(page, legacy);
  if (reloaded !== marker) fail("reload did not bring the saved lead back (" + reloaded + ")");
  else if (after.id.indexOf("#" + legacy.videoId) === -1 || (after.id + after.form).indexOf(legacy.r2Key) !== -1) fail("reload showed the path or hid the id");
  else ok("reload keeps the cue and still hides the path");
  await browser.close();
  if (failed) {
    console.error(failed + " v90 check(s) failed");
    process.exit(1);
  }
  console.log("OK v90");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
