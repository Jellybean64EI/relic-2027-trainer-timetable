# RELICS22 — Master Forensic Architecture Audit

**Date:** 2026-09-26 (Europe/London)  
**Cache-bust:** `relics22`  
**Source:** `/workspace/relic-2027-trainer/platform/`  
**Deploy:** `gh-pages` → `https://jellybean64ei.github.io/relic-2027-trainer-timetable/`

## Already compliant (no rewrite)

| Law | Status |
|-----|--------|
| Week buckets 1–7 / 8–14 / 15–21 / 22–end | OK in `schedule.js` `weekOfMonth` |
| Sort week rows by ISO `dateKey` (never weekday name) | OK in `app.js` (relics21) |
| Jan W1 order Fri 1 → Sat 2 → Mon 4 → Tue 5 → Wed 6 → Thu 7 | OK (verified) |
| All 48 weeks chronological | OK (node check, 0 fails) |
| Grid headers DAY / TRAINING RELICS / DONE (no TRAINING PAIR / DOCUMENT 1/2) | OK in `index.html` |
| Grid columns 20% / 70% / 10% | OK (final CSS; reinforced relics22) |
| Cells `#150724` | OK (reinforced relics22) |
| Fullscreen player `100vw × 100vh` | OK |
| Timer 360s set → auto-advance | OK (`SET_DURATION_SEC = 360`) |
| Center play/pause + ‹ › fade 2.5s inactivity | OK (`CONTROLS_FADE_MS = 2500`) |
| Citations `1. {CabinKey}_Trainer_{Phase}` | OK |
| Quarters Base / Hard / Expert / Till_Failure | OK |
| Sunday Law labels Rest / Light Mobility + Weekly Reset (non-Drive spans) | OK in schedule data + `relicLinkHtml` |
| Master video folder `1u7LqzIpUbkoGJyYW6D4S19KFKY8vyUac` | OK in `videoArchive.js` |
| Back + Neck playlists populated | OK |
| `localStorage` key `relic_trainer_2027_v1` | OK |
| LIVE lock + coach `?date=` | OK |
| Gothic theme + LV month badges | OK |
| No `max-width:0` on `.doc-cell` | OK (guard reinforced) |
| Jan W1–W4 + Feb W1–W2 schedule locks | OK (untouched) |

## Gaps closed in relics22

1. **Timer chrome** — forced exact `top: 18px; right: 18px; background: rgba(0,0,0,0.8); color: #ff8c00; monospace` (was `max(16px,…)` / `0.82`).
2. **Touch targets** — week chips (`.wtab`) raised from 40px → **44px**; DONE `.tick-btn` + `.complete-cell .actions` set to **min 44px** (month chips already 44px).
3. **Column / cell harden** — reasserted DAY 20% / RELICS 70% / DONE 10%, `#150724` body cells, and `max-width: none` on `.doc-cell` at end of stylesheet so earlier cascade layers cannot regress.
4. **Cache-bust** — all `index.html` css/js/data tags bumped `relics21` → **`relics22`**.

## Intentionally left unchanged

- Sunday rows remain **hidden** in the UI training list (Fri→Sat→Mon… calendar-true). Sunday Law labels stay correct in schedule data for any Sunday in a bucket; showing Sunday would break the required Jan W1 order (Fri 1 → Sat 2 → Mon 4…).
- Rotation content (Jan W1–W4, Feb W1–W2 locks, NiX provisional months).
- Storage key, LIVE start, coach override, gothic/LV badge system.
- Back/Neck playlist IDs and citation Drive URLs.

## Chrono check

Run: `node` script over `RELIC_SCHEDULE.daysInWeekOfMonth` for all 12×4 weeks — **0 fails**.
