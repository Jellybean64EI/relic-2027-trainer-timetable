/* Owner session and signed video URLs. The passcode never stays in this file. */
(function () {
  var TOKEN_KEY = "nexus-session";
  var queue = [];
  var signing = null;
  var cache = {};
  var waiting = {};

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (err) { return ""; }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* private mode */ }
  }

  window.NexusAuth = {
    token: token,
    logout: function () { setToken(""); },
    login: function (passcode) {
      var api = window.NEXUS_API || {};
      return fetch(String(api.base || "").replace(/\/$/, "") + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode })
      }).then(function (response) {
        return response.text().then(function (text) {
          var payload = text ? JSON.parse(text) : {};
          if (!response.ok) {
            var error = new Error(payload.error || "Could not sign in");
            error.status = response.status;
            throw error;
          }
          setToken(payload.token || "");
          return payload;
        });
      });
    }
  };

  function prompt() {
    var existing = document.getElementById("nexus-login");
    if (existing) {
      existing.hidden = false;
      return;
    }
    var wrap = document.createElement("div");
    wrap.id = "nexus-login";
    wrap.className = "pre-send";
    wrap.innerHTML = '<form class="plan-sheet-card" id="nexus-login-form">' +
      '<h2 class="plan-sheet-title">Nexus</h2>' +
      '<p class="pre-status">Enter the owner passcode to save.</p>' +
      '<input class="pre-day" id="nexus-passcode" type="password" autocomplete="current-password" aria-label="Passcode">' +
      '<p class="pre-status" id="nexus-login-error" hidden></p>' +
      '<button type="submit" class="sched-save">Continue</button>' +
      '</form>';
    document.body.appendChild(wrap);
    wrap.querySelector("form").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = document.getElementById("nexus-passcode");
      var note = document.getElementById("nexus-login-error");
      window.NexusAuth.login(input.value).then(function () {
        wrap.hidden = true;
        input.value = "";
        if (window.NexusOutbox && window.NexusOutbox.replay) window.NexusOutbox.replay();
        if (window.NexusVideo && window.NexusVideo.flush) window.NexusVideo.flush();
      }).catch(function (err) {
        note.hidden = false;
        var text = err && err.message ? err.message : "";
        var notReady = err && (err.status === 503 || err.status === 404 || /X-Nexus-Key|unknown route/i.test(text));
        note.textContent = notReady ? "Sign-in is not ready yet." : "That passcode was not accepted.";
      });
    });
  }

  window.addEventListener("nexus-unauthorized", function () {
    if (document.getElementById("nexus-login")) document.getElementById("nexus-login").hidden = false;
    else prompt();
  });

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest && event.target.closest("#account-logout");
    if (!button) return;
    window.NexusAuth.logout();
  });

  function cached(key) {
    var row = cache[key];
    if (!row || row.exp < Math.floor(Date.now() / 1000) + 120) return "";
    return row.url;
  }

  function flush() {
    if (signing || !queue.length || !token()) return;
    var keys = queue.splice(0, 80);
    var api = window.NEXUS_API || {};
    signing = fetch(String(api.base || "").replace(/\/$/, "") + "/video-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
      body: JSON.stringify({ keys: keys })
    }).then(function (response) {
      if (response.status === 401) {
        keys.forEach(function (key) {
          if (queue.indexOf(key) === -1) queue.unshift(key);
        });
        window.dispatchEvent(new Event("nexus-unauthorized"));
        return null;
      }
      if (!response.ok) return null;
      return response.json();
    }).then(function (payload) {
      ((payload && payload.videos) || []).forEach(function (row) {
        if (!row || !row.key || !row.url) return;
        cache[row.key] = { url: row.url, exp: row.exp };
        var video = waiting[row.key];
        var current = video ? (video.currentSrc || video.src || "") : "";
        if (video && video.isConnected && current.indexOf("/v/") !== -1 && (video.error || video.readyState === 0)) {
          delete video.dataset.nexusResigned;
          video.src = row.url;
          delete waiting[row.key];
        }
      });
    }).catch(function () { /* keep the public fallback until the signer is deployed */ })
      .then(function () { signing = null; if (queue.length && token()) flush(); });
  }

  window.NexusVideo = {
    cached: cached,
    queue: function (key) {
      if (!key || cache[key] || queue.indexOf(key) !== -1) return;
      queue.push(key);
      clearTimeout(flush.timer);
      flush.timer = setTimeout(flush, 40);
    },
    flush: flush,
    resign: function (key, video) {
      delete cache[key];
      if (video) waiting[key] = video;
      this.queue(key);
      if (token()) flush();
    }
  };

  document.addEventListener("error", function (event) {
    var video = event.target;
    if (!video || video.tagName !== "VIDEO") return;
    var src = video.currentSrc || video.src || "";
    if (src.indexOf("/v/") === -1) return;
    if (video.dataset.nexusResigned) return;
    video.dataset.nexusResigned = "1";
    var match = src.match(/\/v\/([^?#]+)/);
    if (!match || !window.NexusVideo) return;
    var key = decodeURIComponent(match[1]);
    window.NexusVideo.resign(key, video);
  }, true);
})();
