/* Pack 001 — Oct 1 2026 Sainsbury's trolley + recipe cards.
   Food only. Does not read relic_completions or training days.
   Import twins: data/food/pack001/cards.json, shop.json, week.json */
(function (root) {
  "use strict";

  function ing(text, skuId) {
    var row = { text: text };
    if (skuId) row.skuId = skuId;
    return row;
  }
  function step(verb, detail) { return { verb: verb, detail: detail }; }
  function card(row) {
    row.pack001 = true;
    row.timetable = row.timetable || { bestFor: "", bestEaten: "Fresh", reheat: "Heat until hot" };
    row.ingredients = row.ingredients || [];
    row.method = row.method || [];
    row.tip = row.tip || "";
    row.tagline = row.tagline || "";
    row.kind = row.kind || "meal";
    return row;
  }

  var meals = {};
  [
    card({
      id: "pack001-cheesy-roasted-garlic-bread",
      kind: "meal",
      family: "side",
      name: "Cheesy Roasted Garlic Bread",
      tagline: "Garlicky. Cheesy. Irresistible.",
      script: "Lunch side, dinner side, weekend treat.",
      yield: "4–6",
      prepMin: 10,
      cookLabel: "Roast 35–45 · Bake 8–10",
      timetable: { bestFor: "Lunch, dinner side, weekend", bestEaten: "Fresh", reheat: "5–7 mins oven or air fryer" },
      tip: "Save a little garlic oil for drizzling or brushing the bread edges.",
      ingredients: [
        ing("Taste the Difference large smoked garlic, 4 bulbs", "sainsburys-sku-TBD-123"),
        ing("Flora Buttery spread", "sainsburys-sku-TBD-105"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101"),
        ing("Crusty baguette or loaf — ESTIMATE add if not using brioche as a last resort", "sainsburys-sku-TBD-207")
      ],
      method: [
        step("Roast", "the smoked garlic in a little oil until soft and sweet."),
        step("Mash", "the cloves with Flora and spread over split bread."),
        step("Top", "with Cathedral City and bake 8–10 minutes until bubbling."),
        step("Finish", "with parsley if the ESTIMATE bunch landed.")
      ]
    }),
    card({
      id: "pack001-cheesy-potato-toast",
      kind: "meal",
      family: "snack",
      name: "Cheesy Potato Toast",
      tagline: "Weekend potato cakes.",
      blockedWithoutAdds: true,
      yield: "3 large potatoes",
      prepMin: 15,
      cookLabel: "Boil then pan-toast",
      timetable: { bestFor: "Weekend treat, lunch", bestEaten: "Hot", reheat: "Pan or air fryer until crisp" },
      tip: "Blocked until potatoes and cornflour are in the cupboard. Flora and Cathedral City are already on the receipt.",
      ingredients: [
        ing("Maris Piper potatoes — ESTIMATE, not in the Oct 1 cart", "sainsburys-sku-TBD-201"),
        ing("Cornflour — ESTIMATE", "sainsburys-sku-TBD-202"),
        ing("Flora Buttery spread", "sainsburys-sku-TBD-105"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Boil", "about three large potatoes, then mash with Flora."),
        step("Bind", "with cornflour, salt, and pepper."),
        step("Toast", "cakes in a pan until both sides are golden."),
        step("Melt", "cheese on top.")
      ]
    }),
    card({
      id: "pack001-paprika-potato-egg-skillet",
      kind: "meal",
      family: "meal",
      name: "Paprika Potato Egg Skillet",
      tagline: "Friday brunch. Cook the whites.",
      cookEggWhites: true,
      yield: "1",
      prepMin: 10,
      cookLabel: "Skillet",
      timetable: { bestFor: "Friday brunch, light dinner, lunch", bestEaten: "Hot", reheat: "Skillet until the whites set" },
      tip: "Cook the egg whites through. Taste the Difference golden yolk eggs are the ladder top.",
      ingredients: [
        ing("Taste the Difference free-range golden yolk eggs", "sainsburys-sku-TBD-109"),
        ing("Potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("Paprika — ESTIMATE", "sainsburys-sku-TBD-204"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Slice", "the potatoes and start them in the skillet with garlic."),
        step("Dust", "with paprika."),
        step("Crack", "two eggs and cook the whites through."),
        step("Finish", "with tomato, chives, and melting cheese.")
      ]
    }),
    card({
      id: "pack001-beef-stuffed-potato-boats",
      kind: "meal",
      family: "meal",
      name: "Beef-Stuffed Potato Boats",
      tagline: "Wednesday dinner. Burger crumble stands in for mince.",
      yield: "3 potatoes",
      prepMin: 15,
      cookLabel: "Bake then fill",
      timetable: { bestFor: "Wednesday dinner, meal prep", bestEaten: "Hot", reheat: "Oven until the cheese melts" },
      tip: "Crumble about 300 g of the Taste the Difference steak burgers as the beef until mince is added.",
      ingredients: [
        ing("Taste the Difference British beef steak burgers, 600 g", "sainsburys-sku-TBD-106"),
        ing("Potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("Taste the Difference smoked garlic", "sainsburys-sku-TBD-123"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Bake", "the potatoes and scoop the centres."),
        step("Crumble", "seasoned burger with garlic and onion."),
        step("Fill", "the skins and top with cheese."),
        step("Reheat", "until the filling is hot.")
      ]
    }),
    card({
      id: "pack001-bread-egg-pan-pizza",
      kind: "meal",
      family: "meal",
      name: "Bread and Egg Pan Pizza",
      tagline: "Monday lunch. Cook the whites.",
      cookEggWhites: true,
      yield: "6 slices",
      prepMin: 10,
      cookLabel: "Pan or grill",
      timetable: { bestFor: "Monday lunch", bestEaten: "Fresh", reheat: "Pan until the cheese melts" },
      tip: "Cook the egg whites. Brioche buns are a weak base; sliced bread and passata are ESTIMATE adds.",
      ingredients: [
        ing("Taste the Difference free-range golden yolk eggs", "sainsburys-sku-TBD-109"),
        ing("Brioche burger buns as a temporary base", "sainsburys-sku-TBD-107"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101"),
        ing("Passata — ESTIMATE", "sainsburys-sku-TBD-205")
      ],
      method: [
        step("Lay", "the bread in a pan."),
        step("Spread", "passata if it landed, or keep it a white pizza."),
        step("Add", "egg and cook the whites, then cheese and onion."),
        step("Grill", "until the top sets.")
      ]
    }),
    card({
      id: "pack001-crispy-potato-bites",
      kind: "meal",
      family: "snack",
      name: "Low-Calorie Crispy Potato Bites",
      tagline: "About 35–40 bites. About 375 kcal for the batch.",
      blockedWithoutAdds: true,
      yield: "35–40 bites",
      prepMin: 15,
      cookLabel: "Microwave 9–12 · air fry 200°C 12–15",
      timetable: { bestFor: "Saturday snack, afternoon", bestEaten: "Hot and crisp", reheat: "3–5 mins air fryer" },
      tip: "Cannot cook from the trolley alone. Keep bites small so they crisp evenly. Potatoes, cornflour, and spray are ESTIMATE adds.",
      ingredients: [
        ing("400 g potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("15 g cornflour — ESTIMATE", "sainsburys-sku-TBD-202"),
        ing("Smoked paprika, garlic powder, salt, pepper — ESTIMATE", "sainsburys-sku-TBD-203"),
        ing("Cooking spray — ESTIMATE", "sainsburys-sku-TBD-210")
      ],
      method: [
        step("Microwave", "diced potato 9–12 minutes, then mash and cool."),
        step("Mix", "in cornflour and the seasoning."),
        step("Roll", "about 35–40 small bites and spray them."),
        step("Air-fry", "at 200°C for 12–15 minutes.")
      ]
    }),
    card({
      id: "plate-chicken-mixed-veg",
      kind: "meal",
      family: "plate",
      name: "Chicken and Mixed Veg",
      tagline: "Monday evening plate from the trolley.",
      yield: "1",
      prepMin: 10,
      cookLabel: "Pan",
      timetable: { bestFor: "Monday evening", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Chicken breast from the 2 kg packs. Mixed vegetables from the receipt.",
      ingredients: [
        ing("British chicken breast", "sainsburys-sku-TBD-110"),
        ing("Mixed vegetables 1 kg", "sainsburys-sku-TBD-122")
      ],
      method: [step("Cook", "the chicken through."), step("Heat", "a portion of mixed vegetables beside it.")]
    }),
    card({
      id: "plate-chicken-leftover-spinach",
      kind: "meal",
      family: "plate",
      name: "Chicken Leftover Spinach",
      tagline: "Tuesday lunch plate.",
      yield: "1",
      prepMin: 5,
      cookLabel: "Reheat",
      timetable: { bestFor: "Tuesday lunch", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Use Monday chicken. Spinach is on the receipt.",
      ingredients: [
        ing("Leftover chicken breast", "sainsburys-sku-TBD-110"),
        ing("Baby leaf spinach", "sainsburys-sku-TBD-121")
      ],
      method: [step("Reheat", "the chicken."), step("Wilt", "a handful of spinach beside it.")]
    }),
    card({
      id: "plate-turkey-mince-mixed-veg",
      kind: "meal",
      family: "plate",
      name: "Turkey Mince and Mixed Veg",
      tagline: "Evening plate. 7% fat turkey mince.",
      yield: "1",
      prepMin: 10,
      cookLabel: "Pan",
      timetable: { bestFor: "Tuesday or Friday evening", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Batch the 750 g packs so Friday can repeat this plate.",
      ingredients: [
        ing("7% fat British turkey mince", "sainsburys-sku-TBD-108"),
        ing("Mixed vegetables", "sainsburys-sku-TBD-122")
      ],
      method: [step("Brown", "the turkey mince."), step("Stir", "through mixed vegetables until hot.")]
    }),
    card({
      id: "plate-cheese-mini-fruit",
      kind: "meal",
      family: "plate",
      name: "Cheese Mini and Fruit",
      tagline: "Wednesday light lunch.",
      yield: "1",
      prepMin: 2,
      cookLabel: "No cook",
      timetable: { bestFor: "Wednesday lunch", bestEaten: "Cold", reheat: "Not needed" },
      tip: "Cathedral City minis from the receipt. Fruit from the frozen packs, thawed.",
      ingredients: [
        ing("Cathedral City mini mature cheddar", "sainsburys-sku-TBD-101"),
        ing("Frozen summer fruits, thawed", "sainsburys-sku-TBD-115")
      ],
      method: [step("Plate", "a few cheese minis and a handful of fruit.")]
    }),
    card({
      id: "plate-turkey-leftover-bowl",
      kind: "meal",
      family: "plate",
      name: "Turkey Leftover Bowl",
      tagline: "Thursday lunch from Tuesday's mince.",
      yield: "1",
      prepMin: 5,
      cookLabel: "Reheat",
      timetable: { bestFor: "Thursday lunch", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Same turkey mince, next day.",
      ingredients: [ing("Leftover turkey mince", "sainsburys-sku-TBD-108")],
      method: [step("Reheat", "until piping hot.")]
    }),
    card({
      id: "plate-chicken-tray-veg",
      kind: "meal",
      family: "plate",
      name: "Chicken Tray and Veg",
      tagline: "Thursday evening tray.",
      yield: "1",
      prepMin: 10,
      cookLabel: "Tray",
      timetable: { bestFor: "Thursday evening", bestEaten: "Hot", reheat: "Oven until hot" },
      tip: "Chicken plus mixed veg on one tray.",
      ingredients: [
        ing("British chicken breast", "sainsburys-sku-TBD-110"),
        ing("Mixed vegetables", "sainsburys-sku-TBD-122")
      ],
      method: [step("Roast", "chicken and vegetables together until the chicken is cooked through.")]
    }),
    card({
      id: "plate-ttd-burger-brioche",
      kind: "meal",
      family: "plate",
      name: "Taste the Difference Burger on Brioche",
      tagline: "Saturday evening. Keep some burgers for the potato boats.",
      yield: "1",
      prepMin: 5,
      cookLabel: "Pan or grill",
      timetable: { bestFor: "Saturday evening", bestEaten: "Hot", reheat: "Not ideal" },
      tip: "The 600 g pack also feeds the beef boats. Do not use the whole pack here.",
      ingredients: [
        ing("Taste the Difference beef steak burger", "sainsburys-sku-TBD-106"),
        ing("Taste the Difference brioche bun", "sainsburys-sku-TBD-107")
      ],
      method: [step("Cook", "one burger through."), step("Serve", "on a brioche bun.")]
    }),
    card({
      id: "plate-leftover-roast",
      kind: "meal",
      family: "plate",
      name: "Leftover Roast",
      tagline: "Sunday lunch from the week’s chicken.",
      yield: "1",
      prepMin: 5,
      cookLabel: "Reheat",
      timetable: { bestFor: "Sunday lunch", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Food Prep day still gets a real lunch plate.",
      ingredients: [ing("Leftover roast chicken", "sainsburys-sku-TBD-110")],
      method: [step("Reheat", "until piping hot.")]
    }),
    card({
      id: "plate-batch-chicken-veg",
      kind: "meal",
      family: "plate",
      name: "Batch Chicken and Veg",
      tagline: "Sunday evening batch for the next days.",
      yield: "Several portions",
      prepMin: 15,
      cookLabel: "Tray",
      timetable: { bestFor: "Sunday evening", bestEaten: "Hot, then chilled", reheat: "Until piping hot" },
      tip: "Cook extra chicken and veg while the prep list runs.",
      ingredients: [
        ing("British chicken breast", "sainsburys-sku-TBD-110"),
        ing("Mixed vegetables", "sainsburys-sku-TBD-122")
      ],
      method: [step("Batch", "chicken and vegetables for the coming days."), step("Cool", "what you will not eat tonight.")]
    })
  ].forEach(function (row) { meals[row.id] = row; });

  function glass(id, name, tagline, lines, tip) {
    return card({
      id: id,
      kind: "extraction",
      family: "extraction",
      name: name,
      tagline: tagline,
      yield: "1 glass",
      prepMin: 8,
      cookLabel: "Blend",
      lock: "Not dinner.",
      band: "morning",
      notDinner: true,
      timetable: { bestFor: "Morning or lunch", bestEaten: "Straight away", reheat: "Do not reheat" },
      tip: tip,
      ingredients: lines.map(function (pair) { return ing(pair[0], pair[1]); }),
      method: [
        step("Pour", "water, or milk if the ESTIMATE bottle landed."),
        step("Add", "the frozen fruit, spinach or dates named on the card."),
        step("Blend", "until smooth. One Brazil nut a day only if the tin was purchased."),
        step("Drink", "at morning or lunch. Extractions aren't dinner.")
      ]
    });
  }

  var extractions = {};
  [
    glass("extract-summer-spinach-date", "Summer Fruit, Spinach, and Date", "Monday morning.", [
      ["Frozen summer fruits", "sainsburys-sku-TBD-115"],
      ["Baby leaf spinach", "sainsburys-sku-TBD-121"],
      ["Taste the Difference Medjool dates", "sainsburys-sku-TBD-114"]
    ], "Morning or lunch only."),
    glass("extract-cherry-cream", "Cherry Cream", "Tuesday morning. Yogurt is an ESTIMATE add.", [
      ["Frozen dark sweet cherries", "sainsburys-sku-TBD-116"]
    ], "Morning or lunch only. Not dinner."),
    glass("extract-blueberry-mango", "Blueberry Mango", "Wednesday morning.", [
      ["Frozen blueberries", "sainsburys-sku-TBD-120"],
      ["Frozen mango chunks", "sainsburys-sku-TBD-117"]
    ], "Morning or lunch only."),
    glass("extract-raspberry-spinach", "Raspberry Spinach", "Thursday morning.", [
      ["Frozen raspberries", "sainsburys-sku-TBD-119"],
      ["Baby leaf spinach", "sainsburys-sku-TBD-121"]
    ], "Morning or lunch only."),
    glass("extract-black-forest-spinach", "Black Forest Spinach", "Friday morning.", [
      ["Frozen black forest fruits", "sainsburys-sku-TBD-118"],
      ["Baby leaf spinach", "sainsburys-sku-TBD-121"]
    ], "Morning or lunch only."),
    glass("extract-mango-date", "Mango Date", "Sunday morning.", [
      ["Frozen mango chunks", "sainsburys-sku-TBD-117"],
      ["Taste the Difference Medjool dates", "sainsburys-sku-TBD-114"]
    ], "Morning or lunch only. One Brazil nut a day only if purchased.")
  ].forEach(function (row) { extractions[row.id] = row; });

  var collections = {
    "collection-potato-pan-pack001": card({
      id: "collection-potato-pan-pack001",
      kind: "collection",
      family: "collection",
      name: "4 Easy Potato and Pan Recipe Ideas",
      tagline: "Visual roundup. Not a plate you can schedule.",
      visualOnly: true,
      yield: "4 recipes",
      prepMin: 0,
      cookLabel: "See the child cards",
      childCardIds: [
        "pack001-cheesy-potato-toast",
        "pack001-paprika-potato-egg-skillet",
        "pack001-beef-stuffed-potato-boats",
        "pack001-bread-egg-pan-pizza"
      ],
      timetable: { bestFor: "Poster only", bestEaten: "", reheat: "" },
      tip: "Drop the child cards into the week. This poster stays on the library wall.",
      ingredients: [ing("Four separate cards, not one blob")],
      method: [step("Open", "a child card. Do not schedule this poster.")]
    })
  };

  function line(name, packSize, qty, unitGbp, skuId, priceStatus, tag, household) {
    return {
      skuId: skuId,
      name: name,
      customName: name,
      packSize: packSize,
      qty: qty,
      unitGbp: unitGbp,
      pricePence: Math.round(unitGbp * 100),
      priceStatus: priceStatus,
      tag: tag,
      ticked: priceStatus === "RECEIPT_TRUE" && !household,
      household: !!household,
      citations: [name + " · " + priceStatus]
    };
  }

  var shopItems = [
    line("Cathedral City Mini Mature Cheddar", "12×20 g", 1, 3.9, "sainsburys-sku-TBD-101", "RECEIPT_TRUE", "dairy"),
    line("Cathedral City Mini Extra Mature", "6×20 g", 1, 1.65, "sainsburys-sku-TBD-102", "RECEIPT_TRUE", "dairy"),
    line("Cathedral City High Protein Half Fat Mature Mini", "6×20 g", 1, 1.65, "sainsburys-sku-TBD-103", "RECEIPT_TRUE", "dairy"),
    line("Cathedral City Mature Spreadable", "125 g", 1, 1.75, "sainsburys-sku-TBD-104", "RECEIPT_TRUE", "dairy"),
    line("Flora Buttery Spread", "450 g", 2, 1.95, "sainsburys-sku-TBD-105", "RECEIPT_TRUE", "dairy"),
    line("Sainsbury's Taste the Difference 4 British Beef Steak Burgers", "600 g", 1, 7.25, "sainsburys-sku-TBD-106", "RECEIPT_TRUE", "protein"),
    line("Sainsbury's Taste the Difference Brioche Burger Buns", "×4", 4, 1.5, "sainsburys-sku-TBD-107", "RECEIPT_TRUE", "other"),
    line("Sainsbury's 7% Fat Fresh British Turkey Mince", "750 g", 4, 5.25, "sainsburys-sku-TBD-108", "RECEIPT_TRUE", "protein"),
    line("Sainsbury's Taste the Difference Free Range Golden Yolk Eggs", "×12", 1, 3.5, "sainsburys-sku-TBD-109", "RECEIPT_TRUE", "protein"),
    line("Sainsbury's British Fresh Skinless & Boneless Chicken Breast", "2 kg", 4, 12.29, "sainsburys-sku-TBD-110", "RECEIPT_TRUE", "protein"),
    line("Tate & Lyle Caramel Syrup", "250 ml", 1, 2, "sainsburys-sku-TBD-111", "RECEIPT_TRUE", "other"),
    line("Tate & Lyle Vanilla Coffee Syrup", "250 ml", 1, 2, "sainsburys-sku-TBD-112", "RECEIPT_TRUE", "other"),
    line("Nescafé Gold Blend Instant Coffee", "190 g", 1, 5.7, "sainsburys-sku-TBD-113", "RECEIPT_TRUE", "other"),
    line("Sainsbury's Taste the Difference Medjool Dates", "500 g", 1, 3.75, "sainsburys-sku-TBD-114", "RECEIPT_TRUE", "fruit"),
    line("Sainsbury's Frozen Summer Fruits", "450 g", 3, 3.5, "sainsburys-sku-TBD-115", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Frozen Dark Sweet Cherries", "300 g", 3, 3.5, "sainsburys-sku-TBD-116", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Frozen Mango Chunks", "450 g", 3, 3.5, "sainsburys-sku-TBD-117", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Frozen Black Forest Fruits", "450 g", 3, 3.5, "sainsburys-sku-TBD-118", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Frozen Raspberries", "315 g", 3, 3.5, "sainsburys-sku-TBD-119", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Frozen Blueberries", "360 g", 3, 3.5, "sainsburys-sku-TBD-120", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Baby Leaf Spinach", "200 g", 3, 1.5, "sainsburys-sku-TBD-121", "RECEIPT_TRUE", "veg"),
    line("Sainsbury's Mixed Vegetables", "1 kg", 2, 1.65, "sainsburys-sku-TBD-122", "RECEIPT_TRUE", "freezer"),
    line("Sainsbury's Taste the Difference Large Smoked Garlic Bulb", "each", 4, 0.75, "sainsburys-sku-TBD-123", "RECEIPT_TRUE", "veg"),
    line("Highland Spring Still Water", "6×1.5 L", 6, 4.5, "sainsburys-sku-TBD-124", "RECEIPT_TRUE", "other"),
    line("Flash Direct to Floor Berry", "800 ml", 1, 2.75, "sainsburys-sku-TBD-301", "RECEIPT_TRUE", "other", true),
    line("Dettol Fresh Cherry Bloom Multipurpose", "750 ml", 1, 2.4, "sainsburys-sku-TBD-302", "RECEIPT_TRUE", "other", true),
    line("Oral-B Pro 3D White Charcoal toothbrush", "each", 1, 1.75, "sainsburys-sku-TBD-303", "RECEIPT_TRUE", "other", true),
    line("Huggies Pure Plastic Free Baby Wipes", "12×48", 1, 9, "sainsburys-sku-TBD-304", "RECEIPT_TRUE", "other", true),
    line("Listerine Total Care Milder Zero Alcohol", "500 ml", 1, 6, "sainsburys-sku-TBD-305", "RECEIPT_TRUE", "other", true),
    line("Colgate Total Active Prevention toothpaste", "75 ml", 2, 2.75, "sainsburys-sku-TBD-306", "RECEIPT_TRUE", "other", true),
    line("Sensodyne Clinical Repair Active White", "75 ml", 2, 5.5, "sainsburys-sku-TBD-307", "RECEIPT_TRUE", "other", true),
    line("Sainsbury's Maris Piper Potatoes", "2.5 kg", 2, 1.9, "sainsburys-sku-TBD-201", "ESTIMATE", "veg"),
    line("Sainsbury's Cornflour", "500 g", 1, 1, "sainsburys-sku-TBD-202", "ESTIMATE", "other"),
    line("Sainsbury's Smoked Paprika", "40–45 g", 1, 1.2, "sainsburys-sku-TBD-203", "ESTIMATE", "other"),
    line("Sainsbury's Paprika", "40–45 g", 1, 1, "sainsburys-sku-TBD-204", "ESTIMATE", "other"),
    line("Sainsbury's Passata", "500 g", 2, 0.6, "sainsburys-sku-TBD-205", "ESTIMATE", "veg"),
    line("Sainsbury's Thick Sliced Soft White Bread", "800 g", 1, 1.2, "sainsburys-sku-TBD-206", "ESTIMATE", "other"),
    line("Sainsbury's Taste the Difference Stonebaked Baguette", "each", 2, 1.5, "sainsburys-sku-TBD-207", "ESTIMATE", "other")
  ];

  var prep = "Prep: bag_7_extraction_kits. Boil eggs for 2 days and cook the whites. Brazil tin ×7 if purchased. One Brazil nut a day.";
  var week = {
    "2026-09-28": { extractionId: "extract-summer-spinach-date", lunch: "pack001-bread-egg-pan-pizza", mealId: "plate-chicken-mixed-veg" },
    "2026-09-29": { extractionId: "extract-cherry-cream", lunch: "plate-chicken-leftover-spinach", mealId: "plate-turkey-mince-mixed-veg" },
    "2026-09-30": { extractionId: "extract-blueberry-mango", lunch: "plate-cheese-mini-fruit", mealId: "pack001-beef-stuffed-potato-boats" },
    "2026-10-01": { extractionId: "extract-raspberry-spinach", lunch: "plate-turkey-leftover-bowl", mealId: "plate-chicken-tray-veg" },
    "2026-10-02": { extractionId: "extract-black-forest-spinach", lunch: "pack001-paprika-potato-egg-skillet", mealId: "plate-turkey-mince-mixed-veg" },
    "2026-10-03": { morning: "Coffee", lunch: "pack001-cheesy-roasted-garlic-bread", mealId: "plate-ttd-burger-brioche", snack: "pack001-crispy-potato-bites", note: "Saturday snack only if the ESTIMATE potato adds landed." },
    "2026-10-04": { extractionId: "extract-mango-date", lunch: "plate-leftover-roast", mealId: "plate-batch-chicken-veg", note: prep }
  };

  root.RELIC_FOOD_PACK001 = {
    build: "v21",
    weekStart: "2026-09-28",
    budget: {
      trolleyGbp: 226.37,
      householdGbp: 38.4,
      mealWaterGbp: 187.97,
      criticalAddsGbp: 11.2,
      mealPlusCriticalGbp: 199.17,
      priceTags: ["RECEIPT_TRUE", "ESTIMATE"]
    },
    meals: meals,
    extractions: extractions,
    collections: collections,
    shop: { items: shopItems },
    week: week
  };
})(typeof window !== "undefined" ? window : globalThis);
