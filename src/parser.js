/**
 * 聊天记录解析器
 * 支持：JSON、微信常见纯文本导出、微信/工具导出的 HTML
 */

/**
 * 统一入口：按扩展名 + 内容嗅探选择解析器
 * @param {string} raw
 * @param {string} [filename]
 */
export function parseChatFile(raw, filename = '') {
  const text = stripBom(String(raw ?? ''));
  if (!text.trim()) {
    throw new Error('文件内容为空');
  }

  const lower = (filename || '').toLowerCase();
  const trimmed = text.trim();

  if (lower.endsWith('.json') || looksLikeJson(trimmed)) {
    return parseChatJson(text);
  }
  if (
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    looksLikeHtml(trimmed)
  ) {
    return parseChatHtml(text);
  }
  if (lower.endsWith('.txt') || lower.endsWith('.text') || looksLikeChatText(trimmed)) {
    return parseChatText(text);
  }

  // 兜底：先试 JSON，再试文本，再试 HTML
  try {
    return parseChatJson(text);
  } catch {
    /* continue */
  }
  try {
    return parseChatText(text);
  } catch {
    /* continue */
  }
  return parseChatHtml(text);
}

/** @deprecated 请优先用 parseChatFile；保留兼容 */
export function parseChatJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    throw new Error('JSON 格式错误，请检查文件内容');
  }

  let messages = [];
  let contactHint = '';

  if (Array.isArray(data)) {
    messages = data;
  } else if (data && Array.isArray(data.messages)) {
    messages = data.messages;
    contactHint = data.chat || data.contact || data.name || '';
  } else {
    throw new Error('未能识别的 JSON 结构：需要消息数组或 { messages: [...] }');
  }

  if (messages.length === 0) {
    throw new Error('聊天记录为空，未找到任何消息');
  }

  const normalized = messages.map(m => normalizeMessage(m)).filter(Boolean);
  return finalizeParse(normalized, contactHint, messages.length);
}

/**
 * 纯文本：常见导出形态
 * 1) [发送者] 2024-01-01 12:00:00  正文
 * 2) 2024-01-01 12:00:00 发送者\n正文...
 * 3) 发送者 2024/1/1 12:00:00\n正文...
 */
export function parseChatText(rawText) {
  const text = stripBom(String(rawText));
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const messages = [];
  let i = 0;

  // 模式 A：整行 [sender] time content
  const bracketLine =
    /^\[([^\]]+)\]\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/;

  // 模式 B：time sender（正文在后续行）
  const timeSender =
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;

  // 模式 C：sender time
  const senderTime =
    /^(.+?)\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$/;

  const dateSep = /^[-—–=\s]*\d{4}[-年/]\d{1,2}[-月/]\d{1,2}/;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    // 日期分隔行跳过
    if (dateSep.test(line) && !timeSender.test(line) && !bracketLine.test(line) && line.length < 40) {
      i++;
      continue;
    }

    let m = line.match(bracketLine);
    if (m) {
      const content = (m[3] || '').trim();
      if (content && !isNonTextPlaceholder(content)) {
        messages.push(makeRawMessage(m[2], m[1], content));
      }
      i++;
      continue;
    }

    m = line.match(timeSender);
    if (m) {
      const timeStr = m[1];
      const sender = cleanSender(m[2]);
      const { content, nextIndex } = collectBody(lines, i + 1, isHeaderLine);
      i = nextIndex;
      if (content && !isNonTextPlaceholder(content)) {
        messages.push(makeRawMessage(timeStr, sender, content));
      }
      continue;
    }

    m = line.match(senderTime);
    if (m && !/^\d{4}/.test(m[1])) {
      const sender = cleanSender(m[1]);
      const timeStr = m[2];
      const { content, nextIndex } = collectBody(lines, i + 1, isHeaderLine);
      i = nextIndex;
      if (content && !isNonTextPlaceholder(content)) {
        messages.push(makeRawMessage(timeStr, sender, content));
      }
      continue;
    }

    i++;
  }

  const normalized = messages.map(msg => normalizeMessage(msg)).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('未能从纯文本中解析出消息。请确认是微信/工具导出的聊天文本格式');
  }
  return finalizeParse(normalized, '', messages.length);
}

