# Relic Architect V2.0 — Platform Spec

**Product:** 2027 Trainer Timetable Card  
**Owner:** Joseph Searle  
**Coach archive:** NiX  
**Timezone:** Europe/London (always)  
**Runtime:** static HTML / CSS / JS. No build step. No npm.  
**Cache bust:** `?v=v20` on every stylesheet and script in `index.html`

Footer motto (exact):

> PIECE BY PIECE, I TAKE MY LIFE BACK.

Title (exact):

> NiX Training Schedules

---

## 1. Purpose

Single-page timetable for the 2027 trainer year. Each training day shows two stacked cabin citations. Opening a citation streams that cabin’s movement clips from Supabase Storage. Finishing a citation’s set, or using the DONE control, upserts that day’s tier on `relic_completions` for the active schedule mode only.

Two schedule modes share this page: **Full Body Trainer Schedules** (default) and **Upper Body Trainer Schedules**. Under the week chrome the order is the timetable matrix, the schedule toggle immediately under the last day rows, then the motto and its metadata at the bottom of the card. The toggle swaps the rendered rotation without a reload. See §11.

Playback never uses Google Drive iframes, preview URLs, or `embeddedfolderview`. Completion state never uses `localStorage` as the source of truth.

---

## 2. Visual law (Samsung S24 Ultra)

| Token | Value |
|-------|--------|
| Page background | `#0b0216` |
| Containers | `#1b0a2a` to `#12051d` |
| Table cells | `#150724` |
| Active gold | `#ff8c00` |
| Citation links | `#d8b4fe` |
| Touch target | 44px minimum on every interactive control |

The timetable is exactly three columns, `table-layout: fixed`:

| DAY | TRAINING RELICS | DONE |
|-----|-----------------|------|
| 20% | 70% | 10% |

- Headers are only `DAY`, `TRAINING RELICS`, `DONE`.
- Do not add `TRAINING PAIR`, `DOCUMENT 1`, or `DOCUMENT 2` headers.
- Both document citations stack inside TRAINING RELICS.
- DONE is a centered compact tier control. The drawn box is small. The hit target stays at least 44px.

---

## 3. Citation law

Visible label (exact):

```
1. {CabinKey}_Trainer_{Phase}
```

Phase suffix follows the quarter, not a printed-card heading:

| Quarter | Months | Phase suffix |
|---------|--------|----------------|
| Q1 | Jan–Mar | `Base` |
| Q2 | Apr–Jun | `Hard` |
| Q3 | Jul–Sep | `Expert` |
| Q4 | Oct–Dec | `Till_Failure` |

Full Body cabin keys: `Back` · `Upper_Arms` · `Chest` · `Legs_Glutes` · `Abs_Pelvic` · `Calisthenics` · `Resistance_Bands` · `Hanging` · `Target_Weights` · `Hand_Wrist_Forearm` · `Posture_Mobility` · `Neck`

**Calisthenics (v16)** lives only in the Q4 2027 Till Failure block (October, November, December 2027). Q4 2026 bridge pairings and the Q1 Base, Q2 Hard, and Q3 Expert rotations do not schedule it. Those former slots are `Posture_Mobility`, `Abs_Pelvic`, or `Neck` (joint mobility, posture, and core alignment). `data/upperBody.js` and `data/videoArchive.js` are unchanged. The Calisthenics citation and playlist stay so the Q4 2027 keys still resolve.

Upper Body cabin keys: `Face` · `Eyes` · `Tongue` · `Jaw` · `Neck` (Neck is the same cabin key as Full Body)

Document URLs stay in `data/citations.js`. A primary click starts the cabin video session. The anchor may still point at the phase document. Missing higher-tier documents fall back to Base. The visible label still uses the quarter phase. Do not show Drive filenames such as `Back_Base_Trainer.docx` in the table.

A cabin with one trainer document (Eyes: `1. Eye_Sequence_Trainer.docx`) uses that same file for `Base`, `Hard`, `Expert`, and `Till_Failure`. The year does not wait on phase variants. Face, Tongue, Jaw, and Neck keep one document per phase.

**Sunday (data law, hidden in the Mon–Sat list):**

- Document 1: `Rest / Light Mobility`
- Document 2: `Weekly Reset`

---

## 4. Calendar law

