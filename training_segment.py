import json
import os
import mlflow
from rfdetr import RFDETRBase, RFDETRMedium, RFDETRSmall, RFDETRSegNano, RFDETRSegSmall, RFDETRSegMedium
from rfdetr import config

mlflow.autolog(log_models=False)

mlflow.enable_system_metrics_logging()
os.environ["MLFLOW_SYSTEM_METRICS_SAMPLING_INTERVAL"] = "5"

def get_num_classes_from_coco(dataset_sir: str) -> int:
    ANNOTATION_PATH = os.path.join(dataset_sir, "train", "_annotations.coco.json")
    if not os.path.exists(ANNOTATION_PATH):
        raise FileNotFoundError(f"Annotation file not found at: {ANNOTATION_PATH}")
        
    with open(ANNOTATION_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    categories = data.get("categories", [])
    print(categories)
    if not categories:
        raise ValueError(f"No 'categories' key or empty list found in {ANNOTATION_PATH}")
        
    return len(categories)

def train_rfdetr():
    DATASET_DIR = "C:/Users/Hafizi/Documents/computer vision/07-powercable/data/power cables.v8" 
    OUTPUT_DIR = "C:/Users/Hafizi/Documents/computer vision/07-powercable/runs/mediumpc2"

    EXPERIMENT_NAME = "Power Cables"
    RUN_NAME = "RFDETRSegMedium_Training"
    
    NUM_CLASSES = get_num_classes_from_coco(DATASET_DIR)

    WORKSPACE_DIR = os.getcwd()
    DB_PATH = os.path.join(WORKSPACE_DIR, "mlflow.db")

    mlflow.set_tracking_uri(f"sqlite:///{DB_PATH}")
    mlflow.set_experiment(EXPERIMENT_NAME)
    
    with mlflow.start_run(run_name=RUN_NAME):
        
        hyperparameters = {
            "epochs": 100,
            "batch_size": 4,
            "grad_accum_steps": 4,
            "lr": 1e-4,
            "resolution": 432,
            "device": "cuda",
            "val_interval": 1,
            "save_interval": 10,
            "early_stopping": True,
            "early_stopping_patience": 10,
            "num_classes": NUM_CLASSES,
            "model_architecture": "RFDETRSegMedium"
        }
        model_used = globals()[hyperparameters["model_architecture"]]
        model = model_used(num_classes=NUM_CLASSES)
        
        mlflow.log_params(hyperparameters)
        
        mlflow.log_param("dataset_dir", DATASET_DIR)
        mlflow.log_param("output_dir", OUTPUT_DIR)

        print("Starting training pipeline...")
        model.train(
            dataset_dir=DATASET_DIR,
            output_dir=OUTPUT_DIR,
            epochs=hyperparameters["epochs"],
            batch_size=hyperparameters["batch_size"],
            grad_accum_steps=hyperparameters["grad_accum_steps"],
            lr=hyperparameters["lr"],
            device=hyperparameters["device"],
            val_interval=hyperparameters["val_interval"],
            save_interval=hyperparameters["save_interval"],
            early_stopping=hyperparameters["early_stopping"],
            early_stopping_patience=hyperparameters["early_stopping_patience"]
        )
        
        mlflow.log_artifacts(OUTPUT_DIR, artifact_path="model_checkpoints")
        
        print("Training completed!")
        print(f"Output checkpoints saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    train_rfdetr()