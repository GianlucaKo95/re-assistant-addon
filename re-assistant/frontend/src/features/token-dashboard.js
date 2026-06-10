'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/token-dashboard.js
 * Token-Verbrauch Dashboard (Option A) + Feature-Budget-Verwaltung (Option B).
 */

const FEATURE_LABELS = {
  chat:         'Business Chat',
  qs:           'Qualitätssicherung',
  ac:           'Akzeptanzkriterien',
  source:       'Source-Code-Analyse',
  backlog:      'Backlog-Generierung',
  sprint:       'Sprint-Planung',
  dna:          'Anforderungs-DNA',
  decomposition:'Dekomposition',
  consistency:  'Konsistenzprüfung',
  completeness: 'Vollständigkeitsprüfung',
  diagrams:     'BPMN-Diagramme',
  workshop:     'Workshop-Strukturierung',
  changelog:    'Changelog',
  nlquery:      'KI-Abfragen',
  import:       'KI-Import',
  other:        'Sonstige',
};

const FEATURE_ICONS = {
  chat:'💬', qs:'🔬', ac:'✓', source:'💻', backlog:'📋', sprint:'🚀',
  dna:'🧬', decomposition:'⚡', consistency:'🔍', completeness:'📊',
  diagrams:'📐', workshop:'🎯', changelog:'📄', nlquery:'❓', import:'↓', other:'·',
};

