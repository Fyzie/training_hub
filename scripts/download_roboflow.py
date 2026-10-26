#!/usr/bin/env python3
"""
Roboflow Dataset Downloader & Inspector Utility
Accepts Python code snippet or parameters directly from Roboflow UI.
Downloads dataset in COCO format with smooth real-time progress streaming
and high-speed chunked buffering for datasets of any size.
"""

import os
import sys
import re
import time
import json
import shutil
import zipfile
import argparse
import contextlib
from pathlib import Path

def report_progress(stage: str, percent: int, message: str, extra: dict = None):
    """Outputs a structured JSON progress line to stdout and flushes immediately."""
    try:
        payload = {
            "stage": stage,
            "percent": max(0, min(100, int(percent))),
            "message": message,
        }
        if extra:
            payload.update(extra)
        line = f"__ROBOFLOW_PROGRESS__{json.dumps(payload)}\n"
        sys.__stdout__.write(line)
        sys.__stdout__.flush()
    except Exception:
        pass

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

def filter_coco_parent_categories(categories: list, annotations: list) -> list:
    """
    Drops unannotated grouping nodes from a COCO categories list (e.g. Roboflow synthetic root categories).
    Matches the exact filter_parent_categories logic used by RF-DETR's dataset loader.
    """
    if not categories:
        return []

    def get_norm_id(cat):
        try:
            return int(cat.get("id"))
        except (KeyError, TypeError, ValueError):
            return 999999

    ordered = sorted(categories, key=get_norm_id)
    placeholders = {"", "none", "null", None}
    supercategories = [(c.get("supercategory", "none"), c.get("name")) for c in ordered]
    parents = {
        sc for sc, name in supercategories
        if sc not in placeholders and sc != name
    }
    if not parents:
        return ordered

    annotated_ids = set()
    for an in (annotations or []):
        try:
            if "category_id" in an and an["category_id"] is not None:
                annotated_ids.add(int(an["category_id"]))
        except (TypeError, ValueError):
            pass

    kept = [
        c for c in ordered
        if not (c.get("name") in parents and get_norm_id(c) not in annotated_ids)
    ]
    return kept or ordered


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
                raw_cats = data.get("categories", [])
                annotations = data.get("annotations", [])
                filtered_cats = filter_coco_parent_categories(raw_cats, annotations)
                for c in filtered_cats:
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

def fetch_direct_export_link(api_key: str, workspace: str, project: str, version: int, format_type: str):
    """
    Queries Roboflow REST API directly for the pre-signed export download link.
    Handles asynchronous generation (HTTP 202) with live progress reporting.
    """
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util import Retry

    friendly_formats = {"yolov5": "yolov5pytorch", "yolov7": "yolov7pytorch"}
    fmt = friendly_formats.get(format_type, format_type)

    if workspace:
        url = f"https://api.roboflow.com/{workspace}/{project}/{version}/{fmt}"
    else:
        url = f"https://api.roboflow.com/{project}/{version}/{fmt}"

    session = requests.Session()
    retries = Retry(total=4, backoff_factor=1.0, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))

    res = session.get(url, params={"api_key": api_key}, timeout=25)

    if res.status_code in (401, 403):
        try:
            err = res.json().get("error", {})
            msg = err.get("message") or err.get("hint") or "Unauthorized"
        except Exception:
            msg = "Roboflow API key is invalid or lacks access to this project."
        raise PermissionError(f"Roboflow Authentication Error: {msg}")

    if res.status_code == 404:
        raise FileNotFoundError(f"Roboflow project '{project}' v{version} not found in workspace '{workspace or 'default'}'.")

    # If 202, Roboflow server is actively preparing/exporting the zip
    poll_start = time.time()
    max_wait = 900  # Up to 15 minutes for massive datasets
    while res.status_code == 202:
        elapsed = time.time() - poll_start
        if elapsed > max_wait:
            raise TimeoutError(f"Roboflow export generation exceeded {max_wait}s limit.")
        try:
            data = res.json()
            progress_val = float(data.get("progress", 0.0))
        except Exception:
            progress_val = 0.5

        pct = 10 + int(progress_val * 14)  # 10% to 24%
        report_progress("exporting", pct, f"Roboflow cloud server exporting {fmt}: {int(progress_val * 100)}%...")
        time.sleep(2)
        res = session.get(url, params={"api_key": api_key}, timeout=25)

    if res.status_code != 200:
        try:
            err_json = res.json()
            err_msg = err_json.get("error", {}).get("message") or str(err_json)
        except Exception:
            err_msg = res.text[:250]
        raise RuntimeError(f"Roboflow API returned HTTP {res.status_code}: {err_msg}")

    data = res.json()
    link = data.get("export", {}).get("link")
    if not link:
        raise ValueError("Roboflow export response missing download link")
    return link

