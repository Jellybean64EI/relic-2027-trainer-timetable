/* Relic Food OS — weekly fuel schedule.
   Reads an already-built training day only to copy cabin names and pick a plate.
   Does not write completions, open the player, or touch the CUE panel. */
window.RELIC_FOOD_SCHEDULE = (function () {
  var ROTATION = {
    MON: "Chicken",
    TUE: "Turkey Mince",
    WED: "Beef Mince",
    THU: "Salmon",
    FRI: "Eggs",
    SAT: "Chicken",
    SUN: "Eggs"
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

  function resolveProtein(dayName, band) {
    var rotationProtein = ROTATION[dayName] || "Chicken";
    if (band === "restorative") {
      return { protein: "Eggs", carb: "Rice", rotationProtein: rotationProtein };
    }
    if (band === "intense" && rotationProtein === "Eggs") {
      return { protein: "Beef Mince", carb: "Potatoes", rotationProtein: rotationProtein };
    }
    return {
      protein: rotationProtein,
      carb: rotationProtein === "Chicken" || rotationProtein === "Beef Mince" ? "Potatoes" : "Rice",
      rotationProtein: rotationProtein
    };
  }

  function mealFor(protein, band) {
    if (band === "restorative" || protein === "Eggs") return "omega3-egg-rest-plate";
    if (protein === "Beef Mince") return "beef-stuffed-potato-boats";
    if (protein === "Turkey Mince") return "turkey-mince-rice-skillet";
    if (protein === "Salmon") return "salmon-rice-plate";
    return "bulk-chicken-potato-plate";
  }

  function cueForDay(day) {
    var apiShop = shop();
    var apiMeals = meals();
    var apiExtract = extractions();
    var tier = apiShop.tierFor(day && day.year, day && day.month);
    var score = loadScore(day);
    var band = bandFor(day, score);
    var picked = resolveProtein(day && day.dayName, band);
    var mealId = mealFor(picked.protein, band);
    var extractionId = band === "restorative" ? "recovery-botanical-extraction" : "morning-cell-shatter";
    var meal = apiMeals.meals[mealId];
    var extraction = apiExtract.cards[extractionId];
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
      protein: picked.protein,
      carb: picked.carb,
      rotationProtein: picked.rotationProtein,
      mealId: mealId,
      mealName: meal ? meal.name : "",
      extractionId: extractionId,
      extractionName: extraction ? extraction.name : "",
      morning: apiExtract.morningDoses(band)
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
    if (apiShop.proteins.length !== 5) problems.push("proteins");
    if (apiShop.carbs.join("|") !== "Potatoes|Rice") problems.push("carbs");
    if (apiShop.laws.length !== 5) problems.push("laws");
    [
      "crispy-potato-snack",
      "cheesy-roasted-garlic-bread",
      "cheesy-potato-toast",
      "paprika-potato-egg-skillet",
      "beef-stuffed-potato-boats",
      "bread-egg-pan-pizza"
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
      if (text.indexOf("Brazil") === -1) problems.push(id + " brazil");
      if (card.lock.indexOf("Not dinner") === -1) problems.push(id + " lock");
      if (apiExtract.sequence.join("|") !== "liquid|frozen fruit|citrus|hemp|3000W blend|cheesecloth strain|botanicals") {
        problems.push("sequence");
      }
    });
    var fuelDays = buildFuelDays();
    var jan1 = fuelDays["2027-01-01"];
    if (!jan1 || jan1.band !== "intense" || jan1.mealId !== "beef-stuffed-potato-boats" || jan1.tier !== 1) {
      problems.push("jan 1 fuel");
    }
    var jan2 = fuelDays["2027-01-02"];
    if (!jan2 || jan2.band !== "restorative" || jan2.extractionId !== "recovery-botanical-extraction") {
      problems.push("jan 2 fuel");
    }
    if (apiShop.tierFor(2027, 2).id !== 2) problems.push("feb tier");
    if (apiShop.tierFor(2026, 10).id !== 1 || apiShop.tierFor(2027, 1).id !== 1) problems.push("tier 1 window");
    Object.keys(fuelDays).forEach(function (dateKey) {
      var cue = fuelDays[dateKey];
      if (!cue.morning || cue.morning.length !== 5) problems.push("morning " + dateKey);
      if (dateKey.slice(8, 10) === "00" || /Sunday/.test(cue.dayName)) problems.push("sunday " + dateKey);
    });
    var bridgeCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2026-") === 0; }).length;
    var yearCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2027-") === 0; }).length;
    if (bridgeCount < 70) problems.push("bridge fuel days " + bridgeCount);
    if (yearCount < 300) problems.push("year fuel days " + yearCount);
    return { ok: problems.length === 0, problems: problems, bridgeCount: bridgeCount, yearCount: yearCount };
  }

  return {
    build: "v18",
    rotation: ROTATION,
    cueForDay: cueForDay,
    buildFuelDays: buildFuelDays,
    audit: audit
  };
})();
