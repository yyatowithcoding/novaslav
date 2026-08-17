#!/usr/bin/env python3
"""Generate new Novaslav vocabulary with Groq (free, no credit card), deduped
against what's already live.

Zero extra pip installs, standard library only. Reuses relay/importer.py directly
so this tool can never accept something the live import endpoint would reject
(or vice versa) -- there's exactly one copy of the format/conjugation rules.

Setup (one time):
    Get a free Groq API key: https://console.groq.com/keys
    Set it as an environment variable, never paste it into a chat or commit it:
        Windows (PowerShell):  $env:GROQ_API_KEY = "your-key-here"
        macOS/Linux:            export GROQ_API_KEY="your-key-here"

Usage:
    python gen_words.py --topic "kitchen items" --count 20
    python gen_words.py --topic "kitchen items" --count 20 --submit --password ...

What it does:
    1. Fetches the live dictionary from --api-url (defaults to the production site)
       so it knows exactly which spellings are already taken.
    2. Builds a prompt: the format rules, the allowed categories and accented
       letters, the full list of existing spellings to avoid, and your topic.
    3. Runs the model's answer through the *same* parse_import_text() the server
       uses, plus a local version of the same word-collision guardrail (same
       spelling, different meaning = rejected).
    4. Writes whatever survives to a plain text file, ready to paste into /import/
       or submit directly with --submit.

Nothing here is auto-imported unless you pass --submit.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "relay"))
from importer import NOVASLAV_CATEGORIES, parse_import_text  # noqa: E402

DEFAULT_API_URL = "https://novaslav.pages.dev"
DEFAULT_MODEL = "llama-3.3-70b-versatile"
ALLOWED_ACCENTS = "ô ä ö š č ž ď ť ľ ň ê"

USER_AGENT = "novaslav-gen-words-tool/1.0"


def http_get_json(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(url, payload, headers=None):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_existing_words(api_url):
    return http_get_json(api_url.rstrip("/") + "/api/words")


def build_prompt(topic, count, existing_words):
    spellings = ", ".join(sorted(w["word"] for w in existing_words))
    meanings = ", ".join(sorted(set(w["en"] for w in existing_words)))
    categories = ", ".join(NOVASLAV_CATEGORIES)
    return f"""Generate a vocabulary list for a constructed language called Novaslav.
Output plain text only: no explanations, no markdown, no code fences, no header line, no
summary line, no preamble of any kind. The very first line of your output must already be
a complete, fully formatted word entry. Nothing before it.

Line format, one word per line, always exactly this many comma-separated fields, IN THIS EXACT
ORDER, field 1 is always the invented Novaslav word, never the English meaning:
    <novaslav_word>, <english_meaning>, <category>[, <gender>]

Example of exactly what your output should look like for 3 words (do not reuse these exact
words or meanings, this is only to show the shape):
    lubar, to enjoy, Verbs
    ponedelnik, Monday, Nouns
    tri, three, Numbers

Every line is fully self-contained and independent. Never factor the English words out into
a separate list or header, each line repeats its own english meaning inline even if it was
already mentioned elsewhere in your output.

Here "lubar" is the invented Novaslav word (field 1) and "to enjoy" is the English meaning
(field 2). Do NOT reverse this order. Do NOT put the English word first.

WRONG (English meaning first, this order is never allowed):
    to enjoy, lubar, Verbs

WRONG (english field missing entirely, category shifted into its place):
    ponedelnik, Nouns, masculine

Every single line MUST have the english meaning as its own field between the word and the
category. A line with only word and category (2 fields) is invalid and will be rejected.
A line where field 1 is a real English word and field 2 looks like the invented word is
also invalid, the order is backwards and will be rejected.

Rules:
- word (field 1): Latin letters only, plus these accented ones where the sound needs it: {ALLOWED_ACCENTS}. Nothing else, no other alphabet.
- english: the meaning. Use "/" for close alternates, not a comma.
- category: exactly one of: {categories}
- gender: Nouns only, optional. "masculine", "feminine", or "neuter".
- Every word value must be unique in your output. Never reuse a spelling for two meanings.
- Never reuse any of these {len(existing_words)} spellings, they already exist in the dictionary:
  {spellings}
- Do not invent a new word for a concept that's already covered below, even with a brand new
  spelling. If your topic overlaps with something already covered, skip that concept entirely
  and generate something else instead so you still deliver the full count. Already-covered
  meanings:
  {meanings}
