#!/usr/bin/env python3
"""
Enhanced MobileNetV4 Image Classification Training Pipeline
Integrated with IRnow Hub Platform:
- Two-Stage Training: Stage 1 Classifier Head Warmup + Stage 2 Differential LR Fine-Tuning
- Geometry-Preserving LetterboxPad with Edge-Pixel margin blending
- Class Imbalance Handling via Smoothed Inverse Frequency Loss Weights + Label Smoothing
- Macro F1-Driven Best Checkpoint Selection & Early Stopping
- Training & Validation Learning Curves (results.png / metrics_curves.png)
- Validation Confusion Matrix Heatmap (confusion_matrix.png & confusion_matrix.json)
- Validation vs Prediction Visual Collage (val_comparison.png)
- Weights Export (best_mobilenetv4_weights.pt, checkpoint_best_total.pth, last.pth)
- Result Packaging (result_bundle.zip) & Next.js Public Mirroring
"""

import os
import sys
import json
import time
import shutil
import zipfile
import random
import argparse
from pathlib import Path
from datetime import datetime

import io
# Force UTF-8 encoding with error replacement for Windows terminal streams
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torchvision import datasets, transforms
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score

try:
    import timm
    HAS_TIMM = True
except ImportError:
    HAS_TIMM = False


AVAILABLE_MODELS = {
    "mobilenetv4_conv_small": "MobileNetV4 Conv Small",
    "mobilenetv4_conv_medium": "MobileNetV4 Conv Medium",
    "mobilenetv4_conv_large": "MobileNetV4 Conv Large",
    "mobilenetv4_hybrid_medium": "MobileNetV4 Hybrid Medium",
    "mobilenetv4_hybrid_large": "MobileNetV4 Hybrid Large",
}


def set_seed(seed: int = 42):
    """Ensures deterministic reproducibility across PyTorch, NumPy and Python random."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# =====================================================================
# 1. Geometry-Preserving Letterbox Padding Transform
# =====================================================================

class LetterboxPad:
    """
    1. Scales the image proportionally so its longest edge fits target_size (preserving geometry:
       scratches stay elongated, bubbles/voids stay round).
    2. Centers the scaled crop on a square canvas of (target_size, target_size).
    3. Replicates border pixels into the margins (padding_mode='edge') so the natural surface
       blends seamlessly, eliminating artificial black border contrast steps.
    """
    def __init__(self, target_size: int = 128, pad_mode: str = 'edge'):
        self.target_size = target_size
        self.pad_mode = pad_mode

    def __call__(self, img):
        if isinstance(img, Image.Image):
            w, h = img.size
        else:
            h, w = img.shape[-2:]

        scale = self.target_size / max(w, h)
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))

        if isinstance(img, Image.Image):
            resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
        else:
            resized = transforms.functional.resize(img, (new_h, new_w))

        pad_left = (self.target_size - new_w) // 2
        pad_top = (self.target_size - new_h) // 2
        pad_right = self.target_size - new_w - pad_left
        pad_bottom = self.target_size - new_h - pad_top

        return transforms.functional.pad(
            resized,
            (pad_left, pad_top, pad_right, pad_bottom),
            padding_mode=self.pad_mode
        )


class ApplyTransform(Dataset):
    """Applies specific torchvision transforms to a subset of samples from an ImageFolder."""
    def __init__(self, full_ds, indices, transform=None):
        self.full_ds = full_ds
        self.indices = indices
        self.transform = transform
        self.samples = [full_ds.samples[i] for i in indices]

    def __getitem__(self, idx):
        real_idx = self.indices[idx]
        x, y = self.full_ds[real_idx]
        if self.transform:
            x = self.transform(x)
        return x, y

    def __len__(self):
        return len(self.indices)


# =====================================================================
# 2. Dataset Scanning & Resolution
# =====================================================================

def resolve_dataset_dir(dataset_dir: str) -> str:
    """
    Ensures dataset_dir is resolved, auto-unzipped if needed,
    and returns the directory containing images or train/valid splits.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    storage_hub_dir = os.environ.get("STORAGE_HUB_PATH", os.path.abspath(os.path.join(repo_root, "..", "storage-hub")))

    if not dataset_dir:
        # Check storage-hub datasets directory for fallback
        datasets_root = os.path.join(storage_hub_dir, "uploads", "datasets")
        if os.path.exists(datasets_root):
            for entry in os.listdir(datasets_root):
                candidate = os.path.join(datasets_root, entry)
                if os.path.isdir(candidate):
                    return candidate
        return ""

    if not os.path.isabs(dataset_dir):
        if dataset_dir.startswith("/uploads/"):
            dataset_dir = os.path.join(storage_hub_dir, dataset_dir.lstrip("/\\"))
        else:
            dataset_dir = os.path.join(storage_hub_dir, "uploads", "datasets", dataset_dir.lstrip("/\\"))

    # Auto-extract zip archive if provided
    if os.path.isfile(dataset_dir) and (dataset_dir.endswith(".zip") or zipfile.is_zipfile(dataset_dir)):
        extracted = str(Path(dataset_dir).with_suffix("")) + "_extracted"
        if not os.path.exists(extracted) or not any(os.scandir(extracted)):
            os.makedirs(extracted, exist_ok=True)
            print(f"[Dataset] Extracting dataset archive: {dataset_dir} -> {extracted}")
            try:
                with zipfile.ZipFile(dataset_dir, "r") as z:
                    z.extractall(extracted)
            except Exception as e:
                print(f"[Warning] Failed to extract archive: {e}")
        dataset_dir = extracted

    # Check for single nested subdirectory
    if os.path.isdir(dataset_dir):
        # If dataset_dir has train/valid directly
        if os.path.exists(os.path.join(dataset_dir, "train")) or os.path.exists(os.path.join(dataset_dir, "valid")):
            return dataset_dir

        # Check if dataset_dir contains class subdirectories directly
        entries = [e for e in os.listdir(dataset_dir) if not e.startswith('.')]
        subdirs = [os.path.join(dataset_dir, e) for e in entries if os.path.isdir(os.path.join(dataset_dir, e))]

        # If there is exactly 1 nested directory, descend into it
        if len(subdirs) == 1 and len(entries) == 1:
            nested = subdirs[0]
            if os.path.exists(os.path.join(nested, "train")) or os.path.exists(os.path.join(nested, "valid")):
                return nested
            nested_subdirs = [e for e in os.listdir(nested) if os.path.isdir(os.path.join(nested, e)) and not e.startswith('.')]
            if len(nested_subdirs) >= 2:
                return nested

    return dataset_dir


