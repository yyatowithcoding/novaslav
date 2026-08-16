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

  function findWord(cat, en) {
    return NOVASLAV_DATA.find(function (w) { return w.cat === cat && w.en === en; });
  }

  function findNounByEnglish(word) {
    return NOVASLAV_DATA.find(function (w) {
      if (w.cat !== "Nouns") return false;
      return w.en.toLowerCase().replace(" (noun)", "") === word;
    });
  }

  function findAdjectiveByEnglish(word) {
    return NOVASLAV_DATA.find(function (w) { return w.cat === "Adjectives" && w.en.toLowerCase() === word; });
  }

  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function stripArticle(tokens) {
    var definite = false, indefinite = false;
    if (tokens[0] === "the") { definite = true; tokens = tokens.slice(1); }
    else if (tokens[0] === "a" || tokens[0] === "an") { indefinite = true; tokens = tokens.slice(1); }
    return { definite: definite, indefinite: indefinite, rest: tokens };
  }

  function wordLookup(word) {
    var matches = NOVASLAV_DATA.filter(function (w) {
      return w.en.toLowerCase().replace(" (noun)", "") === word || w.en.toLowerCase() === word;
    });
    if (!matches.length) return null;
    return matches;
  }

  function buildError(msg) {
    return { error: msg };
  }

  function translate(inputText, tense) {
    var clean = inputText.trim().replace(/[.!?]+$/, "");
    if (!clean) return buildError("Type something to build.");

    var rawTokens = clean.split(/\s+/);
    var tokens = rawTokens.map(function (t) { return t.toLowerCase(); });

    // Single word lookup mode
    if (tokens.length === 1) {
      var matches = wordLookup(tokens[0]);
      if (!matches) {
        return buildError('"' + rawTokens[0] + '" isn’t in the dictionary yet. Try a word from the Dictionary page.');
      }
      var m = matches[0];
      var breakdown = {};
      var novOut = m.word;
      if (m.cat === "Nouns") {
        novOut = m.word + " / " + m.def;
        breakdown[m.word] = "Noun, indefinite base form.";
        breakdown[m.def] = "Definite form (\"the " + m.en + "\"), " + (m.gender || "common") + " gender suffix.";
      } else if (m.cat === "Verbs") {
        novOut = m.pres + " / " + m.past;
        breakdown[m.pres] = "Present tense.";
        breakdown[m.past] = "Past tense.";
      } else {
        breakdown[m.word] = capitalize(m.cat.replace(/s$/, ""));
      }
      return {
        mode: "word",
        novaslav: novOut,
        english_translation: m.en,
        grammar_breakdown: breakdown
      };
    }

    // Sentence mode
    var pronounKey = PRONOUN_MAP[tokens[0]];
    if (!pronounKey) {
      return buildError('Unknown subject "' + rawTokens[0] + '". Try: I, you, he, she, it, we, they.');
    }
    var pronounEntry = findWord("Pronouns", pronounKey);
    var rest = tokens.slice(1);
    if (!rest.length) {
      return buildError("Add a verb after the subject, e.g. \"" + rawTokens[0] + " love the horse\".");
    }

    var breakdown = {};
    breakdown[pronounEntry.word] = "Pronoun (\"" + pronounEntry.en + "\").";

    var outTokens = [pronounEntry.word];

    if (COPULA_WORDS.indexOf(rest[0]) !== -1) {
      var beEntry = findWord("Verbs", "be");
      var beForm = tense === "past" ? beEntry.past : beEntry.pres;
      outTokens.push(beForm);
      breakdown[beForm] = "Verb (\"be\"), " + (tense === "past" ? "past" : "present") + " tense, same form no matter the subject.";

      var predicateTokens = rest.slice(1);
      if (!predicateTokens.length) return buildError('Add what follows "' + rest[0] + '", e.g. "he is good".');
      var artInfo = stripArticle(predicateTokens);
      var predicateWord = artInfo.rest.join(" ");

      var adj = findAdjectiveByEnglish(predicateWord);
      if (adj) {
        outTokens.push(adj.word);
        breakdown[adj.word] = "Adjective (\"" + adj.en + "\"). Adjectives don’t inflect.";
      } else {
        var noun = findNounByEnglish(predicateWord);
        if (!noun) return buildError('Unknown word "' + predicateWord + '". Check the Dictionary for supported vocabulary.');
        if (artInfo.definite) {
          outTokens.push(noun.def);
          breakdown[noun.def] = "Noun (\"the " + noun.en + "\"), " + (noun.gender || "common") + " definite suffix.";
        } else {
          outTokens.push(noun.word);
          breakdown[noun.word] = "Noun (\"" + noun.en + "\"), indefinite base form.";
        }
      }
    } else {
      var verbBase = VERB_ALIASES[rest[0]];
      if (!verbBase) {
        return buildError('Unknown verb "' + rest[0] + '". Try: love, be, have, see, go, want, eat, drink, do, know, say.');
      }
      var verbEntry = findWord("Verbs", VERB_BASE_TO_EN[verbBase]);
      var verbForm = tense === "past" ? verbEntry.past : verbEntry.pres;
      outTokens.push(verbForm);
      breakdown[verbForm] = "Verb (\"" + verbEntry.en + "\"), " + (tense === "past" ? "past" : "present") + " tense, same form no matter the subject.";

      var objTokens = rest.slice(1);
      if (objTokens.length) {
        var oArt = stripArticle(objTokens);
        var objWord = oArt.rest.join(" ");
        var objNoun = findNounByEnglish(objWord);
        if (!objNoun) return buildError('Unknown noun "' + objWord + '". Check the Dictionary for supported vocabulary.');
        if (oArt.definite) {
          outTokens.push(objNoun.def);
          breakdown[objNoun.def] = "Noun (\"the " + objNoun.en + "\"), " + (objNoun.gender || "common") + " definite suffix.";
        } else {
          outTokens.push(objNoun.word);
          breakdown[objNoun.word] = "Noun (\"" + objNoun.en + "\"), indefinite base form.";
        }
      }
    }

    var novWord = capitalize(outTokens.join(" ")) + ".";

    return {
      mode: "sentence",
      novaslav: novWord,
      english_translation: capitalize(clean) + ".",
      grammar_breakdown: breakdown
    };
  }

  function render(result) {
    var outputWrap = document.getElementById("outputWrap");
    var errorWrap = document.getElementById("errorWrap");

    if (result.error) {
      outputWrap.style.display = "none";
      errorWrap.style.display = "block";
      document.getElementById("errorText").innerHTML = "<b>Couldn’t build that:</b> " + result.error;
      return;
    }
    errorWrap.style.display = "none";
    outputWrap.style.display = "block";

    document.getElementById("outNovaslav").textContent = result.novaslav;
    document.getElementById("outEnglish").textContent = '"' + result.english_translation + '"';

    var bd = document.getElementById("outBreakdown");
    bd.innerHTML = Object.keys(result.grammar_breakdown).map(function (k) {
      return '<div class="breakdown-row"><b>' + k + "</b><span>" + result.grammar_breakdown[k] + "</span></div>";
    }).join("");

    var jsonObj = {
      novaslav: result.novaslav,
      english_translation: result.english_translation,
      grammar_breakdown: result.grammar_breakdown
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
})();
