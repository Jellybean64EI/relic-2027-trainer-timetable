/* Relic Food OS — smoothie and 3000W extraction cards.
   Morning lock only. Botanicals go in after the cheesecloth strain.
   Does not read relic_completions, the player, or the CUE panel. */
window.RELIC_FOOD_EXTRACTIONS = (function () {
  var SEQUENCE = [
    "liquid",
    "frozen fruit",
    "citrus",
    "hemp",
    "3000W blend",
    "cheesecloth strain",
    "botanicals"
  ];

  var BOTANICALS = {
    ashwagandha: { id: "ashwagandha", name: "Ashwagandha", skuId: "ashwagandha", daily: "600 mg", recovery: "600 mg" },
    lionsMane: { id: "lionsMane", name: "Lion's Mane", skuId: "lionsMane", daily: "1000 mg", recovery: "1500 mg" },
    spirulina: { id: "spirulina", name: "Spirulina", skuId: "spirulina", daily: "3 g", recovery: "5 g" },
    psylliumHusk: { id: "psylliumHusk", name: "Psyllium Husk", skuId: "psyllium", daily: "5 g", recovery: "5 g" },
    shilajit: { id: "shilajit", name: "Shilajit", skuId: "shilajit", daily: "300 mg", recovery: "300 mg" }
  };

  function doses(band) {
    var key = band === "restorative" ? "recovery" : "daily";
    return ["ashwagandha", "lionsMane", "spirulina", "psylliumHusk", "shilajit"].map(function (id) {
      var row = BOTANICALS[id];
      return { id: row.id, name: row.name, skuId: row.skuId, text: row[key], timing: "morning" };
    });
  }

  function doseLine(band) {
    return doses(band).map(function (dose) { return dose.text + " " + dose.name; }).join(", ");
  }

  function ingredients(tierId, band) {
    var fruit = tierId === 2
      ? { skuId: "berries", qty: 160, text: "160 g frozen blueberries or Sainsbury's Frozen Summer Fruits" }
      : { skuId: "fruit", qty: 200, text: "200 g Sainsbury's Frozen Summer Fruits" };
    var base = [
      { skuId: "milk", qty: 250, text: "250 ml Sainsbury's SO Organic Whole Milk, or cold water if the organic bottle is out" },
      fruit,
      { skuId: "lemons", qty: 40, text: "40 g Sainsbury's SO Organic Lemons, peeled" },
      { skuId: "hemp", qty: 20, text: "20 g Sainsbury's Hulled Hemp Hearts" }
    ];
    doses(band).forEach(function (dose) {
      base.push({ skuId: dose.skuId, qty: 1, text: dose.text + " " + dose.name + " — after the strain" });
    });
    base.push({ skuId: "", qty: 1, text: "1 Brazil nut maximum, beside the glass, not in the jug" });
    return base;
  }

  function method(tierId, band) {
    var fruitDetail = tierId === 2
      ? "160 g frozen blueberries or Sainsbury's Frozen Summer Fruits."
      : "200 g Sainsbury's Frozen Summer Fruits.";
    var density = band === "restorative"
      ? "This is the heavy morning extraction for a lighter day. It is still not dinner."
      : "This is the daily morning smoothie. It is not dinner.";
    return [
      { verb: "Pour", detail: "250 ml Sainsbury's SO Organic Whole Milk into the 3000W jug. Use cold water if SO Organic milk is not on the shelf." },
      { verb: "Add", detail: "the frozen fruit next: " + fruitDetail },
      { verb: "Add", detail: "the citrus next: 40 g peeled Sainsbury's SO Organic Lemons." },
      { verb: "Add", detail: "20 g Sainsbury's Hulled Hemp Hearts." },
      { verb: "Blend", detail: "45 seconds on the 3000W motor until the cell walls shatter and no frost shards remain." },
      { verb: "Strain", detail: "through damp Sainsbury's Cheesecloth into a bowl. Stop. Do not add botanicals before this strain." },
      { verb: "Whisk", detail: doseLine(band) + " into the strained liquid. Psyllium goes in last. Do not return them to the blender. " + density + " One Brazil nut maximum, eaten beside the glass." }
    ];
  }

  var CARDS = {
    "morning-cell-shatter": {
      id: "morning-cell-shatter",
      name: "Morning 3000W Smoothie",
      tagline: "Smoothie every morning.",
      script: "Liquid, fruit, citrus, hemp. Strain. Then the botanicals.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "moderate",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 210, protein: 8, carb: 22, fat: 9 },
      tip: "Brazil nut maximum is one a day. Count it from the tin. Do not tip the bag into the jug."
    },
    "recovery-botanical-extraction": {
      id: "recovery-botanical-extraction",
      name: "Recovery Heavy Botanical Extraction",
      tagline: "The heavier morning glass.",
      script: "Same order. Larger Lion's Mane and spirulina after the strain.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "restorative",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 240, protein: 10, carb: 24, fat: 10 },
      tip: "A lighter training day still drinks this in the morning. It does not replace the evening plate."
    }
  };

  function present(id, tierId) {
    var card = CARDS[id];
    var shop = window.RELIC_FOOD_SHOP;
    if (!card || !shop) return null;
    var tier = tierId === 2 ? 2 : 1;
    var tierRow = shop.tiers[tier];
    return {
      id: card.id,
      kind: "extraction",
      name: card.name,
      tagline: card.tagline,
      script: card.script,
      yield: card.yield,
      prepMin: card.prepMin,
      cookLabel: card.cookLabel,
      lock: card.lock,
      sequence: SEQUENCE.slice(),
      band: card.band,
      ingredients: ingredients(tier, card.band),
      method: method(tier, card.band),
      macros: card.macros,
      tip: card.tip,
      tier: tier,
      budgetLabel: tierRow.budgetLabel,
      tierFact: "Tier " + tier + " · " + tierRow.budgetLabel,
      timetable: {
        bestFor: "Every morning",
        bestEaten: "Drink after the strain, the same morning",
        reheat: "Do not reheat. Blend a fresh glass."
      }
    };
  }

  return {
    build: "v18",
    sequence: SEQUENCE,
    botanicals: BOTANICALS,
    cards: CARDS,
    order: ["morning-cell-shatter", "recovery-botanical-extraction"],
    morningDoses: doses,
    present: present
  };
})();
