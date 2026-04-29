"use client";

import { useState, useCallback } from "react";

interface PromptItem {
  id: string;
  prompt: string;
  theme: string;
  style: string;
}

export default function GachaMode() {
  const [theme, setTheme] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [timeoutMinutes, setTimeoutMinutes] = useState(8);
  const [qualityStrictness, setQualityStrictness] = useState<"loose" | "standard" | "strict">("standard");

  const handleGenerate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setPrompts([]);

    try {
      const res = await fetch("/api/gacha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme ? { theme } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }
      setPrompts(data.prompts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setLoading(false);
    }
  }, [loading, theme]);

  const handleGenerateAll = useCallback(async () => {
    if (submitting || prompts.length === 0) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const createRes = await fetch("/api/gacha/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, prompts, timeoutMinutes, qualityStrictness }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || "创建抽卡批次失败");
      }

      const batchId = createData.batch.id as string;
      const startRes = await fetch(`/api/gacha/batches/${batchId}/generate`, {
        method: "POST",
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.success) {
        throw new Error(startData.error || "提交后台任务失败");
      }

      setPrompts([]);
      setSuccess("任务已提交到后台，请前往“抽卡批次记录”查看生成进度。页面已重置，可继续下一轮抽卡。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, prompts, theme, timeoutMinutes, qualityStrictness]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text mb-2">🎰 随机抽卡模式</h2>
        <p className="text-gray-600">每次抽 10 条提示词，提交后由后台自动串行生成</p>
        <div className="mt-3">
          <a
            href="/gacha-history"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            查看批量抽卡记录
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md">
        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="输入主题（如：春天、失恋、赛博朋克），留空则随机"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-medium text-white transition-all ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            }`}
          >
            {loading ? "生成中..." : "🎲 抽取灵感"}
          </button>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">超时阈值(分钟)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={timeoutMinutes}
              onChange={(e) => setTimeoutMinutes(Math.min(30, Math.max(1, Number(e.target.value) || 8)))}
              className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">质检严格度</label>
            <select
              value={qualityStrictness}
              onChange={(e) => setQualityStrictness(e.target.value as "loose" | "standard" | "strict")}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="loose">宽松</option>
              <option value="standard">标准</option>
              <option value="strict">严格</option>
            </select>
          </div>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 flex items-center justify-between gap-4">
          <span>{success}</span>
          <a href="/gacha-history" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            去记录页查看 →
          </a>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">
          {error}
        </div>
      )}

      {prompts.length > 0 && (
        <>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 flex items-center justify-between">
            <p className="font-medium text-gray-800">已生成 {prompts.length} 组灵感</p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerateAll}
                disabled={submitting}
                className={`px-6 py-2 rounded-lg font-medium text-white transition-all ${
                  submitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                }`}
              >
                {submitting ? "提交中..." : "🚀 提交后台批量生成"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prompts.map((item, i) => (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{item.prompt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {prompts.length === 0 && !loading && !success && (
        <div className="bg-white rounded-xl p-12 shadow-md text-center">
          <div className="text-6xl mb-4">🎰</div>
          <h3 className="text-xl font-medium text-gray-800 mb-2">准备抽取灵感</h3>
          <p className="text-gray-500">点击上方按钮，AI 将为你生成 10 组风格各异的音乐创作灵感</p>
        </div>
      )}
    </div>
  );
}
