"use client";

import { useEffect, useMemo, useState } from "react";
import AudioPlayer from "@/components/AudioPlayer";
import { parseLrc, isLrcFormat } from "@/lib/lrc";

interface TaskDetail {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  audioFile?: string;
  audioUrlResult?: string;
  musicDuration?: number;
  musicSize?: number;
  traceId?: string;
  outputFormat?: "url" | "hex";
  error?: string;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms?: number) {
  if (!ms) return "--:--";
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatSize(bytes?: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLrcTag(seconds: number) {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cents = Math.floor((safe - Math.floor(safe)) * 100);
  return `[${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${cents
    .toString()
    .padStart(2, "0")}]`;
}

interface LyricRow {
  time: number;
  text: string;
}

export default function SongDetailPage({ params }: { params: { taskId: string } }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [selectedLine, setSelectedLine] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [rows, setRows] = useState<LyricRow[]>([]);
  const [defaultIntervalSec, setDefaultIntervalSec] = useState(5);
  const [rangeStartLine, setRangeStartLine] = useState(1);
  const [rangeEndLine, setRangeEndLine] = useState(1);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const res = await fetch(`/api/task/${params.taskId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "加载详情失败");
        }
        setTask(data.task);
        setLyricsDraft(data.task.lyrics || "");
        if (data.task.lyrics && isLrcFormat(data.task.lyrics)) {
          const parsed = parseLrc(data.task.lyrics).map((x) => ({ time: x.time, text: x.text }));
          const nextRows = parsed.length > 0 ? parsed : [{ time: 0, text: "" }];
          setRows(nextRows);
          setRangeStartLine(1);
          setRangeEndLine(nextRows.length);
        } else if (data.task.lyrics) {
          const nextRows =
            data.task.lyrics
              .split("\n")
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0)
              .map((t: string, i: number) => ({ time: i * defaultIntervalSec, text: t }));
          setRows(nextRows);
          setRangeStartLine(1);
          setRangeEndLine(nextRows.length);
        } else {
          setRows([{ time: 0, text: "" }]);
          setRangeStartLine(1);
          setRangeEndLine(1);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载详情失败");
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [params.taskId]);

  const draftLines = useMemo(() => lyricsDraft.split("\n"), [lyricsDraft]);

  const handleInsertTimestamp = () => {
    if (rows.length > 0) {
      const idx = Math.min(Math.max(0, selectedLine), rows.length - 1);
      updateRow(idx, { time: currentTime });
      return;
    }
    const idx = Math.min(Math.max(0, selectedLine), Math.max(0, draftLines.length - 1));
    const lines = [...draftLines];
    if (lines.length === 0) {
      lines.push(`${formatLrcTag(currentTime)} `);
    } else {
      const clean = lines[idx].replace(/^\[\d{2}:\d{2}\.\d{2}\]/, "");
      lines[idx] = `${formatLrcTag(currentTime)}${clean}`;
    }
    setLyricsDraft(lines.join("\n"));
  };

  const rebuildDraftFromRows = (nextRows: LyricRow[], sortByTime = false) => {
    const normalized = sortByTime ? [...nextRows].sort((a, b) => a.time - b.time) : nextRows;
    setRows(normalized);
    const lrc = normalized
      .filter((r) => r.text.trim().length > 0)
      .map((r) => `${formatLrcTag(r.time)} ${r.text.trim()}`)
      .join("\n");
    setLyricsDraft(lrc);
  };

  const updateRow = (idx: number, patch: Partial<LyricRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    rebuildDraftFromRows(next);
  };

  const addRow = () => {
    const nextTime = rows.length > 0 ? rows[rows.length - 1].time + defaultIntervalSec : 0;
    const next = [...rows, { time: nextTime, text: "" }];
    rebuildDraftFromRows(next);
    setRangeEndLine(next.length);
  };

  const deleteRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    const normalized = next.length > 0 ? next : [{ time: 0, text: "" }];
    rebuildDraftFromRows(normalized);
    setRangeStartLine((prev) => Math.min(prev, normalized.length));
    setRangeEndLine((prev) => Math.min(prev, normalized.length));
  };

  const sortRowsByTime = () => {
    rebuildDraftFromRows(rows, true);
  };

  const applyDefaultInterval = () => {
    const next = rows.map((row, idx) => ({
      ...row,
      time: Number((idx * defaultIntervalSec).toFixed(2)),
    }));
    rebuildDraftFromRows(next);
  };

  const applyIntervalToSelectedRange = () => {
    if (rows.length === 0) return;
    const start = Math.max(0, Math.min(rows.length - 1, Math.min(rangeStartLine, rangeEndLine) - 1));
    const end = Math.max(0, Math.min(rows.length - 1, Math.max(rangeStartLine, rangeEndLine) - 1));
    const baseTime = rows[start].time;
    const next = rows.map((row, idx) => {
      if (idx < start || idx > end) return row;
      const offset = idx - start;
      return {
        ...row,
        time: Number((baseTime + offset * defaultIntervalSec).toFixed(2)),
      };
    });
    rebuildDraftFromRows(next);
  };

  const handleSaveLyrics = async () => {
    if (!task) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/task/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: lyricsDraft }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "保存失败");
      }
      setTask((prev) => (prev ? { ...prev, lyrics: lyricsDraft } : prev));
      setSaveMsg("歌词时间标记已保存");
      setEditorOpen(false);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">加载详情中...</div>;
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow">
          <div className="text-red-600 mb-4">{error || "未找到歌曲详情"}</div>
          <a href="/history" className="text-blue-600 hover:underline">返回历史记录</a>
        </div>
      </div>
    );
  }

  const audioPath = task.audioFile;
  const audioUrl = task.audioUrlResult;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">歌曲详情</h1>
          <div className="flex items-center gap-4 text-sm">
            <a href="/history" className="text-blue-600 hover:underline">历史记录</a>
            <a href="/gacha-history" className="text-blue-600 hover:underline">抽卡记录</a>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3 bg-white rounded-2xl p-6 shadow space-y-4">
            {task.status === "completed" && (audioPath || audioUrl) ? (
              <AudioPlayer
                audioPath={audioPath}
                audioUrl={audioUrl}
                format={task.format}
                outputFormat={task.outputFormat}
                lyrics={task.lyrics}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />
            ) : (
              <div className="text-gray-600">该任务当前状态为 {task.status}，暂无法播放。</div>
            )}

            {!task.isInstrumental && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">歌词时间标记</h3>
                  <button
                    onClick={() => setEditorOpen((v) => !v)}
                    className="px-3 py-1.5 text-xs rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                  >
                    {editorOpen ? "收起编辑器" : "手动标记时间"}
                  </button>
                </div>

                {editorOpen && (
                  <div className="space-y-3 bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-600">当前播放时间: {formatLrcTag(currentTime)}</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">目标行</label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, draftLines.length)}
                        value={selectedLine + 1}
                        onChange={(e) => setSelectedLine(Math.max(0, Number(e.target.value || 1) - 1))}
                        className="w-20 px-2 py-1 text-xs border rounded"
                      />
                      <button
                        onClick={handleInsertTimestamp}
                        className="px-3 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
                      >
                        插入当前时间标签
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">默认间隔(秒)</label>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={defaultIntervalSec}
                          onChange={(e) => setDefaultIntervalSec(Math.max(0.1, Number(e.target.value) || 5))}
                          className="w-20 px-2 py-1 text-xs border rounded"
                        />
                        <button
                          onClick={applyDefaultInterval}
                          className="px-3 py-1 text-xs rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                        >
                          全部应用间隔
                        </button>
                        <label className="text-xs text-gray-600 ml-2">起始行</label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, rows.length)}
                          value={rangeStartLine}
                          onChange={(e) => setRangeStartLine(Math.max(1, Math.min(rows.length || 1, Number(e.target.value) || 1)))}
                          className="w-16 px-2 py-1 text-xs border rounded"
                        />
                        <label className="text-xs text-gray-600">结束行</label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, rows.length)}
                          value={rangeEndLine}
                          onChange={(e) => setRangeEndLine(Math.max(1, Math.min(rows.length || 1, Number(e.target.value) || 1)))}
                          className="w-16 px-2 py-1 text-xs border rounded"
                        />
                        <button
                          onClick={applyIntervalToSelectedRange}
                          className="px-3 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          选中区间应用间隔
                        </button>
                        <button
                          onClick={sortRowsByTime}
                          className="px-3 py-1 text-xs rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                        >
                          按时间排序
                        </button>
                      </div>
                      {rows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={Number.isFinite(row.time) ? row.time : 0}
                            onChange={(e) => updateRow(idx, { time: Math.max(0, Number(e.target.value) || 0) })}
                            className="col-span-3 px-2 py-1 text-xs border rounded"
                            placeholder="秒"
                          />
                          <input
                            type="text"
                            value={row.text}
                            onChange={(e) => updateRow(idx, { text: e.target.value })}
                            className="col-span-8 px-2 py-1 text-xs border rounded"
                            placeholder="歌词内容"
                          />
                          <button
                            onClick={() => deleteRow(idx)}
                            className="col-span-1 text-xs text-red-600 hover:underline"
                          >
                            删
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addRow}
                        className="px-3 py-1 text-xs rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                      >
                        新增一行
                      </button>
                    </div>
                    <textarea
                      value={lyricsDraft}
                      onChange={(e) => setLyricsDraft(e.target.value)}
                      className="w-full min-h-[220px] px-3 py-2 text-sm border rounded-lg font-mono"
                      placeholder="例如：[00:12.50] 第一行歌词"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSaveLyrics}
                        disabled={saving}
                        className="px-4 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving ? "保存中..." : "保存歌词标记"}
                      </button>
                      {saveMsg && <span className="text-xs text-gray-600">{saveMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="lg:col-span-2 bg-white rounded-2xl p-6 shadow space-y-4">
            <div>
              <div className="text-xs text-gray-500">Task ID</div>
              <div className="font-mono text-sm text-gray-800 break-all">{task.id}</div>
            </div>
            <div className="text-sm text-gray-700">状态: <span className="font-medium">{task.status}</span></div>
            <div className="text-sm text-gray-700">模型: {task.model}</div>
            <div className="text-sm text-gray-700">类型: {task.isInstrumental ? "纯音乐" : "人声"}</div>
            <div className="text-sm text-gray-700">格式: {task.format.toUpperCase()} / {Math.round(task.bitrate / 1000)}kbps</div>
            <div className="text-sm text-gray-700">时长: {formatDuration(task.musicDuration)}</div>
            <div className="text-sm text-gray-700">大小: {formatSize(task.musicSize)}</div>
            <div className="text-sm text-gray-700">创建: {formatDate(task.createdAt)}</div>
            <div className="text-sm text-gray-700">更新: {formatDate(task.updatedAt)}</div>
            {task.traceId && <div className="text-sm text-gray-700 break-all">Trace ID: {task.traceId}</div>}
            {task.error && <div className="text-sm text-red-600">错误: {task.error}</div>}
          </aside>
        </div>

        <section className="bg-white rounded-2xl p-6 shadow">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">提示词</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.prompt}</p>
        </section>
      </div>
    </main>
  );
}
