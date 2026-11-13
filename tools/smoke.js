/* Post-deploy smoke. Push to master runs this. Rollback is a separate manual job. */
var fs = require("fs");

function versionStamp(html) {
  var match = String(html || "").match(/content="(v\d+)"/);
  return match ? match[1] : "";
}

function countsOk(body) {
  var counts = body && body.counts;
  if (!counts || counts.ticks == null || counts.ticks_2026 == null) return false;
  return Number(counts.ticks) >= 74 && Number(counts.ticks_2026) >= 73;
}

function siteHasVersion(html, version) {
  return String(html || "").indexOf('content="' + version + '"') !== -1;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function github(method, path, payload) {
  var token = process.env.GITHUB_TOKEN || "";
  var repo = process.env.GITHUB_REPOSITORY || "Jellybean64EI/relic-2027-trainer-timetable";
  if (!token) return { skipped: true };
  var res = await fetch("https://api.github.com" + path.replace("REPO", repo), {
    method: method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "nexus-smoke",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  var text = await res.text();
  var body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = { raw: text }; }
  return { status: res.status, body: body };
}

async function openAlert(message) {
  var listed = await github("GET", "/repos/REPO/issues?state=open&labels=nexus-alert");
  var open = listed.skipped || !Array.isArray(listed.body) ? [] : listed.body.filter(function (issue) {
    return issue && !issue.pull_request;
  });
  if (open.length) {
    await github("POST", "/repos/REPO/issues/" + open[0].number + "/comments", { body: message });
    return;
  }
  await github("POST", "/repos/REPO/labels", { name: "nexus-alert", color: "B45309", description: "Nexus health and smoke alerts" });
  await github("POST", "/repos/REPO/issues", {
    title: "Nexus smoke check failed",
    body: message,
    labels: ["nexus-alert"]
  });
}

async function textOf(url) {
  var res = await fetch(url, { headers: { "User-Agent": "nexus-smoke" } });
  return { status: res.status, text: await res.text() };
}

async function waitForProduction(site, version) {
  var deadline = Date.now() + 10 * 60 * 1000;
  var last = "";
  while (Date.now() < deadline) {
    try {
      var page = await textOf(site);
      last = page.status + " " + (siteHasVersion(page.text, version) ? version : "waiting");
      if (page.status === 200 && siteHasVersion(page.text, version)) return page.text;
    } catch (err) {
      last = String(err && err.message || err);
    }
    console.log("waiting for " + version + " (" + last + ")");
    await sleep(20000);
  }
  throw new Error("production did not show " + version + " within 10 minutes (" + last + ")");
}

async function browse(site) {
  var pw = require("playwright");
  var browser = await pw.chromium.launch({ headless: true });
  var page = await browser.newPage();
  var errors = [];
  page.on("pageerror", function (err) { errors.push(String(err)); });
  page.on("console", function (msg) {
    if (msg.type() === "error" && msg.text().indexOf("Failed to load resource") === -1) errors.push(msg.text());
  });
  await page.goto(site, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () { return document.getElementById("page-title"); });
  var home = await page.locator("#page-title").innerText();
  await page.goto(site.replace(/\/$/, "") + "/?door=food", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () {
    var title = document.getElementById("page-title");
    return title && title.textContent === "Build a Meal Schedule";
  });
  await browser.close();
  return { home: home, errors: errors };
}

async function main() {
  var site = process.env.SITE || "https://relic-2027-trainer-timetable.vercel.app";
  var worker = (process.env.WORKER || "https://nexus-api.joesearle.workers.dev").replace(/\/$/, "");
  var version = versionStamp(fs.readFileSync("index.html", "utf8"));
  if (!version) throw new Error("index.html has no version");
  await waitForProduction(site, version);
  var home = await textOf(site);
  if (home.status !== 200 || !siteHasVersion(home.text, version)) throw new Error("home did not load " + version);
  var food = await textOf(site + "/?door=food");
  if (food.status !== 200 || !siteHasVersion(food.text, version)) throw new Error("?door=food did not load");
  var sw = await textOf(site + "/sw.js");
  if (sw.status !== 200 || sw.text.indexOf("nexus-" + version) === -1) throw new Error("sw.js did not load");
  var healthRes = await fetch(worker + "/health", { headers: { "User-Agent": "nexus-smoke" } });
  var health = await healthRes.json();
  if (!countsOk(health)) throw new Error("health counts " + JSON.stringify(health && health.counts));
  var viewed = await browse(site);
  if (viewed.home !== "Training Schedules") throw new Error("home title " + viewed.home);
  if (viewed.errors.length) throw new Error("console errors " + viewed.errors.join(" | "));
  console.log("OK smoke " + version);
}

module.exports = { versionStamp: versionStamp, countsOk: countsOk, siteHasVersion: siteHasVersion, openAlert: openAlert };

if (require.main === module) {
  main().catch(function (err) {
    var message = String(err && err.stack || err);
    console.error(message);
    openAlert(message).catch(function () {}).then(function () { process.exit(1); });
  });
}
