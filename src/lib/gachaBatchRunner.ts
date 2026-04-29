import {
  createTask,
  markTaskCompleted,
  markTaskFailed,
  markTaskProcessing,
  updateGachaBatchItem,
  getGachaBatchById,
  updateGachaBatchMeta,
  rollbackGeneratingItemsToPending,
  saveAudioFile,
  updateTaskLyrics,
  updateRecordLyricsByTaskId,
  type GachaQualityStrictness,
} from "@/lib/storage";
import { gachaLog } from "@/lib/gachaLogger";

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/music_generation";
const MINIMAX_MESSAGES_API_URL = "https://api.minimaxi.com/anthropic/v1/messages";

interface MiniMaxResponse {
  data?: {
    status: number;
    audio?: string;
    lyrics?: string;
    generated_lyrics?: string;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  extra_info?: {
    music_duration?: number;
    music_size?: number;
  };
  trace_id?: string;
  lyrics?: string;
  generated_lyrics?: string;
  result?: {
    lyrics?: string;
    generated_lyrics?: string;
  };
}

interface MiniMaxMessagesResponse {
  content?: Array<{ type: string; text?: string; thinking?: string }>;
  error?: { message?: string };
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface PromptOptimizationResult {
  optimizedPrompt: string;
  notes: string;
}

interface LyricsQualityReviewResult {
  pass: boolean;
  issues: string[];
}

interface LyricsQualityRuleProfile {
  minTotalLines: number;
  minChorusLines: number;
  minUniqueLineLength: number;
  minRhymeRepeatInChorus: number;
  requireAiReviewPass: boolean;
}

class LyricsQualityError extends Error {
  lyrics: string;
  issues: string[];

  constructor(message: string, lyrics: string, issues: string[]) {
    super(message);
    this.name = "LyricsQualityError";
    this.lyrics = lyrics;
    this.issues = issues;
  }
}

const runningBatches = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getLyricsQualityRuleProfile(strictness: GachaQualityStrictness): LyricsQualityRuleProfile {
  if (strictness === "loose") {
    return {
      minTotalLines: 6,
      minChorusLines: 3,
      minUniqueLineLength: 2,
      minRhymeRepeatInChorus: 1,
      requireAiReviewPass: false,
    };
  }
  if (strictness === "strict") {
    return {
      minTotalLines: 10,
      minChorusLines: 4,
      minUniqueLineLength: 4,
      minRhymeRepeatInChorus: 3,
      requireAiReviewPass: true,
    };
  }
  return {
    minTotalLines: 8,
    minChorusLines: 4,
    minUniqueLineLength: 3,
    minRhymeRepeatInChorus: 2,
    requireAiReviewPass: true,
  };
}

function extractLyrics(data: MiniMaxResponse): string | undefined {
  const candidates = [
    data.data?.lyrics,
    data.data?.generated_lyrics,
    data.lyrics,
    data.generated_lyrics,
    data.result?.lyrics,
    data.result?.generated_lyrics,
  ];
  return candidates.find((v) => typeof v === "string" && v.trim().length > 0);
}

function buildConstrainedLyricsPrompt(basePrompt: string, retryGuidance?: string): string {
  const extra = retryGuidance?.trim()
    ? ["", "额外修正要求（必须满足）：", retryGuidance.trim()].join("\n")
    : "";
  return [
    "请基于下面的音乐创作描述生成完整中文歌词。",
    "硬性约束：",
    "1. 歌词内容、意象、时代感、叙事语境必须与描述一致。",
    "2. 禁止出现与风格冲突的元素（例如古风场景下出现明显现代电音/夜店/赛博术语，除非原描述明确要求）。",
    "3. 不要凭空添加与原描述相反的乐器或世界观设定。",
    "4. 句尾尽量押韵，尤其副歌段必须有明显押韵（可用 AAAA、AABB 或 ABAB）。",
    "5. 每句字数不固定，长短句要自然交替，避免所有行字数几乎一致。",
    "6. 副歌不能过短，至少 4 行，并有足够记忆点，长度接近常见流行歌曲副歌。",
    "7. 输出时请显式使用结构标签：[Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Chorus]。",
    "8. 建议结构：主歌1-副歌-主歌2-副歌-桥段-副歌（可微调，但需有完整副歌表达）。",
    "9. 保持语义连贯、可演唱、情绪统一。",
    "",
    `原始描述：${basePrompt}`,
    extra,
  ].join("\n");
}

function hasObviousStyleConflict(prompt: string, lyrics: string): boolean {
  const ancientStyle = /(古风|国风|江南|青石板|油纸伞|琴瑟|水墨|宫商角徵羽)/.test(prompt);
  const modernConflict = /(电吉他|EDM|808|trap|夜店|赛博朋克|neon|auto[\s-]?tune)/i.test(lyrics);
  if (ancientStyle && modernConflict) return true;
  return false;
}

function getLyricLines(lyrics: string): string[] {
  return lyrics
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .filter((x) => !/^\[[^\]]+\]$/.test(x))
    .filter((x) => !/^(主歌|副歌|桥段|verse|chorus|bridge)[:：]?\s*$/i.test(x));
}

function getLastHanChar(line: string): string {
  const cleaned = line.replace(/[，。！？；：、,.!?;:\s]/g, "");
  const match = cleaned.match(/[\u4e00-\u9fa5](?!.*[\u4e00-\u9fa5])/);
  return match?.[0] || "";
}

function collectChorusLines(lyrics: string): string[] {
  const rows = lyrics.split(/\r?\n/);
  const chorus: string[] = [];
  let inChorus = false;
  for (const rowRaw of rows) {
    const row = rowRaw.trim();
    if (!row) {
      if (inChorus && chorus.length > 0) break;
      continue;
    }
    if (/^(副歌|chorus)[:：]?\s*$/i.test(row) || /^\[[^\]]*(副歌|chorus)[^\]]*\]$/i.test(row)) {
      inChorus = true;
      continue;
    }
    if (inChorus) {
      if (/^(主歌|verse|桥段|bridge|pre-chorus)[:：]?\s*$/i.test(row) || /^\[[^\]]+\]$/.test(row)) {
        break;
      }
      chorus.push(row);
    }
  }
  return chorus;
}