| Rule | Definition |
|------|------------|
| Timezone | `Europe/London` via `Intl.DateTimeFormat` |
| Year | 365 days, ISO `date_key` `YYYY-MM-DD`, from `2027-01-01` |
| Live start | `2027-01-01`. Before that date the UI is **PREVIEW** |
| Week of month | Days **1–7 = W1**, **8–14 = W2**, **15–21 = W3**, **22–end = W4** |
| Row order | Sort the visible week by `dateKey`. Never by weekday name |
| Sunday | Present in `schedule.js` and in `data/precondition.js`. Omitted from the main Mon–Sat list |
| Deload | Removed in v2_13. No `#deload-hint`, no Week 4 deload copy, no amber deload warning. Week chips still read `WEEK 4` |
| Auto-advance | When the London date changes, the UI snaps to that month and week unless the user picked a month |
| Coach override | `?date=YYYY-MM-DD` forces London “today” |

**PREVIEW** (before 1 Oct 2026): January Week 1 of the 2027 year timetable by default. Practice ticks allowed on every shown day.  
**Q4 2026** (1 Oct 2026 through 31 Dec 2026): a 2026 day ticks only on or before London today. Later 2026 days are locked. Every 2027 day is locked.  
**LIVE** (from 1 Jan 2027): future days cannot be ticked. Past days and today can. All 12 months stay viewable.

### Branch (v15)

`state.viewYear` is `2026` or `2027`. `state.branch` is `bridge` when the view year is 2026 and `year` when it is 2027.

| Branch | View | Months |
|--------|------|--------|
| `bridge` | Q4 2026 Pre-Recondition | October, November, December 2026 |
| `year` | 2027 timetable | January–December 2027 |

Ambient Hub in the drawer switches the branch: it clears the client month-row cache, sets `viewYear` / `branch`, and calls `render()`. The month-row cache key is `{year}:{mode}:{month}` (example `2026:full:10`), so a 2026 bridge month never reuses a 2027 row. Completion rows stay on the existing `date_key` strings. There is no schema change.

Full Body bridge days are read from `data/precondition.js` (`window.RELIC_PRECONDITION`). That file owns October, November, and December 2026 only. Week buckets stay 1–7, 8–14, 15–21, and 22–end. Sunday is in the month build and stays off the active list. Pairings omit Hanging, Target_Weights, and Calisthenics. Citations use `1. {CabinKey}_Trainer_Base`. `MONTH_ROTATIONS` in `data/schedule.js` is the 2027 Full Body lock and is not the bridge source. In v16 that lock keeps Calisthenics in October–December 2027 only. January–September replace each former Calisthenics cabin with `Posture_Mobility`, `Abs_Pelvic`, or `Neck`, and the pair label swaps `Skill` for `Posture`, `Core`, or `Alignment`.

`paintYear()` follows `state.viewYear`. The 2026 shield lights only when all three bridge months are dual-complete (every required Mon–Sat day at tier 3). The 2027 shield still lights only when all 12 months are dual-complete. The badge label is the view year.

2027 Full Body rotations live only in `data/schedule.js` (`MONTH_ROTATIONS`). The UI must not invent those pairs. Upper Body rotations live only in `data/upperBody.js` (`RELIC_UPPER_BODY.MONTH_ROTATIONS`) and must not replace the Full Body table. On the bridge, Upper Body still uses that file.

---

## 5. Video engine

Element:

```html
<video id="relic-active-video" src="..." autoplay loop playsinline preload="auto"></video>
```

