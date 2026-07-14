# 问题清单（技术评审产出）

> 来源：2026-07-14 全量代码评审（两轮：主审 + 盲点复核）。  
> 用法：与 `plan.md` 同规则——修完一项打 `[x]`，按严重度从上往下修。  
> 「已确认无需改动」一节是评审时核对过的合理设计，之后别为了凑改进硬动它们。

---

## P0 — 核心路径上的成本 / 失败率

### 1. deepAnalysis「≥5000 字」硬性要求 + 三段补救链

- [x] 把 `MIN_DEEP_ANALYSIS_CHARS` 从 5000 降到模型自然产出区间（已改为 1800）
- [x] 删除 `expandDeepAnalysis` 扩写 pass（连带删除 `countChars`、ui.js 的「扩写」进度分支）
- [x] 复核 `MAX_OUTPUT_TOKENS` 与新字数要求的余量：1800 字深度文 ≈ 2–3.5k token + 其它字段 ≈ 1k，12288 余量充足，维持不变

**位置**：`src/llmEval.js:19-21`（常量）、`:134-146`（prompt 硬性要求）、`:398-449`（expandDeepAnalysis）、`:490-525`（repair + expand 调度）

**后果**：
- 4o-mini 一次写满 5000+ 汉字长文（还得塞在 JSON 单字段里）大概率写不满 → 扩写 pass 频繁触发，而它会把全部 6 万字聊天正文**原样重发一遍**（`:430-431`）→ 每次评测约 2 倍输入成本、2 倍延迟，烧的是用户自己的 Key。
- 截断级联：首轮输出逼近 `MAX_OUTPUT_TOKENS=12288`，finish_reason=length 在 JSON 字符串中间截断 → parse 失败 → repair 把整段 12k token 坏输出发回去要求修复，repair 走同一个 `callChatCompletions`、输出同样被 12288 封顶（`:322-323`）→ 大概率再截断 → 烧 2-3 次付费调用后报「模型返回不是合法 JSON」。
- 「禁止凑字灌水」与「必须 ≥5000 字」自相矛盾，小模型必然注水，报告质量反而下降。

**修复成本**：小时级。**如果只能改一处，改这里。**

---

### 2. 「导出 HTML 也可以」对 WeChatMsg 真实 HTML 导出不成立（推荐漏斗引导用户走死路）

- [x] 短期：导入页文案改为只推荐 TXT（index.html 三处 + ui.js 解析失败提示 + README），并明确说明 WeChatMsg 的 HTML 是动态网页无法解析
- [ ] 长期（可选）：parser 增加「从 HTML 提取内嵌 JSON → 走 JSON 解析」路径，比通用 DOM 启发式更可靠（需拿真实导出样本核对 `html_data` 字段结构后再做）

**位置**：`src/parser.js:163-278`（parseChatHtml）、`index.html:84-86`（推荐文案）

**后果**：WeChatMsg 的 HTML 导出（`WeChatMsg/exporter/exporter_html.py`，f.write 三连：模板头 + `json.dumps(消息)` + 模板尾）把消息以 JSON 塞在 `<script>` 里由页面 JS 运行时渲染，**静态 DOM 中没有任何消息节点**。parser.js 的全部选择器（`chat-item`/`msg-item`/`message-item`/`chat-message`）在 template.html 中命中 0；`DOMParser` 不执行脚本，body 文本回退拿到的是 JSON 转储，匹配不上任何 TXT 正则 → 必然抛「未能从 HTML 中解析出消息」。用户按页面推荐流程导 HTML，第一次尝试就失败。

**修复成本**：小时级（改文案）/ 天级（内嵌 JSON 提取路径）。

---

## P1 — 生产环境功能性缺陷

### 3. 智谱 provider 在任何静态部署下必然不可用

- [ ] 决策：直接删除智谱直连 provider（推荐，见「建议删除」#1），或上真代理 / edge function（违背「无后端」决策，不推荐）

**位置**：`src/providers.js:54-55`（`chatUrl: '/api/zhipu/...'`）、`vite.config.js:3-10`

