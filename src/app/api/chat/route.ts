import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.minimaxi.com/anthropic/v1/messages";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, systemPrompt, maxTokens } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "缺少 messages 参数" },
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

    // 保留最近20条对话
    const recentMessages = messages.slice(-20);

    // 构建 Anthropic 格式的消息
    const chatMessages = recentMessages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text" as const, text: msg.content }],
    }));

    const requestBody = {
      model: "MiniMax-M2.7",
      max_tokens: Math.max(256, Math.min(4096, Number(maxTokens) || 1024)),
      system: systemPrompt || "你是一个音乐创作助手。",
      messages: chatMessages,
    };

    console.log("调用 MiniMax Anthropic 兼容 API...");
    console.log("请求参数:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log("MiniMax API 响应:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || `API 错误: ${response.status}` },
        { status: response.status }
      );
    }

    // 提取文本内容
    const contentBlocks = data.content || [];
    const textBlock = contentBlocks.find(
      (block: { type: string }) => block.type === "text"
    );
    const content = textBlock?.text || "";

    if (!content) {
      return NextResponse.json(
        { error: "生成内容为空" },
        { status: 500 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("聊天 API 路由错误:", error);
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
