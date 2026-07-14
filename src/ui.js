/**
 * UI 层 — 负责步骤切换、DOM 渲染、事件绑定
 */
import { parseChatFile, generateDemoData, applySelfIdentity } from './parser.js';
import { renderShareCard } from './cardRenderer.js';
import {
  getStoredApiKey,
  clearStoredApiKey,
  isApiConnected,
  markDisconnected,
  validateApiKey,
  reconnectWithStoredKey,
  getStoredProvider,
  setStoredProvider,
  getProviderConfig,
  getStoredModel,
  setStoredModel,
} from './apiGate.js';
import { ZODIAC_OPTIONS, MBTI_OPTIONS, fillSelect } from './profileOptions.js';
import { PROVIDER_OPENROUTER, PROVIDER_ZHIPU } from './providers.js';
import { runLlmEval, MAX_MESSAGES } from './llmEval.js';
import html2canvas from 'html2canvas';

// ====== 状态 ======
let currentResult = null;
let pendingParse = null; // 身份确认中的 parse 快照
/** @type {{ parsed: object|null, sourceLabel: string, profile: { self: object, other: object }|null }} */
let evalDraft = {
  parsed: null,
  sourceLabel: '',
  profile: null,
};

/** 评测进行中：防重入 + 可取消 */
let isEvaluating = false;
/** @type {AbortController | null} */
let evalAbortController = null;

function cancelEvalRequest() {
  if (evalAbortController) {
    evalAbortController.abort();
    evalAbortController = null;
  }
}

function setEvaluating(active) {
  isEvaluating = Boolean(active);
  if (!isEvaluating) {
    evalAbortController = null;
  }
  if (dom.btnStartEval) {
    // updateStartEvalHint 会按草稿状态决定是否可用；评测中强制禁用
    if (isEvaluating) dom.btnStartEval.disabled = true;
    else updateStartEvalHint();
  }
}

// ====== DOM refs ======
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

const dom = {
  stepApi: $('step-api'),
  stepImport: $('step-import'),
  stepIdentify: $('step-identify'),
  stepLoading: $('step-loading'),
  stepResult: $('step-result'),
  stepCard: $('step-card'),
  apiKeyInput: $('apiKeyInput'),
  apiKeyLabel: $('apiKeyLabel'),
  apiGateHint: $('apiGateHint'),
  apiProviderSelect: $('apiProviderSelect'),
  apiModelSelect: $('apiModelSelect'),
  providerBtnOpenrouter: $('providerBtnOpenrouter'),
  providerBtnZhipu: $('providerBtnZhipu'),
  btnConnectApi: $('btnConnectApi'),
  btnUseSavedKey: $('btnUseSavedKey'),
  apiGateStatus: $('apiGateStatus'),
  apiConnectedLabel: $('apiConnectedLabel'),
  btnChangeApiKey: $('btnChangeApiKey'),
  selfZodiac: $('selfZodiac'),
  selfMbti: $('selfMbti'),
  otherZodiac: $('otherZodiac'),
  otherMbti: $('otherMbti'),
  uploadZone: $('uploadZone'),
  fileInput: $('fileInput'),
  btnSelectFile: $('btnSelectFile'),
  btnDemo: $('btnDemo'),
  uploadFileStatus: $('uploadFileStatus'),
  btnStartEval: $('btnStartEval'),
  startEvalHint: $('startEvalHint'),
  identifyOptions: $('identifyOptions'),
  btnIdentifyBack: $('btnIdentifyBack'),
  loadingBar: $('loadingBar'),
  loadingStatus: $('loadingStatus'),
  btnCancelEval: $('btnCancelEval'),
  btnBack: $('btnBack'),
  btnShowCard: $('btnShowCard'),
  btnSendToThem: $('btnSendToThem'),
  btnBackFromCard: $('btnBackFromCard'),
  btnCopyCard: $('btnCopyCard'),
  btnDownloadCard: $('btnDownloadCard'),
  shareCard: $('shareCard'),
  resultMeta: $('resultMeta'),
  resultSummary: $('resultSummary'),
  resultStage: $('resultStage'),
  scoreRingFg: $('scoreRingFg'),
  ringScore: $('ringScore'),
  ringGrade: $('ringGrade'),
  signalGrid: $('signalGrid'),
  deepAnalysis: $('deepAnalysis'),
  adviceList: $('adviceList'),
  quoteList: $('quoteList'),
  tagsContainer: $('tagsContainer'),
  verdictLine: $('verdictLine'),
  toast: $('toast'),
};

