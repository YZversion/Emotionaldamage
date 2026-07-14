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

### 3. 智谱 provider 在任何静态部署下必然不可用 →（决策已更新：面向大陆用户走「薄后端」路线）

**决策（2026-07-14 讨论定稿）**：目标用户是大陆普通用户 → BYOK 架构本身才是天花板（逼用户注册 API Key = 最大流失点）。不删智谱代码、不修 dev 代理，按 Phase 演进：

- [x] **止血**：生产构建隐藏智谱入口（`ui.js` initUI 中 `import.meta.env.PROD` 时移除按钮并回退 provider；已验证编译进 dist）。dev 下智谱经 vite 代理照旧可用
- [ ] **Phase A（现在）**：OpenRouter BYOK 当「海外版/开发版」，继续打磨 prompt 与报告结构
- [ ] **前置实验（写后端前必做）**：注册智谱 Key（免费），同一 Demo + 同一 prompt 在 GLM-4.7-Flash 上跑一轮，与 GPT 系并排比质量；顺便验证露骨聊天内容是否触发智谱内容过滤。⚠️ 当前网络连不上 bigmodel.cn（实测超时），需换网络测
- [ ] **Phase B（实验通过后，2-4 天 + ~¥30/月）**：香港轻量服务器（免备案、大陆一般可达），前后端同机；后端单接口收 `{messages, profile}`、服务端拼 prompt、自持智谱 Key 调模型；删门禁页；IP 限流 + 全局日额度熔断。注意 GitHub Pages 在大陆间歇不可达——前端也要搬
- [ ] **Phase C（起量后再说）**：备案、国内托管、微信登录、付费。现在不为它设计任何东西

**已验证事实（2026-07-14）**：OpenRouter CORS 预检 204 + `Access-Control-Allow-Origin: *`，浏览器直连生产可用；GLM-4.5-Flash 最大输出 4096 tokens（官方文档），故 `glm-4-flash` + `max_tokens: 12288` 即使 dev 下也过不去——Phase B 应使用 GLM-4.7 系（输出上限 65536，flash 免费）；`google/gemini-2.0-flash-001` 已从 OpenRouter 下架，模型列表已换为 `gemini-2.5-flash`。

**原始问题记录**（保留供参考）：`/api/zhipu/...` 代理只存在于 `vite dev/preview` 进程；静态部署后选智谱 → 请求打到自己域名 404 → 「连接失败」。

---

### 4. Google Fonts 渲染阻塞，目标用户恰好在大陆网络

- [x] 已删除 fonts.googleapis.com 外链（preconnect ×2 + stylesheet），`styles.css:23` 的 font stack 以 system-ui 兜底

**后果**：render-blocking stylesheet 指向大陆不可达域名；本产品分析的是**微信**聊天，用户画像与该域名被墙的网络环境高度重合，首屏会挂在字体请求上直到超时（视浏览器数秒到数十秒白屏）。

**修复成本**：小时级。

---

### 5. 时间解析失败时，截断方向静默反转为「保留最旧」

- [x] `parseFlexibleTime` 改为显式正则捕获构造 `new Date(y, m-1, d, h, mi, s)`（覆盖 `-`/`/`/`.`/年月日 分隔、可缺秒、可缺时间），ISO 字符串走标准兜底，不再依赖浏览器对非 ISO 字符串的解析
- [x] `truncateMessages` 的 untimed 分支改为从尾部取（文件顺序视为时间序），保住「保留最近」承诺

**后果**：无时间戳消息按文件顺序**从头**追加直到上限；若一份导出的时间全部解析失败（全进 untimed 桶），实际发给模型的是**最早的 400 条**，与「保留最近对话」正好相反且用户无从察觉。诱因：`new Date("2024-12-01 12:00:00")` 是非 ISO 字符串，规范未定义，历史上 Safari 返回 Invalid Date（现代 Safari 行为未验证）。时间全丢还会让 prompt 强制要求的「时间线与节奏」一节失去依据。

**修复成本**：小时级。

---

## P2 — 承诺一致性 / 仓库卫生

### 6. 「更换 / 退出 Key」只清当前 provider 的 key

