/**
 * AI 顾问模块
 * 基于聊天分析结果，提供智能问答（通过 OpenRouter API）
 * 数据不上传第三方，仅发送分析摘要和用户问题
 */

const API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// 默认免费模型，用户可配置更好的模型
const DEFAULT_MODEL = 'mistralai/mistral-7b-instruct';

// ====== 构建系统提示 ======
function buildSystemPrompt(result) {
  const {
    myName, theirName, totalMessages, totalWords,
    dateRange, flirtScore, flirtGrade,
    signalBreakdown, bilateral, topQuotes, tags,
  } = result;

  // 信号汇总
  const signalSummary = Object.entries(signalBreakdown).map(([cat, data]) => {
    const labels = {
      intimateName: '亲昵称呼',
      missing: '想念信号',
      lateNight: '深夜亲密',
      flirtyAction: '暧昧动作',
      flirtyEmoji: '暧昧表情',
    };
    return `${labels[cat] || cat}: 我 ${data.me} 次 / TA ${data.them} 次`;
  }).join('\n');

  // Top 暧昧语录摘要
  const quoteSummary = topQuotes.slice(0, 5).map(q =>
    `[${q.isMe ? myName : theirName}] ${q.text}`
  ).join('\n');

  // 画像标签
  const tagText = tags.map(t => t.text).join(' ');

  return `你是一位专业的情感分析顾问，性格温暖、有洞察力。你会根据用户导入的聊天分析结果为用户提供见解、回答问题和给出建议。

以下是本次聊天分析的完整报告：

===== 基本信息 =====
- 你的代号: ${myName}
- 对方: ${theirName}
- 消息总数: ${totalMessages} 条
- 总字数: ${totalWords} 字
- 时间跨度: ${dateRange.start} ~ ${dateRange.end}
- 暧昧指数: ${flirtScore}/100 (${flirtGrade}级)
- 画像标签: ${tagText}

===== 双向对比 =====
- 你的暧昧率: ${bilateral.meFlirtRatio}%
- 对方暧昧率: ${bilateral.themFlirtRatio}%
- 判定: ${bilateral.verdict}
- 你主动开启对话: ${bilateral.meInitPct}%

===== 各维度信号 =====
${signalSummary}

===== Top 暧昧语录 =====
${quoteSummary}

===== 行为准则 =====
1. 回答要温暖、有共情力，偶尔带一点幽默
2. 基于分析报告给出具体洞察，不要空泛
3. 如果用户问建议，要给出可操作的具体建议
4. 不要评价分析报告的准确性，基于报告数据说话
5. 回答简洁但有深度，控制在 3-5 句话
6. 使用中文回答`;
}

