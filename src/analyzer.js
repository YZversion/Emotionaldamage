/**
 * 暧昧探测 & 关系画像分析引擎
 * 纯前端计算，数据不上传
 */

// ========== 信号词典 ==========

const SIGNAL_CATEGORIES = {
  intimateName: {
    label: '亲昵称呼',
    emoji: '💕',
    keywords: [
      '老公', '老婆', '宝贝', '亲爱的', '宝宝', '笨蛋', '傻瓜',
      '小猪', '小可爱', '小笨蛋', '小宝贝', '亲爱的', 'honey',
      'darling', 'baby', 'babe', '甜心', '心心', '乖乖',
      '我的男孩', '我的女孩', '我的心肝', '小祖宗',
      '憨憨', '呆瓜', '傻猪', '坏蛋', '小坏蛋',
    ],
  },
  missing: {
    label: '想念信号',
    emoji: '🥺',
    keywords: [
      '想你', '想你了', '好想你', '想见你', '想抱你',
      'miss you', 'miss u', 'missing you',
      '梦到你', '梦见你', '梦到你了', '想你了啦',
      '想你想你', '想死你了', '好想见你', '想见你了',
      '什么时候能见你', '想见你一面', '想你在干嘛',
      '你有没有想我', '想我了没', '有没有想我',
    ],
  },
  lateNight: {
    label: '深夜亲密',
    emoji: '🌙',
    keywords: [
      '陪我睡', '睡不着', '失眠', '你睡了吗', '睡了吗',
      '睡不着想你', '想你想得睡不着', '晚安', '晚安安',
      '梦到你', '梦见你', '熬夜', '还不睡', '怎么还不睡',
      '陪你熬夜', '一起睡', '哄我睡', '哄睡',
      '睡了没', '还没睡', '熬夜陪你', '不舍得睡',
    ],
  },
  flirtyAction: {
    label: '暧昧动作',
    emoji: '🫶',
    keywords: [
      '抱抱', '亲亲', '牵手', '抱你', '亲你', '摸摸头',
      '牵手手', '贴贴', '蹭蹭', '举高高', '要抱抱',
      '抱一下', '亲一下', '抱抱你', '亲亲你', '背你',
      '搂着你', '牵着', '拥抱', '亲亲抱抱', '抱抱亲亲',
      '揉揉', '捏捏', '戳戳', '抱紧', '抱抱你',
      '拍拍', '摸摸', '亲亲你', '么么', '么么哒',
    ],
  },
  flirtyEmoji: {
    label: '暧昧表情',
    emoji: '😘',
    // 用正则匹配 emoji 字符
    isEmoji: true,
    emojiSet: new Set([
      '😘', '😙', '😗', '😚', '💋', '💕', '💗', '💖',
      '💘', '💝', '❤️', '🧡', '💛', '💚', '💙', '💜',
      '🩷', '❤️‍🔥', '💓', '💞', '💑', '😍', '🥰', '😻',
      '💌', '💏', '🫶', '🩵', '🩶', '🤍',
    ]),
  },
};

// ========== 画像标签生成 ==========

