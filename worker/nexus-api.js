// Nexus API Worker (nexus-api). Bindings: DB (D1 "nexus"), CARDS (R2 "nexus-cards"),
// VIDEOS (R2 "relic-videos"), BACKUPS (R2 "nexus-backups").
// Vars/secrets: NEXUS_KEY (required for app writes), PUBLIC_R2_URL, PUBLIC_VIDEOS_URL,
// BACKUP_TOKEN (required for GET /backups and POST /restore; never ship this to the site).
// Cron: 0 3 * * * writes backups/YYYY-MM-DD/ and keeps 30 daily folders.
// Restore has no in-app button. From a shell, after `npx wrangler secret put BACKUP_TOKEN`:
//   curl -s -H "X-Backup-Token: $BACKUP_TOKEN" https://nexus-api.joesearle.workers.dev/backups
//   curl -s -X POST -H "X-Backup-Token: $BACKUP_TOKEN" \
//     "https://nexus-api.joesearle.workers.dev/restore?date=YYYY-MM-DD"
// POST /restore copies every table to backups/pre-restore-<stamp>/ first, then
// replaces rows from the chosen day. It does not drop tables.
import { exportBackup, listBackups, restoreBackup } from "./backup.js";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Nexus-Key, X-Idempotency-Key, X-Backup-Token",
  "Access-Control-Max-Age": "86400",
};
const DECKS = ["FOOD", "SMOOTHIE", "PORRIDGE"];
const MEALS = ["breakfast", "lunch", "dinner"];
const MAX_IMAGE = 10 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif", "image/svg+xml": "svg" };
const CARD_FIELDS = ["deck", "name", "front_key", "back_key", "veg", "fruit", "category", "favourite", "equipment"];
const STACK_FIELDS = ["name", "slot1", "slot2", "slot3"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const err = (status, message) => json({ error: message }, status);
const now = () => new Date().toISOString();
const okKey = (k) => typeof k === "string" && k.length > 0 && k.length <= 64 && /^[A-Za-z0-9:_\-.]+$/.test(k);

async function body(req) {
  try { return await req.json(); } catch { return null; }
}

function publicUrl(env, key) {
  return key ? String(env.PUBLIC_R2_URL || "").replace(/\/$/, "") + "/" + key : null;
}

function withUrls(env, card) {
  return { ...card, front_url: publicUrl(env, card.front_key), back_url: publicUrl(env, card.back_key) };
}

function cleanCard(input, partial) {
  const out = {};
  for (const f of CARD_FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (f === "deck") {
      v = String(v).toUpperCase();
      if (!DECKS.includes(v)) throw new Error("deck must be FOOD, SMOOTHIE or PORRIDGE");
    } else if (f === "veg" || f === "fruit") {
      v = Number(v) || 0;
    } else if (f === "favourite") {
      v = v ? 1 : 0;
    } else if (f === "equipment" && v !== null && typeof v !== "string") {
      v = JSON.stringify(v);
    } else if (v !== null) {
      v = String(v);
    }
    out[f] = v;
  }
  if (!partial && !out.deck) throw new Error("deck is required");
  return out;
}

const IDEM = /^[A-Za-z0-9_.:-]{8,80}$/;
let idemReady = false;
async function ensureIdempotency(db) {
  if (idemReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    status INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  idemReady = true;
}
async function beginIdempotent(req, env) {
  const key = req.headers.get("X-Idempotency-Key");
  if (!key || !IDEM.test(key)) return null;
  await ensureIdempotency(env.DB);
  const seen = await env.DB.prepare("SELECT status, body FROM idempotency_keys WHERE key = ?").bind(key).first();
  if (!seen) return { key };
  return {
    replay: new Response(seen.body, {
      status: Number(seen.status),
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "X-Idempotent-Replay": "1" }
    })
  };
}
async function finishIdempotent(env, state, response) {
  if (!state || !state.key || response.status >= 500) return response;
  const text = await response.clone().text();
  await env.DB.prepare("INSERT OR IGNORE INTO idempotency_keys (key, status, body, created_at) VALUES (?, ?, ?, ?)").bind(state.key, response.status, text, now()).run();
  return response;
}
function withIdempotency(fn) {
  return async function (req, env, ...rest) {
    const state = await beginIdempotent(req, env);
    if (state && state.replay) return state.replay;
    return finishIdempotent(env, state, await fn(req, env, ...rest));
  };
}
function backupDenied(req, env) {
  const token = req.headers.get("X-Backup-Token") || "";
  if (!env.BACKUP_TOKEN || token !== env.BACKUP_TOKEN) return err(401, "missing or wrong X-Backup-Token");
  return null;
}

const popcount = (m) => (m & 1) + ((m >> 1) & 1);
const maskOf = (r) => (r.mask === null || r.mask === undefined ? (r.level === 2 ? 3 : r.level) : r.mask);

async function handleTicks(req, env, table, key) {
  const hasMask = table === "ticks"; // v57: only 2027 ticks carry a 2-bit mask (bit0 lower, bit1 upper)
  const cols = hasMask ? "date_key, level, mask, updated_at" : "date_key, level, updated_at";
  const out = (r) => (hasMask ? { ...r, mask: maskOf(r) } : r);
  if (!key) {
    if (req.method !== "GET") return err(405, "method not allowed");
    const { results } = await env.DB.prepare(`SELECT ${cols} FROM ${table} ORDER BY date_key`).all();
    return json(results.map(out));
  }
  if (!okKey(key)) return err(400, "bad date_key");
  if (req.method === "GET") {
    const row = await env.DB.prepare(`SELECT ${cols} FROM ${table} WHERE date_key = ?`).bind(key).first();
    return row ? json(out(row)) : err(404, "not found");
  }
  if (req.method === "PUT") {
    const b = await body(req);
    let level, mask;
    if (hasMask && b && b.mask !== undefined && b.mask !== null) {
      mask = Number(b.mask);
      if (!Number.isInteger(mask) || mask < 0 || mask > 3) return err(400, "mask must be 0, 1, 2 or 3");
      level = popcount(mask);
    } else {
      level = Number(b && b.level);
      if (![0, 1, 2].includes(level)) return err(400, "level must be 0, 1 or 2");
      mask = level === 2 ? 3 : level;
    }
    const ts = now();
    if (hasMask) {
      await env.DB.prepare(
        `INSERT INTO ${table} (date_key, level, mask, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(date_key) DO UPDATE SET level = excluded.level, mask = excluded.mask, updated_at = excluded.updated_at`
      ).bind(key, level, mask, ts).run();
      return json({ date_key: key, level, mask, updated_at: ts });
    }
    await env.DB.prepare(
      `INSERT INTO ${table} (date_key, level, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(date_key) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`
    ).bind(key, level, ts).run();
    return json({ date_key: key, level, updated_at: ts });
  }
  if (req.method === "DELETE") {
    await env.DB.prepare(`DELETE FROM ${table} WHERE date_key = ?`).bind(key).run();
    return json({ deleted: key });
  }
  return err(405, "method not allowed");
}

async function handleCards(req, env, id, url) {
  if (!id) {
    if (req.method === "GET") {
      const deck = (url.searchParams.get("deck") || "").toUpperCase();
      if (deck && !DECKS.includes(deck)) return err(400, "deck must be FOOD, SMOOTHIE or PORRIDGE");
      const stmt = deck
        ? env.DB.prepare("SELECT * FROM cards WHERE deck = ? ORDER BY created_at DESC").bind(deck)
        : env.DB.prepare("SELECT * FROM cards ORDER BY created_at DESC");
      const { results } = await stmt.all();
      return json(results.map((c) => withUrls(env, c)));
    }
    if (req.method === "POST") {
      const b = await body(req);
      if (!b) return err(400, "JSON body required");
      let c;
      try { c = cleanCard(b, false); } catch (e) { return err(400, e.message); }
      const cid = b.id && okKey(String(b.id)) ? String(b.id) : crypto.randomUUID();
      const ts = now();
      const row = { id: cid, deck: c.deck, name: c.name ?? null, front_key: c.front_key ?? null, back_key: c.back_key ?? null,
        veg: c.veg ?? 0, fruit: c.fruit ?? 0, category: c.category ?? null, favourite: c.favourite ?? 0,
        equipment: c.equipment ?? null, created_at: ts, updated_at: ts };
      try {
        await env.DB.prepare(
          "INSERT INTO cards (id, deck, name, front_key, back_key, veg, fruit, category, favourite, equipment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(row.id, row.deck, row.name, row.front_key, row.back_key, row.veg, row.fruit, row.category, row.favourite, row.equipment, row.created_at, row.updated_at).run();
      } catch (e) {
        return err(409, "could not insert card: " + e.message);
      }
      return json(withUrls(env, row), 201);
    }
    return err(405, "method not allowed");
  }
  const existing = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(id).first();
  if (req.method === "GET") return existing ? json(withUrls(env, existing)) : err(404, "not found");
  if (!existing) return err(404, "not found");
  if (req.method === "PUT") {
    const b = await body(req);
    if (!b) return err(400, "JSON body required");
    let c;
    try { c = cleanCard(b, true); } catch (e) { return err(400, e.message); }
    const keys = Object.keys(c);
    const ts = now();
    if (keys.length) {
      await env.DB.prepare(`UPDATE cards SET ${keys.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`)
        .bind(...keys.map((k) => c[k]), ts, id).run();
    }
    // Remove replaced images from R2 (only our cards/ prefix).
    const stale = [];
    for (const k of ["front_key", "back_key"]) {
      if (c[k] !== undefined && existing[k] && existing[k] !== c[k] && existing[k].startsWith("cards/")) stale.push(existing[k]);
    }
    if (stale.length) await env.CARDS.delete(stale);
    const row = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(id).first();
    return json(withUrls(env, row));
  }
  if (req.method === "DELETE") {
    const imgs = [existing.front_key, existing.back_key].filter((k) => k && k.startsWith("cards/"));
    if (imgs.length) await env.CARDS.delete(imgs);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM cards WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE slots SET food_id = NULL WHERE food_id = ?").bind(id),
      env.DB.prepare("UPDATE slots SET porridge_id = NULL WHERE porridge_id = ?").bind(id),
      env.DB.prepare("UPDATE stacks SET slot1 = NULL WHERE slot1 = ?").bind(id),
      env.DB.prepare("UPDATE stacks SET slot2 = NULL WHERE slot2 = ?").bind(id),
      env.DB.prepare("UPDATE stacks SET slot3 = NULL WHERE slot3 = ?").bind(id),
    ]);
    return json({ deleted: id, images_deleted: imgs });
  }
  return err(405, "method not allowed");
}

