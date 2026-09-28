/* Relic Food OS — weekly fuel schedule.
   Reads an already-built training day only to copy cabin names and pick a plate.
   Does not write completions, open the player, or touch the CUE panel. */
window.RELIC_FOOD_SCHEDULE = (function () {
  var ROTATION = {
    MON: "Chicken",
    TUE: "Salmon",
    WED: "Eggs",
    THU: "Chicken",
    FRI: "Salmon",
    SAT: "Beef Mince",
    SUN: "Chicken"
  };
  var LIVE_DAY = {
    MON: {
      smoothie: "live-mon-banana-blueberry",
      lunch: "Eggs, spinach, and leftover veg. Cook the whites.",
      mealId: "chicken-broccoli-carrot",
      protein: "Chicken",
      carb: "Rice",
      portionLabel: "1 British chicken breast · broccoli and 1 carrot · rice or potato from the bag",
      precise: false
    },
    TUE: {
      smoothie: "live-tue-papaya-pineapple",
      lunch: "Yogurt, kiwi, and a few nuts. Not a Brazil pile.",
      mealId: "salmon-greens-potato",
      protein: "Salmon",
      carb: "Potatoes",
      portionLabel: "1 ASC salmon fillet · a plate of greens · 1 potato",
      precise: false
    },
    WED: {
      smoothie: "live-wed-mango-cherry",
      lunch: "Chicken leftover wrap and salad.",
      mealId: "eggs-mushroom-greens",
      protein: "Eggs",
      carb: "Rice",
      portionLabel: "2 eggs · mushrooms · a plate of greens. Whites cooked through.",
      precise: false
    },
    THU: {
      smoothie: "live-thu-kiwi-berry",
      lunch: "Salmon leftover and veg.",
      mealId: "chicken-thigh-tray",
      protein: "Chicken",
      carb: "Potatoes",
      portionLabel: "1 chicken thigh tray · 1 tray of mixed veg",
      precise: false
    },
    FRI: {
      smoothie: "live-fri-pineapple-ginger",
      lunch: "Eggs. Cook the whites.",
      mealId: "salmon-or-white-fish",
      protein: "Salmon",
      carb: "Rice",
      portionLabel: "1 salmon or white-fish fillet · greens · rice from the 1 kg bag",
      precise: false
    },
    SAT: {
      smoothie: "live-sat-banana-blueberry",
      lunch: "Bigger cooked breakfast. Eggs, with the whites set.",
      mealId: "beef-stuffed-potato-boats",
      protein: "Beef Mince",
      carb: "Potatoes",
      portionLabel: "300 g ground beef from the potato-boat card · 3 potatoes",
      precise: true
    }
  };
  var LOAD = {
    Legs_Glutes: 3,
    Target_Weights: 3,
    Hanging: 2,
    Calisthenics: 3,
    Chest: 2,
    Back: 2,
    Upper_Arms: 1,
    Resistance_Bands: 1,
    Abs_Pelvic: 1,
    Hand_Wrist_Forearm: 1,
    Posture_Mobility: 0,
    Neck: 0,
    Face: 0,
    Eyes: 0,
    Tongue: 0,
    Jaw: 0
  };

  function shop() { return window.RELIC_FOOD_SHOP; }
  function meals() { return window.RELIC_FOOD_MEALS; }
  function extractions() { return window.RELIC_FOOD_EXTRACTIONS; }

  function loadScore(day) {
    if (!day || day.isRecovery || !day.cabins || !day.cabins.length) return 0;
    var score = 0;
    day.cabins.forEach(function (cabin) { score += LOAD[cabin] || 0; });
    return score;
  }

  function bandFor(day, score) {
    if (!day || day.isRecovery || score <= 1) return "restorative";
    if (score >= 4) return "intense";
    return "moderate";
  }

  function liveFor(dayName) {
    return LIVE_DAY[dayName] || LIVE_DAY.MON;
  }

  function portionsFor(dayName) {
    var live = liveFor(dayName);
    return {
      label: live.portionLabel,
      precise: !!live.precise,
      proteinName: live.protein,
      fruitPortions: 2,
      vegPortions: 3
    };
  }

  function mealFor(protein) {
    if (protein === "Turkey Mince") return "mince-pasta-frozen-veg";
    if (protein === "Beef Mince") return "beef-stuffed-potato-boats";
    if (protein === "Salmon") return "salmon-greens-potato";
    if (protein === "Eggs") return "eggs-mushroom-greens";
    return "chicken-broccoli-carrot";
  }

  var PROTEIN_SKUS = {
    Chicken: ["chicken"],
    "Turkey Mince": ["turkey"],
    "Beef Mince": ["beef10", "beef5"],
    Salmon: ["salmonFresh", "salmonFrozen", "salmonWaitrose"],
    Eggs: ["eggsPasture", "eggsSo", "eggsOmega"]
  };
  var PROTEIN_FALLBACK = ["Chicken", "Turkey Mince", "Beef Mince", "Salmon", "Eggs"];

  function basketHas(ids, skuList) {
    var i;
    for (i = 0; i < skuList.length; i++) {
      if (ids.indexOf(skuList[i]) !== -1) return true;
    }
    return false;
  }

  function composeFromBasket(day, skuIds) {
    var ids = Array.isArray(skuIds) ? skuIds : [];
    var cue = cueForDay(day);
    cue.plan = "locked";
    if (!ids.length || cue.protein === "Flex") return cue;
    var current = cue.protein;
    if (basketHas(ids, PROTEIN_SKUS[current] || [])) return cue;
    var next = "";
    PROTEIN_FALLBACK.forEach(function (name) {
      if (!next && basketHas(ids, PROTEIN_SKUS[name] || [])) next = name;
    });
    if (!next) return cue;
    cue.protein = next;
    cue.carb = next === "Salmon" || next === "Beef Mince" ? "Potatoes" : "Rice";
    cue.mealId = mealFor(next);
    cue.portions = {
      label: next === "Eggs"
        ? "Eggs from the locked basket. Cook the whites. Taste the Difference, then SO Organic, then standard free-range."
        : next + " from the locked basket. Household portion.",
      precise: next === "Beef Mince",
      proteinName: next,
      fruitPortions: 2,
      vegPortions: 3
    };
    var meal = meals().meals[cue.mealId];
    if (meal) cue.mealName = meal.name;
    return cue;
  }

  function cueForDay(day) {
    var apiShop = shop();
    var apiMeals = meals();
    var apiExtract = extractions();
    var tier = apiShop.tierFor(day && day.year, day && day.month);
    var score = loadScore(day);
    var band = bandFor(day, score);
    var live = liveFor(day && day.dayName);
    var mealId = live.mealId;
    var extractionId = live.smoothie;
    var meal = apiMeals.meals[mealId];
    var extraction = apiExtract.cards[extractionId];
    var portions = portionsFor(day && day.dayName);
    return {
      dateKey: day ? day.dateKey : "",
      year: day && day.year,
      month: day && day.month,
      dayName: day ? day.dayName : "",
      cabins: day && day.cabins ? day.cabins.slice() : [],
      tier: tier.id,
      budgetLabel: tier.budgetLabel,
      loadScore: score,
      band: band,
      protein: live.protein,
      carb: live.carb,
      rotationProtein: live.protein,
      lunch: live.lunch,
      mealProtein: live.protein,
      portions: portions,
      fruitPortions: 2,
      vegPortions: 3,
      mealId: mealId,
      mealName: meal ? meal.name : "",
      extractionId: extractionId,
      extractionName: extraction ? extraction.name : "",
      smoothieId: extractionId,
      smoothieName: extraction ? extraction.name : "",
      morning: apiExtract.morningDoses(band),
      plan: "suggested"
    };
  }

  function indexDays(source, year, months, into) {
    if (!source || !source.buildMonthDays) return;
    months.forEach(function (month) {
      source.buildMonthDays(year, month).forEach(function (day) {
        if (!day || day.isRecovery || day.dayIndex >= 6) return;
        into[day.dateKey] = cueForDay(day);
      });
    });
  }

  function buildFuelDays() {
    var fuelDays = {};
    indexDays(window.RELIC_PRECONDITION, 2026, [10, 11, 12], fuelDays);
    if (window.RELIC_SCHEDULE && window.RELIC_SCHEDULE.buildMonthDays) {
      var months = [];
      for (var month = 1; month <= 12; month++) months.push(month);
      indexDays(window.RELIC_SCHEDULE, 2027, months, fuelDays);
    }
    return fuelDays;
  }

  function audit() {
    var problems = [];
    var apiShop = shop();
    var apiMeals = meals();
    var apiExtract = extractions();
    if (!apiShop || !apiMeals || !apiExtract) problems.push("missing namespace");
    ["2026-10", "2026-11", "2026-12", "2027-01"].forEach(function (key) {
      var row = apiShop.shoppingLists[key];
      if (!row) problems.push("missing " + key);
      else if (row.tier !== 1) problems.push(key + " tier");
      else if (row.totalPence > 15000) problems.push(key + " over £150: " + row.totalPence);
      else if (row.headroomPence < 0) problems.push(key + " headroom");
    });
    var template = apiShop.shoppingLists["2027-02+"];
    if (!template || template.tier !== 2) problems.push("missing tier 2 template");
    else if (template.totalPence > 30000) problems.push("tier 2 over £300: " + template.totalPence);
    if (apiShop.proteins.join("|") !== "Chicken|Turkey Mince|Beef Mince|Salmon|Eggs") problems.push("proteins");
    if (apiShop.eggsBanned) problems.push("eggs banned");
    if ((apiShop.eggPreference || []).join("|") !== "eggsPasture|eggsSo|eggsOmega") problems.push("egg preference");
    Object.keys(apiShop.shoppingLists).forEach(function (key) {
      var ids = (apiShop.shoppingLists[key].items || []).map(function (item) { return item.skuId; });
      if (ids.indexOf("eggsPasture") === -1 && ids.indexOf("eggsSo") === -1 && ids.indexOf("eggsOmega") === -1) {
        problems.push("missing eggs " + key);
      }
    });
    if (apiShop.carbs.join("|") !== "Potatoes|Rice") problems.push("carbs");
    if (apiShop.laws.length !== 5) problems.push("laws");
    [
      "crispy-potato-snack",
      "cheesy-roasted-garlic-bread",
      "cheesy-potato-toast",
      "beef-stuffed-potato-boats",
      "chicken-broccoli-carrot",
      "salmon-greens-potato",
      "eggs-mushroom-greens",
      "paprika-potato-egg-skillet",
      "omega3-egg-rest-plate"
    ].forEach(function (id) {
      var card = apiMeals.present(id, 1);
      if (!card) problems.push("missing meal " + id);
      else {
        if (!card.tagline || !card.script || !card.yield) problems.push("hero " + id);
        if (!card.prepMin || !card.cookLabel || !card.tierFact) problems.push("facts " + id);
        if (!card.ingredients.length || !card.method.length) problems.push("body " + id);
        card.method.forEach(function (step) {
          if (!step.verb || !step.detail) problems.push("verb " + id);
        });
        if (!card.timetable || !card.timetable.bestFor || !card.timetable.bestEaten || !card.timetable.reheat) {
          problems.push("timetable " + id);
        }
        if (!card.tip) problems.push("tip " + id);
      }
    });
    apiExtract.order.forEach(function (id) {
      var card = apiExtract.present(id, 1);
      var verbs = card.method.map(function (step) { return step.verb; }).join(" ");
      var expected = ["Pour", "Add", "Add", "Add", "Blend", "Strain", "Whisk"];
      var got = card.method.map(function (step) { return step.verb; });
      if (got.join("|") !== expected.join("|")) problems.push(id + " order " + verbs);
      var text = card.method.map(function (step) { return step.verb + " " + step.detail; }).join(" ");
      if (text.indexOf("3000W") === -1) problems.push(id + " blender");
      if (text.indexOf("Cheesecloth") === -1) problems.push(id + " strain");
      if (/4\s*[-–]\s*5/.test(text)) problems.push(id + " brazil pile");
      if (id === "berry-banana-brazil" && text.indexOf("One Brazil nut") === -1 && text.indexOf("one a day") === -1) {
        problems.push(id + " brazil cap");
      }
      if (card.lock.indexOf("Not dinner") === -1) problems.push(id + " lock");
      if (apiExtract.sequence.join("|") !== "liquid|frozen fruit|citrus|hemp|3000W blend|cheesecloth strain|botanicals") {
        problems.push("sequence");
      }
    });
    var fuelDays = buildFuelDays();
    var jan1 = fuelDays["2027-01-01"];
    if (!jan1 || jan1.mealId !== "salmon-or-white-fish" || jan1.extractionId !== "live-fri-pineapple-ginger" || jan1.tier !== 1) {
      problems.push("jan 1 fuel");
    }
    var jan2 = fuelDays["2027-01-02"];
    if (!jan2 || jan2.extractionId !== "live-sat-banana-blueberry" || jan2.mealId !== "beef-stuffed-potato-boats") {
      problems.push("jan 2 fuel");
    }
    ["berry-banana-brazil", "cherry-banana-cream", "mango-banana-nut", "berry-oat-almond", "orange-berry-yogurt"].forEach(function (id) {
      if (!apiExtract.cards[id] || !apiExtract.present(id, 1)) problems.push("smoothie " + id);
    });
    if (!jan1 || !jan1.portions || !jan1.portions.label || jan1.portions.precise || jan1.fruitPortions !== 2 || jan1.vegPortions !== 3) {
      problems.push("jan 1 portions");
    }
    if (!jan1 || jan1.lunch.indexOf("Eggs") === -1) problems.push("jan 1 lunch eggs");
    var jan6 = fuelDays["2027-01-06"];
    if (!jan6 || jan6.protein !== "Eggs" || jan6.mealId !== "eggs-mushroom-greens") problems.push("wednesday eggs");
    if (!jan1.smoothieName) problems.push("jan 1 smoothie");
    if (window.RELIC_SCHEDULE && window.RELIC_SCHEDULE.buildMonthDays) {
      var monday = null;
      window.RELIC_SCHEDULE.buildMonthDays(2027, 2).forEach(function (day) {
        if (!monday && day.dayName === "MON") monday = day;
      });
      if (!monday) problems.push("compose day");
      else {
        var swapped = composeFromBasket(monday, ["turkey"]);
        if (swapped.plan !== "locked" || swapped.protein !== "Turkey Mince") problems.push("compose " + (swapped && swapped.protein));
        var eggSwap = composeFromBasket(monday, ["eggsOmega"]);
        if (eggSwap.protein !== "Eggs" || eggSwap.mealId !== "eggs-mushroom-greens") problems.push("egg compose");
      }
    }
    if (apiShop.tierFor(2027, 2).id !== 2) problems.push("feb tier");
    if (apiShop.tierFor(2026, 10).id !== 1 || apiShop.tierFor(2027, 1).id !== 1) problems.push("tier 1 window");
    Object.keys(fuelDays).forEach(function (dateKey) {
      var cue = fuelDays[dateKey];
      if (!cue.morning || cue.morning.length !== 5) problems.push("morning " + dateKey);
      if (cue.dayName === "WED" && cue.protein !== "Eggs") problems.push("wed eggs " + dateKey);
      if (dateKey.slice(8, 10) === "00" || /Sunday/.test(cue.dayName)) problems.push("sunday " + dateKey);
    });
    var bridgeCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2026-") === 0; }).length;
    var yearCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2027-") === 0; }).length;
    if (bridgeCount < 70) problems.push("bridge fuel days " + bridgeCount);
    if (yearCount < 300) problems.push("year fuel days " + yearCount);
    return { ok: problems.length === 0, problems: problems, bridgeCount: bridgeCount, yearCount: yearCount };
  }

  return {
    build: "v19",
    rotation: ROTATION,
    cueForDay: cueForDay,
    composeFromBasket: composeFromBasket,
    buildFuelDays: buildFuelDays,
    audit: audit
  };
})();
