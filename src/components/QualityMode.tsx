"use client";

import { useMemo, useState } from "react";

interface VariantPrompt {
  id: string;
  prompt: string;
  strategy: string;
}

interface Score {
  melody: number;
  arrangement: number;
  vocal: number;
  emotion: number;
  consistency: number;
}

interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  qualityTarget?: string;
}

const DEFAULT_SCORE: Score = {
  melody: 6,
  arrangement: 6,
  vocal: 6,
  emotion: 6,
  consistency: 6,
};

const QUALITY_SYSTEM_PROMPT = `你是资深音乐制作人和提示词工程师。
任务：围绕用户给定的音乐目标，产出多个高质量音乐生成提示词变体。
硬性要求：
1. 输出 JSON 数组，长度为用户要求数量。
2. 每个元素格式：{"prompt":"...","strategy":"..."}
3. prompt 必须具体且可执行，包含：风格、BPM 范围、调性/和声色彩、核心乐器、结构、情绪曲线、空间感/混响风格。
4. strategy 用一句话说明该变体的取向差异。
5. 每条 prompt 控制在 220 字以内，避免冗长。
6. 仅输出 JSON，不要 markdown，不要解释。`;

const QUALITY_COACH_SYSTEM_PROMPT = `你是“高质量音乐目标教练”。
你的任务是和用户迭代对话，逐步把用户的关键词收敛为可执行的高质量音乐目标。
每次必须只输出 JSON，格式：
{"reply":"给用户的简洁回复","qualityTarget":"当前版本的高质量目标（可为空）"}
约束：
1. 如果信息不够，先追问关键缺失项（风格、BPM、调性、乐器、结构、情绪曲线、场景）。
2. 一旦信息足够，输出高质量目标，尽量具体可执行。
3. 不要输出 markdown，不要输出任何 JSON 以外内容。`;

function safeParseVariants(content: string): VariantPrompt[] {
  const normalized = content
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  try {
    const text = normalized;
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const jsonPart = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any, index: number) => ({
        id: `variant_${Date.now()}_${index}`,
        prompt: String(item?.prompt || "").trim(),
        strategy: String(item?.strategy || "未说明策略").trim(),
      }))
      .filter((x) => x.prompt.length > 20);
  } catch {}

  // 兜底：从被截断的文本中提取“完整对象”片段
  const objects: VariantPrompt[] = [];
  const text = normalized;
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && startIdx >= 0) {
        const rawObj = text.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(rawObj) as { prompt?: string; strategy?: string };
          const prompt = String(parsed.prompt || "").trim();
          if (prompt.length > 20) {
            objects.push({
              id: `variant_${Date.now()}_${objects.length}`,
              prompt,
              strategy: String(parsed.strategy || "未说明策略").trim(),
            });
          }
        } catch {
          // ignore broken object
        }
        startIdx = -1;
      }
    }
  }

  return objects;
}