- Public object URL: `{SUPABASE_URL}/storage/v1/object/public/relic-videos/{cabinKey}/{filename.mp4}`
- Resolve the filename from `clip.src` or `clip.path` when that value is already a non-Drive URL or a storage path. Otherwise use `clip.title`, appending `.mp4` when needed.
- Ignore legacy Drive `id` values for playback.
- Default set length `SET_DURATION_SEC`: **1200 seconds** (20:00) per clip. The file loops while the timer decrements. Timer controls never reload `<video id="relic-active-video">` and never touch its `src`.
- Timer badge: gold `#ff8c00`, monospace, a button inside the video overlay at `top: 18px; right: 18px; z-index: 999`. Minimum touch target 44px. Tap opens a dual-module popover. Tap the badge again, tap outside, or press Escape to close it without changing the clock. Choosing any duration or add-time button closes the popover immediately and returns focus to the video.
- **Duration** (master override): buttons **2m, 5m, 10m, 20m**. A tap overwrites the remaining countdown to that interval (`02:00`, `05:00`, `10:00`, or `20:00`) and sets `SET_DURATION_SEC` to that many seconds. The current clip keeps looping.
- **Add More Time** (stacking): buttons **+2m, +5m, +10m, +20m**. A tap adds that many seconds to the remaining countdown only. `SET_DURATION_SEC` stays unchanged. Example: `09:00` left + 5 min → `14:00` left, and the next set still uses the locked duration. The current clip keeps looping.
- At `00:00`, credit the opened citation, then close the player and return to the timetable when that citation’s set is finished. Slot 0 sets tier bit `1` (single shield) and returns. Slot 1 sets tier bit `2`. When both bits are on, the mask is `3`, `completed=true`, and the player returns. The manual DONE cycle stays empty → single → double → clear. Skipping with Next does not credit a video and does not auto-close. If the day cannot tick, the playlist still advances until the last clip, then the player closes without an upsert. A coach URL `?setsec=1` through `?setsec=1200` shortens the set for a pass. The default remains 1200 seconds. Duration and Add More Time are unchanged.
- **v14 set credit.** That same `00:00` marks the opened citation’s trainer video complete for its day. Slot 0 (first scheduled citation) sets tier bit `1`. Slot 1 (second/final citation) sets tier bit `2`. A later clip in the same cabin does not add another tier. Full Body stays on the bare `YYYY-MM-DD` key. Upper Body stays on `upper:YYYY-MM-DD`.
- Empty playlist: set the frame to `about:blank` and show `No video file IDs mapped for this cabin.`
- **v2_13 header.** The card title is `NiX Training Schedules`. `JOSEPH · LONDON`, the preview/live status (`#meta-mode`), and today’s London date sit in the top-right corner. A sync dot (`#sync-dot`) shows a loading ring while a `relic_completions` GET or upsert is in flight, then a steady gold dot. Errors still use `#sync-status`. Month/week (`#identity-line`) and foundation (`#month-blurb`) stack in gold directly above the Q1–Q4 phase bar. The preview practice-ticks banner and the deload hint are gone.
- **v2_14 menu.** A 44px hamburger sits at the top-left of the header, beside `NiX Training Schedules`. Closed, its three bars are horizontal. Open, that bar group rotates 90° with a CSS transition. A left drawer (`50vw`) slides over a scrim so the timetable stays partly visible. Tap the scrim, the hamburger, or Escape to close. The drawer title is `NiX Training Schedules`.
- **v15 drawer rows.** Full Body and Upper Body are modular rows (at least 44px, hairline dividers, left label, right tag). The active row carries a 2px `#ff8c00` rail. Both call `setScheduleMode`, the same setter as `#btn-schedule-mode` under the timetable. Ambient Hub rows switch `bridge` (Q4 2026 Pre-Recondition) and `year` (2027 Year).
- **v18 food rooms.** Food and Prep is four drawer rows: Weekly Food Schedule, Monthly Foods (Sainsbury’s), Meal Recipe Cards, and Smoothie / Extraction Cards. Each opens its own board. Training completions, the player, and the CUE panel stay out of those rooms. See §12.
- **v16 forensic cue.** Inside `.player-stage`, a `CUE` tab (`.forensic-tab`) is anchored to the bottom edge, inside `.forensic-dock`, a sibling of `#relic-player-hud`. Closed, the dock sits at `translateY(calc(100% - 44px))` so only the tab shows. Open, `.forensic-panel` slides up with that same transform to at most `48vh`. The video shifts up slightly (`translateY(-7vh)`) so the tracking stays clear of the panel. The scroll body carries `3-Lead Unique Rule: Left-Lead. 3-second ease.`, `Do this properly: …`, `Avoid this: …`, and a breathing label. The metrics footer stays pinned: `Sets: X | Reps: X | Hold: X | Rest: X`. Breathing is Box Breathing (4-4-4-4) for isometric holds and posture resets, Relaxation Breathing (4-7-8) for deep restorative stretches, and Controlled Nasal Cadence synced with the 3-second negative eccentric. The toggle does not touch `player.timerId`, does not stop or restart autoplay, and does not reload `<video id="relic-active-video">`. `isHudChromeTarget()` includes `.forensic-tab`, `.forensic-panel`, and `.forensic-dock`. Those elements `stopPropagation` and do not restart the 2000ms HUD fade or pause the video. Bridge reads still refuse Hanging, Target_Weights, and Calisthenics. Year reads include the Q4 2027 Calisthenics profile.
- **v2_12 rapid HUD.** No tempo prompt bar. The video stage fills the viewport. Close, the gold timer badge (with Duration / Add More Time), the exercise title, and the centered white Prev / Play / Next dock are one HUD. Inactivity of exactly 2000ms fades that chrome out together via CSS opacity and visibility. A tap on the empty stage or the video toggles the group: hidden shows it at once and starts a fresh 2000ms timer; visible hides it at once. Taps on Prev, Play, Next, close, and the timer badge menus still run those controls and do not toggle the HUD away. The countdown, `autoplay` / `loop` / `playsinline`, and the `00:00` set finish keep running while the HUD is hidden.
- **v2_11 flush open.** No `poster` attribute and no native play-button chrome. The stage and video paint transparent, so a gray or black slab cannot flash behind the frame. `preload="auto"`. A citation tap calls `play()` immediately. If `loadeddata` still leaves an unpainted `currentTime` of 0, the player nudges it to `0.001` so the first painted frame is the media frame. The player stays invisible until that frame is ready, then appears flush. `playsinline` and `loop` stay.

