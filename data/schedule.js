/* Relic 2027 — FULL YEAR week rotations LOCKED by NiX (2026-09-25)
   Card-exact: January W1–W4 + February W1–W2 from Joseph's gothic cards.
   NiX-intelligent lock: February W3–W4 + March–December (all weeks) for Joseph's future.
   Week-of-month: days 1–7=W1, 8–14=W2, 15–21=W3, 22–end=W4
   Phase citation suffix: JAN–MAR Base | APR–JUN Hard | JUL–SEP Expert | OCT–DEC Till_Failure
   Display citation: 1. {CabinKey}_Trainer_{Phase}
*/
window.RELIC_SCHEDULE = (function () {
  const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const YEAR = 2027;
  const LIVE_START = "2027-01-01";
  const SUN = { day: "SUN", pair: "Recovery", cabins: [], doc1: "Rest / Light Mobility", doc2: "Weekly Reset" };

  function row(day, pair, a, b) {
    return { day: day, pair: pair, cabins: [a, b] };
  }
  function week(mon, tue, wed, thu, fri, sat) {
    return [mon, tue, wed, thu, fri, sat, Object.assign({}, SUN)];
  }
  function cloneWeek(w) {
    return w.map(function (r) {
      return {
        day: r.day,
        pair: r.pair,
        cabins: (r.cabins || []).slice(),
        doc1: r.doc1,
        doc2: r.doc2
      };
    });
  }
  function cloneMonth(src) {
    return { 1: cloneWeek(src[1]), 2: cloneWeek(src[2]), 3: cloneWeek(src[3]), 4: cloneWeek(src[4]) };
  }

  /* ═══════ JANUARY — Joseph cards (LOCKED) ═══════ */
  const JAN = {
    1: week(
      row("MON", "Back + Arms", "Back", "Upper_Arms"),
      row("TUE", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("WED", "Core + Skill", "Abs_Pelvic", "Calisthenics"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Reset + Alignment", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Chest + Arms", "Chest", "Upper_Arms"),
      row("TUE", "Back + Legs", "Back", "Legs_Glutes"),
      row("WED", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("THU", "Posture + Neck", "Posture_Mobility", "Neck"),
      row("FRI", "Bands + Skill", "Resistance_Bands", "Calisthenics"),
      row("SAT", "Weights + Hang", "Target_Weights", "Hanging")
    ),
    3: week(
      row("MON", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Core + Hang", "Abs_Pelvic", "Hanging"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("TUE", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("WED", "Back + Hang", "Back", "Hanging"),
      row("THU", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ FEBRUARY — W1–W2 Joseph cards; W3–W4 NiX lock ═══════ */
  const FEB = {
    1: week(
      row("MON", "Back + Core", "Back", "Abs_Pelvic"),
      row("TUE", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("WED", "Legs + Neck", "Legs_Glutes", "Neck"),
      row("THU", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("FRI", "Weights + Hang", "Target_Weights", "Hanging"),
      row("SAT", "Posture + Bands", "Posture_Mobility", "Resistance_Bands")
    ),
    2: week(
      row("MON", "Chest + Arms", "Chest", "Upper_Arms"),
      row("TUE", "Back + Legs", "Back", "Legs_Glutes"),
      row("WED", "Core + Skill", "Abs_Pelvic", "Calisthenics"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Neck", "Target_Weights", "Neck"),
      row("SAT", "Posture + Hang", "Posture_Mobility", "Hanging")
    ),
    3: week(
      row("MON", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Core + Hang", "Abs_Pelvic", "Hanging"),
      row("THU", "Bands + Skill", "Resistance_Bands", "Calisthenics"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Arms + Grip", "Upper_Arms", "Hand_Wrist_Forearm"),
      row("TUE", "Back + Skill", "Back", "Calisthenics"),
      row("WED", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("THU", "Chest + Bands", "Chest", "Resistance_Bands"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ MARCH — Base Consolidation (NiX) ═══════ */
  const MAR = {
    1: week(
      row("MON", "Chest + Back", "Chest", "Back"),
      row("TUE", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("WED", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Legs", "Back", "Legs_Glutes"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Core + Skill", "Abs_Pelvic", "Calisthenics"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Hang", "Target_Weights", "Hanging"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Arms + Hang", "Upper_Arms", "Hanging"),
      row("TUE", "Legs + Core", "Legs_Glutes", "Abs_Pelvic"),
      row("WED", "Chest + Skill", "Chest", "Calisthenics"),
      row("THU", "Back + Bands", "Back", "Resistance_Bands"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("TUE", "Back + Core", "Back", "Abs_Pelvic"),
      row("WED", "Legs + Skill", "Legs_Glutes", "Calisthenics"),
      row("THU", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("FRI", "Weights + Neck", "Target_Weights", "Neck"),
      row("SAT", "Posture + Hang", "Posture_Mobility", "Hanging")
    )
  };

  /* ═══════ APRIL — Hard Opening (NiX) — Weights/Bands bias ═══════ */
  const APR = {
    1: week(
      row("MON", "Chest + Weights", "Chest", "Target_Weights"),
      row("TUE", "Back + Bands", "Back", "Resistance_Bands"),
      row("WED", "Legs + Core", "Legs_Glutes", "Abs_Pelvic"),
      row("THU", "Arms + Grip", "Upper_Arms", "Hand_Wrist_Forearm"),
      row("FRI", "Skill + Hang", "Calisthenics", "Hanging"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Weights", "Back", "Target_Weights"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("THU", "Core + Skill", "Abs_Pelvic", "Calisthenics"),
      row("FRI", "Hang + Grip", "Hanging", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Chest + Bands", "Chest", "Resistance_Bands"),
      row("TUE", "Back + Grip", "Back", "Hand_Wrist_Forearm"),
      row("WED", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("THU", "Arms + Core", "Upper_Arms", "Abs_Pelvic"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ MAY — Hard Build (NiX) ═══════ */
  const MAY = {
    1: week(
      row("MON", "Back + Arms", "Back", "Upper_Arms"),
      row("TUE", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("WED", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("THU", "Bands + Skill", "Resistance_Bands", "Calisthenics"),
      row("FRI", "Hang + Grip", "Hanging", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Chest + Weights", "Chest", "Target_Weights"),
      row("TUE", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("WED", "Back + Hang", "Back", "Hanging"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Core + Skill", "Abs_Pelvic", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("THU", "Skill + Hang", "Calisthenics", "Hanging"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("TUE", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("WED", "Back + Core", "Back", "Abs_Pelvic"),
      row("THU", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("FRI", "Weights + Hang", "Target_Weights", "Hanging"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ JUNE — Hard Peak (NiX) ═══════ */
  const JUN = {
    1: week(
      row("MON", "Chest + Back", "Chest", "Back"),
      row("TUE", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("WED", "Arms + Hang", "Upper_Arms", "Hanging"),
      row("THU", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("FRI", "Skill + Grip", "Calisthenics", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Weights", "Back", "Target_Weights"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Legs + Skill", "Legs_Glutes", "Calisthenics"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Chest + Weights", "Chest", "Target_Weights"),
      row("TUE", "Back + Legs", "Back", "Legs_Glutes"),
      row("WED", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("THU", "Core + Hang", "Abs_Pelvic", "Hanging"),
      row("FRI", "Skill + Grip", "Calisthenics", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("TUE", "Chest + Hang", "Chest", "Hanging"),
      row("WED", "Back + Grip", "Back", "Hand_Wrist_Forearm"),
      row("THU", "Bands + Skill", "Resistance_Bands", "Calisthenics"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ JULY — Expert Opening (NiX) — Skill/Hang bias ═══════ */
  const JUL = {
    1: week(
      row("MON", "Skill + Chest", "Calisthenics", "Chest"),
      row("TUE", "Hang + Back", "Hanging", "Back"),
      row("WED", "Legs + Core", "Legs_Glutes", "Abs_Pelvic"),
      row("THU", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Skill", "Back", "Calisthenics"),
      row("TUE", "Chest + Hang", "Chest", "Hanging"),
      row("WED", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("THU", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("TUE", "Back + Core", "Back", "Abs_Pelvic"),
      row("WED", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("THU", "Arms + Hang", "Upper_Arms", "Hanging"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ AUGUST — Expert Build (NiX) ═══════ */
  const AUG = {
    1: week(
      row("MON", "Chest + Arms", "Chest", "Upper_Arms"),
      row("TUE", "Back + Legs", "Back", "Legs_Glutes"),
      row("WED", "Skill + Hang", "Calisthenics", "Hanging"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Legs + Skill", "Legs_Glutes", "Calisthenics"),
      row("TUE", "Chest + Back", "Chest", "Back"),
      row("WED", "Arms + Hang", "Upper_Arms", "Hanging"),
      row("THU", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Back + Hang", "Back", "Hanging"),
      row("TUE", "Chest + Skill", "Chest", "Calisthenics"),
      row("WED", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Arms + Core", "Upper_Arms", "Abs_Pelvic"),
      row("TUE", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("WED", "Back + Bands", "Back", "Resistance_Bands"),
      row("THU", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ SEPTEMBER — Expert Peak (NiX) ═══════ */
  const SEP = {
    1: week(
      row("MON", "Skill + Back", "Calisthenics", "Back"),
      row("TUE", "Hang + Chest", "Hanging", "Chest"),
      row("WED", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("THU", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("TUE", "Back + Arms", "Back", "Upper_Arms"),
      row("WED", "Skill + Hang", "Calisthenics", "Hanging"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Core", "Target_Weights", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("TUE", "Chest + Hang", "Chest", "Hanging"),
      row("WED", "Back + Legs", "Back", "Legs_Glutes"),
      row("THU", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("FRI", "Weights + Grip", "Target_Weights", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("TUE", "Back + Grip", "Back", "Hand_Wrist_Forearm"),
      row("WED", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("THU", "Arms + Hang", "Upper_Arms", "Hanging"),
      row("FRI", "Weights + Skill", "Target_Weights", "Calisthenics"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ OCTOBER — Peak / Till Failure Opening (NiX) ═══════ */
  const OCT = {
    1: week(
      row("MON", "Chest + Weights", "Chest", "Target_Weights"),
      row("TUE", "Back + Hang", "Back", "Hanging"),
      row("WED", "Legs + Skill", "Legs_Glutes", "Calisthenics"),
      row("THU", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Weights", "Back", "Target_Weights"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("THU", "Skill + Bands", "Calisthenics", "Resistance_Bands"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Arms + Weights", "Upper_Arms", "Target_Weights"),
      row("TUE", "Chest + Skill", "Chest", "Calisthenics"),
      row("WED", "Back + Legs", "Back", "Legs_Glutes"),
      row("THU", "Hang + Grip", "Hanging", "Hand_Wrist_Forearm"),
      row("FRI", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Skill + Grip", "Calisthenics", "Hand_Wrist_Forearm"),
      row("TUE", "Chest + Bands", "Chest", "Resistance_Bands"),
      row("WED", "Back + Hang", "Back", "Hanging"),
      row("THU", "Legs + Core", "Legs_Glutes", "Abs_Pelvic"),
      row("FRI", "Weights + Arms", "Target_Weights", "Upper_Arms"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ NOVEMBER — Peak Build (NiX) ═══════ */
  const NOV = {
    1: week(
      row("MON", "Back + Arms", "Back", "Upper_Arms"),
      row("TUE", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("WED", "Weights + Hang", "Target_Weights", "Hanging"),
      row("THU", "Skill + Bands", "Calisthenics", "Resistance_Bands"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Chest + Weights", "Chest", "Target_Weights"),
      row("TUE", "Back + Skill", "Back", "Calisthenics"),
      row("WED", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("TUE", "Chest + Hang", "Chest", "Hanging"),
      row("WED", "Back + Bands", "Back", "Resistance_Bands"),
      row("THU", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Arms + Grip", "Upper_Arms", "Hand_Wrist_Forearm"),
      row("TUE", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("WED", "Back + Legs", "Back", "Legs_Glutes"),
      row("THU", "Bands + Skill", "Resistance_Bands", "Calisthenics"),
      row("FRI", "Weights + Hang", "Target_Weights", "Hanging"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* ═══════ DECEMBER — Peak Seal (NiX) ═══════ */
  const DEC = {
    1: week(
      row("MON", "Chest + Back", "Chest", "Back"),
      row("TUE", "Legs + Weights", "Legs_Glutes", "Target_Weights"),
      row("WED", "Arms + Skill", "Upper_Arms", "Calisthenics"),
      row("THU", "Bands + Hang", "Resistance_Bands", "Hanging"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Weights", "Back", "Target_Weights"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Legs + Hang", "Legs_Glutes", "Hanging"),
      row("THU", "Skill + Grip", "Calisthenics", "Hand_Wrist_Forearm"),
      row("FRI", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("TUE", "Chest + Skill", "Chest", "Calisthenics"),
      row("WED", "Back + Hang", "Back", "Hanging"),
      row("THU", "Weights + Bands", "Target_Weights", "Resistance_Bands"),
      row("FRI", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Hang + Core", "Hanging", "Abs_Pelvic"),
      row("TUE", "Chest + Arms", "Chest", "Upper_Arms"),
      row("WED", "Back + Skill", "Back", "Calisthenics"),
      row("THU", "Legs + Grip", "Legs_Glutes", "Hand_Wrist_Forearm"),
      row("FRI", "Weights + Bands", "Target_Weights", "Resistance_Bands"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  const MONTH_ROTATIONS = {
    1: JAN, 2: FEB, 3: MAR, 4: APR, 5: MAY, 6: JUN,
    7: JUL, 8: AUG, 9: SEP, 10: OCT, 11: NOV, 12: DEC
  };

  const MONTH_CARD_STATUS = {
    1: "locked-card",
    2: "locked-card+nix", /* W1–W2 card, W3–W4 NiX */
    3: "locked-nix",
    4: "locked-nix",
    5: "locked-nix",
    6: "locked-nix",
    7: "locked-nix",
    8: "locked-nix",
    9: "locked-nix",
    10: "locked-nix",
    11: "locked-nix",
    12: "locked-nix"
  };

  const MONTH_META = {
    1: { phaseLine: "PHASE: BASE • BEGINNER", blurb: "Month 1 of 12 • Base Foundation Month" },
    2: { phaseLine: "PHASE: BASE • BEGINNER MODERATE", blurb: "Month 2 of 12 • Base Consistency Month" },
    3: { phaseLine: "PHASE: BASE • BEGINNER STRONG", blurb: "Month 3 of 12 • Base Consolidation Month" },
    4: { phaseLine: "PHASE: HARD • HYPERTROPHY", blurb: "Month 4 of 12 • Hard Opening Month" },
    5: { phaseLine: "PHASE: HARD • HYPERTROPHY BUILD", blurb: "Month 5 of 12 • Hard Build Month" },
    6: { phaseLine: "PHASE: HARD • HYPERTROPHY PEAK", blurb: "Month 6 of 12 • Hard Peak Month" },
    7: { phaseLine: "PHASE: EXPERT • SKILL", blurb: "Month 7 of 12 • Expert Opening Month" },
    8: { phaseLine: "PHASE: EXPERT • SKILL BUILD", blurb: "Month 8 of 12 • Expert Build Month" },
    9: { phaseLine: "PHASE: EXPERT • SKILL PEAK", blurb: "Month 9 of 12 • Expert Peak Month" },
    10: { phaseLine: "PHASE: TILL FAILURE • PEAK", blurb: "Month 10 of 12 • Peak Opening Month" },
    11: { phaseLine: "PHASE: TILL FAILURE • PEAK BUILD", blurb: "Month 11 of 12 • Peak Build Month" },
    12: { phaseLine: "PHASE: TILL FAILURE • PEAK SEAL", blurb: "Month 12 of 12 • Peak Seal Month" }
  };

  const PHASES = [
    { id: "Base", label: "BASE", months: [1, 2, 3], range: "JAN–MAR", suffix: "Base" },
    { id: "Hard", label: "HARD", months: [4, 5, 6], range: "APR–JUN", suffix: "Hard" },
    { id: "Expert", label: "EXPERT", months: [7, 8, 9], range: "JUL–SEP", suffix: "Expert" },
    { id: "Till_Failure", label: "TILL FAILURE", months: [10, 11, 12], range: "OCT–DEC", suffix: "Till_Failure" }
  ];

  const MONTH_NAMES = [
    "", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];
  const MONTH_SHORT = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDate(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }
  function weekOfMonth(dayOfMonth) {
    if (dayOfMonth <= 7) return 1;
    if (dayOfMonth <= 14) return 2;
    if (dayOfMonth <= 21) return 3;
    return 4;
  }
  function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
  function mondayIndex(jsDay) { return jsDay === 0 ? 6 : jsDay - 1; }
  function phaseForMonth(month) {
    return PHASES.find(function (p) { return p.months.indexOf(month) !== -1; }) || PHASES[0];
  }
  function phaseSuffix(month) { return phaseForMonth(month).suffix; }
  function rotationFor(month, wom) {
    var m = MONTH_ROTATIONS[month] || MONTH_ROTATIONS[1];
    return m[wom] || m[1];
  }
  function citationLabel(cabinKey, phase) {
    return "1. " + cabinKey + "_Trainer_" + phase;
  }

  function buildMonthDays(year, month) {
    var dim = daysInMonth(year, month);
    var out = [];
    var phase = phaseForMonth(month);
    var meta = MONTH_META[month];
    for (var d = 1; d <= dim; d++) {
      var date = new Date(year, month - 1, d);
      var wom = weekOfMonth(d);
      var di = mondayIndex(date.getDay());
      var slot = rotationFor(month, wom)[di];
      var doc1, doc2;
      if (!slot.cabins || slot.cabins.length === 0) {
        doc1 = slot.doc1 || "Rest / Light Mobility";
        doc2 = slot.doc2 || "Weekly Reset";
      } else {
        doc1 = citationLabel(slot.cabins[0], phase.suffix);
        doc2 = citationLabel(slot.cabins[1], phase.suffix);
      }
      out.push({
        dateKey: isoDate(year, month, d),
        year: year,
        month: month,
        day: d,
        weekOfMonth: wom,
        dayIndex: di,
        dayName: DAYS[di],
        pair: slot.pair,
        cabins: (slot.cabins || []).slice(),
        doc1: doc1,
        doc2: doc2,
        isRecovery: !slot.cabins || slot.cabins.length === 0,
        isDeloadWeek: wom === 4,
        phase: phase.suffix,
        phaseLabel: phase.label,
        phaseLine: meta.phaseLine,
        blurb: meta.blurb,
        cardStatus: MONTH_CARD_STATUS[month]
      });
    }
    return out;
  }

  function buildYear(year) {
    var months = {};
    for (var m = 1; m <= 12; m++) months[m] = buildMonthDays(year, m);
    return months;
  }

  function daysInWeekOfMonth(year, month, wom) {
    return buildMonthDays(year, month).filter(function (d) { return d.weekOfMonth === wom; });
  }

  return {
    DAYS: DAYS,
    MONTH_ROTATIONS: MONTH_ROTATIONS,
    MONTH_CARD_STATUS: MONTH_CARD_STATUS,
    MONTH_META: MONTH_META,
    WEEK_ROTATION: JAN,
    PHASES: PHASES,
    MONTH_NAMES: MONTH_NAMES,
    MONTH_SHORT: MONTH_SHORT,
    YEAR: YEAR,
    LIVE_START: LIVE_START,
    pad2: pad2,
    isoDate: isoDate,
    weekOfMonth: weekOfMonth,
    daysInMonth: daysInMonth,
    mondayIndex: mondayIndex,
    phaseForMonth: phaseForMonth,
    phaseSuffix: phaseSuffix,
    citationLabel: citationLabel,
    rotationFor: rotationFor,
    buildMonthDays: buildMonthDays,
    buildYear: buildYear,
    daysInWeekOfMonth: daysInWeekOfMonth
  };
})();
