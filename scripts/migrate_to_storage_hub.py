#!/usr/bin/env python3
"""
Migrates and syncs all database records and uploads
from the codebase repo (d:\\Github\\hub) to external persistent storage (d:\\Github\\storage-hub).
"""

import os
import shutil
from pathlib import Path

def migrate():
    hub_dir = Path(__file__).resolve().parent.parent
    storage_hub_dir = hub_dir.parent / "storage-hub"

    print(f"[*] Hub directory: {hub_dir}")
    print(f"[*] Target Storage-Hub: {storage_hub_dir}")

    data_target = storage_hub_dir / "data"
    uploads_target = storage_hub_dir / "uploads"

    for p in [
        data_target,
        uploads_target / "images",
        uploads_target / "docs",
        uploads_target / "datasets",
        uploads_target / "runs"
    ]:
        p.mkdir(parents=True, exist_ok=True)

    # 1. Migrate JSON data files
    data_source = hub_dir / "data"
    if data_source.exists():
        for f in data_source.iterdir():
            if f.is_file():
                dst = data_target / f.name
                if not dst.exists():
                    shutil.copy2(f, dst)
                    print(f"[MIGRATE] Copied data file: {f.name} -> {dst}")
                else:
                    print(f"[SKIP] Existing data file preserved: {dst}")

    # 2. Migrate uploads
    uploads_source = hub_dir / "public" / "uploads"
    if uploads_source.exists():
        for root, dirs, files in os.walk(uploads_source):
            rel = os.path.relpath(root, uploads_source)
            dst_dir = uploads_target if rel == "." else uploads_target / rel
            dst_dir.mkdir(parents=True, exist_ok=True)
            for f in files:
                src_f = Path(root) / f
                dst_f = dst_dir / f
                if not dst_f.exists():
                    shutil.copy2(src_f, dst_f)
                    print(f"[MIGRATE] Copied upload: {f} -> {dst_f}")
                else:
                    print(f"[SKIP] Existing upload preserved: {dst_f}")

    print("[SUCCESS] All persistent data successfully decoupled and synced to storage-hub!")

if __name__ == "__main__":
    migrate()