Config: `data/supabaseConfig.js` (`url`, `anonKey`, `bucket`). Playlists: `data/videoArchive.js`.

---

## 6. Completions

Table: `relic_completions`

| Column | Type |
|--------|------|
| `date_key` | TEXT PRIMARY KEY. Full Body: bare `YYYY-MM-DD` (Europe/London). Upper Body: `upper:YYYY-MM-DD` |
| `completed` | BOOLEAN. True only for a dual/full day |
| `tier` | SMALLINT 0–3. Video bitmask added in v14. `1` = first trainer video, `2` = second/final trainer video, `3` = both |
| `updated_at` | TIMESTAMPTZ |

- Load with the anon key via Supabase REST (`select=date_key,completed,tier`).
- Upsert on `date_key` (`Prefer: resolution=merge-duplicates`). The body sends `completed`, `tier`, and `updated_at`.
- In-memory state is only a mirror of Supabase. Do not persist ticks in `localStorage`.
- No `mode` column. Existing bare `YYYY-MM-DD` rows are Full Body and are not rewritten. A `full:` prefix, if present, is read as Full Body; new Full Body writes stay on the bare key so older clients keep working.
- **v14 legacy rule.** `completed=true` is a full day, including rows written before `tier` existed. Those rows were backfilled to `tier=3`. A pre-v14 client that still writes `completed=true` and leaves `tier` at 0 is read as dual (`tier` 3). `completed=false` with `tier` 1 or 2 is a single shield. `tier` 3 with `completed=false` is treated as cleared.

### Two-stage day

Each Mon–Sat row has two trainer citations. Display tier is the number of finished videos (0, 1, or 2).

- Timer `00:00` on the first citation sets bit `1` (single orange shield), closes the player, and returns to the timetable.
- Timer `00:00` on the second citation sets bit `2`. Both bits are the double orange shield and `completed=true`. That finish also closes the player and returns to the timetable.
- The DONE control cycles in the same order: empty box → single shield (bit `1`) → double shield (bits `1` and `2`, `completed=true`) → clear (`tier` 0, `completed=false`). A single shield that is only the second video still advances to dual, then the next tap clears. `aria-checked` is `false`, `mixed`, or `true`.

### Mode-isolated completions

Full Body and Upper Body do not share a tick. The active mode (`state.mode`, first paint from `?mode=upper` or `?mode=full`) chooses the storage key: bare `YYYY-MM-DD` for Full Body, `upper:YYYY-MM-DD` for Upper Body. Switching the bottom toggle re-renders that mode’s ticks and period shields only. The other mode’s rows stay untouched.

### Shield Tick badge

Active days in each week bucket are Monday–Saturday (`dayIndex` 0–5). Sunday (Rest / Weekly Reset) stays off the main list and out of the evaluation.

Week buckets stay days **1–7**, **8–14**, **15–21**, and **22–end**. A week, month, or year lights up only when every active Mon–Sat day in that period is dual-tier for the active mode. Weeks 1–3 are six days. Week 4 includes every Mon–Sat date from the 22nd through month end. The tick count is the sum of finished videos (2 per dual day).

