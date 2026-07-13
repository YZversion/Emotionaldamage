/**
 * LLM 关系评测
 * Prompt 框架蒸馏自开源「情圣」qingsheng-skill（MIT，tomwong001）
 * https://github.com/tomwong001/qingsheng-skill
 * 适配为：一次请求 → 结构化 JSON 报告（非多轮僚机对话）
 */

const API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const MAX_MESSAGES = 400;
export const MAX_CHARS = 60000;

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
- dimensions 五维 score 均为 0–100；risk 越高表示消耗/踩坑风险越大
- highlights：必须能在所给聊天中找到依据的短句或可核对现象（勿编造原话）
- advice：3 条可执行下一步（可含「先别回」「这样回」方向，但本任务不强制给出完整话术树）
- deepAnalysis：多段中文，覆盖局势、关键信号点名（引用）、阶段理由、星座/MBTI 如何影响互动解读
- relationshipStage：1–7 整数；relationshipStageLabel 用标准中文名

## 输出硬性要求
只输出一个 JSON 对象，不要 Markdown 代码围栏，不要前后解释文字。字段必须齐全：
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
  "deepAnalysis": "...",
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

## 聊天正文
${chatText}`;
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
  const highlights = (Array.isArray(parsed.highlights) ? parsed.highlights : [])
    .map(h => String(h).trim())
    .filter(Boolean);

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
    highlights: highlights.length ? highlights : ['（模型未给出可核对高光，请结合聊天自行复核）'],
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

async function callChatCompletions({ apiKey, model, messages }) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'Emotional Damage',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      stream: false,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error?.message || body.message || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('API Key 无效或无权限，请返回更换 Key');
    }
    if (response.status === 429) {
      throw new Error('请求过于频繁（429），请稍后再试');
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
 * @param {object} input
 * @param {string} input.apiKey
 * @param {array} input.messages
 * @param {string} input.contactName
 * @param {{zodiac:string,mbti:string}} input.self
 * @param {{zodiac:string,mbti:string}} input.other
 * @param {string} [input.model]
 * @param {(msg:string)=>void} [onStatus]
 */
export async function runLlmEval(input, onStatus) {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) throw new Error('缺少 API Key');

  const status = typeof onStatus === 'function' ? onStatus : () => {};
  status('正在截断聊天记录…');

  const trunc = truncateMessages(input.messages);
  if (trunc.messages.length < 5) {
    throw new Error('有效消息太少（少于 5 条），请换一份更完整的聊天导出');
  }

  const chatText = trunc.messages.map(formatMessageLine).join('\n');
  const model = input.model || DEFAULT_MODEL;

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

  status('正在请求模型生成评测…');
  let content;
  try {
    content = await callChatCompletions({ apiKey, model, messages });
  } catch (err) {
    throw err;
  }

  let parsed;
  try {
    parsed = extractJsonObject(content);
  } catch (err) {
    status('JSON 解析失败，正在重试一次…');
    const repairMessages = [
      { role: 'system', content: '你只输出合法 JSON 对象，不要 Markdown，不要解释。' },
      {
        role: 'user',
        content: `下面这段无法解析为 JSON，请原样意图修正为合法 JSON 对象后只输出 JSON：\n\n${content}`,
      },
    ];
    content = await callChatCompletions({ apiKey, model, messages: repairMessages });
    parsed = extractJsonObject(content);
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
  });
}