async function handleUpload(req, env, url) {
  if (req.method !== "POST") return err(405, "method not allowed");
  const ctype = req.headers.get("Content-Type") || "";
  let data, type, name;
  if (ctype.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return err(400, "multipart field 'file' required");
    type = file.type || "";
    name = file.name || "";
    if (file.size > MAX_IMAGE) return err(413, "image larger than 10 MB");
    data = await file.arrayBuffer();
  } else {
    const len = Number(req.headers.get("Content-Length") || 0);
    if (len > MAX_IMAGE) return err(413, "image larger than 10 MB");
    type = ctype.split(";")[0].trim();
    name = url.searchParams.get("name") || "";
    data = await req.arrayBuffer();
  }
  if (!type.startsWith("image/")) return err(415, "image/* only");
  if (data.byteLength > MAX_IMAGE) return err(413, "image larger than 10 MB");
  if (data.byteLength === 0) return err(400, "empty file");
  let ext = EXT[type];
  if (!ext) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
    ext = m ? m[1].toLowerCase() : "img";
  }
  const key = `cards/${crypto.randomUUID()}.${ext}`;
  await env.CARDS.put(key, data, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: name ? { original_name: name.slice(0, 200) } : undefined,
  });
  return json({ key, url: publicUrl(env, key), size: data.byteLength, content_type: type }, 201);
}

async function handleStacks(req, env, id) {
  if (!id) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM stacks ORDER BY updated_at DESC").all();
      return json(results);
    }
    if (req.method === "POST" || req.method === "PUT") {
      const b = (await body(req)) || {};
      return upsertStack(env, b.id && okKey(String(b.id)) ? String(b.id) : crypto.randomUUID(), b);
    }
    return err(405, "method not allowed");
  }
  if (!okKey(id)) return err(400, "bad id");
  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM stacks WHERE id = ?").bind(id).first();
    return row ? json(row) : err(404, "not found");
  }
  if (req.method === "PUT") return upsertStack(env, id, (await body(req)) || {});
  if (req.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM stacks WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE slots SET stack_id = NULL WHERE stack_id = ?").bind(id),
    ]);
    return json({ deleted: id });
  }
  return err(405, "method not allowed");
}

async function upsertStack(env, id, b) {
  const existing = (await env.DB.prepare("SELECT * FROM stacks WHERE id = ?").bind(id).first()) || {};
  const row = { id };
  for (const f of STACK_FIELDS) row[f] = b[f] !== undefined ? (b[f] === null ? null : String(b[f])) : existing[f] ?? null;
  row.updated_at = now();
  await env.DB.prepare(
    `INSERT INTO stacks (id, name, slot1, slot2, slot3, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, slot1=excluded.slot1, slot2=excluded.slot2, slot3=excluded.slot3, updated_at=excluded.updated_at`
  ).bind(row.id, row.name, row.slot1, row.slot2, row.slot3, row.updated_at).run();
  return json(row);
}

async function handleSlots(req, env, dateKey, meal, url) {
  if (!dateKey) {
    if (req.method !== "GET") return err(405, "method not allowed");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let sql = "SELECT * FROM slots";
    const args = [];
    const where = [];
    if (from) { where.push("date_key >= ?"); args.push(from); }
    if (to) { where.push("date_key <= ?"); args.push(to); }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY date_key, CASE meal WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 ELSE 3 END";
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json(results);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return err(400, "date_key must be YYYY-MM-DD");
  if (!MEALS.includes(meal)) return err(400, "meal must be breakfast, lunch or dinner");
  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM slots WHERE date_key = ? AND meal = ?").bind(dateKey, meal).first();
    return row ? json(row) : err(404, "not found");
  }
  if (req.method === "PUT") {
    const b = (await body(req)) || {};
    const existing = (await env.DB.prepare("SELECT * FROM slots WHERE date_key = ? AND meal = ?").bind(dateKey, meal).first()) || {};
    const row = { date_key: dateKey, meal };
    for (const f of ["food_id", "porridge_id", "stack_id"]) row[f] = b[f] !== undefined ? (b[f] === null || b[f] === "" ? null : String(b[f])) : existing[f] ?? null;
    row.updated_at = now();
    await env.DB.prepare(
      `INSERT INTO slots (date_key, meal, food_id, porridge_id, stack_id, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(date_key, meal) DO UPDATE SET food_id=excluded.food_id, porridge_id=excluded.porridge_id, stack_id=excluded.stack_id, updated_at=excluded.updated_at`
    ).bind(row.date_key, row.meal, row.food_id, row.porridge_id, row.stack_id, row.updated_at).run();
    return json(row);
  }
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM slots WHERE date_key = ? AND meal = ?").bind(dateKey, meal).run();
    return json({ deleted: { date_key: dateKey, meal } });
  }
  return err(405, "method not allowed");
}

// v59b + v63: saved training combos (with fav star), weekly groups, + per-day/per-week plan.
const COMBO_ID = /^[a-z0-9-]{1,40}$/;
const PLAN_KEY = /^(upper:)?\d{4}-\d{2}-\d{2}$/;
const SECTIONS = ["pre", "exercise", "post"];
const GROUP_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function comboOut(r) {
  let raw = [];
  try { raw = JSON.parse(r.items || "[]"); } catch (_) { raw = []; }
  const isObj = raw && !Array.isArray(raw) && typeof raw === "object";
  const items = isObj ? (Array.isArray(raw.items) ? raw.items : []) : (Array.isArray(raw) ? raw : []);
  const fav = isObj ? !!raw.fav : false;
  return { id: r.id, name: r.name, fav, items, updated_at: r.updated_at };
}

let groupsTableReady = false;
async function ensureGroupsTable(db) {
  if (groupsTableReady) return;
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS training_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, fav INTEGER NOT NULL DEFAULT 1, days TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  groupsTableReady = true;
}

function cleanSlotId(val) {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (!s) return null;
  if (!COMBO_ID.test(s)) throw new Error("combo_id must match ^[a-z0-9-]{1,40}$");
  return s;
}

function cleanGroupDays(rawDays) {
  const srcObj = rawDays && typeof rawDays === "object" ? rawDays : {};
  const out = {};
  for (let i = 0; i < GROUP_DAYS.length; i++) {
    const k = GROUP_DAYS[i];
    const d = srcObj[k] ?? srcObj[i] ?? {};
    const l1 = Array.isArray(d) ? d[0] : (d && typeof d === "object" ? (d.line1 ?? d[1] ?? d.slot1 ?? null) : null);
    const l2 = Array.isArray(d) ? d[1] : (d && typeof d === "object" ? (d.line2 ?? d[2] ?? d.slot2 ?? null) : null);
    out[k] = { line1: cleanSlotId(l1), line2: cleanSlotId(l2) };
  }
  return out;
}

function groupOut(r) {
  let parsed = {};
  try { parsed = JSON.parse(r.days || "{}"); } catch (_) { parsed = {}; }
  let days;
  try { days = cleanGroupDays(parsed); } catch (_) { days = cleanGroupDays({}); }
  return { id: r.id, name: r.name, fav: !!r.fav, days, updated_at: r.updated_at };
}

