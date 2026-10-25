import os
import random
import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torchvision import datasets, transforms
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score
import timm

# --- Reproducibility ---
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

# --- 1. Configuration ---
DATA_DIR = 'C:/Users/Hafizi/Documents/computer vision/03-lens/deploy_new/lens_station3.v17i.classification'
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR_NAME = os.path.basename(os.path.normpath(DATA_DIR))
TRANSFORM_DIR = os.path.join(SCRIPT_DIR, f"{DATA_DIR_NAME}_transform_v4")

SAVE_TRANSFORMED_IMAGES = True  # Toggle saving transformed images to TRANSFORM_DIR
OVERWRITE_TRANSFORMED = False   # Set True to overwrite if TRANSFORM_DIR already exists
IMG_SIZE = 128                  # Optimal resolution for defect crops preventing GAP signal dilution
BATCH_SIZE = 16
EPOCHS = 100
WARMUP_EPOCHS = 5               # Stage 1: Warm up classifier head with frozen backbone
LR_HEAD_WARMUP = 5e-4           # Warmup learning rate for head
LR_BACKBONE = 1e-5              # Stage 2: Low learning rate for backbone fine-tuning
LR_HEAD = 1e-4                  # Stage 2: Learning rate for classifier head
WEIGHT_DECAY = 1e-4             # Weight decay for regularization
LABEL_SMOOTHING = 0.1           # Prevents overconfidence on dominant classes
PATIENCE = 15                   # Early stopping patience based on validation Macro F1
DROP_RATE = 0.2                 # Dropout rate for regularizing MobileNetV4 classifier head
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL_SAVE_PATH = "C:/Users/Hafizi/Documents/computer vision/03-lens/deploy_new/s3_class_model_v4.pth"
MODEL_NAME = "mobilenetv4_conv_small" # Target MobileNetV4 backbone

# --- 2. Data Preparation & Transforms ---

class LetterboxPad:
    """
    1. Scales the image proportionally so its longest edge fits target_size (preserving geometry:
       scratches stay elongated, bubbles/voids stay round).
    2. Centers the scaled crop on a square canvas of (target_size, target_size).
    3. Replicates border pixels into the margins (padding_mode='edge') so the natural gray/blue
       lens surface blends seamlessly, eliminating artificial black border contrast steps.
    """
    def __init__(self, target_size=128, pad_mode='edge'):
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
    def __init__(self, full_ds, indices, transform=None):
        self.full_ds = full_ds
        self.indices = indices
        self.transform = transform
        
    def __getitem__(self, idx):
        real_idx = self.indices[idx]
        x, y = self.full_ds[real_idx]
        if self.transform:
            x = self.transform(x)
        return x, y
        
    def __len__(self):
        return len(self.indices)

