/* Relic 2027 — Upper Body Trainer Schedules
   Separate from RELIC_SCHEDULE.MONTH_ROTATIONS. Full Body pairs stay untouched.
   Calendar law matches Full Body: Europe/London year 2027, week buckets
   1–7 / 8–14 / 15–21 / 22–end, Sunday Rest / Light Mobility + Weekly Reset.
   Each Mon–Sat row is two citations: 1. {CabinKey}_Trainer_{Phase}.
   Phase suffix follows the quarter (Base, Hard, Expert, Till_Failure).

   Rotation: Neck is on every training day (high frequency). The other slot
   cycles Face → Tongue → Eyes → Jaw. Month start shifts by 5 so quarters
   stay balanced while neighbouring months do not repeat the same lead.
   Weekday order alternates which cabin is listed first.

   Drive folder IDs are mapping references only. Playback is Supabase
   relic-videos/{CabinKey}/{file}.mp4 via videoArchive.js — never Drive. */
window.RELIC_UPPER_BODY = (function () {
  var S = window.RELIC_SCHEDULE;
  var TARGETED = ["Face", "Tongue", "Eyes", "Jaw"];
  var DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

  var MONTH_META = {
    1: { phaseLine: "PHASE: BASE • BEGINNER", blurb: "Month 1 of 12 • Upper Body Foundation • Neck every training day" },
    2: { phaseLine: "PHASE: BASE • BEGINNER MODERATE", blurb: "Month 2 of 12 • Upper Body Consistency • Face, Tongue, Eyes, Jaw" },
    3: { phaseLine: "PHASE: BASE • BEGINNER STRONG", blurb: "Month 3 of 12 • Upper Body Consolidation • Neck anchor" },
    4: { phaseLine: "PHASE: HARD • HYPERTROPHY", blurb: "Month 4 of 12 • Upper Body Hard Opening • Neck every training day" },
    5: { phaseLine: "PHASE: HARD • HYPERTROPHY BUILD", blurb: "Month 5 of 12 • Upper Body Hard Build • Face, Tongue, Eyes, Jaw" },
    6: { phaseLine: "PHASE: HARD • HYPERTROPHY PEAK", blurb: "Month 6 of 12 • Upper Body Hard Peak • Neck anchor" },
    7: { phaseLine: "PHASE: EXPERT • SKILL", blurb: "Month 7 of 12 • Upper Body Expert Opening • Neck every training day" },
    8: { phaseLine: "PHASE: EXPERT • SKILL BUILD", blurb: "Month 8 of 12 • Upper Body Expert Build • Face, Tongue, Eyes, Jaw" },
    9: { phaseLine: "PHASE: EXPERT • SKILL PEAK", blurb: "Month 9 of 12 • Upper Body Expert Peak • Neck anchor" },
    10: { phaseLine: "PHASE: TILL FAILURE • PEAK", blurb: "Month 10 of 12 • Upper Body Peak Opening • Neck every training day" },
    11: { phaseLine: "PHASE: TILL FAILURE • PEAK BUILD", blurb: "Month 11 of 12 • Upper Body Peak Build • Face, Tongue, Eyes, Jaw" },
    12: { phaseLine: "PHASE: TILL FAILURE • PEAK SEAL", blurb: "Month 12 of 12 • Upper Body Peak Seal • Neck anchor" }
  };

  function recoveryRow() {
    return {
      day: "SUN",
      pair: "Recovery",
      cabins: [],
      doc1: "Rest / Light Mobility",
      doc2: "Weekly Reset"
    };
  }

  function partnerKey(month, week, dayIndex) {
    var index = ((month - 1) * 5) + ((week - 1) * 6) + dayIndex;
    return TARGETED[((index % 4) + 4) % 4];
  }

  function trainingRow(month, week, dayIndex) {
    var targeted = partnerKey(month, week, dayIndex);
    var neckLead = dayIndex % 2 === 1;
    var cabins = neckLead ? ["Neck", targeted] : [targeted, "Neck"];
    return {
      day: DAY_NAMES[dayIndex],
      pair: cabins[0] + " + " + cabins[1],
      cabins: cabins
    };
  }

  function weekTemplate(month, week) {
    var rows = [];
    for (var dayIndex = 0; dayIndex < 6; dayIndex++) {
      rows.push(trainingRow(month, week, dayIndex));
    }
    rows.push(recoveryRow());
    return rows;
  }

  var MONTH_ROTATIONS = {};
  for (var month = 1; month <= 12; month++) {
    MONTH_ROTATIONS[month] = {
      1: weekTemplate(month, 1),
      2: weekTemplate(month, 2),
      3: weekTemplate(month, 3),
      4: weekTemplate(month, 4)
    };
  }

  function rotationFor(month, wom) {
    var pack = MONTH_ROTATIONS[month] || MONTH_ROTATIONS[1];
    return pack[wom] || pack[1];
  }

  function buildMonthDays(year, month) {
    var dim = S.daysInMonth(year, month);
    var out = [];
    var phase = S.phaseForMonth(month);
    var meta = MONTH_META[month];
    for (var d = 1; d <= dim; d++) {
      var date = new Date(year, month - 1, d);
      var wom = S.weekOfMonth(d);
      var di = S.mondayIndex(date.getDay());
      var slot = rotationFor(month, wom)[di];
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
        dateKey: S.isoDate(year, month, d),
        year: year,
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
        isDeloadWeek: wom === 4,
        phase: phase.suffix,
        phaseLabel: phase.label,
        phaseLine: meta.phaseLine,
        blurb: meta.blurb,
        cardStatus: "upper-body",
        scheduleMode: "upper"
      });
    }
    return out;
  }

  function daysInWeekOfMonth(year, month, wom) {
    return buildMonthDays(year, month).filter(function (day) {
      return day.weekOfMonth === wom;
    });
  }

  return {
    id: "upper",
    label: "Upper Body Trainer Schedules",
    TARGETED: TARGETED,
    MONTH_ROTATIONS: MONTH_ROTATIONS,
    MONTH_META: MONTH_META,
    rotationFor: rotationFor,
    buildMonthDays: buildMonthDays,
    daysInWeekOfMonth: daysInWeekOfMonth
  };
})();
