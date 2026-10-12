/* Nexus food planner v38. Meals and smoothies share one store.
   Does not read relic_completions or training keys. */
(function (root) {
  "use strict";

  var KEY = "nexus_food_v1";
  var BACKUP = "nexus_food_backup_v22";
  var V22_KEYS = [
    "relic_food_meals_v22",
    "relic_food_cabinet_v22",
    "relic_food_hg_v22",
    "relic_food_final_v22",
    "relic_food_savelater_v22",
    "relic_food_shop_v22",
    "relic_food_flylog_v22",
    "relic_smoothie_meals_v22",
    "relic_smoothie_cabinet_v22",
    "relic_smoothie_hg_v22",
    "relic_smoothie_final_v22",
    "relic_smoothie_savelater_v22",
    "relic_smoothie_flylog_v22"
  ];
  var MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var SLOTS = [
    { key: "breakfast", flag: "breakfast", label: "Breakfast" },
    { key: "morning", flag: "smoothie", label: "Morning" },
    { key: "lunch", flag: "lunch", label: "Lunch" },
    { key: "evening", flag: "dinner", label: "Evening" }
  ];
  var BRAZIL_CITE = "Joe v38, 12 Oct 2026. Brazil nuts are 2 a day, beside the glass, not in the jug.";
  var cache = null;
  var ui = {
    door: "food",
    screen: "recipes",
    filter: "meal",
    query: "",
    month: "",
    sheet: null,
    draft: null,
    error: "",
    gap: "",
    toast: "",
    toastTimer: 0,
    showPrep: false
  };

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isEgg(text) {
    return /\beggs?\b/i.test(String(text || ""));
  }

  function todayKey() {
    if (ui._today) return ui._today;
    var search = "";
    try { search = root.location && root.location.search || ""; } catch (err) { search = ""; }
    var match = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(search);
    if (match) return match[1];
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (err2) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function monthOf(dateKey) { return String(dateKey || "").slice(0, 7); }

  function daysInMonth(key) {
    var parts = String(key).split("-");
    return new Date(Date.UTC(+parts[0], +parts[1], 0)).getUTCDate();
  }

  function dateList(key) {
    var parts = String(key).split("-");
    var year = +parts[0];
    var month = +parts[1];
    var list = [];
    var n = daysInMonth(key);
    var d;
    for (d = 1; d <= n; d++) {
      var dt = new Date(Date.UTC(year, month - 1, d));
      var wd = dt.getUTCDay();
      list.push({
        date: year + "-" + pad(month) + "-" + pad(d),
        wd: wd,
        mon0: (wd + 6) % 7,
        name: WD[wd],
        day: d,
        sunday: wd === 0
      });
    }
    return list;
  }

  function weeksOf(key) {
    var weeks = [];
    var row = [];
    dateList(key).forEach(function (day) {
      if (day.mon0 === 0 && row.length) {
        weeks.push(row);
        row = [];
      }
      row.push(day);
    });
    if (row.length) weeks.push(row);
    return weeks;
  }

  function weekLabel(week, key) {
    var month = MONTHS[+key.split("-")[1]];
    return week[0].day + "–" + week[week.length - 1].day + " " + month;
  }

  function storageGet(key) {
    try { return root.localStorage.getItem(key); } catch (err) { return null; }
  }

  function storageSet(key, value) {
    try { root.localStorage.setItem(key, value); } catch (err) { /* private mode */ }
  }

  function parseJson(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) { return null; }
  }

  function blankDay() {
    return { breakfast: "", morning: "", lunch: "", evening: "", why: {}, brazilExtra: 2 };
  }

  function defaultSlots() {
    return { breakfast: false, lunch: true, dinner: true, smoothie: true };
  }

  function blankMonth(key) {
    return {
      status: "draft",
      lockedAt: null,
      wasLocked: false,
      slots: defaultSlots(),
      days: {},
      ticks: {},
      prepTicks: {}
    };
  }

  function enabled(month) {
    var flags = month && month.slots || defaultSlots();
    return SLOTS.filter(function (slot) { return !!flags[slot.flag]; });
  }

  function recipeNuts(recipe) {
    var total = 0;
    if (!recipe) return 0;
    (recipe.ingredients || []).forEach(function (item) {
      if (item.brazilNuts) total += +item.brazilNuts || 0;
      else if (item.skuId === "brazil" || /brazil nut/i.test(item.name || "")) total += +item.qty || 1;
    });
    return total;
  }

  function dayNuts(store, month, day) {
    var fromCards = 0;
    if (!day) return { cards: 0, extra: 2, total: 2 };
    ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
      fromCards += recipeNuts(store.recipes[day[slot]]);
    });
    var extra = fromCards >= 2 ? 0 : 2 - fromCards;
    return { cards: fromCards, extra: extra, total: fromCards + extra };
  }

  function applyBrazil(store, month, day) {
    var nuts = dayNuts(store, month, day);
    day.brazilExtra = nuts.extra;
    return nuts;
  }

  function isSmoothie(recipe) {
    return !!(recipe && recipe.types && recipe.types.indexOf("smoothie") !== -1);
  }

  function allows(recipe, slotKey) {
    if (!recipe || recipe.hidden) return false;
    if (slotKey === "evening") {
      if (recipe.notDinner || isSmoothie(recipe)) return false;
      return recipe.types.indexOf("evening") !== -1 || recipe.types.indexOf("lunch") !== -1;
    }
    if (slotKey === "morning") return isSmoothie(recipe);
    if (slotKey === "lunch") return recipe.types.indexOf("lunch") !== -1 && !isSmoothie(recipe);
    if (slotKey === "breakfast") {
      return !isSmoothie(recipe) && (recipe.types.indexOf("breakfast") !== -1 || recipe.types.indexOf("lunch") !== -1);
    }
    return false;
  }

  function purposeOf(recipe) {
    if (!recipe) return "energy";
    if (recipe.purpose === "recovery" || recipe.purpose === "energy") return recipe.purpose;
    if (recipe.band === "restorative") return "recovery";
    var blob = (recipe.title + " " + (recipe.ingredients || []).map(function (item) { return item.name; }).join(" ")).toLowerCase();
    if (/cherry|spinach|recover/.test(blob)) return "recovery";
    return "energy";
  }

  function ingredientBlob(recipe) {
    return (recipe.ingredients || []).map(function (item) { return item.name; }).join(", ");
  }

  function catalogRecipes() {
    var recipes = {};
    function add(recipe) {
      if (!recipe || !recipe.id || recipes[recipe.id]) return;
      var blob = recipe.title + " " + (recipe.ingredients || []).map(function (item) { return item.name; }).join(" ");
      if (isEgg(blob)) return;
      recipes[recipe.id] = recipe;
    }
    var meals = root.RELIC_FOOD_MEALS;
    if (meals && meals.order) {
      meals.order.forEach(function (id) {
        var card = meals.present ? meals.present(id, 1) : meals.meals[id];
        if (!card) return;
        add({
          id: card.id,
          title: card.name,
          types: ["lunch", "evening"],
          kind: "meal",
          notDinner: false,
          purpose: "",
          ingredients: (card.ingredients || []).map(mapIngredient),
          method: (card.method || []).map(mapStep),
          tip: card.tip || "",
          seed: true,
          hidden: false,
          favourite: false,
          forward: {},
          band: "",
          source: "Sainsbury's meal card"
        });
      });
    }
    var extract = root.RELIC_FOOD_EXTRACTIONS;
    if (extract && extract.order) {
      extract.order.forEach(function (id) {
        var card = extract.present ? extract.present(id, 1) : extract.cards[id];
        if (!card) return;
        var recipe = {
          id: card.id,
          title: card.name,
          types: ["smoothie"],
          kind: "extraction",
          notDinner: true,
          purpose: "",
          ingredients: (card.ingredients || []).map(mapIngredient),
          method: (card.method || []).map(mapStep),
          tip: card.tip || "",
          seed: true,
          hidden: false,
          favourite: false,
          forward: {},
          band: card.band || "",
          source: "Sainsbury's smoothie card"
        };
        recipe.purpose = purposeOf(recipe);
        add(recipe);
      });
    }
    var pack = root.RELIC_FOOD_PACK001;
    if (pack && pack.meals) {
      Object.keys(pack.meals).forEach(function (id) {
        var card = pack.meals[id];
        if (!card || card.kind === "collection" || card.visualOnly) return;
        add({
          id: card.id,
          title: card.name,
          types: ["lunch", "evening"],
          kind: "meal",
          notDinner: false,
          purpose: "",
          ingredients: (card.ingredients || []).map(mapIngredient),
          method: (card.method || []).map(mapStep),
          tip: card.tip || "",
          seed: true,
          hidden: false,
          favourite: false,
          forward: card.forward || {},
          band: "",
          source: "Pack 001 card"
        });
      });
    }
    return recipes;
  }

  function mapIngredient(item) {
    var name = item.text || item.name || "";
    var qty = +item.qty || 1;
    var nuts = item.brazilNuts || 0;
    if (!nuts && (item.skuId === "brazil" || /brazil nut/i.test(name))) nuts = qty;
    return {
      name: name,
      qty: qty,
      unit: item.unit || "",
      multiple: item.multiple === 2 || item.multiple === 4 ? item.multiple : 1,
      skuId: item.skuId || "",
      brazilNuts: nuts
    };
  }

  function mapStep(step) {
    return { verb: step.verb || "", detail: step.detail || "" };
  }

  function fromV22(card, kind) {
    if (!card) return null;
    var title = card.title || card.name || "";
    if (/^AUDIT\b/i.test(title) || /^AUDIT/i.test(card.noteCode || "")) return null;
    var ingredientText = (card.ingredients || []).map(function (item) { return item.text || item.name || ""; }).join(" ");
    if (isEgg(title + " " + ingredientText)) return null;
    var tagline = card.tagline || "";
    var tip = card.tip || "";
    if (tagline === "Morning or lunch.") tagline = "";
    if (tip === "Morning or lunch only. Extractions aren't dinner.") tip = "";
    var types = kind === "extraction" ? ["smoothie"] : (card.types || ["lunch", "evening"]);
    var recipe = {
      id: card.cardId || card.id,
      title: title || "Untitled",
      types: types,
      kind: kind === "extraction" ? "extraction" : "meal",
      notDinner: kind === "extraction",
      purpose: card.purpose || "",
      ingredients: (card.ingredients || []).map(mapIngredient),
      method: (card.method || []).map(mapStep),
      tip: tip,
      seed: !!card.fresh || !!card.seed,
      hidden: false,
      favourite: false,
      forward: card.forward || {},
      band: card.band || "",
      source: kind === "extraction" ? "Saved smoothie card" : "Saved meal card"
    };
    if (!recipe.id) return null;
    if (recipe.kind === "extraction") recipe.purpose = purposeOf(recipe);
    return recipe;
  }

  function importPlacements(store, record, mapSlot, monthFilter) {
    if (!record) return;
    var months = record.months || {};
    Object.keys(months).forEach(function (key) {
      if (key === "2026-10") return;
      if (monthFilter && !monthFilter(key)) return;
      var bucket = months[key] && months[key].placements || {};
      var month = ensureMonth(store, key);
      Object.keys(bucket).forEach(function (date) {
        if (date.slice(0, 7) !== key) return;
        var row = bucket[date] || {};
        var day = ensureDay(month, date);
        Object.keys(mapSlot).forEach(function (from) {
          var to = mapSlot[from];
          if (row[from] && store.recipes[row[from]] && !day[to]) day[to] = row[from];
        });
      });
    });
  }

  function migrate() {
    var backup = {};
    var had = false;
    V22_KEYS.forEach(function (key) {
      backup[key] = storageGet(key);
      if (backup[key]) had = true;
    });
    if (had) storageSet(BACKUP, JSON.stringify(backup));
    var store = {
      schema: 1,
      updatedAt: new Date().toISOString(),
      notice: "",
      recipes: catalogRecipes(),
      months: {},
      templates: {},
      undo: [],
      view: { month: monthOf(todayKey()) || "2026-10" },
      migratedFrom: V22_KEYS.slice()
    };
    var foodMeals = parseJson(backup.relic_food_meals_v22);
    var smoothMeals = parseJson(backup.relic_smoothie_meals_v22);
    var droppedAudit = 0;
    function absorb(raw, kind) {
      var cards = raw && raw.cards || {};
      Object.keys(cards).forEach(function (id) {
        var card = cards[id];
        var title = card && (card.title || card.name) || "";
        if (/^AUDIT\b/i.test(title) || /^AUDIT/i.test((card && card.noteCode) || "")) {
          droppedAudit += 1;
          return;
        }
        var recipe = fromV22(card, kind);
        if (!recipe) return;
        if (store.recipes[recipe.id] && store.recipes[recipe.id].seed) recipe.seed = true;
        store.recipes[recipe.id] = recipe;
      });
    }
    absorb(foodMeals, "meal");
    absorb(smoothMeals, "extraction");
    function fav(raw) {
      ((raw && raw.order) || []).forEach(function (id) {
        if (store.recipes[id]) store.recipes[id].favourite = true;
      });
    }
    fav(parseJson(backup.relic_food_cabinet_v22));
    fav(parseJson(backup.relic_smoothie_cabinet_v22));
    var foodFinal = parseJson(backup.relic_food_final_v22);
    var foodHg = parseJson(backup.relic_food_hg_v22);
    var smoothFinal = parseJson(backup.relic_smoothie_final_v22);
    var smoothHg = parseJson(backup.relic_smoothie_hg_v22);
    importPlacements(store, foodHg, { lunch: "lunch", dinner: "evening", breakfast: "breakfast" });
    importPlacements(store, smoothHg, { morning: "morning" });
    importPlacements(store, foodFinal, { lunch: "lunch", dinner: "evening", breakfast: "breakfast" });
    importPlacements(store, smoothFinal, { morning: "morning" });
    if (store.months["2026-10"]) {
      store.months["2026-10"].days = {};
      store.months["2026-10"].ticks = {};
      store.months["2026-10"].status = "draft";
      store.months["2026-10"].lockedAt = null;
    }
    var kept = Object.keys(store.recipes).length;
    store.notice = "Your plans were moved. " + kept + " cards kept. October plan cleared." +
      (droppedAudit ? " " + droppedAudit + " AUDIT cards removed." : "");
    return store;
  }

  function read() {
    if (cache) return cache;
    var existing = parseJson(storageGet(KEY));
    if (existing && existing.schema === 1) {
      cache = existing;
      cache.recipes = cache.recipes || {};
      cache.months = cache.months || {};
      cache.templates = cache.templates || {};
      cache.undo = cache.undo || [];
      cache.view = cache.view || { month: monthOf(todayKey()) };
      return cache;
    }
    cache = migrate();
    save();
    return cache;
  }

  function save() {
    var store = cache || read();
    store.updatedAt = new Date().toISOString();
    storageSet(KEY, JSON.stringify(store));
    return store;
  }

  function ensureMonth(store, key) {
    if (!store.months[key]) store.months[key] = blankMonth(key);
    var month = store.months[key];
    month.slots = month.slots || defaultSlots();
    month.days = month.days || {};
    month.ticks = month.ticks || {};
    month.prepTicks = month.prepTicks || {};
    return month;
  }

  function ensureDay(month, date) {
    if (!month.days[date]) month.days[date] = blankDay();
    var day = month.days[date];
    day.why = day.why || {};
    if (day.brazilExtra == null) day.brazilExtra = 2;
    return day;
  }

  function pushUndo(label) {
    var store = read();
    store.undo.push({
      at: new Date().toISOString(),
      label: label,
      recipes: clone(store.recipes),
      months: clone(store.months),
      templates: clone(store.templates)
    });
    if (store.undo.length > 20) store.undo = store.undo.slice(-20);
  }

  function undo() {
    var store = read();
    var entry = store.undo.pop();
    if (!entry) return false;
    store.recipes = entry.recipes;
    store.months = entry.months;
    store.templates = entry.templates;
    save();
    ui.toast = "Undid " + entry.label;
    return true;
  }

  function usage(id) {
    var store = read();
    var hits = [];
    Object.keys(store.months).forEach(function (key) {
      var days = store.months[key].days || {};
      Object.keys(days).forEach(function (date) {
        var day = days[date];
        ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
          if (day[slot] === id) hits.push({ month: key, date: date, slot: slot });
        });
      });
    });
    return hits;
  }

  function currentMonth() {
    var store = read();
    if (!ui.month) ui.month = (store.view && store.view.month) || monthOf(todayKey());
    return ui.month;
  }

  function setMonth(key) {
    ui.month = key;
    read().view.month = key;
    save();
  }

  function shiftMonth(delta) {
    var key = currentMonth();
    var parts = key.split("-");
    var cursor = new Date(Date.UTC(+parts[0], +parts[1] - 1 + delta, 1));
    setMonth(cursor.getUTCFullYear() + "-" + pad(cursor.getUTCMonth() + 1));
  }

  function validate(key) {
    var store = read();
    var month = ensureMonth(store, key);
    var problems = [];
    dateList(key).forEach(function (info) {
      var day = ensureDay(month, info.date);
      var nuts = applyBrazil(store, month, day);
      if (nuts.total !== 2 || nuts.cards > 2) {
        problems.push({ date: info.date, slot: "brazil", reason: "Brazil nuts must be 2 a day (" + nuts.total + " here)." });
      }
      enabled(month).forEach(function (slot) {
        var id = day[slot.key];
        if (!id) {
          problems.push({ date: info.date, slot: slot.key, reason: info.name + " " + info.day + " " + slot.label + " is empty." });
          return;
        }
        var recipe = store.recipes[id];
        if (!recipe) {
          problems.push({ date: info.date, slot: slot.key, reason: "Missing card " + id });
          return;
        }
        if (slot.key === "evening" && (recipe.notDinner || isSmoothie(recipe))) {
          problems.push({ date: info.date, slot: slot.key, reason: "A smoothie cannot be the evening meal." });
        }
      });
    });
    return problems;
  }

  function gaps(key) {
    return validate(key).filter(function (item) { return item.slot !== "brazil" && /empty/.test(item.reason); });
  }

  function tickKey(date, slot) { return date + "|" + slot; }

  function setSlot(key, date, slot, id) {
    var store = read();
    var month = ensureMonth(store, key);
    var day = ensureDay(month, date);
    var previous = day[slot];
    if (previous === id) return { cleared: 0 };
    var recipe = id ? store.recipes[id] : null;
    if (id && !allows(recipe, slot)) return { error: "That card does not fit this slot." };
    var token = tickKey(date, slot);
    var cleared = 0;
    if (month.ticks[token] && previous !== id) {
      delete month.ticks[token];
      cleared = 1;
    }
    day[slot] = id || "";
    if (id) {
      day.why[slot] = whyFor(recipe, date, slot, store, month);
    } else if (day.why) {
      day.why[slot] = "";
    }
    applyBrazil(store, month, day);
    save();
    return { cleared: cleared };
  }

  function shortBits(recipe) {
    return (recipe.ingredients || []).map(function (item) { return item.name || ""; }).filter(function (name) {
      return name && !/after the strain|ashwagandha|lion's mane|spirulina|psyllium|shilajit/i.test(name);
    }).slice(0, 3).map(function (name) {
      return name.replace(/Sainsbury's( SO Organic)? /gi, "").split(",")[0];
    }).join(", ");
  }

  function whyFor(recipe, date, slot, store, month) {
    if (!recipe) return "";
    if (isSmoothie(recipe)) {
      var purpose = purposeOf(recipe);
      return purpose.charAt(0).toUpperCase() + purpose.slice(1) +
        " pairing. " + (shortBits(recipe) || recipe.title) +
        ". Card " + recipe.id + ". Source: " + (recipe.source || "smoothie card") + ".";
    }
    return recipe.title + " for " + slot + ". Card " + recipe.id + ". Source: " + (recipe.source || "meal card") + ".";
  }

  function candidates(store, slot) {
    return Object.keys(store.recipes).map(function (id) { return store.recipes[id]; }).filter(function (recipe) {
      return allows(recipe, slot);
    }).sort(function (a, b) {
      if (!!b.favourite - !!a.favourite) return b.favourite - a.favourite;
      return a.title < b.title ? -1 : 1;
    });
  }

  function autoOrganise(key) {
    pushUndo("Auto-organise");
    var store = read();
    var month = ensureMonth(store, key);
    var filled = 0;
    var index = 0;
    var prev = { morning: "", lunch: "", evening: "", breakfast: "" };
    dateList(key).forEach(function (info) {
      var day = ensureDay(month, info.date);
      var want = index % 2 === 0 ? "energy" : "recovery";
      enabled(month).forEach(function (slot) {
        if (day[slot.key]) {
          prev[slot.key] = day[slot.key];
          return;
        }
        var pool = candidates(store, slot.key);
        if (slot.key === "morning") {
          var matched = pool.filter(function (recipe) { return purposeOf(recipe) === want; });
          if (matched.length) pool = matched;
        }
        var usedToday = ["breakfast", "morning", "lunch", "evening"].map(function (name) { return day[name]; });
        var pick = null;
        var i;
        for (i = 0; i < pool.length; i++) {
          var recipe = pool[(index + i) % pool.length];
          if (recipe.id !== prev[slot.key] && usedToday.indexOf(recipe.id) === -1) { pick = recipe; break; }
        }
        if (!pick && pool.length) pick = pool[index % pool.length];
        if (!pick) return;
        day[slot.key] = pick.id;
        day.why[slot.key] = whyFor(pick, info.date, slot.key, store, month);
        if (slot.key === "morning") {
          day.why.morning += " " + (want === "energy" ? "Energy" : "Recovery") + " day, alternated from the day before.";
        }
        prev[slot.key] = pick.id;
        filled += 1;
      });
      applyBrazil(store, month, day);
      index += 1;
    });
    save();
    ui.error = "";
    ui.toast = "Auto-organise filled " + filled + " empty slots. Each line cites its card. Edit any of them.";
    return filled;
  }

  function clearRange(key, from, to) {
    pushUndo("Cleared " + from + " to " + to);
    var store = read();
    var month = ensureMonth(store, key);
    var n = 0;
    dateList(key).forEach(function (info) {
      if (info.date < from || info.date > to) return;
      var day = ensureDay(month, info.date);
      enabled(month).forEach(function (slot) {
        if (day[slot.key]) n += 1;
        day[slot.key] = "";
        if (day.why) day.why[slot.key] = "";
        delete month.ticks[tickKey(info.date, slot.key)];
      });
      applyBrazil(store, month, day);
    });
    save();
    ui.toast = "Cleared " + n + " slots.";
    return n;
  }

  function clearMonth(key) {
    var dates = dateList(key);
    return clearRange(key, dates[0].date, dates[dates.length - 1].date);
  }

  function repeatWeekday(key, date, slot) {
    var store = read();
    var month = ensureMonth(store, key);
    var source = (month.days[date] || {})[slot] || "";
    var wd = dateList(key).filter(function (info) { return info.date === date; })[0];
    if (!wd) return 0;
    pushUndo("Repeated " + wd.name);
    var count = 0;
    dateList(key).forEach(function (info) {
      if (info.wd !== wd.wd || info.date === date) return;
      setSlot(key, info.date, slot, source);
      count += 1;
    });
    ui.toast = "Repeated on " + count + " other " + wd.name + "s.";
    return count;
  }

  function lockMonth(key, confirmed) {
    var store = read();
    var month = ensureMonth(store, key);
    var problems = validate(key);
    var empty = problems.filter(function (item) { return item.slot !== "brazil"; });
    if (empty.length || problems.length) {
      ui.gap = (empty[0] || problems[0]).date + "|" + (empty[0] || problems[0]).slot;
      ui.error = (empty[0] || problems[0]).reason;
      return { ok: false, gaps: empty.length, problems: problems };
    }
    if (month.status === "locked" && !confirmed) {
      var live = tickDelta(store, month, key);
      return { ok: false, needsConfirm: true, kept: live.kept, cleared: live.cleared };
    }
    if (month.wasLocked && !confirmed) {
      var preview = tickDelta(store, month, key);
      return { ok: false, needsConfirm: true, kept: preview.kept, cleared: preview.cleared };
    }
    var delta = tickDelta(store, month, key);
    month.status = "locked";
    month.lockedAt = new Date().toISOString();
    month.wasLocked = false;
    save();
    ui.error = "";
    ui.gap = "";
    ui.toast = "Locked " + monthName(key) + ".";
    return { ok: true, kept: delta.kept, cleared: delta.cleared };
  }

  function tickDelta(store, month, key) {
    var kept = 0;
    var cleared = 0;
    Object.keys(month.ticks || {}).forEach(function (token) {
      var bits = token.split("|");
      var day = month.days[bits[0]];
      if (day && day[bits[1]]) kept += 1;
      else cleared += 1;
    });
    return { kept: kept, cleared: cleared };
  }

  function unlockMonth(key) {
    var store = read();
    var month = ensureMonth(store, key);
    month.status = "draft";
    month.wasLocked = true;
    save();
    ui.toast = "Unlocked " + monthName(key) + ". Ticks stay.";
    return true;
  }

  function toggleTick(date, slot) {
    var store = read();
    var key = monthOf(date);
    var month = ensureMonth(store, key);
    var token = tickKey(date, slot);
    if (month.ticks[token]) delete month.ticks[token];
    else month.ticks[token] = new Date().toISOString();
    save();
    return !!month.ticks[token];
  }

  function blankDraft(kind) {
    return {
      id: "",
      title: "",
      types: kind === "smoothie" ? ["smoothie"] : ["lunch", "evening"],
      kind: kind === "smoothie" ? "extraction" : "meal",
      notDinner: kind === "smoothie",
      purpose: kind === "smoothie" ? "energy" : "",
      ingredients: [{ name: "", qty: 1, unit: "", multiple: 1, skuId: "", brazilNuts: 0 }],
      method: [{ verb: "", detail: "" }],
      tip: "",
      seed: false,
      hidden: false,
      favourite: false,
      forward: {},
      band: "",
      source: "Card you wrote"
    };
  }

  function commitDraft(draft) {
    var title = String(draft.title || "").trim();
    if (!title) return { error: "Add a name before saving." };
    if (isEgg(title + " " + (draft.ingredients || []).map(function (item) { return item.name; }).join(" "))) {
      return { error: "Eggs are not used." };
    }
    if (recipeNuts(draft) > 2) return { error: "A card cannot carry more than 2 Brazil nuts." };
    var store = read();
    var id = draft.id || ("card-" + Date.now().toString(36));
    var previous = store.recipes[id];
    var recipe = {
      id: id,
      title: title,
      types: (draft.types && draft.types.length) ? draft.types.slice() : ["lunch"],
      kind: draft.types && draft.types.indexOf("smoothie") !== -1 ? "extraction" : "meal",
      notDinner: !!(draft.types && draft.types.indexOf("smoothie") !== -1),
      purpose: draft.purpose === "recovery" ? "recovery" : (draft.types && draft.types.indexOf("smoothie") !== -1 ? "energy" : ""),
      ingredients: (draft.ingredients || []).filter(function (item) { return String(item.name || "").trim(); }).map(mapIngredient),
      method: (draft.method || []).filter(function (step) { return step.verb || step.detail; }).map(mapStep),
      tip: draft.tip || "",
      seed: previous ? !!previous.seed : false,
      hidden: previous ? !!previous.hidden : false,
      favourite: previous ? !!previous.favourite : !!draft.favourite,
      forward: previous && previous.forward ? clone(previous.forward) : (draft.forward || {}),
      band: previous ? previous.band || "" : "",
      source: previous ? previous.source : "Card you wrote"
    };
    if (previous) {
      recipe.ingredients = recipe.ingredients.map(function (item, index) {
        var prior = previous.ingredients[index];
        if (prior && prior.skuId && !item.skuId) item.skuId = prior.skuId;
        return item;
      });
    }
    if (!previous) pushUndo("Added " + title);
    store.recipes[id] = recipe;
    save();
    ui.draft = null;
    ui.toast = "Saved " + title + ".";
    return { id: id };
  }

  function deleteRecipe(id) {
    var store = read();
    var recipe = store.recipes[id];
    if (!recipe) return { error: "Missing card." };
    if (recipe.seed) return { error: "Seed cards are hidden, not deleted." };
    pushUndo("Deleted " + recipe.title);
    var hits = usage(id);
    delete store.recipes[id];
    hits.forEach(function (hit) {
      var month = store.months[hit.month];
      if (month && month.days[hit.date]) month.days[hit.date][hit.slot] = "";
    });
    save();
    ui.toast = "Deleted " + recipe.title + ".";
    return { removed: hits.length };
  }

  function hideRecipe(id) {
    var store = read();
    var recipe = store.recipes[id];
    if (!recipe) return { error: "Missing card." };
    pushUndo("Hid " + recipe.title);
    recipe.hidden = !recipe.hidden;
    save();
    ui.toast = recipe.hidden ? "Hid " + recipe.title + "." : "Showing " + recipe.title + ".";
    return { hidden: recipe.hidden };
  }

  function saveTemplate(key, name) {
    var store = read();
    var month = ensureMonth(store, key);
    var label = String(name || "").trim() || (monthName(key) + " template");
    var pattern = {};
    dateList(key).forEach(function (info) {
      var day = month.days[info.date] || blankDay();
      if (!pattern[info.name]) {
        pattern[info.name] = {
          breakfast: day.breakfast || "",
          morning: day.morning || "",
          lunch: day.lunch || "",
          evening: day.evening || ""
        };
      }
    });
    var id = "tpl-" + Date.now().toString(36);
    store.templates[id] = {
      id: id,
      name: label,
      fromMonth: key,
      slots: clone(month.slots),
      weekdayPattern: pattern
    };
    save();
    ui.toast = "Saved template " + label + ".";
    return id;
  }

  function applyTemplate(id, key) {
    var store = read();
    var template = store.templates[id];
    if (!template) return { error: "Missing template." };
    pushUndo("Applied " + template.name);
    var month = ensureMonth(store, key);
    if (template.slots) month.slots = clone(template.slots);
    var cleared = 0;
    dateList(key).forEach(function (info) {
      var pattern = template.weekdayPattern[info.name] || {};
      var day = ensureDay(month, info.date);
      ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
        var token = tickKey(info.date, slot);
        if (month.ticks[token] && day[slot] !== (pattern[slot] || "")) {
          delete month.ticks[token];
          cleared += 1;
        }
        day[slot] = pattern[slot] || "";
        var recipe = store.recipes[day[slot]];
        day.why[slot] = recipe ? whyFor(recipe, info.date, slot, store, month) : "";
      });
      applyBrazil(store, month, day);
    });
    save();
    ui.toast = "Applied " + template.name + (cleared ? ". " + cleared + " tick cleared." : ".");
    return { cleared: cleared };
  }

  function renameTemplate(id, name) {
    var template = read().templates[id];
    if (!template) return { error: "Missing template." };
    template.name = String(name || "").trim() || template.name;
    save();
    return { name: template.name };
  }

  function deleteTemplate(id) {
    var store = read();
    if (!store.templates[id]) return { error: "Missing template." };
    delete store.templates[id];
    save();
    ui.toast = "Template deleted.";
    return { ok: true };
  }

  function monthName(key) {
    var parts = String(key).split("-");
    return MONTHS[+parts[1]] + " " + parts[0];
  }

  function prepFor(sunday) {
    var store = read();
    var start = sunday;
    var parts = sunday.split("-");
    var cursor = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + 1));
    var days = [];
    var i;
    for (i = 0; i < 7; i++) {
      var date = cursor.getUTCFullYear() + "-" + pad(cursor.getUTCMonth() + 1) + "-" + pad(cursor.getUTCDate());
      days.push(date);
      cursor = new Date(cursor.getTime() + 86400000);
    }
    var kits = 0;
    days.forEach(function (date) {
      var month = store.months[monthOf(date)];
      var day = month && month.days[date];
      if (day && day.morning) kits += 1;
    });
    return {
      from: days[0],
      to: days[days.length - 1],
      kits: kits,
      brazilTin: days.length * 2,
      lines: [
        "Bag " + kits + " smoothie kits",
        "Brazil nut tin: " + (days.length * 2) + ". " + BRAZIL_CITE
      ]
    };
  }

  function defaultDate(key) {
    var today = todayKey();
    var dates = dateList(key).map(function (info) { return info.date; });
    var future = dates.filter(function (date) { return date >= today; });
    return future[0] || dates[dates.length - 1];
  }

  function visibleRecipes() {
    var store = read();
    var q = ui.query.trim().toLowerCase();
    return Object.keys(store.recipes).map(function (id) { return store.recipes[id]; }).filter(function (recipe) {
      if (recipe.hidden) return false;
      if (ui.filter === "smoothie" && !isSmoothie(recipe)) return false;
      if (ui.filter === "meal" && isSmoothie(recipe)) return false;
      if (ui.filter === "favourite" && !recipe.favourite) return false;
      if (q && recipe.title.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.title < b.title ? -1 : 1; });
  }

  function paint() {
    bind();
    var board = root.document && root.document.getElementById("planner-board");
    if (!board) return;
    var open = ui.screen === "recipes" || ui.screen === "plan" || ui.screen === "today";
    board.hidden = !open;
    var training = root.document.getElementById("training-board");
    if (training) training.hidden = open;
    if (root.document.body) {
      root.document.body.classList.toggle("is-food", open);
      var note = root.document.querySelector(".storage-note");
      if (note) note.hidden = open;
    }
    root.document.querySelectorAll(".nav-row[data-food-room], .nav-row[data-smoothie-room]").forEach(function (row) {
      var food = row.getAttribute("data-food-room");
      var smooth = row.getAttribute("data-smoothie-room");
      var on = (ui.door === "food" && food === ui.screen) || (ui.door === "smoothies" && smooth === ui.screen);
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-pressed", on ? "true" : "false");
    });
    root.document.querySelectorAll("[data-planner-screen]").forEach(function (tab) {
      var on = tab.getAttribute("data-planner-screen") === ui.screen;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var rootEl = root.document.getElementById("planner-root");
    if (!rootEl) return;
    var html = "";
    var store = read();
    if (store.notice) {
      html += '<p class="planner-notice" role="status">' + esc(store.notice) +
        ' <button type="button" data-planner-act="dismiss-notice">OK</button></p>';
    }
    if (ui.error) html += '<p class="planner-error" role="alert">' + esc(ui.error) + "</p>";
    if (ui.screen === "recipes") html += recipesHtml(store);
    if (ui.screen === "plan") html += planHtml(store);
    if (ui.screen === "today") html += todayHtml(store);
    if (ui.sheet) html += sheetHtml(store);
    if (ui.toast) {
      html += '<p class="planner-undo" role="status">' + esc(ui.toast) +
        (store.undo.length ? ' <button type="button" data-planner-act="undo">Undo</button>' : "") + "</p>";
    }
    rootEl.innerHTML = html;
    var gapEl = ui.gap && root.document.getElementById("slot-" + ui.gap.replace("|", "-"));
    if (gapEl && gapEl.scrollIntoView) gapEl.scrollIntoView({ block: "center" });
  }

  function recipesHtml(store) {
    var chips = [
      ["meal", "Meals"],
      ["smoothie", "Smoothies"],
      ["favourite", "Favourites"],
      ["all", "All"]
    ];
    var html = '<div class="planner-bar"><h2 class="planner-title">Recipes</h2>' +
      '<button type="button" class="planner-primary" data-planner-act="new">New card</button></div>';
    html += '<div class="planner-chips">';
    chips.forEach(function (chip) {
      html += '<button type="button" class="planner-chip' + (ui.filter === chip[0] ? " is-active" : "") +
        '" data-planner-act="filter" data-filter="' + chip[0] + '" aria-pressed="' + (ui.filter === chip[0]) + '">' + chip[1] + "</button>";
    });
    html += '</div><label class="planner-search">Search<input type="search" data-planner-field="query" value="' + esc(ui.query) + '"></label>';
    if (ui.draft) html += editorHtml(ui.draft);
    visibleRecipes().forEach(function (recipe) {
      html += '<article class="planner-card"><button type="button" class="planner-card-open" data-planner-act="open-card" data-id="' + esc(recipe.id) + '">' +
        "<strong>" + esc(recipe.title) + "</strong><span>" + esc(isSmoothie(recipe) ? purposeOf(recipe) : "meal") + "</span></button>";
      if (ui.focusId === recipe.id && !ui.draft) html += detailHtml(recipe);
      html += "</article>";
    });
    if (!visibleRecipes().length) html += '<p class="planner-empty">No cards on this filter.</p>';
    return html;
  }

  function detailHtml(recipe) {
    var ingredients = (recipe.ingredients || []).map(function (item) {
      var mult = item.multiple > 1 ? item.multiple + "× " : "";
      return "<li>" + esc(mult + item.name) + "</li>";
    }).join("");
    var method = (recipe.method || []).map(function (step) {
      return "<li><strong>" + esc(step.verb) + "</strong> " + esc(step.detail) + "</li>";
    }).join("");
    return '<div class="planner-detail"><p>' + esc(recipe.tip || "") + "</p>" +
      "<h3>Ingredients</h3><ul>" + ingredients + "</ul><h3>Method</h3><ol>" + method + "</ol>" +
      '<p class="planner-why">Source: ' + esc(recipe.source || "card") + " · " + esc(recipe.id) + "</p>" +
      '<div class="planner-actions">' +
      '<button type="button" data-planner-act="add-plan" data-id="' + esc(recipe.id) + '">Add to plan</button>' +
      '<button type="button" data-planner-act="edit" data-id="' + esc(recipe.id) + '">Edit</button>' +
      '<button type="button" data-planner-act="duplicate" data-id="' + esc(recipe.id) + '">Duplicate</button>' +
      '<button type="button" data-planner-act="favourite" data-id="' + esc(recipe.id) + '">' + (recipe.favourite ? "Unfavourite" : "Favourite") + "</button>" +
      (recipe.seed
        ? '<button type="button" data-planner-act="hide" data-id="' + esc(recipe.id) + '">Hide</button>'
        : '<button type="button" data-planner-act="ask-delete" data-id="' + esc(recipe.id) + '">Delete</button>') +
      "</div></div>";
  }

  function editorHtml(draft) {
    var types = ["smoothie", "breakfast", "lunch", "evening"];
    var html = '<form class="planner-editor" data-planner-form="editor"><h3>' + (draft.id ? "Edit card" : "New card") + "</h3>" +
      '<label>Name<input name="title" placeholder="Card name" value="' + esc(draft.title) + '"></label>';
    html += '<fieldset><legend>Type</legend>';
    types.forEach(function (type) {
      var on = draft.types.indexOf(type) !== -1;
      html += '<label class="planner-check"><input type="checkbox" name="type" value="' + type + '"' + (on ? " checked" : "") + "> " + type + "</label>";
    });
    html += "</fieldset>";
    html += '<label>Smoothie purpose<select name="purpose"><option value="energy"' + (draft.purpose !== "recovery" ? " selected" : "") +
      '>Energy</option><option value="recovery"' + (draft.purpose === "recovery" ? " selected" : "") + ">Recovery</option></select></label>";
    html += "<h4>Ingredients</h4>";
    (draft.ingredients || []).forEach(function (item, index) {
      html += '<div class="planner-row">' +
        '<input name="ing-name" data-index="' + index + '" placeholder="Ingredient" value="' + esc(item.name) + '">' +
        '<input name="ing-qty" data-index="' + index + '" inputmode="decimal" aria-label="Quantity" value="' + esc(item.qty) + '">' +
        '<input name="ing-sku" data-index="' + index + '" type="hidden" value="' + esc(item.skuId || "") + '">' +
        '<label>Multiple<select name="ing-multiple" data-index="' + index + '" aria-label="Quantity multiple">' +
        [1, 2, 4].map(function (n) {
          return '<option value="' + n + '"' + (+item.multiple === n ? " selected" : "") + ">" + n + "×</option>";
        }).join("") + "</select></label></div>";
    });
    html += '<button type="button" data-planner-act="add-ing">Add ingredient</button>';
    html += "<h4>Method</h4>";
    (draft.method || []).forEach(function (step, index) {
      html += '<div class="planner-row"><input name="step-verb" data-index="' + index + '" placeholder="Verb" value="' + esc(step.verb) + '">' +
        '<input name="step-detail" data-index="' + index + '" placeholder="Detail" value="' + esc(step.detail) + '"></div>';
    });
    html += '<button type="button" data-planner-act="add-step">Add step</button>' +
      '<label>Tip<input name="tip" placeholder="Optional note" value="' + esc(draft.tip || "") + '"></label>' +
      '<div class="planner-actions"><button type="button" class="planner-primary" data-planner-act="save-card">Save</button>' +
      '<button type="button" data-planner-act="cancel-card">Cancel</button></div></form>';
    return html;
  }

  function planHtml(store) {
    var key = currentMonth();
    var month = ensureMonth(store, key);
    var empty = gaps(key);
    var lockLabel = empty.length ? (empty.length + " gaps") : (month.status === "locked" ? "Locked" : ("Lock " + monthName(key)));
    var html = '<div class="planner-bar"><button type="button" data-planner-act="month-prev" aria-label="Previous month">Prev</button>' +
      "<h2 class=\"planner-title\">" + esc(monthName(key)) + "</h2>" +
      '<button type="button" data-planner-act="month-next" aria-label="Next month">Next</button></div>';
    html += '<p class="planner-status">' + (month.status === "locked" ? "Locked" : "Draft") + "</p>";
    html += '<div class="planner-chips">';
    SLOTS.forEach(function (slot) {
      var on = !!month.slots[slot.flag];
      html += '<button type="button" class="planner-chip' + (on ? " is-active" : "") + '" data-planner-act="toggle-slot" data-flag="' +
        slot.flag + '" aria-pressed="' + on + '">' + slot.label + "</button>";
    });
    html += "</div>";
    html += '<div class="planner-actions"><button type="button" class="planner-primary" data-planner-act="auto">Auto-organise</button>' +
      '<button type="button" data-planner-act="templates">Templates</button>' +
      '<button type="button" data-planner-act="clear-month">Clear month</button></div>';
    if (month.status === "locked") {
      html += '<button type="button" data-planner-act="ask-unlock">Edit this month</button>';
    }
    weeksOf(key).forEach(function (week) {
      html += '<section class="planner-week"><div class="planner-week-head"><h3>' + esc(weekLabel(week, key)) + "</h3>" +
        '<button type="button" data-planner-act="clear-week" data-from="' + week[0].date + '" data-to="' + week[week.length - 1].date + '">Clear week</button></div>';
      week.forEach(function (info) {
        var day = ensureDay(month, info.date);
        var nuts = applyBrazil(store, month, day);
        html += '<article class="planner-day"><header><span>' + esc(info.name + " " + info.day) + "</span>" +
          (info.sunday ? '<span class="planner-prep">Prep day</span>' : "") + "</header>";
        enabled(month).forEach(function (slot) {
          var id = day[slot.key];
          var recipe = id && store.recipes[id];
          var marked = ui.gap === info.date + "|" + slot.key;
          html += '<button type="button" class="planner-slot' + (marked ? " is-gap" : "") + '" id="slot-' + info.date + "-" + slot.key +
            '" data-planner-act="swap" data-date="' + info.date + '" data-slot="' + slot.key + '">' +
            '<span class="planner-slot-k">' + slot.label + "</span>" +
            "<strong>" + esc(recipe ? recipe.title : "Empty") + "</strong>" +
            (day.why && day.why[slot.key] ? '<span class="planner-why">' + esc(day.why[slot.key]) + "</span>" : "") +
            "</button>";
        });
        html += '<p class="planner-brazil">Brazil nuts ×' + nuts.total + ". " + esc(BRAZIL_CITE) + "</p></article>";
      });
      html += "</section>";
    });
    html += '<button type="button" class="planner-lock" data-planner-act="lock">' + esc(lockLabel) + "</button>";
    return html;
  }

  function todayHtml(store) {
    var date = todayKey();
    var key = monthOf(date);
    var month = ensureMonth(store, key);
    var day = ensureDay(month, date);
    var info = dateList(key).filter(function (row) { return row.date === date; })[0];
    var html = '<div class="planner-bar"><button type="button" data-planner-act="day-prev" aria-label="Yesterday">Yesterday</button>' +
      "<h2 class=\"planner-title\">" + esc(info ? info.name + " " + info.day + " " + monthName(key) : date) + "</h2>" +
      '<button type="button" data-planner-act="day-next" aria-label="Tomorrow">Tomorrow</button></div>';
    enabled(month).forEach(function (slot) {
      var id = day[slot.key];
      var recipe = id && store.recipes[id];
      var done = !!month.ticks[tickKey(date, slot.key)];
      html += '<div class="planner-today"><div><span>' + slot.label + "</span><strong>" + esc(recipe ? recipe.title : "Empty") + "</strong>" +
        (day.why && day.why[slot.key] ? '<p class="planner-why">' + esc(day.why[slot.key]) + "</p>" : "") +
        "</div><button type=\"button\" data-planner-act=\"done\" data-date=\"" + date + "\" data-slot=\"" + slot.key + "\">" +
        (done ? "Done" : "Mark done") + "</button></div>";
    });
    var nuts = applyBrazil(store, month, day);
    html += '<p class="planner-brazil">Brazil nuts ×' + nuts.total + "</p>";
    if (info && info.sunday) ui.showPrep = true;
    html += '<button type="button" data-planner-act="toggle-prep">' + (ui.showPrep ? "Hide Sunday prep" : "Sunday prep") + "</button>";
    if (ui.showPrep) {
      var sunday = info && info.sunday ? date : nextSunday(date);
      var prep = prepFor(sunday);
      html += '<section class="planner-prep-list"><h3>Sunday prep ' + esc(prep.from) + " – " + esc(prep.to) + "</h3><ul>";
      prep.lines.forEach(function (line) { html += "<li>" + esc(line) + "</li>"; });
      html += "</ul></section>";
    }
    return html;
  }

  function nextSunday(date) {
    var parts = date.split("-");
    var cursor = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    while (cursor.getUTCDay() !== 0) cursor = new Date(cursor.getTime() + 86400000);
    return cursor.getUTCFullYear() + "-" + pad(cursor.getUTCMonth() + 1) + "-" + pad(cursor.getUTCDate());
  }

  function sheetHtml(store) {
    var sheet = ui.sheet;
    var html = '<div class="planner-sheet" role="dialog">';
    if (sheet.type === "swap") {
      var list = candidates(store, sheet.slot);
      html += "<h3>Choose " + esc(sheet.slot) + "</h3>";
      html += '<label class="planner-search">Search<input type="search" data-planner-field="sheet-query" value="' + esc(sheet.query || "") + '"></label>';
      var q = (sheet.query || "").toLowerCase();
      list.filter(function (recipe) { return !q || recipe.title.toLowerCase().indexOf(q) !== -1; }).forEach(function (recipe) {
        html += '<button type="button" data-planner-act="place" data-id="' + esc(recipe.id) + '">' + esc(recipe.title) +
          "<span>" + esc(isSmoothie(recipe) ? purposeOf(recipe) : "meal") + "</span></button>";
      });
      html += '<button type="button" data-planner-act="place" data-id="">Remove</button>';
      html += '<button type="button" data-planner-act="repeat">Repeat on every ' + esc(weekdayName(sheet.date)) + "</button>";
    } else if (sheet.type === "add") {
      var recipe = store.recipes[sheet.id];
      html += "<h3>Add " + esc(recipe ? recipe.title : "") + "</h3>";
      var key = currentMonth();
      html += '<label>Day<select data-planner-field="add-date">';
      dateList(key).forEach(function (info) {
        var selected = info.date === (sheet.date || defaultDate(key));
        html += '<option value="' + info.date + '"' + (selected ? " selected" : "") + ">" + esc(info.name + " " + info.day) + "</option>";
      });
      html += "</select></label>";
      html += '<div class="planner-actions">';
      enabled(ensureMonth(store, key)).forEach(function (slot) {
        if (!recipe || !allows(recipe, slot.key)) return;
        html += '<button type="button" data-planner-act="add-slot" data-slot="' + slot.key + '">' + slot.label + "</button>";
      });
      html += "</div>";
    } else if (sheet.type === "delete") {
      var victim = store.recipes[sheet.id];
      var count = usage(sheet.id).length;
      html += "<h3>Delete " + esc(victim ? victim.title : "") + "?</h3><p>It is used on " + count + " slots.</p>" +
        '<button type="button" data-planner-act="confirm-delete">Delete and clear those slots</button>';
    } else if (sheet.type === "relock") {
      html += "<h3>" + esc(monthName(sheet.month)) + " is locked.</h3><p>Replace it with this version? " +
        sheet.kept + " ticks will be kept, " + sheet.cleared + " will be cleared.</p>" +
        '<button type="button" data-planner-act="confirm-lock">Replace</button>';
    } else if (sheet.type === "unlock") {
      html += "<h3>Unlock " + esc(monthName(sheet.month)) + " to edit?</h3><p>Your ticks stay.</p>" +
        '<button type="button" data-planner-act="confirm-unlock">Unlock</button>';
    } else if (sheet.type === "templates") {
      html += "<h3>Templates</h3>" +
        '<label>Name<input data-planner-field="template-name" placeholder="October base" value="' + esc(sheet.name || "") + '"></label>' +
        '<button type="button" class="planner-primary" data-planner-act="save-template">Save this month as template</button>';
      Object.keys(store.templates).forEach(function (id) {
        var template = store.templates[id];
        html += '<article class="planner-card"><strong>' + esc(template.name) + "</strong>" +
          '<div class="planner-actions"><button type="button" data-planner-act="apply-template" data-id="' + esc(id) + '">Apply to this month</button>' +
          '<button type="button" data-planner-act="ask-rename" data-id="' + esc(id) + '">Rename</button>' +
          '<button type="button" data-planner-act="ask-delete-template" data-id="' + esc(id) + '">Delete</button></div></article>';
      });
    } else if (sheet.type === "rename") {
      html += '<h3>Rename template</h3><label>Name<input data-planner-field="rename" value="' + esc(sheet.name || "") + '"></label>' +
        '<button type="button" data-planner-act="confirm-rename">Save name</button>';
    } else if (sheet.type === "delete-template") {
      html += "<h3>Delete this template?</h3><button type=\"button\" data-planner-act=\"confirm-delete-template\">Delete template</button>";
    }
    html += '<button type="button" data-planner-act="close-sheet">Cancel</button></div>';
    return html;
  }

  function weekdayName(date) {
    var parts = date.split("-");
    return WD[new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2])).getUTCDay()];
  }

  function readEditor() {
    var form = root.document.querySelector("[data-planner-form='editor']");
    if (!form || !ui.draft) return ui.draft;
    var draft = ui.draft;
    draft.title = form.querySelector("[name='title']").value;
    draft.tip = form.querySelector("[name='tip']").value;
    draft.purpose = form.querySelector("[name='purpose']").value;
    draft.types = [];
    form.querySelectorAll("[name='type']").forEach(function (box) {
      if (box.checked) draft.types.push(box.value);
    });
    var names = form.querySelectorAll("[name='ing-name']");
    draft.ingredients = [];
    names.forEach(function (input) {
      var index = +input.getAttribute("data-index");
      var prior = ui.draft.ingredients[index] || {};
      draft.ingredients.push({
        name: input.value,
        qty: +form.querySelectorAll("[name='ing-qty']")[index].value || 1,
        unit: prior.unit || "",
        multiple: +form.querySelectorAll("[name='ing-multiple']")[index].value || 1,
        skuId: form.querySelectorAll("[name='ing-sku']")[index].value || prior.skuId || "",
        brazilNuts: prior.brazilNuts || 0
      });
    });
    draft.method = [];
    form.querySelectorAll("[name='step-verb']").forEach(function (input, index) {
      draft.method.push({
        verb: input.value,
        detail: form.querySelectorAll("[name='step-detail']")[index].value
      });
    });
    ui.draft = draft;
    return draft;
  }

  function onClick(event) {
    var button = event.target.closest("[data-planner-act], [data-planner-screen]");
    if (!button) return;
    var act = button.getAttribute("data-planner-act") || "";
    if (button.hasAttribute("data-planner-screen")) {
      ui.screen = button.getAttribute("data-planner-screen");
      ui.sheet = null;
      ui.toast = "";
      paint();
      return;
    }
    var store = read();
    if (act === "filter") { ui.filter = button.getAttribute("data-filter"); paint(); return; }
    if (act === "new") {
      ui.draft = blankDraft(ui.filter === "smoothie" || ui.door === "smoothies" ? "smoothie" : "meal");
      ui.focusId = "";
      paint();
      return;
    }
    if (act === "cancel-card") { ui.draft = null; paint(); return; }
    if (act === "save-card") {
      var saved = commitDraft(readEditor());
      if (saved.error) { ui.error = saved.error; paint(); return; }
      ui.error = "";
      ui.focusId = saved.id;
      paint();
      return;
    }
    if (act === "add-ing") { readEditor(); ui.draft.ingredients.push({ name: "", qty: 1, unit: "", multiple: 1, skuId: "", brazilNuts: 0 }); paint(); return; }
    if (act === "add-step") { readEditor(); ui.draft.method.push({ verb: "", detail: "" }); paint(); return; }
    if (act === "open-card") {
      ui.focusId = ui.focusId === button.getAttribute("data-id") ? "" : button.getAttribute("data-id");
      ui.draft = null;
      paint();
      return;
    }
    if (act === "edit") {
      ui.draft = clone(store.recipes[button.getAttribute("data-id")]);
      ui.focusId = "";
      paint();
      return;
    }
    if (act === "duplicate") {
      var copy = clone(store.recipes[button.getAttribute("data-id")]);
      copy.id = "";
      copy.seed = false;
      copy.title = copy.title + " copy";
      ui.draft = copy;
      paint();
      return;
    }
    if (act === "favourite") {
      var fav = store.recipes[button.getAttribute("data-id")];
      fav.favourite = !fav.favourite;
      save();
      paint();
      return;
    }
    if (act === "hide") { hideRecipe(button.getAttribute("data-id")); ui.focusId = ""; paint(); return; }
    if (act === "ask-delete") { ui.sheet = { type: "delete", id: button.getAttribute("data-id") }; paint(); return; }
    if (act === "confirm-delete") { deleteRecipe(ui.sheet.id); ui.sheet = null; ui.focusId = ""; paint(); return; }
    if (act === "add-plan") {
      ui.sheet = { type: "add", id: button.getAttribute("data-id"), date: defaultDate(currentMonth()) };
      paint();
      return;
    }
    if (act === "add-slot") {
      var select = root.document.querySelector("[data-planner-field='add-date']");
      var result = setSlot(currentMonth(), select ? select.value : ui.sheet.date, button.getAttribute("data-slot"), ui.sheet.id);
      ui.sheet = null;
      ui.screen = "plan";
      if (result.cleared) ui.toast = result.cleared + " tick cleared.";
      paint();
      return;
    }
    if (act === "swap") {
      var month = ensureMonth(store, currentMonth());
      if (month.status === "locked") { ui.error = "Unlock the month to change a slot."; paint(); return; }
      ui.sheet = { type: "swap", date: button.getAttribute("data-date"), slot: button.getAttribute("data-slot"), query: "" };
      paint();
      return;
    }
    if (act === "place") {
      var placed = setSlot(currentMonth(), ui.sheet.date, ui.sheet.slot, button.getAttribute("data-id"));
      if (placed.error) ui.error = placed.error;
      else ui.error = "";
      if (placed.cleared) ui.toast = placed.cleared + " tick cleared.";
      ui.sheet = null;
      paint();
      return;
    }
    if (act === "repeat") { repeatWeekday(currentMonth(), ui.sheet.date, ui.sheet.slot); ui.sheet = null; paint(); return; }
    if (act === "close-sheet") { ui.sheet = null; paint(); return; }
    if (act === "auto") { autoOrganise(currentMonth()); paint(); return; }
    if (act === "clear-week") { clearRange(currentMonth(), button.getAttribute("data-from"), button.getAttribute("data-to")); paint(); return; }
    if (act === "clear-month") { clearMonth(currentMonth()); paint(); return; }
    if (act === "undo") { undo(); paint(); return; }
    if (act === "month-prev") { shiftMonth(-1); paint(); return; }
    if (act === "month-next") { shiftMonth(1); paint(); return; }
    if (act === "toggle-slot") {
      var flag = button.getAttribute("data-flag");
      var plan = ensureMonth(store, currentMonth());
      var next = !plan.slots[flag];
      var onCount = SLOTS.filter(function (slot) { return slot.flag === flag ? next : plan.slots[slot.flag]; }).length;
      if (!onCount) { ui.error = "Keep at least one slot."; paint(); return; }
      plan.slots[flag] = next;
      save();
      paint();
      return;
    }
    if (act === "lock") {
      var locked = lockMonth(currentMonth(), false);
      if (locked.needsConfirm) {
        ui.sheet = { type: "relock", month: currentMonth(), kept: locked.kept, cleared: locked.cleared };
      }
      paint();
      return;
    }
    if (act === "confirm-lock") { lockMonth(currentMonth(), true); ui.sheet = null; paint(); return; }
    if (act === "ask-unlock") { ui.sheet = { type: "unlock", month: currentMonth() }; paint(); return; }
    if (act === "confirm-unlock") { unlockMonth(currentMonth()); ui.sheet = null; paint(); return; }
    if (act === "templates") { ui.sheet = { type: "templates", name: "" }; paint(); return; }
    if (act === "save-template") {
      var nameInput = root.document.querySelector("[data-planner-field='template-name']");
      saveTemplate(currentMonth(), nameInput ? nameInput.value : "");
      ui.sheet = { type: "templates", name: "" };
      paint();
      return;
    }
    if (act === "apply-template") { applyTemplate(button.getAttribute("data-id"), currentMonth()); ui.sheet = null; ui.screen = "plan"; paint(); return; }
    if (act === "ask-rename") {
      var template = store.templates[button.getAttribute("data-id")];
      ui.sheet = { type: "rename", id: button.getAttribute("data-id"), name: template ? template.name : "" };
      paint();
      return;
    }
    if (act === "confirm-rename") {
      var rename = root.document.querySelector("[data-planner-field='rename']");
      renameTemplate(ui.sheet.id, rename ? rename.value : "");
      ui.sheet = { type: "templates", name: "" };
      paint();
      return;
    }
    if (act === "ask-delete-template") { ui.sheet = { type: "delete-template", id: button.getAttribute("data-id") }; paint(); return; }
    if (act === "confirm-delete-template") { deleteTemplate(ui.sheet.id); ui.sheet = { type: "templates" }; paint(); return; }
    if (act === "done") { toggleTick(button.getAttribute("data-date"), button.getAttribute("data-slot")); paint(); return; }
    if (act === "day-prev" || act === "day-next") { shiftToday(act === "day-next" ? 1 : -1); paint(); return; }
    if (act === "toggle-prep") { ui.showPrep = !ui.showPrep; paint(); return; }
    if (act === "dismiss-notice") { read().notice = ""; save(); paint(); return; }
  }

  function shiftToday(delta) {
    var parts = todayKey().split("-");
    var cursor = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + delta));
    var next = cursor.getUTCFullYear() + "-" + pad(cursor.getUTCMonth() + 1) + "-" + pad(cursor.getUTCDate());
    try {
      var url = new URL(root.location.href);
      url.searchParams.set("date", next);
      root.history.replaceState(null, "", url.pathname + url.search);
    } catch (err) { /* tests */ }
    ui._today = next;
  }

  function onInput(event) {
    var field = event.target.getAttribute("data-planner-field");
    if (field === "query") {
      ui.query = event.target.value;
      var caret = event.target.selectionStart;
      paint();
      var again = root.document.querySelector("[data-planner-field='query']");
      if (again && again.focus) {
        again.focus();
        try { again.setSelectionRange(caret, caret); } catch (err) { /* search */ }
      }
    }
    if (field === "sheet-query" && ui.sheet) { ui.sheet.query = event.target.value; paint(); }
  }

  function bind() {
    var board = root.document && root.document.getElementById && root.document.getElementById("planner-board");
    if (!board || board.getAttribute("data-bound") === "1") return;
    board.setAttribute("data-bound", "1");
    board.addEventListener("click", onClick);
    board.addEventListener("input", onInput);
  }

  function open(door, screen) {
    ui.door = door === "smoothies" ? "smoothies" : "food";
    ui.screen = screen || "recipes";
    if (ui.screen === "recipes") ui.filter = ui.door === "smoothies" ? "smoothie" : "meal";
    ui.sheet = null;
    read();
    paint();
  }

  function sync(door, screen) {
    if (door !== "food" && door !== "smoothies") {
      ui.screen = "";
      paint();
      var board = root.document && root.document.getElementById("planner-board");
      if (board) board.hidden = true;
      var training = root.document && root.document.getElementById("training-board");
      if (training) training.hidden = false;
      if (root.document && root.document.body) root.document.body.classList.remove("is-food");
      var note = root.document && root.document.querySelector && root.document.querySelector(".storage-note");
      if (note) note.hidden = false;
      return;
    }
    if (!screen) return;
    open(door, screen);
  }

  function dismiss() {
    if (ui.sheet || ui.draft) {
      ui.sheet = null;
      ui.draft = null;
      paint();
      return true;
    }
    return false;
  }

  root.NexusFood = {
    open: open,
    sync: sync,
    dismiss: dismiss,
    paint: paint,
    testing: {
      reset: function () { cache = null; },
      read: read,
      today: function () { return ui._today || todayKey(); },
      recipeCount: function () { return Object.keys(read().recipes).length; },
      recipes: function () { return read().recipes; },
      beginNew: function (kind) { ui.draft = blankDraft(kind); return ui.draft; },
      cancelNew: function () { ui.draft = null; },
      commit: commitDraft,
      deleteRecipe: deleteRecipe,
      hideRecipe: hideRecipe,
      undo: undo,
      usage: usage,
      setSlot: setSlot,
      autoOrganise: autoOrganise,
      clearRange: clearRange,
      validate: validate,
      gaps: gaps,
      lock: lockMonth,
      unlock: unlockMonth,
      saveTemplate: saveTemplate,
      applyTemplate: applyTemplate,
      renameTemplate: renameTemplate,
      deleteTemplate: deleteTemplate,
      weeks: weeksOf,
      dates: dateList,
      prep: prepFor,
      defaultDate: defaultDate,
      allows: allows,
      nuts: function (key, date) {
        var store = read();
        return dayNuts(store, ensureMonth(store, key), ensureDay(ensureMonth(store, key), date));
      },
      setNuts: function (id, count) {
        var recipe = read().recipes[id];
        recipe.ingredients.push({ name: "Brazil nuts", qty: count, unit: "each", multiple: 1, skuId: "brazil", brazilNuts: count });
        save();
      },
      toggleTick: toggleTick,
      tickOn: function (date, slot) {
        var month = read().months[monthOf(date)];
        return !!(month && month.ticks[tickKey(date, slot)]);
      },
      setFlag: function (key, flag, on) {
        ensureMonth(read(), key).slots[flag] = !!on;
        save();
      },
      month: function (key) { return ensureMonth(read(), key); }
    }
  };

  if (root.document && root.document.getElementById) bind();
})(typeof window !== "undefined" ? window : globalThis);
