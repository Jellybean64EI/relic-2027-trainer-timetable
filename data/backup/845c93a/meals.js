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
      tip: "Cook extra chicken once so the next lunch does not need a new pack. Drive has no gram lock for this plate.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "chicken", qty: 1, text: "1 British chicken breast, or a tray of thighs" },
          { skuId: "potatoes", qty: 1, text: "Potatoes from the bag" },
          { skuId: "spinachF", qty: 1, text: "A portion of frozen spinach" },
          { skuId: "garlic", qty: 1, text: "1 clove Sainsbury's Garlic" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" },
          { skuId: "salt", qty: 1, text: "Sainsbury's Table Salt" }
        ],
        2: [
          { skuId: "chicken", qty: 1, text: "1 British chicken breast, or a tray of thighs" },
          { skuId: "potatoes", qty: 1, text: "Potatoes from the bag" },
          { skuId: "sweetPot", qty: 1, text: "1 sweet potato" },
          { skuId: "tenderstem", qty: 1, text: "A handful of Tenderstem broccoli" },
          { skuId: "garlic", qty: 1, text: "1 clove Sainsbury's Garlic" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
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
      tip: "If turkey mince is already covering the month, do not buy another pack. Use a household portion from the open pack.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "turkey", qty: 1, text: "A household portion of Sainsbury's British Turkey Mince 2% Fat from the open pack" },
          { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag" },
          { skuId: "onion", qty: 1, text: "1 onion" },
          { skuId: "passata", qty: 1, text: "A ladle of Sainsbury's Tomato Passata" },
          { skuId: "spinachF", qty: 1, text: "A handful of frozen spinach" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
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
      tip: "Tier 1 uses one frozen fillet. Tier 2 uses one fresh ASC fillet when it is on the counter. Drive has no gram lock for this plate.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "salmonFrozen", qty: 1, text: "1 Sainsbury's Frozen Boneless Salmon Fillet" },
          { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag" },
          { skuId: "spinachF", qty: 1, text: "A plate of greens" },
          { skuId: "lemons", qty: 1, text: "Lemon" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
        ],
        2: [
          { skuId: "salmonFresh", qty: 1, text: "1 Sainsbury's ASC Fresh Scottish Salmon Fillet" },
          { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag" },
          { skuId: "tenderstem", qty: 1, text: "A handful of Tenderstem broccoli" },
          { skuId: "lemons", qty: 1, text: "Lemon" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
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
        "chicken-rice-broccoli": card({
      id: "chicken-rice-broccoli",
      kind: "meal",
      seed: false,
      name: "Chicken, Rice and Broccoli",
      tagline: "The training plate.",
      script: "Chicken first. Rice under it. Broccoli on the side.",
      yield: "1 plate",
      prepMin: 12,
      cookLabel: "Pan · 18 min",
      protein: "Chicken",
      carb: "Rice",
      role: "main",
      timetable: {
        bestFor: "Monday chicken night",
        bestEaten: "Fresh",
        reheat: "Cover and reheat until the chicken is piping hot"
      },
      tip: "Drive has no gram lock for this plate. One breast, rice from the bag, and a portion of broccoli.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "chicken", qty: 1, text: "1 British chicken breast" },
          { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag" },
          { skuId: "broccoliF", qty: 1, text: "A portion of Sainsbury's Frozen Broccoli" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" },
          { skuId: "salt", qty: 1, text: "Sainsbury's Table Salt" }
        ]
      },
      method: {
        1: [
          step("Rinse", "a portion of rice from the bag and simmer it until tender."),
          step("Season", "one British chicken breast with salt."),
          step("Pan", "fry the chicken in the oil until the juices run clear, about 16–18 minutes."),
          step("Steam", "a portion of frozen broccoli until hot."),
          step("Plate", "chicken, rice, and broccoli. This is dinner. The smoothie was the morning.")
        ]
      }
    }),
    "tuna-avocado-lettuce": card({
      id: "tuna-avocado-lettuce",
      kind: "meal",
      seed: false,
      name: "Tuna, Avocado and Lettuce",
      tagline: "The mixer-deck plate.",
      script: "Cool tuna. Ripe avocado. Crisp leaves.",
      yield: "1 plate",
      prepMin: 8,
      cookLabel: "No cook · 8 min",
      protein: "Tuna",
      carb: "Rice",
      role: "main",
      timetable: {
        bestFor: "A flex night when the mince is already covered",
        bestEaten: "Fresh",
        reheat: "Do not reheat avocado. Build the plate again."
      },
      tip: "Tuna is a mixer card, not one of the four training proteins. One tin is the portion.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "tuna", qty: 1, text: "1 tin Sainsbury's Tuna Chunks in Spring Water, drained" },
          { skuId: "avocado", qty: 1, text: "1 ripe avocado" },
          { skuId: "lettuce", qty: 1, text: "A handful of Sainsbury's Iceberg Lettuce" },
          { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag, cooked" },
          { skuId: "lemons", qty: 1, text: "Lemon juice" }
        ]
      },
      method: {
        1: [
          step("Drain", "one tin of tuna and flake it."),
          step("Slice", "one avocado and a handful of lettuce."),
          step("Squeeze", "the lemon over the avocado."),
          step("Plate", "the tuna on the rice with avocado and lettuce. ")
        ]
      }
    }),
    "mince-pasta-frozen-veg": card({
      id: "mince-pasta-frozen-veg",
      kind: "meal",
      seed: false,
      name: "Mince, Pasta and Frozen Veg",
      tagline: "One dinner method.",
      script: "Pasta, mince, then the frozen veg. Flex nights skip the mince.",
      yield: "1 plate",
      prepMin: 8,
      cookLabel: "Pan · 16 min",
      protein: "Turkey Mince",
      carb: "Pasta",
      role: "main",
      timetable: {
        bestFor: "Mince nights — turkey, chicken, or beef",
        bestEaten: "Fresh",
        reheat: "Cover and heat until the mince is piping hot"
      },
      tip: "Protect the packs already in the fridge. Do not open a new pack if this month is already covered. A household portion, not an invented gram weight.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "turkey", qty: 1, text: "A household portion of Sainsbury's British Turkey Mince 2% Fat from the open pack" },
          { skuId: "pasta", qty: 1, text: "Pasta from the cupboard" },
          { skuId: "mixedVeg", qty: 1, text: "1 tray of frozen broccoli, peas, sweetcorn, or mixed vegetables" },
          { skuId: "garlic", qty: 1, text: "1 clove Sainsbury's Garlic" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
        ],
        2: [
          { skuId: "beef5", qty: 1, text: "A household portion of Sainsbury's Taste the Difference British Beef Mince 5% Fat" },
          { skuId: "pasta", qty: 1, text: "Pasta from the cupboard" },
          { skuId: "tenderstem", qty: 1, text: "1 tray of broccoli, peas, or mixed veg" },
          { skuId: "garlic", qty: 1, text: "1 clove Sainsbury's Garlic" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Boil", "pasta from the stock you already have."),
          step("Brown", "a household portion of mince in the oil with the garlic."),
          step("Add", "one tray of frozen veg and cook until hot."),
          step("Combine", "pasta, mince, and veg. Flex nights skip the mince and keep the pasta and veg.")
        ]
      }
    }),
    "flex-pasta-veg-bowl": card({
      id: "flex-pasta-veg-bowl",
      kind: "meal",
      seed: false,
      name: "Flex Pasta and Veg Bowl",
      tagline: "The night without mince.",
      script: "Same pan. No new protein pack.",
      yield: "1 bowl",
      prepMin: 6,
      cookLabel: "Pan · 12 min",
      protein: "Chicken",
      carb: "Pasta",
      role: "main",
      timetable: {
        bestFor: "Saturday flex night",
        bestEaten: "Fresh",
        reheat: "Add a splash of water and reheat covered"
      },
      tip: "Skip the mince. The morning smoothie is not this dinner. Pasta and one tray of veg are the portion.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: {
        1: [
          { skuId: "pasta", qty: 1, text: "Pasta from the cupboard" },
          { skuId: "mixedVeg", qty: 1, text: "1 tray of frozen broccoli, peas, sweetcorn, or mixed vegetables" },
          { skuId: "cheddar", qty: 1, text: "A little Sainsbury's Mature Cheddar, optional" },
          { skuId: "oil", qty: 1, text: "A splash of Sainsbury's Olive Oil" }
        ]
      },
      method: {
        1: [
          step("Boil", "pasta from the cupboard."),
          step("Heat", "one tray of frozen veg in the same pan until hot."),
          step("Skip", "the mince. This is the flex night."),
          step("Toss", "pasta and veg together. A little cheddar is optional.")
        ]
      }
    }),
    "chicken-broccoli-carrot": card({
      id: "chicken-broccoli-carrot",
      kind: "meal",
      name: "Chicken, Broccoli and Carrot",
      tagline: "Monday evening. Lunch was a meal.",
      script: "The bird, the greens, one carrot.",
      yield: "1 plate",
      prepMin: 15,
      cookLabel: "Tray or pan · until the chicken is cooked through",
      protein: "Chicken",
      carb: "Rice",
      role: "main",
      timetable: { bestFor: "Monday evening", bestEaten: "Fresh", reheat: "Heat the leftover chicken until piping hot" },
      tip: "Drive has no cooked-plate gram lock for this dinner. The portion is one breast, broccoli, and a carrot.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: { 1: [
        { skuId: "chicken", qty: 1, text: "1 British chicken breast" },
        { skuId: "broccoliF", qty: 1, text: "1 handful broccoli" },
        { skuId: "carrots", qty: 1, text: "1 carrot" },
        { skuId: "rice", qty: 1, text: "Rice or potato from the bag already open" }
      ] },
      method: { 1: [
        step("Cook", "one British chicken breast until the juices run clear."),
        step("Steam", "the broccoli and the carrot."),
        step("Plate", "them with rice or potato. This is dinner. The smoothie was the morning.")
      ] }
    }),
    "salmon-greens-potato": card({
      id: "salmon-greens-potato",
      kind: "meal",
      name: "Salmon, Greens and Potato",
      tagline: "Tuesday evening.",
      script: "One fillet. Greens. One potato.",
      yield: "1 plate",
      prepMin: 10,
      cookLabel: "Oven tray",
      protein: "Salmon",
      carb: "Potatoes",
      role: "main",
      timetable: { bestFor: "Tuesday evening", bestEaten: "Fresh", reheat: "Heat the fillet until piping hot" },
      tip: "Household portion from FOOD_LIVE. Not a weighed gram plate.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: { 1: [
        { skuId: "salmonFrozen", qty: 1, text: "1 ASC salmon fillet" },
        { skuId: "spinachF", qty: 1, text: "A plate of greens" },
        { skuId: "potatoes", qty: 1, text: "1 potato" }
      ] },
      method: { 1: [
        step("Roast", "one salmon fillet on a tray."),
        step("Cook", "the greens and one potato."),
        step("Plate", "fillet, greens, and potato. The morning glass is not this dinner.")
      ] }
    }),
    "chicken-mushroom-greens": card({
      id: "chicken-mushroom-greens",
      kind: "meal",
      name: "Chicken, Mushrooms and Greens",
      tagline: "Leftover chicken for a later dinner.",
      script: "Leftover bird. Mushrooms. Greens.",
      yield: "1 plate",
      prepMin: 10,
      cookLabel: "Pan",
      protein: "Chicken",
      carb: "Rice",
      role: "main",
      timetable: { bestFor: "Wednesday evening", bestEaten: "Fresh", reheat: "Heat until the chicken is piping hot" },
      tip: "This chicken plate is the leftover tray.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: { 1: [
        { skuId: "chicken", qty: 1, text: "Leftover British chicken" },
        { skuId: "mushrooms", qty: 1, text: "1 handful mushrooms" },
        { skuId: "spinachF", qty: 1, text: "A plate of greens" }
      ] },
      method: { 1: [
        step("Warm", "the leftover chicken."),
        step("Fry", "the mushrooms and greens."),
        step("Plate", "them together.")
      ] }
    }),
    "chicken-thigh-tray": card({
      id: "chicken-thigh-tray",
      kind: "meal",
      name: "Chicken Thigh Tray",
      tagline: "Thursday evening.",
      script: "One tray of thighs. One tray of veg.",
      yield: "1 tray",
      prepMin: 10,
      cookLabel: "Oven tray",
      protein: "Chicken",
      carb: "Potatoes",
      role: "main",
      timetable: { bestFor: "Thursday evening", bestEaten: "Fresh", reheat: "Cover and heat the tray" },
      tip: "A tray is the portion. Drive does not lock a gram weight for this dinner.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household tray" },
      ingredients: { 1: [
        { skuId: "chicken", qty: 1, text: "1 tray of British chicken thighs" },
        { skuId: "mixedVeg", qty: 1, text: "1 tray of mixed veg" }
      ] },
      method: { 1: [
        step("Roast", "the chicken thighs on one tray."),
        step("Roast", "the mixed veg on the second tray."),
        step("Serve", "both.")
      ] }
    }),
    "salmon-or-white-fish": card({
      id: "salmon-or-white-fish",
      kind: "meal",
      name: "Salmon or White Fish",
      tagline: "Friday evening. Easy night.",
      script: "One fillet. Greens. Rice from the open bag.",
      yield: "1 plate",
      prepMin: 10,
      cookLabel: "Pan or oven",
      protein: "Salmon",
      carb: "Rice",
      role: "main",
      timetable: { bestFor: "Friday evening", bestEaten: "Fresh", reheat: "Heat the fillet until piping hot" },
      tip: "This evening plate is the fish.",
      macros: { kcal: "—", protein: "—", carb: "—", fat: "—", basis: "household portion" },
      ingredients: { 1: [
        { skuId: "salmonFrozen", qty: 1, text: "1 salmon or white-fish fillet" },
        { skuId: "spinachF", qty: 1, text: "Greens" },
        { skuId: "rice", qty: 1, text: "Rice from the 1 kg bag" }
      ] },
      method: { 1: [
        step("Cook", "one fillet."),
        step("Heat", "the greens and a portion of rice."),
        step("Plate", "them.")
      ] }
    }),
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
    "beef-stuffed-potato-boats",
                    "chicken-broccoli-carrot",
    "salmon-greens-potato",
    "chicken-mushroom-greens",
    "chicken-thigh-tray",
    "salmon-or-white-fish",
    "bulk-chicken-potato-plate",
    "chicken-rice-broccoli",
    "turkey-mince-rice-skillet",
    "mince-pasta-frozen-veg",
    "salmon-rice-plate",
    "tuna-avocado-lettuce",
    "flex-pasta-veg-bowl"
  ];

  function present(id, tierId) {
    var meal = MEALS[id];
    var shop = window.RELIC_FOOD_SHOP;
    if (!meal || meal.banned || !shop) return null;
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
    build: "v19",
    meals: MEALS,
    order: ORDER,
    present: present
  };
})();
