/* Nexus v99: queue ticks, weights and meal slots while offline, then replay them once. */
(function () {
  var DB_NAME = "nexus-outbox";
  var STORE = "writes";
  var rawFetch = window.nexusFetch;
  var pending = 0;
  var draining = null;
  var savedTimer = 0;
  var showingSaved = false;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  function readAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function writeItem(item) {
    return openDb().then(function (db) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      return txDone(tx);
    });
  }

  function deleteItem(id) {
    return openDb().then(function (db) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      return txDone(tx);
    });
  }

  function queuedPath(path) {
    return path === "/weights" || path === "/account" || path.indexOf("/ticks/") === 0 || path.indexOf("/weights/") === 0 || path.indexOf("/slots/") === 0;
  }

  function newKey() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function isoWeek(value) {
    var parts = String(value || "").split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((date - start) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }

  function synthetic(path, method, body) {
    var stamp = new Date().toISOString();
    if (path.indexOf("/ticks/") === 0) {
      var dateKey = decodeURIComponent(path.slice("/ticks/".length));
      var mask = body && body.mask != null ? Number(body.mask) : (Number(body && body.level) >= 2 ? 3 : Number(body && body.level) || 0);
      var level = body && body.level != null ? Number(body.level) : ((mask & 1) + ((mask >> 1) & 1));
      return { date_key: dateKey, mask: mask & 3, level: level, updated_at: stamp, queued: true };
    }
    if (path === "/weights" && method === "PUT") {
      return { ok: true, updated: false, queued: true, entry: { week: isoWeek(body && body.date), date: body && body.date, weightKg: body && body.weightKg, updatedAt: stamp } };
    }
    if (path.indexOf("/weights/") === 0) return { ok: true, queued: true, week: decodeURIComponent(path.slice("/weights/".length)) };
    if (path.indexOf("/slots/") === 0) {
      var parts = path.split("/");
      return { date_key: parts[2], meal: parts[3], food_id: body && body.food_id || null, porridge_id: body && body.porridge_id || null, stack_id: body && body.stack_id || null, updated_at: stamp, queued: true };
    }
    if (path === "/account") return { ok: true, queued: true, profile: body || {} };
    return { ok: true, queued: true };
  }

  function paint(saved) {
    var el = document.getElementById("net-pill");
    if (!el) return;
    if (navigator.onLine === false || pending > 0) {
      showingSaved = false;
      el.hidden = false;
      el.classList.remove("is-saved");
      el.textContent = "Offline · will sync (" + pending + ")";
      return;
    }
    if (saved) {
      showingSaved = true;
      el.hidden = false;
      el.classList.add("is-saved");
      el.textContent = "Saved";
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(function () {
        showingSaved = false;
        paint(false);
      }, 2000);
      return;
    }
    if (showingSaved) return;
    el.hidden = true;
    el.textContent = "";
  }

  function refreshCount() {
    return readAll().then(function (rows) {
      pending = rows.length;
      paint(false);
      return rows;
    }).catch(function () {
      paint(false);
      return [];
    });
  }

  function enqueue(path, method, body) {
    var item = {
      id: newKey(),
      path: path,
      method: method,
      body: body || null,
      at: Date.now()
    };
    return writeItem(item).then(function () {
      return refreshCount();
    }).then(function () {
      return synthetic(path, method, body);
    });
  }

  function replay() {
    if (draining || navigator.onLine === false) return draining || Promise.resolve();
    draining = readAll().then(function (rows) {
      rows.sort(function (a, b) { return a.at - b.at; });
      var sent = 0;
      function next(index) {
        if (index >= rows.length) return sent;
        var item = rows[index];
        return rawFetch(item.path, {
          method: item.method,
          body: item.body,
          idempotencyKey: item.id
        }).then(function () {
          sent += 1;
          return deleteItem(item.id).then(function () { return next(index + 1); });
        }).catch(function (err) {
          if (err && err.status && err.status < 500 && err.status !== 408 && err.status !== 429) {
            return deleteItem(item.id).then(function () { return next(index + 1); });
          }
          return sent;
        });
      }
      return next(0);
    }).then(function (sent) {
      draining = null;
      return refreshCount().then(function () {
        if (sent > 0 && pending === 0 && navigator.onLine !== false) paint(true);
      });
    }).catch(function () {
      draining = null;
      return refreshCount();
    });
    return draining;
  }

  window.nexusFetch = function (path, opts) {
    var options = opts || {};
    var method = String(options.method || "GET").toUpperCase();
    if (!queuedPath(path) || method === "GET" || method === "HEAD") {
      if (method === "GET" && path === "/ticks") {
        return rawFetch(path, options).then(mergeTicks).catch(function (err) {
          if (err && err.status) throw err;
          return mergeTicks([]);
        });
      }
      return rawFetch(path, options);
    }
    var body = options.body && typeof options.body === "object" ? options.body : null;
    if (navigator.onLine === false) return enqueue(path, method, body);
    return rawFetch(path, options).catch(function (err) {
      if (err && err.status) throw err;
      return enqueue(path, method, body);
    });
  };

  function mergeTicks(rows) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    return readAll().then(function (queued) {
      queued.filter(function (item) { return item.path.indexOf("/ticks/") === 0; }).sort(function (a, b) {
        return a.at - b.at;
      }).forEach(function (item) {
        var row = synthetic(item.path, item.method, item.body);
        var found = false;
        list.forEach(function (existing, index) {
          if (existing && existing.date_key === row.date_key) {
            list[index] = row;
            found = true;
          }
        });
        if (!found) list.push(row);
      });
      return list;
    }).catch(function () {
      return list;
    });
  }

  var original = rawFetch;
  window.nexusFetch = (function (wrapped) {
    return function (path, opts) {
      var options = opts || {};
      if (options.idempotencyKey) {
        return original(path, {
          method: options.method,
          body: options.body,
          headers: { "X-Idempotency-Key": options.idempotencyKey }
        });
      }
      return wrapped(path, opts);
    };
  })(window.nexusFetch);

  // nexusConfig's fetch does not forward extra headers. Replay sends the key
  // through a dedicated fetch so a retry of the same outbox row is one write.
  rawFetch = function (path, opts) {
    var options = opts || {};
    if (!options.idempotencyKey && !(options.headers && options.headers["X-Idempotency-Key"])) return original(path, options);
    var api = window.NEXUS_API || {};
    var method = String(options.method || "GET").toUpperCase();
    var headers = { "Content-Type": "application/json", "X-Nexus-Key": api.key || "" };
    headers["X-Idempotency-Key"] = options.idempotencyKey || options.headers["X-Idempotency-Key"];
    var url = String(api.base || "").replace(/\/$/, "") + path;
    return fetch(url, {
      method: method,
      headers: headers,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(options.body || {})
    }).then(function (response) {
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

  window.addEventListener("online", function () { replay(); });
  window.addEventListener("offline", function () { paint(false); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") replay();
  });
  refreshCount().then(function () { replay(); });
})();