Each week chip is two slots. **SINGLE** counts days whose first trainer video is done (`bit 1`), as `n/total`. **DUAL** counts fully dual days, as `n/total`, until the week is 100% dual. The slots stay visually separate: the single slot keeps a dark inset, and the dual slot is its own module.

While a period is complete for the active mode:

- That week’s chip uses a rich green field. The dual slot shows an orange `#ff8c00` double-tick shield and the aggregate tick count. The single slot stays a separate dark module on that green field. The shield stays while another week is on screen. An incomplete dual slot hides the shield. A fully dual month chip still uses the same green field, shield, and tick count.
- The year badge (`#year-badge`) uses the same green, shield, and count. On the 2027 branch it stays hidden until all 12 months are dual-complete. On the 2026 bridge it stays hidden until October, November, and December are each dual-complete. The label is `state.viewYear`.
- Day cells show a compact empty box, a single-tick shield, or a double-tick shield. They do not turn into a large gold checkbox.

Evaluate on each timetable render and whenever a completion is upserted. Do not store the badge in `localStorage`. Week chips, the identity line, and week meta name Week 4 as `WEEK 4`. There is no deload hint.

---

## 7. Cache

`vercel.json` sends `Cache-Control: public, max-age=0, must-revalidate` for every path. `cleanUrls` stays on. Every `<link>` and `<script>` in `index.html` uses `?v=v20`. The `relic-build` meta is `v20`. The in-memory month-row cache key is `{year}:{mode}:{month}`.

---

## 8. Files

```
index.html              — V2 shell, NiX header, hamburger, left drawer, toggle under the timetable, motto last
styles.css              — S24 Ultra timetable + player + mode button + drawer
app.js                  — calendar, Supabase ticks, HTML5 player, one schedule-mode setter
PLATFORM_SPEC.md        — this law
vercel.json             — no-cache headers
data/schedule.js        — 2027 Full Body NiX month rotations (MONTH_ROTATIONS; do not invent pairs)
data/precondition.js    — Q4 2026 Full Body bridge pairings (RELIC_PRECONDITION)
data/upperBody.js       — Upper Body rotations (does not edit MONTH_ROTATIONS)
data/citations.js       — document links, including Face / Eyes / Tongue / Jaw
data/forensic.js        — execution profiles: dose line, 3-lead rule, do / avoid, breathing
data/videoArchive.js    — cabin playlists (Drive id is not playback). Unchanged in v18.
data/nutrition/shop.js  — monthly Sainsbury’s basket, tiers, NPQ laws (RELIC_FOOD_SHOP)
data/nutrition/meals.js — forensic meal cards (RELIC_FOOD_MEALS)
data/nutrition/extractions.js — morning 3000W smoothie cards (RELIC_FOOD_EXTRACTIONS)
data/nutrition/schedule.js — Mon–Sat fuel days for Oct 2026–Dec 2027 (RELIC_FOOD_SCHEDULE)
data/supabaseConfig.js  — url, anonKey, bucket
```

---

## 9. Coach checks

```
index.html?date=2027-01-01   → January Week 1, BASE, Fri 1 then Sat 2 then Mon 4
index.html?date=2027-04-15   → April Week 3, HARD
index.html?date=2026-09-25   → PREVIEW, 2027 January Week 1, practice ticks allowed
index.html?date=2026-10-15   → 2027 year view, every 2027 day LOCKED. Ambient Hub → Q4 2026 shows October; days after the 15th LOCKED. October has no Calisthenics citation.
index.html?date=2027-10-01   → October Week 1, TILL FAILURE. Wednesday lists Calisthenics. January–September do not.
index.html?date=2027-01-04&setsec=3   → coach set length 3 seconds. At 00:00 the player closes, upserts the citation bit, and the timetable is showing.
```

---

## 10. Success criteria

