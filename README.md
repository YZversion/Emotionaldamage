# Emotional Damage · 暧昧探测 & 关系画像卡片生成器

> 把微信聊天记录变成可分享的暧昧指数卡片。纯前端，数据不上传，隐私安全。

## 项目简介

Emotional Damage 是一款**纯前端**（Vanilla JS + Vite）工具应用，用户上传微信聊天记录的 JSON 文件后，系统通过信号词典引擎自动检测暧昧关键词、表情、深夜聊天等行为，生成：

- 📊 **暧昧指数评分**（0–100 分，S/A/B/C/D 五级）
- 📡 **五维暧昧信号分布**（亲昵称呼、想念信号、深夜亲密、暧昧动作、暧昧表情）
- ⚖️ **双向对比**（你和 TA 谁更主动）
- 💬 **Top 暧昧语录高亮**
- 🏷️ **关系画像标签**
- 📈 **暧昧时间线**
- 🤖 **AI 情感顾问**（基于 OpenRouter API 的智能问答）
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
2. 系统自动分析并展示 6 大维度的暧昧探测结果
3. 点击「💌 发给他/她」复制卡片到剪贴板，分享给好友
4. 点击「📸 分享卡片」生成精美卡片，支持复制图片或保存为 PNG
5. 右下角的 AI 顾问可以回答你对这段关系的任何疑问

### 支持的 JSON 格式

```json
// 格式一：消息数组
[
  {
    "time": "2026-05-25 10:30:00",
    "is_send": true,
    "sender": "我",
    "content": "在干嘛呢"
  }
]

// 格式二：带 meta 的对象
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

数据仅在浏览器本地处理，**不会上传到任何服务器**。

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
- **AI 接口**: OpenRouter API (默认免费模型 Mistral 7B，可选 GPT-4o-mini)
- **样式**: 纯 CSS（自定义属性、Flexbox、动画）

## 隐私声明

- 所有数据仅在浏览器本地处理，**不上传任何聊天内容到服务器**
- AI 顾问功能仅发送分析摘要（无原始消息）到 OpenRouter API
- 可选的 API Key 保存在浏览器本地 localStorage 中

## License

ISC