def prepare_classification_data(dataset_dir: str, img_size: int = 128, batch_size: int = 16):
    """
    Scans dataset and sets up PyTorch DataLoaders with LetterboxPad transforms.
    Supports:
    1. Pre-split structure: dataset_dir/train/<classes> and dataset_dir/valid/<classes>
    2. Unified class structure: dataset_dir/<classes> with automated 80/20 stratified split
    """
    resolved_dir = resolve_dataset_dir(dataset_dir)
    if not resolved_dir or not os.path.exists(resolved_dir):
        raise FileNotFoundError(f"Image classification dataset directory not found: {dataset_dir}")

    # Build transforms
    train_transform = transforms.Compose([
        LetterboxPad(target_size=img_size, pad_mode='edge'),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.RandomRotation(20),
        transforms.ColorJitter(
            brightness=0.15,
            contrast=0.15,
            saturation=0.1,
            hue=0.03
        ),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    val_transform = transforms.Compose([
        LetterboxPad(target_size=img_size, pad_mode='edge'),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    # Check for pre-existing train/valid folders
    train_p = None
    val_p = None
    for t_name in ["train", "Train"]:
        cand = os.path.join(resolved_dir, t_name)
        if os.path.isdir(cand):
            subs = [d for d in os.listdir(cand) if os.path.isdir(os.path.join(cand, d)) and not d.startswith('.')]
            if len(subs) >= 2:
                train_p = cand
                break

    for v_name in ["valid", "val", "Valid", "Val", "test", "Test"]:
        cand = os.path.join(resolved_dir, v_name)
        if os.path.isdir(cand):
            subs = [d for d in os.listdir(cand) if os.path.isdir(os.path.join(cand, d)) and not d.startswith('.')]
            if len(subs) >= 2:
                val_p = cand
                break

    if train_p and val_p:
        print(f"[Dataset] Found pre-split dataset: train='{train_p}', val='{val_p}'")
        raw_train = datasets.ImageFolder(train_p)
        raw_val = datasets.ImageFolder(val_p)
        class_names = sorted(list(set(raw_train.classes).union(set(raw_val.classes))))
        class_to_idx = {cls: idx for idx, cls in enumerate(class_names)}

        # Remap targets if needed
        raw_train.class_to_idx = class_to_idx
        raw_train.classes = class_names
        raw_val.class_to_idx = class_to_idx
        raw_val.classes = class_names

        train_data = ApplyTransform(raw_train, list(range(len(raw_train))), transform=train_transform)
        val_data = ApplyTransform(raw_val, list(range(len(raw_val))), transform=val_transform)
        train_targets = np.array([s[1] for s in raw_train.samples])
    else:
        # Flat class structure: dataset_dir/<class_1>, dataset_dir/<class_2>, ...
        print(f"[Dataset] Scanning flat class structure at '{resolved_dir}' with 80/20 stratified split...")
        full_dataset = datasets.ImageFolder(resolved_dir)
        class_names = full_dataset.classes
        all_targets = np.array(full_dataset.targets)
        all_indices = np.arange(len(full_dataset))

        if len(class_names) < 2:
            raise ValueError(f"Image classification requires at least 2 distinct classes. Found {len(class_names)}: {class_names}")

        train_idx, val_idx = train_test_split(
            all_indices,
            test_size=0.2,
            stratify=all_targets,
            random_state=42
        )

        train_data = ApplyTransform(full_dataset, train_idx, transform=train_transform)
        val_data = ApplyTransform(full_dataset, val_idx, transform=val_transform)
        train_targets = all_targets[train_idx]

    pin_mem = torch.cuda.is_available()
    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True, pin_memory=pin_mem, num_workers=0)
    val_loader = DataLoader(val_data, batch_size=batch_size, shuffle=False, pin_memory=pin_mem, num_workers=0)

    return resolved_dir, class_names, train_data, val_data, train_loader, val_loader, train_targets


# =====================================================================
# 3. Evaluation Function
# =====================================================================

def evaluate_model(model, val_loader, criterion, device):
    """Evaluates the model over the validation set, collecting probabilities and predictions."""
    model.eval()
    y_true = []
    y_pred = []
    y_probs = []
    running_loss = 0.0
    total_samples = 0

    with torch.no_grad():
        for inputs, labels in val_loader:
            inputs = inputs.to(device)
            labels = labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            probs = torch.softmax(outputs, dim=1)
            _, preds = torch.max(outputs, 1)

            running_loss += loss.item() * inputs.size(0)
            total_samples += inputs.size(0)

            y_true.extend(labels.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())
            y_probs.extend(probs.cpu().numpy())

    val_loss = running_loss / max(1, total_samples)
    acc = accuracy_score(y_true, y_pred) if len(y_true) > 0 else 0.0
    macro_f1 = f1_score(y_true, y_pred, average='macro', zero_division=0) if len(y_true) > 0 else 0.0

    return val_loss, acc, macro_f1, np.array(y_true), np.array(y_pred), np.array(y_probs)


# =====================================================================
# 4. Results Graph Plotting from metrics.csv
# =====================================================================

def plot_training_results_from_metrics(metrics_csv_path: str, output_image_path: str):
    """
    Generates a high-resolution 4-panel training and validation curve chart
    from metrics.csv, saved to results.png.
    """
    if not os.path.exists(metrics_csv_path) or os.path.getsize(metrics_csv_path) == 0:
        print(f"[Results Graph] metrics.csv not found at: {metrics_csv_path}")
        return False

    try:
        df = pd.read_csv(metrics_csv_path)
    except Exception as e:
        print(f"[Results Graph Warning] Could not parse metrics.csv: {e}")
        return False

    if df.empty or "epoch" not in df.columns:
        print("[Results Graph Warning] metrics.csv is empty or missing epoch column")
        return False

    epoch_df = df.groupby("epoch").last().reset_index()

    fig, axs = plt.subplots(2, 2, figsize=(15, 10), dpi=200)
    fig.patch.set_facecolor("#ffffff")

    c_blue = "#2563eb"
    c_red = "#ef4444"
    c_green = "#10b981"
    c_purple = "#8b5cf6"
    c_amber = "#f59e0b"

    # Panel 1 (0, 0): Loss Curves
    ax1 = axs[0, 0]
    ax1.set_facecolor("#f8fafc")
    if "train/loss" in epoch_df.columns:
        ax1.plot(epoch_df["epoch"], epoch_df["train/loss"], label="Train Loss", color=c_blue, linewidth=2, marker="o", markersize=3)
    if "val/loss" in epoch_df.columns:
        ax1.plot(epoch_df["epoch"], epoch_df["val/loss"], label="Val Loss", color=c_red, linewidth=2, linestyle="--", marker="s", markersize=3)
    ax1.set_title("Cross-Entropy Loss Curves", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax1.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax1.set_ylabel("Loss", fontsize=11, color="#475569")
    ax1.grid(True, linestyle=":", alpha=0.6)
    ax1.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    # Panel 2 (0, 1): Accuracy & Macro F1
    ax2 = axs[0, 1]
    ax2.set_facecolor("#f8fafc")
    if "val/accuracy" in epoch_df.columns:
        ax2.plot(epoch_df["epoch"], epoch_df["val/accuracy"], label="Val Accuracy", color=c_green, linewidth=2, marker="o", markersize=3)
    if "val/macro_f1" in epoch_df.columns:
        ax2.plot(epoch_df["epoch"], epoch_df["val/macro_f1"], label="Val Macro F1", color=c_purple, linewidth=2, linestyle="-.", marker="^", markersize=3)
    ax2.set_title("Validation Classification Accuracy & Macro F1", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax2.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax2.set_ylabel("Score", fontsize=11, color="#475569")
    ax2.set_ylim(-0.02, 1.05)
    ax2.grid(True, linestyle=":", alpha=0.6)
    ax2.legend(loc="lower right", frameon=True, facecolor="#ffffff")

    # Panel 3 (1, 0): Learning Rate Decay
    ax3 = axs[1, 0]
    ax3.set_facecolor("#f8fafc")
    if "lr_head" in epoch_df.columns:
        ax3.plot(epoch_df["epoch"], epoch_df["lr_head"], label="LR Head", color=c_blue, linewidth=1.8)
    if "lr_backbone" in epoch_df.columns:
        ax3.plot(epoch_df["epoch"], epoch_df["lr_backbone"], label="LR Backbone", color=c_amber, linewidth=1.8, linestyle="--")
    ax3.set_title("Differential Learning Rate Schedule", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax3.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax3.set_ylabel("Learning Rate", fontsize=11, color="#475569")
    ax3.set_yscale("log")
    ax3.grid(True, linestyle=":", alpha=0.6)
    ax3.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    # Panel 4 (1, 1): Error Rate
    ax4 = axs[1, 1]
    ax4.set_facecolor("#f8fafc")
    if "val/accuracy" in epoch_df.columns:
        error_rate = 1.0 - epoch_df["val/accuracy"]
        ax4.plot(epoch_df["epoch"], error_rate, label="Val Error Rate", color=c_red, linewidth=2, marker="d", markersize=3)
    ax4.set_title("Validation Error Rate", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax4.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax4.set_ylabel("Error Rate", fontsize=11, color="#475569")
    ax4.set_ylim(-0.02, 1.02)
    ax4.grid(True, linestyle=":", alpha=0.6)
    ax4.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    plt.tight_layout(pad=3.0)
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    plt.savefig(output_image_path, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    print(f"[Results Graph] Successfully generated training curves: {output_image_path}")
    return True


# =====================================================================
# 5. Confusion Matrix Heatmap Plotting & JSON
# =====================================================================

def plot_confusion_matrix(matrix: list, classes: list, output_path: str, class_gt_counts: dict = None):
    """Generates a clean, normalized confusion matrix heatmap matching multi-class evaluation metrics."""
    matrix_np = np.array(matrix)
    n = len(classes)

    fig, ax = plt.subplots(figsize=(max(6, n * 1.5), max(5, n * 1.3)), dpi=200)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    if class_gt_counts is not None and len(class_gt_counts) == n:
        denoms = np.array([max(1, class_gt_counts.get(classes[i], matrix_np[i].sum())) for i in range(n)], dtype=float).reshape(-1, 1)
    else:
        denoms = matrix_np.sum(axis=1, keepdims=True)
        denoms = np.where(denoms == 0, 1, denoms)

    norm_matrix = np.divide(
        matrix_np.astype("float"),
        denoms,
        out=np.zeros_like(matrix_np, dtype=float),
        where=(denoms != 0),
    )

    im = ax.imshow(norm_matrix, cmap="Blues", vmin=0, vmax=1.0)
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("Proportion", fontsize=10, color="#475569")
    cbar.ax.tick_params(labelsize=9)

    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(classes, rotation=45, ha="right", fontsize=10, fontweight="500", color="#0f172a")
    ax.set_yticklabels(classes, fontsize=10, fontweight="500", color="#0f172a")

    ax.set_xlabel("Predicted Label", fontsize=11, fontweight="bold", labelpad=10, color="#0f172a")
    ax.set_ylabel("True Label", fontsize=11, fontweight="bold", labelpad=10, color="#0f172a")
    ax.set_title("Validation Confusion Matrix", fontsize=13, fontweight="bold", pad=15, color="#0f172a")

    for i in range(n):
        for j in range(n):
            count = matrix_np[i, j]
            prop = norm_matrix[i, j]
            text_color = "white" if prop > 0.55 else "#0f172a"
            cell_text = f"{int(count)}\n({prop:.1%})" if denoms[i] > 0 else f"{int(count)}"
            ax.text(j, i, cell_text, ha="center", va="center", color=text_color, fontsize=9, fontweight="600")

    plt.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    plt.savefig(output_path, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    print(f"[Confusion Matrix] Heatmap plot saved to: {output_path}")


# =====================================================================
# 6. Validation vs Prediction Visual Collage (val_comparison.png)
# =====================================================================

def generate_classification_val_comparison(
    val_data,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_probs: np.ndarray,
    classes: list,
    output_path: str,
    model_architecture: str = "MobileNetV4",
    val_acc: float = 0.0,
    macro_f1: float = 0.0
):
    """
    Renders an informative 8-tile (4 columns x 2 rows) validation visual collage
    showing sample images with Ground Truth and Prediction tags (green if correct, red if error).
    Prioritizes showing failure cases alongside diverse correct classifications.
    """
    if len(y_true) == 0 or len(val_data) == 0:
        print("[Visual Comparison] Validation set is empty; skipping collage.")
        return

    total_samples = len(y_true)
    num_tiles = min(8, total_samples)

    # Identify errors vs matches
    mismatch_indices = [i for i in range(total_samples) if y_true[i] != y_pred[i]]
    match_indices = [i for i in range(total_samples) if y_true[i] == y_pred[i]]

    selected_indices = []
    # Up to 4 errors to highlight model boundaries
    num_errors_to_pick = min(len(mismatch_indices), num_tiles // 2)
    if num_errors_to_pick > 0:
        selected_indices.extend(random.sample(mismatch_indices, num_errors_to_pick))

    # Fill remainder with matches from diverse classes
    remaining = num_tiles - len(selected_indices)
    if remaining > 0:
        random.shuffle(match_indices)
        selected_indices.extend(match_indices[:remaining])

    while len(selected_indices) < num_tiles:
        selected_indices.append(len(selected_indices) % total_samples)

    cols = 4
    rows = max(1, (num_tiles + cols - 1) // cols)
    tile_w = 280
    tile_h = 240
    gap = 16
    header_h = 60
    border = 20

    canvas_w = border * 2 + cols * tile_w + (cols - 1) * gap
    canvas_h = border * 2 + header_h + rows * tile_h + (rows - 1) * gap

    canvas = Image.new("RGB", (canvas_w, canvas_h), color=(248, 250, 252))
    draw = ImageDraw.Draw(canvas)

    try:
        font_header = ImageFont.truetype("arialbd.ttf", 16)
        font_sub = ImageFont.truetype("arial.ttf", 12)
        font_badge = ImageFont.truetype("arialbd.ttf", 11)
    except Exception:
        font_header = ImageFont.load_default()
        font_sub = font_header
        font_badge = font_header

    # Header Card
    draw.rectangle([(border, border), (canvas_w - border, border + header_h - 10)], fill=(255, 255, 255), outline=(226, 232, 240), width=1)
    draw.text((border + 16, border + 10), "MobileNetV4 Classification — Validation Predictions vs Ground Truth", fill=(15, 23, 42), font=font_header)
    sub_text = f"Architecture: {model_architecture}  |  Val Accuracy: {val_acc * 100:.1f}%  |  Macro F1: {macro_f1 * 100:.1f}%  |  Samples Evaluated: {total_samples}"
    draw.text((border + 16, border + 32), sub_text, fill=(71, 85, 105), font=font_sub)

    for i, idx in enumerate(selected_indices):
        col = i % cols
        row = i // cols
        x = border + col * (tile_w + gap)
        y = border + header_h + row * (tile_h + gap)

        # Draw tile frame
        draw.rectangle([(x, y), (x + tile_w, y + tile_h)], fill=(255, 255, 255), outline=(226, 232, 240), width=1)

        gt_idx = int(y_true[idx])
        pred_idx = int(y_pred[idx])
        conf = float(y_probs[idx][pred_idx]) * 100.0 if len(y_probs) > idx else 95.0
        is_match = (gt_idx == pred_idx)

        gt_name = classes[gt_idx] if gt_idx < len(classes) else f"class_{gt_idx}"
        pred_name = classes[pred_idx] if pred_idx < len(classes) else f"class_{pred_idx}"

        # Load image thumb
        img_loaded = False
        if hasattr(val_data, "samples") and idx < len(val_data.samples):
            img_path = val_data.samples[idx][0]
            if os.path.exists(img_path):
                try:
                    with Image.open(img_path) as im:
                        im_rgb = im.convert("RGB")
                        # Proportional letterbox thumbnail
                        im_thumb = transforms.functional.resize(im_rgb, (tile_h - 70, tile_w - 12))
                        canvas.paste(im_thumb, (x + 6, y + 6))
                        img_loaded = True
                except Exception:
                    img_loaded = False

        if not img_loaded:
            # Fallback placeholder
            draw.rectangle([(x + 6, y + 6), (x + tile_w - 6, y + tile_h - 64)], fill=(241, 245, 249))
            draw.text((x + 20, y + 50), f"Sample #{idx + 1}", fill=(148, 163, 184), font=font_sub)

        # Ground Truth Pill (Slate 900)
        gt_pill = f"GT: {gt_name}"
        draw.rectangle([(x + 8, y + tile_h - 56), (x + tile_w - 8, y + tile_h - 32)], fill=(15, 23, 42))
        draw.text((x + 16, y + tile_h - 52), gt_pill, fill=(255, 255, 255), font=font_badge)

        # Prediction Pill (Emerald if match, Crimson if mismatch)
        pred_pill = f"PRED: {pred_name} ({conf:.1f}%)"
        pill_color = (16, 185, 129) if is_match else (239, 68, 68)
        draw.rectangle([(x + 8, y + tile_h - 28), (x + tile_w - 8, y + tile_h - 6)], fill=pill_color)
        draw.text((x + 16, y + tile_h - 24), pred_pill, fill=(255, 255, 255), font=font_badge)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    canvas.save(output_path, "PNG", quality=95)
    print(f"[Visual Comparison] Collage saved to: {output_path}")


# =====================================================================
# 7. Mirror Artifacts to Public Runs
# =====================================================================

def mirror_artifacts_to_public_runs(output_dir: str, job_id: str, run_name: str):
    """
    Mirrors training outputs to public/uploads/runs/<job_id>
    so that Next.js client-side UI can load them directly.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    target_id = job_id or run_name
    public_run_dir = os.path.join(repo_root, "public", "uploads", "runs", target_id)
    os.makedirs(public_run_dir, exist_ok=True)

    files_to_mirror = [
        "results.png",
        "metrics_curves.png",
        "metrics.csv",
        "confusion_matrix.png",
        "confusion_matrix.json",
        "val_comparison.png",
        "training_metadata.json",
        "hparams.yaml",
        "inference.py",
        "result_bundle.zip"
    ]
    for fn in files_to_mirror:
        src = os.path.join(output_dir, fn)
        dst = os.path.join(public_run_dir, fn)
        if os.path.exists(src):
            try:
                shutil.copy2(src, dst)
            except Exception as e:
                print(f"[Mirror Warning] Could not mirror {fn}: {e}")

    # Mirror weights directory
    src_weights = os.path.join(output_dir, "weights")
    dst_weights = os.path.join(public_run_dir, "weights")
    if os.path.exists(src_weights):
        os.makedirs(dst_weights, exist_ok=True)
        for wf in os.listdir(src_weights):
            try:
                shutil.copy2(os.path.join(src_weights, wf), os.path.join(dst_weights, wf))
            except Exception:
                pass


# =====================================================================
# 8. Main Training Execution
# =====================================================================

def train_image_classification(
    dataset_dir: str,
    output_dir: str,
    experiment_name: str,
    run_name: str,
    model_architecture: str = "mobilenetv4_conv_small",
    epochs: int = 100,
    batch_size: int = 16,
    lr: float = 0.0005,
    optimizer_name: str = "AdamW",
    weight_decay: float = 0.0001,
    img_size: int = 128,
    pretrained: bool = True,
    label_smoothing: float = 0.1,
    drop_rate: float = 0.2,
    early_stopping: bool = True,
    patience: int = 15,
    warmup_epochs: int = 5,
    device: str = "cuda",
    job_id: str = "",
    submitted_by: str = "Staff ML Engineer"
):
    set_seed(42)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    storage_hub_dir = os.environ.get("STORAGE_HUB_PATH", os.path.abspath(os.path.join(repo_root, "..", "storage-hub")))

    if not output_dir:
        output_dir = os.path.join(storage_hub_dir, "uploads", "runs", job_id or run_name)
    os.makedirs(output_dir, exist_ok=True)
    weights_dir = os.path.join(output_dir, "weights")
    os.makedirs(weights_dir, exist_ok=True)

    # 1. Device Setup
    active_device = torch.device("cuda" if (torch.cuda.is_available() and "cuda" in device.lower()) else "cpu")
    host_name = os.environ.get("COMPUTERNAME", "Host Workstation")
    gpu_name = "CPU"
    if active_device.type == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        device_str = f"CUDA (GPU: {gpu_name}, {gpu_mem:.1f} GB Dedicated VRAM)"
    else:
        device_str = f"Host CPU ({os.environ.get('PROCESSOR_IDENTIFIER', 'Host Processor')})"

    print("=================================================================")
    print("  MobileNetV4 Two-Stage Enhanced Classification Pipeline")
    print(f"  Architecture:     {model_architecture}")
    print(f"  Experiment:       {experiment_name}")
    print(f"  Run Name:         {run_name}")
    print(f"  Target Device:    {device_str}")
    print(f"  Resolution:       {img_size}x{img_size} (LetterboxPad edge mode)")
    print(f"  Total Epochs:     {epochs} (Warmup: {warmup_epochs}, Fine-tune: {epochs - warmup_epochs})")
    print(f"  Batch Size:       {batch_size}")
    print(f"  Learning Rate:    {lr} (Optimizer: {optimizer_name}, Decay: {weight_decay})")
    print(f"  Label Smoothing:  {label_smoothing} | Drop Rate: {drop_rate}")
    print(f"  Early Stopping:   {patience} epochs patience ({'enabled' if early_stopping else 'disabled'}, validation loss-guided)")
    print("=================================================================", flush=True)

    # 2. Data Preparation
    resolved_dataset, class_names, train_data, val_data, train_loader, val_loader, train_targets = prepare_classification_data(
        dataset_dir=dataset_dir,
        img_size=img_size,
        batch_size=batch_size
    )
    num_classes = len(class_names)
    print(f"[Dataset] Classes ({num_classes}): {class_names}")
    print(f"[Dataset] Train instances: {len(train_data)} | Val instances: {len(val_data)}")

    # 3. Class Imbalance Handling: Smoothed Inverse Frequency Weights
    class_counts = np.bincount(train_targets, minlength=num_classes)
    safe_counts = np.maximum(class_counts, 1).astype(float)
    raw_weights = len(train_targets) / (num_classes * safe_counts)
    smoothed_weights = np.sqrt(raw_weights)
    smoothed_weights = smoothed_weights / smoothed_weights.mean()
    class_weights_tensor = torch.FloatTensor(smoothed_weights).to(active_device)
    print(f"[Imbalance] Class counts: {dict(zip(class_names, class_counts))}")
    print(f"[Imbalance] Smoothed weights: {dict(zip(class_names, np.round(smoothed_weights, 3)))}")

    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor, label_smoothing=label_smoothing)

    # 4. Model Instantiation via timm
    if not HAS_TIMM:
        raise ImportError("timm package is required for MobileNetV4. Please install timm in active Python environment.")

    print(f"[Model] Initializing {model_architecture} via timm (pretrained={pretrained}, num_classes={num_classes})...")
    try:
        model = timm.create_model(model_architecture, pretrained=pretrained, num_classes=num_classes, drop_rate=drop_rate)
    except Exception as me:
        print(f"[Warning] Failed to initialize {model_architecture} with pretrained={pretrained}: {me}. Attempting random weights...")
        try:
            model = timm.create_model(model_architecture, pretrained=False, num_classes=num_classes, drop_rate=drop_rate)
        except Exception as me2:
            print(f"[Warning] Failed: {me2}. Falling back to mobilenetv4_conv_small...")
            model = timm.create_model("mobilenetv4_conv_small", pretrained=False, num_classes=num_classes, drop_rate=drop_rate)

    model = model.to(active_device)

    # Output file paths
    metrics_csv_path = os.path.join(output_dir, "metrics.csv")
    checkpoint_best_path = os.path.join(output_dir, "checkpoint_best_total.pth")
    weights_best_pt = os.path.join(weights_dir, "best_mobilenetv4_weights.pt")

    # Metrics CSV Header
    with open(metrics_csv_path, "w", encoding="utf-8") as f:
        f.write("epoch,train/loss,val/loss,val/accuracy,val/macro_f1,lr_backbone,lr_head\n")

    best_macro_f1 = -1.0
    best_acc = 0.0
    best_loss = 999.0
    epochs_no_improve = 0
    actual_warmup_epochs = min(warmup_epochs, max(1, epochs // 4)) if epochs > 2 else 0

    train_start_time = time.time()

    # =================================================================
    # STAGE 1: Head Warmup (Backbone Frozen)
    # =================================================================
    if actual_warmup_epochs > 0:
        print("\n" + "=" * 55)
        print(f"STAGE 1: Head Warmup ({actual_warmup_epochs} epochs, Backbone Frozen)")
        print("=" * 55, flush=True)

        for name, param in model.named_parameters():
            if "head" in name or "classifier" in name:
                param.requires_grad = True
            else:
                param.requires_grad = False

        warmup_params = [p for p in model.parameters() if p.requires_grad]
        opt_name = optimizer_name.lower()
        if opt_name == 'sgd':
            warmup_optimizer = optim.SGD(warmup_params, lr=lr, momentum=0.9, weight_decay=weight_decay)
        elif opt_name == 'adam':
            warmup_optimizer = optim.Adam(warmup_params, lr=lr, weight_decay=weight_decay)
        elif opt_name == 'rmsprop':
            warmup_optimizer = optim.RMSprop(warmup_params, lr=lr, weight_decay=weight_decay)
        else:
            warmup_optimizer = optim.AdamW(warmup_params, lr=lr, weight_decay=weight_decay)

        for epoch in range(1, actual_warmup_epochs + 1):
            model.train()
            running_loss = 0.0
            for inputs, labels in train_loader:
                inputs, labels = inputs.to(active_device), labels.to(active_device)
                warmup_optimizer.zero_grad()
                outputs = model(inputs)
                loss = criterion(outputs, labels)
                loss.backward()
                warmup_optimizer.step()
                running_loss += loss.item() * inputs.size(0)

            train_loss = running_loss / max(1, len(train_data))
            val_loss, acc, macro_f1, _, _, _ = evaluate_model(model, val_loader, criterion, active_device)

            is_best = val_loss < best_loss
            if is_best:
                best_loss = val_loss
                best_macro_f1 = macro_f1
                best_acc = acc
                torch.save(model.state_dict(), weights_best_pt)
                torch.save({
                    "epoch": epoch,
                    "model_architecture": model_architecture,
                    "state_dict": model.state_dict(),
                    "best_macro_f1": best_macro_f1,
                    "best_accuracy": best_acc,
                    "classes": class_names,
                    "num_classes": num_classes,
                    "img_size": img_size
                }, checkpoint_best_path)
                saved_mark = " [*Best Model Saved]"
            else:
                saved_mark = ""

            cur_head_lr = warmup_optimizer.param_groups[0]['lr']
            # Log to CSV
            with open(metrics_csv_path, "a", encoding="utf-8") as f:
                f.write(f"{epoch},{train_loss:.4f},{val_loss:.4f},{acc:.4f},{macro_f1:.4f},0.0,{cur_head_lr:.6f}\n")

            print(f"Epoch {epoch}/{epochs} - [Warmup {epoch}/{actual_warmup_epochs}] Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Acc: {acc:.4f} | Macro F1: {macro_f1:.4f}{saved_mark}", flush=True)

    # =================================================================
    # STAGE 2: Full Fine-Tuning with Differential Learning Rates
    # =================================================================
    stage2_epochs = epochs - actual_warmup_epochs
    print("\n" + "=" * 55)
    print(f"STAGE 2: Full Fine-Tuning (Differential LR, Cosine Decay, {stage2_epochs} epochs)")
    print("=" * 55, flush=True)

    for param in model.parameters():
        param.requires_grad = True

    backbone_params = []
    head_params = []
    for name, param in model.named_parameters():
        if "head" in name or "classifier" in name:
            head_params.append(param)
        else:
            backbone_params.append(param)

    lr_backbone = max(1e-6, lr * 0.1)
    lr_head = lr

    opt_name = optimizer_name.lower()
    param_groups = [
        {'params': backbone_params, 'lr': lr_backbone},
        {'params': head_params, 'lr': lr_head}
    ]
    if opt_name == 'sgd':
        stage2_optimizer = optim.SGD(param_groups, momentum=0.9, weight_decay=weight_decay)
    elif opt_name == 'adam':
        stage2_optimizer = optim.Adam(param_groups, weight_decay=weight_decay)
    elif opt_name == 'rmsprop':
        stage2_optimizer = optim.RMSprop(param_groups, weight_decay=weight_decay)
    else:
        stage2_optimizer = optim.AdamW(param_groups, weight_decay=weight_decay)

    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        stage2_optimizer,
        T_max=max(1, stage2_epochs),
        eta_min=1e-6
    )

    stopped_early = False
    epochs_completed = actual_warmup_epochs

    for epoch in range(actual_warmup_epochs + 1, epochs + 1):
        model.train()
        running_loss = 0.0
        for inputs, labels in train_loader:
            inputs, labels = inputs.to(active_device), labels.to(active_device)
            stage2_optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            stage2_optimizer.step()
            running_loss += loss.item() * inputs.size(0)

        scheduler.step()
        train_loss = running_loss / max(1, len(train_data))
        val_loss, acc, macro_f1, _, _, _ = evaluate_model(model, val_loader, criterion, active_device)

        cur_bb_lr = stage2_optimizer.param_groups[0]['lr']
        cur_head_lr = stage2_optimizer.param_groups[1]['lr']

        is_best = val_loss < best_loss
        if is_best:
            best_loss = val_loss
            best_macro_f1 = macro_f1
            best_acc = acc
            epochs_no_improve = 0
            torch.save(model.state_dict(), weights_best_pt)
            torch.save({
                "epoch": epoch,
                "model_architecture": model_architecture,
                "state_dict": model.state_dict(),
                "best_macro_f1": best_macro_f1,
                "best_accuracy": best_acc,
                "best_loss": best_loss,
                "classes": class_names,
                "num_classes": num_classes,
                "img_size": img_size
            }, checkpoint_best_path)
            saved_mark = " [*Best Model Saved]"
        else:
            epochs_no_improve += 1
            saved_mark = ""

        # Log to CSV
        with open(metrics_csv_path, "a", encoding="utf-8") as f:
            f.write(f"{epoch},{train_loss:.4f},{val_loss:.4f},{acc:.4f},{macro_f1:.4f},{cur_bb_lr:.6f},{cur_head_lr:.6f}\n")

        print(f"Epoch {epoch}/{epochs} | Train: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Acc: {acc:.4f} | Macro F1: {macro_f1:.4f} | LR: {cur_bb_lr:.1e}/{cur_head_lr:.1e}{saved_mark}", flush=True)

        epochs_completed = epoch

        if early_stopping and epochs_no_improve >= patience:
            print(f"\n[Early Stopping] No improvement in validation loss for {patience} consecutive epochs. Stopping early at Epoch {epoch}.", flush=True)
            stopped_early = True
            break

    # Save last weights
    torch.save(model.state_dict(), os.path.join(output_dir, "last.pth"))
    train_elapsed = time.time() - train_start_time

    # =================================================================
    # 5. Final Evaluation with Best Model Restored
    # =================================================================
    print("\n" + "=" * 55)
    print("FINAL EVALUATION METRICS (Best Weights Restored)")
    print("=" * 55, flush=True)

    if os.path.exists(weights_best_pt):
        try:
            model.load_state_dict(torch.load(weights_best_pt, map_location=active_device, weights_only=True))
        except Exception:
            model.load_state_dict(torch.load(weights_best_pt, map_location=active_device))

    val_loss, final_acc, final_macro_f1, y_true, y_pred, y_probs = evaluate_model(
        model, val_loader, criterion, active_device
    )

    print(f"Best Validation Accuracy: {final_acc:.4f}")
    print(f"Best Validation Macro F1: {final_macro_f1:.4f}")
    print("\nClassification Report:")
    report_dict = classification_report(y_true, y_pred, target_names=class_names, digits=4, zero_division=0, output_dict=True)
    print(classification_report(y_true, y_pred, target_names=class_names, digits=4, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=range(num_classes))
    print("Confusion Matrix:")
    print(cm)

    # =================================================================
    # 6. Artifact Generation: Curves, Heatmap, Collage, Metadata
    # =================================================================
    # 6.1 Results Graph
    results_png = os.path.join(output_dir, "results.png")
    plot_training_results_from_metrics(metrics_csv_path, results_png)
    curves_png = os.path.join(output_dir, "metrics_curves.png")
    if os.path.exists(results_png):
        shutil.copy2(results_png, curves_png)

    # 6.2 Confusion Matrix Heatmap & JSON
    cm_png = os.path.join(output_dir, "confusion_matrix.png")
    cm_json = os.path.join(output_dir, "confusion_matrix.json")
    plot_confusion_matrix(
        matrix=cm.tolist(),
        classes=class_names,
        output_path=cm_png,
        class_gt_counts={class_names[i]: int(np.sum(cm[i])) for i in range(num_classes)}
    )

    # Calculate per-class metrics
    per_class_list = []
    class_precision = {}
    class_recall = {}
    class_f1 = {}
    for i, c in enumerate(class_names):
        p = float(report_dict.get(c, {}).get("precision", 0.0))
        r = float(report_dict.get(c, {}).get("recall", 0.0))
        f = float(report_dict.get(c, {}).get("f1-score", 0.0))
        supp = int(report_dict.get(c, {}).get("support", 0))
        class_precision[c] = p
        class_recall[c] = r
        class_f1[c] = f
        per_class_list.append({
            "class": c,
            "precision": p,
            "recall": r,
            "f1": f,
            "support": supp
        })

    confusion_dict = {
        "classes": class_names,
        "matrix": cm.tolist(),
        "accuracy": float(final_acc),
        "macro_f1": float(final_macro_f1),
        "total_samples": int(len(y_true)),
        "class_gt_counts": {class_names[i]: int(np.sum(cm[i])) for i in range(num_classes)},
        "precision": class_precision,
        "recall": class_recall,
        "f1_score": class_f1,
        "per_class": per_class_list
    }
    with open(cm_json, "w", encoding="utf-8") as f:
        json.dump(confusion_dict, f, indent=2)

    # 6.3 Validation vs Prediction Visual Collage
    val_comp_png = os.path.join(output_dir, "val_comparison.png")
    generate_classification_val_comparison(
        val_data=val_data,
        y_true=y_true,
        y_pred=y_pred,
        y_probs=y_probs,
        classes=class_names,
        output_path=val_comp_png,
        model_architecture=model_architecture,
        val_acc=final_acc,
        macro_f1=final_macro_f1
    )

    # 6.4 hparams.yaml
    hparams_yaml = f"""# MobileNetV4 Enhanced Image Classification Hyperparameters
model_name: MobileNetV4
architecture: {model_architecture}
library: timm
task: image_classification
num_classes: {num_classes}
classes: {json.dumps(class_names)}
epochs: {epochs}
warmup_epochs: {actual_warmup_epochs}
batch_size: {batch_size}
learning_rate: {lr}
optimizer: {optimizer_name}
weight_decay: {weight_decay}
img_size: {img_size}
pad_mode: edge
pretrained: {pretrained}
label_smoothing: {label_smoothing}
drop_rate: {drop_rate}
patience: {patience}
device: {str(active_device)}
dataset_dir: "{resolved_dataset}"
experiment_name: "{experiment_name}"
run_name: "{run_name}"
submitted_by: "{submitted_by}"
created_at: "{datetime.utcnow().isoformat()}"
"""
    with open(os.path.join(output_dir, "hparams.yaml"), "w", encoding="utf-8") as f:
        f.write(hparams_yaml)

    # 6.5 training_metadata.json
    macro_prec = float(report_dict.get("macro avg", {}).get("precision", final_acc))
    macro_rec = float(report_dict.get("macro avg", {}).get("recall", final_acc))
    training_meta = {
        "job_id": job_id,
        "experiment_name": experiment_name,
        "run_name": run_name,
        "model_architecture": model_architecture,
        "framework": "timm MobileNetV4",
        "task_type": "Image Classification",
        "num_classes": num_classes,
        "classes": class_names,
        "metrics": {
            "map50": final_acc,
            "accuracy": final_acc,
            "macro_f1": final_macro_f1,
            "precision": macro_prec,
            "recall": macro_rec,
            "val_loss": val_loss
        },
        "confusion_matrix": confusion_dict,
        "hyperparameters": {
            "model_architecture": model_architecture,
            "epochs": epochs,
            "warmup_epochs": actual_warmup_epochs,
            "batch_size": batch_size,
            "lr": lr,
            "optimizer": optimizer_name,
            "weight_decay": weight_decay,
            "img_size": img_size,
            "label_smoothing": label_smoothing,
            "drop_rate": drop_rate,
            "device": str(active_device)
        },
        "completed_at": datetime.now().isoformat(),
        "training_time_sec": round(train_elapsed, 2),
        "epochs_completed": epochs_completed,
        "early_stopped": stopped_early,
    }
    with open(os.path.join(output_dir, "training_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(training_meta, f, indent=2)

    # 6.55 Include inference.py from template directory into result bundle if present
    script_dir = os.path.dirname(os.path.abspath(__file__))
    inf_template_path = os.path.join(script_dir, "inference.py")
    if os.path.exists(inf_template_path):
        try:
            shutil.copy2(inf_template_path, os.path.join(output_dir, "inference.py"))
            print(f"[Inference Script] Included inference.py in result bundle: {output_dir}")
        except Exception as e:
            print(f"[Warning] Failed to copy inference.py: {e}")

    # 6.6 Result Bundle Packaging
    bundle_path = os.path.join(output_dir, "result_bundle.zip")
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(output_dir):
            for file in files:
                if file == "result_bundle.zip":
                    continue
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, output_dir)
                z.write(full_p, rel_p)
    print(f"[Packaging] Packaged complete result bundle: {bundle_path}")

    # 6.7 Mirror to Next.js public directory
    mirror_artifacts_to_public_runs(output_dir, job_id, run_name)

    print("=================================================================")
    print("  MobileNetV4 Classification Pipeline Completed Successfully!")
    print(f"  All checkpoints, results graphs, and evaluations saved to: {output_dir}")
    print("=================================================================", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MobileNetV4 Two-Stage Enhanced Classification Training")
    parser.add_argument("--dataset_dir", type=str, default="", help="Path to classification dataset directory or zip archive")
    parser.add_argument("--output_dir", type=str, default="", help="Directory to save weights, graphs, and results")
    parser.add_argument("--experiment_name", type=str, default="Defect Classification", help="Experiment name")
    parser.add_argument("--run_name", type=str, default="MobileNetV4_Training", help="Run name")
    parser.add_argument("--model_architecture", type=str, default="mobilenetv4_conv_small", help="MobileNetV4 architecture variant")
    parser.add_argument("--epochs", type=int, default=100, help="Total epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=0.0005, help="Learning rate")
    parser.add_argument("--optimizer", type=str, default="AdamW", help="Optimizer (AdamW, SGD, Adam, RMSprop)")
    parser.add_argument("--weight_decay", type=float, default=0.0001, help="Weight decay")
    parser.add_argument("--img_size", type=int, default=128, help="Target input image size")
    parser.add_argument("--pretrained", type=lambda x: (str(x).lower() in ['true', '1', 'yes']), default=True, help="Load pretrained backbone weights")
    parser.add_argument("--label_smoothing", type=float, default=0.1, help="Label smoothing epsilon")
    parser.add_argument("--drop_rate", type=float, default=0.2, help="Dropout rate on classifier head")
    parser.add_argument("--early_stopping", type=lambda x: (str(x).lower() in ['true', '1', 'yes']), default=True, help="Enable early stopping based on validation loss")
    parser.add_argument("--early_stopping_patience", type=int, default=0, help="Early stopping patience in epochs")
    parser.add_argument("--patience", type=int, default=15, help="Early stopping patience in epochs")
    parser.add_argument("--warmup_epochs", type=int, default=5, help="Head warmup epochs with frozen backbone")
    parser.add_argument("--device", type=str, default="cuda", help="Target device (cuda or cpu)")
    parser.add_argument("--job_id", type=str, default="", help="Job tracking ID")
    parser.add_argument("--submitted_by", type=str, default="Staff ML Engineer", help="Submitter name")

    args = parser.parse_args()

    effective_patience = args.early_stopping_patience if args.early_stopping_patience > 0 else args.patience

    train_image_classification(
        dataset_dir=args.dataset_dir,
        output_dir=args.output_dir,
        experiment_name=args.experiment_name,
        run_name=args.run_name,
        model_architecture=args.model_architecture,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        optimizer_name=args.optimizer,
        weight_decay=args.weight_decay,
        img_size=args.img_size,
        pretrained=args.pretrained,
        label_smoothing=args.label_smoothing,
        drop_rate=args.drop_rate,
        early_stopping=args.early_stopping,
        patience=effective_patience,
        warmup_epochs=args.warmup_epochs,
        device=args.device,
        job_id=args.job_id,
        submitted_by=args.submitted_by
    )
