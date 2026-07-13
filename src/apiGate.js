/**
 * API 门禁：按供应商校验 Key
 */

import {
  PROVIDER_OPENROUTER,
  PROVIDER_ZHIPU,
  getStoredProvider,
  setStoredProvider,
  getProviderConfig,
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey as clearProviderKey,
  getStoredModel,
  setStoredModel,
  looksLikeProviderKey,
} from './providers.js';

export {
  getStoredProvider,
  setStoredProvider,
  getProviderConfig,
  getStoredApiKey,
  setStoredApiKey,
  getStoredModel,
  setStoredModel,
};

let sessionConnected = false;

export function clearStoredApiKey() {
  clearProviderKey(getStoredProvider());
  sessionConnected = false;
}

export function isApiConnected() {
  return sessionConnected && Boolean(getStoredApiKey());
}

export function markDisconnected() {
  sessionConnected = false;
}

async function readErrorDetail(response) {
  try {
    const body = await response.json();
    return body.error?.message || body.message || body.msg || '';
  } catch {
    return response.text().catch(() => '');
  }
}

async function validateOpenRouterKey(key) {
  const cfg = getProviderConfig(PROVIDER_OPENROUTER);
  const response = await fetch(cfg.validateUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'Emotional Damage',
    },
  });

  if (response.ok) return { ok: true };

  const detail = await readErrorDetail(response);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      message: detail
        ? `API Key 无效或无权限：${detail}`
        : 'API Key 无效或无权限，请到 openrouter.ai/keys 检查',
    };
  }
  return {
    ok: false,
    message: detail
      ? `连接失败 (${response.status}): ${detail}`
      : `连接失败 (HTTP ${response.status})`,
  };
}

/** 发一条极短请求验 Key（智谱无公开 /key） */
async function validateZhipuKey(key, model) {
  const cfg = getProviderConfig(PROVIDER_ZHIPU);
  const response = await fetch(cfg.validateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || cfg.defaultModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      temperature: 0.1,
      stream: false,
    }),
  });

  if (response.ok) return { ok: true };

  const detail = await readErrorDetail(response);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      message: detail
        ? `智谱 Key 无效或无权限：${detail}`
        : '智谱 Key 无效或无权限，请到 bigmodel.cn 检查',
    };
  }
  // 余额不足等也算 Key 通路通了，允许进入（评测时再报）
  if (response.status === 429 || /余额|quota|insufficient|429/i.test(detail)) {
    return { ok: true, warning: detail || '额度可能不足，评测时再确认' };
  }
  return {
    ok: false,
    message: detail
      ? `连接失败 (${response.status}): ${detail}`
      : `连接失败 (HTTP ${response.status})。若提示 CORS/网络，请用 npm run dev（经本地代理）。`,
  };
}

/**
 * @param {string} apiKey
 * @param {{ provider?: string, model?: string }} [opts]
 */
export async function validateApiKey(apiKey, opts = {}) {
  const provider = setStoredProvider(opts.provider || getStoredProvider());
  const cfg = getProviderConfig(provider);
  const key = String(apiKey || '').trim();
  const model = opts.model || getStoredModel(provider);

  if (!key) {
    return { ok: false, message: `请输入 ${cfg.keyLabel}` };
  }
  if (!looksLikeProviderKey(key, provider)) {
    if (provider === PROVIDER_OPENROUTER) {
      return {
        ok: false,
        message: '看起来不像 OpenRouter Key（一般以 sk-or- 开头）。智谱 Key 请先切换到「智谱 GLM」。',
      };
    }
    return {
      ok: false,
      message: '看起来不像智谱 Key（常见格式 id.secret）。OpenRouter Key 请先切换到 OpenRouter。',
    };
  }

  try {
    const result =
      provider === PROVIDER_ZHIPU
        ? await validateZhipuKey(key, model)
        : await validateOpenRouterKey(key);

    if (!result.ok) {
      sessionConnected = false;
      return result;
    }

    sessionConnected = true;
    setStoredApiKey(key, provider);
    setStoredModel(model, provider);
    return result;
  } catch (err) {
    sessionConnected = false;
    const msg = String(err.message || '');
    return {
      ok: false,
      message: /Failed to fetch|NetworkError|CORS/i.test(msg)
        ? '网络错误或被 CORS 拦截。智谱请用 npm run dev（走本地代理）；不要直接用静态文件打开。'
        : `网络错误: ${msg}`,
    };
  }
}

export async function reconnectWithStoredKey() {
  const provider = getStoredProvider();
  const key = getStoredApiKey(provider);
  if (!key) {
    sessionConnected = false;
    return { ok: false, message: '尚未保存 API Key' };
  }
  return validateApiKey(key, { provider, model: getStoredModel(provider) });
}
