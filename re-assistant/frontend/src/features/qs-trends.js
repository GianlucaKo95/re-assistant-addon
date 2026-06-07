'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/qs-trends.js
 * H: QS-Qualitätstrends — historische Scores, Charts, Team-Dashboard.
 */

async function loadQSTrends() {
  S.systems = await window.api.getSystems();
  const sel = $('qs-trends-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = () => fetchAndRenderTrends();
  }
  $('qs-trends-days')?.addEventListener('change', fetchAndRenderTrends);
  await fetchAndRenderTrends();
}

async function fetchAndRenderTrends() {
  const sysId = $('qs-trends-sys-sel')?.value || '';
  const days  = $('qs-trends-days')?.value || '30';
  const wrap  = $('qs-trends-wrap');
  if (!wrap) return;

  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Trend-Daten …</p></div>';

  try {
    const url = '/api/qs/trends?' + new URLSearchParams({ systemId: sysId, days }).toString();
    const data = await fetch(url, { credentials:'include' }).then(r=>r.json());
    renderTrends(data, sysId, parseInt(days));
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler beim Laden</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderTrends(data, sysId, days) {
  const wrap = $('qs-trends-wrap');

  const avgCol  = data.avg >= 7 ? 'var(--grn)' : data.avg >= 4 ? 'var(--amb)' : 'var(--red)';
  const sysList = sysId
    ? S.systems.filter(s => s.id === sysId)
    : S.systems;

  wrap.innerHTML = `
    <!-- KPIs -->
    <div class="stats-row">
      <div class="stat-card accent">
        <span class="stat-n" style="color:${avgCol}">${data.avg.toFixed(1)}</span>
        <span class="stat-l">Ø QS-Score</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${data.total}</span>
        <span class="stat-l">Bewertet</span>
      </div>
      <div class="stat-card">
        <span class="stat-n" style="color:var(--grn)">${data.high}</span>
        <span class="stat-l">Score ≥ 8</span>
      </div>
      <div class="stat-card">
        <span class="stat-n" style="color:var(--red)">${data.low}</span>
        <span class="stat-l">Score &lt; 5</span>
      </div>
    </div>

    <!-- Trend-Chart -->
    <div style="padding:0 20px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Durchschnittlicher QS-Score — letzte ${days} Tage
      </div>
      ${data.trend.length > 1
        ? renderLineChart(data.trend)
        : '<div style="color:var(--t3);font-size:12px;padding:16px 0">Noch zu wenige Datenpunkte für einen Trend-Chart. Führen Sie die QS-Prüfung regelmäßig durch.</div>'}
    </div>

    <!-- Kategorie-Übersicht -->
    ${data.categoryStats.length ? `
    <div style="padding:0 20px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Qualität nach Kategorie
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${data.categoryStats.map(cat => {
          const col = cat.avg>=7?'var(--grn)':cat.avg>=4?'var(--amb)':'var(--red)';
          return `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:12px 14px">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px">${esc(cat.category)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <div style="font-size:22px;font-weight:700;color:${col}">${cat.avg.toFixed(1)}</div>
              <div style="font-size:11px;color:var(--t3)">${cat.count} Anforderungen</div>
            </div>
            <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${cat.avg*10}%;background:${col};border-radius:3px"></div>
            </div>
            ${cat.low > 0 ? `<div style="font-size:10px;color:var(--red);margin-top:4px">${cat.low} unter Score 5</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Schlechteste Anforderungen -->
    ${data.scores.length ? `
    <div style="padding:0 20px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Anforderungen mit niedrigstem QS-Score
      </div>
      <div style="border:1px solid var(--b1);border-radius:var(--rl);overflow:hidden">
        ${data.scores.slice(0,10).map(r => {
          const col = r.score>=7?'var(--grn)':r.score>=4?'var(--amb)':'var(--red)';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--b1);transition:background .12s" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background=''">
            <div style="font-size:18px;font-weight:700;min-width:32px;text-align:center;color:${col}">${r.score}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500">${esc(r.title)}</div>
              <div style="font-size:10px;color:var(--t3)">${esc(r.id)} · ${esc(r.category)}</div>
            </div>
            <div style="height:32px;width:80px;background:var(--s2);border-radius:4px;overflow:hidden;display:flex;align-items:flex-end">
              <div style="width:100%;height:${r.score*10}%;background:${col};transition:height .4s"></div>
            </div>
            <button class="btn-secondary" style="font-size:10px;padding:3px 9px;flex-shrink:0"
              onclick="switchView('ba-quality')">QS verbessern</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Export -->
    <div style="padding:0 20px 16px">
      <button class="btn-secondary" onclick="exportQSTrends(${JSON.stringify(data).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
        ↓ CSV exportieren
      </button>
    </div>`;
}

function renderLineChart(trend) {
  if (!trend.length) return '';
  const maxVal = Math.max(...trend.map(t=>t.avg), 10);
  const minVal = Math.min(...trend.map(t=>t.avg), 0);
  const w = 600, h = 120, pad = 30;
  const xStep = (w - pad*2) / Math.max(trend.length - 1, 1);
  const yScale = (val) => h - pad - ((val - minVal) / (maxVal - minVal + 0.01)) * (h - pad*2);

  const points = trend.map((t, i) => `${pad + i*xStep},${yScale(t.avg)}`).join(' ');
  const area   = `${pad},${h-pad} ${points} ${pad + (trend.length-1)*xStep},${h-pad}`;

  return `<div style="overflow-x:auto">
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:600px;height:120px">
      <!-- Hintergrund-Linien -->
      ${[0,2,4,6,8,10].map(v => {
        const y = yScale(v);
        return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
                 <text x="${pad-4}" y="${y+4}" font-size="9" fill="rgba(255,255,255,.3)" text-anchor="end">${v}</text>`;
      }).join('')}
      <!-- Bereich-Füllung -->
      <polygon points="${area}" fill="rgba(168,85,247,.08)"/>
      <!-- Linie -->
      <polyline points="${points}" fill="none" stroke="rgba(168,85,247,.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Punkte -->
      ${trend.map((t,i) => {
        const x = pad + i*xStep, y = yScale(t.avg);
        const col = t.avg>=7?'#10b981':t.avg>=4?'#f59e0b':'#ef4444';
        return `<circle cx="${x}" cy="${y}" r="4" fill="${col}"/>
                 <title>${t.date}: ${t.avg.toFixed(1)}</title>`;
      }).join('')}
      <!-- X-Labels (jeden N-ten Tag) -->
      ${trend.filter((_,i)=>i%Math.ceil(trend.length/6)===0).map((t,_,arr) => {
        const i = trend.indexOf(t);
        return `<text x="${pad+i*xStep}" y="${h-4}" font-size="9" fill="rgba(255,255,255,.4)" text-anchor="middle">${t.date.substring(5)}</text>`;
      }).join('')}
    </svg>
  </div>`;
}

function exportQSTrends(data) {
  const e = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'ID,Titel,QS-Score,Kategorie,Priorität,Letzte Änderung\n';
  for (const r of data.scores)
    csv += [r.id, r.title, r.score, r.category, r.priority, new Date(r.updatedAt).toLocaleDateString('de-DE')].map(e).join(',') + '\n';
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `qs-trends-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ QS-Trends exportiert');
}

window.loadQSTrends          = loadQSTrends;
window.fetchAndRenderTrends  = fetchAndRenderTrends;
window.exportQSTrends        = exportQSTrends;

// ── Window Globals ──────────────────────────────────────────
window.renderTrends = renderTrends;
window.renderLineChart = renderLineChart;
