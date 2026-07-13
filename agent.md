# LLM 关系评测模块 — Agent / 实现规格

> 对应产品决策：进门强制 API → 上传聊天 + 双方星座/MBTI → **尽量全文截断** 交 LLM → 打分 / 深度评测 / 建议 → **分享卡展示 LLM 结论**。  
> 分 Phase 执行清单见仓库根目录 [`plan.md`](./plan.md)。

---

## 1. 模块职责

本模块（建议实现为 `src/llmEval.js`，由 `ui.js` 调用）负责：

1. 校验已连接的 OpenRouter API Key  
2. 将标准化消息截断为可发送文本  
3. 组装含星座 / MBTI / 聊天正文的 Prompt  
4. 调用 LLM，解析并校验结构化 JSON  
5. 把结果交给结果页与分享卡（**不**再依赖词典引擎打分）

本地 `parser.js` 仍负责 JSON 解析与身份标注；`analyzer.js` 词典打分 **退出主路径**。

---

## 2. 输入契约

```ts
interface EvalInput {
  apiKey: string;
  messages: Array<{
    time: Date | null;
    isMe: boolean;
    sender: string;
    content: string;
  }>;
  contactName: string;
  self: { zodiac: string; mbti: string };   // 允许「不清楚」
  other: { zodiac: string; mbti: string };
  model?: string; // 默认 openai/gpt-4o-mini
}
```

前置条件（由 UI 保证）：

- API Key 已通过门禁校验并写入 `localStorage`
- 聊天已 parse；若无明确 `isMe` 字段，用户已完成「哪个是我」
- 双方星座、MBTI 已填写（或显式「不清楚」）

---

## 3. 截断策略（决策：尽量全文）

常量（首版写死，可随后配置化）：

| 常量 | 建议初值 | 含义 |
|------|----------|------|
| `MAX_MESSAGES` | `400` | 最多发送条数 |
| `MAX_CHARS` | `60000` | 格式化后总字符上限 |

算法：

1. 过滤无 `content` 的消息；有时间的按时间升序，无时间的附加在末尾或丢弃（与 parser 行为对齐：无效时间不伪造成 1970）  
2. **保留最近**：从最新往旧取，直到触达 `MAX_MESSAGES` 或累计格式化字符将超过 `MAX_CHARS`  
3. 再按时间升序输出，便于模型读时间线  

每行格式：

```text
[2026-05-25 22:10] 我: 想你了
[2026-05-25 22:11] TA: 我也是
```

UI 应提示：超出部分不会发送（例如「将发送最近约 N 条 / 约 M 字」）。

---

## 4. Prompt 规格

### 角色

专业、冷静、有共情的情感关系分析顾问；结合聊天证据 + 星座 + MBTI；避免道德绑架与绝对断言；中文输出。

### 必须注入的上下文

- 自己的星座、MBTI  
- 对方的星座、MBTI  
- 截断后的对话正文  
- 评分说明：`flirtScore` 0–100，等级 S/A/B/C/D 与分数区间对齐（与旧产品一致：S≥85, A≥70, B≥50, C≥30, 否则 D）  
- **只输出一个 JSON 对象**，不要 Markdown 围栏，不要多余解释

### 禁止

- 索要用户真实姓名以外的隐私  
- 编造聊天里不存在的具体原话（highlights 必须能在所给正文中找到依据，否则写现象概括）  
- 输出非 JSON

---

## 5. 输出 JSON Schema（冻结）

字段名与类型以下列为准，前后端统一：

```json
{
  "flirtScore": 0,
  "flirtGrade": "B",
  "summary": "一句话总评",
  "dimensions": [
    { "id": "chemistry", "label": "暧昧浓度", "score": 0, "comment": "..." },
    { "id": "reciprocity", "label": "双向性", "score": 0, "comment": "..." },
    { "id": "zodiacFit", "label": "星座契合", "score": 0, "comment": "..." },
    { "id": "mbtiFit", "label": "MBTI 契合", "score": 0, "comment": "..." },
    { "id": "risk", "label": "风险/消耗", "score": 0, "comment": "..." }
  ],
  "deepAnalysis": "多段深度评测",
  "advice": ["建议1", "建议2", "建议3"],
  "highlights": ["可依据原文的高光或现象"],
  "verdict": "关系定性一句话"
}
```

校验规则（客户端）：

- `flirtScore` 为 0–100 整数  
- `flirtGrade` ∈ `S|A|B|C|D`；若与分数区间冲突，以分数重算等级为准（覆盖模型）  
- `dimensions` 至少含上述 5 个 `id`（缺则补默认）  
- `advice` 至少 1 条；`deepAnalysis`、`summary`、`verdict` 非空  

解析失败：提示用户并允许「重试」；可选第二次请求：「上一次输出无法解析，请只返回合法 JSON」。

---

## 6. API 调用

- Endpoint：`https://openrouter.ai/api/v1/chat/completions`  
- Header：`Authorization: Bearer <apiKey>`（**必填**，无 Key 路径已删除）  
- 默认 model：`openai/gpt-4o-mini`  
- 首版：**非流式**（`stream: false`），一次拿完整 content 再 `JSON.parse`  
- 门禁校验：连接页可用极小请求验证 Key（勿在门禁阶段上传聊天）

---

## 7. 与 UI / 分享卡的衔接

| 步骤 | 行为 |
|------|------|
| API 门禁 | 未连接不可进入上传 |
| 资料页 | 星座×2、MBTI×2、上传、开始评测 |
| Loading | 真实等待 LLM，文案「正在生成评测…」 |
| 结果页 | 渲染 JSON：环分、分项、deepAnalysis、advice、highlights |
| 分享卡 | `flirtScore` / `flirtGrade` / `summary` 或 `verdict` / 建议摘要；不把大段聊天贴进卡 |

结果对象建议在内存中保留为 `currentEval`，供卡片与「重新生成」使用。

---

## 8. 隐私与文案（必须诚实）

- **会上传**：截断后的聊天正文 + 星座/MBTI + 评测指令 → OpenRouter / 上游模型  
- **不会**：本项目无自有后端；Key 只存浏览器 `localStorage`  
- 禁止再写「数据绝不上传」「无原始消息」等与实现矛盾的话术  
- 门禁页与上传页各有一句可见的上传说明

---

## 9. 明确不做（本模块首版）

- 结果页旁路闲聊式 AI 顾问（报告即交付）  
- 本地词典分数与 LLM 分数双轨展示  
- 自建后端代理 Key  
- 向量检索 / 多轮修改报告（可后续加「追问」）

---

## 10. 实现顺序指针

按 [`plan.md`](./plan.md)：**Phase 0（本文）→ 1 门禁 → 2 表单 → 3 本模块核心 → 4 报告 UI → 5 卡片 → 6 清理词典与旧文案**。