function evaluateLyricsLocally(lyrics: string, profile: LyricsQualityRuleProfile): string[] {
  const issues: string[] = [];
  const lines = getLyricLines(lyrics);
  if (lines.length < profile.minTotalLines) {
    issues.push(`歌词整体偏短，建议扩展到至少 ${profile.minTotalLines} 行以上`);
    return issues;
  }

  const lengths = lines.map((line) => line.replace(/\s+/g, "").length).filter((n) => n > 0);
  if (lengths.length >= 6) {
    const uniqueCount = new Set(lengths).size;
    if (uniqueCount < profile.minUniqueLineLength) {
      issues.push("句长变化不足，存在明显“每句字数过于固定”问题");
    }
  }

  const chorusLines = collectChorusLines(lyrics);
  if (chorusLines.length > 0 && chorusLines.length < profile.minChorusLines) {
    issues.push(`副歌行数过短，建议副歌至少 ${profile.minChorusLines} 行`);
  }
  if (chorusLines.length >= profile.minChorusLines) {
    const chorusEnds = chorusLines.map(getLastHanChar).filter((x) => x);
    if (chorusEnds.length >= profile.minChorusLines) {
      const counts = new Map<string, number>();
      for (const ch of chorusEnds) counts.set(ch, (counts.get(ch) || 0) + 1);
      const top = Math.max(...Array.from(counts.values()));
      if (top < profile.minRhymeRepeatInChorus) {
        issues.push("副歌押韵感较弱，建议统一至少两句以上韵脚");
      }
    }
  }

  return issues;
}

