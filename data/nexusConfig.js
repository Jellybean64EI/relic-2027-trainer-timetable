window.FEATURES = {
  videoEditor: false
};

window.NEXUS_API = {
  base: "https://nexus-api.joesearle.workers.dev",
  key: "w44eimFdMAPiLHbodT5Y6aaVTWzDgyyN",
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
  if (method !== "GET" && method !== "HEAD") headers["X-Nexus-Key"] = api.key || "";
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
        throw error;
      }
      return payload;
    });
  });
};
