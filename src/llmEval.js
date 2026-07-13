/**
 * LLM 关系评测
 * Prompt 框架蒸馏自开源「情圣」qingsheng-skill（MIT，tomwong001）
 * https://github.com/tomwong001/qingsheng-skill
 * 适配为：一次请求 → 结构化 JSON 报告（非多轮僚机对话）
 */

import {
  PROVIDER_OPENROUTER,
  getProviderConfig,
  getStoredProvider,
  getStoredModel,
} from './providers.js';

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const MAX_MESSAGES = 400;
export const MAX_CHARS = 60000;
/** deepAnalysis 目标字数（汉字/字符，含标点） */
export const MIN_DEEP_ANALYSIS_CHARS = 5000;
/** 输出上限：5000 字深度文 + JSON 其它字段，需足够大 */
export const MAX_OUTPUT_TOKENS = 12288;

const STAGE_LABELS = {
  1: '开场破冰',
  2: '建立好感',
  3: '关系升温',
  4: '邀约见面',
  5: '约会实战',
  6: '亲密升级',
  7: '确立关系',
};

const DIMENSION_DEFS = [
  { id: 'chemistry', label: '暧昧浓度' },
  { id: 'reciprocity', label: '双向性' },
  { id: 'zodiacFit', label: '星座契合' },
  { id: 'mbtiFit', label: 'MBTI 契合' },
  { id: 'risk', label: '风险/消耗' },
];

const GRADE_COLORS = {
  S: '#ffd700',
  A: '#ff4d7d',
  B: '#a78bfa',
  C: '#60a5fa',
  D: '#9ca3af',
};

/**
 * 保留最近消息，受条数与字符双上限约束
 */
export function truncateMessages(messages) {
  const withContent = (messages || []).filter(m => m && m.content);
  const timed = [];
  const untimed = [];
  for (const m of withContent) {
    if (m.time instanceof Date && !isNaN(m.time.getTime())) timed.push(m);
    else untimed.push(m);
  }
  timed.sort((a, b) => a.time - b.time);

  // 从最新往旧取
  const picked = [];
  let chars = 0;
  for (let i = timed.length - 1; i >= 0; i--) {
    const line = formatMessageLine(timed[i]);
    if (picked.length >= MAX_MESSAGES) break;
    if (chars + line.length > MAX_CHARS && picked.length > 0) break;
    picked.push(timed[i]);
    chars += line.length + 1;
  }
  picked.reverse();

  // 无时间戳的附在末尾（仍受上限）
  for (const m of untimed) {
    if (picked.length >= MAX_MESSAGES) break;
    const line = formatMessageLine(m);
    if (chars + line.length > MAX_CHARS) break;
    picked.push(m);
    chars += line.length + 1;
  }

  return {
    messages: picked,
    truncated: picked.length < withContent.length,
    totalAvailable: withContent.length,
    approxChars: chars,
  };
}

export function formatMessageLine(m) {
  const who = m.isMe ? '我' : 'TA';
  const t = formatDateTime(m.time);
  const content = String(m.content || '').replace(/\s+/g, ' ').trim();
  return t ? `[${t}] ${who}: ${content}` : `${who}: ${content}`;
}

