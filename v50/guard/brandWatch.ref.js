#!/usr/bin/env node
/* v50 independent brand WATCH-LIST (albot, rev 7; NiX.1 A5). Deliberately NOT the stripBrands list:
   it names UK grocery/food brands broadly so a brand missing from stripBrands is caught.
   Run from a repo root: node brandWatch.ref.js [--after-strip path/to/stripBrands.ref.js]
   Scans every string literal with a space in the five food data files index.html loads (--all-food adds the unloaded pack001/*.json). Without --after-strip it reports raw hits;
   with it, each string is passed through stripBrands first and any remaining hit FAILS. */
var fs = require("fs"), path = require("path");
var WATCH = [
  // retailers and own-label tiers (case-insensitive unless noted)
  [/sainsbury/i, "Sainsbury's"], [/\btesco\b/i, "Tesco"], [/\basda\b/i, "Asda"], [/\bmorrisons\b/i, "Morrisons"],
  [/\bwaitrose\b/i, "Waitrose"], [/\baldi\b/i, "Aldi"], [/\blidl\b/i, "Lidl"], [/\bM&S\b|marks (and|&) spencer/i, "M&S"],
  [/\bocado\b/i, "Ocado"], [/taste the difference/i, "Taste the Difference"], [/\bTtD\b/, "TtD"], [/\bSO Organic\b/i, "SO Organic"],
  [/\bby Sainsbury/i, "by Sainsbury's"], [/\bTesco Finest\b|\bExtra Special\b/, "own-label tier"],
  // dairy and spreads
  [/\bCathedral City\b/, "Cathedral City"], [/\bFlora\b/, "Flora"], [/\bLurpak\b/i, "Lurpak"], [/\bKerrygold\b/i, "Kerrygold"],
  [/\bAnchor\b/, "Anchor"], [/\bPhiladelphia\b/, "Philadelphia"], [/\bM[uü]ller\b/, "Müller"], [/\bYeo Valley\b/i, "Yeo Valley"],
  [/\bAlpro\b/i, "Alpro"], [/\bOatly\b/i, "Oatly"], [/\bArla\b/, "Arla"], [/\bCravendale\b/i, "Cravendale"], [/\bFage\b/, "Fage"],
  [/\bDanone\b/i, "Danone"], [/\bActivia\b/i, "Activia"], [/\bOnken\b/i, "Onken"], [/\bDairylea\b/i, "Dairylea"],
  [/\bBabybel\b/i, "Babybel"], [/\bPilgrims Choice\b/i, "Pilgrims Choice"], [/\bBenecol\b/i, "Benecol"], [/\bBertolli\b/i, "Bertolli"],
  // bakery, cupboard, sauces
  [/\bWarburtons\b/i, "Warburtons"], [/\bHovis\b/i, "Hovis"], [/\bKingsmill\b/i, "Kingsmill"], [/\bHeinz\b/i, "Heinz"],
  [/\bHellmann/i, "Hellmann's"], [/\bBranston\b/i, "Branston"], [/\bColman/i, "Colman's"], [/\bSchwartz\b/i, "Schwartz"],
  [/\bOld El Paso\b/i, "Old El Paso"], [/\bBisto\b/i, "Bisto"], [/\bOxo\b/, "Oxo"], [/\bKnorr\b/i, "Knorr"], [/\bTilda\b/, "Tilda"],
  [/\bUncle Ben|Ben's Original/i, "Ben's"], [/\bDolmio\b/i, "Dolmio"], [/\bLoyd Grossman\b/i, "Loyd Grossman"], [/\bSacla\b/i, "Sacla"],
  [/\bQuaker\b/i, "Quaker"], [/\bKellogg/i, "Kellogg's"], [/\bWeetabix\b/i, "Weetabix"], [/\bNestl[eé]\b/i, "Nestlé"],
  [/\bJordans\b/i, "Jordans"], [/\bNature Valley\b/i, "Nature Valley"], [/\bGraze\b/, "Graze"],
  // drinks
  [/nescaf/i, "Nescafé"], [/\bKenco\b/i, "Kenco"], [/\bTwinings\b/i, "Twinings"], [/\bPG Tips\b/i, "PG Tips"], [/\bTetley\b/i, "Tetley"],
  [/\bInnocent\b/, "Innocent"], [/\bTropicana\b/i, "Tropicana"], [/\bRibena\b/i, "Ribena"], [/\bLucozade\b/i, "Lucozade"],
  [/\bVita Coco\b/i, "Vita Coco"], [/\bHuel\b/i, "Huel"], [/\bMyProtein\b/i, "MyProtein"], [/\bGrenade\b/, "Grenade"],
  // frozen, fish, meat, snacks, household
  [/\bBirds Eye\b/i, "Birds Eye"], [/\bYoung's\b/, "Young's"], [/\bJohn West\b/i, "John West"], [/\bPrinces\b/, "Princes"],
  [/\bMcCain\b/i, "McCain"], [/\bRichmond\b/, "Richmond"], [/\bWalkers\b/, "Walkers"], [/\bCadbury\b/i, "Cadbury"],
  [/\bMcVitie/i, "McVitie's"], [/\bDettol\b/i, "Dettol"], [/\bFairy\b/, "Fairy"], [/\bAndrex\b/i, "Andrex"]
];
function literals(src) {
  // Data files use double quotes only; single quotes are apostrophes in prose and comments.
  var out = [], re = /"((?:[^"\\\n]|\\.)*)"/g, m;
  while ((m = re.exec(src))) { try { out.push(JSON.parse('"' + m[1] + '"')); } catch (e) { out.push(m[1]); } }
  return out;
}
function walk(dir, acc) {
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc); else if (/\.(js|json)$/.test(n)) acc.push(p);
  });
  return acc;
}
if (require.main === module) {
  var i = process.argv.indexOf("--after-strip");
  var strip = i > 0 ? require(path.resolve(process.argv[i + 1])).stripBrands : null;
  var only = process.argv.indexOf("--only") > 0 ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
  // Scope = the food data files index.html actually loads (Training data such as data/cues is never scanned).
  var files = ["data/nutrition/shop.js", "data/backup/845c93a/meals.js", "data/backup/845c93a/extractions.js", "data/nutrition/schedule.js", "data/backup/845c93a/pack001.js"];
  if (process.argv.indexOf("--all-food") > 0) files = walk("data/food", []).concat(walk("data/nutrition", []));
  files = files.filter(function (f) { return !only || only.some(function (o) { return f.indexOf(o) === 0; }); });
  var hits = {};
  files.forEach(function (f) {
    literals(fs.readFileSync(f, "utf8")).forEach(function (s) {
      if (!/\s/.test(s)) return; // ids and keys (no whitespace) are never shown; visible text has spaces
      var t = strip ? strip(s) : s;
      WATCH.forEach(function (w) { if (w[0].test(t)) { (hits[w[1]] = hits[w[1]] || []).push(f + ": " + t.slice(0, 90)); } });
    });
  });
  var names = Object.keys(hits);
  names.forEach(function (n) { console.log(n + " x" + hits[n].length + "   e.g. " + hits[n][0]); });
  if (strip && names.length) { console.error("FAIL brand watch after strip"); process.exit(1); }
  console.log((strip ? "after strip: " : "raw: ") + names.length + " brands, " + files.length + " files");
}
module.exports = { WATCH: WATCH };
