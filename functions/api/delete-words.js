// Cloudflare Pages Function: POST /api/delete-words
// Same two-gate pattern as /api/import: IMPORT_PASSWORD gates who can call this
// at all, RELAY_SECRET gates this Function's own call to the relay bot. Neither
// secret reaches the browser. Deletes are exact (word, en) pair matches, so a
// typo just deletes nothing rather than the wrong word.
//
// Body: { password: string, words: [{ word, en }, ...] }

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
    const res = await fetch(new URL("/api/delete", env.RELAY_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RELAY_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ words: body.words || [] })
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
