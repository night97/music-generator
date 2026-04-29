import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus, updateRecordLyricsByTaskId, updateTaskLyrics } from "@/lib/storage";

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
      lyrics: task.lyrics,  // 添加歌词字段
      isInstrumental: task.isInstrumental,  // 添加是否纯音乐
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    if (!taskId) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
    }

    const body = await request.json();
    const lyrics = typeof body?.lyrics === "string" ? body.lyrics : null;
    if (lyrics === null) {
      return NextResponse.json({ error: "缺少 lyrics 字段" }, { status: 400 });
    }

    const updated = updateTaskLyrics(taskId, lyrics);
    if (!updated) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    updateRecordLyricsByTaskId(taskId, lyrics);
    return NextResponse.json({ success: true, taskId, lyrics });
  } catch (error) {
    return NextResponse.json(
      { error: `更新歌词失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
