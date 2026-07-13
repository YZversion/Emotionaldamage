/**
 * 暧昧探测 & 关系画像分析引擎
 * 纯前端计算，本地分析不上传聊天原文
 */

// ========== 信号词典 ==========

const SIGNAL_CATEGORIES = {
  intimateName: {
    label: '亲昵称呼',
    emoji: '💕',
    // 较长词优先匹配（见 matchKeywords）
    keywords: [
      '我的心肝', '我的男孩', '我的女孩', '小笨蛋', '小宝贝', '小可爱', '小坏蛋', '小祖宗',
      '亲爱的', '老公', '老婆', '宝贝', '宝宝', '甜心', '乖乖', '心心',
      'honey', 'darling', 'babe',
      '笨蛋', '傻瓜', '憨憨', '呆瓜', '傻猪', '坏蛋', '小猪',
      'baby',
    ],
  },
  missing: {
    label: '想念信号',
    emoji: '🥺',
    keywords: [
      '什么时候能见你', '想见你一面', '你有没有想我', '有没有想我', '想我了没',
      '想你想你', '想死你了', '好想见你', '想见你了', '想你在干嘛',
      '好想你', '想见你', '想抱你', '想你了啦', '想你了', '想你',
      '梦到你了', '梦见你', '梦到你',
      'missing you', 'miss you', 'miss u',
    ],
  },
  lateNight: {
    label: '深夜亲密',
    emoji: '🌙',
    // 仅统计深夜时段（23:00–05:00），且去掉泛用寒暄词
    requireLateNightHour: true,
    keywords: [
      '想你想得睡不着', '睡不着想你', '陪你熬夜', '熬夜陪你', '怎么还不睡',
      '不舍得睡', '陪我睡', '一起睡', '哄我睡', '哄睡',
      '睡不着', '失眠', '还不睡',
      '梦到你', '梦见你',
    ],
  },
  flirtyAction: {
    label: '暧昧动作',
    emoji: '🫶',
    keywords: [
      '亲亲抱抱', '抱抱亲亲', '要抱抱', '抱抱你', '亲亲你', '牵手手',
      '摸摸头', '抱一下', '亲一下', '搂着你', '抱紧',
      '抱抱', '亲亲', '牵手', '抱你', '亲你', '贴贴', '蹭蹭', '举高高',
      '牵着', '拥抱', '么么哒', '么么', '揉揉', '捏捏', '戳戳', '背你',
    ],
  },
  flirtyEmoji: {
    label: '暧昧表情',
    emoji: '😘',
    isEmoji: true,
    // 去掉普通彩色心，只保留明确亲昵/亲吻类
    emojiSet: new Set([
      '😘', '😙', '😗', '😚', '💋', '💕', '💗', '💖',
      '💘', '💝', '❤️‍🔥', '💓', '💞', '💑', '😍', '🥰', '😻',
      '💌', '💏', '🫶',
    ]),
  },
};

function isLateNightHour(time) {
  if (!(time instanceof Date) || isNaN(time.getTime())) return false;
  const h = time.getHours();
  return h >= 23 || h < 5;
}

function matchKeywords(content, keywords) {
  // 长词优先，减少短词误伤（仍为子串匹配，娱乐向）
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    if (content.includes(kw)) return true;
  }
  return false;
}

function messageHitsCategory(content, time, config) {
  if (config.requireLateNightHour && !isLateNightHour(time)) {
    return false;
  }
  if (config.isEmoji) {
    for (const emoji of config.emojiSet) {
      if (content.includes(emoji)) return true;
    }
    return false;
  }
  return matchKeywords(content, config.keywords);
}

// ========== 画像标签生成 ==========

