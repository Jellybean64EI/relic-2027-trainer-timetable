/* Nexus v104 app shell.
   Cache name: nexus-v104. A new version stays waiting until the page asks it
   to take over. Videos are not cached: range responses are partial 206 bodies,
   and storing one range would later be served as a whole clip.
   There are no font files in this app; type is set with system fonts. */
var CACHE = "nexus-v104";
var IMAGE_CACHE = "nexus-v104-images";
var IMAGE_CAP = 40;
var API_ORIGIN = "https://nexus-api.joesearle.workers.dev";
var CARD_HOST = "pub-322d36bbbce14f5e82238dc08a645e26.r2.dev";
var PRECACHE = [
  "/",
  "/index.html",
  "/styles.css?v=v104",
  "/manifest.webmanifest?v=v104",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/assets/nexus-icon-192.png",
  "/assets/nexus-icon.png",
  "/offline.js?v=v104",
  "/data/schedule.js?v=v104",
  "/data/precondition.js?v=v104",
  "/data/upperBody.js?v=v104",
  "/data/citations.js?v=v104",
  "/data/forensic.js?v=v104",
  "/data/cues/cues.js?v=v104",
  "/data/forensicClips.js?v=v104",
  "/data/videoArchive.js?v=v104",
  "/data/nutrition/shop.js?v=v104",
  "/data/nutrition/schedule.js?v=v104",
  "/food.js?v=v104",
  "/data/nexusConfig.js?v=v104",
  "/auth.js?v=v104",
  "/deck.js?v=v104",
  "/data/videoCatalog.js?v=v104",
  "/tools/v64_placement.js?v=v104",
  "/trim.js?v=v104",
  "/builder.js?v=v104",
  "/pre2026.css?v=v104",
  "/pre2026.js?v=v104",
  "/cards.js?v=v104",
  "/data/cueModel.js?v=v104",
  "/data/cueEditor.js?v=v104",
  "/data/playerChrome.js?v=v104",
  "/account.js?v=v104",
  "/app.js?v=v104"
];
var API_PREFIX = /^\/(ticks|ticks_2026|cards|stacks|slots|video-placements|video-cues|weights|account|training-combos|training-groups|training-plan|training-plan-week|custom-videos|video-ids)(\/|$)/;

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(PRECACHE);
  }).then(function () {
    if (!self.registration.active) return self.skipWaiting();
  }));
});

function purgeOld() {
  return caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE && key !== IMAGE_CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  });
}

self.addEventListener("activate", function (event) {
  event.waitUntil(purgeOld().then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener("message", function (event) {
  if (!event.data) return;
  if (event.data.type === "skip-waiting") {
    self.skipWaiting();
    return;
  }
  if (event.data.type !== "purge-old") return;
  event.waitUntil(purgeOld().then(function () {
    if (event.source) event.source.postMessage({ type: "purged" });
  }));
});

function fromCache(cacheName, request) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request);
  });
}

function store(cacheName, request, response) {
  if (!response || !response.ok) return Promise.resolve();
  return caches.open(cacheName).then(function (cache) {
    return cache.put(request, response.clone());
  });
}

function trimImages(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length < IMAGE_CAP) return;
    return Promise.all(keys.slice(0, keys.length - IMAGE_CAP + 1).map(function (key) {
      return cache.delete(key);
    }));
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put("/index.html", copy);
      });
      return response;
    }).catch(function () {
      return fromCache(CACHE, "/index.html").then(function (cached) {
        return cached || fromCache(CACHE, "/");
      });
    }));
    return;
  }
  if (url.origin === API_ORIGIN && (url.pathname.indexOf("/v/") === 0 || url.pathname.indexOf("/auth") === 0)) return;
  if (url.origin === API_ORIGIN && API_PREFIX.test(url.pathname)) {
    event.respondWith(fetch(request).then(function (response) {
      var copy = response.clone();
      if (response.ok) store(CACHE, request, copy);
      return response;
    }).catch(function () {
      return fromCache(CACHE, request).then(function (cached) {
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      });
    }));
    return;
  }
  if (url.host === CARD_HOST) {
    event.respondWith(fromCache(IMAGE_CACHE, request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) {
          caches.open(IMAGE_CACHE).then(function (cache) {
            return trimImages(cache).then(function () {
              return cache.put(request, response.clone());
            });
          });
        }
        return response;
      });
    }));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(fromCache(CACHE, request).then(function (cached) {
      var update = fetch(request).then(function (response) {
        if (response.ok) store(CACHE, request, response.clone());
        return response;
      }).catch(function () {
        return cached || new Response("", { status: 504 });
      });
      return cached || update;
    }));
  }
});