def fast_stream_download_and_extract(download_url: str, dest_dir: Path):
    """
    Downloads dataset zip file using high-throughput 1MB buffer chunks (no 1KB flushes)
    and extracts with live member extraction progress. Suitable for datasets from 10MB to 50GB+.
    """
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util import Retry

    dest_dir.mkdir(parents=True, exist_ok=True)
    temp_zip = dest_dir / "roboflow_download.zip"

    session = requests.Session()
    retries = Retry(total=5, backoff_factor=1.5, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))

    report_progress("downloading", 25, "Connected to Roboflow CDN. Starting high-speed stream download...")

    # Download in 1MB chunks
    with session.get(download_url, stream=True, timeout=(20, 120)) as r:
        r.raise_for_status()
        total_bytes = int(r.headers.get("content-length", 0))
        total_mb = round(total_bytes / (1024 * 1024), 1) if total_bytes > 0 else 0

        chunk_size = 1024 * 1024  # 1MB per chunk
        downloaded = 0
        start_time = time.time()
        last_report_time = 0

        with open(temp_zip, "wb", buffering=4 * 1024 * 1024) as f:
            for chunk in r.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()
                    if now - last_report_time > 0.35:
                        last_report_time = now
                        elapsed = max(0.001, now - start_time)
                        speed_mb = (downloaded / (1024 * 1024)) / elapsed
                        dl_mb = round(downloaded / (1024 * 1024), 1)
                        if total_bytes > 0:
                            ratio = downloaded / total_bytes
                            pct = 25 + int(ratio * 50)  # Maps 25% -> 75%
                            pct_disp = min(100, int(ratio * 100))
                            report_progress(
                                "downloading",
                                pct,
                                f"Downloading: {pct_disp}% ({dl_mb}MB / {total_mb}MB @ {speed_mb:.1f} MB/s)",
                                {"downloadedMB": dl_mb, "totalMB": total_mb, "speedMBs": round(speed_mb, 1)}
                            )
                        else:
                            report_progress(
                                "downloading",
                                50,
                                f"Downloading: {dl_mb}MB @ {speed_mb:.1f} MB/s...",
                                {"downloadedMB": dl_mb, "speedMBs": round(speed_mb, 1)}
                            )

    # Extraction with live file count progress
    report_progress("extracting", 76, f"Download complete ({total_mb}MB). Extracting dataset archive...")

    with zipfile.ZipFile(temp_zip, "r") as zf:
        members = zf.infolist()
        total_files = len(members)
        last_report_time = 0
        for i, member in enumerate(members):
            zf.extract(member, dest_dir)
            now = time.time()
            if now - last_report_time > 0.35 or i == total_files - 1:
                last_report_time = now
                ratio = (i + 1) / total_files
                pct = 76 + int(ratio * 16)  # Maps 76% -> 92%
                report_progress(
                    "extracting",
                    pct,
                    f"Extracting archive: {int(ratio * 100)}% ({i + 1}/{total_files} files)...",
                    {"currentFile": i + 1, "totalFiles": total_files}
                )

    # Reclaim disk space immediately
    try:
        if temp_zip.exists():
            temp_zip.unlink()
    except Exception:
        pass