/**
 * HTML：微信备份页 / WeChatMsg 等常见结构
 */
export function parseChatHtml(rawHtml) {
  const html = stripBom(String(rawHtml));
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前环境无法解析 HTML');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const messages = [];

  // 优先：带明确消息块的节点
  const itemSelectors = [
    '[class*="chat-item"]',
    '[class*="chat-message"]',
    '[class*="msg-item"]',
    '[class*="message-item"]',
    '.message',
    '.msg',
    'div[data-time]',
    'div[data-datetime]',
    'li[data-time]',
  ];

  let items = [];
  for (const sel of itemSelectors) {
    const found = [...doc.querySelectorAll(sel)];
    if (found.length >= 3) {
      items = found;
      break;
    }
  }

  if (items.length === 0) {
    // 宽松：含时间样式的块
    items = [...doc.querySelectorAll('div, li, article, section')].filter(el => {
      const t = el.querySelector?.('.time, .msg-time, .message-time, [class*="time"]');
      const c = el.querySelector?.('.content, .text, .msg-content, .message-content, [class*="content"]');
      return Boolean(t && c);
    });
  }

  for (const el of items) {
    // 跳过嵌套子消息块，避免重复
    if (items.some(other => other !== el && other.contains(el))) continue;

    const timeEl = el.querySelector(
      '.time, .msg-time, .message-time, .chat-time, [class*="time"], time'
    );
    const senderEl = el.querySelector(
      '.nickname, .name, .sender, .username, .display-name, [class*="nickname"], [class*="sender"], [class*="name"]'
    );
    const contentEl = el.querySelector(
      '.content, .text, .msg-content, .message-content, .chat-content, [class*="content"], [class*="text"]'
    );

    const timeAttr =
      el.getAttribute('data-time') ||
      el.getAttribute('data-datetime') ||
      el.getAttribute('data-ts') ||
      timeEl?.getAttribute?.('data-time') ||
      timeEl?.getAttribute?.('datetime') ||
      '';

    let timeStr = timeAttr || (timeEl ? timeEl.textContent : '') || '';
    // data-datetime="1698723845000-28800000" → 取前段毫秒
    const compound = String(timeStr).match(/^(\d{10,13})(-\d+)?$/);
    if (compound) {
      timeStr = compound[1];
    }

    let sender = (senderEl?.textContent || '').trim();
    let content = '';
    if (contentEl) {
      content = (contentEl.innerText || contentEl.textContent || '').trim();
    } else {
      // 去掉时间/昵称节点后取剩余文本
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.time, .msg-time, .nickname, .name, .sender, img, video, audio, script, style')
        .forEach(n => n.remove());
      content = (clone.innerText || clone.textContent || '').trim();
    }

    content = content.replace(/\u200b/g, '').trim();
    if (!content || isNonTextPlaceholder(content)) continue;

    const className = `${el.className || ''} ${el.getAttribute('class') || ''}`.toLowerCase();
    const isMeHint =
      /\b(self|is-me|isme|is_me|send|myself|own|right|from-me|from_me)\b/.test(className) ||
      el.classList?.contains?.('self') ||
      sender === '我';

    if (!sender) {
      sender = isMeHint ? '我' : 'TA';
    }

    const raw = makeRawMessage(timeStr, sender, content);
    if (isMeHint) {
      raw.is_send = true;
    } else if (/\b(other|left|receive|friend)\b/.test(className)) {
      raw.is_send = false;
    }
    messages.push(raw);
  }

  // 仍无结果：按可见文本行用纯文本解析器兜底
  if (messages.length === 0) {
    const bodyText = doc.body?.innerText || doc.documentElement?.innerText || '';
    if (bodyText.trim().length > 20) {
      return parseChatText(bodyText);
    }
    throw new Error('未能从 HTML 中解析出消息。请确认是微信/工具导出的聊天 HTML');
  }

  const normalized = messages.map(msg => normalizeMessage(msg)).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('HTML 中没有可用的文本消息');
  }

  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1, h2, .title, .chat-title')?.textContent?.trim() ||
    '';
  return finalizeParse(normalized, title, messages.length);
}

/**
 * 按用户选择的「我」重新标注 isMe
 */
