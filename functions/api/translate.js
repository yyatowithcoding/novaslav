// Cloudflare Pages Function: POST /api/translate
// Server-side proxy to Google's free public translation endpoint (the same one
// translate.google.com itself uses, no API key/billing needed, unlike the paid
// Cloud Translation API). Proxying through here instead of calling it straight
// from the browser sidesteps any CORS uncertainty and lets us cache results in
// KV so repeat visitors, and repeat page loads, don't keep re-translating the
// same strings.
//
// Body: { texts: string[], target: "sk" | "cs" | "pl" | "hr" | "ru" | ... }
// Response: { translations: string[] }  (same order/length as `texts`)

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, UI copy doesn't change often

async function hashText(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

async function translateOne(text, target) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(target) + "&dt=t&q=" + encodeURIComponent(text);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error("upstream " + res.status);
  const data = await res.json();
  return (data[0] || []).map((seg) => seg[0]).join("");
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "body must be JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const texts = Array.isArray(body.texts) ? body.texts.filter((t) => typeof t === "string" && t.trim()) : [];
  const target = typeof body.target === "string" ? body.target.trim() : "";

  if (!texts.length || !target || target === "en") {
    return new Response(JSON.stringify({ translations: texts }), {
      headers: { "content-type": "application/json" }
    });
  }

  const results = new Array(texts.length);
  const pending = []; // { index, text, cacheKey }

  for (let i = 0; i < texts.length; i++) {
    const cacheKey = env.WORDS_CACHE ? "i18n:" + target + ":" + (await hashText(texts[i])) : null;
    const cached = cacheKey ? await env.WORDS_CACHE.get(cacheKey) : null;
    if (cached !== null && cached !== undefined) {
      results[i] = cached;
    } else {
      pending.push({ index: i, text: texts[i], cacheKey });
    }
  }

  if (pending.length) {
    await Promise.all(pending.map(async (item) => {
      let translated;
      try {
        translated = await translateOne(item.text, target);
      } catch (err) {
        translated = item.text; // fall back to English for this one string
      }
      results[item.index] = translated;
      if (item.cacheKey && translated !== item.text) {
        context.waitUntil(env.WORDS_CACHE.put(item.cacheKey, translated, { expirationTtl: CACHE_TTL_SECONDS }));
      }
    }));
  }

  return new Response(JSON.stringify({ translations: results }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
