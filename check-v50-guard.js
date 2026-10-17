#!/usr/bin/env node
/* v50 Training guard (albot reference, read-only). Run from the repo root:
     node check-v50-guard.js            -> prints the fingerprint
     node check-v50-guard.js --expect   -> fails unless it equals the v49 baseline below
   Proves Training data, tickable days, future-lock states, the tick/sync functions, the deck/preload,
   the v32 handoff, the v34 hamburger-hide CSS and the player/deck markup are unchanged from v49 (6e530f6).
   Hashes 45 named functions + the canTickDate wrapper. The build label (build: "v49") is not hashed. */
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

const BASELINE = {
  files: "caf43dcec7fa22f1",
  functions: "577a000673a682f3",
  css: "80cb9bde447a3dd5",
  markup: "2f738a54946e0e39",
  tickable: "c5e07605b91020bb",
  locks: "4ea9f1b3779659ae"
};

// 1. Byte-identical Training files.
const FILES = ["data/schedule.js", "data/upperBody.js", "data/precondition.js", "data/videoArchive.js",
  "data/forensic.js", "data/forensicClips.js", "data/cues/cues.js", "data/citations.js", "data/supabaseConfig.js"];
const files = sha(FILES.map((f) => f + ":" + sha(fs.readFileSync(f, "utf8"))).join("\n"));

// 2. Tick, sync, lock and deck functions in app.js, compared by body text.
const app = fs.readFileSync("app.js", "utf8");
function braceBlock(src, start, label) {
  if (start === -1) return label + ":MISSING";
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}
function body(name) {
  const start = app.indexOf("function " + name + "(");
  if (start === -1) return name + ":MISSING";
  let i = app.indexOf("{", start), depth = 0;
  for (; i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}" && --depth === 0) break;
  }
  return app.slice(start, i + 1);
}
const FUNCS = ["londonParts", "parseDateOverride", "isLive", "readFutureLock", "writeFutureLock", "canTick",
  "paintFutureLock", "setFutureLock", "normalizeTier", "absorbCompletionRow", "maskFor", "popcount", "displayTier",
  "pullCompletions", "upsertCompletion", "applyReturnedCompletion", "saveMask", "trainingDaysForMonth",
  "activeDaysForWeek", "scoreDays", "doneHtml", "tierLabel", "warmVisibleLeads", "playNextVideo", "resolveClipSrc",
  "setScheduleMode", "timetableSource", "upperSchedule",
  // v50 NiX.1 fix 1: tick entry points
  "onTick", "noteSetComplete", "completionStorageKey", "getNow",
  // deck and preload
  "nextClipSrc", "preloadNext", "warmCabinLead", "assignVideoSrc", "loadCurrentClip", "clipsForCabin",
  "deckVideos", "deckPark", "frontVideo", "parkedVideos",
  // v32 handoff and player chrome
  "openCabin", "closePlayer", "stripVideoChrome"];
const missing = FUNCS.filter((n) => body(n).endsWith(":MISSING"));
if (missing.length) { console.error("FAIL guard cannot find: " + missing.join(", ")); process.exit(1); }
const wrapper = braceBlock(app, app.indexOf("canTickDate: function"), "canTickDate");
const functions = sha(FUNCS.map((n) => sha(body(n))).join("\n") + "\n" + sha(wrapper));

// 2b. v34 hamburger-hide CSS (styles.css body.player-open .nav-toggle/.nav-drawer/.nav-scrim) and player-open rules.
const css = fs.readFileSync("styles.css", "utf8");
const cssBlocks = [];
const cssRe = /^body\.player-open[^\n]*$/gm;
let cssMatch;
while ((cssMatch = cssRe.exec(css))) cssBlocks.push(braceBlock(css, cssMatch.index, "player-open"));
if (css.indexOf("body.player-open .nav-toggle,") === -1) cssBlocks.push("v34-hide:MISSING");
const cssHash = sha(cssBlocks.join("\n"));

// 2c. Player and deck markup in index.html (#relic-deck-park through the end of #relic-player).
const html = fs.readFileSync("index.html", "utf8");
const mStart = html.indexOf('<div id="relic-deck-park"');
const mEnd = html.indexOf('<script src="data/schedule.js');
const markup = mStart === -1 || mEnd === -1 ? "MARKUP:MISSING" : sha(html.slice(mStart, mEnd).replace(/\?v=v\d+/g, ""));

// 3. Tickable days per mode (the rows Training renders a tick cell for).
const ctxData = { console };
ctxData.window = ctxData;
vm.createContext(ctxData);
["data/schedule.js", "data/precondition.js", "data/upperBody.js"].forEach((f) => vm.runInContext(fs.readFileSync(f, "utf8"), ctxData));
const sources = { full: ctxData.RELIC_SCHEDULE, upper: ctxData.RELIC_UPPER_BODY || ctxData.RELIC_SCHEDULE };
const tickRows = {};
Object.keys(sources).forEach((mode) => {
  const keys = [];
  for (let m = 1; m <= 12; m++) {
    sources[mode].buildMonthDays(2027, m).filter((d) => !d.isRecovery && d.dayIndex < 6)
      .forEach((d) => keys.push(d.dateKey + "@w" + d.weekOfMonth));
  }
  tickRows[mode] = keys.sort();
});
const tickable = sha(JSON.stringify(tickRows));

// 4. Lock states: canTickDate for every 2027 day, lock OFF and ON, at five mocked real dates.
function mockDate(iso) {
  const Real = Date;
  function Mock() {
    if (arguments.length) return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
    return new Real(iso);
  }
  Mock.prototype = Real.prototype; Mock.UTC = Real.UTC; Mock.parse = Real.parse;
  Mock.now = () => new Real(iso).getTime();
  return Mock;
}
function loadApp(iso, lockOn) {
  const memory = lockOn ? { relic_future_lock: "1" } : {};
  const ctx = {
    console, setInterval: () => 0, clearInterval: () => {}, Date: mockDate(iso),
    location: { search: "", href: "http://127.0.0.1/" },
    localStorage: { getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } },
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["data/schedule.js", "data/precondition.js", "data/upperBody.js", "app.js"].forEach((f) => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));
  return ctx.RelicArchitect;
}
const DATES = ["2026-10-17T11:00:00Z", "2027-01-01T11:00:00Z", "2027-03-05T11:00:00Z", "2027-12-31T11:00:00Z", "2028-01-02T11:00:00Z"];
const lockRows = [];
DATES.forEach((iso) => [false, true].forEach((on) => {
  const arch = loadApp(iso, on);
  if (!arch) { lockRows.push(iso + on + ":NOAPP"); return; }
  arch.setFutureLock(on);
  const open = [];
  tickRows.full.concat(tickRows.upper).forEach((k) => { const d = k.slice(0, 10); if (arch.canTickDate(d)) open.push(d); });
  lockRows.push(iso.slice(0, 10) + ":" + (on ? "on" : "off") + ":" + open.length + ":" + sha(open.join(",")) + ":" + arch.futureLock);
}));
const locks = sha(lockRows.join("\n"));

const got = { files, functions, css: cssHash, markup, tickable, locks };
console.log(JSON.stringify({ got, detail: { tickRows: { full: tickRows.full.length, upper: tickRows.upper.length }, lockRows } }, null, 2));
if (process.argv.includes("--expect")) {
  const bad = Object.keys(BASELINE).filter((k) => BASELINE[k] !== got[k]);
  if (bad.length) { console.error("FAIL v50 guard changed: " + bad.join(", ")); process.exit(1); }
  console.log("OK v50 guard: Training, ticks and lock identical to v49");
}
