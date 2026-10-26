'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrainingJob, Dataset, DatasetDomain } from '@/lib/types';
import { useAuth } from './AuthContext';
import {
  Cpu,
  UploadCloud,
  Play,
  Pause,
  StopCircle,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Download,
  Terminal,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Scissors,
  Crosshair,
  BarChart3,
  Zap,
  Shield,
  Settings,
  HelpCircle,
  Trash2,
  Users,
  X,
  Loader2,
  FolderArchive,
  FileCode,
  Info,
  Grid
} from 'lucide-react';

interface HyperparamRule {
  min?: number;
  max?: number;
  isFloat?: boolean;
  label: string;
}

const HYPERPARAM_RULES: Record<string, HyperparamRule> = {
  epochs: { min: 1, max: 1000, label: 'Epochs' },
  batchSize: { min: 1, max: 64, label: 'Batch size' },
  gradAccumSteps: { min: 1, max: 32, label: 'Grad accumulation' },
  lr: { min: 0.000001, max: 1, isFloat: true, label: 'Learning rate' },
  valInterval: { min: 1, max: 100, label: 'Validation interval' },
  saveInterval: { min: 1, max: 100, label: 'Save interval' },
  earlyStoppingPatience: { min: 1, max: 100, label: 'Early stopping patience' },
  weightDecay: { min: 0, max: 1, isFloat: true, label: 'Weight decay' },
  labelSmoothing: { min: 0, max: 0.99, isFloat: true, label: 'Label smoothing' },
};

function getHyperparamError(field: string, val: number | string): string | null {
  const rule = HYPERPARAM_RULES[field];
  if (!rule) return null;
  if (val === '' || val === undefined || val === null) {
    return `${rule.label} is required`;
  }
  const num = Number(val);
  if (isNaN(num)) {
    return `${rule.label} must be a valid number`;
  }
  if (!rule.isFloat && !Number.isInteger(num)) {
    return `${rule.label} must be a whole number`;
  }
  if (rule.min !== undefined && num < rule.min) {
    return `${rule.label} must be at least ${rule.min}`;
  }
  if (rule.max !== undefined && num > rule.max) {
    return `${rule.label} cannot exceed ${rule.max}`;
  }
  return null;
}

export function getDatasetOverlapInfo(d: Dataset): string | null {
  if (d.sahiConfig) {
    const t = d.sahiConfig.overlapType === 'percentage' ? 'percentage' : 'pixel';
    return `${t} overlap (${d.sahiConfig.overlapX}, ${d.sahiConfig.overlapY})`;
  }
  if (!d.description) return null;
  const matchWithCoords = d.description.match(/(percentage|pixel)\s*overlap\s*\(([^)]+)\)/i);
  if (matchWithCoords) {
    return `${matchWithCoords[1].toLowerCase()} overlap (${matchWithCoords[2].trim()})`;
  }
  const matchWithout = d.description.match(/(percentage|pixel)\s*overlap/i);
  if (matchWithout) {
    const type = matchWithout[1].toLowerCase();
    const fallback = type === 'percentage' ? '80, 80' : '80, 80';
    return `${type} overlap (${fallback})`;
  }
  if (d.name && d.name.includes('(SAHI)')) {
    return 'percentage overlap (80, 80)';
  }
  return null;
}

export function formatDatasetDescription(d: Dataset): string {
  let desc = d.description || '';
  if (desc && /(percentage|pixel)\s*overlap\)\./i.test(desc)) {
    const ov = getDatasetOverlapInfo(d);
    if (ov) {
      desc = desc.replace(/(percentage|pixel)\s*overlap\)\./i, `${ov}).`);
    }
  }
  return desc;
}

