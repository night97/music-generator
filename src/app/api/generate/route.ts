import { NextRequest, NextResponse } from "next/server";
import {
  createTask,
  markTaskProcessing,
  markTaskCompleted,
  markTaskFailed,
  saveAudioFile,
  updateTaskLyrics,
  updateRecordLyricsByTaskId,
} from "@/lib/storage";

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/music_generation";
const MINIMAX_COVER_PREPROCESS_URL = "https://api.minimaxi.com/v1/music_cover_preprocess";

interface MiniMaxResponse {
  data?: {
    status: number;
    audio?: string;
    lyrics?: string;
    generated_lyrics?: string;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  extra_info?: {
    music_duration?: number;
    music_sample_rate?: number;
    music_channel?: number;
    bitrate?: number;
    music_size?: number;
  };
  trace_id?: string;
  lyrics?: string;
  generated_lyrics?: string;
  result?: {
    lyrics?: string;
    generated_lyrics?: string;
  };
}

interface MiniMaxCoverPreprocessResponse {
  cover_feature_id?: string;
  formatted_lyrics?: string;
  audio_duration?: number;
  structure_result?: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

type GenerateLogLevel = "INFO" | "WARN" | "ERROR";

function generateLog(level: GenerateLogLevel, message: string, payload?: Record<string, unknown>) {
  const prefix = `[GENERATE][${level}] ${message}`;
  if (!payload) {
    console.log(prefix);
    return;
  }
  if (level === "ERROR") {
    console.error(prefix, payload);
  } else if (level === "WARN") {
    console.warn(prefix, payload);
  } else {
    console.log(prefix, payload);
  }
}

function safeAudioUrl(url?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.slice(0, 140);
  } catch {
    return url.slice(0, 80);
  }
}

function summarizeRequest(params: any): Record<string, unknown> {
  return {
    model: params.model,
    outputFormat: params.outputFormat || "hex",
    format: params.format || "mp3",
    sampleRate: params.sampleRate || 44100,
    bitrate: params.bitrate || 256000,
    promptLength: typeof params.prompt === "string" ? params.prompt.length : 0,
    lyricsLength: typeof params.lyrics === "string" ? params.lyrics.length : 0,
    hasAudioUrl: Boolean(params.audioUrl),
    audioUrl: safeAudioUrl(params.audioUrl),
    hasAudioBase64: Boolean(params.audioBase64),
    audioBase64Length: typeof params.audioBase64 === "string" ? params.audioBase64.length : 0,
  };
}

function extractLyrics(data: MiniMaxResponse): string | undefined {
  const candidates = [
    data.data?.lyrics,
    data.data?.generated_lyrics,
    data.lyrics,
    data.generated_lyrics,
    data.result?.lyrics,
    data.result?.generated_lyrics,
  ];
  return candidates.find((v) => typeof v === "string" && v.trim().length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, prompt, lyrics, isInstrumental, lyricsOptimizer, sampleRate, bitrate, format, outputFormat, aigcWatermark, audioUrl, audioBase64 } = body;

    if (!model || !prompt) {
      return NextResponse.json(
        { error: "缺少必需参数 model 或 prompt" },
        { status: 400 }
      );
    }

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "未配置 API Key" },
        { status: 500 }
      );
    }

    const task = createTask({
      model,
      prompt,
      lyrics: lyrics || "",
      isInstrumental: isInstrumental || false,
      sampleRate: sampleRate || 44100,
      bitrate: bitrate || 256000,
      format: format || "mp3",
      audioUrl,
      audioBase64,
      outputFormat,
      aigcWatermark,
    });

    console.log(`创建任务: ${task.id}`);

    processMusicGeneration(task.id, apiKey, {
      model,
      prompt,
      lyrics,
      isInstrumental,
      lyricsOptimizer,
      sampleRate,
      bitrate,
      format,
      outputFormat,
      aigcWatermark,
      audioUrl,
      audioBase64,
    }).catch((error) => {
      console.error(`任务 ${task.id} 处理失败:`, error);
      markTaskFailed(task.id, error instanceof Error ? error.message : "未知错误");
    });

    return NextResponse.json({
      success: true,
      taskId: task.id,
      message: "任务已创建，正在后台处理",
    });
  } catch (error) {
    console.error("API 路由错误:", error);
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}

class ConcurrencyLimiter {
  private activeRequests = 0;
  private maxConcurrent: number;
  private queue: (() => void)[] = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire() {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.activeRequests--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.activeRequests++;
        next();
      }
    }
  }
}