async function handleCombos(req, env, id) {
  if (!id) {
    if (req.method !== "GET") return err(405, "method not allowed");
    const { results } = await env.DB.prepare("SELECT id, name, items, updated_at FROM training_combos ORDER BY name, id").all();
    return json({ combos: results.map(comboOut) });
  }
  if (!COMBO_ID.test(id)) return err(400, "id must match ^[a-z0-9-]{1,40}$");
  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT id, name, items, updated_at FROM training_combos WHERE id = ?").bind(id).first();
    return row ? json(comboOut(row)) : err(404, "not found");
  }
  if (req.method === "PUT") {
    const b = await body(req);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "JSON body required");
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (name.length < 1 || name.length > 60) return err(400, "name must be 1-60 characters");
    if (!Array.isArray(b.items) || b.items.length > 80) return err(400, "items must be an array of 0-80 items");
    const clean = [];
    for (const it of b.items) {
      if (!it || typeof it !== "object" || Array.isArray(it)) return err(400, "each item must be an object");
      if (typeof it.r2Key !== "string" || it.r2Key.length < 1 || it.r2Key.length > 200) return err(400, "item.r2Key must be a string of 1-200 characters");
      if (!SECTIONS.includes(it.section)) return err(400, "item.section must be pre, exercise or post");
      clean.push({ r2Key: it.r2Key, section: it.section });
    }
    let fav = false;
    if (typeof b.fav === "boolean") {
      fav = b.fav;
    } else {
      const prev = await env.DB.prepare("SELECT id, name, items, updated_at FROM training_combos WHERE id = ?").bind(id).first();
      if (prev) fav = comboOut(prev).fav;
    }
    const ts = now();
    const stored = JSON.stringify({ fav, items: clean });
    await env.DB.prepare(
      `INSERT INTO training_combos (id, name, items, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, items = excluded.items, updated_at = excluded.updated_at`
    ).bind(id, name, stored, ts).run();
    const combo = { id, name, fav, items: clean, updated_at: ts };
    return json({ ok: true, ...combo, combo });
  }
  if (req.method === "PATCH") {
    const row = await env.DB.prepare("SELECT id, name, items, updated_at FROM training_combos WHERE id = ?").bind(id).first();
    if (!row) return err(404, "not found");
    const existing = comboOut(row);
    const b = (await body(req)) || {};
    const nextFav = typeof b.fav === "boolean" ? b.fav : !existing.fav;
    let nextName = existing.name;
    if (b.name !== undefined) {
      const trimmed = typeof b.name === "string" ? b.name.trim() : "";
      if (trimmed.length < 1 || trimmed.length > 60) return err(400, "name must be 1-60 characters");
      nextName = trimmed;
    }
    const ts = now();
    const stored = nextFav ? JSON.stringify({ fav: true, items: existing.items }) : JSON.stringify({ fav: false, items: existing.items });
    await env.DB.prepare("UPDATE training_combos SET name = ?, items = ?, updated_at = ? WHERE id = ?")
      .bind(nextName, stored, ts, id).run();
    const combo = { id, name: nextName, fav: nextFav, items: existing.items, updated_at: ts };
    return json({ ok: true, ...combo, combo });
  }
  if (req.method === "DELETE") {
    const res = await env.DB.batch([
      env.DB.prepare("DELETE FROM training_combos WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM training_plan WHERE combo_id = ?").bind(id),
    ]);
    return json({ ok: true, deleted: id, plan_rows_deleted: (res[1] && res[1].meta && res[1].meta.changes) || 0 });
  }
  return err(405, "method not allowed");
}

async function handleGroups(req, env, id) {
  await ensureGroupsTable(env.DB);
  if (!id) {
    if (req.method !== "GET") return err(405, "method not allowed");
    const { results } = await env.DB.prepare("SELECT id, name, fav, days, updated_at FROM training_groups ORDER BY updated_at ASC, id ASC").all();
    return json({ ok: true, groups: results.map(groupOut) });
  }
  if (!COMBO_ID.test(id)) return err(400, "id must match ^[a-z0-9-]{1,40}$");
  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT id, name, fav, days, updated_at FROM training_groups WHERE id = ?").bind(id).first();
    if (!row) return err(404, "not found");
    const group = groupOut(row);
    return json({ ok: true, ...group, group });
  }
  if (req.method === "PUT") {
    const b = await body(req);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "JSON body required");
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (name.length < 1 || name.length > 60) return err(400, "name must be 1-60 characters");
    let days;
    try { days = cleanGroupDays(b.days || {}); } catch (e) { return err(400, e.message); }
    const fav = typeof b.fav === "boolean" ? b.fav : true;
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO training_groups (id, name, fav, days, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, fav = excluded.fav, days = excluded.days, updated_at = excluded.updated_at`
    ).bind(id, name, fav ? 1 : 0, JSON.stringify(days), ts).run();
    const group = { id, name, fav, days, updated_at: ts };
    return json({ ok: true, ...group, group });
  }
  if (req.method === "PATCH") {
    const row = await env.DB.prepare("SELECT id, name, fav, days, updated_at FROM training_groups WHERE id = ?").bind(id).first();
    if (!row) return err(404, "not found");
    const existing = groupOut(row);
    const b = (await body(req)) || {};
    const nextFav = typeof b.fav === "boolean" ? b.fav : !existing.fav;
    let nextName = existing.name;
    if (b.name !== undefined) {
      const trimmed = typeof b.name === "string" ? b.name.trim() : "";
      if (trimmed.length < 1 || trimmed.length > 60) return err(400, "name must be 1-60 characters");
      nextName = trimmed;
    }
    let nextDays = existing.days;
    if (b.days !== undefined) {
      try { nextDays = cleanGroupDays(b.days); } catch (e) { return err(400, e.message); }
    }
    const ts = now();
    await env.DB.prepare("UPDATE training_groups SET name = ?, fav = ?, days = ?, updated_at = ? WHERE id = ?")
      .bind(nextName, nextFav ? 1 : 0, JSON.stringify(nextDays), ts, id).run();
    const group = { id, name: nextName, fav: nextFav, days: nextDays, updated_at: ts };
    return json({ ok: true, ...group, group });
  }
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM training_groups WHERE id = ?").bind(id).run();
    return json({ ok: true, id, deleted: id });
  }
  return err(405, "method not allowed");
}

async function handlePlan(req, env, planKey, line) {
  if (planKey === undefined) {
    if (req.method !== "GET") return err(405, "method not allowed");
    const { results } = await env.DB.prepare("SELECT plan_key, line, combo_id, updated_at FROM training_plan ORDER BY plan_key, line").all();
    return json({ plan: results });
  }
  if (!PLAN_KEY.test(planKey)) return err(400, "plan_key must be YYYY-MM-DD or upper:YYYY-MM-DD");
  if (line !== "1" && line !== "2") return err(400, "line must be 1 or 2");
  const ln = Number(line);
  if (req.method === "GET") {
    const row = await env.DB.prepare("SELECT plan_key, line, combo_id, updated_at FROM training_plan WHERE plan_key = ? AND line = ?").bind(planKey, ln).first();
    return row ? json(row) : err(404, "not found");
  }
  if (req.method === "PUT") {
    const b = await body(req);
    const cid = b && typeof b.combo_id === "string" ? b.combo_id : "";
    if (!COMBO_ID.test(cid)) return err(400, "combo_id must match ^[a-z0-9-]{1,40}$");
    const c = await env.DB.prepare("SELECT id FROM training_combos WHERE id = ?").bind(cid).first();
    if (!c) return err(404, "combo not found");
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO training_plan (plan_key, line, combo_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(plan_key, line) DO UPDATE SET combo_id = excluded.combo_id, updated_at = excluded.updated_at`
    ).bind(planKey, ln, cid, ts).run();
    return json({ plan_key: planKey, line: ln, combo_id: cid, updated_at: ts });
  }
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM training_plan WHERE plan_key = ? AND line = ?").bind(planKey, ln).run();
    return json({ deleted: { plan_key: planKey, line: ln } });
  }
  return err(405, "method not allowed");
}

