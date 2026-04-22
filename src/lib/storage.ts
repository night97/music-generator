import fs from "fs";
import path from "path";

// 数据存储目录
const DATA_DIR = path.join(process.cwd(), "data");
const AUDIO_DIR = path.join(process.cwd(), "public", "generated");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

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
