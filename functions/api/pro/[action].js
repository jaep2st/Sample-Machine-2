// Cloudflare Pages Function: hands a buyer their Producer Face Pro license key
// so they never have to find it themselves.
//
//   POST /api/pro/claim  {checkout_id}   right after checkout (Polar sends the buyer back with this id)
//   POST /api/pro/code   {email}         emails the buyer a 6-digit sign-in code (Polar sends it)
//   POST /api/pro/login  {code}          swaps that code for the buyer's key
//
// Every answer is {key} on success, {pending:true} while Polar is still issuing the key,
// or {error:"message for the buyer"}.
//
// claim needs one secret, set in Cloudflare (Workers & Pages > producerface > Settings >
// Variables and secrets): POLAR_TOKEN = a Polar organization access token with the scopes
// checkouts:read and customer_sessions:write. It never reaches the browser.
// code and login use Polar's public customer sign-in and need no secret.

const ORG = "cbc6d623-cf5e-4685-984a-88aab7e7e41f";
const API = "https://api.polar.sh/v1";

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

// the newest key that hasn't expired, from a signed-in customer's own list
async function keyFor(sessionToken) {
  const r = await call("/customer-portal/license-keys/?limit=100", { token: sessionToken });
  if (r.status !== 200) return null;
  const now = Date.now();
  const keys = (r.data.items || [])
    .filter((k) => k.key && (!k.expires_at || Date.parse(k.expires_at) > now))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return keys.length ? keys[0].key : null;
}

async function claim(env, body) {
  const id = String(body.checkout_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return out({ error: "That purchase link looks incomplete." }, 400);
  if (!env.POLAR_TOKEN) return out({ error: "setup" }, 503);
  const c = await call(`/checkouts/${id}`, { token: env.POLAR_TOKEN });
  if (c.status !== 200 || c.data.organization_id !== ORG) return out({ error: "We couldn't find that purchase." }, 404);
  if (c.data.status !== "succeeded") return out({ pending: true }, 202);
  if (!c.data.customer_id) return out({ pending: true }, 202);
  const s = await call("/customer-sessions/", { method: "POST", token: env.POLAR_TOKEN, body: { customer_id: c.data.customer_id } });
  if (!s.data.token) return out({ error: "We couldn't open your account. Use 'Unlock with email' instead." }, 502);
  const key = await keyFor(s.data.token);
  return key ? out({ key }) : out({ pending: true }, 202);
}

async function sendCode(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return out({ error: "That email doesn't look right." }, 400);
  const r = await call("/customer-portal/customer-session/request", { method: "POST", body: { email, organization_id: ORG } });
  // same answer whether or not the email has bought, so nobody can use this to look up customers
  if (r.status >= 500) return out({ error: "Couldn't send the code right now. Try again in a minute." }, 502);
  return out({ sent: true });
}

async function login(body) {
  const code = String(body.code || "").trim();
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return out({ error: "Type the code from the email." }, 400);
  const r = await call("/customer-portal/customer-session/authenticate", { method: "POST", body: { code } });
  if (!r.data.token) return out({ error: "That code didn't work. Check it, or send a new one." }, 401);
  const key = await keyFor(r.data.token);
  return key ? out({ key }) : out({ error: "No active Pro plan on that email. Used a different email at checkout?" }, 404);
}

export async function onRequestPost({ params, request, env }) {
  const action = String(params.action || "");
  const raw = await request.text();
  if (raw.length > 2000) return out({ error: "Too large" }, 413);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch (e) { return out({ error: "Bad request" }, 400); }
  try {
    if (action === "claim") return await claim(env, body);
    if (action === "code") return await sendCode(body);
    if (action === "login") return await login(body);
  } catch (e) {
    return out({ error: "Couldn't reach the license server. Try again in a minute." }, 502);
  }
  return out({ error: "Not found" }, 404);
}
