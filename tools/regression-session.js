/* Gives the regression browsers a local session and stops protected 401s
   from covering the shell. It does not change the app. Public catalogue
   reads still go to the live Worker. Video ids come from the local fixture
   so the player checks can resolve a clip without a live owner session. */
var fs = require("fs");
var path = require("path");
var PUBLIC_GET = /^\/(health|training-combos|training-groups|training-plan|training-plan-week|video-placements|video-cues|cards|stacks)(\/|$)/;
var identities = [];
try {
  identities = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "videoIdentity.json"), "utf8")).identities || [];
} catch (err) { identities = []; }

async function arm(target) {
  var context = typeof target.context === "function" ? target.context() : target;
  await context.addInitScript(function () {
    try { localStorage.setItem("nexus-session", "regression-session"); } catch (err) {}
  });
  await context.route("https://nexus-api.joesearle.workers.dev/**", function (route) {
    var req = route.request();
    var urlPath = new URL(req.url()).pathname;
    if ((req.method() === "GET" || req.method() === "HEAD") && PUBLIC_GET.test(urlPath)) return route.fallback();
    if ((req.method() === "GET" || req.method() === "HEAD") && urlPath.indexOf("/video-ids") === 0) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, identities: identities })
      });
    }
    var body = "[]";
    if (urlPath.indexOf("/account") === 0) body = "{\"ok\":true}";
    if (urlPath.indexOf("/video-sign") === 0) body = "{\"ok\":true,\"videos\":[]}";
    if (urlPath.indexOf("/weights") === 0) body = "{\"ok\":true,\"weights\":[]}";
    if (urlPath.indexOf("/errors") === 0) body = "{\"ok\":true,\"stored\":0}";
    if (urlPath.indexOf("/custom-videos") === 0 && (req.method() === "GET" || req.method() === "HEAD")) {
      var videos = identities.filter(function (row) {
        return row && row.r2Key && row.r2Key.indexOf("Custom/") === 0;
      }).map(function (row) {
        return {
          r2Key: row.r2Key,
          title: row.title || "",
          url: "",
          area: row.cabin || "",
          type: row.module || "exercise"
        };
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, videos: videos })
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: body });
  });
}

module.exports = { arm: arm };
