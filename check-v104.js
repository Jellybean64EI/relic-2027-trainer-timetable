/* Nexus v104: full-screen sign-in, and log out actually signs out. */
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
var auth = fs.readFileSync("auth.js", "utf8");
var sw = fs.readFileSync("sw.js", "utf8");
var css = fs.readFileSync("styles.css", "utf8");
var account = fs.readFileSync("account.js", "utf8");
var app = fs.readFileSync("app.js", "utf8");

if (html.indexOf('content="v104"') === -1) fail("cache stamp is not v104");
else ok("cache stamp is v104");
if (html.indexOf('id="account-logout"') === -1) fail("log out was removed");
else ok("log out is still on Account Profile");
if (html.indexOf("nexus-login") !== -1 || auth.indexOf("nexus-login") !== -1) fail("the popup passcode sheet is still there");
else ok("the popup passcode sheet is gone");
if (html.indexOf('id="nexus-passcode"') === -1 || html.indexOf('id="toggle-eye"') === -1 || html.indexOf(">Sign in<") === -1 || html.indexOf("Keep me signed in 30 days.") === -1 || html.indexOf("Nexus · secure") === -1) {
  fail("the sign-in page is missing a piece");
} else ok("the sign-in page has the passcode, eye, button, 30-day note, and footer");
if (auth.indexOf("function clearVideoMemory") === -1 || auth.indexOf("function signOut") === -1 || auth.indexOf("nexus-logout") === -1) {
  fail("log out does not clear the session and the video memory");
} else ok("log out clears the token and the video cache");
if (auth.indexOf("That passcode was not accepted.") === -1 || auth.indexOf("Too many tries. Wait 15 minutes. You can try 5 times every 15 minutes.") === -1 || auth.indexOf("Sign-in is not ready yet.") === -1) {
  fail("the sign-in messages are missing");
} else ok("401, 429, and not-ready copy is handled");
if (sw.indexOf('CACHE = "nexus-v104"') === -1 || sw.indexOf('pathname.indexOf("/v/")') === -1) fail("the shell cache is wrong");
else ok("the shell cache is v104 and still skips signed video");
if (css.indexOf("#account-logout") === -1 || css.indexOf("html.is-signed-out #nexus-signin") === -1) fail("sign-in styles are missing");
else ok("sign-in covers the shell");
if (account.indexOf("nexus-logout") === -1 || app.indexOf("nexus-signed-in") === -1) fail("account or the hub does not hear sign-in");
else ok("account resets and a new sign-in opens the hub");

function playwright() {
  try { return require("playwright"); } catch (err) { /* next */ }
  return require("/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright");
}

