(function () {
  var PRONOUN_MAP = {
    i: "I", you: "you (singular)", he: "he", she: "she",
    it: "it", we: "we", they: "they"
  };

  var COPULA_WORDS = ["am", "is", "are", "was", "were", "be"];

  var VERB_ALIASES = {
    love: "love", loves: "love", loved: "love",
    be: "be", am: "be", is: "be", are: "be", was: "be", were: "be",
    have: "have", has: "have", had: "have",
    see: "see", sees: "see", saw: "see",
    go: "go", goes: "go", went: "go", walk: "go", walks: "go", walked: "go",
    want: "want", wants: "want", wanted: "want",
    eat: "eat", eats: "eat", ate: "eat",
    drink: "drink", drinks: "drink", drank: "drink",
    do: "do", does: "do", did: "do", make: "do", makes: "do", made: "do",
    know: "know", knows: "know", knew: "know",
    say: "say", says: "say", said: "say"
  };

  var VERB_BASE_TO_EN = {
    love: "love", be: "be", have: "have", see: "see", go: "go / walk",
    want: "want", eat: "eat", drink: "drink", do: "do / make", know: "know", say: "say"
  };

  var MAX_PHRASE_WORDS = 4;

  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cleanToken(t) {
    return t.toLowerCase().replace(/[.,!?;:"'()]/g, "").trim();
  }

  // Same as cleanToken but keeps original casing, for exact-case Novaslav matching.
  function cleanTokenCased(t) {
    return t.replace(/[.,!?;:"'()]/g, "").trim();
  }

  function firstAlt(enField) {
    return enField.split("/")[0].trim().replace(/\s*\([^)]*\)\s*/g, "").trim();
  }

  function findWord(cat, en) {
    return NOVASLAV_DATA.find(function (w) { return w.cat === cat && w.en === en; });
  }

  // English "en" fields can hold alternates ("go / walk") and parenthetical
  // qualifiers ("love (noun)", "you (singular)"). Match against any of them.
  function altMatches(enField, target) {
    if (!enField) return false;
    var alts = enField.split("/").map(function (s) { return s.trim().toLowerCase(); });
    for (var i = 0; i < alts.length; i++) {
      var alt = alts[i];
      var bare = alt.replace(/\s*\([^)]*\)\s*/g, "").trim();
      if (alt === target || bare === target) return true;
    }
    return false;
  }

  // Checks the *whole* dictionary by English meaning.
  function findByEnglish(phrase) {
    if (!phrase) return null;
    return NOVASLAV_DATA.find(function (w) { return altMatches(w.en, phrase); }) || null;
  }

  // Checks the *whole* dictionary by the Novaslav side too (base word, definite
  // form, present, or past), so typing an already-Novaslav word or phrase works.
  // Exact case on purpose: several short Novaslav pronouns are spelled like common
  // English words when lowercased ("My" = we, "On" = he), so a case-insensitive
  // check here would wrongly hijack plain English "my"/"on" mid-sentence.
  function findByNovaslavWord(phraseCased) {
    if (!phraseCased) return null;
    return NOVASLAV_DATA.find(function (w) {
      return w.word === phraseCased || w.def === phraseCased ||
        w.pres === phraseCased || w.past === phraseCased;
    }) || null;
  }

  // Used from the dedicated Novaslav input box, so there's no English to collide
  // with, safe to be case-insensitive here (and returns which field matched).
  function findByNovaslavWordCI(phrase) {
    if (!phrase) return null;
    var p = phrase.toLowerCase();
    var fields = ["word", "def", "pres", "past"];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var entry = NOVASLAV_DATA.find(function (w) { return w[f] && w[f].toLowerCase() === p; });
      if (entry) return { entry: entry, field: f };
    }
    return null;
  }

  function describeMatch(entry, tense, wasDefinite) {
    if (entry.cat === "Verbs") {
      return 'Verb ("' + entry.en + '"), ' + (tense === "past" ? "past" : "present") + " tense, same form no matter the subject.";
    }
    if (entry.cat === "Nouns") {
      return 'Noun ("' + entry.en + '")' + (wasDefinite ? ", definite form." : ", indefinite base form.");
    }
    if (entry.cat === "Adjectives") {
      return 'Adjective ("' + entry.en + '"). Adjectives don’t inflect.';
    }
    if (entry.cat === "Pronouns") {
      return 'Pronoun ("' + entry.en + '").';
    }
    return capitalize(entry.cat.replace(/s$/, "")) + ' ("' + entry.en + '").';
  }

  function buildError(msg) {
    return { error: msg };
  }

  // Best-effort, word-by-word (and phrase-by-phrase) translation from English
  // into Novaslav. Anything it can't find anywhere in the dictionary, in English
  // *or* in Novaslav, gets left as-is in brackets and reported in `missing`
  // instead of failing the whole sentence outright.
  function translateEnToNov(inputText, tense) {
    var clean = inputText.trim().replace(/[.!?]+$/, "");
    if (!clean) return buildError("Type something to translate.");

    var rawTokens = clean.split(/\s+/);
    var outWords = [];
    var breakdown = {};
    var missing = [];
    var pendingDefinite = false;

    var i = 0;
    while (i < rawTokens.length) {
      var raw = rawTokens[i];
      var lower = cleanToken(raw);
      if (!lower) { i++; continue; }

      if (lower === "the") { pendingDefinite = true; i++; continue; }
      if (lower === "a" || lower === "an") { pendingDefinite = false; i++; continue; }

      // Try the longest phrase first (catches multi-word entries like "thank you"
      // or "dobri deň" before their individual words get parsed separately).
      var matched = null, matchedLen = 0;
      for (var len = Math.min(MAX_PHRASE_WORDS, rawTokens.length - i); len >= 1; len--) {
        var slice = rawTokens.slice(i, i + len);
        var phrase = slice.map(cleanToken).join(" ");
        var phraseCased = slice.map(cleanTokenCased).join(" ");
        if (!phrase) continue;
        var entry = findByEnglish(phrase) || findByNovaslavWord(phraseCased);
        if (entry) { matched = entry; matchedLen = len; break; }
      }

      if (matched) {
        var outForm;
        if (matched.cat === "Verbs") {
          outForm = tense === "past" ? matched.past : matched.pres;
        } else if (matched.cat === "Nouns" && pendingDefinite && matched.def) {
          outForm = matched.def;
        } else {
          outForm = matched.word;
        }
        outWords.push(outForm);
        breakdown[outForm] = describeMatch(matched, tense, matched.cat === "Nouns" && pendingDefinite);
        pendingDefinite = false;
        i += matchedLen;
        continue;
      }

      // Grammar-only single-token fallbacks (pronouns/copula/verb inflections
      // aren't stored as literal dictionary alternates, so they need their own check).
      var pronounEn = PRONOUN_MAP[lower];
      if (pronounEn) {
        var pEntry = findWord("Pronouns", pronounEn);
        outWords.push(pEntry.word);
        breakdown[pEntry.word] = describeMatch(pEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      if (COPULA_WORDS.indexOf(lower) !== -1) {
        var beEntry = findWord("Verbs", "be");
        var beForm = tense === "past" ? beEntry.past : beEntry.pres;
        outWords.push(beForm);
        breakdown[beForm] = describeMatch(beEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      var verbBase = VERB_ALIASES[lower];
      if (verbBase) {
        var vEntry = findWord("Verbs", VERB_BASE_TO_EN[verbBase]);
        var vForm = tense === "past" ? vEntry.past : vEntry.pres;
        outWords.push(vForm);
        breakdown[vForm] = describeMatch(vEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      // Not found anywhere, in Novaslav or in English. Keep it visible, don't stop.
      outWords.push("[" + raw + "]");
      missing.push(raw);
      pendingDefinite = false;
      i++;
    }

    return {
      target: capitalize(outWords.join(" ")) + ".",
      grammar_breakdown: breakdown,
      missing: missing
    };
  }

  // Reverse direction: Novaslav -> English. No English collision risk here since
  // the whole box is committed to being Novaslav, so this stays case-insensitive.
  function translateNovToEn(inputText) {
    var clean = inputText.trim().replace(/[.!?]+$/, "");
    if (!clean) return buildError("Type something to translate.");

    var rawTokens = clean.split(/\s+/);
    var outWords = [];
    var breakdown = {};
    var missing = [];

    var i = 0;
    while (i < rawTokens.length) {
      var raw = rawTokens[i];
      var lower = cleanToken(raw);
      if (!lower) { i++; continue; }

      var matched = null, matchedLen = 0, matchedField = "word";
      for (var len = Math.min(MAX_PHRASE_WORDS, rawTokens.length - i); len >= 1; len--) {
        var phrase = rawTokens.slice(i, i + len).map(cleanToken).join(" ");
        if (!phrase) continue;
        var hit = findByNovaslavWordCI(phrase);
        if (hit) { matched = hit.entry; matchedField = hit.field; matchedLen = len; break; }
      }

      if (matched) {
        var enOut = firstAlt(matched.en);
        var label = rawTokens.slice(i, i + matchedLen).join(" ");
        if (matched.cat === "Verbs" && matchedField === "past") {
          enOut = enOut + " (past)";
          breakdown[label] = 'Verb ("' + matched.en + '"), past tense.';
        } else if (matched.cat === "Nouns" && matchedField === "def") {
          enOut = "the " + enOut;
          breakdown[label] = 'Noun ("' + matched.en + '"), definite form.';
        } else {
          breakdown[label] = describeMatch(matched, "pres", false);
        }
        outWords.push(enOut);
        i += matchedLen;
        continue;
      }

      outWords.push("[" + raw + "]");
      missing.push(raw);
      i++;
    }

    return {
      target: capitalize(outWords.join(" ")) + ".",
      grammar_breakdown: breakdown,
      missing: missing
    };
  }

  function render(result, direction) {
    var errorWrap = document.getElementById("errorWrap");
    var missingWrap = document.getElementById("missingWrap");
    var targetOutput = document.getElementById("targetOutput");

    if (result.error) {
      errorWrap.style.display = "block";
      errorWrap.innerHTML = result.error;
      missingWrap.style.display = "none";
      targetOutput.innerHTML = "";
      document.getElementById("outBreakdown").innerHTML = "";
      state.lastTarget = "";
      return;
    }
    errorWrap.style.display = "none";
    state.lastTarget = result.target;

    var isNovTarget = direction === "en-nov";
    var speakText = result.target.replace(/\.$/, "").replace(/[\[\]]/g, "");
    var speakBtn = isNovTarget && window.NovaslavTTS ? window.NovaslavTTS.button(speakText) : "";
    targetOutput.innerHTML = result.target + speakBtn;

    var bd = document.getElementById("outBreakdown");
    var keys = Object.keys(result.grammar_breakdown);
    bd.innerHTML = keys.length
      ? keys.map(function (k) {
          return '<div class="breakdown-row"><b>' + k + "</b><span>" + result.grammar_breakdown[k] + "</span></div>";
        }).join("")
      : '<p style="color:var(--text-dim); margin:0;">Nothing recognized yet.</p>';

    if (result.missing && result.missing.length) {
      missingWrap.style.display = "block";
      missingWrap.innerHTML = "<b>Not in the dictionary yet:</b> " +
        result.missing.map(function (w) { return '"' + w + '"'; }).join(", ") +
        ". Left as-is in brackets above.";
    } else {
      missingWrap.style.display = "none";
      missingWrap.innerHTML = "";
    }

    document.getElementById("jsonView").textContent = JSON.stringify({
      target: result.target,
      grammar_breakdown: result.grammar_breakdown,
      missing: result.missing || []
    }, null, 2);
  }

  var state = { direction: "en-nov", lastTarget: "" };

  function run() {
    var text = document.getElementById("sourceInput").value;
    var tense = document.querySelector('input[name="tense"]:checked').value;
    var result = state.direction === "en-nov" ? translateEnToNov(text, tense) : translateNovToEn(text);
    render(result, state.direction);
  }

  var debounceHandle = null;
  function runDebounced() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(run, 300);
  }

  function updateLabels() {
    var fromLabel = document.getElementById("sourceLabel");
    var toLabel = document.getElementById("targetLabel");
    if (state.direction === "en-nov") {
      fromLabel.textContent = "English";
      toLabel.textContent = "Novôslav";
    } else {
      fromLabel.textContent = "Novôslav";
      toLabel.textContent = "English";
    }
  }

  function swap() {
    var sourceInput = document.getElementById("sourceInput");
    var targetText = (state.lastTarget || "").replace(/\.$/, "").replace(/[\[\]]/g, "").trim();

    state.direction = state.direction === "en-nov" ? "nov-en" : "en-nov";
    updateLabels();
    if (targetText) sourceInput.value = targetText;
    run();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var sourceInput = document.getElementById("sourceInput");
    sourceInput.addEventListener("input", runDebounced);

    document.querySelectorAll('input[name="tense"]').forEach(function (r) {
      r.addEventListener("change", run);
    });

    document.getElementById("swapBtn").addEventListener("click", swap);

    document.querySelectorAll(".chip[data-example]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (state.direction !== "en-nov") {
          state.direction = "en-nov";
          updateLabels();
        }
        sourceInput.value = chip.dataset.example;
        run();
      });
    });

    document.getElementById("jsonToggle").addEventListener("click", function () {
      var view = document.getElementById("jsonView");
      view.classList.toggle("show");
      this.textContent = view.classList.contains("show") ? "Hide JSON" : "Show JSON";
    });

    sourceInput.disabled = true;
    document.getElementById("targetOutput").textContent = "Loading words...";

    NOVASLAV_DATA_READY.then(function () {
      sourceInput.disabled = false;
      run();
    });
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { translateEnToNov: translateEnToNov, translateNovToEn: translateNovToEn };
  }
})();