1. No Drive iframes, preview URLs, or `embeddedfolderview` in the player.
2. Clips stream from Supabase public URLs. At `00:00` the opened citation is credited and, once that set is finished, the player closes and the timetable is showing. Duration overwrites remaining time and `SET_DURATION_SEC`. Add More Time only stacks onto remaining time. Next still advances a clip without crediting it.
3. The table is exactly DAY / TRAINING RELICS / DONE at 20% / 70% / 10%.
4. Ticks upsert `relic_completions`.
5. `vercel.json` no-cache plus `?v=v20` on assets. The `relic-build` meta is `v20`. The player HUD auto-hides after exactly 2000ms. A tap on the empty stage or video toggles that chrome. A drag past 18px does not. Opening a citation shows the Supabase mp4 first frame with no poster and no native play glyph. The forensic CUE tab slides up from the bottom, does not reset that timer, and does not reload the video.
6. `schedule.js` `MONTH_ROTATIONS` stays the Full Body lock. Upper Body data is additive.
7. A week chip has a SINGLE slot and a DUAL slot. At 100% dual the chip is rich green, the dual slot shows an orange `#ff8c00` double-tick shield and the aggregate tick count, and the single slot stays a separate dark module. Day DONE cells use a compact box or a single/double shield, with a 44px hit target. Month chips and `#year-badge` use the same score and light up only at 100%. Week 4 labels read `WEEK 4`. The deload hint does not render. Calisthenics appears only in October–December 2027.
8. The toggle immediately under the timetable swaps Full Body and Upper Body without a reload. The drawer’s Full Body and Upper Body rows call the same `setScheduleMode`. Ambient Hub switches the 2026 bridge and the 2027 year. The motto and metadata stay under that toggle. Each mode shows only its own ticks and shield badges.

---

## 11. Upper Body Trainer Schedules

Same shell as Full Body: fixed 3-column table (DAY 20% / TRAINING RELICS 70% / DONE 10%), headers only `DAY`, `TRAINING RELICS`, `DONE`, gothic tokens (`#0b0216`, `#150724`, `#ff8c00`, `#d8b4fe`), 44px targets, month chips, week chips, shield tick badge, dual-module timer, and Sunday hidden from the Mon–Sat list.

`app.js` keeps one render path. `state.mode` is `full` or `upper`. `activeDaysForWeek` reads `RELIC_SCHEDULE.daysInWeekOfMonth` or `RELIC_UPPER_BODY.daysInWeekOfMonth`. Phase, timezone, and week buckets do not fork. Completion reads and writes use the active mode’s `date_key` namespace.

### Toggle

The header line `#schedule-mode` sits under the title `NiX Training Schedules` and names the mode on screen: `Full Body Trainer Schedules` or `Upper Body Trainer Schedules`.

`#btn-schedule-mode` stays immediately under the timetable matrix. Its label names the other mode (`Upper Body Trainer Schedules` or `Full Body Trainer Schedules`). The drawer mirrors that choice with one row per mode. Both call `setScheduleMode`, which writes `state.mode` and calls `render()`. No `location` reload. The choice is in-memory. `?mode=upper` or `?mode=full` sets only the first paint. There is no Jump to Today button.

The footer sits under that toggle, at the bottom of the card. The motto is exactly `PIECE BY PIECE, I TAKE MY LIFE BACK.` in larger gold type (`1.15rem`, weight 900), followed by the owner line and the storage line.

### Daily rotation

Cabins: `Face`, `Tongue`, `Eyes`, `Jaw`, plus `Neck` on every Mon–Sat row. The partner cycles `Face → Tongue → Eyes → Jaw`. The month offset is 5 so each quarter still gives those four cabins equal template slots, and adjacent months do not open on the same lead. Odd weekdays list Neck first. Citation text is `1. {CabinKey}_Trainer_{Phase}` with the quarter suffix (`Base`, `Hard`, `Expert`, `Till_Failure`).

Sunday in the data file remains `Rest / Light Mobility` and `Weekly Reset`, and stays off the list.

### Player mapping

Citation click still opens `<video id="relic-active-video">`. No Drive iframe, preview, or `embeddedfolderview`.

Public playback paths are `relic-videos/{CabinKey}/{filename}.mp4`. The player never uses a Drive iframe, preview URL, or `embeddedfolderview`.

The document folders below are the citation mapping. Playback objects were copied from the trainer-video folders into the public bucket. Clips over the 50MB storage cap were re-encoded before upload. `videoArchive.js` playlists name those object filenames. An empty playlist still shows `No video file IDs mapped for this cabin.` Face, Eyes, Tongue, Jaw, and Neck are not empty.