function requireApiOrGate() {
  if (isApiConnected()) return true;
  showToast('请先连接 API Key');
  showApiGate();
  return false;
}

function maskKey(key) {
  if (!key || key.length < 12) return '已连接';
  const cfg = getProviderConfig();
  return `${cfg.label} · …${key.slice(-4)}`;
}

function setApiStatus(message, type = '') {
  if (!dom.apiGateStatus) return;
  dom.apiGateStatus.textContent = message || '';
  dom.apiGateStatus.className = 'api-gate-status' + (type ? ` ${type}` : '');
}

function syncProviderUi(provider = getStoredProvider()) {
  const id = setStoredProvider(provider);
  const cfg = getProviderConfig(id);

  if (dom.apiProviderSelect) dom.apiProviderSelect.value = id;
  document.querySelectorAll('.api-provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === id);
  });

  if (dom.apiKeyLabel) dom.apiKeyLabel.textContent = cfg.keyLabel;
  if (dom.apiKeyInput) {
    dom.apiKeyInput.placeholder = cfg.placeholder;
    dom.apiKeyInput.value = getStoredApiKey(id);
  }
  if (dom.apiGateHint) dom.apiGateHint.innerHTML = cfg.hintHtml;

  if (dom.apiModelSelect) {
    const current = getStoredModel(id);
    dom.apiModelSelect.replaceChildren();
    cfg.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === current) opt.selected = true;
      dom.apiModelSelect.appendChild(opt);
    });
  }

  if (dom.btnUseSavedKey) {
    dom.btnUseSavedKey.hidden = !getStoredApiKey(id);
  }
}

function showApiGate() {
  markDisconnected();
  syncProviderUi(getStoredProvider());
  setApiStatus('');
  showStep('api');
}

async function enterAfterConnect() {
  if (dom.apiConnectedLabel) {
    dom.apiConnectedLabel.textContent = maskKey(getStoredApiKey());
  }
  showStep('import');
  updateStartEvalHint();
}

async function handleConnectApi() {
  const provider = getStoredProvider();
  const key = dom.apiKeyInput?.value?.trim() || '';
  const model = dom.apiModelSelect?.value || getStoredModel(provider);
  if (!dom.btnConnectApi) return;

  dom.btnConnectApi.disabled = true;
  dom.btnConnectApi.textContent = '连接中…';
  if (dom.btnUseSavedKey) dom.btnUseSavedKey.disabled = true;
  setApiStatus('正在校验 API Key…');

  const result = await validateApiKey(key, { provider, model });

  dom.btnConnectApi.disabled = false;
  dom.btnConnectApi.textContent = '连接并进入';
  if (dom.btnUseSavedKey) dom.btnUseSavedKey.disabled = false;

  if (!result.ok) {
    setApiStatus(result.message, 'error');
    return;
  }

  setStoredModel(model, provider);
  setApiStatus(result.warning ? `已连接（注意：${result.warning}）` : '连接成功', 'ok');
  await enterAfterConnect();
}

async function handleUseSavedKey() {
  if (!dom.btnUseSavedKey) return;
  const provider = getStoredProvider();
  const model = dom.apiModelSelect?.value || getStoredModel(provider);
  setStoredModel(model, provider);

  dom.btnUseSavedKey.disabled = true;
  dom.btnConnectApi.disabled = true;
  setApiStatus('正在用已保存的 Key 校验…');

  const result = await reconnectWithStoredKey();

  dom.btnUseSavedKey.disabled = false;
  dom.btnConnectApi.disabled = false;

  if (!result.ok) {
    setApiStatus(result.message || '已保存的 Key 无效，请重新输入', 'error');
    if (dom.btnUseSavedKey) dom.btnUseSavedKey.hidden = !getStoredApiKey(provider);
    return;
  }

  if (dom.apiKeyInput) dom.apiKeyInput.value = getStoredApiKey(provider);
  setApiStatus(result.warning ? `已连接（注意：${result.warning}）` : '连接成功', 'ok');
  await enterAfterConnect();
}