async function handlePlanWeek(req, env) {
  if (req.method !== "PUT" && req.method !== "POST") return err(405, "method not allowed");
  const b = await body(req);
  if (!b || !Array.isArray(b.entries) || b.entries.length < 1 || b.entries.length > 28) {
    return err(400, "entries must be an array of 1-28 items");
  }
  const ts = now();
  const stmts = [];
  for (const e of b.entries) {
    if (!e || typeof e !== "object") return err(400, "each entry must be an object");
    const pk = typeof e.plan_key === "string" ? e.plan_key : "";
    if (!PLAN_KEY.test(pk)) return err(400, "plan_key must be YYYY-MM-DD or upper:YYYY-MM-DD");
    const ln = Number(e.line);
    if (ln !== 1 && ln !== 2) return err(400, "line must be 1 or 2");
    const rawCid = e.combo_id === null || e.combo_id === undefined ? "" : String(e.combo_id).trim();
    if (!rawCid) {
      stmts.push(env.DB.prepare("DELETE FROM training_plan WHERE plan_key = ? AND line = ?").bind(pk, ln));
    } else {
      if (!COMBO_ID.test(rawCid)) return err(400, "combo_id must match ^[a-z0-9-]{1,40}$");
      stmts.push(
        env.DB.prepare(
          `INSERT INTO training_plan (plan_key, line, combo_id, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(plan_key, line) DO UPDATE SET combo_id = excluded.combo_id, updated_at = excluded.updated_at`
        ).bind(pk, ln, rawCid, ts)
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, updated: b.entries.length });
}

// v60: custom exercise video uploads into relic-videos under Custom/ only.
const MAX_VIDEO = 26214400; // 25 MB
const STORAGE_LIMIT_MB = 5120;
const MB = 1024 * 1024;
const AREA_RE = /^[a-z0-9-]{1,30}$/;
const VIDEO_TYPES = ["pre", "exercise", "post"];
const VIDEO_EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v", "video/ogg": "ogv", "video/3gpp": "3gp" };
const CUSTOM_KEY_RE = /^Custom\/[a-z0-9-]{1,30}\/(pre|exercise|post)\/[A-Za-z0-9._-]{1,140}$/;
const STORAGE_TTL = 5 * 60 * 1000;
const COUNT_TTL = 60 * 1000;
let storageCache = null; // { at, videos, cards, custom } bytes
let customCountCache = null; // { at, n }
const mb2 = (bytes) => Math.round((bytes / MB) * 100) / 100;

function videoUrl(env, key) {
  return String(env.PUBLIC_VIDEOS_URL || "").replace(/\/$/, "") + "/" + key.split("/").map(encodeURIComponent).join("/");
}

async function listAll(bucket, prefix, include) {
  const out = [];
  let cursor;
  do {
    const opts = { limit: 1000, cursor };
    if (prefix) opts.prefix = prefix;
    if (include) opts.include = include;
    const r = await bucket.list(opts);
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function storageBytes(env, fresh) {
  if (!fresh && storageCache && Date.now() - storageCache.at < STORAGE_TTL) return storageCache;
  const [vids, cards] = await Promise.all([listAll(env.VIDEOS), listAll(env.CARDS)]);
  let videos = 0, custom = 0, cardsB = 0;
  for (const o of vids) { videos += o.size; if (o.key.startsWith("Custom/")) custom += o.size; }
  for (const o of cards) cardsB += o.size;
  storageCache = { at: Date.now(), videos, cards: cardsB, custom };
  return storageCache;
}

function storageOut(s) {
  return { usedMB: mb2(s.videos + s.cards), limitMB: STORAGE_LIMIT_MB, videosMB: mb2(s.videos), cardsMB: mb2(s.cards), customMB: mb2(s.custom) };
}

async function customCount(env) {
  if (customCountCache && Date.now() - customCountCache.at < COUNT_TTL) return customCountCache.n;
  const n = (await listAll(env.VIDEOS, "Custom/")).length;
  customCountCache = { at: Date.now(), n };
  return n;
}

function splitName(raw) {
  let base = String(raw || "").split(/[\\/]/).pop().trim();
  const m = /^(.*?)\.([A-Za-z0-9]{1,5})$/.exec(base);
  return m && m[1] ? { stem: m[1], ext: m[2].toLowerCase() } : { stem: base, ext: "" };
}

function cleanTitle(stem) {
  let t = stem.replace(/[_\-.+]+/g, " ").replace(/[^\p{L}\p{N} '&()]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  if (!t) t = "Custom video";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function sanitiseStem(stem) {
  const s = stem.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 100);
  return s || "video";
}

async function readCapped(req, cap) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { try { await reader.cancel(); } catch {} return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

async function handleCustomVideo(req, env, url) {
  if (req.method === "PUT" || req.method === "POST") {
    const area = url.searchParams.get("area") || "";
    const type = url.searchParams.get("type") || "";
    const name = url.searchParams.get("name") || "";
    if (!AREA_RE.test(area)) return err(400, "area must match ^[a-z0-9-]{1,30}$");
    if (!VIDEO_TYPES.includes(type)) return err(400, "type must be pre, exercise or post");
    const ctype = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!ctype.startsWith("video/")) return err(415, "Content-Type must be video/* (mp4, quicktime or webm)");
    const len = Number(req.headers.get("Content-Length") || 0);
    if (len > MAX_VIDEO) return err(413, "video larger than 25 MB");
    const data = await readCapped(req, MAX_VIDEO);
    if (data === null) return err(413, "video larger than 25 MB");
    if (data.byteLength === 0) return err(400, "empty file");
    const s = await storageBytes(env, false);
    if (s.videos + s.cards + data.byteLength >= STORAGE_LIMIT_MB * MB) {
      const f = await storageBytes(env, true);
      if (f.videos + f.cards + data.byteLength >= STORAGE_LIMIT_MB * MB) return err(507, "storage limit of 5 GB would be exceeded");
    }
    const rawTitle = (url.searchParams.get("title") || "").trim();
    const { stem, ext: nameExt } = splitName(name);
    const ext = VIDEO_EXT[ctype] || nameExt || "mp4";
    const title = rawTitle ? cleanTitle(rawTitle) : cleanTitle(stem);
    const key = `Custom/${area}/${type}/${Date.now()}-${sanitiseStem(stem)}.${ext}`;
    await env.VIDEOS.put(key, data, {
      httpMetadata: { contentType: ctype, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { area, type, title, original_name: String(name).slice(0, 200) },
    });
    if (storageCache) { storageCache.videos += data.byteLength; storageCache.custom += data.byteLength; }
    customCountCache = null;
    let videoId = null;
    try {
      const ident = await allocateIdentity(env, key, title, area, type);
      videoId = ident.videoId || null;
    } catch (e) { videoId = null; }
    return json({ ok: true, r2Key: key, url: videoUrl(env, key), sizeMB: mb2(data.byteLength), title, videoId }, 201);
  }
  if (req.method === "PATCH") {
    // v61: rename (customMetadata.title) by rewriting the same object; key unchanged.
    const key = url.searchParams.get("key") || "";
    if (!key.startsWith("Custom/")) return err(403, "only keys under Custom/ can be changed");
    if (!CUSTOM_KEY_RE.test(key) || key.includes("..")) return err(400, "bad Custom/ key");
    const b = await body(req);
    const title = b && typeof b.title === "string" ? b.title.trim() : "";
    if (title.length < 1 || title.length > 80) return err(400, "title must be 1-80 characters");
    const obj = await env.VIDEOS.get(key);
    if (!obj) return err(404, "not found");
    const data = await obj.arrayBuffer();
    await env.VIDEOS.put(key, data, {
      httpMetadata: obj.httpMetadata,
      customMetadata: { ...(obj.customMetadata || {}), title },
    });
    customCountCache = null;
    storageCache = null;
    await touchIdentity(env, key, { title });
    return json({ ok: true, r2Key: key, title });
  }
  if (req.method === "DELETE") {
    const key = url.searchParams.get("key") || "";
    if (!key.startsWith("Custom/")) return err(403, "only keys under Custom/ can be deleted");
    if (!CUSTOM_KEY_RE.test(key) || key.includes("..")) return err(400, "bad Custom/ key");
    const head = await env.VIDEOS.head(key);
    if (!head) return err(404, "not found");
    await env.VIDEOS.delete(key);
    storageCache = null;
    customCountCache = null;
    await retireIdentity(env, key);
    return json({ ok: true, deleted: key });
  }
  return err(405, "method not allowed");
}

async function handleCustomList(req, env) {
  if (req.method !== "GET") return err(405, "method not allowed");
  const objs = await listAll(env.VIDEOS, "Custom/", ["customMetadata"]);
  const videos = objs.map((o) => {
    const m = o.customMetadata || {};
    const p = o.key.split("/");
    const file = p.slice(3).join("/").replace(/^\d+-/, "");
    return { r2Key: o.key, url: videoUrl(env, o.key), area: m.area || p[1] || null, type: m.type || p[2] || null,
      title: m.title || cleanTitle(splitName(file).stem), sizeMB: mb2(o.size), uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null };
  }).sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)));
  customCountCache = { at: Date.now(), n: videos.length };
  return json({ videos });
}

// v64: per-video cabin/module placement overrides (metadata only; R2 untouched).
const PLACE_CABINS = ["face","eyes","tongue","jaw","neck","shoulders","upper-arms","forearms","chest","upper-back","lower-back","abs","obliques","pelvic","kegel","hip-flexors","glutes","quads","hamstrings","calves","feet"];
const PLACE_SPECIALS = { "sp-posture-mobility": "posture-mobility", "sp-calisthenics": "calisthenics", "sp-resistance-bands": "resistance-bands", "sp-hanging": "hanging", "sp-target-weights": "target-weights" };
const PLACE_SEEDS = [
  ["Custom/back/pre/1792796779275-1000262848.mp4", "pelvic", ["pre"]],
  ["Custom/equipment/exercise/1793287389522-Low-Bar-Supported-Hang.mp4", "sp-hanging", ["exercise"]],
  ["Custom/equipment/exercise/1793287138267-Low-Bar-Supported-Hang.mp4", "sp-hanging", ["exercise"]],
];
let placementsReady = false;
async function ensurePlacementsTable(db) {
  if (placementsReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS video_placements (r2_key TEXT PRIMARY KEY, cabin TEXT NOT NULL, modules TEXT NOT NULL, special INTEGER NOT NULL DEFAULT 0, special_type TEXT, source TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  const ts = now();
  await db.batch(PLACE_SEEDS.map(([k, c, m]) => db.prepare(
    "INSERT INTO video_placements (r2_key, cabin, modules, special, special_type, source, updated_at) VALUES (?, ?, ?, ?, ?, 'seed-v64', ?) ON CONFLICT(r2_key) DO NOTHING"
  ).bind(k, c, JSON.stringify(m), PLACE_SPECIALS[c] ? 1 : 0, PLACE_SPECIALS[c] || null, ts)));
  placementsReady = true;
}
function placementOut(r) {
  let modules = [];
  try { modules = JSON.parse(r.modules || "[]"); } catch (_) { modules = []; }
  return { r2Key: r.r2_key, cabin: r.cabin, modules, special: !!r.special, specialType: r.special_type || null, source: r.source, updated_at: r.updated_at };
}
async function handlePlacements(req, env, url) {
  await ensurePlacementsTable(env.DB);
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM video_placements ORDER BY r2_key").all();
    return json({ ok: true, placements: results.map(placementOut) });
  }
  if (req.method === "PUT" || req.method === "POST") {
    const b = await body(req);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "JSON body required");
    const key = typeof b.r2Key === "string" ? b.r2Key : "";
    if (key.length < 1 || key.length > 200 || key.includes("..")) return err(400, "r2Key must be a string of 1-200 characters");
    const cabin = typeof b.cabin === "string" ? b.cabin : "";
    if (!PLACE_CABINS.includes(cabin) && !PLACE_SPECIALS[cabin]) return err(400, "unknown cabin");
    const mods = Array.isArray(b.modules) ? [...new Set(b.modules)] : [];
    if (!mods.length || mods.some((m) => !SECTIONS.includes(m))) return err(400, "modules must be a non-empty subset of pre, exercise, post");
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO video_placements (r2_key, cabin, modules, special, special_type, source, updated_at) VALUES (?, ?, ?, ?, ?, 'joe', ?)
       ON CONFLICT(r2_key) DO UPDATE SET cabin = excluded.cabin, modules = excluded.modules, special = excluded.special, special_type = excluded.special_type, source = 'joe', updated_at = excluded.updated_at`
    ).bind(key, cabin, JSON.stringify(mods), PLACE_SPECIALS[cabin] ? 1 : 0, PLACE_SPECIALS[cabin] || null, ts).run();
    const row = await env.DB.prepare("SELECT * FROM video_placements WHERE r2_key = ?").bind(key).first();
    const placement = placementOut(row);
    try { await touchIdentity(env, key, { cabin, module: mods[0] }); } catch (e) {}
    return json({ ok: true, ...placement, placement });
  }
  if (req.method === "DELETE") {
    const key = url.searchParams.get("key") || "";
    if (!key) return err(400, "key required");
    const res = await env.DB.prepare("DELETE FROM video_placements WHERE r2_key = ?").bind(key).run();
    return json({ ok: true, deleted: key, changes: (res.meta && res.meta.changes) || 0 });
  }
  return err(405, "method not allowed");
}

// v67: per-video trim points. end null = play to the end.
// v69: trim sync status (pending -> cut by nightly cutter -> row removed + logged in video_sync_log).
let trimsReady = false;
const TRIM_EXTRA_COLS = [["status", "TEXT DEFAULT 'pending'"], ["orig_bytes", "INTEGER"], ["new_bytes", "INTEGER"], ["cut_at", "TEXT"]];
async function ensureTrimsTable(db) {
  if (trimsReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS video_trims (r2_key TEXT PRIMARY KEY, start_sec REAL NOT NULL DEFAULT 0, end_sec REAL, source TEXT, updated_at TEXT)").run();
  const { results } = await db.prepare("PRAGMA table_info(video_trims)").all();
  const have = new Set(results.map((c) => c.name));
  for (const [c, def] of TRIM_EXTRA_COLS) {
    if (!have.has(c)) { try { await db.prepare(`ALTER TABLE video_trims ADD COLUMN ${c} ${def}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; } }
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS video_sync_log (id INTEGER PRIMARY KEY AUTOINCREMENT, r2_key TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('cut','delete')), orig_bytes INTEGER, new_bytes INTEGER, at TEXT NOT NULL)").run();
  trimsReady = true;
}
const round2 = (n) => Math.round(n * 100) / 100;
function trimOut(r) {
  return { r2Key: r.r2_key, start: r.start_sec, end: r.end_sec === null || r.end_sec === undefined ? null : r.end_sec, updatedAt: r.updated_at || null,
    status: r.status || "pending", origBytes: r.orig_bytes ?? null, newBytes: r.new_bytes ?? null, cutAt: r.cut_at || null };
}
const SYNC_DAYS = 7;
async function handleTrims(req, env, url, sub) {
  await ensureTrimsTable(env.DB);
  if (sub === "mark-synced") {
    if (req.method !== "POST" && req.method !== "PUT") return err(405, "method not allowed");
    const b = await body(req);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "JSON body required");
    const key = typeof b.r2Key === "string" ? b.r2Key.trim() : "";
    if (key.length < 1 || key.length > 300 || key.includes("..")) return err(400, "r2Key must be a string of 1-300 characters");
    const nb = b.newBytes === undefined || b.newBytes === null ? null : Number(b.newBytes);
    const ob = b.origBytes === undefined || b.origBytes === null ? null : Number(b.origBytes);
    if ((nb !== null && !(Number.isInteger(nb) && nb >= 0)) || (ob !== null && !(Number.isInteger(ob) && ob >= 0))) return err(400, "newBytes/origBytes must be non-negative integers");
    const row = await env.DB.prepare("SELECT * FROM video_trims WHERE r2_key = ?").bind(key).first();
    // Guard: if the trim was edited after the cutter read it, do not wipe the newer edit.
    if (row && typeof b.trimUpdatedAt === "string" && row.updated_at && row.updated_at !== b.trimUpdatedAt) {
      return err(409, "trim changed since it was read (updatedAt mismatch); not marking synced");
    }
    const ts = now();
    const res = await env.DB.batch([
      env.DB.prepare("DELETE FROM video_trims WHERE r2_key = ?").bind(key),
      env.DB.prepare("INSERT INTO video_sync_log (r2_key, action, orig_bytes, new_bytes, at) VALUES (?, 'cut', ?, ?, ?)").bind(key, ob, nb, ts),
    ]);
    storageCache = null;
    return json({ ok: true, r2Key: key, status: "synced", trimRemoved: ((res[0] && res[0].meta && res[0].meta.changes) || 0) > 0, origBytes: ob, newBytes: nb, cutAt: ts });
  }
  if (sub) return err(404, "unknown route");
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM video_trims ORDER BY r2_key").all();
    const since = new Date(Date.now() - SYNC_DAYS * 86400000).toISOString();
    const cutRows = (await env.DB.prepare("SELECT r2_key, MAX(at) AS at FROM video_sync_log WHERE action = 'cut' GROUP BY r2_key ORDER BY r2_key").all()).results;
    const cuts = {};
    for (const r of cutRows) cuts[r.r2_key] = r.at;
    const synced = cutRows.filter((r) => r.at >= since && !results.some((t) => t.r2_key === r.r2_key)).map((r) => r.r2_key);
    return json({ ok: true, trims: results.map(trimOut), synced, cuts });
  }
  if (req.method === "PUT" || req.method === "POST") {
    const b = await body(req);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "JSON body required");
    const key = typeof b.r2Key === "string" ? b.r2Key.trim() : "";
    if (key.length < 1 || key.length > 200 || key.includes("..")) return err(400, "r2Key must be a string of 1-200 characters");
    if (typeof b.start !== "number" || !Number.isFinite(b.start)) return err(400, "start must be a number >= 0");
    const start = round2(b.start);
    if (start < 0) return err(400, "start must be a number >= 0");
    let end = null;
    if (b.end !== null && b.end !== undefined) {
      if (typeof b.end !== "number" || !Number.isFinite(b.end)) return err(400, "end must be null or a number");
      end = round2(b.end);
      if (!(end > start + 0.3)) return err(400, "end must be null or greater than start + 0.3");
    }
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO video_trims (r2_key, start_sec, end_sec, source, updated_at, status, orig_bytes, new_bytes, cut_at) VALUES (?, ?, ?, 'joe', ?, 'pending', NULL, NULL, NULL)
       ON CONFLICT(r2_key) DO UPDATE SET start_sec = excluded.start_sec, end_sec = excluded.end_sec, source = 'joe', updated_at = excluded.updated_at,
         status = 'pending', orig_bytes = NULL, new_bytes = NULL, cut_at = NULL`
    ).bind(key, start, end, ts).run();
    const row = await env.DB.prepare("SELECT * FROM video_trims WHERE r2_key = ?").bind(key).first();
    return json({ ok: true, trim: trimOut(row) });
  }
  if (req.method === "DELETE") {
    const key = url.searchParams.get("r2Key") || url.searchParams.get("key") || "";
    if (!key) return err(400, "r2Key required");
    const res = await env.DB.prepare("DELETE FROM video_trims WHERE r2_key = ?").bind(key).run();
    return json({ ok: true, deleted: key, changes: (res.meta && res.meta.changes) || 0 });
  }
  return err(405, "method not allowed");
}

async function handleSyncLog(req, env) {
  if (req.method !== "GET") return err(405, "method not allowed");
  await ensureTrimsTable(env.DB);
  const { results } = await env.DB.prepare("SELECT id, r2_key, action, orig_bytes, new_bytes, at FROM video_sync_log ORDER BY id DESC LIMIT 200").all();
  return json({ ok: true, log: results.map((r) => ({ id: r.id, r2Key: r.r2_key, action: r.action, origBytes: r.orig_bytes ?? null, newBytes: r.new_bytes ?? null, at: r.at })) });
}

// v69: permanent video delete (R2 object + every D1 reference). No trash.
const okVideoKey = (k) => typeof k === "string" && k.length >= 1 && k.length <= 300 && !k.includes("..") && !k.startsWith("/");
function stripVideoFromCombo(raw, key, url) {
  // Returns { changed, removed, stored, empty } preserving the stored shape ({fav, items} object or legacy array).
  let parsed;
  try { parsed = JSON.parse(raw || "[]"); } catch (_) { return { changed: false, removed: 0 }; }
  const isObj = parsed && !Array.isArray(parsed) && typeof parsed === "object";
  const items = isObj ? (Array.isArray(parsed.items) ? parsed.items : null) : (Array.isArray(parsed) ? parsed : null);
  if (!items) return { changed: false, removed: 0 };
  const hit = (it) => it && typeof it === "object" && (it.r2Key === key || (url && (it.url === url || it.src === url)));
  const kept = items.filter((it) => !hit(it));
  const removed = items.length - kept.length;
  if (!removed) return { changed: false, removed: 0 };
  const stored = JSON.stringify(isObj ? { ...parsed, items: kept } : kept);
  return { changed: true, removed, stored, empty: kept.length === 0 };
}
async function handleVideos(req, env, url) {
  if (req.method !== "DELETE") return err(405, "method not allowed");
  const key = url.searchParams.get("r2Key") || url.searchParams.get("key") || "";
  if (!okVideoKey(key)) return err(400, "r2Key query param required (1-300 chars, no '..')");
  await ensureTrimsTable(env.DB);
  await ensurePlacementsTable(env.DB);
  const head = await env.VIDEOS.head(key);
  const freedBytes = head ? head.size : 0;
  const vurl = videoUrl(env, key);
  const stmts = [
    env.DB.prepare("DELETE FROM video_trims WHERE r2_key = ?").bind(key),
    env.DB.prepare("DELETE FROM video_placements WHERE r2_key = ?").bind(key),
  ];
  const { results: combos } = await env.DB.prepare("SELECT id, items FROM training_combos").all();
  const ts = now();
  let comboRows = 0, comboItems = 0;
  const emptiedCombos = [];
  for (const c of combos) {
    const s = stripVideoFromCombo(c.items, key, vurl);
    if (!s.changed) continue;
    comboRows++; comboItems += s.removed;
    if (s.empty) emptiedCombos.push(c.id);
    stmts.push(env.DB.prepare("UPDATE training_combos SET items = ?, updated_at = ? WHERE id = ?").bind(s.stored, ts, c.id));
  }
  if (head) stmts.push(env.DB.prepare("INSERT INTO video_sync_log (r2_key, action, orig_bytes, new_bytes, at) VALUES (?, 'delete', ?, 0, ?)").bind(key, freedBytes, ts));
  const res = await env.DB.batch(stmts);
  const ch = (i) => (res[i] && res[i].meta && res[i].meta.changes) || 0;
  if (head) await env.VIDEOS.delete(key);
  try { await retireIdentity(env, key); } catch (e) {}
  storageCache = null;
  customCountCache = null;
  const cleaned = { video_trims: ch(0), video_placements: ch(1), training_combos: comboRows };
  const out = { ok: true, r2Key: key, deleted: !!head, freedBytes, cleaned, comboItemsRemoved: comboItems, emptiedCombos };
  if (!head) return json({ ...out, notFound: true, error: "not found (already gone); references cleaned" }, 404);
  return json(out);
}

// v69: key-protected raw object access for the nightly trim cutter (download, overwrite, backup copy, purge).
const ADMIN_PREFIXES = ["_backup/", "_test/"];
const MAX_OBJECT = 95 * MB;
function needKey(req, env) {
  return !env.NEXUS_KEY || req.headers.get("X-Nexus-Key") !== env.NEXUS_KEY;
}
function objMeta(o) {
  return { r2Key: o.key, size: o.size, etag: o.etag, uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
    contentType: (o.httpMetadata && o.httpMetadata.contentType) || null, customMetadata: o.customMetadata || {} };
}
async function handleVideoObject(req, env, url, sub) {
  if (needKey(req, env)) return err(401, "missing or wrong X-Nexus-Key");
  if (sub === "copy") {
    if (req.method !== "POST") return err(405, "method not allowed");
    const b = await body(req);
    const from = b && typeof b.from === "string" ? b.from : "";
    const to = b && typeof b.to === "string" ? b.to : "";
    if (!okVideoKey(from) || !okVideoKey(to)) return err(400, "from/to required");
    if (!to.startsWith("_backup/")) return err(403, "copy target must be under _backup/");
    const obj = await env.VIDEOS.get(from);
    if (!obj) return err(404, "source not found");
    if (obj.size > MAX_OBJECT) return err(413, "object too large to copy in Worker");
    const data = await obj.arrayBuffer();
    const put = await env.VIDEOS.put(to, data, { httpMetadata: obj.httpMetadata, customMetadata: { ...(obj.customMetadata || {}), backup_of: from } });
    storageCache = null;
    return json({ ok: true, from, to, size: put.size }, 201);
  }
  if (sub) return err(404, "unknown route");
  const key = url.searchParams.get("r2Key") || "";
  if (req.method === "GET" && !key) {
    const prefix = url.searchParams.get("prefix") || "";
    if (!ADMIN_PREFIXES.some((p) => prefix.startsWith(p))) return err(403, "prefix must start with _backup/ or _test/");
    const objs = await listAll(env.VIDEOS, prefix, ["httpMetadata", "customMetadata"]);
    return json({ ok: true, objects: objs.map(objMeta) });
  }
  if (!okVideoKey(key)) return err(400, "r2Key required");
  if (req.method === "GET" || req.method === "HEAD") {
    if (url.searchParams.get("meta") === "1" || req.method === "HEAD") {
      const h = await env.VIDEOS.head(key);
      if (!h) return err(404, "not found");
      return json({ ok: true, ...objMeta(h) });
    }
    const obj = await env.VIDEOS.get(key);
    if (!obj) return err(404, "not found");
    const headers = new Headers(CORS);
    headers.set("Content-Type", (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream");
    headers.set("Content-Length", String(obj.size));
    headers.set("ETag", obj.httpEtag);
    headers.set("Cache-Control", "no-store");
    return new Response(obj.body, { headers });
  }
  if (req.method === "PUT") {
    const ctype = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const len = Number(req.headers.get("Content-Length") || 0);
    if (len > MAX_OBJECT) return err(413, "object larger than 95 MB");
    const data = await readCapped(req, MAX_OBJECT);
    if (data === null) return err(413, "object larger than 95 MB");
    if (data.byteLength === 0) return err(400, "empty body");
    let extra = {};
    const mh = req.headers.get("X-Nexus-Meta");
    if (mh) { try { const p = JSON.parse(mh); if (p && typeof p === "object" && !Array.isArray(p)) for (const [k, v] of Object.entries(p)) extra[String(k).slice(0, 40)] = String(v).slice(0, 300); } catch (_) { return err(400, "X-Nexus-Meta must be a JSON object"); } }
    const prev = await env.VIDEOS.head(key);
    // Preserve existing customMetadata (e.g. Custom/ titles); shorter cache so overwritten files refresh.
    const put = await env.VIDEOS.put(key, data, {
      httpMetadata: { contentType: ctype, cacheControl: "public, max-age=3600" },
      customMetadata: { ...((prev && prev.customMetadata) || {}), ...extra },
    });
    storageCache = null;
    return json({ ok: true, r2Key: key, size: put.size, replaced: !!prev, prevSize: prev ? prev.size : null }, prev ? 200 : 201);
  }
  if (req.method === "DELETE") {
    if (!ADMIN_PREFIXES.some((p) => key.startsWith(p))) return err(403, "only _backup/ or _test/ keys can be deleted here; use DELETE /videos");
    const h = await env.VIDEOS.head(key);
    if (!h) return json({ ok: true, deleted: false, r2Key: key, notFound: true }, 404);
    await env.VIDEOS.delete(key);
    storageCache = null;
    return json({ ok: true, deleted: true, r2Key: key, freedBytes: h.size });
  }
  return err(405, "method not allowed");
}


// v76: persistent numeric video identity. IDs are never reused, including reserved and deleted rows.
let identityReady = false;
async function ensureIdentityTable(db) {
  if (identityReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS video_identity (
    video_id INTEGER PRIMARY KEY,
    r2_key TEXT UNIQUE,
    title TEXT,
    cabin TEXT,
    module TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT NOT NULL
  )`).run();
  identityReady = true;
}
function identityOut(r) {
  if (!r) return null;
  return { videoId: r.video_id, r2Key: r.r2_key || null, title: r.title || "", cabin: r.cabin || "", module: r.module || "", status: r.status, updatedAt: r.updated_at };
}
async function allocateIdentity(env, r2Key, title, cabin, module) {
  await ensureIdentityTable(env.DB);
  if (!r2Key || r2Key.includes("..") || r2Key.length > 300) return { error: "bad r2Key", status: 400 };
  const existing = await env.DB.prepare("SELECT video_id, status FROM video_identity WHERE r2_key = ?").bind(r2Key).first();
  if (existing) {
    if (existing.status === "deleted") return { error: "identity was deleted and cannot be reused", status: 409, videoId: existing.video_id };
    await env.DB.prepare("UPDATE video_identity SET title = COALESCE(?, title), cabin = COALESCE(?, cabin), module = COALESCE(?, module), updated_at = ? WHERE video_id = ?").bind(title || null, cabin || null, module || null, now(), existing.video_id).run();
    const row = await env.DB.prepare("SELECT * FROM video_identity WHERE video_id = ?").bind(existing.video_id).first();
    return { ...identityOut(row), reused: true };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(video_id), 10000) AS n FROM video_identity").first();
    const next = Number(maxRow && maxRow.n) + 1;
    try {
      await env.DB.prepare("INSERT INTO video_identity (video_id, r2_key, title, cabin, module, status, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?)").bind(next, r2Key, title || "", cabin || "", module || "", now()).run();
      const row = await env.DB.prepare("SELECT * FROM video_identity WHERE video_id = ?").bind(next).first();
      return { ...identityOut(row), reused: false };
    } catch (e) {
      const again = await env.DB.prepare("SELECT * FROM video_identity WHERE r2_key = ?").bind(r2Key).first();
      if (again && again.status !== "deleted") return { ...identityOut(again), reused: true };
    }
  }
  return { error: "could not allocate a video id", status: 503 };
}
async function touchIdentity(env, r2Key, fields) {
  await ensureIdentityTable(env.DB);
  if (!r2Key) return;
  const sets = [];
  const vals = [];
  ["title", "cabin", "module"].forEach((name) => {
    if (fields[name] != null && fields[name] !== "") { sets.push(name + " = ?"); vals.push(fields[name]); }
  });
  if (!sets.length) return;
  sets.push("updated_at = ?");
  vals.push(now(), r2Key);
  await env.DB.prepare("UPDATE video_identity SET " + sets.join(", ") + " WHERE r2_key = ? AND status != 'deleted'").bind(...vals).run();
}
async function retireIdentity(env, r2Key) {
  await ensureIdentityTable(env.DB);
  if (!r2Key) return;
  await env.DB.prepare("UPDATE video_identity SET status = 'deleted', updated_at = ? WHERE r2_key = ? AND status = 'active'").bind(now(), r2Key).run();
}
async function importIdentities(env, items) {
  await ensureIdentityTable(env.DB);
  const conflicts = [];
  let inserted = 0, unchanged = 0;
  for (const item of items) {
    const videoId = Number(item && item.videoId);
    const r2Key = item && item.r2Key ? String(item.r2Key) : null;
    const status = item && item.status === "reserved" ? "reserved" : item && item.status === "deleted" ? "deleted" : "active";
    if (!Number.isInteger(videoId) || videoId < 10001) { conflicts.push({ videoId, error: "bad id" }); continue; }
    const byId = await env.DB.prepare("SELECT r2_key, status FROM video_identity WHERE video_id = ?").bind(videoId).first();
    if (byId) {
      if ((byId.r2_key || null) !== r2Key) conflicts.push({ videoId, have: byId.r2_key, want: r2Key });
      else unchanged++;
      continue;
    }
    if (r2Key) {
      const byKey = await env.DB.prepare("SELECT video_id FROM video_identity WHERE r2_key = ?").bind(r2Key).first();
      if (byKey && byKey.video_id !== videoId) { conflicts.push({ r2Key, have: byKey.video_id, want: videoId }); continue; }
    }
    await env.DB.prepare("INSERT INTO video_identity (video_id, r2_key, title, cabin, module, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(videoId, r2Key, (item.title || "").slice(0, 200), item.cabin || "", item.module || "", status, now()).run();
    inserted++;
  }
  return { inserted, unchanged, conflicts };
}
async function handleVideoIds(req, env, action) {
  await ensureIdentityTable(env.DB);
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM video_identity ORDER BY video_id").all();
    return json({ ok: true, identities: (results || []).map(identityOut) });
  }
  if (req.method === "POST" && action === "allocate") {
    const b = await body(req);
    const out = await allocateIdentity(env, b && b.r2Key, b && b.title, b && b.cabin, b && b.module);
    if (out.error) return err(out.status || 400, out.error);
    return json({ ok: true, ...out });
  }
  if (req.method === "POST" && action === "import") {
    const b = await body(req);
    const items = b && Array.isArray(b.items) ? b.items : [];
    if (!items.length || items.length > 80) return err(400, "items must be 1-80 identity rows");
    const out = await importIdentities(env, items);
    return json({ ok: out.conflicts.length === 0, ...out });
  }
  return err(405, "method not allowed");
}

