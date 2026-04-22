# AI 音乐生成器

基于 [MiniMax AI](https://platform.minimaxi.com) 音乐生成 API 的 Web 应用，支持 AI 音乐创作、歌词生成、历史记录管理等功能。

## 功能特性

- **多模型支持**：Music 2.6（通用音乐生成）和 Music Cover（参考音频翻唱）
- **歌词生成**：支持 AI 自动生成歌词、手动输入歌词、歌词续写
- **纯音乐模式**：支持生成不含人声的纯音乐作品
- **音频设置**：可配置采样率、比特率、输出格式（MP3/WAV/PCM）
- **返回格式**：支持 HEX（本地存储）和 URL（24小时有效链接）两种音频返回格式
- **AIGC 水印**：可选的 AI 生成内容水印标识
- **任务轮询**：异步生成模式，自动轮询获取生成结果
- **历史记录**：生成记录管理、在线播放、下载、删除
- **统计面板**：生成数量、时长、占用空间等统计信息

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
│   ├── layout.tsx              # 全局布局
│   ├── page.tsx                # 首页 - 音乐生成
│   ├── history/
│   │   └── page.tsx            # 历史记录页面
│   └── api/
│       ├── generate/
│       │   └── route.ts        # 音乐生成 API（POST）
│       ├── lyrics/
│       │   └── route.ts        # 歌词生成 API（POST）
│       ├── task/
│       │   └── [id]/
│       │       └── route.ts    # 任务状态查询 API（GET）
│       └── history/
│           └── route.ts        # 历史记录 API（GET/DELETE）
├── components/
│   ├── MusicForm.tsx           # 音乐生成表单组件
│   └── AudioPlayer.tsx         # 音频播放器组件
└── lib/
    └── storage.ts              # 数据存储与任务管理
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

## 数据存储

- `data/tasks.json` — 任务数据
- `data/records.json` — 历史记录数据
- `public/generated/` — 生成的音频文件（HEX 模式）

## 注意事项

- URL 模式返回的音频链接有效期为 24 小时，请及时下载
- Music Cover 模型不支持纯音乐模式，需提供参考音频
- AIGC 水印仅在非流式请求（`stream: false`）时生效
- 生成音乐通常需要 1-3 分钟，前端通过轮询机制自动获取结果