function handleChangeApiKey() {
  clearStoredApiKey();
  currentResult = null;
  pendingParse = null;
  clearChatDraft();
  if (dom.apiKeyInput) dom.apiKeyInput.value = '';
  showApiGate();
  showToast('已退出 API，请重新连接');
}

function readProfileFromForm() {
  return {
    self: {
      zodiac: dom.selfZodiac?.value || '',
      mbti: dom.selfMbti?.value || '',
    },
    other: {
      zodiac: dom.otherZodiac?.value || '',
      mbti: dom.otherMbti?.value || '',
    },
  };
}

function isProfileComplete(profile) {
  const fields = [
    profile?.self?.zodiac,
    profile?.self?.mbti,
    profile?.other?.zodiac,
    profile?.other?.mbti,
  ];
  return fields.every(v => typeof v === 'string' && v.trim() !== '');
}

function clearChatDraft() {
  evalDraft = { parsed: null, sourceLabel: '', profile: null };
  if (dom.fileInput) dom.fileInput.value = '';
  updateUploadStatus();
  updateStartEvalHint();
}

function updateUploadStatus() {
  if (!dom.uploadFileStatus) return;
  if (!evalDraft.parsed) {
    dom.uploadFileStatus.textContent = '尚未放入聊天文件';
    dom.uploadFileStatus.classList.remove('ready');
    dom.uploadZone?.classList.remove('has-file');
    return;
  }
  const n = evalDraft.parsed.messages?.length || 0;
  const name = evalDraft.parsed.contactName || 'TA';
  const needPick = evalDraft.parsed.needsSelfPick ? ' · 开始后需确认身份' : '';
  dom.uploadFileStatus.textContent =
    `已放入：${evalDraft.sourceLabel || '聊天记录'}（${n} 条，对方：${name}）${needPick}`;
  dom.uploadFileStatus.classList.add('ready');
  dom.uploadZone?.classList.add('has-file');
}

function updateStartEvalHint() {
  if (!dom.startEvalHint) return;
  const profile = readProfileFromForm();
  const missing = [];
  if (!isProfileComplete(profile)) missing.push('双方星座/MBTI');
  if (!evalDraft.parsed) missing.push('聊天记录');
  if (!isApiConnected()) missing.push('API 连接');

  if (missing.length === 0) {
    dom.startEvalHint.textContent = isEvaluating ? '评测进行中…' : '可以开始评测';
    dom.startEvalHint.classList.add('ready');
    if (dom.btnStartEval) dom.btnStartEval.disabled = isEvaluating;
  } else {
    dom.startEvalHint.textContent = `还差：${missing.join('、')}`;
    dom.startEvalHint.classList.remove('ready');
    if (dom.btnStartEval) dom.btnStartEval.disabled = true;
  }
}

function initProfileSelects() {
  fillSelect(dom.selfZodiac, ZODIAC_OPTIONS, '不清楚');
  fillSelect(dom.selfMbti, MBTI_OPTIONS, '不清楚');
  fillSelect(dom.otherZodiac, ZODIAC_OPTIONS, '不清楚');
  fillSelect(dom.otherMbti, MBTI_OPTIONS, '不清楚');

  [dom.selfZodiac, dom.selfMbti, dom.otherZodiac, dom.otherMbti].forEach(el => {
    el?.addEventListener('change', updateStartEvalHint);
  });
}

function applyDemoProfileDefaults() {
  if (dom.selfZodiac) dom.selfZodiac.value = '天蝎座';
  if (dom.selfMbti) dom.selfMbti.value = 'INFJ';
  if (dom.otherZodiac) dom.otherZodiac.value = '双子座';
  if (dom.otherMbti) dom.otherMbti.value = 'ENFP';
}

