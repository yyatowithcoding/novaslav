// Cloudflare Pages Function: GET /api/words
// Thin proxy to the relay bot, which holds the actual MongoDB connection.
// RELAY_URL / RELAY_SECRET are set as environment bindings (see .dev.vars.example
// for local dev, or `wrangler pages secret put` for production), never shipped to the browser.

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.RELAY_URL || !env.RELAY_SECRET) {
    return new Response(JSON.stringify({ error: "RELAY_URL / RELAY_SECRET not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const res = await fetch(new URL("/api/words", env.RELAY_URL), {
      headers: { Authorization: `Bearer ${env.RELAY_SECRET}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "relay returned " + res.status }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }

    const data = await res.text();
    return new Response(data, {
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "relay unreachable" }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  }
}
