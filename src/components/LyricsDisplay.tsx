"use client";

import { useRef, useEffect, useMemo } from "react";
import { parseLrc, isLrcFormat, estimateStaticLyrics, LrcLine } from "@/lib/lrc";

interface LyricsDisplayProps {
  lyrics: string;
  duration: number;
  currentTime: number;
}

export default function LyricsDisplay({ lyrics, duration, currentTime }: LyricsDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastScrolledIndexRef = useRef<number>(-1);

  // 解析歌词
  const parsedLines: LrcLine[] = useMemo(() => {
    if (!lyrics?.trim()) return [];
    if (isLrcFormat(lyrics)) return parseLrc(lyrics);
    if (duration <= 0) return [];
    return estimateStaticLyrics(lyrics, duration);
  }, [lyrics, duration]);

  // 计算当前行索引
  const activeIndex = useMemo(() => {
    if (parsedLines.length === 0 || currentTime < 0) return -1;

    for (let i = 0; i < parsedLines.length; i++) {
      const start = parsedLines[i].time;
      const next = parsedLines[i + 1];
      const end = next ? next.time : Number.POSITIVE_INFINITY;

      if (currentTime + 0.08 >= start && currentTime < end - 0.02) {
        return i;
      }
    }

    if (currentTime >= parsedLines[parsedLines.length - 1].time) {
      return parsedLines.length - 1;
    }
    return -1;
  }, [parsedLines, currentTime]);

  // 滚动到当前行
  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolledIndexRef.current) return;

    const targetLine = lineRefs.current[activeIndex];
    if (!targetLine) return;

    targetLine.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });

    lastScrolledIndexRef.current = activeIndex;
  }, [activeIndex]);

  // 无歌词时不显示
  if (parsedLines.length === 0) return null;

  // 时间格式化
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
        <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <span className="text-sm font-medium text-slate-300">歌词</span>
        <span className="ml-auto text-xs text-slate-500">{parsedLines.length} 行</span>
      </div>

      {/* 歌词列表 */}
      <div ref={containerRef} className="max-h-40 overflow-y-auto scroll-smooth py-2">
        {parsedLines.map((line, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={`${line.time}-${index}`}
              ref={(el) => {
                lineRefs.current[index] = el;
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                isActive ? "bg-cyan-500/20" : ""
              }`}
            >
              <span className={`text-xs font-mono w-12 ${isActive ? "text-cyan-400" : "text-slate-500"}`}>
                {formatTime(line.time)}
              </span>
              {isActive ? (
                <svg className="w-3 h-3 text-cyan-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              ) : (
                <span className="w-3 h-3" />
              )}
              <span className={`text-sm ${isActive ? "text-cyan-200 font-medium" : "text-slate-400"}`}>
                {line.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* 底部进度 */}
      <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="text-slate-500">第 {activeIndex + 1} 行</span>
        <span className="text-cyan-400">{formatTime(currentTime)}</span>
      </div>
    </div>
  );
}