const limiter = new ConcurrencyLimiter(1);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("socket") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("closed") ||
    m.includes("hang up") ||
    m.includes("reset")
  );
}

async function runCoverPreprocessWithRetry(
  taskId: string,
  apiKey: string,
  body: any
): Promise<MiniMaxCoverPreprocessResponse> {
  let retries = 3;
  let delay = 3000;
  let lastError: unknown;
  const startedAt = Date.now();

  while (retries > 0) {
    const attempt = 4 - retries;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      generateLog("INFO", "cover 预处理开始", {
        taskId,
        attempt,
        retriesLeft: retries - 1,
        hasAudioUrl: Boolean(body.audio_url),
        audioUrl: safeAudioUrl(body.audio_url),
        hasAudioBase64: Boolean(body.audio_base64),
      });
      const preprocessRes = await fetch(MINIMAX_COVER_PREPROCESS_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!preprocessRes.ok) {
        const text = await preprocessRes.text();
        throw new Error(`cover 预处理 HTTP ${preprocessRes.status}: ${text}`);
      }

      const preprocessData = (await preprocessRes.json()) as MiniMaxCoverPreprocessResponse;
      if (preprocessData.base_resp?.status_code !== 0 || !preprocessData.cover_feature_id) {
        throw new Error(
          `cover 预处理失败: ${preprocessData.base_resp?.status_msg || "未返回 cover_feature_id"}`
        );
      }
      generateLog("INFO", "cover 预处理成功", {
        taskId,
        attempt,
        durationMs: Date.now() - startedAt,
        coverFeatureId: preprocessData.cover_feature_id.slice(0, 12),
        audioDuration: preprocessData.audio_duration,
        hasFormattedLyrics: Boolean(preprocessData.formatted_lyrics?.trim()),
      });
      return preprocessData;
    } catch (e: any) {
      lastError = e;
      const msg = e instanceof Error ? e.message : "未知错误";
      generateLog("WARN", "cover 预处理失败，准备重试", {
        taskId,
        attempt,
        retriesLeft: retries - 1,
        error: msg,
      });
      if (!isTransientNetworkError(msg) && retries <= 1) {
        break;
      }
      retries--;
      if (retries > 0) {
        await sleep(delay);
        delay *= 2;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("cover 预处理失败");
}

async function processMusicGeneration(
  taskId: string,
  apiKey: string,
  params: any
) {
  const taskStartedAt = Date.now();
  try {
    await limiter.acquire();
    markTaskProcessing(taskId);
    generateLog("INFO", "任务开始处理", {
      taskId,
      ...summarizeRequest(params),
    });

    try {
      const isCoverModel = params.model === "music-cover" || params.model === "music-cover-free";
      const requestBody: any = {
        model: params.model,
        prompt: params.prompt,
        output_format: params.outputFormat || "hex",
      };

      if (params.isInstrumental !== undefined) requestBody.is_instrumental = params.isInstrumental;
      if (params.lyricsOptimizer !== undefined) requestBody.lyrics_optimizer = params.lyricsOptimizer;
      if (params.aigcWatermark !== undefined) requestBody.aigc_watermark = params.aigcWatermark;

      requestBody.audio_setting = {
        sample_rate: params.sampleRate || 44100,
        bitrate: params.bitrate || 256000,
        format: params.format || "mp3",
      };

      if (params.lyrics && !params.isInstrumental && !params.lyricsOptimizer) {
        requestBody.lyrics = params.lyrics;
      }

      // music-cover 走官方两步流程：先 preprocess 获取 cover_feature_id，再 generation
      if (isCoverModel) {
        if (!params.audioUrl && !params.audioBase64) {
          throw new Error("music-cover 缺少参考音频，请提供 audioUrl 或 audioBase64");
        }
        const preprocessBody: any = { model: params.model };
        if (params.audioUrl) preprocessBody.audio_url = params.audioUrl;
        if (params.audioBase64) preprocessBody.audio_base64 = params.audioBase64;

        const preprocessData = await runCoverPreprocessWithRetry(taskId, apiKey, preprocessBody);
        requestBody.cover_feature_id = preprocessData.cover_feature_id;
        if (params.lyrics?.trim()) {
          requestBody.lyrics = params.lyrics.trim();
        } else if (preprocessData.formatted_lyrics?.trim()) {
          requestBody.lyrics = preprocessData.formatted_lyrics.trim();
        } else {
          throw new Error("cover 预处理未返回可用歌词，请手动填写歌词后重试");
        }
        generateLog("INFO", "cover 参数注入完成", {
          taskId,
          coverFeatureId: requestBody.cover_feature_id?.slice(0, 12),
          lyricsLength: typeof requestBody.lyrics === "string" ? requestBody.lyrics.length : 0,
        });
      }

      generateLog("INFO", "开始调用 MiniMax 生成接口", {
        taskId,
        model: requestBody.model,
        outputFormat: requestBody.output_format,
      });

      let data: MiniMaxResponse | undefined;
      let retries = 3;
      let delay = 5000;
      let attempt = 0;

      while (retries > 0) {
        attempt++;
        try {
          const apiStartedAt = Date.now();
          generateLog("INFO", "生成接口请求发送", {
            taskId,
            attempt,
            retriesLeft: retries - 1,
          });
          const response = await fetch(MINIMAX_API_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Connection": "keep-alive"
            },
            body: JSON.stringify(requestBody),
            // @ts-ignore
            keepalive: true,
          });

          if (!response.ok) {
            const errorText = await response.text();
            generateLog("WARN", "生成接口 HTTP 非 2xx", {
              taskId,
              attempt,
              status: response.status,
              errorText: errorText.slice(0, 400),
            });
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          data = await response.json();
          generateLog("INFO", "生成接口响应", {
            taskId,
            attempt,
            durationMs: Date.now() - apiStartedAt,
            statusCode: data?.base_resp?.status_code,
            statusMsg: data?.base_resp?.status_msg,
            traceId: data?.trace_id,
          });
          
          if (data?.base_resp?.status_code === 1002) {
            generateLog("WARN", "触发限流，准备重试", {
              taskId,
              attempt,
              retriesLeft: retries - 1,
              statusMsg: data?.base_resp?.status_msg,
            });
            retries--;
            if (retries > 0) {
              await sleep(delay);
              delay *= 2;
              continue;
            }
          }
          break;
        } catch (e: any) {
          const errMsg = e instanceof Error ? e.message : "未知错误";
          generateLog("WARN", "生成接口调用异常", {
            taskId,
            attempt,
            retriesLeft: retries - 1,
            error: errMsg,
          });
          if (isTransientNetworkError(errMsg)) {
            retries--;
            if (retries > 0) {
              generateLog("INFO", "网络异常，等待后重试", {
                taskId,
                waitMs: delay,
                retriesLeft: retries,
              });
              await sleep(delay);
              delay *= 2;
              continue;
            }
          }
          throw e;
        }
      }

      if (!data) throw new Error("API 请求无响应");

      if (data.base_resp?.status_code !== 0) {
        const errorMsg = `API 错误: ${data.base_resp?.status_msg} (Code: ${data.base_resp?.status_code})`;
        markTaskFailed(taskId, errorMsg);
        generateLog("ERROR", "生成接口业务错误", {
          taskId,
          errorMsg,
          traceId: data.trace_id,
        });
        throw new Error(errorMsg);
      }

      if (data.data?.status !== 2 || !data.data?.audio) {
        markTaskFailed(taskId, "音乐生成超时或失败");
        generateLog("ERROR", "生成结果状态异常", {
          taskId,
          resultStatus: data.data?.status,
          hasAudio: Boolean(data.data?.audio),
          traceId: data.trace_id,
        });
        throw new Error("音乐生成超时或失败");
      }

      const audioData = data.data.audio;
      const isUrlMode = params.outputFormat === "url";
      let audioPath: string;
      let audioUrlResult: string | undefined;

      if (isUrlMode) {
        audioPath = audioData;
        audioUrlResult = audioData;
      } else {
        audioPath = saveAudioFile(audioData, params.format || "mp3");
      }

      markTaskCompleted(
        taskId,
        audioPath,
        data.extra_info?.music_duration,
        data.extra_info?.music_size,
        data.trace_id,
        audioUrlResult
      );

      const returnedLyrics = extractLyrics(data);
      if (returnedLyrics) {
        updateTaskLyrics(taskId, returnedLyrics);
        updateRecordLyricsByTaskId(taskId, returnedLyrics);
      }

      generateLog("INFO", "任务完成", {
        taskId,
        durationMs: Date.now() - taskStartedAt,
        traceId: data.trace_id,
        outputMode: isUrlMode ? "url" : "hex-local-file",
        audioPath: audioPath?.slice(0, 120),
        musicDuration: data.extra_info?.music_duration,
        musicSize: data.extra_info?.music_size,
      });
    } finally {
      limiter.release();
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "未知错误";
    generateLog("ERROR", "任务最终失败", {
      taskId,
      durationMs: Date.now() - taskStartedAt,
      error: message,
    });
    markTaskFailed(taskId, message);
  }
}
