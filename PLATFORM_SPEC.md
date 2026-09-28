# Relic Architect V2.0 — Platform Spec

**Product:** 2027 Trainer Timetable Card  
**Owner:** Joseph Searle  
**Coach archive:** NiX  
**Timezone:** Europe/London (always)  
**Runtime:** static HTML / CSS / JS. No build step. No npm.  
**Cache bust:** `?v=v2_13` on every stylesheet and script in `index.html`

Footer motto (exact):

> PIECE BY PIECE, I TAKE MY LIFE BACK.

Title (exact):

> NiX Training Schedules

---

## 1. Purpose

Single-page timetable for the 2027 trainer year. Each training day shows two stacked cabin citations. Opening a citation streams that cabin’s movement clips from Supabase Storage. A completion checkbox upserts `relic_completions` for the active schedule mode only.

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
- DONE is a centered completion checkbox.

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
| Sunday | Present in `schedule.js`. Omitted from the main Mon–Sat list |
| Deload | Removed in v2_13. No `#deload-hint`, no Week 4 deload copy, no amber deload warning. Week chips still read `WEEK 4` |
| Auto-advance | When the London date changes, the UI snaps to that month and week unless the user picked a month |
| Coach override | `?date=YYYY-MM-DD` forces London “today” |

**PREVIEW** (before 1 Jan 2027): January Week 1 by default. Practice ticks allowed.  
**LIVE** (from 1 Jan 2027): future days cannot be ticked. Past days and today can. All 12 months stay viewable.

Full Body rotations live only in `data/schedule.js` (`MONTH_ROTATIONS`). The UI must not invent Full Body pairs. Upper Body rotations live only in `data/upperBody.js` (`RELIC_UPPER_BODY.MONTH_ROTATIONS`) and must not replace the Full Body table.

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
- At `00:00`, call `playNextVideo()` and load the next cabin clip without closing the player. The next clip starts at the current `SET_DURATION_SEC` (the last Duration override, or 1200 seconds when only stacking was used).
- Empty playlist: set the frame to `about:blank` and show `No video file IDs mapped for this cabin.`
- **v2_13 header.** The card title is `NiX Training Schedules`. `JOSEPH · LONDON`, the preview/live status (`#meta-mode`), and today’s London date sit in the top-right corner. A sync dot (`#sync-dot`) shows a loading ring while a `relic_completions` GET or upsert is in flight, then a steady gold dot. Errors still use `#sync-status`. Month/week (`#identity-line`) and foundation (`#month-blurb`) stack in gold directly above the Q1–Q4 phase bar. The preview practice-ticks banner and the deload hint are gone.
- **v2_12 rapid HUD.** No tempo prompt bar. The video stage fills the viewport. Close, the gold timer badge (with Duration / Add More Time), the exercise title, and the centered white Prev / Play / Next dock are one HUD. Inactivity of exactly 2000ms fades that chrome out together via CSS opacity and visibility. A tap on the empty stage or the video toggles the group: hidden shows it at once and starts a fresh 2000ms timer; visible hides it at once. Taps on Prev, Play, Next, close, and the timer badge menus still run those controls and do not toggle the HUD away. The countdown, `autoplay` / `loop` / `playsinline`, and `playNextVideo()` at `00:00` keep running while the HUD is hidden.
- **v2_11 flush open.** No `poster` attribute and no native play-button chrome. The stage and video paint transparent, so a gray or black slab cannot flash behind the frame. `preload="auto"`. A citation tap calls `play()` immediately. If `loadeddata` still leaves an unpainted `currentTime` of 0, the player nudges it to `0.001` so the first painted frame is the media frame. The player stays invisible until that frame is ready, then appears flush. `playsinline` and `loop` stay.

Config: `data/supabaseConfig.js` (`url`, `anonKey`, `bucket`). Playlists: `data/videoArchive.js`.

---

## 6. Completions

Table: `relic_completions`

| Column | Type |
|--------|------|
| `date_key` | TEXT PRIMARY KEY. Full Body: bare `YYYY-MM-DD` (Europe/London). Upper Body: `upper:YYYY-MM-DD` |
| `completed` | BOOLEAN |
| `updated_at` | TIMESTAMPTZ |

- Load with the anon key via Supabase REST (`select=date_key,completed`).
- Toggle upserts on `date_key` (`Prefer: resolution=merge-duplicates`).
- In-memory state is only a mirror of Supabase. Do not persist ticks in `localStorage`.
- Columns stay `date_key`, `completed`, and `updated_at`. No `mode` column and no migration. Existing bare `YYYY-MM-DD` rows are Full Body and are not rewritten. A `full:` prefix, if present, is read as Full Body; new Full Body writes stay on the bare key so older clients keep working.

### Mode-isolated completions

Full Body and Upper Body do not share a tick. The active mode (`state.mode`, first paint from `?mode=upper` or `?mode=full`) chooses the storage key: bare `YYYY-MM-DD` for Full Body, `upper:YYYY-MM-DD` for Upper Body. Switching the bottom toggle re-renders that mode’s ticks and week shields only. The other mode’s rows stay untouched.

### Shield Tick badge

Active days in each week bucket are Monday–Saturday (`dayIndex` 0–5). Sunday (Rest / Weekly Reset) stays off the main list and out of the evaluation.

