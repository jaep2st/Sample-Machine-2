// Cloudflare Pages Function: a tiny relay to Polar's public license-key endpoints.
// The app calls Polar directly first; this is only used if a browser blocks that call.
// It holds no secrets: these Polar endpoints are public and need no token.
const ALLOWED = new Set(["validate", "activate", "deactivate"]);

export async function onRequestPost({ params, request }) {
  const action = String(params.action || "");
  if (!ALLOWED.has(action)) return new Response("Not found", { status: 404 });
  const body = await request.text();
  if (body.length > 4000) return new Response("Too large", { status: 413 });
  const r = await fetch(`https://api.polar.sh/v1/customer-portal/license-keys/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
