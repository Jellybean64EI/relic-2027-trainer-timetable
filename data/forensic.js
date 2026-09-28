/* Q4 bridge forensic cues — window.RELIC_FORENSIC.
   Dose and safety live here. The CUE panel only reads read(branch, cabinKey).
   Shared Q4 rules: left-lead lowerings, nasal breathing, stop-at-shake,
   no hanging, no failure, no added load.
   Hanging and Target_Weights are refused on the bridge. */
window.RELIC_FORENSIC = (function () {
  var SAFETY = [
    { id: "left-lead-lowerings", label: "Left-lead lowerings" },
    { id: "nasal-breathing", label: "Nasal breathing" },
    { id: "stop-at-shake", label: "Stop at shake" },
    { id: "no-hanging", label: "No hanging" },
    { id: "no-failure", label: "No failure" },
    { id: "no-added-load", label: "No added load" }
  ];

  function dose(sets, reps, holdSec, restSec) {
    return {
      allowed: true,
      sets: sets,
      reps: reps,
      holdSec: holdSec,
      restSec: restSec,
      note: ""
    };
  }

  function blocked(ruleId, note) {
    return {
      allowed: false,
      sets: 0,
      reps: 0,
      holdSec: 0,
      restSec: 0,
      ruleId: ruleId,
      note: note
    };
  }

  /* Q4 2026 Pre-Recondition doses. Keys match citation cabin keys. */
  var Q4_CABINS = {
    Back: dose(3, 8, 2, 90),
    Chest: dose(3, 8, 2, 90),
    Legs_Glutes: dose(3, 8, 2, 90),
    Upper_Arms: dose(3, 8, 2, 75),
    Abs_Pelvic: dose(3, 8, 2, 60),
    Calisthenics: dose(2, 6, 2, 90),
    Resistance_Bands: dose(3, 10, 2, 60),
    Hand_Wrist_Forearm: dose(2, 10, 2, 45),
    Posture_Mobility: dose(2, 6, 3, 45),
    Neck: dose(2, 6, 2, 45),
    Face: dose(2, 6, 2, 45),
    Eyes: dose(2, 6, 2, 45),
    Tongue: dose(2, 6, 2, 45),
    Jaw: dose(2, 6, 2, 45),
    Hanging: blocked("no-hanging", "No hanging on the Q4 bridge."),
    Target_Weights: blocked("no-added-load", "No added load on the Q4 bridge.")
  };

  var BRANCHES = {
    bridge: {
      id: "q4",
      label: "Q4 2026 Pre-Recondition",
      safety: SAFETY,
      cabins: Q4_CABINS
    },
    year: {
      id: "year",
      label: "2027 Year",
      safety: [],
      cabins: {}
    }
  };

  function read(branch, cabinKey) {
    var key = branch === "bridge" ? "bridge" : "year";
    var pack = BRANCHES[key];
    var cabin = cabinKey && pack.cabins[cabinKey] ? pack.cabins[cabinKey] : null;
    if (key !== "bridge" || !cabin) {
      return {
        branch: key,
        cabinKey: cabinKey || "",
        allowed: key === "bridge" ? false : null,
        sets: null,
        reps: null,
        holdSec: null,
        restSec: null,
        note: key === "bridge" ? "" : "",
        safety: pack.safety
      };
    }
    return {
      branch: "bridge",
      cabinKey: cabinKey,
      allowed: cabin.allowed !== false,
      sets: cabin.sets,
      reps: cabin.reps,
      holdSec: cabin.holdSec,
      restSec: cabin.restSec,
      note: cabin.note || "",
      ruleId: cabin.ruleId || "",
      safety: pack.safety
    };
  }

  return {
    safetyRules: SAFETY,
    branches: BRANCHES,
    read: read
  };
})();
