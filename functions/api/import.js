// Cloudflare Pages Function: POST /api/import
// Gate 1 (here): the site visitor must know IMPORT_PASSWORD, so random visitors
// who find the /import/ page can't spam the dictionary.
// Gate 2 (relay side): this Function must know RELAY_SECRET to talk to the relay bot at all.
// Neither secret is ever sent to the browser.
//
// After a successful import, also refreshes the WORDS_CACHE KV snapshot immediately,
// so newly-added words show up right away even if the relay goes offline right after.

const CACHE_KEY = "words";

async function refreshCache(env) {
  try {
    const res = await fetch(new URL("/api/words", env.RELAY_URL), {
      headers: { Authorization: `Bearer ${env.RELAY_SECRET}` }
    });
    if (res.ok && env.WORDS_CACHE) {
      await env.WORDS_CACHE.put(CACHE_KEY, await res.text());
    }
  } catch (err) {
    // Best-effort only, the next successful GET /api/words will refresh it anyway.
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RELAY_URL || !env.RELAY_SECRET) {
    return new Response(JSON.stringify({ error: "RELAY_URL / RELAY_SECRET not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "body must be JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  if (env.IMPORT_PASSWORD) {
    if (body.password !== env.IMPORT_PASSWORD) {
      return new Response(JSON.stringify({ error: "wrong import password" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
  }

  try {
    const res = await fetch(new URL("/api/import", env.RELAY_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RELAY_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ text: body.text || "" })
    });

    const data = await res.text();
    if (res.ok) {
      context.waitUntil(refreshCache(env));
    }
    return new Response(data, {
      status: res.status,
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "relay unreachable" }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  }
}
