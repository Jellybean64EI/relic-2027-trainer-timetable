/* Nexus v103: owner session, protected reads, signed video URLs, CORS. */
var fs = require("fs");
var failed = 0;

function fail(message) {
  failed += 1;
  console.error("FAIL " + message);
}

function ok(message) {
  console.log("OK " + message);
}

var config = fs.readFileSync("data/nexusConfig.js", "utf8");
var html = fs.readFileSync("index.html", "utf8");
var sw = fs.readFileSync("sw.js", "utf8");
var vercel = fs.readFileSync("vercel.json", "utf8");
if (/key:\s*"/.test(config)) fail("the public write key is still in the frontend");
else ok("the public write key is gone from the frontend");
if (html.indexOf('content="v103"') === -1) fail("cache stamp is not v103");
else ok("cache stamp is v103");
if (sw.indexOf('CACHE = "nexus-v103"') === -1 || sw.indexOf('pathname.indexOf("/v/")') === -1) fail("the shell still caches signed video");
else ok("the shell does not cache signed video");
if (vercel.indexOf("frame-ancestors 'none'") === -1 || vercel.indexOf("X-Content-Type-Options") === -1) fail("security headers are missing");
else ok("security headers are in vercel.json");
if (html.indexOf("account-logout") === -1) fail("log out is missing");
else ok("account can log out");

function memoryDb() {
  var hits = new Map();
  return {
    prepare: function (sql) {
      var stmt = {
        args: [],
        bind: function () { stmt.args = Array.prototype.slice.call(arguments); return stmt; },
        run: async function () {
          if (sql.indexOf("INSERT INTO rate_hits") === 0) hits.set(stmt.args[0] + "|" + stmt.args[1] + "|" + stmt.args[2], 1);
          if (sql.indexOf("UPDATE rate_hits") === 0) {
            var key = stmt.args[0] + "|" + stmt.args[1] + "|" + stmt.args[2];
            hits.set(key, (hits.get(key) || 0) + 1);
          }
          return {};
        },
        first: async function () {
          if (sql.indexOf("rate_hits") !== -1) {
            var found = hits.get(stmt.args[0] + "|" + stmt.args[1] + "|" + stmt.args[2]);
            return found == null ? null : { count: found };
          }
          return null;
        },
        all: async function () { return { results: [] }; }
      };
      return stmt;
    }
  };
}

function videos() {
  var bytes = new Uint8Array(100);
  var i;
  for (i = 0; i < bytes.length; i++) bytes[i] = i;
  return {
    head: async function (key) {
      return key === "Cabin/a.mp4" ? { size: 100, httpMetadata: { contentType: "video/mp4" } } : null;
    },
    get: async function (key, opts) {
      if (key !== "Cabin/a.mp4") return null;
      var start = opts && opts.range ? opts.range.offset : 0;
      var length = opts && opts.range ? opts.range.length : 100;
      return { body: bytes.slice(start, start + length), httpMetadata: { contentType: "video/mp4" } };
    }
  };
}

(async function () {
  var worker = await import("./worker/nexus-api.js");
  var env = {
    DB: memoryDb(),
    VIDEOS: videos(),
    OWNER_PASSCODE: "owner-passcode-test",
    SESSION_SECRET: "session-secret-test",
    VIDEO_SIGNING_KEY: "video-signing-test",
    NEXUS_KEY: "legacy-test-key",
    LEGACY_KEY_ACCEPTED: "true"
  };
  function call(path, method, payload, headers) {
    var init = { method: method, headers: Object.assign({ Origin: "https://relic-2027-trainer-timetable.vercel.app" }, headers || {}) };
    if (payload) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(payload);
    }
    return worker.default.fetch(new Request("https://nexus.test" + path, init), env);
  }
  var denied = await call("/ticks/2026-01-01", "PUT", { level: 0 });
  var account = await call("/account", "GET");
  var health = await call("/health", "GET");
  if (denied.status !== 401 || account.status !== 401) fail("private routes were open " + denied.status + " " + account.status);
  else ok("writes and account reads need a session");
  if (health.status === 401) fail("health was gated");
  else ok("health stays public");
  var evil = await worker.default.fetch(new Request("https://nexus.test/health", {
    headers: { Origin: "https://evil.example" }
  }), env);
  if (evil.headers.get("access-control-allow-origin")) fail("an unknown origin was allowed");
  else ok("an unknown origin gets no CORS header");
  var bad = await call("/auth/login", "POST", { passcode: "nope" });
  var good = await call("/auth/login", "POST", { passcode: env.OWNER_PASSCODE });
  var session = good.status === 200 ? (await good.json()).token : "";
  if (bad.status !== 401 || !session) fail("login did not check the passcode");
  else ok("login returns a session token");
  var authed = await call("/account", "GET", null, { Authorization: "Bearer " + session });
  if (authed.status === 401) fail("a valid session was rejected");
  else ok("a valid session can read account");
  var legacy = await call("/account", "GET", null, { "X-Nexus-Key": env.NEXUS_KEY });
  if (legacy.status === 401) fail("the legacy key was rejected while it is still accepted");
  else ok("the legacy key still works until it is turned off");
  var signed = await call("/video-sign", "POST", { keys: ["Cabin/a.mp4"] }, { Authorization: "Bearer " + session });
  var video = signed.status === 200 ? (await signed.json()).videos[0] : null;
  var play = video ? await worker.default.fetch(new Request("https://nexus.test" + video.url.replace(/^https?:\/\/[^/]+/, ""), {
    headers: { Referer: "https://relic-2027-trainer-timetable.vercel.app/", Range: "bytes=0-9" }
  }), env) : { status: 0 };
  if (!video || play.status !== 206) fail("a signed video did not honour Range " + (play.status));
  else ok("a signed video answers 206");
  var expired = await worker.default.fetch(new Request("https://nexus.test/v/Cabin/a.mp4?exp=1&sig=bad", {
    headers: { Referer: "https://relic-2027-trainer-timetable.vercel.app/" }
  }), env);
  if (expired.status !== 403) fail("an expired video link was accepted");
  else ok("an expired video link is rejected");
  var svg = await worker.default.fetch(new Request("https://nexus.test/upload", {
    method: "POST",
    headers: {
      Origin: "https://relic-2027-trainer-timetable.vercel.app",
      Authorization: "Bearer " + session,
      "Content-Type": "image/svg+xml"
    },
    body: "<svg xmlns='http://www.w3.org/2000/svg'/>"
  }), env);
  if (svg.status !== 415) fail("svg upload was accepted " + svg.status);
  else ok("svg upload is rejected");
  if (failed) {
    console.error(failed + " v103 check(s) failed");
    process.exit(1);
  }
  console.log("OK v103");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
