# NiX ↔ ChatGPT Food OS Technical Contract

**Date:** 2026-09-29  
**Status:** Canonical. This file is the Food OS contract. Future agents follow it and do not reinterpret the architecture.

Live Relic is v20, squash-merged to master as `579f451`, served at <https://relic-2027-trainer-timetable.vercel.app> with hard assets `?v=v20`. This contract locks that behaviour. It does not add a ZIP importer, an AI Gateway route, OCR, or a new Food schema.

## Food OS is not Training OS

Food rooms do not write `relic_completions`, move the player timer, or open the CUE panel.

| Store | Key | Owns |
| --- | --- | --- |
| Shop list | `relic_food_shop_v19` | The Sainsbury’s month draft, lock, and frozen plan |
| Card overlays | `relic_food_cards_v20` | Meal and extraction edits, custom cards, hidden seed ids |
| Week notes | `relic_food_week_v20` | Per-`dateKey` lunch, evening `mealId`, and note |

Defaults stay in `data/nutrition/*`. An overlay wins until that room is reset. Training completions stay on Supabase `relic_completions`.

## Four rooms

`weekly`, `shop`, `meals`, `extractions`.

Each room can export JSON, import JSON, and reset to defaults. Meal and extraction cards can be scanned, edited, saved, and deleted. Shop lines can be edited. A locked shop still accepts a week note. Reset clears that room’s overlay only.

## Import

Import accepts a JSON **object** only.

- A root array is refused: `Import accepts a JSON object, not a list.`
- A ZIP is refused: `Import accepts a JSON object, not a ZIP.`
- There is no ZIP ingest yet.
- Import previews first. Save writes the overlay. Cancel discards the preview.
- A single card object with `name` is saved onto that id.
- Saving the same card id again replaces that overlay record. It does not create a second card.
- A module shaped `{cards:{...}}` replaces that room’s overlay map with the cards in the object.
- Kind `smoothie` is accepted at the door and stored as runtime kind `extraction`.
- Kind `meal` stays `meal`.
- Kind `shop` is a shop list. Kind `weekDay` (also `week` / `weekday`) folds into the weekly notes map.
- A locked shop refuses a shop import: `Unlock this month’s shop before importing a list.`

## Weekly notes

Canonical shape:

```json
{ "notes": { "dateKey": { "lunch": "", "mealId": "", "note": "" } } }
```

`lunch`, `mealId`, and `note` are optional. Empty strings are not written. A `weekDay` object with `dateKey` is stored as one entry in that `notes` map. `evening` and `citations` are kept only when present. Import does not invent a `FOOD_LIVE` citation.

## Card overlay

Slim save shape:

`id`, `name`, `tagline`, `ingredients[{text}]`, `method[{verb,detail}]`, `tip`, `scanImage`.

`CARD_FORWARD` fields are kept when present, instead of being stripped:

`macros`, `tags`, `timetable`, `band`, `lock`, `provenance`, `citations`, `tag`, `script`, `sequence`, `yield`, `prepMin`, `cookLabel`, `protein`, `carb`.

An ingredient object keeps `skuId` and any other extra keys when they are present. A method step keeps extra keys when the verb and detail still match.

Custom cards live in the overlay and remain after refresh until deleted or until that room is reset. Deleting a **seed** card pushes its id into `hiddenMeals` or `hiddenExtractions`. The seed in `data/nutrition` stays. Deleting a **custom** card removes that overlay record. Reset clears the room overlay and the hidden list.

## Timing

A training day is:

- morning `extractionId` (the smoothie / extraction card)
- a lunch string
- an evening `mealId` (a meal card)

There is no dinner smoothie. `mealId` resolves through the meal cards. It is not an extraction id. Smoothies are a morning glass or a lunch refresh.

## Eggs and Brazil

Eggs stay in. Preference order:

1. `eggsPasture` — Taste the Difference free-range
2. `eggsSo` — SO Organic free-range
3. `eggsOmega` — standard free-range

Cook the egg whites. Brazil nuts stay at one a day.

## Future

These are not part of v20 ingest and are not a reason to invent a new Food schema:

- ZIP plus a manifest.
- Shop sort tags `protein`, `veg`, `fruit`, `dairy`, `freezer`, `botanical`, `other` as a contract item beyond the current list. v20 already filters the Sainsbury’s list with those words in the browser. That filter is not a second tag store. Do not add one.
- Vercel AI Gateway routes for `openai/*` and `google/gemini-*`.
- OCR, including label-photo reading.
- Canva export URLs as card hero art.

No API key and no server route belong in this contract.