def download_dataset(
    api_key: str,
    workspace: str,
    project: str,
    version: int,
    format_type: str = "coco-segmentation",
    target_dir: str = "",
    custom_name: str = "",
    force_download: bool = False
):
    report_progress("init", 3, "Validating Roboflow credentials and project configuration...")

    # Determine target directory
    if not target_dir:
        repo_root = Path(__file__).resolve().parent.parent
        storage_hub_dir = Path(os.environ.get("STORAGE_HUB_PATH", str(repo_root.parent / "storage-hub")))
        folder_slug = custom_name.strip().replace(" ", "_") if custom_name else f"{project}-v{version}"
        target_dir = str(storage_hub_dir / "uploads" / "datasets" / folder_slug)

    dest_path = Path(target_dir)
    dest_path.mkdir(parents=True, exist_ok=True)

    # Check if already downloaded with valid annotations
    train_annot = dest_path / "train" / "_annotations.coco.json"
    is_already_complete = train_annot.exists() and train_annot.stat().st_size > 100

    fallback_splits = {}

    if is_already_complete and not force_download:
        report_progress("inspecting", 95, f"Dataset {project} v{version} already exists locally. Reusing existing download.")
        actual_dir = dest_path
    else:
        # Route stdout during third-party library execution to stderr
        with contextlib.redirect_stdout(sys.stderr):
            try:
                from roboflow import Roboflow
            except ImportError:
                report_progress("init", 5, "Installing 'roboflow' client package...")
                import subprocess
                try:
                    subprocess.check_call([sys.executable, "-m", "pip", "install", "roboflow", "--quiet"])
                    from roboflow import Roboflow
                except Exception as e:
                    raise ImportError(f"Missing 'roboflow' package and auto-install failed: {e}")

            report_progress("init", 7, f"Connecting to Roboflow workspace '{workspace or 'default'}'...")
            rf = Roboflow(api_key=api_key)
            if workspace:
                proj = rf.workspace(workspace).project(project)
            else:
                proj = rf.workspace().project(project)

            ver = proj.version(version)
            fallback_splits = getattr(ver, "splits", {}) or {}
            report_progress("init", 10, f"Found project '{project}' version {version}.")

            # Try high-throughput direct streaming download
            download_succeeded = False
            try:
                report_progress("exporting", 12, "Querying Roboflow export service...")
                export_link = fetch_direct_export_link(api_key, workspace, project, version, format_type)
                fast_stream_download_and_extract(export_link, dest_path)
                actual_dir = dest_path
                download_succeeded = True
            except Exception as fast_err:
                print(f"[Roboflow Downloader] Fast stream encountered ({fast_err}). Falling back to Roboflow SDK download...", file=sys.stderr)
                # If it's a PermissionError (invalid API key) or FileNotFoundError, don't fall back, raise directly
                if isinstance(fast_err, (PermissionError, FileNotFoundError)):
                    raise fast_err

            if not download_succeeded:
                report_progress("downloading", 35, f"Downloading {project} v{version} ({format_type}) via Roboflow SDK...")
                dl = ver.download(format_type, location=str(dest_path), overwrite=True)
                actual_dir = Path(getattr(dl, "location", dest_path) or dest_path)

    # Inspection stage
    report_progress("inspecting", 94, "Analyzing COCO annotations, classes, and split distributions...")
    metadata = inspect_dataset_directory(actual_dir, fallback_splits=fallback_splits)
    report_progress("inspecting", 98, f"Verified {metadata['sampleCount']} images across {len(metadata['classes'])} classes. Registering to catalog...")

    norm_actual = str(actual_dir).replace("\\", "/")
    if "/uploads/datasets/" in norm_actual:
        web_file_path = "/uploads/datasets/" + norm_actual.split("/uploads/datasets/")[-1]
    else:
        web_file_path = f"/uploads/datasets/{actual_dir.name}"

    result = {
        "name": custom_name or f"{project}-v{version}",
        "project": project,
        "version": version,
        "classes": metadata["classes"],
        "sampleCount": metadata["sampleCount"],
        "splits": metadata["splits"],
        "fileSizeMB": metadata["fileSizeMB"],
        "filePath": web_file_path,
        "format": "coco"
    }

    report_progress("complete", 100, f"Dataset '{result['name']}' successfully imported and cataloged!")
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Roboflow Dataset Downloader")
    parser.add_argument("--snippet", type=str, default="", help="Full Python code snippet from Roboflow")
    parser.add_argument("--api_key", type=str, default="", help="Roboflow API key")
    parser.add_argument("--workspace", type=str, default="", help="Roboflow workspace slug")
    parser.add_argument("--project", type=str, default="", help="Roboflow project slug")
    parser.add_argument("--version", type=int, default=1, help="Dataset version")
    parser.add_argument("--format", type=str, default="", help="Download format")
    parser.add_argument("--name", type=str, default="", help="Custom dataset name")
    parser.add_argument("--target_dir", type=str, default="", help="Target output folder")
    parser.add_argument("--force", action="store_true", help="Force re-download even if dataset already exists")

    args = parser.parse_args()

    api_key = args.api_key
    workspace = args.workspace
    project = args.project
    version = args.version
    format_type = args.format or "coco-segmentation"
    custom_name = args.name

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
            custom_name=custom_name,
            force_download=args.force
        )
        json_output = json.dumps(res)
        sys.__stdout__.write(f"\n__ROBOFLOW_JSON_START__\n{json_output}\n__ROBOFLOW_JSON_END__\n")
        sys.__stdout__.flush()
    except Exception as e:
        err_text = str(e)
        try:
            # Parse inner JSON error message if present (e.g. Roboflow OAuthException)
            match = re.search(r'\{.*"message"\s*:\s*"([^"]+)"', err_text)
            if match:
                hint_match = re.search(r'"hint"\s*:\s*"([^"]+)"', err_text)
                hint = f" ({hint_match.group(1)})" if hint_match else ""
                err_text = f"Roboflow Error: {match.group(1)}{hint}"
        except Exception:
            pass
        error_output = json.dumps({"error": err_text})
        sys.__stdout__.write(f"\n__ROBOFLOW_JSON_START__\n{error_output}\n__ROBOFLOW_JSON_END__\n")
        sys.__stdout__.flush()
        sys.exit(1)
