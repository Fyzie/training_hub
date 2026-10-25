#!/usr/bin/env python3
"""
RF-DETR Object Detection Inference Pipeline with SAHI (Slicing Aided Hyper Inference)
Performs high-resolution sliced inference for small defect / object bounding box detection.
"""

import os
import sys
import json
import argparse
from pathlib import Path
import torch
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

try:
    import rfdetr
    HAS_RFDETR = True
except ImportError:
    HAS_RFDETR = False

def load_metadata_config():
    meta_paths = [
        "training_metadata.json",
        os.path.join("weights", "..", "training_metadata.json"),
        os.path.join(os.path.dirname(__file__), "..", "training_metadata.json")
    ]
    for mp in meta_paths:
        if os.path.exists(mp):
            try:
                with open(mp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    print(f"[Metadata] Loaded configuration from {mp}")
                    return data
            except Exception:
                pass
    return {}

def resolve_model_class(arch_name: str):
    if not HAS_RFDETR:
        return None
    clean_arch = arch_name.replace("(SAHI)", "").replace("(sahi)", "").strip()
    if hasattr(rfdetr, clean_arch):
        return getattr(rfdetr, clean_arch)
    for attr in dir(rfdetr):
        if attr.lower() == clean_arch.lower():
            return getattr(rfdetr, attr)
    arch_lower = clean_arch.lower()
    if "nano" in arch_lower and hasattr(rfdetr, "RFDETRNano"):
        return getattr(rfdetr, "RFDETRNano")
    if "small" in arch_lower and hasattr(rfdetr, "RFDETRSmall"):
        return getattr(rfdetr, "RFDETRSmall")
    if "base" in arch_lower and hasattr(rfdetr, "RFDETRBase"):
        return getattr(rfdetr, "RFDETRBase")
    if "large" in arch_lower and hasattr(rfdetr, "RFDETRLarge"):
        return getattr(rfdetr, "RFDETRLarge")
    if "medium" in arch_lower and hasattr(rfdetr, "RFDETRMedium"):
        return getattr(rfdetr, "RFDETRMedium")
    return getattr(rfdetr, "RFDETRSmall", None)

def resolve_default_weights(weights_path: str) -> str:
    if os.path.exists(weights_path):
        return os.path.abspath(weights_path)
    
    alternatives = [
        "checkpoint_best_total.pth",
        os.path.join("weights", "checkpoint_best_total.pth"),
        "best_rfdetr_weights.pt",
        os.path.join("weights", "best_rfdetr_weights.pt"),
        "checkpoint_best_ema.pth",
        os.path.join("weights", "checkpoint_best_ema.pth"),
    ]
    for alt in alternatives:
        if os.path.exists(alt):
            print(f"[Auto-Detect] Using discovered checkpoint: {alt}")
            return os.path.abspath(alt)
            
    return os.path.abspath(weights_path)

def nms_boxes(boxes, scores, iou_threshold=0.5):
    """
    Standard Non-Maximum Suppression (NMS) for numpy arrays.
    boxes: np.ndarray shape (N, 4) in format [x1, y1, x2, y2]
    scores: np.ndarray shape (N,)
    """
    if len(boxes) == 0:
        return []

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]

    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break

        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h

        ovr = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(ovr <= iou_threshold)[0]
        order = order[inds + 1]

    return keep

