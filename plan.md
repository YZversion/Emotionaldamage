# Emotional Damage — LLM 评测主流程改造 Plan

> 状态：Phase 1–6 主线已完成  
> 决策锁定：聊天 **尽量全文截断**；体验 **LLM 报告为主 + 保留分享卡**  
> 补充：导入支持 **JSON / TXT / HTML**；导入页 **推荐导出三步 + 拖拽**；Prompt 蒸馏自情圣 skill（MIT）

---

## 0. 产品目标（一句话）

用户必须先连接 OpenRouter API → 上传对话记录并填写双方星座/MBTI → 由 LLM 生成暧昧/关系打分、深度评测与建议 → 结果可渲染为分享卡。

---

## 1. 已定需求（5-Step 摘要）

| 需求 | 判定 | 说明 |
|------|------|------|
| 进门强制 API Key | keep | 无 Key 不能上传/评测 |
| 上传聊天 JSON | keep | 沿用现有 parser |
| 自己/对方 星座 + MBTI | keep | 表单必填（或明确选「不清楚」） |
| LLM 打分 + 深度评测 + 建议 | keep | 主产出，结构化 JSON |
| 尽量全文截断发给 LLM | keep | 按时间排序后截到 N 条或 M 字 |
| 分享卡展示 LLM 结论 | keep | 卡片字段改绑 LLM 结果 |
| 本地词典引擎主打分 | delete | 已删除 analyzer.js |
| 结果页旁路闲聊 AI | delete | 已删除 aiChat.js |

### 默认参数（实现时写死常量，后续再可配置）

- 模型：`openai/gpt-4o-mini`（OpenRouter）
- 截断：`MAX_MESSAGES = 400` **或** `MAX_CHARS ≈ 60000`（先到先截；保留时间序）
- 输出：强制 JSON schema（见 Phase 3）
- 身份：无 `is_send` / `is_from_me` / `is_sender` 时，先选「哪个是我」

---

## 2. 目标用户流程

```
[1 API 门禁] → [2 填写资料+上传] → [3 必要时选身份]
        → [4 截断+调用 LLM] → [5 报告页] → [6 分享卡]
```

---

## 3. Phase Checklist（分段构筑）

用法：完成一项打 `[x]`；一 Phase 全部完成再进下一 Phase。  
禁止跨 Phase 提前大改 UI/引擎，避免半成品纠缠。

---

### Phase 0 — 文档与规格锁定

- [x] 本文件 `plan.md` 落地并与产品决策一致（1A 全文截断 / 2B LLM+卡片）
- [x] `agent.md` 改为「LLM 评测模块」规格（输入/截断/Prompt/JSON/隐私）
- [x] README 隐私声明改为：评测会上传截断后的聊天内容到 OpenRouter

**Phase 0 完成。**

---

### Phase 1 — API 门禁（进门必须先连）

- [x] 新增首屏 `step-api`（或等价）：仅 API Key 输入 + 保存/连接
- [x] Key 校验：对 OpenRouter 发一次轻量请求（如 models 或最小 chat）成功才算「已连接」
- [x] `localStorage` 持久化 Key；下次进入若 Key 仍有效可跳过或一键进入
- [x] 未连接时：上传区、评测按钮全部不可达
- [x] 提供「退出/更换 Key」入口

**完成标准：** 清空 localStorage 后打开站点，只能看到 API 页；连上后才能进资料页。  
**Phase 1 已完成**（`src/apiGate.js` + `step-api` + 导入页「更换/退出 Key」）。

**主要文件：** `index.html`, `src/ui.js`, `src/apiGate.js`

---

### Phase 2 — 输入：聊天 + 星座/MBTI + 身份

- [x] 资料表单字段：
  - [x] 自己的星座（12 选 1 或含「不清楚」）
  - [x] 自己的 MBTI（16 型或含「不清楚」）
  - [x] 对方的星座
  - [x] 对方的 MBTI