async function loadTokenDashboard() {
  const wrap = $('token-dashboard-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Token-Statistiken …</p></div>';

  try {
    const months = parseInt($('token-months-sel')?.value || '3');
    const data   = await fetch(`/api/tokens/usage?months=${months}`, { credentials:'include' }).then(r=>r.json());
    renderTokenDashboard(data, wrap);
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderTokenDashboard(data, wrap) {
  const { total, currentMonth, byFeature, byDay, byUser, byModel, budgets, isAdmin } = data;

  const fmt = (n) => n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n||0);
  const fmtCost = (n) => '$' + (n||0).toFixed(2);
  const fmtEur  = (n) => '€' + ((n||0) * 0.92).toFixed(2);  // Näherung USD→EUR

  wrap.innerHTML = `
    <!-- KPI-Zeile -->
    <div class="stats-row" style="flex-shrink:0;padding:12px 20px;border-bottom:1px solid var(--b1)">
      <div class="stat-card accent">
        <span class="stat-n" style="font-size:20px">${fmtEur(currentMonth.costUsd)}</span>
        <span class="stat-l">Kosten diesen Monat</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${fmt(currentMonth.tokens)}</span>
        <span class="stat-l">Tokens diesen Monat</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${fmtEur(total.costUsd)}</span>
        <span class="stat-l">Gesamt (${$('token-months-sel')?.value||3} Monate)</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${total.requests}</span>
        <span class="stat-l">KI-Anfragen gesamt</span>
      </div>
    </div>

    <div style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px">

      <!-- Tages-Chart -->
      ${byDay.length > 1 ? `
        <div class="sg"><div class="sg-head">Kosten pro Tag (letzte 30 Tage)</div>
        <div class="sg-body" style="padding:12px">
          ${renderDayChart(byDay)}
        </div></div>` : ''}

      <!-- Feature-Verbrauch -->
      <div class="sg"><div class="sg-head">Verbrauch nach Feature</div>
      <div class="sg-body">
        ${byFeature.length ? byFeature.map(f => {
          const label  = FEATURE_LABELS[f.feature] || f.feature;
          const icon   = FEATURE_ICONS[f.feature] || '·';
          const pct    = total.costUsd > 0 ? (f.costUsd / total.costUsd * 100) : 0;
          const budget = budgets?.find(b => b.feature === f.feature);
          const budgetPct = budget?.monthlyLimit ? (budget.spentThisMonth / budget.monthlyLimit) : null;
          return `<div style="padding:8px 0;border-bottom:1px solid var(--b1)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
              <span style="font-size:14px;flex-shrink:0">${icon}</span>
              <span style="font-size:13px;font-weight:500;flex:1">${esc(label)}</span>
              <span style="font-size:12px;color:var(--t2)">${f.requests} Anfragen</span>
              <span style="font-size:13px;font-weight:600;color:var(--aa)">${fmtEur(f.costUsd)}</span>
            </div>
            <div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--aa);border-radius:3px"></div>
            </div>
            ${budgetPct !== null ? `
              <div style="font-size:10px;color:${budgetPct>0.8?'var(--red)':budgetPct>0.6?'var(--amb)':'var(--t3)'};margin-top:2px">
                Budget: ${Math.round(budgetPct*100)}% verbraucht (${fmtEur(budget.spentThisMonth)} / ${fmtEur(budget.monthlyLimit)})
              </div>` : ''}
          </div>`;
        }).join('') : '<div style="padding:12px;font-size:12px;color:var(--t3)">Noch keine KI-Anfragen.</div>'}
      </div></div>

      <!-- Nach User (nur Admin) -->
      ${isAdmin && byUser.length ? `
        <div class="sg"><div class="sg-head">Verbrauch nach Benutzer</div>
        <div class="sg-body">
          <table class="data-table">
            <thead><tr><th>Benutzer</th><th>Rolle</th><th>Anfragen</th><th>Kosten (USD)</th><th>Kosten (EUR)</th></tr></thead>
            <tbody>
              ${byUser.map(u => `<tr>
                <td><div style="font-size:13px;font-weight:500">${esc(u.name)}</div><div style="font-size:11px;color:var(--t3)">${esc(u.email||'')}</div></td>
                <td><span class="sbadge rb-${u.role}">${roleLabel(u.role)}</span></td>
                <td>${u.requests}</td>
                <td>${fmtCost(u.costUsd)}</td>
                <td style="font-weight:600;color:var(--aa)">${fmtEur(u.costUsd)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div></div>` : ''}

      <!-- Modell-Aufteilung -->
      ${byModel.length > 1 ? `
        <div class="sg"><div class="sg-head">Kosten nach Modell</div>
        <div class="sg-body">
          ${byModel.map(m => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px">
              <code style="color:var(--ab)">${esc(m.model)}</code>
              <span>${m.requests} Anfragen</span>
              <strong style="color:var(--aa)">${fmtEur(m.costUsd)}</strong>
            </div>`).join('')}
        </div></div>` : ''}

      <!-- Export -->
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" style="font-size:12px" onclick="exportTokenUsage()">↓ CSV exportieren</button>
        ${isAdmin ? `<button class="btn-primary" style="font-size:12px" onclick="switchDashboardTab('budgets')">⚙ Budgets verwalten</button>` : ''}
      </div>
    </div>`;
}

function renderDayChart(byDay) {
  if (!byDay.length) return '';
  const maxCost = Math.max(...byDay.map(d => d.costUsd), 0.001);
  const W = 560, H = 80, pad = 20;
  const barW = Math.max(2, (W - pad*2) / byDay.length - 1);

  const bars = byDay.map((d, i) => {
    const h   = Math.max(2, (d.costUsd / maxCost) * (H - pad));
    const x   = pad + i * ((W - pad*2) / byDay.length);
    const y   = H - h;
    const col = d.costUsd > maxCost * 0.8 ? '#f87171' : d.costUsd > maxCost * 0.4 ? '#fbbf24' : '#a855f7';
    const day = new Date(d.day).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${col}" rx="2" opacity="0.8">
      <title>${day}: $${d.costUsd.toFixed(4)} (${(d.tokens/1000).toFixed(1)}K Tokens)</title>
    </rect>`;
  }).join('');

  // X-Labels (jeden 5. Tag)
  const labels = byDay.filter((_,i) => i % 5 === 0).map((d, i, arr) => {
    const origI = byDay.indexOf(d);
    const x = pad + origI * ((W - pad*2) / byDay.length);
    const day = new Date(d.day).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
    return `<text x="${x}" y="${H+12}" font-size="9" fill="rgba(255,255,255,.4)" text-anchor="middle">${day}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H+16}" style="width:100%;height:96px">
    ${bars}${labels}
    <text x="${W-pad}" y="12" font-size="9" fill="rgba(255,255,255,.4)" text-anchor="end">$${maxCost.toFixed(2)} max</text>
  </svg>`;
}

// ── Option B: Feature-Budget-Verwaltung ───────────────────────
async function loadBudgetManagement() {
  const wrap = $('budget-management-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div></div>';

  try {
    const budgets = await fetch('api/tokens/budgets', { credentials:'include' }).then(r=>r.json());
    renderBudgetManagement(budgets, wrap);
  } catch(e) {
    wrap.innerHTML = `<div style="color:var(--red);padding:16px">${esc(e.message)}</div>`;
  }
}

function renderBudgetManagement(budgets, wrap) {
  const fmtEur = (n) => n != null ? '€' + (n * 0.92).toFixed(2) : '—';

  wrap.innerHTML = `
    <div style="font-size:13px;color:var(--t2);margin-bottom:14px;line-height:1.6">
      Steuern Sie welche KI-Features aktiv sind und setzen Sie monatliche Kostenlimits.
      Bei 80% des Limits erscheint eine Warnung, bei 100% wird das Feature automatisch gesperrt.
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Feature</th><th>Aktiv</th><th>Monat-Budget (USD)</th>
        <th>Verbraucht</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="budget-table-body">
        ${budgets.map(b => renderBudgetRow(b)).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;padding:12px 14px;background:var(--s2);border-radius:var(--r);font-size:12px;color:var(--t2)">
      💡 <strong>Empfehlung:</strong> Source-Code-Analyse und Backlog-Generierung sind am teuersten (~$0.15/Anforderung).
      Chat und QS-Prüfung sind günstig (~$0.02). Setzen Sie Limits für teure Features um Überraschungen zu vermeiden.
    </div>`;
}

function renderBudgetRow(b) {
  const label = FEATURE_LABELS[b.feature] || b.feature;
  const icon  = FEATURE_ICONS[b.feature] || '·';
  const spent = b.spentThisMonth || 0;
  const limit = b.monthlyLimit;
  const pct   = limit ? spent / limit : null;
  const statusCol = !b.enabled ? 'var(--red)' : pct > 0.9 ? 'var(--red)' : pct > 0.7 ? 'var(--amb)' : 'var(--grn)';
  const statusLabel = !b.enabled ? 'Gesperrt' : pct > 1 ? 'Limit erreicht' : pct > 0.8 ? 'Warnung' : 'OK';

  return `<tr id="brow-${b.feature}">
    <td>
      <span style="font-size:14px;margin-right:6px">${icon}</span>
      <strong>${esc(label)}</strong>
    </td>
    <td>
      <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
        <input type="checkbox" ${b.enabled?'checked':''} onchange="toggleFeature('${b.feature}',this.checked)"
          style="width:16px;height:16px"/>
      </label>
    </td>
    <td>
      <div style="display:flex;gap:5px;align-items:center">
        <input type="number" id="limit-${b.feature}" value="${limit!=null?limit:''}"
          placeholder="kein Limit" min="0" step="1"
          style="width:100px;font-size:12px;padding:4px 7px"/>
        <span style="font-size:11px;color:var(--t3)">USD</span>
      </div>
    </td>
    <td>
      <div style="font-size:12px">$${spent.toFixed(2)}</div>
      ${pct !== null ? `<div style="height:4px;background:var(--s3);border-radius:2px;margin-top:3px;overflow:hidden;width:80px">
        <div style="height:100%;width:${Math.min(100,pct*100).toFixed(0)}%;background:${statusCol};border-radius:2px"></div>
      </div>` : ''}
    </td>
    <td><span style="font-size:11px;color:${statusCol};font-weight:600">${statusLabel}</span></td>
    <td>
      <button class="btn-secondary" style="font-size:11px;padding:3px 9px"
        onclick="saveBudget('${b.feature}')">Speichern</button>
    </td>
  </tr>`;
}

async function toggleFeature(feature, enabled) {
  const limitInput = $(`limit-${feature}`);
  const limitVal   = limitInput?.value ? parseFloat(limitInput.value) : null;
  await fetch(`/api/tokens/budgets/${feature}`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ enabled, monthlyLimitUsd: limitVal }),
  });
  toast(`${enabled ? '✅ aktiviert' : '🚫 deaktiviert'}: ${FEATURE_LABELS[feature]||feature}`);
  // Frontend-Features-Cache aktualisieren
  await refreshFeatureStatus();
}

async function saveBudget(feature) {
  const el      = $(`limit-${feature}`);
  const enabled = document.querySelector(`#brow-${feature} input[type=checkbox]`)?.checked;
  const limit   = el?.value ? parseFloat(el.value) : null;
  await fetch(`/api/tokens/budgets/${feature}`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ enabled: enabled !== false, monthlyLimitUsd: limit }),
  });
  toast(`✅ Budget gespeichert: ${FEATURE_LABELS[feature]||feature} ${limit?`($${limit}/Monat)`:'(kein Limit)'}`);
}

