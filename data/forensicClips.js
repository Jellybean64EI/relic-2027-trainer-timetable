/* Clip cue ingest. data/cues/cues.js is the full Drive dump (window.RELIC_CUE_DUMP).
   A follow-up can call RELIC_FORENSIC.ingestClips(array) with the same block shape:
   cabinKey, phase, title, driveFileId, metrics, leadRule, doThis, avoidThis, section, number.
   Blocks with no driveFileId stay on the title + cabin fallback. Nothing here is invented. */
(function () {
  var lib = window.RELIC_FORENSIC;
  var dump = window.RELIC_CUE_DUMP;
  if (!lib || typeof lib.ingestClips !== "function" || !dump || !dump.length) return;
  lib.ingestClips(dump);
})();
