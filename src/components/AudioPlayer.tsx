"use client";

import { useState, useRef, useEffect } from "react";
import LyricsDisplay from "./LyricsDisplay";

interface AudioPlayerProps {
  audioPath?: string;  // 本地文件路径，如 /generated/xxx.mp3 (hex 模式)
  audioUrl?: string;  // API 返回的 URL (url 模式)
  format: string;
  outputFormat?: "url" | "hex";
  lyrics?: string;    // 歌词文本（用 \n 分隔）
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export default function AudioPlayer({ audioPath, audioUrl, format, outputFormat, lyrics, onTimeUpdate }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 根据 outputFormat 确定音频源
  const audioSrc = outputFormat === "url" ? audioUrl : audioPath;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // 当 audioSrc 变化时重置播放状态
  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(currentTime, duration);
    }
  }, [currentTime, duration, onTimeUpdate]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [audioSrc]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!audioSrc) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* 播放器主体 */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 space-y-4">
        <audio ref={audioRef} src={audioSrc} preload="metadata" />

        {/* 播放控制 */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-primary-500 hover:bg-primary-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105"
          >
            {isPlaying ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* 进度条 */}
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
            style={{
              background: `linear-gradient(to right, #0ea5e9 ${progress}%, #e5e7eb ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-sm text-gray-600">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 下载按钮 */}
        <a
          href={audioSrc}
          download={outputFormat === "url" ? undefined : `generated-music.${format}`}
          target={outputFormat === "url" ? "_blank" : undefined}
          rel={outputFormat === "url" ? "noopener noreferrer" : undefined}
          className="w-full py-3 bg-white hover:bg-gray-50 text-primary-600 font-medium rounded-lg border-2 border-primary-200 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          {outputFormat === "url" ? `打开链接（24小时有效）` : `下载音频 (.${format.toUpperCase()})`}
        </a>
      </div>

      {/* 歌词显示 - 仅在有歌词时显示 */}
      {lyrics && <LyricsDisplay lyrics={lyrics} duration={duration} currentTime={currentTime} />}
    </div>
  );
}
