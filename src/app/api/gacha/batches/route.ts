import { NextRequest, NextResponse } from "next/server";
import { createGachaBatch, getAllGachaBatches, type GachaQualityStrictness } from "@/lib/storage";

export async function GET() {
  const batches = getAllGachaBatches();
  return NextResponse.json({ success: true, batches });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { theme, prompts, timeoutMinutes, qualityStrictness } = body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json({ error: "prompts 不能为空" }, { status: 400 });
    }

    const timeout = Math.min(30, Math.max(1, Number(timeoutMinutes) || 8));
    const strictness: GachaQualityStrictness =
      qualityStrictness === "loose" || qualityStrictness === "strict" ? qualityStrictness : "standard";
    const batch = createGachaBatch(theme || "", prompts, timeout, strictness);
    return NextResponse.json({ success: true, batch });
  } catch (error) {
    return NextResponse.json(
      { error: `创建抽卡批次失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
