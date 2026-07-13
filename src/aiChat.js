/**
 * AI 顾问模块
 * 调用 OpenRouter：会上传分析摘要与脱敏语录（非完整聊天记录）
 * 需要 API Key；本地分析与卡片导出不依赖本模块
 */

const API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// 有 Key 时默认走免费路由；用户可在代码外自行换模型
const FREE_MODEL = 'openrouter/free';
const PAID_DEFAULT_MODEL = 'openai/gpt-4o-mini';

function setTextWithLineBreaks(element, value) {
  const lines = String(value).split('\n');
  element.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) element.appendChild(document.createElement('br'));
    element.appendChild(document.createTextNode(line));
  });
}

/** 脱敏：不把真实昵称发给模型 */
function buildSystemPrompt(result) {
  const {
    totalMessages, totalWords,
    dateRange, flirtScore, flirtGrade,
    signalBreakdown, bilateral, topQuotes, tags,
  } = result;

  const signalSummary = Object.entries(signalBreakdown).map(([cat, data]) => {
    const labels = {
      intimateName: '亲昵称呼',
      missing: '想念信号',
      lateNight: '深夜亲密',
      flirtyAction: '暧昧动作',
      flirtyEmoji: '暧昧表情',
    };
    return `${labels[cat] || cat}: 你 ${data.me} 次 / TA ${data.them} 次`;
  }).join('\n');

  // 语录：保留文本供顾问引用，但隐去真实 sender 名
  const quoteSummary = topQuotes.slice(0, 5).map(q =>
    `[${q.isMe ? '你' : 'TA'}] ${q.text}`
  ).join('\n');

  const tagText = tags.map(t => t.text).join(' ');

  return `你是一位专业的情感分析顾问，性格温暖、有洞察力。你会根据用户导入的聊天分析结果为用户提供见解、回答问题和给出建议。

以下是本次聊天分析的报告（昵称已脱敏为「你 / TA」）：

===== 基本信息 =====
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

===== Top 暧昧语录（摘要，非完整记录）=====
${quoteSummary}

===== 行为准则 =====
1. 回答要温暖、有共情力，偶尔带一点幽默
2. 基于分析报告给出具体洞察，不要空泛
3. 如果用户问建议，要给出可操作的具体建议
4. 不要评价分析报告的准确性，基于报告数据说话
5. 回答简洁但有深度，控制在 3-5 句话
6. 使用中文回答
7. 不要索要或猜测用户真实姓名`;
}

async function callLLM(messages, apiKey, model, onChunk) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Emotional Damage',
  };

  const body = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };

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
}

export function initAIChat(container, result) {
  const systemPrompt = buildSystemPrompt(result);

  let convHistory = [
    { role: 'system', content: systemPrompt },
    {
      role: 'assistant',
      content: `你好！我是 AI 情感顾问。\n\n使用前请注意：提问会把「分析摘要 + 若干条脱敏语录」发送到 OpenRouter，不是纯本地。\n需要先填写 API Key 才能对话。\n\n可以问例如：\n- "我们之间算什么关系？"\n- "TA 对我有意思吗？"\n- "我该怎么推进关系？"`,
    },
  ];
  let apiKey = localStorage.getItem('aiChatApiKey') || '';
  let usePaidModel = localStorage.getItem('aiChatUsePaid') === '1';
  let isStreaming = false;
  let isCollapsed = true; // 默认折叠，避免误触出网

  container.innerHTML = `
    <div class="ai-chat">
      <div class="ai-chat-header" id="aiChatToggle">
        <span class="ai-chat-title">
          <span class="ai-chat-icon">🤖</span>
          AI 情感顾问（可选·需联网）
        </span>
        <button class="ai-chat-toggle-btn" id="aiChatCollapseBtn">+</button>
      </div>
      <div class="ai-chat-body" id="aiChatBody" style="display:none">
        <div class="ai-chat-privacy">
          ⚠️ 本功能会上传分析摘要与 Top 语录到 OpenRouter；本地评分与分享卡不依赖 AI。
        </div>
        <div class="ai-chat-messages" id="aiChatMessages"></div>
        <div class="ai-chat-input-row">
          <textarea
            class="ai-chat-input"
            id="aiChatInput"
            placeholder="输入你的问题（需先填写 API Key）..."
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
              placeholder="OpenRouter API Key（必填）"
            />
            <button class="ai-chat-apikey-save" id="aiChatApiKeySave">保存</button>
          </div>
          <label class="ai-chat-model-toggle">
            <input type="checkbox" id="aiChatUsePaid" ${usePaidModel ? 'checked' : ''} />
            使用 GPT-4o-mini（否则用 openrouter/free）
          </label>
          <div class="ai-chat-model-info" id="aiChatModelInfo"></div>
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
  const usePaidEl = container.querySelector('#aiChatUsePaid');
  const modelInfo = container.querySelector('#aiChatModelInfo');
  apiKeyInput.value = apiKey;

  function currentModel() {
    return usePaidModel ? PAID_DEFAULT_MODEL : FREE_MODEL;
  }

  function refreshModelInfo() {
    modelInfo.textContent = apiKey
      ? `当前模型: ${currentModel()}（Key 已保存）`
      : '请先保存 OpenRouter API Key；免费模型也需要 Key';
  }
  refreshModelInfo();

  function renderMessages() {
    const fragment = document.createDocumentFragment();
    convHistory
      .filter(message => message.role !== 'system')
      .forEach(message => {
        const element = document.createElement('div');
        element.className = `ai-chat-msg ${message.role === 'user' ? 'user' : 'assistant'}`;
        setTextWithLineBreaks(element, message.content);
        fragment.appendChild(element);
      });
    messagesEl.replaceChildren(fragment);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  renderMessages();

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    if (!apiKey) {
      const tip = document.createElement('div');
      tip.className = 'ai-chat-msg assistant error';
      tip.textContent = '⚠️ 请先在下方填写并保存 OpenRouter API Key。免费额度也需要注册后创建 Key。';
      messagesEl.appendChild(tip);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    inputEl.value = '';
    inputEl.style.height = 'auto';

    convHistory.push({ role: 'user', content: text });
    renderMessages();

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
        [systemMsg, ...apiMessages.slice(0, -1)],
        apiKey,
        currentModel(),
        (chunk) => {
          const last = convHistory[convHistory.length - 1];
          if (last && last.role === 'assistant') {
            last.content += chunk;
          }
          setTextWithLineBreaks(placeholderDiv, last.content);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      );
    } catch (err) {
      const errorMsg = err.message.includes('401') || err.message.includes('403')
        ? '⚠️ API Key 无效或无权限，请检查 OpenRouter Key。'
        : `⚠️ ${err.message}`;

      if (convHistory[convHistory.length - 1]?.content === '') {
        convHistory.pop();
      }
      placeholderDiv.textContent = errorMsg;
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

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    bodyEl.style.display = isCollapsed ? 'none' : '';
    toggleBtn.textContent = isCollapsed ? '+' : '−';
  });

  apiKeySaveBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    apiKey = val;
    localStorage.setItem('aiChatApiKey', val);
    apiKeySaveBtn.textContent = '✓ 已保存';
    setTimeout(() => { apiKeySaveBtn.textContent = '保存'; }, 2000);
    refreshModelInfo();
  });

  usePaidEl.addEventListener('change', () => {
    usePaidModel = usePaidEl.checked;
    localStorage.setItem('aiChatUsePaid', usePaidModel ? '1' : '0');
    refreshModelInfo();
  });
}