// ====== 步骤切换 ======
function showStep(name) {
  // 门禁：未连接时只允许停留在 api
  if (name !== 'api' && !isApiConnected()) {
    showApiGate();
    return;
  }

  // 离开 loading 时中止进行中的评测请求，避免悬挂双扣费
  if (name !== 'loading' && isEvaluating) {
    cancelEvalRequest();
    setEvaluating(false);
  }

  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  if (name === 'api') dom.stepApi?.classList.add('active');
  else if (name === 'import') dom.stepImport.classList.add('active');
  else if (name === 'identify') dom.stepIdentify?.classList.add('active');
  else if (name === 'loading') dom.stepLoading.classList.add('active');
  else if (name === 'result') dom.stepResult.classList.add('active');
  else if (name === 'card') dom.stepCard.classList.add('active');
  window.scrollTo(0, 0);
}

// ====== 渲染 LLM 报告 ======
function renderResult(result) {
  currentResult = result;

  const truncNote = result.truncateMeta?.truncated
    ? ` · 已送模型最近 ${result.truncateMeta.sent}/${result.truncateMeta.total} 条`
    : result.truncateMeta
      ? ` · 已送模型 ${result.truncateMeta.sent} 条`
      : '';

  dom.resultMeta.textContent =
    `${result.myName} 与 ${result.theirName} · ` +
    `${result.totalMessages} 条消息 · ` +
    `${result.dateRange.start} ~ ${result.dateRange.end}` +
    truncNote +
    (result.profile
      ? ` · ${result.profile.self.zodiac}/${result.profile.self.mbti} × ${result.profile.other.zodiac}/${result.profile.other.mbti}`
      : '');

  const circumference = 2 * Math.PI * 88;
  const offset = circumference * (1 - result.flirtScore / 100);
  dom.scoreRingFg.style.stroke = result.gradeColor;
  dom.scoreRingFg.style.strokeDasharray = circumference;
  dom.scoreRingFg.style.strokeDashoffset = offset;
  dom.ringScore.textContent = result.flirtScore;
  dom.ringGrade.textContent = result.flirtGrade + '级';
  dom.ringGrade.style.fill = result.gradeColor;

  if (dom.resultSummary) dom.resultSummary.textContent = result.summary || '';
  if (dom.resultStage) {
    dom.resultStage.textContent = result.relationshipStage
      ? `情圣阶段定位：阶段${result.relationshipStage} · ${result.relationshipStageLabel}`
      : '';
  }

  const dims = result.dimensions || [];
  const maxVal = Math.max(...dims.map(d => d.score), 1);
  const colors = ['#f472b6', '#fb923c', '#818cf8', '#34d399', '#fbbf24'];
  dom.signalGrid.innerHTML = dims.map((d, i) => {
    const pct = Math.max((d.score / maxVal) * 100, d.score > 0 ? 8 : 0);
    return `
      <div class="signal-item">
        <div class="signal-info" style="flex:1">
          <div class="signal-name">${escapeHtml(d.label)}</div>
          <div class="signal-bar-track">
            <div class="signal-bar-fill" style="width:${pct}%;background:${colors[i % colors.length]}"></div>
          </div>
          <div class="dim-comment">${escapeHtml(d.comment || '')}</div>
        </div>
        <div class="signal-count">${d.score}</div>
      </div>`;
  }).join('');

  if (dom.deepAnalysis) {
    setTextWithBreaks(dom.deepAnalysis, result.deepAnalysis || '');
  }

  if (dom.adviceList) {
    dom.adviceList.replaceChildren();
    (result.advice || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      dom.adviceList.appendChild(li);
    });
  }

  dom.quoteList.innerHTML = (result.highlights || []).length > 0
    ? result.highlights.map(h => `
      <div class="quote-item them">
        <div class="quote-item-text">"${escapeHtml(h)}"</div>
      </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px;">暂无高光</div>';

  dom.tagsContainer.innerHTML = (result.tags || []).map(t =>
    `<span class="tag-item type-${t.type || 'neutral'}">${escapeHtml(t.text)}</span>`
  ).join('');

  if (dom.verdictLine) {
    dom.verdictLine.textContent = result.verdict || '';
  }

  showStep('result');
}

function setTextWithBreaks(el, value) {
  const lines = String(value).split('\n');
  el.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
}

// ====== 身份确认 ======
function showIdentifyStep(parsed) {
  pendingParse = parsed;
  const options = dom.identifyOptions;
  if (!options) {
    proceedToEval(parsed.messages, parsed.contactName);
    return;
  }

  options.replaceChildren();
  parsed.participants.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'identify-option';

    const nameEl = document.createElement('span');
    nameEl.className = 'identify-option-name';
    nameEl.textContent = name;

    const hintEl = document.createElement('span');
    hintEl.className = 'identify-option-hint';
    hintEl.textContent = '这是我';

    btn.append(nameEl, hintEl);
    btn.addEventListener('click', () => {
      const messages = applySelfIdentity(pendingParse.messages, name);
      const theirName = pendingParse.participants.find(p => p !== name) || pendingParse.contactName || 'TA';
      pendingParse = null;
      proceedToEval(messages, theirName);
    });
    options.appendChild(btn);
  });

  showStep('identify');
}

/**
 * 组装输入并调用 LLM 评测
 */
function proceedToEval(messages, contactName) {
  const profile = evalDraft.profile || readProfileFromForm();
  const provider = getStoredProvider();
  runLlmAnalysis({
    apiKey: getStoredApiKey(provider),
    provider,
    model: getStoredModel(provider),
    messages,
    contactName,
    self: { ...profile.self },
    other: { ...profile.other },
  });
}

async function runLlmAnalysis(input) {
  if (isEvaluating) {
    showToast('评测进行中，请稍候或点「取消评测」');
    return;
  }

  evalAbortController = new AbortController();
  const signal = evalAbortController.signal;
  setEvaluating(true);

  showStep('loading');
  if (dom.loadingBar) dom.loadingBar.style.width = '15%';
  if (dom.loadingStatus) {
    dom.loadingStatus.textContent = `准备评测（最多发送最近 ${MAX_MESSAGES} 条）…`;
  }

  try {
    const result = await runLlmEval({ ...input, signal }, msg => {
      if (dom.loadingStatus) dom.loadingStatus.textContent = msg;
      if (dom.loadingBar) {
        if (msg.includes('截断')) dom.loadingBar.style.width = '30%';
        else if (msg.includes('请求')) dom.loadingBar.style.width = '55%';
        else if (msg.includes('JSON') || msg.includes('重试')) dom.loadingBar.style.width = '70%';
        else if (msg.includes('整理')) dom.loadingBar.style.width = '92%';
      }
    });
    if (signal.aborted) {
      setEvaluating(false);
      showStep('import');
      return;
    }
    if (dom.loadingBar) dom.loadingBar.style.width = '100%';
    if (dom.loadingStatus) dom.loadingStatus.textContent = '完成';
    setEvaluating(false);
    renderResult(result);
  } catch (err) {
    const aborted =
      signal.aborted ||
      err?.name === 'AbortError' ||
      /aborted|abort/i.test(String(err?.message || ''));
    setEvaluating(false);
    if (aborted) {
      if (dom.loadingStatus) dom.loadingStatus.textContent = '已取消';
      showToast('已取消评测');
      showStep('import');
      return;
    }
    alert('❌ ' + (err.message || '评测失败'));
    showStep('import');
  }
}

/** 仅解析并写入草稿，不立即评测 */
function loadChatIntoDraft(rawText, sourceLabel) {
  if (!requireApiOrGate()) return;
  try {
    const parsed = parseChatFile(rawText, sourceLabel);
    evalDraft.parsed = parsed;
    evalDraft.sourceLabel = sourceLabel || '聊天记录';
    updateUploadStatus();
    updateStartEvalHint();
    showToast(`已放入 ${parsed.messages.length} 条消息，确认画像后点「开始评测」`);
  } catch (err) {
    clearChatDraft();
    const tip = err.message || '无法解析该文件';
    alert(`❌ ${tip}\n\n建议：用 WeChatMsg 导出「纯文本 TXT」后再拖入（其 HTML 导出是动态网页，无法解析）；或点「先看 Demo」体验流程。`);
  }
}

function handleStartEval() {
  if (isEvaluating) {
    showToast('评测进行中，请稍候或点「取消评测」');
    return;
  }
  if (!requireApiOrGate()) return;

  const profile = readProfileFromForm();
  if (!isProfileComplete(profile)) {
    showToast('请完整选择双方的星座与 MBTI（可选「不清楚」）');
    updateStartEvalHint();
    return;
  }
  if (!evalDraft.parsed) {
    showToast('请先上传聊天文件或载入 Demo');
    updateStartEvalHint();
    return;
  }

  evalDraft.profile = profile;

  const parsed = evalDraft.parsed;
  if (parsed.needsSelfPick) {
    showIdentifyStep(parsed);
    return;
  }
  proceedToEval(parsed.messages, parsed.contactName);
}

function handleFile(file) {
  if (!requireApiOrGate()) return;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => loadChatIntoDraft(e.target.result, file.name);
  reader.onerror = () => alert('❌ 文件读取失败，请重试');
  reader.readAsText(file);
}

// ====== 导出卡片 ======
function exportCard() {
  const card = dom.shareCard;
  if (!card) return;

  if (currentResult) {
    renderShareCard(dom.shareCard, currentResult);
  }

  showStep('card');
}

async function downloadCard() {
  const card = dom.shareCard;
  if (!card) return;

  try {
    dom.btnDownloadCard.textContent = '⏳ 生成中...';
    dom.btnDownloadCard.disabled = true;

    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: '#ffffff',
      allowTaint: false,
      useCORS: true,
      logging: false,
      width: 400,
      windowWidth: 400,
    });

    const link = document.createElement('a');
    link.download = `emotional-damage-${currentResult?.theirName || 'report'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('❌ 导出失败: ' + err.message);
  } finally {
    dom.btnDownloadCard.textContent = '💾 保存为图片';
    dom.btnDownloadCard.disabled = false;
  }
}

