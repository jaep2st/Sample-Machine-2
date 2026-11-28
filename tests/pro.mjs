// Checks the key-free Pro unlock (functions/api/pro) against a fake Polar, Resend and KV.
import { onRequestPost } from "../functions/api/pro/[action].js";

const ORG = "cbc6d623-cf5e-4685-984a-88aab7e7e41f";
let state = "succeeded";
let keys = [
  { key: "PF-OLD", created_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z" },
  { key: "PF-NEW", created_at: "2026-11-28T00:00:00Z", expires_at: null },
];
const customers = { "buyer@x.com": "cus1" };
const mails = [];
globalThis.fetch = async (url, o = {}) => {
  const j = (s, b) => new Response(JSON.stringify(b), { status: s });
  const auth = (o.headers || {}).Authorization;
  if (url.startsWith("https://api.resend.com/")) { mails.push(JSON.parse(o.body)); return j(200, { id: "m1" }); }
  if (url.includes("/checkouts/")) return auth === "Bearer TOK" ? j(200, { organization_id: ORG, status: state, customer_id: "cus1" }) : j(401, {});
  if (url.includes("/customers/?")) {
    const q = new URL(url).searchParams, e = (q.get("email") || q.get("query") || "").toLowerCase();
    return j(200, { items: customers[e] ? [{ id: customers[e], email: e }] : [] });
  }
  if (url.endsWith("/customer-sessions/")) return j(201, { token: "polar_cst_x" });
  if (url.includes("/customer-portal/license-keys/")) return auth === "Bearer polar_cst_x" ? j(200, { items: keys }) : j(401, {});
  return j(404, {});
};
const store = new Map();
const KV = {
  async get(k, t) { const v = store.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  async put(k, v) { store.set(k, v); },
  async delete(k) { store.delete(k); },
};
const ENV = { POLAR_TOKEN: "TOK", RESEND_KEY: "re_x", PF_KV: KV };
const req = (a, b, env = ENV) =>
  onRequestPost({ params: { action: a }, request: new Request("https://x/", { method: "POST", body: JSON.stringify(b) }), env })
    .then(async (r) => [r.status, await r.json()]);

const id = "11111111-2222-3333-4444-555555555555";
const checks = [];
const check = (name, ok) => { checks.push(ok); console.log((ok ? "ok   " : "FAIL ") + name); };

check("claim after checkout gives the newest key", (await req("claim", { checkout_id: id }))[1].key === "PF-NEW");
state = "open"; check("claim waits while payment finishes", (await req("claim", { checkout_id: id }))[1].pending === true); state = "succeeded";
check("claim without token says setup", (await req("claim", { checkout_id: id }, {}))[0] === 503);
check("claim rejects a bad id", (await req("claim", { checkout_id: "x" }))[0] === 400);

check("code for a buyer is sent", (await req("code", { email: "Buyer@X.com" }))[1].sent === true && mails.length === 1);
const code = mails[0].subject.match(/\d{6}/)[0];
check("email comes from help@producerface.com", mails[0].from.includes("help@producerface.com") && mails[0].to[0] === "buyer@x.com");
check("second code within 45 s is refused", (await req("code", { email: "buyer@x.com" }))[0] === 429);
check("non-buyer gets the same answer but no email", (await req("code", { email: "nobody@x.com" }))[1].sent === true && mails.length === 1);
const wrong = code === "000000" ? "111111" : "000000";
check("wrong code is refused", (await req("login", { email: "buyer@x.com", code: wrong }))[0] === 401);
check("right code gives the key", (await req("login", { email: "buyer@x.com", code }))[1].key === "PF-NEW");
check("a code works only once", (await req("login", { email: "buyer@x.com", code }))[0] === 401);

// brute force: 5 wrong tries kill the code
store.clear(); mails.length = 0;
await req("code", { email: "buyer@x.com" });
const c2 = mails[0].subject.match(/\d{6}/)[0], bad = c2 === "123456" ? "654321" : "123456";
for (let i = 0; i < 5; i++) await req("login", { email: "buyer@x.com", code: bad });
check("after 5 wrong tries even the right code fails", (await req("login", { email: "buyer@x.com", code: c2 }))[0] === 401);
check("email unlock without setup explains itself", (await req("code", { email: "buyer@x.com" }, { POLAR_TOKEN: "TOK" }))[0] === 503);
check("unknown action is 404", (await req("hack", {}))[0] === 404);

const ok = checks.every(Boolean);
console.log(ok ? "PRO UNLOCK: PASS" : "PRO UNLOCK: FAIL");
process.exit(ok ? 0 : 1);
