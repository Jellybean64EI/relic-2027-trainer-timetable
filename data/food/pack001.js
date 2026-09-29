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
      tip: "Cathedral City stands in for mozzarella, Flora for butter, and the smoked bulb for roast garlic. Brioche is a last-resort base. Gaps still out of the cart: baguette, olive oil, parsley.",
      ingredients: [
        ing("Taste the Difference large smoked garlic, 4 bulbs", "sainsburys-sku-TBD-123"),
        ing("Flora Buttery spread", "sainsburys-sku-TBD-105"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101"),
        ing("Taste the Difference stonebaked baguette — ESTIMATE", "sainsburys-sku-TBD-207"),
        ing("Extra virgin olive oil — ESTIMATE", "sainsburys-sku-TBD-209"),
        ing("Flat leaf parsley — ESTIMATE", "sainsburys-sku-TBD-217")
      ],
      method: [
        step("Roast", "the Taste the Difference smoked garlic in a little oil until the cloves are soft and sweet."),
        step("Mash", "the cloves with Flora Buttery and spread them over a split baguette. Use a brioche bun only if the baguette has not landed."),
        step("Top", "with Cathedral City cheddar. Mozzarella is optional and is not on the receipt."),
        step("Bake", "8–10 minutes in a hot oven or air fryer until the cheese bubbles, then finish with parsley if that bunch was bought.")
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
      tip: "Blocked until potatoes and cornflour are in the cupboard. Flora and Cathedral City are already on the receipt. Oil or spray is an ESTIMATE add.",
      ingredients: [
        ing("Maris Piper potatoes, about 3 large — ESTIMATE, not in the Oct 1 cart", "sainsburys-sku-TBD-201"),
        ing("Cornflour — ESTIMATE", "sainsburys-sku-TBD-202"),
        ing("Flora Buttery spread", "sainsburys-sku-TBD-105"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101"),
        ing("Cooking oil spray — ESTIMATE", "sainsburys-sku-TBD-210")
      ],
      method: [
        step("Boil", "about three large potatoes, then mash them with Flora Buttery."),
        step("Bind", "the mash with cornflour, salt, and pepper."),
        step("Toast", "cakes in a pan, or with a light spray, until both sides are golden."),
        step("Melt", "Cathedral City on top. Mozzarella is optional and is not required.")
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
      tip: "Cook the egg whites through. Taste the Difference golden yolk eggs stay at the top of the ladder. Potatoes, paprika, tomato, and chives are still gaps.",
      ingredients: [
        ing("Taste the Difference free-range golden yolk eggs, cook the whites", "sainsburys-sku-TBD-109"),
        ing("Taste the Difference smoked garlic", "sainsburys-sku-TBD-123"),
        ing("Maris Piper potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("Smoked paprika — ESTIMATE", "sainsburys-sku-TBD-203"),
        ing("Paprika — ESTIMATE", "sainsburys-sku-TBD-204"),
        ing("Tomatoes on the vine — ESTIMATE", "sainsburys-sku-TBD-213"),
        ing("Fresh chives — ESTIMATE", "sainsburys-sku-TBD-218"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Slice", "the potatoes and start them in the skillet with Flora or oil and smoked garlic from the cart."),
        step("Dust", "with smoked paprika. Plain paprika can stand in. Skipping the spice drops the name of the dish."),
        step("Crack", "two Taste the Difference eggs and cook the whites through."),
        step("Finish", "with tomato and chives if those adds landed, then melt Cathedral City over the top.")
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
      tip: "Crumble about 300 g of the Taste the Difference steak burgers as the beef. True mince is optional. Potatoes, onion, tomato, paprika, and onion powder are still gaps.",
      ingredients: [
        ing("Taste the Difference British beef steak burgers, crumble about 300 g", "sainsburys-sku-TBD-106"),
        ing("Maris Piper potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("Taste the Difference smoked garlic", "sainsburys-sku-TBD-123"),
        ing("Brown onions — ESTIMATE", "sainsburys-sku-TBD-214"),
        ing("Tomatoes on the vine — ESTIMATE", "sainsburys-sku-TBD-213"),
        ing("Onion powder — ESTIMATE", "sainsburys-sku-TBD-212"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Bake", "the potatoes and scoop the centres."),
        step("Crumble", "about 300 g of cooked Taste the Difference steak burger with smoked garlic and onion. That stands in for mince."),
        step("Fill", "the skins, add tomato if it landed, and top with Cathedral City."),
        step("Reheat", "until the filling is hot and the cheese has melted.")
      ]
    }),
    card({
      id: "pack001-bread-egg-pan-pizza",
      kind: "meal",
      family: "meal",
      name: "Bread & Egg Pan Pizza",
      tagline: "Monday lunch. Cook the whites.",
      cookEggWhites: true,
      yield: "6 slices",
      prepMin: 10,
      cookLabel: "Pan or grill",
      timetable: { bestFor: "Monday lunch", bestEaten: "Fresh", reheat: "Pan until the cheese melts" },
      tip: "Cook the egg whites. Brioche is a sweet, soft stand-in for one lunch. Sliced bread, passata, tomato, red onion, and spring onion are the fidelity adds.",
      ingredients: [
        ing("Taste the Difference free-range golden yolk eggs, cook the whites", "sainsburys-sku-TBD-109"),
        ing("Thick sliced soft white bread — ESTIMATE", "sainsburys-sku-TBD-206"),
        ing("Taste the Difference brioche buns, temporary base only", "sainsburys-sku-TBD-107"),
        ing("Passata — ESTIMATE", "sainsburys-sku-TBD-205"),
        ing("Red onion — ESTIMATE", "sainsburys-sku-TBD-215"),
        ing("Spring onion — ESTIMATE", "sainsburys-sku-TBD-216"),
        ing("Cathedral City cheddar", "sainsburys-sku-TBD-101")
      ],
      method: [
        step("Lay", "sliced bread in the pan. Use a brioche bun only for this one lunch if the loaf has not landed."),
        step("Spread", "passata when it is in the cupboard. With no sauce, keep it a cheese-only white pizza."),
        step("Add", "egg and cook the whites through, then Cathedral City, tomato, red onion, and spring onion."),
        step("Grill", "or cover the pan until the top sets and the cheese melts.")
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
      tip: "Cannot cook from the trolley alone. Keep bites small so they crisp evenly. Potatoes, cornflour, garlic powder, smoked paprika, and cooking spray are ESTIMATE adds.",
      ingredients: [
        ing("400 g Maris Piper potatoes — ESTIMATE", "sainsburys-sku-TBD-201"),
        ing("15 g cornflour — ESTIMATE", "sainsburys-sku-TBD-202"),
        ing("Smoked paprika — ESTIMATE", "sainsburys-sku-TBD-203"),
        ing("Garlic powder — ESTIMATE", "sainsburys-sku-TBD-211"),
        ing("Cooking spray — ESTIMATE", "sainsburys-sku-TBD-210")
      ],
      method: [
        step("Dice", "400 g potato and microwave it 9–12 minutes, then mash and cool."),
        step("Mix", "in 15 g cornflour, garlic powder, smoked paprika, salt, and pepper."),
        step("Roll", "about 35–40 small bites and spray them lightly."),
        step("Air-fry", "at 200°C for 12–15 minutes until crisp. Reheat 3–5 minutes if they cool.")
      ]
    }),
    card({
      id: "plate-chicken-mixed-veg",
      kind: "meal",
      family: "plate",
      name: "Chicken & Mixed Vegetables",
      tagline: "Monday evening plate from the trolley.",
      yield: "1",
      prepMin: 10,
      cookLabel: "Pan",
      timetable: { bestFor: "Monday evening", bestEaten: "Hot", reheat: "Until piping hot" },
      tip: "Thaw one portion from the 2 kg chicken packs. Mixed vegetables are on the receipt.",
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
      name: "Chicken, Leftover Spinach",
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
      name: "Turkey Mince & Mixed Vegetables",
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
      name: "Cheese & Mini Fruit Plate",
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
      name: "Chicken Tray with Vegetables",
      tagline: "Thursday evening tray.",
      yield: "1",
      prepMin: 10,
      cookLabel: "Tray",
      timetable: { bestFor: "Thursday evening", bestEaten: "Hot", reheat: "Oven until hot" },
      tip: "Batch-cook the remaining chicken on this tray so Friday through Sunday still have a plate.",
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
      name: "TtD Beef Burger & Brioche",
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
      name: "Leftover Roast Plate",
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
      name: "Batch Chicken & Vegetables",
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
        step("Pour", "water. Milk or Greek yogurt is an ESTIMATE add and is not on the receipt."),
        step("Add", lines.map(function (pair) { return pair[0]; }).join("; ") + "."),
        step("Blend", "until smooth. One Brazil nut a day only if that tin was purchased. Leave it out otherwise."),
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
    glass("extract-cherry-cream", "Cherry Dark Sweet", "Tuesday morning. Yogurt is an ESTIMATE add.", [
      ["Frozen dark sweet cherries", "sainsburys-sku-TBD-116"],
      ["Greek style yogurt — ESTIMATE, not on the receipt", "sainsburys-sku-TBD-222"]
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
    "2026-10-03": { morning: "Coffee · Nescafé Gold, syrup optional", lunch: "pack001-cheesy-roasted-garlic-bread", mealId: "plate-ttd-burger-brioche", snack: "pack001-crispy-potato-bites", note: "Saturday morning is coffee, not an extraction. Snack only if the ESTIMATE potato adds landed." },
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
      softLockGbp: 200,
      fullAddsGbp: 47.95,
      foodWaterLineGbp: 214.01,
      reconciliationDeltaGbp: 26.04,
      priceTags: ["RECEIPT_TRUE", "ESTIMATE"]
    },
    meals: meals,
    extractions: extractions,
    collections: collections,
    shop: { items: shopItems },
    week: week
  };
})(typeof window !== "undefined" ? window : globalThis);
