#!/usr/bin/env node
/* v50 reference stripBrands() (albot, read-only). One list, used by scrubText, plainName and every display site.
   Run: node stripBrands.ref.js  -> checks the vectors below. */
var BRANDS = [
  /Sainsbury[\u2019']?s?\b/gi,
  /\bSO Organic\b/gi,
  /\bTaste the Difference\b/gi,
  /\bTtD\b/g,                                  // case-sensitive on purpose
  /Nescaf[eé](\s+Gold(\s+Blend)?)?/gi,
  /\bWaitrose\b/g,                            // rev 7: shop.js store field and names
  /\bDettol\s*/g,                              // rev 7: pack001.js:401 receipt line
  // rev 7 (NiX.1 A5). Case-sensitive on purpose so "gut flora" survives.
  // A product name is replaced by its generic noun, not deleted, so sentences stay whole:
  //   "Cathedral City" before a cheese word (Mini, Mature, Extra, High, cheddar) is removed; otherwise it becomes "cheddar".
  //   "Flora", "Flora Buttery", "Flora Buttery spread/Spread" become "buttery spread".
  [/\bCathedral City\s+(?=(?:Mini|mini|Mature|mature|Extra|extra|High|cheddar|Cheddar)\b)/g, ""],
  [/\bCathedral City\b/g, "cheddar"],
  [/\bFlora\b(?:\s+Buttery)?(?:\s+[Ss]pread)?/g, "buttery spread"]
];
function sub(rep) {
  // capitalise a generic noun that lands at the start of the text or of a sentence
  return function (m, off, all) {
    if (!rep) return rep;
    var before = all.slice(0, off);
    return (/^\s*$/.test(before) || /[.!?]\s+$/.test(before)) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep;
  };
}
function stripBrands(text) {
  var v = String(text || "");
  if (!v) return "";
  // rev 7: no brand, no change. Separators such as " · " and ", " pass through untouched.
  if (!BRANDS.some(function (re) { return v.search(Array.isArray(re) ? re[0] : re) >= 0; })) return v;
  BRANDS.forEach(function (re) { v = Array.isArray(re) ? v.replace(re[0], sub(re[1])) : v.replace(re, ""); });
  return v
    .replace(/\s*·\s*(?=[,.;]|$)/g, "")              // orphan middle dot
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(^|\s)[&\-–—](?=\s*[&\-–—]|\s*$)/g, "$1") // doubled or trailing & / dash
    .replace(/^[\s&,\-–—·]+|[\s&,\-–—·]+$/g, "")      // leading/trailing & , - · 
    .replace(/\s{2,}/g, " ")
    .trim();
}
var VECTORS = [
  ["TtD Beef Burger & Brioche", "Beef Burger & Brioche"],
  ["Sainsbury's Chicken", "Chicken"],
  ["Sainsbury\u2019s chicken thighs", "chicken thighs"],
  ["Coffee · Nescafé Gold, syrup optional", "Coffee, syrup optional"],
  ["Coffee · Nescafé Gold Blend", "Coffee"],
  ["SO Organic milk", "milk"],
  ["Taste the Difference - Salmon", "Salmon"],
  ["Fish & Taste the Difference", "Fish"],
  ["Chicken & Mixed Vegetables", "Chicken & Mixed Vegetables"],
  ["Beef-Stuffed Potato Boats", "Beef-Stuffed Potato Boats"],
  ["Chicken, Rice and Broccoli", "Chicken, Rice and Broccoli"],
  ["2 Brazil nuts", "2 Brazil nuts"],
  // rev 7 (A5): Cathedral City, Flora, Waitrose, Dettol; "gut flora" must survive
  ["Flora Buttery spread", "Buttery spread"],
  ["Flora Buttery Spread", "Buttery spread"],
  ["Cathedral City cheddar", "cheddar"],
  ["Cathedral City Mini Mature Cheddar", "Mini Mature Cheddar"],
  ["Cathedral City mini mature cheddar", "mini mature cheddar"],
  ["Cathedral City minis from the receipt.", "Cheddar minis from the receipt."],
  ["Cathedral City stands in for mozzarella, Flora for butter, and the smoked bulb for roast garlic.", "Cheddar stands in for mozzarella, buttery spread for butter, and the smoked bulb for roast garlic."],
  ["Mash the cloves with Flora Buttery and spread them over a split baguette.", "Mash the cloves with buttery spread and spread them over a split baguette."],
  ["Flora and Cathedral City are already on the receipt.", "Buttery spread and cheddar are already on the receipt."],
  ["the skins, add tomato if it landed, and top with Cathedral City.", "the skins, add tomato if it landed, and top with cheddar."],
  ["Waitrose Tenderstem Broccoli 200g", "Tenderstem Broccoli 200g"],
  ["Dettol Fresh Cherry Bloom Multipurpose", "Fresh Cherry Bloom Multipurpose"],
  ["Kefir supports healthy gut flora.", "Kefir supports healthy gut flora."],
  ["gut flora", "gut flora"],
  ["Spread the paste thinly.", "Spread the paste thinly."],
  [" \u00b7 ", " \u00b7 "],
  [", ", ", "]
];
if (typeof module !== "undefined" && require.main === module) {
  var bad = VECTORS.filter(function (v) { return stripBrands(v[0]) !== v[1]; });
  bad.forEach(function (v) { console.error("FAIL", JSON.stringify(v[0]), "->", JSON.stringify(stripBrands(v[0])), "want", JSON.stringify(v[1])); });
  if (bad.length) process.exit(1);
  console.log("OK stripBrands", VECTORS.length, "vectors");
}
if (typeof module !== "undefined") module.exports = { stripBrands: stripBrands, BRANDS: BRANDS };
