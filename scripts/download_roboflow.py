#!/usr/bin/env python3
"""
Roboflow Dataset Downloader & Inspector Utility
Accepts Python code snippet or parameters directly from Roboflow UI.
Downloads dataset in COCO format and returns metadata JSON.
"""

import os
import sys
import re
import json
import argparse
import contextlib
from pathlib import Path

def parse_roboflow_snippet(snippet: str):
    # Strip markdown code blocks if pasted with formatting
    cleaned = re.sub(r'```python\s*', '', snippet, flags=re.IGNORECASE)
    cleaned = re.sub(r'```\s*', '', cleaned)

    api_key_match = re.search(r'api_key\s*=\s*["\']([^"\']+)["\']', cleaned)
    if not api_key_match:
        api_key_match = re.search(r'Roboflow\(\s*["\']([^"\']+)["\']\s*\)', cleaned)
    api_key = api_key_match.group(1) if api_key_match else None

    workspace_match = re.search(r'workspace\(\s*["\']([^"\']*)["\']\s*\)', cleaned)
    workspace = workspace_match.group(1) if workspace_match else None

    project_match = re.search(r'project\(\s*["\']([^"\']+)["\']\s*\)', cleaned)
    project = project_match.group(1) if project_match else None

    version_match = re.search(r'version\(\s*(\d+)\s*\)', cleaned)
    version = int(version_match.group(1)) if version_match else 1

    format_match = re.search(r'download\(\s*["\']([^"\']+)["\']\s*\)', cleaned)
    format_type = format_match.group(1) if format_match else "coco-segmentation"

    return {
        "api_key": api_key,
        "workspace": workspace,
        "project": project,
        "version": version,
        "format": format_type,
    }

def inspect_dataset_directory(dataset_dir: Path, fallback_splits: dict = None):
    """Inspects a downloaded dataset directory for COCO annotations, classes, and counts."""
    classes_set = set()
    train_count = 0
    val_count = 0
    test_count = 0

    train_annot = dataset_dir / "train" / "_annotations.coco.json"
    valid_annot = dataset_dir / "valid" / "_annotations.coco.json"
    test_annot = dataset_dir / "test" / "_annotations.coco.json"

    # Also look for any coco json in root or subdirectories
    all_coco_files = list(dataset_dir.rglob("*_annotations.coco.json")) + list(dataset_dir.rglob("*.coco.json"))

    def read_coco(file_path: Path):
        nonlocal classes_set
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for c in data.get("categories", []):
                    name = c.get("name")
                    if name:
                        classes_set.add(name)
                return len(data.get("images", []))
        except Exception as e:
            print(f"[Warning] Failed to parse COCO JSON {file_path}: {e}", file=sys.stderr)
            return 0

    if train_annot.exists():
        train_count = read_coco(train_annot)
    if valid_annot.exists():
        val_count = read_coco(valid_annot)
    if test_annot.exists():
        test_count = read_coco(test_annot)

    # If train_count or val_count wasn't found from standard paths, check other found coco files
    if train_count == 0 and all_coco_files:
        for cf in all_coco_files:
            lower_str = str(cf).lower()
            cnt = read_coco(cf)
            if "train" in lower_str and train_count == 0:
                train_count = cnt
            elif ("val" in lower_str or "valid" in lower_str) and val_count == 0:
                val_count = cnt
            elif "test" in lower_str and test_count == 0:
                test_count = cnt

    # Use fallback splits from Roboflow metadata if counts are still zero
    if fallback_splits:
        if train_count == 0 and fallback_splits.get("train"):
            train_count = int(fallback_splits["train"])
        if val_count == 0 and (fallback_splits.get("valid") or fallback_splits.get("val")):
            val_count = int(fallback_splits.get("valid") or fallback_splits.get("val"))
        if test_count == 0 and fallback_splits.get("test"):
            test_count = int(fallback_splits["test"])

    # If still 0, count physical image files
    total_samples = train_count + val_count + test_count
    if total_samples == 0:
        all_imgs = [p for p in dataset_dir.rglob("*") if p.suffix.lower() in [".jpg", ".jpeg", ".png", ".bmp", ".webp"]]
        total_samples = len(all_imgs)
        val_count = int(total_samples * 0.2)
        train_count = total_samples - val_count

    total_bytes = sum(f.stat().st_size for f in dataset_dir.rglob("*") if f.is_file())
    size_mb = round(total_bytes / (1024 * 1024), 1)

    return {
        "classes": sorted(list(classes_set)) if classes_set else ["object"],
        "sampleCount": total_samples,
        "splits": {"train": train_count, "val": val_count, "test": test_count},
        "fileSizeMB": size_mb or 10.0,
    }

