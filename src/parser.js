/**
 * 聊天记录解析器
 * 支持多种 JSON 格式 → 统一内部格式
 */

/**
 * 解析上传的 JSON 数据
 * @param {string} rawJson - 原始 JSON 字符串
 * @returns {{ messages: Array, participants: string[], contactName: string }}
 */
export function parseChatJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    throw new Error('JSON 格式错误，请检查文件内容');
  }

  let messages = [];

  if (Array.isArray(data)) {
    // 格式一：纯消息数组
    messages = data;
  } else if (data && Array.isArray(data.messages)) {
    // 格式二：{ chat: "...", messages: [...] }
    messages = data.messages;
  } else {
    throw new Error('未能识别的 JSON 结构：需要消息数组或 { messages: [...] }');
  }

  if (messages.length === 0) {
    throw new Error('聊天记录为空，未找到任何消息');
  }

  // 标准化每一条消息
  const normalized = messages.map(m => normalizeMessage(m));

  // 识别参与者
  const participants = recognizeParticipants(normalized);

  return {
    messages: normalized,
    participants,
    contactName: data?.chat || participants[1] || 'TA',
    totalRaw: messages.length,
  };
}

function normalizeMessage(msg) {
  // 时间解析
  let time = null;
  if (msg.time) {
    time = new Date(msg.time);
  } else if (msg.timestamp) {
    // 支持秒级或毫秒级时间戳
    const ts = Number(msg.timestamp);
    time = new Date(ts * (ts > 1e11 ? 1 : 1000));
  } else if (msg.CreateTime) {
    const ts = Number(msg.CreateTime);
    time = new Date(ts * (ts > 1e11 ? 1 : 1000));
  }
  if (!time || isNaN(time.getTime())) {
    time = new Date(0); // fallback
  }

  // 发送者
  let sender = msg.sender || msg.from_user || msg.talker || '未知';
  let isMe = false;
  if (msg.is_send !== undefined) {
    isMe = msg.is_send === true || msg.is_send === 1;
  } else if (msg.is_from_me !== undefined) {
    isMe = msg.is_from_me === true || msg.is_from_me === 1;
  } else if (msg.is_sender !== undefined) {
    // 0 = 对方, 1 = 我
    isMe = msg.is_sender === 1 || msg.is_sender === true;
  }

  // 内容
  let content = msg.content || msg.msg || msg.text || '';
  content = String(content).trim();

  // 只保留文本消息（type=1 或 type=text）
  const msgType = msg.type || msg.type_name || '';
  if (msgType !== '' && msgType !== 1 && msgType !== '1' && msgType !== 'text' && msgType !== 'Text') {
    // 非文本消息，只在有内容时保留
    if (content === '') return null;
  }

  if (content === '') return null;

  return { time, isMe, sender, content };
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

  // 按消息数排序
  const sorted = [...senders].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  // 找到"我"（isMe=true 的那个）
  const meSet = new Set();
  for (const m of messages) {
    if (m && m.isMe) meSet.add(m.sender);
  }

  // 如果只有一个 sender 标记为"我"，用那个
  if (meSet.size === 1) {
    const meName = [...meSet][0];
    return [meName, sorted.find(s => s !== meName) || 'TA'];
  }

  // 否则按消息量排序，取前两个
  return sorted.slice(0, 2);
}

/**
 * 生成 Demo 数据
 */
export function generateDemoData() {
  const myName = '我';
  const theirName = '小鹿';
  const now = Date.now();
  const DAY = 86400000;
  const messages = [];

  const myMsgs = [
    '在干嘛呢', '今天天气不错', '嗯嗯', '哈哈', '好的好的',
    '吃了吗', '周末有空吗', '好的', '晚安', '早上好',
    '你也是', '辛苦了', '真不错', '笑死', '没问题',
    '到了吗', '等我一下', '懂了', '确实', '厉害了',
    '早点休息', '明天见', '收到', '可以可以', '加油',
    '想你了', '昨晚梦到你了', '你在哪', '想见你', '抱抱',
    '你今天好漂亮', '亲亲', '晚安宝贝', '想你啦', '在干嘛',
    '怎么还不睡', '睡不着', '你睡了吗', '陪我聊会', '抱抱你',
    '你好可爱', '想牵你的手', '你真好', '有你真好', '宝贝',
  ];

  const theirMsgs = [
    '刚醒', '在上班呢', '哈哈对啊', '好的', '吃了',
    '还没', '周末好像有空', '晚安', '你也是', '早',
    '你说得对', '笑死我了', '太真实了', '好呀好呀', '知道了',
    '马上到', '你说', '原来如此', '确实是这样', '你厉害',
    '你也是哦', '明天见~', '好滴', '真棒', '加油~',
    '我也想你', '真的吗梦到我什么了', '刚到家', '想你了', '抱抱',
    '你今天也很帅', '亲亲~', '好的宝贝', '我也想你啦', '在发呆',
    '睡不着啊', '还没睡', '你陪我聊', '好呀', '抱抱你~',
    '你才可爱', '牵手手', '你最好了', '有你真好~', '亲爱的',
    '么么哒', '想你了啦', '你在干嘛呢', '好想见你', '今天开心吗',
    '晚安啦宝贝', '梦到你', '抱抱亲亲', '我也想你', '等你回来',
    '别太累了', '注意身体', '想你的时候', '你真的好温柔', '好喜欢你',
  ];

  // 生成 1 年左右的聊天记录，约 300 条
  const start = now - 340 * DAY;
  const totalMsgs = 300 + Math.floor(Math.random() * 200);

  for (let i = 0; i < totalMsgs; i++) {
    const isMe = Math.random() > 0.45;
    const pool = isMe ? myMsgs : theirMsgs;
    const content = pool[Math.floor(Math.random() * pool.length)];
    // 随机时间偏移，越近越密集
    const progress = i / totalMsgs;
    const offset = start + progress * (now - start) + Math.random() * DAY * 2;
    const time = new Date(offset);
    messages.push({
      time: time.toISOString(),
      is_send: isMe,
      sender: isMe ? myName : theirName,
      content,
    });
  }

  // 按时间排序
  messages.sort((a, b) => new Date(a.time) - new Date(b.time));

  return JSON.stringify({ chat: theirName, messages }, null, 2);
}
