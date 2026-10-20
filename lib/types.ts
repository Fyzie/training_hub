export interface SystemMetrics {
  gpu: {
    available: boolean;
    name: string;
    temperature: number; // °C
    utilization: number; // %
    memoryUtilization: number; // %
    memoryTotal: number; // MB
    memoryUsed: number; // MB
    memoryFree: number; // MB
    powerDraw: number; // Watts
    powerLimit: number; // Watts
    fanSpeed: number; // %
  };
  cpu: {
    model: string;
    cores: number;
    usagePercent: number;
    clockSpeed?: number;
  };
  ram: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
  };
  os: {
    platform: string;
    hostname: string;
    uptimeSeconds: number;
  };
  network: {
    localIp: string;
    port: number;
    tunnelActive: boolean;
    tunnelUrl?: string;
  };
  specs?: {
    gpuArchitecture: string;
    hostProcessor: string;
    systemMemory: string;
    storageArray: string;
    gateway: string;
  };
  timestamp: string;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type TaskCategory = 'vision' | 'tabular' | 'nlp' | 'custom';

export interface TrainingMetricPoint {
  epoch: number;
  loss: number;
  valLoss?: number;
  accuracy?: number;
  valAccuracy?: number;
  learningRate?: number;
  timestamp: string;
}

export interface TrainingJob {
  id: string;
  name: string;
  category: TaskCategory;
  taskType: string; // e.g. 'YOLOv8 Detection', 'ResNet Classification', 'XGBoost Tabular', 'BERT NER'
  datasetId: string;
  datasetName: string;
  status: JobStatus;
  progressPercent: number;
  currentEpoch: number;
  totalEpochs: number;
  batchSize: number;
  learningRate: number;
  optimizer: string;
  device: string;
  deviceName?: string;
  submittedBy: string;
  submittedById?: string;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedRemainingSec?: number;
  metricsHistory: TrainingMetricPoint[];
  logs: string[];
  checkpointPath?: string;
  resultFolderUrl?: string;
  resultZipUrl?: string;
  valComparisonUrl?: string;
  bestLoss?: number;
  accuracy?: number;
  valAccuracy?: number;
  mAP50?: number;
  mAP50_95?: number;
  mIoU?: number;
  diceScore?: number;
  confusionMatrix?: {
    classes: string[];
    matrix: number[][];
    total_samples?: number;
    accuracy?: number;
    precision?: Record<string, number>;
    recall?: Record<string, number>;
    f1_score?: Record<string, number>;
  };
  validationSamples?: Array<{
    inputImage: string;
    groundTruthMask: string;
    predictedMask: string;
    iou: number;
    confidence: number;
    classLabel: string;
  }>;
  hyperparameters: Record<string, any>;
  description?: string;
  stage?: 'unzipping' | 'preparing' | 'training' | 'completed';
}

export interface Dataset {
  id: string;
  name: string;
  category: TaskCategory;
  description: string;
  format: 'yolo' | 'coco' | 'csv' | 'images_folder' | 'json';
  fileSizeMB: number;
  sampleCount: number;
  uploadedBy: string;
  uploadedAt: string;
  filePath?: string;
  classes?: string[];
  splits?: { train: number; val: number; test?: number };
  isUploading?: boolean;
  uploadProgress?: number;
  uploadStatusText?: string;
}

export type HardwareStatus = 'available' | 'in_use' | 'maintenance' | 'onsite' | 'deployed_forever';

export interface HardwareBorrowRecord {
  id: string;
  type: 'borrow' | 'takeout_onsite' | 'takeout_forever';
  quantity: number;
  assignedTo: string;
  assignedDate: string;
  expectedReturnDate?: string;
  returnedDate?: string;
  purpose: string;
  projectName?: string;
  onsiteLocation?: string;
  status: 'active' | 'returned';
}

export type HardwareCategory =
  | 'Edge Device'
  | 'Camera'
  | 'Lenses'
  | 'Lighting'
  | 'Peripheral'
  | string;

export interface HardwareItem {
  id: string;
  assetTag: string; // e.g. "EDGE-001", "CAM-004", "LENS-02"
  name: string;
  category: HardwareCategory;
  specs: string; // e.g. "NVIDIA RTX 3060 12GB GDDR6"
  status: HardwareStatus;
  location: string; // e.g. "Office Server Rack 1", "AI Lab Desk 3"
  serialNumber: string;
  quantity: number; // total units
  availableQuantity: number; // available units
  assignedTo?: string; // staff user name
  assignedDate?: string;
  expectedReturnDate?: string;
  purpose?: string;
  notes?: string;
  link?: string;
  healthStatus: 'optimal' | 'good' | 'warning' | 'needs_service';
  borrowHistory?: HardwareBorrowRecord[];
}

export type GuidanceCategory =
  | 'Guidance'
  | 'Hardware Setup'
  | 'Software Setup'
  | 'SOP'
  | string;

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string; // Markdown or rich text
  category: GuidanceCategory;
  tags: string[];
  author: {
    id: string;
    name: string;
    avatar: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
  hasAttachment: boolean;
  attachment?: {
    name: string;
    url: string;
    fileType: 'pdf' | 'docx' | 'pptx' | 'zip' | 'md' | 'py' | 'other' | string;
    sizeMB: number;
  };
  coverImage?: string;
  views: number;
  likes: number;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'General' | 'ML Engineer' | 'System Engineer' | 'Labeller' | 'Admin' | string;
  level: 'Admin' | 'Guest';
  avatar?: string;
  department: string;
  joinedAt: string;
}

export interface PendingUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'General' | 'ML Engineer' | 'System Engineer' | 'Labeller' | 'Admin' | string;
  level?: 'Admin' | 'Guest';
  department: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
}

