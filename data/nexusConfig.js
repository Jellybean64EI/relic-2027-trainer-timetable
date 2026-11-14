window.FEATURES = {
  videoEditor: false
};

(function () {
  var on = true;
  try {
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    if ((map.year + "-" + map.month + "-" + map.day) > "2026-12-31") on = false;
  } catch (err) { /* keep the flag on if the clock cannot be read */ }
  window.PRE2026_ENABLED = on;
  window.PRE2026_UNTIL = "2026-12-31";
})();

window.NEXUS_API = {
  base: "https://nexus-api.joesearle.workers.dev",
  cardsBase: "https://pub-322d36bbbce14f5e82238dc08a645e26.r2.dev",
  videoBase: "https://pub-2f8d4d97f08a4cd28058c7bb77629685.r2.dev"
};

window.nexusFetch = function (path, opts) {
  var api = window.NEXUS_API || {};
  var options = opts || {};
  var method = String(options.method || "GET").toUpperCase();
  var headers = {};
  var body = options.body;
  if (options.raw != null) {
    body = options.raw;
    headers["Content-Type"] = options.contentType || (body && body.type) || "application/octet-stream";
  } else if (body && typeof body === "object" && (typeof FormData === "undefined" || !(body instanceof FormData)) && (typeof Blob === "undefined" || !(body instanceof Blob))) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  var session = "";
  try { session = localStorage.getItem("nexus-session") || ""; } catch (err) { session = ""; }
  if (session) headers.Authorization = "Bearer " + session;
  var url = String(api.base || "").replace(/\/$/, "") + path;
  return fetch(url, {
    method: method,
    headers: headers,
    body: method === "GET" || method === "HEAD" ? undefined : body
  }).then(function (response) {
    if (response.status === 204) return null;
    return response.text().then(function (text) {
      var payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch (err) { payload = { error: text }; }
      }
      if (!response.ok) {
        var error = new Error((payload && payload.error) || ("HTTP " + response.status));
        error.status = response.status;
        if (response.status === 401 && typeof window !== "undefined") {
          window.dispatchEvent(new Event("nexus-unauthorized"));
        }
        throw error;
      }
      return payload;
    });
  });
};
