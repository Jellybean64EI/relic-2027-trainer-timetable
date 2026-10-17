/* Nexus v53 card decks. Training, food.js and supabaseConfig.js stay untouched. */
(function (root) {
  var CARDS_KEY = "nexus_cards_cache_v1";
  var SLOTS_KEY = "nexus_slots_cache_v1";
  var DIRTY_KEY = "nexus_slots_dirty_v1";
  var DONE_KEY = "nexus_food_clearout_v52";
  var BACKUP_KEY = "nexus_food_clearout_backup_v52";
  var PLAN_KEY = "nexus_food_v1";
  var LOCK_DONE_KEY = "nexus_food_" + "lock_split_v1";
  var PATH_RE = /^(food|smoothie)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.(webp|jpg)$/i;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
  var SLOT_ORDER = ["breakfast", "lunch", "dinner"];

  var state = {
    cards: [],
    slots: {},
    dirty: [],
    month: 1,
    monthSet: false,
    focusKey: "",
    addDeck: "food",
    picker: null,
    card: null,
    copy: null,
    booted: false
  };

  function storageOf(passed) {
    return passed || root.localStorage;
  }

  function parseJson(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function stripName(text) {
    var value = String(text || "");
    if (root.NexusFood && typeof root.NexusFood.stripBrands === "function") {
      value = root.NexusFood.stripBrands(value);
    }
    return String(value || "").trim();
  }

  function tidyName(fileName) {
    var base = String(fileName || "").replace(/^.*[\\/]/, "");
    base = base.replace(/\.[^.]+$/, "");
    base = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    base = base.replace(/\b([a-z])/g, function (letter) { return letter.toUpperCase(); });
    base = stripName(base).slice(0, 80).trim();
    return base || "Untitled card";
  }

  function clampPortion(value) {
    var n = Math.round(Number(value) * 2) / 2;
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 10) n = 10;
    return n;
  }

  function stepPortion(value, dir) {
    return clampPortion(clampPortion(value) + (dir < 0 ? -0.5 : 0.5));
  }

  function fiveADay(foods, smoothies) {
    var foodSum = 0;
    var smoothieSum = 0;
    (foods || []).forEach(function (card) {
      if (!card || card.hidden) return;
      foodSum += Number(card.veg) + Number(card.fruit);
    });
    (smoothies || []).forEach(function (card) {
      if (!card || card.hidden) return;
      smoothieSum += Number(card.veg) + Number(card.fruit);
    });
    return foodSum + Math.min(1, smoothieSum);
  }

  function formatPortions(value) {
    var n = Math.round(Number(value) * 10) / 10;
    if (!isFinite(n)) n = 0;
    if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
    return n.toFixed(1);
  }

  function reducePick(current, deck, id) {
    var next = {
      food: current && current.food || null,
      smoothie: current && current.smoothie || null
    };
    var key = deck === "smoothie" ? "smoothie" : "food";
    next[key] = next[key] === id ? null : id;
    return next;
  }

  function cardById(cards, id) {
    if (!id || !cards) return null;
    if (Array.isArray(cards)) {
      for (var i = 0; i < cards.length; i++) {
        if (cards[i] && cards[i].id === id) return cards[i];
      }
      return null;
    }
    return cards[id] || null;
  }

  function visibleCard(cards, id) {
    var card = cardById(cards, id);
    if (!card || card.hidden) return null;
    return card;
  }

  function slotHalf(slot, cards, which) {
    if (!slot) return null;
    var id = which === "smoothie" ? (slot.s || slot.smoothie_id || null) : (slot.f || slot.food_id || null);
    return visibleCard(cards, id);
  }

  function targetFull(slot, cards) {
    return !!(slotHalf(slot, cards, "food") || slotHalf(slot, cards, "smoothie"));
  }

  function slotRow(date, slot, foodId, smoothieId, now) {
    return {
      date_key: date,
      slot: slot,
      food_id: foodId || null,
      smoothie_id: smoothieId || null,
      updated_at: now || new Date().toISOString()
    };
  }

  function planCopy(slots, source, days, slot, mode, cards, now) {
    var srcDate = source && (source.date || source.date_key) || "";
    var foodId = source && source.food_id || null;
    var smoothieId = source && source.smoothie_id || null;
    var stamp = now || new Date().toISOString();
    var rows = [];
    var skipped = 0;
    var replaced = 0;
    var seen = {};
    (days || []).forEach(function (date) {
      if (!date || date === srcDate || seen[date]) return;
      seen[date] = true;
      var current = slots && slots[date + "|" + slot];
      var full = targetFull(current, cards || {});
      if (mode === "overwrite") {
        if (full) replaced += 1;
        rows.push(slotRow(date, slot, foodId, smoothieId, stamp));
      } else if (full) {
        skipped += 1;
      } else {
        rows.push(slotRow(date, slot, foodId, smoothieId, stamp));
      }
    });
    return { rows: rows, skipped: skipped, replaced: replaced };
  }

  function emptyShell(raw) {
    var rev = 1;
    var parsed = parseJson(raw);
    if (parsed && typeof parsed.rev === "number" && isFinite(parsed.rev)) rev = parsed.rev + 1;
    return JSON.stringify({
      schema: 1,
      recipes: {},
      months: {},
      templates: {},
      undo: [],
      view: { month: "2027-01" },
      scrubbed: 41,
      rev: rev
    });
  }

  function backupMatches(store, raw) {
    var saved = parseJson(store.getItem(BACKUP_KEY));
    if (!saved || !saved.keys) return false;
    var kept = Object.prototype.hasOwnProperty.call(saved.keys, PLAN_KEY) ? saved.keys[PLAN_KEY] : undefined;
    return kept === raw;
  }

  function clearOut(passed) {
    var store = storageOf(passed);
    if (!store || !store.getItem || !store.setItem) return { ok: false, reason: "storage", toast: "" };
    if (store.getItem(DONE_KEY) === "done") return { ok: true, reason: "done", toast: "" };
    if (store.getItem(LOCK_DONE_KEY) !== "done") return { ok: false, reason: "lock", toast: "" };
    var raw = store.getItem(PLAN_KEY);
    var existing = store.getItem(BACKUP_KEY);
    if (existing != null) {
      if (!backupMatches(store, raw)) {
        return { ok: false, reason: "backup", toast: "Couldn't back up old food data. Nothing was deleted." };
      }
    } else {
      var payload = JSON.stringify({
        at: new Date().toISOString(),
        from: "845c93a",
        keys: { nexus_food_v1: raw }
      });
      try { store.setItem(BACKUP_KEY, payload); }
      catch (err) {
        return { ok: false, reason: "quota", toast: "Couldn't back up old food data. Nothing was deleted." };
      }
      if (store.getItem(BACKUP_KEY) !== payload) {
        return { ok: false, reason: "readback", toast: "Couldn't back up old food data. Nothing was deleted." };
      }
    }
    var shell = emptyShell(raw);
    try { store.setItem(PLAN_KEY, shell); }
    catch (err) {
      return { ok: false, reason: "shell", toast: "Couldn't back up old food data. Nothing was deleted." };
    }
    if (store.getItem(PLAN_KEY) !== shell) {
      if (raw != null) {
        try { store.setItem(PLAN_KEY, raw); } catch (restoreErr) { /* keep the backup */ }
      }
      return { ok: false, reason: "shell", toast: "Couldn't back up old food data. Nothing was deleted." };
    }
    try { store.setItem(DONE_KEY, "done"); }
    catch (err) {
      return { ok: false, reason: "done-write", toast: "Couldn't back up old food data. Nothing was deleted." };
    }
    if (store.getItem(DONE_KEY) !== "done") {
      return { ok: false, reason: "done-write", toast: "Couldn't back up old food data. Nothing was deleted." };
    }
    return { ok: true, reason: "cleared", toast: "Old recipes and test meals cleared · backup saved" };
  }

  function showToast(message) {
    if (!message || !root.document) return;
    var node = root.document.getElementById("deck-toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { node.hidden = true; }, 4200);
  }

  function cfg() {
    return root.RELIC_SUPABASE || {};
  }

  function baseUrl() {
    return String((cfg().url) || "").replace(/\/$/, "");
  }

  function authHeaders(extra) {
    var key = cfg().anonKey || "";
    var headers = { apikey: key, Authorization: "Bearer " + key };
    if (extra) Object.keys(extra).forEach(function (name) { headers[name] = extra[name]; });
    return headers;
  }

  function cardSrc(card, kind) {
    if (!card) return "";
    var path = kind === "full" ? card.path : card.thumb;
    if (typeof path !== "string" || !PATH_RE.test(path)) return "";
    var folder = path.slice(0, path.indexOf("/"));
    if (folder !== card.deck) return "";
    var base = baseUrl();
    if (!base) return "";
    return base + "/storage/v1/object/public/nexus-cards/" + path;
  }

  function readCaches() {
    var store = root.localStorage;
    if (!store) return;
    var cards = parseJson(store.getItem(CARDS_KEY));
    state.cards = Array.isArray(cards) ? cards : [];
    var slots = parseJson(store.getItem(SLOTS_KEY));
    state.slots = slots && typeof slots === "object" && !Array.isArray(slots) ? slots : {};
    var dirty = parseJson(store.getItem(DIRTY_KEY));
    state.dirty = Array.isArray(dirty) ? dirty : [];
  }

  function writeCards() {
    try { root.localStorage.setItem(CARDS_KEY, JSON.stringify(state.cards)); } catch (err) { /* cache is best-effort */ }
  }

  function writeSlots() {
    try { root.localStorage.setItem(SLOTS_KEY, JSON.stringify(state.slots)); } catch (err) { /* cache is best-effort */ }
  }

  function writeDirty() {
    try { root.localStorage.setItem(DIRTY_KEY, JSON.stringify(state.dirty)); } catch (err) { /* cache is best-effort */ }
  }

  function markDirty(keys) {
    keys.forEach(function (key) {
      if (state.dirty.indexOf(key) === -1) state.dirty.push(key);
    });
    writeDirty();
  }

  function setupFailure(status, body) {
    var text = String(body || "");
    return status === 404 || /relation|bucket|not found|PGRST|schema cache/i.test(text);
  }

  function sortedCards(deck) {
    return state.cards.filter(function (card) {
      return card && card.deck === deck && !card.hidden;
    }).sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function daysInMonth(month) {
    return new Date(Date.UTC(2027, month, 0)).getUTCDate();
  }

  function dateKey(month, day) {
    return "2027-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function weekdayIndex(key) {
    var parts = key.split("-");
    return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2])).getUTCDay();
  }

  function prettyDate(key) {
    var parts = key.split("-");
    var index = weekdayIndex(key);
    return SHORT[index] + " " + (+parts[2]) + " " + MONTHS[+parts[1] - 1].slice(0, 3);
  }

  function el(tag, className, text) {
    var node = root.document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function paintAll() {
    renderDeck("food");
    renderDeck("smoothie");
    if (root.document && root.document.getElementById("hub-month-body")) renderHubMonth();
  }

  function portionsLine(card) {
    return "Veg " + formatPortions(card.veg || 0) + " · Fruit " + formatPortions(card.fruit || 0);
  }

  function renderDeck(deck) {
    if (!root.document) return;
    var which = deck === "smoothie" || deck === "smoothies" ? "smoothie" : "food";
    var rootId = which === "smoothie" ? "deck-root-smoothie" : "deck-root-food";
    var host = root.document.getElementById(rootId);
    if (!host) return;
    var count = host.querySelector("[data-deck-count]");
    var grid = host.querySelector("[data-deck-grid]");
    var cards = sortedCards(which);
    if (count) count.textContent = (which === "food" ? "Food" : "Smoothies") + " · " + cards.length + (cards.length === 1 ? " card" : " cards");
    if (!grid) return;
    grid.textContent = "";
    cards.forEach(function (card) {
      var tile = el("button", "deck-tile");
      tile.type = "button";
      tile.setAttribute("data-deck-open", card.id);
      var img = el("img", "deck-thumb");
      img.alt = "";
      var src = cardSrc(card, "thumb") || cardSrc(card, "full");
      if (src) img.src = src;
      var name = el("span", "deck-tile-name", card.name || "Untitled card");
      var meta = el("span", "deck-tile-meta", portionsLine(card));
      tile.appendChild(img);
      tile.appendChild(name);
      tile.appendChild(meta);
      grid.appendChild(tile);
    });
  }

  function renderHubMonth(info) {
    if (!root.document) return;
    if (info && !state.monthSet) {
      var year = info.year;
      var month = info.month || 1;
      if (year < 2027) month = 1;
      else if (year > 2027) month = 12;
      state.month = Math.min(12, Math.max(1, month));
      state.monthSet = true;
    }
    if (info && info.focus) state.focusKey = info.focus;
    var label = root.document.getElementById("hub-month-label");
    if (label) label.textContent = MONTHS[state.month - 1] + " 2027";
    var prev = root.document.getElementById("hub-month-prev");
    var next = root.document.getElementById("hub-month-next");
    if (prev) prev.disabled = state.month <= 1;
    if (next) next.disabled = state.month >= 12;
    var body = root.document.getElementById("hub-month-body");
    if (!body) return;
    body.textContent = "";
    var total = daysInMonth(state.month);
    for (var day = 1; day <= total; day++) {
      body.appendChild(dayCard(dateKey(state.month, day)));
    }
    body.appendChild(el("p", "hub-daily", "Daily: 2 Brazil nuts"));
  }

  function dayPortions(key) {
    var foods = [];
    var smoothies = [];
    SLOT_ORDER.forEach(function (slot) {
      var stored = state.slots[key + "|" + slot];
      var food = slotHalf(stored, state.cards, "food");
      var smoothie = slotHalf(stored, state.cards, "smoothie");
      if (food) foods.push(food);
      if (smoothie) smoothies.push(smoothie);
    });
    return fiveADay(foods, smoothies);
  }

  function dayCard(key) {
    var article = el("article", "deck-day" + (key === state.focusKey ? " is-focus" : ""));
    article.appendChild(el("h3", "deck-day-title", prettyDate(key)));
    SLOT_ORDER.forEach(function (slot) {
      article.appendChild(slotBlock(key, slot));
    });
    article.appendChild(el("p", "deck-five", "5 a day: " + formatPortions(dayPortions(key))));
    return article;
  }

  function slotBlock(key, slot) {
    var stored = state.slots[key + "|" + slot] || { f: null, s: null };
    var food = slotHalf(stored, state.cards, "food");
    var smoothie = slotHalf(stored, state.cards, "smoothie");
    var wrap = el("div", "deck-slot");
    wrap.appendChild(el("p", "deck-slot-label", SLOT_LABEL[slot]));
    if (!food && !smoothie) {
      var add = el("button", "deck-slot-add", "+ Add");
      add.type = "button";
      add.setAttribute("data-deck-pick", key + "|" + slot);
      wrap.appendChild(add);
      return wrap;
    }
    if (food) wrap.appendChild(nameLine(food, key, slot));
    if (smoothie) wrap.appendChild(nameLine(smoothie, key, slot));
    var copy = el("button", "deck-copy", "Copy");
    copy.type = "button";
    copy.setAttribute("data-deck-copy", key + "|" + slot);
    wrap.appendChild(copy);
    return wrap;
  }

  function nameLine(card, key, slot) {
    var line = el("div", "deck-slot-line");
    var name = el("button", "deck-slot-name", card.name || "Untitled card");
    name.type = "button";
    name.setAttribute("data-deck-pick", key + "|" + slot);
    var arrow = el("button", "deck-slot-arrow", "→");
    arrow.type = "button";
    arrow.setAttribute("aria-label", "Open " + (card.name || "card"));
    arrow.setAttribute("data-deck-view", card.id);
    arrow.setAttribute("data-deck-from", "hub");
    line.appendChild(name);
    line.appendChild(arrow);
    return line;
  }

  function closeOverlays() {
    ["deck-picker", "deck-card", "deck-copy"].forEach(function (id) {
      var node = root.document.getElementById(id);
      if (node) {
        node.hidden = true;
        node.textContent = "";
      }
    });
    state.picker = null;
    state.card = null;
    if (root.document && root.document.body) root.document.body.classList.remove("is-card-open");
  }

  function openPicker(key) {
    var parts = String(key || "").split("|");
    var date = parts[0];
    var slot = parts[1];
    if (!date || !SLOT_LABEL[slot]) return;
    var stored = state.slots[date + "|" + slot] || { f: null, s: null };
    state.picker = {
      date: date,
      slot: slot,
      food: visibleCard(state.cards, stored.f) ? stored.f : null,
      smoothie: visibleCard(state.cards, stored.s) ? stored.s : null,
      had: targetFull(stored, state.cards) || !!(stored.f || stored.s)
    };
    paintPicker();
  }

  function paintPicker() {
    var host = root.document.getElementById("deck-picker");
    if (!host || !state.picker) return;
    host.hidden = false;
    host.textContent = "";
    var pick = state.picker;
    var head = el("div", "deck-overlay-head");
    var close = el("button", "deck-x", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-deck-close", "picker");
    var title = el("h2", "deck-overlay-title", prettyDate(pick.date) + " · " + SLOT_LABEL[pick.slot]);
    head.appendChild(close);
    head.appendChild(title);
    host.appendChild(head);
    var cols = el("div", "deck-picker-cols");
    cols.appendChild(pickerColumn("food", "Food", pick.food));
    cols.appendChild(pickerColumn("smoothie", "Smoothies", pick.smoothie));
    host.appendChild(cols);
    var bar = el("div", "deck-picker-bar");
    var chosen = (pick.food ? 1 : 0) + (pick.smoothie ? 1 : 0);
    if (pick.had) {
      var clear = el("button", "deck-clear", "Clear meal");
      clear.type = "button";
      clear.setAttribute("data-deck-clear", "1");
      bar.appendChild(clear);
    }
    if (chosen >= 1) {
      var save = el("button", "deck-save", "Save to schedule");
      save.type = "button";
      save.setAttribute("data-deck-save", "1");
      bar.appendChild(save);
    }
    host.appendChild(bar);
  }

  function pickerColumn(deck, label, selected) {
    var col = el("section", "deck-picker-col");
    col.appendChild(el("h3", "deck-col-title", label));
    var list = el("div", "deck-picker-list");
    var cards = sortedCards(deck);
    if (!cards.length) {
      list.appendChild(el("p", "deck-empty", deck === "food"
        ? "No food cards yet. Add some in the Food deck."
        : "No smoothie cards yet. Add some in the Smoothies deck."));
    }
    cards.forEach(function (card) {
      var btn = el("button", "deck-pick");
      btn.type = "button";
      btn.setAttribute("data-deck-toggle", card.id);
      btn.setAttribute("data-deck-kind", deck);
      var on = selected === card.id;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("is-on");
      var img = el("img", "deck-pick-img");
      img.alt = "";
      var src = cardSrc(card, "thumb");
      if (src) img.src = src;
      var name = el("span", "deck-pick-name", card.name || "Untitled card");
      var tick = el("span", "deck-tick");
      tick.setAttribute("aria-hidden", "true");
      btn.appendChild(img);
      btn.appendChild(name);
      btn.appendChild(tick);
      list.appendChild(btn);
    });
    col.appendChild(list);
    return col;
  }

  function openCard(id, from) {
    var card = cardById(state.cards, id);
    if (!card || card.hidden) return;
    state.card = { id: id, from: from || "hub", editing: false };
    paintCard();
  }

  function bindImageZoom(stage, img) {
    var view = { scale: 1, x: 0, y: 0 };
    var pointers = {};
    var pinch = null;
    var drag = null;
    var lastTap = 0;
    var tapX = 0;
    var tapY = 0;
    stage.style.touchAction = "none";
    img.style.touchAction = "none";
    img.style.transformOrigin = "center center";

    function apply() {
      img.style.transform = "translate(" + view.x + "px, " + view.y + "px) scale(" + view.scale + ")";
      img.setAttribute("data-zoom", String(view.scale));
    }

    function reset() {
      view.scale = 1;
      view.x = 0;
      view.y = 0;
      apply();
    }

    function clampPan() {
      var rect = stage.getBoundingClientRect();
      var maxX = Math.max(0, (rect.width * (view.scale - 1)) / 2);
      var maxY = Math.max(0, (rect.height * (view.scale - 1)) / 2);
      if (view.x > maxX) view.x = maxX;
      if (view.x < -maxX) view.x = -maxX;
      if (view.y > maxY) view.y = maxY;
      if (view.y < -maxY) view.y = -maxY;
    }

    function points() {
      return Object.keys(pointers).map(function (id) { return pointers[id]; });
    }

    function span(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }

    stage.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var pts = points();
      if (pts.length >= 2) {
        pinch = { dist: span(pts[0], pts[1]), scale: view.scale };
        drag = null;
      } else {
        drag = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y, moved: false };
      }
    });

    stage.addEventListener("pointermove", function (event) {
      if (!pointers[event.pointerId]) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var pts = points();
      if (pts.length >= 2 && pinch) {
        view.scale = Math.min(6, Math.max(1, pinch.scale * (span(pts[0], pts[1]) / pinch.dist)));
        if (view.scale === 1) { view.x = 0; view.y = 0; }
        else clampPan();
        apply();
        return;
      }
      if (!drag || pts.length !== 1) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 8) drag.moved = true;
      if (view.scale <= 1) return;
      view.x = drag.ox + dx;
      view.y = drag.oy + dy;
      clampPan();
      apply();
    });

    function endPointer(event) {
      var point = pointers[event.pointerId];
      delete pointers[event.pointerId];
      var pts = points();
      if (pts.length < 2) pinch = null;
      if (pts.length === 1) {
        drag = { x: pts[0].x, y: pts[0].y, ox: view.x, oy: view.y, moved: true };
        return;
      }
      if (pts.length > 0) return;
      if (drag && !drag.moved && point) {
        var now = Date.now();
        if (now - lastTap < 320 && Math.hypot(point.x - tapX, point.y - tapY) < 36) {
          reset();
          lastTap = 0;
        } else {
          lastTap = now;
          tapX = point.x;
          tapY = point.y;
        }
      }
      drag = null;
    }

    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", function (event) {
      delete pointers[event.pointerId];
      pinch = null;
      drag = null;
    });
    stage.addEventListener("dblclick", function (event) {
      event.preventDefault();
      reset();
    });
    stage.addEventListener("wheel", function (event) {
      event.preventDefault();
      var next = view.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12);
      view.scale = Math.min(6, Math.max(1, next));
      if (view.scale === 1) { view.x = 0; view.y = 0; }
      else clampPan();
      apply();
    }, { passive: false });
    apply();
  }

  function paintCard() {
    var host = root.document.getElementById("deck-card");
    var card = state.card && cardById(state.cards, state.card.id);
    if (!host || !card) return;
    host.hidden = false;
    host.textContent = "";
    if (root.document.body) root.document.body.classList.add("is-card-open");
    var close = el("button", "deck-x deck-x-fixed", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-deck-close", "card");
    host.appendChild(close);
    var stage = el("div", "deck-card-stage");
    var img = el("img", "deck-card-img");
    img.alt = card.name || "";
    img.draggable = false;
    var thumb = cardSrc(card, "thumb");
    var full = cardSrc(card, "full");
    if (thumb) img.src = thumb;
    if (full && full !== thumb) {
      var preload = new Image();
      preload.onload = function () { img.src = full; };
      preload.src = full;
    } else if (full) {
      img.src = full;
    }
    stage.appendChild(img);
    host.appendChild(stage);
    bindImageZoom(stage, img);
    if (state.card.editing && state.card.from === "deck") {
      host.appendChild(editSheet(card));
      return;
    }
    var chrome = el("div", "deck-card-chrome");
    chrome.appendChild(el("h2", "deck-card-name", card.name || "Untitled card"));
    chrome.appendChild(el("p", "deck-card-meta", portionsLine(card)));
    if (state.card.from === "deck") {
      var actions = el("div", "deck-card-actions");
      var edit = el("button", "deck-text", "Edit");
      edit.type = "button";
      edit.setAttribute("data-deck-edit", card.id);
      var remove = el("button", "deck-text", "Remove");
      remove.type = "button";
      remove.setAttribute("data-deck-hide", card.id);
      actions.appendChild(edit);
      actions.appendChild(remove);
      chrome.appendChild(actions);
    }
    host.appendChild(chrome);
  }

  function stepper(name, label, value) {
    var current = clampPortion(value);
    var row = el("div", "deck-stepper");
    row.appendChild(el("span", "deck-stepper-label", label));
    var minus = el("button", "deck-stepper-btn", "−");
    minus.type = "button";
    minus.setAttribute("data-deck-step", name);
    minus.setAttribute("data-deck-dir", "-1");
    minus.setAttribute("aria-label", "Less " + label);
    minus.disabled = current <= 0;
    var read = el("span", "deck-stepper-value", formatPortions(current));
    read.setAttribute("data-deck-portion", name);
    var plus = el("button", "deck-stepper-btn", "+");
    plus.type = "button";
    plus.setAttribute("data-deck-step", name);
    plus.setAttribute("data-deck-dir", "1");
    plus.setAttribute("aria-label", "More " + label);
    plus.disabled = current >= 10;
    var hidden = root.document.createElement("input");
    hidden.type = "hidden";
    hidden.name = name;
    hidden.value = String(current);
    row.appendChild(minus);
    row.appendChild(read);
    row.appendChild(plus);
    row.appendChild(hidden);
    return row;
  }

  function editSheet(card) {
    var form = el("form", "deck-edit");
    form.setAttribute("data-deck-edit-form", card.id);
    var nameLabel = el("label", "deck-field-label");
    nameLabel.appendChild(el("span", "deck-stepper-label", "Name"));
    var name = el("input", "deck-field");
    name.name = "name";
    name.value = card.name || "";
    name.maxLength = 80;
    name.setAttribute("aria-label", "Name");
    nameLabel.appendChild(name);
    form.appendChild(nameLabel);
    form.appendChild(stepper("veg", "Veg portions", card.veg || 0));
    form.appendChild(stepper("fruit", "Fruit portions", card.fruit || 0));
    var actions = el("div", "deck-edit-actions");
    var save = el("button", "deck-save", "Save");
    save.type = "submit";
    var cancel = el("button", "deck-cancel", "Cancel");
    cancel.type = "button";
    cancel.setAttribute("data-deck-cancel", "1");
    actions.appendChild(save);
    actions.appendChild(cancel);
    form.appendChild(actions);
    var error = el("p", "deck-error");
    error.setAttribute("data-deck-error", "1");
    form.appendChild(error);
    return form;
  }

  function openCopy(key) {
    var parts = String(key || "").split("|");
    var stored = state.slots[parts[0] + "|" + parts[1]] || {};
    state.copy = {
      date: parts[0],
      slot: parts[1],
      month: +parts[0].slice(5, 7) || state.month,
      days: {},
      mode: "fill",
      targetSlot: parts[1],
      food_id: stored.f || null,
      smoothie_id: stored.s || null
    };
    paintCopy();
  }

  function paintCopy() {
    var host = root.document.getElementById("deck-copy");
    var copy = state.copy;
    if (!host || !copy) return;
    host.hidden = false;
    host.textContent = "";
    var head = el("div", "deck-overlay-head");
    var close = el("button", "deck-x", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-deck-close", "copy");
    head.appendChild(close);
    head.appendChild(el("h2", "deck-overlay-title", "Copy " + prettyDate(copy.date) + " · " + SLOT_LABEL[copy.slot]));
    host.appendChild(head);
    var step = el("div", "deck-step");
    var prev = el("button", "deck-step-btn", "‹");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous month");
    prev.setAttribute("data-deck-copy-month", "-1");
    prev.disabled = copy.month <= 1;
    var next = el("button", "deck-step-btn", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Next month");
    next.setAttribute("data-deck-copy-month", "1");
    next.disabled = copy.month >= 12;
    step.appendChild(prev);
    step.appendChild(el("p", "deck-step-label", MONTHS[copy.month - 1] + " 2027"));
    step.appendChild(next);
    host.appendChild(step);
    var grid = el("div", "deck-copy-grid");
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (name) {
      grid.appendChild(el("span", "deck-copy-dow", name));
    });
    var first = dateKey(copy.month, 1);
    var lead = (weekdayIndex(first) + 6) % 7;
    for (var blank = 0; blank < lead; blank++) grid.appendChild(el("span", "deck-copy-blank"));
    var total = daysInMonth(copy.month);
    for (var day = 1; day <= total; day++) {
      var key = dateKey(copy.month, day);
      var btn = el("button", "deck-copy-day", String(day));
      btn.type = "button";
      btn.setAttribute("data-deck-day", key);
      if (key === copy.date) {
        btn.disabled = true;
        btn.classList.add("is-source");
      }
      var on = !!copy.days[key];
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("is-on");
      grid.appendChild(btn);
    }
    host.appendChild(grid);
    var chips = el("div", "deck-chips");
    [{ id: "breakfast", label: "B" }, { id: "lunch", label: "L" }, { id: "dinner", label: "D" }].forEach(function (chip) {
      var btn = el("button", "deck-chip", chip.label);
      btn.type = "button";
      btn.setAttribute("data-deck-chip", chip.id);
      var on = copy.targetSlot === chip.id;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("is-on");
      chips.appendChild(btn);
    });
    host.appendChild(chips);
    var modes = el("div", "deck-modes");
    [{ id: "fill", label: "Fill empty only" }, { id: "overwrite", label: "Overwrite" }].forEach(function (mode) {
      var btn = el("button", "deck-mode", mode.label);
      btn.type = "button";
      btn.setAttribute("data-deck-mode", mode.id);
      var on = copy.mode === mode.id;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("is-on");
      modes.appendChild(btn);
    });
    host.appendChild(modes);
    var count = Object.keys(copy.days).length;
    var go = el("button", "deck-save", "Copy to " + count + " days");
    go.type = "button";
    go.disabled = count === 0;
    go.setAttribute("data-deck-copy-go", "1");
    host.appendChild(go);
  }

  function cacheSlot(date, slot, foodId, smoothieId) {
    state.slots[date + "|" + slot] = { f: foodId || null, s: smoothieId || null };
    writeSlots();
  }

  function rememberRows(rows) {
    rows.forEach(function (row) {
      cacheSlot(row.date_key, row.slot, row.food_id, row.smoothie_id);
    });
  }

  function online() {
    return root.navigator ? root.navigator.onLine !== false : true;
  }

  function loadCards() {
    var base = baseUrl();
    if (!base || !online()) return Promise.resolve(state.cards);
    return root.fetch(base + "/rest/v1/nexus_cards?select=*&order=created_at.desc", { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) return state.cards;
        return res.json().then(function (rows) {
          if (Array.isArray(rows)) {
            state.cards = rows;
            writeCards();
          }
          return state.cards;
        });
      })
      .catch(function () { return state.cards; });
  }

  function loadSlots() {
    var base = baseUrl();
    if (!base || !online()) return Promise.resolve(state.slots);
    return root.fetch(base + "/rest/v1/nexus_slots?select=date_key,slot,food_id,smoothie_id,updated_at", { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) return state.slots;
        return res.json().then(function (rows) {
          if (!Array.isArray(rows)) return state.slots;
          var next = {};
          rows.forEach(function (row) {
            next[row.date_key + "|" + row.slot] = { f: row.food_id || null, s: row.smoothie_id || null };
          });
          state.slots = next;
          writeSlots();
          return state.slots;
        });
      })
      .catch(function () { return state.slots; });
  }

  function upsertSlots(rows) {
    var base = baseUrl();
    if (!base || !online()) return Promise.reject(new Error("offline"));
    return root.fetch(base + "/rest/v1/nexus_slots?on_conflict=date_key,slot", {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(rows)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (text) {
        var error = new Error("save");
        error.status = res.status;
        error.body = text;
        throw error;
      });
      return true;
    });
  }

  function saveSlots(rows) {
    if (!rows || !rows.length) return Promise.resolve({ ok: true, rows: [] });
    rememberRows(rows);
    paintAll();
    return upsertSlots(rows).then(function () {
      rows.forEach(function (row) {
        var key = row.date_key + "|" + row.slot;
        state.dirty = state.dirty.filter(function (item) { return item !== key; });
      });
      writeDirty();
      return { ok: true, rows: rows };
    }).catch(function () {
      markDirty(rows.map(function (row) { return row.date_key + "|" + row.slot; }));
      showToast("Saved on this phone · will sync");
      return { ok: false, rows: rows, toast: "Saved on this phone · will sync" };
    });
  }

  function saveSlot(date, slot, foodId, smoothieId) {
    return saveSlots([slotRow(date, slot, foodId, smoothieId)]);
  }

  function retryDirty() {
    if (!state.dirty.length) return Promise.resolve();
    var rows = state.dirty.map(function (key) {
      var parts = key.split("|");
      var stored = state.slots[key] || {};
      return slotRow(parts[0], parts[1], stored.f || null, stored.s || null);
    });
    return upsertSlots(rows).then(function () {
      state.dirty = [];
      writeDirty();
    }).catch(function () { /* keep the queue */ });
  }

  function drawScaled(bitmap, longSide, type, quality) {
    var scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
    var canvas = root.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    var ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  function resizeToWebp(file) {
    return root.createImageBitmap(file).then(function (bitmap) {
      if (Math.max(bitmap.width, bitmap.height) > 6000) {
        bitmap.close && bitmap.close();
        return Promise.reject(new Error("too-big"));
      }
      return drawScaled(bitmap, 1400, "image/webp", 0.78).then(function (full) {
        var fullType = full && full.type === "image/webp" ? "image/webp" : "image/jpeg";
        var quality = fullType === "image/webp" ? 0.78 : 0.8;
        var again = fullType === "image/webp" ? Promise.resolve(full) : drawScaled(bitmap, 1400, "image/jpeg", 0.8);
        return again.then(function (blob) {
          if (blob && blob.type === "image/webp" && blob.size > 700 * 1024) {
            return drawScaled(bitmap, 1400, "image/webp", 0.6);
          }
          return blob;
        }).then(function (blob) {
          if (!blob || (blob.type === "image/webp" && blob.size > 700 * 1024)) {
            bitmap.close && bitmap.close();
            return Promise.reject(new Error("too-heavy"));
          }
          var ext = blob.type === "image/webp" ? "webp" : "jpg";
          var thumbType = ext === "webp" ? "image/webp" : "image/jpeg";
          var thumbQ = ext === "webp" ? 0.7 : 0.8;
          return drawScaled(bitmap, 360, thumbType, thumbQ).then(function (thumb) {
            bitmap.close && bitmap.close();
            return { full: blob, thumb: thumb, ext: ext };
          });
        });
      });
    });
  }

  function uploadBlob(path, blob) {
    return root.fetch(baseUrl() + "/storage/v1/object/nexus-cards/" + path, {
      method: "POST",
      headers: authHeaders({ "Content-Type": blob.type || "application/octet-stream" }),
      body: blob
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (text) {
        var error = new Error(setupFailure(res.status, text) ? "setup" : "upload");
        throw error;
      });
    });
  }

  function uploadOne(file, deck) {
    var name = tidyName(file && file.name);
    var log = logLine(deck, "Adding " + name + "…");
    if (!file || String(file.type || "").indexOf("image/") !== 0) {
      var label = (file && file.name) || "file";
      log.textContent = "*" + label + "* isn't an image. Pick a PNG, JPG or WebP card.";
      return Promise.resolve();
    }
    if (!baseUrl()) {
      log.textContent = "Card storage isn't set up yet";
      return Promise.resolve();
    }
    if (!online()) {
      log.textContent = "Couldn't add " + name + ": no connection. Try again.";
      return Promise.resolve();
    }
    return resizeToWebp(file).then(function (images) {
      var id = (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : fallbackId();
      var path = deck + "/" + id + "." + images.ext;
      var thumb = deck + "/" + id + "_t." + images.ext;
      return uploadBlob(path, images.full).then(function () {
        return uploadBlob(thumb, images.thumb);
      }).then(function () {
        var row = {
          id: id,
          deck: deck,
          name: name,
          veg: 0,
          fruit: 0,
          path: path,
          thumb: thumb,
          hidden: false,
          created_at: new Date().toISOString()
        };
        return root.fetch(baseUrl() + "/rest/v1/nexus_cards", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
          body: JSON.stringify(row)
        }).then(function (res) {
          if (!res.ok) return res.text().then(function (text) {
            throw new Error(setupFailure(res.status, text) ? "setup" : "upload");
          });
          return res.json().then(function (body) {
            var saved = Array.isArray(body) ? body[0] : row;
            state.cards.unshift(saved || row);
            writeCards();
            log.textContent = "Added";
            renderDeck(deck);
            return saved;
          });
        });
      });
    }).catch(function (err) {
      if (err && err.message === "too-big") log.textContent = "Image is over 6000 px. Pick a smaller card.";
      else if (err && err.message === "too-heavy") log.textContent = "Image is still too large after compression.";
      else if (err && err.message === "setup") log.textContent = "Card storage isn't set up yet";
      else log.textContent = "Couldn't add " + name + ": no connection. Try again.";
    });
  }

  function logLine(deck, text) {
    var hostId = deck === "smoothie" ? "deck-log-smoothie" : "deck-log-food";
    var host = root.document.getElementById(hostId);
    var line = el("p", "deck-log-line", text);
    if (host) host.prepend(line);
    return line;
  }

  function fallbackId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
      var n = Math.random() * 16 | 0;
      return (ch === "x" ? n : (n & 0x3 | 0x8)).toString(16);
    });
  }

  function uploadFiles(files, deck) {
    var list = Array.prototype.slice.call(files || []);
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () { return uploadOne(file, deck); });
    });
    return chain;
  }

  function patchCard(card, fields) {
    var next = {
      name: fields.name,
      veg: fields.veg,
      fruit: fields.fruit,
      hidden: !!fields.hidden
    };
    if (!baseUrl() || !online()) return Promise.reject(new Error("offline"));
    return root.fetch(baseUrl() + "/rest/v1/nexus_cards?id=eq." + encodeURIComponent(card.id), {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(next)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (text) {
        throw new Error(setupFailure(res.status, text) ? "setup" : "save");
      });
      card.name = next.name;
      card.veg = next.veg;
      card.fruit = next.fruit;
      card.hidden = next.hidden;
      writeCards();
      paintAll();
    });
  }

  function saveEdit(form) {
    var id = form.getAttribute("data-deck-edit-form");
    var card = cardById(state.cards, id);
    var error = form.querySelector("[data-deck-error]");
    if (!card) return;
    var name = stripName(form.elements.name.value).slice(0, 80).trim();
    if (!name) {
      if (error) error.textContent = "Name is empty";
      return;
    }
    var fields = {
      name: name,
      veg: clampPortion(form.elements.veg.value),
      fruit: clampPortion(form.elements.fruit.value)
    };
    patchCard(card, fields).then(function () {
      state.card.editing = false;
      paintCard();
    }).catch(function () {
      if (error) error.textContent = "Couldn't add " + card.name + ": no connection. Try again.";
    });
  }

  function hideCard(card) {
    var ok = root.confirm ? root.confirm("Remove " + (card.name || "card") + "? Meals using it will show empty.") : true;
    if (!ok) return;
    patchCard(card, { name: card.name, veg: card.veg, fruit: card.fruit, hidden: true }).then(function () {
      closeOverlays();
      paintAll();
    }).catch(function () {
      showToast("Couldn't add " + (card.name || "card") + ": no connection. Try again.");
    });
  }

  function copyToast(result, mode) {
    var n = result.rows.length;
    var days = n + " days";
    if (mode === "overwrite") return "Copied to " + days + ", " + result.replaced + " replaced";
    return "Copied to " + days + ", " + result.skipped + " skipped (already full)";
  }

  function runCopy() {
    var copy = state.copy;
    if (!copy) return Promise.resolve();
    var days = Object.keys(copy.days);
    if (!days.length) return Promise.resolve();
    return loadSlots().then(function () {
      var map = {};
      state.cards.forEach(function (card) { map[card.id] = card; });
      var result = planCopy(state.slots, {
        date: copy.date,
        food_id: copy.food_id,
        smoothie_id: copy.smoothie_id
      }, days, copy.targetSlot, copy.mode, map);
      if (copy.mode === "overwrite" && result.replaced > 0) {
        var confirmed = root.confirm ? root.confirm("Replace " + result.replaced + " meals? This can't be undone.") : true;
        if (!confirmed) return;
      }
      return saveSlots(result.rows).then(function (saved) {
        if (saved.ok) showToast(copyToast(result, copy.mode));
        closeOverlays();
        state.copy = null;
        paintAll();
      });
    });
  }

  function shiftMonth(delta) {
    state.month = Math.min(12, Math.max(1, state.month + delta));
    state.monthSet = true;
    renderHubMonth();
  }

  function onClick(event) {
    var target = event.target.closest("[data-deck-close], [data-deck-pick], [data-deck-view], [data-deck-open], [data-deck-copy], [data-deck-toggle], [data-deck-save], [data-deck-clear], [data-deck-edit], [data-deck-hide], [data-deck-copy-month], [data-deck-day], [data-deck-chip], [data-deck-mode], [data-deck-copy-go], [data-deck-step], [data-deck-cancel], #hub-month-prev, #hub-month-next");
    if (!target) return;
    if (target.id === "hub-month-prev") { shiftMonth(-1); return; }
    if (target.id === "hub-month-next") { shiftMonth(1); return; }
    if (target.hasAttribute("data-deck-step")) {
      var form = target.closest("form");
      var field = target.getAttribute("data-deck-step");
      var input = form && form.elements[field];
      if (!input) return;
      var next = stepPortion(input.value, Number(target.getAttribute("data-deck-dir")) || 1);
      input.value = String(next);
      var read = form.querySelector('[data-deck-portion="' + field + '"]');
      if (read) read.textContent = formatPortions(next);
      var minus = form.querySelector('[data-deck-step="' + field + '"][data-deck-dir="-1"]');
      var plus = form.querySelector('[data-deck-step="' + field + '"][data-deck-dir="1"]');
      if (minus) minus.disabled = next <= 0;
      if (plus) plus.disabled = next >= 10;
      return;
    }
    if (target.hasAttribute("data-deck-cancel")) {
      if (state.card) state.card.editing = false;
      paintCard();
      return;
    }
    if (target.hasAttribute("data-deck-close")) {
      var which = target.getAttribute("data-deck-close");
      if (which === "copy") state.copy = null;
      closeOverlays();
      return;
    }
    if (target.hasAttribute("data-deck-pick")) { openPicker(target.getAttribute("data-deck-pick")); return; }
    if (target.hasAttribute("data-deck-view")) {
      openCard(target.getAttribute("data-deck-view"), target.getAttribute("data-deck-from") || "hub");
      return;
    }
    if (target.hasAttribute("data-deck-open")) { openCard(target.getAttribute("data-deck-open"), "deck"); return; }
    if (target.hasAttribute("data-deck-copy")) { openCopy(target.getAttribute("data-deck-copy")); return; }
    if (target.hasAttribute("data-deck-toggle") && state.picker) {
      var picked = reducePick(state.picker, target.getAttribute("data-deck-kind"), target.getAttribute("data-deck-toggle"));
      picked.date = state.picker.date;
      picked.slot = state.picker.slot;
      picked.had = state.picker.had;
      state.picker = picked;
      paintPicker();
      return;
    }
    if (target.hasAttribute("data-deck-save") && state.picker) {
      var pick = state.picker;
      saveSlot(pick.date, pick.slot, pick.food, pick.smoothie).then(function () {
        closeOverlays();
        paintAll();
      });
      return;
    }
    if (target.hasAttribute("data-deck-clear") && state.picker) {
      var clearing = state.picker;
      saveSlot(clearing.date, clearing.slot, null, null).then(function () {
        closeOverlays();
        paintAll();
      });
      return;
    }
    if (target.hasAttribute("data-deck-edit")) {
      state.card.editing = true;
      paintCard();
      return;
    }
    if (target.hasAttribute("data-deck-hide")) {
      var card = cardById(state.cards, target.getAttribute("data-deck-hide"));
      if (card) hideCard(card);
      return;
    }
    if (!state.copy) return;
    if (target.hasAttribute("data-deck-copy-month")) {
      state.copy.month = Math.min(12, Math.max(1, state.copy.month + (+target.getAttribute("data-deck-copy-month") || 0)));
      paintCopy();
      return;
    }
    if (target.hasAttribute("data-deck-day")) {
      var day = target.getAttribute("data-deck-day");
      if (day === state.copy.date) return;
      if (state.copy.days[day]) delete state.copy.days[day];
      else state.copy.days[day] = true;
      paintCopy();
      return;
    }
    if (target.hasAttribute("data-deck-chip")) {
      state.copy.targetSlot = target.getAttribute("data-deck-chip");
      paintCopy();
      return;
    }
    if (target.hasAttribute("data-deck-mode")) {
      state.copy.mode = target.getAttribute("data-deck-mode");
      paintCopy();
      return;
    }
    if (target.hasAttribute("data-deck-copy-go")) runCopy();
  }

  function onSubmit(event) {
    var form = event.target.closest("[data-deck-edit-form]");
    if (!form) return;
    event.preventDefault();
    saveEdit(form);
  }

  function onKey(event) {
    if (event.key !== "Escape" || !root.document) return;
    var open = ["deck-card", "deck-picker", "deck-copy"].some(function (id) {
      var node = root.document.getElementById(id);
      return node && !node.hidden;
    });
    if (!open) return;
    event.preventDefault();
    event.stopPropagation();
    state.copy = null;
    closeOverlays();
  }

  function onFiles(event) {
    var input = event.target;
    if (!input || input.id !== "deck-file") return;
    var deck = state.addDeck === "smoothie" ? "smoothie" : "food";
    var files = input.files;
    uploadFiles(files, deck).then(function () { input.value = ""; });
  }

  function wire() {
    if (!root.document || wire.done) return;
    wire.done = true;
    root.document.addEventListener("click", onClick);
    root.document.addEventListener("submit", onSubmit);
    root.document.addEventListener("keydown", onKey, true);
    var card = root.document.getElementById("deck-card");
    if (card) {
      card.addEventListener("touchmove", function (event) {
        if (!card.hidden) event.preventDefault();
      }, { passive: false });
      card.addEventListener("gesturestart", function (event) {
        event.preventDefault();
      });
    }
    root.document.addEventListener("pointerdown", function (event) {
      var add = event.target.closest("[data-deck-add]");
      if (!add) return;
      state.addDeck = add.getAttribute("data-deck-add") === "smoothie" ? "smoothie" : "food";
    }, true);
    var input = root.document.getElementById("deck-file");
    if (input) input.addEventListener("change", onFiles);
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    if (root.NexusFood && root.NexusFood.testing && root.NexusFood.testing.read) {
      try { root.NexusFood.testing.read(); } catch (err) { /* locks stay as they are */ }
    }
    var result = clearOut();
    if (result && result.toast) showToast(result.toast);
    readCaches();
    wire();
    loadCards().then(loadSlots).then(retryDirty).then(paintAll);
  }

  root.NexusDeck = {
    tidyName: tidyName,
    clampPortion: clampPortion,
    stepPortion: stepPortion,
    portionsLine: portionsLine,
    fiveADay: fiveADay,
    formatPortions: formatPortions,
    reducePick: reducePick,
    slotHalf: slotHalf,
    planCopy: planCopy,
    slotRow: slotRow,
    clearOut: clearOut,
    resizeToWebp: resizeToWebp,
    uploadFiles: uploadFiles,
    loadCards: loadCards,
    loadSlots: loadSlots,
    saveSlot: saveSlot,
    retryDirty: retryDirty,
    renderDeck: renderDeck,
    renderHubMonth: renderHubMonth,
    openPicker: openPicker,
    openCard: openCard,
    openCopy: openCopy,
    saveSlots: saveSlots,
    cardSrc: cardSrc,
    boot: boot
  };
})(typeof window !== "undefined" ? window : globalThis);
