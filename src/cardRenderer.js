/**
 * 分享卡片渲染器
 * 生成可截图/导出的白底卡片
 */

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

/**
 * 渲染分享卡片到指定容器
 * @param {HTMLElement} container - 卡片容器
 * @param {Object} result - 分析结果
 */
export function renderShareCard(container, result) {
  container.innerHTML = `
    <div class="card-inner">
      <!-- Header -->
      <div class="card-header">
        <div class="card-brand">
          <span class="card-brand-icon">💔</span>
          <span class="card-brand-text">Emotional Damage</span>
        </div>
        <div class="card-title">暧昧探测报告</div>
        <div class="card-subtitle">${escapeHtml(result.theirName)}</div>
      </div>

      <!-- Score -->
      <div class="card-score-section">
        <div class="card-score-ring">
          <svg viewBox="0 0 140 140" style="width:140px;height:140px">
            <circle cx="70" cy="70" r="62" fill="none" stroke="#f0f0f0" stroke-width="8" />
            <circle cx="70" cy="70" r="62" fill="none" stroke="${result.gradeColor}" stroke-width="8"
              stroke-dasharray="${2 * Math.PI * 62}" stroke-dashoffset="${2 * Math.PI * 62 * (1 - result.flirtScore / 100)}"
              transform="rotate(-90,70,70)" stroke-linecap="round"
              style="transition: stroke-dashoffset 1.5s ease" />
            <text x="70" y="55" text-anchor="middle" font-size="36" font-weight="800" fill="#1a1a2e">${result.flirtScore}</text>
            <text x="70" y="78" text-anchor="middle" font-size="12" fill="#888">暧昧指数</text>
            <text x="70" y="102" text-anchor="middle" font-size="20" font-weight="700" fill="${result.gradeColor}">${result.flirtGrade}级</text>
          </svg>
        </div>
        <div class="card-score-stats">
          <div class="card-stat">
            <span class="card-stat-value">${result.totalMessages}</span>
            <span class="card-stat-label">总消息</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${result.flirtScore}</span>
            <span class="card-stat-label">暧昧指数</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${result.tags[0]?.text?.split(' ')[1] || '-'}</span>
            <span class="card-stat-label">最大标签</span>
          </div>
        </div>
      </div>

      <!-- 信号分类条 -->
      <div class="card-section">
        <div class="card-section-title">📡 信号分布</div>
        <div class="card-bars">
          ${renderCardBars(result)}
        </div>
      </div>

      <!-- 双向对比 -->
      <div class="card-section">
        <div class="card-section-title">⚖️ 双向对比</div>
        <div class="card-bilateral">
          <div class="card-bi-item">
            <div class="card-bi-label">你</div>
            <div class="card-bi-bar-track">
              <div class="card-bi-bar-fill me" style="width:${result.bilateral.meFlirtRatio}%"></div>
            </div>
            <div class="card-bi-num">${result.bilateral.meFlirtRatio}%</div>
          </div>
          <div class="card-bi-item">
            <div class="card-bi-label">TA</div>
            <div class="card-bi-bar-track">
              <div class="card-bi-bar-fill them" style="width:${result.bilateral.themFlirtRatio}%"></div>
            </div>
            <div class="card-bi-num">${result.bilateral.themFlirtRatio}%</div>
          </div>
        </div>
        <div class="card-verdict">${result.bilateral.verdict}</div>
      </div>

      <!-- Top Quote -->
      ${result.topQuotes.length > 0 ? `
      <div class="card-section">
        <div class="card-section-title">💬 最有暧昧感的一句话</div>
        <div class="card-quote-bubble">
          <div class="card-quote-text">"${escapeHtml(result.topQuotes[0].text)}"</div>
          <div class="card-quote-meta">— ${escapeHtml(result.topQuotes[0].sender)} · ${result.topQuotes[0].date}</div>
        </div>
      </div>
      ` : ''}

      <!-- Tags -->
      <div class="card-section">
        <div class="card-section-title">🏷️ 关系画像</div>
        <div class="card-tags">
          ${result.tags.map(t => `<span class="card-tag">${t.text}</span>`).join('')}
        </div>
      </div>

      <!-- Footer -->
      <div class="card-footer">
        <div class="card-footer-text">
          Emotional Damage · ${result.dateRange.start} ~ ${result.dateRange.end}
        </div>
        <div class="card-footer-brand">💔 情感伤害研究所</div>
      </div>
    </div>
  `;
}

function renderCardBars(result) {
  const maxVal = Math.max(...Object.values(result.signalTotals), 1);
  const labels = {
    intimateName: '💕 亲昵称呼',
    missing: '🥺 想念',
    lateNight: '🌙 深夜亲密',
    flirtyAction: '🫶 暧昧动作',
    flirtyEmoji: '😘 暧昧表情',
  };
  return Object.entries(result.signalTotals)
    .map(([key, val]) => {
      const pct = Math.max((val / maxVal) * 100, val > 0 ? 15 : 0);
      return `
        <div class="card-bar-row">
          <div class="card-bar-label">${labels[key] || key}</div>
          <div class="card-bar-track">
            <div class="card-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="card-bar-value">${val}</div>
        </div>
      `;
    })
    .join('');
}
