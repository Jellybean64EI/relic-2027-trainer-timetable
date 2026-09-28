/* Q4 2026 Pre-Recondition — Full Body bridge pairings.
   window.RELIC_PRECONDITION. Does not edit RELIC_SCHEDULE.MONTH_ROTATIONS.
   Week buckets: days 1–7 = W1, 8–14 = W2, 15–21 = W3, 22–end = W4.
   Sunday is Rest / Weekly Reset in the month build and stays off the active Mon–Sat list.
   No Hanging and no Target_Weights: no hanging, no failure, no added load.
   v16: Calisthenics is purged. Those slots are posture, core, or joint alignment.
   Citation phase is Base: 1. {CabinKey}_Trainer_Base
   Requires data/schedule.js first (date helpers and citationLabel only). */
window.RELIC_PRECONDITION = (function () {
  var S = window.RELIC_SCHEDULE;
  var YEAR = 2026;
  var MONTHS = [10, 11, 12];
  var PHASE = {
    id: "Base",
    label: "PRE-RECONDITION",
    suffix: "Base",
    phaseLine: "PRE-RECONDITION • BASE"
  };
  var SUN = {
    day: "SUN",
    pair: "Recovery",
    cabins: [],
    doc1: "Rest / Light Mobility",
    doc2: "Weekly Reset"
  };

  function row(day, pair, a, b) {
    return { day: day, pair: pair, cabins: [a, b] };
  }

  function week(mon, tue, wed, thu, fri, sat) {
    return [mon, tue, wed, thu, fri, sat, {
      day: SUN.day,
      pair: SUN.pair,
      cabins: [],
      doc1: SUN.doc1,
      doc2: SUN.doc2
    }];
  }

  /* October — control opening. */
  var OCT = {
    1: week(
      row("MON", "Chest + Arms", "Chest", "Upper_Arms"),
      row("TUE", "Back + Core", "Back", "Abs_Pelvic"),
      row("WED", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("THU", "Posture + Grip", "Posture_Mobility", "Hand_Wrist_Forearm"),
      row("FRI", "Arms + Core", "Upper_Arms", "Abs_Pelvic"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Back + Chest", "Back", "Chest"),
      row("TUE", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("WED", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("THU", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("FRI", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Arms + Bands", "Upper_Arms", "Resistance_Bands"),
      row("TUE", "Chest + Alignment", "Chest", "Neck"),
      row("WED", "Back + Legs", "Back", "Legs_Glutes"),
      row("THU", "Grip + Core", "Hand_Wrist_Forearm", "Abs_Pelvic"),
      row("FRI", "Legs + Chest", "Legs_Glutes", "Chest"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Posture + Arms", "Posture_Mobility", "Upper_Arms"),
      row("TUE", "Back + Bands", "Back", "Resistance_Bands"),
      row("WED", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("THU", "Legs + Grip", "Legs_Glutes", "Hand_Wrist_Forearm"),
      row("FRI", "Bands + Back", "Resistance_Bands", "Back"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* November — control build. */
  var NOV = {
    1: week(
      row("MON", "Back + Arms", "Back", "Upper_Arms"),
      row("TUE", "Chest + Bands", "Chest", "Resistance_Bands"),
      row("WED", "Legs + Core", "Legs_Glutes", "Abs_Pelvic"),
      row("THU", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("FRI", "Chest + Back", "Chest", "Back"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Legs + Alignment", "Legs_Glutes", "Neck"),
      row("TUE", "Arms + Chest", "Upper_Arms", "Chest"),
      row("WED", "Back + Grip", "Back", "Hand_Wrist_Forearm"),
      row("THU", "Bands + Core", "Resistance_Bands", "Abs_Pelvic"),
      row("FRI", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Core + Posture", "Abs_Pelvic", "Posture_Mobility"),
      row("TUE", "Back + Chest", "Back", "Chest"),
      row("WED", "Arms + Legs", "Upper_Arms", "Legs_Glutes"),
      row("THU", "Bands + Grip", "Resistance_Bands", "Hand_Wrist_Forearm"),
      row("FRI", "Chest + Arms", "Chest", "Upper_Arms"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Grip + Arms", "Hand_Wrist_Forearm", "Upper_Arms"),
      row("TUE", "Legs + Back", "Legs_Glutes", "Back"),
      row("WED", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("THU", "Core + Bands", "Abs_Pelvic", "Resistance_Bands"),
      row("FRI", "Back + Legs", "Back", "Legs_Glutes"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  /* December — control seal. */
  var DEC = {
    1: week(
      row("MON", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("TUE", "Back + Bands", "Back", "Resistance_Bands"),
      row("WED", "Legs + Arms", "Legs_Glutes", "Upper_Arms"),
      row("THU", "Alignment + Grip", "Neck", "Hand_Wrist_Forearm"),
      row("FRI", "Chest + Back", "Chest", "Back"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    2: week(
      row("MON", "Arms + Core", "Upper_Arms", "Abs_Pelvic"),
      row("TUE", "Legs + Bands", "Legs_Glutes", "Resistance_Bands"),
      row("WED", "Back + Posture", "Back", "Posture_Mobility"),
      row("THU", "Chest + Grip", "Chest", "Hand_Wrist_Forearm"),
      row("FRI", "Core + Legs", "Abs_Pelvic", "Legs_Glutes"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    3: week(
      row("MON", "Bands + Arms", "Resistance_Bands", "Upper_Arms"),
      row("TUE", "Chest + Legs", "Chest", "Legs_Glutes"),
      row("WED", "Back + Core", "Back", "Abs_Pelvic"),
      row("THU", "Core + Grip", "Abs_Pelvic", "Hand_Wrist_Forearm"),
      row("FRI", "Chest + Bands", "Chest", "Resistance_Bands"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    ),
    4: week(
      row("MON", "Grip + Core", "Hand_Wrist_Forearm", "Abs_Pelvic"),
      row("TUE", "Back + Arms", "Back", "Upper_Arms"),
      row("WED", "Legs + Alignment", "Legs_Glutes", "Neck"),
      row("THU", "Chest + Core", "Chest", "Abs_Pelvic"),
      row("FRI", "Bands + Back", "Resistance_Bands", "Back"),
      row("SAT", "Posture + Neck", "Posture_Mobility", "Neck")
    )
  };

  var MONTH_PAIRINGS = { 10: OCT, 11: NOV, 12: DEC };

  var MONTH_META = {
    10: { phaseLine: PHASE.phaseLine, blurb: "Bridge month 1 of 3 • Control opening" },
    11: { phaseLine: PHASE.phaseLine, blurb: "Bridge month 2 of 3 • Control build" },
    12: { phaseLine: PHASE.phaseLine, blurb: "Bridge month 3 of 3 • Control seal" }
  };

  function phaseForMonth(month) {
    if (MONTHS.indexOf(month) === -1) return PHASE;
    return PHASE;
  }

  function pairingFor(month, weekOfMonth) {
    var pack = MONTH_PAIRINGS[month];
    if (!pack) return null;
    return pack[weekOfMonth] || pack[1];
  }

  function activeDays(days) {
    return (days || []).filter(function (day) {
      return day && !day.isRecovery && day.dayIndex < 6;
    });
  }

  function buildMonthDays(year, month) {
    if (!S || MONTHS.indexOf(month) === -1) return [];
    var y = year || YEAR;
    var dim = S.daysInMonth(y, month);
    var out = [];
    var phase = phaseForMonth(month);
    var meta = MONTH_META[month] || { phaseLine: PHASE.phaseLine, blurb: "" };
    for (var d = 1; d <= dim; d++) {
      var date = new Date(y, month - 1, d);
      var wom = S.weekOfMonth(d);
      var di = S.mondayIndex(date.getDay());
      var slots = pairingFor(month, wom);
      var slot = slots[di];
      var doc1;
      var doc2;
      if (!slot.cabins || slot.cabins.length === 0) {
        doc1 = slot.doc1 || "Rest / Light Mobility";
        doc2 = slot.doc2 || "Weekly Reset";
      } else {
        doc1 = S.citationLabel(slot.cabins[0], phase.suffix);
        doc2 = S.citationLabel(slot.cabins[1], phase.suffix);
      }
      out.push({
        dateKey: S.isoDate(y, month, d),
        year: y,
        month: month,
        day: d,
        weekOfMonth: wom,
        dayIndex: di,
        dayName: S.DAYS[di],
        pair: slot.pair,
        cabins: (slot.cabins || []).slice(),
        doc1: doc1,
        doc2: doc2,
        isRecovery: !slot.cabins || slot.cabins.length === 0,
        isDeloadWeek: false,
        phase: phase.suffix,
        phaseLabel: phase.label,
        phaseLine: meta.phaseLine,
        blurb: meta.blurb,
        cardStatus: "precondition",
        scheduleMode: "bridge"
      });
    }
    return out;
  }

  return {
    id: "bridge",
    label: "Q4 2026 Pre-Recondition",
    YEAR: YEAR,
    MONTHS: MONTHS,
    PHASE: PHASE,
    MONTH_PAIRINGS: MONTH_PAIRINGS,
    MONTH_META: MONTH_META,
    phaseForMonth: phaseForMonth,
    pairingFor: pairingFor,
    buildMonthDays: buildMonthDays,
    activeDays: function (year, month) {
      return activeDays(buildMonthDays(year || YEAR, month));
    }
  };
})();
