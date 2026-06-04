'use strict';
/**
 * ba/dashboard.js
 * 🟡 FIX 7: Business Analyst Dashboard — Übersichtsseite mit KPIs und Schnellzugriff.
 */

async function loadBaDashboard() {
  S.systems    = await window.api.getSystems();
  S.requirements = await window.api.getRequirements({});

  const mySystems = S.systems.filter(s => (S.user.systems||[]).includes(s.id));
  const allReqs   = S.requirements;

  // KPIs berechnen
  const totalReqs   = allReqs.length;
  const openReqs    = allReqs.filter(r => r.status === 'open').length;
  const withQS      = allReqs.filter(r => r.qualityScore != null).length;
  const avgQS       = withQS
    ? (allReqs.filter(r => r.qualityScore != null).reduce((s, r) => s + r.qualityScore, 0) / withQS).toFixed(1)
    : '—';
  const lowQS       = allReqs.filter(r => r.qualityScore != null && r.qualityScore < 5).length;
  const workshops   = await window.api.getWorkshops('');
  const diagrams    = await window.api.getDiagrams('');

  const wrap = $('ba-dashboard-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card accent">
        <span class="stat-n">${totalReqs}</span>
        <span class="stat-l">Anforderungen</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${openReqs}</span>
        <span class="stat-l">Offen</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${avgQS}</span>
        <span class="stat-l">Ø QS-Score</span>
      </div>
      <div class="stat-card${lowQS > 0 ? ' accent' : ''}">
        <span class="stat-n" style="${lowQS > 0 ? 'color:var(--red)' : ''}">${lowQS}</span>
        <span class="stat-l">Kritische QS</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${workshops.length}</span>
        <span class="stat-l">Workshops</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${diagrams.length}</span>
        <span class="stat-l">Diagramme</span>
      </div>
    </div>

    <!-- Schnellzugriff -->
    <div style="padding:16px 20px 8px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Schnellzugriff
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        ${[
          { icon:'🔬', label:'QS starten', view:'ba-quality', sub:'ISO 29148 Bewertung' },
          { icon:'📄', label:'Dokumente analysieren', view:'ba-docanalysis', sub:'Requirements extrahieren' },
          { icon:'📊', label:'Diagramm erstellen', view:'ba-diagrams', sub:'BPMN & Kontext' },
          { icon:'🎯', label:'Workshop starten', view:'ba-workshop', sub:'Live-Moderation' },
          { icon:'🔗', label:'Abhängigkeiten', view:'dependencies', sub:'Visualisieren' },
          { icon:'📋', label:'Vorlagen nutzen', view:'templates', sub:'Schnell erfassen' },
        ].map(item => `
          <div onclick="switchView('${item.view}')" style="
            background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);
            padding:14px;cursor:pointer;transition:all .15s;
          " onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background='var(--s1)'">
            <div style="font-size:22px;margin-bottom:8px">${item.icon}</div>
            <div style="font-size:13px;font-weight:600">${item.label}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">${item.sub}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Anforderungen mit niedrigem QS-Score -->
    ${lowQS > 0 ? `
    <div style="padding:0 20px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        ⚠ Anforderungen mit kritischem QS-Score (&lt; 5)
      </div>
      ${allReqs.filter(r => r.qualityScore != null && r.qualityScore < 5).slice(0, 5).map(r => {
        const sys = S.systems.find(s => s.id === r.systemId);
        return `<div style="background:var(--redbg);border:1px solid rgba(248,113,113,.2);border-radius:var(--r);padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px;cursor:pointer"
          onclick="switchView('ba-quality')">
          <span style="font-size:18px;font-weight:700;color:var(--red)">${r.qualityScore}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${esc(r.title)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(sys?.name||'')} · ${esc(r.id)}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`;
      }).join('')}
      ${lowQS > 5 ? `<div style="font-size:12px;color:var(--t3);padding:4px 0">… und ${lowQS - 5} weitere. <button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="switchView('ba-quality')">Alle ansehen</button></div>` : ''}
    </div>` : ''}

    <!-- Systeme-Übersicht -->
    <div style="padding:0 20px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Systeme &amp; Anforderungen
      </div>
      ${S.systems.map(sys => {
        const sysReqs  = allReqs.filter(r => r.systemId === sys.id);
        const sysQS    = sysReqs.filter(r => r.qualityScore != null);
        const avgSysQS = sysQS.length ? (sysQS.reduce((s,r) => s + r.qualityScore, 0) / sysQS.length).toFixed(1) : null;
        const col      = avgSysQS == null ? 'var(--t3)' : avgSysQS >= 7 ? 'var(--grn)' : avgSysQS >= 4 ? 'var(--amb)' : 'var(--red)';
        return `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${esc(sys.name)}</div>
            <div style="font-size:11px;color:var(--t3)">${sysReqs.length} Anforderungen · ${(sys.docs||[]).length} Dokumente</div>
          </div>
          ${avgSysQS != null ? `<div style="text-align:right"><div style="font-size:16px;font-weight:700;color:${col}">${avgSysQS}</div><div style="font-size:9px;color:var(--t3)">Ø QS</div></div>` : ''}
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
            onclick="$('qs-sys-select').value='${sys.id}';switchView('ba-quality')">
            QS starten
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

window.loadBaDashboard = loadBaDashboard;
