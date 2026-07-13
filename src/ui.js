/**
 * UI 层 — 负责步骤切换、DOM 渲染、事件绑定
 */
import { analyze } from './analyzer.js';
import { parseChatJson, generateDemoData } from './parser.js';
import { renderShareCard } from './cardRenderer.js';
import { initAIChat } from './aiChat.js';
import html2canvas from 'html2canvas';

// ====== 状态 ======
let currentResult = null;

// ====== DOM refs ======
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

const dom = {
  stepImport: $('step-import'),
  stepLoading: $('step-loading'),
  stepResult: $('step-result'),
  stepCard: $('step-card'),
  uploadZone: $('uploadZone'),
  fileInput: $('fileInput'),
  btnSelectFile: $('btnSelectFile'),
  btnDemo: $('btnDemo'),
  loadingBar: $('loadingBar'),
  loadingStatus: $('loadingStatus'),
  btnBack: $('btnBack'),
  btnShowCard: $('btnShowCard'),
  btnSendToThem: $('btnSendToThem'),
  btnBackFromCard: $('btnBackFromCard'),
  btnCopyCard: $('btnCopyCard'),
  btnDownloadCard: $('btnDownloadCard'),
  shareCard: $('shareCard'),
  resultMeta: $('resultMeta'),
  scoreRingFg: $('scoreRingFg'),
  ringScore: $('ringScore'),
  ringGrade: $('ringGrade'),
  signalGrid: $('signalGrid'),
  bilateralContainer: $('bilateralContainer'),
  quoteList: $('quoteList'),
  tagsContainer: $('tagsContainer'),
  timelineChart: $('timelineChart'),
  toast: $('toast'),
};

// ====== 步骤切换 ======
function showStep(name) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  if (name === 'import') dom.stepImport.classList.add('active');
  else if (name === 'loading') dom.stepLoading.classList.add('active');
  else if (name === 'result') dom.stepResult.classList.add('active');
  else if (name === 'card') dom.stepCard.classList.add('active');
  window.scrollTo(0, 0);
}

// ====== 加载动画 ======
function animateLoading(callback) {
  showStep('loading');
  dom.loadingBar.style.width = '0%';
  const phases = [
    { pct: 20, text: '读取消息中...', delay: 200 },
    { pct: 45, text: '扫描暧昧信号...', delay: 500 },
    { pct: 70, text: '计算双向对比...', delay: 800 },
    { pct: 88, text: '生成关系画像...', delay: 1100 },
  ];

  phases.forEach(({ pct, text, delay }) => {
    setTimeout(() => {
      dom.loadingBar.style.width = pct + '%';
      dom.loadingStatus.textContent = text;
    }, delay);
  });

  setTimeout(() => {
    dom.loadingBar.style.width = '100%';
    dom.loadingStatus.textContent = '分析完成！';
    setTimeout(callback, 400);
  }, 1500);
}

// ====== 信号映射 ======
const SIGNAL_META = {
  intimateName: { label: '亲昵称呼', emoji: '💕', color: '#f472b6' },
  missing: { label: '想念信号', emoji: '🥺', color: '#fb923c' },
  lateNight: { label: '深夜亲密', emoji: '🌙', color: '#818cf8' },
  flirtyAction: { label: '暧昧动作', emoji: '🫶', color: '#34d399' },
  flirtyEmoji: { label: '暧昧表情', emoji: '😘', color: '#fbbf24' },
};

