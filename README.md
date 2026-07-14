# Emotional Damage · 暧昧探测 & 关系画像卡片

> 上传微信导出的聊天记录 + 双方星座/MBTI → OpenRouter LLM 出打分、深度评测与建议 → 可分享卡片。  
> 方法论 Prompt 蒸馏自开源 [情圣 / qingsheng-skill](https://github.com/tomwong001/qingsheng-skill)（MIT）。

## 怎么用

```bash
npm install
npm run dev
```

1. 连接 OpenRouter API Key（免费模型也需要 Key）
2. 按页内「推荐导出三步」用工具（如 WeChatMsg）导出 **纯文本 TXT**，拖入页面（也支持 JSON；WeChatMsg 的 HTML 导出是动态网页，无法解析）
3. 填写双方星座、MBTI（可选「不清楚」）
4. 开始评测 → 查看报告 / 分享卡片

Demo 可跳过导出，直接体验流程。

## 隐私（请认真读）

- **会上传**：截断后的聊天正文（最近约 400 条 / 6 万字上限）+ 星座/MBTI + 评测指令 → OpenRouter / 上游模型  
- **不会**：本项目无自有后端；Key 只存在浏览器 `localStorage`  
- 不要再假设「纯本地、聊天绝不上传」——评测路径必然联网

## 技术栈

- Vite 8 + Vanilla JS
- 解析：`parser.js`（JSON / TXT / HTML）
- 评测：`llmEval.js` → OpenRouter（默认 `openai/gpt-4o-mini`）
- 卡片：`html2canvas`

## 目录

```
src/
  apiGate.js        # API 门禁
  parser.js         # 聊天文件解析
  profileOptions.js # 星座 / MBTI 选项
  llmEval.js        # 截断 + Prompt + LLM JSON
  ui.js             # 步骤与渲染
  cardRenderer.js   # 分享卡
  styles.css
plan.md / agent.md  # 改造计划与模块规格
```

## License

ISC（应用代码）。情圣相关 Prompt 改编需保留其 MIT 署名，见 `llmEval.js` 文件头。