# Training Augmentations (Rotation, Flips, Gentle Color Jitter suited for optical reflections)
train_transform = transforms.Compose([
    LetterboxPad(target_size=IMG_SIZE, pad_mode='edge'),
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

# Validation Transforms (Clean - No Augmentation)
val_transform = transforms.Compose([
    LetterboxPad(target_size=IMG_SIZE, pad_mode='edge'),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# --- Evaluation Function ---
def evaluate(model, val_loader, criterion, val_dataset_len):
    model.eval()
    y_true = []
    y_pred = []
    running_loss = 0.0
    
    with torch.no_grad():
        for inputs, labels in val_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            running_loss += loss.item() * inputs.size(0)
            
            _, preds = torch.max(outputs, 1)
            y_true.extend(labels.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())
            
    val_loss = running_loss / val_dataset_len
    acc = accuracy_score(y_true, y_pred)
    macro_f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)
    return val_loss, acc, macro_f1, y_true, y_pred

# --- Save Transformed Dataset Pipeline ---
def save_transformed_dataset(source_dir, output_dir, transform_fn, overwrite=False):
    if not os.path.exists(source_dir):
        print(f"[Pipeline] Source data directory '{source_dir}' does not exist. Skipping.")
        return

    if os.path.exists(output_dir) and not overwrite:
        existing_images = sum(
            len(files) for _, _, files in os.walk(output_dir)
            if any(f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')) for f in files)
        )
        if existing_images > 0:
            print(f"[Pipeline] Transform directory '{output_dir}' already exists with {existing_images} images. Skipping saving.\n")
            return

    os.makedirs(output_dir, exist_ok=True)
    print(f"\n[Pipeline] Saving transformed images to: {output_dir}")

    classes = [d for d in os.listdir(source_dir) if os.path.isdir(os.path.join(source_dir, d))]
    total_saved = 0

    for cls in sorted(classes):
        cls_src = os.path.join(source_dir, cls)
        cls_dst = os.path.join(output_dir, cls)
        os.makedirs(cls_dst, exist_ok=True)

        files = [f for f in os.listdir(cls_src) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
        for f in files:
            src_file = os.path.join(cls_src, f)
            dst_file = os.path.join(cls_dst, f)

            try:
                with Image.open(src_file) as img:
                    img = img.convert('RGB')
                    transformed_img = transform_fn(img)
                    transformed_img.save(dst_file)
                    total_saved += 1
            except Exception as e:
                print(f"  Warning: Failed to transform {src_file}: {e}")

        print(f"  Saved class '{cls}': {len(files)} images")

    print(f"[Pipeline] Successfully saved {total_saved} transformed images to {output_dir}\n")

def main():
    set_seed(42)

    if SAVE_TRANSFORMED_IMAGES:
        save_transform = LetterboxPad(target_size=IMG_SIZE, pad_mode='edge')
        save_transformed_dataset(
            source_dir=DATA_DIR,
            output_dir=TRANSFORM_DIR,
            transform_fn=save_transform,
            overwrite=OVERWRITE_TRANSFORMED
        )

    full_dataset = datasets.ImageFolder(DATA_DIR)
    class_names = full_dataset.classes
    NUM_CLASSES = len(class_names)
    all_targets = np.array(full_dataset.targets)
    all_indices = np.arange(len(full_dataset))

    train_idx, val_idx = train_test_split(
        all_indices,
        test_size=0.2,
        stratify=all_targets,
        random_state=42
    )

    train_data = ApplyTransform(full_dataset, train_idx, transform=train_transform)
    val_data = ApplyTransform(full_dataset, val_idx, transform=val_transform)

    train_loader = DataLoader(train_data, batch_size=BATCH_SIZE, shuffle=True, pin_memory=torch.cuda.is_available())
    val_loader = DataLoader(val_data, batch_size=BATCH_SIZE, shuffle=False, pin_memory=torch.cuda.is_available())

    print(f"Device: {DEVICE}")
    print(f"Classes found ({NUM_CLASSES}): {class_names}")
    print(f"Total images: {len(full_dataset)} | Training set: {len(train_data)} | Validation set: {len(val_data)}")

    # --- CLASS IMBALANCE HANDLING: SMOOTHED CLASS WEIGHTS ---
    train_targets = all_targets[train_idx]
    class_counts = np.bincount(train_targets, minlength=NUM_CLASSES)
    print(f"Training class counts: {dict(zip(class_names, class_counts))}")

    raw_weights = len(train_idx) / (NUM_CLASSES * class_counts.astype(float))
    smoothed_weights = np.sqrt(raw_weights)
    smoothed_weights = smoothed_weights / smoothed_weights.mean()
    class_weights_tensor = torch.FloatTensor(smoothed_weights).to(DEVICE)
    print(f"Smoothed Class Weights: {dict(zip(class_names, np.round(smoothed_weights, 4)))}")

    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor, label_smoothing=LABEL_SMOOTHING)

    # --- 3. Model Definition (MobileNetV4 via timm with Custom Head) ---
    print(f"Initializing model: {MODEL_NAME}")
    model = timm.create_model(MODEL_NAME, pretrained=True, num_classes=NUM_CLASSES, drop_rate=DROP_RATE)
    model = model.to(DEVICE)

    # --- 4. Two-Stage Training Loop ---
    best_macro_f1 = 0.0
    epochs_no_improve = 0

    print("\n" + "="*50)
    print(f"STAGE 1: Head Warmup ({WARMUP_EPOCHS} epochs, Backbone Frozen)")
    print("="*50)

    # Freeze all parameters except the classifier head in timm models
    for name, param in model.named_parameters():
        if "head" in name or "classifier" in name:
            param.requires_grad = True
        else:
            param.requires_grad = False

    optimizer = optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=LR_HEAD_WARMUP,
        weight_decay=WEIGHT_DECAY
    )

    for epoch in range(WARMUP_EPOCHS):
        model.train()
        running_loss = 0.0
        
        for inputs, labels in train_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * inputs.size(0)
            
        train_loss = running_loss / len(train_data)
        val_loss, acc, macro_f1, _, _ = evaluate(model, val_loader, criterion, len(val_data))
        
        if macro_f1 > best_macro_f1:
            best_macro_f1 = macro_f1
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            saved_mark = " [*Best Model Saved]"
        else:
            saved_mark = ""
            
        print(f"[Warmup {epoch+1}/{WARMUP_EPOCHS}] Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Acc: {acc:.4f} | Macro F1: {macro_f1:.4f}{saved_mark}")

    print("\n" + "="*50)
    print(f"STAGE 2: Full Fine-Tuning with Differential LR & Cosine Decay (Max {EPOCHS - WARMUP_EPOCHS} epochs)")
    print("="*50)

    # Unfreeze entire backbone for fine-tuning
    for param in model.parameters():
        param.requires_grad = True

    # Identify backbone vs head parameters dynamically for timm MobileNetV4
    backbone_params = []
    head_params = []
    for name, param in model.named_parameters():
        if "head" in name or "classifier" in name:
            head_params.append(param)
        else:
            backbone_params.append(param)

    optimizer = optim.AdamW([
        {'params': backbone_params, 'lr': LR_BACKBONE},
        {'params': head_params, 'lr': LR_HEAD}
    ], weight_decay=WEIGHT_DECAY)

    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=EPOCHS - WARMUP_EPOCHS,
        eta_min=1e-6
    )

    for epoch in range(WARMUP_EPOCHS, EPOCHS):
        model.train()
        running_loss = 0.0
        
        for inputs, labels in train_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * inputs.size(0)
            
        scheduler.step()
        train_loss = running_loss / len(train_data)
        val_loss, acc, macro_f1, _, _ = evaluate(model, val_loader, criterion, len(val_data))
        current_lr_bb = optimizer.param_groups[0]['lr']
        current_lr_head = optimizer.param_groups[1]['lr']
        
        if macro_f1 > best_macro_f1:
            best_macro_f1 = macro_f1
            epochs_no_improve = 0
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            saved_mark = " [*Best Model Saved]"
        else:
            epochs_no_improve += 1
            saved_mark = ""
            
        print(f"Epoch {epoch+1:03d}/{EPOCHS} | Train: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Acc: {acc:.4f} | Macro F1: {macro_f1:.4f} | LR: {current_lr_bb:.1e}/{current_lr_head:.1e}{saved_mark}")
        
        if epochs_no_improve >= PATIENCE:
            print(f"\n[Early Stopping] No improvement in validation Macro F1 for {PATIENCE} consecutive epochs. Stopping early.")
            break

    # --- 5. Final Detailed Metrics (Restoring Best Weights) ---
    print("\n" + "="*50)
    print("FINAL EVALUATION METRICS (Best Model Restored)")
    print("="*50)

    model.load_state_dict(torch.load(MODEL_SAVE_PATH, map_location=DEVICE))
    val_loss, acc, macro_f1, y_true, y_pred = evaluate(model, val_loader, criterion, len(val_data))

    print(f"Best Validation Accuracy: {acc:.4f}")
    print(f"Best Validation Macro F1: {macro_f1:.4f}\n")
    print(classification_report(y_true, y_pred, target_names=class_names, digits=4, zero_division=0))
    print("Confusion Matrix:")
    print(confusion_matrix(y_true, y_pred))

    print(f"\nTraining complete. Best model weights saved to {MODEL_SAVE_PATH}")

if __name__ == '__main__':
    main()