Each week of the viewed month is scored on its own from the active mode’s completion keys. A week is complete when every active day in that bucket is completed for that mode. Weeks 1–3 are six days. Week 4 includes every Mon–Sat date from the 22nd through month end, so those extra days must be complete too.

While a week is complete for the active mode:

- That week’s chip shows a gold `#ff8c00` shield with a deep black checkmark, and the word **Completed** under the week label, including while another week is on screen. An incomplete week hides the shield.
- Gold `#ff8c00` checkboxes with a deep black checkmark apply only to the week currently being viewed, and only when that viewed week is complete for the active mode. Checkbox `aria-label` stays `Completed {date_key}`.

Evaluate on each timetable render and whenever a completion tick is upserted. Do not store the badge in `localStorage`. An incomplete viewed week keeps the normal checkbox style. Week chips, the identity line, and week meta name Week 4 as `WEEK 4`. There is no deload hint.

---

## 7. Cache

`vercel.json` sends `Cache-Control: public, max-age=0, must-revalidate` for every path. `cleanUrls` stays on. Every `<link>` and `<script>` in `index.html` uses `?v=v2_13`. The `relic-build` meta is `v2_13`.

---

## 8. Files

```
index.html              — V2 shell, schedule-mode line, toggle under the timetable, motto last
styles.css              — S24 Ultra timetable + player + mode button
app.js                  — calendar, Supabase ticks, HTML5 player, mode swap
PLATFORM_SPEC.md        — this law
vercel.json             — no-cache headers
data/schedule.js        — Full Body NiX month rotations (do not invent pairs)
data/upperBody.js       — Upper Body rotations (does not edit MONTH_ROTATIONS)
data/citations.js       — document links, including Face / Eyes / Tongue / Jaw
data/videoArchive.js    — cabin playlists (Drive id is not playback)
data/supabaseConfig.js  — url, anonKey, bucket
```

---

## 9. Coach checks

```
index.html?date=2027-01-01   → January Week 1, BASE, Fri 1 then Sat 2 then Mon 4
index.html?date=2027-04-15   → April Week 3, HARD
index.html?date=2026-09-25   → PREVIEW, January Week 1, practice ticks allowed
```

---

## 10. Success criteria

1. No Drive iframes, preview URLs, or `embeddedfolderview` in the player.
2. Clips stream from Supabase public URLs. The set timer calls `playNextVideo()` at `00:00`. Duration overwrites remaining time and `SET_DURATION_SEC`. Add More Time only stacks onto remaining time. The next clip starts at the locked `SET_DURATION_SEC`.
3. The table is exactly DAY / TRAINING RELICS / DONE at 20% / 70% / 10%.
4. Ticks upsert `relic_completions`.
5. `vercel.json` no-cache plus `?v=v2_13` on assets. The player HUD auto-hides after exactly 2000ms. A tap on the empty stage or video toggles that chrome immediately. Opening a citation shows the Supabase mp4 first frame with no poster and no native play glyph.
6. `schedule.js` `MONTH_ROTATIONS` stays the Full Body lock. Upper Body data is additive.
7. Each week whose Mon–Sat days are all complete for the active mode keeps a gold shield tick and the word Completed on its chip while any week is on screen. Gold `#ff8c00` checkboxes and black ticks apply only while that complete week is the one being viewed. Week 4 labels read `WEEK 4`. The deload hint does not render.
8. The toggle immediately under the timetable swaps Full Body and Upper Body without a reload. The motto and metadata stay under that toggle. Each mode shows only its own ticks and shield badges.

---

## 11. Upper Body Trainer Schedules

Same shell as Full Body: fixed 3-column table (DAY 20% / TRAINING RELICS 70% / DONE 10%), headers only `DAY`, `TRAINING RELICS`, `DONE`, gothic tokens (`#0b0216`, `#150724`, `#ff8c00`, `#d8b4fe`), 44px targets, month chips, week chips, shield tick badge, dual-module timer, and Sunday hidden from the Mon–Sat list.

`app.js` keeps one render path. `state.mode` is `full` or `upper`. `activeDaysForWeek` reads `RELIC_SCHEDULE.daysInWeekOfMonth` or `RELIC_UPPER_BODY.daysInWeekOfMonth`. Phase, timezone, and week buckets do not fork. Completion reads and writes use the active mode’s `date_key` namespace.

### Toggle

The header line `#schedule-mode` sits under the title `NiX Training Schedules` and names the mode on screen: `Full Body Trainer Schedules` or `Upper Body Trainer Schedules`.

The only schedule control is `#btn-schedule-mode`, placed immediately under the timetable matrix. Its label names the other mode (`Upper Body Trainer Schedules` or `Full Body Trainer Schedules`). A click flips `state.mode` and calls `render()`. No `location` reload. The choice is in-memory. `?mode=upper` or `?mode=full` sets only the first paint. There is no Jump to Today button.

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

The shield tick scores each week of the viewed month on its own, for the active mode only: every active Mon–Sat day in that bucket must be completed under that mode’s key. Week 4 includes every Mon–Sat date from the 22nd through month end. A week finished in Upper Body does not mark the same week finished in Full Body. Badge state is not stored in `localStorage`.

---

*Relic Architect V2.0 · NiX coach archive · Europe/London*
