import os
import torch
from PIL import Image

# Import the model architecture used in your training script
from rfdetr import RFDETRSegMedium

def main():
    # ==================== CONFIGURATION ====================
    # Directly edit your paths and settings here:
    IMAGE_PATH = "C:/Users/Hafizi/Documents/computer vision/07-powercable/data/power cables.v8/valid/basler_capture_20260803_200006_jpg.rf.f2cc773395246f5d88ebca1b31f12d99.jpg"
    MODEL_PATH = "C:/Users/Hafizi/Documents/computer vision/07-powercable/runs/mediumpc2/checkpoint_best_ema.pth"
    NUM_CLASSES = 2                  # Number of classes your model was trained on
    CONF_THRESHOLD = 0.5             # Confidence threshold for predictions
    OUTPUT_PATH = "inference_result__.jpg"  # Path to save the output result
    
    # Automatically select GPU if available, otherwise CPU
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    # =======================================================

    # 1. Validate paths
    if not os.path.exists(IMAGE_PATH):
        raise FileNotFoundError(f"Image path not found: {IMAGE_PATH}")
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model checkpoint not found: {MODEL_PATH}")

    print(f"Initializing and loading trained weights into RFDETRSegMedium from: {MODEL_PATH}")
    
    # Initialize model and load trained weights directly
    try:
        model = RFDETRSegMedium(num_classes=NUM_CLASSES, pretrain_weights=MODEL_PATH)
        print("Model loaded 1")
    except TypeError:
        try:
            model = RFDETRSegMedium(num_classes=NUM_CLASSES, weights=MODEL_PATH)
            print("Model loaded 2")
        except TypeError:
            model = RFDETRSegMedium(num_classes=NUM_CLASSES)
            if hasattr(model, "load_weights"):
                model.load_weights(MODEL_PATH)
            elif hasattr(model, "load"):
                model.load(MODEL_PATH)

    print(f"Running inference on image: {IMAGE_PATH}")
    
    # Run prediction using 'images' keyword argument as required by rf-detr
    results = model.predict(
        images=IMAGE_PATH,
        conf_threshold=CONF_THRESHOLD,
        device=DEVICE
    )

    print(f"Inference completed! Saving results to {OUTPUT_PATH}")
    
    # Save or print results depending on library methods
    if hasattr(model, "save_prediction"):
        model.save_prediction(results, output_path=OUTPUT_PATH)
    else:
        print("Results obtained:", results)

if __name__ == "__main__":
    main()