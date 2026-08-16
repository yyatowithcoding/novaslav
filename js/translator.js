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

  // Best-effort, word-by-word (and phrase-by-phrase) translation. Anything it
  // can't find anywhere in the dictionary, in English *or* in Novaslav, gets
  // left as-is in brackets and reported in `missing` instead of failing outright.
  function translate(inputText, tense) {
    var clean = inputText.trim().replace(/[.!?]+$/, "");
    if (!clean) return buildError("Type something to build.");

    var rawTokens = clean.split(/\s+/);
    var isSingleWordInput = rawTokens.length === 1;
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

        // Pure single-word lookups get a bonus: show the other form too
        // (the definite noun form, or the other verb tense) since there's
        // no sentence context to pick just one.
        if (isSingleWordInput) {
          if (matched.cat === "Nouns" && matched.def && outForm !== matched.def) {
            breakdown[matched.def] = 'Definite form ("the ' + matched.en + '"), ' + (matched.gender || "common") + " gender suffix.";
          } else if (matched.cat === "Verbs") {
            var otherForm = tense === "past" ? matched.pres : matched.past;
            var otherTense = tense === "past" ? "present" : "past";
            breakdown[otherForm] = capitalize(otherTense) + " tense.";
          }
        }

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

    var novWord = capitalize(outWords.join(" ")) + ".";

    return {
      mode: "sentence",
      novaslav: novWord,
      english_translation: capitalize(clean) + ".",
      grammar_breakdown: breakdown,
      missing: missing
    };
  }

  function render(result) {
    var outputWrap = document.getElementById("outputWrap");
    var errorWrap = document.getElementById("errorWrap");
    var missingWrap = document.getElementById("missingWrap");

    if (result.error) {
      outputWrap.style.display = "none";
      missingWrap.style.display = "none";
      errorWrap.style.display = "block";
      document.getElementById("errorText").innerHTML = "<b>Couldn’t build that:</b> " + result.error;
      return;
    }
    errorWrap.style.display = "none";
    outputWrap.style.display = "block";

    var speakBtn = window.NovaslavTTS ? window.NovaslavTTS.button(result.novaslav.replace(/\.$/, "").replace(/[\[\]]/g, "")) : "";
    document.getElementById("outNovaslav").innerHTML = result.novaslav + speakBtn;
    document.getElementById("outEnglish").textContent = '"' + result.english_translation + '"';

    var bd = document.getElementById("outBreakdown");
    bd.innerHTML = Object.keys(result.grammar_breakdown).map(function (k) {
      return '<div class="breakdown-row"><b>' + k + "</b><span>" + result.grammar_breakdown[k] + "</span></div>";
    }).join("");

    if (result.missing && result.missing.length) {
      missingWrap.style.display = "block";
      missingWrap.innerHTML = "<b>Not in the dictionary yet:</b> " +
        result.missing.map(function (w) { return '"' + w + '"'; }).join(", ") +
        ". Left as-is in brackets above.";
    } else {
      missingWrap.style.display = "none";
      missingWrap.innerHTML = "";
    }

    var jsonObj = {
      novaslav: result.novaslav,
      english_translation: result.english_translation,
      grammar_breakdown: result.grammar_breakdown,
      missing: result.missing || []
    };
    document.getElementById("jsonView").textContent = JSON.stringify(jsonObj, null, 2);
    document.getElementById("jsonView").classList.remove("show");
    document.getElementById("jsonToggle").textContent = "Show JSON";
  }

  function run() {
    var text = document.getElementById("inputText").value;
    var tense = document.querySelector('input[name="tense"]:checked').value;
    render(translate(text, tense));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var translateBtn = document.getElementById("translateBtn");
    translateBtn.disabled = true;
    translateBtn.textContent = "Loading words...";

    translateBtn.addEventListener("click", run);
    document.getElementById("inputText").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !translateBtn.disabled) run();
    });
    document.querySelectorAll(".chip[data-example]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.getElementById("inputText").value = chip.dataset.example;
        if (!translateBtn.disabled) run();
      });
    });

    NOVASLAV_DATA_READY.then(function () {
      translateBtn.disabled = false;
      translateBtn.textContent = "Build in Novôslav";
      run();
    });

    document.getElementById("jsonToggle").addEventListener("click", function () {
      var view = document.getElementById("jsonView");
      view.classList.toggle("show");
      this.textContent = view.classList.contains("show") ? "Hide JSON" : "Show JSON";
    });
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { translate: translate };
  }
})();
