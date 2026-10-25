#!/usr/path/bin/env python3

import os
import json
import argparse
from pathlib import Path
import torch
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

try:
    import rfdetr
except ImportError:
    raise ImportError("rfdetr package is not installed.")

def load_metadata_config():
    meta_paths = [
        "training_metadata.json",
        os.path.join("weights", "..", "training_metadata.json")
    ]
    for mp in meta_paths:
        if os.path.exists(mp):
            try:
                with open(mp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    print(f"[Metadata] Loaded configuration from {mp}[cite: 7]")
                    return data
            except Exception:
                pass
    return {}

def resolve_model_class(arch_name: str):
    if hasattr(rfdetr, arch_name):
        return getattr(rfdetr, arch_name)
    for attr in dir(rfdetr):
        if attr.lower() == arch_name.lower():
            return getattr(rfdetr, attr)
    if "seg" in arch_name.lower() and hasattr(rfdetr, "RFDETRSegPreview"):
        return getattr(rfdetr, "RFDETRSegPreview")
    return getattr(rfdetr, "RFDETRSegMedium", None)

def resolve_default_weights(weights_path: str) -> str:
    if os.path.exists(weights_path):
        return os.path.abspath(weights_path)
    
    alternatives = [
        "checkpoint_best_total.pth",
        os.path.join("weights", "checkpoint_best_total.pth"),
        "best_rfdetr_weights.pt",
        os.path.join("weights", "best_rfdetr_weights.pt")
    ]
    for alt in alternatives:
        if os.path.exists(alt):
            print(f"[Auto-Detect] Using discovered checkpoint: {alt}")
            return os.path.abspath(alt)
            
    return os.path.abspath(weights_path)

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
            m_np = (m.astype(np.uint8) * 255)
            m_resized = cv2.resize(m_np, (w, h), interpolation=cv2.INTER_NEAREST)
            contours, _ = cv2.findContours(m_resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                if len(cnt) >= 3:
                    pts = [tuple(pt[0]) for pt in cnt]
                    draw.polygon(pts, fill=col, outline=outline_col)

        bx1, by1, bx2, by2 = [int(v) for v in box]
        draw.rectangle([(bx1, by1), (bx2, by2)], outline=outline_col, width=2)

        tag = f"{cls_name} {score:.2f}"
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
    print(f"[Overlay] Saved visualization to: {output_path}")

def run_segmentation_inference(weights_path: str, source_path: str, conf_threshold: float = 0.35, device: str = "cuda"):
    weights_path = resolve_default_weights(weights_path)
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights file not found at: {weights_path}")

    meta = load_metadata_config()
    model_arch = meta.get("model_architecture", "RFDETRSegMedium")
    classes = meta.get("classes", [])
    num_classes = meta.get("num_classes", len(classes) if classes else None)

    active_device = "cuda" if (torch.cuda.is_available() and device.startswith("cuda")) else "cpu"
    print(f"[Inference] Loading RF-DETR Segmentation model ({model_arch}) from {weights_path} on {active_device}...")

    model_cls = resolve_model_class(model_arch)
    if model_cls is None:
        raise ValueError(f"Could not resolve model architecture: {model_arch}")

    if num_classes is not None:
        model = model_cls(num_classes=num_classes, pretrain_weights=weights_path)
    else:
        model = model_cls(pretrain_weights=weights_path)

    image_paths = []
    if os.path.isdir(source_path):
        image_paths = [os.path.join(source_path, f) for f in os.listdir(source_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    else:
        image_paths = [source_path]

    out_dir = "inference_outputs"
    for img_p in image_paths:
        if not os.path.exists(img_p):
            print(f"[Warning] Image not found: {img_p}")
            continue

        print(f"[Inference] Processing {img_p}...")
        preds = model.predict(images=img_p, threshold=conf_threshold, device=active_device)

        boxes = getattr(preds, "xyxy", [])
        scores = getattr(preds, "confidence", [])
        pred_classes = getattr(preds, "class_id", [])
        masks = getattr(preds, "mask", None)

        print(f" -> Detected {len(boxes)} objects.")
        for idx, box in enumerate(boxes):
            score = float(scores[idx]) if len(scores) > idx else 0.0
            cls_id = int(pred_classes[idx]) if len(pred_classes) > idx else 0
            cls_name = classes[cls_id] if classes and cls_id < len(classes) else str(cls_id)
            print(f"    - Object {idx+1}: Class {cls_name} (ID {cls_id}), Confidence {score:.2f}, Box {box}")

        out_path = os.path.join(out_dir, f"overlay_{Path(img_p).name}")
        render_segmentation_overlay(img_p, boxes, scores, pred_classes, masks, classes, out_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RF-DETR Segmentation Inference")
    parser.add_argument("--weights", type=str, default="checkpoint_best_total.pth", help="Path to best checkpoint or weights")
    parser.add_argument("--source", type=str, required=True, help="Path to input image or image directory")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold")
    parser.add_argument("--device", type=str, default="cuda", help="Device (cuda or cpu)")
    args = parser.parse_args()

    run_segmentation_inference(args.weights, args.source, args.conf, args.device)