function parseLyricsQualityResponse(raw: string): LyricsQualityReviewResult | null {
  const normalized = raw.replace(/```json/gi, "```").replace(/```/g, "").trim();
  if (/^PASS$/i.test(normalized)) {
    return { pass: true, issues: [] };
  }
  if (/^FAIL\s*[:|：]/i.test(normalized)) {
    const issueText = normalized.replace(/^FAIL\s*[:|：]\s*/i, "").trim();
    const issues = issueText
      .split(/[;；|]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    return { pass: false, issues: issues.length > 0 ? issues : ["歌词质量未通过"] };
  }

  const candidates: string[] = [normalized];

  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(normalized.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        pass?: boolean;
        ok?: boolean;
        issues?: string[] | string;
        reason?: string;
      };
      const pass = Boolean(parsed.pass ?? parsed.ok);
      const rawIssues = Array.isArray(parsed.issues)
        ? parsed.issues
        : typeof parsed.issues === "string"
          ? [parsed.issues]
          : typeof parsed.reason === "string"
            ? [parsed.reason]
            : [];
      const issues = rawIssues.map((x) => x.trim()).filter((x) => x.length > 0);
      return { pass, issues };
    } catch {
      // continue
    }
  }

  return null;
}

async function reviewLyricsQuality(
  prompt: string,
  lyrics: string,
  apiKey: string,
  timeoutMs: number,
  strictness: GachaQualityStrictness
): Promise<LyricsQualityReviewResult> {
  const profile = getLyricsQualityRuleProfile(strictness);
  const localIssues = evaluateLyricsLocally(lyrics, profile);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MINIMAX_MESSAGES_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        max_tokens: 160,
        system:
          `你是中文歌词质检器。严格度=${strictness}。只输出一行：通过输出 PASS；不通过输出 FAIL:问题1;问题2。不要解释。判定：1)副歌押韵感；2)句长不能过于整齐；3)副歌行数与记忆点；4)风格一致。`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `风格描述：${prompt}\n\n歌词：\n${lyrics}`,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      gachaLog.warn("歌词质检接口失败，降级本地质检", {
        step: "lyrics_review_http_failed",
        status: response.status,
      });
      return { pass: localIssues.length === 0, issues: localIssues };
    }

    const data = (await response.json()) as MiniMaxMessagesResponse;
    const textBlock = data.content?.find((x) => x.type === "text")?.text?.trim() || "";
    const thinkingBlock = data.content?.find((x) => x.type === "thinking")?.thinking?.trim() || "";
    const parsed = (textBlock && parseLyricsQualityResponse(textBlock)) || (thinkingBlock && parseLyricsQualityResponse(thinkingBlock)) || null;

    if (!parsed) {
      gachaLog.info("歌词质检返回不可解析，降级本地质检", {
        step: "lyrics_review_parse_failed",
        stopReason: data.stop_reason,
        outputTokens: data.usage?.output_tokens,
      });
      return { pass: localIssues.length === 0, issues: localIssues };
    }

    const mergedIssues = Array.from(new Set([...localIssues, ...parsed.issues]));
    const pass = profile.requireAiReviewPass
      ? parsed.pass && mergedIssues.length === 0
      : mergedIssues.length === 0;
    return { pass, issues: mergedIssues };
  } finally {
    clearTimeout(timer);
  }
}

function parseOptimizationResponse(raw: string): PromptOptimizationResult | null {
  const normalized = raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const candidates: string[] = [];

  // 1) 快速路径：整体尝试
  candidates.push(normalized);

  // 2) 从任意文本提取完整 JSON 对象片段（兼容 thinking + 截断 text 场景）
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(normalized.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { optimizedPrompt?: string; notes?: string };
      const optimizedPrompt = parsed.optimizedPrompt
        ?.replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      if (!optimizedPrompt) continue;
      if (/"optimizedPrompt"\s*:/.test(optimizedPrompt)) continue;
      if (optimizedPrompt.length < 12) continue;
      const notes = parsed.notes?.trim() || "已补充风格、节奏、乐器与情绪细节";
      return { optimizedPrompt, notes };
    } catch {
      // try next candidate
    }
  }

  return null;
}

function extractJsonStringValue(raw: string, key: string): string | null {
  const keyPattern = `"${key}"`;
  const keyIndex = raw.indexOf(keyPattern);
  if (keyIndex < 0) return null;

  const colonIndex = raw.indexOf(":", keyIndex + keyPattern.length);
  if (colonIndex < 0) return null;

  let i = colonIndex + 1;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== "\"") return null;

  i++;
  let escaped = false;
  let value = "";
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      if (ch === "n") value += "\n";
      else if (ch === "t") value += "\t";
      else value += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      return value.trim();
    }
    value += ch;
  }

  return value.trim() || null;
}

