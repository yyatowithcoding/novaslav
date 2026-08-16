/* Self-translating pages: real Google Translate output, applied in place like
   i18n instead of redirecting to an external proxy page. No per-string
   dictionary to maintain, any element marked data-i18n gets its original
   (English) text captured on load, then swapped for a translated version
   fetched from /api/translate the first time a language is picked, cached
   afterward in localStorage so repeat visits are instant and free. */
(function () {
  var STORAGE_KEY = "novaslav_lang";
  var CACHE_PREFIX = "novaslav_i18n_";
  var originalText = new WeakMap();

  function getLang() {
    try { return localStorage.getItem(STORAGE_KEY) || "en"; } catch (e) { return "en"; }
  }

  function setLangPref(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
  }

  function cacheKey(lang) {
    return CACHE_PREFIX + lang + ":" + window.location.pathname;
  }

  function loadCache(lang) {
    try {
      var raw = localStorage.getItem(cacheKey(lang));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveCache(lang, map) {
    try { localStorage.setItem(cacheKey(lang), JSON.stringify(map)); } catch (e) { /* ignore, e.g. quota */ }
  }

  function collectElements() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-i18n]"));
  }

  function captureOriginal(elements) {
    elements.forEach(function (el) {
      if (!originalText.has(el)) originalText.set(el, el.textContent);
    });
  }

  function applyFromMap(elements, map) {
    elements.forEach(function (el) {
      var src = originalText.get(el);
      if (src && map[src]) el.textContent = map[src];
    });
  }

  function restoreOriginal(elements) {
    elements.forEach(function (el) {
      var src = originalText.get(el);
      if (src !== undefined) el.textContent = src;
    });
  }

  function translatePage(lang) {
    var elements = collectElements();
    captureOriginal(elements);

    if (lang === "en") {
      restoreOriginal(elements);
      document.documentElement.removeAttribute("data-site-lang");
      return Promise.resolve();
    }

    document.documentElement.setAttribute("data-site-lang", lang);

    var cached = loadCache(lang);
    if (cached) {
      applyFromMap(elements, cached);
      return Promise.resolve();
    }

    var uniqueTexts = [];
    var seen = {};
    elements.forEach(function (el) {
      var src = originalText.get(el);
      if (src && src.trim() && !seen[src]) { seen[src] = true; uniqueTexts.push(src); }
    });
    if (!uniqueTexts.length) return Promise.resolve();

    return fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: uniqueTexts, target: lang })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var map = {};
        (data.translations || []).forEach(function (t, i) { map[uniqueTexts[i]] = t; });
        saveCache(lang, map);
        applyFromMap(elements, map);
      })
      .catch(function () { /* stays in English on failure */ });
  }

  window.NovaslavI18n = {
    getLang: getLang,
    setLang: function (lang) {
      setLangPref(lang);
      translatePage(lang);
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var lang = getLang();
    if (lang !== "en") translatePage(lang);
  });
})();
