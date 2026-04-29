import fs from "fs";
import path from "path";

// 数据存储目录
const DATA_DIR = path.join(process.cwd(), "data");
const AUDIO_DIR = path.join(process.cwd(), "public", "generated");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const GACHA_BATCHES_FILE = path.join(DATA_DIR, "gacha_batches.json");

// 确保目录存在
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

// 任务状态枚举
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

// 任务记录接口
export interface MusicTask {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  audioUrl?: string;
  audioBase64?: string;
  outputFormat?: "url" | "hex";
  aigcWatermark?: boolean;
  // 完成后的结果
  audioFile?: string;  // 本地文件路径 (hex 模式)
  audioUrlResult?: string;  // API 返回的 URL (url 模式)
  musicDuration?: number;
  musicSize?: number;
  traceId?: string;
  // 错误信息
  error?: string;
  // MiniMax 原始 trace_id
  apiTraceId?: string;
}

// 调用记录接口（用于历史记录页面）
export interface GenerationRecord {
  id: string;
  taskId: string;
  createdAt: string;
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  traceId: string;
  audioFile: string;
  audioUrlResult?: string;  // API 返回的 URL (url 模式)
  musicDuration?: number;
  musicSize?: number;
}

export type GachaItemStatus = "pending" | "generating" | "completed" | "failed";
export type GachaQualityStrictness = "loose" | "standard" | "strict";