**后果**：代理只存在于 `vite dev/preview` 进程；`architecture.md` 定位「纯前端 SPA 无自有后端」、`base: './'` 就是为静态托管准备的。部署到 Pages 后门禁页照样展示「智谱 GLM」入口，用户输入 Key → 请求打到自己域名 404/返回 index.html → 「连接失败」。这不是降级，是生产形态下结构性跑不通的功能入口。另外若智谱 `glm-4-flash` 输出上限确为 4k（未验证，见「不确定项」），`max_tokens: 12288` 即使在 dev 下也过不去——400 后的降级重试只去掉 `response_format`，仍带 12288（`src/llmEval.js:370-383`）。

**修复成本**：小时级（删）/ 天级（真代理）。

---

### 4. Google Fonts 渲染阻塞，目标用户恰好在大陆网络

- [ ] 删除 `index.html:7-9` 的 fonts.googleapis.com 外链（`styles.css:23` 的 font stack 已有 `system-ui` 兜底），或自托管 + `font-display: swap`

**后果**：render-blocking stylesheet 指向大陆不可达域名；本产品分析的是**微信**聊天，用户画像与该域名被墙的网络环境高度重合，首屏会挂在字体请求上直到超时（视浏览器数秒到数十秒白屏）。

**修复成本**：小时级。

---

### 5. 时间解析失败时，截断方向静默反转为「保留最旧」

- [ ] TXT 各模式正则已捕获年月日时分秒，用捕获组构造 `new Date(y, m-1, d, h, mi, s)`，不要把字符串交给 `new Date(string)`（`src/parser.js:416-437`）
- [ ] `truncateMessages` 的 untimed 分支改为从尾部取（或至少与 timed 同向），保住「保留最近」承诺（`src/llmEval.js:74-81`）

**后果**：无时间戳消息按文件顺序**从头**追加直到上限；若一份导出的时间全部解析失败（全进 untimed 桶），实际发给模型的是**最早的 400 条**，与「保留最近对话」正好相反且用户无从察觉。诱因：`new Date("2024-12-01 12:00:00")` 是非 ISO 字符串，规范未定义，历史上 Safari 返回 Invalid Date（现代 Safari 行为未验证）。时间全丢还会让 prompt 强制要求的「时间线与节奏」一节失去依据。

**修复成本**：小时级。

---

## P2 — 承诺一致性 / 仓库卫生

### 6. 「更换 / 退出 Key」只清当前 provider 的 key

- [ ] `clearStoredApiKey` 遍历 `KEY_STORAGE` 全清（`src/apiGate.js:31-34`）

**后果**：在两个 provider 都存过 Key 的用户点「退出 Key」后，另一个 provider 的 Key 仍明文留在 localStorage——与门禁文案「Key 只存本机、可退出」的承诺不一致，共用电脑场景尤其难看。

**修复成本**：小时级。顺带同档：`src/ui.js:538` 的 `if (signal.aborted) return;` 在 `setEvaluating(false)` 之前，极窄竞态会把用户永久卡在 loading 页且取消按钮失效——把清理提到 return 前。

---

### 7. WeChatMsg 以无 `.gitmodules` 的 gitlink 被追踪 + 36 个工具垃圾文件进了历史

- [ ] `git rm --cached WeChatMsg`，加入 `.gitignore`（README 已链接上游，web 应用运行时不依赖它）
- [ ] `git rm -r --cached .understand-anything`，加入 `.gitignore`

**后果**：`git ls-files -s` 显示 WeChatMsg 是 mode 160000 条目但没有 `.gitmodules`（`git submodule status` 直接 fatal）；clone 者得到空目录且无法初始化，gitlink 指向的 commit 若只在本地则永远拉不到。`.understand-anything/.trash-1783924567/` 下 36 个分析器缓存文件被 track。

**修复成本**：小时级。

---

### 8. LICENSE 文件与声明不一致

