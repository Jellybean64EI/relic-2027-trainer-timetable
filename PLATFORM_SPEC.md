# Relic Architect V2.0 — Platform Spec

**Product:** 2027 Trainer Timetable Card  
**Owner:** Joseph Searle  
**Coach archive:** NiX  
**Timezone:** Europe/London (always)  
**Runtime:** static HTML / CSS / JS. No build step. No npm.  
**Cache bust:** `?v=v2_6` on every stylesheet and script in `index.html`

Footer motto (exact):

> PIECE BY PIECE, I TAKE MY LIFE BACK.

Title (exact):

> 2027 TRAINER TIMETABLE CARD

---

## 1. Purpose

Single-page timetable for the 2027 trainer year. Each training day shows two stacked cabin citations. Opening a citation streams that cabin’s movement clips from Supabase Storage. A completion checkbox for the London `date_key` upserts `relic_completions`.

Two schedule modes share this page: **Full Body Trainer Schedules** (default) and **Upper Body Trainer Schedules**. A bottom button swaps the rendered rotation without a reload. See §11.

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
| Deload | Week 4 training hint only. Chips, headers, and week meta read `WEEK 4` with no DELOAD suffix. Amber hint: Base soft, cut MAIN ~40–50%, no till-failure |
| Auto-advance | When the London date changes, the UI snaps to that month and week unless the user picked a month |
| Coach override | `?date=YYYY-MM-DD` forces London “today” |

**PREVIEW** (before 1 Jan 2027): January Week 1 by default. Practice ticks allowed.  
**LIVE** (from 1 Jan 2027): future days cannot be ticked. Past days and today can. All 12 months stay viewable.

Full Body rotations live only in `data/schedule.js` (`MONTH_ROTATIONS`). The UI must not invent Full Body pairs. Upper Body rotations live only in `data/upperBody.js` (`RELIC_UPPER_BODY.MONTH_ROTATIONS`) and must not replace the Full Body table.

---

## 5. Video engine

Element:

```html
<video id="relic-active-video" src="..." autoplay loop playsinline></video>
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
- Under the video, show the **Left-Lead Rule** and **3-Second Negative** tempo prompts.

Config: `data/supabaseConfig.js` (`url`, `anonKey`, `bucket`). Playlists: `data/videoArchive.js`.

---

## 6. Completions

Table: `relic_completions`

| Column | Type |
|--------|------|
| `date_key` | TEXT PRIMARY KEY (`YYYY-MM-DD`, Europe/London) |
| `completed` | BOOLEAN |
| `updated_at` | TIMESTAMPTZ |

- Load with the anon key via Supabase REST (`select=date_key,completed`).
- Toggle upserts on `date_key` (`Prefer: resolution=merge-duplicates`).
- In-memory state is only a mirror of Supabase. Do not persist ticks in `localStorage`.
- Verified columns are only `date_key`, `completed`, and `updated_at`. There is no phase or schedule-mode column. Do not add one.

### Shared date_key across schedule modes

Full Body and Upper Body tick the same London date. Both write one `relic_completions` row keyed by `date_key` (`YYYY-MM-DD`). A tick in either mode sets that date completed for both, because the modes share the calendar day and the table has no mode column. No schema migration. Mode preference, if kept, is an in-memory flag only (`state.mode`, optional `?mode=upper` or `?mode=full` on first paint). It is not a completion source of truth.

### Gold Week Complete Badge

Active days in each week bucket are Monday–Saturday (`dayIndex` 0–5). Sunday (Rest / Weekly Reset) stays off the main list and out of the evaluation.

Each week of the viewed month is scored on its own from the in-memory `relic_completions` mirror. A week is complete when every active day in that bucket has `completed=true`. Weeks 1–3 are six days. Week 4 includes every Mon–Sat date from the 22nd through month end, so those extra days must be complete too.

While a week is complete:

- That week’s chip shows a **Gold Week Complete Badge**, including while another week is on screen. The badge `aria-label` is `Gold Week Complete Badge`. An incomplete week hides the badge.
- Gold `#ff8c00` checkboxes with a deep black checkmark apply only to the week currently being viewed, and only when that viewed week is complete. Those checkboxes use `aria-label` `Completed {date_key}, Gold Week Complete Badge`.

Evaluate on each timetable render and whenever a completion tick is upserted. Do not store the badge in `localStorage`. An incomplete viewed week keeps the normal checkbox style. Week chips, the identity line, and week meta name Week 4 as `WEEK 4` with no `DELOAD` suffix.