function generateTags(result, signalTotals) {
  const tags = [];
  const { bilateral } = result;

  // 总体浓度判断
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

  // 双向性
  const ratio = bilateral.themFlirtRatio / (bilateral.meFlirtRatio || 0.01);
  if (Math.abs(bilateral.meFlirtRatio - bilateral.themFlirtRatio) < 3) {
    tags.push({ text: '🤝 双向奔赴', type: 'mutual' });
  } else if (ratio > 1.5) {
    tags.push({ text: '💗 TA 更主动', type: 'them' });
  } else if (ratio < 0.67) {
    tags.push({ text: '💪 你更主动', type: 'me' });
  }

  // 特定信号突出
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
  // 过滤掉无效消息
  const valid = messages.filter(m => m && m.content && m.time);
  if (valid.length < 10) {
    throw new Error('有效消息太少（少于 10 条），请检查文件或换一个联系人');
  }

  const myName = valid.find(m => m.isMe)?.sender || '我';
  const theirName = contactName || valid.find(m => !m.isMe)?.sender || 'TA';

  // 按时间排序
  valid.sort((a, b) => a.time - b.time);

  // ===== 信号检测 =====
  const signals = {
    intimateName: { me: 0, them: 0, quotes: [] },
    missing: { me: 0, them: 0, quotes: [] },
    lateNight: { me: 0, them: 0, quotes: [] },
    flirtyAction: { me: 0, them: 0, quotes: [] },
    flirtyEmoji: { me: 0, them: 0, quotes: [] },
  };

  const myTotalChars = { me: 0, them: 0 }; // 总字数（用于比例）
  const myTotalMsgs = { me: 0, them: 0 };

  for (const m of valid) {
    const who = m.isMe ? 'me' : 'them';
    myTotalMsgs[who]++;
    myTotalChars[who] += m.content.length;

    const content = m.content;

    for (const [cat, config] of Object.entries(SIGNAL_CATEGORIES)) {
      let hit = false;

      if (config.isEmoji) {
        // 检测 emoji
        for (const emoji of config.emojiSet) {
          if (content.includes(emoji)) {
            hit = true;
            break;
          }
        }
      } else {
        // 关键词检测
        for (const kw of config.keywords) {
          if (content.includes(kw)) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
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
  }

  // ===== 总分计算 =====
  const signalTotals = {};
  let rawScore = 0;
  const weights = {
    intimateName: 6,
    missing: 5,
    lateNight: 4,
    flirtyAction: 5,
    flirtyEmoji: 3,
  };

  for (const [cat, s] of Object.entries(signals)) {
    const total = s.me + s.them;
    signalTotals[cat] = total;
    rawScore += total * (weights[cat] || 3);
  }

  // 加上密度因子
  const totalMsgs = myTotalMsgs.me + myTotalMsgs.them;
  const densityFactor = Math.min(rawScore / (totalMsgs * 0.5), 1.5);

  // 归一化到 0-100，加入密度调整
  let flirtScore = Math.min(Math.round(rawScore * densityFactor * 0.5), 100);

  // 确保分数合理分布
  if (flirtScore < 5 && rawScore > 0) flirtScore = 5 + Math.round(rawScore * 0.3);

  // 等级
  let flirtGrade, gradeColor;
  if (flirtScore >= 85) { flirtGrade = 'S'; gradeColor = '#ffd700'; }
  else if (flirtScore >= 70) { flirtGrade = 'A'; gradeColor = '#ff4d7d'; }
  else if (flirtScore >= 50) { flirtGrade = 'B'; gradeColor = '#a78bfa'; }
  else if (flirtScore >= 30) { flirtGrade = 'C'; gradeColor = '#60a5fa'; }
  else { flirtGrade = 'D'; gradeColor = '#9ca3af'; }

  // ===== 双向对比 =====
  const meFlirtCount = Object.values(signals).reduce((s, v) => s + v.me, 0);
  const themFlirtCount = Object.values(signals).reduce((s, v) => s + v.them, 0);
  const meFlirtRatio = myTotalMsgs.me > 0 ? (meFlirtCount / myTotalMsgs.me) * 100 : 0;
  const themFlirtRatio = myTotalMsgs.them > 0 ? (themFlirtCount / myTotalMsgs.them) * 100 : 0;

  // 主动开场分析（简化版：每天第一次消息是谁发的）
  const initiations = { me: 0, them: 0 };
  let lastDate = '';
  for (const m of valid) {
    const d = formatDate(m.time);
    if (d !== lastDate) {
      if (m.isMe) initiations.me++;
      else initiations.them++;
      lastDate = d;
    }
  }

  const meInitPct = totalMsgs > 0 ? Math.round((initiations.me / (initiations.me + initiations.them)) * 100) : 50;

  // 判定
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

  // ===== 时间线（按月聚合） =====
  const timelineMap = {};
  for (const m of valid) {
    const key = `${m.time.getFullYear()}-${String(m.time.getMonth() + 1).padStart(2, '0')}`;
    if (!timelineMap[key]) timelineMap[key] = { me: 0, them: 0 };
    // 检测该消息是否有暧昧信号
    const content = m.content;
    let isFlirty = false;
    for (const [cat, config] of Object.entries(SIGNAL_CATEGORIES)) {
      if (config.isEmoji) {
        for (const emoji of config.emojiSet) {
          if (content.includes(emoji)) { isFlirty = true; break; }
        }
      } else {
        for (const kw of config.keywords) {
          if (content.includes(kw)) { isFlirty = true; break; }
        }
      }
      if (isFlirty) break;
    }
    if (isFlirty) {
      if (m.isMe) timelineMap[key].me++;
      else timelineMap[key].them++;
    }
  }
  const timeline = Object.entries(timelineMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({ month, ...data }));

  // ===== Top 暧昧语录 =====
  const allQuotes = Object.values(signals).flatMap(s => s.quotes);
  // 去重 & 评分（按信号种类数加权）
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

  // ===== 画像标签 =====
  const tags = generateTags(
    { totalMessages: totalMsgs, bilateral },
    signalTotals
  );

  // ===== 日期范围 =====
  const dateRange = {
    start: formatDate(valid[0].time),
    end: formatDate(valid[valid.length - 1].time),
  };

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
