import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/lyrics_generation";

interface MiniMaxResponse {
  song_title?: string;
  style_tags?: string;
  lyrics?: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

function buildConstrainedLyricsPrompt(basePrompt: string): string {
  return [
    "请基于下面描述创作完整中文歌词，要求风格一致、语义连贯。",
    "约束：禁止出现与描述冲突的时代/场景/乐器元素（除非描述明确要求）。",
    "原始描述：",
    basePrompt,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, prompt, lyrics, title } = body;
    const normalizedMode = mode === "generate" ? "write_full_song" : mode;

    if (!normalizedMode) {
      return NextResponse.json(
        { error: "缺少必需参数 mode" },
        { status: 400 }
      );
    }

    if (normalizedMode === "edit" && !lyrics) {
      return NextResponse.json(
        { error: "edit 模式需要提供现有歌词" },
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

    const requestBody: Record<string, unknown> = {
      mode: normalizedMode,
    };

    if (prompt) {
      requestBody.prompt = normalizedMode === "write_full_song" ? buildConstrainedLyricsPrompt(prompt) : prompt;
    }

    if (lyrics) {
      requestBody.lyrics = lyrics;
    }

    if (title) {
      requestBody.title = title;
    }

    console.log("正在调用 MiniMax 歌词生成 API...");
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
    console.log("MiniMax API 响应:", JSON.stringify(data, null, 2));

    if (data.base_resp?.status_code !== 0) {
      const errorMessages: Record<number, string> = {
        1002: "触发限流，请稍后重试",
        1004: "账号鉴权失败，请检查 API Key",
        1008: "账号余额不足",
        1026: "输入包含敏感内容",
        2013: "参数异常",
        2049: "无效的 API Key",
      };
      return NextResponse.json(
        {
          error: errorMessages[data.base_resp?.status_code || 0] || `API 错误: ${data.base_resp?.status_msg}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      songTitle: data.song_title,
      styleTags: data.style_tags,
      lyrics: data.lyrics,
    });
  } catch (error) {
    console.error("歌词生成 API 路由错误:", error);
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