// ====== 渲染结果 ======
function renderResult(result) {
  currentResult = result;

  // Meta
  dom.resultMeta.textContent =
    `${result.myName} 与 ${result.theirName} · ` +
    `${result.totalMessages} 条消息 · ` +
    `${result.dateRange.start} ~ ${result.dateRange.end}`;

  // Ring
  const circumference = 2 * Math.PI * 88;
  const offset = circumference * (1 - result.flirtScore / 100);
  dom.scoreRingFg.style.stroke = result.gradeColor;
  dom.scoreRingFg.style.strokeDasharray = circumference;
  dom.scoreRingFg.style.strokeDashoffset = offset;
  dom.ringScore.textContent = result.flirtScore;
  dom.ringGrade.textContent = result.flirtGrade + '级';
  dom.ringGrade.style.fill = result.gradeColor;

  // Signal Grid
  const maxVal = Math.max(...Object.values(result.signalTotals), 1);
  dom.signalGrid.innerHTML = Object.entries(result.signalTotals).map(([key, total]) => {
    const meta = SIGNAL_META[key] || { label: key, emoji: '📊', color: '#888' };
    const pct = Math.max((total / maxVal) * 100, total > 0 ? 10 : 0);
    const sig = result.signalBreakdown[key];
    const mePct = total > 0 ? Math.round((sig.me / total) * 100) : 0;
    const themPct = 100 - mePct;
    return `
      <div class="signal-item">
        <div class="signal-icon">${meta.emoji}</div>
        <div class="signal-info">
          <div class="signal-name">${meta.label}</div>
          <div class="signal-bar-track">
            <div class="signal-bar-fill" style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <div class="signal-breakdown">
            <table class="signal-bd-table">
              <tr>
                <td>你</td>
                <td class="bar-cell"><div class="bar-me" style="width:${mePct}%"></div></td>
                <td>${sig.me}</td>
                <td class="bar-cell"><div class="bar-them" style="width:${themPct}%"></div></td>
                <td>TA</td>
              </tr>
            </table>
          </div>
        </div>
        <div class="signal-count">${total}</div>
      </div>
    `;
  }).join('');

  // Bilateral
  dom.bilateralContainer.innerHTML = `
    <div class="bilateral-row">
      <div class="bilateral-label" style="color:var(--primary)">你</div>
      <div class="bilateral-track">
        <div class="bilateral-fill me" style="width:${result.bilateral.meFlirtRatio}%"></div>
      </div>
      <div class="bilateral-pct" style="color:var(--primary)">${result.bilateral.meFlirtRatio}%</div>
    </div>
    <div class="bilateral-row">
      <div class="bilateral-label" style="color:var(--accent)">TA</div>
      <div class="bilateral-track">
        <div class="bilateral-fill them" style="width:${result.bilateral.themFlirtRatio}%"></div>
      </div>
      <div class="bilateral-pct" style="color:var(--accent)">${result.bilateral.themFlirtRatio}%</div>
    </div>
    <div class="bilateral-initiations">
      <div class="bilateral-init-item">
        <div class="bilateral-init-num me">${result.bilateral.meInitPct}%</div>
        <div class="bilateral-init-label">你主动开场</div>
      </div>
      <div class="bilateral-init-item">
        <div class="bilateral-init-num them">${result.bilateral.themInitPct}%</div>
        <div class="bilateral-init-label">TA主动开场</div>
      </div>
    </div>
    <div class="bilateral-verdict">${result.bilateral.verdict}</div>
  `;

  // Quotes
  dom.quoteList.innerHTML = result.topQuotes.length > 0
    ? result.topQuotes.slice(0, 5).map(q => `
      <div class="quote-item ${q.isMe ? 'me' : 'them'}">
        <div class="quote-item-text">"${escapeHtml(q.text)}"</div>
        <div class="quote-item-meta">— ${escapeHtml(q.sender)} · ${q.date}</div>
      </div>
    `).join('')
    : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px;">暂未检测到明显的暧昧信号</div>';

  // Tags
  dom.tagsContainer.innerHTML = result.tags.map(t =>
    `<span class="tag-item type-${t.type}">${t.text}</span>`
  ).join('');

  // Timeline
  renderTimeline(result.timeline);

  // AI 顾问
  const aiContainer = $('aiChatContainer');
  if (aiContainer) {
    aiContainer.innerHTML = ''; // 清除旧实例
    setTimeout(() => {
      initAIChat(aiContainer, result);
    }, 100);
  }

  showStep('result');
}

function renderTimeline(timeline) {
  if (!timeline || timeline.length === 0) {
    dom.timelineChart.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px;">暂无时间线数据</div>';
    return;
  }

  const maxVal = Math.max(...timeline.flatMap(t => [t.me, t.them]), 1);

  dom.timelineChart.innerHTML = `<div class="timeline-bar-container">
    ${timeline.map(t => {
      const meH = Math.max((t.me / maxVal) * 70, t.me > 0 ? 6 : 2);
      const themH = Math.max((t.them / maxVal) * 70, t.them > 0 ? 6 : 2);
      return `<div class="timeline-bar-group">
        <div class="timeline-bar-pair">
          <div class="timeline-bar me" style="height:${meH}px"></div>
          <div class="timeline-bar them" style="height:${themH}px"></div>
        </div>
        <div class="timeline-label">${t.month}</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ====== 处理导入 ======
function handleData(rawJson) {
  try {
    const parsed = parseChatJson(rawJson);
    animateLoading(() => {
      try {
        const result = analyze(parsed.messages, parsed.contactName);
        renderResult(result);
      } catch (err) {
        alert('❌ ' + err.message);
        showStep('import');
      }
    });
  } catch (err) {
    alert('❌ ' + err.message);
    showStep('import');
  }
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => handleData(e.target.result);
  reader.onerror = () => alert('❌ 文件读取失败，请重试');
  reader.readAsText(file);
}

// ====== 导出卡片 ======
function exportCard() {
  const card = dom.shareCard;
  if (!card) return;

  // 渲染卡片
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

// ====== 复制卡片到剪贴板（核心逻辑）======
async function copyCardToClipboard(showSuccessMsg = true) {
  const card = dom.shareCard;
  if (!card) throw new Error('卡片元素不存在');

  // 确保卡片渲染
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
    // 降级方案：复制纯文本版本
    try {
      const r = currentResult;
      if (!r) throw new Error('无结果数据');
      const text = `💔 情感伤害鉴定报告\n━━━━━━━━━━━━━━\n👤 ${r.theirName || 'TA'} 对你的伤害指数\n🔥 暧昧指数：${r.flirtScore} 分（${r.flirtGrade} 级）\n💬 分析消息：${r.totalMessages} 条\n━━━━━━━━━━━━━━\n来自 "Emotional Damage" 鉴定器`;
      await navigator.clipboard.writeText(text);
      if (showSuccessMsg) showToast('✅ 文字版已复制到剪贴板');
      return true;
    } catch (fallbackErr) {
      throw new Error('复制失败: ' + err.message);
    }
  }
}

// ====== 「发给他/她」按钮 ======
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
  // 文件选择
  dom.btnSelectFile.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  // 拖拽上传
  dom.uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.uploadZone.classList.add('dragover');
  });
  dom.uploadZone.addEventListener('dragleave', () => {
    dom.uploadZone.classList.remove('dragover');
  });
  dom.uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  // 点击上传区直接选文件
  dom.uploadZone.addEventListener('click', e => {
    if (e.target.closest('button, input, details')) return;
    dom.fileInput.click();
  });

  // Demo
  dom.btnDemo.addEventListener('click', () => {
    const demoData = generateDemoData();
    handleData(demoData);
  });

  // 导航
  dom.btnBack.addEventListener('click', () => {
    currentResult = null;
    showStep('import');
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
