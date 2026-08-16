/* Novaslav lexicon loader.
   NOVASLAV_DATA starts empty and gets filled once /api/words responds (that endpoint
   is a Cloudflare Pages Function that proxies to the relay bot, which reads MongoDB).
   Every consumer (dictionary.js, translator.js, practice.js) should do:
     NOVASLAV_DATA_READY.then(function () { ...render using NOVASLAV_DATA... });
   If the API isn't reachable (relay down, or you're just serving static files without
   Functions), NOVASLAV_SEED_FALLBACK is used instead so the site still works.

   Novaslav is written in plain Latin letters, plus a handful of accented ones for
   sounds that need them: a/o -> a o, s -> s, c -> c, plus s, c, d, t, l, n.
   Nothing outside that set, no other alphabet involved.
   gender: "common" (-en) or "neuter" (-et), used for definite nouns. */

const NOVASLAV_CATEGORIES = [
  "Pronouns", "Verbs", "Nouns", "Adjectives", "Numbers", "Question Words",
  "Adverbs", "Prepositions", "Conjunctions"
];

const NOVASLAV_SEED_FALLBACK = [
  // Pronouns
  { word: "Jag", en: "I", cat: "Pronouns" },
  { word: "Ty", en: "you (singular)", cat: "Pronouns" },
  { word: "On", en: "he", cat: "Pronouns" },
  { word: "Ona", en: "she", cat: "Pronouns" },
  { word: "Det", en: "it", cat: "Pronouns", note: "Neuter pronoun." },
  { word: "My", en: "we", cat: "Pronouns" },
  { word: "Vy", en: "you (plural)", cat: "Pronouns" },
  { word: "Oni", en: "they", cat: "Pronouns" },

  // Verbs: root + present (-ar/-er) + past (-te/-de)
  { word: "miluar", en: "love", cat: "Verbs", pres: "miluar", past: "milude" },
  { word: "byar", en: "be", cat: "Verbs", pres: "byar", past: "byde" },
  { word: "macar", en: "have", cat: "Verbs", pres: "macar", past: "macde" },
  { word: "vidar", en: "see", cat: "Verbs", pres: "vidar", past: "vidte" },
  { word: "hodar", en: "go / walk", cat: "Verbs", pres: "hodar", past: "hodte" },
  { word: "hocar", en: "want", cat: "Verbs", pres: "hocar", past: "hocde" },
  { word: "edar", en: "eat", cat: "Verbs", pres: "edar", past: "edte" },
  { word: "piyar", en: "drink", cat: "Verbs", note: "A glide 'y' gets inserted so two vowels never bump into each other.", pres: "piyar", past: "piyde" },
  { word: "delar", en: "do / make", cat: "Verbs", pres: "delar", past: "delde" },
  { word: "znayar", en: "know", cat: "Verbs", pres: "znayar", past: "znayde" },
  { word: "kazar", en: "say", cat: "Verbs", pres: "kazar", past: "kazde" },

  // Nouns: base + definite (-en common / -et neuter)
  { word: "kôn", en: "horse", cat: "Nouns", gender: "common", def: "kônen" },
  { word: "serd", en: "heart", cat: "Nouns", gender: "neuter", def: "serdet" },
  { word: "dom", en: "house", cat: "Nouns", gender: "neuter", def: "domet" },
  { word: "vod", en: "water", cat: "Nouns", gender: "common", def: "voden" },
  { word: "druh", en: "friend", cat: "Nouns", gender: "common", def: "druhen" },
  { word: "knig", en: "book", cat: "Nouns", gender: "common", def: "knigen" },
  { word: "sôln", en: "sun", cat: "Nouns", gender: "common", def: "sôlnen" },
  { word: "lun", en: "moon", cat: "Nouns", gender: "common", def: "lunen" },
  { word: "ďec", en: "child", cat: "Nouns", gender: "neuter", def: "ďecet" },
  { word: "deň", en: "day", cat: "Nouns", gender: "common", def: "deňen" },
  { word: "noč", en: "night", cat: "Nouns", gender: "common", def: "nočen" },
  { word: "lyubov", en: "love (noun)", cat: "Nouns", gender: "common", def: "lyuboven" },

  // Adjectives
  { word: "dobri", en: "good", cat: "Adjectives" },
  { word: "veľki", en: "big", cat: "Adjectives" },
  { word: "mali", en: "small", cat: "Adjectives" },
  { word: "krasi", en: "beautiful", cat: "Adjectives" },
  { word: "stari", en: "old", cat: "Adjectives" },
  { word: "novi", en: "new", cat: "Adjectives" },

  // Numbers
  { word: "yeden", en: "one", cat: "Numbers" },
  { word: "dva", en: "two", cat: "Numbers" },
  { word: "tri", en: "three", cat: "Numbers" },
  { word: "štiri", en: "four", cat: "Numbers" },
  { word: "pyať", en: "five", cat: "Numbers" },
  { word: "šesť", en: "six", cat: "Numbers" },
  { word: "sedem", en: "seven", cat: "Numbers" },
  { word: "osem", en: "eight", cat: "Numbers" },
  { word: "devyať", en: "nine", cat: "Numbers" },
  { word: "desyať", en: "ten", cat: "Numbers" },

  // Question words
  { word: "co", en: "what", cat: "Question Words" },
  { word: "hto", en: "who", cat: "Question Words" },
  { word: "de", en: "where", cat: "Question Words" },
  { word: "koli", en: "when", cat: "Question Words" },
  { word: "čomu", en: "why", cat: "Question Words" },
  { word: "yak", en: "how", cat: "Question Words" }
];

var NOVASLAV_DATA = [];

var NOVASLAV_DATA_READY = fetch("/api/words")
  .then(function (res) {
    if (!res.ok) throw new Error("bad status " + res.status);
    return res.json();
  })
  .then(function (data) {
    if (!Array.isArray(data) || !data.length) throw new Error("empty or invalid response");
    NOVASLAV_DATA.length = 0;
    Array.prototype.push.apply(NOVASLAV_DATA, data);
    return NOVASLAV_DATA;
  })
  .catch(function (err) {
    console.warn("Live word list unavailable, using the bundled fallback:", err);
    NOVASLAV_DATA.length = 0;
    Array.prototype.push.apply(NOVASLAV_DATA, NOVASLAV_SEED_FALLBACK);
    return NOVASLAV_DATA;
  });
