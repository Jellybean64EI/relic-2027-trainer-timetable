// Quiet client error log. Rows keep message, source, page, version, and user agent.
// GET /errors uses X-Backup-Token. The nightly cron deletes rows older than 30 days.

const KEEP_DAYS = 30;

export async function ensureErrorTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    source TEXT,
    page TEXT,
    version TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  )`).run();
}

function clip(value, max) {
  return String(value == null ? "" : value).replace(/\S+@\S+/g, "[redacted]").slice(0, max);
}

export function daysAgo(iso, days) {
  return new Date(new Date(iso).getTime() - days * 86400000).toISOString();
}

export async function pruneClientErrors(db, nowIso) {
  await ensureErrorTable(db);
  await db.prepare("DELETE FROM client_errors WHERE created_at < ?").bind(daysAgo(nowIso, KEEP_DAYS)).run();
}

export async function saveClientErrors(db, payload, nowIso) {
  await ensureErrorTable(db);
  const stamp = nowIso || new Date().toISOString();
  const list = payload && Array.isArray(payload.errors) ? payload.errors.slice(0, 20) : [];
  let stored = 0;
  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const message = clip(row.message, 300);
    if (!message) continue;
    await db.prepare(
      "INSERT INTO client_errors (message, source, page, version, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(message, clip(row.source, 200), clip(row.page, 200), clip(row.version, 20), clip(row.userAgent, 180), stamp).run();
    stored += 1;
  }
  await pruneClientErrors(db, stamp);
  return stored;
}

export async function listClientErrors(db) {
  await ensureErrorTable(db);
  const listed = await db.prepare("SELECT id, message, source, page, version, user_agent, created_at FROM client_errors ORDER BY id DESC LIMIT 100").all();
  return (listed && listed.results) || [];
}
