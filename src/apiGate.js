/**
 * OpenRouter API 门禁
 * Phase 1：未校验通过的 Key 不能进入上传/评测
 */

const STORAGE_KEY = 'ed_openrouter_api_key';
const LEGACY_STORAGE_KEY = 'aiChatApiKey';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

let sessionConnected = false;

export function getStoredApiKey() {
  return (
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem(LEGACY_STORAGE_KEY) ||
    ''
  ).trim();
}

export function setStoredApiKey(key) {
  const value = String(key || '').trim();
  localStorage.setItem(STORAGE_KEY, value);
  // 兼容旧模块读取
  localStorage.setItem(LEGACY_STORAGE_KEY, value);
}

export function clearStoredApiKey() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  sessionConnected = false;
}

export function isApiConnected() {
  return sessionConnected && Boolean(getStoredApiKey());
}

export function markDisconnected() {
  sessionConnected = false;
}

/**
 * 轻量校验：拉取 models 列表，不上传聊天内容
 * @param {string} apiKey
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function validateApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, message: '请输入 OpenRouter API Key' };
  }

  try {
    const response = await fetch(MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'Emotional Damage',
      },
    });

    if (response.ok) {
      sessionConnected = true;
      setStoredApiKey(key);
      return { ok: true };
    }

    let detail = '';
    try {
      const body = await response.json();
      detail = body.error?.message || body.message || '';
    } catch {
      detail = await response.text().catch(() => '');
    }

    sessionConnected = false;
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'API Key 无效或无权限，请到 openrouter.ai 检查 Key' };
    }
    return {
      ok: false,
      message: detail
        ? `连接失败 (${response.status}): ${detail}`
        : `连接失败 (HTTP ${response.status})`,
    };
  } catch (err) {
    sessionConnected = false;
    return {
      ok: false,
      message: err.message?.includes('Failed to fetch')
        ? '网络错误，请检查网络或是否被浏览器拦截'
        : `网络错误: ${err.message}`,
    };
  }
}

/**
 * 用本地已存 Key 再校验一次；失败则清连接态（不自动删 Key，方便用户改）
 */
export async function reconnectWithStoredKey() {
  const key = getStoredApiKey();
  if (!key) {
    sessionConnected = false;
    return { ok: false, message: '尚未保存 API Key' };
  }
  return validateApiKey(key);
}