function generateTags(result, signalTotals) {
  const tags = [];
  const { bilateral } = result;

  const totalSig = Object.values(signalTotals).reduce((s, v) => s + v, 0);
  const msgCount = result.totalMessages;

  if (totalSig === 0) {
    tags.push({ text: '💤 一片空白', type: 'neutral' });
    return tags;
  }

  const density = totalSig / msgCount;

  if (density > 0.15) {
    tags.push({ text: '🔥 浓度超标', type: 'fire' });
  } else if (density > 0.08) {
    tags.push({ text: '🌶️ 有点意思', type: 'spicy' });
  } else {
    tags.push({ text: '🌱 细水长流', type: 'calm' });
  }

  const ratio = bilateral.themFlirtRatio / (bilateral.meFlirtRatio || 0.01);
  if (Math.abs(bilateral.meFlirtRatio - bilateral.themFlirtRatio) < 3) {
    tags.push({ text: '🤝 双向奔赴', type: 'mutual' });
  } else if (ratio > 1.5) {
    tags.push({ text: '💗 TA 更主动', type: 'them' });
  } else if (ratio < 0.67) {
    tags.push({ text: '💪 你更主动', type: 'me' });
  }

  const sorted = Object.entries(signalTotals).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const top = sorted[0];
    if (top[0] === 'intimateName' && top[1] > 5) {
      tags.push({ text: '💞 称呼暧昧', type: 'intimate' });
    }
    if (top[0] === 'missing' && top[1] > 3) {
      tags.push({ text: '🥺 相思病', type: 'miss' });
    }
    if (top[0] === 'lateNight' && top[1] > 3) {
      tags.push({ text: '🌙 深夜党', type: 'night' });
    }
    if (top[0] === 'flirtyAction' && top[1] > 5) {
      tags.push({ text: '🫶 肢体语言丰富', type: 'touch' });
    }
    if (top[0] === 'flirtyEmoji' && top[1] > 15) {
      tags.push({ text: '😘 表情包恋爱', type: 'emoji' });
    }
  }

  return tags;
}

// ========== 主分析函数 ==========