| Cabin | Document folder | Video folder (bytes copied from) | Bucket prefix |
|-------|-----------------|----------------------------------|---------------|
| Face | `1opDQL0l5oGXTkfoIQtfNOX6TxZR84sYt` | `1a1EPQ9tcq2h80sRUTy0RgPKVyjNofNr7` | `Face/` |
| Eyes | `1WN7qz3tkaZG-mL_-4NDdBcx3jtu0AVNI` | `1IFYFNll4u0SOsKNwaXFwcGCzIeVt0YQG` | `Eyes/` |
| Tongue | `1cC-MISCfVkYtzX8_dt_0SMn4qhUmCokb` | `1Hr-SOlyYmbA9ilHe07nV8mmkWHD7Nilm` | `Tongue/` |
| Jaw | `1Dmk_4gUcy5t_xd7fmxUf36gzgV_sDDla` | `14AXrIlRqWouimaym2gdACISEJbbNhBWj` | `Jaw/` |
| Neck | `1h6AgF9B3QHB7y6JIyo7amU0U5SUrwQbj` | `1FKFGp-0A9ZSUjeTH65saLabR2wXtcJTs` | `Neck/` |

Eyes is a single-document folder. `1. Eye_Sequence_Trainer.docx` is the href for every phase. Face, Tongue, Jaw, and Neck each have Base, Hard, Expert, and Till_Failure documents. Neck playback reuses the existing `Neck/` playlist. Face order is PRE, then MAIN (capped at 20), then POST.

### Badge

The shield tick scores each week of the viewed month on its own, for the active mode only: every active Mon–Sat day in that bucket must be dual-tier (`tier` 3 / `completed=true`) under that mode’s key. Week 4 includes every Mon–Sat date from the 22nd through month end. Each week chip has a SINGLE slot and a DUAL slot. A complete chip is rich green; the dual slot carries an orange double-tick shield and the video tick count, and the single slot stays a separate dark module. A week finished in Upper Body does not mark the same week finished in Full Body. Month and year use the same dual rule. Badge state is not stored in `localStorage`.

---

## 12. Food OS rooms (v18)

Training OS and Food OS share the hamburger shell and use two rooms. Food views do not bind `relic_completions`, the HTML5 player, the HUD timer, or the CUE panel. Closing a food room shows the training timetable again and does not restart a video that is already open.

Four drawer rows sit under Food and Prep. Each opens one board:

| Row | Board |
|-----|--------|
| Weekly Food Schedule | Mon–Sat rows for the month and week already on screen. Each row names the morning smoothie, the dinner as a household portion (or a Drive card gram where the card states one), lunch, and 2 fruit + 3 veg. Sunday stays off the list. Cabin names are read-only text. |
| Monthly Foods (Sainsbury’s) | Editable Sainsbury’s list (tick, quantity, add, remove), NPQ laws, and Lock. |
| Meal Recipe Cards | Forensic magazine cards. Cream `#FCF5E8` interior, oak `#1F1812` panels, brass `#C9A227` accents. |
| Smoothie / Extraction Cards | Morning 3000W card only. Order is liquid, frozen fruit, citrus, hemp, blend, cheesecloth strain, then botanicals. |

### Budget tiers

| Tier | Window | Budget | Counter |
|------|--------|--------|---------|
| 1 | Oct 2026 – Jan 2027 | £150 / month | Bulk chicken, turkey mince, potatoes, rice, and eggs. Taste the Difference free-range first, then SO Organic free-range, then standard free-range. Frozen fruit is allowed. Salmon on this tier is the frozen fillet. |
| 2 | Feb 2027 onward | £300 / month | Salmon, premium beef mince, wider veg, Waitrose and Sainsbury’s premium lines. |

`RELIC_FOOD_SHOP.tierFor(viewYear, viewMonth)` follows the timetable. January 2027 is Tier 1. February 2027 and later months are Tier 2. October–December 2026 on the bridge are Tier 1. Prices are Sainsbury’s / Waitrose product-style placeholders and each mapped list fits its cap.

Shopping lists: `2026-10`, `2026-11`, `2026-12`, `2027-01`, and the February-onward template `2027-02+`. Weekly fuel days cover those bridge months and every 2027 month.

### Dietary baseline

Allowed proteins: Chicken, Turkey Mince, Beef Mince, Salmon, Eggs. Allowed carbs: Potatoes and Rice. The FOOD_LIVE week is Mon eggs at lunch and chicken in the evening, Tue salmon, Wed eggs with mushrooms and greens, Thu chicken thigh tray, Fri eggs at lunch and salmon or white fish in the evening, Sat a cooked breakfast with eggs and beef boats. Sunday stays off the food grid and holds a 45-minute prep note, including boiled eggs for two days. Egg whites are cooked. Taste the Difference free-range eggs come first, then SO Organic free-range, then standard free-range. Brazil nuts are capped at one a day. Smoothies are morning or a lunch refresh only.