export function TrainingView() {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'queue' | 'submit' | 'datasets' | 'results'>('queue');
  const [submitView, setSubmitView] = useState<'templates' | 'segmentation' | 'classification' | 'detection' | 'segmentation_sahi' | 'detection_sahi'>('templates');
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [registeredUsersList, setRegisteredUsersList] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [userFilter, setUserFilter] = useState<string>('all');
  const [isDeletingResult, setIsDeletingResult] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null);
  const [selectedResultJob, setSelectedResultJob] = useState<TrainingJob | null>(null);
  const [isClearingJobs, setIsClearingJobs] = useState(false);

  // --- RF-DETR Instance Segmentation State ---
  const [rfdetrForm, setRfdetrForm] = useState({
    name: '',
    runName: '',
    segModel: 'RFDETRSegSmall',
    datasetId: '',
    description: 'Instance segmentation training using RF-DETR architecture.',
    // RF-DETR segmentation hyperparameters (number | string for backspace deletion support)
    epochs: 100 as number | string,
    batchSize: 4 as number | string,
    gradAccumSteps: 4 as number | string,
    lr: 0.0001 as number | string,
    valInterval: 1 as number | string,
    saveInterval: 10 as number | string,
    earlyStopping: true,
    earlyStoppingPatience: 10 as number | string,
    device: 'cuda',
  });

  // --- RF-DETR Bounding Box Object Detection State ---
  const [rfdetrBboxForm, setRfdetrBboxForm] = useState({
    name: '',
    runName: '',
    bboxModel: 'RFDETRSmall',
    datasetId: '',
    description: 'Object detection (bounding box) training using RF-DETR architecture.',
    epochs: 100 as number | string,
    batchSize: 4 as number | string,
    gradAccumSteps: 4 as number | string,
    lr: 0.0001 as number | string,
    valInterval: 1 as number | string,
    saveInterval: 10 as number | string,
    earlyStopping: true,
    earlyStoppingPatience: 10 as number | string,
    device: 'cuda',
  });

  // --- RF-DETR Instance Segmentation (SAHI) State ---
  const [rfdetrSegSahiForm, setRfdetrSegSahiForm] = useState({
    name: '',
    runName: '',
    segModel: 'RFDETRSegMedium',
    datasetId: '',
    description: 'Instance segmentation training with SAHI slicing algorithm and RF-DETR architecture.',
    // SAHI Slicing parameters
    sliceCols: 2 as number | string,
    sliceRows: 2 as number | string,
    overlapType: 'pixel' as 'pixel' | 'percentage',
    overlapPixelX: 80 as number | string,
    overlapPixelY: 80 as number | string,
    overlapRatioX: 20 as number | string,
    overlapRatioY: 20 as number | string,
    minBoxSize: 2 as number | string,
    // Hyperparameters
    epochs: 100 as number | string,
    batchSize: 4 as number | string,
    gradAccumSteps: 4 as number | string,
    lr: 0.0001 as number | string,
    valInterval: 1 as number | string,
    saveInterval: 10 as number | string,
    earlyStopping: true,
    earlyStoppingPatience: 10 as number | string,
    device: 'cuda',
  });

  // --- RF-DETR Object Detection (SAHI) State ---
  const [rfdetrBboxSahiForm, setRfdetrBboxSahiForm] = useState({
    name: '',
    runName: '',
    bboxModel: 'RFDETRSmall',
    datasetId: '',
    description: 'Object detection (bounding box) training with SAHI slicing algorithm and RF-DETR architecture.',
    // SAHI Slicing parameters
    sliceCols: 2 as number | string,
    sliceRows: 2 as number | string,
    overlapType: 'pixel' as 'pixel' | 'percentage',
    overlapPixelX: 80 as number | string,
    overlapPixelY: 80 as number | string,
    overlapRatioX: 20 as number | string,
    overlapRatioY: 20 as number | string,
    minBoxSize: 2 as number | string,
    // Hyperparameters
    epochs: 100 as number | string,
    batchSize: 4 as number | string,
    gradAccumSteps: 4 as number | string,
    lr: 0.0001 as number | string,
    valInterval: 1 as number | string,
    saveInterval: 10 as number | string,
    earlyStopping: true,
    earlyStoppingPatience: 10 as number | string,
    device: 'cuda',
  });

  // --- Image Classification (MobileNetV4 via timm) State ---
  const [classificationForm, setClassificationForm] = useState({
    name: '',
    runName: '',
    modelArchitecture: 'mobilenetv4_conv_small',
    datasetId: '',
    description: 'Image classification training using MobileNetV4 from timm.',
    epochs: 100 as number | string,
    batchSize: 16 as number | string,
    lr: 0.0005 as number | string,
    optimizer: 'AdamW',
    weightDecay: 0.0001 as number | string,
    imgSize: 224 as number | string,
    pretrained: true,
    labelSmoothing: 0.1 as number | string,
    earlyStopping: true,
    earlyStoppingPatience: 10 as number | string,
    device: 'cuda',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrorModal, setSubmitErrorModal] = useState<string | null>(null);
  const [inferenceAlertModal, setInferenceAlertModal] = useState<string | null>(null);
  const [isDownloadingInference, setIsDownloadingInference] = useState(false);

  // Dataset Analysis Modal State
  const [analysisDataset, setAnalysisDataset] = useState<Dataset | null>(null);
  const [datasetAnalysis, setDatasetAnalysis] = useState<any | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [cmViewMode, setCmViewMode] = useState<'grid' | 'image'>('grid');
  const [jobConfusionMatrix, setJobConfusionMatrix] = useState<Record<string, any>>({});

  const [queueFilter, setQueueFilter] = useState<'all' | 'ongoing' | 'queued' | 'completed' | 'failed'>('all');

  // Form State for Uploading Dataset (Roboflow Snippet vs Archive)
  const [datasetUploadMode, setDatasetUploadMode] = useState<'roboflow' | 'archive'>('roboflow');
  const [roboflowSnippet, setRoboflowSnippet] = useState(
`from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_API_KEY")
project = rf.workspace("workspace-slug").project("project-slug")
version = project.version(1)
dataset = version.download("coco")`
  );
  const [datasetForm, setDatasetForm] = useState({
    name: '',
    category: 'vision' as 'vision' | 'tabular',
    domain: 'Instance Segmentation / Object Detection' as DatasetDomain,
    description: ''
  });

  // See All Pagination Modals (Max 10 per page)
  const [showAllJobsModal, setShowAllJobsModal] = useState(false);
  const [allJobsPage, setAllJobsPage] = useState(1);
  const [allJobsSearch, setAllJobsSearch] = useState('');

  const [showAllDatasetsModal, setShowAllDatasetsModal] = useState(false);
  const [allDatasetsPage, setAllDatasetsPage] = useState(1);
  const [allDatasetsSearch, setAllDatasetsSearch] = useState('');

  // Target Dataset Selection Modal for Training Templates
  const [targetDatasetPickerOpen, setTargetDatasetPickerOpen] = useState(false);
  const [targetDatasetPickerTemplate, setTargetDatasetPickerTemplate] = useState<'rfdetr_seg' | 'rfdetr_bbox' | 'classification' | 'rfdetr_seg_sahi' | 'rfdetr_bbox_sahi'>('rfdetr_seg');
  const [datasetPickerSearch, setDatasetPickerSearch] = useState('');
  const [datasetPickerPage, setDatasetPickerPage] = useState(1);

  const openTargetDatasetPicker = (template: 'rfdetr_seg' | 'rfdetr_bbox' | 'classification' | 'rfdetr_seg_sahi' | 'rfdetr_bbox_sahi') => {
    setTargetDatasetPickerTemplate(template);
    setDatasetPickerSearch('');
    setDatasetPickerPage(1);
    setTargetDatasetPickerOpen(true);
  };

  const [showAllResultsModal, setShowAllResultsModal] = useState(false);
  const [allResultsPage, setAllResultsPage] = useState(1);
  const [allResultsSearch, setAllResultsSearch] = useState('');

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Active Collapsible Hyperparameter Section
  const [activeSection, setActiveSection] = useState<'all' | 'arch' | 'train' | 'loss' | 'aug' | 'hw'>('all');

  // Load jobs, datasets, and registered users
  const loadData = async () => {
    try {
      const [jRes, dRes, uRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/datasets'),
        fetch('/api/auth')
      ]);
      if (jRes.ok) {
        const jData = await jRes.json();
        setJobs(jData);
        setSelectedJob((prev) => {
          if (!prev) return null;
          return jData.find((j: TrainingJob) => j.id === prev.id) || prev;
        });
      }
      if (dRes.ok) {
        const dData = await dRes.json();
        setDatasets((prev) => {
          const uploadingItems = prev.filter((d) => d.isUploading);
          const remainingUploading = uploadingItems.filter(
            (u) => !dData.some((real: Dataset) => real.id === u.id)
          );
          return [...remainingUploading, ...dData];
        });

        // Initialize with first compatible dataset ONLY if none is selected yet (preserves user selection)
        setRfdetrForm((prev) => {
          if (prev.datasetId && dData.some((d: Dataset) => d.id === prev.datasetId)) {
            return prev;
          }
          if (prev.datasetId) return prev;
          const compatible = dData.find((d: Dataset) => !(d.domain === 'Image Classification' || d.format === 'images_folder' || d.domain === 'Tabular' || d.format === 'csv'));
          return compatible ? { ...prev, datasetId: compatible.id } : prev;
        });

        setRfdetrBboxForm((prev) => {
          if (prev.datasetId && dData.some((d: Dataset) => d.id === prev.datasetId)) {
            return prev;
          }
          if (prev.datasetId) return prev;
          const compatible = dData.find((d: Dataset) => !(d.domain === 'Image Classification' || d.format === 'images_folder' || d.domain === 'Tabular' || d.format === 'csv'));
          return compatible ? { ...prev, datasetId: compatible.id } : prev;
        });

        setRfdetrSegSahiForm((prev) => {
          if (prev.datasetId && dData.some((d: Dataset) => d.id === prev.datasetId)) {
            return prev;
          }
          if (prev.datasetId) return prev;
          const compatible = dData.find((d: Dataset) => !(d.domain === 'Image Classification' || d.format === 'images_folder' || d.domain === 'Tabular' || d.format === 'csv'));
          return compatible ? { ...prev, datasetId: compatible.id } : prev;
        });

        setRfdetrBboxSahiForm((prev) => {
          if (prev.datasetId && dData.some((d: Dataset) => d.id === prev.datasetId)) {
            return prev;
          }
          if (prev.datasetId) return prev;
          const compatible = dData.find((d: Dataset) => !(d.domain === 'Image Classification' || d.format === 'images_folder' || d.domain === 'Tabular' || d.format === 'csv'));
          return compatible ? { ...prev, datasetId: compatible.id } : prev;
        });

        setClassificationForm((prev) => {
          if (prev.datasetId && dData.some((d: Dataset) => d.id === prev.datasetId)) {
            return prev;
          }
          if (prev.datasetId) return prev;
          const compatible = dData.find((d: Dataset) => (d.domain === 'Image Classification' || d.format === 'images_folder'));
          return compatible ? { ...prev, datasetId: compatible.id } : prev;
        });
      }
      if (uRes && uRes.ok) {
        const uData = await uRes.json();
        if (Array.isArray(uData)) {
          setRegisteredUsersList(uData);
          setAvailableUsers(uData.map((u: any) => u.name).filter(Boolean));
        }
      }
    } catch (err) {
      console.error('Error loading training data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [selectedJob?.id]);

  // Unique user accounts across auth users, jobs, datasets, and current session
  const allUserAccounts = React.useMemo(() => {
    const namesSet = new Set<string>();
    if (user?.name) namesSet.add(user.name);
    availableUsers.forEach((n) => namesSet.add(n));
    jobs.forEach((j) => {
      if (j.submittedBy) namesSet.add(j.submittedBy);
    });
    datasets.forEach((d) => {
      if (d.uploadedBy) namesSet.add(d.uploadedBy);
    });
    return Array.from(namesSet).filter(Boolean).sort();
  }, [user, availableUsers, jobs, datasets]);

  // Filtered views by user account
  const displayedJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      if (userFilter !== 'all') {
        const matchesName = job.submittedBy && job.submittedBy.trim().toLowerCase() === userFilter.trim().toLowerCase();
        const matchesId = job.submittedById && user?.id === job.submittedById && user?.name === userFilter;
        if (!matchesName && !matchesId) return false;
      }
      if (queueFilter === 'ongoing') return job.status === 'running';
      if (queueFilter === 'queued') return job.status === 'queued';
      if (queueFilter === 'completed') return job.status === 'completed';
      if (queueFilter === 'failed') return job.status === 'failed' || job.status === 'cancelled';
      return true;
    });
  }, [jobs, userFilter, queueFilter, user]);

  const displayedDatasets = React.useMemo(() => {
    return datasets.filter((d) => {
      if (userFilter !== 'all') {
        const matchesName = d.uploadedBy && d.uploadedBy.trim().toLowerCase() === userFilter.trim().toLowerCase();
        if (!matchesName) return false;
      }
      return true;
    });
  }, [datasets, userFilter]);

  const completedRuns = React.useMemo(() => {
    return jobs.filter((j) => {
      if (j.status !== 'completed') return false;
      if (userFilter !== 'all') {
        const matchesName = j.submittedBy && j.submittedBy.trim().toLowerCase() === userFilter.trim().toLowerCase();
        const matchesId = j.submittedById && user?.id === j.submittedById && user?.name === userFilter;
        if (!matchesName && !matchesId) return false;
      }
      return true;
    });
  }, [jobs, userFilter, user]);

  // Dynamically load real confusion matrix for completed runs if missing from initial payload
  const activeJobForResult = selectedResultJob || completedRuns[0];
  useEffect(() => {
    if (!activeJobForResult || activeJobForResult.status !== 'completed') return;
    if (activeJobForResult.confusionMatrix && activeJobForResult.confusionMatrix.matrix && activeJobForResult.confusionMatrix.matrix.length > 0) return;
    if (jobConfusionMatrix[activeJobForResult.id]) return;

    let isMounted = true;
    fetch(`/api/jobs/${activeJobForResult.id}/confusion-matrix`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.matrix && data.matrix.length > 0) {
          setJobConfusionMatrix((prev) => ({ ...prev, [activeJobForResult.id]: data }));
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeJobForResult?.id, activeJobForResult?.status, activeJobForResult?.confusionMatrix, jobConfusionMatrix]);

  // Handle Delete Training Result (Owner only)
  const handleDeleteTrainingResult = async (jobId: string, jobName: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete training result "${jobName}"? This will delete all checkpoint weights, metrics, collage images, and the result folder from workstation storage.`
      )
    ) {
      return;
    }
    setIsDeletingResult(true);
    try {
      const query = new URLSearchParams({
        requestedBy: user?.name || '',
        requestedById: user?.id || '',
        userRole: user?.role || ''
      });
      const res = await fetch(`/api/jobs/${jobId}?${query.toString()}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete training result');
      }
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      const remainingCompleted = jobs.filter(
        (j) =>
          j.id !== jobId &&
          j.status === 'completed' &&
          (userFilter === 'all' || j.submittedBy === userFilter)
      );
      setSelectedResultJob(remainingCompleted[0] || null);
    } catch (err: any) {
      console.error('Error deleting training result:', err);
      alert(err.message || 'Failed to delete training result');
    } finally {
      setIsDeletingResult(false);
    }
  };

  // Handle Open Dataset Analysis Popup
  const handleOpenDatasetAnalysis = async (dataset: Dataset) => {
    setAnalysisDataset(dataset);
    setDatasetAnalysis(null);
    setIsLoadingAnalysis(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/analysis`);
      if (res.ok) {
        const data = await res.json();
        setDatasetAnalysis(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setAnalysisError(err.error || 'Failed to fetch dataset analysis');
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to connect to dataset analyzer');
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Handle Export dataset_metadata.json
  const handleExportDatasetMetadata = () => {
    if (!datasetAnalysis) return;
    const jsonStr = JSON.stringify(datasetAnalysis, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(datasetAnalysis.name || 'dataset').replace(/[^a-zA-Z0-9_-]/g, '_')}_metadata.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Download Inference Script (.PY)
  const handleDownloadInference = async (jobId: string, jobName: string) => {
    setIsDownloadingInference(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/inference?check=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.exists) {
        setInferenceAlertModal(data.error || 'No inference script provided');
        return;
      }

      // Trigger download
      const safeName = (jobName || jobId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const downloadLink = document.createElement('a');
      downloadLink.href = `/api/jobs/${jobId}/inference`;
      downloadLink.download = `inference_${safeName}.py`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err: any) {
      setInferenceAlertModal('No inference script provided');
    } finally {
      setIsDownloadingInference(false);
    }
  };

  // Handle RF-DETR Job Submit
  const handleRfdetrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfdetrForm.name.trim()) {
      setSubmitErrorModal('Please enter an Experiment / Project Name before submitting.');
      return;
    }
    const targetDatasetId = rfdetrForm.datasetId;
    if (!targetDatasetId) {
      setSubmitErrorModal('No target dataset selected! Please select an Instance Segmentation dataset before starting model training.');
      return;
    }

    const targetDataset = datasets.find((d) => d.id === targetDatasetId);
    if (targetDataset) {
      if (targetDataset.domain === 'Image Classification' || targetDataset.format === 'images_folder') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is formatted for Image Classification (${targetDataset.domain || targetDataset.format}). RF-DETR Instance Segmentation requires an Instance Segmentation dataset (COCO format with polygon segmentation masks).`);
        return;
      }
      if (targetDataset.domain === 'Tabular' || targetDataset.format === 'csv') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is a Tabular dataset, which cannot be used for vision instance segmentation.`);
        return;
      }
    }

    // Validate hyperparameters
    const rfdetrFields = ['epochs', 'batchSize', 'gradAccumSteps', 'lr', 'valInterval', 'saveInterval'];
    if (rfdetrForm.earlyStopping) rfdetrFields.push('earlyStoppingPatience');
    for (const f of rfdetrFields) {
      const err = getHyperparamError(f, (rfdetrForm as any)[f]);
      if (err) {
        setSubmitErrorModal(`Invalid hyperparameter: ${err}. Please correct it before submitting.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: rfdetrForm.name.trim(),
        category: 'vision',
        taskType: `RF-DETR Instance Segmentation (${rfdetrForm.segModel})`,
        datasetId: targetDatasetId,
        epochs: Number(rfdetrForm.epochs),
        batchSize: Number(rfdetrForm.batchSize),
        learningRate: Number(rfdetrForm.lr),
        device: 'cuda',
        submittedBy: user?.name || 'Staff ML Engineer',
        submittedById: user?.id,
        description: rfdetrForm.description,
        hyperparameters: {
          template: 'rfdetr_segmentation',
          model_architecture: rfdetrForm.segModel,
          run_name: rfdetrForm.runName || `${rfdetrForm.segModel}_Training`,
          epochs: Number(rfdetrForm.epochs),
          batch_size: Number(rfdetrForm.batchSize),
          grad_accum_steps: Number(rfdetrForm.gradAccumSteps),
          lr: Number(rfdetrForm.lr),
          device: 'cuda',
          val_interval: Number(rfdetrForm.valInterval),
          save_interval: Number(rfdetrForm.saveInterval),
          early_stopping: rfdetrForm.earlyStopping,
          early_stopping_patience: Number(rfdetrForm.earlyStoppingPatience),
        }
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await loadData();
        setUserFilter('all');
        setSubTab('queue');
        setSubmitView('templates');
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitErrorModal(data.error || 'Failed to submit RF-DETR training job to queue');
      }
    } catch (err: any) {
      console.error('Failed to submit RF-DETR job:', err);
      setSubmitErrorModal(err.message || 'Network or server error encountered while submitting RF-DETR job');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle RF-DETR Object Detection Job Submit
  const handleRfdetrBboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfdetrBboxForm.name.trim()) {
      setSubmitErrorModal('Please enter an Experiment / Project Name before submitting.');
      return;
    }
    const targetDatasetId = rfdetrBboxForm.datasetId;
    if (!targetDatasetId) {
      setSubmitErrorModal('No target dataset selected! Please select an Object Detection dataset before starting model training.');
      return;
    }

    const targetDataset = datasets.find((d) => d.id === targetDatasetId);
    if (targetDataset) {
      if (targetDataset.domain === 'Image Classification' || targetDataset.format === 'images_folder') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is formatted for Image Classification (${targetDataset.domain || targetDataset.format}). RF-DETR Object Detection requires a bounding box dataset (COCO format with bbox annotations).`);
        return;
      }
      if (targetDataset.domain === 'Tabular' || targetDataset.format === 'csv') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is a Tabular dataset, which cannot be used for vision object detection.`);
        return;
      }
    }

    // Validate hyperparameters
    const bboxFields = ['epochs', 'batchSize', 'gradAccumSteps', 'lr', 'valInterval', 'saveInterval'];
    if (rfdetrBboxForm.earlyStopping) bboxFields.push('earlyStoppingPatience');
    for (const f of bboxFields) {
      const err = getHyperparamError(f, (rfdetrBboxForm as any)[f]);
      if (err) {
        setSubmitErrorModal(`Invalid hyperparameter: ${err}. Please correct it before submitting.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: rfdetrBboxForm.name.trim(),
        category: 'vision',
        taskType: `RF-DETR Object Detection (${rfdetrBboxForm.bboxModel})`,
        datasetId: targetDatasetId,
        epochs: Number(rfdetrBboxForm.epochs),
        batchSize: Number(rfdetrBboxForm.batchSize),
        learningRate: Number(rfdetrBboxForm.lr),
        device: 'cuda',
        submittedBy: user?.name || 'Staff ML Engineer',
        submittedById: user?.id,
        description: rfdetrBboxForm.description,
        hyperparameters: {
          template: 'rfdetr_bbox',
          model_architecture: rfdetrBboxForm.bboxModel,
          run_name: rfdetrBboxForm.runName || `${rfdetrBboxForm.bboxModel}_BBox_Training`,
          epochs: Number(rfdetrBboxForm.epochs),
          batch_size: Number(rfdetrBboxForm.batchSize),
          grad_accum_steps: Number(rfdetrBboxForm.gradAccumSteps),
          lr: Number(rfdetrBboxForm.lr),
          device: 'cuda',
          val_interval: Number(rfdetrBboxForm.valInterval),
          save_interval: Number(rfdetrBboxForm.saveInterval),
          early_stopping: rfdetrBboxForm.earlyStopping,
          early_stopping_patience: Number(rfdetrBboxForm.earlyStoppingPatience),
        }
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await loadData();
        setUserFilter('all');
        setSubTab('queue');
        setSubmitView('templates');
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitErrorModal(data.error || 'Failed to submit RF-DETR BBox job to queue');
      }
    } catch (err: any) {
      console.error('Failed to submit RF-DETR BBox job:', err);
      setSubmitErrorModal(err.message || 'Network or server error encountered while submitting RF-DETR BBox job');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Image Classification (MobileNetV4 via timm) Job Submit
  const handleClassificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classificationForm.name.trim()) {
      setSubmitErrorModal('Please enter an Experiment / Project Name before submitting.');
      return;
    }
    const targetDatasetId = classificationForm.datasetId;
    if (!targetDatasetId) {
      setSubmitErrorModal('No target dataset selected! Please select an Image Classification dataset before starting model training.');
      return;
    }

    const targetDataset = datasets.find((d) => d.id === targetDatasetId);
    if (targetDataset) {
      if (targetDataset.domain === 'Instance Segmentation / Object Detection' || targetDataset.format === 'coco' || targetDataset.format === 'yolo') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is formatted for Instance Segmentation / Object Detection (${targetDataset.domain || targetDataset.format}). MobileNetV4 Image Classification requires a folder hierarchy dataset (with train/val folders containing class subfolders).`);
        return;
      }
      if (targetDataset.domain === 'Tabular' || targetDataset.format === 'csv') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is a Tabular dataset, which cannot be used for image classification.`);
        return;
      }
    }

    // Validate hyperparameters
    const clfFields = ['epochs', 'lr', 'weightDecay', 'labelSmoothing'];
    if (classificationForm.earlyStopping) clfFields.push('earlyStoppingPatience');
    for (const f of clfFields) {
      const err = getHyperparamError(f, (classificationForm as any)[f]);
      if (err) {
        setSubmitErrorModal(`Invalid hyperparameter: ${err}. Please correct it before submitting.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: classificationForm.name.trim(),
        category: 'vision',
        taskType: `Image Classification (${classificationForm.modelArchitecture})`,
        datasetId: targetDatasetId,
        epochs: Number(classificationForm.epochs),
        batchSize: Number(classificationForm.batchSize),
        learningRate: Number(classificationForm.lr),
        device: 'cuda',
        submittedBy: user?.name || 'Staff ML Engineer',
        submittedById: user?.id,
        description: classificationForm.description,
        hyperparameters: {
          template: 'image_classification',
          model_architecture: classificationForm.modelArchitecture,
          backbone: `MobileNetV4 (${classificationForm.modelArchitecture})`,
          run_name: classificationForm.runName || `${classificationForm.modelArchitecture}_Training`,
          epochs: Number(classificationForm.epochs),
          batch_size: Number(classificationForm.batchSize),
          lr: Number(classificationForm.lr),
          optimizer: classificationForm.optimizer,
          weight_decay: Number(classificationForm.weightDecay),
          img_size: Number(classificationForm.imgSize),
          pretrained: classificationForm.pretrained,
          label_smoothing: Number(classificationForm.labelSmoothing),
          early_stopping: classificationForm.earlyStopping,
          early_stopping_patience: Number(classificationForm.earlyStoppingPatience),
          device: 'cuda'
        }
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await loadData();
        setUserFilter('all');
        setSubTab('queue');
        setSubmitView('templates');
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitErrorModal(data.error || 'Failed to submit Image Classification training job to queue');
      }
    } catch (err: any) {
      console.error('Failed to submit Image Classification job:', err);
      setSubmitErrorModal(err.message || 'Network or server error encountered while submitting Image Classification job');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle RF-DETR Instance Segmentation (SAHI) Job Submit
  const handleRfdetrSegSahiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfdetrSegSahiForm.name.trim()) {
      setSubmitErrorModal('Please enter an Experiment / Project Name before submitting.');
      return;
    }
    const targetDatasetId = rfdetrSegSahiForm.datasetId;
    if (!targetDatasetId) {
      setSubmitErrorModal('No target dataset selected! Please select an Instance Segmentation dataset before starting model training.');
      return;
    }

    const targetDataset = datasets.find((d) => d.id === targetDatasetId);
    if (targetDataset) {
      if (targetDataset.domain === 'Image Classification' || targetDataset.format === 'images_folder') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is formatted for Image Classification (${targetDataset.domain || targetDataset.format}). RF-DETR Instance Segmentation requires an Instance Segmentation dataset (COCO format with polygon segmentation masks).`);
        return;
      }
      if (targetDataset.domain === 'Tabular' || targetDataset.format === 'csv') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is a Tabular dataset, which cannot be used for vision instance segmentation.`);
        return;
      }
    }

    if (Number(rfdetrSegSahiForm.sliceCols) < 1 || Number(rfdetrSegSahiForm.sliceRows) < 1) {
      setSubmitErrorModal('Target slices must be at least 1 column and 1 row.');
      return;
    }

    // Validate hyperparameters
    const rfdetrFields = ['epochs', 'batchSize', 'gradAccumSteps', 'lr', 'valInterval', 'saveInterval'];
    if (rfdetrSegSahiForm.earlyStopping) rfdetrFields.push('earlyStoppingPatience');
    for (const f of rfdetrFields) {
      const err = getHyperparamError(f, (rfdetrSegSahiForm as any)[f]);
      if (err) {
        setSubmitErrorModal(`Invalid hyperparameter: ${err}. Please correct it before submitting.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: rfdetrSegSahiForm.name.trim(),
        category: 'vision',
        taskType: `RF-DETR Instance Segmentation (SAHI)`,
        datasetId: targetDatasetId,
        epochs: Number(rfdetrSegSahiForm.epochs),
        batchSize: Number(rfdetrSegSahiForm.batchSize),
        learningRate: Number(rfdetrSegSahiForm.lr),
        device: 'cuda',
        submittedBy: user?.name || 'Staff ML Engineer',
        submittedById: user?.id,
        description: rfdetrSegSahiForm.description,
        hyperparameters: {
          template: 'rfdetr_seg_sahi',
          model_architecture: rfdetrSegSahiForm.segModel,
          run_name: rfdetrSegSahiForm.runName || `${rfdetrSegSahiForm.segModel.replace(/\s+/g, '_')}_Training`,
          epochs: Number(rfdetrSegSahiForm.epochs),
          batch_size: Number(rfdetrSegSahiForm.batchSize),
          grad_accum_steps: Number(rfdetrSegSahiForm.gradAccumSteps),
          lr: Number(rfdetrSegSahiForm.lr),
          device: 'cuda',
          val_interval: Number(rfdetrSegSahiForm.valInterval),
          save_interval: Number(rfdetrSegSahiForm.saveInterval),
          early_stopping: rfdetrSegSahiForm.earlyStopping,
          early_stopping_patience: Number(rfdetrSegSahiForm.earlyStoppingPatience),
          // SAHI Slicing Configuration
          sahi: true,
          sliceCols: Number(rfdetrSegSahiForm.sliceCols),
          sliceRows: Number(rfdetrSegSahiForm.sliceRows),
          overlapType: rfdetrSegSahiForm.overlapType,
          overlapPixelX: Number(rfdetrSegSahiForm.overlapPixelX),
          overlapPixelY: Number(rfdetrSegSahiForm.overlapPixelY),
          overlapRatioX: Number(rfdetrSegSahiForm.overlapRatioX),
          overlapRatioY: Number(rfdetrSegSahiForm.overlapRatioY),
          minBoxSize: Number(rfdetrSegSahiForm.minBoxSize),
        }
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await loadData();
        setUserFilter('all');
        setSubTab('queue');
        setSubmitView('templates');
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitErrorModal(data.error || 'Failed to submit RF-DETR SAHI Segmentation training job to queue');
      }
    } catch (err: any) {
      console.error('Failed to submit RF-DETR SAHI job:', err);
      setSubmitErrorModal(err.message || 'Network or server error encountered while submitting RF-DETR SAHI job');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle RF-DETR Object Detection (SAHI) Job Submit
  const handleRfdetrBboxSahiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfdetrBboxSahiForm.name.trim()) {
      setSubmitErrorModal('Please enter an Experiment / Project Name before submitting.');
      return;
    }
    const targetDatasetId = rfdetrBboxSahiForm.datasetId;
    if (!targetDatasetId) {
      setSubmitErrorModal('No target dataset selected! Please select an Object Detection dataset before starting model training.');
      return;
    }

    const targetDataset = datasets.find((d) => d.id === targetDatasetId);
    if (targetDataset) {
      if (targetDataset.domain === 'Image Classification' || targetDataset.format === 'images_folder') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is formatted for Image Classification (${targetDataset.domain || targetDataset.format}). RF-DETR Object Detection requires a bounding box dataset (COCO format with bbox annotations).`);
        return;
      }
      if (targetDataset.domain === 'Tabular' || targetDataset.format === 'csv') {
        setSubmitErrorModal(`Incompatible Dataset Format: The selected dataset "${targetDataset.name}" is a Tabular dataset, which cannot be used for vision object detection.`);
        return;
      }
    }

    if (Number(rfdetrBboxSahiForm.sliceCols) < 1 || Number(rfdetrBboxSahiForm.sliceRows) < 1) {
      setSubmitErrorModal('Target slices must be at least 1 column and 1 row.');
      return;
    }

    // Validate hyperparameters
    const bboxFields = ['epochs', 'batchSize', 'gradAccumSteps', 'lr', 'valInterval', 'saveInterval'];
    if (rfdetrBboxSahiForm.earlyStopping) bboxFields.push('earlyStoppingPatience');
    for (const f of bboxFields) {
      const err = getHyperparamError(f, (rfdetrBboxSahiForm as any)[f]);
      if (err) {
        setSubmitErrorModal(`Invalid hyperparameter: ${err}. Please correct it before submitting.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: rfdetrBboxSahiForm.name.trim(),
        category: 'vision',
        taskType: `RF-DETR Object Detection (SAHI)`,
        datasetId: targetDatasetId,
        epochs: Number(rfdetrBboxSahiForm.epochs),
        batchSize: Number(rfdetrBboxSahiForm.batchSize),
        learningRate: Number(rfdetrBboxSahiForm.lr),
        device: 'cuda',
        submittedBy: user?.name || 'Staff ML Engineer',
        submittedById: user?.id,
        description: rfdetrBboxSahiForm.description,
        hyperparameters: {
          template: 'rfdetr_bbox_sahi',
          model_architecture: rfdetrBboxSahiForm.bboxModel,
          run_name: rfdetrBboxSahiForm.runName || `${rfdetrBboxSahiForm.bboxModel.replace(/\s+/g, '_')}_Training`,
          epochs: Number(rfdetrBboxSahiForm.epochs),
          batch_size: Number(rfdetrBboxSahiForm.batchSize),
          grad_accum_steps: Number(rfdetrBboxSahiForm.gradAccumSteps),
          lr: Number(rfdetrBboxSahiForm.lr),
          device: 'cuda',
          val_interval: Number(rfdetrBboxSahiForm.valInterval),
          save_interval: Number(rfdetrBboxSahiForm.saveInterval),
          early_stopping: rfdetrBboxSahiForm.earlyStopping,
          early_stopping_patience: Number(rfdetrBboxSahiForm.earlyStoppingPatience),
          // SAHI Slicing Configuration
          sahi: true,
          sliceCols: Number(rfdetrBboxSahiForm.sliceCols),
          sliceRows: Number(rfdetrBboxSahiForm.sliceRows),
          overlapType: rfdetrBboxSahiForm.overlapType,
          overlapPixelX: Number(rfdetrBboxSahiForm.overlapPixelX),
          overlapPixelY: Number(rfdetrBboxSahiForm.overlapPixelY),
          overlapRatioX: Number(rfdetrBboxSahiForm.overlapRatioX),
          overlapRatioY: Number(rfdetrBboxSahiForm.overlapRatioY),
          minBoxSize: Number(rfdetrBboxSahiForm.minBoxSize),
        }
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await loadData();
        setUserFilter('all');
        setSubTab('queue');
        setSubmitView('templates');
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitErrorModal(data.error || 'Failed to submit RF-DETR SAHI BBox job to queue');
      }
    } catch (err: any) {
      console.error('Failed to submit RF-DETR SAHI BBox job:', err);
      setSubmitErrorModal(err.message || 'Network or server error encountered while submitting RF-DETR SAHI BBox job');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if current user is the one who submitted the training job (or Admin, or if submitter no longer exists)
  const canManageJob = (job: TrainingJob) => {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    if (job.submittedById && user.id && job.submittedById === user.id) {
      return true;
    }
    if (job.submittedBy && user.name && job.submittedBy.trim().toLowerCase() === user.name.trim().toLowerCase()) {
      return true;
    }
    // If the original submitter no longer exists among registered accounts, any existing authenticated user can manage/cancel/delete
    const submitterExists = registeredUsersList.some(
      (u) =>
        (job.submittedById && u.id === job.submittedById) ||
        (job.submittedBy && u.name && u.name.trim().toLowerCase() === job.submittedBy.trim().toLowerCase())
    );
    if (!submitterExists) {
      return true;
    }
    return false;
  };

  // Handle Job Actions: Pause, Resume, Stop, Cancel
  const handleJobAction = async (id: string, action: 'pause' | 'resume' | 'stop' | 'cancel') => {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          requestedBy: user?.name,
          requestedById: user?.id,
          userRole: user?.role
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
        if (selectedJob?.id === id) setSelectedJob(updated);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Permission denied: only the user who submitted this job can cancel it.');
      }
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  // Clear all cancelled and failed jobs from queue (accessible by any user)
  const handleClearFailedJobs = async () => {
    setIsClearingJobs(true);
    try {
      const res = await fetch('/api/jobs', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.remaining);
        if (selectedJob && (selectedJob.status === 'failed' || selectedJob.status === 'cancelled')) {
          setSelectedJob(data.remaining[0] || null);
        }
      }
    } catch (err) {
      console.error('Failed to clear failed and cancelled jobs:', err);
    } finally {
      setIsClearingJobs(false);
    }
  };

  // Handle user selecting or dropping any file
  const handleFileSelect = (file: File) => {
    // Automatically sanitize filename: replace spaces and unsafe characters with underscores
    const safeFileName = file.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeFile = new File([file], safeFileName, { type: file.type });
    setUploadFile(safeFile);

    const ext = safeFileName.split('.').pop()?.toLowerCase();
    const cleanBaseName = safeFileName.replace(/\.[^/.]+$/, '').replace(/_+/g, '_');
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls' || ext === 'tsv' || ext === 'parquet') {
      setDatasetForm((prev) => ({
        ...prev,
        domain: 'Tabular',
        category: 'tabular',
        name: prev.name || cleanBaseName
      }));
    } else {
      setDatasetForm((prev) => ({
        ...prev,
        name: prev.name || cleanBaseName
      }));
    }
  };

  // Handle Dataset Upload (Roboflow Snippet or Archive)
  const handleDatasetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    setUploadError('');

    const optimisticId = `temp-upload-${Date.now()}`;
    const rawName = datasetForm.name.trim() || (uploadFile ? uploadFile.name.replace(/\.[^/.]+$/, '') : (datasetUploadMode === 'roboflow' ? 'Roboflow Dataset' : 'Custom Dataset'));
    const datasetName = rawName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    const userName = user?.name || 'Staff ML Engineer';

    // Add optimistic dataset block to Catalogued Datasets list immediately
    const optimisticDataset: Dataset = {
      id: optimisticId,
      name: datasetName,
      category: datasetForm.category || 'vision',
      domain: datasetForm.domain,
      description: datasetForm.description.trim() || (datasetUploadMode === 'roboflow' ? 'Importing dataset from Roboflow...' : 'Uploading dataset archive to host storage...'),
      format: datasetUploadMode === 'roboflow' ? 'coco' : (datasetForm.domain === 'Tabular' ? 'csv' : 'yolo'),
      fileSizeMB: uploadFile ? Math.round((uploadFile.size / (1024 * 1024)) * 10) / 10 : 0,
      sampleCount: 0,
      uploadedBy: userName,
      uploadedAt: new Date().toISOString(),
      isUploading: true,
      uploadProgress: datasetUploadMode === 'roboflow' ? 30 : 0,
      uploadStatusText: datasetUploadMode === 'roboflow' ? 'Connecting to Roboflow & downloading dataset...' : 'Uploading dataset archive to server...'
    };

    setDatasets((prev) => [optimisticDataset, ...prev]);

    try {
      if (datasetUploadMode === 'roboflow') {
        if (!roboflowSnippet.trim()) {
          setUploadError('Please paste your Roboflow Python code snippet.');
          setIsUploading(false);
          setDatasets((prev) => prev.filter((d) => d.id !== optimisticId));
          return;
        }

        const res = await fetch('/api/datasets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roboflowSnippet: roboflowSnippet.trim(),
            name: datasetName,
            domain: datasetForm.domain,
            description: datasetForm.description.trim(),
            uploadedBy: userName
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to download dataset from Roboflow');
        }

        setDatasets((prev) => [data, ...prev.filter((d) => d.id !== optimisticId)]);
        await loadData();
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 4000);
        setDatasetForm({ name: '', category: 'vision', domain: 'Instance Segmentation / Object Detection', description: '' });
      } else {
        if (!uploadFile) {
          setUploadError('Please select a dataset file (.zip or folder archive) to upload.');
          setIsUploading(false);
          setDatasets((prev) => prev.filter((d) => d.id !== optimisticId));
          return;
        }

        const CHUNK_SIZE = 25 * 1024 * 1024; // 25 MB chunks (bypasses Cloudflare 100MB per-request limit)
        const totalSize = uploadFile.size;
        const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        const uploadSessionId = `up-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const safeFileName = (uploadFile.name || 'dataset.zip').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
        const totalMb = (totalSize / (1024 * 1024)).toFixed(1);

        let finalDataset: Dataset | null = null;

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          const start = chunkIdx * CHUNK_SIZE;
          const end = Math.min(totalSize, start + CHUNK_SIZE);
          const chunkBlob = uploadFile.slice(start, end);

          const chunkFormData = new FormData();
          chunkFormData.append('uploadId', uploadSessionId);
          chunkFormData.append('chunkIndex', chunkIdx.toString());
          chunkFormData.append('totalChunks', totalChunks.toString());
          chunkFormData.append('fileName', safeFileName);
          chunkFormData.append('name', datasetName);
          chunkFormData.append('category', datasetForm.category);
          chunkFormData.append('domain', datasetForm.domain);
          chunkFormData.append('description', datasetForm.description);
          chunkFormData.append('uploadedBy', userName);
          chunkFormData.append('chunk', chunkBlob, `part_${chunkIdx}.bin`);

          const chunkRes = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/datasets/chunk');

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const currentChunkBytes = event.loaded;
                const totalBytesUploadedSoFar = start + currentChunkBytes;
                const percent = Math.min(99, Math.round((totalBytesUploadedSoFar / totalSize) * 100));
                const loadedMb = (totalBytesUploadedSoFar / (1024 * 1024)).toFixed(1);
                setDatasets((prev) =>
                  prev.map((d) =>
                    d.id === optimisticId
                      ? {
                          ...d,
                          uploadProgress: percent,
                          uploadStatusText: totalChunks > 1
                            ? `Uploading: ${percent}% (${loadedMb}MB / ${totalMb}MB • Part ${chunkIdx + 1}/${totalChunks})`
                            : `Uploading: ${percent}% (${loadedMb}MB / ${totalMb}MB)`
                        }
                      : d
                  )
                );
              }
            };

            xhr.upload.onload = () => {
              if (chunkIdx === totalChunks - 1) {
                setDatasets((prev) =>
                  prev.map((d) =>
                    d.id === optimisticId
                      ? {
                          ...d,
                          uploadProgress: 100,
                          uploadStatusText: `Upload complete (${totalMb}MB) • Inspecting & cataloging dataset on server...`
                        }
                      : d
                  )
                );
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText);
                  resolve(data);
                } catch {
                  reject(new Error('Invalid response from server'));
                }
              } else {
                let errMsg = `Chunk ${chunkIdx + 1} upload failed`;
                try {
                  const errJson = JSON.parse(xhr.responseText);
                  errMsg = errJson.error || errMsg;
                } catch {}
                reject(new Error(errMsg));
              }
            };

            xhr.onerror = () => {
              reject(new Error(`Network error uploading chunk ${chunkIdx + 1}/${totalChunks}`));
            };

            xhr.onabort = () => {
              reject(new Error('Upload canceled'));
            };

            xhr.send(chunkFormData);
          });

          if (chunkRes && chunkRes.completed && chunkRes.dataset) {
            finalDataset = chunkRes.dataset;
          }
        }

        if (finalDataset) {
          setDatasets((prev) => [finalDataset!, ...prev.filter((d) => d.id !== optimisticId)]);
        }

        await loadData();
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 4000);
        setDatasetForm({ name: '', category: 'vision', domain: 'Instance Segmentation / Object Detection', description: '' });
        setUploadFile(null);
      }
    } catch (err: any) {
      console.error('Dataset upload error:', err);
      setUploadError(err.message || 'Dataset upload failed.');
      setDatasets((prev) => prev.filter((d) => d.id !== optimisticId));
    } finally {
      setIsUploading(false);
    }
  };

  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);

  const handleDeleteDataset = async (datasetId: string, datasetName: string) => {
    if (!confirm(`Are you sure you want to delete dataset "${datasetName}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingDatasetId(datasetId);
    try {
      const res = await fetch(`/api/datasets?id=${encodeURIComponent(datasetId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDatasets((prev) => prev.filter((d) => d.id !== datasetId));
        if (rfdetrForm.datasetId === datasetId) {
          setRfdetrForm((prev) => ({ ...prev, datasetId: '' }));
        }
        if (rfdetrBboxForm.datasetId === datasetId) {
          setRfdetrBboxForm((prev) => ({ ...prev, datasetId: '' }));
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete dataset');
      }
    } catch (err) {
      console.error('Error deleting dataset:', err);
      alert('Failed to delete dataset');
    } finally {
      setDeletingDatasetId(null);
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Sub-navigation Pills & User Account Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Model Training Studio
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          {/* User Account Filter Dropdown */}
          <div className="flex items-center gap-2 bg-white rounded-2xl sm:rounded-full px-3.5 py-1.5 border border-slate-200 shadow-sm text-xs w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold text-slate-600 whitespace-nowrap">Filter User:</span>
            </div>
            <select
              value={userFilter}
              onChange={(e) => {
                const val = e.target.value;
                setUserFilter(val);
                const filteredCompleted = jobs.filter(
                  (j) => j.status === 'completed' && (val === 'all' || j.submittedBy === val)
                );
                setSelectedResultJob(filteredCompleted[0] || null);
              }}
              className="bg-transparent font-extrabold text-slate-800 outline-none cursor-pointer pr-1 text-xs"
            >
              <option value="all">All Accounts ({allUserAccounts.length})</option>
              {allUserAccounts.map((accountName) => (
                <option key={accountName} value={accountName}>
                  {accountName} {accountName === user?.name ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-tabs switch */}
          <div className="flex items-center bg-white rounded-2xl sm:rounded-full p-1 border border-slate-200 shadow-sm overflow-x-auto no-scrollbar gap-1 w-full sm:w-auto">
          <button
            onClick={() => setSubTab('queue')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
              subTab === 'queue'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Job Queue ({displayedJobs.length})</span>
          </button>
          <button
            onClick={() => {
              setSubTab('submit');
              setSubmitView('templates');
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
              subTab === 'submit'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Job</span>
          </button>
          <button
            onClick={() => setSubTab('datasets')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
              subTab === 'datasets'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Datasets & Guide ({displayedDatasets.length})</span>
          </button>
          <button
            onClick={() => {
              setSubTab('results');
              const comp = jobs.filter((j) => j.status === 'completed' && (userFilter === 'all' || j.submittedBy === userFilter));
              if (comp.length > 0 && !selectedResultJob) {
                setSelectedResultJob(comp[0]);
              }
            }}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
              subTab === 'results'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Training Results ({completedRuns.length})</span>
          </button>
        </div>
      </div>
    </div>

      {/* SUB-TAB 1: JOB QUEUE & LIVE MONITOR */}
      {subTab === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Job List (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-slate-500 px-1 gap-2">
              <span>All Training Runs {userFilter !== 'all' ? `(Filtered by: ${userFilter})` : ''}</span>
              <div className="flex items-center gap-2.5">
                {jobs.some((j) => (userFilter === 'all' || j.submittedBy === userFilter) && (j.status === 'failed' || j.status === 'cancelled')) && (
                  <button
                    onClick={handleClearFailedJobs}
                    disabled={isClearingJobs}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                    title="Clear all cancelled and failed jobs from the queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {isClearingJobs
                        ? 'Clearing...'
                        : `Clear Failed (${jobs.filter((j) => (userFilter === 'all' || j.submittedBy === userFilter) && (j.status === 'failed' || j.status === 'cancelled')).length})`}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setSubTab('submit');
                    setSubmitView('templates');
                  }}
                  className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>+ Submit New Job</span>
                </button>
              </div>
            </div>

            {/* Queue Filter Tags & Status Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setQueueFilter('all')}
                className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
                  queueFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All ({jobs.filter((j) => userFilter === 'all' || j.submittedBy === userFilter).length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('ongoing')}
                className={`px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  queueFilter === 'ongoing'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Ongoing ({jobs.filter((j) => (userFilter === 'all' || j.submittedBy === userFilter) && j.status === 'running').length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('queued')}
                className={`px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  queueFilter === 'queued'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="w-3 h-3 text-amber-700" />
                Queued ({jobs.filter((j) => (userFilter === 'all' || j.submittedBy === userFilter) && j.status === 'queued').length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('completed')}
                className={`px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  queueFilter === 'completed'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                Completed ({jobs.filter((j) => (userFilter === 'all' || j.submittedBy === userFilter) && j.status === 'completed').length})
              </button>
            </div>

            {displayedJobs.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200">
                <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-700">No Training Jobs Found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {userFilter !== 'all'
                    ? `No jobs found submitted by "${userFilter}".`
                    : 'Select a template to start training.'}
                </p>
                {userFilter !== 'all' ? (
                  <button
                    onClick={() => setUserFilter('all')}
                    className="mt-4 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                  >
                    Show All Users
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSubTab('submit');
                      setSubmitView('templates');
                    }}
                    className="mt-4 px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    Choose Template
                  </button>
                )}
              </div>
            ) : (
              displayedJobs.slice(0, 5).map((job) => {
                const isSelected = selectedJob?.id === job.id;
                const isRunning = job.status === 'running';
                const isCompleted = job.status === 'completed';
                const isPaused = job.status === 'paused';
                const isFailed = job.status === 'failed';

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`bg-white rounded-3xl p-5 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 shadow-md ring-2 ring-blue-500/10'
                        : 'border-slate-100 hover:border-slate-200 shadow-sm hover:shadow'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isRunning
                                ? 'bg-blue-600 animate-pulse'
                                : isCompleted
                                ? 'bg-emerald-500'
                                : isPaused
                                ? 'bg-amber-500'
                                : isFailed
                                ? 'bg-rose-500'
                                : 'bg-slate-300'
                            }`}
                          ></span>
                          <h4 className="font-bold text-sm sm:text-base text-slate-900">{job.name}</h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full mr-1.5">
                            {job.taskType}
                          </span>
                          Dataset: <span className="font-semibold text-slate-700">{job.datasetName}</span>
                        </p>
                      </div>

                      {job.stage === 'unzipping' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black uppercase tracking-wider shadow-xs animate-pulse">
                          <FolderArchive className="w-3.5 h-3.5 text-amber-700 animate-bounce" />
                          Unzipping Dataset...
                        </span>
                      ) : job.stage === 'generating_results' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-black uppercase tracking-wider shadow-xs animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 text-indigo-700 animate-spin" />
                          Generating Results...
                        </span>
                      ) : isRunning ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-black uppercase tracking-wider shadow-xs">
                          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                          Ongoing
                        </span>
                      ) : job.status === 'queued' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black uppercase tracking-wider">
                          <Clock className="w-3 h-3 text-amber-700" />
                          Queued
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Completed
                        </span>
                      ) : isPaused ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black uppercase tracking-wider">
                          Paused
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-black uppercase tracking-wider">
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-black uppercase tracking-wider">
                          Cancelled
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {job.stage === 'unzipping' ? (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                          <span className="text-amber-800 font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                            Unzipping dataset to host storage before training starts...
                          </span>
                          <span className="text-amber-800 font-black uppercase text-[10px] tracking-wider bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                            Extracting Zip
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-amber-100 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500 w-full animate-pulse"></div>
                        </div>
                      </div>
                    ) : job.stage === 'generating_results' ? (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                          <span className="text-indigo-800 font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                            Epoch {job.currentEpoch}/{job.totalEpochs}
                            {(job.earlyStopped || (job.currentEpoch > 0 && job.currentEpoch < job.totalEpochs)) ? ' - Early Stopping' : ''} - Generating training results
                          </span>
                          <span className="text-indigo-800 font-black uppercase text-[10px] tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 animate-pulse">
                            Finalizing
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-indigo-100 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-600 w-full animate-pulse"></div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-500 font-medium">
                            Epoch {job.currentEpoch}/{job.totalEpochs}
                            {(isCompleted && (job.earlyStopped || (job.currentEpoch > 0 && job.currentEpoch < job.totalEpochs))) ? (
                              <span className="text-amber-600 font-bold ml-1.5">- Early Stopping</span>
                            ) : null}
                          </span>
                          <span className="text-slate-800 font-bold">{job.progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            style={{ width: `${job.progressPercent}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${
                              isRunning
                                ? 'bg-blue-600'
                                : isCompleted
                                ? 'bg-emerald-500'
                                : 'bg-slate-400'
                            }`}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Footer Controls & Stats */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3 text-slate-500">
                          <span>LR: <strong className="text-slate-700">{job.learningRate}</strong></span>
                          <span>By: <strong className="text-slate-700">{job.submittedBy}</strong></span>
                        </div>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {canManageJob(job) ? (
                          <>
                            {job.status === 'queued' && (
                              <button
                                onClick={() => handleJobAction(job.id, 'pause')}
                                className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                                title="Pause queued job (will skip to next job in queue)"
                              >
                                <Pause className="w-3 h-3" /> Pause Queue
                              </button>
                            )}
                            {isPaused && (
                              <button
                                onClick={() => handleJobAction(job.id, 'resume')}
                                className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                                title="Resume job in queue"
                              >
                                <Play className="w-3 h-3" /> Resume Queue
                              </button>
                            )}
                            {(isRunning || isPaused || job.status === 'queued') && (
                              <button
                                onClick={() => handleJobAction(job.id, 'cancel')}
                                className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                                title="Cancel training job"
                              >
                                <XCircle className="w-3 h-3 text-rose-600" /> Cancel
                              </button>
                            )}
                          </>
                        ) : (
                          (isRunning || isPaused || job.status === 'queued') && (
                            <span
                              className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full cursor-not-allowed select-none"
                              title={`Only ${job.submittedBy} can cancel this job`}
                            >
                              Submitted by {job.submittedBy}
                            </span>
                          )
                        )}
                        {isCompleted && (
                          <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Checkpoint Ready
                          </span>
                        )}
                        {isFailed && (
                          <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> Cancelled
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* See All Jobs Button */}
            {displayedJobs.length > 0 && (
              <div className="flex items-center justify-between pt-2 px-1">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {Math.min(5, displayedJobs.length)} of {displayedJobs.length} queued / active jobs
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllJobsModal(true);
                    setAllJobsPage(1);
                  }}
                  className="px-4 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>See All ({displayedJobs.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right Inspector: Live Loss & Metrics Curve + Console Logs (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {selectedJob ? (
              <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-5 lg:sticky lg:top-24">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Live Telemetry Inspector
                    </span>
                    <h3 className="font-extrabold text-lg text-slate-900 leading-tight">
                      {selectedJob.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-blue-600 font-bold">{selectedJob.taskType}</p>
                      {selectedJob.stage === 'unzipping' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          <FolderArchive className="w-3 h-3 text-amber-700 animate-bounce" />
                          Unzipping Dataset
                        </span>
                      ) : selectedJob.stage === 'generating_results' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          <Loader2 className="w-3 h-3 text-indigo-700 animate-spin" />
                          Generating Results
                        </span>
                      ) : selectedJob.status === 'running' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                          Ongoing
                        </span>
                      ) : selectedJob.status === 'queued' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                          Queued
                        </span>
                      ) : selectedJob.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                          Completed
                        </span>
                      ) : selectedJob.status === 'paused' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                          Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider">
                          {selectedJob.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(selectedJob.status === 'running' || selectedJob.status === 'paused' || selectedJob.status === 'queued') && (
                      canManageJob(selectedJob) ? (
                        <button
                          onClick={() => handleJobAction(selectedJob.id, 'cancel')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
                          title="Cancel ongoing training"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel Training</span>
                        </button>
                      ) : (
                        <span
                          className="text-[11px] font-medium text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full select-none"
                          title={`Only ${selectedJob.submittedBy} can cancel this job`}
                        >
                          Submitted by {selectedJob.submittedBy}
                        </span>
                      )
                    )}
                    {selectedJob.checkpointPath && (
                      <a
                        href={selectedJob.checkpointPath}
                        download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Weights (.pt)</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Terminal Console Logs */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-slate-500" />
                      Terminal Console Stream
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {selectedJob.logs?.length || 0} lines captured
                    </span>
                  </div>
                  <div className="bg-white rounded-2xl p-3 text-[11px] font-mono text-black-400 h-52 overflow-y-auto space-y-1 shadow-inner">
                    {selectedJob.logs && selectedJob.logs.map((line, idx) => (
                      <div key={idx} className="leading-relaxed whitespace-pre-wrap">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-sm text-slate-600">Select a Job from Queue</p>
                <p className="text-xs mt-1">Click on any job to view live terminal.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SUBMIT JOB */}
      {subTab === 'submit' && (
        <>
          {/* VIEW A: TEMPLATE BLOCKS SELECTION */}
          {submitView === 'templates' && (
            <div className="space-y-6">
              <div className="text-center max-w-2xl mx-auto py-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                  Choose a Training Template
                </h2>
              </div>

              {/* Template Blocks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                
                {/* 1. Instance Segmentation (Primary Focus) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-blue-500/80 hover:shadow-xl hover:border-blue-600 transition-all flex flex-col justify-between relative group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-105 transition-transform">
                      <Scissors className="w-6 h-6" />
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900">Instance Segmentation</h3>

                    <div className="mt-5 space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Model Architecture:</span>
                        <strong className="text-blue-700">RFDETRSeg</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Variants:</span>
                        <strong className="text-slate-800">Nano, Small, Med, Large, Preview</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setSubmitView('segmentation')}
                      className="w-full py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 group-hover:translate-x-0.5 cursor-pointer"
                    >
                      <span>Choose template</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. Object Detection (RF-DETR BBox Active Template) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-emerald-500/80 hover:shadow-xl hover:border-emerald-600 transition-all flex flex-col justify-between relative group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-105 transition-transform">
                      <Crosshair className="w-6 h-6" />
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900">Object Detection</h3>

                    <div className="mt-5 space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Model Architecture:</span>
                        <strong className="text-emerald-700">RFDETR BBox</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Variants:</span>
                        <strong className="text-slate-800">Nano, Small, Med, Base, Large</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setSubmitView('detection')}
                      className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 group-hover:translate-x-0.5 cursor-pointer"
                    >
                      <span>Choose template</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 3. Image Classification (MobileNetV4 via timm Active Template) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-indigo-500/80 hover:shadow-xl hover:border-indigo-600 transition-all flex flex-col justify-between relative group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-105 transition-transform">
                      <Cpu className="w-6 h-6" />
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900">Image Classification</h3>

                    <div className="mt-5 space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Model Architecture:</span>
                        <strong className="text-indigo-700">MobileNetV4</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Variants:</span>
                        <strong className="text-slate-800">Small, Med, Large, Hybrid</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setSubmitView('classification')}
                      className="w-full py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 group-hover:translate-x-0.5 cursor-pointer"
                    >
                      <span>Choose template</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 4. RF-DETR Instance Segmentation (SAHI) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-purple-500/80 hover:shadow-xl hover:border-purple-600 transition-all flex flex-col justify-between relative group">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform">
                        <Scissors className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                        SAHI Slicing
                      </span>
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900">Instance Segmentation</h3>

                    <div className="mt-4 space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Model Architecture:</span>
                        <strong className="text-purple-700">RFDETRSeg</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Variants:</span>
                        <strong className="text-slate-800">Nano, Small, Med, Large, Preview</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setSubmitView('segmentation_sahi')}
                      className="w-full py-3 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 group-hover:translate-x-0.5 cursor-pointer"
                    >
                      <span>Choose template</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 5. RF-DETR Object Detection (SAHI) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-amber-500/80 hover:shadow-xl hover:border-amber-600 transition-all flex flex-col justify-between relative group">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                        <Crosshair className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                        SAHI Slicing
                      </span>
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900">Object Detection</h3>

                    <div className="mt-4 space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Model Architecture:</span>
                        <strong className="text-amber-700">RFDETR BBox</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="text-slate-400 font-medium">Variants:</span>
                        <strong className="text-slate-800">Nano, Small, Med, Base, Large</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setSubmitView('detection_sahi')}
                      className="w-full py-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 group-hover:translate-x-0.5 cursor-pointer"
                    >
                      <span>Choose template</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* VIEW B: IMAGE SEGMENTATION (RF-DETR) PAGE */}
          {submitView === 'segmentation' && (
            <div className="w-full space-y-6">
              {/* Top Navigation Bar: Back Button on Left Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <button
                  onClick={() => setSubmitView('templates')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all self-start"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500" />
                  <span>Back to Templates</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Template:</span>
                  <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    Instance Segmentation
                  </span>
                </div>
              </div>

              {/* Form Title & Subtitle */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Configure RF-DETR Instance Segmentation
                </h2>
              </div>

              <form onSubmit={handleRfdetrSubmit} className="space-y-6">
                {/* SECTION 1: EXPERIMENT & DATASET SELECTION */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Scissors className="w-4 h-4 text-blue-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      1. Experiment & Model Architecture Selection
                    </h3>
                  </div>

                  {/* Experiment Name, Run Name, Model Architecture & Dataset */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Experiment / Project Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Bottle"
                        value={rfdetrForm.name}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Run Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. RFDETRSegSmall_Training"
                        value={rfdetrForm.runName}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, runName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model Architecture *
                      </label>
                      <select
                        value={rfdetrForm.segModel}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, segModel: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="RFDETRSegNano">RFDETRSegNano</option>
                        <option value="RFDETRSegSmall">RFDETRSegSmall</option>
                        <option value="RFDETRSegMedium">RFDETRSegMedium</option>
                        <option value="RFDETRSegLarge">RFDETRSegLarge</option>
                        <option value="RFDETRSegPreview">RFDETRSegPreview</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Target Dataset *
                        </label>
                        <button
                          type="button"
                          onClick={() => openTargetDatasetPicker('rfdetr_seg')}
                          className="text-[11px] text-blue-600 hover:text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Browse</span>
                        </button>
                      </div>

                      {(() => {
                        const currentDs = datasets.find((d) => d.id === rfdetrForm.datasetId);
                        const isIncompatible = currentDs && (currentDs.domain === 'Image Classification' || currentDs.format === 'images_folder' || currentDs.domain === 'Tabular' || currentDs.format === 'csv');

                        if (!currentDs) {
                          return (
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_seg')}
                              className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700 flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                Select a dataset...
                              </span>
                              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">Choose</span>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_seg')}
                              className="p-2.5 sm:p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-blue-100/70 text-blue-700 shrink-0">
                                  <FolderOpen className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-blue-700 truncate">{currentDs.name}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                      {currentDs.domain || currentDs.format}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                    {currentDs.sampleCount.toLocaleString()} samples • {currentDs.fileSizeMB} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTargetDatasetPicker('rfdetr_seg');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-blue-600 text-slate-700 group-hover:text-white border border-slate-200 group-hover:border-transparent text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                Change
                              </button>
                            </div>

                            {isIncompatible && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Format Incompatible: {currentDs.name} is formatted for {currentDs.domain || currentDs.format}. RF-DETR requires Instance Segmentation annotations.</span>
                              </div>
                            )}

                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: OFFICIAL TRAINING HYPERPARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-blue-600" />
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        2. Training Hyperparameters
                      </h3>
                    </div>
 
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Epochs */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Epochs (<code className="text-blue-600 font-mono">epochs</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={rfdetrForm.epochs}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, epochs: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('epochs', rfdetrForm.epochs)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('epochs', rfdetrForm.epochs) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('epochs', rfdetrForm.epochs)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Total training epochs (Default: 100)</span>
                      )}
                    </div>

                    {/* Batch Size */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Batch Size (<code className="text-blue-600 font-mono">batch_size</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={rfdetrForm.batchSize}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, batchSize: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('batchSize', rfdetrForm.batchSize)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('batchSize', rfdetrForm.batchSize) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('batchSize', rfdetrForm.batchSize)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Per-GPU batch size (Default: 4)</span>
                      )}
                    </div>

                    {/* Gradient Accumulation Steps */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Grad Accum (<code className="text-blue-600 font-mono">grad_accum_steps</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={rfdetrForm.gradAccumSteps}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, gradAccumSteps: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('gradAccumSteps', rfdetrForm.gradAccumSteps)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('gradAccumSteps', rfdetrForm.gradAccumSteps) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('gradAccumSteps', rfdetrForm.gradAccumSteps)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Accumulation steps (Default: 4)</span>
                      )}
                    </div>

                    {/* Learning Rate */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Learning Rate (<code className="text-blue-600 font-mono">lr</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={rfdetrForm.lr}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, lr: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('lr', rfdetrForm.lr)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('lr', rfdetrForm.lr) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('lr', rfdetrForm.lr)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Base optimizer rate (Default: 1e-4)</span>
                      )}
                    </div>

                    {/* Validation Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Validation Interval (<code className="text-blue-600 font-mono">val_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrForm.valInterval}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, valInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('valInterval', rfdetrForm.valInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('valInterval', rfdetrForm.valInterval) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('valInterval', rfdetrForm.valInterval)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Evaluate validation set every N epochs</span>
                      )}
                    </div>

                    {/* Save Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Save Interval (<code className="text-blue-600 font-mono">save_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrForm.saveInterval}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, saveInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('saveInterval', rfdetrForm.saveInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('saveInterval', rfdetrForm.saveInterval) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('saveInterval', rfdetrForm.saveInterval)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Save checkpoint every N epochs</span>
                      )}
                    </div>
                  </div>

                  {/* Early Stopping & Patience Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={rfdetrForm.earlyStopping}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, earlyStopping: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Early Stopping (<code className="text-blue-600 font-mono">early_stopping</code>)</span>
                        <span className="text-[10px] text-slate-400">Halt training when validation mAP stops improving</span>
                      </div>
                    </label>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Patience (<code className="text-blue-600 font-mono">early_stopping_patience</code>)
                        </label>
                        <span className="text-[10px] text-slate-400">Epochs to wait before early stop</span>
                        {rfdetrForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrForm.earlyStoppingPatience) && (
                          <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{getHyperparamError('earlyStoppingPatience', rfdetrForm.earlyStoppingPatience)}</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrForm.earlyStoppingPatience}
                        onChange={(e) => setRfdetrForm({ ...rfdetrForm, earlyStoppingPatience: e.target.value })}
                        className={`w-20 px-3 py-1.5 rounded-xl border text-xs font-bold bg-white text-center transition-all ${
                          rfdetrForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrForm.earlyStoppingPatience)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                        }`}
                        disabled={!rfdetrForm.earlyStopping}
                      />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION BAR: Submit Job button positioned at the bottom right */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSubmitView('templates')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>

                  {/* Submit job button at bottom right (solid color, no gradient) */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02]"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit Job'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* VIEW C: OBJECT DETECTION (RF-DETR BBOX) PAGE */}
          {submitView === 'detection' && (
            <div className="w-full space-y-6">
              {/* Top Navigation Bar: Back Button on Left Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <button
                  onClick={() => setSubmitView('templates')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all self-start cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500" />
                  <span>Back to Templates</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Template:</span>
                  <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Object Detection
                  </span>
                </div>
              </div>

              {/* Form Title & Subtitle */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Configure RF-DETR Object Detection
                </h2>
              </div>

              <form onSubmit={handleRfdetrBboxSubmit} className="space-y-6">
                {/* SECTION 1: EXPERIMENT & DATASET SELECTION */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Crosshair className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      1. Experiment & Model Architecture Selection
                    </h3>
                  </div>

                  {/* Experiment Name, Run Name, Model Architecture & Dataset */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Experiment / Project Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Bottle BBox"
                        value={rfdetrBboxForm.name}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Run Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. RFDETRSmall_BBox_Training"
                        value={rfdetrBboxForm.runName}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, runName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model Architecture *
                      </label>
                      <select
                        value={rfdetrBboxForm.bboxModel}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, bboxModel: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="RFDETRNano">RFDETRNano</option>
                        <option value="RFDETRSmall">RFDETRSmall</option>
                        <option value="RFDETRMedium">RFDETRMedium</option>
                        <option value="RFDETRBase">RFDETRBase</option>
                        <option value="RFDETRLarge">RFDETRLarge</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Target Dataset *
                        </label>
                        <button
                          type="button"
                          onClick={() => openTargetDatasetPicker('rfdetr_bbox')}
                          className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Browse</span>
                        </button>
                      </div>

                      {(() => {
                        const currentDs = datasets.find((d) => d.id === rfdetrBboxForm.datasetId);
                        const isIncompatible = currentDs && (currentDs.domain === 'Image Classification' || currentDs.format === 'images_folder' || currentDs.domain === 'Tabular' || currentDs.format === 'csv');

                        if (!currentDs) {
                          return (
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_bbox')}
                              className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/20 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700 flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                Select a dataset...
                              </span>
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">Choose</span>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_bbox')}
                              className="p-2.5 sm:p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/20 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-emerald-100/70 text-emerald-700 shrink-0">
                                  <FolderOpen className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 truncate">{currentDs.name}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                      {currentDs.domain || currentDs.format}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                    {currentDs.sampleCount.toLocaleString()} samples • {currentDs.fileSizeMB} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTargetDatasetPicker('rfdetr_bbox');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-emerald-600 text-slate-700 group-hover:text-white border border-slate-200 group-hover:border-transparent text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                Change
                              </button>
                            </div>

                            {isIncompatible && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Format Incompatible: {currentDs.name} is formatted for {currentDs.domain || currentDs.format}. RF-DETR Object Detection requires bounding box annotations.</span>
                              </div>
                            )}

                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: OFFICIAL TRAINING HYPERPARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-600" />
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        2. Training Hyperparameters
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Epochs */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Epochs (<code className="text-emerald-600 font-mono">epochs</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={rfdetrBboxForm.epochs}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, epochs: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('epochs', rfdetrBboxForm.epochs)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('epochs', rfdetrBboxForm.epochs) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('epochs', rfdetrBboxForm.epochs)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Total training epochs (Default: 100)</span>
                      )}
                    </div>

                    {/* Batch Size */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Batch Size (<code className="text-emerald-600 font-mono">batch_size</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={rfdetrBboxForm.batchSize}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, batchSize: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('batchSize', rfdetrBboxForm.batchSize)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('batchSize', rfdetrBboxForm.batchSize) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('batchSize', rfdetrBboxForm.batchSize)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Per-GPU batch size (Default: 4)</span>
                      )}
                    </div>

                    {/* Gradient Accumulation Steps */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Grad Accum (<code className="text-emerald-600 font-mono">grad_accum_steps</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={rfdetrBboxForm.gradAccumSteps}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, gradAccumSteps: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('gradAccumSteps', rfdetrBboxForm.gradAccumSteps)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('gradAccumSteps', rfdetrBboxForm.gradAccumSteps) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('gradAccumSteps', rfdetrBboxForm.gradAccumSteps)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Accumulation steps (Default: 4)</span>
                      )}
                    </div>

                    {/* Learning Rate (with step="any" to prevent browser rounding error) */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Learning Rate (<code className="text-emerald-600 font-mono">lr</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={rfdetrBboxForm.lr}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, lr: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('lr', rfdetrBboxForm.lr)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('lr', rfdetrBboxForm.lr) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('lr', rfdetrBboxForm.lr)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Base optimizer rate (Default: 1e-4)</span>
                      )}
                    </div>

                    {/* Validation Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Validation Interval (<code className="text-emerald-600 font-mono">val_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrBboxForm.valInterval}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, valInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('valInterval', rfdetrBboxForm.valInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('valInterval', rfdetrBboxForm.valInterval) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('valInterval', rfdetrBboxForm.valInterval)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Evaluate validation set every N epochs</span>
                      )}
                    </div>

                    {/* Save Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Save Interval (<code className="text-emerald-600 font-mono">save_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrBboxForm.saveInterval}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, saveInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('saveInterval', rfdetrBboxForm.saveInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('saveInterval', rfdetrBboxForm.saveInterval) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('saveInterval', rfdetrBboxForm.saveInterval)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Save checkpoint every N epochs</span>
                      )}
                    </div>
                  </div>

                  {/* Early Stopping & Patience Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={rfdetrBboxForm.earlyStopping}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, earlyStopping: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Early Stopping (<code className="text-emerald-600 font-mono">early_stopping</code>)</span>
                        <span className="text-[10px] text-slate-400">Halt training when validation mAP stops improving</span>
                      </div>
                    </label>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Patience (<code className="text-emerald-600 font-mono">early_stopping_patience</code>)
                        </label>
                        <span className="text-[10px] text-slate-400">Epochs to wait before early stop</span>
                        {rfdetrBboxForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrBboxForm.earlyStoppingPatience) && (
                          <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{getHyperparamError('earlyStoppingPatience', rfdetrBboxForm.earlyStoppingPatience)}</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrBboxForm.earlyStoppingPatience}
                        onChange={(e) => setRfdetrBboxForm({ ...rfdetrBboxForm, earlyStoppingPatience: e.target.value })}
                        className={`w-20 px-3 py-1.5 rounded-xl border text-xs font-bold bg-white text-center transition-all ${
                          rfdetrBboxForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrBboxForm.earlyStoppingPatience)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-emerald-500/20 text-slate-800'
                        }`}
                        disabled={!rfdetrBboxForm.earlyStopping}
                      />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION BAR: Submit Job button positioned at bottom right */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSubmitView('templates')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit Job'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* VIEW D: IMAGE CLASSIFICATION (MobileNetV4 via timm) PAGE */}
          {submitView === 'classification' && (
            <div className="space-y-6">
              {/* Back to templates bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <button
                  onClick={() => setSubmitView('templates')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all self-start"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500" />
                  <span>Back to Templates</span>
                </button>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Template:</span>
                  <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                    Image Classification
                  </span>
                </div>
              </div>

              {/* Form Title & Subtitle */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Configure MobileNetV4 Image Classification
                </h2>
              </div>

              <form onSubmit={handleClassificationSubmit} className="space-y-6">
                {/* SECTION 1: EXPERIMENT & MODEL ARCHITECTURE SELECTION */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Cpu className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      1. Experiment & Model Architecture Selection
                    </h3>
                  </div>

                  {/* Experiment Name, Run Name, Model Architecture & Dataset */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Experiment / Project Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Defect Classification"
                        value={classificationForm.name}
                        onChange={(e) => setClassificationForm({ ...classificationForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Run Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MobileNetV4_Small_Run1"
                        value={classificationForm.runName}
                        onChange={(e) => setClassificationForm({ ...classificationForm, runName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model Architecture *
                      </label>
                      <select
                        value={classificationForm.modelArchitecture}
                        onChange={(e) => setClassificationForm({ ...classificationForm, modelArchitecture: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="mobilenetv4_conv_small">MobileNetV4 Conv Small (Fast & Ultra-Light)</option>
                        <option value="mobilenetv4_conv_medium">MobileNetV4 Conv Medium (Balanced)</option>
                        <option value="mobilenetv4_conv_large">MobileNetV4 Conv Large (High Accuracy)</option>
                        <option value="mobilenetv4_hybrid_medium">MobileNetV4 Hybrid Medium (Attention + Conv)</option>
                        <option value="mobilenetv4_hybrid_large">MobileNetV4 Hybrid Large (High Capacity Hybrid)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Target Dataset *
                        </label>
                        <button
                          type="button"
                          onClick={() => openTargetDatasetPicker('classification')}
                          className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Browse</span>
                        </button>
                      </div>

                      {(() => {
                        const currentDs = datasets.find((d) => d.id === classificationForm.datasetId);
                        const isIncompatible = currentDs && (currentDs.domain === 'Instance Segmentation / Object Detection' || currentDs.format === 'coco' || currentDs.format === 'yolo' || currentDs.domain === 'Tabular' || currentDs.format === 'csv');

                        if (!currentDs) {
                          return (
                            <div
                              onClick={() => openTargetDatasetPicker('classification')}
                              className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700 flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                Select a dataset...
                              </span>
                              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">Choose</span>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div
                              onClick={() => openTargetDatasetPicker('classification')}
                              className="p-2.5 sm:p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-100/70 text-indigo-700 shrink-0">
                                  <FolderOpen className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-700 truncate">{currentDs.name}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                                      {currentDs.domain || currentDs.format}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                    {currentDs.sampleCount.toLocaleString()} samples • {currentDs.fileSizeMB} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTargetDatasetPicker('classification');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-indigo-600 text-slate-700 group-hover:text-white border border-slate-200 group-hover:border-transparent text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                Change
                              </button>
                            </div>

                            {isIncompatible && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Format Incompatible: {currentDs.name} is formatted for {currentDs.domain || currentDs.format}. Image Classification requires class subfolders (train/valid per class).</span>
                              </div>
                            )}

                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: OFFICIAL TRAINING HYPERPARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        2. Training Hyperparameters
                      </h3>
                    </div>
                  </div>

                  {/* Core Hyperparameters Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Epochs */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Training Epochs (<code className="text-indigo-600 font-mono">epochs</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={classificationForm.epochs}
                        onChange={(e) => setClassificationForm({ ...classificationForm, epochs: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('epochs', classificationForm.epochs)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('epochs', classificationForm.epochs) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('epochs', classificationForm.epochs)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Full iterations over dataset (Default: 100)</span>
                      )}
                    </div>

                    {/* Batch Size */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Batch Size (<code className="text-indigo-600 font-mono">batch_size</code>)
                      </label>
                      <select
                        value={classificationForm.batchSize}
                        onChange={(e) => setClassificationForm({ ...classificationForm, batchSize: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value={4}>4</option>
                        <option value={8}>8</option>
                        <option value={16}>16</option>
                        <option value={32}>32</option>
                        <option value={64}>64</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">Samples processed per step</span>
                    </div>

                    {/* Learning Rate */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Learning Rate (<code className="text-indigo-600 font-mono">lr</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={classificationForm.lr}
                        onChange={(e) => setClassificationForm({ ...classificationForm, lr: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('lr', classificationForm.lr)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('lr', classificationForm.lr) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('lr', classificationForm.lr)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Initial optimizer learning rate (Default: 5e-4)</span>
                      )}
                    </div>

                    {/* Optimizer */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Optimizer (<code className="text-indigo-600 font-mono">optimizer</code>)
                      </label>
                      <select
                        value={classificationForm.optimizer}
                        onChange={(e) => setClassificationForm({ ...classificationForm, optimizer: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="AdamW">AdamW (Recommended)</option>
                        <option value="Adam">Adam</option>
                        <option value="SGD">SGD with Momentum</option>
                        <option value="RMSprop">RMSprop</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">Gradient update algorithm</span>
                    </div>

                    {/* Weight Decay */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Weight Decay (<code className="text-indigo-600 font-mono">weight_decay</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={classificationForm.weightDecay}
                        onChange={(e) => setClassificationForm({ ...classificationForm, weightDecay: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('weightDecay', classificationForm.weightDecay)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('weightDecay', classificationForm.weightDecay) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('weightDecay', classificationForm.weightDecay)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">L2 regularization factor (Default: 1e-4)</span>
                      )}
                    </div>

                    {/* Image Resolution */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Image Resolution (<code className="text-indigo-600 font-mono">img_size</code>)
                      </label>
                      <select
                        value={classificationForm.imgSize}
                        onChange={(e) => setClassificationForm({ ...classificationForm, imgSize: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value={224}>224 x 224 (Standard ImageNet)</option>
                        <option value={256}>256 x 256 (Enhanced Detail)</option>
                        <option value={384}>384 x 384 (High Resolution)</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">Input crop size for network</span>
                    </div>
                  </div>

                  {/* Label Smoothing & Pretrained Weights */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Label Smoothing */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Label Smoothing (<code className="text-indigo-600 font-mono">label_smoothing</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={classificationForm.labelSmoothing}
                        onChange={(e) => setClassificationForm({ ...classificationForm, labelSmoothing: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('labelSmoothing', classificationForm.labelSmoothing)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-slate-800'
                        }`}
                      />
                      {getHyperparamError('labelSmoothing', classificationForm.labelSmoothing) ? (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{getHyperparamError('labelSmoothing', classificationForm.labelSmoothing)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1 block">Regularization epsilon (Default: 0.1)</span>
                      )}
                    </div>

                    {/* Pretrained Weights */}
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={classificationForm.pretrained}
                        onChange={(e) => setClassificationForm({ ...classificationForm, pretrained: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Pretrained Weights (<code className="text-indigo-600 font-mono">pretrained</code>)</span>
                        <span className="text-[10px] text-slate-400">Initialize MobileNetV4 backbone with ImageNet-1k pretrained weights</span>
                      </div>
                    </label>
                  </div>

                  {/* Early Stopping & Patience Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={classificationForm.earlyStopping}
                        onChange={(e) => setClassificationForm({ ...classificationForm, earlyStopping: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Early Stopping (<code className="text-indigo-600 font-mono">early_stopping</code>)</span>
                        <span className="text-[10px] text-slate-400">Halt training when validation loss stops improving</span>
                      </div>
                    </label>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Patience (<code className="text-indigo-600 font-mono">early_stopping_patience</code>)
                        </label>
                        <span className="text-[10px] text-slate-400">Epochs to wait before early stop</span>
                        {classificationForm.earlyStopping && getHyperparamError('earlyStoppingPatience', classificationForm.earlyStoppingPatience) && (
                          <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{getHyperparamError('earlyStoppingPatience', classificationForm.earlyStoppingPatience)}</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={classificationForm.earlyStoppingPatience}
                        onChange={(e) => setClassificationForm({ ...classificationForm, earlyStoppingPatience: e.target.value })}
                        className={`w-20 px-3 py-1.5 rounded-xl border text-xs font-bold bg-white text-center transition-all ${
                          classificationForm.earlyStopping && getHyperparamError('earlyStoppingPatience', classificationForm.earlyStoppingPatience)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-slate-800'
                        }`}
                        disabled={!classificationForm.earlyStopping}
                      />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION BAR: Submit Job button positioned at bottom right */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSubmitView('templates')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit Job'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* VIEW D: INSTANCE SEGMENTATION (SAHI) PAGE */}
          {submitView === 'segmentation_sahi' && (
            <div className="w-full space-y-6">
              {/* Top Navigation Bar: Back Button on Left Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <button
                  onClick={() => setSubmitView('templates')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all self-start cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500" />
                  <span>Back to Templates</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Template:</span>
                  <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    Instance Segmentation (SAHI)
                  </span>
                </div>
              </div>

              {/* Form Title & Subtitle */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Configure RF-DETR Instance Segmentation (SAHI)
                </h2>
              </div>

              <form onSubmit={handleRfdetrSegSahiSubmit} className="space-y-6">
                {/* SECTION 1: EXPERIMENT & DATASET SELECTION */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Scissors className="w-4 h-4 text-purple-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      1. Experiment & Model Architecture Selection
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Experiment / Project Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Lens Defect SAHI"
                        value={rfdetrSegSahiForm.name}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Run Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. RFDETRSeg_SAHI_Run"
                        value={rfdetrSegSahiForm.runName}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, runName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model Architecture *
                      </label>
                      <select
                        value={rfdetrSegSahiForm.segModel}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, segModel: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-purple-500/20"
                      >
                        <option value="RFDETRSegMedium">RFDETRSegMedium</option>
                        <option value="RFDETRSegSmall">RFDETRSegSmall</option>
                        <option value="RFDETRSegNano">RFDETRSegNano</option>
                        <option value="RFDETRSegLarge">RFDETRSegLarge</option>
                        <option value="RFDETRSegPreview">RFDETRSegPreview</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Target Dataset *
                        </label>
                        <button
                          type="button"
                          onClick={() => openTargetDatasetPicker('rfdetr_seg_sahi')}
                          className="text-[11px] text-purple-600 hover:text-purple-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Browse</span>
                        </button>
                      </div>

                      {(() => {
                        const currentDs = datasets.find((d) => d.id === rfdetrSegSahiForm.datasetId);
                        const isIncompatible = currentDs && (currentDs.domain === 'Image Classification' || currentDs.format === 'images_folder' || currentDs.domain === 'Tabular' || currentDs.format === 'csv');

                        if (!currentDs) {
                          return (
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_seg_sahi')}
                              className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-purple-400 hover:bg-purple-50/20 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700 flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                Select a dataset...
                              </span>
                              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-xl">Choose</span>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_seg_sahi')}
                              className="p-2.5 sm:p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-purple-400 hover:bg-purple-50/20 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-purple-100/70 text-purple-700 shrink-0">
                                  <FolderOpen className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-purple-700 truncate">{currentDs.name}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                      {currentDs.domain || currentDs.format}
                                    </span>
                                    {(() => {
                                      const ov = getDatasetOverlapInfo(currentDs);
                                      return ov ? (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                                          {ov}
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                    {currentDs.sampleCount.toLocaleString()} samples • {currentDs.fileSizeMB} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTargetDatasetPicker('rfdetr_seg_sahi');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-purple-600 text-slate-700 group-hover:text-white border border-slate-200 group-hover:border-transparent text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                Change
                              </button>
                            </div>

                            {isIncompatible && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Format Incompatible: {currentDs.name} is formatted for {currentDs.domain || currentDs.format}. RF-DETR SAHI Segmentation requires polygon segmentation masks.</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SAHI SLICING PARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-purple-100 space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-purple-50 text-purple-600">
                        <Grid className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                          2. SAHI Slicing Configuration (Slicing Aided Hyper Inference)
                        </h3>
                      </div>
                    </div>
                    {(() => {
                      const cur = datasets.find((d) => d.id === rfdetrSegSahiForm.datasetId);
                      return (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          Auto-Catalog: "{cur ? `${cur.name.replace(/\s*\(SAHI\)$/i, '')} (SAHI)` : '{original} (SAHI)'}"
                        </span>
                      );
                    })()}
                  </div>

                  {/* Slicing Controls Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* 1. Target Slices: Columns */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Target Slices (Num of Columns) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        required
                        value={rfdetrSegSahiForm.sliceCols}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, sliceCols: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Number of horizontal slice divisions</span>
                    </div>

                    {/* 1. Target Slices: Rows */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Target Slices (Num of Rows) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        required
                        value={rfdetrSegSahiForm.sliceRows}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, sliceRows: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Number of vertical slice divisions</span>
                    </div>

                    {/* 2. Overlap Dropdown */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Overlap Mode *
                      </label>
                      <select
                        value={rfdetrSegSahiForm.overlapType}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, overlapType: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-purple-500/20"
                      >
                        <option value="pixel">Pixel (px)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">Measurement unit for tile overlap</span>
                    </div>

                    {/* 4. Min Box Size */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Min Box / Mask Dimension (px)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrSegSahiForm.minBoxSize}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, minBoxSize: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Filter out clipped fragments below this size</span>
                    </div>
                  </div>

                  {/* Overlap Values conditional on pixel vs percentage */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
                    {rfdetrSegSahiForm.overlapType === 'pixel' ? (
                      <>
                        {/* Overlap pixel X */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Pixel Width (X) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              required
                              value={rfdetrSegSahiForm.overlapPixelX}
                              onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, overlapPixelX: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20 pr-10"
                              placeholder="e.g. 80"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">px</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Horizontal overlap between adjacent tiles in pixels</span>
                        </div>

                        {/* Overlap pixel Y */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Pixel Height (Y) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              required
                              value={rfdetrSegSahiForm.overlapPixelY}
                              onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, overlapPixelY: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20 pr-10"
                              placeholder="e.g. 80"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">px</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Vertical overlap between adjacent tiles in pixels</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Overlap percentage X */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Percentage Width (X) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="50"
                              required
                              value={rfdetrSegSahiForm.overlapRatioX}
                              onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, overlapRatioX: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20 pr-10"
                              placeholder="e.g. 20"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Horizontal overlap ratio percentage relative to tile width</span>
                        </div>

                        {/* Overlap percentage Y */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Percentage Height (Y) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="50"
                              required
                              value={rfdetrSegSahiForm.overlapRatioY}
                              onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, overlapRatioY: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-purple-500/20 pr-10"
                              placeholder="e.g. 20"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Vertical overlap ratio percentage relative to tile height</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* SECTION 3: TRAINING HYPERPARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Sliders className="w-4 h-4 text-purple-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      3. Training Hyperparameters
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Epochs */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Epochs (<code className="text-purple-600 font-mono">epochs</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={rfdetrSegSahiForm.epochs}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, epochs: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('epochs', rfdetrSegSahiForm.epochs)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Total training epochs (Default: 100)</span>
                    </div>

                    {/* Batch Size */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Batch Size (<code className="text-purple-600 font-mono">batch_size</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={rfdetrSegSahiForm.batchSize}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, batchSize: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('batchSize', rfdetrSegSahiForm.batchSize)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Per-GPU batch size (Default: 4)</span>
                    </div>

                    {/* Gradient Accumulation Steps */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Grad Accum (<code className="text-purple-600 font-mono">grad_accum_steps</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={rfdetrSegSahiForm.gradAccumSteps}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, gradAccumSteps: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('gradAccumSteps', rfdetrSegSahiForm.gradAccumSteps)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Accumulation steps (Default: 4)</span>
                    </div>

                    {/* Learning Rate */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Learning Rate (<code className="text-purple-600 font-mono">lr</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={rfdetrSegSahiForm.lr}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, lr: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('lr', rfdetrSegSahiForm.lr)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Base optimizer rate (Default: 1e-4)</span>
                    </div>

                    {/* Validation Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Validation Interval (<code className="text-purple-600 font-mono">val_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrSegSahiForm.valInterval}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, valInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('valInterval', rfdetrSegSahiForm.valInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Evaluate every N epochs</span>
                    </div>

                    {/* Save Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Save Interval (<code className="text-purple-600 font-mono">save_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrSegSahiForm.saveInterval}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, saveInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('saveInterval', rfdetrSegSahiForm.saveInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Save checkpoint every N epochs</span>
                    </div>
                  </div>

                  {/* Early Stopping & Patience Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={rfdetrSegSahiForm.earlyStopping}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, earlyStopping: e.target.checked })}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Early Stopping (<code className="text-purple-600 font-mono">early_stopping</code>)</span>
                        <span className="text-[10px] text-slate-400">Halt training when validation mAP stops improving</span>
                      </div>
                    </label>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Patience (<code className="text-purple-600 font-mono">early_stopping_patience</code>)
                        </label>
                        <span className="text-[10px] text-slate-400">Epochs to wait before early stop</span>
                        {rfdetrSegSahiForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrSegSahiForm.earlyStoppingPatience) && (
                          <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{getHyperparamError('earlyStoppingPatience', rfdetrSegSahiForm.earlyStoppingPatience)}</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrSegSahiForm.earlyStoppingPatience}
                        onChange={(e) => setRfdetrSegSahiForm({ ...rfdetrSegSahiForm, earlyStoppingPatience: e.target.value })}
                        className={`w-20 px-3 py-1.5 rounded-xl border text-xs font-bold bg-white text-center transition-all ${
                          rfdetrSegSahiForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrSegSahiForm.earlyStoppingPatience)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-purple-500/20 text-slate-800'
                        }`}
                        disabled={!rfdetrSegSahiForm.earlyStopping}
                      />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION BAR */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSubmitView('templates')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit Job'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* VIEW E: OBJECT DETECTION (SAHI) PAGE */}
          {submitView === 'detection_sahi' && (
            <div className="w-full space-y-6">
              {/* Top Navigation Bar: Back Button on Left Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <button
                  onClick={() => setSubmitView('templates')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all self-start cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500" />
                  <span>Back to Templates</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Template:</span>
                  <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Object Detection (SAHI)
                  </span>
                </div>
              </div>

              {/* Form Title & Subtitle */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Configure RF-DETR Object Detection (SAHI)
                </h2>
              </div>

              <form onSubmit={handleRfdetrBboxSahiSubmit} className="space-y-6">
                {/* SECTION 1: EXPERIMENT & DATASET SELECTION */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Crosshair className="w-4 h-4 text-amber-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      1. Experiment & Model Architecture Selection
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Experiment / Project Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. PCB Components SAHI"
                        value={rfdetrBboxSahiForm.name}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Run Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. RFDETR_SAHI_BBox_Run"
                        value={rfdetrBboxSahiForm.runName}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, runName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model Architecture *
                      </label>
                      <select
                        value={rfdetrBboxSahiForm.bboxModel}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, bboxModel: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-purple-500/20"
                      >
                        <option value="RFDETRSmall">RFDETRSmall</option>
                        <option value="RFDETRMedium">RFDETRMedium</option>
                        <option value="RFDETRNano">RFDETRNano</option>
                        <option value="RFDETRBase">RFDETRBase</option>
                        <option value="RFDETRLarge">RFDETRLarge</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Target Dataset *
                        </label>
                        <button
                          type="button"
                          onClick={() => openTargetDatasetPicker('rfdetr_bbox_sahi')}
                          className="text-[11px] text-amber-600 hover:text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Browse</span>
                        </button>
                      </div>

                      {(() => {
                        const currentDs = datasets.find((d) => d.id === rfdetrBboxSahiForm.datasetId);
                        const isIncompatible = currentDs && (currentDs.domain === 'Image Classification' || currentDs.format === 'images_folder' || currentDs.domain === 'Tabular' || currentDs.format === 'csv');

                        if (!currentDs) {
                          return (
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_bbox_sahi')}
                              className="p-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-amber-400 hover:bg-amber-50/20 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700 flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                Select a dataset...
                              </span>
                              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-xl">Choose</span>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div
                              onClick={() => openTargetDatasetPicker('rfdetr_bbox_sahi')}
                              className="p-2.5 sm:p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-amber-400 hover:bg-amber-50/20 transition-all cursor-pointer shadow-xs flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-100/70 text-amber-800 shrink-0">
                                  <FolderOpen className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-amber-700 truncate">{currentDs.name}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                      {currentDs.domain || currentDs.format}
                                    </span>
                                    {(() => {
                                      const ov = getDatasetOverlapInfo(currentDs);
                                      return ov ? (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                          {ov}
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">
                                    {currentDs.sampleCount.toLocaleString()} samples • {currentDs.fileSizeMB} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTargetDatasetPicker('rfdetr_bbox_sahi');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-amber-600 text-slate-700 group-hover:text-white border border-slate-200 group-hover:border-transparent text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                Change
                              </button>
                            </div>

                            {isIncompatible && (
                              <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Format Incompatible: {currentDs.name} is formatted for {currentDs.domain || currentDs.format}. RF-DETR SAHI Detection requires bounding box annotations.</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SAHI SLICING PARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-amber-100 space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-amber-50 text-amber-600">
                        <Grid className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                          2. SAHI Slicing Configuration (Slicing Aided Hyper Inference)
                        </h3>
                      </div>
                    </div>
                    {(() => {
                      const cur = datasets.find((d) => d.id === rfdetrBboxSahiForm.datasetId);
                      return (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Auto-Catalog: "{cur ? `${cur.name.replace(/\s*\(SAHI\)$/i, '')} (SAHI)` : '{original} (SAHI)'}"
                        </span>
                      );
                    })()}
                  </div>

                  {/* Slicing Controls Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* 1. Target Slices: Columns */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Target Slices (Num of Columns) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        required
                        value={rfdetrBboxSahiForm.sliceCols}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, sliceCols: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Number of horizontal slice divisions</span>
                    </div>

                    {/* 1. Target Slices: Rows */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Target Slices (Num of Rows) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        required
                        value={rfdetrBboxSahiForm.sliceRows}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, sliceRows: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Number of vertical slice divisions</span>
                    </div>

                    {/* 2. Overlap Dropdown */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Overlap Mode *
                      </label>
                      <select
                        value={rfdetrBboxSahiForm.overlapType}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, overlapType: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="pixel">Pixel (px)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">Measurement unit for tile overlap</span>
                    </div>

                    {/* 4. Min Box Size */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Min Box Dimension (px)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrBboxSahiForm.minBoxSize}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, minBoxSize: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20"
                        placeholder="e.g. 2"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Filter out clipped fragments below this size</span>
                    </div>
                  </div>

                  {/* Overlap Values conditional on pixel vs percentage */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
                    {rfdetrBboxSahiForm.overlapType === 'pixel' ? (
                      <>
                        {/* Overlap pixel X */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Pixel Width (X) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              required
                              value={rfdetrBboxSahiForm.overlapPixelX}
                              onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, overlapPixelX: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 pr-10"
                              placeholder="e.g. 80"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">px</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Horizontal overlap between adjacent tiles in pixels</span>
                        </div>

                        {/* Overlap pixel Y */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Pixel Height (Y) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              required
                              value={rfdetrBboxSahiForm.overlapPixelY}
                              onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, overlapPixelY: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 pr-10"
                              placeholder="e.g. 80"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">px</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Vertical overlap between adjacent tiles in pixels</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Overlap percentage X */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Percentage Width (X) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="50"
                              required
                              value={rfdetrBboxSahiForm.overlapRatioX}
                              onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, overlapRatioX: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 pr-10"
                              placeholder="e.g. 20"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Horizontal overlap ratio percentage relative to tile width</span>
                        </div>

                        {/* Overlap percentage Y */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Overlap Percentage Height (Y) *
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="50"
                              required
                              value={rfdetrBboxSahiForm.overlapRatioY}
                              onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, overlapRatioY: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 pr-10"
                              placeholder="e.g. 20"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">Vertical overlap ratio percentage relative to tile height</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* SECTION 3: TRAINING HYPERPARAMETERS */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Sliders className="w-4 h-4 text-amber-600" />
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      3. Training Hyperparameters
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Epochs */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Epochs (<code className="text-amber-600 font-mono">epochs</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={rfdetrBboxSahiForm.epochs}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, epochs: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('epochs', rfdetrBboxSahiForm.epochs)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Total training epochs (Default: 100)</span>
                    </div>

                    {/* Batch Size */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Batch Size (<code className="text-amber-600 font-mono">batch_size</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={rfdetrBboxSahiForm.batchSize}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, batchSize: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('batchSize', rfdetrBboxSahiForm.batchSize)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Per-GPU batch size (Default: 4)</span>
                    </div>

                    {/* Gradient Accumulation Steps */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Grad Accum (<code className="text-amber-600 font-mono">grad_accum_steps</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={rfdetrBboxSahiForm.gradAccumSteps}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, gradAccumSteps: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('gradAccumSteps', rfdetrBboxSahiForm.gradAccumSteps)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Accumulation steps (Default: 4)</span>
                    </div>

                    {/* Learning Rate */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Learning Rate (<code className="text-amber-600 font-mono">lr</code>)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={rfdetrBboxSahiForm.lr}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, lr: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('lr', rfdetrBboxSahiForm.lr)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Base optimizer rate (Default: 1e-4)</span>
                    </div>

                    {/* Validation Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Validation Interval (<code className="text-amber-600 font-mono">val_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={rfdetrBboxSahiForm.valInterval}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, valInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('valInterval', rfdetrBboxSahiForm.valInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Evaluate every N epochs</span>
                    </div>

                    {/* Save Interval */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Save Interval (<code className="text-amber-600 font-mono">save_interval</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrBboxSahiForm.saveInterval}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, saveInterval: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white transition-all ${
                          getHyperparamError('saveInterval', rfdetrBboxSahiForm.saveInterval)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Save checkpoint every N epochs</span>
                    </div>
                  </div>

                  {/* Early Stopping & Patience Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer select-none hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={rfdetrBboxSahiForm.earlyStopping}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, earlyStopping: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Early Stopping (<code className="text-amber-600 font-mono">early_stopping</code>)</span>
                        <span className="text-[10px] text-slate-400">Halt training when validation mAP stops improving</span>
                      </div>
                    </label>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Patience (<code className="text-amber-600 font-mono">early_stopping_patience</code>)
                        </label>
                        <span className="text-[10px] text-slate-400">Epochs to wait before early stop</span>
                        {rfdetrBboxSahiForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrBboxSahiForm.earlyStoppingPatience) && (
                          <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{getHyperparamError('earlyStoppingPatience', rfdetrBboxSahiForm.earlyStoppingPatience)}</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rfdetrBboxSahiForm.earlyStoppingPatience}
                        onChange={(e) => setRfdetrBboxSahiForm({ ...rfdetrBboxSahiForm, earlyStoppingPatience: e.target.value })}
                        className={`w-20 px-3 py-1.5 rounded-xl border text-xs font-bold bg-white text-center transition-all ${
                          rfdetrBboxSahiForm.earlyStopping && getHyperparamError('earlyStoppingPatience', rfdetrBboxSahiForm.earlyStoppingPatience)
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-rose-700 bg-rose-50/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 text-slate-800'
                        }`}
                        disabled={!rfdetrBboxSahiForm.earlyStopping}
                      />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION BAR */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSubmitView('templates')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit Job'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* SUB-TAB 3: DATASETS & GUIDELINES */}
      {subTab === 'datasets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Upload Form & Guidelines (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Upload Box */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-base text-slate-900">Upload New Dataset</h3>
                {/* Method selector pills */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-full text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => { setDatasetUploadMode('roboflow'); setUploadError(''); }}
                    className={`px-3 py-1 rounded-full transition-all ${
                      datasetUploadMode === 'roboflow'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Roboflow Snippet
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDatasetUploadMode('archive'); setUploadError(''); }}
                    className={`px-3 py-1 rounded-full transition-all ${
                      datasetUploadMode === 'archive'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Upload Archive / File
                  </button>
                </div>
              </div>

              {uploadSuccess && (
                <div className="mb-4 p-3 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dataset registered successfully and ready for RF-DETR training!</span>
                </div>
              )}

              {uploadError && (
                <div className="mb-4 p-3 rounded-2xl bg-rose-50 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <form onSubmit={handleDatasetSubmit} className="space-y-4">
                {datasetUploadMode === 'roboflow' ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Roboflow Python Snippet *
                        </label>
                        <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                          Paste directly from Roboflow Export
                        </span>
                      </div>
                      <textarea
                        rows={6}
                        required
                        value={roboflowSnippet}
                        onChange={(e) => setRoboflowSnippet(e.target.value)}
                        placeholder={`!pip install roboflow\n\nfrom roboflow import Roboflow\nrf = Roboflow(api_key="YOUR_KEY")\nproject = rf.workspace("workspace-slug").project("project-slug")\nversion = project.version(1)\ndataset = version.download("coco")`}
                        className="w-full font-mono text-[11px] p-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Dataset Domain *
                      </label>
                      <select
                        value={datasetForm.domain}
                        onChange={(e) => setDatasetForm({
                          ...datasetForm,
                          domain: e.target.value as DatasetDomain,
                          category: e.target.value === 'Tabular' ? 'tabular' : 'vision'
                        })}
                        className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs bg-white font-semibold"
                      >
                        <option value="Instance Segmentation / Object Detection">Instance Segmentation / Object Detection</option>
                        <option value="Image Classification">Image Classification</option>
                        <option value="Tabular">Tabular</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Custom Dataset Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Auto-derived from Roboflow project name if blank"
                        value={datasetForm.name}
                        onChange={(e) => setDatasetForm({ ...datasetForm, name: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Optional project notes or tags"
                        value={datasetForm.description}
                        onChange={(e) => setDatasetForm({ ...datasetForm, description: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isUploading}
                      className="w-full py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isUploading ? 'Downloading & Extracting from Roboflow...' : 'Import from Roboflow'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    
                    {/* File Dropzone */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Dataset File (.zip, .xlsx, .csv, or any archive / table)
                      </label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFile(true);
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFile(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFile(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFile(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            handleFileSelect(e.dataTransfer.files[0]);
                          }
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all text-center relative ${
                          isDraggingFile
                            ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 scale-[1.01]'
                            : uploadFile
                            ? 'border-emerald-400 bg-emerald-50/20'
                            : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/20'
                        }`}
                      >
                        <UploadCloud className={`w-8 h-8 mb-1 transition-transform ${isDraggingFile ? 'text-blue-600 scale-110' : uploadFile ? 'text-emerald-600' : 'text-blue-500'}`} />
                        <span className="text-xs font-bold text-slate-700">
                          {uploadFile ? uploadFile.name : isDraggingFile ? 'Drop file to upload' : 'Click to select or drag & drop any file here'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {uploadFile
                            ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB • Sanitized: ${uploadFile.name} • Click to replace`
                            : 'Supports .zip, .xlsx, .csv, or any archive / table (spaces auto-handled)'}
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="*/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileSelect(e.target.files[0]);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Dataset Domain *</label>
                      <select
                        value={datasetForm.domain}
                        onChange={(e) => setDatasetForm({
                          ...datasetForm,
                          domain: e.target.value as DatasetDomain,
                          category: e.target.value === 'Tabular' ? 'tabular' : 'vision'
                        })}
                        className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs bg-white font-semibold"
                      >
                        <option value="Instance Segmentation / Object Detection">Instance Segmentation / Object Detection</option>
                        <option value="Image Classification">Image Classification</option>
                        <option value="Tabular">Tabular</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Dataset Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Weld-Seam-Masks-v2"
                        value={datasetForm.name}
                        onChange={(e) => setDatasetForm({ ...datasetForm, name: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                      <input
                        type="text"
                        placeholder="Dataset description or notes"
                        value={datasetForm.description}
                        onChange={(e) => setDatasetForm({ ...datasetForm, description: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isUploading}
                      className="w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {isUploading ? 'Uploading & Registering...' : 'Upload & Register Dataset'}
                    </button>
                  </>
                )}
              </form>
            </div>

            {/* Quick Format Reference Card */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-5 text-xs text-slate-800 space-y-4">
              <h4 className="font-extrabold flex items-center gap-1.5 text-slate-900">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Dataset Formatting Guidelines</span>
              </h4>

              {/* Instance Segmentation & Object Detection */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                  <span>Instance Segmentation / Object Detection (COCO / YOLO)</span>
                </p>
                <div className="bg-white border border-slate-200 p-3 rounded-xl font-mono text-[10px] text-slate-700 overflow-x-auto leading-relaxed shadow-xs">
                  <div className="text-blue-700 font-bold">dataset_root/</div>
                  <div className="text-slate-600">├── train/</div>
                  <div className="text-slate-500">│   ├── _annotations.coco.json <span className="text-slate-400 font-sans italic">(or annotation.json)</span></div>
                  <div className="text-slate-500">│   └── *.jpg / *.png</div>
                  <div className="text-slate-600">├── valid/</div>
                  <div className="text-slate-500">│   ├── _annotations.coco.json</div>
                  <div className="text-slate-500">│   └── *.jpg / *.png</div>
                  <div className="text-slate-600">└── test/ <span className="text-slate-400 font-sans italic">(optional)</span></div>
                  <div className="text-slate-500">    ├── _annotations.coco.json</div>
                  <div className="text-slate-500">    └── *.jpg / *.png</div>
                </div>
              </div>

              {/* Image Classification */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span>Image Classification (Folder Hierarchy)</span>
                </p>
                <div className="bg-white border border-slate-200 p-3 rounded-xl font-mono text-[10px] text-slate-700 overflow-x-auto leading-relaxed shadow-xs">
                  <div className="text-emerald-700 font-bold">dataset_root/</div>
                  <div className="text-slate-600">├── train/</div>
                  <div className="text-slate-500">│   ├── class_a/ <span className="text-slate-400 font-sans italic">(*.jpg / *.png)</span></div>
                  <div className="text-slate-500">│   └── class_b/ <span className="text-slate-400 font-sans italic">(*.jpg / *.png)</span></div>
                  <div className="text-slate-600">├── valid/</div>
                  <div className="text-slate-500">│   ├── class_a/</div>
                  <div className="text-slate-500">│   └── class_b/</div>
                  <div className="text-slate-600">└── test/ <span className="text-slate-400 font-sans italic">(optional)</span></div>
                  <div className="text-slate-500">    ├── class_a/</div>
                  <div className="text-slate-500">    └── class_b/</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Registered Datasets Catalog (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
              <span>Cataloged Datasets ({displayedDatasets.length}{userFilter !== 'all' ? ` filtered by ${userFilter}` : ''})</span>
              {userFilter !== 'all' && (
                <button
                  onClick={() => setUserFilter('all')}
                  className="text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  Show All ({datasets.length})
                </button>
              )}
            </div>

            {displayedDatasets.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200">
                <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="font-bold text-slate-700">No Datasets Found</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {userFilter !== 'all'
                    ? `No datasets uploaded by "${userFilter}".`
                    : 'Upload a dataset or import from Roboflow to get started.'}
                </p>
                {userFilter !== 'all' && (
                  <button
                    onClick={() => setUserFilter('all')}
                    className="mt-3 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    View All Datasets
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4">
              {displayedDatasets.slice(0, 5).map((d) => (
                d.isUploading ? (
                  <div
                    key={d.id}
                    className="bg-white rounded-3xl p-5 shadow-sm border-2 border-blue-400/80 bg-blue-50/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                          <h4 className="font-bold text-base text-slate-900">{d.name}</h4>
                          <span className="text-[10px] text-blue-700 font-extrabold bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                            Uploading...
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{d.description}</p>
                      </div>

                      <span className="text-xs font-black text-blue-700 bg-blue-100 px-2.5 py-1 rounded-xl shrink-0">
                        {d.uploadProgress !== undefined ? `${d.uploadProgress}%` : 'Processing'}
                      </span>
                    </div>

                    {/* Live Upload Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                        <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                          <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                          {d.uploadStatusText || 'Uploading to workstation storage-hub...'}
                        </span>
                        <span className="font-bold text-slate-800">{d.uploadProgress || 0}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          style={{ width: `${Math.max(5, d.uploadProgress || 0)}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-200"
                        ></div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>Uploaded by <strong className="text-slate-600">{d.uploadedBy}</strong></span>
                      {d.fileSizeMB > 0 && <span>Size: <strong className="text-slate-600">{d.fileSizeMB} MB</strong></span>}
                      <span className="text-slate-400 italic">Adding to catalog...</span>
                    </div>
                  </div>
                ) : (
                <div
                  key={d.id}
                  onClick={() => handleOpenDatasetAnalysis(d)}
                  className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                  title="Click to view dataset analysis"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-slate-900 group-hover:text-blue-600 transition-colors">{d.name}</h4>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                          {d.domain || (d.category === 'tabular' ? 'Tabular' : 'Instance Segmentation / Object Detection')}
                        </span>
                        {(() => {
                          const ov = getDatasetOverlapInfo(d);
                          return ov ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80">
                              {ov}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{formatDatasetDescription(d)}</p>
                    </div>

                    <span className="text-xs font-extrabold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-xl shrink-0">
                      {d.sampleCount.toLocaleString()} samples
                    </span>
                  </div>

                  {/* Classes tags (removed 'Classes:' label as requested) */}
                  {d.classes && d.classes.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {d.classes.map((c, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Uploaded by <strong className="text-slate-600">{d.uploadedBy}</strong></span>
                    <span>Size: <strong className="text-slate-600">{d.fileSizeMB} MB</strong></span>
                    <div className="flex items-center gap-2">
                      {/* Download dataset in storage */}
                      <a
                        href={`/api/datasets/${d.id}/download`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-bold transition-all cursor-pointer border border-blue-200"
                        title="Download dataset archive (.zip)"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDataset(d.id, d.name);
                        }}
                        disabled={deletingDatasetId === d.id}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold transition-all disabled:opacity-50 cursor-pointer"
                        title="Delete dataset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{deletingDatasetId === d.id ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                </div>
                )
              ))}
            </div>

            {/* See All Datasets Button */}
            {displayedDatasets.length > 0 && (
              <div className="flex items-center justify-between pt-2 px-1">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {Math.min(5, displayedDatasets.length)} of {displayedDatasets.length} datasets
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAllDatasetsSearch('');
                    setAllDatasetsPage(1);
                    setShowAllDatasetsModal(true);
                  }}
                  className="px-4 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>See All ({displayedDatasets.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: TRAINING RESULTS */}
      {subTab === 'results' && (
        <div className="space-y-6">
          {completedRuns.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm my-6">
              <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-800">
                {userFilter !== 'all'
                  ? `No Completed Training Runs for "${userFilter}"`
                  : 'No Completed Training Runs Yet'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
                {userFilter !== 'all'
                  ? `There are no completed model training runs submitted by ${userFilter}. Switch to All Accounts to see other completed runs.`
                  : 'Once a submitted training job finishes training on the office workstation GPU, its evaluation graphs, validation comparisons, and downloadable model checkpoints will appear here.'}
              </p>
              {userFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setUserFilter('all');
                    const comp = jobs.filter((j) => j.status === 'completed');
                    setSelectedResultJob(comp[0] || null);
                  }}
                  className="mt-6 px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>View All User Results</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSubTab('submit');
                    setSubmitView('templates');
                  }}
                  className="mt-6 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Configure Training</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (4 cols): Completed Runs List */}
              <div className="lg:col-span-4 space-y-3">
                <span className="text-xs font-semibold text-slate-500 tracking-wider block px-1">
                  Historical Completed Runs {userFilter !== 'all' ? `(Filtered by: ${userFilter})` : ''}
                </span>

                <div className="space-y-2.5">
                  {completedRuns.slice(0, 5).map((j) => {
                    const isSelected = selectedResultJob?.id === j.id || (!selectedResultJob && completedRuns[0]?.id === j.id);
                    const isSubmitterAlive = registeredUsersList.some(
                      (u) =>
                        (j.submittedById && u.id === j.submittedById) ||
                        (j.submittedBy && u.name && u.name.trim().toLowerCase() === j.submittedBy.trim().toLowerCase())
                    );
                    const isRunOwner = user && (
                      (user.id && j.submittedById && user.id === j.submittedById) ||
                      (user.name && j.submittedBy && user.name.trim().toLowerCase() === j.submittedBy.trim().toLowerCase()) ||
                      user.role === 'Admin' ||
                      !isSubmitterAlive
                    );

                    return (
                      <div
                        key={j.id}
                        onClick={() => setSelectedResultJob(j)}
                        className={`p-4 rounded-3xl cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/10'
                            : 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {j.taskType || 'RF-DETR'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400">
                              {j.completedAt ? new Date(j.completedAt).toLocaleDateString() : 'Today'}
                            </span>
                            {isRunOwner && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrainingResult(j.id, j.name);
                                }}
                                disabled={isDeletingResult}
                                className="p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete this training result"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <h4 className="text-sm font-extrabold text-slate-900 truncate">{j.name}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {j.datasetName || 'Industrial Dataset'} • by {j.submittedBy || 'ML Engineer'}
                        </p>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {j.totalEpochs} Epochs
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* See All Completed Runs Button */}
                {completedRuns.length > 0 && (
                  <div className="flex items-center justify-between pt-2 px-1">
                    <span className="text-xs text-slate-500 font-medium">
                      Showing {Math.min(5, completedRuns.length)} of {completedRuns.length} runs
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllResultsModal(true);
                        setAllResultsPage(1);
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>See All ({completedRuns.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column (8 cols): Detailed Result View */}
              {(() => {
                const current = selectedResultJob || completedRuns[0];
                if (!current) return null;

                const valCompUrl = current.valComparisonUrl || `/uploads/runs/${current.id}/val_comparison.png`;
                const weightsUrl = current.checkpointPath || `/uploads/runs/${current.id}/weights/best_rfdetr_weights.pt`;

                const isSubmitterAlive = registeredUsersList.some(
                  (u) =>
                    (current.submittedById && u.id === current.submittedById) ||
                    (current.submittedBy && u.name && u.name.trim().toLowerCase() === current.submittedBy.trim().toLowerCase())
                );
                const isCurrentOwner = user && (
                  (user.id && current.submittedById && user.id === current.submittedById) ||
                  (user.name && current.submittedBy && user.name.trim().toLowerCase() === current.submittedBy.trim().toLowerCase()) ||
                  user.role === 'Admin' ||
                  !isSubmitterAlive
                );

                return (
                  <div className="lg:col-span-8 space-y-6">
                    {/* Run Header with Download and Delete Buttons */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold text-slate-400">Run ID: {current.id}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            Submitted by: {current.submittedBy || 'ML Engineer'}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900">{current.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Dataset: {current.datasetName || 'Industrial Dataset'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <a
                          href={`/api/jobs/${current.id}/download`}
                          download={`result_bundle_${current.id}.zip`}
                          className="px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Result Folder (.ZIP)</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDownloadInference(current.id, current.name)}
                          disabled={isDownloadingInference}
                          className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors flex items-center gap-1.5"
                          title="Download standalone inference script (inference.py)"
                        >
                          {isDownloadingInference ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5" />
                          )}
                          <span>Inference (.PY)</span>
                        </button>

                        <a
                          href={weightsUrl}
                          download={`best_rfdetr_${current.id}.pt`}
                          className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Weights (.PT)</span>
                        </a>

                        {isCurrentOwner && (
                          <button
                            onClick={() => handleDeleteTrainingResult(current.id, current.name)}
                            disabled={isDeletingResult}
                            className="px-4 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Delete this completed training run and result folder (owner only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isDeletingResult ? 'Deleting...' : 'Delete Result'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Visual Validation Comparison (Input GT vs Prediction Mask) */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                          <h4 className="text-base font-extrabold text-slate-900">
                            Validation Ground Truth vs. RF-DETR Prediction Mask
                          </h4>
                        </div>
                      </div>

                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white flex flex-col items-center justify-center p-3">
                        <img
                          src={valCompUrl}
                          alt="Validation Mask Prediction"
                          className="w-full max-h-[500px] object-contain rounded-xl border border-slate-100"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const fallback = document.getElementById(`fallback-collage-${current.id}`);
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          id={`fallback-collage-${current.id}`}
                          className="hidden flex-col items-center justify-center py-12 px-4 text-center space-y-3"
                        >
                          <Clock className="w-8 h-8 text-slate-400 animate-spin" />
                          <p className="text-xs font-bold text-slate-700">
                            Generating validation inference collage...
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Artifact is generating. Refresh in a moment if still processing.
                          </p>
                        </div>
                        <div className="py-2.5 text-center text-xs text-slate-600 flex flex-wrap items-center justify-center gap-6 border-t border-slate-100 w-full mt-3">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Ground Truth Annotation (COCO)
                          </span>
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> RF-DETR Predicted Polygon
                          </span>
                          <a
                            href={valCompUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-900 hover:text-blue-600 text-xs font-bold flex items-center gap-1 underline ml-auto mr-2"
                          >
                            Open Full Image ↗
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Training Results Curves (results.png from metrics.csv) */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-2">
                        <div>
                          <h4 className="text-base font-extrabold text-slate-900">
                            Training Results & Metrics Curves
                          </h4>
                        </div>
                        <a
                          href={`/uploads/runs/${current.id}/results.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={`results_${current.id}.png`}
                          className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 w-fit"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Graph</span>
                        </a>
                      </div>

                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white flex flex-col items-center justify-center p-3">
                        <img
                          src={`/uploads/runs/${current.id}/results.png`}
                          alt="Training Results Curves"
                          className="w-full max-h-[550px] object-contain rounded-xl border border-slate-100"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const fallback = document.getElementById(`fallback-results-png-${current.id}`);
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          id={`fallback-results-png-${current.id}`}
                          className="hidden flex-col items-center justify-center py-12 px-4 text-center space-y-2"
                        >
                          <Clock className="w-8 h-8 text-slate-400 animate-spin" />
                          <p className="text-xs font-bold text-slate-700">Generating results curves graph...</p>
                          <p className="text-[11px] text-slate-400">results.png is processing. Refresh in a moment if still finalizing.</p>
                        </div>
                        <div className="py-2 text-center text-xs text-slate-600 flex items-center justify-between border-t border-slate-100 w-full mt-3 px-2">
                          <span className="text-[11px] text-slate-500 font-medium">Source: metrics.csv</span>
                          <a
                            href={`/uploads/runs/${current.id}/results.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1"
                          >
                            Open Full Resolution Graph ↗
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Confusion Matrix & Multi-Class Evaluation Section */}
                    {(() => {
                      const cm = (() => {
                        const cmHasObjectOnly = current.confusionMatrix?.classes?.length === 1 && current.confusionMatrix.classes[0].toLowerCase() === 'object';
                        if (current.confusionMatrix && current.confusionMatrix.matrix && current.confusionMatrix.matrix.length > 0 && !cmHasObjectOnly) {
                          return current.confusionMatrix;
                        }
                        if (jobConfusionMatrix[current.id]) {
                          return jobConfusionMatrix[current.id];
                        }
                        return null;
                      })();

                      const cmClasses: string[] = (cm && cm.classes && cm.classes.length > 0) ? cm.classes : [];

                      return (
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-extrabold text-slate-900">
                                  Confusion Matrix & Multi-Class Evaluation
                                </h4>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Ground truth distribution vs predicted classes across validation samples
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() => setCmViewMode('grid')}
                                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                    cmViewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Matrix Grid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCmViewMode('image')}
                                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                    cmViewMode === 'image' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Heatmap (.PNG)
                                </button>
                              </div>

                              <a
                                href={`/uploads/runs/${current.id}/confusion_matrix.png`}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={`confusion_matrix_${current.id}.png`}
                                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
                                title="Download Confusion Matrix PNG"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          {cmViewMode === 'image' ? (
                            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <img
                                src={`/uploads/runs/${current.id}/confusion_matrix.png`}
                                alt="Confusion Matrix Heatmap"
                                className="max-h-[440px] object-contain rounded-xl shadow-xs border border-slate-200/60"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                  const fb = document.getElementById(`fallback-cm-${current.id}`);
                                  if (fb) fb.style.display = 'block';
                                }}
                              />
                              <div id={`fallback-cm-${current.id}`} className="hidden text-center py-8 text-xs text-slate-400">
                                Generating heatmap artifact... Toggle to Matrix Grid for live table view.
                              </div>
                            </div>
                          ) : !cm ? (
                            <div className="text-center py-12 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 p-6 space-y-3">
                              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1">
                                <BarChart3 className="w-5 h-5" />
                              </div>
                              <p className="text-sm font-bold text-slate-800">
                                Detailed Matrix Grid Loading
                              </p>
                              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                Validation evaluation matrix is being parsed or available in high-resolution visual format.
                              </p>
                              <button
                                type="button"
                                onClick={() => setCmViewMode('image')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
                              >
                                View Heatmap (.PNG) ↗
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="overflow-x-auto pb-1">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                                      <th className="py-2.5 px-3 font-bold text-slate-500 uppercase tracking-wider">
                                        Actual \ Predicted
                                      </th>
                                      {cmClasses.map((c: string) => (
                                        <th key={c} className="py-2.5 px-3 font-bold text-slate-800 text-center">
                                          {c}
                                        </th>
                                      ))}
                                      <th className="py-2.5 px-3 font-bold text-blue-700 text-center bg-blue-50/50">Recall</th>
                                      <th className="py-2.5 px-3 font-bold text-indigo-700 text-center bg-indigo-50/50">F1 Score</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {cmClasses.map((actualCls: string, rIdx: number) => {
                                      const rowSum = cm.matrix[rIdx]?.reduce((a: number, b: number) => a + b, 0) || 0;
                                      const denom = (cm as any).class_gt_counts?.[actualCls] ?? (rowSum > 0 ? rowSum : 1);
                                      const diagCount = cm.matrix[rIdx]?.[rIdx] || 0;
                                      const recallVal = cm.recall?.[actualCls] ?? (denom > 0 ? diagCount / denom : 0);
                                      const f1Val = cm.f1_score?.[actualCls] ?? (recallVal > 0 ? recallVal : 0);

                                      return (
                                        <tr key={actualCls} className="hover:bg-slate-50/80 transition-colors">
                                          <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">
                                            {actualCls}
                                          </td>
                                          {cmClasses.map((predCls: string, cIdx: number) => {
                                            const count = cm.matrix[rIdx]?.[cIdx] ?? 0;
                                            const pct = denom > 0 ? ((count / denom) * 100).toFixed(1) : '0.0';
                                            const isDiag = rIdx === cIdx;

                                            return (
                                              <td key={predCls} className="py-2 px-3 text-center">
                                                <div
                                                  className={`p-2 rounded-xl text-center transition-all ${
                                                    isDiag
                                                      ? 'bg-blue-50 text-blue-900 border border-blue-200/80 font-black shadow-xs'
                                                      : count > 0
                                                      ? 'bg-rose-50 text-rose-700 border border-rose-200/50 font-bold'
                                                      : 'bg-slate-50/70 text-slate-400 font-medium'
                                                  }`}
                                                >
                                                  <span className="block text-xs">{count}</span>
                                                  <span className="block text-[10px] opacity-75">{pct}%</span>
                                                </div>
                                              </td>
                                            );
                                          })}
                                          <td className="py-2 px-3 text-center font-bold text-blue-700 bg-blue-50/30">
                                            {(recallVal * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-2 px-3 text-center font-bold text-indigo-700 bg-indigo-50/30">
                                            {(f1Val * 100).toFixed(1)}%
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {/* Precision Row */}
                                    <tr className="bg-slate-50/60 font-bold border-t-2 border-slate-200">
                                      <td className="py-2.5 px-3 text-slate-600 uppercase text-[10px] tracking-wider">
                                        Precision
                                      </td>
                                      {cmClasses.map((cls: string, cIdx: number) => {
                                        const colSum = cm.matrix.reduce((acc: number, row: number[]) => acc + (row[cIdx] || 0), 0);
                                        const tp = cm.matrix[cIdx]?.[cIdx] || 0;
                                        const pVal = cm.precision?.[cls] ?? (colSum > 0 ? tp / colSum : 0);
                                        return (
                                          <td key={cls} className="py-2.5 px-3 text-center text-blue-700">
                                            {(pVal * 100).toFixed(1)}%
                                          </td>
                                        );
                                      })}
                                      <td colSpan={2} className="py-2.5 px-3 text-right text-slate-500 font-semibold text-[11px]">
                                        Accuracy: <strong className="text-slate-900 font-black">{((cm.accuracy || 0.95) * 100).toFixed(1)}%</strong>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-100 gap-2">
                                <div className="flex items-center gap-4">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <span className="w-2.5 h-2.5 rounded bg-blue-500"></span> True Positive (Diagonal)
                                  </span>
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <span className="w-2.5 h-2.5 rounded bg-rose-400"></span> Classification Error / Spillover
                                  </span>
                                </div>
                                <span className="text-[11px] font-semibold text-slate-600">
                                  Total Evaluated: <strong className="text-slate-900">{(cm.total_samples || cm.matrix.reduce((acc: number, row: number[]) => acc + row.reduce((a: number, b: number) => a + b, 0), 0)).toLocaleString()}</strong> instances
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 0: INFERENCE SCRIPT UNAVAILABLE WARNING POPUP */}
      {/* ------------------------------------------------------------- */}
      {inferenceAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-amber-100 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setInferenceAlertModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3.5 mb-2">
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Inference Script Notice</h3>
                <p className="text-xs text-amber-600 font-semibold">Template Configuration</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 font-bold leading-relaxed break-words">
              {inferenceAlertModal}
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              This template does not have an <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">inference.py</code> in its template folder under <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">training_scripts/</code>. Add an <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">inference.py</code> file to the respective template folder to enable inference exports.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInferenceAlertModal(null)}
                className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: SUBMISSION ERROR POPUP */}
      {/* ------------------------------------------------------------- */}
      {submitErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-rose-100 shadow-2xl relative">
            <button
              onClick={() => setSubmitErrorModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Training Job Submission Error</h3>
                <p className="text-xs text-rose-600 font-semibold">Unable to dispatch job to queue</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 text-xs text-rose-950 font-medium leading-relaxed mb-5 break-words">
              {submitErrorModal}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSubmitErrorModal(null)}
                className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: DATASET DEEP ANALYSIS POPUP WINDOW */}
      {/* ------------------------------------------------------------- */}
      {analysisDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full border border-slate-100 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => {
                setAnalysisDataset(null);
                setDatasetAnalysis(null);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3.5 mb-4 pb-4 border-b border-slate-100">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">{analysisDataset.name}</h3>
                <p className="text-xs text-slate-500">Comprehensive dataset distribution metrics & image analysis</p>
              </div>
            </div>

            {/* Editable Dataset Domain Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-3 mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Domain:</span>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  {analysisDataset.domain || 'Instance Segmentation / Object Detection'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Edit Domain:</span>
                <select
                  value={analysisDataset.domain || 'Instance Segmentation / Object Detection'}
                  onChange={async (e) => {
                    const newDomain = e.target.value;
                    try {
                      const res = await fetch(`/api/datasets/${analysisDataset.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain: newDomain })
                      });
                      if (res.ok) {
                        setAnalysisDataset((prev) => prev ? { ...prev, domain: newDomain } : null);
                        setDatasets((prev) => prev.map((d) => d.id === analysisDataset.id ? { ...d, domain: newDomain } : d));
                        handleOpenDatasetAnalysis({ ...analysisDataset, domain: newDomain });
                      }
                    } catch (err) {
                      console.error('Failed to update dataset domain:', err);
                    }
                  }}
                  className="text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-slate-700 cursor-pointer shadow-xs focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="Instance Segmentation / Object Detection">Instance Segmentation / Object Detection</option>
                  <option value="Image Classification">Image Classification</option>
                  <option value="Tabular">Tabular</option>
                </select>
              </div>
            </div>

            {isLoadingAnalysis ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-700">Scanning dataset storage & parsing annotations...</p>
                <p className="text-[11px] text-slate-400">Computing image resolutions, bounding boxes/masks, and split distribution</p>
              </div>
            ) : analysisError ? (
              <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                <p className="font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Unable to complete deep dataset scan</span>
                </p>
                <p className="text-rose-600">{analysisError}</p>
              </div>
            ) : datasetAnalysis ? (
              <div className="space-y-6">
                {/* 4 Core Metric Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Samples</span>
                    <strong className="text-xl font-black text-slate-900">
                      {datasetAnalysis.totalSamples.toLocaleString()}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Images</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Annotations</span>
                    <strong className="text-xl font-black text-blue-600">
                      {datasetAnalysis.totalAnnotations.toLocaleString()}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {datasetAnalysis.avgAnnotationsPerImage} / img avg
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Classes</span>
                    <strong className="text-xl font-black text-emerald-600">
                      {datasetAnalysis.numClasses}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Distinct labels</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Disk Size</span>
                    <strong className="text-xl font-black text-indigo-600">
                      {datasetAnalysis.fileSizeMB}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Megabytes (MB)</span>
                  </div>
                </div>

                {/* Image Resolution Analysis Card */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Image Dimension & Aspect Ratio Analysis</span>
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {datasetAnalysis.aspectRatio}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Minimum Size</span>
                      <strong className="text-xs font-extrabold text-slate-800">
                        {datasetAnalysis.imageResolution.min.width} × {datasetAnalysis.imageResolution.min.height}
                      </strong>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Average Size</span>
                      <strong className="text-xs font-extrabold text-blue-600">
                        {datasetAnalysis.imageResolution.avg.width} × {datasetAnalysis.imageResolution.avg.height}
                      </strong>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Maximum Size</span>
                      <strong className="text-xs font-extrabold text-slate-800">
                        {datasetAnalysis.imageResolution.max.width} × {datasetAnalysis.imageResolution.max.height}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Dataset Split Distribution */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100 space-y-2.5">
                  <span className="text-xs font-extrabold text-slate-800 block">Split Distribution</span>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Train Set:</span>
                      <strong className="font-extrabold text-slate-900">{datasetAnalysis.splits.train.toLocaleString()}</strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Valid Set:</span>
                      <strong className="font-extrabold text-slate-900">{datasetAnalysis.splits.val.toLocaleString()}</strong>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Test Set:</span>
                      <strong className="font-extrabold text-slate-900">{datasetAnalysis.splits.test ? datasetAnalysis.splits.test.toLocaleString() : 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Class Breakdown with Value & Percentage Distribution */}
                {datasetAnalysis.classes && datasetAnalysis.classes.length > 0 && (() => {
                  const dist = datasetAnalysis.classDistribution || {};
                  const totalClassInstances = Object.values(dist).reduce((a: number, b: any) => a + (Number(b) || 0), 0) as number || (datasetAnalysis.totalAnnotations || 1);

                  return (
                    <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800">
                          Class Distribution ({datasetAnalysis.classes.length} classes)
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          Value count & percentage share
                        </span>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {datasetAnalysis.classes.map((cName: string) => {
                          const count = dist[cName] ?? 0;
                          const pct = totalClassInstances > 0 ? ((count / totalClassInstances) * 100).toFixed(1) : '0.0';
                          const classSize = (datasetAnalysis.classSizes && datasetAnalysis.classSizes[cName]) || (datasetAnalysis.classInstanceSizes && datasetAnalysis.classInstanceSizes[cName]);

                          return (
                            <div key={cName} className="bg-white p-2.5 rounded-xl border border-slate-200/80 text-xs space-y-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <div className="flex items-center justify-between font-bold gap-2">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span className="text-slate-800 truncate">{cName}</span>
                                  {classSize && (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded-lg">
                                      <span>Min: <strong className="text-slate-700 font-mono">{classSize.min_width}×{classSize.min_height} px</strong></span>
                                      <span className="text-slate-300">•</span>
                                      <span>Max: <strong className="text-slate-700 font-mono">{classSize.max_width}×{classSize.max_height} px</strong></span>
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-slate-900 font-black">
                                    {count.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">({count === 1 ? 'instance' : 'instances'})</span>
                                  </span>
                                  <span className="text-blue-700 bg-blue-50 border border-blue-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(1, parseFloat(pct)))}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Storage & Metadata Details */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] space-y-1 text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>Annotation Types:</span>
                    <strong className="text-slate-700">{datasetAnalysis.annotationTypes ? datasetAnalysis.annotationTypes.join(', ') : 'Vision'}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Format:</span>
                    <strong className="text-slate-700">{datasetAnalysis.format}</strong>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span>Storage Location:</span>
                    <span className="font-mono text-[10px] text-slate-700 max-w-xs truncate" title={datasetAnalysis.storagePath}>
                      {datasetAnalysis.storagePath}
                    </span>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  {/* Download Archive */}
                  <a
                    href={`/api/datasets/${datasetAnalysis.id}/download`}
                    download
                    className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-blue-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Dataset (.zip)</span>
                  </a>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {/* Export dataset_metadata.json */}
                    <button
                      onClick={handleExportDatasetMetadata}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-500/20 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Export dataset_metadata.json</span>
                    </button>

                    <button
                      onClick={() => {
                        setAnalysisDataset(null);
                        setDatasetAnalysis(null);
                      }}
                      className="px-4 py-2.5 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL 3: ALL JOBS QUEUE MODAL (10 per page) */}
      {showAllJobsModal && (() => {
        const filteredAllJobs = displayedJobs.filter((job) => {
          if (!allJobsSearch.trim()) return true;
          const q = allJobsSearch.toLowerCase();
          return (
            (job.name && job.name.toLowerCase().includes(q)) ||
            (job.datasetName && job.datasetName.toLowerCase().includes(q)) ||
            (job.submittedBy && job.submittedBy.toLowerCase().includes(q)) ||
            (job.taskType && job.taskType.toLowerCase().includes(q)) ||
            (job.status && job.status.toLowerCase().includes(q)) ||
            (job.device && job.device.toLowerCase().includes(q)) ||
            (job.id && job.id.toLowerCase().includes(q))
          );
        });
        const allJobsTotalPages = Math.ceil(filteredAllJobs.length / 10) || 1;
        const currentPage = Math.min(allJobsPage, allJobsTotalPages);
        const pagedAllJobs = filteredAllJobs.slice((currentPage - 1) * 10, currentPage * 10);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-3xl w-full border border-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Training Job Queue</h3>
                    <p className="text-xs text-slate-500">All submitted training jobs ({displayedJobs.length} total)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAllJobsModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="pt-3 pb-1 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search jobs by name, dataset, author, task, or status..."
                    value={allJobsSearch}
                    onChange={(e) => {
                      setAllJobsSearch(e.target.value);
                      setAllJobsPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 rounded-2xl border border-slate-200 text-xs bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  />
                  {allJobsSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setAllJobsSearch('');
                        setAllJobsPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                {pagedAllJobs.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No queued or historical jobs match &quot;{allJobsSearch}&quot;
                  </div>
                ) : (
                  pagedAllJobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => {
                        setSelectedJob(job);
                        setShowAllJobsModal(false);
                      }}
                      className="p-4 rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer shadow-xs group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${job.status === 'running' ? 'bg-blue-600 animate-pulse' : job.status === 'completed' ? 'bg-emerald-500' : job.status === 'paused' ? 'bg-amber-500' : job.status === 'failed' ? 'bg-rose-500' : 'bg-slate-400'}`} />
                            <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">{job.name}</h4>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full mr-1.5 text-[10px]">{job.taskType}</span>
                            Dataset: <strong className="text-slate-700">{job.datasetName}</strong> • Host: <strong className="text-slate-700">{job.device}</strong> • By: <strong className="text-slate-700">{job.submittedBy}</strong>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${job.status === 'running' ? 'bg-blue-100 text-blue-800 border-blue-200' : job.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : job.status === 'paused' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {job.stage === 'generating_results' ? 'Generating Results' : job.stage === 'unzipping' ? 'Unzipping' : job.status}
                          </span>
                          <div className="text-[11px] font-bold text-slate-500 mt-1">
                            {job.currentEpoch}/{job.totalEpochs} Epochs ({job.progressPercent}%)
                            {(job.status === 'completed' && (job.earlyStopped || (job.currentEpoch > 0 && job.currentEpoch < job.totalEpochs))) ? (
                              <span className="text-amber-600 font-bold ml-1">- Early Stopping</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Pagination */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400 font-medium">
                  Showing {filteredAllJobs.length === 0 ? 0 : (currentPage - 1) * 10 + 1} - {Math.min(filteredAllJobs.length, currentPage * 10)} of {filteredAllJobs.length} jobs
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setAllJobsPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    {currentPage} out of {allJobsTotalPages} pages
                  </span>
                  <button
                    disabled={currentPage >= allJobsTotalPages}
                    onClick={() => setAllJobsPage((p) => Math.min(allJobsTotalPages, p + 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: ALL CATALOGUED DATASETS MODAL (10 per page) */}
      {showAllDatasetsModal && (() => {
        const filteredCatalogDatasets = displayedDatasets.filter((d) => {
          if (!allDatasetsSearch.trim()) return true;
          const q = allDatasetsSearch.toLowerCase();
          return (
            (d.name && d.name.toLowerCase().includes(q)) ||
            (d.domain && d.domain.toLowerCase().includes(q)) ||
            (d.format && d.format.toLowerCase().includes(q)) ||
            (d.uploadedBy && d.uploadedBy.toLowerCase().includes(q)) ||
            (d.description && d.description.toLowerCase().includes(q)) ||
            (d.classes && d.classes.some((c) => c.toLowerCase().includes(q)))
          );
        });

        const allDatasetsTotalPages = Math.ceil(filteredCatalogDatasets.length / 10) || 1;
        const currentPage = Math.min(allDatasetsPage, allDatasetsTotalPages);
        const pagedAllDatasets = filteredCatalogDatasets.slice((currentPage - 1) * 10, currentPage * 10);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-3xl w-full border border-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">All Catalogued Datasets</h3>
                    <p className="text-xs text-slate-500">Registered dataset archives ({displayedDatasets.length} total)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAllDatasetsModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="pt-3 pb-1 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={allDatasetsSearch}
                    onChange={(e) => {
                      setAllDatasetsSearch(e.target.value);
                      setAllDatasetsPage(1);
                    }}
                    placeholder="Search datasets by name, domain, format, classes, or uploader..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder-slate-400 font-medium"
                  />
                  {allDatasetsSearch && (
                    <button
                      onClick={() => {
                        setAllDatasetsSearch('');
                        setAllDatasetsPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {filteredCatalogDatasets.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No matching datasets found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name, class, domain, or format.</p>
                  <button
                    onClick={() => {
                      setAllDatasetsSearch('');
                      setAllDatasetsPage(1);
                    }}
                    className="mt-3 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                  {pagedAllDatasets.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => {
                        setShowAllDatasetsModal(false);
                        handleOpenDatasetAnalysis(d);
                      }}
                      className="p-4 rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer shadow-xs group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">{d.name}</h4>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                              {d.domain || (d.category === 'tabular' ? 'Tabular' : 'Instance Segmentation / Object Detection')}
                            </span>
                            {(() => {
                              const ov = getDatasetOverlapInfo(d);
                              return ov ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80">
                                  {ov}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{formatDatasetDescription(d) || 'No description provided'}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2 font-medium">
                            <span>Uploaded by <strong className="text-slate-600">{d.uploadedBy}</strong></span>
                            <span>Size: <strong className="text-slate-600">{d.fileSizeMB} MB</strong></span>
                            <span>Format: <strong className="text-slate-600 uppercase">{d.format}</strong></span>
                          </div>
                        </div>
                        <span className="text-xs text-blue-600 font-bold group-hover:underline shrink-0">
                          View Analysis →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Pagination */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400 font-medium">
                  Showing {filteredCatalogDatasets.length === 0 ? 0 : (currentPage - 1) * 10 + 1} - {Math.min(filteredCatalogDatasets.length, currentPage * 10)} of {filteredCatalogDatasets.length} datasets
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setAllDatasetsPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    {currentPage} out of {allDatasetsTotalPages}
                  </span>
                  <button
                    disabled={currentPage >= allDatasetsTotalPages}
                    onClick={() => setAllDatasetsPage((p) => Math.min(allDatasetsTotalPages, p + 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 5: ALL TRAINING RESULTS MODAL (10 per page) */}
      {showAllResultsModal && (() => {
        const filteredCompletedRuns = completedRuns.filter((j) => {
          if (!allResultsSearch.trim()) return true;
          const q = allResultsSearch.toLowerCase();
          return (
            (j.name && j.name.toLowerCase().includes(q)) ||
            (j.datasetName && j.datasetName.toLowerCase().includes(q)) ||
            (j.submittedBy && j.submittedBy.toLowerCase().includes(q)) ||
            (j.taskType && j.taskType.toLowerCase().includes(q)) ||
            (j.id && j.id.toLowerCase().includes(q))
          );
        });
        const allResultsTotalPages = Math.ceil(filteredCompletedRuns.length / 10) || 1;
        const currentPage = Math.min(allResultsPage, allResultsTotalPages);
        const pagedAllResults = filteredCompletedRuns.slice((currentPage - 1) * 10, currentPage * 10);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-3xl w-full border border-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">All Completed Training Results</h3>
                    <p className="text-xs text-slate-500">Historical model training runs ({completedRuns.length} total)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAllResultsModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="pt-3 pb-1 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search completed runs by name, dataset, author, or task..."
                    value={allResultsSearch}
                    onChange={(e) => {
                      setAllResultsSearch(e.target.value);
                      setAllResultsPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 rounded-2xl border border-slate-200 text-xs bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                  />
                  {allResultsSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setAllResultsSearch('');
                        setAllResultsPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                {pagedAllResults.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No completed training runs match &quot;{allResultsSearch}&quot;
                  </div>
                ) : (
                  pagedAllResults.map((j) => {
                    const isSubmitterAlive = registeredUsersList.some(
                      (u) =>
                        (j.submittedById && u.id === j.submittedById) ||
                        (j.submittedBy && u.name && u.name.trim().toLowerCase() === j.submittedBy.trim().toLowerCase())
                    );
                    const isRunOwner = user && (
                      (user.id && j.submittedById && user.id === j.submittedById) ||
                      (user.name && j.submittedBy && user.name.trim().toLowerCase() === j.submittedBy.trim().toLowerCase()) ||
                      user.role === 'Admin' ||
                      !isSubmitterAlive
                    );

                    return (
                      <div
                        key={j.id}
                        onClick={() => {
                          setSelectedResultJob(j);
                          setShowAllResultsModal(false);
                        }}
                        className="p-4 rounded-2xl border border-slate-200/90 hover:border-emerald-400 hover:bg-emerald-50/20 transition-all cursor-pointer shadow-xs group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">{j.name}</h4>
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                {j.taskType || 'RF-DETR'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Dataset: <strong className="text-slate-700">{j.datasetName}</strong> • By: <strong className="text-slate-700">{j.submittedBy}</strong> • Completed: <strong className="text-slate-700">{j.completedAt ? new Date(j.completedAt).toLocaleDateString() : 'Recent'}</strong>
                            </p>
                            <div className="flex items-center gap-4 text-xs mt-2">
                              <span className="text-slate-400 font-medium">{j.totalEpochs} Epochs</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isRunOwner && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrainingResult(j.id, j.name);
                                }}
                                disabled={isDeletingResult}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                                title="Delete this training result"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            <span className="text-xs text-emerald-600 font-bold group-hover:underline">
                              Inspect Results →
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Pagination */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400 font-medium">
                  Showing {filteredCompletedRuns.length === 0 ? 0 : (currentPage - 1) * 10 + 1} - {Math.min(filteredCompletedRuns.length, currentPage * 10)} of {filteredCompletedRuns.length} runs
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setAllResultsPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    {currentPage} out of {allResultsTotalPages} pages
                  </span>
                  <button
                    disabled={currentPage >= allResultsTotalPages}
                    onClick={() => setAllResultsPage((p) => Math.min(allResultsTotalPages, p + 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 6: TARGET DATASET SELECTION POPUP WITH SEARCH & PAGINATION */}
      {targetDatasetPickerOpen && (() => {
        const isSeg = targetDatasetPickerTemplate === 'rfdetr_seg';
        const isBbox = targetDatasetPickerTemplate === 'rfdetr_bbox';
        const isClass = targetDatasetPickerTemplate === 'classification';
        const isSegSahi = targetDatasetPickerTemplate === 'rfdetr_seg_sahi';
        const isBboxSahi = targetDatasetPickerTemplate === 'rfdetr_bbox_sahi';

        const templateTitle = 'Select Dataset';

        const currentSelectedId = isSeg
          ? rfdetrForm.datasetId
          : isBbox
          ? rfdetrBboxForm.datasetId
          : isSegSahi
          ? rfdetrSegSahiForm.datasetId
          : isBboxSahi
          ? rfdetrBboxSahiForm.datasetId
          : classificationForm.datasetId;

        const checkCompatibility = (d: Dataset) => {
          if (isSeg || isBbox || isSegSahi || isBboxSahi) {
            return !(d.domain === 'Image Classification' || d.format === 'images_folder' || d.domain === 'Tabular' || d.format === 'csv');
          }
          if (isClass) {
            return !(d.domain === 'Instance Segmentation / Object Detection' || d.format === 'coco' || d.format === 'yolo' || d.domain === 'Tabular' || d.format === 'csv');
          }
          return true;
        };

        const filteredDatasets = datasets.filter((d) => {
          if (!datasetPickerSearch.trim()) return true;
          const q = datasetPickerSearch.toLowerCase();
          return (
            (d.name && d.name.toLowerCase().includes(q)) ||
            (d.domain && d.domain.toLowerCase().includes(q)) ||
            (d.format && d.format.toLowerCase().includes(q)) ||
            (d.uploadedBy && d.uploadedBy.toLowerCase().includes(q)) ||
            (d.description && d.description.toLowerCase().includes(q)) ||
            (d.classes && d.classes.some((c) => c.toLowerCase().includes(q)))
          );
        });

        const pickerPageSize = 5;
        const pickerTotalPages = Math.ceil(filteredDatasets.length / pickerPageSize) || 1;
        const currentPage = Math.min(datasetPickerPage, pickerTotalPages);
        const pagedDatasets = filteredDatasets.slice((currentPage - 1) * pickerPageSize, currentPage * pickerPageSize);

        const handleSelectDataset = (datasetId: string) => {
          if (isSeg) {
            setRfdetrForm((prev) => ({ ...prev, datasetId }));
          } else if (isBbox) {
            setRfdetrBboxForm((prev) => ({ ...prev, datasetId }));
          } else if (isSegSahi) {
            setRfdetrSegSahiForm((prev) => ({ ...prev, datasetId }));
          } else if (isBboxSahi) {
            setRfdetrBboxSahiForm((prev) => ({ ...prev, datasetId }));
          } else if (isClass) {
            setClassificationForm((prev) => ({ ...prev, datasetId }));
          }
          setTargetDatasetPickerOpen(false);
        };

        const themeColor = isSeg ? 'bg-blue-50 text-blue-600' : isBbox ? 'bg-emerald-50 text-emerald-600' : isSegSahi ? 'bg-purple-50 text-purple-600' : isBboxSahi ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-3xl w-full border border-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl ${themeColor}`}>
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{templateTitle}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetDatasetPickerOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="pt-3 pb-1 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={datasetPickerSearch}
                    onChange={(e) => {
                      setDatasetPickerSearch(e.target.value);
                      setDatasetPickerPage(1);
                    }}
                    placeholder="Search datasets by name, classes, domain, format, or uploader..."
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder-slate-400 font-medium"
                  />
                  {datasetPickerSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setDatasetPickerSearch('');
                        setDatasetPickerPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dataset List */}
              {filteredDatasets.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No matching datasets found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or format.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDatasetPickerSearch('');
                      setDatasetPickerPage(1);
                    }}
                    className="mt-3 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                  {pagedDatasets.map((d) => {
                    const isSelected = d.id === currentSelectedId;
                    const isCompatible = checkCompatibility(d);

                    return (
                      <div
                        key={d.id}
                        onClick={() => handleSelectDataset(d.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs flex items-center justify-between gap-4 group ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20'
                            : 'border-slate-200/90 hover:border-blue-400 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">
                              {d.name}
                            </h4>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {d.domain || d.format}
                            </span>
                            {(() => {
                              const ov = getDatasetOverlapInfo(d);
                              return ov ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80">
                                  {ov}
                                </span>
                              ) : null;
                            })()}
                            {isCompatible ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Compatible
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Format Mismatch
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {formatDatasetDescription(d) || 'No description provided'}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2 font-medium flex-wrap">
                            <span><strong className="text-slate-700">{d.sampleCount.toLocaleString()}</strong> samples</span>
                            <span>•</span>
                            <span><strong className="text-slate-700">{d.classes?.length || 0}</strong> classes {d.classes && d.classes.length > 0 && `(${d.classes.slice(0, 3).join(', ')}${d.classes.length > 3 ? '...' : ''})`}</span>
                            <span>•</span>
                            <span><strong className="text-slate-700">{d.fileSizeMB} MB</strong></span>
                            <span>•</span>
                            <span>Uploaded by <strong className="text-slate-700">{d.uploadedBy}</strong></span>
                          </div>
                        </div>

                        {/* Select Button */}
                        <div className="shrink-0">
                          {isSelected ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectDataset(d.id);
                              }}
                              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Selected</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectDataset(d.id);
                              }}
                              className={`px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer ${
                                isCompatible
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                              }`}
                            >
                              Select
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Pagination with Navigation Icons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400 font-medium">
                  Showing {filteredDatasets.length === 0 ? 0 : (currentPage - 1) * pickerPageSize + 1} - {Math.min(filteredDatasets.length, currentPage * pickerPageSize)} of {filteredDatasets.length} datasets
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setDatasetPickerPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    Page {currentPage} out of {pickerTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pickerTotalPages}
                    onClick={() => setDatasetPickerPage((p) => Math.min(pickerTotalPages, p + 1))}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
