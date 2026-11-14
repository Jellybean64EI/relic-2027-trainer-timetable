// Owner session, rate limits, and signed video URLs. No secret values live here.

const encoder = new TextEncoder();
const SITE = "relic-2027-trainer-timetable.vercel.app";
const VIDEO_TTL = 2 * 60 * 60;

export function legacyAccepted(env) {
  return String(env.LEGACY_KEY_ACCEPTED == null ? "true" : env.LEGACY_KEY_ACCEPTED) !== "false";
}

export async function timingSame(left, right) {
  const a = await hmac("nexus-compare", String(left == null ? "" : left));
  const b = await hmac("nexus-compare", String(right == null ? "" : right));
  if (typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(a, b);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64url(bytes) {
  const bin = typeof bytes === "string" ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(text) {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function issueToken(env, nowSec) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const exp = (nowSec || Math.floor(Date.now() / 1000)) + 30 * 24 * 60 * 60;
  const body = b64url(JSON.stringify({ v: 1, exp }));
  const sig = b64url(await hmac(env.SESSION_SECRET, body));
  return { token: body + "." + sig, exp };
}

export async function verifyToken(env, token) {
  if (!env.SESSION_SECRET || !token || token.indexOf(".") < 0) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = b64url(await hmac(env.SESSION_SECRET, body));
  if (!(await timingSame(expected, sig))) return false;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))); } catch { return false; }
  return !!(payload && payload.exp > Math.floor(Date.now() / 1000));
}

export async function authorized(req, env) {
  const header = req.headers.get("Authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  if (bearer && bearer !== header && await verifyToken(env, bearer)) return true;
  if (legacyAccepted(env) && env.NEXUS_KEY && await timingSame(env.NEXUS_KEY, req.headers.get("X-Nexus-Key") || "")) return true;
  return false;
}

export function allowedOrigin(origin) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    if (url.origin === "https://" + SITE) return url.origin;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  } catch { /* not a URL */ }
  return "";
}

export function requestAllowed(req) {
  const origin = allowedOrigin(req.headers.get("Origin") || "");
  if (origin) return true;
  const referer = req.headers.get("Referer") || "";
  return !!allowedOrigin(referer);
}

const PROTECTED_READS = new Set([
  "account", "ticks", "ticks_2026", "weights", "slots",
  "video-sync-log", "video-trims", "storage", "custom-videos", "video-ids"
]);

export function readNeedsAuth(root) {
  return PROTECTED_READS.has(root);
}

export async function ensureRateTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS rate_hits (
    bucket TEXT NOT NULL,
    ip TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (bucket, ip, window_start)
  )`).run();
}

export async function rateAllow(env, ip, bucket, limit, windowSec) {
  if (!env.DB) return true;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  try {
    await ensureRateTable(env.DB);
    const row = await env.DB.prepare(
      "SELECT count FROM rate_hits WHERE bucket = ? AND ip = ? AND window_start = ?"
    ).bind(bucket, ip, windowStart).first();
    const count = row ? Number(row.count) : 0;
    if (count >= limit) return false;
    if (row) {
      await env.DB.prepare(
        "UPDATE rate_hits SET count = count + 1 WHERE bucket = ? AND ip = ? AND window_start = ?"
      ).bind(bucket, ip, windowStart).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO rate_hits (bucket, ip, window_start, count) VALUES (?, ?, ?, 1)"
      ).bind(bucket, ip, windowStart).run();
    }
    await env.DB.prepare("DELETE FROM rate_hits WHERE window_start < ?").bind(now - 86400).run();
    return true;
  } catch {
    return bucket !== "login";
  }
}

export function clientIp(req) {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "local";
}

export async function signVideo(env, key, nowSec) {
  if (!env.VIDEO_SIGNING_KEY) throw new Error("VIDEO_SIGNING_KEY is not set");
  const exp = (nowSec || Math.floor(Date.now() / 1000)) + VIDEO_TTL;
  const sig = b64url(await hmac(env.VIDEO_SIGNING_KEY, key + "|" + exp));
  return { key, exp, sig, url: "/v/" + key.split("/").map(encodeURIComponent).join("/") + "?exp=" + exp + "&sig=" + sig };
}

export async function videoSigOk(env, key, exp, sig) {
  if (!env.VIDEO_SIGNING_KEY || !sig || !exp) return false;
  const when = Number(exp);
  if (!Number.isFinite(when) || when < Math.floor(Date.now() / 1000)) return false;
  const expected = b64url(await hmac(env.VIDEO_SIGNING_KEY, key + "|" + when));
  return timingSame(expected, sig);
}

export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { bad: true };
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!suffix) return { bad: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return { bad: true };
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1, start, end };
}
