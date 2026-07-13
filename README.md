# Emotional Damage · 暧昧探测 & 关系画像卡片生成器

> 把微信聊天记录变成可分享的暧昧指数卡片。解析与评分在浏览器本地完成；可选 AI 顾问需联网。

## 项目简介

Emotional Damage 是一款**纯前端**（Vanilla JS + Vite）工具应用，用户上传微信聊天记录的 JSON 文件后，系统通过信号词典引擎自动检测暧昧关键词、表情、深夜聊天等行为，生成：

- 📊 **暧昧指数评分**（0–100 分，S/A/B/C/D 五级）
- 📡 **五维暧昧信号分布**（亲昵称呼、想念信号、深夜亲密、暧昧动作、暧昧表情）
- ⚖️ **双向对比**（你和 TA 谁更主动）
- 💬 **Top 暧昧语录高亮**
- 🏷️ **关系画像标签**
- 📈 **暧昧时间线**
- 🤖 **AI 情感顾问**（可选；需 OpenRouter API Key，会上传分析摘要）
- 📸 **可导出/复制的分享卡片**

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

## 使用说明

1. 打开页面后，上传微信聊天记录的 JSON 文件（支持多种格式）
2. 若文件没有 `is_send` 等「是否本人」字段，会要求你选择「哪个是你」
3. 系统本地分析并展示暧昧探测结果
4. 点击「💌 发给他/她」复制卡片到剪贴板，或「📸 分享卡片」导出 PNG
5. （可选）展开 AI 顾问，填写 OpenRouter API Key 后提问——会联网上传摘要与脱敏语录

### 支持的 JSON 格式

```json
// 格式一：带 is_send（推荐）
[
  {
    "time": "2026-05-25 10:30:00",
    "is_send": true,
    "sender": "我",
    "content": "在干嘛呢"
  }
]

// 格式二：仅有 sender 时，导入后会请你确认身份
{
  "chat": "联系人姓名",
  "messages": [
    {
      "timestamp": 1777610400,
      "sender": "Alice",
      "type": "text",
      "content": "想你了"
    }
  ]
}
```

## 项目结构

```
emotionaldamage/
├── index.html            # 入口 HTML
├── package.json
├── vite.config.js
├── src/
│   ├── main.js           # 入口文件
│   ├── parser.js         # 聊天记录解析器（多格式支持）
│   ├── analyzer.js       # 暧昧探测 & 关系画像分析引擎
│   ├── cardRenderer.js   # 分享卡片渲染器
│   ├── ui.js             # UI 层（步骤切换、DOM 渲染、事件绑定）
│   ├── aiChat.js         # AI 情感顾问（OpenRouter API）
│   └── styles.css        # 全局样式
└── dist/                 # 构建产物
```

## 技术栈

- **构建工具**: Vite 8
- **运行时**: Vanilla JavaScript (ES Modules)
- **卡片导出**: html2canvas
- **AI 接口**: OpenRouter API（需 API Key；默认 `openrouter/free`，可选 GPT-4o-mini）
- **样式**: 纯 CSS（自定义属性、Flexbox、动画）

## 隐私声明

- **本地分析**：解析、评分、分享卡导出均在浏览器完成，不会把完整聊天记录上传到本项目服务器（本项目无后端）
- **可选 AI**：若使用 AI 顾问，会将分析摘要与若干条脱敏语录发送到 OpenRouter；昵称以「你 / TA」代替
- API Key 仅保存在浏览器 `localStorage`

## License

ISC
