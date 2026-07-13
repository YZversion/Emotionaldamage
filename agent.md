# AI 情感顾问 — 模块文档

## 概述

`aiChat.js` 提供基于聊天分析结果的 AI 问答功能。用户可以在分析完成后，就自己的关系向 AI 顾问提问，获取洞察和建议。

## 工作流程

```
用户上传聊天记录 → 分析完成
        │
        ▼
  initAIChat(container, result) 被调用
        │
        ├── buildSystemPrompt(result) → 构造包含分析摘要的 System Prompt
        │
        ├── 渲染聊天 UI（消息列表 + 输入框 + API Key 设置）
        │
        └── 用户发送消息 → callLLM() → SSE 流式返回 → 逐字渲染
```

## API 接入

- **端点**: `https://openrouter.ai/api/v1/chat/completions`
- **默认模型**: `mistralai/mistral-7b-instruct`（免费，无需 API Key）
- **配置 API Key 后自动升级为**: `openai/gpt-4o-mini`
- **认证方式**: HTTP Bearer Token（可选）
- **通信方式**: Server-Sent Events (SSE) 流式输出

### 请求头

```javascript
{
  'Content-Type': 'application/json',
  'HTTP-Referer': window.location.origin,
  'X-Title': 'Emotional Damage',
  'Authorization': 'Bearer <api_key>'  // 可选
}
```

## System Prompt 构造

`buildSystemPrompt(result)` 从分析结果中提取以下信息组成 System Prompt：

1. **基本信息** — 用户名、对方名、消息总数、总字数、时间跨度
2. **评分信息** — 暧昧指数 (0–100)、等级 (S/A/B/C/D)
3. **双向对比** — 双方暧昧率、主动开场比例、判定结果
4. **五维信号** — 各维度双方触发次数
5. **Top 暧昧语录** — 前 5 条高亮消息
6. **画像标签** — 关系画像标签文字

### AI 行为准则

- 回答温暖、有共情力，偶尔带一点幽默
- 基于分析报告给出具体洞察，不空泛
- 回答简洁但有深度（3–5 句话）
- 不评价分析报告的准确性
- 使用中文回答

## 对话管理

- 对话历史存储在 `convHistory` 数组中，格式为 `{ role, content }`
- 第一条始终是 `system` 角色的 System Prompt
- 第二条是 `assistant` 角色的开场白
- 用户消息和 AI 回复依次追加
- 流式输出时，持续更新最后一条 `assistant` 消息的内容

## UI 组件

聊天 UI 包含以下元素（通过 `initAIChat()` 动态渲染）：

```
┌─────────────────────────┐
│ 🤖 AI 情感顾问     [−]  │  ← 可折叠头部
├─────────────────────────┤
│                         │
│  [消息气泡列表]          │  ← 滚动区域
│                         │
│                         │
├─────────────────────────┤
│ [文本输入框]      [发送] │
├─────────────────────────┤
│ [API Key 输入]    [保存] │
│ 默认模型: Mistral 7B    │
└─────────────────────────┘
```

### 交互细节

- 输入框支持自动扩展高度（单行 → 多行）
- 发送后清空输入框并禁用发送按钮
- 流式返回时按钮禁用，流结束后恢复
- 点击 `[−]` 折叠/展开聊天面板
- API Key 保存到 `localStorage`，刷新后保留
- 面板可折叠收起，不占结果页空间

## 错误处理

- API 请求失败时显示具体错误信息（HTTP 状态码 + 错误消息）
- 网络异常时抛出并显示友好提示
- API Key 为空时自动使用免费模型，不影响功能使用
- 输入为空时忽略发送操作

## 隐私说明

- **聊天原始内容不会发送给 AI**，仅发送分析摘要（统计数据和脱敏后的摘要语录）
- System Prompt 中不包含用户真实姓名，使用"我"和"TA"指代
- API Key 由用户自行决定是否配置，存储在浏览器本地
- 用户可以随时清除 localStorage 中的 API Key
