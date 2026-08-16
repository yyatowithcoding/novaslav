"""Novaslav relay: a discord.py bot that also runs a small aiohttp API.

The API is what actually matters for the site: Cloudflare Pages Functions
call it over HTTPS (with a shared secret) to read and write words, since
Cloudflare Workers can't hold a raw connection to MongoDB. The Discord side
just needs to log in with a bot token; it doesn't need any commands for the
importer to work, and the HTTP API still runs fine on its own if you leave
DISCORD_BOT_TOKEN unset (handy for local testing).

Run it with:
    pip install -r requirements.txt
    cp .env.example .env   # then fill in real values
    python bot.py
"""

import asyncio
import json
import logging
import os

import discord
from aiohttp import web
from dotenv import load_dotenv

from db import insert_words, list_words
from importer import parse_import_text

load_dotenv()

DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
RELAY_SECRET = os.environ.get("RELAY_SECRET", "")
RELAY_PORT = int(os.environ.get("RELAY_PORT", "8787"))

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("novaslav-relay")

if not RELAY_SECRET:
    log.warning("RELAY_SECRET is not set. Anyone who can reach this server can read/write words.")


def _authorized(request):
    if not RELAY_SECRET:
        return True
    return request.headers.get("Authorization") == f"Bearer {RELAY_SECRET}"


async def handle_health(request):
    return web.json_response({"ok": True})


async def handle_get_words(request):
    if not _authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    words = await list_words()
    return web.json_response(words)


async def handle_import(request):
    if not _authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "body must be JSON"}, status=400)

    text = body.get("text", "")
    entries, errors = parse_import_text(text)

    added, skipped = (0, 0)
    if entries:
        added, skipped = await insert_words(entries)

    return web.json_response({"added": added, "skipped": skipped, "errors": errors})


def build_web_app():
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/words", handle_get_words)
    app.router.add_post("/api/import", handle_import)
    return app


async def start_web_server():
    app = build_web_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", RELAY_PORT)
    await site.start()
    log.info(f"Relay API listening on http://0.0.0.0:{RELAY_PORT}")
    # Keep this task alive for as long as the process runs.
    await asyncio.Event().wait()


intents = discord.Intents.default()
discord_client = discord.Client(intents=intents)


@discord_client.event
async def on_ready():
    log.info(f"Discord bot logged in as {discord_client.user}")


async def main():
    tasks = [asyncio.create_task(start_web_server())]

    if DISCORD_BOT_TOKEN:
        tasks.append(asyncio.create_task(discord_client.start(DISCORD_BOT_TOKEN)))
    else:
        log.warning("DISCORD_BOT_TOKEN is not set, running the HTTP API only (no Discord login).")

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
