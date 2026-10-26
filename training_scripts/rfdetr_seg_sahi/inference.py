#!/usr/bin/env python3
"""
RF-DETR Instance Segmentation Inference Pipeline with SAHI (Slicing Aided Hyper Inference)
Performs high-resolution sliced inference for small defect / object detection and segmentation.
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
    if "seg" in clean_arch.lower() and hasattr(rfdetr, "RFDETRSegPreview"):
        return getattr(rfdetr, "RFDETRSegPreview")
    return getattr(rfdetr, "RFDETRSegMedium", None)

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

def render_segmentation_overlay(img_path: str, boxes, scores, classes, masks, class_names, output_path: str):
    raw_img = Image.open(img_path).convert("RGBA")
    w, h = raw_img.size

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        font = ImageFont.load_default()

    colors = [
        (16, 185, 129, 90),
        (37, 99, 235, 90),
        (245, 158, 11, 90),
        (139, 92, 246, 90),
        (239, 68, 68, 90),
        (6, 182, 212, 90),
        (236, 72, 153, 90),
        (249, 115, 22, 90)
    ]

    for idx, box in enumerate(boxes):
        score = float(scores[idx]) if len(scores) > idx else 0.0
        cls_id = int(classes[idx]) if len(classes) > idx else 0
        cls_name = class_names[cls_id] if class_names and cls_id < len(class_names) else str(cls_id)
        
        col = colors[cls_id % len(colors)]
        outline_col = (col[0], col[1], col[2], 255)

        if masks is not None and len(masks) > idx and masks[idx] is not None:
            m = masks[idx]
            if isinstance(m, np.ndarray):
                m_np = (m.astype(np.uint8) * 255)
                m_resized = cv2.resize(m_np, (w, h), interpolation=cv2.INTER_NEAREST)
                contours, _ = cv2.findContours(m_resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for cnt in contours:
                    if len(cnt) >= 3:
                        pts = [tuple(pt[0]) for pt in cnt]
                        draw.polygon(pts, fill=col, outline=outline_col)

        bx1, by1, bx2, by2 = [int(v) for v in box]
        draw.rectangle([(bx1, by1), (bx2, by2)], outline=outline_col, width=2)

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
    print(f"[Overlay] Saved SAHI segmentation visualization to: {output_path}")

def predict_sliced_custom(
    model,
    raw_cv_img: np.ndarray,
    slice_cols: int = 2,
    slice_rows: int = 2,
    overlap_type: str = "pixel",
    overlap_x: float = 80.0,
    overlap_y: float = 80.0,
    conf_threshold: float = 0.35,
    active_device: str = "cuda"
):
    """
    Slices the input image into overlapping tiles, batches them into an image_list,
    runs a single forward prediction batch on the model, and remaps the predicted
    bounding boxes and segmentation masks back to the full image coordinates.
    """
    h, w = raw_cv_img.shape[:2]

    # 1. Define slices (dynamic grid + overlap)
    base_w = max(1, w // slice_cols)
    base_h = max(1, h // slice_rows)

    if overlap_type.lower() in ["percentage", "ratio", "percent"]:
        pct_x = overlap_x / 100.0 if overlap_x > 1.0 else overlap_x
        pct_y = overlap_y / 100.0 if overlap_y > 1.0 else overlap_y
        ov_w = int(round(base_w * pct_x))
        ov_h = int(round(base_h * pct_y))
    else:
        ov_w = int(round(overlap_x))
        ov_h = int(round(overlap_y))

    ov_w = max(0, min(ov_w, base_w - 4 if base_w > 4 else 0))
    ov_h = max(0, min(ov_h, base_h - 4 if base_h > 4 else 0))

    tile_w = min(w, base_w + (ov_w if slice_cols > 1 else 0))
    tile_h = min(h, base_h + (ov_h if slice_rows > 1 else 0))
    tile_w = max(16, tile_w)
    tile_h = max(16, tile_h)

    if slice_cols <= 1 or w <= tile_w:
        x_starts = [0] * max(1, slice_cols)
    else:
        step_x = (w - tile_w) / float(slice_cols - 1)
        x_starts = [max(0, min(int(round(c * step_x)), w - tile_w)) for c in range(slice_cols)]

    if slice_rows <= 1 or h <= tile_h:
        y_starts = [0] * max(1, slice_rows)
    else:
        step_y = (h - tile_h) / float(slice_rows - 1)
        y_starts = [max(0, min(int(round(r * step_y)), h - tile_h)) for r in range(slice_rows)]

    slice_coords = []
    for r in range(slice_rows):
        for c in range(slice_cols):
            x1 = x_starts[c]
            y1 = y_starts[r]
            x2 = min(w, x1 + tile_w)
            y2 = min(h, y1 + tile_h)
            slice_coords.append([x1, y1, x2, y2])

    # 2. Extract Slices into list
    image_list = []
    valid_coords = []
    for sc in slice_coords:
        x1, y1, x2, y2 = sc
        slice_img = raw_cv_img[y1:y2, x1:x2]
        if slice_img.shape[0] <= 0 or slice_img.shape[1] <= 0:
            continue
        slice_rgb = np.ascontiguousarray(cv2.cvtColor(slice_img, cv2.COLOR_BGR2RGB))
        image_list.append(slice_rgb)
        valid_coords.append(sc)

    if model is None or len(image_list) == 0:
        return [], [], [], []

    print(f"[SAHI Inference] Running batch prediction on {len(image_list)} sliced patches ({tile_w}x{tile_h})...")

    # 3. Batch Prediction
    # This sends all sliced images in the list to the GPU in one go
    try:
        batch_results = model.predict(image_list, threshold=conf_threshold, device=active_device)
    except TypeError:
        batch_results = model.predict(image_list, threshold=conf_threshold)

    if not isinstance(batch_results, (list, tuple)):
        batch_results = [batch_results]

    # 4. Remap Predictions to Full Canvas
    all_boxes = []
    all_scores = []
    all_class_ids = []
    all_masks = []

    for i, det in enumerate(batch_results):
        ox, oy = valid_coords[i][0], valid_coords[i][1]

        b = getattr(det, "xyxy", [])
        s = getattr(det, "confidence", [])
        cid = getattr(det, "class_id", [])
        m = getattr(det, "mask", None)

        for idx in range(len(b)):
            bx1, by1, bx2, by2 = b[idx]
            all_boxes.append([float(bx1 + ox), float(by1 + oy), float(bx2 + ox), float(by2 + oy)])
            all_scores.append(float(s[idx]))
            all_class_ids.append(int(cid[idx]))

            if m is not None and len(m) > idx and m[idx] is not None:
                slice_mask = m[idx]
                if hasattr(slice_mask, 'cpu'):
                    slice_mask = slice_mask.cpu().numpy()
                slice_mask = np.asarray(slice_mask)
                if slice_mask.dtype == bool:
                    slice_mask = slice_mask.astype(np.uint8)

                cur_sc = valid_coords[i]
                sw = cur_sc[2] - cur_sc[0]
                sh = cur_sc[3] - cur_sc[1]

                if slice_mask.shape[0] != sh or slice_mask.shape[1] != sw:
                    slice_mask = cv2.resize(slice_mask, (sw, sh), interpolation=cv2.INTER_NEAREST)

                full_mask = np.zeros((h, w), dtype=np.uint8)
                full_mask[oy : oy + slice_mask.shape[0], ox : ox + slice_mask.shape[1]] = (slice_mask > 0).astype(np.uint8)
                all_masks.append(full_mask)
            else:
                all_masks.append(None)

    # 5. Non-Maximum Suppression (NMS)
    # Important because overlaps will create double-detections on boundary regions
    if len(all_boxes) > 0:
        boxes_np = np.array(all_boxes)
        scores_np = np.array(all_scores)
        keep_indices = nms_boxes(boxes_np, scores_np, iou_threshold=0.45)
        all_boxes = [all_boxes[k] for k in keep_indices]
        all_scores = [all_scores[k] for k in keep_indices]
        all_class_ids = [all_class_ids[k] for k in keep_indices]
        if all_masks:
            all_masks = [all_masks[k] for k in keep_indices]

    return all_boxes, all_scores, all_class_ids, all_masks

def run_sahi_segmentation_inference(
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
    raw_arch = meta.get("model_architecture", "RFDETRSegMedium")
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
        all_masks = []

        if not use_sahi or (slice_cols <= 1 and slice_rows <= 1):
            # Direct inference (single full-frame image)
            if model is not None:
                rgb_img = np.ascontiguousarray(cv2.cvtColor(raw_cv_img, cv2.COLOR_BGR2RGB))
                try:
                    preds = model.predict(images=[rgb_img], threshold=conf_threshold, device=active_device)
                except TypeError:
                    preds = model.predict(images=[rgb_img], threshold=conf_threshold)

                if isinstance(preds, (list, tuple)) and len(preds) > 0:
                    preds = preds[0]

                all_boxes = [list(map(float, b)) for b in getattr(preds, "xyxy", [])]
                all_scores = [float(s) for s in getattr(preds, "confidence", [])]
                all_class_ids = [int(c) for c in getattr(preds, "class_id", [])]
                all_masks = []
                if hasattr(preds, "mask") and preds.mask is not None:
                    for m in preds.mask:
                        if hasattr(m, 'cpu'):
                            m = m.cpu().numpy()
                        all_masks.append(np.asarray(m, dtype=np.uint8))
        else:
            # SAHI Sliced Inference: extract slices into list, batch predict, remap to full canvas, and NMS
            all_boxes, all_scores, all_class_ids, all_masks = predict_sliced_custom(
                model=model,
                raw_cv_img=raw_cv_img,
                slice_cols=slice_cols,
                slice_rows=slice_rows,
                overlap_type=overlap_type,
                overlap_x=overlap_x,
                overlap_y=overlap_y,
                conf_threshold=conf_threshold,
                active_device=active_device
            )

        print(f"[SAHI Inference] Total detections on {Path(img_p).name}: {len(all_boxes)}")
        out_path = os.path.join(output_dir, f"sahi_overlay_{Path(img_p).name}")
        render_segmentation_overlay(img_p, all_boxes, all_scores, all_class_ids, all_masks, classes, out_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RF-DETR Instance Segmentation with SAHI Sliced Inference")
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

    run_sahi_segmentation_inference(
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
