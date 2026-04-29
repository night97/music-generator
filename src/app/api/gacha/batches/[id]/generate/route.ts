import { NextRequest, NextResponse } from "next/server";
import { getGachaBatchById } from "@/lib/storage";
import { startGachaBatchGeneration } from "@/lib/gachaBatchRunner";
import { gachaLog } from "@/lib/gachaLogger";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  gachaLog.info("收到批次后台生成请求", { batchId: params.id, step: "api_generate_received" });
  const batch = getGachaBatchById(params.id);
  if (!batch) {
    gachaLog.warn("批次不存在，无法启动后台生成", { batchId: params.id, step: "api_batch_not_found" });
    return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  }

  startGachaBatchGeneration(params.id).catch((error) => {
    gachaLog.error("抽卡批次后台生成失败", {
      batchId: params.id,
      error: error instanceof Error ? error.message : "未知错误",
      step: "api_start_failed",
    });
  });
  gachaLog.info("批次后台生成已触发", { batchId: params.id, step: "api_generate_started" });

  return NextResponse.json({
    success: true,
    batchId: params.id,
    message: "批次任务已提交，正在后台生成",
  });
}
