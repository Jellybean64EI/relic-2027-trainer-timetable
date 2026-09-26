# Relic Architect V2.0 — Platform Spec

**Product:** 2027 Trainer Timetable Card  
**Owner:** Joseph Searle  
**Coach archive:** NiX  
**Timezone:** Europe/London (always)  
**Runtime:** static HTML / CSS / JS. No build step. No npm.  
**Cache bust:** `?v=v2_4` on every stylesheet and script in `index.html`

Footer motto (exact):

> PIECE BY PIECE, I TAKE MY LIFE BACK.

Title (exact):

> 2027 TRAINER TIMETABLE CARD

---

## 1. Purpose

Single-page timetable for the 2027 trainer year. Each training day shows two stacked cabin citations. Opening a citation streams that cabin’s movement clips from Supabase Storage. A completion checkbox for the London `date_key` upserts `relic_completions`.

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

Cabin keys: `Back` · `Upper_Arms` · `Chest` · `Legs_Glutes` · `Abs_Pelvic` · `Calisthenics` · `Resistance_Bands` · `Hanging` · `Target_Weights` · `Hand_Wrist_Forearm` · `Posture_Mobility` · `Neck`

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

Rotations live only in `data/schedule.js` (`MONTH_ROTATIONS`). The UI must not invent pairs.

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

### Gold Week Complete Badge

Active days in each week bucket are Monday–Saturday (`dayIndex` 0–5). Sunday (Rest / Weekly Reset) stays off the main list and out of the evaluation.

Each week of the viewed month is scored on its own from the in-memory `relic_completions` mirror. A week is complete when every active day in that bucket has `completed=true`. Weeks 1–3 are six days. Week 4 includes every Mon–Sat date from the 22nd through month end, so those extra days must be complete too.

While a week is complete:

- That week’s chip shows a **Gold Week Complete Badge**, including while another week is on screen. The badge `aria-label` is `Gold Week Complete Badge`. An incomplete week hides the badge.
- Gold `#ff8c00` checkboxes with a deep black checkmark apply only to the week currently being viewed, and only when that viewed week is complete. Those checkboxes use `aria-label` `Completed {date_key}, Gold Week Complete Badge`.

Evaluate on each timetable render and whenever a completion tick is upserted. Do not store the badge in `localStorage`. An incomplete viewed week keeps the normal checkbox style. Week chips, the identity line, and week meta name Week 4 as `WEEK 4` with no `DELOAD` suffix.

---

## 7. Cache

`vercel.json` sends `Cache-Control: public, max-age=0, must-revalidate` for every path. `cleanUrls` stays on. Every `<link>` and `<script>` in `index.html` uses `?v=v2_4`. The `relic-build` meta is `v2_4`.

---

## 8. Files

```
index.html              — V2 shell
styles.css              — S24 Ultra timetable + player
app.js                  — calendar, Supabase ticks, HTML5 player
PLATFORM_SPEC.md        — this law
vercel.json             — no-cache headers
data/schedule.js        — NiX month rotations (do not invent pairs)
data/citations.js       — document links
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
5. `vercel.json` no-cache plus `?v=v2_4` on assets.
6. `schedule.js`, `citations.js`, `videoArchive.js`, and `supabaseConfig.js` keep their data.
7. Each week whose Mon–Sat days are all `completed=true` keeps a Gold Week Complete Badge on its chip while any week is on screen. Gold `#ff8c00` checkboxes and black ticks apply only while that complete week is the one being viewed. Week 4 labels read `WEEK 4` with no DELOAD suffix.

---

*Relic Architect V2.0 · NiX coach archive · Europe/London*
