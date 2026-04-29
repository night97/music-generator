"use client";

import { useState } from "react";
import { MusicGenerationParams } from "./MusicForm";

interface QuickGenerateProps {
  onGenerate: (params: MusicGenerationParams) => Promise<void>;
  isGenerating: boolean;
}

const STYLES = [
  { id: "pop", label: "流行", emoji: "🎤", keywords: ["欢快", "朗朗上口", "现代"] },
  { id: "folk", label: "民谣", emoji: "🎸", keywords: ["原声", "叙事", "温暖"] },
  { id: "electronic", label: "电子", emoji: "🎹", keywords: ["合成器", "节奏感", "迷幻"] },
  { id: "rock", label: "摇滚", emoji: "🎸", keywords: ["能量", "激情", "电吉他"] },
  { id: "classical", label: "古典/轻音乐", emoji: "🎻", keywords: ["器乐", "优雅", "舒缓"] },
  { id: "cinematic", label: "影视配乐", emoji: "🎬", keywords: ["氛围", "情绪", "戏剧性"] },
];

const QUICK_SYSTEM_PROMPT = `你是一个专业的音乐创作助手。根据用户提供的关键词和风格，快速生成一首歌曲的完整描述。

请直接输出，不要废话，格式如下：
1. 第一行：歌曲主题/故事（一句话）
2. 第二行开始：详细的音乐描述（100字左右）

描述要包含：
- 音乐风格
- 情绪氛围
- 主要乐器
- 节奏速度
- 目标听众

格式示例：
暗恋的心情
温暖抒情的流行民谣，表达暗恋的甜蜜与忐忑。节奏舒缓，以钢琴和吉他为主要乐器，营造出午后的慵懒感。中速节奏，旋律优美易记，适合年轻人群在休闲时聆听。`;

const LYRICS_SYSTEM_PROMPT = `你是一个专业的歌词创作助手。根据给定的歌曲主题和风格，快速创作一首完整的歌词。

要求：
1. 歌词要有情感共鸣
2. 结构清晰：前奏、主歌、副歌、桥段
3. 不要使用特殊标签如[Verse]等
4. 直接输出歌词内容，不要额外解释
5. 歌词长度适中（8-12段）`;

export default function QuickGenerate({ onGenerate, isGenerating }: QuickGenerateProps) {
  const [keywords, setKeywords] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
  const [step, setStep] = useState<"input" | "generating" | "done">("input");
  const [generatedDesc, setGeneratedDesc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!keywords.trim()) {
      setError("请输入关键词");
      return;
    }

    setError(null);
    setStep("generating");

    try {
      const style = STYLES.find((s) => s.id === selectedStyle);

      // 调用 AI 生成描述
      const descResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `关键词：${keywords}\n风格：${style?.label}\n${style?.keywords?.join("、")}`,
            },
          ],
          systemPrompt: QUICK_SYSTEM_PROMPT,
        }),
      });

      const descData = await descResponse.json();
      if (!descResponse.ok) throw new Error(descData.error || "生成描述失败");
      setGeneratedDesc(descData.content);

      // 调用 AI 生成歌词
      const lyricsResponse = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "write_full_song",
          prompt: keywords,
          title: descData.content?.split("\n")[0] || keywords,
        }),
      });

      const lyricsData = await lyricsResponse.json();

      // 提取描述中的风格标签
      const prompt = descData.content?.split("\n").slice(1).join(" ") || keywords;

      // 开始生成音乐
      await onGenerate({
        model: "music-2.6",
        prompt: prompt,
        lyrics: lyricsData.lyrics || "",
        isInstrumental: false,
        lyricsOptimizer: false,
        sampleRate: 44100,
        bitrate: 256000,
        format: "mp3",
        outputFormat: "hex",
        aigcWatermark: false,
      });

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setStep("input");
    }
  };

  const handleReset = () => {
    setStep("input");
    setKeywords("");
    setGeneratedDesc("");
    setError(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
        <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        一键生成
      </h2>

      {step === "input" && (
        <div className="space-y-6">
          {/* 关键词输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              描述你想要的音乐
            </label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：夏天的海边、夜晚的孤独、分手后的心情..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              用几个关键词或一句话描述你的音乐想法
            </p>
          </div>

          {/* 风格选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择风格
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 rounded-xl border-2 transition-all text-center ${
                    selectedStyle === style.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-primary-200"
                  }`}
                >
                  <div className="text-xl mb-1">{style.emoji}</div>
                  <div className="text-sm font-medium text-gray-900">{style.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 快速生成按钮 */}
          <button
            onClick={handleGenerate}
            disabled={!keywords.trim()}
            className={`w-full py-4 rounded-xl font-medium text-white transition-all ${
              !keywords.trim()
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              一键生成
            </span>
          </button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}

      {step === "generating" && (
        <div className="space-y-6">
          {/* 生成中状态 */}
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI 正在为你创作</h3>
            <p className="text-sm text-gray-500 mb-4">生成描述和歌词，然后开始创作音乐...</p>
          </div>

          {/* 显示生成的描述 */}
          {generatedDesc && (
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">生成的描述：</h4>
              <p className="text-sm text-gray-600 whitespace-pre-line">
                {generatedDesc}
              </p>
            </div>
          )}

          {/* 取消按钮 */}
          <button
            onClick={handleReset}
            className="w-full py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">已提交生成</h3>
          <p className="text-sm text-gray-500 mb-4">音乐正在生成中，请查看右侧播放器</p>
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
          >
            再来一首
          </button>
        </div>
      )}
    </div>
  );
}
