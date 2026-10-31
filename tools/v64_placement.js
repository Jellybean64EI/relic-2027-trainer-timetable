/* Nexus v64 placement rules. Browser-safe. place() matches map_v64.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.V64Place = api;
})(typeof window !== "undefined" ? window : null, function () {
  var CABINS = [
    ["face", "Face"], ["eyes", "Eyes"], ["tongue", "Tongue"], ["jaw", "Jaw"], ["neck", "Neck"],
    ["shoulders", "Shoulders"], ["upper-arms", "Upper Arms"], ["forearms", "Forearms, Wrists & Hands"],
    ["chest", "Chest"], ["upper-back", "Upper Back"], ["lower-back", "Lower Back"], ["abs", "Abs"],
    ["obliques", "Obliques"], ["pelvic", "Pelvic"], ["kegel", "Kegel"], ["hip-flexors", "Hip Flexors"],
    ["glutes", "Glutes"], ["quads", "Quads"], ["hamstrings", "Hamstrings"], ["calves", "Calves"], ["feet", "Feet"]
  ];
  var SPECIALS = [
    ["sp-posture-mobility", "Posture & Mobility", "posture-mobility"],
    ["sp-calisthenics", "Calisthenics", "calisthenics"],
    ["sp-resistance-bands", "Resistance Bands", "resistance-bands"],
    ["sp-hanging", "Hanging", "hanging"],
    ["sp-target-weights", "Target Weights", "target-weights"]
  ];
  var SPECIAL_FOLDER = { Posture_Mobility: 0, Calisthenics: 1, Resistance_Bands: 2, Hanging: 3, Target_Weights: 4 };
  var SINGLE = { Face: "face", Eyes: "eyes", Tongue: "tongue", Jaw: "jaw", Neck: "neck", Chest: "chest" };
  var TARGET_KW = [
    ["shoulders", /shoulder|delt|lateral raise|rotator|external rotation|scap|shrug|\btrap|upright row|overhead press|pike/],
    ["feet", /\bfoot|feet|\btoe|ankle|\barch(es)?\b|plantar/],
    ["calves", /calf|calves|tibialis|shin/],
    ["hip-flexors", /hip flexor|psoas|sitting all day|sit a lot|knee lift/],
    ["upper-back", /thoracic|\blat\b|lats|rhomboid|upper[- ]back/],
    ["lower-back", /lower[- ]back|lumbar/],
    ["forearms", /wrist|forearm|grip|hand\b/],
    ["glutes", /glute|hip thrust|clamshell|abduction/],
    ["chest", /chest|\bpec/],
    ["neck", /\bneck\b|levator/]
  ];
  var RULES = {
    Back: [
      ["shoulders", /shoulder|delt|external rotation|rotator/],
      ["lower-back", /lower[- ]back|lumbar|spine circle|windshield|superman|forward fold|spinal twist|scorpion|cobra|sphinx|cat[- ]cow|reverse hyper/],
      ["obliques", /side bend/],
      ["upper-back", /\blat\b|lat pulldown|\brow\b|pull[- ]?up|pull-apart|pull apart|scap|thoracic|puppy|t raise|y[- ]raise|w[- ]raise|face pull|serratus|rhomboid|swatter|upper[- ]back|band side bend/]
    ],
    Upper_Arms: [
      ["neck", /trap stretch neck/],
      ["chest", /chest stretch|chest opener/],
      ["shoulders", /delt|lateral raise|shrug|\btrap|shoulder|dead hang/],
      ["upper-arms", /bicep|tricep|curl|skull|dip|pulldown|pushdown/],
      ["upper-arms", /./, "folder-default"]
    ],
    Hand_Wrist_Forearm: [
      ["shoulders", /scapular|external rotation|shoulder|rotator/],
      ["hip-flexors", /hip flexor/],
      ["upper-arms", /bicep|tricep/],
      ["forearms", /wrist|forearm|grip|hand|towel|reverse curl|pronation|supination/],
      ["forearms", /./, "folder-default"]
    ],
    Legs_Glutes: [
      ["feet", /\bfoot|feet|\btoe|ankle|\barch(es)?\b|plantar/],
      ["calves", /calf|calves|tibialis|shin/],
      ["pelvic", /pelvic|butterfly|si joint/],
      ["lower-back", /lumbar|lower[- ]back|reverse hyper/],
      ["hip-flexors", /hip flexor|psoas|sitting all day|sit a lot/],
      ["hamstrings", /hamstring|romanian|\brdl\b|deadlift|leg curl|nordic/],
      ["glutes", /glute|hip thrust|bridge|clam|abduct|figure four|piriformis|bulletproof your hips|inner thigh/],
      ["quads", /squat|quad|knee|lunge|step ups?\b|wall sit|leg extension/]
    ],
    Abs_Pelvic: [
      ["kegel", /kegel|pelvic floor/],
      ["pelvic", /pelvic/],
      ["hip-flexors", /hip flexor|psoas|\btfl\b|knee lift/],
      ["lower-back", /back tension|lower[- ]back|bed hang|knee to chest/],
      ["obliques", /oblique|side bow|side[- ]lying|cross body|rib flare|v line|twist|windshield/],
      ["abs", /crunch|plank|dead bug|hollow|dish|leg raise|knee tuck|mountain climber|\babs\b|cocoon|in and outs|scissor|squat thrust/]
    ]
  };
  var LEGACY_AREA = {
    back: "Back", chest: "Chest", arms: "Upper_Arms", legs: "Legs_Glutes", core: "Abs_Pelvic",
    neck: "Neck", posture: "Posture_Mobility", face: "Face", equipment: null
  };
  var EQUIP_RULES = [
    [3, /hang|pull[- ]?up|bar\b/], [2, /band/], [4, /dumbbell|kettlebell|weight|carry/], [1, /push[- ]?up|calisthenic|dip|plank/]
  ];
  var LEGACY_OF = {
    shoulders: "arms", "upper-arms": "arms", forearms: "arms",
    "upper-back": "back", "lower-back": "back",
    abs: "core", obliques: "core", pelvic: "core", kegel: "core", "hip-flexors": "core",
    glutes: "legs", quads: "legs", hamstrings: "legs", calves: "legs", feet: "legs",
    face: "face", eyes: "face", tongue: "face", jaw: "face",
    neck: "neck", chest: "chest",
    "sp-posture-mobility": "posture"
  };

  function place(folder, title) {
    var t = title.toLowerCase();
    if (folder in SPECIAL_FOLDER) {
      var s = SPECIALS[SPECIAL_FOLDER[folder]];
      return { cabin: s[0], special: true, special_type: s[2], confidence: "high", rule: "origin-folder:" + folder };
    }
    if (SINGLE[folder]) return { cabin: SINGLE[folder], special: false, special_type: null, confidence: "high", rule: "origin-folder:" + folder };
    var rules = RULES[folder] || [];
    for (var i = 0; i < rules.length; i++) {
      var cabin = rules[i][0];
      var re = rules[i][1];
      var how = rules[i][2];
      if (re.test(t)) {
        return {
          cabin: cabin,
          special: false,
          special_type: null,
          confidence: how === "folder-default" ? "medium" : "high",
          rule: (how || "keyword") + ":" + folder + ":" + re.source
        };
      }
    }
    return null;
  }

  function alsoTargets(title, primary) {
    var t = String(title || "").toLowerCase();
    return TARGET_KW.filter(function (row) { return row[0] !== primary && row[1].test(t); }).map(function (row) { return row[0]; });
  }

  function placeCustom(area, title) {
    var t = String(title || "").toLowerCase();
    if (/pelvic tilt|anterior pelvic|posterior pelvic/.test(t)) {
      return { cabin: "pelvic", special: false, special_type: null, confidence: "high", rule: "custom-keyword:pelvic" };
    }
    if (area === "equipment") {
      var hit = null;
      EQUIP_RULES.forEach(function (row) { if (!hit && row[1].test(t)) hit = row; });
      if (hit) {
        var spec = SPECIALS[hit[0]];
        return { cabin: spec[0], special: true, special_type: spec[2], confidence: "high", rule: "custom-equipment-keyword:" + hit[1].source };
      }
    } else if (LEGACY_AREA[area]) {
      return place(LEGACY_AREA[area], title);
    }
    return null;
  }

  function legacyGroupFor(id) {
    if (LEGACY_OF[id]) return LEGACY_OF[id];
    if (String(id || "").indexOf("sp-") === 0) return "equipment";
    if (LEGACY_AREA[id]) return id;
    return id || "";
  }

  function cabinMeta(id) {
    var i;
    for (i = 0; i < CABINS.length; i++) if (CABINS[i][0] === id) return { id: id, name: CABINS[i][1], special: false, specialType: null };
    for (i = 0; i < SPECIALS.length; i++) if (SPECIALS[i][0] === id) return { id: id, name: SPECIALS[i][1], special: true, specialType: SPECIALS[i][2] };
    if (id === "check-me") return { id: id, name: "Check me", special: false, specialType: null };
    return null;
  }

  return {
    CABINS: CABINS,
    SPECIALS: SPECIALS,
    SINGLE: SINGLE,
    RULES: RULES,
    TARGET_KW: TARGET_KW,
    place: place,
    placeCustom: placeCustom,
    alsoTargets: alsoTargets,
    legacyGroupFor: legacyGroupFor,
    cabinMeta: cabinMeta
  };
});
