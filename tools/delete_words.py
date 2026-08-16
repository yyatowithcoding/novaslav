#!/usr/bin/env python3
"""Delete specific words from the live dictionary, by exact (word, english) pair.

Usage:
    python delete_words.py --pairs "kravata:tie,rady:happy" --password ...
    python delete_words.py --file to_delete.txt --password ...
        (file format: one "word, english" pair per line, '#' comments allowed,
         same shape as an import file minus the category)

Reads IMPORT_PASSWORD from the environment if --password isn't given. Exact-pair
match on purpose: a typo just deletes nothing instead of the wrong word.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_API_URL = "https://novaslav.pages.dev"
USER_AGENT = "novaslav-delete-words-tool/1.0"


def http_post_json(url, payload, headers=None):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_pairs_arg(raw):
    pairs = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            sys.exit(f"Bad --pairs entry (need word:english): {chunk!r}")
        word, en = chunk.split(":", 1)
        pairs.append({"word": word.strip(), "en": en.strip()})
    return pairs


def parse_pairs_file(path):
    pairs = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 2:
                sys.exit(f"Bad line in {path} (need 'word, english'): {line!r}")
            pairs.append({"word": parts[0], "en": parts[1]})
    return pairs


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pairs", help='Comma-separated "word:english" pairs to delete')
    parser.add_argument("--file", help="File with one 'word, english' pair per line")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--password", default=os.environ.get("IMPORT_PASSWORD", ""))
    args = parser.parse_args()

    if not args.pairs and not args.file:
        sys.exit("Pass --pairs or --file.")
    if not args.password:
        sys.exit("Pass --password or set IMPORT_PASSWORD.")

    pairs = parse_pairs_arg(args.pairs) if args.pairs else parse_pairs_file(args.file)
    if not pairs:
        sys.exit("Nothing to delete.")

    print(f"Requesting deletion of {len(pairs)} word(s):")
    for p in pairs:
        print(f'  "{p["word"]}" ({p["en"]})')

    try:
        result = http_post_json(
            args.api_url.rstrip("/") + "/api/delete-words",
            {"password": args.password, "words": pairs},
        )
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")

    print()
    print(f"Deleted {result.get('deleted', 0)} of {result.get('requested', len(pairs))} requested.")


if __name__ == "__main__":
    main()
