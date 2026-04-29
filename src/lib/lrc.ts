/**
 * LRC 歌词解析工具
 * 支持格式：[mm:ss.xx] 歌词文本 或 [mm:ss] 歌词文本
 */

// 解析 LRC 时间标签
function parseTimeTag(tag: string): number | null {
  // 支持格式: [00:15.00] 或 [00:15]
  const match = tag.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const centiseconds = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;

  return minutes * 60 + seconds + centiseconds / 1000;
}

export interface LrcLine {
  time: number;      // 秒数
  text: string;      // 歌词文本（不含时间标签）
}

// 解析 LRC 格式歌词
export function parseLrc(lrcText: string): LrcLine[] {
  const lines: LrcLine[] = [];

  for (const line of lrcText.split("\n")) {
    // 提取所有时间标签
    const timeTags = line.match(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g) || [];
    // 提取歌词文本（移除所有时间标签）
    const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").trim();

    if (timeTags.length === 0 || !text) continue;

    for (const tag of timeTags) {
      const time = parseTimeTag(tag);
      if (time !== null) {
        lines.push({ time, text });
      }
    }
  }

  // 按时间排序
  lines.sort((a, b) => a.time - b.time);

  return lines;
}

// 检查是否为 LRC 格式歌词（有时间标签）
export function isLrcFormat(text: string): boolean {
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(text);
}

// 判断是否为段落标签（如 [Intro]、[Verse]、[Chorus]）
function isSectionTag(text: string): boolean {
  const sectionTags = /^\[(Intro|Verse|Chorus|Bridge|Pre-Chorus|Outro|Hook|Rap|Solo|Instrumental|Interlude|Outro)\]$/i;
  return sectionTags.test(text.trim());
}

// 估算静态歌词每行时间（用于非 LRC 格式）
// 过滤掉段落标签，只对实际歌词行进行均分
export function estimateStaticLyrics(text: string, duration: number): LrcLine[] {
  // 分割并过滤：移除空行和段落标签
  const lyricLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isSectionTag(line));

  if (lyricLines.length === 0 || duration <= 0) return [];

  const avgDuration = duration / lyricLines.length;

  return lyricLines.map((text, index) => ({
    time: index * avgDuration,
    text,
  }));
}
