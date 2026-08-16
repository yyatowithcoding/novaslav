"""Process supervisor for bot.py: restarts it automatically if it crashes.

Works on any host (a VPS, Railway, wherever) since it's just a wrapper around
the same `python bot.py` command, not tied to a specific platform's own
"keep alive" mechanism. Use this as your actual start command instead of
running bot.py directly.

Usage:
    python keepalive.py
"""

import subprocess
import sys
import time

MIN_BACKOFF = 2
MAX_BACKOFF = 60
# If the bot stays up at least this long, treat the next crash as a fresh
# problem and reset the backoff back to MIN_BACKOFF instead of continuing
# to grow it.
HEALTHY_UPTIME = 60


def main():
    backoff = MIN_BACKOFF

    while True:
        print(f"[keepalive] starting bot.py", flush=True)
        started_at = time.monotonic()

        try:
            proc = subprocess.Popen([sys.executable, "bot.py"])
            exit_code = proc.wait()
        except KeyboardInterrupt:
            print("[keepalive] stopping (Ctrl+C)", flush=True)
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                proc.kill()
            sys.exit(0)

        uptime = time.monotonic() - started_at
        print(f"[keepalive] bot.py exited with code {exit_code} after {uptime:.0f}s", flush=True)

        if uptime >= HEALTHY_UPTIME:
            backoff = MIN_BACKOFF
        else:
            backoff = min(backoff * 2, MAX_BACKOFF)

        print(f"[keepalive] restarting in {backoff}s", flush=True)
        try:
            time.sleep(backoff)
        except KeyboardInterrupt:
            print("[keepalive] stopping (Ctrl+C)", flush=True)
            sys.exit(0)


if __name__ == "__main__":
    main()