// v77: Joe-entered cue notes. Writes use the same X-Nexus-Key gate as every other write.
let cuesReady = false;
async function ensureCueTable(db) {
  if (cuesReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS video_cues (
    video_id INTEGER PRIMARY KEY,
    r2_key TEXT NOT NULL,
    body TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'manual',
    updated_at TEXT NOT NULL
  )`).run();
  cuesReady = true;
}
function clipText(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanCue(input) {
  const src = input && typeof input === "object" ? input : {};
  const leadsIn = Array.isArray(src.leads) ? src.leads : [];
  const dose = src.dose && typeof src.dose === "object" ? src.dose : {};
  return {
    leads: [0, 1, 2].map((i) => clipText(leadsIn[i], 180)),
    steps: (Array.isArray(src.steps) ? src.steps : []).map((step) => clipText(step, 280)).filter(Boolean).slice(0, 8),
    dose: {
      sets: clipText(dose.sets, 40),
      reps: clipText(dose.reps, 40),
      hold: clipText(dose.hold, 40),
      rest: clipText(dose.rest, 40),
    },
    breathing: clipText(src.breathing, 280),
    avoid: clipText(src.avoid, 280),
    source: clipText(src.source, 200),
  };
}
function cueBlank(cue) {
  return !cue.leads.some(Boolean) && !cue.steps.length && !cue.dose.sets && !cue.dose.reps && !cue.dose.hold && !cue.dose.rest && !cue.breathing && !cue.avoid && !cue.source;
}
function cueOut(row) {
  let cue = null;
  try { cue = JSON.parse(row.body); } catch { cue = null; }
  if (!cue) return null;
  return { videoId: row.video_id, r2Key: row.r2_key, origin: "manual", cue, updatedAt: row.updated_at };
}
async function handleVideoCues(req, env) {
  await ensureCueTable(env.DB);
  await ensureIdentityTable(env.DB);
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT video_id, r2_key, body, origin, updated_at FROM video_cues ORDER BY video_id").all();
    return json({ ok: true, cues: (results || []).map(cueOut).filter(Boolean) });
  }
  if (req.method !== "PUT") return err(405, "method not allowed");
  const b = await body(req);
  const videoId = Number(b && b.videoId);
  const r2Key = b && b.r2Key ? String(b.r2Key) : "";
  if (!Number.isInteger(videoId) || videoId < 10001) return err(400, "bad video id");
  if (!r2Key || r2Key.length > 300 || r2Key.includes("..")) return err(400, "bad media key");
  const ident = await env.DB.prepare("SELECT video_id, r2_key, status FROM video_identity WHERE video_id = ?").bind(videoId).first();
  if (!ident) return err(404, "unknown video id");
  if (ident.status === "reserved" || ident.status === "deleted") return err(409, "identity is " + ident.status);
  if ((ident.r2_key || "") !== r2Key) return err(409, "media key does not match this id");
  const cue = cleanCue(b && b.cue);
  const existing = await env.DB.prepare("SELECT video_id FROM video_cues WHERE video_id = ?").bind(videoId).first();
  if (cueBlank(cue)) {
    if (existing && !(b && b.confirmClear)) return err(409, "empty cue would wipe saved notes");
    if (existing) await env.DB.prepare("DELETE FROM video_cues WHERE video_id = ?").bind(videoId).run();
    return json({ ok: true, cleared: true, videoId, r2Key });
  }
  const payload = JSON.stringify(cue);
  const stamp = now();
  if (existing) {
    await env.DB.prepare("UPDATE video_cues SET r2_key = ?, body = ?, origin = 'manual', updated_at = ? WHERE video_id = ?").bind(r2Key, payload, stamp, videoId).run();
  } else {
    await env.DB.prepare("INSERT INTO video_cues (video_id, r2_key, body, origin, updated_at) VALUES (?, ?, ?, 'manual', ?)").bind(videoId, r2Key, payload, stamp).run();
  }
  return json({ ok: true, videoId, r2Key, origin: "manual", cue, updatedAt: stamp });
}

// v92: one profile row and one weigh-in per ISO week. Writes use the same X-Nexus-Key gate.
let accountReady = false;
async function ensureAccountTables(db) {
  if (accountReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS account_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    dob TEXT,
    height_cm REAL,
    start_weight_kg REAL,
    start_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS weight_log (
    iso_week TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  accountReady = true;
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}
function validDate(value) {
  if (!ISO_DATE.test(String(value || ""))) return false;
  const [y, m, d] = String(value).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function isoWeekOf(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function profileOut(row) {
  if (!row) return { name: null, dob: null, heightCm: null, startWeightKg: null, startDate: null, updatedAt: null };
  return {
    name: row.name,
    dob: row.dob,
    heightCm: row.height_cm == null ? null : round1(row.height_cm),
    startWeightKg: row.start_weight_kg == null ? null : round1(row.start_weight_kg),
    startDate: row.start_date,
    updatedAt: row.updated_at,
  };
}
function weightOut(row) {
  return { week: row.iso_week, date: row.date, weightKg: round1(row.weight_kg), updatedAt: row.updated_at };
}
async function handleAccount(req, env) {
  await ensureAccountTables(env.DB);
  const existing = await env.DB.prepare("SELECT id, name, dob, height_cm, start_weight_kg, start_date, created_at, updated_at FROM account_profile WHERE id = 1").first();
  if (req.method === "GET") return json({ ok: true, profile: profileOut(existing) });
  if (req.method !== "PUT") return err(405, "method not allowed");
  const b = await body(req) || {};
  const next = {
    name: b.name == null || b.name === "" ? null : String(b.name).replace(/\s+/g, " ").trim().slice(0, 80),
    dob: b.dob == null || b.dob === "" ? null : String(b.dob),
    heightCm: b.heightCm == null || b.heightCm === "" ? null : round1(b.heightCm),
    startWeightKg: b.startWeightKg == null || b.startWeightKg === "" ? null : round1(b.startWeightKg),
    startDate: b.startDate == null || b.startDate === "" ? null : String(b.startDate),
  };
  if (next.dob && !validDate(next.dob)) return err(400, "bad date of birth");
  if (next.startDate && !validDate(next.startDate)) return err(400, "bad start date");
  if (next.heightCm != null && (!Number.isFinite(next.heightCm) || next.heightCm < 50 || next.heightCm > 272)) return err(400, "bad height");
  if (next.startWeightKg != null && (!Number.isFinite(next.startWeightKg) || next.startWeightKg < 20 || next.startWeightKg > 400)) return err(400, "bad weight");
  if ((next.startWeightKg == null) !== (next.startDate == null) && !(existing && existing.start_weight_kg != null && next.startWeightKg == null && next.startDate == null)) {
    return err(400, "starting weight and date are set together");
  }
  if (existing && existing.start_weight_kg != null) {
    const changedWeight = next.startWeightKg != null && round1(existing.start_weight_kg) !== next.startWeightKg;
    const changedDate = next.startDate != null && existing.start_date !== next.startDate;
    if (changedWeight || changedDate) return err(409, "starting weight is locked");
    next.startWeightKg = round1(existing.start_weight_kg);
    next.startDate = existing.start_date;
  }
  const stamp = now();
  if (!existing) {
    await env.DB.prepare("INSERT INTO account_profile (id, name, dob, height_cm, start_weight_kg, start_date, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?)").bind(next.name, next.dob, next.heightCm, next.startWeightKg, next.startDate, stamp, stamp).run();
  } else {
    await env.DB.prepare("UPDATE account_profile SET name = ?, dob = ?, height_cm = ?, start_weight_kg = ?, start_date = ?, updated_at = ? WHERE id = 1").bind(next.name, next.dob, next.heightCm, next.startWeightKg, next.startDate, stamp).run();
  }
  return json({ ok: true, profile: { ...next, updatedAt: stamp } });
}
async function handleWeights(req, env, week) {
  await ensureAccountTables(env.DB);
  if (!week) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT iso_week, date, weight_kg, created_at, updated_at FROM weight_log ORDER BY date DESC, iso_week DESC").all();
      return json({ ok: true, weights: (results || []).map(weightOut) });
    }
    if (req.method !== "PUT") return err(405, "method not allowed");
    const b = await body(req) || {};
    const date = String(b.date || "");
    const weightKg = round1(b.weightKg);
    if (!validDate(date)) return err(400, "bad date");
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) return err(400, "bad weight");
    const key = isoWeekOf(date);
    const existing = await env.DB.prepare("SELECT iso_week, date, weight_kg, created_at, updated_at FROM weight_log WHERE iso_week = ?").bind(key).first();
    const stamp = now();
    if (existing) {
      await env.DB.prepare("UPDATE weight_log SET date = ?, weight_kg = ?, updated_at = ? WHERE iso_week = ?").bind(date, weightKg, stamp, key).run();
    } else {
      await env.DB.prepare("INSERT INTO weight_log (iso_week, date, weight_kg, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(key, date, weightKg, stamp, stamp).run();
    }
    return json({ ok: true, updated: !!existing, entry: { week: key, date, weightKg, updatedAt: stamp } });
  }
  if (!ISO_WEEK.test(week)) return err(400, "bad week");
  if (req.method !== "DELETE") return err(405, "method not allowed");
  const existing = await env.DB.prepare("SELECT iso_week FROM weight_log WHERE iso_week = ?").bind(week).first();
  if (!existing) return err(404, "not found");
  await env.DB.prepare("DELETE FROM weight_log WHERE iso_week = ?").bind(week).run();
  return json({ ok: true, week });
}

export default {
  async scheduled(event, env, ctx) {
    const date = new Date().toISOString().slice(0, 10);
    ctx.waitUntil(exportBackup(env, date));
  },
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const [root, a, b] = parts;
    const write = req.method !== "GET" && req.method !== "HEAD";
    try {
      if (!root || root === "health") {
        if (write) return err(405, "method not allowed");
        await ensureGroupsTable(env.DB);
        await ensurePlacementsTable(env.DB);
        const t = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM ticks) AS ticks, (SELECT COUNT(*) FROM ticks_2026) AS ticks_2026, (SELECT COUNT(*) FROM cards) AS cards, (SELECT COUNT(*) FROM stacks) AS stacks, (SELECT COUNT(*) FROM slots) AS slots, (SELECT COUNT(*) FROM training_combos) AS training_combos, (SELECT COUNT(*) FROM training_plan) AS training_plan, (SELECT COUNT(*) FROM training_groups) AS training_groups, (SELECT COUNT(*) FROM video_placements) AS video_placements").first();
        let cv = null;
        try { cv = await customCount(env); } catch {}
        let identityCount = null;
        try { await ensureIdentityTable(env.DB); identityCount = (await env.DB.prepare("SELECT COUNT(*) AS n FROM video_identity").first()).n; } catch (e) {}
        return json({ ok: true, service: "nexus-api", version: "v69", time: now(), counts: { ...t, custom_videos: cv, video_identity: identityCount } });
      }
      if (root === "backups" || root === "restore") {
        const denied = backupDenied(req, env);
        if (denied) return denied;
        if (root === "backups") {
          if (req.method !== "GET") return err(405, "method not allowed");
          return json({ ok: true, backups: await listBackups(env) });
        }
        if (req.method !== "POST") return err(405, "method not allowed");
        try {
          return json({ ok: true, ...(await restoreBackup(env, url.searchParams.get("date") || "")) });
        } catch (restoreErr) {
          const message = String((restoreErr && restoreErr.message) || restoreErr);
          return err(message === "backup not found" || message === "bad backup date" ? 400 : 500, message);
        }
      }
      if (write) {
        if (!env.NEXUS_KEY || req.headers.get("X-Nexus-Key") !== env.NEXUS_KEY) return err(401, "missing or wrong X-Nexus-Key");
      }
      switch (root) {
        case "ticks": return await withIdempotency(handleTicks)(req, env, "ticks", a);
        case "ticks_2026": return await withIdempotency(handleTicks)(req, env, "ticks_2026", a);
        case "cards": return await handleCards(req, env, a, url);
        case "upload": return await handleUpload(req, env, url);
        case "stacks": return await handleStacks(req, env, a);
        case "slots": return await withIdempotency(handleSlots)(req, env, a, b, url);
        case "training-combos": return await handleCombos(req, env, a);
        case "training-groups": return await handleGroups(req, env, a);
        case "training-plan": return await handlePlan(req, env, a, b);
        case "training-plan-week": return await handlePlanWeek(req, env);
        case "custom-video": return await handleCustomVideo(req, env, url);
        case "custom-videos": return await handleCustomList(req, env);
        case "video-placements": return await handlePlacements(req, env, url);
        case "video-ids": return await handleVideoIds(req, env, a);
        case "video-cues": return await handleVideoCues(req, env);
        case "account": return await withIdempotency(handleAccount)(req, env);
        case "weights": return await withIdempotency(handleWeights)(req, env, a);
        case "video-trims": return await handleTrims(req, env, url, a);
        case "video-sync-log": return await handleSyncLog(req, env);
        case "videos": return await handleVideos(req, env, url);
        case "video-object": return await handleVideoObject(req, env, url, a);
        case "storage": if (req.method !== "GET") return err(405, "method not allowed"); return json(storageOut(await storageBytes(env, url.searchParams.get("fresh") === "1")));
        default: return err(404, "unknown route");
      }
    } catch (e) {
      return err(500, String((e && e.message) || e));
    }
  },
};
