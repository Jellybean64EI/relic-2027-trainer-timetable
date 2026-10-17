# Food seed backup (845c93a)

These three files are the recipe seeds that used to load in the app:

- `845c93a/meals.js`
- `845c93a/extractions.js`
- `845c93a/pack001.js`

v52 moved them here so the app can no longer re-seed old recipes. Git still has the bytes.

The phone keeps its own copy. The first time v52 runs, it writes `nexus_food_clearout_backup_v52` in localStorage (the old `nexus_food_v1` plan, including any 1–3 Jan test meals) and then replaces that plan with an empty shell. That backup stays in localStorage. The deck does not link to it.

## Restore

1. Open the backup JSON.
2. Copy the string at `keys.nexus_food_v1`.
3. In the browser console on the Nexus site, paste it back:

```js
localStorage.setItem("nexus_food_v1", <that string>);
localStorage.removeItem("nexus_food_clearout_v52");
```

4. Reload. v52 will not clear again until the done flag is removed, so remove the flag only when you want the old plan to stay and you are ready to stop the automatic clear.

The month locks (`nexus_food_lock_food_v1`, `nexus_food_lock_smoothies_v1`, `nexus_food_lock_split_v1`) are not part of this backup and are not cleared.
