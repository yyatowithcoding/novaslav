// Cloudflare Pages Function: GET /api/words
// Thin proxy to the relay bot, which holds the actual MongoDB connection.
// RELAY_URL / RELAY_SECRET are set as environment bindings (see .dev.vars.example
// for local dev, or `wrangler pages secret put` for production), never shipped to the browser.
//
// The last successful response also gets cached in the WORDS_CACHE KV namespace.
// If the relay/bot is offline, we serve that cache instead of failing outright, so
// newly-added words stick around even when the bot isn't running. Only if there's
// no cache either (e.g. first ever request) does the frontend fall back to its
// small bundled seed list.

const CACHE_KEY = "words";

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
      throw new Error("relay returned " + res.status);
    }

    const data = await res.text();

    if (env.WORDS_CACHE) {
      context.waitUntil(env.WORDS_CACHE.put(CACHE_KEY, data));
    }

    return new Response(data, {
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-words-source": "relay" }
    });
  } catch (err) {
    if (env.WORDS_CACHE) {
      const cached = await env.WORDS_CACHE.get(CACHE_KEY);
      if (cached) {
        return new Response(cached, {
          headers: { "content-type": "application/json", "cache-control": "no-store", "x-words-source": "cache" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "relay unreachable and no cache available" }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  }
}
