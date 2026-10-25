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
            ov_w = int(base_w * pct_x)
            ov_h = int(base_h * pct_y)
        else:
            ov_w = int(overlap_x)
            ov_h = int(overlap_y)

        # Clamp overlap to avoid reverse bounds
        ov_w = max(0, min(ov_w, base_w - 4))
        ov_h = max(0, min(ov_h, base_h - 4))

        base_clean_name = Path(orig_fname).name
        stem = Path(base_clean_name).stem
        ext = Path(base_clean_name).suffix or ".jpg"

        matched_anns = ann_by_img.get(img_info.get("id"), [])

        for r in range(slice_rows):
            for c in range(slice_cols):
                # Calculate coordinates with overlap
                x1 = max(0, c * base_w - (ov_w if c > 0 else 0))
                y1 = max(0, r * base_h - (ov_h if r > 0 else 0))
                x2 = min(w, (c + 1) * base_w + (ov_w if c < slice_cols - 1 else 0))
                y2 = min(h, (r + 1) * base_h + (ov_h if r < slice_rows - 1 else 0))

                tile = img[y1:y2, x1:x2]
                tile_h, tile_w = tile.shape[:2]
                if tile_h <= 0 or tile_w <= 0:
                    continue

                tile_name = f"{img_id_count}_{stem}_r{r}c{c}{ext}"
                tile_dst_path = os.path.join(dst_split_dir, tile_name)
                imwrite_unicode(tile_dst_path, tile)

                new_images.append({
                    "id": img_id_count,
                    "file_name": tile_name,
                    "width": tile_w,
                    "height": tile_h
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

    if not src_path.exists():
        raise FileNotFoundError(f"Source dataset directory does not exist: {src_path}")

    # Check if already sliced
    if dst_path.exists() and not force_reslice:
        # Check if valid
        has_train_ann = (dst_path / "train" / "_annotations.coco.json").exists() or (dst_path / "_annotations.coco.json").exists()
        if has_train_ann:
            print(f"[SAHI Slicer] Sliced dataset already exists at: {dst_path}. Reusing existing slices.")
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