def render_detection_overlay(img_path: str, boxes, scores, classes, class_names, output_path: str):
    raw_img = Image.open(img_path).convert("RGBA")
    w, h = raw_img.size

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        font = ImageFont.load_default()

    colors = [
        (16, 185, 129, 255),
        (37, 99, 235, 255),
        (245, 158, 11, 255),
        (139, 92, 246, 255),
        (239, 68, 68, 255),
        (6, 182, 212, 255),
        (236, 72, 153, 255),
        (249, 115, 22, 255)
    ]

    for idx, box in enumerate(boxes):
        score = float(scores[idx]) if len(scores) > idx else 0.0
        cls_id = int(classes[idx]) if len(classes) > idx else 0
        cls_name = class_names[cls_id] if class_names and cls_id < len(class_names) else str(cls_id)
        
        outline_col = colors[cls_id % len(colors)]
        fill_col = (outline_col[0], outline_col[1], outline_col[2], 40)

        bx1, by1, bx2, by2 = [int(v) for v in box]
        draw.rectangle([(bx1, by1), (bx2, by2)], fill=fill_col, outline=outline_col, width=2)

        tag = f"{cls_name} (SAHI) {score:.2f}"
        try:
            tb = font.getbbox(tag)
            tw, th = tb[2] - tb[0] + 10, tb[3] - tb[1] + 6
        except Exception:
            tw, th = len(tag) * 7 + 10, 18
        ty1 = max(0, by1 - th)
        draw.rectangle([(bx1, ty1), (bx1 + tw, ty1 + th)], fill=outline_col)
        draw.text((bx1 + 5, ty1 + 2), tag, fill=(255, 255, 255), font=font)

    final_img = Image.alpha_composite(raw_img, overlay).convert("RGB")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    final_img.save(output_path, "PNG")
    print(f"[Overlay] Saved SAHI bounding box visualization to: {output_path}")

