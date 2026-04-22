"use client";

import { useState, useRef } from "react";

interface MusicFormProps {
  onGenerate: (data: MusicGenerationParams) => Promise<void>;
  isGenerating: boolean;
}

export interface MusicGenerationParams {
  model: string;
  prompt: string;
  lyrics: string;
  isInstrumental: boolean;
  sampleRate: number;
  bitrate: number;
  format: string;
  outputFormat?: "hex" | "url";
  lyricsOptimizer?: boolean;
  audioUrl?: string;
  audioBase64?: string;
  aigcWatermark?: boolean;
}

const MODELS = [
  { value: "music-2.6", label: "Music 2.6 (推荐)", description: "全新音乐生成模型" },
  { value: "music-cover", label: "Music Cover", description: "参考音频翻唱" },
];

const SAMPLE_RATES = [16000, 24000, 32000, 44100];
const BITRATES = [32000, 64000, 128000, 256000];
const FORMATS = ["mp3", "wav", "pcm"];

export default function MusicForm({ onGenerate, isGenerating }: MusicFormProps) {
  const [model, setModel] = useState("music-2.6");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [sampleRate, setSampleRate] = useState(44100);
  const [bitrate, setBitrate] = useState(256000);
  const [format, setFormat] = useState("mp3");
  const [outputFormat, setOutputFormat] = useState<"url" | "hex">("hex");
  const [aigcWatermark, setAigcWatermark] = useState(false);

  // 参考音频相关状态 (music-cover 模型)
  const [audioUrl, setAudioUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动生成歌词开关
  const [autoGenerateLyrics, setAutoGenerateLyrics] = useState(false);

  // 歌词生成相关状态
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [lyricsMode, setLyricsMode] = useState<"new" | "edit">("new");
  const [lyricsPrompt, setLyricsPrompt] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      alert("请输入音乐描述");
      return;
    }

    // music-cover 模型必须提供参考音频
    if (model === "music-cover" && !audioUrl && !audioFile) {
      alert("Music Cover 模型需要提供参考音频");
      return;
    }

    // music-2.6 模型如果没有歌词且未开启自动生成歌词，询问是否生成纯音乐
    // music-cover 模型歌词是可选的，不强制要求
    if (model !== "music-cover" && !isInstrumental && !lyrics.trim() && !autoGenerateLyrics) {
      const confirmed = confirm("未输入歌词，是否生成纯音乐？");
      if (!confirmed) return;
      setIsInstrumental(true);
    }

    // 如果选择了文件，先转换为 base64
    let audioBase64: string | undefined;
    if (audioFile) {
      setIsUploading(true);
      try {
        audioBase64 = await fileToBase64(audioFile);
      } catch {
        alert("文件处理失败");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    await onGenerate({
      model,
      prompt,
      lyrics: isInstrumental ? "" : (autoGenerateLyrics ? "" : lyrics),
      isInstrumental: model === "music-cover" ? false : isInstrumental,
      lyricsOptimizer: autoGenerateLyrics,
      sampleRate,
      bitrate,
      format,
      outputFormat,
      aigcWatermark,
      audioUrl: audioUrl || undefined,
      audioBase64,
    });
  };

  // 文件转 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 验证文件大小 (最大 50MB)
      if (file.size > 50 * 1024 * 1024) {
        alert("文件大小不能超过 50MB");
        return;
      }
      setAudioFile(file);
      setAudioUrl(""); // 清除 URL 输入
    }
  };

  // 处理 URL 输入
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAudioUrl(e.target.value);
    setAudioFile(null); // 清除文件选择
  };

  // AI 生成歌词
  const handleGenerateLyrics = async () => {
    if (!lyricsPrompt.trim() && lyricsMode === "new") {
      alert("请输入歌词描述");
      return;
    }

    if (lyricsMode === "edit" && !lyrics.trim()) {
      alert("请先输入要续写的歌词");
      return;
    }

    setIsGeneratingLyrics(true);

    try {
      const response = await fetch("/api/lyrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: lyricsMode === "new" ? "write_full_song" : "edit",
          prompt: lyricsPrompt || prompt,
          lyrics: lyricsMode === "edit" ? lyrics : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "歌词生成失败");
      }

      if (lyricsMode === "new" && data.lyrics) {
        setLyrics(data.lyrics);
        if (data.songTitle && !prompt.trim()) {
          setPrompt(data.songTitle);
        }
        if (data.styleTags && prompt.trim()) {
          setPrompt(prev => prev + "\n风格: " + data.styleTags);
        }
      } else if (lyricsMode === "edit" && data.lyrics) {
        setLyrics(prev => prev + "\n\n" + data.lyrics);
      }

      alert("歌词生成成功！");
    } catch (error) {
      alert(error instanceof Error ? error.message : "歌词生成失败");
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 模型选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择模型
        </label>
        <div className="grid grid-cols-2 gap-3">
          {MODELS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setModel(m.value)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                model === m.value
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:border-primary-200"
              }`}
            >
              <div className="font-medium text-gray-900">{m.label}</div>
              <div className="text-xs text-gray-500">{m.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 参考音频输入 (仅 music-cover 模型) */}
      {model === "music-cover" && (
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-sm font-medium text-amber-800">参考音频 <span className="text-red-500">*</span></span>
          </div>

          <p className="text-xs text-amber-600 mb-3">
            支持 6秒-6分钟 时长的音频文件，最大 50MB
          </p>

          {/* 方式选择：URL 或 文件上传 */}
          <div className="space-y-3">
            {/* URL 输入 */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">方式一：输入音频 URL</label>
              <input
                type="url"
                value={audioUrl}
                onChange={handleUrlChange}
                placeholder="https://example.com/audio.mp3"
                className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>

            {/* 分隔符 */}
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <span className="flex-1 border-t border-gray-300"></span>
              <span>或</span>
              <span className="flex-1 border-t border-gray-300"></span>
            </div>

            {/* 文件上传 */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">方式二：上传本地音频</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.flac,.m4a"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-4 py-2 text-sm border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {audioFile ? audioFile.name : "选择音频文件"}
                </button>
                {audioFile && (
                  <span className="text-xs text-amber-600">
                    ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                )}
              </div>
            </div>
          </div>

          {audioFile && (
            <div className="mt-2 text-xs text-amber-600">
              已选择文件: {audioFile.name}
            </div>
          )}
        </div>
      )}

      {/* 音乐描述 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          音乐描述 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述音乐的风格、情绪、场景... 例如：独立民谣，忧郁，内省，吉他和钢琴伴奏"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
          rows={3}
          maxLength={2000}
        />
        <div className="text-xs text-gray-500 mt-1 text-right">
          {prompt.length}/2000
        </div>
      </div>

      {/* 纯音乐开关 */}
      {model !== "music-cover" && (
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="font-medium text-gray-900">纯音乐模式</div>
          <div className="text-sm text-gray-500">不生成人声歌词</div>
        </div>
        <button
          type="button"
          onClick={() => setIsInstrumental(!isInstrumental)}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            isInstrumental ? "bg-primary-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
              isInstrumental ? "left-[32px]" : "left-1"
            }`}
          />
        </button>
      </div>
      )}

      {/* 歌词输入 */}
      {!isInstrumental && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              歌词
              {model === "music-cover" && (
                <span className="ml-2 text-xs text-gray-500">(可选，不填则从参考音频自动提取)</span>
              )}
            </label>
          </div>

          {/* 自动生成歌词开关 */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100">
            <div>
              <div className="text-sm font-medium text-green-800">自动生成歌词</div>
              <div className="text-xs text-green-600">开启后将根据音乐描述自动生成歌词，无需手动输入</div>
            </div>
            <button
              type="button"
              onClick={() => setAutoGenerateLyrics(!autoGenerateLyrics)}
              className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${
                autoGenerateLyrics ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                  autoGenerateLyrics ? "left-[36px]" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* AI 生成歌词区域 - 自动生成歌词开启时隐藏 */}
          {!autoGenerateLyrics && (
          <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-purple-700">✨ AI 歌词生成</span>
            </div>

            {/* 模式选择 */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setLyricsMode("new")}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  lyricsMode === "new"
                    ? "bg-purple-500 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                生成新歌词
              </button>
              <button
                type="button"
                onClick={() => setLyricsMode("edit")}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  lyricsMode === "edit"
                    ? "bg-purple-500 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                续写歌词
              </button>
            </div>

            {/* 歌词描述输入 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={lyricsPrompt}
                onChange={(e) => setLyricsPrompt(e.target.value)}
                placeholder={
                  lyricsMode === "new"
                    ? "描述想要的歌词主题、风格..."
                    : "描述想要续写的内容方向..."
                }
                className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                disabled={isGeneratingLyrics}
              />
              <button
                type="button"
                onClick={handleGenerateLyrics}
                disabled={isGeneratingLyrics}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  isGeneratingLyrics
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                }`}
              >
                {isGeneratingLyrics ? (
                  <span className="flex items-center gap-1">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    生成中
                  </span>
                ) : (
                  "生成歌词"
                )}
              </button>
            </div>
          </div>
          )}

          {/* 歌词文本框 - 自动生成歌词开启时隐藏 */}
          {!autoGenerateLyrics && (
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={
              model === "music-cover"
                ? "输入歌词（可选），使用 \\n 分隔行，可用标签：[Verse] 主歌，[Chorus] 副歌..."
                : "输入歌词，使用 \\n 分隔行，可用标签：[Verse] 主歌，[Chorus] 副歌，[Bridge] 桥段，[Intro] 前奏"
            }
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none font-mono text-sm"
            rows={6}
          />
          )}
        </div>
      )}

      {/* 音频设置 */}
      <div className="p-4 bg-gray-50 rounded-lg space-y-4">
        <div className="font-medium text-gray-900">音频设置</div>

        <div className="grid grid-cols-4 gap-4">
          {/* 采样率 */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">采样率</label>
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              {SAMPLE_RATES.map((sr) => (
                <option key={sr} value={sr}>
                  {sr / 1000} kHz
                </option>
              ))}
            </select>
          </div>

          {/* 比特率 */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">比特率</label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              {BITRATES.map((br) => (
                <option key={br} value={br}>
                  {(br / 1000).toFixed(0)} kbps
                </option>
              ))}
            </select>
          </div>

          {/* 格式 */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">格式</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* 返回格式 */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">返回格式</label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as "url" | "hex")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="hex">HEX（默认）</option>
              <option value="url">URL</option>
            </select>
          </div>

          {/* 音频水印 */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">AIGC 水印</label>
            <select
              value={aigcWatermark ? "true" : "false"}
              onChange={(e) => setAigcWatermark(e.target.value === "true")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="false">关闭（默认）</option>
              <option value="true">开启</option>
            </select>
          </div>
        </div>
      </div>

      {/* 提交按钮 */}
      <button
        type="submit"
        disabled={isGenerating || isUploading}
        className={`w-full py-4 rounded-lg font-medium text-white transition-all ${
          isGenerating || isUploading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl"
        }`}
      >
        {isGenerating || isUploading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {isUploading ? "处理文件..." : "生成中..."}
          </span>
        ) : (
          "生成音乐"
        )}
      </button>
    </form>
  );
}