(async function () {
  if (failed) {
    console.error(failed + " v104 check(s) failed");
    process.exit(1);
  }
  var pw = playwright();
  var browser = await pw.chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"]
  });
  var page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  var first = await page.evaluate(function () {
    var sign = document.getElementById("nexus-signin");
    var wrap = document.querySelector(".wrap");
    var signStyle = getComputedStyle(sign);
    var wrapStyle = getComputedStyle(wrap);
    return {
      signedOut: document.documentElement.classList.contains("is-signed-out"),
      signOn: signStyle.display !== "none",
      wrapOff: wrapStyle.display === "none",
      popup: !!document.getElementById("nexus-login"),
      title: document.querySelector("#nexus-signin h1").textContent,
      note: document.querySelector("#nexus-signin .keep").textContent,
      foot: document.querySelector("#nexus-signin .foot").textContent,
      footCase: getComputedStyle(document.querySelector("#nexus-signin .foot")).textTransform,
      button: document.querySelector("#nexus-signin .submit").textContent.trim(),
      buttonCase: getComputedStyle(document.querySelector("#nexus-signin .submit")).textTransform
    };
  });
  if (!first.signedOut || !first.signOn || !first.wrapOff || first.popup || first.title !== "Sign in") {
    fail("the first paint was not the sign-in page " + JSON.stringify(first));
  } else ok("a signed-out load shows only the sign-in page");
  if (first.note !== "Keep me signed in 30 days." || first.foot !== "Nexus · secure" || first.footCase !== "uppercase" || first.button !== "Sign in" || first.buttonCase !== "uppercase") {
    fail("the sign-in copy does not match " + JSON.stringify(first));
  } else ok("the 30-day note, footer, and Sign in button match");
  await page.click("#toggle-eye");
  var shown = await page.evaluate(function () { return document.getElementById("nexus-passcode").type; });
  await page.click("#toggle-eye");
  var hidden = await page.evaluate(function () { return document.getElementById("nexus-passcode").type; });
  if (shown !== "text" || hidden !== "password") fail("the eye did not toggle the passcode (" + shown + " / " + hidden + ")");
  else ok("the eye shows and hides the passcode");

  await page.fill("#nexus-passcode", "not-a-real-passcode");
  await page.click("#nexus-signin .submit");
  await page.waitForFunction(function () {
    var note = document.getElementById("signin-error");
    return note && !note.hidden && note.textContent;
  });
  var wrong = await page.evaluate(function () {
    return {
      text: document.getElementById("signin-error").textContent,
      value: document.getElementById("nexus-passcode").value,
      token: localStorage.getItem("nexus-session"),
      still: document.documentElement.classList.contains("is-signed-out")
    };
  });
  if (wrong.text !== "That passcode was not accepted." || !wrong.value || wrong.token || !wrong.still) {
    fail("a wrong passcode did not stay on the sign-in page " + JSON.stringify(wrong));
  } else ok("a wrong passcode is refused and the field stays");

  var limited = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await limited.route("https://nexus-api.joesearle.workers.dev/auth/login", function (route) {
    return route.fulfill({ status: 429, contentType: "application/json", body: "{\"error\":\"too many logins\"}" });
  });
  await limited.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  await limited.fill("#nexus-passcode", "not-a-real-passcode");
  await limited.click("#nexus-signin .submit");
  await limited.waitForFunction(function () {
    var note = document.getElementById("signin-error");
    return note && note.textContent.indexOf("15 minutes") !== -1;
  });
  ok("a 429 tells Joe to wait 15 minutes");
  await limited.close();

  var signed = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signed.route("https://nexus-api.joesearle.workers.dev/**", function (route) {
    var path = new URL(route.request().url()).pathname;
    if (path === "/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, token: "signed-in-test", exp: 2000000000 })
      });
    }
    var body = "[]";
    if (path.indexOf("/account") === 0) body = "{\"ok\":true}";
    if (path.indexOf("/weights") === 0) body = "{\"ok\":true,\"weights\":[]}";
    return route.fulfill({ status: 200, contentType: "application/json", body: body });
  });
  await signed.goto("http://127.0.0.1:8080/?v=v104", { waitUntil: "domcontentloaded" });
  await signed.fill("#nexus-passcode", "not-a-real-passcode");
  await signed.click("#nexus-signin .submit");
  await signed.waitForFunction(function () {
    return !document.documentElement.classList.contains("is-signed-out") &&
      document.getElementById("page-title").textContent === "Training Schedules";
  });
  var landed = await signed.evaluate(function () {
    var tab = document.querySelector('.hub-tab[data-hub-tab="schedules"]');
    return {
      title: document.getElementById("page-title").textContent,
      tab: tab ? tab.getAttribute("aria-selected") : "",
      hub: document.body.classList.contains("is-hub"),
      token: !!localStorage.getItem("nexus-session"),
      menu: getComputedStyle(document.querySelector(".nav-toggle")).display
    };
  });
  if (landed.title !== "Training Schedules" || landed.tab !== "true" || !landed.hub || !landed.token || landed.menu === "none") {
    fail("sign-in did not open the Training Schedules hub " + JSON.stringify(landed));
  } else ok("sign-in lands on the Training Schedules hub");
  await signed.close();

  var accountPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await accountPage.addInitScript(function () {
    try {
      if (sessionStorage.getItem("v104-primed")) return;
      localStorage.setItem("nexus-session", "signed-in-test");
      sessionStorage.setItem("v104-primed", "1");
    } catch (err) { /* private mode */ }
  });
  await accountPage.route("https://nexus-api.joesearle.workers.dev/**", function (route) {
    var path = new URL(route.request().url()).pathname;
    var body = path.indexOf("/weights") === 0 ? "{\"ok\":true,\"weights\":[]}" : (path.indexOf("/account") === 0 ? "{\"ok\":true}" : "[]");
    return route.fulfill({ status: 200, contentType: "application/json", body: body });
  });
  await accountPage.goto("http://127.0.0.1:8080/?door=account&v=v104", { waitUntil: "domcontentloaded" });
  await accountPage.waitForFunction(function () {
    var button = document.getElementById("account-logout");
    return button && getComputedStyle(button).display !== "none";
  });
  await accountPage.evaluate(function () {
    var video = document.querySelector("video");
    if (video) video.src = "https://nexus-api.joesearle.workers.dev/v/Cabin/a.mp4?exp=1&sig=test";
    window.NexusVideo.queue("Cabin/a.mp4");
  });
  await accountPage.click("#account-logout");
  await accountPage.waitForFunction(function () {
    return document.documentElement.classList.contains("is-signed-out");
  });
  var out = await accountPage.evaluate(function () {
    var sign = document.getElementById("nexus-signin");
    var wrap = document.querySelector(".wrap");
    var video = document.querySelector("video");
    return {
      token: localStorage.getItem("nexus-session"),
      signOn: getComputedStyle(sign).display !== "none",
      wrapOff: getComputedStyle(wrap).display === "none",
      src: video ? (video.getAttribute("src") || "") : "",
      cached: window.NexusVideo.cached("Cabin/a.mp4")
    };
  });
  if (out.token || !out.signOn || !out.wrapOff || out.src || out.cached) {
    fail("log out left the session in place " + JSON.stringify(out));
  } else ok("log out shows sign-in and drops the session");
  await accountPage.reload({ waitUntil: "domcontentloaded" });
  var again = await accountPage.evaluate(function () {
    return {
      token: localStorage.getItem("nexus-session"),
      signedOut: document.documentElement.classList.contains("is-signed-out")
    };
  });
  if (again.token || !again.signedOut) fail("a reload restored the session " + JSON.stringify(again));
  else ok("a reload while signed out stays on sign-in");
  await browser.close();

  if (failed) {
    console.error(failed + " v104 check(s) failed");
    process.exit(1);
  }
  console.log("OK v104");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