def run_sahi_bbox_inference(
    weights_path: str,
    source_path: str,
    conf_threshold: float = 0.35,
    device: str = "cuda",
    slice_cols: int = 2,
    slice_rows: int = 2,
    overlap_type: str = "pixel",
    overlap_x: float = 80.0,
    overlap_y: float = 80.0,
    use_sahi: bool = True,
    output_dir: str = "inference_outputs"
):
    weights_path = resolve_default_weights(weights_path)
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights file not found at: {weights_path}")

    meta = load_metadata_config()
    raw_arch = meta.get("model_architecture", "RFDETRSmall")
    classes = meta.get("classes", [])
    num_classes = meta.get("num_classes", len(classes) if classes else None)

    active_device = "cuda" if (torch.cuda.is_available() and device.startswith("cuda")) else "cpu"
    print(f"[SAHI Inference] Architecture: {raw_arch} | Slices: {slice_cols}x{slice_rows} | Overlap: {overlap_x}x{overlap_y} ({overlap_type}) | Device: {active_device}")

    model_cls = resolve_model_class(raw_arch)
    model = None
    if HAS_RFDETR and model_cls is not None:
        try:
            if num_classes is not None:
                model = model_cls(num_classes=num_classes, pretrain_weights=weights_path)
            else:
                model = model_cls(pretrain_weights=weights_path)
            print(f"[SAHI Inference] Model successfully loaded.")
        except Exception as e:
            print(f"[SAHI Inference] Model load warning: {e}")

    image_paths = []
    if os.path.isdir(source_path):
        image_paths = [os.path.join(source_path, f) for f in os.listdir(source_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    else:
        image_paths = [source_path]

    os.makedirs(output_dir, exist_ok=True)

    for img_p in image_paths:
        if not os.path.exists(img_p):
            print(f"[Warning] Image not found: {img_p}")
            continue

        raw_cv_img = cv2.imread(img_p)
        if raw_cv_img is None:
            continue
        h, w = raw_cv_img.shape[:2]

        all_boxes = []
        all_scores = []
        all_class_ids = []

        if not use_sahi or (slice_cols <= 1 and slice_rows <= 1):
            # Direct inference
            if model is not None:
                preds = model.predict(images=img_p, threshold=conf_threshold, device=active_device)
                all_boxes = list(getattr(preds, "xyxy", []))
                all_scores = list(getattr(preds, "confidence", []))
                all_class_ids = list(getattr(preds, "class_id", []))
        else:
            # SAHI Sliced Inference
            base_w = w // slice_cols
            base_h = h // slice_rows

            if overlap_type.lower() in ["percentage", "ratio", "percent"]:
                pct_x = overlap_x / 100.0 if overlap_x > 1.0 else overlap_x
                pct_y = overlap_y / 100.0 if overlap_y > 1.0 else overlap_y
                ov_w = int(base_w * pct_x)
                ov_h = int(base_h * pct_y)
            else:
                ov_w = int(overlap_x)
                ov_h = int(overlap_y)

            ov_w = max(0, min(ov_w, base_w - 4))
            ov_h = max(0, min(ov_h, base_h - 4))

            print(f"[SAHI Slicing] Slicing image {Path(img_p).name} ({w}x{h}) into {slice_cols}x{slice_rows} grid (overlap {ov_w}x{ov_h} px)...")

            for r in range(slice_rows):
                for c in range(slice_cols):
                    x1 = max(0, c * base_w - (ov_w if c > 0 else 0))
                    y1 = max(0, r * base_h - (ov_h if r > 0 else 0))
                    x2 = min(w, (c + 1) * base_w + (ov_w if c < slice_cols - 1 else 0))
                    y2 = min(h, (r + 1) * base_h + (ov_h if r < slice_rows - 1 else 0))

                    tile = raw_cv_img[y1:y2, x1:x2]
                    tile_h, tile_w = tile.shape[:2]
                    if tile_h <= 0 or tile_w <= 0:
                        continue

                    if model is not None:
                        tmp_tile_path = os.path.join(output_dir, f"_sahi_tile_r{r}_c{c}.png")
                        cv2.imwrite(tmp_tile_path, tile)
                        try:
                            tile_preds = model.predict(images=tmp_tile_path, threshold=conf_threshold, device=active_device)
                            t_boxes = getattr(tile_preds, "xyxy", [])
                            t_scores = getattr(tile_preds, "confidence", [])
                            t_classes = getattr(tile_preds, "class_id", [])

                            for tidx, tb in enumerate(t_boxes):
                                t_sc = float(t_scores[tidx]) if len(t_scores) > tidx else 0.0
                                t_cl = int(t_classes[tidx]) if len(t_classes) > tidx else 0
                                g_box = [tb[0] + x1, tb[1] + y1, tb[2] + x1, tb[3] + y1]
                                all_boxes.append(g_box)
                                all_scores.append(t_sc)
                                all_class_ids.append(t_cl)
                        finally:
                            if os.path.exists(tmp_tile_path):
                                try: os.remove(tmp_tile_path)
                                except Exception: pass

            # Non-Maximum Suppression across merged tiles
            if len(all_boxes) > 0:
                boxes_np = np.array(all_boxes)
                scores_np = np.array(all_scores)
                keep_indices = nms_boxes(boxes_np, scores_np, iou_threshold=0.45)
                all_boxes = [all_boxes[i] for i in keep_indices]
                all_scores = [all_scores[i] for i in keep_indices]
                all_class_ids = [all_class_ids[i] for i in keep_indices]

        print(f"[SAHI Inference] Total detections on {Path(img_p).name}: {len(all_boxes)}")
        out_path = os.path.join(output_dir, f"sahi_bbox_{Path(img_p).name}")
        render_detection_overlay(img_p, all_boxes, all_scores, all_class_ids, classes, out_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RF-DETR Object Detection with SAHI Sliced Inference")
    parser.add_argument("--weights", type=str, default="checkpoint_best_total.pth", help="Path to checkpoint weights")
    parser.add_argument("--source", type=str, required=True, help="Path to input image or directory")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold")
    parser.add_argument("--device", type=str, default="cuda", help="Target device")
    parser.add_argument("--slice_cols", type=int, default=2, help="Target slices columns")
    parser.add_argument("--slice_rows", type=int, default=2, help="Target slices rows")
    parser.add_argument("--overlap_type", type=str, default="pixel", choices=["pixel", "percentage"])
    parser.add_argument("--overlap_x", type=float, default=80.0, help="Overlap X")
    parser.add_argument("--overlap_y", type=float, default=80.0, help="Overlap Y")
    parser.add_argument("--no_sahi", action="store_true", help="Disable SAHI sliced inference and run standard full-frame prediction")
    parser.add_argument("--output_dir", type=str, default="inference_outputs", help="Output directory")

    args = parser.parse_args()

    run_sahi_bbox_inference(
        weights_path=args.weights,
        source_path=args.source,
        conf_threshold=args.conf,
        device=args.device,
        slice_cols=args.slice_cols,
        slice_rows=args.slice_rows,
        overlap_type=args.overlap_type,
        overlap_x=args.overlap_x,
        overlap_y=args.overlap_y,
        use_sahi=not args.no_sahi,
        output_dir=args.output_dir
    )