export function analyze(messages, contactName) {
  // 至少要有内容；时间缺失的消息仍参与信号统计，但不进时间线
  const withContent = messages.filter(m => m && m.content);
  if (withContent.length < 10) {
    throw new Error('有效消息太少（少于 10 条），请检查文件或换一个联系人');
  }

  const timed = withContent.filter(m => m.time instanceof Date && !isNaN(m.time.getTime()));
  const valid = timed.length >= 10 ? timed : withContent;

  if (timed.length < 10 && timed.length > 0) {
    // 有部分有效时间：信号用全部有内容的，排序/时间线只用 timed
  }

  const myName = valid.find(m => m.isMe)?.sender || '我';
  const theirName = contactName || valid.find(m => !m.isMe)?.sender || 'TA';

  const ordered = [...valid].sort((a, b) => {
    const ta = a.time instanceof Date ? a.time.getTime() : 0;
    const tb = b.time instanceof Date ? b.time.getTime() : 0;
    return ta - tb;
  });

  // 信号检测：对全部有内容消息（含无时间戳的）
  const signalSource = withContent;
  const signals = {
    intimateName: { me: 0, them: 0, quotes: [] },
    missing: { me: 0, them: 0, quotes: [] },
    lateNight: { me: 0, them: 0, quotes: [] },
    flirtyAction: { me: 0, them: 0, quotes: [] },
    flirtyEmoji: { me: 0, them: 0, quotes: [] },
  };

  const myTotalChars = { me: 0, them: 0 };
  const myTotalMsgs = { me: 0, them: 0 };

  for (const m of signalSource) {
    const who = m.isMe ? 'me' : 'them';
    myTotalMsgs[who]++;
    myTotalChars[who] += m.content.length;

    const content = m.content;

    for (const [cat, config] of Object.entries(SIGNAL_CATEGORIES)) {
      if (!messageHitsCategory(content, m.time, config)) continue;

      signals[cat][who]++;
      signals[cat].quotes.push({
        text: content.length > 60 ? content.slice(0, 60) + '...' : content,
        sender: m.sender,
        isMe: m.isMe,
        date: formatDate(m.time),
        category: cat,
      });
    }
  }

  const signalTotals = {};
  let rawScore = 0;
  const weights = {
    intimateName: 6,
    missing: 5,
    lateNight: 5,
    flirtyAction: 5,
    flirtyEmoji: 1, // 降权：单靠表情不再轻易拉高总分
  };

  for (const [cat, s] of Object.entries(signals)) {
    const total = s.me + s.them;
    signalTotals[cat] = total;
    rawScore += total * (weights[cat] || 3);
  }

  const totalMsgs = myTotalMsgs.me + myTotalMsgs.them;
  const densityFactor = Math.min(rawScore / (totalMsgs * 0.5), 1.5);
  let flirtScore = Math.min(Math.round(rawScore * densityFactor * 0.5), 100);

  if (flirtScore < 5 && rawScore > 0) flirtScore = 5 + Math.round(rawScore * 0.3);

  let flirtGrade, gradeColor;
  if (flirtScore >= 85) { flirtGrade = 'S'; gradeColor = '#ffd700'; }
  else if (flirtScore >= 70) { flirtGrade = 'A'; gradeColor = '#ff4d7d'; }
  else if (flirtScore >= 50) { flirtGrade = 'B'; gradeColor = '#a78bfa'; }
  else if (flirtScore >= 30) { flirtGrade = 'C'; gradeColor = '#60a5fa'; }
  else { flirtGrade = 'D'; gradeColor = '#9ca3af'; }

  const meFlirtCount = Object.values(signals).reduce((s, v) => s + v.me, 0);
  const themFlirtCount = Object.values(signals).reduce((s, v) => s + v.them, 0);
  const meFlirtRatio = myTotalMsgs.me > 0 ? (meFlirtCount / myTotalMsgs.me) * 100 : 0;
  const themFlirtRatio = myTotalMsgs.them > 0 ? (themFlirtCount / myTotalMsgs.them) * 100 : 0;

  const initiations = { me: 0, them: 0 };
  let lastDate = '';
  for (const m of ordered) {
    if (!(m.time instanceof Date)) continue;
    const d = formatDate(m.time);
    if (d !== lastDate) {
      if (m.isMe) initiations.me++;
      else initiations.them++;
      lastDate = d;
    }
  }

  const initTotal = initiations.me + initiations.them;
  const meInitPct = initTotal > 0 ? Math.round((initiations.me / initTotal) * 100) : 50;

  let bilateralVerdict = '';
  const diff = themFlirtRatio - meFlirtRatio;
  if (Math.abs(diff) < 2) {
    bilateralVerdict = '双向奔赴，势均力敌';
  } else if (diff > 0) {
    bilateralVerdict = 'TA 比你更会撩，但你也在回应';
  } else {
    bilateralVerdict = '你更主动出击，TA 在慢慢回应';
  }

  const bilateral = {
    meFlirtRatio: Math.round(meFlirtRatio * 10) / 10,
    themFlirtRatio: Math.round(themFlirtRatio * 10) / 10,
    meFlirtCount,
    themFlirtCount,
    meInitPct,
    themInitPct: 100 - meInitPct,
    verdict: bilateralVerdict,
  };

  // 时间线：只用有有效时间的消息
  const timelineMap = {};
  for (const m of timed) {
    const key = `${m.time.getFullYear()}-${String(m.time.getMonth() + 1).padStart(2, '0')}`;
    if (!timelineMap[key]) timelineMap[key] = { me: 0, them: 0 };
    let isFlirty = false;
    for (const config of Object.values(SIGNAL_CATEGORIES)) {
      if (messageHitsCategory(m.content, m.time, config)) {
        isFlirty = true;
        break;
      }
    }
    if (isFlirty) {
      if (m.isMe) timelineMap[key].me++;
      else timelineMap[key].them++;
    }
  }
  const timeline = Object.entries(timelineMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({ month, ...data }));

  const allQuotes = Object.values(signals).flatMap(s => s.quotes);
  const quoteScore = {};
  for (const q of allQuotes) {
    const key = q.text;
    if (!quoteScore[key]) {
      quoteScore[key] = { ...q, score: 0, categories: new Set() };
    }
    quoteScore[key].score++;
    quoteScore[key].categories.add(q.category);
  }
  const topQuotes = Object.values(quoteScore)
    .map(q => ({ ...q, score: q.score + q.categories.size * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(q => ({
      text: q.text,
      sender: q.sender,
      isMe: q.isMe,
      date: q.date,
      categories: [...q.categories],
    }));

  const tags = generateTags(
    { totalMessages: totalMsgs, bilateral },
    signalTotals
  );

  const dateSource = timed.length > 0 ? [...timed].sort((a, b) => a.time - b.time) : [];
  const dateRange = dateSource.length > 0
    ? { start: formatDate(dateSource[0].time), end: formatDate(dateSource[dateSource.length - 1].time) }
    : { start: '未知', end: '未知' };

  return {
    myName,
    theirName,
    totalMessages: totalMsgs,
    totalWords: myTotalChars.me + myTotalChars.them,
    dateRange,
    flirtScore,
    flirtGrade,
    gradeColor,
    signalBreakdown: signals,
    signalTotals,
    bilateral,
    topQuotes,
    tags,
    timeline,
  };
}

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