export interface GachaBatchItem {
  promptId: string;
  prompt: string;
  originalPrompt?: string;
  optimizedPrompt?: string;
  optimizationNotes?: string;
  theme: string;
  style: string;
  taskId?: string;
  status: GachaItemStatus;
  audioUrl?: string;
  audioPath?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface GachaBatch {
  id: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  completed: number;
  failed: number;
  status: "pending" | "generating" | "completed" | "stopped";
  stopRequested?: boolean;
  timeoutMinutes: number;
  qualityStrictness: GachaQualityStrictness;
  items: GachaBatchItem[];
}

// ===== 任务管理函数 =====

// 获取所有任务
export function getAllTasks(): MusicTask[] {
  ensureDirs();
  if (!fs.existsSync(TASKS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(TASKS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存任务
function saveTask(task: MusicTask): void {
  ensureDirs();
  const tasks = getAllTasks();
  const index = tasks.findIndex((t) => t.id === task.id);
  if (index >= 0) {
    tasks[index] = task;
  } else {
    tasks.unshift(task);
  }
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// 创建新任务
export function createTask(params: {
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  audioUrl?: string;
  audioBase64?: string;
  outputFormat?: "url" | "hex";
  aigcWatermark?: boolean;
}): MusicTask {
  const task: MusicTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...params,
  };
  saveTask(task);
  return task;
}

// 获取任务状态
export function getTaskStatus(taskId: string): MusicTask | null {
  const tasks = getAllTasks();
  return tasks.find((t) => t.id === taskId) || null;
}

// 更新任务状态
export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  updates?: Partial<MusicTask>
): MusicTask | null {
  const tasks = getAllTasks();
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;

  const task = {
    ...tasks[index],
    status,
    updatedAt: new Date().toISOString(),
    ...updates,
  };
  tasks[index] = task;
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  return task;
}

// 标记任务处理中
export function markTaskProcessing(taskId: string, apiTraceId?: string): MusicTask | null {
  return updateTaskStatus(taskId, "processing", { apiTraceId });
}

// 标记任务完成
export function markTaskCompleted(
  taskId: string,
  audioFile: string,
  musicDuration?: number,
  musicSize?: number,
  traceId?: string,
  audioUrlResult?: string
): MusicTask | null {
  const task = updateTaskStatus(taskId, "completed", {
    audioFile,
    audioUrlResult,
    musicDuration,
    musicSize,
    traceId,
  });
  if (task) {
    // 同时保存到历史记录
    saveRecord({
      id: `rec_${Date.now()}`,
      taskId,
      createdAt: new Date().toISOString(),
      model: task.model,
      prompt: task.prompt,
      lyrics: task.lyrics,
      isInstrumental: task.isInstrumental,
      sampleRate: task.sampleRate,
      bitrate: task.bitrate,
      format: task.format,
      traceId: traceId || "",
      audioFile,
      audioUrlResult,
      musicDuration,
      musicSize,
    });
  }
  return task;
}

// 标记任务失败
export function markTaskFailed(taskId: string, error: string): MusicTask | null {
  return updateTaskStatus(taskId, "failed", { error });
}

// ===== 历史记录函数 =====

// 获取所有记录
export function getAllRecords(): GenerationRecord[] {
  ensureDirs();
  if (!fs.existsSync(RECORDS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(RECORDS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存记录
export function saveRecord(record: GenerationRecord): void {
  ensureDirs();
  const records = getAllRecords();
  records.unshift(record);
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
}

// 获取单条记录
export function getRecordById(id: string): GenerationRecord | null {
  const records = getAllRecords();
  return records.find((r) => r.id === id) || null;
}

export function updateTaskLyrics(taskId: string, lyrics: string): MusicTask | null {
  const tasks = getAllTasks();
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  tasks[index] = {
    ...tasks[index],
    lyrics,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  return tasks[index];
}

export function updateRecordLyricsByTaskId(taskId: string, lyrics: string): void {
  const records = getAllRecords();
  let changed = false;
  for (let i = 0; i < records.length; i++) {
    if (records[i].taskId === taskId) {
      records[i] = { ...records[i], lyrics };
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
  }
}

// 删除记录（同时删除音频文件）
export function deleteRecord(id: string): boolean {
  const records = getAllRecords();
  const index = records.findIndex((r) => r.id === id);

  if (index === -1) return false;

  const record = records[index];

  // 删除音频文件
  const audioPath = path.join(process.cwd(), "public", record.audioFile);
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  records.splice(index, 1);
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));

  return true;
}

// 获取统计信息
export function getStats() {
  const records = getAllRecords();
  return {
    totalGenerations: records.length,
    instrumentalCount: records.filter((r) => r.isInstrumental).length,
    vocalCount: records.filter((r) => !r.isInstrumental).length,
    totalDuration: records.reduce((acc, r) => acc + (r.musicDuration || 0), 0),
    totalSize: records.reduce((acc, r) => acc + (r.musicSize || 0), 0),
  };
}

// 保存音频文件
export function saveAudioFile(audioHex: string, format: string): string {
  ensureDirs();

  const timestamp = Date.now();
  const filename = `music_${timestamp}.${format}`;
  const filepath = path.join(AUDIO_DIR, filename);

  const buffer = Buffer.from(audioHex, "hex");
  fs.writeFileSync(filepath, buffer);

  return `/generated/${filename}`;
}

// ===== 抽卡批次函数 =====
export function getAllGachaBatches(): GachaBatch[] {
  ensureDirs();
  if (!fs.existsSync(GACHA_BATCHES_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(GACHA_BATCHES_FILE, "utf-8");
    const parsed = JSON.parse(data) as GachaBatch[];
    // 兼容历史数据：旧批次没有 qualityStrictness 时默认 standard
    return parsed.map((batch) => ({
      ...batch,
      qualityStrictness: batch.qualityStrictness || "standard",
    }));
  } catch {
    return [];
  }
}

function saveAllGachaBatches(batches: GachaBatch[]): void {
  ensureDirs();
  fs.writeFileSync(GACHA_BATCHES_FILE, JSON.stringify(batches, null, 2));
}

export function createGachaBatch(
  theme: string,
  prompts: { id: string; prompt: string; theme: string; style: string }[],
  timeoutMinutes = 8,
  qualityStrictness: GachaQualityStrictness = "standard"
): GachaBatch {
  const now = new Date().toISOString();
  const batch: GachaBatch = {
    id: `gacha_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    theme,
    createdAt: now,
    updatedAt: now,
    total: prompts.length,
    completed: 0,
    failed: 0,
    status: "pending",
    stopRequested: false,
    timeoutMinutes,
    qualityStrictness,
    items: prompts.map((p) => ({
      promptId: p.id,
      prompt: p.prompt,
      theme: p.theme,
      style: p.style,
      status: "pending",
    })),
  };

  const batches = getAllGachaBatches();
  batches.unshift(batch);
  saveAllGachaBatches(batches);
  return batch;
}

export function getGachaBatchById(batchId: string): GachaBatch | null {
  const batches = getAllGachaBatches();
  return batches.find((b) => b.id === batchId) || null;
}

export function updateGachaBatchItem(
  batchId: string,
  promptId: string,
  updates: Partial<GachaBatchItem>
): GachaBatch | null {
  const batches = getAllGachaBatches();
  const batchIndex = batches.findIndex((b) => b.id === batchId);
  if (batchIndex < 0) return null;

  const batch = batches[batchIndex];
  const itemIndex = batch.items.findIndex((i) => i.promptId === promptId);
  if (itemIndex < 0) return null;

  batch.items[itemIndex] = {
    ...batch.items[itemIndex],
    ...updates,
  };

  const completed = batch.items.filter((i) => i.status === "completed").length;
  const failed = batch.items.filter((i) => i.status === "failed").length;
  const generating = batch.items.some((i) => i.status === "generating");
  const hasPending = batch.items.some((i) => i.status === "pending");

  batch.completed = completed;
  batch.failed = failed;
  if (!hasPending && !generating) {
    batch.status = "completed";
  } else if (batch.stopRequested) {
    batch.status = "stopped";
  } else if (completed > 0 || failed > 0 || generating) {
    batch.status = "generating";
  } else {
    batch.status = "pending";
  }

  batch.updatedAt = new Date().toISOString();
  batches[batchIndex] = batch;
  saveAllGachaBatches(batches);
  return batch;
}

export function updateGachaBatchMeta(
  batchId: string,
  updates: Partial<GachaBatch>
): GachaBatch | null {
  const batches = getAllGachaBatches();
  const batchIndex = batches.findIndex((b) => b.id === batchId);
  if (batchIndex < 0) return null;

  const batch = {
    ...batches[batchIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  batches[batchIndex] = batch;
  saveAllGachaBatches(batches);
  return batch;
}

export function rollbackGeneratingItemsToPending(batchId: string): GachaBatch | null {
  const batches = getAllGachaBatches();
  const batchIndex = batches.findIndex((b) => b.id === batchId);
  if (batchIndex < 0) return null;

  const batch = batches[batchIndex];
  batch.items = batch.items.map((item) => {
    if (item.status !== "generating") return item;
    return {
      ...item,
      status: "pending",
      startedAt: undefined,
      finishedAt: undefined,
      error: undefined,
    };
  });

  const completed = batch.items.filter((i) => i.status === "completed").length;
  const failed = batch.items.filter((i) => i.status === "failed").length;
  const hasPending = batch.items.some((i) => i.status === "pending");
  batch.completed = completed;
  batch.failed = failed;
  batch.status = hasPending ? "stopped" : "completed";
  batch.updatedAt = new Date().toISOString();

  batches[batchIndex] = batch;
  saveAllGachaBatches(batches);
  return batch;
}

export function rollbackFailedItemsToPending(batchId: string): GachaBatch | null {
  const batches = getAllGachaBatches();
  const batchIndex = batches.findIndex((b) => b.id === batchId);
  if (batchIndex < 0) return null;

  const batch = batches[batchIndex];
  batch.items = batch.items.map((item) => {
    if (item.status !== "failed") return item;
    return {
      ...item,
      status: "pending",
      error: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    };
  });

  const completed = batch.items.filter((i) => i.status === "completed").length;
  const failed = batch.items.filter((i) => i.status === "failed").length;
  const generating = batch.items.some((i) => i.status === "generating");
  const hasPending = batch.items.some((i) => i.status === "pending");
  batch.completed = completed;
  batch.failed = failed;
  if (!hasPending && !generating) {
    batch.status = "completed";
  } else if (batch.stopRequested) {
    batch.status = "stopped";
  } else {
    batch.status = "generating";
  }
  batch.updatedAt = new Date().toISOString();

  batches[batchIndex] = batch;
  saveAllGachaBatches(batches);
  return batch;
}
