"use client";

import { useState, useEffect } from "react";

interface GenerationRecord {
  id: string;
  taskId: string;
  createdAt: string;
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  traceId: string;
  audioFile: string;
  audioUrlResult?: string;
  musicDuration?: number;
  musicSize?: number;
}

interface Stats {
  totalGenerations: number;
  instrumentalCount: number;
  vocalCount: number;
  totalDuration: number;
  totalSize: number;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<GenerationRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setRecords(data.records || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error("获取记录失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条记录吗？音频文件也会被删除。")) return;

    setDeletingId(id);
    try {
      await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      setRecords(records.filter((r) => r.id !== id));
      // 重新获取统计
      const res = await fetch("/api/history");
      const data = await res.json();
      setStats(data.stats || null);
    } catch (error) {
      alert("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlay = (record: GenerationRecord) => {
    if (playingId === record.id) {
      audioRef?.pause();
      setPlayingId(null);
    } else {
      if (audioRef) {
        audioRef.src = record.audioUrlResult || record.audioFile;
        audioRef.play();
        setPlayingId(record.id);
      }
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "--:--";
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatBitrate = (br: number) => `${br / 1000} kbps`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a href="/" className="text-gray-600 hover:text-primary-500 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </a>
              <h1 className="text-xl font-bold text-gray-900">历史记录</h1>
            </div>
            <a href="/" className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
              返回生成
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-2xl font-bold text-primary-600">{stats.totalGenerations}</div>
              <div className="text-sm text-gray-500">总生成数</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-2xl font-bold text-blue-600">{stats.vocalCount}</div>
              <div className="text-sm text-gray-500">人声歌曲</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-2xl font-bold text-purple-600">{stats.instrumentalCount}</div>
              <div className="text-sm text-gray-500">纯音乐</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="text-2xl font-bold text-green-600">{formatSize(stats.totalSize)}</div>
              <div className="text-sm text-gray-500">总占用空间</div>
            </div>
          </div>
        )}

        {/* 记录列表 */}
        {records.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <h2 className="text-xl font-medium text-gray-700 mb-2">暂无生成记录</h2>
            <p className="text-gray-500 mb-4">开始生成你的第一首音乐吧</p>
            <a href="/" className="inline-block px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
              去生成
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <div key={record.id} className="bg-white rounded-xl p-6 shadow hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* 时间戳 */}
                    <div className="text-sm text-gray-500 mb-2">
                      {formatDate(record.createdAt)}
                      <span className="mx-2">•</span>
                      <span className="text-gray-400">{record.traceId?.slice(0, 8)}...</span>
                    </div>

                    {/* 音乐描述 */}
                    <p className="text-gray-900 font-medium mb-3">{record.prompt}</p>

                    {/* 标签 */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${record.isInstrumental ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {record.isInstrumental ? "纯音乐" : "人声"}
                      </span>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {record.model}
                      </span>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {record.format.toUpperCase()} • {formatBitrate(record.bitrate)}
                      </span>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                        时长: {formatDuration(record.musicDuration)}
                      </span>
                      {record.musicSize && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                          大小: {formatSize(record.musicSize)}
                        </span>
                      )}
                    </div>

                    {/* 歌词预览 */}
                    {record.lyrics && (
                      <details className="mt-2">
                        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                          查看歌词
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 whitespace-pre-wrap font-sans">
                          {record.lyrics}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 ml-4">
                    <a
                      href={`/song/${record.taskId}`}
                      className="px-3 py-2 text-xs bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 transition-colors"
                      title="查看详情"
                    >
                      详情
                    </a>
                    <audio
                      ref={(el) => { if (el && record.id === playingId) setAudioRef(el); }}
                      onEnded={() => setPlayingId(null)}
                    />
                    <button
                      onClick={() => handlePlay(record)}
                      className={`p-2 rounded-lg transition-colors ${playingId === record.id ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      title="播放"
                    >
                      {playingId === record.id ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <a
                      href={record.audioUrlResult || record.audioFile}
                      download={record.audioUrlResult ? undefined : `music_${record.id}.${record.format}`}
                      target={record.audioUrlResult ? "_blank" : undefined}
                      rel={record.audioUrlResult ? "noopener noreferrer" : undefined}
                      className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title={record.audioUrlResult ? "打开链接" : "下载"}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                    <button
                      onClick={() => handleDelete(record.id)}
                      disabled={deletingId === record.id}
                      className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      title="删除"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <audio ref={(el) => { if (el) setAudioRef(el); }} />
    </div>
  );
}
