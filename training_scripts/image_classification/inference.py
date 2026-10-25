#!/usr/bin/env python3

import os
import json
import argparse
import torch
from torchvision import transforms
from PIL import Image

try:
    import timm
except ImportError:
    raise ImportError("timm package is required.")

class LetterboxPad:
    def __init__(self, target_size: int = 128):
        self.target_size = target_size

    def __call__(self, img):
        w, h = img.size
        scale = self.target_size / max(w, h)
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
        pad_left = (self.target_size - new_w) // 2
        pad_top = (self.target_size - new_h) // 2
        pad_right = self.target_size - new_w - pad_left
        pad_bottom = self.target_size - new_h - pad_top
        return transforms.functional.pad(resized, (pad_left, pad_top, pad_right, pad_bottom), padding_mode='edge')

def resolve_default_checkpoint(ckpt_path: str) -> str:
    if os.path.exists(ckpt_path):
        return ckpt_path
        
    alternatives = [
        "checkpoint_best_total.pth",
        os.path.join("weights", "checkpoint_best_total.pth")
    ]
    for alt in alternatives:
        if os.path.exists(alt):
            print(f"[Auto-Detect] Using discovered checkpoint: {alt}")
            return alt
            
    return ckpt_path

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

def run_classification_inference(checkpoint_path: str, source_path: str, device: str = "cuda"):
    checkpoint_path = resolve_default_checkpoint(checkpoint_path)
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint file not found at: {checkpoint_path}")

    meta = load_metadata_config()

    active_device = torch.device("cuda" if (torch.cuda.is_available() and "cuda" in device.lower()) else "cpu")
    print(f"[Inference] Loading MobileNetV4 checkpoint from {checkpoint_path}...")

    checkpoint = torch.load(checkpoint_path, map_location=active_device, weights_only=False)
    
    model_arch = meta.get("model_architecture") or checkpoint.get("model_architecture", "mobilenetv4_conv_small")
    classes = meta.get("classes") or checkpoint.get("classes", [])
    num_classes = meta.get("num_classes") or checkpoint.get("num_classes", len(classes))
    img_size = meta.get("hyperparameters", {}).get("img_size") or checkpoint.get("img_size", 128)

    print(f" -> Architecture: {model_arch} | Classes ({num_classes}): {classes}")

    model = timm.create_model(model_arch, pretrained=False, num_classes=num_classes)
    model.load_state_dict(checkpoint["state_dict"])
    model = model.to(active_device)
    model.eval()

    transform = transforms.Compose([
        LetterboxPad(target_size=img_size),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    image_paths = []
    if os.path.isdir(source_path):
        image_paths = [os.path.join(source_path, f) for f in os.listdir(source_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    else:
        image_paths = [source_path]

    with torch.no_grad():
        for img_p in image_paths:
            if not os.path.exists(img_p):
                continue
            img = Image.open(img_p).convert("RGB")
            tensor = transform(img).unsqueeze(0).to(active_device)

            outputs = model(tensor)
            probs = torch.softmax(outputs, dim=1)[0]
            conf, pred_idx = torch.max(probs, dim=0)

            pred_class = classes[pred_idx.item()] if pred_idx.item() < len(classes) else str(pred_idx.item())
            print(f"[Image: {os.path.basename(img_p)}] Prediction: {pred_class} ({conf.item()*100:.2f}%)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MobileNetV4 Classification Inference")
    parser.add_argument("--checkpoint", type=str, default="checkpoint_best_total.pth", help="Path to checkpoint_best_total.pth")
    parser.add_argument("--source", type=str, required=True, help="Path to input image or directory")
    parser.add_argument("--device", type=str, default="cuda", help="Device (cuda or cpu)")
    args = parser.parse_args()

    run_classification_inference(args.checkpoint, args.source, args.device)