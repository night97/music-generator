import { NextResponse } from "next/server";
import { getAllRecords, deleteRecord, getStats } from "@/lib/storage";

// GET /api/history - 获取所有记录
export async function GET() {
  try {
    const records = getAllRecords();
    const stats = getStats();
    return NextResponse.json({ records, stats });
  } catch (error) {
    return NextResponse.json(
      { error: "获取记录失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/history/:id - 删除记录
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "缺少记录 ID" },
        { status: 400 }
      );
    }

    const success = deleteRecord(id);
    if (!success) {
      return NextResponse.json(
        { error: "记录不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "删除记录失败" },
      { status: 500 }
    );
  }
}