// ====== Toast 提示 ======
let toastTimer = null;
function showToast(msg, duration = 2500) {
  const el = dom.toast;
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ====== 复制卡片到剪贴板 ======
async function copyCardToClipboard(showSuccessMsg = true) {
  const card = dom.shareCard;
  if (!card) throw new Error('卡片元素不存在');

  if (currentResult) {
    renderShareCard(dom.shareCard, currentResult);
  }

  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: '#ffffff',
      allowTaint: false,
      useCORS: true,
      logging: false,
      width: 400,
      windowWidth: 400,
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('生成图片失败');

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);

    if (showSuccessMsg) {
      showToast('✅ 卡片已复制到剪贴板');
    }
    return true;
  } catch (err) {
    try {
      const r = currentResult;
      if (!r) throw new Error('无结果数据');
      const text = `💔 Emotional Damage 评测\n━━━━━━━━━━━━━━\n👤 ${r.theirName || 'TA'}\n🔥 暧昧指数：${r.flirtScore} 分（${r.flirtGrade} 级）\n📍 ${r.relationshipStage ? `阶段${r.relationshipStage} ${r.relationshipStageLabel}` : ''}\n💬 ${r.summary || r.verdict || ''}\n━━━━━━━━━━━━━━`;
      await navigator.clipboard.writeText(text);
      if (showSuccessMsg) showToast('✅ 文字版已复制到剪贴板');
      return true;
    } catch (fallbackErr) {
      throw new Error('复制失败: ' + err.message);
    }
  }
}

