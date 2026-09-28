/* Relic Food OS — meal recipe cards. Magazine cards only.
   Does not read relic_completions, the player, or the CUE panel. */
window.RELIC_FOOD_MEALS = (function () {
  function step(verb, detail) {
    return { verb: verb, detail: detail };
  }

  function card(spec) {
    return spec;
  }

  var MEALS = {
    "crispy-potato-snack": card({
      id: "crispy-potato-snack",
      kind: "meal",
      seed: true,
      name: "Crispy Potato Snack",
      tagline: "Crispy. Budget-friendly. Great for snacking.",
      script: "Golden outside. Soft middle. Big crunch.",
      yield: "about 35–40 bites",
      prepMin: 15,
      cookLabel: "Air fry 200°C · 12–15 min",
      protein: "",
      carb: "Potatoes",
      role: "side",
      timetable: {
        bestFor: "Afternoon snack, movie snack, light side",
        bestEaten: "Fresh",
        reheat: "3–5 mins in the air fryer"
      },
      tip: "Keep the bites small and even so they crisp up faster and cook more evenly.",
      macros: { kcal: 375, protein: 8, carb: 70, fat: 4, basis: "whole batch" },
      ingredients: {
        1: [
          { skuId: "potatoes", qty: 400, text: "400 g Sainsbury's Maris Piper Potatoes, diced" },
          { skuId: "salt", qty: 1, text: "½ tsp garlic powder" },
          { skuId: "salt", qty: 1, text: "½ tsp smoked paprika" },
          { skuId: "salt", qty: 1, text: "½ tsp black pepper" },
          { skuId: "salt", qty: 1, text: "½ tsp dried parsley" },
          { skuId: "salt", qty: 2, text: "½ tsp Sainsbury's Table Salt" },
          { skuId: "cornstarch", qty: 15, text: "15 g Sainsbury's Cornflour" },
          { skuId: "oil", qty: 5, text: "Sainsbury's Olive Oil spray, light coat" }
        ],
        2: [
          { skuId: "potatoes", qty: 400, text: "400 g Sainsbury's Maris Piper Potatoes, diced" },
          { skuId: "salt", qty: 1, text: "½ tsp garlic powder" },
          { skuId: "salt", qty: 1, text: "½ tsp smoked paprika" },
          { skuId: "salt", qty: 1, text: "½ tsp black pepper" },
          { skuId: "salt", qty: 1, text: "½ tsp dried parsley" },
          { skuId: "salt", qty: 2, text: "½ tsp Sainsbury's Table Salt" },
          { skuId: "cornstarch", qty: 15, text: "15 g Sainsbury's Cornflour" },
          { skuId: "oil", qty: 5, text: "Sainsbury's Olive Oil spray, light coat" }
        ]
      },
      method: {
        1: [
          step("Rinse", "400 g diced Sainsbury's Maris Piper Potatoes and place them in a microwave-safe bowl."),
          step("Cover", "the bowl and microwave on high for 9–12 minutes, until the potato is soft enough to mash."),
          step("Mash", "well, then let it cool until you no longer see steam."),
          step("Mix", "in the garlic powder, smoked paprika, black pepper, parsley, salt, and 15 g cornflour."),
          step("Knead", "until smooth, then roll into small even balls."),
          step("Place", "the bites on a rack, coat lightly with oil spray, and air fry at 200°C for 12–15 minutes until golden."),
          step("Serve", "hot with ketchup or the dip you already have. This is a snack, not dinner.")
        ]
      }
    }),
    "cheesy-roasted-garlic-bread": card({
      id: "cheesy-roasted-garlic-bread",
      kind: "meal",
      seed: true,
      name: "Cheesy Roasted Garlic Bread",
      tagline: "Garlicky. Cheesy. Irresistible.",
      script: "Soft garlic. Melty cheese. Big flavour.",
      yield: "Serves 4–6",
      prepMin: 10,
      cookLabel: "Roast 180°C · 35–45 min, then bake 8–10 min",
      protein: "",
      carb: "",
      role: "side",
      timetable: {
        bestFor: "Lunch, dinner side, weekend treat",
        bestEaten: "Fresh",
        reheat: "5–7 mins in the oven or air fryer"
      },
      tip: "Save a little garlic oil for drizzling or brushing the bread edges.",
      macros: { kcal: 540, protein: 18, carb: 42, fat: 32, basis: "portion" },
      ingredients: {
        1: [
          { skuId: "bread", qty: 400, text: "1 Sainsbury's White Farmhouse Bloomer, or a baguette" },
          { skuId: "garlic", qty: 60, text: "2 bulbs Sainsbury's Garlic, peeled into cloves" },
          { skuId: "oil", qty: 40, text: "Sainsbury's Olive Oil, enough to cover the garlic" },
          { skuId: "butter", qty: 45, text: "3 tbsp softened Sainsbury's British Salted Butter" },
          { skuId: "mozzarella", qty: 120, text: "1 to 1½ cups Sainsbury's Grated Mozzarella" },
          { skuId: "salt", qty: 1, text: "1 tbsp chopped parsley, ½ tsp garlic powder, ½ tsp salt, ¼ tsp black pepper" }
        ],
        2: [
          { skuId: "bread", qty: 400, text: "1 Sainsbury's White Farmhouse Bloomer, or a baguette" },
          { skuId: "garlic", qty: 60, text: "2 bulbs Sainsbury's Garlic, peeled into cloves" },
          { skuId: "oil", qty: 40, text: "Sainsbury's Olive Oil, enough to cover the garlic" },
          { skuId: "butter", qty: 45, text: "3 tbsp softened Sainsbury's British Salted Butter" },
          { skuId: "cheddarPremium", qty: 80, text: "80 g Sainsbury's Taste the Difference Extra Mature Cheddar, grated" },
          { skuId: "salt", qty: 1, text: "1 tbsp chopped parsley, ½ tsp garlic powder, ½ tsp salt, ¼ tsp black pepper" }
        ]
      },
      method: {
        1: [
          step("Roast", "the peeled garlic cloves in a small dish covered with olive oil at 180°C (160°C fan) for 35–45 minutes, until soft and golden."),
          step("Mash", "the roasted garlic with the butter, parsley, garlic powder, salt, and black pepper."),
          step("Slice", "the loaf lengthways."),
          step("Spread", "the garlic mixture evenly over the cut face, out to the crust."),
          step("Bake", "under the grill or back in the oven for 8–10 minutes, until the cheese is melted, bubbly, and lightly golden."),
          step("Serve", "sliced and warm. Tomato dip is optional. This is a side, not the smoothie.")
        ]
      }
    }),
    "cheesy-potato-toast": card({
      id: "cheesy-potato-toast",
      kind: "meal",
      seed: true,
      name: "Cheesy Potato Toast",
      tagline: "Crispy outside, melty middle.",
      script: "Weekend treat from the potato bag.",
      yield: "4 thick rounds",
      prepMin: 20,
      cookLabel: "Pan fry · 8–10 min",
      protein: "",
      carb: "Potatoes",
      role: "side",
      timetable: {
        bestFor: "Snack, lunch, weekend treat",
        bestEaten: "Fresh",
        reheat: "A few minutes in a pan or air fryer"
      },
      tip: "Seal the mozzarella inside the round so it stays in the middle.",
      macros: { kcal: 480, protein: 16, carb: 52, fat: 22, basis: "two rounds" },
      ingredients: {
        1: [
          { skuId: "potatoes", qty: 600, text: "3 large Sainsbury's Maris Piper Potatoes, boiled and peeled" },
          { skuId: "butter", qty: 45, text: "3 tbsp Sainsbury's British Salted Butter" },
          { skuId: "cornstarch", qty: 30, text: "3 tbsp Sainsbury's Cornflour" },
          { skuId: "salt", qty: 2, text: "Sainsbury's Table Salt and black pepper" },
          { skuId: "mozzarella", qty: 80, text: "Sainsbury's Grated Mozzarella, for the filling" },
          { skuId: "oil", qty: 10, text: "Sainsbury's Olive Oil, for the pan" }
        ]
      },
      method: {
        1: [
          step("Mash", "the boiled potatoes with the butter until smooth."),
          step("Mix", "in the cornflour, salt, and pepper to form a soft dough."),
          step("Flatten", "portions, add mozzarella, and seal into thick rounds."),
          step("Fry", "in a little oil until golden on both sides, then serve hot.")
        ]
      }
    }),
    "paprika-potato-egg-skillet": card({
      id: "paprika-potato-egg-skillet",
      kind: "meal",
      seed: true,
      name: "Paprika Potato Egg Skillet",
      tagline: "Simple skillet comfort food.",
      script: "Cook the egg whites. Raw whites block biotin.",
      yield: "2 servings",
      prepMin: 10,
      cookLabel: "Covered pan · about 15 min",
      protein: "Eggs",
      carb: "Potatoes",
      role: "main",
      timetable: {
        bestFor: "Light dinner or brunch",
        bestEaten: "Fresh",
        reheat: "Covered pan for a few minutes until hot"
      },
      tip: "Keep the lid on until the egg white is fully set. Do not drink the white raw.",
      macros: { kcal: 420, protein: 18, carb: 40, fat: 20, basis: "serving" },
      ingredients: {
        1: [
          { skuId: "potatoes", qty: 300, text: "2 Sainsbury's Maris Piper Potatoes, thinly sliced" },
          { skuId: "salt", qty: 2, text: "1 tsp paprika, salt, and black pepper" },
          { skuId: "eggsOmega", qty: 2, text: "2 Sainsbury's Woodland Free Range Omega-3 Enriched Eggs" },
          { skuId: "passata", qty: 40, text: "1 tomato, diced" },
          { skuId: "onion", qty: 15, text: "Chopped chives or spring onion" },
          { skuId: "mozzarella", qty: 40, text: "40 g Sainsbury's Grated Mozzarella" },
          { skuId: "oil", qty: 8, text: "8 ml Sainsbury's Olive Oil" }
        ],
        2: [
          { skuId: "potatoes", qty: 300, text: "2 Sainsbury's Maris Piper Potatoes, thinly sliced" },
          { skuId: "salt", qty: 2, text: "1 tsp paprika, salt, and black pepper" },
          { skuId: "eggsPasture", qty: 2, text: "2 Sainsbury's Taste the Difference Pasture-Raised Eggs" },
          { skuId: "passata", qty: 40, text: "1 tomato, diced" },
          { skuId: "onion", qty: 15, text: "Chopped chives or spring onion" },
          { skuId: "cheddarPremium", qty: 30, text: "30 g Sainsbury's Taste the Difference Extra Mature Cheddar" },
          { skuId: "oil", qty: 8, text: "8 ml Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Layer", "the potato slices in an oiled pan and season with paprika, salt, and pepper."),
          step("Whisk", "the eggs with the tomato and chives. Cook the whites — do not leave them raw."),
          step("Cover", "and cook for about 10 minutes, until the white is set."),
          step("Add", "the cheese and cook 5 minutes more, until it melts.")
        ]
      }
    }),
    "beef-stuffed-potato-boats": card({
      id: "beef-stuffed-potato-boats",
      kind: "meal",
      seed: true,
      name: "Beef-Stuffed Potato Boats",
      tagline: "Hearty and filling.",
      script: "One dinner method: mince, potato, and a little cheese.",
      yield: "3 boats",
      prepMin: 15,
      cookLabel: "Microwave 8 min, then bake until golden",
      protein: "Beef Mince",
      carb: "Potatoes",
      role: "main",
      timetable: {
        bestFor: "Dinner, meal-prep, hearty lunch",
        bestEaten: "Fresh",
        reheat: "Oven or air fryer until the skins crisp again"
      },
      tip: "Scoop only a little from each potato so the boat still holds the mince.",
      macros: { kcal: 710, protein: 46, carb: 58, fat: 30, basis: "plate" },
      ingredients: {
        1: [
          { skuId: "potatoes", qty: 450, text: "3 Sainsbury's Maris Piper Potatoes (about 450 g)" },
          { skuId: "beef10", qty: 300, text: "300 g Sainsbury's British Beef Mince 10% Fat" },
          { skuId: "garlic", qty: 6, text: "1 clove Sainsbury's Garlic, or a little onion" },
          { skuId: "passata", qty: 40, text: "1 tomato, diced" },
          { skuId: "salt", qty: 2, text: "½ tsp onion powder, paprika, salt, and black pepper" },
          { skuId: "mozzarella", qty: 40, text: "Sainsbury's Grated Mozzarella" }
        ],
        2: [
          { skuId: "potatoes", qty: 450, text: "3 Sainsbury's Maris Piper Potatoes (about 450 g)" },
          { skuId: "beef5", qty: 300, text: "300 g Sainsbury's Taste the Difference British Beef Mince 5% Fat" },
          { skuId: "garlic", qty: 6, text: "1 clove Sainsbury's Garlic, or a little onion" },
          { skuId: "passata", qty: 40, text: "1 tomato, diced" },
          { skuId: "salt", qty: 2, text: "½ tsp onion powder, paprika, salt, and black pepper" },
          { skuId: "cheddarPremium", qty: 35, text: "35 g Sainsbury's Taste the Difference Extra Mature Cheddar" }
        ]
      },
      method: {
        1: [
          step("Cook", "the beef with the garlic or onion, tomato, and seasoning until the mince is browned."),
          step("Halve", "the potatoes after a microwave start, then scoop them slightly."),
          step("Fill", "each boat with the beef and a little mozzarella."),
          step("Bake", "until the tops are golden and the centres are hot.")
        ]
      }
    }),
    "bread-egg-pan-pizza": card({
      id: "bread-egg-pan-pizza",
      kind: "meal",
      seed: true,
      name: "Bread & Egg Pan Pizza",
      tagline: "Pizza vibes from pantry basics.",
      script: "Hearty Monday lunch. Cook the egg white through.",
      yield: "1 pan, 6 slices",
      prepMin: 10,
      cookLabel: "Covered pan · about 12 min",
      protein: "Eggs",
      carb: "",
      role: "main",
      timetable: {
        bestFor: "Quick lunch, easy dinner",
        bestEaten: "Fresh",
        reheat: "Covered pan, oven, or air fryer"
      },
      tip: "Wait until the egg base is set before you flip. The white must be cooked.",
      macros: { kcal: 560, protein: 28, carb: 48, fat: 26, basis: "pan" },
      ingredients: {
        1: [
          { skuId: "bread", qty: 240, text: "6 slices Sainsbury's White Farmhouse Bloomer" },
          { skuId: "eggsOmega", qty: 4, text: "3 to 4 Sainsbury's Woodland Free Range Omega-3 Enriched Eggs" },
          { skuId: "passata", qty: 80, text: "80 g Sainsbury's Tomato Passata" },
          { skuId: "passata", qty: 40, text: "1 small tomato, diced" },
          { skuId: "onion", qty: 30, text: "Red onion and spring onion, finely chopped" },
          { skuId: "mozzarella", qty: 100, text: "100 g Sainsbury's Grated Mozzarella" },
          { skuId: "oil", qty: 8, text: "A little Sainsbury's Olive Oil or salted butter" }
        ]
      },
      method: {
        1: [
          step("Arrange", "the bread slices in a greased pan and pour over the beaten eggs."),
          step("Cook", "until the egg base is set and the white is no longer raw, then flip carefully."),
          step("Spread", "the tomato passata over the top."),
          step("Add", "the onion, tomato, spring onion, and mozzarella, then cover until the cheese melts.")
        ]
      }
    }),
    "bulk-chicken-potato-plate": card({
      id: "bulk-chicken-potato-plate",
      kind: "meal",
      seed: false,
      name: "Bulk Chicken Potato Plate",
      tagline: "The chicken night.",
      script: "One bird, potatoes, and three veg portions on the plate.",
      yield: "1 plate",
      prepMin: 12,
      cookLabel: "Air fry 200°C · 14 min",
      protein: "Chicken",
      carb: "Potatoes",
      role: "main",
      timetable: {
        bestFor: "Training dinner",
        bestEaten: "Fresh",
        reheat: "Air fryer until the chicken is hot through"
      },
      tip: "Cook extra chicken once so the next lunch does not need a new pack.",
      macros: { kcal: 680, protein: 52, carb: 54, fat: 22, basis: "plate" },
      ingredients: {
        1: [
          { skuId: "chicken", qty: 320, text: "320 g Sainsbury's British Whole Chicken" },
          { skuId: "potatoes", qty: 350, text: "350 g Sainsbury's Maris Piper Potatoes" },
          { skuId: "spinachF", qty: 80, text: "80 g Sainsbury's Frozen Spinach" },
          { skuId: "garlic", qty: 4, text: "4 g Sainsbury's Garlic" },
          { skuId: "oil", qty: 8, text: "8 ml Sainsbury's Olive Oil" },
          { skuId: "salt", qty: 2, text: "2 g Sainsbury's Table Salt" }
        ],
        2: [
          { skuId: "chicken", qty: 340, text: "340 g Sainsbury's British Whole Chicken" },
          { skuId: "potatoes", qty: 300, text: "300 g Sainsbury's Maris Piper Potatoes" },
          { skuId: "sweetPot", qty: 120, text: "120 g Sainsbury's Sweet Potatoes" },
          { skuId: "tenderstem", qty: 80, text: "80 g Tenderstem broccoli" },
          { skuId: "garlic", qty: 4, text: "4 g Sainsbury's Garlic" },
          { skuId: "oil", qty: 8, text: "8 ml Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Rub", "the chicken with garlic, salt, and half the oil."),
          step("Air", "fry at 200°C for 14 minutes, until the juices run clear."),
          step("Microwave", "the potatoes until a knife meets the centre, then the spinach until hot."),
          step("Plate", "chicken, potato, and greens together. The morning smoothie stays a separate glass.")
        ]
      }
    }),
    "turkey-mince-rice-skillet": card({
      id: "turkey-mince-rice-skillet",
      kind: "meal",
      seed: false,
      name: "Turkey Mince Rice Skillet",
      tagline: "The mince night.",
      script: "One dinner method. Flex nights skip the mince.",
      yield: "1 skillet",
      prepMin: 10,
      cookLabel: "Hob · 8 min after the rice",
      protein: "Turkey Mince",
      carb: "Rice",
      role: "main",
      timetable: {
        bestFor: "Training dinner",
        bestEaten: "Fresh",
        reheat: "Covered pan with a splash of water"
      },
      tip: "If turkey mince is already covering the month, do not buy another pack.",
      macros: { kcal: 620, protein: 48, carb: 68, fat: 14, basis: "skillet" },
      ingredients: {
        1: [
          { skuId: "turkey", qty: 200, text: "200 g Sainsbury's British Turkey Mince 2% Fat" },
          { skuId: "rice", qty: 80, text: "80 g Sainsbury's Easy Cook Long Grain Rice, dry" },
          { skuId: "onion", qty: 50, text: "50 g Sainsbury's White Onions" },
          { skuId: "passata", qty: 80, text: "80 g Sainsbury's Tomato Passata" },
          { skuId: "spinachF", qty: 60, text: "60 g Sainsbury's Frozen Spinach" },
          { skuId: "oil", qty: 5, text: "5 ml Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Rinse", "the rice and microwave it, covered, until the grains are tender."),
          step("Brown", "the turkey mince with the onion in the oil."),
          step("Stir", "in the passata and spinach and simmer until the veg is hot."),
          step("Fold", "the rice through and serve. A flex night uses the same pan without the mince.")
        ]
      }
    }),
    "salmon-rice-plate": card({
      id: "salmon-rice-plate",
      kind: "meal",
      seed: false,
      name: "Salmon Rice Plate",
      tagline: "The fish night.",
      script: "ASC Scottish salmon. Twice a week is enough.",
      yield: "1 plate",
      prepMin: 8,
      cookLabel: "Air fry 190°C · 9 min",
      protein: "Salmon",
      carb: "Rice",
      role: "main",
      timetable: {
        bestFor: "Training dinner",
        bestEaten: "Fresh",
        reheat: "Covered, low heat, so the fillet stays moist"
      },
      tip: "Tier 1 uses the frozen fillet. Tier 2 uses the fresh ASC fillet when it is on the counter.",
      macros: { kcal: 640, protein: 42, carb: 66, fat: 20, basis: "plate" },
      ingredients: {
        1: [
          { skuId: "salmonFrozen", qty: 120, text: "120 g Sainsbury's Frozen Boneless Salmon Fillets" },
          { skuId: "rice", qty: 80, text: "80 g Sainsbury's Easy Cook Long Grain Rice, dry" },
          { skuId: "spinachF", qty: 80, text: "80 g Sainsbury's Frozen Spinach" },
          { skuId: "lemons", qty: 20, text: "20 g Sainsbury's SO Organic Lemons" },
          { skuId: "oil", qty: 4, text: "4 ml Sainsbury's Olive Oil" }
        ],
        2: [
          { skuId: "salmonFresh", qty: 180, text: "180 g Sainsbury's ASC Fresh Scottish Salmon Fillets" },
          { skuId: "rice", qty: 80, text: "80 g Sainsbury's Easy Cook Long Grain Rice, dry" },
          { skuId: "tenderstem", qty: 80, text: "80 g Tenderstem broccoli" },
          { skuId: "lemons", qty: 20, text: "20 g Sainsbury's SO Organic Lemons" },
          { skuId: "oil", qty: 4, text: "4 ml Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Rinse", "the rice and microwave it, covered, until tender."),
          step("Rub", "the salmon with oil and salt."),
          step("Air", "fry at 190°C for 9 minutes. From frozen on Tier 1."),
          step("Plate", "the salmon, rice, greens, and lemon. This plate is dinner. The smoothie was the morning.")
        ]
      }
    }),
    "omega3-egg-rest-plate": card({
      id: "omega3-egg-rest-plate",
      kind: "meal",
      seed: false,
      name: "Omega-3 Egg Rest Plate",
      tagline: "The lighter plate.",
      script: "Cook the egg whites. Raw whites block biotin.",
      yield: "1 plate",
      prepMin: 5,
      cookLabel: "Soft scramble · 2 min",
      protein: "Eggs",
      carb: "Rice",
      role: "main",
      timetable: {
        bestFor: "Recovery day or a lighter dinner",
        bestEaten: "Fresh",
        reheat: "Do not reheat scrambled eggs. Cook a fresh pair."
      },
      tip: "Keep this plate lighter than a training main. The morning extraction is a separate card.",
      macros: { kcal: 460, protein: 28, carb: 42, fat: 20, basis: "plate" },
      ingredients: {
        1: [
          { skuId: "eggsOmega", qty: 3, text: "3 Sainsbury's Woodland Free Range Omega-3 Enriched Eggs" },
          { skuId: "rice", qty: 60, text: "60 g Sainsbury's Easy Cook Long Grain Rice, dry" },
          { skuId: "butter", qty: 8, text: "8 g Sainsbury's British Salted Butter" },
          { skuId: "spinachF", qty: 40, text: "40 g Sainsbury's Frozen Spinach" },
          { skuId: "salt", qty: 1, text: "1 g Sainsbury's Table Salt" }
        ],
        2: [
          { skuId: "eggsPasture", qty: 3, text: "3 Sainsbury's Taste the Difference Pasture-Raised Eggs" },
          { skuId: "rice", qty: 50, text: "50 g Sainsbury's Easy Cook Long Grain Rice, dry" },
          { skuId: "butter", qty: 8, text: "8 g Sainsbury's British Salted Butter" },
          { skuId: "spinachFresh", qty: 40, text: "40 g Sainsbury's Baby-Leaf Spinach" },
          { skuId: "salt", qty: 1, text: "1 g Sainsbury's Table Salt" }
        ]
      },
      method: {
        1: [
          step("Rinse", "the rice and microwave it, covered, until tender."),
          step("Whisk", "the eggs with salt. The whites go into the pan, not into a glass."),
          step("Scramble", "them low and slow in the butter for 2 minutes, until the white is set."),
          step("Fold", "in the warmed spinach and serve beside the rice.")
        ]
      }
    })
  };

  Object.keys(MEALS).forEach(function (id) {
    var meal = MEALS[id];
    if (!meal.method[2]) meal.method[2] = meal.method[1];
    if (!meal.ingredients[2]) meal.ingredients[2] = meal.ingredients[1];
  });

  var ORDER = [
    "crispy-potato-snack",
    "cheesy-roasted-garlic-bread",
    "cheesy-potato-toast",
    "paprika-potato-egg-skillet",
    "beef-stuffed-potato-boats",
    "bread-egg-pan-pizza",
    "bulk-chicken-potato-plate",
    "turkey-mince-rice-skillet",
    "salmon-rice-plate",
    "omega3-egg-rest-plate"
  ];

  function present(id, tierId) {
    var meal = MEALS[id];
    var shop = window.RELIC_FOOD_SHOP;
    if (!meal || !shop) return null;
    var tier = tierId === 2 ? 2 : 1;
    var tierRow = shop.tiers[tier];
    var ingredients = (meal.ingredients[tier] || meal.ingredients[1]).slice();
    var method = (meal.method[tier] || meal.method[1]).slice();
    var cost = 0;
    ingredients.forEach(function (item) { cost += shop.ingredientCost(item); });
    return {
      id: meal.id,
      kind: "meal",
      seed: !!meal.seed,
      name: meal.name,
      tagline: meal.tagline,
      script: meal.script,
      yield: meal.yield,
      prepMin: meal.prepMin,
      cookLabel: meal.cookLabel,
      protein: meal.protein,
      carb: meal.carb,
      timetable: meal.timetable,
      tip: meal.tip,
      macros: meal.macros,
      ingredients: ingredients,
      method: method,
      costPence: cost,
      tier: tier,
      budgetLabel: tierRow.budgetLabel,
      tierFact: "Tier " + tier + " · " + tierRow.budgetLabel
    };
  }

  return {
    build: "v18",
    meals: MEALS,
    order: ORDER,
    present: present
  };
})();
