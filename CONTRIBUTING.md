# 开发指南

## 开发流程

### 1. 每次开发前 - 更新 CHANGELOG

在 `CHANGELOG.md` 的 `[待开发]` 或 `[计划中]` 中：
- 描述要做的功能
- 确认具体方案
- 添加你的名字和计划开发日期

### 2. 创建功能分支

```bash
# 基于 main 创建功能分支
git checkout main
git pull origin main
git checkout -b feature/你的功能名
```

### 3. 开发 & 提交

```bash
git add .
git commit -m "feat: 添加 xxx 功能"
```

### 4. 推送分支

```bash
git push -u origin feature/你的功能名
```

### 5. 完成后

- 在 CHANGELOG.md 中将待开发项移到对应版本下
- 标记完成日期
- 合并到 main

---

## 分支命名规范

| 类型 | 示例 | 说明 |
|------|------|------|
| 功能 | `feature/prompt-template` | 新功能开发 |
| 修复 | `fix/audio-player-bug` | Bug 修复 |
| 优化 | `optimize/chat-stream` | 性能优化 |
| 重构 | `refactor/layout` | 代码重构 |

---

## Commit 规范

```
feat:     新功能
fix:      修复问题
refactor: 重构
style:    格式调整（不影响功能）
docs:     文档更新
test:     测试相关
chore:    构建/工具相关
```

示例：
- `feat: 添加提示词模板库`
- `fix: 修复生成状态不显示问题`
- `optimize: 优化 AI 对话响应速度`

---

## 环境配置

```bash
# 安装依赖
npm install

# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，填入你的 MiniMax API Key

# 启动开发服务器
npm run dev
```
