# LLM 关系评测模块 — Agent / 实现规格

> 对应产品决策：进门强制 API → 上传聊天 + 双方星座/MBTI → **尽量全文截断** 交 LLM → 打分 / 深度评测 / 建议 → **分享卡展示 LLM 结论**。  
> Prompt 方法论蒸馏自 [qingsheng-skill（情圣）](https://github.com/tomwong001/qingsheng-skill)（MIT），适配为一次性 JSON 报告，而非多轮僚机对话。  
> 分 Phase 清单见 [`plan.md`](./plan.md)。

---

## 1. 模块职责

实现文件：`src/llmEval.js`（由 `ui.js` 调用）

1. 使用已连接的 OpenRouter API Key  
2. 将标准化消息截断为可发送文本  
3. 组装含星座 / MBTI / 聊天正文 / 情圣七阶段框架的 Prompt  
4. 调用 LLM，解析并校验结构化 JSON  
5. 结果交给结果页与分享卡（**不**再依赖词典引擎打分）

---

## 2. 输入契约

与 `getReadyEvalInput()` / `runLlmEval(input)` 一致：

```ts
interface EvalInput {
  apiKey: string;
  messages: Array<{ time: Date | null; isMe: boolean; sender: string; content: string }>;
  contactName: string;
  self: { zodiac: string; mbti: string };
  other: { zodiac: string; mbti: string };
  model?: string; // 默认 openai/gpt-4o-mini
}
```

---

## 3. 截断策略

| 常量 | 值 |
|------|-----|
| `MAX_MESSAGES` | 400 |
| `MAX_CHARS` | 60000 |

保留**最近**消息；行格式：`[YYYY-MM-DD HH:mm] 我/TA: content`

---

## 4. Prompt 与情圣关系

- **不是**在浏览器里「调用」Claude Skill 运行时  
- **是**把七阶段、IOI/IOD、强信号升级、深度分析结构写入 system prompt  
- 输出强制 JSON；禁止多轮追问口吻

### 输出字段（冻结）

```json
{
  "flirtScore": 0,
  "flirtGrade": "B",
  "summary": "一句话总评",
  "relationshipStage": 3,
  "relationshipStageLabel": "关系升温",
  "dimensions": [
    { "id": "chemistry", "label": "暧昧浓度", "score": 0, "comment": "..." },
    { "id": "reciprocity", "label": "双向性", "score": 0, "comment": "..." },
    { "id": "zodiacFit", "label": "星座契合", "score": 0, "comment": "..." },
    { "id": "mbtiFit", "label": "MBTI 契合", "score": 0, "comment": "..." },
    { "id": "risk", "label": "风险/消耗", "score": 0, "comment": "..." }
  ],
  "deepAnalysis": "多段深度评测",
  "advice": ["建议1", "建议2", "建议3"],
  "highlights": ["可核对高光"],
  "verdict": "关系定性一句话"
}
```

`flirtGrade` 以分数重算为准（S/A/B/C/D 区间与旧产品一致）。

---

## 5. API

- Endpoint：`https://openrouter.ai/api/v1/chat/completions`  
- 必填 Bearer Token  
- 默认模型：`openai/gpt-4o-mini`  
- `stream: false`；JSON 失败再请求一次「只修 JSON」

---

## 6. 隐私

会上传：截断聊天正文 + 星座/MBTI + 评测指令 → OpenRouter。  
须在门禁/上传文案中诚实说明。署名：方法论改编自情圣 skill（MIT）。