- [x] 上传聊天 JSON（复用 `parseChatJson`）
- [x] `needsSelfPick` 时进入身份确认（复用现有逻辑）
- [x] Demo 数据路径仍可用（自动带 `is_send`，跳过身份或预填资料）
- [x] 「开始评测」按钮：校验 Key + 文件 + 四个画像字段齐全

**完成标准：** 无 Key / 无文件 / 缺画像字段时不能发起评测；有 `is_send` 与无 `is_send` 两条路径都通。  
**Phase 2 已完成**（上传仅写入草稿；点「开始评测」才走身份/分析。`getReadyEvalInput()` 供 Phase 3 接 LLM）。

**主要文件：** `index.html`, `src/ui.js`, `src/profileOptions.js`, `src/styles.css`

---

### Phase 3 — 截断 + LLM 结构化评测

- [x] 新建（推荐）`src/llmEval.js`：组装 prompt、截断、调用、解析 JSON
- [x] 截断策略实现：
  - [x] 按时间升序
  - [x] 格式化为可读行：`[YYYY-MM-DD HH:mm] 我/TA: content`
  - [x] 同时受 `MAX_MESSAGES` 与 `MAX_CHARS` 约束；**保留最近**对话
- [x] System/User prompt：双方星座、MBTI、截断聊天 + **情圣七阶段/IOI 蒸馏框架**（MIT 改编自 qingsheng-skill）
- [x] 要求模型只返回 JSON + 本地 parse；失败再修一次
- [x] JSON schema（含 `relationshipStage` / `relationshipStageLabel`）
- [x] 非流式
- [x] 错误处理：401/429/JSON 失败 → 中文提示

**完成标准：** Demo + 画像可走通 LLM 报告页。  
**Phase 3 已完成**（结果页已切到 LLM 报告结构；分享卡同步接 LLM 字段，可视为 Phase 4/5 提前完成大半）。

**主要文件：** `src/llmEval.js`, `src/ui.js`, `index.html`, `src/cardRenderer.js`

### Phase 4 — 结果页（LLM 报告为主）

- [x] 结果页改为渲染 LLM JSON：总分环、分项、深度评测、建议、高光
- [x] Loading：真实「正在请求模型评测…」
- [x] 去掉结果页内嵌闲聊 AI
- [ ] 返回可重新上传/改画像（已有返回导入；可再打磨）

**Phase 4 基本完成**（返回路径已有）。

### Phase 5 — 分享卡绑定 LLM 结果

- [x] `cardRenderer.js` 绑定 LLM 分数/阶段/总评/建议摘要
- [x] 复制/下载 PNG 流程保持
- [x] 卡片不展示原始聊天大段

**Phase 5 已完成。**

---

### Phase 6 — 删除与清理（词典退出主路径）

- [x] 词典打分已退出主路径
- [x] 已删除 `src/analyzer.js`、`src/aiChat.js` 及对应死样式
- [x] 同步 `README.md` / `architecture.md` / 门禁与上传文案
- [x] `npm run build` 通过

**Phase 6 已完成。Phase 1–6 主线闭环。**

---

## 4. 明确不做什么（本轮）

- 不上自有后端；Key 仍在用户浏览器
- 不做账号系统
- 不做向量库 / RAG
- 首版不做多模型市场式选择（最多一个默认 + 一个付费切换，非必须）
- 不做「词典 + LLM 双分数并存」以免用户困惑

---

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 全文截断仍超上下文 | 双阈值 + 保留最近对话 |
| 模型不按 JSON 返回 | 强 prompt + parse 失败重试一次「只修 JSON」 |
| 隐私信任 | 门禁页与上传页明确告知会上传截断原文 |
| 费用 | 默认 4o-mini；截断上限写死并在 UI 提示「约 N 条」 |

---

## 6. 执行顺序（给实现者）

1. Phase 0–6：**已完成**  
2. 后续可选：模型切换 UI、流式输出、更细的导出工具教程截图