def download_dataset(api_key: str, workspace: str, project: str, version: int, format_type: str = "coco-segmentation", target_dir: str = "", force_download: bool = False):
    # Route stdout during third-party library execution to stderr so that stdout stays pure JSON
    with contextlib.redirect_stdout(sys.stderr):
        from roboflow import Roboflow

        rf = Roboflow(api_key=api_key)
        if workspace:
            proj = rf.workspace(workspace).project(project)
        else:
            proj = rf.workspace().project(project)

        ver = proj.version(version)
        fallback_splits = getattr(ver, "splits", {}) or {}

        if not target_dir:
            repo_root = Path(__file__).resolve().parent.parent
            storage_hub_dir = Path(os.environ.get("STORAGE_HUB_PATH", str(repo_root.parent / "storage-hub")))
            target_dir = str(storage_hub_dir / "uploads" / "datasets" / f"{project}-v{version}")

        dest_path = Path(target_dir)
        dest_path.mkdir(parents=True, exist_ok=True)

        # Check if already downloaded with valid annotations
        train_annot = dest_path / "train" / "_annotations.coco.json"
        is_already_complete = train_annot.exists() and train_annot.stat().st_size > 100

        if is_already_complete and not force_download:
            print(f"[Roboflow] Dataset {project} v{version} already exists at {dest_path}. Reusing existing download.", file=sys.stderr)
            actual_dir = dest_path
        else:
            print(f"[Roboflow] Downloading {project} v{version} ({format_type}) into {dest_path}...", file=sys.stderr)
            # Pass overwrite=True so Roboflow downloads and unpacks even if the directory exists
            dl = ver.download(format_type, location=str(dest_path), overwrite=True)
            actual_dir = Path(getattr(dl, "location", dest_path) or dest_path)

        metadata = inspect_dataset_directory(actual_dir, fallback_splits=fallback_splits)

    norm_actual = str(actual_dir).replace("\\", "/")
    if "/uploads/datasets/" in norm_actual:
        web_file_path = "/uploads/datasets/" + norm_actual.split("/uploads/datasets/")[-1]
    else:
        web_file_path = f"/uploads/datasets/{actual_dir.name}"

    result = {
        "name": f"{project}-v{version}",
        "project": project,
        "version": version,
        "classes": metadata["classes"],
        "sampleCount": metadata["sampleCount"],
        "splits": metadata["splits"],
        "fileSizeMB": metadata["fileSizeMB"],
        "filePath": web_file_path,
        "format": "coco"
    }

    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Roboflow Dataset Downloader")
    parser.add_argument("--snippet", type=str, default="", help="Full Python code snippet from Roboflow")
    parser.add_argument("--api_key", type=str, default="", help="Roboflow API key")
    parser.add_argument("--workspace", type=str, default="", help="Roboflow workspace slug")
    parser.add_argument("--project", type=str, default="", help="Roboflow project slug")
    parser.add_argument("--version", type=int, default=1, help="Dataset version")
    parser.add_argument("--format", type=str, default="", help="Download format")
    parser.add_argument("--target_dir", type=str, default="", help="Target output folder")
    parser.add_argument("--force", action="store_true", help="Force re-download even if dataset already exists")

    args = parser.parse_args()

    api_key = args.api_key
    workspace = args.workspace
    project = args.project
    version = args.version
    format_type = args.format or "coco-segmentation"

    if args.snippet:
        parsed = parse_roboflow_snippet(args.snippet)
        api_key = parsed["api_key"] or api_key
        workspace = parsed["workspace"] or workspace
        project = parsed["project"] or project
        version = parsed["version"] or version
        format_type = args.format or parsed["format"] or format_type

    if not api_key or not project:
        error_msg = json.dumps({"error": "Missing required Roboflow API key or project slug in snippet."})
        sys.__stdout__.write(f"\n__ROBOFLOW_JSON_START__\n{error_msg}\n__ROBOFLOW_JSON_END__\n")
        sys.__stdout__.flush()
        sys.exit(1)

    try:
        res = download_dataset(
            api_key=api_key,
            workspace=workspace,
            project=project,
            version=version,
            format_type=format_type,
            target_dir=args.target_dir,
            force_download=args.force
        )
        json_output = json.dumps(res)
        sys.__stdout__.write(f"\n__ROBOFLOW_JSON_START__\n{json_output}\n__ROBOFLOW_JSON_END__\n")
        sys.__stdout__.flush()
    except Exception as e:
        error_output = json.dumps({"error": str(e)})
        sys.__stdout__.write(f"\n__ROBOFLOW_JSON_START__\n{error_output}\n__ROBOFLOW_JSON_END__\n")
        sys.__stdout__.flush()
        sys.exit(1)
