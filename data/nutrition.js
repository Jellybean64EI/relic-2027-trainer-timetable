/* Relic v17 — Nutritional Architecture & Unified Fuel Engine.
   window.RELIC_NUTRITION. Does not edit RELIC_SCHEDULE.MONTH_ROTATIONS,
   RELIC_UPPER_BODY, or RELIC_VIDEO_ARCHIVE.
   Fuel cues are paired beside an already-built training day.
   Prices are Sainsbury's / Waitrose product-style placeholders. */
window.RELIC_NUTRITION = (function () {
  var PROTEINS = ["Chicken", "Turkey Mince", "Beef Mince", "Salmon", "Eggs"];
  var CARBS = ["Potatoes", "Rice"];
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

  function sku(id, name, store, pricePence, packQty, unit, tierMin) {
    return {
      id: id,
      name: name,
      store: store,
      pricePence: pricePence,
      packQty: packQty,
      unit: unit,
      tierMin: tierMin || 1,
      priceBasis: "placeholder-sainsburys-style"
    };
  }

  var SKUS = {
    chicken: sku("chicken", "Sainsbury's British Whole Chicken 1.6kg", "Sainsbury's", 520, 1600, "g", 1),
    turkey: sku("turkey", "Sainsbury's British Turkey Mince 2% Fat 500g", "Sainsbury's", 325, 500, "g", 1),
    beef10: sku("beef10", "Sainsbury's British Beef Mince 10% Fat 500g", "Sainsbury's", 375, 500, "g", 1),
    beef5: sku("beef5", "Sainsbury's Taste the Difference British Beef Mince 5% Fat 500g", "Sainsbury's", 550, 500, "g", 2),
    salmonFrozen: sku("salmonFrozen", "Sainsbury's Frozen Boneless Salmon Fillets 360g", "Sainsbury's", 450, 360, "g", 1),
    salmonFresh: sku("salmonFresh", "Sainsbury's Taste the Difference Fresh Scottish Salmon Fillets 240g", "Sainsbury's", 675, 240, "g", 2),
    salmonWaitrose: sku("salmonWaitrose", "Waitrose Scottish Loch Muir Salmon Fillets 260g", "Waitrose", 795, 260, "g", 2),
    eggsOmega: sku("eggsOmega", "Sainsbury's Woodland Free Range Omega-3 Enriched Eggs 12", "Sainsbury's", 345, 12, "egg", 1),
    eggsPasture: sku("eggsPasture", "Sainsbury's Taste the Difference Pasture-Raised Eggs 10", "Sainsbury's", 395, 10, "egg", 1),
    potatoes: sku("potatoes", "Sainsbury's Maris Piper Potatoes 2.5kg", "Sainsbury's", 175, 2500, "g", 1),
    sweetPot: sku("sweetPot", "Sainsbury's Sweet Potatoes 1.25kg", "Sainsbury's", 155, 1250, "g", 2),
    rice: sku("rice", "Sainsbury's Easy Cook Long Grain Rice 1kg", "Sainsbury's", 125, 1000, "g", 1),
    fruit: sku("fruit", "Sainsbury's Frozen Summer Fruits 500g", "Sainsbury's", 220, 500, "g", 1),
    spinachF: sku("spinachF", "Sainsbury's Frozen Spinach 1kg", "Sainsbury's", 160, 1000, "g", 1),
    broccoliF: sku("broccoliF", "Sainsbury's Frozen Broccoli 900g", "Sainsbury's", 165, 900, "g", 1),
    peas: sku("peas", "Sainsbury's Frozen Garden Peas 900g", "Sainsbury's", 110, 900, "g", 1),
    mixedVeg: sku("mixedVeg", "Sainsbury's Frozen Mixed Vegetables 1kg", "Sainsbury's", 145, 1000, "g", 1),
    greenBeans: sku("greenBeans", "Sainsbury's Frozen Whole Green Beans 900g", "Sainsbury's", 155, 900, "g", 1),
    carrots: sku("carrots", "Sainsbury's Chantenay Carrots 500g", "Sainsbury's", 60, 500, "g", 1),
    cabbage: sku("cabbage", "Sainsbury's Savoy Cabbage", "Sainsbury's", 70, 1, "each", 1),
    mushrooms: sku("mushrooms", "Sainsbury's Closed Cup Mushrooms 300g", "Sainsbury's", 95, 300, "g", 1),
    garlic: sku("garlic", "Sainsbury's Garlic 3 bulb pack", "Sainsbury's", 55, 90, "g", 1),
    onion: sku("onion", "Sainsbury's White Onions 1kg", "Sainsbury's", 75, 1000, "g", 1),
    cheddar: sku("cheddar", "Sainsbury's Mature Cheddar 400g", "Sainsbury's", 275, 400, "g", 1),
    cheddarPremium: sku("cheddarPremium", "Sainsbury's Taste the Difference Extra Mature Cheddar 350g", "Sainsbury's", 375, 350, "g", 2),
    butter: sku("butter", "Sainsbury's British Salted Butter 250g", "Sainsbury's", 185, 250, "g", 1),
    passata: sku("passata", "Sainsbury's Tomato Passata 500g", "Sainsbury's", 55, 500, "g", 1),
    oil: sku("oil", "Sainsbury's Olive Oil 500ml", "Sainsbury's", 340, 500, "ml", 1),
    salt: sku("salt", "Sainsbury's Table Salt 750g", "Sainsbury's", 45, 750, "g", 1),
    lemons: sku("lemons", "Sainsbury's Lemons", "Sainsbury's", 30, 80, "g", 1),
    hemp: sku("hemp", "Sainsbury's Hulled Hemp Seeds 250g", "Sainsbury's", 340, 250, "g", 1),
    cheesecloth: sku("cheesecloth", "Sainsbury's Cheesecloth 1.5m", "Sainsbury's", 150, 1, "each", 1),
    bread: sku("bread", "Sainsbury's White Farmhouse Bloomer 800g", "Sainsbury's", 115, 800, "g", 1),
    ashwagandha: sku("ashwagandha", "Sainsbury's KSM-66 Ashwagandha Capsules 60", "Sainsbury's", 650, 60, "cap", 1),
    lionsMane: sku("lionsMane", "Sainsbury's Lion's Mane Fruiting Body Capsules 60", "Sainsbury's", 750, 60, "cap", 1),
    spirulina: sku("spirulina", "Sainsbury's Spirulina Powder 100g", "Sainsbury's", 450, 100, "g", 1),
    psyllium: sku("psyllium", "Sainsbury's Psyllium Husk 200g", "Sainsbury's", 275, 200, "g", 1),
    shilajit: sku("shilajit", "Sainsbury's Shilajit Resin 15g", "Sainsbury's", 850, 15, "g", 1),
    berries: sku("berries", "Sainsbury's Taste the Difference Fresh Blueberries 150g", "Sainsbury's", 250, 150, "g", 2),
    berriesW: sku("berriesW", "Waitrose Fresh Raspberries 150g", "Waitrose", 275, 150, "g", 2),
    spinachFresh: sku("spinachFresh", "Waitrose Baby Spinach 200g", "Waitrose", 165, 200, "g", 2),
    tenderstem: sku("tenderstem", "Waitrose Tenderstem Broccoli 200g", "Waitrose", 220, 200, "g", 2),
    avocado: sku("avocado", "Waitrose Ripe Avocados 2 pack", "Waitrose", 210, 2, "each", 2),
    yogurtW: sku("yogurtW", "Waitrose Essential Greek Yogurt 500g", "Waitrose", 180, 500, "g", 2)
  };

  var TIERS = {
    1: {
      id: 1,
      label: "Tier 1",
      budgetPence: 15000,
      budgetLabel: "£150",
      from: "2026-10-01",
      through: "2027-01-31",
      rangeLabel: "Oct 2026 – Jan 2027",
      stores: ["Sainsbury's"],
      priority: "Sainsbury's cost-effective muscle builders: bulk chicken, turkey mince, potatoes, rice, bulk eggs, frozen fruit for the blender. Omega-3 enriched and pasture-raised eggs stay on the list where those SKUs exist."
    },
    2: {
      id: 2,
      label: "Tier 2",
      budgetPence: 30000,
      budgetLabel: "£300",
      from: "2027-02-01",
      through: null,
      rangeLabel: "Feb 2027 onward",
      stores: ["Sainsbury's", "Waitrose"],
      priority: "Fresh salmon, premium beef mince, wider veg rotations, and Waitrose / Sainsbury's Taste the Difference ingredients."
    }
  };

  var BOTANICALS = {
    ashwagandha: {
      id: "ashwagandha",
      name: "Ashwagandha",
      skuId: "ashwagandha",
      timing: "morning",
      daily: { qty: 1, unit: "cap", text: "600 mg" },
      recovery: { qty: 1, unit: "cap", text: "600 mg" }
    },
    lionsMane: {
      id: "lionsMane",
      name: "Lion's Mane",
      skuId: "lionsMane",
      timing: "morning",
      daily: { qty: 2, unit: "cap", text: "1000 mg" },
      recovery: { qty: 3, unit: "cap", text: "1500 mg" }
    },
    spirulina: {
      id: "spirulina",
      name: "Spirulina",
      skuId: "spirulina",
      timing: "morning",
      daily: { qty: 3, unit: "g", text: "3 g" },
      recovery: { qty: 5, unit: "g", text: "5 g" }
    },
    psylliumHusk: {
      id: "psylliumHusk",
      name: "Psyllium Husk",
      skuId: "psyllium",
      timing: "morning",
      daily: { qty: 5, unit: "g", text: "5 g" },
      recovery: { qty: 5, unit: "g", text: "5 g" }
    },
    shilajit: {
      id: "shilajit",
      name: "Shilajit",
      skuId: "shilajit",
      timing: "morning",
      daily: { qty: 0.3, unit: "g", text: "300 mg" },
      recovery: { qty: 0.3, unit: "g", text: "300 mg" }
    }
  };

  function lines(pairs) {
    return pairs.map(function (pair) {
      return { skuId: pair[0], qty: pair[1] };
    });
  }

  var TIER1_CORE = lines([
    ["chicken", 4],
    ["turkey", 5],
    ["beef10", 4],
    ["salmonFrozen", 2],
    ["eggsOmega", 2],
    ["eggsPasture", 1],
    ["potatoes", 4],
    ["rice", 4],
    ["fruit", 4],
    ["garlic", 2],
    ["onion", 2],
    ["cheddar", 1],
    ["butter", 1],
    ["passata", 3],
    ["oil", 1],
    ["salt", 1],
    ["lemons", 8],
    ["hemp", 1],
    ["cheesecloth", 1],
    ["bread", 1],
    ["ashwagandha", 1],
    ["lionsMane", 1],
    ["spirulina", 1],
    ["psyllium", 1],
    ["shilajit", 1]
  ]);

  function withVeg(vegPairs) {
    return TIER1_CORE.concat(lines(vegPairs));
  }

  function listTotal(items) {
    var total = 0;
    items.forEach(function (item) {
      var entry = SKUS[item.skuId];
      total += entry.pricePence * item.qty;
    });
    return total;
  }

  function shopping(id, year, month, tierId, items, extra) {
    var tier = TIERS[tierId];
    var row = {
      id: id,
      year: year,
      month: month,
      tier: tierId,
      budgetPence: tier.budgetPence,
      budgetLabel: tier.budgetLabel,
      items: items,
      totalPence: listTotal(items),
      template: false,
      stores: tier.stores.slice()
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) { row[key] = extra[key]; });
    }
    row.headroomPence = row.budgetPence - row.totalPence;
    return row;
  }

  var SHOPPING = {
    "2026-10": shopping("2026-10", 2026, 10, 1, withVeg([["spinachF", 2], ["peas", 2]]), {
      vegNote: "October veg: frozen spinach and peas."
    }),
    "2026-11": shopping("2026-11", 2026, 11, 1, withVeg([["spinachF", 2], ["broccoliF", 1], ["carrots", 1]]), {
      vegNote: "November veg: frozen spinach, broccoli, and carrots."
    }),
    "2026-12": shopping("2026-12", 2026, 12, 1, withVeg([["mixedVeg", 2], ["mushrooms", 2], ["spinachF", 1]]), {
      vegNote: "December veg: frozen mixed vegetables, closed cup mushrooms, and spinach."
    }),
    "2027-01": shopping("2027-01", 2027, 1, 1, withVeg([["spinachF", 2], ["greenBeans", 1], ["cabbage", 1]]), {
      vegNote: "January veg: frozen spinach, green beans, and savoy cabbage."
    }),
    "2027-02+": shopping("2027-02+", 2027, 2, 2, lines([
      ["chicken", 4],
      ["turkey", 4],
      ["beef5", 6],
      ["salmonFresh", 8],
      ["salmonWaitrose", 2],
      ["eggsPasture", 4],
      ["eggsOmega", 2],
      ["potatoes", 4],
      ["sweetPot", 2],
      ["rice", 3],
      ["fruit", 4],
      ["berries", 4],
      ["berriesW", 2],
      ["spinachFresh", 4],
      ["tenderstem", 4],
      ["avocado", 4],
      ["mushrooms", 2],
      ["garlic", 2],
      ["onion", 2],
      ["cheddarPremium", 2],
      ["butter", 2],
      ["passata", 2],
      ["oil", 1],
      ["salt", 1],
      ["lemons", 12],
      ["hemp", 2],
      ["cheesecloth", 1],
      ["bread", 2],
      ["yogurtW", 4],
      ["ashwagandha", 1],
      ["lionsMane", 1],
      ["spirulina", 2],
      ["psyllium", 1],
      ["shilajit", 1]
    ]), {
      template: true,
      month: null,
      appliesFrom: "2027-02-01",
      vegNote: "February onward template: fresh salmon, premium beef, Waitrose veg rotation."
    })
  };

  function ing(skuId, qty, text) {
    return { skuId: skuId, qty: qty, text: text || "" };
  }

  function doseIng(botanical, band) {
    var dose = band === "restorative" ? botanical.recovery : botanical.daily;
    return ing(botanical.skuId, dose.qty, dose.text + " " + botanical.name);
  }

  function morningDoses(band) {
    var key = band === "restorative" ? "recovery" : "daily";
    return ["ashwagandha", "lionsMane", "spirulina", "psylliumHusk", "shilajit"].map(function (id) {
      var botanical = BOTANICALS[id];
      var dose = botanical[key];
      return {
        id: botanical.id,
        name: botanical.name,
        skuId: botanical.skuId,
        timing: "morning",
        qty: dose.qty,
        unit: dose.unit,
        text: dose.text
      };
    });
  }

  var MEALS = {
    "crispy-potato-snack": {
      id: "crispy-potato-snack",
      kind: "meal",
      name: "Crispy Potato Snack",
      role: "side",
      prepMin: 8,
      cookMin: "12–15",
      appliances: [
        { name: "Air fryer", params: "200°C · 12–15 min" }
      ],
      ingredients: {
        1: [
          ing("potatoes", 400, "400 g"),
          ing("oil", 10, "10 ml"),
          ing("salt", 2, "2 g")
        ],
        2: [
          ing("potatoes", 400, "400 g"),
          ing("oil", 10, "10 ml"),
          ing("salt", 2, "2 g")
        ]
      },
      method: {
        1: [
          "Scrub 400 g Sainsbury's Maris Piper Potatoes. Cut into 8 mm wedges. Pat dry.",
          "Toss with 10 ml Sainsbury's Olive Oil and 2 g Sainsbury's Table Salt until every face is coated.",
          "Load a single layer in the air fryer. Cook at 200°C for 12–15 minutes.",
          "Shake the basket at 7 minutes. Pull them when the edges are deep gold and the centres are dry."
        ],
        2: [
          "Scrub 400 g Sainsbury's Maris Piper Potatoes. Cut into 8 mm wedges. Pat dry.",
          "Toss with 10 ml Sainsbury's Olive Oil and 2 g Sainsbury's Table Salt until every face is coated.",
          "Load a single layer in the air fryer. Cook at 200°C for 12–15 minutes.",
          "Shake the basket at 7 minutes. Pull them when the edges are deep gold and the centres are dry."
        ]
      },
      macros: { kcal: 390, protein: 7, carb: 62, fat: 12 }
    },
    "cheesy-roasted-garlic-bread": {
      id: "cheesy-roasted-garlic-bread",
      kind: "meal",
      name: "Cheesy Roasted Garlic Bread",
      role: "side",
      prepMin: 8,
      cookMin: "6–8",
      appliances: [
        { name: "Microwave", params: "soften butter · 10 sec" },
        { name: "Air fryer", params: "180°C · 6–8 min" }
      ],
      ingredients: {
        1: [
          ing("bread", 160, "160 g"),
          ing("butter", 25, "25 g"),
          ing("cheddar", 40, "40 g"),
          ing("garlic", 10, "10 g"),
          ing("oil", 3, "3 ml")
        ],
        2: [
          ing("bread", 160, "160 g"),
          ing("butter", 25, "25 g"),
          ing("cheddarPremium", 40, "40 g"),
          ing("garlic", 10, "10 g"),
          ing("oil", 3, "3 ml")
        ]
      },
      method: {
        1: [
          "Cut 160 g Sainsbury's White Farmhouse Bloomer into four thick slices.",
          "Microwave 25 g Sainsbury's British Salted Butter for 10 seconds until soft. Mash in 10 g crushed Sainsbury's Garlic and 3 ml Sainsbury's Olive Oil.",
          "Spread the garlic butter to the crust edge. Cover with 40 g grated Sainsbury's Mature Cheddar.",
          "Air fry at 180°C for 6–8 minutes until the cheddar blisters and the crumb is hot."
        ],
        2: [
          "Cut 160 g Sainsbury's White Farmhouse Bloomer into four thick slices.",
          "Microwave 25 g Sainsbury's British Salted Butter for 10 seconds until soft. Mash in 10 g crushed Sainsbury's Garlic and 3 ml Sainsbury's Olive Oil.",
          "Spread the garlic butter to the crust edge. Cover with 40 g grated Sainsbury's Taste the Difference Extra Mature Cheddar.",
          "Air fry at 180°C for 6–8 minutes until the cheddar blisters and the crumb is hot."
        ]
      },
      macros: { kcal: 540, protein: 18, carb: 42, fat: 32 }
    },
    "beef-stuffed-potato-boats": {
      id: "beef-stuffed-potato-boats",
      kind: "meal",
      name: "Beef-Stuffed Potato Boats",
      role: "main",
      protein: "Beef Mince",
      carb: "Potatoes",
      prepMin: 15,
      cookMin: "16",
      appliances: [
        { name: "Microwave", params: "900W · 8 min" },
        { name: "Air fryer", params: "200°C · 8 min" }
      ],
      ingredients: {
        1: [
          ing("potatoes", 450, "450 g"),
          ing("beef10", 160, "160 g"),
          ing("onion", 40, "40 g"),
          ing("garlic", 6, "6 g"),
          ing("cheddar", 30, "30 g"),
          ing("butter", 15, "15 g"),
          ing("salt", 1, "1 g")
        ],
        2: [
          ing("potatoes", 450, "450 g"),
          ing("beef5", 180, "180 g"),
          ing("onion", 40, "40 g"),
          ing("garlic", 6, "6 g"),
          ing("cheddarPremium", 35, "35 g"),
          ing("butter", 15, "15 g"),
          ing("salt", 1, "1 g")
        ]
      },
      method: {
        1: [
          "Scrub 450 g Sainsbury's Maris Piper Potatoes. Microwave at 900W for 8 minutes, turning once, until a knife meets the centre.",
          "Brown 160 g Sainsbury's British Beef Mince 10% Fat with 40 g diced Sainsbury's White Onions and 6 g crushed Sainsbury's Garlic for 6 minutes. Season with 1 g Sainsbury's Table Salt.",
          "Split the potatoes. Scoop the centres into the mince and fold through. Spoon the filling back into the skins.",
          "Top with 30 g Sainsbury's Mature Cheddar and 15 g Sainsbury's British Salted Butter.",
          "Air fry at 200°C for 8 minutes until the cheese blisters and the skins crisp."
        ],
        2: [
          "Scrub 450 g Sainsbury's Maris Piper Potatoes. Microwave at 900W for 8 minutes, turning once, until a knife meets the centre.",
          "Brown 180 g Sainsbury's Taste the Difference British Beef Mince 5% Fat with 40 g diced Sainsbury's White Onions and 6 g crushed Sainsbury's Garlic for 6 minutes. Season with 1 g Sainsbury's Table Salt.",
          "Split the potatoes. Scoop the centres into the mince and fold through. Spoon the filling back into the skins.",
          "Top with 35 g Sainsbury's Taste the Difference Extra Mature Cheddar and 15 g Sainsbury's British Salted Butter.",
          "Air fry at 200°C for 8 minutes until the cheese blisters and the skins crisp."
        ]
      },
      macros: { kcal: 710, protein: 46, carb: 58, fat: 30 }
    },
    "turkey-mince-rice-skillet": {
      id: "turkey-mince-rice-skillet",
      kind: "meal",
      name: "Turkey Mince Rice Skillet",
      role: "main",
      protein: "Turkey Mince",
      carb: "Rice",
      prepMin: 10,
      cookMin: "18",
      appliances: [
        { name: "Microwave", params: "rice · 10 min covered" },
        { name: "Hob", params: "skillet · 8 min" }
      ],
      ingredients: {
        1: [
          ing("turkey", 200, "200 g"),
          ing("rice", 80, "80 g dry"),
          ing("onion", 50, "50 g"),
          ing("passata", 80, "80 g"),
          ing("spinachF", 60, "60 g"),
          ing("oil", 5, "5 ml"),
          ing("salt", 1, "1 g")
        ],
        2: [
          ing("turkey", 220, "220 g"),
          ing("rice", 80, "80 g dry"),
          ing("onion", 40, "40 g"),
          ing("passata", 80, "80 g"),
          ing("spinachFresh", 40, "40 g"),
          ing("oil", 5, "5 ml"),
          ing("salt", 1, "1 g")
        ]
      },
      method: {
        1: [
          "Rinse 80 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 200 ml water, covered, for 10 minutes. Rest 2 minutes.",
          "Warm 5 ml Sainsbury's Olive Oil. Brown 200 g Sainsbury's British Turkey Mince 2% Fat with 50 g Sainsbury's White Onions for 5 minutes.",
          "Stir in 80 g Sainsbury's Tomato Passata and 60 g Sainsbury's Frozen Spinach. Simmer 3 minutes. Salt with 1 g Sainsbury's Table Salt.",
          "Fold the rice through the skillet and serve hot."
        ],
        2: [
          "Rinse 80 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 200 ml water, covered, for 10 minutes. Rest 2 minutes.",
          "Warm 5 ml Sainsbury's Olive Oil. Brown 220 g Sainsbury's British Turkey Mince 2% Fat with 40 g Sainsbury's White Onions for 5 minutes.",
          "Stir in 80 g Sainsbury's Tomato Passata and 40 g Waitrose Baby Spinach. Simmer 3 minutes. Salt with 1 g Sainsbury's Table Salt.",
          "Fold the rice through the skillet and serve hot."
        ]
      },
      macros: { kcal: 620, protein: 48, carb: 68, fat: 14 }
    },
    "bulk-chicken-potato-plate": {
      id: "bulk-chicken-potato-plate",
      kind: "meal",
      name: "Bulk Chicken Potato Plate",
      role: "main",
      protein: "Chicken",
      carb: "Potatoes",
      prepMin: 12,
      cookMin: "22",
      appliances: [
        { name: "Microwave", params: "potato · 900W · 7 min" },
        { name: "Air fryer", params: "200°C · 14 min" }
      ],
      ingredients: {
        1: [
          ing("chicken", 320, "320 g"),
          ing("potatoes", 350, "350 g"),
          ing("oil", 8, "8 ml"),
          ing("garlic", 4, "4 g"),
          ing("salt", 2, "2 g"),
          ing("spinachF", 80, "80 g")
        ],
        2: [
          ing("chicken", 340, "340 g"),
          ing("potatoes", 300, "300 g"),
          ing("sweetPot", 120, "120 g"),
          ing("oil", 8, "8 ml"),
          ing("garlic", 4, "4 g"),
          ing("salt", 2, "2 g"),
          ing("tenderstem", 80, "80 g")
        ]
      },
      method: {
        1: [
          "Portion 320 g meat from Sainsbury's British Whole Chicken 1.6kg. Rub with 4 g crushed Sainsbury's Garlic, 2 g Sainsbury's Table Salt, and 4 ml Sainsbury's Olive Oil.",
          "Air fry the chicken at 200°C for 14 minutes until the juices run clear.",
          "Microwave 350 g Sainsbury's Maris Piper Potatoes at 900W for 7 minutes. Split and dress with the remaining 4 ml oil.",
          "Microwave 80 g Sainsbury's Frozen Spinach for 2 minutes. Plate chicken, potato, and spinach together."
        ],
        2: [
          "Portion 340 g meat from Sainsbury's British Whole Chicken 1.6kg. Rub with 4 g crushed Sainsbury's Garlic, 2 g Sainsbury's Table Salt, and 4 ml Sainsbury's Olive Oil.",
          "Air fry the chicken at 200°C for 14 minutes until the juices run clear.",
          "Microwave 300 g Sainsbury's Maris Piper Potatoes and 120 g Sainsbury's Sweet Potatoes at 900W for 8 minutes. Split and dress with the remaining 4 ml oil.",
          "Steam 80 g Waitrose Tenderstem Broccoli for 3 minutes. Plate chicken, potatoes, and tenderstem together."
        ]
      },
      macros: { kcal: 680, protein: 52, carb: 54, fat: 22 }
    },
    "omega3-egg-rest-plate": {
      id: "omega3-egg-rest-plate",
      kind: "meal",
      name: "Omega-3 Egg Rest Plate",
      role: "main",
      protein: "Eggs",
      carb: "Rice",
      prepMin: 5,
      cookMin: "8",
      appliances: [
        { name: "Microwave", params: "rice · 8 min covered" },
        { name: "Hob", params: "soft scramble · 2 min" }
      ],
      ingredients: {
        1: [
          ing("eggsOmega", 3, "3 eggs"),
          ing("rice", 60, "60 g dry"),
          ing("butter", 8, "8 g"),
          ing("spinachF", 40, "40 g"),
          ing("salt", 1, "1 g")
        ],
        2: [
          ing("eggsPasture", 3, "3 eggs"),
          ing("rice", 50, "50 g dry"),
          ing("butter", 8, "8 g"),
          ing("spinachFresh", 40, "40 g"),
          ing("salt", 1, "1 g")
        ]
      },
      method: {
        1: [
          "Rinse 60 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 150 ml water, covered, for 8 minutes. Rest 1 minute.",
          "Whisk 3 Sainsbury's Woodland Free Range Omega-3 Enriched Eggs with 1 g Sainsbury's Table Salt.",
          "Soften 8 g Sainsbury's British Salted Butter in a pan. Scramble the eggs low and slow for 2 minutes. Fold in 40 g warmed Sainsbury's Frozen Spinach.",
          "Serve the eggs beside the rice. Keep the plate lighter than a training main. The heavy botanical extraction carries the morning stack."
        ],
        2: [
          "Rinse 50 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 130 ml water, covered, for 8 minutes. Rest 1 minute.",
          "Whisk 3 Sainsbury's Taste the Difference Pasture-Raised Eggs with 1 g Sainsbury's Table Salt.",
          "Soften 8 g Sainsbury's British Salted Butter in a pan. Scramble the eggs low and slow for 2 minutes. Fold in 40 g Waitrose Baby Spinach.",
          "Serve the eggs beside the rice. Keep the plate lighter than a training main. The heavy botanical extraction carries the morning stack."
        ]
      },
      macros: { kcal: 460, protein: 28, carb: 42, fat: 20 }
    },
    "salmon-rice-plate": {
      id: "salmon-rice-plate",
      kind: "meal",
      name: "Salmon Rice Plate",
      role: "main",
      protein: "Salmon",
      carb: "Rice",
      prepMin: 8,
      cookMin: "14",
      appliances: [
        { name: "Microwave", params: "rice · 10 min covered" },
        { name: "Air fryer", params: "190°C · 9 min" }
      ],
      ingredients: {
        1: [
          ing("salmonFrozen", 120, "120 g"),
          ing("rice", 80, "80 g dry"),
          ing("spinachF", 80, "80 g"),
          ing("lemons", 20, "20 g"),
          ing("oil", 4, "4 ml"),
          ing("salt", 1, "1 g")
        ],
        2: [
          ing("salmonFresh", 180, "180 g"),
          ing("rice", 80, "80 g dry"),
          ing("tenderstem", 80, "80 g"),
          ing("lemons", 20, "20 g"),
          ing("oil", 4, "4 ml"),
          ing("salt", 1, "1 g")
        ]
      },
      method: {
        1: [
          "Rinse 80 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 200 ml water, covered, for 10 minutes.",
          "Rub 120 g Sainsbury's Frozen Boneless Salmon Fillets with 4 ml Sainsbury's Olive Oil and 1 g Sainsbury's Table Salt. Air fry from frozen at 190°C for 9 minutes.",
          "Microwave 80 g Sainsbury's Frozen Spinach for 2 minutes. Squeeze 20 g Sainsbury's Lemons over the salmon.",
          "Plate salmon, rice, and spinach. This is the Tier 1 frozen fillet, not the fresh counter fish."
        ],
        2: [
          "Rinse 80 g Sainsbury's Easy Cook Long Grain Rice. Microwave in 200 ml water, covered, for 10 minutes.",
          "Rub 180 g Sainsbury's Taste the Difference Fresh Scottish Salmon Fillets with 4 ml Sainsbury's Olive Oil and 1 g Sainsbury's Table Salt. Air fry at 190°C for 9 minutes.",
          "Steam 80 g Waitrose Tenderstem Broccoli for 3 minutes. Squeeze 20 g Sainsbury's Lemons over the salmon.",
          "Plate salmon, rice, and tenderstem. Waitrose Scottish Loch Muir fillets are the shopping-list alternate for this same plate."
        ]
      },
      macros: { kcal: 640, protein: 42, carb: 66, fat: 20 }
    }
  };

  function extractionIngredients(band, tierId) {
    var doses = ["ashwagandha", "lionsMane", "spirulina", "psylliumHusk", "shilajit"].map(function (id) {
      return doseIng(BOTANICALS[id], band);
    });
    var base = tierId === 2
      ? [
          ing("fruit", 160, "160 g"),
          ing("berriesW", 40, "40 g"),
          ing("lemons", 80, "80 g"),
          ing("hemp", 20, "20 g")
        ]
      : [
          ing("fruit", 200, "200 g"),
          ing("lemons", 80, "80 g"),
          ing("hemp", 20, "20 g")
        ];
    return base.concat(doses);
  }

  function extractionMethod(band, tierId) {
    var doses = morningDoses(band).map(function (dose) {
      return dose.text + " " + dose.name;
    }).join(", ");
    var fruitLine = tierId === 2
      ? "Load 160 g Sainsbury's Frozen Summer Fruits into the 3000W jug first, then 40 g Waitrose Fresh Raspberries."
      : "Load 200 g Sainsbury's Frozen Summer Fruits into the 3000W jug first.";
    var density = band === "restorative"
      ? "This is the heavy botanical extraction for a recovery or lighter day."
      : "This is the daily morning extraction on a training day.";
    return [
      fruitLine,
      "Add the citrus next: 80 g peeled Sainsbury's Lemons.",
      "Add 20 g Sainsbury's Hulled Hemp Seeds, then 250 ml cold water.",
      "Blend 45 seconds on the 3000W motor until the cell walls shatter. The mix turns uniform and no frost shards remain.",
      "Mandatory cheesecloth strain: pour the blend through damp Sainsbury's Cheesecloth into a bowl. Stop. Do not add botanicals before this strain.",
      "Botanical add after the strain. Whisk " + doses + " into the strained liquid. Do not return them to the blender. Stir the psyllium from that add in last and drink with a full glass of water.",
      density
    ];
  }

  var EXTRACTIONS = {
    "morning-cell-shatter": {
      id: "morning-cell-shatter",
      kind: "extraction",
      name: "3000W Morning Cell-Shatter",
      role: "morning",
      prepMin: 6,
      cookMin: "1",
      appliances: [
        { name: "3000W blender", params: "45 sec · cell-wall shatter" },
        { name: "Cheesecloth", params: "mandatory strain before botanicals" }
      ],
      ingredients: {
        1: extractionIngredients("moderate", 1),
        2: extractionIngredients("moderate", 2)
      },
      method: {
        1: extractionMethod("moderate", 1),
        2: extractionMethod("moderate", 2)
      },
      macros: { kcal: 210, protein: 8, carb: 22, fat: 9 }
    },
    "recovery-botanical-extraction": {
      id: "recovery-botanical-extraction",
      kind: "extraction",
      name: "Recovery Heavy Botanical Extraction",
      role: "recovery",
      prepMin: 6,
      cookMin: "1",
      appliances: [
        { name: "3000W blender", params: "45 sec · cell-wall shatter" },
        { name: "Cheesecloth", params: "mandatory strain before botanicals" }
      ],
      ingredients: {
        1: extractionIngredients("restorative", 1),
        2: extractionIngredients("restorative", 2)
      },
      method: {
        1: extractionMethod("restorative", 1),
        2: extractionMethod("restorative", 2)
      },
      macros: { kcal: 240, protein: 10, carb: 24, fat: 10 }
    }
  };

  function formatGbp(pence) {
    var n = Math.round(Number(pence) || 0);
    var sign = n < 0 ? "-" : "";
    var abs = Math.abs(n);
    var pounds = Math.floor(abs / 100);
    var rem = abs % 100;
    return sign + "£" + pounds + "." + (rem < 10 ? "0" : "") + rem;
  }

  function tierFor(year, month) {
    var y = +year;
    var m = +month;
    if (y === 2027 && m >= 2) return TIERS[2];
    if (y > 2027) return TIERS[2];
    return TIERS[1];
  }

  function shoppingListFor(year, month) {
    var y = +year;
    var m = +month;
    var key = y + "-" + (m < 10 ? "0" : "") + m;
    if (SHOPPING[key]) return SHOPPING[key];
    if ((y === 2027 && m >= 2) || y > 2027) return SHOPPING["2027-02+"];
    return null;
  }

  function loadScore(day) {
    if (!day || day.isRecovery || !day.cabins || !day.cabins.length) return 0;
    var score = 0;
    day.cabins.forEach(function (cabin) {
      score += LOAD[cabin] || 0;
    });
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
      return {
        protein: "Eggs",
        carb: "Rice",
        alignment: "restorative-override",
        rotationProtein: rotationProtein
      };
    }
    if (band === "intense" && (rotationProtein === "Eggs")) {
      return {
        protein: "Beef Mince",
        carb: "Potatoes",
        alignment: "heavy-protein",
        rotationProtein: rotationProtein
      };
    }
    return {
      protein: rotationProtein,
      carb: rotationProtein === "Chicken" || rotationProtein === "Beef Mince" ? "Potatoes" : "Rice",
      alignment: band === "intense" ? "heavy-protein" : "rotation",
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
    var year = day && day.year;
    var month = day && day.month;
    var tier = tierFor(year, month);
    var score = loadScore(day);
    var band = bandFor(day, score);
    var picked = resolveProtein(day && day.dayName, band);
    var mealId = mealFor(picked.protein, band);
    var extractionId = band === "restorative" ? "recovery-botanical-extraction" : "morning-cell-shatter";
    var meal = MEALS[mealId];
    return {
      dateKey: day ? day.dateKey : "",
      year: year,
      month: month,
      dayName: day ? day.dayName : "",
      pair: day ? day.pair : "",
      cabins: day && day.cabins ? day.cabins.slice() : [],
      tier: tier.id,
      budgetLabel: tier.budgetLabel,
      loadScore: score,
      band: band,
      protein: picked.protein,
      carb: picked.carb,
      rotationProtein: picked.rotationProtein,
      alignment: picked.alignment,
      mealId: mealId,
      mealName: meal.name,
      extractionId: extractionId,
      extractionName: EXTRACTIONS[extractionId].name,
      cue: meal.name,
      morning: morningDoses(band)
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

  function ingredientCost(item) {
    var entry = SKUS[item.skuId];
    if (!entry || !entry.packQty) return 0;
    return Math.round(entry.pricePence * item.qty / entry.packQty);
  }

  function presentRecipe(id, tierId, band) {
    var recipe = MEALS[id] || EXTRACTIONS[id];
    if (!recipe) return null;
    var tier = tierId === 2 ? 2 : 1;
    var useBand = recipe.kind === "extraction"
      ? (recipe.id === "recovery-botanical-extraction" ? "restorative" : "moderate")
      : (band || "moderate");
    var ingredients = (recipe.ingredients[tier] || recipe.ingredients[1]).slice();
    if (recipe.kind === "extraction") {
      ingredients = extractionIngredients(useBand, tier);
    }
    var method = recipe.kind === "extraction"
      ? extractionMethod(useBand, tier)
      : (recipe.method[tier] || recipe.method[1]).slice();
    var cost = 0;
    ingredients.forEach(function (item) { cost += ingredientCost(item); });
    var tierRow = TIERS[tier];
    var macros = recipe.macros;
    var macroLine = "Macros & Cost · " + macros.kcal + " kcal · " +
      macros.protein + " g protein · " + macros.carb + " g carbohydrate · " +
      macros.fat + " g fat · " + formatGbp(cost) +
      " · Fits Tier " + tier + " " + tierRow.budgetLabel;
    return {
      id: recipe.id,
      kind: recipe.kind,
      name: recipe.name,
      prepMin: recipe.prepMin,
      cookMin: recipe.cookMin,
      appliances: recipe.appliances,
      ingredients: ingredients.map(function (item) {
        var entry = SKUS[item.skuId];
        return {
          skuId: item.skuId,
          qty: item.qty,
          text: item.text,
          product: entry ? entry.name : item.skuId,
          store: entry ? entry.store : "",
          line: (item.text || (item.qty + " " + (entry ? entry.unit : ""))) + " — " + (entry ? entry.name : item.skuId)
        };
      }),
      method: method,
      costPence: cost,
      tier: tier,
      budgetLabel: tierRow.budgetLabel,
      fitLabel: "Fits Tier " + tier + " " + tierRow.budgetLabel,
      macroLine: macroLine,
      macros: macros
    };
  }

  function audit() {
    var problems = [];
    ["2026-10", "2026-11", "2026-12", "2027-01"].forEach(function (key) {
      var row = SHOPPING[key];
      if (!row) problems.push("missing " + key);
      else if (row.tier !== 1) problems.push(key + " tier");
      else if (row.totalPence > 15000) problems.push(key + " over £150: " + row.totalPence);
    });
    var template = SHOPPING["2027-02+"];
    if (!template || template.tier !== 2) problems.push("missing tier 2 template");
    else if (template.totalPence > 30000) problems.push("tier 2 over £300: " + template.totalPence);
    if (PROTEINS.length !== 5) problems.push("protein rotation");
    if (CARBS.join("|") !== "Potatoes|Rice") problems.push("carbs");
    if (Object.keys(BOTANICALS).length !== 5) problems.push("botanicals");
    ["crispy-potato-snack", "cheesy-roasted-garlic-bread", "beef-stuffed-potato-boats"].forEach(function (id) {
      if (!MEALS[id]) problems.push("missing meal " + id);
      var card = presentRecipe(id, 1);
      if (!card || !card.ingredients.length || !card.method.length) problems.push("thin card " + id);
      if (card && card.macroLine.indexOf("Macros & Cost") !== 0) problems.push("macro tag " + id);
    });
    ["morning-cell-shatter", "recovery-botanical-extraction"].forEach(function (id) {
      var card = presentRecipe(id, 1);
      var text = card.method.join(" ");
      if (text.indexOf("3000W") === -1) problems.push(id + " blender");
      var strainAt = text.indexOf("cheesecloth");
      var addAt = text.indexOf("Botanical add");
      if (strainAt === -1 || addAt === -1 || strainAt > addAt) problems.push(id + " strain order");
      if (text.indexOf("Frozen") > text.indexOf("Lemons") || text.indexOf("Lemons") > text.indexOf("Hemp")) {
        problems.push(id + " load order");
      }
    });
    var fuelDays = buildFuelDays();
    var jan1 = fuelDays["2027-01-01"];
    if (!jan1 || jan1.band !== "intense" || jan1.mealId !== "beef-stuffed-potato-boats" || jan1.tier !== 1) {
      problems.push("jan 1 fuel " + JSON.stringify(jan1 && { band: jan1.band, mealId: jan1.mealId, tier: jan1.tier }));
    }
    var jan2 = fuelDays["2027-01-02"];
    if (!jan2 || jan2.band !== "restorative" || jan2.extractionId !== "recovery-botanical-extraction") {
      problems.push("jan 2 fuel");
    }
    if (tierFor(2027, 2).id !== 2) problems.push("feb tier");
    if (tierFor(2026, 10).id !== 1 || tierFor(2027, 1).id !== 1) problems.push("tier 1 window");
    Object.keys(fuelDays).forEach(function (dateKey) {
      var cue = fuelDays[dateKey];
      if (!cue.morning || cue.morning.length !== 5) problems.push("morning " + dateKey);
    });
    var bridgeCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2026-") === 0; }).length;
    var yearCount = Object.keys(fuelDays).filter(function (key) { return key.indexOf("2027-") === 0; }).length;
    if (bridgeCount < 70) problems.push("bridge fuel days " + bridgeCount);
    if (yearCount < 300) problems.push("year fuel days " + yearCount);
    return { ok: problems.length === 0, problems: problems, shopping: SHOPPING, fuelCount: Object.keys(fuelDays).length };
  }

  return {
    build: "v17",
    priceBasis: "placeholder-sainsburys-style",
    tiers: TIERS,
    dietaryBaseline: {
      override: true,
      proteins: PROTEINS.slice(),
      carbs: CARBS.slice(),
      rotation: ROTATION,
      note: "Hardcoded protein rotation and carb baselines override older dietary restrictions that banned these foods."
    },
    botanicals: BOTANICALS,
    skus: SKUS,
    shoppingLists: SHOPPING,
    recipes: {
      meals: MEALS,
      extractions: EXTRACTIONS
    },
    fuelDays: buildFuelDays(),
    tierFor: tierFor,
    shoppingListFor: shoppingListFor,
    cueForDay: cueForDay,
    morningProtocol: morningDoses,
    presentRecipe: presentRecipe,
    formatGbp: formatGbp,
    loadScore: loadScore,
    audit: audit
  };
})();
