/**
 * LLM 供应商配置（OpenRouter / 智谱）
 * 智谱浏览器直连常被 CORS 拦，开发/预览走 Vite 代理 /api/zhipu
 */

export const PROVIDER_OPENROUTER = 'openrouter';
export const PROVIDER_ZHIPU = 'zhipu';

const PROVIDER_STORAGE = 'ed_llm_provider';
const MODEL_STORAGE = 'ed_llm_model';
const KEY_STORAGE = {
  [PROVIDER_OPENROUTER]: 'ed_openrouter_api_key',
  [PROVIDER_ZHIPU]: 'ed_zhipu_api_key',
};

export const PROVIDERS = {
  [PROVIDER_OPENROUTER]: {
    id: PROVIDER_OPENROUTER,
    label: 'OpenRouter',
    keyLabel: 'OpenRouter API Key',
    placeholder: 'sk-or-v1-...',
    hintHtml:
      'Key 仅保存在本机浏览器（明文）。建议设置额度封顶。聊天会发到 OpenRouter。获取：' +
      '<a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'z-ai/glm-4.5-air', label: 'GLM-4.5 Air（经 OpenRouter）' },
    ],
    /** 浏览器可直连（CORS 已实测：预检 204 + ACAO:*） */
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    validateUrl: 'https://openrouter.ai/api/v1/key',
  },
  [PROVIDER_ZHIPU]: {
    id: PROVIDER_ZHIPU,
    label: '智谱 GLM',
    keyLabel: '智谱 API Key',
    placeholder: 'xxxxxxxx.xxxxxxxx',
    hintHtml:
      'Key 仅保存在本机。格式一般为 <code>id.secret</code>。聊天会发到智谱 open.bigmodel.cn（经本地代理避免 CORS）。获取：' +
      '<a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" rel="noopener noreferrer">bigmodel.cn API Keys</a>',
    defaultModel: 'glm-4-flash',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4-Flash（便宜）' },
      { id: 'glm-4-air', label: 'GLM-4-Air' },
      { id: 'glm-4', label: 'GLM-4' },
      { id: 'glm-4-plus', label: 'GLM-4-Plus' },
      { id: 'glm-4.5-flash', label: 'GLM-4.5-Flash' },
    ],
    // 经 Vite 代理，避免浏览器 CORS；代理只在 dev/preview 存在，生产构建已隐藏本 provider 入口
    chatUrl: '/api/zhipu/api/paas/v4/chat/completions',
    validateUrl: '/api/zhipu/api/paas/v4/chat/completions',
  },
};

export function getStoredProvider() {
  const raw = (localStorage.getItem(PROVIDER_STORAGE) || '').trim();
  return PROVIDERS[raw] ? raw : PROVIDER_OPENROUTER;
}

export function setStoredProvider(provider) {
  const id = PROVIDERS[provider] ? provider : PROVIDER_OPENROUTER;
  localStorage.setItem(PROVIDER_STORAGE, id);
  return id;
}

export function getProviderConfig(provider = getStoredProvider()) {
  return PROVIDERS[provider] || PROVIDERS[PROVIDER_OPENROUTER];
}

export function getStoredApiKey(provider = getStoredProvider()) {
  const storageKey = KEY_STORAGE[provider] || KEY_STORAGE[PROVIDER_OPENROUTER];
  let key = (localStorage.getItem(storageKey) || '').trim();

  // 兼容旧版单一 key + legacy
  if (!key && provider === PROVIDER_OPENROUTER) {
    const legacy = (localStorage.getItem('aiChatApiKey') || '').trim();
    if (legacy) {
      localStorage.setItem(storageKey, legacy);
      localStorage.removeItem('aiChatApiKey');
      key = legacy;
    }
  }
  return key;
}

export function setStoredApiKey(key, provider = getStoredProvider()) {
  const storageKey = KEY_STORAGE[provider] || KEY_STORAGE[PROVIDER_OPENROUTER];
  localStorage.setItem(storageKey, String(key || '').trim());
  localStorage.removeItem('aiChatApiKey');
}

export function clearStoredApiKey(provider = getStoredProvider()) {
  const storageKey = KEY_STORAGE[provider] || KEY_STORAGE[PROVIDER_OPENROUTER];
  localStorage.removeItem(storageKey);
  localStorage.removeItem('aiChatApiKey');
}

/** 「退出 Key」语义：所有 provider 的 Key 一并清除，不留明文残余 */
export function clearAllStoredApiKeys() {
  Object.values(KEY_STORAGE).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('aiChatApiKey');
}

export function getStoredModel(provider = getStoredProvider()) {
  const cfg = getProviderConfig(provider);
  const saved = (localStorage.getItem(`${MODEL_STORAGE}:${provider}`) || '').trim();
  if (saved && cfg.models.some(m => m.id === saved)) return saved;
  return cfg.defaultModel;
}

export function setStoredModel(model, provider = getStoredProvider()) {
  const cfg = getProviderConfig(provider);
  const id = cfg.models.some(m => m.id === model) ? model : cfg.defaultModel;
  localStorage.setItem(`${MODEL_STORAGE}:${provider}`, id);
  return id;
}

export function looksLikeProviderKey(key, provider) {
  const value = String(key || '').trim();
  if (!value) return false;
  if (provider === PROVIDER_OPENROUTER) return value.startsWith('sk-or-');
  if (provider === PROVIDER_ZHIPU) {
    // 智谱常见 id.secret；也允许已是 JWT 的长串
    return value.includes('.') || value.length > 40;
  }
  return true;
}
