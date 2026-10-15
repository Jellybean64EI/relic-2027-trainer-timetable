/* Nexus food planner v44. Meals and smoothies share one store.
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
    { key: "morning", flag: "smoothie", label: "Smoothie" },
    { key: "lunch", flag: "lunch", label: "Lunch" },
    { key: "evening", flag: "dinner", label: "Evening" }
  ];
  var FIT_ORDER = ["breakfast", "lunch", "evening", "smoothie"];
  var cache = null;
  var base = null;
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
    toast: null,
    syncNote: "",
    showPrep: false,
    prepSet: false,
    week: null,
    weekKey: ""
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
    return /\beggs?\b|\begg whites?\b/i.test(String(text || ""));
  }

  function badBrazil(text) {
    return /\bone brazil nut\b|\b1 brazil nut\b|brazil nut maximum|\bone nut a day\b/i.test(String(text || ""));
  }

  function scrubText(text) {
    var value = String(text || "");
    if (!value) return "";
    value = value.replace(/[^.!?\n]*\b(?:one|1) brazil nut\b[^.!?\n]*[.!?]?/gi, "");
    value = value.replace(/[^.!?\n]*\b(?:strain|beside the glass|not in the jug|joe v\d+)\b[^.!?\n]*[.!?]?/gi, "");
    value = value.replace(/[^.!?\n]*\begg whites?\b[^.!?\n]*[.!?]?/gi, "");
    value = value.replace(/[^.!?\n]*\beggs?\b[^.!?\n]*[.!?]?/gi, "");
    return value.replace(/\s{2,}/g, " ").replace(/\s+([.!?])/g, "$1").trim();
  }

  function plainName(text) {
    var name = String(text || "");
    if (/^2 Brazil nuts$/i.test(name.trim())) return "2 Brazil nuts";
    name = name.replace(/\s*[—–-]\s*after the strain/gi, "");
    name = name.replace(/,?\s*beside the glass[^.]*/gi, "");
    name = name.replace(/,?\s*not in the jug/gi, "");
    name = name.replace(/Sainsbury's/gi, "");
    name = name.replace(/SO Organic/gi, "");
    name = name.replace(/Taste the Difference/gi, "");
    name = name.replace(/\bJoe v\d+\b[^.]*/gi, "");
    name = name.replace(/\(\s*(?:¾|1\/4|¼|1)\s*cup\s*\)/gi, "");
    name = name.replace(/,?\s*or cold water if the organic bottle is out/gi, "");
    name = name.replace(/\s+/g, " ").replace(/^[\s,.;]+|[\s,.;]+$/g, "").trim();
    if (/brazil nut/i.test(name)) return "2 Brazil nuts";
    return name;
  }

  function ingredientLine(item) {
    var name = plainName(item && item.name || "");
    if (!name) return "";
    if (name === "2 Brazil nuts" || /^\d/.test(name)) return name;
    var mult = item.multiple > 1 ? item.multiple + "× " : "";
    var qty = item.qty > 1 ? String(item.qty) + " " : "";
    return (mult + qty + name).trim();
  }

  function cardBlob(recipe) {
    if (!recipe) return "";
    return [recipe.title, recipe.tip, recipe.script, recipe.source]
      .concat((recipe.ingredients || []).map(function (item) { return item.name || item.text || ""; }))
      .concat((recipe.method || []).map(function (step) { return (step.verb || "") + " " + (step.detail || ""); }))
      .join(" ");
  }

  function visibleBlob(recipe) {
    if (!recipe) return "";
    return [recipe.title].concat((recipe.ingredients || []).map(function (item) { return item.name || ""; })).join(" ");
  }

  function textIssues(recipe) {
    var blob = visibleBlob(recipe);
    var stored = cardBlob(recipe);
    var issues = [];
    var nuts = recipeNuts(recipe);
    if (badBrazil(stored) || (nuts !== 0 && nuts !== 2)) issues.push("Brazil nuts are 2.");
    if (isEgg(stored)) issues.push("Eggs are not used.");
    if (/strain|beside the glass|not in the jug|joe v\d+/i.test(blob)) issues.push("Blend everything in the jug.");
    return issues;
  }

  function fitLabel(key) {
    if (key === "breakfast") return "Breakfast";
    if (key === "lunch") return "Lunch";
    if (key === "evening") return "Evening";
    if (key === "smoothie") return "Smoothie";
    return "";
  }

  function inferFits(recipe) {
    if (!recipe) return ["lunch"];
    if (recipe.kind === "extraction" || (recipe.types || []).indexOf("smoothie") !== -1) return ["smoothie"];
    var blob = [recipe.title, recipe.citation && recipe.citation.title, (recipe.types || []).join(" ")].join(" ").toLowerCase();
    var light = /toast|garlic bread|snack|bites|fruit plate|breakfast/.test(blob);
    var main = /chicken|turkey|salmon|beef|mince|tuna|tray|boats|pasta|bowl|skillet|burger|roast|batch|plate/.test(blob);
    var fits = [];
    if (light) fits.push("breakfast");
    if (main || /\blunch\b/.test(blob)) fits.push("lunch");
    if (/toast/.test(blob) && fits.indexOf("lunch") === -1) fits.push("lunch");
    if (main && !/fruit plate|snack|bites|garlic bread/.test(blob)) fits.push("evening");
    if (!fits.length) {
      (recipe.types || []).forEach(function (type) {
        if (FIT_ORDER.indexOf(type) !== -1 && type !== "smoothie" && fits.indexOf(type) === -1) fits.push(type);
      });
    }
    if (!fits.length) fits = ["lunch", "evening"];
    return FIT_ORDER.filter(function (key) { return fits.indexOf(key) !== -1; });
  }

  function normaliseFits(recipe) {
    if (!recipe) return [];
    var given = (recipe.fits || []).filter(function (key) { return FIT_ORDER.indexOf(key) !== -1; });
    var fits = given.length ? given : inferFits(recipe);
    if (fits.indexOf("smoothie") !== -1) {
      recipe.fits = ["smoothie"];
      recipe.types = ["smoothie"];
      recipe.kind = "extraction";
      recipe.notDinner = true;
      if (!recipe.purpose) recipe.purpose = purposeOf(recipe);
    } else {
      recipe.fits = FIT_ORDER.filter(function (key) { return key !== "smoothie" && fits.indexOf(key) !== -1; });
      if (!recipe.fits.length) recipe.fits = ["lunch"];
      recipe.types = recipe.fits.slice();
      recipe.kind = "meal";
      recipe.notDinner = recipe.fits.indexOf("evening") === -1;
    }
    return recipe.fits;
  }

  function fitLabels(recipe) {
    if (!recipe) return [];
    var fits = recipe.fits && recipe.fits.length ? recipe.fits : inferFits(recipe);
    var labels = FIT_ORDER.filter(function (key) { return fits.indexOf(key) !== -1; }).map(fitLabel);
    if (fits.indexOf("smoothie") !== -1) {
      var purpose = purposeOf(recipe);
      labels.push(purpose.charAt(0).toUpperCase() + purpose.slice(1));
    }
    return labels;
  }

  function tagFor(recipe) {
    return fitLabels(recipe).join(" · ");
  }

  function cleanTitle(recipe) {
    var aliases = {
      "recovery-botanical-extraction": "Botanical",
      "morning-cell-shatter": "Morning Blend"
    };
    if (recipe.id && aliases[recipe.id]) return aliases[recipe.id];
    var title = scrubText(recipe.title || "");
    title = title.replace(/\bheavy botanical extraction\b/ig, "Botanical");
    title = title.replace(/\bextraction\b/ig, "");
    title = title.replace(/\b3000\s*w\b/ig, "");
    title = title.replace(/\bsmoothie\b/ig, "");
    title = title.replace(/\bmeal\b/ig, "");
    ["Breakfast", "Lunch", "Evening", "Smoothie", "Recovery", "Energy"].forEach(function (word) {
      title = title.replace(new RegExp("\\b" + word + "\\b", "ig"), "");
    });
    title = title.replace(/\s+/g, " ").replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "").trim();
    return title || "Recipe";
  }

  function simplifyRecipe(recipe) {
    if (!recipe.citation) {
      recipe.citation = {
        title: recipe.title || "",
        source: recipe.source || ""
      };
    }
    if (isSmoothie(recipe) && !recipe.purpose) recipe.purpose = purposeOf(recipe);
    recipe.title = cleanTitle(recipe);
    var brazil = false;
    recipe.ingredients = (recipe.ingredients || []).map(function (item) {
      var original = item.name || item.text || "";
      if (/sainsbury/i.test(original) && !item.brand) item.brand = "Sainsbury's";
      item.name = plainName(original);
      if (item.name === "2 Brazil nuts" || item.skuId === "brazil") {
        item.name = "2 Brazil nuts";
        item.qty = 2;
        item.brazilNuts = 2;
        item.skuId = item.skuId || "brazil";
      }
      return item;
    }).filter(function (item) {
      if (!item.name || isEgg(item.name)) return false;
      if (item.name === "2 Brazil nuts") {
        if (brazil) return false;
        brazil = true;
      }
      return true;
    });
    normaliseFits(recipe);
    if (isSmoothie(recipe)) {
      recipe.method = [{ verb: "Blend", detail: "all until smooth" }];
      recipe.tip = "";
    } else {
      recipe.tip = "";
      recipe.method = (recipe.method || []).map(function (step) {
        step.verb = scrubText(step.verb || "");
        step.detail = scrubText(step.detail || "");
        return step;
      }).filter(function (step) {
        var blob = ((step.verb || "") + " " + (step.detail || "")).trim();
        return blob && !isEgg(blob) && !/strain|beside the glass|not in the jug/i.test(blob);
      });
    }
    return recipe;
  }

  function scrubRecipe(recipe) {
    if (!recipe) return null;
    recipe = simplifyRecipe(recipe);
    if (!recipe.title || isEgg(recipe.title)) return null;
    return recipe;
  }

  function normTitle(title) {
    return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

  function weekIndex(key) {
    var weeks = weeksOf(key);
    if (ui.weekKey !== key || ui.week == null) {
      var today = todayKey();
      var found = 0;
      weeks.forEach(function (week, index) {
        week.forEach(function (day) {
          if (day.date === today) found = index;
        });
      });
      ui.week = found;
      ui.weekKey = key;
    }
    if (ui.week < 0) ui.week = 0;
    if (ui.week > weeks.length - 1) ui.week = Math.max(0, weeks.length - 1);
    return ui.week;
  }

  function visibleWeek(key) {
    var weeks = weeksOf(key);
    return weeks[weekIndex(key)] || [];
  }

  function shortMonth(key) {
    return MONTHS[+String(key).split("-")[1]] || "";
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
    return { cards: fromCards, extra: 0, total: fromCards };
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
    var fits = recipe.fits && recipe.fits.length ? recipe.fits : inferFits(recipe);
    if (slotKey === "morning") return fits.indexOf("smoothie") !== -1;
    if (slotKey === "breakfast") return fits.indexOf("breakfast") !== -1;
    if (slotKey === "lunch") return fits.indexOf("lunch") !== -1;
    if (slotKey === "evening") return fits.indexOf("evening") !== -1;
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
      recipe = scrubRecipe(recipe);
      if (!recipe || isEgg(cardBlob(recipe))) return;
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
    return scrubRecipe(recipe);
  }

  function dedupeRecipes(store) {
    var groups = {};
    Object.keys(store.recipes || {}).forEach(function (id) {
      var title = normTitle(store.recipes[id] && store.recipes[id].title);
      if (!title) return;
      if (!groups[title]) groups[title] = [];
      groups[title].push(id);
    });
    var alias = {};
    var removed = 0;
    Object.keys(groups).forEach(function (title) {
      var ids = groups[title];
      if (ids.length < 2) return;
      ids.sort(function (a, b) {
        var ap = a.indexOf("pack001") === 0 ? 1 : 0;
        var bp = b.indexOf("pack001") === 0 ? 1 : 0;
        if (ap !== bp) return ap - bp;
        var as = store.recipes[a].seed ? 0 : 1;
        var bs = store.recipes[b].seed ? 0 : 1;
        if (as !== bs) return as - bs;
        return a < b ? -1 : 1;
      });
      var keep = ids[0];
      ids.slice(1).forEach(function (id) {
        alias[id] = keep;
        delete store.recipes[id];
        removed += 1;
      });
    });
    if (!removed) return 0;
    Object.keys(store.months || {}).forEach(function (key) {
      var days = store.months[key].days || {};
      Object.keys(days).forEach(function (date) {
        var day = days[date];
        ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
          if (alias[day[slot]]) day[slot] = alias[day[slot]];
        });
      });
    });
    Object.keys(store.templates || {}).forEach(function (id) {
      var pattern = store.templates[id].weekdayPattern || {};
      Object.keys(pattern).forEach(function (name) {
        ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
          if (alias[pattern[name][slot]]) pattern[name][slot] = alias[pattern[name][slot]];
        });
      });
    });
    return removed;
  }

  function scrubStore(store) {
    var changed = false;
    Object.keys(store.recipes || {}).forEach(function (id) {
      var before = JSON.stringify(store.recipes[id]);
      var next = scrubRecipe(store.recipes[id]);
      if (!next) {
        delete store.recipes[id];
        changed = true;
        return;
      }
      store.recipes[id] = next;
      if (JSON.stringify(next) !== before) changed = true;
    });
    if (dedupeRecipes(store)) changed = true;
    return changed;
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
    scrubStore(store);
    store.scrubbed = 41;
    store.rev = 0;
    var kept = Object.keys(store.recipes).length;
    store.notice = "Your plans were moved. " + kept + " cards kept. October plan cleared." +
      (droppedAudit ? " " + droppedAudit + " AUDIT cards removed." : "");
    return store;
  }

  function rememberBase() {
    base = cache ? clone(cache) : null;
  }

  function sameJson(a, b) {
    return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  }

  function mergeValue(baseVal, localVal, diskVal, label, conflicts) {
    if (sameJson(localVal, baseVal)) return diskVal;
    if (sameJson(diskVal, baseVal) || sameJson(diskVal, localVal)) return localVal;
    conflicts.push(label);
    return diskVal;
  }

  function mergeFood(baseSnap, local, disk) {
    var conflicts = [];
    var out = clone(disk);
    out.recipes = out.recipes || {};
    var ids = {};
    [baseSnap.recipes, local.recipes, disk.recipes].forEach(function (recipes) {
      Object.keys(recipes || {}).forEach(function (id) { ids[id] = 1; });
    });
    Object.keys(ids).forEach(function (id) {
      var b = (baseSnap.recipes || {})[id] || null;
      var l = (local.recipes || {})[id] || null;
      var d = (disk.recipes || {})[id] || null;
      var next = mergeValue(b, l, d, "card " + id, conflicts);
      if (next) out.recipes[id] = next;
      else delete out.recipes[id];
    });
    out.months = out.months || {};
    var monthKeys = {};
    [baseSnap.months, local.months, disk.months].forEach(function (months) {
      Object.keys(months || {}).forEach(function (key) { monthKeys[key] = 1; });
    });
    Object.keys(monthKeys).forEach(function (key) {
      var b = (baseSnap.months || {})[key] || blankMonth(key);
      var l = (local.months || {})[key] || blankMonth(key);
      var d = (disk.months || {})[key] || blankMonth(key);
      if (!out.months[key]) out.months[key] = clone(d);
      var target = out.months[key];
      target.slots = mergeValue(b.slots || defaultSlots(), l.slots || defaultSlots(), d.slots || defaultSlots(), key + " slots", conflicts);
      target.status = mergeValue(b.status || "draft", l.status || "draft", d.status || "draft", key + " status", conflicts);
      target.days = target.days || {};
      var dates = {};
      [b.days, l.days, d.days].forEach(function (days) {
        Object.keys(days || {}).forEach(function (date) { dates[date] = 1; });
      });
      Object.keys(dates).forEach(function (date) {
        var bd = (b.days || {})[date] || blankDay();
        var ld = (l.days || {})[date] || blankDay();
        var dd = (d.days || {})[date] || blankDay();
        if (!target.days[date]) target.days[date] = clone(dd);
        ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
          target.days[date][slot] = mergeValue(bd[slot] || "", ld[slot] || "", dd[slot] || "", key + " " + date + " " + slot, conflicts) || "";
        });
      });
    });
    out.templates = out.templates || {};
    var templateIds = {};
    [baseSnap.templates, local.templates, disk.templates].forEach(function (templates) {
      Object.keys(templates || {}).forEach(function (id) { templateIds[id] = 1; });
    });
    Object.keys(templateIds).forEach(function (id) {
      var next = mergeValue((baseSnap.templates || {})[id] || null, (local.templates || {})[id] || null, (disk.templates || {})[id] || null, "template " + id, conflicts);
      if (next) out.templates[id] = next;
      else delete out.templates[id];
    });
    if (!sameJson(local.undo, baseSnap.undo)) out.undo = clone(local.undo || []);
    return { store: out, conflicts: conflicts };
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
      cache.rev = cache.rev || 0;
      if ((cache.scrubbed || 0) < 41) {
        var before = cache.scrubbed || 0;
        var dirty = before < 40 ? scrubStore(cache) : false;
        var slotted = false;
        Object.keys(cache.recipes).forEach(function (id) {
          if (!cache.recipes[id].fits) {
            normaliseFits(cache.recipes[id]);
            slotted = true;
          }
        });
        cache.scrubbed = 41;
        if (dirty) cache.notice = "Recipes simplified.";
        else if (slotted && before >= 40) cache.notice = "Meal slots updated.";
        save();
      } else {
        rememberBase();
      }
      dropStoredToast();
      return cache;
    }
    cache = migrate();
    save();
    dropStoredToast();
    return cache;
  }

  function dropStoredToast() {
    if (!cache || !cache.toast) return;
    delete cache.toast;
    save();
  }

  function save() {
    var store = cache || read();
    var disk = parseJson(storageGet(KEY));
    if (disk && disk.schema === 1 && (disk.rev || 0) !== (store.rev || 0)) {
      if (!base) {
        cache = disk;
        rememberBase();
        ui.syncNote = "This plan changed in another tab. Reload";
        return { refused: true };
      }
      var merged = mergeFood(base, store, disk);
      if (merged.conflicts.length) {
        cache = disk;
        rememberBase();
        ui.syncNote = "This plan changed in another tab. Reload";
        return { refused: true };
      }
      cache = merged.store;
      store = cache;
      ui.syncNote = "Merged with a newer plan from another tab.";
      disk = merged.store;
    }
    store.rev = ((disk && disk.rev) || 0) + 1;
    if ((store.rev || 0) <= ((disk && disk.rev) || 0)) store.rev = (disk.rev || 0) + 1;
    store.updatedAt = new Date().toISOString();
    storageSet(KEY, JSON.stringify(store));
    rememberBase();
    return store;
  }

  function onStorage(event) {
    if (!event || event.key !== KEY) return;
    var disk = parseJson(event.newValue);
    if (!disk || disk.schema !== 1 || !cache) return;
    if ((disk.rev || 0) === (cache.rev || 0)) return;
    var board = root.document && root.document.getElementById && root.document.getElementById("planner-board");
    var showing = !!(board && !board.hidden);
    var quiet = base && sameJson(cache.recipes, base.recipes) && sameJson(cache.months, base.months) && sameJson(cache.templates, base.templates);
    if (quiet) {
      cache = disk;
      rememberBase();
      ui.syncNote = "Updated from another tab.";
      if (showing) paint();
      return;
    }
    var merged = mergeFood(base || cache, cache, disk);
    if (merged.conflicts.length) {
      cache = disk;
      rememberBase();
      ui.syncNote = "This plan changed in another tab. Reload";
      if (showing) paint();
      return;
    }
    cache = merged.store;
    ui.syncNote = "Merged with a newer plan from another tab.";
    save();
    if (showing) paint();
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
    var id = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    store.undo.push({
      id: id,
      at: new Date().toISOString(),
      label: label,
      recipes: clone(store.recipes),
      months: clone(store.months),
      templates: clone(store.templates)
    });
    if (store.undo.length > 20) store.undo = store.undo.slice(-20);
    return id;
  }

  function dropUndo(id) {
    var store = read();
    store.undo = store.undo.filter(function (entry) { return entry.id !== id; });
  }

  var bannerTimer = 0;
  var bannerLeave = 0;

  function stopBannerTimer() {
    if (bannerTimer) root.clearTimeout(bannerTimer);
    if (bannerLeave) root.clearTimeout(bannerLeave);
    bannerTimer = 0;
    bannerLeave = 0;
  }

  function motionReduced() {
    try {
      return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) {
      return false;
    }
  }

  function showBanner(text, opts) {
    opts = opts || {};
    stopBannerTimer();
    var clean = String(text || "").replace(/!/g, "");
    ui.toast = {
      cabin: opts.cabin || ui.door || "food",
      text: clean,
      undoId: opts.undoId || null,
      onUndo: opts.onUndo || null,
      label: opts.label || clean
    };
    armBanner(ui.toast.undoId || ui.toast.onUndo ? 6000 : 4000);
    paintBanner();
  }

  function say(text, opts) {
    showBanner(text, opts);
  }

  function clearBanner(cabin) {
    if (cabin && (!ui.toast || ui.toast.cabin !== cabin)) return;
    ui.toast = null;
    stopBannerTimer();
    paintBanner();
  }

  function armBanner(ms) {
    if (bannerTimer) root.clearTimeout(bannerTimer);
    if (bannerLeave) root.clearTimeout(bannerLeave);
    bannerTimer = 0;
    bannerLeave = 0;
    if (!ui.toast || !root.setTimeout) return;
    bannerTimer = root.setTimeout(function () {
      bannerTimer = 0;
      fadeBanner();
    }, ms);
  }

  function fadeBanner() {
    var host = root.document && root.document.getElementById && root.document.getElementById("nexus-banner");
    if (motionReduced() || !host) {
      ui.toast = null;
      paintBanner();
      return;
    }
    host.classList.add("is-out");
    host.classList.remove("is-in");
    bannerLeave = root.setTimeout(function () {
      bannerLeave = 0;
      ui.toast = null;
      paintBanner();
    }, 200);
  }

  function pauseBanner() {
    if (!ui.toast) return;
    if (bannerTimer) {
      root.clearTimeout(bannerTimer);
      bannerTimer = 0;
    }
    if (bannerLeave) {
      root.clearTimeout(bannerLeave);
      bannerLeave = 0;
      var host = root.document && root.document.getElementById("nexus-banner");
      if (host) host.classList.remove("is-out");
    }
  }

  function resumeBanner() {
    if (!ui.toast) return;
    armBanner(2000);
  }

  function undo() {
    if (!ui.toast) return false;
    if (ui.toast.cabin && ui.toast.cabin !== ui.door) return false;
    if (ui.toast.onUndo) {
      var fn = ui.toast.onUndo;
      clearBanner();
      fn();
      paint();
      return true;
    }
    var store = read();
    if (!store.undo.length || !ui.toast.undoId) return false;
    var top = store.undo[store.undo.length - 1];
    if (top.id !== ui.toast.undoId) return false;
    store.undo.pop();
    store.recipes = top.recipes;
    store.months = top.months;
    store.templates = top.templates;
    if (store.toast) delete store.toast;
    save();
    var label = top.label;
    clearBanner();
    paint();
    return label;
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
    ui.week = null;
    ui.weekKey = "";
    save();
  }

  function shiftWeek(delta) {
    var key = currentMonth();
    var weeks = weeksOf(key);
    var index = weekIndex(key) + delta;
    if (index >= 0 && index < weeks.length) {
      ui.week = index;
      ui.weekKey = key;
      return;
    }
    shiftMonth(delta < 0 ? -1 : 1);
    var landed = weeksOf(currentMonth());
    ui.week = delta < 0 ? landed.length - 1 : 0;
    ui.weekKey = currentMonth();
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
      if (nuts.total !== 0 && nuts.total !== 2) {
        problems.push({ date: info.date, slot: "brazil", reason: "Brazil nuts are 2 (" + nuts.total + " on this day)." });
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
        textIssues(recipe).forEach(function (reason) {
          problems.push({ date: info.date, slot: "text", reason: reason + " Card " + recipe.id + "." });
        });
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
    var written = save();
    if (written && written.refused) return { error: ui.syncNote, stale: true };
    return { cleared: cleared };
  }

  function slotMeta(date, slotKey) {
    var info = dateList(monthOf(date)).filter(function (row) { return row.date === date; })[0];
    var slot = null;
    SLOTS.forEach(function (item) { if (item.key === slotKey) slot = item; });
    return { info: info, slot: slot };
  }

  function slotTitle(date, slotKey) {
    var meta = slotMeta(date, slotKey);
    if (!meta.info) return date + " " + slotKey;
    var mon = MONTHS[+String(date).slice(5, 7)].slice(0, 3);
    return meta.info.name + " " + meta.info.day + " " + mon + " · " + (meta.slot ? meta.slot.label : slotKey);
  }

  function placeChange(key, date, slot, id) {
    var store = read();
    var month = ensureMonth(store, key);
    var day = ensureDay(month, date);
    var previous = day[slot] || "";
    var next = id || "";
    if (previous === next) return { cleared: 0, same: true };
    var recipe = next ? store.recipes[next] : null;
    var where = slotTitle(date, slot).replace(" · ", " ");
    var label = next
      ? ("Changed " + where + " to " + (recipe ? recipe.title : "card"))
      : ("Removed " + where);
    var undoId = pushUndo(label);
    var result = setSlot(key, date, slot, next);
    if (result.error || result.stale) {
      if (!result.stale) dropUndo(undoId);
      return result;
    }
    if (!next || result.cleared) {
      var text = label + ".";
      if (result.cleared) text += " " + result.cleared + " tick cleared.";
      say(text, { undoId: undoId, label: label });
    } else {
      dropUndo(undoId);
      save();
    }
    return result;
  }

  function filledCount(key) {
    var month = ensureMonth(read(), key);
    var n = 0;
    dateList(key).forEach(function (info) {
      var day = month.days[info.date];
      if (!day) return;
      ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
        if (day[slot]) n += 1;
      });
    });
    return n;
  }

  function requestClear(key) {
    var count = filledCount(key);
    if (!count) {
      clearMonth(key);
      return { cleared: true, count: 0 };
    }
    return { needsConfirm: true, count: count, month: key };
  }

  function whyFor(recipe, date, slot, store, month) {
    if (!recipe) return "";
    return recipe.id;
  }

  function candidates(store, slot) {
    var seen = {};
    var titles = {};
    return Object.keys(store.recipes).map(function (id) { return store.recipes[id]; }).filter(function (recipe) {
      if (!recipe || seen[recipe.id] || !allows(recipe, slot)) return false;
      var title = normTitle(recipe.title);
      if (titles[title]) return false;
      seen[recipe.id] = true;
      titles[title] = true;
      return true;
    }).sort(function (a, b) {
      if (!!b.favourite - !!a.favourite) return b.favourite - a.favourite;
      return a.title < b.title ? -1 : 1;
    });
  }

  function autoOrganise(key, cabin) {
    var door = cabin === "smoothies" || cabin === "food" ? cabin : (ui.door === "smoothies" ? "smoothies" : "food");
    var undoId = pushUndo("Auto-organise");
    var store = read();
    var month = ensureMonth(store, key);
    var filled = 0;
    var index = 0;
    var prev = { morning: "", lunch: "", evening: "", breakfast: "" };
    dateList(key).forEach(function (info) {
      var day = ensureDay(month, info.date);
      var want = index % 2 === 0 ? "energy" : "recovery";
      enabled(month).forEach(function (slot) {
        var smoothieSlot = slot.key === "morning";
        if (door === "smoothies" ? !smoothieSlot : smoothieSlot) return;
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
    say("Auto-organise filled " + filled + " empty slots.", { undoId: undoId, cabin: door });
    return filled;
  }

  function clearRange(key, from, to) {
    var undoId = pushUndo("Cleared " + from + " to " + to);
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
    say("Cleared " + n + " slots.", { undoId: undoId });
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
    var undoId = pushUndo("Repeated " + wd.name);
    var count = 0;
    dateList(key).forEach(function (info) {
      if (info.wd !== wd.wd || info.date === date) return;
      setSlot(key, info.date, slot, source);
      count += 1;
    });
    say("Repeated on " + count + " other " + wd.name + "s.", { undoId: undoId });
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
    if (month.status === "locked") return { ok: false, locked: true };
    var delta = tickDelta(store, month, key);
    var undoId = pushUndo("Locked " + monthName(key));
    month.status = "locked";
    month.lockedAt = new Date().toISOString();
    month.wasLocked = false;
    save();
    ui.error = "";
    ui.gap = "";
    say("Locked " + monthName(key) + ".", { undoId: undoId });
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
    var issues = textIssues(draft);
    if (issues.length) return { error: issues[0] };
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
      source: previous ? previous.source : "Card you wrote",
      fits: (draft.fits && draft.fits.length ? draft.fits : draft.types || []).slice()
    };
    if (previous) {
      recipe.ingredients = recipe.ingredients.map(function (item, index) {
        var prior = previous.ingredients[index];
        if (prior && prior.skuId && !item.skuId) item.skuId = prior.skuId;
        return item;
      });
    }
    recipe = simplifyRecipe(recipe);
    store.recipes[id] = recipe;
    save();
    ui.draft = null;
    return { id: id };
  }

  function deleteRecipe(id) {
    var store = read();
    var recipe = store.recipes[id];
    if (!recipe) return { error: "Missing card." };
    if (recipe.seed) return { error: "Seed cards are hidden, not deleted." };
    var undoId = pushUndo("Deleted " + recipe.title);
    var hits = usage(id);
    delete store.recipes[id];
    hits.forEach(function (hit) {
      var month = store.months[hit.month];
      if (month && month.days[hit.date]) month.days[hit.date][hit.slot] = "";
    });
    save();
    say("Deleted " + recipe.title + ".", { undoId: undoId });
    return { removed: hits.length };
  }

  function hideRecipe(id) {
    var store = read();
    var recipe = store.recipes[id];
    if (!recipe) return { error: "Missing card." };
    var undoId = pushUndo("Hid " + recipe.title);
    recipe.hidden = !recipe.hidden;
    save();
    say(recipe.hidden ? "Hid " + recipe.title + "." : "Showing " + recipe.title + ".", { undoId: undoId });
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
    return id;
  }

  function monthHasEntries(month) {
    var days = month && month.days || {};
    return Object.keys(days).some(function (date) {
      var day = days[date];
      return day && (day.breakfast || day.morning || day.lunch || day.evening);
    });
  }

  function applyTemplate(id, key, force) {
    var store = read();
    var template = store.templates[id];
    if (!template) return { error: "Missing template." };
    var month = ensureMonth(store, key);
    var mode = force === "fill" ? "fill" : (force === true || force === "replace" ? "replace" : "");
    if (!mode && monthHasEntries(month)) return { needsConfirm: true, month: key, count: filledCount(key) };
    if (!mode) mode = "replace";
    var undoId = pushUndo("Applied " + template.name);
    if (mode !== "fill" && template.slots) month.slots = clone(template.slots);
    var cleared = 0;
    dateList(key).forEach(function (info) {
      var pattern = template.weekdayPattern[info.name] || {};
      var day = ensureDay(month, info.date);
      ["breakfast", "morning", "lunch", "evening"].forEach(function (slot) {
        var incoming = pattern[slot] || "";
        if (mode === "fill" && day[slot]) return;
        var token = tickKey(info.date, slot);
        if (month.ticks[token] && day[slot] !== incoming) {
          delete month.ticks[token];
          cleared += 1;
        }
        day[slot] = incoming;
        var recipe = store.recipes[day[slot]];
        day.why[slot] = recipe ? whyFor(recipe, info.date, slot, store, month) : "";
      });
      applyBrazil(store, month, day);
    });
    save();
    say("Applied " + template.name + (cleared ? ". " + cleared + " tick cleared." : "."), { undoId: undoId });
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
        "Brazil nuts: " + (days.length * 2)
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
    if (ui.syncNote) html += '<p class="planner-error" role="alert">' + esc(ui.syncNote) + "</p>";
    if (ui.error) html += '<p class="planner-error" role="alert">' + esc(ui.error) + "</p>";
    if (ui.screen === "recipes") html += recipesHtml(store);
    if (ui.screen === "plan") html += planHtml(store);
    if (ui.screen === "today") html += todayHtml(store);
    rootEl.innerHTML = html;
    paintBanner();
    var host = sheetHost();
    if (host) host.innerHTML = ui.sheet ? sheetHtml(store) : "";
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
        "<strong>" + esc(recipe.title) + "</strong><span class=\"planner-tag\">" + esc(tagFor(recipe)) + "</span></button>";
      if (ui.focusId === recipe.id && !ui.draft) html += detailHtml(recipe);
      html += "</article>";
    });
    if (!visibleRecipes().length) html += '<p class="planner-empty">No cards on this filter.</p>';
    return html;
  }

  function detailHtml(recipe) {
    var ingredients = (recipe.ingredients || []).map(function (item) {
      var line = ingredientLine(item);
      return line ? "<li>" + esc(line) + "</li>" : "";
    }).join("");
    var blend = isSmoothie(recipe) ? "<p>Blend all until smooth.</p>" : "";
    var fits = recipe.fits || [];
    var fitRow = '<div class="planner-fits" role="group" aria-label="Fits">';
    if (isSmoothie(recipe)) {
      fitRow += '<button type="button" class="planner-chip is-active" aria-pressed="true" disabled>Smoothie</button>';
      ["energy", "recovery"].forEach(function (purpose) {
        var on = purposeOf(recipe) === purpose;
        var label = purpose.charAt(0).toUpperCase() + purpose.slice(1);
        fitRow += '<button type="button" class="planner-chip' + (on ? " is-active" : "") + '" data-planner-act="purpose" data-id="' + esc(recipe.id) + '" data-purpose="' + purpose + '" aria-pressed="' + on + '">' + label + "</button>";
      });
    } else {
      ["breakfast", "lunch", "evening"].forEach(function (key) {
        var on = fits.indexOf(key) !== -1;
        fitRow += '<button type="button" class="planner-chip' + (on ? " is-active" : "") + '" data-planner-act="fit" data-id="' + esc(recipe.id) + '" data-fit="' + key + '" aria-pressed="' + on + '">' + fitLabel(key) + "</button>";
      });
    }
    fitRow += "</div>";
    return '<div class="planner-detail">' + fitRow + '<h3>Ingredients</h3><ul>' + ingredients + "</ul>" + blend +
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
    var html = '<form class="planner-editor" data-planner-form="editor"><h3>' + (draft.id ? "Edit card" : "New card") + "</h3>" +
      '<label>Name<input name="title" placeholder="Card name" value="' + esc(draft.title) + '"></label>';
    html += '<fieldset><legend>Fits</legend>';
    var fitChoices = [["smoothie", "Smoothie"], ["breakfast", "Breakfast"], ["lunch", "Lunch"], ["evening", "Evening"]];
    var chosen = (draft.fits && draft.fits.length) ? draft.fits : (draft.types || []);
    fitChoices.forEach(function (choice) {
      var on = chosen.indexOf(choice[0]) !== -1;
      html += '<label class="planner-check"><input type="checkbox" name="type" value="' + choice[0] + '"' + (on ? " checked" : "") + "> " + choice[1] + "</label>";
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

  function lockBanner(key, status) {
    if (status !== "locked") return "";
    return '<div class="planner-lock-banner" role="status"><p>' + esc(shortMonth(key)) + " is locked. Ticks are kept.</p>" +
      '<button type="button" data-planner-act="ask-unlock" data-month="' + esc(key) + '">Unlock to edit</button></div>';
  }

  function planHtml(store) {
    var key = currentMonth();
    var month = ensureMonth(store, key);
    var empty = gaps(key);
    var lockLabel = empty.length ? (empty.length + " gaps") : (month.status === "locked" ? "Locked" : ("Lock " + monthName(key)));
    var html = '<p class="planner-help">1. Choose meals each day  2. Auto-organise or tap a slot  3. Lock month</p>';
    html += '<div class="planner-bar"><button type="button" data-planner-act="month-prev" aria-label="Previous month">Prev</button>' +
      "<h2 class=\"planner-title\">" + esc(monthName(key)) + "</h2>" +
      '<button type="button" data-planner-act="month-next" aria-label="Next month">Next</button></div>';
    html += '<p class="planner-status">' + (month.status === "locked" ? "Locked" : "Draft") + "</p>";
    html += '<p class="planner-kicker">Meals each day</p><div class="planner-slot-toggles" role="group" aria-label="Meals each day">';
    SLOTS.forEach(function (slot) {
      var on = !!month.slots[slot.flag];
      html += '<button type="button" class="planner-chip' + (on ? " is-active" : "") + '" data-planner-act="toggle-slot" data-flag="' +
        slot.flag + '" aria-pressed="' + on + '">' + slot.label + "</button>";
    });
    html += "</div>";
    html += '<div class="planner-actions"><button type="button" class="planner-primary" data-planner-act="auto">Auto-organise</button>' +
      '<button type="button" data-planner-act="templates">Templates</button>' +
      '<button type="button" data-planner-act="clear-month">Clear month</button></div>';
    html += lockBanner(key, month.status);
    var weeks = weeksOf(key);
    var week = weeks[weekIndex(key)] || [];
    if (week.length) {
      html += '<section class="planner-week"><div class="planner-bar"><button type="button" data-planner-act="week-prev" aria-label="Previous week">Prev week</button>' +
        '<h3 class="planner-title">' + esc(weekLabel(week, key)) + "</h3>" +
        '<button type="button" data-planner-act="week-next" aria-label="Next week">Next week</button></div>' +
        '<div class="planner-week-head"><span></span><button type="button" data-planner-act="clear-week" data-from="' + week[0].date + '" data-to="' + week[week.length - 1].date + '">Clear week</button></div>';
      week.forEach(function (info) {
        var day = ensureDay(month, info.date);
        applyBrazil(store, month, day);
        html += '<article class="planner-day"><header><span>' + esc(info.name + " " + info.day) + "</span>" +
          (info.sunday ? '<span class="planner-prep">Prep day</span>' : "") + "</header>";
        enabled(month).forEach(function (slot) {
          var id = day[slot.key];
          var recipe = id && store.recipes[id];
          var marked = ui.gap === info.date + "|" + slot.key;
          var locked = month.status === "locked";
          html += '<button type="button" class="planner-slot' + (marked ? " is-gap" : "") + (locked ? " is-locked" : "") + '" id="slot-' + info.date + "-" + slot.key +
            '" data-planner-act="swap" data-date="' + info.date + '" data-slot="' + slot.key + '"' + (locked ? ' data-locked="true"' : "") + ">" +
            '<span class="planner-slot-k">' + slot.label + (locked ? " · Locked" : "") + "</span>" +
            "<strong>" + esc(recipe ? recipe.title : "Empty") + "</strong>" +
            "</button>";
        });
        html += "</article>";
      });
      html += "</section>";
    }
    html += '<button type="button" class="planner-lock" data-planner-act="lock">' + esc(lockLabel) + "</button>";
    return html;
  }

  function todayHtml(store) {
    var date = todayKey();
    var key = monthOf(date);
    var month = ensureMonth(store, key);
    var day = ensureDay(month, date);
    var info = dateList(key).filter(function (row) { return row.date === date; })[0];
    var html = '<div class="planner-daybar"><button type="button" data-planner-act="day-prev" aria-label="Yesterday">Yesterday</button>' +
      "<h2 class=\"planner-title\">" + esc(info ? info.name + " " + info.day + " " + monthName(key) : date) + "</h2>" +
      '<button type="button" data-planner-act="day-next" aria-label="Tomorrow">Tomorrow</button></div>';
    html += lockBanner(key, month.status);
    enabled(month).forEach(function (slot) {
      var id = day[slot.key];
      var recipe = id && store.recipes[id];
      var done = !!month.ticks[tickKey(date, slot.key)];
      html += '<div class="planner-today"><div class="planner-today-copy"><span>' + slot.label + "</span><strong>" + esc(recipe ? recipe.title : "Empty") + "</strong>" +
        "</div><button type=\"button\" data-planner-act=\"done\" data-date=\"" + date + "\" data-slot=\"" + slot.key + "\">" +
        (done ? "Done" : "Mark done") + "</button></div>";
    });
    applyBrazil(store, month, day);
    if (info && (info.wd === 6 || info.sunday) && !ui.prepSet) {
      ui.showPrep = true;
      ui.prepSet = true;
    }
    html += '<button type="button" class="planner-prep-toggle" data-planner-act="toggle-prep">' + (ui.showPrep ? "Hide Sunday prep" : "Sunday prep") + "</button>";
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

  function realMonth() {
    return monthOf(todayKey());
  }

  function clampMonth(key) {
    var current = realMonth();
    return !key || key < current ? current : key;
  }

  function shiftMonthKey(key, delta) {
    var parts = clampMonth(key).split("-");
    var cursor = new Date(Date.UTC(+parts[0], +parts[1] - 1 + delta, 1));
    return clampMonth(cursor.getUTCFullYear() + "-" + pad(cursor.getUTCMonth() + 1));
  }

  function futureMonths(count) {
    var list = [];
    var key = realMonth();
    var i;
    for (i = 0; i < (count || 18); i++) {
      list.push(key);
      key = shiftMonthKey(key, 1);
      if (list.indexOf(key) !== -1) break;
    }
    return list;
  }

  function bannerVisible() {
    if (!ui.toast || !ui.toast.text) return false;
    if ((ui.toast.cabin || "food") !== (ui.door || "food")) return false;
    if (!root.document || !root.document.body || !root.document.body.classList.contains("is-food")) return false;
    var board = root.document.getElementById("planner-board");
    if (!board || board.hidden) return false;
    return true;
  }

  function bannerMarkup(text) {
    return esc(text).replace(/(\d+)/g, '<span class="nexus-banner-num">$1</span>');
  }

  function bannerHost() {
    var board = root.document && root.document.getElementById && root.document.getElementById("planner-board");
    if (!board || !root.document.createElement) return null;
    var host = root.document.getElementById("nexus-banner");
    if (!host) {
      host = root.document.createElement("div");
      host.id = "nexus-banner";
      host.hidden = true;
      host.innerHTML = '<div class="nexus-banner-bar" role="status" aria-live="polite" aria-atomic="true">' +
        '<button type="button" class="nexus-banner-dismiss" aria-label="Dismiss"><span class="nexus-banner-text"></span></button>' +
        '<button type="button" class="nexus-banner-undo" hidden>UNDO</button></div>';
      host.addEventListener("pointerdown", function () { pauseBanner(); });
      host.addEventListener("pointerup", function () { if (ui.toast) resumeBanner(); });
      host.addEventListener("pointercancel", function () { if (ui.toast) resumeBanner(); });
      host.addEventListener("focusin", function () { pauseBanner(); });
      host.addEventListener("focusout", function () { if (ui.toast) resumeBanner(); });
      host.addEventListener("click", function (event) {
        event.stopPropagation();
        if (event.target.closest(".nexus-banner-undo")) {
          event.preventDefault();
          undo();
          return;
        }
        event.preventDefault();
        clearBanner();
      });
    }
    board.appendChild(host);
    return host;
  }

  function paintBanner() {
    var host = bannerHost();
    if (!host) return;
    var board = root.document.getElementById("planner-board");
    if (!bannerVisible()) {
      host.hidden = true;
      host.classList.remove("is-in");
      if (board) board.style.paddingBottom = "";
      return;
    }
    var textEl = host.querySelector(".nexus-banner-text");
    var undoBtn = host.querySelector(".nexus-banner-undo");
    if (textEl) textEl.innerHTML = bannerMarkup(ui.toast.text);
    if (undoBtn) {
      var withUndo = !!(ui.toast.undoId || ui.toast.onUndo);
      undoBtn.hidden = !withUndo;
      if (withUndo) undoBtn.setAttribute("aria-label", "Undo: " + (ui.toast.label || ui.toast.text));
    }
    var wasHidden = host.hidden || host.classList.contains("is-out");
    host.hidden = false;
    host.classList.remove("is-out");
    if (wasHidden) {
      host.classList.remove("is-in");
      var reveal = function () { if (!host.hidden) host.classList.add("is-in"); };
      if (motionReduced() || !root.requestAnimationFrame) reveal();
      else root.requestAnimationFrame(reveal);
    }
    if (board) board.style.paddingBottom = (host.offsetHeight || 48) + "px";
  }

  function revealNotice() {
    var store = read();
    if (!store.notice) return;
    var text = store.notice;
    store.notice = "";
    save();
    showBanner(text, { cabin: ui.door });
  }

  function sheetHost() {
    if (!root.document || !root.document.getElementById || !root.document.createElement || !root.document.body) return null;
    var host = root.document.getElementById("planner-sheet-host");
    if (host) return host;
    host = root.document.createElement("div");
    host.id = "planner-sheet-host";
    root.document.body.appendChild(host);
    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    return host;
  }

  function sheetHtml(store) {
    var sheet = ui.sheet;
    var html = '<div class="planner-sheet-layer">';
    html += '<button type="button" class="planner-sheet-backdrop" data-planner-act="close-sheet" aria-label="Close"></button>';
    html += '<div class="planner-sheet" role="dialog" aria-modal="true">';
    if (sheet.type === "swap") {
      var list = candidates(store, sheet.slot);
      var pickedDay = (ensureMonth(store, monthOf(sheet.date)).days || {})[sheet.date] || {};
      var picked = pickedDay[sheet.slot] || "";
      html += "<h3>" + esc(slotTitle(sheet.date, sheet.slot)) + "</h3>";
      html += '<label class="planner-search">Search<input type="search" data-planner-field="sheet-query" value="' + esc(sheet.query || "") + '"></label>';
      var q = (sheet.query || "").toLowerCase();
      var shown = list.filter(function (recipe) { return !q || recipe.title.toLowerCase().indexOf(q) !== -1 || recipe.id === picked; });
      shown.sort(function (a, b) {
        if (a.id === picked) return -1;
        if (b.id === picked) return 1;
        return 0;
      });
      shown.forEach(function (recipe) {
        var current = recipe.id === picked;
        html += '<button type="button" class="planner-pick' + (current ? " is-current" : "") + '" data-planner-act="place" data-id="' + esc(recipe.id) + '">' +
          (current ? '<span class="planner-tick" aria-hidden="true">✓</span>' : "") +
          "<strong>" + esc(recipe.title) + '</strong><span class="planner-tag">' + esc(tagFor(recipe)) + "</span></button>";
      });
      if (picked) html += '<button type="button" data-planner-act="place" data-id="">Remove</button>';
      html += '<button type="button" data-planner-act="repeat">Repeat on every ' + esc(weekdayName(sheet.date)) + "</button>";
    } else if (sheet.type === "add") {
      var recipe = store.recipes[sheet.id];
      var key = clampMonth(sheet.month || currentMonth());
      sheet.month = key;
      if (!sheet.date || sheet.date.slice(0, 7) !== key) sheet.date = defaultDate(key);
      html += "<h3>Add " + esc(recipe ? recipe.title : "") + "</h3>";
      html += '<div class="planner-bar"><button type="button" data-planner-act="add-month-prev" aria-label="Previous month">Prev</button>' +
        "<h3 class=\"planner-title\">" + esc(monthName(key)) + "</h3>" +
        '<button type="button" data-planner-act="add-month-next" aria-label="Next month">Next</button></div>';
      html += '<label>Day<select data-planner-field="add-date">';
      dateList(key).forEach(function (info) {
        var selected = info.date === sheet.date;
        html += '<option value="' + info.date + '"' + (selected ? " selected" : "") + ">" + esc(info.name + " " + info.day + " " + MONTHS[info.date.slice(5, 7) * 1].slice(0, 3)) + "</option>";
      });
      html += "</select></label>";
      html += '<div class="planner-actions">';
      enabled(ensureMonth(store, key)).forEach(function (slot) {
        if (!recipe || !allows(recipe, slot.key)) return;
        html += '<button type="button" data-planner-act="add-slot" data-slot="' + slot.key + '">' + slot.label + "</button>";
      });
      html += "</div>";
    } else if (sheet.type === "apply") {
      var template = store.templates[sheet.id];
      var target = sheet.month || currentMonth();
      var count = sheet.count || filledCount(target);
      html += "<h3>Replace " + esc(monthName(target)) + "?</h3>" +
        "<p>" + esc(template ? template.name : "This template") + " — this month has " + count + " entries. You can undo afterwards.</p>" +
        '<button type="button" class="planner-primary" data-planner-act="confirm-apply" data-mode="replace">Replace</button>' +
        '<button type="button" data-planner-act="confirm-apply" data-mode="fill">Fill only empty</button>';
    } else if (sheet.type === "clear") {
      html += "<h3>Clear all " + sheet.count + " entries in " + esc(monthName(sheet.month)) + "?</h3>" +
        '<button type="button" class="planner-primary" data-planner-act="confirm-clear">Clear</button>';
    } else if (sheet.type === "delete") {
      var victim = store.recipes[sheet.id];
      var count = usage(sheet.id).length;
      html += "<h3>Delete " + esc(victim ? victim.title : "") + "?</h3><p>It is used on " + count + " slots.</p>" +
        '<button type="button" data-planner-act="confirm-delete">Delete and clear those slots</button>';
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
    html += '<button type="button" data-planner-act="close-sheet">Cancel</button></div></div>';
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
    if (act === "add-month-prev" || act === "add-month-next") {
      ui.sheet.month = shiftMonthKey(ui.sheet.month || currentMonth(), act === "add-month-next" ? 1 : -1);
      ui.sheet.date = defaultDate(ui.sheet.month);
      paint();
      return;
    }
    if (act === "add-slot") {
      var select = root.document.querySelector("[data-planner-field='add-date']");
      var date = select ? select.value : ui.sheet.date;
      var result = placeChange(monthOf(date), date, button.getAttribute("data-slot"), ui.sheet.id);
      ui.sheet = null;
      if (result.stale || result.error) { ui.error = result.error || ui.syncNote; paint(); return; }
      ui.error = "";
      ui.screen = "plan";
      setMonth(monthOf(date));
      paint();
      return;
    }
    if (act === "swap") {
      var month = ensureMonth(store, currentMonth());
      if (month.status === "locked") {
        say(shortMonth(currentMonth()) + " is locked.");
        paint();
        return;
      }
      ui.sheet = { type: "swap", date: button.getAttribute("data-date"), slot: button.getAttribute("data-slot"), query: "" };
      paint();
      return;
    }
    if (act === "place") {
      var placed = placeChange(currentMonth(), ui.sheet.date, ui.sheet.slot, button.getAttribute("data-id"));
      if (placed.error) ui.error = placed.error;
      else ui.error = "";
      ui.sheet = null;
      paint();
      return;
    }
    if (act === "repeat") { repeatWeekday(currentMonth(), ui.sheet.date, ui.sheet.slot); ui.sheet = null; paint(); return; }
    if (act === "close-sheet") { ui.sheet = null; paint(); return; }
    if (act === "auto") { autoOrganise(currentMonth()); paint(); return; }
    if (act === "clear-week") { clearRange(currentMonth(), button.getAttribute("data-from"), button.getAttribute("data-to")); paint(); return; }
    if (act === "clear-month") {
      var askClear = requestClear(currentMonth());
      if (askClear.needsConfirm) ui.sheet = { type: "clear", month: askClear.month, count: askClear.count };
      paint();
      return;
    }
    if (act === "confirm-clear") { clearMonth(ui.sheet.month || currentMonth()); ui.sheet = null; paint(); return; }
    if (act === "undo") { undo(); paint(); return; }
    if (act === "week-prev") { shiftWeek(-1); paint(); return; }
    if (act === "week-next") { shiftWeek(1); paint(); return; }
    if (act === "month-prev") { shiftMonth(-1); paint(); return; }
    if (act === "month-next") { shiftMonth(1); paint(); return; }
    if (act === "fit") {
      var fitted = store.recipes[button.getAttribute("data-id")];
      if (!fitted || isSmoothie(fitted)) { paint(); return; }
      var fit = button.getAttribute("data-fit");
      var nextFits = (fitted.fits || []).slice();
      var at = nextFits.indexOf(fit);
      if (at === -1) nextFits.push(fit);
      else if (nextFits.length > 1) nextFits.splice(at, 1);
      fitted.fits = nextFits;
      normaliseFits(fitted);
      save();
      paint();
      return;
    }
    if (act === "purpose") {
      var glass = store.recipes[button.getAttribute("data-id")];
      if (!glass) { paint(); return; }
      glass.purpose = button.getAttribute("data-purpose") === "recovery" ? "recovery" : "energy";
      glass.fits = ["smoothie"];
      normaliseFits(glass);
      save();
      paint();
      return;
    }
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
      if (ensureMonth(store, currentMonth()).status === "locked") {
        ui.sheet = { type: "unlock", month: currentMonth() };
        paint();
        return;
      }
      lockMonth(currentMonth());
      paint();
      return;
    }
    if (act === "ask-unlock") {
      ui.sheet = { type: "unlock", month: button.getAttribute("data-month") || currentMonth() };
      paint();
      return;
    }
    if (act === "confirm-unlock") { unlockMonth((ui.sheet && ui.sheet.month) || currentMonth()); ui.sheet = null; paint(); return; }
    if (act === "templates") { ui.sheet = { type: "templates", name: "" }; paint(); return; }
    if (act === "save-template") {
      var nameInput = root.document.querySelector("[data-planner-field='template-name']");
      saveTemplate(currentMonth(), nameInput ? nameInput.value : "");
      ui.sheet = { type: "templates", name: "" };
      paint();
      return;
    }
    if (act === "apply-template") {
      var pending = applyTemplate(button.getAttribute("data-id"), currentMonth(), false);
      if (pending.needsConfirm) {
        ui.sheet = { type: "apply", id: button.getAttribute("data-id"), month: currentMonth(), count: pending.count };
        paint();
        return;
      }
      ui.sheet = null;
      ui.screen = "plan";
      paint();
      return;
    }
    if (act === "confirm-apply") {
      applyTemplate(ui.sheet.id, ui.sheet.month || currentMonth(), button.getAttribute("data-mode") || "replace");
      ui.sheet = null;
      ui.screen = "plan";
      paint();
      return;
    }
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
    if (act === "toggle-prep") { ui.prepSet = true; ui.showPrep = !ui.showPrep; paint(); return; }
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
    var next = door === "smoothies" ? "smoothies" : "food";
    if (ui.toast && ui.toast.cabin !== next) clearBanner();
    ui.door = next;
    ui.screen = screen || "recipes";
    if (ui.screen === "recipes") ui.filter = ui.door === "smoothies" ? "smoothie" : "meal";
    ui.sheet = null;
    read();
    revealNotice();
    paint();
  }

  function sync(door, screen) {
    if (door !== "food" && door !== "smoothies") {
      clearBanner();
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
    if (ui.toast) {
      clearBanner();
      return true;
    }
    if (ui.sheet || ui.draft) {
      ui.sheet = null;
      ui.draft = null;
      paint();
      return true;
    }
    return false;
  }

  root.NexusBanner = {
    show: function (opts) {
      opts = opts || {};
      showBanner(opts.text, {
        cabin: opts.cabin,
        undoId: opts.undoId || null,
        onUndo: typeof opts.undo === "function" ? opts.undo : null,
        label: opts.label || opts.text
      });
    },
    clear: function (cabin) { clearBanner(cabin); }
  };

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
      clearMonth: clearMonth,
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
      syncNote: function () { return ui.syncNote; },
      rev: function () { return read().rev; },
      candidates: function (slot) {
        return candidates(read(), slot).map(function (recipe) { return recipe.id; });
      },
      futureMonths: futureMonths,
      clampMonth: clampMonth,
      lint: function (id) { return textIssues(read().recipes[id]); },
      cardView: function (id) {
        var recipe = read().recipes[id];
        if (!recipe) return null;
        return {
          title: recipe.title,
          tag: tagFor(recipe),
          lines: (recipe.ingredients || []).map(ingredientLine).filter(Boolean),
          blend: isSmoothie(recipe) ? "Blend all until smooth." : "",
          source: recipe.source || "",
          fits: (recipe.fits || []).slice()
        };
      },
      duplicateTitles: function () {
        var seen = {};
        var dups = [];
        Object.keys(read().recipes).forEach(function (id) {
          var title = normTitle(read().recipes[id].title);
          if (seen[title]) dups.push(title);
          seen[title] = id;
        });
        return dups;
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
      enabledSlots: function (key) {
        return enabled(ensureMonth(read(), key)).map(function (slot) { return slot.label; });
      },
      month: function (key) { return ensureMonth(read(), key); },
      toast: function () { return ui.toast; },
      filled: filledCount,
      slotTitle: slotTitle,
      weekDates: function (key) { return visibleWeek(key); },
      shiftWeek: shiftWeek,
      setMonth: setMonth,
      requestClear: requestClear,
      place: placeChange
    }
  };

  if (root.document && root.document.getElementById) bind();
  if (root.addEventListener) {
    root.addEventListener("storage", onStorage);
    root.addEventListener("pagehide", function () { clearBanner(); });
  }
})(typeof window !== "undefined" ? window : globalThis);
