/**
 * 分享卡片渲染器 — 绑定 LLM 评测结果
 */

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

/**
 * @param {HTMLElement} container
 * @param {object} result - runLlmEval / normalizeEvalResult 产出
 */
export function renderShareCard(container, result) {
  const advicePreview = (result.advice || []).slice(0, 2).map(a => escapeHtml(a)).join('<br/>');
  const stageText = result.relationshipStage
    ? `阶段${result.relationshipStage} · ${escapeHtml(result.relationshipStageLabel || '')}`
    : '';

  container.innerHTML = `
    <div class="card-inner">
      <div class="card-header">
        <div class="card-brand">
          <span class="card-brand-icon">💔</span>
          <span class="card-brand-text">Emotional Damage</span>
        </div>
        <div class="card-title">暧昧探测报告</div>
        <div class="card-subtitle">${escapeHtml(result.theirName || 'TA')}</div>
      </div>

      <div class="card-score-section">
        <div class="card-score-ring">
          <svg viewBox="0 0 140 140" style="width:140px;height:140px">
            <circle cx="70" cy="70" r="62" fill="none" stroke="#f0f0f0" stroke-width="8" />
            <circle cx="70" cy="70" r="62" fill="none" stroke="${result.gradeColor}" stroke-width="8"
              stroke-dasharray="${2 * Math.PI * 62}" stroke-dashoffset="${2 * Math.PI * 62 * (1 - result.flirtScore / 100)}"
              transform="rotate(-90,70,70)" stroke-linecap="round" />
            <text x="70" y="55" text-anchor="middle" font-size="36" font-weight="800" fill="#1a1a2e">${result.flirtScore}</text>
            <text x="70" y="78" text-anchor="middle" font-size="12" fill="#888">暧昧指数</text>
            <text x="70" y="102" text-anchor="middle" font-size="20" font-weight="700" fill="${result.gradeColor}">${result.flirtGrade}级</text>
          </svg>
        </div>
        <div class="card-score-stats">
          <div class="card-stat">
            <span class="card-stat-value">${result.totalMessages || '-'}</span>
            <span class="card-stat-label">消息量</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${result.flirtGrade}</span>
            <span class="card-stat-label">等级</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${result.relationshipStage || '-'}</span>
            <span class="card-stat-label">阶段</span>
          </div>
        </div>
      </div>

      <div class="card-section">
        <div class="card-section-title">一句总评</div>
        <div class="card-verdict">${escapeHtml(result.summary || result.verdict || '')}</div>
        ${stageText ? `<div class="card-stage">${stageText}</div>` : ''}
      </div>

      <div class="card-section">
        <div class="card-section-title">📡 五维</div>
        <div class="card-bars">
          ${(result.dimensions || []).map(d => {
            const pct = Math.max(d.score, d.score > 0 ? 8 : 0);
            return `
              <div class="card-bar-row">
                <div class="card-bar-label">${escapeHtml(d.label)}</div>
                <div class="card-bar-track">
                  <div class="card-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="card-bar-value">${d.score}</div>
              </div>`;
          }).join('')}
        </div>
      </div>

      ${advicePreview ? `
      <div class="card-section">
        <div class="card-section-title">💡 建议摘要</div>
        <div class="card-quote-bubble">
          <div class="card-quote-text">${advicePreview}</div>
        </div>
      </div>` : ''}

      <div class="card-footer">
        <div class="card-footer-text">
          Emotional Damage · ${escapeHtml(result.dateRange?.start || '')} ~ ${escapeHtml(result.dateRange?.end || '')}
        </div>
        <div class="card-footer-brand">💔 LLM 评测报告</div>
      </div>
    </div>
  `;
}
