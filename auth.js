/* Owner session and the full-screen sign-in page. The passcode never stays in this file. */
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

  function clearVideoMemory() {
    var key;
    for (key in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) delete cache[key];
    }
    queue.splice(0, queue.length);
    for (key in waiting) {
      if (Object.prototype.hasOwnProperty.call(waiting, key)) delete waiting[key];
    }
    signing = null;
  }

  function signinRoot() {
    return document.getElementById("nexus-signin");
  }

  function showSignIn() {
    document.documentElement.classList.add("is-signed-out");
    var root = signinRoot();
    if (root) root.hidden = false;
  }

  function hideSignIn() {
    document.documentElement.classList.remove("is-signed-out");
    var root = signinRoot();
    if (!root) return;
    root.hidden = true;
    root.classList.remove("is-error", "is-rate");
    var note = document.getElementById("signin-error");
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
    var input = document.getElementById("nexus-passcode");
    if (input) input.value = "";
  }

  function signOut() {
    setToken("");
    clearVideoMemory();
    var input = document.getElementById("nexus-passcode");
    if (input) input.value = "";
    showSignIn();
    window.dispatchEvent(new Event("nexus-logout"));
  }

  window.NexusAuth = {
    token: token,
    logout: signOut,
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

  function messageFor(err) {
    var status = err && err.status;
    var text = err && err.message ? err.message : "";
    if (status === 429) return "Too many tries. Wait 15 minutes. You can try 5 times every 15 minutes.";
    if (status === 503 || status === 404 || /X-Nexus-Key|unknown route/i.test(text)) return "Sign-in is not ready yet.";
    return "That passcode was not accepted.";
  }

  function bindSignIn() {
    var root = signinRoot();
    var form = document.getElementById("nexus-signin-form");
    if (!root || !form || form.dataset.bound) return;
    form.dataset.bound = "1";
    var eye = document.getElementById("toggle-eye");
    if (eye) {
      eye.addEventListener("click", function () {
        var input = document.getElementById("nexus-passcode");
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.setAttribute("aria-pressed", show ? "true" : "false");
        eye.setAttribute("aria-label", show ? "Hide passcode" : "Show passcode");
      });
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var input = document.getElementById("nexus-passcode");
      var note = document.getElementById("signin-error");
      window.NexusAuth.login(input ? input.value : "").then(function () {
        hideSignIn();
        if (window.NexusOutbox && window.NexusOutbox.replay) window.NexusOutbox.replay();
        if (window.NexusVideo && window.NexusVideo.flush) window.NexusVideo.flush();
        window.dispatchEvent(new Event("nexus-signed-in"));
      }).catch(function (err) {
        if (!note) return;
        note.hidden = false;
        note.textContent = messageFor(err);
        root.classList.toggle("is-rate", !!(err && err.status === 429));
        root.classList.toggle("is-error", !(err && err.status === 429));
      });
    });
  }

  window.addEventListener("nexus-unauthorized", function () {
    if (!token()) {
      showSignIn();
      return;
    }
    signOut();
  });

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest && event.target.closest("#account-logout");
    if (!button) return;
    event.preventDefault();
    signOut();
  });

  if (token()) hideSignIn();
  else showSignIn();
  bindSignIn();

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
