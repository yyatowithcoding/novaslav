"""MongoDB access, using motor (the current async Mongo driver, actively
maintained by MongoDB, not the older deprecated sync patterns)."""

import os

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB = os.environ.get("MONGODB_DB", "novaslav")

_client = None


def get_collection():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
    return _client[MONGODB_DB]["words"]


def shape_word(doc):
    """Reshape a Mongo document into the flat object the frontend expects."""
    out = {"word": doc["word"], "en": doc["en"], "cat": doc["cat"]}
    if doc.get("gender"):
        out["gender"] = doc["gender"]
    if doc.get("def"):
        out["def"] = doc["def"]
    if doc.get("pres"):
        out["pres"] = doc["pres"]
    if doc.get("past"):
        out["past"] = doc["past"]
    if doc.get("note"):
        out["note"] = doc["note"]
    return out


async def list_words():
    collection = get_collection()
    cursor = collection.find({}).sort([("cat", 1), ("en", 1)])
    docs = await cursor.to_list(length=None)
    return [shape_word(d) for d in docs]


async def word_exists(word, en):
    collection = get_collection()
    existing = await collection.find_one({"word": word, "en": en})
    return existing is not None


async def find_conflicts(entries):
    """Guardrail: the same Novaslav spelling can't be used for two different
    English meanings, whether the clash is against another line in this same
    import or against a word already in the dictionary. Splits entries into
    (clean, conflict_errors); clean is safe to hand to insert_words."""
    collection = get_collection()
    seen = {}  # word -> en, first occurrence in this batch
    clean = []
    errors = []

    for entry in entries:
        word = entry["word"]
        en = entry["en"]

        if word in seen:
            if seen[word] == en:
                continue  # exact duplicate line, quietly ignore the repeat
            errors.append(
                f'"{word}" is used twice in this import with different meanings '
                f'("{seen[word]}" and "{en}") — pick one spelling per meaning.'
            )
            continue

        existing = await collection.find_one({"word": word})
        if existing and existing["en"] != en:
            errors.append(
                f'"{word}" already exists in the dictionary meaning "{existing["en"]}", '
                f'can\'t also add it for "{en}".'
            )
            continue

        seen[word] = en
        clean.append(entry)

    return clean, errors


async def insert_words(entries):
    """Insert entries, skipping ones that already exist (same word + en).
    Returns (added_count, skipped_count)."""
    collection = get_collection()
    added = 0
    skipped = 0
    for entry in entries:
        if await word_exists(entry["word"], entry["en"]):
            skipped += 1
            continue
        await collection.insert_one(entry)
        added += 1
    return added, skipped