---

## 7. Cache

`vercel.json` sends `Cache-Control: public, max-age=0, must-revalidate` for every path. `cleanUrls` stays on. Every `<link>` and `<script>` in `index.html` uses `?v=v2_6`. The `relic-build` meta is `v2_6`.

---

## 8. Files

```
index.html              — V2 shell, schedule-mode line, bottom mode button
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
5. `vercel.json` no-cache plus `?v=v2_6` on assets.
6. `schedule.js` `MONTH_ROTATIONS` stays the Full Body lock. Upper Body data is additive.
7. Each week whose Mon–Sat days are all `completed=true` keeps a Gold Week Complete Badge on its chip while any week is on screen. Gold `#ff8c00` checkboxes and black ticks apply only while that complete week is the one being viewed. Week 4 labels read `WEEK 4` with no DELOAD suffix.
8. The bottom button swaps Full Body and Upper Body without a reload. Completions stay on the shared `date_key`.

---

## 11. Upper Body Trainer Schedules

Same shell as Full Body: fixed 3-column table (DAY 20% / TRAINING RELICS 70% / DONE 10%), headers only `DAY`, `TRAINING RELICS`, `DONE`, gothic tokens (`#0b0216`, `#150724`, `#ff8c00`, `#d8b4fe`), 44px targets, month chips, week chips, Gold Week Complete Badge, dual-module timer, and Sunday hidden from the Mon–Sat list.

`app.js` keeps one render path. `state.mode` is `full` or `upper`. `activeDaysForWeek` reads `RELIC_SCHEDULE.daysInWeekOfMonth` or `RELIC_UPPER_BODY.daysInWeekOfMonth`. Phase, timezone, week buckets, and the completion mirror do not fork.

### Toggle

The header line `#schedule-mode` names the mode on screen: `Full Body Trainer Schedules` or `Upper Body Trainer Schedules`.

The bottom button `#btn-schedule-mode` names the other mode. A click flips `state.mode` and calls `render()`. No `location` reload. The choice is in-memory. `?mode=upper` or `?mode=full` sets only the first paint.

### Daily rotation

Cabins: `Face`, `Tongue`, `Eyes`, `Jaw`, plus `Neck` on every Mon–Sat row. The partner cycles `Face → Tongue → Eyes → Jaw`. The month offset is 5 so each quarter still gives those four cabins equal template slots, and adjacent months do not open on the same lead. Odd weekdays list Neck first. Citation text is `1. {CabinKey}_Trainer_{Phase}` with the quarter suffix (`Base`, `Hard`, `Expert`, `Till_Failure`).

Sunday in the data file remains `Rest / Light Mobility` and `Weekly Reset`, and stays off the list.

### Player mapping

Citation click still opens `<video id="relic-active-video">`. No Drive iframe, preview, or `embeddedfolderview`.

Drive folder IDs below are mapping references. Public playback paths are `relic-videos/{CabinKey}/{filename}.mp4`.

| Cabin | Drive folder (reference only) | Bucket prefix |
|-------|-------------------------------|---------------|
| Face | `1a1EPQ9tcq2h80sRUTy0RgPKVyjNofNr7` | `Face/` |
| Eyes | `1IFYFNll4u0SOsKNwaXFwcGCzIeVt0YQG` | `Eyes/` |
| Tongue | `1Hr-SOlyYmbA9ilHe07nV8mmkWHD7Nilm` | `Tongue/` |
| Jaw | `14AXrIlRqWouimaym2gdACISEJbbNhBWj` | `Jaw/` |
| Neck | `1FKFGp-0A9ZSUjeTH65saLabR2wXtcJTs` | `Neck/` |

Neck already has a playlist in `videoArchive.js` and objects under `Neck/`. Upper Body reuses that cabin. Face, Eyes, Tongue, and Jaw are registered with those folder IDs and empty playlists until files exist. An empty playlist shows `No video file IDs mapped for this cabin.` Phase Docx files for Face, Eyes, Tongue, and Jaw are not authored; the visible label still uses the quarter phase.

### Badge

The Gold Week Complete Badge still scores each week of the viewed month on its own: every active Mon–Sat `date_key` in that bucket must be `completed=true`. Week 4 includes every Mon–Sat date from the 22nd through month end. Because both modes share `date_key`, a completed week shows the badge in both modes. Badge state is not stored in `localStorage`.

---

*Relic Architect V2.0 · NiX coach archive · Europe/London*
