// Nightly D1 export to R2. Daily folders live at backups/YYYY-MM-DD/.
// A restore writes backups/pre-restore-<stamp>/ first, then replaces table rows.
// It does not drop or alter tables.

export const BACKUP_KEEP = 30;
const NAME = /^[A-Za-z0-9_]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function backupKey(date, table) {
  return "backups/" + date + "/" + table + ".json";
}

export function datesToPrune(dates, keep) {
  const limit = keep == null ? BACKUP_KEEP : keep;
  const days = [];
  const seen = {};
  (dates || []).forEach(function (date) {
    if (!DAY.test(date) || seen[date]) return;
    seen[date] = true;
    days.push(date);
  });
  days.sort();
  if (days.length <= limit) return [];
  return days.slice(0, days.length - limit);
}

export async function listObjects(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: prefix, cursor: cursor });
    (page.objects || []).forEach(function (obj) { objects.push(obj); });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

function dayFromKey(key) {
  const match = /^backups\/(\d{4}-\d{2}-\d{2})\//.exec(key || "");
  return match ? match[1] : "";
}

export async function listTableNames(db) {
  const listed = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();
  return (listed.results || []).map(function (row) { return row.name; }).filter(function (name) {
    return NAME.test(name);
  });
}

async function putJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json" }
  });
}

export async function pruneBackups(env, keep) {
  const objects = await listObjects(env.BACKUPS, "backups/");
  const dates = objects.map(function (obj) { return dayFromKey(obj.key); }).filter(Boolean);
  const drop = datesToPrune(dates, keep);
  const doomed = objects.filter(function (obj) { return drop.indexOf(dayFromKey(obj.key)) !== -1; });
  if (doomed.length) await env.BACKUPS.delete(doomed.map(function (obj) { return obj.key; }));
  return drop;
}

export async function exportBackup(env, date) {
  if (!env.BACKUPS) throw new Error("BACKUPS binding is missing");
  if (!DAY.test(date) && date.indexOf("pre-restore-") !== 0) throw new Error("bad backup date");
  const names = await listTableNames(env.DB);
  const tables = {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const listed = await env.DB.prepare("SELECT * FROM " + name).all();
    const rows = listed.results || [];
    tables[name] = rows.length;
    await putJson(env.BACKUPS, backupKey(date, name), rows);
  }
  await putJson(env.BACKUPS, "backups/" + date + "/manifest.json", { date: date, tables: tables });
  const pruned = await pruneBackups(env, BACKUP_KEEP);
  return { date: date, tables: tables, pruned: pruned };
}

export async function listBackups(env) {
  if (!env.BACKUPS) throw new Error("BACKUPS binding is missing");
  const objects = await listObjects(env.BACKUPS, "backups/");
  const byDate = {};
  objects.forEach(function (obj) {
    const match = /^backups\/([^/]+)\//.exec(obj.key || "");
    if (!match) return;
    if (!byDate[match[1]]) byDate[match[1]] = { date: match[1], files: 0 };
    byDate[match[1]].files += 1;
  });
  return Object.keys(byDate).sort().map(function (key) { return byDate[key]; });
}

export async function restoreBackup(env, date) {
  if (!DAY.test(date)) throw new Error("bad backup date");
  if (!env.BACKUPS) throw new Error("BACKUPS binding is missing");
  const manifestObj = await env.BACKUPS.get("backups/" + date + "/manifest.json");
  if (!manifestObj) throw new Error("backup not found");
  const manifest = JSON.parse(await manifestObj.text());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safety = await exportBackup(env, "pre-restore-" + stamp);
  const names = Object.keys(manifest.tables || {});
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!NAME.test(name)) continue;
    const obj = await env.BACKUPS.get(backupKey(date, name));
    if (!obj) continue;
    const rows = JSON.parse(await obj.text());
    await env.DB.prepare("DELETE FROM " + name).run();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || {};
      const cols = Object.keys(row).filter(function (col) { return NAME.test(col); });
      if (!cols.length) continue;
      const sql = "INSERT INTO " + name + " (" + cols.join(", ") + ") VALUES (" + cols.map(function () { return "?"; }).join(", ") + ")";
      await env.DB.prepare(sql).bind(...cols.map(function (col) { return row[col]; })).run();
    }
  }
  return { date: date, restored: names, safety: safety.date };
}
