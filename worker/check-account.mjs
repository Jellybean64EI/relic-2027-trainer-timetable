import worker from "./nexus-api.js";

const profile = { row: null };
const weights = new Map();

function db() {
  return {
    prepare(sql) {
      const text = String(sql);
      function op(args) {
        return {
          async run() {
            if (text.indexOf("CREATE TABLE") === 0) return { meta: { changes: 0 } };
            if (text.indexOf("INSERT INTO account_profile") === 0) {
              profile.row = { id: 1, name: args[0], dob: args[1], height_cm: args[2], start_weight_kg: args[3], start_date: args[4], created_at: args[5], updated_at: args[6] };
              return { meta: { changes: 1 } };
            }
            if (text.indexOf("UPDATE account_profile") === 0) {
              profile.row.name = args[0];
              profile.row.dob = args[1];
              profile.row.height_cm = args[2];
              profile.row.start_weight_kg = args[3];
              profile.row.start_date = args[4];
              profile.row.updated_at = args[5];
              return { meta: { changes: 1 } };
            }
            if (text.indexOf("INSERT INTO weight_log") === 0) {
              weights.set(args[0], { iso_week: args[0], date: args[1], weight_kg: args[2], created_at: args[3], updated_at: args[4] });
              return { meta: { changes: 1 } };
            }
            if (text.indexOf("UPDATE weight_log") === 0) {
              const row = weights.get(args[3]);
              row.date = args[0];
              row.weight_kg = args[1];
              row.updated_at = args[2];
              return { meta: { changes: 1 } };
            }
            if (text.indexOf("DELETE FROM weight_log") === 0) {
              weights.delete(args[0]);
              return { meta: { changes: 1 } };
            }
            throw new Error("unhandled run " + text);
          },
          async first() {
            if (text.indexOf("FROM account_profile") !== -1) return profile.row;
            if (text.indexOf("FROM weight_log WHERE") !== -1) return weights.get(args[0]) || null;
            throw new Error("unhandled first " + text);
          },
          async all() {
            if (text.indexOf("FROM weight_log") !== -1) return { results: Array.from(weights.values()) };
            throw new Error("unhandled all " + text);
          }
        };
      }
      const plain = op([]);
      return {
        bind() { return op(Array.prototype.slice.call(arguments)); },
        run: plain.run,
        first: plain.first,
        all: plain.all
      };
    }
  };
}

const env = { NEXUS_KEY: "test-key", DB: db() };
let failed = 0;
function fail(message) { failed += 1; console.error("FAIL " + message); }
function ok(message) { console.log("OK " + message); }

async function call(path, method, payload, key) {
  const headers = { "Content-Type": "application/json" };
  if (key !== null) headers["X-Nexus-Key"] = key || "test-key";
  const res = await worker.fetch(new Request("https://nexus.test" + path, {
    method: method,
    headers: headers,
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(payload || {})
  }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const empty = await call("/account", "GET");
if (empty.status !== 200 || empty.body.profile.startWeightKg !== null) fail("empty profile " + JSON.stringify(empty));
else ok("empty profile");

const denied = await call("/account", "PUT", { name: "Joseph William Searle" }, null);
if (denied.status !== 401) fail("write without a key was accepted");
else ok("writes need the key");

const saved = await call("/account", "PUT", {
  name: "Joseph William Searle",
  dob: "2000-06-22",
  heightCm: 178,
  startWeightKg: 82.4,
  startDate: "2026-01-01"
});
if (saved.status !== 200 || saved.body.profile.startWeightKg !== 82.4 || saved.body.profile.name !== "Joseph William Searle") {
  fail("profile did not save " + JSON.stringify(saved));
} else ok("profile saves");

const locked = await call("/account", "PUT", {
  name: "Joseph William Searle",
  dob: "2000-06-22",
  heightCm: 178,
  startWeightKg: 80,
  startDate: "2026-01-01"
});
if (locked.status !== 409) fail("anchor change was not refused " + locked.status);
else ok("changing the anchor returns 409");

const renamed = await call("/account", "PUT", { name: "Joseph Searle", dob: "2000-06-22", heightCm: 180 });
if (renamed.status !== 200 || renamed.body.profile.startWeightKg !== 82.4 || renamed.body.profile.heightCm !== 180) {
  fail("other fields did not stay editable " + JSON.stringify(renamed.body));
} else ok("other fields stay editable");

const first = await call("/weights", "PUT", { date: "2027-01-04", weightKg: 80 });
const second = await call("/weights", "PUT", { date: "2027-01-06", weightKg: 81.5 });
if (!first.body || first.body.updated || first.body.entry.week !== "2027-W01") fail("first week " + JSON.stringify(first.body));
else if (!second.body.updated || second.body.entry.week !== "2027-W01" || second.body.entry.weightKg !== 81.5) fail("same week did not update " + JSON.stringify(second.body));
else ok("a same-week weigh-in updates");

const list = await call("/weights", "GET");
if (!list.body || list.body.weights.length !== 1) fail("weight list duplicated " + JSON.stringify(list.body));
else ok("one row remains for the week");

const removed = await call("/weights/2027-W01", "DELETE");
const missing = await call("/weights/2027-W01", "DELETE");
if (removed.status !== 200 || missing.status !== 404) fail("delete " + removed.status + " " + missing.status);
else ok("delete removes one week");

if (failed) {
  console.error(failed + " account route check(s) failed");
  process.exit(1);
}
console.log("OK account routes");
