# AI 音乐生成器

基于 [MiniMax AI](https://platform.minimaxi.com) 音乐生成 API 的 Web 应用，支持 AI 音乐创作、抽卡批量生成、质量模式、歌词编辑与翻唱等功能。

> 排查指引：见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 功能特性

- **多模型支持**：Music 2.6（通用音乐生成）和 Music Cover（参考音频翻唱）
- **歌词生成**：支持 AI 自动生成歌词、手动输入歌词、歌词续写
- **歌词质量控制**：支持 `宽松/标准/严格` 三档质检策略（副歌长度、押韵、句长变化等）
- **歌词押韵修复**：质检失败时优先进行副歌押韵定向润色，而不是整首重写
- **纯音乐模式**：支持生成不含人声的纯音乐作品
- **音频设置**：可配置采样率、比特率、输出格式（MP3/WAV/PCM）
- **返回格式**：支持 HEX（本地存储）和 URL（24小时有效链接）两种音频返回格式
- **AIGC 水印**：可选的 AI 生成内容水印标识
- **任务轮询**：异步生成模式，自动轮询获取生成结果
- **历史记录**：生成记录管理、在线播放、下载、删除、歌曲详情页
- **歌词时间标记**：支持行级时间手动标注、排序、区间间隔批量应用
- **抽卡批次模式**：每次抽取 10 条提示词，后台串行生成（可终止/继续/重试失败项）
- **质量模式**：AI 对话教练 + 高质量目标迭代 + 变体打分后批量提交
- **批次记录分页**：每批单页查看，支持质量模式范围筛选
- **统计面板**：生成数量、时长、占用空间等统计信息
- **可观测日志**：批次日志（`[GACHA]`）与生成日志（`[GENERATE]`）用于问题排查

## 技术栈

- **框架**：Next.js 14.1.0（App Router）
- **语言**：TypeScript
- **前端**：React 18 + Tailwind CSS
- **数据存储**：本地 JSON 文件（`data/` 目录）
- **音频存储**：本地文件系统（`public/generated/` 目录）

## 项目结构

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                         # 首页（快速生成/表单/对话/抽卡/质量模式）
│   ├── history/page.tsx                 # 历史记录
│   ├── gacha-history/page.tsx           # 抽卡/质量批次记录
│   ├── song/[taskId]/page.tsx           # 歌曲详情 + 歌词时间标注
│   └── api/
│       ├── chat/route.ts                # 对话接口
│       ├── generate/route.ts            # 音乐生成（含 cover 两步流程）
│       ├── lyrics/route.ts              # 歌词生成
│       ├── task/[id]/route.ts           # 任务查询/歌词保存
│       ├── history/route.ts             # 历史记录查询/删除
│       └── gacha/
│           ├── route.ts                 # 抽卡提示词生成
│           └── batches/...              # 批次创建/列表/控制/后台触发
├── components/
│   ├── MusicForm.tsx
│   ├── AudioPlayer.tsx
│   ├── GachaMode.tsx
│   ├── QualityMode.tsx
│   └── LyricsDisplay.tsx
└── lib/
    ├── storage.ts
    ├── gachaBatchRunner.ts
    ├── gachaLogger.ts
    └── lrc.ts
```

## 环境配置

在项目根目录创建 `.env.local` 文件：

```env
MINIMAX_API_KEY=your_minimax_api_key_here
```

API Key 可在 [MiniMax 开放平台](https://platform.minimaxi.com) 获取。

## 安装与启动

```bash
# 安装依赖
npm install

# 开发模式启动
npm run dev

# 生产构建
npm run build

# 生产模式启动
npm start
```

开发服务器默认运行在 `http://localhost:3000`。

## API 端点

### POST /api/generate

创建音乐生成任务。

**请求参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 是 | - | 模型：`music-2.6` 或 `music-cover` |
| prompt | string | 是 | - | 音乐描述（最长 2000 字符） |
| lyrics | string | 否 | - | 歌词文本 |
| isInstrumental | boolean | 否 | false | 是否纯音乐（music-cover 不支持） |
| sampleRate | number | 否 | 44100 | 采样率：16000/24000/32000/44100 |
| bitrate | number | 否 | 256000 | 比特率：32000/64000/128000/256000 |
| format | string | 否 | mp3 | 音频格式：mp3/wav/pcm |
| outputFormat | string | 否 | hex | 返回格式：hex（本地存储）/ url（24小时链接） |
| aigcWatermark | boolean | 否 | false | 是否添加 AIGC 水印（仅非流式请求生效） |
| lyricsOptimizer | boolean | 否 | false | 是否自动优化/生成歌词 |
| audioUrl | string | 否 | - | 参考音频 URL（music-cover 模型） |
| audioBase64 | string | 否 | - | 参考音频 Base64（music-cover 模型） |

**Music Cover 说明：**
- 服务端采用两步流程：`music_cover_preprocess` → `music_generation`
- 需要提供可用参考音频（`audioUrl` 或 `audioBase64`）
- 建议提供完整歌词，避免 `lyrics is too short` 等校验错误

**响应：**

```json
{
  "success": true,
  "taskId": "task_1710000000000_abc123",
  "message": "任务已创建，正在后台处理"
}
```

### GET /api/task/[id]

查询任务状态。

**响应：**

```json
{
  "success": true,
  "task": {
    "id": "task_1710000000000_abc123",
    "status": "completed",
    "audioFile": "/generated/music_1710000000000.mp3",
    "audioUrlResult": "https://...",
    "format": "mp3",
    "musicDuration": 30000,
    "musicSize": 960000,
    "outputFormat": "hex"
  }
}
```

任务状态：`pending` → `processing` → `completed` / `failed`

### POST /api/lyrics

生成歌词。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mode | string | 是 | `write_full_song`（生成新歌词）或 `edit`（续写歌词） |
| prompt | string | 否 | 歌词描述 |
| lyrics | string | edit 模式必填 | 现有歌词 |
| title | string | 否 | 歌曲标题 |

### GET /api/history

获取所有生成记录和统计信息。

### DELETE /api/history?id=[id]

删除指定记录及其音频文件。

### 抽卡批次接口

- `POST /api/gacha`：生成 10 条抽卡提示词
- `GET /api/gacha/batches`：查询批次列表
- `POST /api/gacha/batches`：创建批次（支持 `timeoutMinutes`、`qualityStrictness`）
- `POST /api/gacha/batches/[id]/generate`：触发后台串行生成
- `POST /api/gacha/batches/[id]/control`：批次控制（`stop` / `resume` / `retry_failed`）

## 数据存储

- `data/tasks.json` — 任务数据
- `data/records.json` — 历史记录数据
- `data/gacha_batches.json` — 抽卡/质量批次数据
- `data/logs/gacha-batch.log` — 批次日志文件
- `public/generated/` — 生成的音频文件（HEX 模式）

## 注意事项

- URL 模式返回的音频链接有效期为 24 小时，请及时下载
- Music Cover 模型不支持纯音乐模式，需提供参考音频
- 建议优先使用 HEX 本地存储模式，避免外链过期导致不可复用
- AIGC 水印仅在非流式请求（`stream: false`）时生效
- 生成音乐通常需要 1-3 分钟，前端通过轮询机制自动获取结果
- 如需排查问题，可查看控制台 `[GENERATE]`/`[GACHA]` 日志与 `data/logs/gacha-batch.log`
