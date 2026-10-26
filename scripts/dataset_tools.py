#!/usr/bin/env python3
"""
Dataset Analysis and Archiving Utility
Performs comprehensive deep analysis of vision datasets (COCO detection/segmentation, classification):
- Max, min, average image dimensions (W x H)
- Number of samples and split distribution
- Number of annotations & distribution per class
- Number of classes and class names
- Aspect ratio analysis
- Disk size and storage path
- Zips folder on demand for downloads
"""

import os
import sys
import json
import zipfile
import io
import argparse
from pathlib import Path
from PIL import Image

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


def analyze_zip_archive(real_path: str, domain: str = "") -> dict:
    """Fast, in-memory inspection of zip archives without extracting thousands of files to disk."""
    size_mb = round(os.path.getsize(real_path) / (1024 * 1024), 2)
    try:
        with zipfile.ZipFile(real_path, 'r') as zf:
            namelist = zf.namelist()

            # 1. Search COCO JSON files
            coco_files = [
                n for n in namelist
                if (n.lower().endswith(('_annotations.coco.json', 'annotation.json', 'annotations.json', 'instances_train.json', 'instances_val.json', 'instances_test.json'))
                    or n.lower().endswith('.coco.json'))
                and not n.startswith('__MACOSX')
            ]

            if coco_files:
                total_images = 0
                total_annotations = 0
                all_categories = {}
                category_counts = {}
                class_sizes = {}
                widths = []
                heights = []
                splits = {"train": 0, "val": 0, "test": 0}
                has_segmentation = False
                has_bbox = False

                for cpath in coco_files:
                    split_key = os.path.basename(os.path.dirname(cpath)) or os.path.basename(cpath)
                    norm_split = "train" if "train" in split_key.lower() else ("test" if "test" in split_key.lower() else "val")
                    try:
                        cdata = json.loads(zf.read(cpath).decode('utf-8', errors='ignore'))
                    except Exception:
                        continue

                    raw_cats = cdata.get("categories", [])
                    anns = cdata.get("annotations", [])
                    filtered_cats = filter_coco_parent_categories(raw_cats, anns)
                    for cat in filtered_cats:
                        cid = cat.get("id")
                        cname = cat.get("name")
                        if cid is not None and cname:
                            all_categories[cid] = cname
                            if cname not in category_counts:
                                category_counts[cname] = 0

                    imgs = cdata.get("images", [])
                    splits[norm_split] += len(imgs)
                    total_images += len(imgs)

                    for im in imgs:
                        w = im.get("width")
                        h = im.get("height")
                        if w and h:
                            widths.append(w)
                            heights.append(h)

                    anns = cdata.get("annotations", [])
                    total_annotations += len(anns)
                    for an in anns:
                        cid = an.get("category_id")
                        cname = all_categories.get(cid, f"class_{cid}")
                        category_counts[cname] = category_counts.get(cname, 0) + 1
                        if an.get("segmentation"):
                            has_segmentation = True
                        if an.get("bbox"):
                            has_bbox = True
                            bbox = an.get("bbox")
                            if bbox and len(bbox) >= 4:
                                try:
                                    bw = round(float(bbox[2]))
                                    bh = round(float(bbox[3]))
                                    if bw > 0 and bh > 0:
                                        if cname not in class_sizes:
                                            class_sizes[cname] = {"min_width": bw, "min_height": bh, "max_width": bw, "max_height": bh}
                                        else:
                                            cs = class_sizes[cname]
                                            cs["min_width"] = min(cs["min_width"], bw)
                                            cs["min_height"] = min(cs["min_height"], bh)
                                            cs["max_width"] = max(cs["max_width"], bw)
                                            cs["max_height"] = max(cs["max_height"], bh)
                                except Exception:
                                    pass
                        elif an.get("segmentation"):
                            seg = an.get("segmentation")
                            if isinstance(seg, list) and len(seg) > 0 and isinstance(seg[0], list):
                                poly = seg[0]
                                xs = poly[0::2]
                                ys = poly[1::2]
                                if xs and ys:
                                    bw = round(max(xs) - min(xs))
                                    bh = round(max(ys) - min(ys))
                                    if bw > 0 and bh > 0:
                                        if cname not in class_sizes:
                                            class_sizes[cname] = {"min_width": bw, "min_height": bh, "max_width": bw, "max_height": bh}
                                        else:
                                            cs = class_sizes[cname]
                                            cs["min_width"] = min(cs["min_width"], bw)
                                            cs["min_height"] = min(cs["min_height"], bh)
                                            cs["max_width"] = max(cs["max_width"], bw)
                                            cs["max_height"] = max(cs["max_height"], bh)

                classes_list = sorted(list(category_counts.keys()))
                if not widths:
                    widths, heights = [640], [640]

                min_w, max_w = min(widths), max(widths)
                min_h, max_h = min(heights), max(heights)
                avg_w = round(sum(widths) / len(widths))
                avg_h = round(sum(heights) / len(heights))

                ann_types = []
                if has_segmentation:
                    ann_types.append("Polygon Masks (Instance Segmentation)")
                if has_bbox:
                    ann_types.append("Bounding Boxes (Object Detection)")
                if not ann_types:
                    ann_types.append("Annotations")

                return {
                    "name": os.path.basename(real_path),
                    "storagePath": real_path,
                    "fileSizeMB": size_mb,
                    "format": "COCO Vision Format",
                    "totalSamples": total_images,
                    "totalAnnotations": total_annotations,
                    "numClasses": len(classes_list),
                    "classes": classes_list,
                    "classDistribution": category_counts,
                    "classSizes": class_sizes,
                    "classInstanceSizes": class_sizes,
                    "splits": splits,
                    "imageResolution": {
                        "min": {"width": min_w, "height": min_h},
                        "max": {"width": max_w, "height": max_h},
                        "avg": {"width": avg_w, "height": avg_h}
                    },
                    "aspectRatio": f"{avg_w}:{avg_h}",
                    "annotationTypes": ann_types,
                    "avgAnnotationsPerImage": round(total_annotations / max(1, total_images), 2)
                }

            # 2. Check for Image Classification directory layout in zip
            img_files = [n for n in namelist if n.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp')) and not n.startswith('__MACOSX')]
            if img_files:
                class_folders = {}
                splits = {"train": 0, "val": 0, "test": 0}
                for n in img_files:
                    p = [seg for seg in n.replace('\\', '/').split('/') if seg]
                    split_name = "train"
                    class_name = "unclassified"
                    if len(p) >= 3 and p[-3].lower() in ['train', 'valid', 'val', 'test']:
                        split_name = "train" if "train" in p[-3].lower() else ("test" if "test" in p[-3].lower() else "val")
                        class_name = p[-2]
                    elif len(p) >= 2:
                        if p[-2].lower() in ['train', 'valid', 'val', 'test']:
                            split_name = "train" if "train" in p[-2].lower() else ("test" if "test" in p[-2].lower() else "val")
                            class_name = "sample"
                        else:
                            class_name = p[-2]
                    splits[split_name] = splits.get(split_name, 0) + 1
                    class_folders[class_name] = class_folders.get(class_name, 0) + 1

                classes_list = sorted(list(class_folders.keys()))
                widths, heights = [], []
                for sample_img in img_files[:10]:
                    try:
                        with Image.open(io.BytesIO(zf.read(sample_img))) as im:
                            widths.append(im.width)
                            heights.append(im.height)
                    except Exception:
                        pass

                if not widths:
                    widths, heights = [224], [224]

                min_w, max_w = min(widths), max(widths)
                min_h, max_h = min(heights), max(heights)
                avg_w = round(sum(widths) / len(widths))
                avg_h = round(sum(heights) / len(heights))

                class_sizes = {
                    cname: {"min_width": min_w, "min_height": min_h, "max_width": max_w, "max_height": max_h}
                    for cname in classes_list
                }

                total_imgs = len(img_files)
                return {
                    "name": os.path.basename(real_path),
                    "storagePath": real_path,
                    "fileSizeMB": size_mb,
                    "format": "Image Classification Directory",
                    "totalSamples": total_imgs,
                    "totalAnnotations": total_imgs,
                    "numClasses": len(classes_list),
                    "classes": classes_list,
                    "classDistribution": class_folders,
                    "classSizes": class_sizes,
                    "classInstanceSizes": class_sizes,
                    "splits": splits,
                    "imageResolution": {
                        "min": {"width": min_w, "height": min_h},
                        "max": {"width": max_w, "height": max_h},
                        "avg": {"width": avg_w, "height": avg_h}
                    },
                    "aspectRatio": f"{avg_w}x{avg_h}",
                    "annotationTypes": ["Class Labels (Single-Label Classification)"],
                    "avgAnnotationsPerImage": 1.0
                }

            # 3. Check for Tabular / CSV in zip
            csv_files = [n for n in namelist if n.lower().endswith(('.csv', '.tsv', '.parquet', '.xlsx')) and not n.startswith('__MACOSX')]
            if csv_files:
                import csv
                main_csv = csv_files[0]
                try:
                    content = zf.read(main_csv).decode('utf-8', errors='ignore')
                    reader = csv.reader(io.StringIO(content))
                    header = next(reader, [])
                    row_count = sum(1 for _ in reader)
                    classes_list = [f"Col: {c.strip()}" for c in header[:10]]
                    return {
                        "name": os.path.basename(real_path),
                        "storagePath": real_path,
                        "fileSizeMB": size_mb,
                        "format": "Tabular Dataset (CSV / Table)",
                        "domain": "Tabular",
                        "totalSamples": row_count or 1,
                        "totalAnnotations": len(header),
                        "numClasses": len(header),
                        "classes": classes_list,
                        "classDistribution": {c.strip(): row_count for c in header[:8]},
                        "splits": {"train": int(row_count * 0.8), "val": int(row_count * 0.2), "test": 0},
                        "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
                        "aspectRatio": f"{len(header)} cols x {row_count} rows",
                        "annotationTypes": ["Tabular Columns / Features"],
                        "avgAnnotationsPerImage": float(len(header))
                    }
                except Exception:
                    pass

            # Fallback generic archive
            return {
                "name": os.path.basename(real_path),
                "storagePath": real_path,
                "fileSizeMB": size_mb,
                "format": "archive",
                "totalSamples": len(namelist),
                "totalAnnotations": 0,
                "numClasses": 0,
                "classes": [],
                "classDistribution": {},
                "splits": {"train": len(namelist), "val": 0, "test": 0},
                "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
                "aspectRatio": "N/A",
                "annotationTypes": ["Compressed File"],
                "avgAnnotationsPerImage": 0.0
            }
    except Exception as e:
        return {
            "name": os.path.basename(real_path),
            "storagePath": real_path,
            "fileSizeMB": size_mb,
            "format": "archive",
            "totalSamples": 1,
            "totalAnnotations": 0,
            "numClasses": 0,
            "classes": [],
            "classDistribution": {},
            "splits": {"train": 1, "val": 0, "test": 0},
            "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
            "aspectRatio": "N/A",
            "annotationTypes": ["Compressed File"],
            "avgAnnotationsPerImage": 0.0
        }

def analyze_dataset(dataset_dir: str, domain: str = "") -> dict:
    real_path = os.path.abspath(dataset_dir)
    if not os.path.exists(real_path):
        return {"error": f"Path not found: {dataset_dir}"}

    # Detect if directory or zip archive - if archive, inspect directly in memory without blocking disk extraction
    if os.path.isfile(real_path):
        if real_path.endswith('.zip') or zipfile.is_zipfile(real_path):
            return analyze_zip_archive(real_path, domain)
        elif real_path.lower().endswith(('.csv', '.tsv', '.parquet', '.xlsx', '.xls')) or (domain and "tabular" in domain.lower()):
            # Analyze single tabular file directly
            size_mb = round(os.path.getsize(real_path) / (1024 * 1024), 2)
            try:
                import csv
                with open(real_path, "r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.reader(f)
                    header = next(reader, [])
                    row_count = sum(1 for _ in reader)
                classes_list = [f"Col: {c.strip()}" for c in header[:10]]
                return {
                    "name": os.path.basename(real_path),
                    "storagePath": real_path,
                    "fileSizeMB": size_mb,
                    "format": "Tabular Dataset (CSV / Table)",
                    "domain": "Tabular",
                    "totalSamples": row_count or 1,
                    "totalAnnotations": len(header),
                    "numClasses": len(header),
                    "classes": classes_list,
                    "classDistribution": {c.strip(): row_count for c in header[:8]},
                    "splits": {"train": int(row_count * 0.8), "val": int(row_count * 0.2), "test": 0},
                    "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
                    "aspectRatio": f"{len(header)} cols x {row_count} rows",
                    "annotationTypes": ["Tabular Columns / Features"],
                    "avgAnnotationsPerImage": float(len(header))
                }
            except Exception:
                pass
            return {
                "name": os.path.basename(real_path),
                "storagePath": real_path,
                "fileSizeMB": size_mb,
                "format": "Tabular Dataset (CSV / Table)",
                "domain": "Tabular",
                "totalSamples": 1,
                "totalAnnotations": 0,
                "numClasses": 0,
                "classes": ["Feature_1", "Feature_2"],
                "classDistribution": {},
                "splits": {"train": 1, "val": 0, "test": 0},
                "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
                "aspectRatio": "Tabular Data",
                "annotationTypes": ["Tabular Columns"],
                "avgAnnotationsPerImage": 0.0
            }
        else:
            size_mb = round(os.path.getsize(real_path) / (1024 * 1024), 2)
            return {
                "name": os.path.basename(real_path),
                "storagePath": real_path,
                "fileSizeMB": size_mb,
                "format": "file",
                "totalSamples": 1,
                "totalAnnotations": 0,
                "numClasses": 0,
                "classes": [],
                "classDistribution": {},
                "splits": {"train": 1, "val": 0, "test": 0},
                "imageResolution": {
                    "min": {"width": 0, "height": 0},
                    "max": {"width": 0, "height": 0},
                    "avg": {"width": 0, "height": 0}
                },
                "aspectRatio": "N/A",
                "annotationTypes": ["Binary/Data File"],
                "avgAnnotationsPerImage": 0.0
            }

    # Calculate folder size
    total_bytes = 0
    for root, _, files in os.walk(real_path):
        for f in files:
            fp = os.path.join(root, f)
            if not os.path.islink(fp):
                total_bytes += os.path.getsize(fp)
    size_mb = round(total_bytes / (1024 * 1024), 2)

    # 0. Tabular Domain Detection
    if domain and "tabular" in domain.lower():
        csv_files = []
        for root, _, files in os.walk(real_path):
            for f in files:
                if f.lower().endswith(('.csv', '.tsv', '.parquet', '.xlsx')):
                    csv_files.append(os.path.join(root, f))
        if csv_files:
            main_csv = csv_files[0]
            try:
                import csv
                with open(main_csv, "r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.reader(f)
                    header = next(reader, [])
                    row_count = sum(1 for _ in reader)
                classes_list = [f"Col: {c.strip()}" for c in header[:10]]
                return {
                    "name": os.path.basename(real_path),
                    "storagePath": real_path,
                    "fileSizeMB": size_mb,
                    "format": "Tabular Dataset (CSV / Table)",
                    "domain": "Tabular",
                    "totalSamples": row_count or 1,
                    "totalAnnotations": len(header),
                    "numClasses": len(header),
                    "classes": classes_list,
                    "classDistribution": {c.strip(): row_count for c in header[:8]},
                    "splits": {"train": int(row_count * 0.8), "val": int(row_count * 0.2), "test": 0},
                    "imageResolution": {"min": {"width": 0, "height": 0}, "max": {"width": 0, "height": 0}, "avg": {"width": 0, "height": 0}},
                    "aspectRatio": f"{len(header)} cols x {row_count} rows",
                    "annotationTypes": ["Tabular Columns / Features"],
                    "avgAnnotationsPerImage": float(len(header))
                }
            except Exception:
                pass

    # Search for COCO json files
    coco_files = []
    for split_name in ["train", "valid", "val", "test", "annotations", ""]:
        sub = os.path.join(real_path, split_name) if split_name else real_path
        if os.path.exists(sub) and os.path.isdir(sub):
            for candidate in ["_annotations.coco.json", "annotation.json", "annotations.json", "instances_train.json", "instances_val.json", "instances_test.json"]:
                cp = os.path.join(sub, candidate)
                if os.path.exists(cp):
                    coco_files.append((split_name or "root", cp))

    if not coco_files:
        for root, _, files in os.walk(real_path):
            for f in files:
                if f.lower() in ["_annotations.coco.json", "annotation.json", "annotations.json"] or f.lower().endswith(".coco.json"):
                    split_key = os.path.basename(root)
                    coco_files.append((split_key, os.path.join(root, f)))

    if coco_files:
        # COCO Dataset Analysis
        total_images = 0
        total_annotations = 0
        all_categories = {}
        category_counts = {}
        class_sizes = {}
        widths = []
        heights = []
        splits = {"train": 0, "val": 0, "test": 0}
        has_segmentation = False
        has_bbox = False

        for split_key, cpath in coco_files:
            norm_split = "train" if "train" in split_key.lower() else ("test" if "test" in split_key.lower() else "val")
            try:
                with open(cpath, "r", encoding="utf-8") as f:
                    cdata = json.load(f)
            except Exception:
                continue

            raw_cats = cdata.get("categories", [])
            anns = cdata.get("annotations", [])
            filtered_cats = filter_coco_parent_categories(raw_cats, anns)
            for cat in filtered_cats:
                cid = cat.get("id")
                cname = cat.get("name")
                if cid is not None and cname:
                    all_categories[cid] = cname
                    if cname not in category_counts:
                        category_counts[cname] = 0

            imgs = cdata.get("images", [])
            splits[norm_split] += len(imgs)
            total_images += len(imgs)

            for im in imgs:
                w = im.get("width")
                h = im.get("height")
                if w and h:
                    widths.append(w)
                    heights.append(h)

            anns = cdata.get("annotations", [])
            total_annotations += len(anns)
            for an in anns:
                cid = an.get("category_id")
                cname = all_categories.get(cid, f"class_{cid}")
                category_counts[cname] = category_counts.get(cname, 0) + 1
                if an.get("segmentation"):
                    has_segmentation = True
                if an.get("bbox"):
                    has_bbox = True
                    bbox = an.get("bbox")
                    if bbox and len(bbox) >= 4:
                        try:
                            bw = round(float(bbox[2]))
                            bh = round(float(bbox[3]))
                            if bw > 0 and bh > 0:
                                if cname not in class_sizes:
                                    class_sizes[cname] = {
                                        "min_width": bw,
                                        "min_height": bh,
                                        "max_width": bw,
                                        "max_height": bh
                                    }
                                else:
                                    cs = class_sizes[cname]
                                    cs["min_width"] = min(cs["min_width"], bw)
                                    cs["min_height"] = min(cs["min_height"], bh)
                                    cs["max_width"] = max(cs["max_width"], bw)
                                    cs["max_height"] = max(cs["max_height"], bh)
                        except Exception:
                            pass
                elif an.get("segmentation"):
                    seg = an.get("segmentation")
                    if isinstance(seg, list) and len(seg) > 0 and isinstance(seg[0], list):
                        poly = seg[0]
                        xs = poly[0::2]
                        ys = poly[1::2]
                        if xs and ys:
                            bw = round(max(xs) - min(xs))
                            bh = round(max(ys) - min(ys))
                            if bw > 0 and bh > 0:
                                if cname not in class_sizes:
                                    class_sizes[cname] = {
                                        "min_width": bw,
                                        "min_height": bh,
                                        "max_width": bw,
                                        "max_height": bh
                                    }
                                else:
                                    cs = class_sizes[cname]
                                    cs["min_width"] = min(cs["min_width"], bw)
                                    cs["min_height"] = min(cs["min_height"], bh)
                                    cs["max_width"] = max(cs["max_width"], bw)
                                    cs["max_height"] = max(cs["max_height"], bh)

        classes_list = sorted(list(category_counts.keys()))
        if not widths:
            widths = [640]
            heights = [640]

        min_w, max_w = min(widths), max(widths)
        min_h, max_h = min(heights), max(heights)
        avg_w = round(sum(widths) / len(widths))
        avg_h = round(sum(heights) / len(heights))

        # Aspect ratio determination
        aspect = "1:1 (Square)"
        ratio = avg_w / max(1, avg_h)
        if abs(ratio - 1.0) < 0.05:
            aspect = "1:1 (Square)"
        elif abs(ratio - 1.33) < 0.1:
            aspect = "4:3 (Standard)"
        elif abs(ratio - 1.77) < 0.15:
            aspect = "16:9 (Widescreen)"
        elif ratio > 1:
            aspect = f"{ratio:.2f}:1 (Landscape)"
        else:
            aspect = f"1:{1/ratio:.2f} (Portrait)"

        ann_types = []
        if has_segmentation:
            ann_types.append("Polygon Masks (Instance Segmentation)")
        if has_bbox:
            ann_types.append("Bounding Boxes (Object Detection)")
        if not ann_types:
            ann_types.append("Annotations")

        return {
            "name": os.path.basename(real_path),
            "storagePath": real_path,
            "fileSizeMB": size_mb,
            "format": "COCO Vision Format",
            "totalSamples": total_images,
            "totalAnnotations": total_annotations,
            "numClasses": len(classes_list),
            "classes": classes_list,
            "classDistribution": category_counts,
            "classSizes": class_sizes,
            "classInstanceSizes": class_sizes,
            "splits": splits,
            "imageResolution": {
                "min": {"width": min_w, "height": min_h},
                "max": {"width": max_w, "height": max_h},
                "avg": {"width": avg_w, "height": avg_h}
            },
            "aspectRatio": aspect,
            "annotationTypes": ann_types,
            "avgAnnotationsPerImage": round(total_annotations / max(1, total_images), 2)
        }

    # Classification folder structure check
    class_folders = {}
    class_sizes = {}
    splits = {"train": 0, "val": 0, "test": 0}
    widths = []
    heights = []

    # Support nested folders (e.g. unzipped archives with top-level container directory)
    candidate_clf_dirs = [real_path]
    try:
        for entry in os.listdir(real_path):
            sub = os.path.join(real_path, entry)
            if os.path.isdir(sub) and not entry.startswith('.'):
                candidate_clf_dirs.append(sub)
    except Exception:
        pass

    for base_d in candidate_clf_dirs:
        for split_name in ["train", "valid", "val", "test"]:
            sdir = os.path.join(base_d, split_name)
            if os.path.exists(sdir) and os.path.isdir(sdir):
                norm_split = "train" if "train" in split_name else ("test" if "test" in split_name else "val")
                for cname in os.listdir(sdir):
                    cdir = os.path.join(sdir, cname)
                    if os.path.isdir(cdir) and not cname.startswith("."):
                        img_files = [f for f in os.listdir(cdir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp'))]
                        splits[norm_split] += len(img_files)
                        class_folders[cname] = class_folders.get(cname, 0) + len(img_files)
                        # Sample image dimensions
                        for sample_f in img_files[:20]:
                            try:
                                with Image.open(os.path.join(cdir, sample_f)) as im:
                                    widths.append(im.width)
                                    heights.append(im.height)
                                    if cname not in class_sizes:
                                        class_sizes[cname] = {
                                            "min_width": im.width,
                                            "min_height": im.height,
                                            "max_width": im.width,
                                            "max_height": im.height
                                        }
                                    else:
                                        cs = class_sizes[cname]
                                        cs["min_width"] = min(cs["min_width"], im.width)
                                        cs["min_height"] = min(cs["min_height"], im.height)
                                        cs["max_width"] = max(cs["max_width"], im.width)
                                        cs["max_height"] = max(cs["max_height"], im.height)
                            except Exception:
                                pass
        if class_folders:
            break

    if not class_folders:
        for base_d in candidate_clf_dirs:
            try:
                sub_entries = [e for e in os.listdir(base_d) if os.path.isdir(os.path.join(base_d, e)) and not e.startswith('.')]
                sub_entries = [e for e in sub_entries if e.lower() not in ['train', 'valid', 'val', 'test', 'annotations', 'images', 'labels', 'metadata', '__pycache__']]
                for cname in sub_entries:
                    cdir = os.path.join(base_d, cname)
                    img_files = [f for f in os.listdir(cdir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp'))]
                    if img_files:
                        splits["train"] += len(img_files)
                        class_folders[cname] = len(img_files)
                        for sample_f in img_files[:20]:
                            try:
                                with Image.open(os.path.join(cdir, sample_f)) as im:
                                    widths.append(im.width)
                                    heights.append(im.height)
                            except Exception:
                                pass
                if class_folders:
                    splits["val"] = max(1, int(len(img_files) * 0.2))
                    break
            except Exception:
                pass

    if class_folders:
        classes_list = sorted(list(class_folders.keys()))
        total_samples = sum(class_folders.values())
        if not widths:
            widths = [224]
            heights = [224]

        min_w, max_w = min(widths), max(widths)
        min_h, max_h = min(heights), max(heights)
        avg_w = round(sum(widths) / len(widths))
        avg_h = round(sum(heights) / len(heights))

        return {
            "name": os.path.basename(real_path),
            "storagePath": real_path,
            "fileSizeMB": size_mb,
            "format": "Image Classification Directory",
            "totalSamples": total_samples,
            "totalAnnotations": total_samples,
            "numClasses": len(classes_list),
            "classes": classes_list,
            "classDistribution": class_folders,
            "classSizes": class_sizes,
            "classInstanceSizes": class_sizes,
            "splits": splits,
            "imageResolution": {
                "min": {"width": min_w, "height": min_h},
                "max": {"width": max_w, "height": max_h},
                "avg": {"width": avg_w, "height": avg_h}
            },
            "aspectRatio": f"{avg_w}x{avg_h}",
            "annotationTypes": ["Class Labels (Single-Label Classification)"],
            "avgAnnotationsPerImage": 1.0
        }

    # Fallback generic directory
    image_count = 0
    for root, _, files in os.walk(real_path):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp')):
                image_count += 1
                if len(widths) < 20:
                    try:
                        with Image.open(os.path.join(root, f)) as im:
                            widths.append(im.width)
                            heights.append(im.height)
                    except Exception:
                        pass

    if not widths:
        widths = [640]
        heights = [640]

    return {
        "name": os.path.basename(real_path),
        "storagePath": real_path,
        "fileSizeMB": size_mb,
        "format": "Vision Dataset",
        "totalSamples": image_count or 100,
        "totalAnnotations": image_count or 100,
        "numClasses": 1,
        "classes": ["object"],
        "classDistribution": {"object": image_count or 100},
        "splits": {"train": round(image_count * 0.8), "val": round(image_count * 0.2), "test": 0},
        "imageResolution": {
            "min": {"width": min(widths), "height": min(heights)},
            "max": {"width": max(widths), "height": max(heights)},
            "avg": {"width": round(sum(widths)/len(widths)), "height": round(sum(heights)/len(heights))}
        },
        "aspectRatio": "1:1",
        "annotationTypes": ["General Annotations"],
        "avgAnnotationsPerImage": 1.0
    }


def zip_dataset_dir(dataset_dir: str, target_zip: str):
    real_path = os.path.abspath(dataset_dir)
    target_path = os.path.abspath(target_zip)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    with zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(real_path):
            for file in files:
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, real_path)
                z.write(full_p, rel_p)

    return target_path


def extract_dataset_zip(zip_path: str, extract_to: str):
    real_zip = os.path.abspath(zip_path)
    real_dest = os.path.abspath(extract_to)
    if not os.path.exists(real_zip):
        raise FileNotFoundError(f"Zip archive not found: {zip_path}")
    os.makedirs(real_dest, exist_ok=True)
    with zipfile.ZipFile(real_zip, 'r') as zf:
        zf.extractall(real_dest)
    return real_dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dataset Analyzer & Archiver")
    parser.add_argument("--action", type=str, choices=["analyze", "zip", "extract"], default="analyze")
    parser.add_argument("--dataset_dir", type=str, required=True, help="Path to dataset directory")
    parser.add_argument("--target_zip", type=str, default="", help="Target output or source zip file path")
    parser.add_argument("--domain", type=str, default="", help="Dataset domain hint")

    args = parser.parse_args()

    if args.action == "analyze":
        result = analyze_dataset(args.dataset_dir, domain=args.domain)
        print("__DATASET_JSON_START__")
        print(json.dumps(result, indent=2))
        print("__DATASET_JSON_END__")
    elif args.action == "zip":
        out = zip_dataset_dir(args.dataset_dir, args.target_zip)
        print(f"Dataset zipped successfully to: {out}")
    elif args.action == "extract":
        out = extract_dataset_zip(args.target_zip or args.dataset_dir, args.dataset_dir if args.target_zip else os.path.splitext(args.dataset_dir)[0])
        print(f"Dataset extracted successfully to: {out}")

