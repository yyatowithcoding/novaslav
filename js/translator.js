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

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  var GENDER_TAGS = ["masculine", "feminine", "neuter"];
  var NUMBER_TAGS = ["singular", "plural"];
  var FORMALITY_TAGS = ["formal", "informal"];

  // A qualifier at the end of an "en" field, like "my / mine (feminine)" or
  // "your / yours (plural, formal)", describes the *whole* entry, every "/"
  // alternate before it, not just whichever word happens to sit next to the
  // parentheses. Pulls that trailing qualifier off once (splitting on "," or
  // "/" inside the parens, either separator shows up in the wild), then
  // splits the remaining alternates.
  function parseEntryEn(enField) {
    var gender = null, number = null, formality = null;
    var withoutTrailingQualifier = enField.replace(/\(([^)]*)\)\s*$/, function (m, inner) {
      inner.split(/[,/]/).forEach(function (p) {
        p = p.trim().toLowerCase();
        if (GENDER_TAGS.indexOf(p) !== -1) gender = p;
        if (NUMBER_TAGS.indexOf(p) !== -1) number = p;
        if (FORMALITY_TAGS.indexOf(p) !== -1) formality = p;
      });
      return "";
    }).trim();
    var alts = withoutTrailingQualifier.split("/").map(function (s) {
      return s.trim().toLowerCase().replace(/\s*\([^)]*\)\s*/g, "").trim();
    });
    return { alts: alts, gender: gender, number: number, formality: formality };
  }

  // Finds every dictionary entry whose English meaning (any "/" alternate)
  // matches phrase, tagged with whatever gender/number/formality qualifier
  // that entry carried. Multiple hits means a real ambiguity (e.g. "you"
  // existing as separate singular/plural entries, or "my" as separate
  // masculine/feminine/neuter ones).
  function findVariants(phrase) {
    var results = [];
    NOVASLAV_DATA.forEach(function (w) {
      var parsed = parseEntryEn(w.en);
      if (parsed.alts.indexOf(phrase) !== -1) {
        results.push({ entry: w, gender: parsed.gender, number: parsed.number, formality: parsed.formality });
      }
    });
    return results;
  }

  // Also matches by literal Novaslav spelling (case-insensitive is fine here,
  // this only ever runs inside the phrase loop after the English check already
  // failed, and altMatches below still guards English-collision-prone lookups
  // separately). Used to detect a following noun's gender for agreement.
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

  // Looks past the current position for the next noun this engine can resolve,
  // to infer gender agreement for a possessive/adjective earlier in the sentence
  // ("moja kniga" needs to know "kniga" is feminine before picking "moja" over "moj").
  function detectUpcomingGender(rawTokens, fromIndex) {
    var lookahead = Math.min(rawTokens.length, fromIndex + 6);
    for (var j = fromIndex; j < lookahead; j++) {
      var w = cleanToken(rawTokens[j]);
      if (!w) continue;
      var hit = NOVASLAV_DATA.find(function (entry) {
        return entry.cat === "Nouns" && altMatches(entry.en, w);
      });
      if (hit && (hit.gender === "masculine" || hit.gender === "feminine" || hit.gender === "neuter")) {
        return hit.gender;
      }
    }
    return null;
  }

  // Merges a variant's entry fields with its gender/number/formality/assumed
  // metadata into one flat object, so callers can use it exactly like a plain
  // dictionary entry (matched.cat, matched.word, matched.past, ...) while
  // still knowing how it was picked.
  function flattenVariant(v, assumed) {
    var out = {};
    for (var k in v.entry) out[k] = v.entry[k];
    out._gender = v.gender;
    out._number = v.number;
    out._formality = v.formality;
    out._assumed = !!assumed;
    return out;
  }

  // Resolves which variant to use when a word has more than one gender/number/
  // formality form. Priority: an explicit manual selector, then auto-detected
  // gender agreement from context, then just the first variant (flagged as
  // an assumption so the UI can say so).
  function pickVariant(variants, prefs, rawTokens, fromIndex) {
    if (variants.length === 1) return flattenVariant(variants[0], false);

    if (prefs.gender !== "auto") {
      var byPrefGender = variants.find(function (v) { return v.gender === prefs.gender; });
      if (byPrefGender) return flattenVariant(byPrefGender, false);
    }
    if (prefs.number !== "auto") {
      var byPrefNumber = variants.find(function (v) { return v.number === prefs.number; });
      if (byPrefNumber) return flattenVariant(byPrefNumber, false);
    }
    if (prefs.formality !== "auto") {
      var byPrefFormality = variants.find(function (v) { return v.formality === prefs.formality; });
      if (byPrefFormality) return flattenVariant(byPrefFormality, false);
    }

    var hasGenderVariants = variants.some(function (v) { return v.gender; });
    if (hasGenderVariants) {
      var detected = detectUpcomingGender(rawTokens, fromIndex + 1);
      if (detected) {
        var byDetected = variants.find(function (v) { return v.gender === detected; });
        if (byDetected) return flattenVariant(byDetected, false);
      }
    }

    // Couldn't resolve it. If the variants actually differ by gender/number/
    // formality, flag the guess so the UI can tell the user to check the
    // selectors. If they're unrelated homonyms (e.g. "love" the verb vs.
    // "love" the noun), there's nothing to "assume", just pick the first one
    // quietly as before.
    var hasNumberVariants = variants.some(function (v) { return v.number; });
    var hasFormalityVariants = variants.some(function (v) { return v.formality; });
    return flattenVariant(variants[0], hasGenderVariants || hasNumberVariants || hasFormalityVariants);
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
  // *or* in Novaslav, is left exactly as typed (no brackets) and reported in
  // `missing` so the UI can explain why, instead of failing the whole sentence.
  function translateEnToNov(inputText, tense, prefs) {
    prefs = prefs || { gender: "auto", number: "auto", formality: "auto" };
    var clean = inputText.trim().replace(/[.!?]+$/, "");
    if (!clean) return buildError("Type something to translate.");

    var rawTokens = clean.split(/\s+/);
    var outWords = [];
    var missingFlags = [];
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
        var variants = findVariants(phrase);
        if (variants.length) {
          matched = pickVariant(variants, prefs, rawTokens, i);
          matchedLen = len;
          break;
        }
        var novEntry = findByNovaslavWord(phraseCased);
        if (novEntry) { matched = novEntry; matchedLen = len; break; }
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
        missingFlags.push(false);
        var tags = [matched._gender, matched._number, matched._formality].filter(Boolean);
        var desc = describeMatch(matched, tense, matched.cat === "Nouns" && pendingDefinite);
        if (tags.length) {
          desc += matched._assumed
            ? " Assumed " + tags.join(", ") + " (use the selectors below to change)."
            : " (" + tags.join(", ") + ")";
        }
        breakdown[outForm] = desc;
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
        missingFlags.push(false);
        breakdown[pEntry.word] = describeMatch(pEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      if (COPULA_WORDS.indexOf(lower) !== -1) {
        var beEntry = findWord("Verbs", "be");
        var beForm = tense === "past" ? beEntry.past : beEntry.pres;
        outWords.push(beForm);
        missingFlags.push(false);
        breakdown[beForm] = describeMatch(beEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      var verbBase = VERB_ALIASES[lower];
      if (verbBase) {
        var vEntry = findWord("Verbs", VERB_BASE_TO_EN[verbBase]);
        var vForm = tense === "past" ? vEntry.past : vEntry.pres;
        outWords.push(vForm);
        missingFlags.push(false);
        breakdown[vForm] = describeMatch(vEntry, tense, false);
        pendingDefinite = false;
        i++; continue;
      }

      // Not found anywhere, in Novaslav or in English. Left exactly as typed,
      // no brackets, just flagged for the missing-words banner.
      outWords.push(raw);
      missingFlags.push(true);
      missing.push(raw);
      pendingDefinite = false;
      i++;
    }

    return {
      target: capitalize(outWords.join(" ")) + ".",
      targetWords: outWords,
      targetMissingFlags: missingFlags,
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
    var missingFlags = [];
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
        missingFlags.push(false);
        i += matchedLen;
        continue;
      }

      outWords.push(raw);
      missingFlags.push(true);
      missing.push(raw);
      i++;
    }

    return {
      target: capitalize(outWords.join(" ")) + ".",
      targetWords: outWords,
      targetMissingFlags: missingFlags,
      grammar_breakdown: breakdown,
      missing: missing
    };
  }

  function buildTargetHtml(result) {
    var words = result.targetWords || [];
    var flags = result.targetMissingFlags || [];
    var html = words.map(function (w, idx) {
      var safe = escapeHtml(w);
      return flags[idx] ? '<span class="missing-word" title="Not in the dictionary yet">' + safe + "</span>" : safe;
    }).join(" ");
    return capitalize(html) + ".";
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
    var speakText = result.target.replace(/\.$/, "");
    var speakBtn = isNovTarget && window.NovaslavTTS ? window.NovaslavTTS.button(speakText) : "";
    targetOutput.innerHTML = buildTargetHtml(result) + speakBtn;

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
        " (highlighted above), so " + (result.missing.length === 1 ? "it was" : "they were") +
        " left exactly as typed instead of being translated.";
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
    var genderSel = document.getElementById("genderPref");
    var numberSel = document.getElementById("numberPref");
    var formalitySel = document.getElementById("formalityPref");
    var prefs = {
      gender: genderSel ? genderSel.value : "auto",
      number: numberSel ? numberSel.value : "auto",
      formality: formalitySel ? formalitySel.value : "auto"
    };
    var result = state.direction === "en-nov" ? translateEnToNov(text, tense, prefs) : translateNovToEn(text);
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
    var targetText = (state.lastTarget || "").replace(/\.$/, "").trim();

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

    var genderSel = document.getElementById("genderPref");
    var numberSel = document.getElementById("numberPref");
    var formalitySel = document.getElementById("formalityPref");
    if (genderSel) genderSel.addEventListener("change", run);
    if (numberSel) numberSel.addEventListener("change", run);
    if (formalitySel) formalitySel.addEventListener("change", run);

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
