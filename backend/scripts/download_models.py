"""Download every model listed in backend/models/models.json into data/models/.

Run from the backend folder:  .venv\\python.exe scripts\\download_models.py [--force]
Files that are already present and match their SHA-256 are skipped.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, model_files  # noqa: E402


def main() -> int:
    force = "--force" in sys.argv
    config.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    last = [0.0]

    def progress(model_id: str, done: int, total: int | None) -> None:
        now = time.monotonic()
        if now - last[0] > 0.5 or (total and done >= total):
            last[0] = now
            pct = f"{done / total:6.1%}" if total else f"{done >> 20} MB"
            print(f"\r  {model_id:<16} {pct}", end="", flush=True)

    failed = []
    for m in model_files.entries():
        print(f"{m['name']} ({m['license']})")
        try:
            p = model_files.download(m["id"], force=force, progress=progress)
            print(f"\r  ok  {p.relative_to(config.PROJECT_DIR)}  sha256 {model_files.sha256_of(p)[:16]}...")
        except Exception as exc:
            print(f"\r  failed: {exc}")
            failed.append(m["id"])
    if failed:
        print(f"\nFailed: {', '.join(failed)}")
        return 1
    print(f"\nAll {len(model_files.entries())} models are in {config.MODELS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