// ====== 调用 API ======
async function callLLM(messages, apiKey, onChunk) {
  const headers = {
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Emotional Damage',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = {
    model: apiKey ? 'openai/gpt-4o-mini' : DEFAULT_MODEL,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errText;
      } catch {
        errMsg = errText;
      }
      throw new Error(`API 请求失败 (${response.status}): ${errMsg}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) onChunk(content);
        } catch {
          // 跳过解析失败的行
        }
      }
    }
  } catch (err) {
    throw err;
  }
}

// ====== 渲染聊天 UI ======
export function initAIChat(container, result) {
  // 构建系统提示
  const systemPrompt = buildSystemPrompt(result);

  // 状态
  let convHistory = [
    { role: 'system', content: systemPrompt },
    {
      role: 'assistant',
      content: `你好！我是你的 AI 情感顾问 💕\n\n我已经分析了你们之间的聊天记录，可以为你解答关于这段关系的任何问题。比如：\n\n- "我们之间算什么关系？"\n- "TA 对我有意思吗？"\n- "我该怎么推进关系？"\n- "这段聊天有什么隐藏信号？"\n\n有什么想聊的吗？`,
    },
  ];
  let apiKey = localStorage.getItem('aiChatApiKey') || '';
  let isStreaming = false;

  // ===== 渲染 =====
  container.innerHTML = `
    <div class="ai-chat">
      <div class="ai-chat-header" id="aiChatToggle">
        <span class="ai-chat-title">
          <span class="ai-chat-icon">🤖</span>
          AI 情感顾问
        </span>
        <button class="ai-chat-toggle-btn" id="aiChatCollapseBtn">−</button>
      </div>
      <div class="ai-chat-body" id="aiChatBody">
        <div class="ai-chat-messages" id="aiChatMessages"></div>
        <div class="ai-chat-input-row">
          <textarea
            class="ai-chat-input"
            id="aiChatInput"
            placeholder="输入你的问题..."
            rows="1"
          ></textarea>
          <button class="ai-chat-send" id="aiChatSend">发送</button>
        </div>
        <div class="ai-chat-footer">
          <div class="ai-chat-apikey-row">
            <input
              class="ai-chat-apikey"
              id="aiChatApiKey"
              type="password"
              placeholder="OpenRouter API Key（留空使用免费模型）"
              value="${apiKey}"
            />
            <button class="ai-chat-apikey-save" id="aiChatApiKeySave">保存</button>
          </div>
          <div class="ai-chat-model-info">默认模型: ${apiKey ? 'GPT-4o-mini' : 'Mistral 7B (免费)'}</div>
        </div>
      </div>
    </div>
  `;

  const messagesEl = container.querySelector('#aiChatMessages');
  const inputEl = container.querySelector('#aiChatInput');
  const sendBtn = container.querySelector('#aiChatSend');
  const toggleBtn = container.querySelector('#aiChatCollapseBtn');
  const bodyEl = container.querySelector('#aiChatBody');
  const apiKeyInput = container.querySelector('#aiChatApiKey');
  const apiKeySaveBtn = container.querySelector('#aiChatApiKeySave');

  // 渲染已有消息
  function renderMessages() {
    messagesEl.innerHTML = convHistory
      .filter(m => m.role !== 'system')
      .map(m => {
        const isUser = m.role === 'user';
        const cls = isUser ? 'user' : 'assistant';
        return `<div class="ai-chat-msg ${cls}">${m.content.replace(/\n/g, '<br>')}</div>`;
      })
      .join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  renderMessages();

  // 发送消息
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    // 添加用户消息
    convHistory.push({ role: 'user', content: text });
    renderMessages();

    // 添加占位助手消息
    convHistory.push({ role: 'assistant', content: '' });
    const placeholderDiv = document.createElement('div');
    placeholderDiv.className = 'ai-chat-msg assistant';
    placeholderDiv.innerHTML = '<span class="ai-chat-typing">思考中...</span>';
    messagesEl.appendChild(placeholderDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    isStreaming = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
      const apiMessages = convHistory.filter(m => m.role !== 'system');
      const systemMsg = convHistory.find(m => m.role === 'system');

      await callLLM(
        [systemMsg, ...apiMessages.slice(0, -1)], // exclude the empty assistant message
        apiKey,
        (chunk) => {
          // 更新 convHistory
          const last = convHistory[convHistory.length - 1];
          if (last && last.role === 'assistant') {
            last.content += chunk;
          }
          // 更新 DOM
          placeholderDiv.innerHTML = last.content.replace(/\n/g, '<br>');
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      );
    } catch (err) {
      // 出错时显示错误信息
      const errorMsg = err.message.includes('401') || err.message.includes('403')
        ? '⚠️ API Key 无效，请在下方输入有效的 OpenRouter API Key，或留空使用免费模型。'
        : `⚠️ ${err.message}`;

      // 移除空的助手消息
      if (convHistory[convHistory.length - 1]?.content === '') {
        convHistory.pop();
      }
      placeholderDiv.innerHTML = errorMsg;
      placeholderDiv.className = 'ai-chat-msg assistant error';
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
      sendBtn.textContent = '发送';
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 自动调整输入框高度
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // 折叠/展开
  let isCollapsed = false;
  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    bodyEl.style.display = isCollapsed ? 'none' : '';
    toggleBtn.textContent = isCollapsed ? '+' : '−';
  });

  // API Key 保存
  apiKeySaveBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    apiKey = val;
    localStorage.setItem('aiChatApiKey', val);
    apiKeySaveBtn.textContent = '✓ 已保存';
    setTimeout(() => { apiKeySaveBtn.textContent = '保存'; }, 2000);
    // 更新 model info
    const modelInfo = container.querySelector('.ai-chat-model-info');
    if (modelInfo) {
      modelInfo.textContent = `默认模型: ${apiKey ? 'GPT-4o-mini' : 'Mistral 7B (免费)'}`;
    }
  });
}
