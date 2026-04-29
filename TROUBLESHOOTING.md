# 故障排查手册（Troubleshooting）

适用范围：`/api/generate`、抽卡批量（`/api/gacha/batches/*`）、歌词质检与历史记录。

## 快速定位入口

- 生成链路日志：服务端控制台中 `[GENERATE][INFO|WARN|ERROR]`
- 批量链路日志：服务端控制台中 `[GACHA][INFO|WARN|ERROR]`
- 批量文件日志：`data/logs/gacha-batch.log`
- 任务数据：`data/tasks.json`
- 批次数据：`data/gacha_batches.json`

---

## 1) `任务 xxx 最终处理失败: fetch failed`

### 常见原因

- 外网抖动或目标服务短时不可达
- `music-cover` 参考音频链接无法被 MiniMax 侧拉取

### 处理步骤

1. 查看同一任务前后的 `[GENERATE]` 日志，确认失败阶段：
   - `cover 预处理失败，准备重试`：问题在 `music_cover_preprocess`
   - `生成接口调用异常`：问题在 `music_generation`
2. 若是 `audio_url` 失败，优先换成可直链 MP3，或改用本地上传（`audioBase64`）。
3. 直接重试一次（已内置重试与指数退避）。

---

## 2) `invalid params, lyrics is too short`

### 常见原因

- 翻唱模式 `music-cover` 的歌词过短或结构不完整

### 处理步骤

1. 手动填写完整歌词（建议至少 8-12 行）。
2. 使用结构标签：`[Verse]`、`[Chorus]`、`[Bridge]`。
3. 避免只填 1-2 句短歌词。

---

## 3) `Cover mode requires dtw_result, beat_result, and audio_duration...`

### 常见原因

- 平台端在某些样本/时段会触发更严格的翻唱参数校验
- 参考音频特征提取异常或不稳定

### 处理步骤

1. 更换参考音频（优先人声清晰、节奏稳定、时长 15-120 秒）。
2. 避免防盗链或临时签名 URL。
3. 若频繁出现，先用 `music-2.6` 走普通生成，翻唱链路稍后重试。

---

## 4) `提示词优化接口返回非 JSON 或缺少 optimizedPrompt`

### 常见原因

- 优化接口返回了 Markdown/混合文本/截断内容

### 处理步骤

1. 检查 `[GACHA]` 中 `prompt_opt_parse_failed` 日志（`stopReason`、`outputTokens`）。
2. 当前系统会自动兜底：
   - 解析 `text` / `thinking`
   - 失败后回退原始提示词继续生成
3. 如仍失败，保留当次原始响应日志用于定向兼容。

---

## 5) `歌词质检不通过: 副歌押韵感较弱...`

### 常见原因

- 质检严格度较高，副歌押韵或长度未达阈值

### 处理步骤

1. 将批次“质检严格度”调整为 `宽松` 或 `标准`。
2. 保证歌词含明确副歌段（建议至少 4 行）。
3. 系统已内置“副歌押韵修复器”，可先观察是否自动修复通过。

---

## 6) 批量任务显示“生成中”但看起来已结束

### 常见原因

- 某条任务超时或中断后状态未及时刷新

### 处理步骤

1. 在批次页点击“终止”，将运行中的条目回退为待生成。
2. 点击“继续生成”恢复剩余任务。
3. 对失败条目使用“重试失败项”。

---

## 7) 只有第一条成功，后续条目失败

### 常见原因

- 批量生成中遇到单条异常后被中断（旧逻辑）
- 外部接口短时波动

### 处理步骤

1. 确认当前版本已启用串行后台批处理。
2. 查看 `item_failed` 对应错误是否集中在某一步（优化/歌词/音乐生成）。
3. 必要时降低严格度、缩短提示词长度后重试。

---

## 8) 音频链接 24 小时后失效

### 常见原因

- 使用了 `outputFormat=url` 的临时外链

### 处理步骤

1. 推荐使用 `outputFormat=hex`（本地落盘）。
2. 从历史记录下载本地文件，或直接使用 `/generated/*.mp3`。

---

## 9) 快速自检清单

1. `.env.local` 是否配置 `MINIMAX_API_KEY`
2. 参考音频是否可公网直连
3. 翻唱歌词是否足够完整
4. 批次严格度是否过高
5. 查看 `[GENERATE]` / `[GACHA]` 最新一条 `ERROR` 的 `step` 和 `status_code`

---

## 10) 提交排障信息模板（给开发协作）

请提供以下信息，能最快定位：

- `taskId` / `batchId`
- 报错完整文本
- 对应时间段的 `[GENERATE]` 或 `[GACHA]` 日志片段
- 使用模式（`music-2.6` / `music-cover`）
- 是否使用 `audio_url` 或 `audioBase64`
- 批次严格度（宽松/标准/严格）