function heuristicOptimizationFallback(raw: string): PromptOptimizationResult | null {
  const normalized = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const keyValue = extractJsonStringValue(normalized, "optimizedPrompt");
  if (keyValue && keyValue.length >= 12) {
    const notes = extractJsonStringValue(normalized, "notes") || "优化接口未返回标准 JSON，已使用启发式解析";
    return { optimizedPrompt: keyValue, notes };
  }

  const labeled = normalized.match(/优化后[:：]\s*([\s\S]+)/);
  if (labeled?.[1]) {
    const candidate = labeled[1].trim();
    if (candidate.length >= 12) {
      return {
        optimizedPrompt: candidate,
        notes: "优化接口返回标签文本，已提取“优化后”内容",
      };
    }
  }

  if (normalized.length >= 24) {
    return {
      optimizedPrompt: normalized,
      notes: "优化接口未返回标准 JSON，已直接使用文本结果",
    };
  }

  return null;
}

async function optimizePrompt(prompt: string, apiKey: string, timeoutMs: number): Promise<PromptOptimizationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MINIMAX_MESSAGES_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        max_tokens: 1200,
        system:
          "你是专业音乐提示词优化助手。请在不改变原意的前提下，把输入提示词补充为更具体、可执行的音乐生成提示词，补充情绪、节奏、乐器、结构、音色和场景。必须仅输出单行 JSON，不要 markdown、不要解释。格式: {\"optimizedPrompt\":\"...\",\"notes\":\"...\"}",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`提示词优化接口 HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as MiniMaxMessagesResponse;
    const textBlock = data.content?.find((x) => x.type === "text")?.text?.trim() || "";
    const thinkingBlock = data.content?.find((x) => x.type === "thinking")?.thinking?.trim() || "";

    let parsed = textBlock ? parseOptimizationResponse(textBlock) : null;
    if (!parsed && thinkingBlock) {
      parsed = parseOptimizationResponse(thinkingBlock);
    }
    if (!parsed && textBlock) {
      parsed = heuristicOptimizationFallback(textBlock);
    }
    if (!parsed && thinkingBlock) {
      parsed = heuristicOptimizationFallback(thinkingBlock);
    }

    if (!parsed) {
      gachaLog.warn("提示词优化返回无法解析", {
        step: "prompt_opt_parse_failed",
        stopReason: data.stop_reason,
        outputTokens: data.usage?.output_tokens,
        textPreview: textBlock.slice(0, 160),
      });
      throw new Error("提示词优化接口返回非 JSON 或缺少 optimizedPrompt");
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function optimizePromptWithRetry(prompt: string, apiKey: string, timeoutMs: number): Promise<PromptOptimizationResult> {
  let retries = 1;
  let delay = 1200;
  let lastError: unknown;
  while (retries >= 0) {
    try {
      return await optimizePrompt(prompt, apiKey, timeoutMs);
    } catch (error) {
      lastError = error;
      gachaLog.warn("提示词优化失败，准备重试", {
        step: "prompt_opt_retry",
        retriesLeft: retries,
        error: error instanceof Error ? error.message : "未知错误",
      });
      if (retries === 0) break;
      await sleep(delay);
      delay *= 2;
      retries--;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("提示词优化失败");
}

function extractLyricsFromMessagesResponse(data: MiniMaxMessagesResponse): string {
  const textBlock = data.content?.find((x) => x.type === "text")?.text?.trim() || "";
  const thinkingBlock = data.content?.find((x) => x.type === "thinking")?.thinking?.trim() || "";
  const raw = textBlock || thinkingBlock;
  if (!raw) return "";

  const normalized = raw
    .replace(/```lyrics/gi, "```")
    .replace(/```text/gi, "```")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const fromJson = extractJsonStringValue(normalized, "lyrics");
  const lyrics = (fromJson || normalized)
    .replace(/^歌词[:：]\s*/i, "")
    .trim();
  return lyrics;
}

function shouldTryRhymeRepair(issues: string[]): boolean {
  return issues.some((x) => /押韵|韵脚/.test(x));
}

