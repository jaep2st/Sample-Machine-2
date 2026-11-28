// Cloudflare Pages Function: unlocks Producer Face Pro without the buyer ever handling a key
// or seeing a payment page.
//
//   POST /api/pro/claim  {checkout_id}   right after checkout (Polar sends the buyer back with this id)
//   POST /api/pro/code   {email}         new phone / cleared browser: we email a 6-digit code
//   POST /api/pro/login  {email, code}   that code -> the buyer's key
//
// Answers: {key} on success, {pending:true} while Polar is still issuing a key,
// {sent:true} after a code request, or {error:"message for the buyer"}.
//
// Set in Cloudflare (Workers & Pages > producerface > Settings):
//   Variables and secrets
//     POLAR_TOKEN  Polar organization access token, scopes: checkouts:read,
//                  customer_sessions:write, customers:read
//     RESEND_KEY   Resend API key (sends the code emails from help@producerface.com)
//   Bindings
//     PF_KV        a KV namespace (holds codes for 10 minutes, and send limits)
// None of these ever reach the browser.

const ORG = "cbc6d623-cf5e-4685-984a-88aab7e7e41f";
const API = "https://api.polar.sh/v1";
const FROM = "Producer Face <help@producerface.com>";
const REPLY_TO = "producerface.help@gmail.com";
const CODE_TTL = 600; // seconds a code works
const MAX_TRIES = 5; // wrong guesses before a code dies
const SENDS_PER_HOUR = 5;
const SEND_GAP = 45; // seconds between code emails to one address

const out = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function call(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

// the newest key that hasn't expired, for one customer
async function keyForCustomer(env, customerId) {
  const s = await call("/customer-sessions/", { method: "POST", token: env.POLAR_TOKEN, body: { customer_id: customerId } });
  if (!s.data.token) return null;
  const r = await call("/customer-portal/license-keys/?limit=100", { token: s.data.token });
  if (r.status !== 200) return null;
  const now = Date.now();
  const keys = (r.data.items || [])
    .filter((k) => k.key && (!k.expires_at || Date.parse(k.expires_at) > now))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return keys.length ? keys[0].key : null;
}

async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cleanEmail = (e) => String(e || "").trim().toLowerCase();
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

async function claim(env, body) {
  const id = String(body.checkout_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return out({ error: "That purchase link looks incomplete." }, 400);
  if (!env.POLAR_TOKEN) return out({ error: "setup" }, 503);
  const c = await call(`/checkouts/${id}`, { token: env.POLAR_TOKEN });
  if (c.status !== 200 || c.data.organization_id !== ORG) return out({ error: "We couldn't find that purchase." }, 404);
  if (c.data.status !== "succeeded" || !c.data.customer_id) return out({ pending: true }, 202);
  const key = await keyForCustomer(env, c.data.customer_id);
  return key ? out({ key }) : out({ pending: true }, 202);
}

async function findCustomers(env, email) {
  const q = new URLSearchParams({ organization_id: ORG, email, limit: "10" });
  let r = await call(`/customers/?${q}`, { token: env.POLAR_TOKEN });
  let items = r.data.items || [];
  if (!items.length) {
    // emails may be stored with capitals; search and compare case-insensitively
    const q2 = new URLSearchParams({ organization_id: ORG, query: email, limit: "10" });
    r = await call(`/customers/?${q2}`, { token: env.POLAR_TOKEN });
    items = (r.data.items || []).filter((c) => cleanEmail(c.email) === email);
  }
  return items;
}

async function sendCode(env, body) {
  const email = cleanEmail(body.email);
  if (!okEmail(email)) return out({ error: "That email doesn't look right." }, 400);
  if (!env.POLAR_TOKEN || !env.RESEND_KEY || !env.PF_KV) return out({ error: "Email unlock isn't switched on yet. Use your license key for now." }, 503);

  // limits: one email every 45 s, 5 an hour, per address
  const rk = "rate:" + (await sha(email));
  const rate = (await env.PF_KV.get(rk, "json")) || { n: 0, last: 0 };
  const now = Date.now();
  if (now - rate.last < SEND_GAP * 1000) return out({ error: "Code already sent. Give it a minute, and check spam." }, 429);
  if (rate.n >= SENDS_PER_HOUR) return out({ error: "Too many codes for that email. Try again in an hour." }, 429);

  // only email people who actually have Pro; everyone gets the same answer either way
  const generic = out({ sent: true });
  let customerId = null;
  for (const c of await findCustomers(env, email)) {
    if (await keyForCustomer(env, c.id)) { customerId = c.id; break; }
  }
  await env.PF_KV.put(rk, JSON.stringify({ n: rate.n + 1, last: now }), { expirationTtl: 3600 });
  if (!customerId) return generic;

  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, "0");
  await env.PF_KV.put("code:" + (await sha(email)), JSON.stringify({ h: await sha(code + email), cid: customerId, tries: 0, exp: now + CODE_TTL * 1000 }), { expirationTtl: CODE_TTL });

  const m = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      reply_to: REPLY_TO,
      subject: `Your Producer Face code: ${code}`,
      text: `Your Producer Face code is ${code}\n\nType it in the app to unlock Pro on this device. It works for 10 minutes.\n\nDidn't ask for this? You can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1d1b19"><p>Your Producer Face code is</p><p style="font-size:32px;font-weight:800;letter-spacing:4px;margin:8px 0">${code}</p><p>Type it in the app to unlock Pro on this device. It works for 10 minutes.</p><p style="color:#777;font-size:13px">Didn't ask for this? You can ignore this email.</p></div>`,
    }),
  });
  if (!m.ok) return out({ error: "Couldn't send the code right now. Try again in a minute." }, 502);
  return generic;
}

async function login(env, body) {
  const email = cleanEmail(body.email);
  const code = String(body.code || "").replace(/\D/g, "");
  if (!okEmail(email) || code.length !== 6) return out({ error: "Type the 6-digit code from the email." }, 400);
  if (!env.POLAR_TOKEN || !env.PF_KV) return out({ error: "Email unlock isn't switched on yet." }, 503);
  const ck = "code:" + (await sha(email));
  const rec = await env.PF_KV.get(ck, "json");
  if (!rec || Date.now() > rec.exp) return out({ error: "That code expired. Tap Send code for a new one." }, 401);
  if (rec.tries >= MAX_TRIES) {
    await env.PF_KV.delete(ck);
    return out({ error: "Too many wrong tries. Tap Send code for a new one." }, 401);
  }
  if ((await sha(code + email)) !== rec.h) {
    const left = Math.max(60, Math.ceil((rec.exp - Date.now()) / 1000));
    await env.PF_KV.put(ck, JSON.stringify({ ...rec, tries: rec.tries + 1 }), { expirationTtl: left });
    return out({ error: "That code isn't right. Check the email and try again." }, 401);
  }
  await env.PF_KV.delete(ck);
  const key = await keyForCustomer(env, rec.cid);
  return key ? out({ key }) : out({ error: "Your Pro plan isn't active. If you were charged, email us." }, 404);
}

export async function onRequestPost({ params, request, env }) {
  const action = String(params.action || "");
  const raw = await request.text();
  if (raw.length > 2000) return out({ error: "Too large" }, 413);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch (e) { return out({ error: "Bad request" }, 400); }
  try {
    if (action === "claim") return await claim(env, body);
    if (action === "code") return await sendCode(env, body);
    if (action === "login") return await login(env, body);
  } catch (e) {
    return out({ error: "Couldn't reach the server. Try again in a minute." }, 502);
  }
  return out({ error: "Not found" }, 404);
}
