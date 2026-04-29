import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "data", "logs");
const LOG_FILE = path.join(LOG_DIR, "gacha-batch.log");

export interface GachaLogMeta {
  batchId?: string;
  promptId?: string;
  taskId?: string;
  step?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function write(level: "INFO" | "WARN" | "ERROR", message: string, meta?: GachaLogMeta) {
  const time = new Date().toISOString();
  const payload = {
    time,
    level,
    message,
    ...(meta || {}),
  };

  const line = JSON.stringify(payload);

  if (level === "ERROR") {
    console.error(`[GACHA][${level}] ${message}`, meta || "");
  } else if (level === "WARN") {
    console.warn(`[GACHA][${level}] ${message}`, meta || "");
  } else {
    console.log(`[GACHA][${level}] ${message}`, meta || "");
  }

  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf-8");
  } catch (e) {
    console.error("[GACHA][ERROR] 写入日志文件失败", e);
  }
}

export const gachaLog = {
  info: (message: string, meta?: GachaLogMeta) => write("INFO", message, meta),
  warn: (message: string, meta?: GachaLogMeta) => write("WARN", message, meta),
  error: (message: string, meta?: GachaLogMeta) => write("ERROR", message, meta),
};
