import { NextRequest, NextResponse } from "next/server";
import { getGachaBatchById, updateGachaBatchItem } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const batch = getGachaBatchById(params.id);
  if (!batch) {
    return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true, batch });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { promptId, updates } = body;

    if (!promptId || !updates) {
      return NextResponse.json({ error: "缺少 promptId 或 updates" }, { status: 400 });
    }

    const batch = updateGachaBatchItem(params.id, promptId, updates);
    if (!batch) {
      return NextResponse.json({ error: "更新批次失败" }, { status: 404 });
    }

    return NextResponse.json({ success: true, batch });
  } catch (error) {
    return NextResponse.json(
      { error: `更新批次失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
