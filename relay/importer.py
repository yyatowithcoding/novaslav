"""Parsing + conjugation rules for bulk word imports.

Line format (comma-separated, one word per line, '#' starts a comment):
    word, english, category[, gender]

Novaslav is written in plain Latin letters, plus a handful of accented ones
for sounds that need them: a  o, s  c, d  , t  , l  , n  . Nothing outside
that set, no other alphabet involved.

`gender` only matters for Nouns ("common" or "neuter", defaults to "common").
Definite noun forms and verb past-tense forms are derived automatically using
the same suffix rules documented on the site's Learn page, so you don't have
to type every form by hand.
"""

NOVASLAV_CATEGORIES = ["Pronouns", "Verbs", "Nouns", "Adjectives", "Numbers", "Question Words"]

_CATEGORY_ALIASES = {
    "pronoun": "Pronouns",
    "verb": "Verbs",
    "noun": "Nouns",
    "adjective": "Adjectives",
    "number": "Numbers",
    "question word": "Question Words",
    "question": "Question Words",
}


def normalize_category(raw):
    norm = raw.strip().lower()
    for cat in NOVASLAV_CATEGORIES:
        if cat.lower() == norm:
            return cat
    return _CATEGORY_ALIASES.get(norm)


def _noun_fields(word, gender_raw):
    gender = "neuter" if gender_raw.strip().lower() == "neuter" else "common"
    suffix = "et" if gender == "neuter" else "en"
    return {
        "gender": gender,
        "def": word + suffix,
    }


def _verb_fields(word):
    root = word[:-2] if word.lower().endswith(("ar", "er")) else word
    past_suffix = "te" if root.lower().endswith(("d", "ď")) else "de"
    return {
        "pres": word,
        "past": root + past_suffix,
    }


def parse_import_text(text):
    """Returns (entries, errors). entries are dicts ready to insert into Mongo."""
    entries = []
    errors = []

    for i, raw_line in enumerate((text or "").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        fields = [f.strip() for f in line.split(",")]
        if len(fields) < 3:
            errors.append(f"line {i}: need at least 3 fields (word, english, category)")
            continue

        word, en, cat_raw = fields[0], fields[1], fields[2]
        gender_raw = fields[3] if len(fields) > 3 else ""

        if not word or not en or not cat_raw:
            errors.append(f"line {i}: word, english, and category can't be blank")
            continue

        cat = normalize_category(cat_raw)
        if cat is None:
            errors.append(f"line {i}: unknown category '{cat_raw}', use one of: {', '.join(NOVASLAV_CATEGORIES)}")
            continue

        entry = {"word": word, "en": en, "cat": cat}
        if cat == "Nouns":
            entry.update(_noun_fields(word, gender_raw))
        elif cat == "Verbs":
            entry.update(_verb_fields(word))

        entries.append(entry)

    return entries, errors
