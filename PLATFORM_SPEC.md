# Relic 2027 Trainer Timetable Card — PLATFORM SPEC

**Owner:** Joseph Searle  
**Coach archive:** NiX  
**Timezone law:** Europe/London (always)  
**Platform root:** `/workspace/relic-2027-trainer/platform/`  
**Open:** open `index.html` in any modern browser (file:// or static host). Offline-capable.

---

## 1. Purpose

Single-page gothic Relic card that is the **executable year calendar** for Joseph's 2027 body-trainer library. Primary action is ticking **COMPLETE**. The UI follows real calendar time in Europe/London, glows gold on today / current month / active phase, and persists forensic ticks across all 365 days.

Footer motto (exact):

> PIECE BY PIECE, I TAKE MY LIFE BACK.

Title (exact):

> 2027 TRAINER TIMETABLE CARD

---

## 2. Calendar Law

| Rule | Definition |
|------|------------|
| Timezone | `Europe/London` via `Intl.DateTimeFormat` |
| Live start | `2027-01-01` — before this date = **PREVIEW** mode |
| Week-of-month | Days **1–7 = W1**, **8–14 = W2**, **15–21 = W3**, **22–end = W4** |
| Deload | Every **Week 4** of a month — amber hint in header; Base soft, cut MAIN ~40–50%, no Till Failure |
| Phase quarters | **JAN–MAR BASE** · **APR–JUN HARD** · **JUL–SEP EXPERT** · **OCT–DEC TILL FAILURE** |
| Auto-advance | When real London date moves, UI snaps to that month/week unless user has manually picked a month |
| Coach override | Hidden query `?date=YYYY-MM-DD` forces the London “today” for testing (documented for coach only) |

### Preview vs Live

- **PREVIEW** (before 1 Jan 2027): shows January by default; banner *“Live tracking starts 1 January 2027”*; ticks **allowed for practice**.
- **LIVE**: future **days** cannot be ticked (LOCKED); past + today can tick; all 12 months remain **viewable** for planning/audit.

### Month navigation

- All **12 months** are in the month bar and year-wall.
- Past months: open for audit + ticking.
- Future months: schedule visible; ticks locked until the day arrives.
- Current month/day/phase: **gold glow**.

---

## 3. Schedule Architecture (month-specific)

**File:** `data/schedule.js` → `window.RELIC_SCHEDULE`

Rotations are **MONTH-SPECIFIC**, not one global W1–W4 reused every month:

```
MONTH_ROTATIONS[month][weekOfMonth] = [Mon..Sun rows]
```

Each row:

```js
{ day, pair, cabins: [CabinKey, CabinKey] }
// SUN: { day:"SUN", pair:"Recovery", cabins:[], doc1:"Rest / Light Mobility", doc2:"Weekly Reset" }
```

- `MONTH_META[month]` → `{ phaseLine, blurb }` (card header copy)
- `MONTH_CARD_STATUS[month]` → `"locked" | "partial" | "provisional"`
- `citationLabel(cabinKey, phase)` → exact card string (see §4)
- `buildMonthDays(year, month)` expands dated days with `doc1` / `doc2` already resolved
- Citation **phase suffix** follows the **quarter** (Base / Hard / Expert / Till_Failure), even when a physical card was printed under a Base heading

NiX locks all twelve months’ W1–W4 into `schedule.js`. UI must **never** invent alternate pairs.

---

## 4. Citation Law (display ≠ Drive filename)

**Visible DOCUMENT 1 / DOCUMENT 2 label (exact card format):**

```
1. {CabinKey}_Trainer_{Phase}
```

Examples:

- `1. Back_Trainer_Base`
- `1. Upper_Arms_Trainer_Hard`
- `1. Legs_Glutes_Trainer_Expert`
- `1. Abs_Pelvic_Trainer_Till_Failure`

**SUN (exact):**

- Document 1: `Rest / Light Mobility`
- Document 2: `Weekly Reset`

**CabinKey map:**  
`Back` · `Upper_Arms` · `Chest` · `Legs_Glutes` · `Abs_Pelvic` · `Calisthenics` · `Resistance_Bands` · `Hanging` · `Target_Weights` · `Hand_Wrist_Forearm` · `Posture_Mobility` · `Neck`

**URLs:** from `data/citations.js` (`window.RELIC_CITATIONS`).  
If a higher tier Docx is missing, href falls back to Base + gate note; **display label still uses the quarter phase string**.

Do **not** show Drive reorder names like `Back_Base_Trainer.docx` in the table.

---

## 5. Table Columns (exact)

| DAY | TRAINING PAIR | DOCUMENT 1 | DOCUMENT 2 | COMPLETE |

- COMPLETE: sexy golden checkbox + optional SKIP + undo  
- Ornate cathedral **frame/background** YES  
- Busy table cells NO — parchment rows, purple/gold header only

---

## 6. Visual Law

- Gothic cathedral Relic card: deep purple / metallic gold / parchment cream / fleur-de-lis / stained-glass feel
- **Unique background mood per month** via `body[data-month]` + `.card[data-month]` (Jan violet → Dec gold-dusk, etc.)
- Active phase / current month chip / today row: **gold glow**
- Completed row: parchment→gold accent + bold ✓  
- Skipped row: muted amber SKIP mark
- Sexy COMPLETE tick: gold fill, pulse glow, particle flourish

---

## 7. Persistence

| Key | `localStorage.relic_trainer_2027_v1` |
|-----|-------------------------------------|
| Shape | `{ completes: {"2027-01-05": true}, skips: {"2027-01-06": true}, version: 1 }` |
| Scope | All 365 days of 2027 |
| Tools | Export JSON / Import JSON / Clear All / per-day undo |

---

## 8. Files

```
platform/
  index.html          — card shell
  styles.css          — gothic themes + print CSS
  app.js              — calendar, ticks, render
  PLATFORM_SPEC.md    — this law
  data/
    schedule.js       — MONTH_ROTATIONS + meta (NiX-locked)
    citations.js      — live Drive URLs per cabin × phase
```

Vanilla HTML/CSS/JS only. No build step. No npm.

---

## 9. Coach test

```
index.html?date=2027-02-01   → February Week 1, BASE phase, gold on Feb
index.html?date=2027-04-15   → April Week 3, HARD phase
index.html?date=2026-09-25   → PREVIEW (Jan W1), practice ticks OK
```

---

## 10. Success criteria

1. Opening `index.html` shows the gothic card UI  
2. `?date=` / system date moves month · week · phase · glow correctly  
3. All 12 months navigable; future day ticks locked when LIVE  
4. Checkboxes persist across reload  
5. Skip + undo work  
6. Feb (and every locked month) shows **that month’s** pairs, not a global clone  
7. Document cells show card citation strings; links open Drive docs  
8. This SPEC is the Relic archive law for the platform

---

*Relic 2027 · NiX coach archive · Europe/London*


## Year lock (2026-09-25)
- January W1–W4 + February W1–W2: Joseph card-exact.
- February W3–W4 + March–December all weeks: NiX-intelligent locks for Joseph’s future.
- All months locked (no provisional stubs).
- Unique gothic backgrounds per month; weekly table stays card-simple.


## Relic Calendar System (locked 2026-09-25)
- **PREVIEW** (before 2027-01-01 London): browse all 12 months × 4 weeks freely. Practice ticks allowed.
- **LIVE LOCK** (from 2027-01-01): year is real. Browse any month to look ahead. COMPLETE/SKIP only for today and past. Future days show LOCKED until that date arrives. Today row glows gold.
- All 48 weekly cards are unique (Jan cards + Feb W1–W2 cards + NiX locks for the rest).