function formatDateTime(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

function buildSystemPrompt() {
  return `你是「情圣」方法论加持的关系分析顾问：冷静、直接、有共情，依据聊天证据作判断。
分析框架蒸馏自开源项目 qingsheng-skill（MIT），但本次任务是一次性输出结构化评测报告，不要写成多轮僚机闲聊，不要追问用户。

## 七阶段（只能用这些标签，勿自创）
1 开场破冰 / 2 建立好感 / 3 关系升温 / 4 邀约见面 / 5 约会实战 / 6 亲密升级 / 7 确立关系
阶段判断偏后：信号混杂时倾向判后一阶段。强信号强制升级：
- 亲昵称呼 → 至少阶段4
- 已约好见面时间地点 / 已见面 → 至少阶段4/5
- 互表喜欢 → 至少阶段5
- 性话题双方配合 → 至少阶段6

## 信号工具
- IOI（兴趣）：主动找话题、回复有延伸、问你的事、分享私人细节、撒娇玩笑
- IOD（无兴趣）：敷衍、间隔变长、从不主动、回避私人话题、拒绝见面
看趋势与密度，勿因单条信号下死结论。关注时间节奏（秒回后突然消失 ≠ 一贯慢回）。

## 评分
- flirtScore：0–100 整数，综合暧昧浓度、双向性、推进意愿
- flirtGrade：S≥85 / A≥70 / B≥50 / C≥30 / 否则 D（必须与分数一致）
- dimensions 五维 score 均为 0–100；risk 越高表示消耗/踩坑风险越大；每维 comment 写 40–80 字
- highlights：3–6 条，必须能在所给聊天中找到依据的短句或可核对现象（勿编造原话）
- advice：3–5 条可执行下一步（可含「先别回」「这样回」方向）
- relationshipStage：1–7 整数；relationshipStageLabel 用标准中文名
- verdict：关系定性一句话；summary：一句话总评（可与 verdict 不同角度）

## deepAnalysis（最重要，篇幅硬性要求）
必须是一篇完整中文长文，使用换行分段，总字数（含标点、空格）不少于 ${MIN_DEEP_ANALYSIS_CHARS} 字。
禁止凑字灌水、禁止重复同一句；必须紧扣所给聊天证据展开。
请按以下小标题结构写满（每个小标题下至少 2–4 段）：
1. 关系现状总览
2. 时间线与节奏（谁主动、回覆密度、冷热变化）
3. 关键 IOI / IOD 证据（引用聊天中的原话或可核对现象，并解释含义）
4. 阶段判定理由（为何是该阶段，而非相邻阶段）
5. 双方互动模式（追逃、试探、情绪劳动、边界）
6. 星座与 MBTI 如何影响解读（若为「不清楚」则写「信息不足时的谨慎推断」）
7. 风险与误判点（容易看错的地方）
8. 接下来 7–14 天的策略地图（原则 + 具体动作，勿只给空话）

## 输出硬性要求
只输出一个 JSON 对象，不要 Markdown 代码围栏，不要前后解释文字。
deepAnalysis 字段本身用 \\n 表示换行。字段必须齐全：
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
  "deepAnalysis": "（不少于 ${MIN_DEEP_ANALYSIS_CHARS} 字的长文）",
  "advice": ["...", "...", "..."],
  "highlights": ["...", "..."],
  "verdict": "关系定性一句话"
}`;
}

function buildUserPrompt(input, chatText, meta) {
  const { self, other, contactName } = input;
  return `请根据以下材料生成评测 JSON。

## 双方画像
- 你：星座 ${self.zodiac}，MBTI ${self.mbti}
- 对方（${contactName || 'TA'}）：星座 ${other.zodiac}，MBTI ${other.mbti}

## 聊天说明
- 平台：微信（导出文本）
- 本次发送消息条数：${meta.sentCount}（原始可用 ${meta.totalAvailable} 条${meta.truncated ? '，已截断为最近对话' : ''}）
- 角色标注：「我」= 用户，「TA」= 对方

## 篇幅提醒（必须遵守）
- deepAnalysis 必须 ≥ ${MIN_DEEP_ANALYSIS_CHARS} 字；写不满视为不合格输出。
- 其它字段保持简洁；把篇幅留给 deepAnalysis。

## 聊天正文
${chatText}`;
}

function countChars(text) {
  return Array.from(String(text || '')).length;
}

function gradeFromScore(score) {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 50) return 'B';
  if (score >= 30) return 'C';
  return 'D';
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('模型返回不是合法 JSON');
  }
}