// ── Feature-Status im Frontend cachen ────────────────────────
let _featureStatus = {};

async function refreshFeatureStatus() {
  try {
    _featureStatus = await fetch('api/tokens/features', { credentials:'include' }).then(r=>r.json());
    updateDisabledFeatureUI();
  } catch(e) {}
}

function isFeatureEnabled(feature) {
  return _featureStatus[feature]?.enabled !== false;
}

function updateDisabledFeatureUI() {
  // Buttons für deaktivierte Features ausgrauen
  for (const [feat, status] of Object.entries(_featureStatus)) {
    if (!status.enabled) {
      document.querySelectorAll(`[data-feature="${feat}"]`).forEach(el => {
        el.disabled = true;
        el.title    = `Feature deaktiviert (${FEATURE_LABELS[feat]||feat})`;
        el.style.opacity = '0.4';
      });
    }
  }
}

// ── Tab-Switching ─────────────────────────────────────────────
function switchDashboardTab(tab) {
  ['usage','budgets'].forEach(t => {
    $(`token-tab-${t}`)?.classList.toggle('active', t === tab);
    $(`token-panel-${t}`)?.style.setProperty('display', t === tab ? '' : 'none');
  });
  if (tab === 'usage')   loadTokenDashboard();
  if (tab === 'budgets') loadBudgetManagement();
}