async function polishLyricsForRhyme(
  prompt: string,
  lyrics: string,
  issues: string[],
  apiKey: string,
  timeoutMs: number,
  strictness: GachaQualityStrictness
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MINIMAX_MESSAGES_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        max_tokens: 1400,
        system:
          "你是中文歌词润色器。任务：仅对副歌韵脚与可唱性做最小必要修改，不改变主题与结构标签。只输出完整歌词正文，不要解释。",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `音乐目标：${prompt}`,
                  "",
                  "当前歌词：",
                  lyrics,
                  "",
                  `需修复问题：${issues.join("；")}`,
                  "",
                  "修复要求：",
                  "1) 保留原有结构标签和段落顺序；",
                  "2) 重点修复 [Chorus]/副歌 的句尾押韵（至少两句同韵）；",
                  `3) 副歌不少于${getLyricsQualityRuleProfile(strictness).minChorusLines}行；`,
                  "4) 不要改成口号式短句堆叠，保持流行歌曲的旋律感与记忆点；",
                  "5) 尽量最小改动，保持原意。",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`押韵润色接口 HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as MiniMaxMessagesResponse;
    if (data.error?.message) {
      throw new Error(`押韵润色接口错误: ${data.error.message}`);
    }

    const polished = extractLyricsFromMessagesResponse(data);
    if (!polished || polished.length < 80) {
      throw new Error("押韵润色结果过短或为空");
    }
    return polished;
  } finally {
    clearTimeout(timer);
  }
}

async function generateLyricsFromPrompt(
  prompt: string,
  apiKey: string,
  timeoutMs: number,
  strictness: GachaQualityStrictness,
  retryGuidance?: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MINIMAX_MESSAGES_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        max_tokens: 1400,
        system:
          "你是专业作词人。请基于用户描述创作可直接演唱的完整中文歌词。只输出歌词正文，不要解释，不要JSON，不要代码块。可使用结构标签如 [Verse] [Chorus] [Bridge]。",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: buildConstrainedLyricsPrompt(prompt, retryGuidance) }],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`歌词接口 HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as MiniMaxMessagesResponse;
    if (data.error?.message) {
      throw new Error(`歌词接口错误: ${data.error.message}`);
    }

    const lyrics = extractLyricsFromMessagesResponse(data);
    if (!lyrics) {
      throw new Error("歌词接口未返回歌词文本");
    }
    if (lyrics.length < 80) {
      throw new Error("歌词文本过短，疑似生成不完整");
    }
    if (hasObviousStyleConflict(prompt, lyrics)) {
      throw new Error("歌词内容与提示词风格冲突，触发重试");
    }
    const review = await reviewLyricsQuality(prompt, lyrics, apiKey, timeoutMs, strictness);
    if (!review.pass) {
      throw new LyricsQualityError(`歌词质检不通过: ${review.issues.join("；")}`, lyrics, review.issues);
    }
    return lyrics;
  } finally {
    clearTimeout(timer);
  }
}