export function normalizeEvalResult(parsed, context = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.flirtScore) || 0)));
  const grade = gradeFromScore(score);

  const dimMap = new Map(
    (Array.isArray(parsed.dimensions) ? parsed.dimensions : []).map(d => [d.id, d])
  );
  const dimensions = DIMENSION_DEFS.map(def => {
    const src = dimMap.get(def.id) || {};
    return {
      id: def.id,
      label: src.label || def.label,
      score: Math.max(0, Math.min(100, Math.round(Number(src.score) || 0))),
      comment: String(src.comment || '').trim() || '暂无点评',
    };
  });

  let stage = Math.round(Number(parsed.relationshipStage) || 0);
  if (stage < 1 || stage > 7) stage = 3;
  const stageLabel =
    String(parsed.relationshipStageLabel || '').trim() || STAGE_LABELS[stage];

  const advice = (Array.isArray(parsed.advice) ? parsed.advice : [])
    .map(a => String(a).trim())
    .filter(Boolean);

  const chatText = String(context.chatText || '');
  const rawHighlights = (Array.isArray(parsed.highlights) ? parsed.highlights : [])
    .map(h => String(h).trim())
    .filter(Boolean);
  const highlights = filterHighlightsAgainstChat(rawHighlights, chatText);

  const summary = String(parsed.summary || '').trim() || '暂无总评';
  const deepAnalysis = String(parsed.deepAnalysis || '').trim() || '暂无深度评测';
  const verdict = String(parsed.verdict || '').trim() || summary;

  return {
    source: 'llm',
    flirtScore: score,
    flirtGrade: grade,
    gradeColor: GRADE_COLORS[grade],
    summary,
    relationshipStage: stage,
    relationshipStageLabel: stageLabel,
    dimensions,
    deepAnalysis,
    advice: advice.length ? advice : ['先观察对方最近三条回复的投入度，再决定要不要升温。'],
    highlights,
    verdict,
    myName: context.myName || '我',
    theirName: context.theirName || 'TA',
    totalMessages: context.totalMessages || 0,
    dateRange: context.dateRange || { start: '未知', end: '未知' },
    profile: context.profile || null,
    truncateMeta: context.truncateMeta || null,
    tags: [
      { text: `📍 阶段${stage} ${stageLabel}`, type: 'stage' },
      { text: verdict.length > 24 ? verdict.slice(0, 24) + '…' : verdict, type: 'verdict' },
    ],
  };
}

