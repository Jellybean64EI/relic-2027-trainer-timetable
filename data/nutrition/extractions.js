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

  function botanicalsAfter(band, extra) {
    return doseLine(band) + " into the strained liquid. Psyllium goes in last. Do not return them to the blender. " +
      (extra || "This glass is morning only. It is not dinner.") +
      " Brazil nut maximum is one a day, beside the glass, never dumped in before the strain.";
  }

  function glassMethod(liquid, frozen, citrus, hemp, band, extra) {
    return [
      { verb: "Pour", detail: liquid },
      { verb: "Add", detail: "the frozen fruit next: " + frozen },
      { verb: "Add", detail: "the citrus next: " + citrus },
      { verb: "Add", detail: hemp },
      { verb: "Blend", detail: "45 seconds on the 3000W motor until the cell walls shatter and no frost shards remain." },
      { verb: "Strain", detail: "through damp Sainsbury's Cheesecloth into a bowl. Stop. Do not add botanicals before this strain." },
      { verb: "Whisk", detail: botanicalsAfter(band, extra) }
    ];
  }

  function withBotanicals(rows, band) {
    var copy = rows.slice();
    doses(band).forEach(function (dose) {
      copy.push({ skuId: dose.skuId, qty: 1, text: dose.text + " " + dose.name + " — after the strain" });
    });
    return copy;
  }

  var CARDS = {
    "berry-banana-brazil": {
      id: "berry-banana-brazil",
      name: "Berry Banana Brazil",
      tagline: "Immune. Skin. Steady start.",
      script: "Frozen banana, mixed berries, one Brazil nut.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "moderate",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 280, protein: 9, carb: 36, fat: 11 },
      tip: "FOOD_LIVE lock: one Brazil nut a day. A pile of nuts does not apply.",
      ingredients: [
        { skuId: "milk", qty: 180, text: "180 ml Sainsbury's SO Organic Whole Milk or yogurt (¾ cup)" },
        { skuId: "banana", qty: 120, text: "1 frozen Sainsbury's SO Organic Banana, about 120 g" },
        { skuId: "fruit", qty: 150, text: "150 g Sainsbury's Frozen Summer Fruits (1 cup mixed berries)" },
        { skuId: "lemons", qty: 20, text: "20 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 10, text: "10 g Sainsbury's Hulled Hemp Hearts" },
        { skuId: "brazil", qty: 1, text: "1 Brazil nut maximum, beside the glass, not in the jug" },
        { skuId: "cinnamon", qty: 1, text: "1 pinch ground cinnamon" }
      ],
      lines: [
        "180 ml Sainsbury's SO Organic Whole Milk or yogurt into the 3000W jug.",
        "1 frozen Sainsbury's SO Organic Banana (about 120 g) and 150 g mixed berries.",
        "20 g peeled Sainsbury's SO Organic Lemons.",
        "10 g Sainsbury's Hulled Hemp Hearts and a pinch of cinnamon. Leave the Brazil nut out of the jug.",
        "One Brazil nut maximum is eaten beside the glass after the strain. Do not use a pile."
      ]
    },
    "cherry-banana-cream": {
      id: "cherry-banana-cream",
      name: "Cherry Banana Cream",
      tagline: "Recovery. Muscle. Calm.",
      script: "Frozen cherries, banana, Greek yogurt.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "restorative",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 290, protein: 12, carb: 40, fat: 8 },
      tip: "A splash of milk only if the yogurt will not move. Still morning, never dinner.",
      ingredients: [
        { skuId: "yogurt", qty: 180, text: "180 g Sainsbury's Greek Style Yogurt (¾ cup)" },
        { skuId: "cherries", qty: 150, text: "150 g frozen cherries (1 cup)" },
        { skuId: "banana", qty: 120, text: "1 Sainsbury's SO Organic Banana, about 120 g" },
        { skuId: "lemons", qty: 15, text: "15 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 10, text: "10 g Sainsbury's Hulled Hemp Hearts" },
        { skuId: "milk", qty: 30, text: "30 ml Sainsbury's SO Organic Whole Milk, splash only" }
      ],
      lines: [
        "180 g Greek yogurt and a 30 ml splash of SO Organic milk into the 3000W jug.",
        "150 g frozen cherries and 1 banana (about 120 g).",
        "15 g peeled Sainsbury's SO Organic Lemons.",
        "10 g Sainsbury's Hulled Hemp Hearts.",
        "No Brazil nut in this glass. The daily maximum is still one, on the Brazil day only."
      ]
    },
    "mango-banana-nut": {
      id: "mango-banana-nut",
      name: "Mango Banana Nut",
      tagline: "Skin. Digestion. Energy.",
      script: "Frozen mango, banana, a spoon of nut butter.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "moderate",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 340, protein: 10, carb: 42, fat: 14 },
      tip: "Nut butter is the spoon, not a handful of Brazil nuts.",
      ingredients: [
        { skuId: "milk", qty: 180, text: "180 ml Sainsbury's SO Organic Whole Milk or yogurt (¾ cup)" },
        { skuId: "mango", qty: 160, text: "160 g frozen mango chunks (1 cup)" },
        { skuId: "banana", qty: 120, text: "1 Sainsbury's SO Organic Banana, about 120 g" },
        { skuId: "lemons", qty: 15, text: "15 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 10, text: "10 g Sainsbury's Hulled Hemp Hearts" },
        { skuId: "almondButter", qty: 16, text: "1 tbsp almond butter or a few almonds" }
      ],
      lines: [
        "180 ml SO Organic milk or yogurt into the 3000W jug.",
        "160 g frozen mango and 1 banana (about 120 g).",
        "15 g peeled Sainsbury's SO Organic Lemons.",
        "10 g hemp hearts and 1 tbsp almond butter.",
        "Brazil nut maximum stays one a day and is not part of this jug."
      ]
    },
    "berry-oat-almond": {
      id: "berry-oat-almond",
      name: "Berry Oat Almond",
      tagline: "Long energy. Digestion.",
      script: "Berries, banana, oats, almond butter.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "intense",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 420, protein: 14, carb: 52, fat: 16 },
      tip: "Oats go in before the blend so the strain still catches the husk.",
      ingredients: [
        { skuId: "milk", qty: 240, text: "240 ml Sainsbury's SO Organic Whole Milk (1 cup)" },
        { skuId: "fruit", qty: 150, text: "150 g mixed berries (1 cup)" },
        { skuId: "banana", qty: 120, text: "1 Sainsbury's SO Organic Banana, about 120 g" },
        { skuId: "oats", qty: 25, text: "25 g porridge oats (¼ cup)" },
        { skuId: "lemons", qty: 15, text: "15 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 10, text: "10 g Sainsbury's Hulled Hemp Hearts" },
        { skuId: "almondButter", qty: 16, text: "1 tbsp almond butter" }
      ],
      lines: [
        "240 ml SO Organic milk into the 3000W jug.",
        "150 g berries, 1 banana (about 120 g), and 25 g porridge oats.",
        "15 g peeled Sainsbury's SO Organic Lemons.",
        "10 g hemp hearts and 1 tbsp almond butter.",
        "Brazil nut maximum is one a day. This glass does not take one."
      ]
    },
    "orange-berry-yogurt": {
      id: "orange-berry-yogurt",
      name: "Orange Berry Yogurt",
      tagline: "Vitamin C. Hydration.",
      script: "One orange, berries, yogurt.",
      yield: "1 glass",
      prepMin: 6,
      cookLabel: "3000W · 45 sec, then strain",
      band: "moderate",
      lock: "Morning only. Not dinner.",
      macros: { kcal: 260, protein: 11, carb: 38, fat: 7 },
      tip: "Juice the orange. Do not drop the peel into the jug.",
      ingredients: [
        { skuId: "yogurt", qty: 180, text: "180 g Sainsbury's Greek Style Yogurt (¾ cup)" },
        { skuId: "oranges", qty: 80, text: "Juice of 1 Sainsbury's SO Organic Orange, about 80 ml" },
        { skuId: "fruit", qty: 150, text: "150 g mixed berries (1 cup)" },
        { skuId: "milk", qty: 30, text: "30 ml Sainsbury's SO Organic Whole Milk, splash" },
        { skuId: "hemp", qty: 10, text: "10 g Sainsbury's Hulled Hemp Hearts" }
      ],
      lines: [
        "180 g yogurt and a 30 ml splash of milk into the 3000W jug.",
        "150 g mixed berries.",
        "juice of 1 SO Organic orange (about 80 ml). The orange is the citrus.",
        "10 g Sainsbury's Hulled Hemp Hearts.",
        "Brazil nut maximum is one a day. Leave it out of this glass."
      ]
    },
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
      tip: "Brazil nut maximum is one a day. Count it from the tin. Do not tip the bag into the jug.",
      ingredients: [
        { skuId: "milk", qty: 250, text: "250 ml Sainsbury's SO Organic Whole Milk, or cold water if the organic bottle is out" },
        { skuId: "fruit", qty: 160, text: "160 g Sainsbury's Frozen Summer Fruits" },
        { skuId: "lemons", qty: 40, text: "40 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 20, text: "20 g Sainsbury's Hulled Hemp Hearts" }
      ],
      lines: [
        "250 ml Sainsbury's SO Organic Whole Milk into the 3000W jug. Use cold water if SO Organic milk is not on the shelf.",
        "160 g Sainsbury's Frozen Summer Fruits.",
        "40 g peeled Sainsbury's SO Organic Lemons.",
        "20 g Sainsbury's Hulled Hemp Hearts.",
        "One Brazil nut maximum, eaten beside the glass."
      ]
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
      tip: "A lighter training day still drinks this in the morning. It does not replace the evening plate.",
      ingredients: [
        { skuId: "milk", qty: 250, text: "250 ml Sainsbury's SO Organic Whole Milk, or cold water if the organic bottle is out" },
        { skuId: "fruit", qty: 200, text: "200 g Sainsbury's Frozen Summer Fruits" },
        { skuId: "lemons", qty: 40, text: "40 g Sainsbury's SO Organic Lemons, peeled" },
        { skuId: "hemp", qty: 20, text: "20 g Sainsbury's Hulled Hemp Hearts" }
      ],
      lines: [
        "250 ml Sainsbury's SO Organic Whole Milk into the 3000W jug.",
        "200 g Sainsbury's Frozen Summer Fruits.",
        "40 g peeled Sainsbury's SO Organic Lemons.",
        "20 g Sainsbury's Hulled Hemp Hearts.",
        "This is the heavy morning extraction. It is still not dinner. Brazil nut maximum is one a day."
      ]
    },
    "live-mon-banana-blueberry": liveGlass("live-mon-banana-blueberry", "Banana, Blueberry, Spinach, Hemp", "Monday training glass.", "1 banana, a handful of blueberries, spinach, and 1 spoon of hemp."),
    "live-tue-papaya-pineapple": liveGlass("live-tue-papaya-pineapple", "Papaya and Pineapple", "Tuesday training glass.", "Papaya and pineapple."),
    "live-wed-mango-cherry": liveGlass("live-wed-mango-cherry", "Mango, Cherry, and Hemp", "Wednesday training glass.", "Mango, cherry, and 1 spoon of hemp."),
    "live-thu-kiwi-berry": liveGlass("live-thu-kiwi-berry", "Kiwi and Berry", "Thursday training glass.", "Kiwi and a handful of berries."),
    "live-fri-pineapple-ginger": liveGlass("live-fri-pineapple-ginger", "Pineapple, Spinach, and Ginger", "Friday training glass.", "Pineapple, spinach, and ginger."),
    "live-sat-banana-blueberry": liveGlass("live-sat-banana-blueberry", "Banana and Blueberry", "Saturday training glass.", "1 banana and a handful of blueberries.")
  };

  function liveGlass(id, name, tagline, fruitLine) {
    return {
      id: id,
      name: name,
      tagline: tagline,
      script: fruitLine,
      yield: "1 glass",
      prepMin: 5,
      cookLabel: "3000W · 45 sec, then strain",
      band: "moderate",
      lock: "Morning only. Not dinner.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household glass" },
      tip: "Training-day glass. Morning or a lunch refresh. Not dinner. One Brazil nut a day at most.",
      ingredients: [
        { skuId: "milk", qty: 1, text: "Milk or water to move the blades" },
        { skuId: "fruit", qty: 1, text: fruitLine },
        { skuId: "lemons", qty: 1, text: "A squeeze of lemon" },
        { skuId: "hemp", qty: 1, text: "1 spoon hemp when the day asks for it" }
      ],
      lines: [
        "Milk or water into the 3000W jug.",
        fruitLine,
        "A squeeze of lemon.",
        "1 spoon hemp when the day asks for it.",
        "Morning glass only. Not dinner. One Brazil nut a day at most, beside the glass."
      ]
    };
  }

  function present(id, tierId) {
    var card = CARDS[id];
    var shop = window.RELIC_FOOD_SHOP;
    if (!card || !shop) return null;
    var tier = tierId === 2 ? 2 : 1;
    var tierRow = shop.tiers[tier];
    var lines = card.lines;
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
      ingredients: withBotanicals(card.ingredients, card.band),
      method: glassMethod(lines[0], lines[1], lines[2], lines[3], card.band, lines[4]),
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
    build: "v19",
    sequence: SEQUENCE,
    botanicals: BOTANICALS,
    cards: CARDS,
    order: [
      "berry-banana-brazil",
      "cherry-banana-cream",
      "mango-banana-nut",
      "berry-oat-almond",
      "orange-berry-yogurt",
      "morning-cell-shatter",
      "recovery-botanical-extraction"
    ],
    morningDoses: doses,
    present: present
  };
})();
