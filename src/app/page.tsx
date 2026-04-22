"use client";

import { useState } from "react";
import MusicForm, { MusicGenerationParams } from "@/components/MusicForm";
import AudioPlayer from "@/components/AudioPlayer";
import MusicChat from "@/components/MusicChat";
import QuickGenerate from "@/components/QuickGenerate";

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<{
    audioPath: string;
    audioUrl?: string;
    format: string;
    outputFormat?: "url" | "hex";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<"quick" | "form" | "chat">("quick");
  const [chatPrompt, setChatPrompt] = useState("");

  const handleGenerate = async (params: MusicGenerationParams) => {
    setIsGenerating(true);
    setError(null);
    setGeneratedAudio(null);
    setTaskStatus(null);
    setProgress(0);

    try {
      // 发起生成请求
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建任务失败");
      }

      // 获取任务 ID，开始轮询
      const taskId = data.taskId;
      setPollingTaskId(taskId);
      setTaskStatus("pending");

      // 开始轮询
      await pollTaskStatus(taskId, params.format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
    }
  };

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string, format: string): Promise<void> => {
    const maxAttempts = 60; // 10分钟，每10秒一次
    const pollInterval = 10000; // 10秒

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/task/${taskId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "查询任务状态失败");
        }

        const task = data.task;
        setTaskStatus(task.status);
        setProgress((attempt / maxAttempts) * 100);

        if (task.status === "completed") {
          // 任务完成
          setGeneratedAudio({
            audioPath: task.audioFile,
            audioUrl: task.audioUrlResult,
            format: task.format || format,
            outputFormat: task.outputFormat,
          });
          setIsGenerating(false);
          setPollingTaskId(null);
          return;
        }

        if (task.status === "failed") {
          // 任务失败
          throw new Error(task.error || "音乐生成失败");
        }

        // 继续等待
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      } catch (error) {
        throw error;
      }
    }

    throw new Error("音乐生成超时（超过10分钟）");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50">
      <div className="h-1 bg-gradient-to-r from-primary-400 via-purple-400 to-pink-400" />

      {/* 顶部导航 */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex justify-end">
          <a
            href="/history"
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-primary-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            历史记录
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* 标题区域 */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            MiniMax AI 驱动
          </div>
          <h1 className="text-5xl font-bold mb-4">
            <span className="gradient-text">AI 音乐生成器</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            输入音乐描述或歌词，AI 将为你创作独特的音乐作品
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setMode("quick")}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                mode === "quick"
                  ? "bg-white text-primary-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              一键生成
            </button>
            <button
              onClick={() => setMode("form")}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                mode === "form"
                  ? "bg-white text-primary-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              详细表单
            </button>
            <button
              onClick={() => setMode("chat")}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                mode === "chat"
                  ? "bg-white text-primary-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              AI 对话
            </button>
          </div>
        </div>

        {/* 主内容区 */}
        {mode === "quick" ? (
          /* 一键生成模式 */
          <div className="grid xl:grid-cols-5 gap-8 items-start">
            {/* 左：一键生成 */}
            <div className="xl:col-span-3 xl:sticky xl:top-4">
              <QuickGenerate
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            </div>

            {/* 右：播放器 → 需要灵感 → 使用提示 */}
            <div className="xl:col-span-2 space-y-6">
              {/* 生成状态 */}
              {isGenerating && pollingTaskId && (
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">正在生成音乐</h3>
                      <p className="text-sm text-gray-600">AI 正在为你创作，请稍候...</p>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>处理中</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        taskStatus === "pending" ? "bg-yellow-400" :
                        taskStatus === "processing" ? "bg-blue-400" :
                        taskStatus === "completed" ? "bg-green-400" :
                        "bg-gray-400"
                      }`} />
                      <span>
                        {taskStatus === "pending" ? "任务已创建，排队中..." :
                         taskStatus === "processing" ? "正在生成音乐..." :
                         taskStatus === "completed" ? "生成完成！" :
                         "等待处理..."}
                      </span>
                    </div>
                    <div>任务 ID: {pollingTaskId}</div>
                    <div>预计时间: 1-3 分钟</div>
                  </div>
                </div>
              )}

              {/* 播放器 */}
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  生成的音乐
                </h2>

                {generatedAudio ? (
                  <AudioPlayer
                    audioPath={generatedAudio.audioPath}
                    audioUrl={generatedAudio.audioUrl}
                    format={generatedAudio.format}
                    outputFormat={generatedAudio.outputFormat}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p className="text-sm">点击一键生成开始创作</p>
                    <p className="text-xs mt-1 text-gray-400">音乐将在此处显示</p>
                  </div>
                )}
              </div>

              {/* 需要灵感 */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-purple-900 mb-2">需要灵感？</h3>
                <p className="text-sm text-purple-600 mb-4">切换到 AI 对话，帮你细化需求</p>
                <button
                  onClick={() => setMode("chat")}
                  className="w-full px-5 py-3 bg-white border border-purple-200 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  开启 AI 对话
                </button>
              </div>

              {/* 使用提示 */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  使用提示
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 输入几个关键词即可开始</li>
                  <li>• 选择风格获得更好效果</li>
                  <li>• 需要精细控制请用详细表单</li>
                  <li>• 生成需要 1-3 分钟</li>
                </ul>
              </div>
            </div>
          </div>
        ) : mode === "chat" ? (
          /* AI 对话模式 */
          <div className="grid xl:grid-cols-2 gap-8 items-start">
            {/* 左侧：对话 */}
            <div className="xl:sticky xl:top-4">
              <MusicChat
                onApplyPrompt={(prompt) => {
                  setChatPrompt(prompt);
                  setMode("form");
                }}
                currentPrompt={chatPrompt}
              />
            </div>

            {/* 右侧：生成状态 → 表单 → 播放器堆叠 */}
            <div className="space-y-6">
              {/* 生成状态 */}
              {isGenerating && pollingTaskId && (
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">正在生成音乐</h3>
                      <p className="text-sm text-gray-600">AI 正在为你创作，请稍候...</p>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>处理中</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        taskStatus === "pending" ? "bg-yellow-400" :
                        taskStatus === "processing" ? "bg-blue-400" :
                        taskStatus === "completed" ? "bg-green-400" :
                        "bg-gray-400"
                      }`} />
                      <span>
                        {taskStatus === "pending" ? "任务已创建，排队中..." :
                         taskStatus === "processing" ? "正在生成音乐..." :
                         taskStatus === "completed" ? "生成完成！" :
                         "等待处理..."}
                      </span>
                    </div>
                    <div>任务 ID: {pollingTaskId}</div>
                    <div>预计时间: 1-3 分钟</div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  创建你的音乐
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  先在左侧和 AI 助手对话，生成满意的描述后再切换到这里填写表单并生成音乐。
                </p>
                <MusicForm onGenerate={handleGenerate} isGenerating={isGenerating} />

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="font-medium text-red-800">生成失败</h4>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 播放器（对话模式下显示在右侧底部） */}
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  生成的音乐
                </h2>

                {generatedAudio ? (
                  <AudioPlayer
                    audioPath={generatedAudio.audioPath}
                    audioUrl={generatedAudio.audioUrl}
                    format={generatedAudio.format}
                    outputFormat={generatedAudio.outputFormat}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p className="text-sm">音乐将在此处显示</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* 直接填写模式 */
          <div className="grid xl:grid-cols-5 gap-8 items-start">
            {/* 左：表单 */}
            <div className="xl:col-span-3 xl:sticky xl:top-4">
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  创建你的音乐
                </h2>
                <MusicForm onGenerate={handleGenerate} isGenerating={isGenerating} />

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="font-medium text-red-800">生成失败</h4>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右：生成状态 → 播放器 → 需要灵感 → 使用提示 */}
            <div className="xl:col-span-2 space-y-6">
              {/* 生成状态（右上，生成中时显示在最上方） */}
              {isGenerating && pollingTaskId && (
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">正在生成音乐</h3>
                      <p className="text-sm text-gray-600">AI 正在为你创作，请稍候...</p>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>处理中</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        taskStatus === "pending" ? "bg-yellow-400" :
                        taskStatus === "processing" ? "bg-blue-400" :
                        taskStatus === "completed" ? "bg-green-400" :
                        "bg-gray-400"
                      }`} />
                      <span>
                        {taskStatus === "pending" ? "任务已创建，排队中..." :
                         taskStatus === "processing" ? "正在生成音乐..." :
                         taskStatus === "completed" ? "生成完成！" :
                         "等待处理..."}
                      </span>
                    </div>
                    <div>任务 ID: {pollingTaskId}</div>
                    <div>预计时间: 1-3 分钟</div>
                  </div>
                </div>
              )}

              {/* 播放器 */}
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  生成的音乐
                </h2>

                {generatedAudio ? (
                  <AudioPlayer
                    audioPath={generatedAudio.audioPath}
                    audioUrl={generatedAudio.audioUrl}
                    format={generatedAudio.format}
                    outputFormat={generatedAudio.outputFormat}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p className="text-sm">填写表单并点击生成按钮</p>
                    <p className="text-xs mt-1 text-gray-400">音乐将在此处显示</p>
                  </div>
                )}
              </div>

              {/* 需要灵感 */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-purple-900 mb-2">需要灵感？</h3>
                <p className="text-sm text-purple-600 mb-4">让 AI 助手帮你细化音乐描述，生成更精准的提示词</p>
                <button
                  onClick={() => setMode("chat")}
                  className="w-full px-5 py-3 bg-white border border-purple-200 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  开启 AI 对话
                </button>
              </div>

              {/* 使用提示 */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  使用提示
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 音乐描述越详细，生成效果越好</li>
                  <li>• 可以指定乐器、节奏、情绪等</li>
                  <li>• 歌词支持 [Verse]、[Chorus] 等标签</li>
                  <li>• 生成音乐通常需要 1-3 分钟</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 底部 */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>
            基于{" "}
            <a
              href="https://platform.minimaxi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:underline"
            >
              MiniMax AI
            </a>{" "}
            音乐生成 API
          </p>
        </div>
      </div>
    </main>
  );
}
