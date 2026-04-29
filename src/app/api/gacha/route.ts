import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_URL = "https://api.minimaxi.com/anthropic/v1/messages";

const GACHA_SYSTEM_PROMPT = `你是一个音乐创作灵感专家。生成10组简洁的音乐创作描述。

要求：
- 每组是一个完整的音乐描述
- 风格多样：流行、电子，民谣、古典，摇滚等
- 50-100字左右

输出JSON数组格式：[{"prompt":"描述1"},{"prompt":"描述2"},...,{"prompt":"描述10"}]`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { theme } = body;

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "未配置 API Key" },
        { status: 500 }
      );
    }

    const userMessage = theme
      ? `生成10组关于"${theme}"的音乐创作描述，风格多样化`
      : "生成10组当前流行的音乐创作描述，风格多样化（流行、电子、民谣、古典等）";

    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        max_tokens: 1024,
        system: GACHA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MiniMax API 错误:", data);
      return NextResponse.json(
        { error: data.error?.message || "API 请求失败" },
        { status: response.status }
      );
    }

    const contentBlocks = data.content || [];
    const textBlock = contentBlocks.find((block: { type: string }) => block.type === "text");
    const content = textBlock?.text || "";

    // 解析 JSON
    let prompts: { id: string; prompt: string; theme: string; style: string }[] = [];

    try {
      let jsonStr = content.trim();
      
      // 尝试提取 JSON 数组部分
      const startIdx = jsonStr.indexOf('[');
      const endIdx = jsonStr.lastIndexOf(']');
      
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) {
        prompts = parsed.map((item: any, index: number) => {
          let p = "";
          if (typeof item === 'string') {
            p = item;
          } else {
            p = item.prompt || item.description || item.content || item.text || JSON.stringify(item);
          }
          
          // 清理：移除可能残留的 JSON 符号和多余引号
          p = p.replace(/^["']|["']$/g, "")
               .replace(/^[\{\}\[\]:,\s]+|[\{\}\[\]:,\s]+$/g, "")
               .replace(/^prompt["']?\s*:\s*["']?/, "")
               .trim();

          return {
            id: `gacha_${Date.now()}_${index}`,
            prompt: p,
            theme: item.theme || "",
            style: item.style || "",
          };
        }).filter(item => item.prompt.length > 5); // 过滤掉太短或无效的
      }
    } catch (parseError) {
      console.error("JSON 解析失败，尝试正则表达式提取:", parseError);
      
      // 备用方案：使用正则提取所有的 "prompt": "..." 内容
      const regex = /"prompt"\s*:\s*"([^"]+)"/g;
      let match;
      let index = 0;
      while ((match = regex.exec(content)) !== null) {
        prompts.push({
          id: `gacha_${Date.now()}_${index++}`,
          prompt: match[1],
          theme: "",
          style: "",
        });
      }

      if (prompts.length === 0) {
        // 最后的兜底：按行分割
        const lines = content.split("\n").filter((l: string) => l.trim().length > 10);
        prompts = lines.slice(0, 10).map((line: string, index: number) => ({
          id: `gacha_${Date.now()}_${index}`,
          prompt: line.replace(/^\d+[\.\)]\s*/, "").replace(/^["']|["']$/g, "").trim(),
          theme: "",
          style: "",
        }));
      }
    }

    // 确保有10个提示词
    while (prompts.length < 10) {
      prompts.push({
        id: `gacha_${Date.now()}_${prompts.length}`,
        prompt: `风格音乐创作 ${prompts.length + 1}`,
        theme: "",
        style: "",
      });
    }

    return NextResponse.json({
      success: true,
      prompts: prompts.slice(0, 10),
    });
  } catch (error) {
    console.error("抽卡 API 路由错误:", error);
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