function parseCoachPayload(content: string): { reply: string; qualityTarget?: string } {
  try {
    const text = content.trim().replace(/```json/gi, "```").replace(/```/g, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const jsonPart = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(jsonPart) as { reply?: string; qualityTarget?: string };
    const reply = String(parsed.reply || "").trim();
    const qualityTarget = String(parsed.qualityTarget || "").trim();
    if (reply) return { reply, qualityTarget: qualityTarget || undefined };
  } catch {}
  return { reply: content };
}

export default function QualityMode() {
  const [target, setTarget] = useState("");
  const [variantCount, setVariantCount] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [variants, setVariants] = useState<VariantPrompt[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [pickCount, setPickCount] = useState(3);
  const [timeoutMinutes, setTimeoutMinutes] = useState(8);
  const [qualityStrictness, setQualityStrictness] = useState<"loose" | "standard" | "strict">("standard");
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    {
      id: "coach_welcome",
      role: "assistant",
      content:
        "告诉我你的关键词或参考方向，我会帮你逐步整理成高质量目标（可多轮优化）。",
    },
  ]);

  const ranked = useMemo(() => {
    const list = variants.map((v) => {
      const score = scores[v.id] || DEFAULT_SCORE;
      const total = score.melody + score.arrangement + score.vocal + score.emotion + score.consistency;
      return { ...v, score, total };
    });
    return list.sort((a, b) => b.total - a.total);
  }, [variants, scores]);

  const handleGenerateVariants = async () => {
    if (!target.trim()) {
      setError("请先填写质量目标描述");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const userContent = `请输出 ${variantCount} 个变体。\n音乐目标：${target}`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: QUALITY_SYSTEM_PROMPT,
          maxTokens: 2600,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成变体失败");
      }

      const parsed = safeParseVariants(data.content || "");
      if (parsed.length === 0) {
        throw new Error("模型未返回可解析的 JSON 变体，请重试");
      }

      setVariants(parsed);
      const nextScores: Record<string, Score> = {};
      parsed.forEach((item) => {
        nextScores[item.id] = { ...DEFAULT_SCORE };
      });
      setScores(nextScores);
      if (parsed.length < variantCount) {
        setSuccess(`已提取 ${parsed.length}/${variantCount} 个可用变体（可能被长度截断），你可直接打分提交，或再点一次补充。`);
      } else {
        setSuccess(`已生成 ${parsed.length} 个高质量提示词变体，请打分后提交。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCoachSend = async () => {
    const text = coachInput.trim();
    if (!text || coachLoading) return;

    const nextUser: CoachMessage = {
      id: `coach_user_${Date.now()}`,
      role: "user",
      content: text,
    };

    const nextMessages = [...coachMessages, nextUser];
    setCoachMessages(nextMessages);
    setCoachInput("");
    setCoachLoading(true);
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: QUALITY_COACH_SYSTEM_PROMPT,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "对话生成失败");
      }

      const parsed = parseCoachPayload(data.content || "");
      setCoachMessages((prev) => [
        ...prev,
        {
          id: `coach_assistant_${Date.now()}`,
          role: "assistant",
          content: parsed.reply,
          qualityTarget: parsed.qualityTarget,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "对话失败");
    } finally {
      setCoachLoading(false);
    }
  };

  const setMetric = (id: string, key: keyof Score, value: number) => {
    setScores((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || DEFAULT_SCORE),
        [key]: value,
      },
    }));
  };

  const handleSubmitTop = async () => {
    if (ranked.length === 0) {
      setError("请先生成并评分");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const selected = ranked.slice(0, Math.max(1, Math.min(pickCount, ranked.length)));
      const prompts = selected.map((item, idx) => ({
        id: `quality_${Date.now()}_${idx}`,
        prompt: item.prompt,
        theme: "quality-mode",
        style: item.strategy,
      }));

      const createRes = await fetch("/api/gacha/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: "高质量模式",
          prompts,
          timeoutMinutes,
          qualityStrictness,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || "创建批次失败");
      }

      const batchId = createData.batch.id as string;
      const startRes = await fetch(`/api/gacha/batches/${batchId}/generate`, {
        method: "POST",
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.success) {
        throw new Error(startData.error || "启动后台任务失败");
      }

      setSuccess(`已提交高质量批次 ${batchId}，请前往“质量模式批次记录”查看进度。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text mb-2">🎯 质量模式</h2>
        <p className="text-gray-600">先生成高质量提示词变体并打分，再提交高分版本批量生成</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow space-y-4">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-indigo-800">AI 目标教练</h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {coachMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === "assistant" ? "bg-white text-gray-700" : "bg-indigo-600 text-white ml-8"
                }`}
              >
                <div>{msg.content}</div>
                {msg.qualityTarget && (
                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs">
                    <div className="font-medium mb-1">建议高质量目标</div>
                    <div className="whitespace-pre-wrap">{msg.qualityTarget}</div>
                    <button
                      onClick={() => setTarget(msg.qualityTarget || "")}
                      className="mt-2 px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      应用到目标框
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={coachInput}
              onChange={(e) => setCoachInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCoachSend();
              }}
              className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-sm"
              placeholder="输入关键词或你想优化的方向"
            />
            <button
              onClick={handleCoachSend}
              disabled={coachLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm"
            >
              {coachLoading ? "思考中..." : "发送"}
            </button>
          </div>
        </div>

        <textarea
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full min-h-[120px] px-4 py-3 border border-gray-300 rounded-lg"
          placeholder="描述你的高质量目标：风格、BPM、调性、乐器、结构、情绪推进、参考画面等"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">变体数</label>
          <input
            type="number"
            min={3}
            max={10}
            value={variantCount}
            onChange={(e) => setVariantCount(Math.max(3, Math.min(10, Number(e.target.value) || 6)))}
            className="w-20 px-2 py-1 border rounded"
          />

          <label className="text-sm text-gray-600">提交前N名</label>
          <input
            type="number"
            min={1}
            max={10}
            value={pickCount}
            onChange={(e) => setPickCount(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
            className="w-20 px-2 py-1 border rounded"
          />

          <label className="text-sm text-gray-600">超时(分钟)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(Math.max(1, Math.min(30, Number(e.target.value) || 8)))}
            className="w-20 px-2 py-1 border rounded"
          />
          <label className="text-sm text-gray-600">质检严格度</label>
          <select
            value={qualityStrictness}
            onChange={(e) => setQualityStrictness(e.target.value as "loose" | "standard" | "strict")}
            className="px-2 py-1 border rounded bg-white text-sm"
          >
            <option value="loose">宽松</option>
            <option value="standard">标准</option>
            <option value="strict">严格</option>
          </select>

          <button
            onClick={handleGenerateVariants}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-white bg-gradient-to-r from-indigo-500 to-cyan-500 disabled:opacity-50"
          >
            {submitting ? "处理中..." : "生成高质量变体"}
          </button>

          <button
            onClick={handleSubmitTop}
            disabled={submitting || ranked.length === 0}
            className="px-4 py-2 rounded-lg text-white bg-gradient-to-r from-emerald-500 to-green-600 disabled:opacity-50"
          >
            提交高分版本
          </button>

          <a href="/gacha-history?scope=quality" className="text-sm text-blue-600 hover:underline">
            查看质量批次记录 →
          </a>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-600 text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 rounded p-3 text-green-700 text-sm">{success}</div>}
      </div>

      {ranked.length > 0 && (
        <div className="space-y-4">
          {ranked.map((item, idx) => (
            <div key={item.id} className="bg-white rounded-xl p-5 shadow border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-500">变体 #{idx + 1} · 总分 {item.total}/50</div>
                <div className="text-xs text-indigo-600">策略: {item.strategy}</div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mb-4">{item.prompt}</p>

              <div className="grid md:grid-cols-5 gap-3 text-xs">
                {([
                  ["melody", "旋律记忆点"],
                  ["arrangement", "编配层次"],
                  ["vocal", "人声可懂度"],
                  ["emotion", "情绪推进"],
                  ["consistency", "风格一致性"],
                ] as Array<[keyof Score, string]>).map(([key, label]) => (
                  <label key={key} className="space-y-1 block">
                    <div className="text-gray-600">{label}</div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={(scores[item.id] || DEFAULT_SCORE)[key]}
                      onChange={(e) => setMetric(item.id, key, Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-center text-gray-700">{(scores[item.id] || DEFAULT_SCORE)[key]}</div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
