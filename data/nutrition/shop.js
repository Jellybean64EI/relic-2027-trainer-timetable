/* Relic Food OS — monthly shop. Sainsbury's citational buys and budget tiers.
   Does not read relic_completions, the player, or the CUE panel. */
window.RELIC_FOOD_SHOP = (function () {
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
    salmonFresh: sku("salmonFresh", "Sainsbury's ASC Fresh Scottish Salmon Fillets 240g", "Sainsbury's", 675, 240, "g", 2),
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
    carrots: sku("carrots", "Sainsbury's SO Organic Carrots 500g", "Sainsbury's", 60, 500, "g", 1),
    cabbage: sku("cabbage", "Sainsbury's Savoy Cabbage", "Sainsbury's", 70, 1, "each", 1),
    mushrooms: sku("mushrooms", "Sainsbury's Closed Cup Mushrooms 300g", "Sainsbury's", 95, 300, "g", 1),
    garlic: sku("garlic", "Sainsbury's Garlic 3 bulb pack", "Sainsbury's", 55, 90, "g", 1),
    onion: sku("onion", "Sainsbury's White Onions 1kg", "Sainsbury's", 75, 1000, "g", 1),
    cheddar: sku("cheddar", "Sainsbury's Mature Cheddar 400g", "Sainsbury's", 275, 400, "g", 1),
    cheddarPremium: sku("cheddarPremium", "Sainsbury's Taste the Difference Extra Mature Cheddar 350g", "Sainsbury's", 375, 350, "g", 2),
    mozzarella: sku("mozzarella", "Sainsbury's Grated Mozzarella 250g", "Sainsbury's", 210, 250, "g", 1),
    butter: sku("butter", "Sainsbury's British Salted Butter 250g", "Sainsbury's", 185, 250, "g", 1),
    passata: sku("passata", "Sainsbury's Tomato Passata 500g", "Sainsbury's", 55, 500, "g", 1),
    oil: sku("oil", "Sainsbury's Olive Oil 500ml", "Sainsbury's", 340, 500, "ml", 1),
    salt: sku("salt", "Sainsbury's Table Salt 750g", "Sainsbury's", 45, 750, "g", 1),
    lemons: sku("lemons", "Sainsbury's SO Organic Lemons", "Sainsbury's", 30, 80, "g", 1),
    hemp: sku("hemp", "Sainsbury's Hulled Hemp Hearts 250g", "Sainsbury's", 340, 250, "g", 1),
    cheesecloth: sku("cheesecloth", "Sainsbury's Cheesecloth 1.5m", "Sainsbury's", 150, 1, "each", 1),
    bread: sku("bread", "Sainsbury's White Farmhouse Bloomer 800g", "Sainsbury's", 115, 800, "g", 1),
    milk: sku("milk", "Sainsbury's SO Organic Whole Milk 2L", "Sainsbury's", 195, 2000, "ml", 1),
    cornstarch: sku("cornstarch", "Sainsbury's Cornflour 250g", "Sainsbury's", 80, 250, "g", 1),
    ashwagandha: sku("ashwagandha", "Sainsbury's KSM-66 Ashwagandha Capsules 60", "Sainsbury's", 650, 60, "cap", 1),
    lionsMane: sku("lionsMane", "Sainsbury's Lion's Mane Fruiting Body Capsules 60", "Sainsbury's", 750, 60, "cap", 1),
    spirulina: sku("spirulina", "Sainsbury's Spirulina Powder 100g", "Sainsbury's", 450, 100, "g", 1),
    psyllium: sku("psyllium", "Sainsbury's Psyllium Husk 200g", "Sainsbury's", 275, 200, "g", 1),
    shilajit: sku("shilajit", "Sainsbury's Shilajit Resin 15g", "Sainsbury's", 850, 15, "g", 1),
    berries: sku("berries", "Sainsbury's Taste the Difference Fresh Blueberries 150g", "Sainsbury's", 250, 150, "g", 2),
    berriesW: sku("berriesW", "Waitrose Fresh Raspberries 150g", "Waitrose", 275, 150, "g", 2),
    spinachFresh: sku("spinachFresh", "Sainsbury's Baby-Leaf Spinach 200g", "Sainsbury's", 165, 200, "g", 2),
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
      priority: "Bulk chicken, turkey mince, potatoes, rice, eggs. Prefer Omega-3, free-range, and SO Organic when stocked. Frozen fruit is allowed."
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
      priority: "Salmon, premium beef mince, wider veg, Waitrose and Sainsbury's premium lines."
    }
  };

  var LAWS = [
    "Protect existing month-cover stock first.",
    "Fruit first, food second.",
    "Smoothies never become dinner.",
    "One dinner method covers mince nights and flex nights.",
    "Daily target: 2 fruit + 3 veg portions."
  ];

  var CITATIONS = [
    "SO Organic bananas, apples, kiwi, lemons, blueberries, mango, oranges, pears, carrots",
    "British chicken",
    "ASC Scottish salmon",
    "Free-range eggs",
    "SO Organic milk or kefir if stocked",
    "Frozen berries",
    "Baby-leaf spinach",
    "Fresh ginger",
    "Hemp hearts",
    "Pineapple",
    "Chicken livers, monthly, optional",
    "Brazil nuts, small pack — maximum 1 a day"
  ];

  var PROTECT = [
    { item: "Turkey mince", stock: "Cover the month before another pack", action: "Do not rebuy while stock holds" },
    { item: "Chicken", stock: "Cover the month before another bird", action: "Do not rebuy while stock holds" },
    { item: "Rice and potatoes", stock: "Carb baseline already in the cupboard", action: "Do not rebuy while stock holds" },
    { item: "Frozen berries", stock: "Use the freezer bag first", action: "Use before buying more" }
  ];

  var FRUIT_FIRST = [
    "SO Organic bananas",
    "SO Organic apples",
    "SO Organic kiwi",
    "SO Organic lemons",
    "Frozen berries, mango, and pineapple",
    "Easy peelers or oranges"
  ];

  var FOOD_SECOND = [
    "British chicken",
    "Turkey mince",
    "Beef mince",
    "ASC Scottish salmon",
    "Free-range eggs",
    "Maris Piper potatoes",
    "Easy Cook long grain rice",
    "Hemp hearts",
    "Cheesecloth"
  ];

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
      vegNote: "October veg: frozen spinach and peas. Fruit is bought before another protein pack."
    }),
    "2026-11": shopping("2026-11", 2026, 11, 1, withVeg([["spinachF", 2], ["broccoliF", 1], ["carrots", 1]]), {
      vegNote: "November veg: frozen spinach, broccoli, and SO Organic carrots."
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
      vegNote: "February onward: fresh ASC salmon, premium beef, wider veg. SO Organic when it is on the shelf."
    })
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

  function ingredientCost(item) {
    var entry = SKUS[item.skuId];
    if (!entry || !entry.packQty) return 0;
    return Math.round(entry.pricePence * item.qty / entry.packQty);
  }

  return {
    build: "v18",
    priceBasis: "placeholder-sainsburys-style",
    proteins: ["Chicken", "Turkey Mince", "Beef Mince", "Salmon", "Eggs"],
    carbs: ["Potatoes", "Rice"],
    tiers: TIERS,
    skus: SKUS,
    shoppingLists: SHOPPING,
    laws: LAWS,
    citations: CITATIONS,
    protect: PROTECT,
    fruitFirst: FRUIT_FIRST,
    foodSecond: FOOD_SECOND,
    tierFor: tierFor,
    shoppingListFor: shoppingListFor,
    formatGbp: formatGbp,
    ingredientCost: ingredientCost
  };
})();