- Also avoid generating more than one entry for the same concept within your own output
  (e.g. don't give two different words that both just mean "angry").

Generate {count} words about: {topic}

Double check your own output before finalizing: no duplicate word values, no characters
outside a-z plus {ALLOWED_ACCENTS}, no category outside the list above, no spelling reused
from the existing list, and no concept reused from the already-covered meanings list either."""


def call_groq(prompt, api_key, model):
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
    }
    try:
        data = http_post_json(url, payload, headers={"Authorization": f"Bearer {api_key}"})
    except urllib.error.HTTPError as e:
        sys.exit(f"Groq API error {e.code}: {e.read().decode('utf-8', 'replace')}")
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        sys.exit(f"Unexpected Groq response shape: {data}")


def meaning_parts(en):
    """Splits an "en" field like "watch strap" or "cheap / inexpensive" into its
    lowercased alternates, for exact (not fuzzy) meaning-collision checks."""
    return {p.strip().lower() for p in en.split("/") if p.strip()}


MAX_FIELDS_PER_LINE = 4  # word, english, category, gender


def strip_header_lines(raw_text):
    """Models occasionally prepend a summary/header line dumping every English
    word into one comma list before the real per-word lines. A real entry never
    has more than 4 comma-separated fields, so anything wider gets dropped
    before it ever reaches the real parser."""
    kept, dropped = [], []
    for line in (raw_text or "").splitlines():
        if line.strip() and not line.strip().startswith("#") and line.count(",") + 1 > MAX_FIELDS_PER_LINE:
            dropped.append(line.strip())
            continue
        kept.append(line)
    return "\n".join(kept), dropped


def validate(raw_text, existing_words):
    """Runs the exact same parser the server uses, then applies the same
    word-collision guardrail locally (spelling already used = reject), plus a
    meaning-collision check: the prompt *asks* the model not to reinvent an
    existing concept under a new spelling, but that's just an instruction, not
    a guarantee, models get this wrong often enough at 400+ existing words that
    it needs to be caught here for real instead of just hoped for."""
    entries, errors = parse_import_text(raw_text)

    existing_by_word = {w["word"]: w["en"] for w in existing_words}
    existing_meanings = set()
    for w in existing_words:
        existing_meanings |= meaning_parts(w["en"])

    seen = {}
    seen_meanings = set()
    clean = []
    for e in entries:
        word, en = e["word"], e["en"]
        if word in existing_by_word and existing_by_word[word] != en:
            errors.append(f'"{word}" already exists meaning "{existing_by_word[word]}", dropping the new "{en}"')
            continue
        if word in seen and seen[word] != en:
            errors.append(f'"{word}" used twice in this batch ("{seen[word]}" and "{en}"), dropping both')
            continue

        parts = meaning_parts(en)
        overlap = parts & existing_meanings
        if overlap:
            errors.append(f'"{word}" ({en}) means the same thing as an existing word ("{", ".join(sorted(overlap))}"), dropping it')
            continue
        if parts & seen_meanings:
            errors.append(f'"{word}" ({en}) duplicates another word already generated in this same batch, dropping it')
            continue

        seen[word] = en
        seen_meanings |= parts
        clean.append(e)
    return clean, errors


def entries_to_lines(entries):
    lines = []
    for e in entries:
        parts = [e["word"], e["en"], e["cat"]]
        if e.get("gender"):
            parts.append(e["gender"])
        lines.append(", ".join(parts))
    return lines


def submit(api_url, text, password):
    return http_post_json(api_url.rstrip("/") + "/api/import", {"text": text, "password": password})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--topic", required=True, help='What to generate, e.g. "kitchen items"')
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Site to read the dictionary from / submit to")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--out", default="generated_words.txt")
    parser.add_argument("--submit", action="store_true", help="Also POST the validated words to /api/import")
    parser.add_argument("--password", default=os.environ.get("IMPORT_PASSWORD", ""), help="Import password (only needed with --submit)")
    args = parser.parse_args()

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        sys.exit("Set GROQ_API_KEY as an environment variable first (see the top of this file for how).")

    print(f"Fetching existing dictionary from {args.api_url} ...")
    existing = fetch_existing_words(args.api_url)
    print(f"  {len(existing)} words currently live.")

    prompt = build_prompt(args.topic, args.count, existing)
    print(f"Asking {args.model} for {args.count} words about '{args.topic}' ...")
    raw = call_groq(prompt, api_key, args.model)

    raw, dropped_headers = strip_header_lines(raw)
    for line in dropped_headers:
        print(f"  Dropped a stray header/summary line (too many fields): {line[:80]}...")

    entries, errors = validate(raw, existing)
    print(f"\n{len(entries)} clean, {len(errors)} rejected.")
    for err in errors:
        print("  -", err)

    if not entries:
        print("\nRaw model output (first 20 lines), for debugging:")
        for line in raw.splitlines()[:20]:
            print("  |", line)

    lines = entries_to_lines(entries)
    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {len(lines)} validated lines to {args.out}")

    if not entries:
        return

    if args.submit:
        if not args.password:
            sys.exit("Pass --password or set IMPORT_PASSWORD to actually submit.")
        print("Submitting to the live site...")
        result = submit(args.api_url, "\n".join(lines), args.password)
        print(result)
    else:
        print("Not submitted (pass --submit to import directly). Review the file, or paste it into /import/ yourself.")


if __name__ == "__main__":
    main()
