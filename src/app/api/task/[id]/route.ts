import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = params.id;

  if (!taskId) {
    return NextResponse.json(
      { error: "缺少任务 ID" },
      { status: 400 }
    );
  }

  const task = getTaskStatus(taskId);

  if (!task) {
    return NextResponse.json(
      { error: "任务不存在" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      model: task.model,
      prompt: task.prompt,
      // 完成时返回的数据
      audioFile: task.audioFile,
      audioUrlResult: task.audioUrlResult,
      format: task.format,
      musicDuration: task.musicDuration,
      musicSize: task.musicSize,
      traceId: task.traceId,
      outputFormat: task.outputFormat,
      // 错误时返回的数据
      error: task.error,
    },
  });
}