async function handleSendToThem() {
  const btn = dom.btnSendToThem;
  try {
    btn.textContent = '⏳ 生成中...';
    btn.disabled = true;
    await copyCardToClipboard(false);
    showToast('💌 卡片已复制到剪贴板，快去发给 TA 吧！');
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    btn.textContent = '💌 发给他/她';
    btn.disabled = false;
  }
}

// ====== 初始化 ======
export function initUI() {
  // 智谱直连依赖 vite dev/preview 代理，静态部署不可用：生产构建隐藏入口
  // （Phase B 改为自持 Key 薄后端后再恢复，见 problem.md #3）
  if (import.meta.env.PROD) {
    dom.providerBtnZhipu?.remove();
    if (getStoredProvider() === PROVIDER_ZHIPU) {
      setStoredProvider(PROVIDER_OPENROUTER);
    }
  }

  initProfileSelects();
  updateUploadStatus();
  updateStartEvalHint();

  // API 门禁
  if (dom.btnConnectApi) {
    dom.btnConnectApi.addEventListener('click', () => handleConnectApi());
  }
  if (dom.btnUseSavedKey) {
    dom.btnUseSavedKey.addEventListener('click', () => handleUseSavedKey());
  }
  document.querySelectorAll('.api-provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      if (!provider) return;
      syncProviderUi(provider);
      setApiStatus('');
    });
  });
  if (dom.apiModelSelect) {
    dom.apiModelSelect.addEventListener('change', () => {
      setStoredModel(dom.apiModelSelect.value, getStoredProvider());
    });
  }
  if (dom.apiKeyInput) {
    dom.apiKeyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConnectApi();
      }
    });
  }
  if (dom.btnChangeApiKey) {
    dom.btnChangeApiKey.addEventListener('click', handleChangeApiKey);
  }

  // 启动：始终先门禁；有已存 Key 时露出「使用已保存的 Key」
  showApiGate();

  dom.btnSelectFile.addEventListener('click', () => {
    if (!requireApiOrGate()) return;
    dom.fileInput.click();
  });
  dom.fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  dom.uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    if (!isApiConnected()) return;
    dom.uploadZone.classList.add('dragover');
  });
  dom.uploadZone.addEventListener('dragleave', () => {
    dom.uploadZone.classList.remove('dragover');
  });
  dom.uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.uploadZone.classList.remove('dragover');
    if (!requireApiOrGate()) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  dom.uploadZone.addEventListener('click', e => {
    if (e.target.closest('button, input, details, select, label, fieldset, a')) return;
    if (!requireApiOrGate()) return;
    dom.fileInput.click();
  });

  dom.uploadZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('button, input, a')) return;
      e.preventDefault();
      if (!requireApiOrGate()) return;
      dom.fileInput.click();
    }
  });

  dom.btnDemo.addEventListener('click', e => {
    e.stopPropagation();
    if (!requireApiOrGate()) return;
    applyDemoProfileDefaults();
    loadChatIntoDraft(generateDemoData(), 'Demo 数据');
    updateStartEvalHint();
  });

  if (dom.btnStartEval) {
    dom.btnStartEval.addEventListener('click', handleStartEval);
  }

  if (dom.btnCancelEval) {
    dom.btnCancelEval.addEventListener('click', () => {
      if (!isEvaluating) {
        showStep('import');
        return;
      }
      cancelEvalRequest();
      // AbortError 由 runLlmAnalysis catch 处理回跳
    });
  }

  if (dom.btnIdentifyBack) {
    dom.btnIdentifyBack.addEventListener('click', () => {
      pendingParse = null;
      // 保留已载入的聊天草稿，方便改完身份选项再点开始
      showStep('import');
      updateStartEvalHint();
    });
  }

  dom.btnBack.addEventListener('click', () => {
    currentResult = null;
    pendingParse = null;
    showStep('import');
    updateStartEvalHint();
  });
  dom.btnBackFromCard.addEventListener('click', () => {
    if (currentResult) showStep('result');
    else showStep('import');
  });
  dom.btnShowCard.addEventListener('click', exportCard);
  dom.btnSendToThem.addEventListener('click', handleSendToThem);
  dom.btnCopyCard.addEventListener('click', () => copyCardToClipboard());
  dom.btnDownloadCard.addEventListener('click', downloadCard);
}