export function applySelfIdentity(messages, meName) {
  return messages.map(m => ({
    ...m,
    isMe: m.sender === meName,
    isMeExplicit: true,
  }));
}

function finalizeParse(normalized, contactHint, totalRaw) {
  if (normalized.length === 0) {
    throw new Error('没有可用的文本消息（可能全是非文本或空内容）');
  }

  const hasExplicitMe = normalized.some(m => m.isMeExplicit);
  const participants = recognizeParticipants(normalized);
  const needsSelfPick = !hasExplicitMe && participants.length >= 2;

  const contactName =
    contactHint ||
    participants.find(p => !normalized.some(m => m.isMe && m.sender === p)) ||
    participants[1] ||
    'TA';

  return {
    messages: normalized,
    participants,
    contactName,
    needsSelfPick,
    totalRaw: totalRaw ?? normalized.length,
  };
}

function normalizeMessage(msg) {
  let time = null;
  if (msg.time) {
    time = parseFlexibleTime(msg.time);
  } else if (msg.timestamp) {
    const ts = Number(msg.timestamp);
    time = new Date(ts * (ts > 1e11 ? 1 : 1000));
  } else if (msg.CreateTime) {
    const ts = Number(msg.CreateTime);
    time = new Date(ts * (ts > 1e11 ? 1 : 1000));
  }

  if (!time || isNaN(time.getTime())) {
    time = null;
  }

  let sender = msg.sender || msg.from_user || msg.talker || '未知';
  sender = cleanSender(sender);

  let isMe = false;
  let isMeExplicit = false;

  if (msg.is_send !== undefined) {
    isMeExplicit = true;
    isMe = msg.is_send === true || msg.is_send === 1;
  } else if (msg.is_from_me !== undefined) {
    isMeExplicit = true;
    isMe = msg.is_from_me === true || msg.is_from_me === 1;
  } else if (msg.is_sender !== undefined) {
    isMeExplicit = true;
    isMe = msg.is_sender === 1 || msg.is_sender === true;
  } else if (sender === '我' || sender === 'Me' || sender === 'me') {
    isMeExplicit = true;
    isMe = true;
  }

  let content = msg.content || msg.msg || msg.text || '';
  content = String(content).trim();

  const msgType = msg.type || msg.type_name || '';
  if (msgType !== '' && msgType !== 1 && msgType !== '1' && msgType !== 'text' && msgType !== 'Text') {
    if (content === '') return null;
  }

  if (content === '' || isNonTextPlaceholder(content)) return null;

  return { time, isMe, isMeExplicit, sender, content };
}

function recognizeParticipants(messages) {
  const senders = new Set();
  const counts = {};
  for (const m of messages) {
    if (!m) continue;
    const name = m.sender;
    senders.add(name);
    counts[name] = (counts[name] || 0) + 1;
  }

  const sorted = [...senders].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  const meSet = new Set();
  for (const m of messages) {
    if (m && m.isMe) meSet.add(m.sender);
  }

  if (meSet.size === 1) {
    const meName = [...meSet][0];
    return [meName, sorted.find(s => s !== meName) || 'TA'];
  }

  return sorted.slice(0, 2);
}

function makeRawMessage(time, sender, content) {
  return {
    time,
    sender: cleanSender(sender),
    content: String(content).trim(),
  };
}

function cleanSender(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/^[:：\-\s]+|[:：\-\s]+$/g, '')
    .trim() || '未知';
}

function parseFlexibleTime(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value > 1e11 ? value : value * 1000);
  }
  const s = String(value).trim();
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return new Date(n > 1e11 ? n : n * 1000);
  }
  // 2024/1/2 3:04:05 → 可被 Date 解析的形式
  const normalized = s
    .replace(/年|\/|\./g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function collectBody(lines, startIndex, isHeader) {
  const parts = [];
  let i = startIndex;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      if (parts.length > 0) break;
      i++;
      continue;
    }
    if (isHeader(t)) break;
    parts.push(t);
    i++;
  }
  return { content: parts.join('\n').trim(), nextIndex: i };
}

function isHeaderLine(line) {
  const bracketLine =
    /^\[([^\]]+)\]\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)/;
  const timeSender =
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
  const senderTime =
    /^(.+?)\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
  return bracketLine.test(line) || timeSender.test(line) || (senderTime.test(line) && !/^\d{4}/.test(line));
}

