# Restore the video editor and delete controls

v70 hides the trim editor and the delete bin. The code is still in the repo. Playback of saved trims, including the `?v=` cache-bust for cut files, stays on.

## Turn the UI back on

In `data/nexusConfig.js`, set:

```js
window.FEATURES = {
  videoEditor: true
};
```

Reload Nexus. That is the only switch. There is no URL parameter, gesture, or localStorage override. With the flag true, the Edit pill, trim panel, bin, delete confirm, and Shrinking tonight / Synced tags return as they were in v69.

Set it back to `false` to hide them again.

## Git restore point

The v69 editor and delete UI, as merged, is tagged and branched at `1e86bd4489ad7bbff3a98c46ffdd35a14bbda6e9`:

- tag `archive/v69-editor-delete`
- branch `archive/v69-editor-delete`

That commit is the squash of the editor (PR #77) and delete (PR #78) work. To inspect it:

```sh
git checkout archive/v69-editor-delete
```

## Worker routes that are still live

The Worker is nexus-api v69 and was not changed for v70. These routes still exist:

- `GET /video-trims` and `PUT /video-trims`
- `POST /video-trims/mark-synced`
- `DELETE /videos?r2Key=`
- `/video-object` for the cutter (not used by the page)

Writes still need `X-Nexus-Key`.

## Cutter

The nightly cutter is not in this repo. It lives on NiX.v2's box at `/workspace/nexus-food-audit/v69-worker/` (`cut_trims.sh` and `exclude_cabins.txt`).
