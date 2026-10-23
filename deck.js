/* Nexus v57 card decks. Training files stay untouched. */
(function (root) {
  var CARDS_KEY = "nexus_cards_cache_v2";
  var SLOTS_KEY = "nexus_slots_cache_v2";
  var DIRTY_KEY = "nexus_slots_dirty_v2";
  var STACKS_KEY = "nexus_stacks_cache_v2";
  var OLD_KEYS = ["nexus_cards_cache_v1", "nexus_slots_cache_v1", "nexus_slots_dirty_v1"];
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
    stacks: {},
    upload: null,
    draft: null,
    fileRole: "front",
    backTarget: "",
    armDate: "",
    armed: null,
    assignGen: 0,
    justAdded: "",
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
    (foods || []).forEach(function (card) {
      if (!card || card.hidden) return;
      foodSum += Number(card.veg) + Number(card.fruit);
    });
    var smoothieHit = (smoothies || []).some(function (card) {
      return card && !card.hidden && (Number(card.veg) + Number(card.fruit)) > 0;
    });
    return foodSum + (smoothieHit ? 1 : 0);
  }

  function parseLine(text) {
    var parts = String(text || "").split("|").map(function (part) { return part.trim(); });
    if (!parts[0]) return null;
    if (parts.length >= 4) {
      var deck = String(parts[1] || "").toUpperCase();
      if (deck !== "FOOD" && deck !== "SMOOTHIE" && deck !== "PORRIDGE") return null;
      return {
        name: parts[0].slice(0, 80),
        deck: deck,
        veg: clampPortion(parts[2]),
        fruit: clampPortion(parts[3])
      };
    }
    if (parts.length === 3) {
      return { name: parts[0].slice(0, 80), deck: null, veg: clampPortion(parts[1]), fruit: clampPortion(parts[2]) };
    }
    if (parts.length === 2) {
      var token = String(parts[1] || "").toUpperCase();
      if (token === "FOOD" || token === "SMOOTHIE" || token === "PORRIDGE") {
        return { name: parts[0].slice(0, 80), deck: null, veg: 0, fruit: 0 };
      }
      return { name: parts[0].slice(0, 80), deck: null, veg: 0, fruit: 0, toppings: parts[1] };
    }
    return { name: parts[0].slice(0, 80), deck: null, veg: 0, fruit: 0 };
  }

  function deckCode(which) {
    var name = String(which || "").toUpperCase();
    if (name === "SMOOTHIE" || name === "SMOOTHIES") return "SMOOTHIE";
    if (name === "PORRIDGE") return "PORRIDGE";
    return "FOOD";
  }

  function deckSlug(code) {
    if (code === "SMOOTHIE") return "smoothie";
    if (code === "PORRIDGE") return "porridge";
    return "food";
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
      smoothie: current && current.smoothie || null,
      porridge: current && current.porridge || null,
      stack: current && current.stack ? current.stack.slice() : [null, null, null]
    };
    if (deck === "smoothie") {
      var at = next.stack.indexOf(id);
      if (at !== -1) next.stack[at] = null;
      else {
        var empty = next.stack.indexOf(null);
        if (empty === -1) next.stack[2] = id;
        else next.stack[empty] = id;
      }
      next.smoothie = next.stack.filter(Boolean)[0] || null;
    } else if (deck === "porridge") {
      next.porridge = next.porridge === id ? null : id;
    } else {
      next.food = next.food === id ? null : id;
    }
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
    var id = which === "smoothie" ? (slot.s || slot.smoothie_id || null)
      : which === "porridge" ? (slot.p || slot.porridge_id || null)
      : (slot.f || slot.food_id || null);
    return visibleCard(cards, id);
  }

  function targetFull(slot, cards) {
    return !!(slotHalf(slot, cards, "food") || slotHalf(slot, cards, "porridge") || slotHalf(slot, cards, "smoothie"));
  }

  function slotRow(date, meal, foodId, porridgeId, stackId, now) {
    return {
      date_key: date,
      meal: meal,
      slot: meal,
      food_id: foodId || null,
      porridge_id: porridgeId || null,
      stack_id: stackId || null,
      updated_at: now || new Date().toISOString()
    };
  }

  function planCopy(slots, source, days, slot, mode, cards, now) {
    var srcDate = source && (source.date || source.date_key) || "";
    var foodId = source && source.food_id || null;
    var porridgeId = source && source.porridge_id || null;
    var stack = source && source.stack || null;
    var stamp = now || new Date().toISOString();
    var rows = [];
    var stacks = [];
    var skipped = 0;
    var replaced = 0;
    var seen = {};
    var hasStack = !!(stack && (stack.slot1 || stack.slot2 || stack.slot3));
    (days || []).forEach(function (date) {
      if (!date || date === srcDate || seen[date]) return;
      seen[date] = true;
      var current = slots && slots[date + "|" + slot];
      var full = targetFull(current, cards || {});
      if (mode !== "overwrite" && full) {
        skipped += 1;
        return;
      }
      if (mode === "overwrite" && full) replaced += 1;
      var stackId = hasStack ? "day-" + date : null;
      rows.push(slotRow(date, slot, foodId, porridgeId, stackId, stamp));
      if (hasStack) stacks.push({ id: stackId, slot1: stack.slot1 || null, slot2: stack.slot2 || null, slot3: stack.slot3 || null });
    });
    return { rows: rows, stacks: stacks, skipped: skipped, replaced: replaced };
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

  function showToast(message, onUndo) {
    if (!message || !root.document) return;
    var node = root.document.getElementById("deck-toast");
    if (!node) return;
    node.textContent = message;
    if (onUndo) {
      node.appendChild(root.document.createTextNode(" · "));
      var undo = el("button", "deck-undo", "Undo");
      undo.type = "button";
      undo.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onUndo();
      });
      node.appendChild(undo);
    }
    node.hidden = false;
    node.classList.remove("is-fading");
    clearTimeout(showToast.timer);
    clearTimeout(showToast.hide);
    showToast.timer = setTimeout(function () {
      node.classList.add("is-fading");
      showToast.hide = setTimeout(function () {
        node.hidden = true;
        node.classList.remove("is-fading");
      }, 400);
    }, 4000);
  }

  function api() {
    return root.NEXUS_API || {};
  }

  function cardSrc(card, kind) {
    if (!card) return "";
    if (kind === "back") return card.back_url || "";
    return card.front_url || "";
  }

  function dropOldCaches() {
    var store = root.localStorage;
    if (!store || typeof store.removeItem !== "function") return;
    OLD_KEYS.forEach(function (key) {
      try { store.removeItem(key); } catch (err) { /* cache drop is best-effort */ }
    });
  }

  function readCaches() {
    var store = root.localStorage;
    if (!store) return;
    dropOldCaches();
    var cards = parseJson(store.getItem(CARDS_KEY));
    state.cards = Array.isArray(cards) ? cards : [];
    var slots = parseJson(store.getItem(SLOTS_KEY));
    state.slots = slots && typeof slots === "object" && !Array.isArray(slots) ? slots : {};
    var dirty = parseJson(store.getItem(DIRTY_KEY));
    state.dirty = Array.isArray(dirty) ? dirty : [];
    var stacks = parseJson(store.getItem(STACKS_KEY));
    state.stacks = stacks && typeof stacks === "object" && !Array.isArray(stacks) ? stacks : {};
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

  function writeStacks() {
    try { root.localStorage.setItem(STACKS_KEY, JSON.stringify(state.stacks)); } catch (err) { /* cache is best-effort */ }
  }

  function markDirty(keys) {
    keys.forEach(function (key) {
      if (state.dirty.indexOf(key) === -1) state.dirty.push(key);
    });
    writeDirty();
  }

  function sortedCards(deck) {
    var code = deckCode(deck);
    return state.cards.filter(function (card) {
      return card && card.deck === code && !card.hidden;
    }).sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function dayStack(date) {
    return state.stacks["day-" + date] || null;
  }

  function stackCardId(date, meal) {
    var stack = dayStack(date);
    var stored = state.slots[date + "|" + meal];
    if (!stack && stored && stored.st && state.stacks[stored.st]) stack = state.stacks[stored.st];
    if (!stack) return null;
    if (meal === "lunch") return stack.slot2 || null;
    if (meal === "dinner") return stack.slot3 || null;
    return stack.slot1 || null;
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
    renderDeck("porridge");
    if (root.document && root.document.getElementById("hub-month-body")) renderHubMonth();
  }

  function portionsLine(card) {
    return "Veg " + formatPortions(card.veg || 0) + " · Fruit " + formatPortions(card.fruit || 0);
  }

  function renderDeck(deck) {
    if (!root.document) return;
    var which = deckSlug(deckCode(deck));
    var rootId = which === "smoothie" ? "deck-root-smoothie" : which === "porridge" ? "deck-root-porridge" : "deck-root-food";
    var host = root.document.getElementById(rootId);
    if (!host) return;
    var count = host.querySelector("[data-deck-count]");
    var grid = host.querySelector("[data-deck-grid]");
    var cards = sortedCards(which);
    var title = which === "smoothie" ? "All Smoothies" : which === "porridge" ? "Porridge" : "Food";
    if (count) count.textContent = title + " · " + cards.length + (cards.length === 1 ? " card" : " cards");
    renderPlan(which);
    paintBubble(host, which);
    if (!grid) return;
    grid.textContent = "";
    if (!cards.length && which === "smoothie") {
      grid.appendChild(el("p", "deck-empty", "No smoothie cards yet"));
    }
    cards.forEach(function (card) {
      var tile = el("button", "deck-tile" + (card.id === state.justAdded ? " is-just-added" : ""));
      tile.type = "button";
      tile.setAttribute("data-deck-open", card.id);
      var img = el("img", "deck-thumb");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      var src = cardSrc(card, "full");
      if (src) img.src = src;
      var name = el("span", "deck-tile-name", card.name || "Untitled card");
      var meta = el("span", "deck-tile-meta", portionsLine(card));
      tile.appendChild(img);
      tile.appendChild(name);
      tile.appendChild(meta);
      grid.appendChild(tile);
    });
  }

  function londonToday() {
    var key = "2027-01-01";
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());
      var y = "";
      var m = "";
      var d = "";
      parts.forEach(function (part) {
        if (part.type === "year") y = part.value;
        if (part.type === "month") m = part.value;
        if (part.type === "day") d = part.value;
      });
      key = y + "-" + m + "-" + d;
    } catch (err) { key = "2027-01-01"; }
    if (key < "2027-01-01" || key > "2027-12-31") return "2027-01-01";
    return key;
  }

  function planDate() {
    if (state.armDate >= "2027-01-01" && state.armDate <= "2027-12-31") return state.armDate;
    state.armDate = londonToday();
    return state.armDate;
  }

  function shiftDate(key, delta) {
    var parts = String(key || "2027-01-01").split("-");
    var next = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + delta));
    var out = next.getUTCFullYear() + "-" + String(next.getUTCMonth() + 1).padStart(2, "0") + "-" + String(next.getUTCDate()).padStart(2, "0");
    if (out < "2027-01-01") return "2027-01-01";
    if (out > "2027-12-31") return "2027-12-31";
    return out;
  }

  function stackField(meal) {
    if (meal === "lunch") return "slot2";
    if (meal === "dinner") return "slot3";
    return "slot1";
  }

  function planLabels(which) {
    return which === "smoothie" ? ["Morning", "Lunch", "Evening"] : ["Morning", "Lunch", "Dinner"];
  }

  function cardInSlot(which, date, meal) {
    if (which === "smoothie") {
      var stack = dayStack(date);
      return visibleCard(state.cards, stack && stack[stackField(meal)]);
    }
    var stored = state.slots[date + "|" + meal] || {};
    return visibleCard(state.cards, which === "porridge" ? stored.p : stored.f);
  }

  function renderPlan(which) {
    if (!root.document) return;
    var rootId = which === "smoothie" ? "deck-root-smoothie" : which === "porridge" ? "deck-root-porridge" : "deck-root-food";
    var host = root.document.getElementById(rootId);
    var mount = host && host.querySelector("[data-deck-plan]");
    if (!mount) return;
    var date = planDate();
    mount.textContent = "";
    var bar = el("div", "deck-daybar");
    var prev = el("button", "", "‹");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous day");
    prev.setAttribute("data-deck-day-shift", "-1");
    prev.disabled = date <= "2027-01-01";
    var next = el("button", "", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Next day");
    next.setAttribute("data-deck-day-shift", "1");
    next.disabled = date >= "2027-12-31";
    bar.appendChild(prev);
    bar.appendChild(el("span", "deck-day-label", prettyDate(date)));
    bar.appendChild(next);
    mount.appendChild(bar);
    var wrap = el("div", which === "smoothie" ? "deck-stack-build" : "deck-plan-slots");
    planLabels(which).forEach(function (label, index) {
      var meal = SLOT_ORDER[index];
      var card = cardInSlot(which, date, meal);
      var armed = state.armed && state.armed.deck === which && state.armed.date === date && state.armed.slot === meal;
      var btn = el("button", "deck-slot-mod" + (which === "smoothie" ? " deck-stack-slot" : "") + (card ? " is-on" : "") + (armed ? " is-armed" : ""));
      btn.type = "button";
      btn.setAttribute("data-deck-arm", which + "|" + date + "|" + meal);
      if (which === "smoothie") {
        btn.setAttribute("data-deck-stack-from", String(index));
        btn.setAttribute("data-stack-date", date);
      }
      btn.appendChild(el("span", "deck-stack-kicker", label));
      if (card) {
        var img = el("img", "deck-slot-thumb");
        img.alt = "";
        img.draggable = false;
        var src = cardSrc(card, "full");
        if (src) img.src = src;
        btn.appendChild(img);
        btn.appendChild(el("span", "deck-slot-name", card.name || "Untitled card"));
        var clear = el("span", "deck-slot-clear", "×");
        clear.setAttribute("role", "button");
        clear.setAttribute("aria-label", "Clear " + label);
        clear.setAttribute("data-deck-slot-clear", which + "|" + date + "|" + meal);
        btn.appendChild(clear);
      } else btn.appendChild(el("span", "deck-slot-name", "Empty"));
      wrap.appendChild(btn);
    });
    mount.appendChild(wrap);
  }

  function renderStackHost() {
    renderPlan("smoothie");
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
    var seen = {};
    SLOT_ORDER.forEach(function (slot) {
      var stored = state.slots[key + "|" + slot];
      var food = slotHalf(stored, state.cards, "food");
      var porridge = slotHalf(stored, state.cards, "porridge");
      if (food) foods.push(food);
      if (porridge) foods.push(porridge);
      var sid = stackCardId(key, slot);
      if (sid && !seen[sid]) {
        seen[sid] = true;
        var card = visibleCard(state.cards, sid);
        if (card) smoothies.push(card);
      }
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
    var stored = state.slots[key + "|" + slot] || { f: null, p: null, st: null };
    var food = slotHalf(stored, state.cards, "food");
    var porridge = slotHalf(stored, state.cards, "porridge");
    var stackId = stackCardId(key, slot);
    var stackCard = visibleCard(state.cards, stackId);
    var wrap = el("div", "deck-slot");
    wrap.appendChild(el("p", "deck-slot-label", SLOT_LABEL[slot]));
    if (!food && !porridge && !stackCard) {
      var add = el("button", "deck-slot-add", "+ Add");
      add.type = "button";
      add.setAttribute("data-deck-pick", key + "|" + slot);
      wrap.appendChild(add);
      return wrap;
    }
    if (food) wrap.appendChild(nameLine(food, key, slot));
    if (porridge) wrap.appendChild(nameLine(porridge, key, slot));
    if (stackCard) wrap.appendChild(nameLine(stackCard, key, slot, true));
    var copy = el("button", "deck-copy", "Copy");
    copy.type = "button";
    copy.setAttribute("data-deck-copy", key + "|" + slot);
    wrap.appendChild(copy);
    return wrap;
  }

  function nameLine(card, key, slot, cycle) {
    var line = el("div", "deck-slot-line");
    var name = el("button", "deck-slot-name", card.name || "Untitled card");
    name.type = "button";
    name.setAttribute("data-deck-pick", key + "|" + slot);
    var arrow = el("button", "deck-slot-arrow", "→");
    arrow.type = "button";
    arrow.setAttribute("aria-label", "Open " + (card.name || "card"));
    arrow.setAttribute("data-deck-view", card.id);
    arrow.setAttribute("data-deck-from", "hub");
    if (cycle) arrow.setAttribute("data-deck-cycle", key);
    line.appendChild(name);
    line.appendChild(arrow);
    return line;
  }

  function closeOverlays() {
    ["deck-picker", "deck-card", "deck-copy", "deck-upload"].forEach(function (id) {
      var node = root.document.getElementById(id);
      if (node) {
        node.hidden = true;
        node.textContent = "";
      }
    });
    state.picker = null;
    state.card = null;
    state.upload = null;
    clearChromeTimer();
    unwatchEdit();
    if (root.document && root.document.body) root.document.body.classList.remove("is-card-open");
  }

  function openPicker(key) {
    var parts = String(key || "").split("|");
    var date = parts[0];
    var slot = parts[1];
    if (!date || !SLOT_LABEL[slot]) return;
    var stored = state.slots[date + "|" + slot] || { f: null, p: null, st: null };
    var stack = dayStack(date) || { slot1: null, slot2: null, slot3: null };
    state.picker = {
      date: date,
      slot: slot,
      shift: false,
      food: visibleCard(state.cards, stored.f) ? stored.f : null,
      porridge: visibleCard(state.cards, stored.p) ? stored.p : null,
      smoothie: null,
      stack: [stack.slot1 || null, stack.slot2 || null, stack.slot3 || null],
      had: targetFull(stored, state.cards) || !!(stored.f || stored.p || stack.slot1 || stack.slot2 || stack.slot3)
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
    var pills = el("div", "deck-pills");
    var foodPill = el("button", "deck-pill" + (pick.shift ? "" : " is-on"), "Food · Smoothies");
    foodPill.type = "button";
    foodPill.setAttribute("data-deck-pill", "0");
    var porridgePill = el("button", "deck-pill" + (pick.shift ? " is-on" : ""), "Porridge");
    porridgePill.type = "button";
    porridgePill.setAttribute("data-deck-pill", "1");
    pills.appendChild(foodPill);
    pills.appendChild(porridgePill);
    host.appendChild(pills);
    var cols = el("div", "deck-picker-cols");
    var track = el("div", "deck-picker-track" + (pick.shift ? " is-shift" : ""));
    track.appendChild(pickerColumn("food", "Food", pick.food));
    track.appendChild(pickerColumn("smoothie", "Smoothies", null));
    track.appendChild(pickerColumn("porridge", "Porridge", pick.porridge));
    cols.appendChild(track);
    host.appendChild(cols);
    bindPickerTrack(cols, track);
    var bar = el("div", "deck-picker-bar");
    var chosen = (pick.food ? 1 : 0) + (pick.porridge ? 1 : 0) + (pick.stack || []).filter(Boolean).length;
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
      var empty = deck === "porridge" ? "No porridge cards yet. Add some in the Porridge Deck."
        : deck === "smoothie" ? "No smoothie cards yet"
        : "No food cards yet. Add some in the Food Deck.";
      list.appendChild(el("p", "deck-empty", empty));
    }
    cards.forEach(function (card) {
      var btn = el("button", "deck-pick");
      btn.type = "button";
      btn.setAttribute("data-deck-toggle", card.id);
      btn.setAttribute("data-deck-kind", deck);
      var stackAt = deck === "smoothie" && state.picker ? state.picker.stack.indexOf(card.id) : -1;
      var on = deck === "smoothie" ? stackAt !== -1 : selected === card.id;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("is-on");
      var img = el("img", "deck-pick-img");
      img.alt = "";
      img.draggable = false;
      img.loading = "lazy";
      img.decoding = "async";
      var src = cardSrc(card, "full");
      if (src) img.src = src;
      var name = el("span", "deck-pick-name", (stackAt >= 0 ? (stackAt + 1) + " · " : "") + (card.name || "Untitled card"));
      var tick = el("span", "deck-tick");
      tick.setAttribute("aria-hidden", "true");
      btn.appendChild(img);
      btn.appendChild(name);
      btn.appendChild(tick);
      if (deck !== "smoothie") {
        var flip = el("span", "deck-bar-btn" + (card.back_url ? "" : " is-muted"), card.back_url ? "Flip" : "No recipe back yet");
        flip.setAttribute("data-deck-peek", card.id);
        btn.appendChild(flip);
      }
      list.appendChild(btn);
    });
    col.appendChild(list);
    return col;
  }

  function bindPickerTrack(viewport, track) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dy = 0;
    var active = false;
    var pointerId = 0;
    var axis = "";
    var scrollEl = null;
    var scrollOrigin = 0;
    function basePx() {
      return state.picker && state.picker.shift ? -track.offsetWidth / 3 : 0;
    }
    function applyX(px, animate) {
      track.style.transition = animate ? "transform 220ms ease-out" : "none";
      track.style.transform = "translateX(" + px + "px)";
    }
    function setShift(shift) {
      var on = !!shift;
      if (state.picker) state.picker.shift = on;
      track.classList.toggle("is-shift", on);
      applyX(on ? -track.offsetWidth / 3 : 0, true);
      var pills = viewport.parentNode && viewport.parentNode.querySelectorAll("[data-deck-pill]");
      if (pills) {
        pills.forEach(function (pill) {
          pill.classList.toggle("is-on", pill.getAttribute("data-deck-pill") === (on ? "1" : "0"));
        });
      }
    }
    viewport.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      active = true;
      axis = "";
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      dy = 0;
      scrollEl = event.target && event.target.closest ? event.target.closest(".deck-picker-list") : null;
      scrollOrigin = scrollEl ? scrollEl.scrollTop : 0;
      try { viewport.setPointerCapture(event.pointerId); } catch (err) { /* capture is optional */ }
    });
    viewport.addEventListener("pointermove", function (event) {
      if (!active || event.pointerId !== pointerId) return;
      dx = event.clientX - startX;
      dy = event.clientY - startY;
      if (!axis && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!axis) axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (axis === "y") {
        event.preventDefault();
        if (scrollEl) scrollEl.scrollTop = scrollOrigin - dy;
        return;
      }
      event.preventDefault();
      applyX(basePx() + dx, false);
    }, { passive: false });
    function finish(event) {
      if (!active) return;
      if (event && event.pointerId != null && event.pointerId !== pointerId) return;
      active = false;
      try { viewport.releasePointerCapture(pointerId); } catch (err) { /* already released */ }
      if (axis !== "y" && Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy)) setShift(dx < 0);
      else applyX(basePx(), true);
      dx = 0;
      dy = 0;
      axis = "";
    }
    viewport.addEventListener("pointerup", finish);
    viewport.addEventListener("pointercancel", finish);
    viewport.addEventListener("wheel", function (event) {
      if (Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
      setShift(event.deltaX > 0);
    }, { passive: true });
  }

  function openCard(id, from) {
    var card = cardById(state.cards, id);
    if (!card || card.hidden) return;
    state.card = { id: id, from: from || "hub", editing: false, face: "front", cycle: null, cycleAt: 0 };
    paintCard();
  }

  function clearChromeTimer() {
    clearTimeout(clearChromeTimer.timer);
    clearChromeTimer.timer = 0;
  }

  function armChrome(host) {
    clearChromeTimer();
    if (!host || !state.card || state.card.editing) return;
    clearChromeTimer.timer = setTimeout(function () {
      if (!state.card || state.card.editing) return;
      host.classList.add("is-chrome-hidden");
    }, 4000);
  }

  function revealChrome(host) {
    if (!host || (state.card && state.card.editing)) return;
    host.classList.remove("is-chrome-hidden");
    armChrome(host);
  }

  function bindImageZoom(stage, img, hooks) {
    var view = { scale: 1, x: 0, y: 0 };
    var pointers = {};
    var pinch = null;
    var drag = null;
    var lastTap = 0;
    var tapX = 0;
    var tapY = 0;
    var tracking = false;
    var moved = false;
    var originX = 0;
    var originY = 0;
    hooks = hooks || {};
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
      if (!tracking) {
        tracking = true;
        moved = false;
        originX = event.clientX;
        originY = event.clientY;
        clearChromeTimer();
      }
      if (pts.length >= 2) {
        moved = true;
        pinch = { dist: span(pts[0], pts[1]), scale: view.scale };
        drag = null;
      } else {
        drag = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y };
      }
    });

    stage.addEventListener("pointermove", function (event) {
      if (!pointers[event.pointerId]) return;
      var prev = pointers[event.pointerId];
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      if (Math.hypot(event.clientX - prev.x, event.clientY - prev.y) > 8) moved = true;
      var pts = points();
      if (pts.length >= 2 && pinch) {
        moved = true;
        view.scale = Math.min(6, Math.max(1, pinch.scale * (span(pts[0], pts[1]) / pinch.dist)));
        if (view.scale === 1) { view.x = 0; view.y = 0; }
        else clampPan();
        apply();
        return;
      }
      if (!drag || pts.length !== 1) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 8) moved = true;
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
        drag = { x: pts[0].x, y: pts[0].y, ox: view.x, oy: view.y };
        return;
      }
      if (pts.length > 0) return;
      var wasTap = tracking && !moved && point;
      tracking = false;
      drag = null;
      if (wasTap) {
        var now = Date.now();
        if (now - lastTap < 320 && Math.hypot(point.x - tapX, point.y - tapY) < 36) {
          reset();
          lastTap = 0;
        } else {
          lastTap = now;
          tapX = point.x;
          tapY = point.y;
        }
        if (hooks.onTap) hooks.onTap();
        return;
      }
      if (view.scale <= 1 && point && Math.abs(point.x - originX) > 30 && Math.abs(point.x - originX) > Math.abs(point.y - originY) && hooks.onSwipe) {
        hooks.onSwipe(point.x < originX ? 1 : -1);
      }
      if (hooks.onGestureEnd) hooks.onGestureEnd();
    }

    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", function (event) {
      delete pointers[event.pointerId];
      pinch = null;
      drag = null;
      if (!points().length && tracking) {
        tracking = false;
        moved = true;
        if (hooks.onGestureEnd) hooks.onGestureEnd();
      }
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
      if (hooks.onGestureEnd) hooks.onGestureEnd();
    }, { passive: false });
    apply();
  }

  function placeEdit(form) {
    if (!form) return;
    var vv = root.visualViewport;
    var top = 60;
    if (vv) {
      form.style.top = (vv.offsetTop + top) + "px";
      form.style.maxHeight = Math.max(180, vv.height - top - 12) + "px";
    } else {
      form.style.top = top + "px";
    }
  }

  function unwatchEdit() {
    if (!unwatchEdit.fn || !root.visualViewport) {
      unwatchEdit.fn = null;
      return;
    }
    root.visualViewport.removeEventListener("resize", unwatchEdit.fn);
    root.visualViewport.removeEventListener("scroll", unwatchEdit.fn);
    unwatchEdit.fn = null;
  }

  function watchEdit(form) {
    unwatchEdit();
    placeEdit(form);
    if (!root.visualViewport) return;
    unwatchEdit.fn = function () { placeEdit(form); };
    root.visualViewport.addEventListener("resize", unwatchEdit.fn);
    root.visualViewport.addEventListener("scroll", unwatchEdit.fn);
  }

  function slideEditAway(then) {
    var form = root.document && root.document.querySelector("#deck-card .deck-edit");
    if (!form) { then(); return; }
    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      then();
    }
    form.addEventListener("transitionend", done);
    form.classList.remove("is-open");
    setTimeout(done, 340);
  }

  function activeViewCard() {
    var view = state.card;
    if (!view) return null;
    if (view.cycle && view.cycle.length) {
      var id = view.cycle[view.cycleAt] || view.cycle[0];
      return cardById(state.cards, id) || cardById(state.cards, view.id);
    }
    return cardById(state.cards, view.id);
  }

  function faceImage(card, face) {
    var img = el("img", "deck-card-img");
    img.alt = card.name || "";
    img.draggable = false;
    var src = face === "back" ? cardSrc(card, "back") : cardSrc(card, "full");
    if (src) img.src = src;
    return img;
  }

  function paintCard() {
    var host = root.document.getElementById("deck-card");
    var card = activeViewCard();
    if (!host || !card) return;
    host.hidden = false;
    host.textContent = "";
    if (root.document.body) root.document.body.classList.add("is-card-open");
    var stage = el("div", "deck-card-stage");
    var twoSided = card.deck !== "SMOOTHIE" && !(state.card.cycle && state.card.cycle.length);
    var img;
    if (twoSided) {
      var flip = el("div", "deck-flip" + (state.card.face === "back" ? " is-flipped" : ""));
      var inner = el("div", "deck-flip-inner");
      var front = el("div", "deck-flip-face is-front");
      var back = el("div", "deck-flip-face is-back");
      var frontImg = faceImage(card, "front");
      front.appendChild(frontImg);
      if (card.back_url) back.appendChild(faceImage(card, "back"));
      else {
        var empty = el("button", "deck-back-empty", "Upload back");
        empty.type = "button";
        empty.setAttribute("data-deck-back", card.id);
        back.appendChild(empty);
      }
      inner.appendChild(front);
      inner.appendChild(back);
      flip.appendChild(inner);
      stage.appendChild(flip);
      img = state.card.face === "back" && card.back_url ? back.querySelector("img") : frontImg;
    } else {
      img = faceImage(card, "front");
      stage.appendChild(img);
    }
    host.appendChild(stage);
    host.appendChild(topBar(card));
    if (img) {
      bindImageZoom(stage, img, {
        onTap: function () { revealChrome(host); },
        onGestureEnd: function () {
          if (!host.classList.contains("is-chrome-hidden")) armChrome(host);
        },
        onSwipe: function (dir) { stepCycle(dir); }
      });
    }
    host.classList.remove("is-chrome-hidden");
    if (state.card.editing && state.card.from === "deck") {
      var form = editSheet(card);
      host.appendChild(form);
      watchEdit(form);
      clearChromeTimer();
      root.requestAnimationFrame(function () {
        root.requestAnimationFrame(function () { form.classList.add("is-open"); });
      });
      return;
    }
    armChrome(host);
  }

  function stepCycle(dir) {
    var view = state.card;
    if (!view || !view.cycle || view.cycle.length < 2) return;
    view.cycleAt = (view.cycleAt + dir + view.cycle.length) % view.cycle.length;
    view.id = view.cycle[view.cycleAt];
    paintCard();
  }

  function topBar(card) {
    var bar = el("div", "deck-topbar");
    bar.setAttribute("data-deck-chrome", "1");
    var close = el("button", "deck-x deck-x-fixed", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-deck-close", "card");
    bar.appendChild(close);
    var copy = el("div", "deck-topbar-copy");
    var label = card.name || "Untitled card";
    if (state.card.cycle && state.card.cycle.length) {
      var names = ["Morning", "Lunch", "Evening"];
      label = (names[state.card.cycleAt] || "") + " · " + label;
    }
    copy.appendChild(el("p", "deck-card-name", label));
    copy.appendChild(el("p", "deck-card-meta", portionsLine(card)));
    if (state.card.cycle && state.card.cycle.length) {
      var dots = el("p", "deck-dots");
      state.card.cycle.forEach(function (id, index) {
        var dot = el("i", index === state.card.cycleAt ? "is-on" : "");
        dots.appendChild(dot);
      });
      copy.appendChild(dots);
    }
    bar.appendChild(copy);
    if (card.deck !== "SMOOTHIE" && !(state.card.cycle && state.card.cycle.length) && !state.card.editing) {
      var flip = el("button", "deck-bar-btn", card.back_url ? "Flip" : "Upload back");
      flip.type = "button";
      if (card.back_url) flip.setAttribute("data-deck-flip", card.id);
      else flip.setAttribute("data-deck-back", card.id);
      bar.appendChild(flip);
    }
    if (state.card.cycle && state.card.cycle.length > 1 && !state.card.editing) {
      var next = el("button", "deck-bar-btn", "→");
      next.type = "button";
      next.setAttribute("aria-label", "Next card");
      next.setAttribute("data-deck-next", "1");
      bar.appendChild(next);
    }
    if (state.card.from === "deck" && !state.card.editing) {
      var edit = el("button", "deck-bar-btn", "Edit");
      edit.type = "button";
      edit.setAttribute("data-deck-edit", card.id);
      var remove = el("button", "deck-bar-btn", "Remove");
      remove.type = "button";
      remove.setAttribute("data-deck-hide", card.id);
      bar.appendChild(edit);
      bar.appendChild(remove);
    }
    return bar;
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
    name.type = "text";
    name.name = "name";
    name.value = card.name || "";
    name.maxLength = 80;
    name.enterKeyHint = "done";
    name.setAttribute("autocomplete", "off");
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
      porridge_id: stored.p || null,
      stack: dayStack(parts[0])
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

  function cacheSlot(date, meal, foodId, porridgeId, stackId) {
    state.slots[date + "|" + meal] = { f: foodId || null, p: porridgeId || null, st: stackId || null };
    writeSlots();
  }

  function rememberRows(rows) {
    rows.forEach(function (row) {
      var meal = row.meal || row.slot;
      cacheSlot(row.date_key, meal, row.food_id, row.porridge_id, row.stack_id);
    });
  }

  function online() {
    return root.navigator ? root.navigator.onLine !== false : true;
  }

  function loadCards() {
    if (!api().base || !online() || typeof root.nexusFetch !== "function") return Promise.resolve(state.cards);
    return root.nexusFetch("/cards").then(function (rows) {
      if (Array.isArray(rows)) {
        state.cards = rows;
        writeCards();
      }
      return state.cards;
    }).catch(function () { return state.cards; });
  }

  function loadStacks() {
    if (!api().base || !online() || typeof root.nexusFetch !== "function") return Promise.resolve(state.stacks);
    return root.nexusFetch("/stacks").then(function (rows) {
      var next = {};
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row && row.id) next[row.id] = row;
        });
      }
      state.stacks = next;
      writeStacks();
      return state.stacks;
    }).catch(function () { return state.stacks; });
  }

  function loadSlots() {
    if (!api().base || !online() || typeof root.nexusFetch !== "function") return Promise.resolve(state.slots);
    var from = "2027-01-01";
    var to = "2027-12-31";
    var dirtySnapshot = {};
    state.dirty.forEach(function (key) { dirtySnapshot[key] = state.slots[key]; });
    return root.nexusFetch("/slots?from=" + from + "&to=" + to).then(function (rows) {
      if (!Array.isArray(rows)) return state.slots;
      var next = {};
      rows.forEach(function (row) {
        var meal = row.meal || row.slot;
        next[row.date_key + "|" + meal] = { f: row.food_id || null, p: row.porridge_id || null, st: row.stack_id || null };
      });
      Object.keys(dirtySnapshot).forEach(function (key) {
        if (dirtySnapshot[key]) next[key] = dirtySnapshot[key];
      });
      state.slots = next;
      writeSlots();
      return state.slots;
    }).catch(function () { return state.slots; });
  }

  function upsertSlots(rows) {
    if (!api().base || !online() || typeof root.nexusFetch !== "function") return Promise.reject(new Error("offline"));
    var chain = Promise.resolve();
    rows.forEach(function (row) {
      var meal = row.meal || row.slot;
      chain = chain.then(function () {
        return root.nexusFetch("/slots/" + row.date_key + "/" + meal, {
          method: "PUT",
          body: { food_id: row.food_id || null, porridge_id: row.porridge_id || null, stack_id: row.stack_id || null }
        });
      });
    });
    return chain.then(function () { return true; });
  }

  function saveStackRow(stack) {
    if (!stack || !stack.id) return Promise.resolve();
    state.stacks[stack.id] = stack;
    writeStacks();
    if (!api().base || typeof root.nexusFetch !== "function") return Promise.resolve();
    return root.nexusFetch("/stacks/" + encodeURIComponent(stack.id), {
      method: "PUT",
      body: { slot1: stack.slot1 || null, slot2: stack.slot2 || null, slot3: stack.slot3 || null }
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

  function saveSlot(date, slot, foodId, porridgeId, stackId) {
    return saveSlots([slotRow(date, slot, foodId, porridgeId, stackId)]);
  }

  function retryDirty() {
    if (!state.dirty.length) return Promise.resolve();
    var rows = state.dirty.map(function (key) {
      var parts = key.split("|");
      var stored = state.slots[key] || {};
      return slotRow(parts[0], parts[1], stored.f || null, stored.p || null, stored.st || null);
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

  function prepareImage(file) {
    if (!file || file.size <= 10 * 1024 * 1024) return Promise.resolve(file);
    return root.createImageBitmap(file).then(function (bitmap) {
      var longSide = Math.max(bitmap.width, bitmap.height);
      return drawScaled(bitmap, longSide, "image/webp", 0.9).then(function (blob) {
        bitmap.close && bitmap.close();
        if (!blob) throw new Error("too-heavy");
        return blob;
      });
    });
  }

  function uploadBlob(blob, name) {
    if (typeof root.nexusFetch !== "function") return Promise.reject(new Error("offline"));
    var type = (blob && blob.type) || "image/jpeg";
    var path = "/upload" + (name ? "?name=" + encodeURIComponent(name) : "");
    return root.nexusFetch(path, { method: "POST", raw: blob, contentType: type });
  }

  function failNote(text) {
    showToast(text);
  }

  function extOf(file) {
    var match = /\.([a-z0-9]+)$/i.exec((file && file.name) || "");
    var ext = match ? match[1].toLowerCase() : "";
    if (ext === "jpeg") return "jpg";
    if (ext === "jpg" || ext === "png" || ext === "webp" || ext === "gif") return ext;
    if (file && file.type === "image/webp") return "webp";
    if (file && file.type === "image/png") return "png";
    return "jpg";
  }

  function rememberCard(saved) {
    if (!saved) return;
    var at = -1;
    state.cards.forEach(function (card, index) { if (card.id === saved.id) at = index; });
    if (at >= 0) state.cards[at] = saved;
    else state.cards.unshift(saved);
    writeCards();
    renderDeck(deckSlug(saved.deck));
    paintAll();
  }

  function createCard(fields) {
    return root.nexusFetch("/cards", { method: "POST", body: fields }).then(function (saved) {
      rememberCard(saved);
      return saved;
    });
  }

  function uploadPair(front, back, deck, fields) {
    var code = deckCode(deck);
    var name = (fields && fields.name) || tidyName(front && front.name);
    if (!front || String(front.type || "").indexOf("image/") !== 0) {
      failNote("*" + ((front && front.name) || "file") + "* isn't an image. Pick a PNG, JPG or WebP card.");
      return Promise.resolve();
    }
    if (!api().base || typeof root.nexusFetch !== "function") {
      failNote("Card storage isn't set up yet");
      return Promise.resolve();
    }
    if (!online()) {
      failNote("Couldn't add " + name + ": no connection. Try again.");
      return Promise.resolve();
    }
    return prepareImage(front).then(function (frontBlob) {
      return uploadBlob(frontBlob, "front." + extOf(frontBlob.name ? frontBlob : front)).then(function (frontUp) {
        var backJob = back ? prepareImage(back).then(function (backBlob) {
          return uploadBlob(backBlob, "back." + extOf(back));
        }) : Promise.resolve(null);
        return backJob.then(function (backUp) {
          return createCard({
            deck: (fields && fields.deck) || code,
            name: name,
            front_key: frontUp.key,
            back_key: backUp ? backUp.key : null,
            veg: fields && fields.veg != null ? fields.veg : 0,
            fruit: fields && fields.fruit != null ? fields.fruit : 0,
            favourite: 0
          });
        });
      });
    }).catch(function (err) {
      failNote(uploadErrorText(err, name));
      return null;
    });
  }

  function uploadErrorText(err, name) {
    var message = err && err.message ? String(err.message) : "";
    var status = err && err.status;
    var typeError = !err || err instanceof TypeError || err.name === "TypeError" || /Failed to fetch|NetworkError|Load failed/i.test(message);
    if (typeError && !status) return "Couldn't add " + name + ": no connection. Try again.";
    if (status === 413) return /too big|12 MB/i.test(message) ? message : "Too big (12 MB)";
    if (status === 415) return /not an image/i.test(message) ? message : "Not an image";
    if (status && message) return message + " (" + status + ")";
    if (message) return message;
    return "Couldn't add " + name;
  }

  function uploadOne(file, deck) {
    return uploadPair(file, null, deck);
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
    if (!api().base || !online() || typeof root.nexusFetch !== "function") return Promise.reject(new Error("offline"));
    var body = {};
    if (fields.name != null) body.name = fields.name;
    if (fields.veg != null) body.veg = fields.veg;
    if (fields.fruit != null) body.fruit = fields.fruit;
    if (fields.back_key != null) body.back_key = fields.back_key;
    return root.nexusFetch("/cards/" + encodeURIComponent(card.id), {
      method: "PUT",
      body: body
    }).then(function (saved) {
      var next = saved || card;
      if (fields.name != null) card.name = next.name || fields.name;
      if (fields.veg != null) card.veg = next.veg != null ? next.veg : fields.veg;
      if (fields.fruit != null) card.fruit = next.fruit != null ? next.fruit : fields.fruit;
      if (saved) {
        card.front_url = saved.front_url || card.front_url;
        card.back_url = saved.back_url || card.back_url;
        card.back_key = saved.back_key || card.back_key;
      }
      writeCards();
      paintAll();
      return card;
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
      slideEditAway(function () {
        if (state.card) state.card.editing = false;
        paintCard();
      });
    }).catch(function () {
      if (error) error.textContent = "Couldn't add " + card.name + ": no connection. Try again.";
    });
  }

  function hideCard(card) {
    var ok = root.confirm ? root.confirm("Remove " + (card.name || "card") + "? Meals using it will show empty.") : true;
    if (!ok) return;
    if (!api().base || typeof root.nexusFetch !== "function") {
      showToast("Couldn't add " + (card.name || "card") + ": no connection. Try again.");
      return;
    }
    root.nexusFetch("/cards/" + encodeURIComponent(card.id), { method: "DELETE" }).then(function () {
      state.cards = state.cards.filter(function (item) { return item.id !== card.id; });
      writeCards();
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
        porridge_id: copy.porridge_id,
        stack: copy.stack
      }, days, copy.targetSlot, copy.mode, map);
      if (copy.mode === "overwrite" && result.replaced > 0) {
        var confirmed = root.confirm ? root.confirm("Replace " + result.replaced + " meals? This can't be undone.") : true;
        if (!confirmed) return;
      }
      var stacks = Promise.resolve();
      (result.stacks || []).forEach(function (stack) {
        stacks = stacks.then(function () { return saveStackRow(stack); });
      });
      return stacks.then(function () { return saveSlots(result.rows); }).then(function (saved) {
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

  function readSlotIds(date) {
    var stack = dayStack(date) || { id: "day-" + date, slot1: null, slot2: null, slot3: null };
    return {
      slot1: stack.slot1 || null,
      slot2: stack.slot2 || null,
      slot3: stack.slot3 || null,
      meals: SLOT_ORDER.map(function (meal) {
        var stored = state.slots[date + "|" + meal] || {};
        return { meal: meal, f: stored.f || null, p: stored.p || null, st: stored.st || null };
      })
    };
  }

  function writeLocalSlot(which, date, meal, cardId) {
    if (which === "smoothie") {
      var id = "day-" + date;
      var cur = dayStack(date) || { id: id, slot1: null, slot2: null, slot3: null };
      var stack = { id: id, slot1: cur.slot1 || null, slot2: cur.slot2 || null, slot3: cur.slot3 || null };
      stack[stackField(meal)] = cardId || null;
      var any = stack.slot1 || stack.slot2 || stack.slot3;
      if (any) state.stacks[id] = stack;
      else delete state.stacks[id];
      writeStacks();
      SLOT_ORDER.forEach(function (name) {
        var row = state.slots[date + "|" + name] || { f: null, p: null, st: null };
        state.slots[date + "|" + name] = { f: row.f || null, p: row.p || null, st: any ? id : null };
      });
      writeSlots();
      return;
    }
    var stored = state.slots[date + "|" + meal] || { f: null, p: null, st: null };
    var next = { f: stored.f || null, p: stored.p || null, st: stored.st || null };
    if (which === "porridge") next.p = cardId || null;
    else next.f = cardId || null;
    state.slots[date + "|" + meal] = next;
    writeSlots();
  }

  function persistAssign(which, date) {
    if (typeof root.nexusFetch !== "function") return Promise.reject(new Error("offline"));
    if (which === "smoothie") {
      var id = "day-" + date;
      var stack = state.stacks[id];
      var body = {
        slot1: stack && stack.slot1 || null,
        slot2: stack && stack.slot2 || null,
        slot3: stack && stack.slot3 || null
      };
      var empty = !body.slot1 && !body.slot2 && !body.slot3;
      var job = empty
        ? root.nexusFetch("/stacks/" + encodeURIComponent(id), { method: "DELETE" }).catch(function () { return null; })
        : root.nexusFetch("/stacks/" + encodeURIComponent(id), { method: "PUT", body: body });
      return job.then(function () {
        return upsertSlots(SLOT_ORDER.map(function (meal) {
          var cur = state.slots[date + "|" + meal] || {};
          return slotRow(date, meal, cur.f || null, cur.p || null, empty ? null : id);
        }));
      });
    }
    var meal = arguments[2];
    var stored = state.slots[date + "|" + meal] || {};
    return root.nexusFetch("/slots/" + date + "/" + meal, {
      method: "PUT",
      body: { food_id: stored.f || null, porridge_id: stored.p || null, stack_id: stored.st || null }
    });
  }

  function restoreAssign(snapshot) {
    state.assignGen += 1;
    if (snapshot.deck === "smoothie") {
      var id = "day-" + snapshot.date;
      var any = snapshot.prev.slot1 || snapshot.prev.slot2 || snapshot.prev.slot3;
      if (any) state.stacks[id] = { id: id, slot1: snapshot.prev.slot1, slot2: snapshot.prev.slot2, slot3: snapshot.prev.slot3 };
      else delete state.stacks[id];
      writeStacks();
      snapshot.prev.meals.forEach(function (row) {
        state.slots[snapshot.date + "|" + row.meal] = { f: row.f, p: row.p, st: any ? id : null };
      });
      writeSlots();
    } else {
      var mealRow = null;
      snapshot.prev.meals.forEach(function (row) { if (row.meal === snapshot.slot) mealRow = row; });
      if (mealRow) {
        state.slots[snapshot.date + "|" + snapshot.slot] = { f: mealRow.f, p: mealRow.p, st: mealRow.st };
        writeSlots();
      }
    }
    state.armed = { deck: snapshot.deck, date: snapshot.date, slot: snapshot.slot };
    paintAll();
    var gen = state.assignGen;
    persistAssign(snapshot.deck, snapshot.date, snapshot.slot).then(function () {
      if (state.assignGen !== gen) return persistAssign(snapshot.deck, snapshot.date, snapshot.slot);
    }).catch(function () { /* local undo still stands */ });
  }

  function advanceArm(which, date, meal) {
    var start = SLOT_ORDER.indexOf(meal);
    var i;
    for (i = 1; i <= 3; i++) {
      var next = SLOT_ORDER[(start + i) % 3];
      if (!cardInSlot(which, date, next)) {
        state.armed = { deck: which, date: date, slot: next };
        return;
      }
    }
    state.armed = null;
  }

  function assignArmed(card) {
    var arm = state.armed;
    if (!arm || !card) return;
    if (deckSlug(card.deck) !== arm.deck) return;
    var prev = readSlotIds(arm.date);
    var snapshot = { deck: arm.deck, date: arm.date, slot: arm.slot, prev: prev };
    writeLocalSlot(arm.deck, arm.date, arm.slot, card.id);
    var label = planLabels(arm.deck)[SLOT_ORDER.indexOf(arm.slot)] || "slot";
    var gen = ++state.assignGen;
    advanceArm(arm.deck, arm.date, arm.slot);
    paintAll();
    showToast("Added to " + label, function () { restoreAssign(snapshot); });
    persistAssign(snapshot.deck, snapshot.date, snapshot.slot).then(function () {
      if (state.assignGen !== gen) return persistAssign(snapshot.deck, snapshot.date, snapshot.slot);
    }).catch(function () {
      if (state.assignGen !== gen) return;
      restoreAssign(snapshot);
      showToast("Saved on this phone");
    });
  }

  function clearArmedSlot(spec) {
    var parts = String(spec || "").split("|");
    var which = parts[0];
    var date = parts[1];
    var meal = parts[2];
    writeLocalSlot(which, date, meal, null);
    paintAll();
    persistAssign(which, date, meal).catch(function () {
      showToast("Saved on this phone · will sync");
    });
  }

  function onClick(event) {
    var target = event.target.closest("[data-deck-close], [data-deck-pick], [data-deck-view], [data-deck-open], [data-deck-copy], [data-deck-toggle], [data-deck-save], [data-deck-clear], [data-deck-edit], [data-deck-hide], [data-deck-copy-month], [data-deck-day], [data-deck-chip], [data-deck-mode], [data-deck-copy-go], [data-deck-step], [data-deck-cancel], [data-deck-flip], [data-deck-next], [data-deck-peek], [data-deck-back], [data-deck-choose-back], [data-deck-upload-save], [data-deck-upload-clear], [data-deck-face], [data-deck-swap], [data-deck-arm], [data-deck-slot-clear], [data-deck-day-shift], [data-deck-pill], #hub-month-prev, #hub-month-next");
    if (!target) {
      if (state.armed && event.target.closest("[data-os-panel]")) {
        state.armed = null;
        paintAll();
      }
      return;
    }
    if (target.id === "hub-month-prev") { shiftMonth(-1); return; }
    if (target.id === "hub-month-next") { shiftMonth(1); return; }
    if (target.hasAttribute("data-deck-slot-clear")) {
      event.preventDefault();
      event.stopPropagation();
      clearArmedSlot(target.getAttribute("data-deck-slot-clear"));
      return;
    }
    if (target.hasAttribute("data-deck-day-shift")) {
      state.armDate = shiftDate(planDate(), Number(target.getAttribute("data-deck-day-shift")) || 0);
      if (state.armed) state.armed.date = state.armDate;
      paintAll();
      return;
    }
    if (target.hasAttribute("data-deck-pill") && state.picker) {
      state.picker.shift = target.getAttribute("data-deck-pill") === "1";
      paintPicker();
      return;
    }
    if (target.hasAttribute("data-deck-face")) {
      var faceBits = target.getAttribute("data-deck-face").split("|");
      state.addDeck = faceBits[0] === "smoothies" ? "smoothie" : faceBits[0];
      state.fileRole = faceBits[1] === "back" ? "back" : "front";
      state.backTarget = "bubble";
      var faceInput = root.document.getElementById("deck-file");
      if (faceInput) {
        faceInput.multiple = state.fileRole !== "back";
        faceInput.click();
      }
      return;
    }
    if (target.hasAttribute("data-deck-swap") && state.draft && state.draft.front && state.draft.back) {
      var heldFile = state.draft.front;
      var heldUrl = state.draft.frontUrl;
      state.draft.front = state.draft.back;
      state.draft.frontUrl = state.draft.backUrl;
      state.draft.back = heldFile;
      state.draft.backUrl = heldUrl;
      paintAll();
      return;
    }
    if (target.hasAttribute("data-deck-upload-clear")) {
      clearDraft();
      paintAll();
      return;
    }
    if (target.hasAttribute("data-deck-arm")) {
      if (wire.suppressArm) { wire.suppressArm = false; return; }
      var armBits = target.getAttribute("data-deck-arm").split("|");
      var same = state.armed && state.armed.deck === armBits[0] && state.armed.date === armBits[1] && state.armed.slot === armBits[2];
      state.armed = same ? null : { deck: armBits[0], date: armBits[1], slot: armBits[2] };
      paintAll();
      return;
    }
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
      slideEditAway(function () {
        if (state.card) state.card.editing = false;
        paintCard();
      });
      return;
    }
    if (target.hasAttribute("data-deck-close")) {
      var which = target.getAttribute("data-deck-close");
      if (which === "copy") state.copy = null;
      closeOverlays();
      return;
    }
    if (target.hasAttribute("data-deck-pick")) { openPicker(target.getAttribute("data-deck-pick")); return; }
    if (target.hasAttribute("data-deck-flip") && state.card) {
      state.card.face = state.card.face === "back" ? "front" : "back";
      paintCard();
      return;
    }
    if (target.hasAttribute("data-deck-next")) { stepCycle(1); return; }
    if (target.hasAttribute("data-deck-peek")) {
      openCard(target.getAttribute("data-deck-peek"), "deck");
      if (state.card) {
        state.card.face = "back";
        paintCard();
      }
      return;
    }
    if (target.hasAttribute("data-deck-back") || target.hasAttribute("data-deck-choose-back")) {
      state.fileRole = "back";
      state.backTarget = "card";
      var fileInput = root.document.getElementById("deck-file");
      if (fileInput) {
        fileInput.multiple = false;
        fileInput.click();
      }
      return;
    }
    if (target.hasAttribute("data-deck-upload-save")) { commitUpload(); return; }
    if (target.hasAttribute("data-deck-view")) {
      openCard(target.getAttribute("data-deck-view"), target.getAttribute("data-deck-from") || "hub");
      var cycleDate = target.getAttribute("data-deck-cycle");
      if (cycleDate && state.card) {
        var cycleStack = dayStack(cycleDate);
        if (cycleStack) {
          state.card.cycle = [cycleStack.slot1, cycleStack.slot2, cycleStack.slot3].filter(Boolean);
          state.card.cycleAt = Math.max(0, state.card.cycle.indexOf(state.card.id));
          paintCard();
        }
      }
      return;
    }
    if (target.hasAttribute("data-deck-open")) {
      var opened = cardById(state.cards, target.getAttribute("data-deck-open"));
      if (state.armed && opened && deckSlug(opened.deck) === state.armed.deck) {
        assignArmed(opened);
        return;
      }
      openCard(target.getAttribute("data-deck-open"), "deck");
      return;
    }
    if (target.hasAttribute("data-deck-copy")) { openCopy(target.getAttribute("data-deck-copy")); return; }
    if (target.hasAttribute("data-deck-toggle") && state.picker) {
      var picked = reducePick(state.picker, target.getAttribute("data-deck-kind"), target.getAttribute("data-deck-toggle"));
      picked.date = state.picker.date;
      picked.slot = state.picker.slot;
      picked.had = state.picker.had;
      picked.shift = state.picker.shift;
      state.picker = picked;
      paintPicker();
      return;
    }
    if (target.hasAttribute("data-deck-save") && state.picker) {
      commitPicker(state.picker).then(function () {
        closeOverlays();
        paintAll();
      });
      return;
    }
    if (target.hasAttribute("data-deck-clear") && state.picker) {
      clearPicker(state.picker).then(function () {
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
    var open = ["deck-card", "deck-picker", "deck-copy", "deck-upload"].some(function (id) {
      var node = root.document.getElementById(id);
      return node && !node.hidden;
    });
    if (!open) {
      if (state.armed) {
        event.preventDefault();
        state.armed = null;
        paintAll();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    state.copy = null;
    closeOverlays();
  }

  function pairFiles(list) {
    var fronts = {};
    var backs = {};
    var loose = [];
    var paired = false;
    list.forEach(function (file) {
      var front = /^(.*)_FRONT\./i.exec(file.name || "");
      var back = /^(.*)_BACK\./i.exec(file.name || "");
      if (front) { fronts[front[1].toLowerCase()] = file; paired = true; }
      else if (back) { backs[back[1].toLowerCase()] = file; paired = true; }
      else loose.push(file);
    });
    var pairs = [];
    Object.keys(fronts).forEach(function (key) {
      pairs.push({ front: fronts[key], back: backs[key] || null });
      delete backs[key];
    });
    Object.keys(backs).forEach(function (key) { loose.push(backs[key]); });
    return { pairs: pairs, loose: loose, paired: paired };
  }

  function placeholderFor(code) {
    if (code === "SMOOTHIE") return "Name";
    if (code === "PORRIDGE") return "Name | toppings";
    return "Name | veg | fruit";
  }

  function revokeFace(draft, role) {
    var key = role + "Url";
    if (draft && draft[key] && root.URL && root.URL.revokeObjectURL) {
      try { root.URL.revokeObjectURL(draft[key]); } catch (err) { /* already revoked */ }
      draft[key] = "";
    }
  }

  function setFace(draft, role, file) {
    revokeFace(draft, role);
    draft[role] = file || null;
    draft[role + "Url"] = file && root.URL && root.URL.createObjectURL ? root.URL.createObjectURL(file) : "";
  }

  function clearDraft() {
    if (state.draft) {
      revokeFace(state.draft, "front");
      revokeFace(state.draft, "back");
    }
    state.draft = null;
  }

  function ensureDraft(deck) {
    var code = deckCode(deck);
    if (!state.draft || state.draft.deck !== code) {
      clearDraft();
      state.draft = { deck: code, front: null, back: null, line: "", frontUrl: "", backUrl: "", busy: false };
    }
    return state.draft;
  }

  function paintBubble(host, which) {
    var mount = host.querySelector("[data-deck-bubble]");
    if (!mount) return;
    var code = deckCode(which);
    var up = state.draft && state.draft.deck === code ? state.draft : null;
    mount.textContent = "";
    var bubble = el("div", "deck-bubble");
    var tiles = el("div", "deck-bubble-tiles" + (code === "SMOOTHIE" ? " is-single" : ""));
    tiles.appendChild(faceTile(which, "front", up));
    if (code !== "SMOOTHIE") tiles.appendChild(faceTile(which, "back", up));
    bubble.appendChild(tiles);
    if (up && up.front && up.back && code !== "SMOOTHIE") {
      var swap = el("button", "deck-swap", "⇄");
      swap.type = "button";
      swap.setAttribute("aria-label", "Swap front and back");
      swap.setAttribute("data-deck-swap", which);
      bubble.appendChild(swap);
    }
    var line = el("input", "deck-front-line");
    line.type = "text";
    line.value = up ? (up.line || "") : "";
    line.placeholder = placeholderFor(code);
    line.setAttribute("data-deck-line", which);
    line.setAttribute("aria-label", "Card name");
    bubble.appendChild(line);
    var row = el("div", "deck-bubble-actions");
    var clear = el("button", "deck-x", "×");
    clear.type = "button";
    clear.setAttribute("aria-label", "Clear");
    clear.setAttribute("data-deck-upload-clear", which);
    var save = el("button", "deck-save", up && up.busy ? "Saving…" : "Save");
    save.type = "button";
    save.disabled = !(up && up.front) || !!(up && up.busy);
    save.setAttribute("data-deck-upload-save", which);
    row.appendChild(clear);
    row.appendChild(save);
    bubble.appendChild(row);
    mount.appendChild(bubble);
  }

  function faceTile(which, role, up) {
    var btn = el("button", "deck-face");
    btn.type = "button";
    btn.setAttribute("data-deck-face", which + "|" + role);
    var file = up && up[role];
    var url = up && up[role + "Url"];
    if (file && url) {
      var img = el("img");
      img.alt = role === "front" ? "Front" : "Back";
      img.draggable = false;
      img.src = url;
      btn.appendChild(img);
    } else btn.appendChild(el("span", "deck-face-label", role === "front" ? "Front" : "Back"));
    return btn;
  }

  function fieldsFromLine(up) {
    var parsed = up.line ? parseLine(up.line) : null;
    var fields = { name: tidyName(up.front && up.front.name), deck: up.deck, veg: 0, fruit: 0 };
    if (!parsed) return fields;
    fields.name = parsed.name || fields.name;
    if (parsed.veg != null) fields.veg = parsed.veg;
    if (parsed.fruit != null) fields.fruit = parsed.fruit;
    if (up.deck === "PORRIDGE" && parsed.toppings) fields.name = (parsed.name + " · " + parsed.toppings).slice(0, 80);
    fields.deck = up.deck;
    return fields;
  }

  function paintUpload() {
    paintAll();
  }

  function beginUpload(file, deck, back) {
    if (!file || String(file.type || "").indexOf("image/") !== 0) {
      failNote("*" + ((file && file.name) || "file") + "* isn't an image. Pick a PNG, JPG or WebP card.");
      return;
    }
    var up = ensureDraft(deck);
    setFace(up, "front", file);
    if (back && deckCode(deck) !== "SMOOTHIE") setFace(up, "back", back);
    if (!up.line) up.line = tidyName(file.name);
    paintAll();
  }

  function commitUpload() {
    var up = state.draft;
    if (!up || !up.front || up.busy) return Promise.resolve();
    up.busy = true;
    paintAll();
    var fields = fieldsFromLine(up);
    var back = up.deck === "SMOOTHIE" ? null : up.back;
    return uploadPair(up.front, back, deckSlug(up.deck), fields).then(function (saved) {
      if (state.draft) state.draft.busy = false;
      if (!saved || !saved.id) {
        paintAll();
        return saved;
      }
      state.justAdded = saved.id;
      clearDraft();
      showToast("Added");
      paintAll();
      var added = saved.id;
      setTimeout(function () {
        if (state.justAdded === added) state.justAdded = "";
        if (!root.document) return;
        var node = root.document.querySelector(".deck-tile.is-just-added");
        if (node) node.classList.remove("is-just-added");
      }, 600);
      return saved;
    });
  }

  function attachBack(id, file) {
    var card = cardById(state.cards, id);
    if (!card || !file) return Promise.resolve();
    return prepareImage(file).then(function (blob) {
      return uploadBlob(blob, "back." + extOf(file));
    }).then(function (uploaded) {
      return patchCard(card, { back_key: uploaded.key });
    }).then(function () {
      if (state.card) paintCard();
    }).catch(function (err) {
      failNote(uploadErrorText(err, "the back"));
    });
  }

  function commitPicker(pick) {
    var slots = pick.stack || [null, null, null];
    var id = "day-" + pick.date;
    var has = slots.some(Boolean);
    var existed = !!state.stacks[id];
    var job = Promise.resolve();
    if (has || existed) {
      job = saveStackRow({ id: id, slot1: slots[0] || null, slot2: slots[1] || null, slot3: slots[2] || null }).then(function () {
        if (!has && typeof root.nexusFetch === "function") {
          return root.nexusFetch("/stacks/" + encodeURIComponent(id), { method: "DELETE" }).catch(function () {}).then(function () {
            delete state.stacks[id];
            writeStacks();
          });
        }
      });
    }
    return job.then(function () {
      var rows = SLOT_ORDER.map(function (meal) {
        var cur = state.slots[pick.date + "|" + meal] || {};
        return slotRow(
          pick.date,
          meal,
          meal === pick.slot ? pick.food : cur.f,
          meal === pick.slot ? pick.porridge : cur.p,
          has ? id : (cur.st || null)
        );
      });
      return saveSlots(rows);
    });
  }

  function clearPicker(pick) {
    var stack = dayStack(pick.date);
    var job = Promise.resolve();
    if (stack) {
      var key = pick.slot === "lunch" ? "slot2" : pick.slot === "dinner" ? "slot3" : "slot1";
      stack[key] = null;
      job = saveStackRow(stack);
    }
    return job.then(function () {
      var still = stack && (stack.slot1 || stack.slot2 || stack.slot3);
      return saveSlot(pick.date, pick.slot, null, null, still ? stack.id : null);
    });
  }

  function takePair(files) {
    var list = files.slice(0, 2);
    var front = null;
    var back = null;
    list.forEach(function (file) {
      if (/_FRONT\./i.test(file.name || "")) front = file;
      else if (/_BACK\./i.test(file.name || "")) back = file;
    });
    if (front && back) return [front, back];
    return list;
  }

  function onFiles(event) {
    var input = event.target;
    if (!input || input.id !== "deck-file") return;
    var files = Array.prototype.slice.call(input.files || []);
    input.value = "";
    input.multiple = true;
    if (state.fileRole === "back") {
      state.fileRole = "front";
      var backFile = files[0];
      if (state.backTarget === "card" && state.card) {
        state.backTarget = "";
        attachBack(state.card.id, backFile);
        return;
      }
      state.backTarget = "";
      var draft = ensureDraft(state.addDeck);
      setFace(draft, "back", backFile || null);
      paintAll();
      return;
    }
    if (!files.length) return;
    if (files.length >= 2 && deckCode(state.addDeck) !== "SMOOTHIE") {
      var pair = takePair(files);
      beginUpload(pair[0], state.addDeck, pair[1]);
      return;
    }
    beginUpload(files[0], state.addDeck);
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
      var raw = add.getAttribute("data-deck-add");
      state.addDeck = raw === "smoothie" ? "smoothie" : raw === "porridge" ? "porridge" : "food";
      state.fileRole = "front";
      state.backTarget = "bubble";
      var picker = root.document.getElementById("deck-file");
      if (picker) picker.multiple = true;
    }, true);
    root.document.addEventListener("input", function (event) {
      if (!event.target || !event.target.hasAttribute("data-deck-line")) return;
      var draft = ensureDraft(event.target.getAttribute("data-deck-line"));
      draft.line = event.target.value;
    });
    function endStackDrag(event) {
      if (!wire.stackDrag) return;
      if (event.pointerId != null && event.pointerId !== wire.stackDrag.pointerId) return;
      var from = wire.stackDrag;
      wire.stackDrag = null;
      if (from.el && from.pointerId != null) {
        try { from.el.releasePointerCapture(from.pointerId); } catch (err) { /* already released */ }
      }
      if (!from.moved) return;
      wire.suppressArm = true;
      setTimeout(function () { wire.suppressArm = false; }, 0);
      var point = root.document.elementFromPoint(event.clientX, event.clientY);
      var slot = point && point.closest ? point.closest("[data-deck-stack-from]") : null;
      if (!slot) return;
      var to = +slot.getAttribute("data-deck-stack-from");
      if (to === from.index) return;
      var stack = dayStack(from.date) || { id: "day-" + from.date, slot1: null, slot2: null, slot3: null };
      var keys = ["slot1", "slot2", "slot3"];
      var held = stack[keys[from.index]];
      stack[keys[from.index]] = stack[keys[to]];
      stack[keys[to]] = held;
      stack.id = "day-" + from.date;
      saveStackRow(stack).then(function () {
        var rows = SLOT_ORDER.map(function (meal) {
          var cur = state.slots[from.date + "|" + meal] || {};
          return slotRow(from.date, meal, cur.f, cur.p, stack.id);
        });
        return saveSlots(rows);
      }).then(paintAll);
    }
    root.document.addEventListener("pointermove", function (event) {
      if (!wire.stackDrag || wire.stackDrag.moved) return;
      if (event.pointerId !== wire.stackDrag.pointerId) return;
      if (Math.hypot(event.clientX - wire.stackDrag.x, event.clientY - wire.stackDrag.y) > 8) wire.stackDrag.moved = true;
    });
    root.document.addEventListener("pointerup", endStackDrag);
    root.document.addEventListener("pointercancel", endStackDrag);
    root.document.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest("[data-deck-slot-clear]")) return;
      var slot = event.target.closest("[data-deck-stack-from]");
      if (!slot) return;
      wire.stackDrag = {
        index: +slot.getAttribute("data-deck-stack-from"),
        date: slot.getAttribute("data-stack-date"),
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointerId: event.pointerId,
        el: slot
      };
      try { slot.setPointerCapture(event.pointerId); } catch (err) { /* capture is optional */ }
    });
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
    loadCards().then(loadStacks).then(loadSlots).then(retryDirty).then(paintAll);
  }

  root.NexusDeck = {
    tidyName: tidyName,
    clampPortion: clampPortion,
    stepPortion: stepPortion,
    portionsLine: portionsLine,
    fiveADay: fiveADay,
    parseLine: parseLine,
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
