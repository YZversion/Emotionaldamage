# 架构文档

## 总体架构

纯前端 SPA（Vite + Vanilla JS）。无自有后端；评测经用户浏览器直连 OpenRouter。

```
┌─────────────────────────────────────────────┐
│  UI (ui.js)  步骤：门禁 → 导入 → 身份 → 加载 → 报告 → 卡片 │
├─────────────────────────────────────────────┤
│  apiGate.js     OpenRouter Key 校验与持久化              │
│  parser.js      JSON / TXT / HTML → 标准化消息           │
│  llmEval.js     截断 + 情圣蒸馏 Prompt + JSON 评测       │
│  cardRenderer.js 分享卡 DOM（html2canvas 导出）          │
└─────────────────────────────────────────────┘
```

已删除：`analyzer.js`（本地词典打分）、`aiChat.js`（结果页旁路闲聊）。

## 数据流

```
API Key 门禁
    → 画像（星座/MBTI）+ 上传/Demo
    → 必要时选「哪个是我」
    → truncateMessages（最近 400 条 / 60k 字）
    → OpenRouter chat/completions
    → normalizeEvalResult → 报告页 / 分享卡
```

## 评测结果（LLM）

见 `agent.md` 与 `src/llmEval.js` 中的 JSON schema（含 `relationshipStage`、五维 `dimensions` 等）。

## 隐私

评测会上传截断聊天与画像字段。门禁页与导入页文案须与此一致。

## 构建

- Vite 8，`base: './'`，端口 3000  
- 生产依赖：`html2canvas`