// ── Export ────────────────────────────────────────────────────
async function exportTokenUsage() {
  const months = parseInt($('token-months-sel')?.value || '3');
  const data   = await fetch(`/api/tokens/usage?months=${months}`, { credentials:'include' }).then(r=>r.json());
  const e = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'Feature,Anfragen,Input-Tokens,Output-Tokens,Kosten (USD),Kosten (EUR)\n';
  for (const f of data.byFeature)
    csv += [FEATURE_LABELS[f.feature]||f.feature, f.requests, f.input, f.output,
            f.costUsd.toFixed(4), (f.costUsd*0.92).toFixed(4)].map(e).join(',') + '\n';
  csv += `\nGesamt,,${data.total.inputTokens},${data.total.outputTokens},${data.total.costUsd.toFixed(4)},${(data.total.costUsd*0.92).toFixed(4)}\n`;
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv' });
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`token-usage-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Token-Usage exportiert');
}

// Init beim App-Start
window.loadTokenDashboard    = loadTokenDashboard;
window.loadBudgetManagement  = loadBudgetManagement;
window.switchDashboardTab    = switchDashboardTab;
window.toggleFeature         = toggleFeature;
window.saveBudget            = saveBudget;
window.exportTokenUsage      = exportTokenUsage;
window.isFeatureEnabled      = isFeatureEnabled;
window.refreshFeatureStatus  = refreshFeatureStatus;
window.FEATURE_LABELS        = FEATURE_LABELS;

// Feature-Status beim Start laden
document.addEventListener('DOMContentLoaded', () => {
  if (typeof S !== 'undefined' && S.user) refreshFeatureStatus();
});