/** 高光必须能在截断正文中找到（忽略空白差异）；否则丢弃 */
export function filterHighlightsAgainstChat(highlights, chatText) {
  const haystack = normalizeForMatch(chatText);
  const kept = [];
  for (const h of highlights) {
    const needle = normalizeForMatch(h);
    if (needle.length < 2) continue;
    if (haystack.includes(needle)) {
      kept.push(h);
      continue;
    }
    // 允许高光是正文中某句的节选：去掉「我:/TA:」前缀后再比
    const stripped = needle.replace(/^(我|ta)\s*[:：]\s*/i, '');
    if (stripped.length >= 4 && haystack.includes(stripped)) {
      kept.push(h);
    }
  }
  if (kept.length > 0) return kept;
  return ['（高光未通过原文核对，已隐藏疑似编造内容）'];
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[“”"']/g, '');
}

async function callChatCompletions({
  apiKey,
  model,
  messages,
  signal,
  provider = PROVIDER_OPENROUTER,
  jsonMode = true,
}) {
  const cfg = getProviderConfig(provider);
  const body = {
    model,
    messages,
    temperature: 0.4,
    stream: false,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === PROVIDER_OPENROUTER) {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : '';
    headers['X-Title'] = 'Emotional Damage';
  }

  const response = await fetch(cfg.chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody.error?.message || errBody.message || errBody.msg || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        detail
          ? `API Key 无效或无权限：${detail}`
          : 'API Key 无效或无权限，请返回更换 Key'
      );
    }
    if (response.status === 402) {
      throw new Error(
        detail
          ? `额度不足：${detail}`
          : '额度不足（402），请检查账户余额后重试'
      );
    }
    if (response.status === 429) {
      throw new Error(detail || '请求过于频繁（429），请稍后再试');
    }
    // 部分模型不支持 response_format：降级重试一次
    if (
      jsonMode &&
      (response.status === 400 || /response_format|json_object|json mode|json_schema/i.test(detail))
    ) {
      return callChatCompletions({
        apiKey,
        model,
        messages,
        signal,
        provider,
        jsonMode: false,
      });
    }
    throw new Error(
      detail ? `评测失败 (${response.status}): ${detail}` : `评测失败 (HTTP ${response.status})`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回内容');
  return content;
}

/**
 * 首轮 deepAnalysis 不够长时，单独扩写一次（只改该字段）
 */
async function expandDeepAnalysis({
  apiKey,
  model,
  provider,
  signal,
  chatText,
  parsed,
  profileHint,
}) {
  const current = String(parsed.deepAnalysis || '').trim();
  const need = Math.max(MIN_DEEP_ANALYSIS_CHARS - countChars(current), 1500);
  const messages = [
    {
      role: 'system',
      content:
        '你是关系分析写手。只输出合法 JSON 对象：{"deepAnalysis":"..."}。不要 Markdown，不要其它字段。',
    },
    {
      role: 'user',
      content: `把下面的深度评测扩写成不少于 ${MIN_DEEP_ANALYSIS_CHARS} 字的中文长文（当前约 ${countChars(current)} 字，还需至少约 ${need} 字）。
要求：保留原有结论与阶段判断；补充证据引用、时间线、互动模式、风险与 7–14 天策略；禁止空洞重复；用 \\n 分段。

## 画像与结论摘要
${profileHint}
阶段：${parsed.relationshipStage} ${parsed.relationshipStageLabel || ''}
总分：${parsed.flirtScore} / ${parsed.flirtGrade}
总评：${parsed.summary || ''}
定性：${parsed.verdict || ''}

## 现有 deepAnalysis
${current || '（空）'}

## 聊天正文（证据来源）
${chatText}`,
    },
  ];

  const content = await callChatCompletions({
    apiKey,
    model,
    messages,
    signal,
    provider,
    jsonMode: true,
  });
  const expanded = extractJsonObject(content);
  const next = String(expanded.deepAnalysis || '').trim();
  if (countChars(next) > countChars(current)) {
    parsed.deepAnalysis = next;
  }
  return parsed;
}

/**
 * @param {object} input
 * @param {AbortSignal} [input.signal]
 * @param {string} [input.provider]
 * @param {string} [input.model]
 */
export async function runLlmEval(input, onStatus) {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) throw new Error('缺少 API Key');

  const status = typeof onStatus === 'function' ? onStatus : () => {};
  const signal = input.signal;
  const provider = input.provider || getStoredProvider();
  const model = input.model || getStoredModel(provider) || getProviderConfig(provider).defaultModel;

  status('正在截断聊天记录…');

  const trunc = truncateMessages(input.messages);
  if (trunc.messages.length < 5) {
    throw new Error('有效消息太少（少于 5 条），请换一份更完整的聊天导出');
  }

  const chatText = trunc.messages.map(formatMessageLine).join('\n');

  const system = buildSystemPrompt();
  const user = buildUserPrompt(input, chatText, {
    sentCount: trunc.messages.length,
    totalAvailable: trunc.totalAvailable,
    truncated: trunc.truncated,
  });

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  status(`正在请求 ${getProviderConfig(provider).label}（${model}）…`);
  let content = await callChatCompletions({ apiKey, model, messages, signal, provider });

  let parsed;
  try {
    parsed = extractJsonObject(content);
  } catch {
    status('JSON 解析失败，正在重试一次…');
    const repairMessages = [
      { role: 'system', content: '你只输出合法 JSON 对象，不要 Markdown，不要解释。' },
      {
        role: 'user',
        content: `下面这段无法解析为 JSON，请原样意图修正为合法 JSON 对象后只输出 JSON：\n\n${content}`,
      },
    ];
    content = await callChatCompletions({
      apiKey,
      model,
      messages: repairMessages,
      signal,
      provider,
      jsonMode: true,
    });
    parsed = extractJsonObject(content);
  }

  const deepLen = countChars(parsed.deepAnalysis);
  if (deepLen < MIN_DEEP_ANALYSIS_CHARS) {
    status(`深度评测偏短（${deepLen} 字），正在扩写至 ${MIN_DEEP_ANALYSIS_CHARS}+ 字…`);
    parsed = await expandDeepAnalysis({
      apiKey,
      model,
      provider,
      signal,
      chatText,
      parsed,
      profileHint: `你：${input.self?.zodiac}/${input.self?.mbti}；对方：${input.other?.zodiac}/${input.other?.mbti}（${input.contactName || 'TA'}）`,
    });
  }

  const timed = trunc.messages.filter(m => m.time instanceof Date && !isNaN(m.time.getTime()));
  const dateRange =
    timed.length > 0
      ? {
          start: formatDateTime(timed[0].time).slice(0, 10),
          end: formatDateTime(timed[timed.length - 1].time).slice(0, 10),
        }
      : { start: '未知', end: '未知' };

  const myName = trunc.messages.find(m => m.isMe)?.sender || '我';
  const theirName =
    input.contactName || trunc.messages.find(m => !m.isMe)?.sender || 'TA';

  status('正在整理报告…');
  return normalizeEvalResult(parsed, {
    myName,
    theirName,
    totalMessages: trunc.totalAvailable,
    dateRange,
    profile: { self: { ...input.self }, other: { ...input.other } },
    truncateMeta: {
      sent: trunc.messages.length,
      total: trunc.totalAvailable,
      truncated: trunc.truncated,
    },
    chatText,
  });
}