async function generateLyricsWithRetry(
  prompt: string,
  apiKey: string,
  timeoutMs: number,
  strictness: GachaQualityStrictness
): Promise<string> {
  let retries = 2;
  let delay = 1500;
  let lastError: unknown;
  let retryGuidance = "";

  while (retries >= 0) {
    try {
      return await generateLyricsFromPrompt(prompt, apiKey, timeoutMs, strictness, retryGuidance);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "未知错误";

      if (error instanceof LyricsQualityError) {
        if (shouldTryRhymeRepair(error.issues)) {
          try {
            const polished = await polishLyricsForRhyme(prompt, error.lyrics, error.issues, apiKey, timeoutMs, strictness);
            const recheck = await reviewLyricsQuality(prompt, polished, apiKey, timeoutMs, strictness);
            if (recheck.pass) {
              gachaLog.info("歌词押韵润色成功并通过复检", {
                step: "lyrics_rhyme_repaired",
                issues: error.issues,
              });
              return polished;
            }
            retryGuidance = recheck.issues.join("；");
          } catch (repairError) {
            gachaLog.warn("歌词押韵润色失败，回退重生", {
              step: "lyrics_rhyme_repair_failed",
              error: repairError instanceof Error ? repairError.message : "未知错误",
            });
          }
        } else {
          retryGuidance = error.issues.join("；");
        }
      }

      if (message.startsWith("歌词质检不通过:")) {
        retryGuidance = message.replace("歌词质检不通过:", "").trim();
      }
      gachaLog.warn("歌词生成失败，准备重试", {
        step: "lyrics_retry",
        retriesLeft: retries,
        error: message,
      });
      if (retries === 0) break;
      await sleep(delay);
      delay *= 2;
      retries--;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("歌词生成失败");
}

async function generateOneMusic(prompt: string, lyrics: string, apiKey: string, timeoutMs: number) {
  const startAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Connection: "keep-alive",
      },
      body: JSON.stringify({
        model: "music-2.6",
        prompt,
        lyrics,
        lyrics_optimizer: false,
        output_format: "hex",
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: "mp3",
        },
      }),
      // @ts-ignore
      keepalive: true,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as MiniMaxResponse;

    if (data.base_resp?.status_code !== 0) {
      throw new Error(`API 错误: ${data.base_resp?.status_msg} (Code: ${data.base_resp?.status_code})`);
    }

    if (data.data?.status !== 2 || !data.data.audio) {
      throw new Error("音乐生成超时或失败");
    }

    gachaLog.info("MiniMax 请求成功", {
      step: "minimax_success",
      durationMs: Date.now() - startAt,
    });

    return {
      audioHex: data.data.audio,
      duration: data.extra_info?.music_duration,
      size: data.extra_info?.music_size,
      traceId: data.trace_id,
      lyrics: extractLyrics(data),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function startGachaBatchGeneration(batchId: string) {
  if (runningBatches.has(batchId)) {
    gachaLog.warn("批次已在运行，忽略重复启动", { batchId, step: "skip_duplicate_start" });
    return;
  }

  runningBatches.add(batchId);
  updateGachaBatchMeta(batchId, { status: "generating", stopRequested: false });
  const batchStartAt = Date.now();
  gachaLog.info("批次后台生成开始", { batchId, step: "batch_start" });

  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error("未配置 API Key");
    }

    const batch = getGachaBatchById(batchId);
    if (!batch) {
      throw new Error("批次不存在");
    }

    gachaLog.info("批次数据加载完成", {
      batchId,
      total: batch.items.length,
      timeoutMinutes: batch.timeoutMinutes,
      qualityStrictness: batch.qualityStrictness || "standard",
      step: "batch_loaded",
    });

    for (let i = 0; i < batch.items.length; i++) {
      const latestBatch = getGachaBatchById(batchId);
      if (!latestBatch) throw new Error("批次不存在");

      if (latestBatch.stopRequested) {
        gachaLog.warn("批次收到停止信号，终止后续生成", {
          batchId,
          step: "batch_stop_requested",
        });
        updateGachaBatchMeta(batchId, { status: "stopped" });
        break;
      }

      const item = latestBatch.items[i];
      if (!item || item.status !== "pending") continue;
      const timeoutMs = (latestBatch.timeoutMinutes || 8) * 60 * 1000;
      const strictness = latestBatch.qualityStrictness || "standard";
      const sourcePrompt = item.prompt;

      const itemStartAt = Date.now();
      gachaLog.info("开始处理提示词", {
        batchId,
        promptId: item.promptId,
        index: i + 1,
        total: latestBatch.items.length,
        step: "item_start",
      });

      updateGachaBatchItem(batchId, item.promptId, {
        status: "generating",
        startedAt: new Date().toISOString(),
        error: undefined,
      });

      let optimized: PromptOptimizationResult = {
        optimizedPrompt: sourcePrompt,
        notes: "优化失败，已回退使用原始提示词",
      };
      try {
        optimized = await optimizePromptWithRetry(sourcePrompt, apiKey, timeoutMs);
        gachaLog.info("提示词优化完成", {
          batchId,
          promptId: item.promptId,
          step: "prompt_optimized",
          notes: optimized.notes,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "未知错误";
        optimized = {
          optimizedPrompt: sourcePrompt,
          notes: `优化失败，已回退原始提示词。原因: ${reason}`,
        };
        gachaLog.warn("提示词优化失败，回退原始提示词继续生成", {
          batchId,
          promptId: item.promptId,
          step: "prompt_opt_fallback",
          error: reason,
        });
      }
      updateGachaBatchItem(batchId, item.promptId, {
        originalPrompt: sourcePrompt,
        optimizedPrompt: optimized.optimizedPrompt,
        optimizationNotes: optimized.notes,
      });

      const task = createTask({
        model: "music-2.6",
        prompt: optimized.optimizedPrompt,
        lyrics: "",
        isInstrumental: false,
        sampleRate: 44100,
        bitrate: 256000,
        format: "mp3",
        outputFormat: "hex",
      });

      updateGachaBatchItem(batchId, item.promptId, { taskId: task.id });
      markTaskProcessing(task.id);
      gachaLog.info("任务已创建并标记处理中", {
        batchId,
        promptId: item.promptId,
        taskId: task.id,
        step: "task_created",
      });

      try {
        const generatedLyrics = await generateLyricsWithRetry(optimized.optimizedPrompt, apiKey, timeoutMs, strictness);
        updateTaskLyrics(task.id, generatedLyrics);
        gachaLog.info("歌词生成成功", {
          batchId,
          promptId: item.promptId,
          taskId: task.id,
          step: "lyrics_generated",
        });

        const result = await generateOneMusic(optimized.optimizedPrompt, generatedLyrics, apiKey, timeoutMs);
        const localAudioPath = saveAudioFile(result.audioHex, "mp3");

        markTaskCompleted(task.id, localAudioPath, result.duration, result.size, result.traceId);
        updateRecordLyricsByTaskId(task.id, generatedLyrics);
        if (result.lyrics) {
          updateTaskLyrics(task.id, result.lyrics);
          updateRecordLyricsByTaskId(task.id, result.lyrics);
        }

        updateGachaBatchItem(batchId, item.promptId, {
          status: "completed",
          audioUrl: localAudioPath,
          audioPath: localAudioPath,
          finishedAt: new Date().toISOString(),
        });

        gachaLog.info("提示词生成成功", {
          batchId,
          promptId: item.promptId,
          taskId: task.id,
          durationMs: Date.now() - itemStartAt,
          traceId: result.traceId,
          step: "item_completed",
        });
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        const msg = isAbort
          ? `单条任务超时（>${Math.floor(timeoutMs / 60000)} 分钟）`
          : (error instanceof Error ? error.message : "生成失败");

        markTaskFailed(task.id, msg);
        updateGachaBatchItem(batchId, item.promptId, {
          status: "failed",
          error: msg,
          finishedAt: new Date().toISOString(),
        });

        gachaLog.error("提示词生成失败", {
          batchId,
          promptId: item.promptId,
          taskId: task.id,
          durationMs: Date.now() - itemStartAt,
          error: msg,
          step: "item_failed",
        });
      }

      await sleep(1200);
    }

    const finalBatch = getGachaBatchById(batchId);
    if (finalBatch && !finalBatch.stopRequested && finalBatch.items.every((it) => it.status !== "pending" && it.status !== "generating")) {
      updateGachaBatchMeta(batchId, { status: "completed" });
    }

    gachaLog.info("批次后台生成结束", {
      batchId,
      durationMs: Date.now() - batchStartAt,
      step: "batch_end",
    });
  } catch (error) {
    gachaLog.error("批次后台生成异常终止", {
      batchId,
      durationMs: Date.now() - batchStartAt,
      error: error instanceof Error ? error.message : "未知错误",
      step: "batch_failed",
    });
    throw error;
  } finally {
    runningBatches.delete(batchId);
    gachaLog.info("批次运行标记已释放", { batchId, step: "batch_release" });
  }
}

export function stopGachaBatchGeneration(batchId: string) {
  rollbackGeneratingItemsToPending(batchId);
  updateGachaBatchMeta(batchId, { stopRequested: true, status: "stopped" });
  gachaLog.warn("已请求停止批次生成", { batchId, step: "batch_stop_set" });
}

export function isGachaBatchRunning(batchId: string) {
  return runningBatches.has(batchId);
}
