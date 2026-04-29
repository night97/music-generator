"use client";

import { useEffect, useState } from "react";

interface GachaBatchItem {
  promptId: string;
  prompt: string;
  originalPrompt?: string;
  optimizedPrompt?: string;
  optimizationNotes?: string;
  taskId?: string;
  status: "pending" | "generating" | "completed" | "failed";
  audioUrl?: string;
  error?: string;
}

interface GachaBatch {
  id: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  completed: number;
  failed: number;
  status: "pending" | "generating" | "completed" | "stopped";
  stopRequested?: boolean;
  qualityStrictness?: "loose" | "standard" | "strict";
  items: GachaBatchItem[];
}

const formatTime = (iso: string) => new Date(iso).toLocaleString("zh-CN");
const strictnessLabel: Record<"loose" | "standard" | "strict", string> = {
  loose: "宽松",
  standard: "标准",
  strict: "严格",
};

export default function GachaHistoryPage() {
  const [batches, setBatches] = useState<GachaBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [operatingBatchId, setOperatingBatchId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = new URLSearchParams(window.location.search).get("scope");
    setScope(value);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/gacha/batches", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "加载失败");
        }
        if (mounted) {
          setBatches(data.batches || []);
          setError("");
          setCurrentPage((prev) => {
            const total = (data.batches || []).length;
            if (total === 0) return 0;
            return Math.min(prev, total - 1);
          });
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    };

    load();
    const timer = setInterval(() => load(true), 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleControl = async (batchId: string, action: "stop" | "resume" | "retry_failed") => {
    setOperatingBatchId(batchId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/gacha/batches/${batchId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "操作失败");
      }
      setMessage(data.message || "操作成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setOperatingBatchId(null);
    }
  };

  const visibleBatches = scope === "quality"
    ? batches.filter((b) => b.theme === "高质量模式")
    : batches;
  const totalPages = visibleBatches.length;
  const currentBatch = totalPages > 0 ? visibleBatches[currentPage] : null;

  useEffect(() => {
    setCurrentPage((prev) => {
      if (totalPages === 0) return 0;
      return Math.min(prev, totalPages - 1);
    });
  }, [totalPages]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold gradient-text">{scope === "quality" ? "质量模式批次记录" : "抽卡批次记录"}</h1>
          <a href="/" className="text-sm text-blue-600 hover:underline">返回首页</a>
        </div>

        {loading && <div className="bg-white rounded-xl p-6 shadow">加载中...</div>}
        {message && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">{message}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">{error}</div>}

        {!loading && !error && visibleBatches.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center shadow text-gray-500">
            {scope === "quality" ? "暂无质量模式批次记录" : "暂无抽卡批次记录"}
          </div>
        )}

        {!loading && !error && currentBatch && (
          <>
            <div className="bg-white rounded-xl p-4 shadow flex items-center justify-between">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1 text-sm rounded border disabled:opacity-40"
              >
                上一批
              </button>
              <div className="text-sm text-gray-600">
                第 {currentPage + 1} / {totalPages} 批
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-1 text-sm rounded border disabled:opacity-40"
              >
                下一批
              </button>
            </div>

            <section key={currentBatch.id} className="bg-white rounded-xl p-6 shadow space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">批次 ID: {currentBatch.id}</div>
                <div className="font-medium text-gray-900">主题: {currentBatch.theme || "随机"}</div>
                <div className="text-sm text-gray-500">创建时间: {formatTime(currentBatch.createdAt)}</div>
                <div className="text-sm text-gray-500">更新时间: {formatTime(currentBatch.updatedAt)}</div>
                <div className="text-sm text-gray-500">
                  质检严格度: {strictnessLabel[(currentBatch.qualityStrictness || "standard") as "loose" | "standard" | "strict"]}
                </div>
              </div>
              <div className="text-sm text-right">
                <div>总数: {currentBatch.total}</div>
                <div className="text-green-600">成功: {currentBatch.completed}</div>
                <div className="text-red-600">失败: {currentBatch.failed}</div>
                <div className="text-blue-600">状态: {currentBatch.status === "completed" ? "已完成" : currentBatch.status === "generating" ? "生成中" : currentBatch.status === "stopped" ? "已停止" : "待开始"}</div>
                <div className="mt-2 flex justify-end gap-2">
                  {(currentBatch.status === "generating" || currentBatch.status === "pending") && (
                    <button
                      onClick={() => handleControl(currentBatch.id, "stop")}
                      disabled={operatingBatchId === currentBatch.id}
                      className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      终止
                    </button>
                  )}
                  {(currentBatch.status === "stopped" || currentBatch.items.some((it) => it.status === "pending")) && (
                    <button
                      onClick={() => handleControl(currentBatch.id, "resume")}
                      disabled={operatingBatchId === currentBatch.id}
                      className="px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      继续生成
                    </button>
                  )}
                  {currentBatch.failed > 0 && (
                    <button
                      onClick={() => handleControl(currentBatch.id, "retry_failed")}
                      disabled={operatingBatchId === currentBatch.id || currentBatch.status === "generating"}
                      className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      title={currentBatch.status === "generating" ? "请先终止当前批次再重试失败项" : "重试失败项"}
                    >
                      重试失败项
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {currentBatch.items.map((item, idx) => (
                <div key={`${currentBatch.id}_${item.promptId}_${idx}`} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-800">{idx + 1}. {item.prompt}</div>
                    <div className="text-xs">
                      {item.status === "completed" && <span className="text-green-600">已生成</span>}
                      {item.status === "failed" && <span className="text-red-600">失败</span>}
                      {item.status === "generating" && <span className="text-blue-600">生成中</span>}
                      {item.status === "pending" && <span className="text-gray-500">未生成</span>}
                    </div>
                  </div>
                  {(item.optimizedPrompt || item.optimizationNotes) && (
                    <details className="mt-2">
                      <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
                        查看提示词优化详情
                      </summary>
                      <div className="mt-2 text-xs space-y-1 bg-indigo-50 rounded p-2">
                        {item.originalPrompt && (
                          <div>
                            <span className="font-medium text-gray-700">原始:</span>{" "}
                            <span className="text-gray-700">{item.originalPrompt}</span>
                          </div>
                        )}
                        {item.optimizedPrompt && (
                          <div>
                            <span className="font-medium text-gray-700">优化后:</span>{" "}
                            <span className="text-gray-700">{item.optimizedPrompt}</span>
                          </div>
                        )}
                        {item.optimizationNotes && (
                          <div>
                            <span className="font-medium text-gray-700">说明:</span>{" "}
                            <span className="text-gray-700">{item.optimizationNotes}</span>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                  {item.error && <div className="text-xs text-red-500 mt-1">{item.error}</div>}
                  {item.audioUrl && (
                    <div className="flex items-center gap-4 mt-1">
                      {item.taskId && (
                        <a
                          href={`/song/${item.taskId}`}
                          className="text-xs text-cyan-600 hover:underline"
                        >
                          查看详情
                        </a>
                      )}
                      <a
                        href={item.audioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline inline-block"
                      >
                        打开音频
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