### NPQ laws

1. Protect existing month-cover stock first.
2. Fruit first, food second.
3. Smoothies never become dinner.
4. One dinner method covers mince nights and flex nights.
5. Daily target: 2 fruit + 3 veg portions.

### Meal cards

Every meal card has a serif title, a script tagline, a facts bar (Yield, Prep, Cook, Cals, £ tier), ingredient lines with weights and Sainsbury’s-style names, numbered method steps whose leading verb is bold, a Weekly Timetable box (Best for, Best eaten, Reheat), and a footer tip.

Seed snack cards keep the Drive gram lines: Crispy Potato Snack (400 g potato and 15 g cornflour, air fry 200°C, 12–15 min), Cheesy Roasted Garlic Bread, Cheesy Potato Toast, Beef-Stuffed Potato Boats (300 g beef). The paprika egg skillet, bread-and-egg pan pizza, Omega-3 egg plate, and Wednesday eggs with mushrooms and greens are on the live meal board. Week plates use household portions: one breast, one fillet, one tray, or two eggs.

Cabin load is copied onto the row as read-only text. It is not written back onto `MONTH_ROTATIONS`. The extraction card stays on its own board.

### Extraction card

Ashwagandha 600 mg, Lion’s Mane 1000 mg (1500 mg on the recovery card), Spirulina 3 g (5 g on the recovery card), Psyllium Husk 5 g, Shilajit 300 mg. Those doses are whisked in after the cheesecloth strain. The morning lock is not dinner.

### v19 depth and lock

A single DONE tick glows gold. A dual tick is a green shield with a green glow. The week chip turns green only when every Mon–Sat day in that week is dual. The DUAL slot turns green as soon as a day in that week is dual, and it stays green when the week is complete. The SINGLE slot stays gold. Full Body and Upper Body keep separate `{year}:{mode}:{month}` caches and restore that mode’s scroll. A pointer move past 18px does not change month, week, cabin, or the player HUD.

Weekly rows follow the FOOD_LIVE training-day smoothie week: Monday banana, blueberry, spinach, and hemp; Tuesday papaya and pineapple; Wednesday mango, cherry, and hemp; Thursday kiwi and berry; Friday pineapple, spinach, and ginger; Saturday banana and blueberry. Sunday’s papaya, pineapple, kiwi, and berry glass is a prep note, not a row. The five basin kitchen cards stay beside that week: Berry Banana Brazil (one Brazil nut), Cherry Banana Cream, Mango Banana Nut, Berry Oat Almond, Orange Berry Yogurt. Dinner rows use a household portion. Wednesday evening is eggs, mushrooms, and greens. Saturday’s beef boats keep the card line of 300 g ground beef and 3 potatoes. Each row also shows lunch and 2 fruit + 3 veg. Monday, Friday, and Saturday lunch include eggs.

Monthly Foods edits a Sainsbury’s list in `localStorage` key `relic_food_shop_v19`. That store is not `relic_completions`. The board shows the aisle table, the fruit-first buys, and the Sunday 45-minute prep. Egg lines stay on the list: Taste the Difference free-range, then SO Organic free-range, then standard free-range. Tier 1 stays £150 with a visible soft stretch to £200. Tier 2 stays £300. Lock this month’s shop runs `composeFromBasket` and freezes the weekly prep plan. Before lock, the week is the suggested FOOD_LIVE rotation. Prices stay placeholders. A basket that only ticks an egg SKU plates eggs and cooks the whites.

### v20 ink, glow, and food authorship

Meal cards stay warm parchment with a gold rule. Smoothie cards use a mint ground and a teal rule. Ingredient lines, method steps, tips, and facts on those cards use dark ink (`#1f1812` / `#2c2118`). Cream cards do not use `--text`.

Each Food room has Export JSON, Import JSON, and Reset this room. Meal and smoothie cards can be added, edited, duplicated, or deleted. Custom cards and edits live in `relic_food_cards_v20`. Weekly lunch notes, unlocked evening picks, and locked day notes live in `relic_food_week_v20`. The shop can rename a line and add a custom line. None of these keys is `relic_completions`. Defaults in `data/nutrition/*` stay the base. An overlay wins until that room is reset.

---

*Relic Architect V2.0 · NiX coach archive · Europe/London*
