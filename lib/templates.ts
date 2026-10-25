import fs from 'fs';
import path from 'path';
import { TrainingJob } from './types';

export interface TemplateInferenceResolution {
  templateName: string;
  templateDir: string;
  inferenceScriptPath: string | null;
  hasInferenceScript: boolean;
}

/**
 * Resolves the template directory and inference.py script for a given training job.
 * Supports:
 * - Explicit template key in job.hyperparameters.template
 * - Standard templates (RF-DETR Segmentation, RF-DETR BBox, MobileNetV4 Image Classification)
 * - Dynamic discovery for future custom templates created under training_scripts/<template_name>
 */
export function resolveJobTemplateInference(job?: Partial<TrainingJob> | null): TemplateInferenceResolution {
  const scriptsDir = path.resolve(process.cwd(), 'training_scripts');

  if (!fs.existsSync(scriptsDir)) {
    return {
      templateName: 'unknown',
      templateDir: scriptsDir,
      inferenceScriptPath: null,
      hasInferenceScript: false
    };
  }

  // 1. Check explicit template name if specified in hyperparameters or job
  const explicitTemplate = job?.hyperparameters?.template || (job as any)?.template;
  if (explicitTemplate && typeof explicitTemplate === 'string') {
    const candidateDir = path.join(scriptsDir, explicitTemplate);
    if (fs.existsSync(candidateDir)) {
      const infPath = path.join(candidateDir, 'inference.py');
      const hasInf = fs.existsSync(infPath);
      return {
        templateName: explicitTemplate,
        templateDir: candidateDir,
        inferenceScriptPath: hasInf ? infPath : null,
        hasInferenceScript: hasInf
      };
    }
  }

  // 2. Infer by model architecture or task type
  const arch = (job?.hyperparameters?.model_architecture || '').toLowerCase();
  const task = (job?.taskType || '').toLowerCase();
  const name = (job?.name || '').toLowerCase();

  let matchedDirName: string | null = null;

  const isSahi = arch.includes('sahi') || task.includes('sahi') || name.includes('sahi');

  if (isSahi) {
    if (task.includes('seg') || arch.includes('seg')) {
      matchedDirName = 'rfdetr_seg_sahi';
    } else {
      matchedDirName = 'rfdetr_bbox_sahi';
    }
  } else if (task.includes('classification') || arch.includes('mobilenetv4') || name.includes('classification')) {
    matchedDirName = 'image_classification';
  } else if (task.includes('bbox') || task.includes('detection') || (arch.includes('rfdetr') && !arch.includes('seg'))) {
    matchedDirName = 'rfdetr_bbox';
  } else if (task.includes('segment') || arch.includes('seg')) {
    matchedDirName = 'rfdetr_segmentation';
  }

  // 3. Fallback: match any directory in training_scripts/ whose name appears in taskType, arch, or name
  if (!matchedDirName) {
    try {
      const allDirs = fs.readdirSync(scriptsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('__'))
        .map((d) => d.name);

      for (const d of allDirs) {
        const dLower = d.toLowerCase();
        if (task.includes(dLower) || arch.includes(dLower) || name.includes(dLower)) {
          matchedDirName = d;
          break;
        }
      }
    } catch {}
  }

  if (matchedDirName) {
    const targetDir = path.join(scriptsDir, matchedDirName);
    const infPath = path.join(targetDir, 'inference.py');
    const hasInf = fs.existsSync(infPath);
    return {
      templateName: matchedDirName,
      templateDir: targetDir,
      inferenceScriptPath: hasInf ? infPath : null,
      hasInferenceScript: hasInf
    };
  }

  return {
    templateName: 'unknown',
    templateDir: scriptsDir,
    inferenceScriptPath: null,
    hasInferenceScript: false
  };
}