function isNonTextPlaceholder(content) {
  const c = content.trim();
  return (
    /^\[(图片|照片|动画表情|表情|视频|语音|文件|位置|链接|名片|红包|转账|拍一拍|系统消息|撤回一条消息).*\]$/i.test(c) ||
    /^(图片|视频|语音|动画表情|\[Image\]|\[Video\]|\[Voice\])$/i.test(c)
  );
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function looksLikeJson(s) {
  const t = s.trim();
  return (t.startsWith('{') && t.includes('"')) || (t.startsWith('[') && t.includes('{'));
}

function looksLikeHtml(s) {
  const t = s.trim().slice(0, 2000).toLowerCase();
  return (
    t.includes('<!doctype html') ||
    t.includes('<html') ||
    (t.includes('<div') && t.includes('</')) ||
    (t.includes('<body') && t.includes('<'))
  );
}

function looksLikeChatText(s) {
  const sample = s.slice(0, 5000);
  return (
    /\[\S[^\]]*\]\s+\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/.test(sample) ||
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+\S+/.test(sample)
  );
}

/**
 * 生成 Demo 数据（JSON 字符串）
 */
export function generateDemoData() {
  const myName = '我';
  const theirName = '小鹿';
  const now = Date.now();
  const DAY = 86400000;
  const messages = [];

  const myMsgs = [
    '在干嘛呢', '今天天气不错', '嗯嗯', '哈哈', '好的好的',
    '吃了吗', '周末有空吗', '好的', '早点休息哦', '早上好',
    '你也是', '辛苦了', '真不错', '笑死', '没问题',
    '到了吗', '等我一下', '懂了', '确实', '厉害了',
    '早点休息', '明天见', '收到', '可以可以', '加油',
    '想你了', '昨晚梦到你了', '你在哪', '想见你', '抱抱',
    '你今天好漂亮', '亲亲', '晚安宝贝', '想你啦', '在干嘛',
    '怎么还不睡', '睡不着想你', '陪我聊会', '抱抱你',
    '你好可爱', '想牵你的手', '你真好', '有你真好', '宝贝',
  ];

  const theirMsgs = [
    '刚醒', '在上班呢', '哈哈对啊', '好的', '吃了',
    '还没', '周末好像有空', '你也是', '早',
    '你说得对', '笑死我了', '太真实了', '好呀好呀', '知道了',
    '马上到', '你说', '原来如此', '确实是这样', '你厉害',
    '你也是哦', '明天见~', '好滴', '真棒', '加油~',
    '我也想你', '真的吗梦到我什么了', '刚到家', '想你了', '抱抱',
    '你今天也很帅', '亲亲~', '好的宝贝', '我也想你啦', '在发呆',
    '睡不着啊', '你陪我聊', '好呀', '抱抱你~',
    '你才可爱', '牵手手', '你最好了', '有你真好~', '亲爱的',
    '么么哒', '想你了啦', '你在干嘛呢', '好想见你', '今天开心吗',
    '晚安啦宝贝', '梦到你', '抱抱亲亲', '我也想你', '等你回来',
    '别太累了', '注意身体', '想你的时候', '你真的好温柔', '好喜欢你',
  ];

  const start = now - 340 * DAY;
  const totalMsgs = 300 + Math.floor(Math.random() * 200);

  for (let i = 0; i < totalMsgs; i++) {
    const isMe = Math.random() > 0.45;
    const pool = isMe ? myMsgs : theirMsgs;
    const content = pool[Math.floor(Math.random() * pool.length)];
    const progress = i / totalMsgs;
    const offset = start + progress * (now - start) + Math.random() * DAY * 2;
    const time = new Date(offset);
    if (content.includes('睡') || content.includes('梦')) {
      time.setHours(Math.random() > 0.5 ? 0 : 23, Math.floor(Math.random() * 60), 0, 0);
    }
    messages.push({
      time: time.toISOString(),
      is_send: isMe,
      sender: isMe ? myName : theirName,
      content,
    });
  }

  messages.sort((a, b) => new Date(a.time) - new Date(b.time));

  return JSON.stringify({ chat: theirName, messages }, null, 2);
}