- [ ] `LICENSE` 是 MIT（Copyright 2026 Yinzhou），`package.json:17` 与 README 写 ISC——二选一统一

**修复成本**：分钟级。

---

## 建议删除（而非优化）

1. **整个智谱直连 provider**（`providers.js` 的 `PROVIDER_ZHIPU`、`apiGate.js` 的 `validateZhipuKey`、vite 代理）。OpenRouter 模型列表已有 `z-ai/glm-4.5-air`（`providers.js:30`），想用 GLM 走 OpenRouter 即可：一个 Key、无 CORS、无代理、生产可用。双 provider 抽象为一条生产跑不通的路径付出了 apiGate/providers 约一半的分支复杂度，删掉后 apiGate 缩回单一校验函数。（对应问题 #3）
2. **`expandDeepAnalysis` 扩写 pass**（`src/llmEval.js:398-449`）。字数门槛回归现实后没有存在理由，且它是代码里唯一把聊天全文重发第二遍的路径。（对应问题 #1）
3. 顺手清理：`providers.js` 从未被读取的 `validateMethod` 字段；`ui.js:34` 只写不读的 `readyEvalInput`；`agent.md` 中已不存在的 `getReadyEvalInput()` 引用（文档同步）。

---

## 已知但接受的信任边界（不修，知情即可）

- **Prompt 注入面**：聊天正文原样拼进 user prompt（`src/llmEval.js:187-188`），对方或递文件的人可在聊天里写指令操纵报告。后果上限只是"报告被操纵"——无工具调用、无数据外带，且 `filterHighlightsAgainstChat` + 本地重算 grade 已挡掉最难看的伪造。不建议为此加防御工程。
- **对方未同意的隐私上传**：把对方私聊发给第三方模型，对方未同意；面向大陆用户有个人信息保护法角度的合规暴露。产品决策层面的事，代码解决不了，但发布前该想清楚。
- **Key 明文存 localStorage**：无后端 BYOK 产品的标准取舍，UI 已如实告知，不需要伪加密。

---

## 已确认无需改动（评审核对过，别硬挑）

- **parser.js 与 WeChatMsg TXT 导出格式匹配**：`exporter_txt.py` 输出 `2024-12-01 12:00:00 昵称\n正文\n\n`（时间格式见 `wxManager/model/message.py:88`），对应 parser 模式 B（`src/parser.js:95-96`）；系统消息裸时间行被 `dateSep` 分支正确跳过。TXT 主漏斗是通的。
- **HTML 解析一律强制「选哪个是我」**（`src/parser.js:255`、`:277`）：把「我/TA 标反导致整份报告方向性错误」换成一次点击，正确取舍。
- **`flirtGrade` 本地按分数重算、highlights 必须能在原文找到才展示**（`src/llmEval.js:195-201`、`:282-300`）：好的防幻觉设计，别为「信任模型」简化掉。
- **LLM 输出进 DOM 全部过 `escapeHtml`**（ui.js / cardRenderer.js），`innerHTML` 只用于静态配置文案，XSS 面干净。
- **JSON 路径字段兼容**（`is_sender`/`CreateTime`/秒毫秒启发式，`src/parser.js:349-361`）与 WeChatMsg 侧对得上。
- **styles.css 无已删除模块（analyzer/aiChat）的残留类**，Phase 6 清理属实。

---

## 不确定项（评审时无法验证，动手前先确认）

- 智谱 `glm-4-flash` 的 `max_tokens` 上限（记忆中 4095；若实际支持 12288，问题 #3 的该子项不成立，但静态部署 404 的主论点不受影响）。
- OpenRouter 上 `google/gemini-2.0-flash-001` 是否仍可用（`providers.js:29`，模型列表整体有陈旧风险）。
- 现代 Safari 对 `new Date("2024-12-01 12:00:00")` 的行为（问题 #5 的结构性部分与此无关，照修不误）。
- 「4o-mini 大概率写不满 5000 字 / 扩写几乎每次触发」是工程判断非实测；评审未实际运行应用、未用真实导出文件走端到端。
