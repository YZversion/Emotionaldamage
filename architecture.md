# 架构文档

## 总体架构

Emotional Damage 采用**纯前端单页应用（SPA）架构**，所有计算在浏览器端完成。整体分为四层：

```
┌─────────────────────────────────────────────┐
│               UI 层 (ui.js)                  │
│  步骤管理 · DOM 渲染 · 事件绑定 · Toast 提示   │
├─────────────────────────────────────────────┤
│            分析引擎层 (analyzer.js)            │
│  信号检测 · 评分计算 · 画像生成 · 时间线聚合   │
├─────────────────────────────────────────────┤
│            解析层 (parser.js)                 │
│  多格式 JSON 解析 · 消息标准化 · Demo 生成    │
├─────────────────────────────────────────────┤
│            渲染/导出层 (cardRenderer.js)       │
│  分享卡片 DOM 构建 · html2canvas 导出         │
└─────────────────────────────────────────────┘
```

### 辅助模块
- **aiChat.js** — AI 情感顾问（调用 OpenRouter API，与架构主体松耦合）
- **styles.css** — 全局样式系统
- **vite.config.js** — 构建配置

## 核心数据流

```
用户上传 JSON / 点击 Demo
        │
        ▼
  parser.js  ──→  标准化消息数组
        │
        ▼
  analyzer.js ──→  分析结果对象
        │
        ▼
  ui.js        ──→  渲染结果面板 + 信号分布 + 时间线
        │
        ├──→ cardRenderer.js ──→ 分享卡片 DOM → html2canvas 导出
        │
        └──→ aiChat.js       ──→ 构建 System Prompt → OpenRouter API
```

## 分析结果对象结构（`analyze()` 返回值）

```typescript
interface AnalysisResult {
  myName: string;
  theirName: string;
  totalMessages: number;
  totalWords: number;
  dateRange: { start: string; end: string };
  flirtScore: number;       // 0–100
  flirtGrade: string;       // S/A/B/C/D
  gradeColor: string;
  signalBreakdown: {
    [category: string]: {
      me: number;           // 我的触发次数
      them: number;         // TA 的触发次数
      quotes: Array<{ text: string; sender: string; isMe: boolean; date: string; category: string }>;
    };
  };
  signalTotals: { [category: string]: number };
  bilateral: {
    meFlirtRatio: number;
    themFlirtRatio: number;
    meFlirtCount: number;
    themFlirtCount: number;
    meInitPct: number;
    themInitPct: number;
    verdict: string;
  };
  topQuotes: Array<{ text: string; sender: string; isMe: boolean; date: string; categories: string[] }>;
  tags: Array<{ text: string; type: string }>;
  timeline: Array<{ month: string; me: number; them: number }>;
}
```

## 关键设计决策

### 1. 信号词典引擎
- 定义了 5 个暧昧信号维度，每个维度包含一个关键词列表
- 遍历所有消息进行关键词匹配（子串包含），统计每方触发次数
- 表情维度使用 `emojiSet` 精确匹配 Unicode 字符

### 2. 评分算法
- 每种信号有基础权重（`intimateName: 6`, `missing: 5`, `lateNight: 4`, `flirtyAction: 5`, `flirtyEmoji: 3`）
- `rawScore = Σ(触发次数 × 权重)`
- 引入密度因子 `densityFactor = min(rawScore / (总消息数 × 0.5), 1.5)`
- `flirtScore = min(rawScore × densityFactor × 0.5, 100)`，保证分数分布在 0–100 区间
- 等级映射：S(≥85) / A(≥70) / B(≥50) / C(≥30) / D(<30)

### 3. 双向对比
- 分别计算双方"暧昧率"：`暧昧触发次数 / 对方总消息数 × 100`
- 通过每日首次消息判断"主动开场"比例
- 根据差值绝对值判定"双向奔赴"、"TA 更主动"、"你更主动"

### 4. 时间线聚合
- 按月聚合，统计每月双方暧昧信号的触发次数
- 使用分组柱状图展示趋势

## 隐私与安全

- 所有解析和分析在浏览器主线程中同步执行，**无网络请求**
- AI 顾问仅发送分析摘要（无原始消息内容）到 OpenRouter API
- API Key 存储在 `localStorage`，不经过任何中转服务器
- 卡片导出使用 `html2canvas` 在客户端完成

## 构建配置

- **Vite 8**，开发服务器端口 3000，自动打开浏览器
- 构建输出到 `dist/` 目录，`base: './'` 支持相对路径部署
- 唯一生产依赖：`html2canvas`
