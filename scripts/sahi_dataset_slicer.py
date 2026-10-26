#!/usr/bin/env python3
"""
SAHI Dataset Slicer Utility
Slices COCO-format datasets (Bounding Box & Polygon Segmentation) into high-resolution overlapping tiles
following the SAHI (Slicing Aided Hyper Inference) algorithm for small-object and defect detection.
"""

import os
import sys
import json
import argparse
import shutil
from pathlib import Path
import numpy as np
import cv2

def imread_unicode(filepath: str):
    try:
        data = np.fromfile(filepath, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is not None:
            return img
    except Exception:
        pass
    return cv2.imread(filepath)

def imwrite_unicode(filepath: str, img):
    ext = os.path.splitext(filepath)[1]
    if not ext:
        ext = '.jpg'
    is_success, buffer = cv2.imencode(ext, img)
    if is_success:
        with open(filepath, 'wb') as f:
            buffer.tofile(f)
        return True
    return False

def slice_coco_split(
    src_split_dir: str,
    dst_split_dir: str,
    slice_cols: int = 2,
    slice_rows: int = 2,
    overlap_type: str = "pixel",
    overlap_x: float = 80.0,
    overlap_y: float = 80.0,
    min_box_size: float = 2.0
):
    """
    Slices a single COCO dataset split (e.g. train, valid, test).
    Returns count of sliced images and annotations.
    """
    os.makedirs(dst_split_dir, exist_ok=True)
    
    # Locate annotation file
    ann_file = None
    candidate_names = [
        "_annotations.coco.json",
        "annotations.coco.json",
        "annotations.json",
        "instances.json"
    ]
    for c in candidate_names:
        cp = os.path.join(src_split_dir, c)
        if os.path.exists(cp):
            ann_file = cp
            break
            
    if not ann_file:
        for f in os.listdir(src_split_dir):
            if f.endswith(".json"):
                ann_file = os.path.join(src_split_dir, f)
                break

    if not ann_file:
        print(f"[SAHI Slicer] Warning: No annotation JSON found in {src_split_dir}")
        return 0, 0, []

    with open(ann_file, "r", encoding="utf-8") as f:
        coco = json.load(f)

    categories = coco.get("categories", [])
    images = coco.get("images", [])
    annotations = coco.get("annotations", [])

    # Group annotations by image_id
    ann_by_img = {}
    for a in annotations:
        iid = a.get("image_id")
        if iid not in ann_by_img:
            ann_by_img[iid] = []
        ann_by_img[iid].append(a)

    new_images = []
    new_anns = []
    img_id_count = 1
    ann_id_count = 1

    print(f"[SAHI Slicer] Slicing {len(images)} images in {Path(src_split_dir).name} split ({slice_cols}x{slice_rows} grid)...")

    for img_info in images:
        orig_fname = img_info.get("file_name", "")
        # Resolve image path
        img_path = os.path.join(src_split_dir, orig_fname)
        if not os.path.exists(img_path):
            img_path = os.path.join(src_split_dir, Path(orig_fname).name)
        if not os.path.exists(img_path):
            continue

        img = imread_unicode(img_path)
        if img is None:
            continue
            
        h, w = img.shape[:2]
        base_w = max(1, w // slice_cols)
        base_h = max(1, h // slice_rows)

        # Calculate overlap in pixels
        if overlap_type.lower() in ["percentage", "ratio", "percent"]:
            pct_x = overlap_x / 100.0 if overlap_x > 1.0 else overlap_x
            pct_y = overlap_y / 100.0 if overlap_y > 1.0 else overlap_y
            ov_w = int(round(base_w * pct_x))
            ov_h = int(round(base_h * pct_y))
        else:
            ov_w = int(round(overlap_x))
            ov_h = int(round(overlap_y))

        # Clamp overlap to avoid reverse bounds
        ov_w = max(0, min(ov_w, base_w - 4 if base_w > 4 else 0))
        ov_h = max(0, min(ov_h, base_h - 4 if base_h > 4 else 0))

        # Uniform tile dimensions: every single patch has the exact same width and height
        tile_w = min(w, base_w + (ov_w if slice_cols > 1 else 0))
        tile_h = min(h, base_h + (ov_h if slice_rows > 1 else 0))
        tile_w = max(16, tile_w)
        tile_h = max(16, tile_h)

        # Precompute uniform grid start coordinates across the image
        x_starts = []
        if slice_cols <= 1 or w <= tile_w:
            x_starts = [0] * max(1, slice_cols)
        else:
            step_x = (w - tile_w) / float(slice_cols - 1)
            for c in range(slice_cols):
                xs = int(round(c * step_x))
                x_starts.append(max(0, min(xs, w - tile_w)))

        y_starts = []
        if slice_rows <= 1 or h <= tile_h:
            y_starts = [0] * max(1, slice_rows)
        else:
            step_y = (h - tile_h) / float(slice_rows - 1)
            for r in range(slice_rows):
                ys = int(round(r * step_y))
                y_starts.append(max(0, min(ys, h - tile_h)))

        base_clean_name = Path(orig_fname).name
        stem = Path(base_clean_name).stem
        ext = Path(base_clean_name).suffix or ".jpg"

        matched_anns = ann_by_img.get(img_info.get("id"), [])

        for r in range(slice_rows):
            for c in range(slice_cols):
                x1 = x_starts[c]
                y1 = y_starts[r]
                x2 = x1 + tile_w
                y2 = y1 + tile_h

                tile = img[y1:y2, x1:x2]
                actual_th, actual_tw = tile.shape[:2]
                if actual_th <= 0 or actual_tw <= 0:
                    continue

                tile_name = f"{img_id_count}_{stem}_r{r}c{c}{ext}"
                tile_dst_path = os.path.join(dst_split_dir, tile_name)
                imwrite_unicode(tile_dst_path, tile)

                new_images.append({
                    "id": img_id_count,
                    "file_name": tile_name,
                    "width": actual_tw,
                    "height": actual_th
                })

                # Adjust annotations for this tile
                for ann in matched_anns:
                    bbox = ann.get("bbox", [])
                    if len(bbox) < 4:
                        continue
                    ax, ay, aw, ah = bbox
                    
                    # Intersection check with tile window
                    if ax < x2 and ax + aw > x1 and ay < y2 and ay + ah > y1:
                        # Shift to tile relative coordinates
                        nx = max(0.0, ax - x1)
                        ny = max(0.0, ay - y1)
                        nw = min(ax + aw, float(x2)) - max(ax, float(x1))
                        nh = min(ay + ah, float(y2)) - max(ay, float(y1))

                        if nw >= min_box_size and nh >= min_box_size:
                            new_ann = ann.copy()
                            new_ann.update({
                                "id": ann_id_count,
                                "image_id": img_id_count,
                                "bbox": [round(nx, 2), round(ny, 2), round(nw, 2), round(nh, 2)],
                                "area": round(nw * nh, 2)
                            })

                            if "segmentation" in ann and ann["segmentation"]:
                                new_seg = []
                                for poly in ann["segmentation"]:
                                    if not isinstance(poly, list):
                                        continue
                                    shifted_poly = []
                                    for i, p in enumerate(poly):
                                        if i % 2 == 0:
                                            cp = min(float(tile_w), max(0.0, float(p - x1)))
                                        else:
                                            cp = min(float(tile_h), max(0.0, float(p - y1)))
                                        shifted_poly.append(round(cp, 1))
                                    if len(shifted_poly) >= 6:
                                        new_seg.append(shifted_poly)
                                new_ann["segmentation"] = new_seg

                            new_anns.append(new_ann)
                            ann_id_count += 1

                img_id_count += 1

    # Save output COCO annotations
    dst_ann_path = os.path.join(dst_split_dir, "_annotations.coco.json")
    with open(dst_ann_path, "w", encoding="utf-8") as f:
        json.dump({
            "info": coco.get("info", {}),
            "licenses": coco.get("licenses", []),
            "categories": categories,
            "images": new_images,
            "annotations": new_anns
        }, f, indent=2)

    return len(new_images), len(new_anns), categories

def slice_dataset(
    src_dataset_dir: str,
    dst_dataset_dir: str,
    slice_cols: int = 2,
    slice_rows: int = 2,
    overlap_type: str = "pixel",
    overlap_x: float = 80.0,
    overlap_y: float = 80.0,
    min_box_size: float = 2.0,
    force_reslice: bool = False
):
    src_path = Path(src_dataset_dir).resolve()
    dst_path = Path(dst_dataset_dir).resolve()

    # Fallback resolution if src_path does not exist
    if not src_path.exists():
        # Check if src_path accidentally ended with _sahi
        if str(src_path).endswith("_sahi"):
            cand = Path(str(src_path)[:-5])
            if cand.exists():
                src_path = cand
        # Check if an archive (.zip) exists for src_path
        if not src_path.exists():
            for zcand in [src_path.with_suffix(".zip"), Path(str(src_path) + ".zip")]:
                if zcand.exists():
                    import zipfile
                    print(f"[SAHI Slicer] Auto-extracting source archive: {zcand.name}...", flush=True)
                    src_path.mkdir(parents=True, exist_ok=True)
                    with zipfile.ZipFile(zcand, "r") as zr:
                        zr.extractall(src_path)
                    break

    if not src_path.exists():
        raise FileNotFoundError(f"Source dataset directory does not exist: {src_path}")

    # Check if already sliced and whether parameters match
    needs_reslice = force_reslice
    if dst_path.exists() and not needs_reslice:
        meta_file = dst_path / "sahi_metadata.json"
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    p = meta.get("slicing_params", {})
                    if (
                        p.get("algorithm") != "uniform_v2"
                        or p.get("slice_cols") != slice_cols
                        or p.get("slice_rows") != slice_rows
                        or p.get("overlap_type") != overlap_type
                        or float(p.get("overlap_x", -1)) != float(overlap_x)
                        or float(p.get("overlap_y", -1)) != float(overlap_y)
                    ):
                        needs_reslice = True
            except Exception:
                needs_reslice = True
        else:
            # Old non-uniform slices without metadata
            needs_reslice = True

    if dst_path.exists() and not needs_reslice:
        # Check if valid
        has_train_ann = (dst_path / "train" / "_annotations.coco.json").exists() or (dst_path / "_annotations.coco.json").exists()
        if has_train_ann:
            print(f"[SAHI Slicer] Uniform sliced dataset already exists at: {dst_path}. Reusing existing slices.")
            # Scan total images
            total_imgs = 0
            all_cats = []
            splits_summary = {}
            for sp in ["train", "valid", "val", "test"]:
                ann_f = dst_path / sp / "_annotations.coco.json"
                if ann_f.exists():
                    try:
                        with open(ann_f, "r", encoding="utf-8") as f:
                            d = json.load(f)
                            cnt = len(d.get("images", []))
                            total_imgs += cnt
                            splits_summary[sp] = cnt
                            if not all_cats:
                                all_cats = [c.get("name") for c in d.get("categories", []) if c.get("name")]
                    except Exception:
                        pass
            return {
                "success": True,
                "output_dir": str(dst_path),
                "total_images": total_imgs,
                "categories": all_cats,
                "splits": splits_summary
            }

    if dst_path.exists():
        print(f"[SAHI Slicer] Slicing with uniform dimensions (algorithm: uniform_v2). Cleaning legacy slices in {dst_path.name}...")
        for sp in ["train", "valid", "val", "test", "images"]:
            sub_d = dst_path / sp
            if sub_d.exists() and sub_d.is_dir():
                shutil.rmtree(sub_d, ignore_errors=True)

    dst_path.mkdir(parents=True, exist_ok=True)

    splits_found = []
    for sp in ["train", "valid", "val", "test"]:
        sp_dir = src_path / sp
        if sp_dir.exists() and sp_dir.is_dir():
            splits_found.append(sp)

    total_images = 0
    total_annotations = 0
    all_categories = []
    splits_summary = {}

    if splits_found:
        for sp in splits_found:
            src_sp = str(src_path / sp)
            target_sp_name = "valid" if sp == "val" else sp
            dst_sp = str(dst_path / target_sp_name)
            img_cnt, ann_cnt, cats = slice_coco_split(
                src_sp,
                dst_sp,
                slice_cols=slice_cols,
                slice_rows=slice_rows,
                overlap_type=overlap_type,
                overlap_x=overlap_x,
                overlap_y=overlap_y,
                min_box_size=min_box_size
            )
            total_images += img_cnt
            total_annotations += ann_cnt
            splits_summary[target_sp_name] = img_cnt
            if not all_categories and cats:
                all_categories = [c.get("name") for c in cats if c.get("name")]
    else:
        # Flat directory dataset
        img_cnt, ann_cnt, cats = slice_coco_split(
            str(src_path),
            str(dst_path),
            slice_cols=slice_cols,
            slice_rows=slice_rows,
            overlap_type=overlap_type,
            overlap_x=overlap_x,
            overlap_y=overlap_y,
            min_box_size=min_box_size
        )
        total_images += img_cnt
        total_annotations += ann_cnt
        splits_summary["train"] = img_cnt
        if cats:
            all_categories = [c.get("name") for c in cats if c.get("name")]

    result = {
        "success": True,
        "output_dir": str(dst_path),
        "total_images": total_images,
        "total_annotations": total_annotations,
        "categories": all_categories,
        "splits": splits_summary
    }

    # Write summary metadata
    try:
        with open(dst_path / "sahi_metadata.json", "w", encoding="utf-8") as f:
            json.dump({
                **result,
                "source_dataset": str(src_path),
                "slicing_params": {
                    "algorithm": "uniform_v2",
                    "slice_cols": slice_cols,
                    "slice_rows": slice_rows,
                    "overlap_type": overlap_type,
                    "overlap_x": overlap_x,
                    "overlap_y": overlap_y,
                    "min_box_size": min_box_size
                }
            }, f, indent=2)
    except Exception:
        pass

    return result

def main():
    parser = argparse.ArgumentParser(description="SAHI Dataset Slicer Utility")
    parser.add_argument("--src_dataset_dir", type=str, required=True, help="Path to source dataset directory")
    parser.add_argument("--dst_dataset_dir", type=str, required=True, help="Path to destination sliced dataset directory")
    parser.add_argument("--slice_cols", type=int, default=2, help="Number of slice columns")
    parser.add_argument("--slice_rows", type=int, default=2, help="Number of slice rows")
    parser.add_argument("--overlap_type", type=str, default="pixel", choices=["pixel", "percentage", "percent", "ratio"])
    parser.add_argument("--overlap_x", type=float, default=80.0, help="Overlap X in pixels or percentage")
    parser.add_argument("--overlap_y", type=float, default=80.0, help="Overlap Y in pixels or percentage")
    parser.add_argument("--min_box_size", type=float, default=2.0, help="Minimum width and height of bbox to keep")
    parser.add_argument("--force", action="store_true", help="Force reslice even if destination exists")

    args = parser.parse_args()

    try:
        res = slice_dataset(
            src_dataset_dir=args.src_dataset_dir,
            dst_dataset_dir=args.dst_dataset_dir,
            slice_cols=args.slice_cols,
            slice_rows=args.slice_rows,
            overlap_type=args.overlap_type,
            overlap_x=args.overlap_x,
            overlap_y=args.overlap_y,
            min_box_size=args.min_box_size,
            force_reslice=args.force
        )
        print("\n--- SAHI_SLICER_RESULT ---")
        print(json.dumps(res))
        sys.exit(0)
    except Exception as e:
        print(f"\n[SAHI Slicer Error] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

