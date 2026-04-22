import { NextRequest, NextResponse } from "next/server";
import {
  createTask,
  markTaskProcessing,
  markTaskCompleted,
  markTaskFailed,
  saveAudioFile,
} from "@/lib/storage";

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/music_generation";

interface MiniMaxResponse {
  data?: {
    status: number;
    audio?: string;
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

    // 创建任务
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

    // 立即返回任务 ID
    // 在后台异步处理音乐生成
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

// 后台异步处理音乐生成
async function processMusicGeneration(
  taskId: string,
  apiKey: string,
  params: {
    model: string;
    prompt: string;
    lyrics?: string;
    isInstrumental?: boolean;
    lyricsOptimizer?: boolean;
    sampleRate?: number;
    bitrate?: number;
    format?: string;
    outputFormat?: "url" | "hex";
    aigcWatermark?: boolean;
    audioUrl?: string;
    audioBase64?: string;
  }
) {
  try {
    // 标记任务为处理中
    markTaskProcessing(taskId);

    const requestBody: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      stream: false,
      output_format: params.outputFormat || "hex",
      is_instrumental: params.isInstrumental || false,
      lyrics_optimizer: params.lyricsOptimizer || false,
      aigc_watermark: params.aigcWatermark || false,
      audio_setting: {
        sample_rate: params.sampleRate || 44100,
        bitrate: params.bitrate || 256000,
        format: params.format || "mp3",
      },
    };

    // music-cover 模型需要参考音频
    if (params.model === "music-cover") {
      if (params.audioUrl) {
        requestBody.audio_url = params.audioUrl;
      } else if (params.audioBase64) {
        const base64Data = params.audioBase64.includes(",")
          ? params.audioBase64.split(",")[1]
          : params.audioBase64;
        requestBody.audio_base64 = base64Data;
      }
    }

    if (params.lyrics && !params.isInstrumental && !params.lyricsOptimizer) {
      requestBody.lyrics = params.lyrics;
    }

    console.log(`任务 ${taskId} 正在调用 MiniMax API...`);
    console.log("请求参数:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data: MiniMaxResponse = await response.json();
    console.log(`任务 ${taskId} MiniMax API 响应:`, JSON.stringify(data, null, 2));

    if (data.base_resp?.status_code !== 0) {
      const errorMessages: Record<number, string> = {
        1002: "触发限流，请稍后重试",
        1004: "账号鉴权失败，请检查 API Key",
        1008: "账号余额不足",
        2013: "传入参数异常",
        2049: "无效的 API Key",
        2061: "当前账号不支持该模型",
      };
      const errorMsg = errorMessages[data.base_resp?.status_code || 0] || `API 错误: ${data.base_resp?.status_msg}`;
      markTaskFailed(taskId, errorMsg);
      throw new Error(errorMsg);
    }

    if (data.data?.status !== 2 || !data.data?.audio) {
      markTaskFailed(taskId, "音乐生成超时或失败");
      throw new Error("音乐生成超时或失败");
    }

    // 根据 outputFormat 处理音频数据
    const audioData = data.data.audio;
    const isUrlMode = params.outputFormat === "url";
    let audioPath: string;
    let audioUrlResult: string | undefined;

    if (isUrlMode) {
      // URL 模式：直接使用返回的 URL
      audioPath = audioData;
      audioUrlResult = audioData;
    } else {
      // HEX 模式：保存为本地文件
      const outputFormat = params.format || "mp3";
      audioPath = saveAudioFile(audioData, outputFormat);
    }

    // 标记任务完成
    markTaskCompleted(
      taskId,
      audioPath,
      data.extra_info?.music_duration,
      data.extra_info?.music_size,
      data.trace_id,
      audioUrlResult
    );

    console.log(`任务 ${taskId} 完成，音频: ${audioPath}`);
  } catch (error) {
    console.error(`任务 ${taskId} 处理失败:`, error);
    markTaskFailed(taskId, error instanceof Error ? error.message : "未知错误");
  }
}
