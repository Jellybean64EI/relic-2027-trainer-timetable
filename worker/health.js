// Every 15 minutes: site, /health, and D1. Two failures in a row open one
// nexus-alert issue. A later success comments and closes it.
// GITHUB_ALERT_TOKEN is a repo secret. If it is unset, the check is only logged.

const REPO = "Jellybean64EI/relic-2027-trainer-timetable";
const SITE = "https://relic-2027-trainer-timetable.vercel.app";
const WORKER = "https://nexus-api.joesearle.workers.dev";

export async function ensureHealthTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checked_at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    detail TEXT NOT NULL
  )`).run();
}

export function daysAgo(iso, days) {
  return new Date(new Date(iso).getTime() - days * 86400000).toISOString();
}

export async function pruneHealth(db, nowIso) {
  await ensureHealthTable(db);
  await db.prepare("DELETE FROM health_checks WHERE checked_at < ?").bind(daysAgo(nowIso, 7)).run();
}

export function needsAlert(rows) {
  if (!rows || rows.length < 2) return false;
  return Number(rows[0].ok) === 0 && Number(rows[1].ok) === 0;
}

async function github(env, fetchFn, method, path, payload) {
  if (!env.GITHUB_ALERT_TOKEN) return { skipped: true };
  const res = await fetchFn("https://api.github.com" + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_ALERT_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "nexus-health",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = { raw: text }; }
  return { status: res.status, body: body };
}

async function openIssues(env, fetchFn) {
  const listed = await github(env, fetchFn, "GET", "/repos/" + REPO + "/issues?state=open&labels=nexus-alert");
  if (listed.skipped) return [];
  return Array.isArray(listed.body) ? listed.body.filter(function (issue) { return issue && !issue.pull_request; }) : [];
}

export async function syncAlert(env, fetchFn, log, ok, detail) {
  if (!env.GITHUB_ALERT_TOKEN) {
    if (!ok) log("health alert skipped: GITHUB_ALERT_TOKEN unset " + JSON.stringify(detail));
    return { skipped: true };
  }
  const open = await openIssues(env, fetchFn);
  if (!ok) {
    if (open.length) return { duplicate: true, number: open[0].number };
    await github(env, fetchFn, "POST", "/repos/" + REPO + "/labels", { name: "nexus-alert", color: "B45309", description: "Nexus health and smoke alerts" });
    const created = await github(env, fetchFn, "POST", "/repos/" + REPO + "/issues", {
      title: "Nexus health check failed",
      body: "Two health checks in a row failed.\n\n```\n" + JSON.stringify(detail, null, 2) + "\n```\n",
      labels: ["nexus-alert"]
    });
    return { opened: true, number: created.body && created.body.number };
  }
  for (let i = 0; i < open.length; i++) {
    const number = open[i].number;
    await github(env, fetchFn, "POST", "/repos/" + REPO + "/issues/" + number + "/comments", {
      body: "Recovered at " + (detail.checkedAt || new Date().toISOString()) + ". The site, /health, and D1 answered."
    });
    await github(env, fetchFn, "PATCH", "/repos/" + REPO + "/issues/" + number, { state: "closed" });
  }
  return { closed: open.map(function (issue) { return issue.number; }) };
}

export async function runHealthCheck(env, deps) {
  const fetchFn = (deps && deps.fetch) || fetch;
  const log = (deps && deps.log) || function (line) { console.log(line); };
  const nowIso = (deps && deps.now) ? deps.now() : new Date().toISOString();
  const site = env.SITE_URL || SITE;
  const worker = String(env.WORKER_URL || WORKER).replace(/\/$/, "") + "/health";
  const detail = { checkedAt: nowIso, site: false, health: false, d1: false };
  try {
    const res = await fetchFn(site, { headers: { "User-Agent": "nexus-health" } });
    const text = await res.text();
    detail.siteStatus = res.status;
    detail.site = res.status === 200 && /name="relic-build"/.test(text) && /content="v\d+"/.test(text);
  } catch (err) {
    detail.siteError = String((err && err.message) || err);
  }
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    detail.d1 = !!(row && Number(row.ok) === 1);
  } catch (err) {
    detail.d1Error = String((err && err.message) || err);
  }
  try {
    const res = await fetchFn(worker, { headers: { "User-Agent": "nexus-health" } });
    const payload = await res.json();
    const ticks = payload && payload.counts ? Number(payload.counts.ticks) : NaN;
    const older = payload && payload.counts ? Number(payload.counts.ticks_2026) : NaN;
    detail.ticks = ticks;
    detail.ticks_2026 = older;
    detail.health = res.status === 200 && ticks > 0 && older > 0;
  } catch (err) {
    detail.healthError = String((err && err.message) || err);
  }
  const ok = detail.site && detail.health && detail.d1;
  await ensureHealthTable(env.DB);
  await env.DB.prepare("INSERT INTO health_checks (checked_at, ok, detail) VALUES (?, ?, ?)").bind(nowIso, ok ? 1 : 0, JSON.stringify(detail)).run();
  await pruneHealth(env.DB, nowIso);
  const recent = await env.DB.prepare("SELECT ok, checked_at FROM health_checks ORDER BY id DESC LIMIT 2").all();
  const rows = (recent && recent.results) || [];
  let alert = { idle: true };
  if (!ok && needsAlert(rows)) alert = await syncAlert(env, fetchFn, log, false, detail);
  if (ok) alert = await syncAlert(env, fetchFn, log, true, detail);
  return { ok: ok, detail: detail, alert: alert };
}
