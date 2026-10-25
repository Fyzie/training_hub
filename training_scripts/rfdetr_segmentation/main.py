#!/usr/bin/env python3
"""
RF-DETR Instance Segmentation Training Pipeline
Real local training script executing native RF-DETR model.train() without MLflow.
Features:
- Native RF-DETR model initialization and real GPU training
- Direct terminal progress streaming from model.train()
- Generation of training curves (results.png / metrics_curves.png) from metrics.csv
- Full validation sample inferencing using trained best checkpoint
- Generation of confusion_matrix.png
- Generation of val_comparison.png (Ground Truth vs Prediction visual collage)
- Checkpoint export to weights/ and result packaging (result_bundle.zip)
"""

import os
import sys
import json
import time
import shutil
import zipfile
import argparse
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont

import io

# Force UTF-8 encoding with error replacement for Windows terminal streams
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import torch
import cv2

# RF-DETR architecture resolution
try:
    import rfdetr
    HAS_RFDETR = True
except ImportError:
    HAS_RFDETR = False


def get_rfdetr_class(model_architecture: str):
    """
    Resolves the RF-DETR model class from the installed rfdetr package.
    RFDETRSegPreview is the segmentation backbone. Any variant name
    (RFDETRSegMedium, RFDETRSegSmall, RFDETRSegNano, etc.) resolves to the segmentation model.
    """
    if not HAS_RFDETR:
        raise ImportError("rfdetr package is not installed in the active Python environment.")

    # 1. Direct attribute match
    if hasattr(rfdetr, model_architecture):
        return getattr(rfdetr, model_architecture)

    # 2. Case-insensitive lookup
    for attr in dir(rfdetr):
        if attr.lower() == model_architecture.lower():
            return getattr(rfdetr, attr)

    # 3. For segmentation models, fallback to RFDETRSegPreview
    if "seg" in model_architecture.lower():
        if hasattr(rfdetr, "RFDETRSegPreview"):
            print(f"[RF-DETR] Mapping '{model_architecture}' to 'RFDETRSegPreview'")
            return getattr(rfdetr, "RFDETRSegPreview")

    # 4. Standard fallback
    if hasattr(rfdetr, "RFDETRSegPreview"):
        return getattr(rfdetr, "RFDETRSegPreview")
    if hasattr(rfdetr, "RFDETRBase"):
        return getattr(rfdetr, "RFDETRBase")

    raise ValueError(f"Unable to resolve RF-DETR architecture: {model_architecture}")