- [x] 已加 `clearAllStoredApiKeys()`（providers.js）遍历 `KEY_STORAGE` 全清 + legacy key，apiGate 的「退出 Key」改用它
- [x] 顺带的 abort 竞态也已修：`ui.js` 中 aborted 分支现在会 `setEvaluating(false)` 并回导入页，不再可能卡死 loading

**后果**：在两个 provider 都存过 Key 的用户点「退出 Key」后，另一个 provider 的 Key 仍明文留在 localStorage——与门禁文案「Key 只存本机、可退出」的承诺不一致，共用电脑场景尤其难看。

**修复成本**：小时级。顺带同档：`src/ui.js:538` 的 `if (signal.aborted) return;` 在 `setEvaluating(false)` 之前，极窄竞态会把用户永久卡在 loading 页且取消按钮失效——把清理提到 return 前。

---

### 7. WeChatMsg 以无 `.gitmodules` 的 gitlink 被追踪 + 36 个工具垃圾文件进了历史

- [x] `git rm --cached WeChatMsg` + `.gitignore` 已加 `WeChatMsg/`（工作区文件保留，仅取消追踪；**已 stage 未 commit**）
- [x] `git rm -r --cached .understand-anything` + `.gitignore` 已加 `.understand-anything/`、`.agents/`（同上，已 stage 未 commit）

**后果**：`git ls-files -s` 显示 WeChatMsg 是 mode 160000 条目但没有 `.gitmodules`（`git submodule status` 直接 fatal）；clone 者得到空目录且无法初始化，gitlink 指向的 commit 若只在本地则永远拉不到。`.understand-anything/.trash-1783924567/` 下 36 个分析器缓存文件被 track。

**修复成本**：小时级。

---

### 8. LICENSE 文件与声明不一致

- [x] 已统一为 MIT（以 `LICENSE` 文件为准）：`package.json` license 字段与 README License 节均改为 MIT

**修复成本**：分钟级。

---

## 建议删除（而非优化）

1. ~~整个智谱直连 provider~~ **决策已取代（2026-07-14）**：目标用户是大陆用户，智谱是他们唯一现实的模型来源——不删，生产隐藏入口，Phase B 以「自持 Key 薄后端」形态回归（见问题 #3）。原「删掉走 OpenRouter 的 GLM」建议只适用于海外用户假设。
2. ~~`expandDeepAnalysis` 扩写 pass~~ **已删**（连带 `countChars`、ui.js「扩写」进度分支）。（对应问题 #1）
3. ~~顺手清理~~ **已清**：`validateMethod` 字段已删；`readyEvalInput` 模块级状态改为 `proceedToEval` 内联传参；`agent.md` 的 `getReadyEvalInput()` 引用已移除。

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

## 不确定项（动手前先确认；已消解的划掉留档）

- ~~智谱 `glm-4-flash` 的 `max_tokens` 上限~~ **已验证（官方文档）**：GLM-4.5-Flash 上限 4096；GLM-4.7 系 65536。Phase B 用 4.7 系。
- ~~OpenRouter 上 `google/gemini-2.0-flash-001` 是否仍可用~~ **已验证（实测 models 接口）**：已下架，列表已换 `gemini-2.5-flash`；`gpt-4o-mini`/`gpt-4o`/`z-ai/glm-4.5-air` 仍在。
- ~~OpenRouter 浏览器直连 CORS~~ **已验证（实测预检）**：204 + `Access-Control-Allow-Origin: *`，生产可用。
- 现代 Safari 对 `new Date("2024-12-01 12:00:00")` 的行为——已通过显式正则解析绕开，不再依赖（问题 #5 已修，此项仅留档）。
- 智谱 API 的 CORS 策略：当前网络连不上 open.bigmodel.cn（实测超时），无法测；Phase B 走自持 Key 后端后此问题自动消解。
- 「1800 字深度评测」的实际输出质量与长度达标率：prompt 行为调整未实测，需带真实 Key 跑一轮确认观感（GPT 系与 GLM-4.7-Flash 各一轮，见问题 #3 前置实验）。
