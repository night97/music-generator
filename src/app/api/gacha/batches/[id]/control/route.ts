import { NextRequest, NextResponse } from "next/server";
import { getGachaBatchById, rollbackFailedItemsToPending, updateGachaBatchMeta } from "@/lib/storage";
import { isGachaBatchRunning, startGachaBatchGeneration, stopGachaBatchGeneration } from "@/lib/gachaBatchRunner";
import { gachaLog } from "@/lib/gachaLogger";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const action = body?.action as "stop" | "resume" | "retry_failed";

    const batch = getGachaBatchById(params.id);
    if (!batch) {
      return NextResponse.json({ error: "批次不存在" }, { status: 404 });
    }

    if (action === "stop") {
      stopGachaBatchGeneration(params.id);
      return NextResponse.json({ success: true, message: "已请求停止，当前进行中的歌曲结束后将停止后续任务" });
    }

    if (action === "resume") {
      updateGachaBatchMeta(params.id, { stopRequested: false, status: "generating" });
      if (!isGachaBatchRunning(params.id)) {
        startGachaBatchGeneration(params.id).catch((error) => {
          gachaLog.error("继续批次生成失败", {
            batchId: params.id,
            error: error instanceof Error ? error.message : "未知错误",
            step: "batch_resume_failed",
          });
        });
      }
      return NextResponse.json({ success: true, message: "已继续生成未完成任务" });
    }

    if (action === "retry_failed") {
      rollbackFailedItemsToPending(params.id);
      updateGachaBatchMeta(params.id, { stopRequested: false, status: "generating" });
      if (!isGachaBatchRunning(params.id)) {
        startGachaBatchGeneration(params.id).catch((error) => {
          gachaLog.error("重试失败任务时批次启动失败", {
            batchId: params.id,
            error: error instanceof Error ? error.message : "未知错误",
            step: "batch_retry_failed_start_error",
          });
        });
      }
      return NextResponse.json({ success: true, message: "已重试失败任务" });
    }

    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: `操作失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