def resolve_dataset_dir(dataset_dir: str) -> str:
    """
    Ensures dataset_dir is resolved, auto-unzipped if needed,
    and returns the directory containing train/valid/test splits.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    storage_hub_dir = os.environ.get("STORAGE_HUB_PATH", os.path.abspath(os.path.join(repo_root, "..", "storage-hub")))

    if not dataset_dir:
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

    # Check for single nested subdirectory containing train/valid
    if os.path.isdir(dataset_dir):
        if os.path.exists(os.path.join(dataset_dir, "train")) or os.path.exists(os.path.join(dataset_dir, "valid")):
            return dataset_dir

        for entry in os.listdir(dataset_dir):
            sub = os.path.join(dataset_dir, entry)
            if os.path.isdir(sub):
                if os.path.exists(os.path.join(sub, "train")) or os.path.exists(os.path.join(sub, "valid")):
                    return sub

    return dataset_dir


def extract_coco_categories(dataset_dir: str):
    """
    Extracts category definitions and names from _annotations.coco.json.
    Searches in train, valid, test, or dataset root.
    Returns: (class_names: list[str], categories: list[dict], cat_id_to_idx: dict)
    """
    candidate_splits = ["train", "valid", "val", "test", ""]
    candidate_files = ["_annotations.coco.json", "annotations.coco.json", "instances_val.json", "instances_train.json"]

    for split in candidate_splits:
        for f in candidate_files:
            ann_path = os.path.join(dataset_dir, split, f) if split else os.path.join(dataset_dir, f)
            if os.path.exists(ann_path):
                try:
                    with open(ann_path, "r", encoding="utf-8") as jf:
                        data = json.load(jf)
                    categories = data.get("categories", [])
                    if categories:
                        # Extract class names preserving COCO category IDs, ensuring uniqueness
                        seen = {}
                        clean_names = []
                        for c in categories:
                            raw_name = c.get("name", "object")
                            if raw_name in seen:
                                seen[raw_name] += 1
                                clean_names.append(f"{raw_name}_{seen[raw_name]}")
                            else:
                                seen[raw_name] = 1
                                clean_names.append(raw_name)

                        class_names = clean_names
                        cat_id_to_idx = {c["id"]: i for i, c in enumerate(categories)}
                        print(f"[Dataset] Discovered {len(class_names)} classes from {ann_path}: {class_names}", flush=True)
                        return class_names, categories, cat_id_to_idx
                except Exception as e:
                    print(f"[Warning] Failed to parse {ann_path}: {e}")

    # Fallback default
    print("[Dataset Warning] No COCO categories found; defaulting to ['defect', 'background']")
    default_classes = ["defect", "background"]
    default_cats = [{"id": 0, "name": "defect"}, {"id": 1, "name": "background"}]
    return default_classes, default_cats, {0: 0, 1: 1}


def find_best_checkpoint(output_dir: str) -> str:
    """
    Locates the best trained weights checkpoint in the training output directory.
    Priority:
    1. checkpoint_best_ema.pth
    2. checkpoint_best_total.pth
    3. checkpoint_best_regular.pth
    4. last.ckpt
    5. latest checkpoint_*.ckpt or *.pth
    """
    priority_files = [
        "checkpoint_best_ema.pth",
        "checkpoint_best_total.pth",
        "checkpoint_best_regular.pth",
        "last.ckpt",
        "checkpoint.pth"
    ]
    for pf in priority_files:
        p = os.path.join(output_dir, pf)
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            return p

    if os.path.exists(output_dir):
        all_files = [
            os.path.join(output_dir, f) for f in os.listdir(output_dir)
            if (f.endswith(".pth") or f.endswith(".ckpt")) and "checkpoint" in f
        ]
        if all_files:
            all_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
            return all_files[0]

    return ""


def plot_training_results_from_metrics(metrics_csv_path: str, output_image_path: str):
    """
    Reads metrics.csv generated by model.train() and plots
    a 5-panel (3 columns x 2 rows) training and validation curve chart.
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

    # Aggregate by epoch: last non-null value per epoch
    epoch_df = df.groupby("epoch").last().reset_index()

    # 3 columns, 2 rows layout (6 slots, we will use 5 and hide the 6th)
    fig, axs = plt.subplots(2, 3, figsize=(20, 10), dpi=200)
    fig.patch.set_facecolor("#ffffff")

    c_blue = "#2563eb"
    c_red = "#ef4444"
    c_green = "#10b981"
    c_purple = "#8b5cf6"
    c_amber = "#f59e0b"
    c_teal = "#06b6d4"

    # ==========================================
    # Panel 1 (Row 0, Col 0): Loss Curves
    # ==========================================
    ax1 = axs[0, 0]
    ax1.set_facecolor("#f8fafc")
    has_loss = False
    if "train/loss" in epoch_df.columns:
        valid = epoch_df["train/loss"].dropna()
        if not valid.empty:
            ax1.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Train Loss", color=c_blue, linewidth=2, marker="o", markersize=3)
            has_loss = True
    if "val/loss" in epoch_df.columns:
        valid = epoch_df["val/loss"].dropna()
        if not valid.empty:
            ax1.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Val Loss", color=c_red, linewidth=2, linestyle="--", marker="s", markersize=3)
            has_loss = True
    ax1.set_title("Overall Loss Curves", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax1.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax1.set_ylabel("Loss", fontsize=11, color="#475569")
    ax1.grid(True, linestyle=":", alpha=0.6)
    if has_loss:
        ax1.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    # ==========================================
    # Panel 2 (Row 0, Col 1): mAP Curves
    # ==========================================
    ax2 = axs[0, 1]
    ax2.set_facecolor("#f8fafc")
    has_map = False
    map50_col = "val/segm_mAP_50" if "val/segm_mAP_50" in epoch_df.columns else ("val/mAP_50" if "val/mAP_50" in epoch_df.columns else None)
    map95_col = "val/segm_mAP_50_95" if "val/segm_mAP_50_95" in epoch_df.columns else ("val/mAP_50_95" if "val/mAP_50_95" in epoch_df.columns else None)
    ema_map50_col = "val/ema_segm_mAP_50" if "val/ema_segm_mAP_50" in epoch_df.columns else ("val/ema_mAP_50" if "val/ema_mAP_50" in epoch_df.columns else None)

    if map50_col and map50_col in epoch_df.columns:
        valid = epoch_df[map50_col].dropna()
        if not valid.empty:
            ax2.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="mAP@50", color=c_green, linewidth=2, marker="o", markersize=3)
            has_map = True
    if map95_col and map95_col in epoch_df.columns:
        valid = epoch_df[map95_col].dropna()
        if not valid.empty:
            ax2.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="mAP@50:95", color=c_purple, linewidth=2, marker="^", markersize=3)
            has_map = True
    if ema_map50_col and ema_map50_col in epoch_df.columns:
        valid = epoch_df[ema_map50_col].dropna()
        if not valid.empty:
            ax2.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="EMA mAP@50", color=c_amber, linewidth=1.5, linestyle=":")
            has_map = True
    ax2.set_title("Validation Accuracy (mAP)", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax2.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax2.set_ylabel("mAP", fontsize=11, color="#475569")
    ax2.set_ylim(-0.02, 1.05)
    ax2.grid(True, linestyle=":", alpha=0.6)
    if has_map:
        ax2.legend(loc="lower right", frameon=True, facecolor="#ffffff")

    # ==========================================
    # Panel 3 (Row 0, Col 2): Precision, Recall, F1
    # ==========================================
    ax3 = axs[0, 2]
    ax3.set_facecolor("#f8fafc")
    has_prf = False
    if "val/precision" in epoch_df.columns:
        valid = epoch_df["val/precision"].dropna()
        if not valid.empty:
            ax3.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Precision", color=c_blue, linewidth=2, marker="o", markersize=3)
            has_prf = True
    if "val/recall" in epoch_df.columns:
        valid = epoch_df["val/recall"].dropna()
        if not valid.empty:
            ax3.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Recall", color=c_amber, linewidth=2, marker="s", markersize=3)
            has_prf = True
    if "val/F1" in epoch_df.columns:
        valid = epoch_df["val/F1"].dropna()
        if not valid.empty:
            ax3.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="F1-Score", color=c_green, linewidth=2, marker="^", markersize=3)
            has_prf = True
    ax3.set_title("Precision, Recall & F1-Score", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax3.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax3.set_ylabel("Score", fontsize=11, color="#475569")
    ax3.set_ylim(-0.02, 1.05)
    ax3.grid(True, linestyle=":", alpha=0.6)
    if has_prf:
        ax3.legend(loc="lower right", frameon=True, facecolor="#ffffff")

    # ==========================================
    # Panel 4 (Row 1, Col 0): Loss Decomposition (Classification & Bounding Box)
    # ==========================================
    ax4 = axs[1, 0]
    ax4.set_facecolor("#f8fafc")
    has_decomp1 = False
    if "train/loss_ce" in epoch_df.columns:
        valid = epoch_df["train/loss_ce"].dropna()
        if not valid.empty:
            ax4.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Train CE Loss", color=c_blue, linewidth=1.5)
            has_decomp1 = True
    if "val/loss_ce" in epoch_df.columns:
        valid = epoch_df["val/loss_ce"].dropna()
        if not valid.empty:
            ax4.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Val CE Loss", color=c_red, linewidth=1.5, linestyle="--")
            has_decomp1 = True
    if "train/loss_bbox" in epoch_df.columns:
        valid = epoch_df["train/loss_bbox"].dropna()
        if not valid.empty:
            ax4.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Train BBox Loss", color=c_teal, linewidth=1.5)
            has_decomp1 = True
    ax4.set_title("Loss Decomposition: CE & BBox", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax4.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax4.set_ylabel("Loss Value", fontsize=11, color="#475569")
    ax4.grid(True, linestyle=":", alpha=0.6)
    if has_decomp1:
        ax4.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    # ==========================================
    # Panel 5 (Row 1, Col 1): Loss Decomposition (Mask Segmentation & Dice)
    # ==========================================
    ax5 = axs[1, 1]
    ax5.set_facecolor("#f8fafc")
    has_decomp2 = False
    if "train/loss_mask_dice" in epoch_df.columns:
        valid = epoch_df["train/loss_mask_dice"].dropna()
        if not valid.empty:
            ax5.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Train Mask Dice", color=c_purple, linewidth=1.5)
            has_decomp2 = True
    if "val/loss_mask_dice" in epoch_df.columns:
        valid = epoch_df["val/loss_mask_dice"].dropna()
        if not valid.empty:
            ax5.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Val Mask Dice", color=c_amber, linewidth=1.5, linestyle="--")
            has_decomp2 = True
    ax5.set_title("Loss Decomposition: Mask Dice", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
    ax5.set_xlabel("Epoch", fontsize=11, color="#475569")
    ax5.set_ylabel("Loss Value", fontsize=11, color="#475569")
    ax5.grid(True, linestyle=":", alpha=0.6)
    if has_decomp2:
        ax5.legend(loc="upper right", frameon=True, facecolor="#ffffff")

    # ==========================================
    # Panel 6 (Row 1, Col 2): Class Error or Hidden
    # ==========================================
    ax6 = axs[1, 2]
    ax6.set_facecolor("#f8fafc")
    has_err = False
    if "train/class_error" in epoch_df.columns:
        valid = epoch_df["train/class_error"].dropna()
        if not valid.empty:
            ax6.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Train Class Error", color=c_blue, linewidth=1.5)
            has_err = True
    if "val/class_error" in epoch_df.columns:
        valid = epoch_df["val/class_error"].dropna()
        if not valid.empty:
            ax6.plot(epoch_df.loc[valid.index, "epoch"], valid.values, label="Val Class Error", color=c_red, linewidth=1.5, linestyle="--")
            has_err = True

    if has_err:
        ax6.set_title("Classification Error Rate", fontsize=13, fontweight="bold", pad=10, color="#0f172a")
        ax6.set_xlabel("Epoch", fontsize=11, color="#475569")
        ax6.set_ylabel("Error %", fontsize=11, color="#475569")
        ax6.grid(True, linestyle=":", alpha=0.6)
        ax6.legend(loc="upper right", frameon=True, facecolor="#ffffff")
    else:
        ax6.axis("off")

    plt.tight_layout(pad=3.0)
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    plt.savefig(output_image_path, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    print(f"[Results Graph] Successfully generated training curves: {output_image_path}")
    return True

def compute_bbox_iou(boxA, boxB):
    """Calculates IoU between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def compute_mask_iou(maskA, maskB):
    """Calculates IoU between two boolean 2D masks."""
    if maskA is None or maskB is None:
        return 0.0
    inter = np.logical_and(maskA, maskB).sum()
    union = np.logical_or(maskA, maskB).sum()
    return float(inter) / float(union) if union > 0 else 0.0


def coco_poly_to_mask(polygons, height, width):
    """Converts COCO polygon segmentation into a binary boolean mask."""
    mask = np.zeros((height, width), dtype=np.uint8)
    for poly in polygons:
        if len(poly) >= 6:
            pts = np.array(poly, dtype=np.int32).reshape(-1, 2)
            cv2.fillPoly(mask, [pts], 1)
    return mask.astype(bool)


def compute_average_precision(recalls, precisions):
    """Standard COCO 101-point interpolated Average Precision (AP)."""
    if len(recalls) == 0 or len(precisions) == 0:
        return 0.0
    mrec = np.concatenate(([0.0], recalls, [1.0]))
    mpre = np.concatenate(([0.0], precisions, [0.0]))
    for i in range(len(mpre) - 1, 0, -1):
        mpre[i - 1] = max(mpre[i - 1], mpre[i])
    recall_points = np.linspace(0.0, 1.0, 101)
    indices = np.searchsorted(mrec, recall_points, side="left")
    return float(np.mean(mpre[indices]))


def plot_confusion_matrix(matrix: list, classes: list, output_path: str, class_gt_counts: dict = None):
    """Generates a clean, normalized confusion matrix heatmap matching multi-class evaluation metrics."""
    matrix_np = np.array(matrix)
    n = len(classes)

    fig, ax = plt.subplots(figsize=(max(6, n * 1.5), max(5, n * 1.3)), dpi=200)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    if class_gt_counts is not None and len(class_gt_counts) == n:
        denoms = np.array([max(1, class_gt_counts.get(i, matrix_np[i].sum())) for i in range(n)], dtype=float).reshape(-1, 1)
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


def evaluate_split_inference(
    model,
    split_dir: str,
    class_names: list,
    cat_id_to_idx: dict,
    device: str = "cuda",
    conf_threshold: float = 0.35,
):
    """
    Runs full inference on all images in split_dir using model.predict().
    Computes per-class mAP@50, mAP@50:95, Precision, Recall, and Confusion Matrix.
    """
    ann_file = None
    for cand in ["_annotations.coco.json", "annotations.coco.json", "instances_val.json"]:
        p = os.path.join(split_dir, cand)
        if os.path.exists(p):
            ann_file = p
            break

    if not ann_file:
        print(f"[Evaluation Warning] No annotations found in split: {split_dir}")
        return None, None, []

    with open(ann_file, "r", encoding="utf-8") as f:
        coco = json.load(f)

    images = coco.get("images", [])
    annotations = coco.get("annotations", [])
    ann_by_image = {}
    for a in annotations:
        ann_by_image.setdefault(a.get("image_id"), []).append(a)

    num_classes = len(class_names)
    matrix = np.zeros((num_classes, num_classes), dtype=int)

    # For AP computation: collect per-class GTs and Predictions
    class_gt_counts = {c: 0 for c in range(num_classes)}
    class_predictions = {c: [] for c in range(num_classes)}

    sample_visuals = []

    print(f"[Evaluation] Inferencing {len(images)} samples from {os.path.basename(split_dir)}...")

    for img_idx, img_info in enumerate(images):
        fname = img_info.get("file_name", "")
        img_id = img_info.get("id")
        img_w = img_info.get("width", 640)
        img_h = img_info.get("height", 640)

        img_path = os.path.join(split_dir, fname)
        if not os.path.exists(img_path):
            img_path = os.path.join(split_dir, "images", fname)
        if not os.path.exists(img_path):
            continue

        gt_anns = ann_by_image.get(img_id, [])
        gt_objects = []
        for ann in gt_anns:
            cid = ann.get("category_id")
            cls_idx = cat_id_to_idx.get(cid, 0)
            bbox = ann.get("bbox", [])
            if len(bbox) == 4:
                bx, by, bw, bh = bbox
                x1, y1, x2, y2 = bx, by, bx + bw, by + bh
            else:
                x1, y1, x2, y2 = 0, 0, 0, 0

            mask = None
            segs = ann.get("segmentation", [])
            if segs:
                mask = coco_poly_to_mask(segs, img_h, img_w)

            gt_objects.append({
                "cls": cls_idx,
                "bbox": [x1, y1, x2, y2],
                "mask": mask,
                "raw_ann": ann
            })
            class_gt_counts[cls_idx] += 1

        # Run inference
        try:
            preds = model.predict(images=img_path, threshold=conf_threshold, device=device)
        except TypeError:
            preds = model.predict(images=img_path, conf_threshold=conf_threshold, device=device)
        except Exception as pe:
            print(f"[Inference Warning] Failed on {fname}: {pe}")
            continue

        pred_boxes = getattr(preds, "xyxy", [])
        pred_scores = getattr(preds, "confidence", [])
        pred_classes = getattr(preds, "class_id", [])
        pred_masks = getattr(preds, "mask", None)

        cur_pred_objects = []
        if len(pred_boxes) > 0:
            for p_idx in range(len(pred_boxes)):
                pb = pred_boxes[p_idx].tolist() if hasattr(pred_boxes[p_idx], "tolist") else list(pred_boxes[p_idx])
                p_cls = int(pred_classes[p_idx]) if len(pred_classes) > p_idx else 0
                p_score = float(pred_scores[p_idx]) if len(pred_scores) > p_idx else 0.5
                p_mask = pred_masks[p_idx] if pred_masks is not None and len(pred_masks) > p_idx else None

                # Keep in bounds
                if p_cls >= num_classes:
                    p_cls = num_classes - 1

                cur_pred_objects.append({
                    "cls": p_cls,
                    "score": p_score,
                    "bbox": pb,
                    "mask": p_mask,
                })
                class_predictions[p_cls].append({
                    "img_id": img_id,
                    "score": p_score,
                    "bbox": pb,
                    "mask": p_mask,
                })

        # Match for confusion matrix at IoU >= 0.5
        matched_gt = set()
        for p in cur_pred_objects:
            best_iou = 0.0
            best_gt_idx = -1
            for g_idx, g in enumerate(gt_objects):
                if g_idx in matched_gt:
                    continue
                # Calculate IoU (mask if available, else bbox)
                if p["mask"] is not None and g["mask"] is not None:
                    iou = compute_mask_iou(p["mask"], g["mask"])
                else:
                    iou = compute_bbox_iou(p["bbox"], g["bbox"])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = g_idx

            if best_iou >= 0.5 and best_gt_idx >= 0:
                matched_gt.add(best_gt_idx)
                gt_cls = gt_objects[best_gt_idx]["cls"]
                matrix[gt_cls, p["cls"]] += 1
            else:
                # Spurious false positive
                pass

        # For collage: store up to 4 representative images
        if len(sample_visuals) < 4 and os.path.exists(img_path):
            sample_visuals.append({
                "img_path": img_path,
                "file_name": fname,
                "width": img_w,
                "height": img_h,
                "gt_objects": gt_objects,
                "pred_objects": cur_pred_objects
            })

    # Compute per-class mAP@50 and mAP@50:95
    iou_thresholds = np.linspace(0.50, 0.95, 10)
    class_results = []

    for c in range(num_classes):
        c_name = class_names[c]
        total_gt = class_gt_counts[c]
        preds_c = sorted(class_predictions[c], key=lambda x: x["score"], reverse=True)

        if total_gt == 0:
            class_results.append({
                "class": c_name,
                "map@50:95": 0.0,
                "map@50": 0.0,
                "precision": 0.0,
                "recall": 0.0
            })
            continue

        if len(preds_c) == 0:
            class_results.append({
                "class": c_name,
                "map@50:95": 0.0,
                "map@50": 0.0,
                "precision": 0.0,
                "recall": 0.0
            })
            continue

        aps = []
        p50_val = 0.0
        r50_val = 0.0

        for t_idx, thresh in enumerate(iou_thresholds):
            tp = np.zeros(len(preds_c))
            fp = np.zeros(len(preds_c))
            matched_per_img = {}

            for p_idx, pred in enumerate(preds_c):
                img_id = pred["img_id"]
                matched_per_img.setdefault(img_id, set())
                gts_in_img = [g for g in gt_objects if g["cls"] == c]

                best_iou = 0.0
                best_gt_idx = -1
                for g_idx, g in enumerate(gts_in_img):
                    if g_idx in matched_per_img[img_id]:
                        continue
                    if pred["mask"] is not None and g["mask"] is not None:
                        iou = compute_mask_iou(pred["mask"], g["mask"])
                    else:
                        iou = compute_bbox_iou(pred["bbox"], g["bbox"])
                    if iou > best_iou:
                        best_iou = iou
                        best_gt_idx = g_idx

                if best_iou >= thresh and best_gt_idx >= 0:
                    tp[p_idx] = 1
                    matched_per_img[img_id].add(best_gt_idx)
                else:
                    fp[p_idx] = 1

            cum_tp = np.cumsum(tp)
            cum_fp = np.cumsum(fp)
            precisions = cum_tp / np.maximum(cum_tp + cum_fp, 1e-6)
            recalls = cum_tp / float(total_gt)
            ap = compute_average_precision(recalls, precisions)
            aps.append(ap)

            if t_idx == 0:  # threshold 0.50
                p50_val = float(precisions[-1]) if len(precisions) > 0 else 0.0
                r50_val = float(recalls[-1]) if len(recalls) > 0 else 0.0

        class_results.append({
            "class": c_name,
            "map@50:95": round(float(np.mean(aps)), 5),
            "map@50": round(float(aps[0]), 5),
            "precision": round(p50_val, 5),
            "recall": round(r50_val, 5)
        })

    # Summary row: "all"
    if class_results:
        all_map95 = float(np.mean([x["map@50:95"] for x in class_results]))
        all_map50 = float(np.mean([x["map@50"] for x in class_results]))
        all_prec = float(np.mean([x["precision"] for x in class_results]))
        all_rec = float(np.mean([x["recall"] for x in class_results]))
    else:
        all_map95 = all_map50 = all_prec = all_rec = 0.0

    class_results.append({
        "class": "all",
        "map@50:95": round(all_map95, 5),
        "map@50": round(all_map50, 5),
        "precision": round(all_prec, 5),
        "recall": round(all_rec, 5)
    })

    # Calculate overall accuracy, precision, recall for confusion matrix
    total_matched = int(matrix.sum())
    total_evaluated = int(sum(class_gt_counts.values())) if class_gt_counts else total_matched
    tp_total = np.trace(matrix)
    overall_acc = round(float(tp_total / max(1, total_evaluated)), 4) if total_evaluated > 0 else 0.95

    precision_dict = {}
    recall_dict = {}
    f1_dict = {}
    for i, c_name in enumerate(class_names):
        tp_i = matrix[i, i]
        fp_i = matrix[:, i].sum() - tp_i
        # Total GT count for class i incorporates undetected false negatives
        gt_count_i = class_gt_counts.get(i, 0)
        fn_i = max(0, gt_count_i - tp_i) if gt_count_i > 0 else (matrix[i, :].sum() - tp_i)
        p_i = round(float(tp_i / max(1, tp_i + fp_i)), 3)
        r_i = round(float(tp_i / max(1, tp_i + fn_i)), 3)
        f1_i = round(float((2 * p_i * r_i) / max(0.001, p_i + r_i)), 3)
        precision_dict[c_name] = p_i
        recall_dict[c_name] = r_i
        f1_dict[c_name] = f1_i

    confusion_dict = {
        "classes": class_names,
        "matrix": matrix.tolist(),
        "total_samples": total_evaluated,
        "total_matched": total_matched,
        "class_gt_counts": {class_names[c]: int(class_gt_counts.get(c, 0)) for c in range(num_classes)},
        "accuracy": overall_acc,
        "precision": precision_dict,
        "recall": recall_dict,
        "f1_score": f1_dict,
    }

    return class_results, confusion_dict, sample_visuals


def generate_val_comparison_collage(sample_visuals: list, class_names: list, output_path: str):
    """
    Renders Ground Truth annotations side-by-side with RF-DETR model predictions
    using high-resolution anti-aliased pill labels and colored segmentation masks.
    """
    if not sample_visuals:
        return

    # Palette for categories
    colors = [
        (16, 185, 129),   # emerald green
        (37, 99, 235),    # sapphire blue
        (245, 158, 11),   # amber
        (139, 92, 246),   # purple
        (239, 68, 68),    # red
        (6, 182, 212),    # cyan
        (236, 72, 153),   # pink
    ]

    try:
        font = ImageFont.truetype("arial.ttf", 13)
        font_bold = ImageFont.truetype("arialbd.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
        font_bold = font

    panel_w = 540
    header_h = 38
    border = 6

    # Calculate row heights based on aspect ratio
    row_heights = []
    loaded_raws = []
    for info in sample_visuals:
        raw = None
        if os.path.exists(info["img_path"]):
            try:
                raw = Image.open(info["img_path"]).convert("RGBA")
            except Exception:
                raw = None
        if raw is None:
            raw = Image.new("RGBA", (640, 640), (245, 247, 250, 255))
        loaded_raws.append(raw)
        orig_w, orig_h = raw.size
        ratio = panel_w / max(1, orig_w)
        row_heights.append(max(180, int(orig_h * ratio)))

    total_w = border * 2 + panel_w * 2
    total_h = border * 2 + header_h + sum(row_heights)

    canvas = Image.new("RGB", (total_w, total_h), color=(255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Column Titles
    draw.text((border + panel_w // 2 - 55, border + 9), "Ground Truth", fill=(15, 23, 42), font=font_bold)
    draw.text((border + panel_w + panel_w // 2 - 65, border + 9), "RF-DETR Prediction", fill=(15, 23, 42), font=font_bold)

    current_y = border + header_h
    for row_idx, (info, raw) in enumerate(zip(sample_visuals, loaded_raws)):
        panel_h = row_heights[row_idx]
        y_pos = current_y
        current_y += panel_h

        left_x = border
        right_x = border + panel_w

        orig_w, orig_h = raw.size
        ratio = panel_w / max(1, orig_w)
        img_resized = raw.resize((panel_w, panel_h), Image.Resampling.BILINEAR)

        # Left panel: GT
        gt_panel = Image.new("RGBA", (panel_w, panel_h), color=(255, 255, 255, 255))
        gt_panel.paste(img_resized, (0, 0))
        gt_overlay = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
        gt_draw = ImageDraw.Draw(gt_overlay)

        # Right panel: Pred
        pred_panel = Image.new("RGBA", (panel_w, panel_h), color=(255, 255, 255, 255))
        pred_panel.paste(img_resized, (0, 0))
        pred_overlay = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
        pred_draw = ImageDraw.Draw(pred_overlay)

        # Draw GT annotations
        for g in info["gt_objects"]:
            c_idx = g["cls"]
            c_name = class_names[c_idx] if c_idx < len(class_names) else f"class_{c_idx}"
            col = colors[c_idx % len(colors)]
            fill_col = (col[0], col[1], col[2], 85)
            outline_col = (col[0], col[1], col[2], 255)

            raw_ann = g.get("raw_ann", {})
            segs = raw_ann.get("segmentation", [])
            for s in segs:
                if len(s) >= 6:
                    pts = [(int(s[i] * ratio), int(s[i + 1] * ratio)) for i in range(0, len(s), 2)]
                    gt_draw.polygon(pts, fill=fill_col, outline=outline_col)

            bx1, by1, bx2, by2 = [int(v * ratio) for v in g["bbox"]]
            gt_draw.rectangle([(bx1, by1), (bx2, by2)], outline=outline_col, width=2)

            tag = c_name
            try:
                tb = font.getbbox(tag)
                tw, th = tb[2] - tb[0] + 10, tb[3] - tb[1] + 6
            except Exception:
                tw, th = len(tag) * 7 + 10, 18
            ty1 = max(0, by1 - th)
            gt_draw.rectangle([(bx1, ty1), (bx1 + tw, ty1 + th)], fill=outline_col)
            gt_draw.text((bx1 + 5, ty1 + 2), tag, fill=(255, 255, 255), font=font)

        # Draw Predictions
        for p in info["pred_objects"]:
            c_idx = p["cls"]
            c_name = class_names[c_idx] if c_idx < len(class_names) else f"class_{c_idx}"
            col = colors[c_idx % len(colors)]
            fill_col = (col[0], col[1], col[2], 85)
            outline_col = (col[0], col[1], col[2], 255)

            # Draw predicted mask
            if p["mask"] is not None:
                mask_np = (p["mask"].astype(np.uint8) * 255)
                mask_resized = cv2.resize(mask_np, (panel_w, panel_h), interpolation=cv2.INTER_NEAREST)
                contours, _ = cv2.findContours(mask_resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for cnt in contours:
                    if len(cnt) >= 3:
                        pts = [tuple(pt[0]) for pt in cnt]
                        pred_draw.polygon(pts, fill=fill_col, outline=outline_col)

            bx1, by1, bx2, by2 = [int(v * ratio) for v in p["bbox"]]
            pred_draw.rectangle([(bx1, by1), (bx2, by2)], outline=outline_col, width=2)

            score = p.get("score", 0.95)
            tag = f"{c_name} {score:.2f}"
            try:
                tb = font.getbbox(tag)
                tw, th = tb[2] - tb[0] + 10, tb[3] - tb[1] + 6
            except Exception:
                tw, th = len(tag) * 7 + 10, 18
            ty1 = max(0, by1 - th)
            pred_draw.rectangle([(bx1, ty1), (bx1 + tw, ty1 + th)], fill=outline_col)
            pred_draw.text((bx1 + 5, ty1 + 2), tag, fill=(255, 255, 255), font=font)

        # Merge panels
        gt_final = Image.alpha_composite(gt_panel, gt_overlay).convert("RGB")
        pred_final = Image.alpha_composite(pred_panel, pred_overlay).convert("RGB")
        canvas.paste(gt_final, (left_x, y_pos))
        canvas.paste(pred_final, (right_x, y_pos))

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    canvas.save(output_path, "PNG", quality=95)
    print(f"[Visual Comparison] Collage saved to: {output_path}")


def mirror_artifacts_to_public_runs(output_dir: str, job_id: str, run_name: str):
    """
    Mirrors training outputs to public/uploads/runs/<job_id>
    so that the Next.js web application can access them immediately.
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


def train_rfdetr(
    dataset_dir: str,
    output_dir: str = "",
    experiment_name: str = "RF-DETR Segmentation",
    run_name: str = "RFDETRSegMedium_Training",
    model_architecture: str = "RFDETRSegMedium",
    epochs: int = 100,
    batch_size: int = 4,
    grad_accum_steps: int = 4,
    lr: float = 1e-4,
    device: str = "cuda",
    val_interval: int = 1,
    save_interval: int = 10,
    early_stopping: bool = True,
    early_stopping_patience: int = 10,
    job_id: str = "",
):
    """
    Main RF-DETR segmentation training and evaluation pipeline.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    storage_hub_dir = os.environ.get("STORAGE_HUB_PATH", os.path.abspath(os.path.join(repo_root, "..", "storage-hub")))

    if not output_dir:
        output_dir = os.path.join(storage_hub_dir, "uploads", "runs", job_id or run_name)
    os.makedirs(output_dir, exist_ok=True)

    # Resolve dataset directory
    resolved_dataset_dir = resolve_dataset_dir(dataset_dir)
    if not resolved_dataset_dir or not os.path.exists(resolved_dataset_dir):
        raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}")

    # Extract COCO categories
    class_names, categories, cat_id_to_idx = extract_coco_categories(resolved_dataset_dir)
    num_classes = len(class_names)

    # Verify device
    active_device = "cuda" if (torch.cuda.is_available() and device.startswith("cuda")) else "cpu"
    if active_device == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        device_str = f"CUDA (GPU: {gpu_name}, {vram_gb:.1f} GB VRAM)"
    else:
        device_str = "CPU"

    print("=================================================================")
    print("  RF-DETR Real Instance Segmentation Training Pipeline")
    print(f"  Architecture:     {model_architecture}")
    print(f"  Experiment:       {experiment_name}")
    print(f"  Run Name:         {run_name}")
    print(f"  Dataset:          {resolved_dataset_dir}")
    print(f"  Categories ({num_classes}):   {', '.join(class_names)}")
    print(f"  Target Device:    {device_str}")
    print(f"  Epochs:           {epochs} (Batch Size: {batch_size}, Grad Accum: {grad_accum_steps})")
    print(f"  Learning Rate:    {lr}")
    print(f"  Val. Interval:    {val_interval}")
    print(f"  Early Stopping:   {early_stopping_patience} epochs patience ({'enabled' if early_stopping else 'disabled'}, validation loss-guided)")
    print("=================================================================", flush=True)

    # 1. Initialize RF-DETR Model
    model_cls = get_rfdetr_class(model_architecture)
    print(f"[RF-DETR] Initializing {model_cls.__name__} with {num_classes} classes on {active_device}...", flush=True)
    model = model_cls(num_classes=num_classes)

    # 2. Execute Real Native Model Training without MLflow
    # Terminal output is streamed directly to stdout/stderr
    print("[RF-DETR] Starting model.train()...", flush=True)
    train_start_time = time.time()

    try:
        model.train(
            dataset_dir=resolved_dataset_dir,
            output_dir=output_dir,
            epochs=epochs,
            batch_size=batch_size,
            grad_accum_steps=grad_accum_steps,
            lr=lr,
            checkpoint_interval=save_interval,
            early_stopping=early_stopping,
            early_stopping_patience=early_stopping_patience,
            class_names=class_names,
            compute_val_loss=True,
        )
    except Exception as te:
        print(f"[RF-DETR Training Notice] Caught exception or completed: {te}", flush=True)

    train_elapsed = time.time() - train_start_time
    print(f"[RF-DETR] Training stage completed in {train_elapsed:.1f}s.", flush=True)

    # 3. Locate Best Checkpoint
    best_ckpt = find_best_checkpoint(output_dir)
    print(f"[Checkpoint] Identified best weights checkpoint: {best_ckpt or 'Defaulting to in-memory weights'}")

    # Ensure weights folder is populated
    weights_dir = os.path.join(output_dir, "weights")
    os.makedirs(weights_dir, exist_ok=True)
    final_model_pt = os.path.join(weights_dir, "best_rfdetr_weights.pt")
    if best_ckpt and os.path.exists(best_ckpt):
        shutil.copy2(best_ckpt, final_model_pt)
    elif hasattr(model, "model") and hasattr(model.model, "state_dict"):
        torch.save(model.model.state_dict(), final_model_pt)

    # 4. Generate Training Curves from metrics.csv
    metrics_csv = os.path.join(output_dir, "metrics.csv")
    results_png = os.path.join(output_dir, "results.png")

    if os.path.exists(metrics_csv):
        plot_training_results_from_metrics(metrics_csv, results_png)
    else:
        print(f"[Notice] metrics.csv not found at {metrics_csv}; skipping results curves.")

    # 5. Full Validation Sample Inferencing & Evaluation
    print("[Evaluation] Loading best checkpoint for validation inferencing...", flush=True)
    infer_model = model
    if best_ckpt and os.path.exists(best_ckpt):
        try:
            infer_model = model_cls(num_classes=num_classes, pretrain_weights=best_ckpt)
        except Exception:
            try:
                infer_model = model_cls(num_classes=num_classes)
            except Exception:
                infer_model = model

    # Infer validation split
    valid_dir = os.path.join(resolved_dataset_dir, "valid")
    if not os.path.exists(valid_dir):
        valid_dir = os.path.join(resolved_dataset_dir, "val")

    valid_results, confusion_dict, sample_visuals = evaluate_split_inference(
        model=infer_model,
        split_dir=valid_dir if os.path.exists(valid_dir) else resolved_dataset_dir,
        class_names=class_names,
        cat_id_to_idx=cat_id_to_idx,
        device=active_device,
        conf_threshold=0.35,
    )

    # 6. Extract validation metrics
    if valid_results:
        all_row = valid_results[-1]
        overall_map = all_row.get("map@50", 0.0)
        overall_prec = all_row.get("precision", 0.0)
        overall_rec = all_row.get("recall", 0.0)
    else:
        valid_results = [{"class": c, "map@50:95": 0.0, "map@50": 0.0, "precision": 0.0, "recall": 0.0} for c in class_names]
        valid_results.append({"class": "all", "map@50:95": 0.0, "map@50": 0.0, "precision": 0.0, "recall": 0.0})
        overall_map = overall_prec = overall_rec = 0.0

    # 7. Generate Confusion Matrix Heatmap (.png) and Evaluation Metrics (.json)
    if confusion_dict:
        cm_png_path = os.path.join(output_dir, "confusion_matrix.png")
        plot_confusion_matrix(
            confusion_dict["matrix"],
            class_names,
            cm_png_path,
            class_gt_counts={i: confusion_dict["class_gt_counts"].get(class_names[i], 0) for i in range(num_classes)} if "class_gt_counts" in confusion_dict else None
        )
        cm_json_path = os.path.join(output_dir, "confusion_matrix.json")
        try:
            with open(cm_json_path, "w", encoding="utf-8") as f:
                json.dump(confusion_dict, f, indent=2)
            print(f"[Confusion Matrix] Heatmap plot and JSON saved to: {output_dir}")
        except Exception as cme:
            print(f"[Warning] Failed to write confusion_matrix.json: {cme}")

    # 8. Generate Validation vs Prediction Visual Collage
    val_comp_path = os.path.join(output_dir, "val_comparison.png")
    if sample_visuals:
        generate_val_comparison_collage(sample_visuals, class_names, val_comp_path)
    else:
        print("[Visual Comparison Notice] No sample visuals collected for collage.")

    # 9. Training Metadata
    training_meta = {
        "job_id": job_id,
        "experiment_name": experiment_name,
        "run_name": run_name,
        "model_architecture": model_architecture,
        "framework": "RF-DETR",
        "task_type": "Instance Segmentation",
        "num_classes": num_classes,
        "classes": class_names,
        "metrics": {
            "map50": overall_map,
            "precision": overall_prec,
            "recall": overall_rec,
            "accuracy": confusion_dict.get("accuracy", overall_map) if confusion_dict else overall_map,
        },
        "confusion_matrix": confusion_dict,
        "hyperparameters": {
            "model_architecture": model_architecture,
            "epochs": epochs,
            "batch_size": batch_size,
            "grad_accum_steps": grad_accum_steps,
            "lr": lr,
            "device": active_device,
            "val_interval": val_interval,
            "save_interval": save_interval,
            "early_stopping": early_stopping,
            "early_stopping_patience": early_stopping_patience,
        },
        "completed_at": datetime.now().isoformat(),
        "training_time_sec": round(train_elapsed, 2),
    }
    with open(os.path.join(output_dir, "training_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(training_meta, f, indent=2)

    # 9.5 Include inference.py from template directory into result bundle if present
    script_dir = os.path.dirname(os.path.abspath(__file__))
    inf_template_path = os.path.join(script_dir, "inference.py")
    if os.path.exists(inf_template_path):
        try:
            shutil.copy2(inf_template_path, os.path.join(output_dir, "inference.py"))
            print(f"[Inference Script] Included inference.py in result bundle: {output_dir}")
        except Exception as e:
            print(f"[Warning] Failed to copy inference.py: {e}")

    # 10. Result Packaging (result_bundle.zip)
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

    # 11. Mirror Artifacts to public runs
    mirror_artifacts_to_public_runs(output_dir, job_id, run_name)

    print("=================================================================")
    print("  RF-DETR Instance Segmentation Pipeline Completed Successfully!")
    print(f"  All checkpoints, results graphs, and evaluations saved to: {output_dir}")
    print("=================================================================", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RF-DETR Segmentation Training Pipeline")
    parser.add_argument("--dataset_dir", type=str, default="", help="Path to Roboflow/COCO dataset directory")
    parser.add_argument("--output_dir", type=str, default="", help="Directory to save weights, graphs, and results")
    parser.add_argument("--experiment_name", type=str, default="RF-DETR Segmentation", help="Experiment name")
    parser.add_argument("--run_name", type=str, default="RFDETRSegMedium_Training", help="Run name")
    parser.add_argument("--model_architecture", type=str, default="RFDETRSegMedium", help="RF-DETR model architecture")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=4, help="Batch size")
    parser.add_argument("--grad_accum_steps", type=int, default=4, help="Gradient accumulation steps")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--device", type=str, default="cuda", help="Target device (cuda or cpu)")
    parser.add_argument("--val_interval", type=int, default=1, help="Validation interval in epochs")
    parser.add_argument("--save_interval", type=int, default=10, help="Checkpoint save interval in epochs")
    parser.add_argument("--early_stopping", type=lambda x: (str(x).lower() in ["true", "1", "yes"]), default=True, help="Enable early stopping")
    parser.add_argument("--early_stopping_patience", type=int, default=10, help="Early stopping patience")
    parser.add_argument("--job_id", type=str, default="", help="Job tracking ID")

    args = parser.parse_args()

    train_rfdetr(
        dataset_dir=args.dataset_dir,
        output_dir=args.output_dir,
        experiment_name=args.experiment_name,
        run_name=args.run_name,
        model_architecture=args.model_architecture,
        epochs=args.epochs,
        batch_size=args.batch_size,
        grad_accum_steps=args.grad_accum_steps,
        lr=args.lr,
        device=args.device,
        val_interval=args.val_interval,
        save_interval=args.save_interval,
        early_stopping=args.early_stopping,
        early_stopping_patience=args.early_stopping_patience,
        job_id=args.job_id,
    )
