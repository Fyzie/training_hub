import fs from 'fs';
import path from 'path';
import { TrainingJob, Dataset, HardwareItem, BlogPost, StaffUser, PendingUser } from './types';
import { DATA_DIR, ensureStorageHub } from './storage';

function ensureDir(dirPath: string) {
  ensureStorageHub();
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile<T>(fileName: string, defaultData: T): T {
  ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    // Check if initial template exists in repo's local data/ directory
    try {
      const localDataPath = path.join(process.cwd(), 'data', fileName);
      if (fs.existsSync(localDataPath)) {
        const initialContent = fs.readFileSync(localDataPath, 'utf-8');
        fs.writeFileSync(filePath, initialContent, 'utf-8');
        return JSON.parse(initialContent) as T;
      }
    } catch {}
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err);
    return defaultData;
  }
}

function writeJsonFile<T>(fileName: string, data: T): void {
  ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export const dataStore = {
  // Users
  getUsers: (): StaffUser[] => {
    const users = readJsonFile<StaffUser[]>('users.json', []);
    let modified = false;
    users.forEach((u) => {
      if (!u.level) {
        u.level = (u.name.toLowerCase().includes('hafizi') || u.role === 'Admin') ? 'Admin' : 'Guest';
        modified = true;
      }
    });
    if (modified) {
      writeJsonFile('users.json', users);
    }
    return users;
  },
  saveUsers: (users: StaffUser[]) => writeJsonFile('users.json', users),
  addUser: (user: StaffUser) => {
    const users = dataStore.getUsers();
    users.push(user);
    dataStore.saveUsers(users);
    return user;
  },
  deleteUser: (id: string) => {
    const users = dataStore.getUsers().filter((u) => u.id !== id);
    dataStore.saveUsers(users);
    return true;
  },
  updateUserLevel: (id: string, level: 'Admin' | 'Guest') => {
    const users = dataStore.getUsers();
    const target = users.find((u) => u.id === id);
    if (target) {
      target.level = level;
      dataStore.saveUsers(users);
      return target;
    }
    return null;
  },

  // Pending Users (Require approval from existing users)
  getPendingUsers: (): PendingUser[] => readJsonFile<PendingUser[]>('pending_users.json', []),
  savePendingUsers: (items: PendingUser[]) => writeJsonFile('pending_users.json', items),
  addPendingUser: (user: PendingUser) => {
    const list = dataStore.getPendingUsers();
    list.unshift(user);
    dataStore.savePendingUsers(list);
    return user;
  },
  approvePendingUser: (id: string, approvedBy: string, level: 'Admin' | 'Guest' = 'Guest') => {
    const pendingList = dataStore.getPendingUsers();
    const item = pendingList.find((p) => p.id === id);
    if (!item) return null;

    item.status = 'approved';
    item.approvedBy = approvedBy;
    item.approvedAt = new Date().toISOString();
    item.level = level;
    dataStore.savePendingUsers(pendingList);

    // Transfer into approved users.json
    const users = dataStore.getUsers();
    const alreadyExists = users.find((u) => u.email.toLowerCase() === item.email.toLowerCase());
    let staffUser: StaffUser;
    if (!alreadyExists) {
      staffUser = {
        id: item.id,
        name: item.name,
        email: item.email,
        password: item.password,
        role: item.role,
        level: level,
        avatar: '',
        department: item.department,
        joinedAt: new Date().toISOString().split('T')[0]
      };
      users.push(staffUser);
      dataStore.saveUsers(users);
    } else {
      alreadyExists.level = level;
      dataStore.saveUsers(users);
      staffUser = alreadyExists;
    }
    return { pendingUser: item, staffUser };
  },
  rejectPendingUser: (id: string, rejectedBy: string) => {
    const pendingList = dataStore.getPendingUsers();
    const item = pendingList.find((p) => p.id === id);
    if (!item) return null;
    item.status = 'rejected';
    item.approvedBy = rejectedBy;
    item.approvedAt = new Date().toISOString();
    dataStore.savePendingUsers(pendingList);
    return item;
  },

  // Datasets
  getDatasets: (): Dataset[] => {
    const list = readJsonFile<Dataset[]>('datasets.json', []);
    let modified = false;
    list.forEach((d) => {
      if (d.filePath) {
        const norm = d.filePath.replace(/\\/g, '/');
        const match = norm.match(/\/uploads\/datasets\/.*$/i);
        if (match && d.filePath !== match[0]) {
          d.filePath = match[0];
          modified = true;
        } else if (!norm.startsWith('/uploads/') && norm.includes('/datasets/')) {
          const sub = norm.substring(norm.indexOf('/datasets/'));
          const clean = '/uploads' + sub;
          if (d.filePath !== clean) {
            d.filePath = clean;
            modified = true;
          }
        }
      }
    });
    if (modified) {
      writeJsonFile('datasets.json', list);
    }
    return list;
  },
  saveDatasets: (datasets: Dataset[]) => writeJsonFile('datasets.json', datasets),
  addDataset: (dataset: Dataset) => {
    const datasets = dataStore.getDatasets();
    datasets.unshift(dataset);
    dataStore.saveDatasets(datasets);
    return dataset;
  },
  deleteDataset: (id: string) => {
    const datasets = dataStore.getDatasets().filter((d) => d.id !== id);
    dataStore.saveDatasets(datasets);
    return true;
  },

  // Jobs
  getJobs: (): TrainingJob[] => readJsonFile<TrainingJob[]>('jobs.json', []),
  saveJobs: (jobs: TrainingJob[]) => writeJsonFile('jobs.json', jobs),
  getJobById: (id: string): TrainingJob | undefined => {
    return dataStore.getJobs().find((j) => j.id === id);
  },
  addJob: (job: TrainingJob) => {
    const jobs = dataStore.getJobs();
    jobs.unshift(job);
    dataStore.saveJobs(jobs);
    return job;
  },
  updateJob: (id: string, updates: Partial<TrainingJob>) => {
    const jobs = dataStore.getJobs();
    const index = jobs.findIndex((j) => j.id === id);
    if (index !== -1) {
      jobs[index] = { ...jobs[index], ...updates };
      dataStore.saveJobs(jobs);
      return jobs[index];
    }
    return null;
  },
  clearFailedAndCancelledJobs: () => {
    const jobs = dataStore.getJobs();
    const remaining = jobs.filter((j) => j.status !== 'failed' && j.status !== 'cancelled');
    const removedCount = jobs.length - remaining.length;
    dataStore.saveJobs(remaining);
    return { remaining, removedCount };
  },

  // Hardware
  getHardware: (): HardwareItem[] => readJsonFile<HardwareItem[]>('hardware.json', []),
  saveHardware: (items: HardwareItem[]) => writeJsonFile('hardware.json', items),
  addHardware: (item: HardwareItem) => {
    const items = dataStore.getHardware();
    items.unshift(item);
    dataStore.saveHardware(items);
    return item;
  },
  updateHardware: (id: string, updates: Partial<HardwareItem>) => {
    const items = dataStore.getHardware();
    const index = items.findIndex((h) => h.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      dataStore.saveHardware(items);
      return items[index];
    }
    return null;
  },

  // Blogs
  getBlogs: (): BlogPost[] => {
    const list = readJsonFile<BlogPost[]>('blogs.json', []);
    let modified = false;
    list.forEach((b) => {
      if (b.author?.avatar && b.author.avatar.includes('images.unsplash.com')) {
        b.author.avatar = '';
        modified = true;
      }
    });
    if (modified) {
      writeJsonFile('blogs.json', list);
    }
    return list;
  },
  saveBlogs: (blogs: BlogPost[]) => writeJsonFile('blogs.json', blogs),
  addBlog: (blog: BlogPost) => {
    const blogs = dataStore.getBlogs();
    blogs.unshift(blog);
    dataStore.saveBlogs(blogs);
    return blog;
  },
  updateBlog: (id: string, updates: Partial<BlogPost>) => {
    const blogs = dataStore.getBlogs();
    const index = blogs.findIndex((b) => b.id === id);
    if (index !== -1) {
      blogs[index] = { ...blogs[index], ...updates };
      dataStore.saveBlogs(blogs);
      return blogs[index];
    }
    return null;
  }
};
