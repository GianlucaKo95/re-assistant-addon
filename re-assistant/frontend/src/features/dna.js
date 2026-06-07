'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/dna.js
 * Anforderungs-DNA — Frontend
 * Drift-Erkennung, Genealogie-View, semantisches Netzwerk-Graph.
 */

// ── DNA View laden ────────────────────────────────────────────
async function loadDNA() {
  S.systems = await window.api.getSystems();

  const sel = $('dna-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = () => loadDNADashboard();
  }

  $('btn-dna-recompute').onclick  = recomputeDNA;
  $('btn-dna-drift').onclick      = () => switchDNATab('drift');
  $('btn-dna-network').onclick    = () => switchDNATab('network');
  $('btn-dna-genealogy').onclick  = () => switchDNATab('genealogy');

  await loadDNADashboard();
}

function switchDNATab(tab) {
  ['drift','network','genealogy'].forEach(t => {
    $(`dna-tab-${t}`)?.classList.toggle('active', t === tab);
    $(`dna-panel-${t}`)?.style.setProperty('display', t === tab ? '' : 'none');
  });
  if (tab === 'drift')     loadDriftReport();
  if (tab === 'network')   loadNetworkGraph();
  if (tab === 'genealogy') loadGenealogyPanel();
}

async function loadDNADashboard() {
  const sysId = $('dna-sys-sel')?.value;
  if (!sysId) return;

  const [queue, drift] = await Promise.all([
    fetch('/api/dna/queue', { credentials:'include' }).then(r=>r.json()).catch(()=>({pending:0,processing:0})),
    fetch(`/api/dna/drift?systemId=${sysId}&threshold=0.2`, { credentials:'include' }).then(r=>r.json()).catch(()=>[]),
  ]);

  const statsWrap = $('dna-stats');
  if (statsWrap) statsWrap.innerHTML = `
    <div class="stat-card accent"><span class="stat-n">${queue.pending||0}</span><span class="stat-l">In Berechnung</span></div>
    <div class="stat-card"><span class="stat-n" style="color:var(--red)">${drift.filter(d=>d.drift.type==='scope_change').length}</span><span class="stat-l">Scope-Änderungen</span></div>
    <div class="stat-card"><span class="stat-n" style="color:var(--amb)">${drift.filter(d=>d.drift.type==='rewrite').length}</span><span class="stat-l">Rewrites</span></div>
    <div class="stat-card"><span class="stat-n" style="color:var(--grn)">${drift.filter(d=>d.drift.type==='refinement').length}</span><span class="stat-l">Verfeinerungen</span></div>`;

  switchDNATab('drift');
}

// ── Drift-Report ──────────────────────────────────────────────
async function loadDriftReport() {
  const sysId = $('dna-sys-sel')?.value;
  const wrap  = $('dna-panel-drift');
  if (!wrap) return;

  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Drift-Analyse …</p></div>';

  try {
    const drifts = await fetch(`/api/dna/drift${sysId?`?systemId=${sysId}`:''}&threshold=0.2`,
      { credentials:'include' }).then(r=>r.json());

    if (!drifts.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="es-icon">✅</div><h3>Kein signifikanter Drift erkannt</h3><p>Alle Anforderungen sind inhaltlich stabil.</p></div>';
      return;
    }

    const typeConfig = {
      scope_change: { label:'Scope-Änderung', color:'var(--red)',    icon:'⚠',  desc:'Inhalt hat sich fundamental verändert' },
      rewrite:      { label:'Rewrite',         color:'var(--amb)',   icon:'🔄', desc:'Anforderung wurde neu geschrieben' },
      refinement:   { label:'Verfeinerung',     color:'var(--grn)',  icon:'✦',  desc:'Anforderung wurde präzisiert' },
      none:         { label:'Stabil',           color:'var(--t3)',   icon:'·',  desc:'Kein Drift' },
    };

    wrap.innerHTML = `
      <div style="font-size:13px;color:var(--t2);margin-bottom:16px;line-height:1.6">
        Das System vergleicht jede Anforderung mit ihrer vorherigen Version und erkennt ob sich
        die <em>Bedeutung</em> geändert hat — nicht nur der Wortlaut.
      </div>
      ${drifts.map(d => {
        const cfg   = typeConfig[d.drift.type] || typeConfig.none;
        const pct   = Math.round(d.drift.score * 100);
        const when  = d.drift.detectedAt ? new Date(d.drift.detectedAt).toLocaleDateString('de-DE') : '—';
        return `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:13px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start">
          <div style="font-size:22px;flex-shrink:0">${cfg.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span class="req-id">${esc(d.id)}</span>
              <span style="font-size:10px;padding:1px 8px;border-radius:99px;background:${cfg.color}22;color:${cfg.color};font-weight:700">${cfg.label}</span>
              <span class="sbadge p-${d.priority}">${priLabel(d.priority)}</span>
              <span style="font-size:10px;color:var(--t3)">${esc(d.systemName)}</span>
            </div>
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(d.title)}</div>
            <div style="font-size:11px;color:var(--t3)">${cfg.desc} · Erkannt: ${when}</div>
            <div style="height:4px;background:var(--s3);border-radius:2px;margin-top:8px;overflow:hidden;max-width:200px">
              <div style="height:100%;width:${pct}%;background:${cfg.color};border-radius:2px"></div>
            </div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">Drift: ${pct}%</div>
          </div>
          <button class="btn-secondary" style="font-size:10px;padding:4px 10px;flex-shrink:0"
            onclick="openGenealogyModal('${d.id}','${esc(d.title)}')">
            🔍 Genealogie
          </button>
        </div>`;
      }).join('')}`;
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ── Netzwerk-Graph ────────────────────────────────────────────
async function loadNetworkGraph() {
  const sysId = $('dna-sys-sel')?.value;
  const wrap  = $('dna-panel-network');
  if (!wrap || !sysId) { if (wrap) wrap.innerHTML = '<div class="empty-state"><h3>System wählen</h3></div>'; return; }

  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Berechne Netzwerk …</p></div>';

  try {
    const crossSystem = $('dna-cross-system')?.checked;
    const data = await fetch(`/api/dna/network/${sysId}?crossSystem=${crossSystem}&minSim=0.65`,
      { credentials:'include' }).then(r=>r.json());

    if (!data.nodes.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">🧬</div>
          <h3>Noch keine DNA berechnet</h3>
          <p>Klicken Sie auf "DNA neu berechnen" um die Analyse zu starten.</p>
          <button class="btn-primary" style="margin-top:12px" onclick="recomputeDNA()">⚡ Jetzt berechnen</button>
        </div>`;
      return;
    }

    renderNetworkGraph(wrap, data);
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderNetworkGraph(wrap, data) {
  const { nodes, crossNodes, edges, genealogy } = data;
  const allNodes = [...nodes, ...crossNodes];

  // SVG-Dimensionen
  const W = Math.max(wrap.clientWidth || 800, 600);
  const H = Math.max(wrap.clientHeight || 500, 400);

  // Force-Layout simulieren (einfacher Spring-Layout)
  const positions = forceLayout(allNodes, edges, genealogy, W, H);

  // Kategorie-Farben
  const catColor = {
    'Funktional':'#a855f7', 'Nicht-funktional':'#0ea5e9', 'Sicherheit':'#f87171',
    'Performance':'#fbbf24', 'UI/UX':'#34d399', 'Daten':'#fb923c',
    'Integration':'#22d3ee', 'Wartbarkeit':'#8b5cf6',
  };

  const driftColor = { scope_change:'#f87171', rewrite:'#fbbf24', refinement:'#34d399', none:'transparent' };

  const svgEdges = edges.map(e => {
    const pa = positions[e.a], pb = positions[e.b];
    if (!pa || !pb) return '';
    const alpha = Math.round((e.similarity - 0.65) / 0.35 * 60 + 20);
    return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"
      stroke="${e.crossSystem ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.15)'}"
      stroke-width="${Math.max(1, e.similarity * 3)}" stroke-dasharray="${e.crossSystem?'4,3':''}"/>`;
  }).join('');

  const genEdges = genealogy.map(e => {
    const pa = positions[e.source], pb = positions[e.target];
    if (!pa || !pb) return '';
    const color = { decomposes_to:'#34d399', derives_from:'#0ea5e9', conflicts_with:'#f87171' }[e.type] || '#a855f7';
    return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"
      stroke="${color}" stroke-width="2" marker-end="url(#arrow-${e.type.replace('_','-')})"/>`;
  }).join('');

  const svgNodes = allNodes.map((n, i) => {
    const pos  = positions[n.id];
    if (!pos) return '';
    const r    = n.isCross ? 10 : 14;
    const fill = catColor[n.category] || '#6366f1';
    const ring = n.driftScore > 0.25 ? `<circle cx="${pos.x}" cy="${pos.y}" r="${r+4}" fill="none" stroke="${driftColor[n.driftType]||'transparent'}" stroke-width="2.5" stroke-dasharray="4,2"/>` : '';
    const qs   = n.qualityScore;
    const qsRing = qs != null ? `<circle cx="${pos.x}" cy="${pos.y}" r="${r+8}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>` : '';
    return `<g class="dna-node" onclick="openGenealogyModal('${n.id}','${esc(n.title.replace(/'/g,"\\'"))}')">
      ${qsRing}${ring}
      <circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fill}" opacity="${n.isCross?0.6:0.9}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <text x="${pos.x}" y="${pos.y+4}" text-anchor="middle" font-size="7" fill="white" font-family="system-ui">${n.id.substring(0,8)}</text>
      <title>${n.title} (${n.id})\nÄhnlich: ${edges.filter(e=>e.a===n.id||e.b===n.id).length} Verbindungen${n.driftScore>0.25?'\n⚠ Drift: '+n.driftType:''}</title>
    </g>`;
  }).join('');

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--b1);flex-shrink:0;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--t2)">${nodes.length} Anforderungen · ${edges.length} Verbindungen</span>
      <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="dna-cross-system" onchange="loadNetworkGraph()"/>
        Cross-System Verbindungen zeigen
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">
        ${Object.entries(catColor).map(([cat,col])=>`
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--t2)">
            <span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block"></span>${cat}
          </span>`).join('')}
      </div>
    </div>
    <div style="flex:1;overflow:hidden;position:relative">
      <svg id="dna-svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;cursor:grab"
        onwheel="dnaZoom(event)" onmousedown="dnaDragStart(event)" onmousemove="dnaDragMove(event)" onmouseup="dnaDragEnd()">
        <defs>
          ${['decomposes-to','derives-from','conflicts-with','relates-to'].map(t=>`
            <marker id="arrow-${t}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="${t==='conflicts-with'?'#f87171':t==='derives-from'?'#0ea5e9':'#34d399'}"/>
            </marker>`).join('')}
        </defs>
        <g id="dna-graph-group">
          <g id="dna-edges">${svgEdges}</g>
          <g id="dna-gen-edges">${genEdges}</g>
          <g id="dna-nodes">${svgNodes}</g>
        </g>
      </svg>
      <div style="position:absolute;bottom:10px;right:10px;display:flex;gap:5px">
        <button onclick="resetDNAView()" style="background:var(--s2);border:1px solid var(--b1);border-radius:7px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--t1)">⊡ Reset</button>
      </div>
    </div>`;

  initDNAGraphInteraction();
}

// ── Force-Layout ──────────────────────────────────────────────
function forceLayout(nodes, edges, genealogy, W, H) {
  const positions = {};
  const padding   = 60;

  // Initiale Positionen: Kreis
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const r     = Math.min(W, H) * 0.35;
    positions[n.id] = {
      x: W/2 + r * Math.cos(angle),
      y: H/2 + r * Math.sin(angle),
      vx: 0, vy: 0,
    };
  });

  // Iterativer Spring-Algorithmus (50 Iterationen)
  const allEdges = [
    ...edges.map(e => ({ a: e.a, b: e.b, strength: e.similarity })),
    ...genealogy.map(e => ({ a: e.source, b: e.target, strength: 0.9 })),
  ];

  for (let iter = 0; iter < 60; iter++) {
    const alpha = 1 - iter / 60;

    // Abstoßung zwischen allen Nodes
    for (const na of nodes) {
      for (const nb of nodes) {
        if (na.id === nb.id) continue;
        const pa  = positions[na.id], pb = positions[nb.id];
        const dx  = pb.x - pa.x, dy = pb.y - pa.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const force = (3000 / dist / dist) * alpha;
        pa.vx -= dx/dist * force; pa.vy -= dy/dist * force;
        pb.vx += dx/dist * force; pb.vy += dy/dist * force;
      }
    }

    // Anziehung entlang Kanten
    for (const e of allEdges) {
      const pa = positions[e.a], pb = positions[e.b];
      if (!pa || !pb) continue;
      const dx   = pb.x - pa.x, dy = pb.y - pa.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const target = 80 + (1 - e.strength) * 100;
      const force  = (dist - target) * 0.05 * alpha;
      pa.vx += dx/dist * force; pa.vy += dy/dist * force;
      pb.vx -= dx/dist * force; pb.vy -= dy/dist * force;
    }

    // Gravitation zur Mitte
    for (const n of nodes) {
      const p = positions[n.id];
      p.vx += (W/2 - p.x) * 0.005 * alpha;
      p.vy += (H/2 - p.y) * 0.005 * alpha;
    }

    // Positions updaten + Dämpfung
    for (const n of nodes) {
      const p = positions[n.id];
      p.vx *= 0.85; p.vy *= 0.85;
      p.x = Math.max(padding, Math.min(W-padding, p.x + p.vx));
      p.y = Math.max(padding, Math.min(H-padding, p.y + p.vy));
    }
  }

  return positions;
}

// ── Graph-Interaktion ─────────────────────────────────────────
let _dnaTransform = { x: 0, y: 0, scale: 1 };
let _dnaDragging  = false;
let _dnaDragStart = { x: 0, y: 0, tx: 0, ty: 0 };

function dnaZoom(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  _dnaTransform.scale = Math.max(0.3, Math.min(4, _dnaTransform.scale * delta));
  applyDNATransform();
}
function dnaDragStart(e) { _dnaDragging=true; _dnaDragStart={x:e.clientX,y:e.clientY,tx:_dnaTransform.x,ty:_dnaTransform.y}; }
function dnaDragMove(e) {
  if (!_dnaDragging) return;
  _dnaTransform.x = _dnaDragStart.tx + e.clientX - _dnaDragStart.x;
  _dnaTransform.y = _dnaDragStart.ty + e.clientY - _dnaDragStart.y;
  applyDNATransform();
}
function dnaDragEnd() { _dnaDragging = false; }
function applyDNATransform() {
  const g = document.getElementById('dna-graph-group');
  if (g) g.setAttribute('transform', `translate(${_dnaTransform.x},${_dnaTransform.y}) scale(${_dnaTransform.scale})`);
}
function resetDNAView() { _dnaTransform={x:0,y:0,scale:1}; applyDNATransform(); }
function initDNAGraphInteraction() { _dnaTransform={x:0,y:0,scale:1}; }

// ── Genealogie-Modal ──────────────────────────────────────────
async function openGenealogyModal(reqId, title) {
  openModal(`🧬 Genealogie: ${title}`, `
    <div id="genealogy-modal-content"><div class="empty-state"><div class="spin"></div></div></div>
    <button class="btn-secondary" style="margin-top:14px" onclick="closeModal()">Schließen</button>`);

  try {
    const data = await fetch(`/api/dna/genealogy/${reqId}`, { credentials:'include' }).then(r=>r.json());
    const relLabels = { decomposes_to:'Zerlegt in', derives_from:'Abgeleitet von', implements:'Implementiert',
      tests:'Testet', conflicts_with:'Widerspricht', duplicates:'Duplikat von', refines:'Verfeinert', relates_to:'Verwandt mit' };
    const relColors = { conflicts_with:'var(--red)', duplicates:'var(--amb)', decomposes_to:'var(--grn)',
      derives_from:'var(--blue)', relates_to:'var(--t3)', refines:'var(--grn)' };

    const renderGroup = (title, items, direction) => {
      if (!items.length) return '';
      return `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 7px">${title}</div>
        ${items.map(item => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--s1);border-radius:var(--r);margin-bottom:5px">
            <span style="font-size:16px">${direction}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600">${esc(item.title)}</div>
              <div style="font-size:10px;color:var(--t3)">${esc(item.id)} · ${esc(item.systemName||'')}</div>
            </div>
            <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${relColors[item.relationType]||'var(--s2)'}22;color:${relColors[item.relationType]||'var(--t3)'}">${relLabels[item.relationType]||item.relationType}</span>
            ${item.similarity ? `<span style="font-size:10px;color:var(--aa)">${Math.round(item.similarity*100)}%</span>` : ''}
          </div>`).join('')}`;
    };

    $('genealogy-modal-content').innerHTML = `
      ${renderGroup('Vorfahren (stammt ab von)', data.ancestors, '↑')}
      ${renderGroup('Nachkommen (zerlegt/abgeleitet)', data.descendants, '↓')}
      ${renderGroup('Semantisch ähnlich', data.similar, '↔')}
      ${!data.ancestors.length && !data.descendants.length && !data.similar.length
        ? '<div class="empty-state"><div class="es-icon">🧬</div><h3>Keine Beziehungen gefunden</h3><p>DNA noch nicht berechnet oder keine Ähnlichkeiten über Schwellwert.</p></div>'
        : ''}
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--b1)">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:8px">Beziehung manuell anlegen</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="gen-target-id" placeholder="Ziel-Anforderungs-ID" style="flex:1;font-size:12px"/>
          <select id="gen-rel-type" style="font-size:12px">
            ${Object.entries(relLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
          </select>
          <button class="btn-primary" style="font-size:11px" onclick="addGenealogyRelation('${reqId}')">+ Hinzufügen</button>
        </div>
      </div>`;
  } catch(e) {
    $('genealogy-modal-content').innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

async function addGenealogyRelation(sourceId) {
  const targetId = $('gen-target-id')?.value.trim();
  const relType  = $('gen-rel-type')?.value;
  if (!targetId) return;
  const res  = await fetch('/api/dna/genealogy', {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ sourceReqId: sourceId, targetReqId: targetId, relationType: relType }),
  });
  const data = await res.json();
  if (data.ok) { toast('✅ Beziehung angelegt'); closeModal(); }
  else toast('❌ ' + data.error);
}

async function recomputeDNA() {
  const sysId = $('dna-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  const res  = await fetch(`/api/dna/recompute/${sysId}`, { method:'POST', credentials:'include' });
  const data = await res.json();
  toast(`⚡ ${data.queued} Anforderungen in DNA-Queue eingereiht — Ergebnisse erscheinen in ~30 Sekunden`);
  if (typeof addNotif === 'function')
    addNotif('🧬', 'DNA-Berechnung gestartet', `${data.queued} Anforderungen werden analysiert`);
}

async function loadGenealogyPanel() {
  const wrap = $('dna-panel-genealogy');
  if (!wrap) return;
  wrap.innerHTML = `
    <div style="padding:16px;font-size:13px;color:var(--t2)">
      <p style="margin-bottom:12px">Klicken Sie auf eine Anforderung im Netzwerk oder geben Sie eine ID ein:</p>
      <div style="display:flex;gap:8px">
        <input type="text" id="genealogy-req-input" placeholder="Anforderungs-ID eingeben …" style="flex:1"/>
        <button class="btn-primary" onclick="lookupGenealogy()">Genealogie anzeigen</button>
      </div>
      <div id="genealogy-direct-result" style="margin-top:14px"></div>
    </div>`;
}

async function lookupGenealogy() {
  const id  = $('genealogy-req-input')?.value.trim();
  if (!id) return;
  const wrap = $('genealogy-direct-result');
  wrap.innerHTML = '<div class="spin"></div>';
  const data = await fetch(`/api/dna/genealogy/${id}`, { credentials:'include' }).then(r=>r.json());
  const total = data.ancestors.length + data.descendants.length + data.similar.length;
  wrap.innerHTML = total
    ? `<p style="font-size:12px;color:var(--grn)">✅ ${total} Beziehungen gefunden</p>
       <button class="btn-primary" style="margin-top:6px" onclick="openGenealogyModal('${id}','${id}')">Details anzeigen</button>`
    : '<p style="font-size:12px;color:var(--t3)">Keine Beziehungen gefunden.</p>';
}

// ── DNA-Badge auf Req-Card ────────────────────────────────────
async function getDNABadge(reqId) {
  try {
    const data = await fetch(`/api/requirements/${reqId}/dna`, { credentials:'include' }).then(r=>r.json());
    if (!data.computed) return '';
    if (data.drift.score < 0.25) return '';
    const icons = { scope_change:'⚠', rewrite:'🔄', refinement:'✦' };
    const icon  = icons[data.drift.type] || '';
    if (!icon) return '';
    return `<span style="font-size:10px;cursor:pointer;color:var(--amb)"
      title="DNA Drift: ${data.drift.type} (${Math.round(data.drift.score*100)}%)"
      onclick="openGenealogyModal('${reqId}','...')">${icon}</span>`;
  } catch(e) { return ''; }
}

// CSS
const dnaStyle = document.createElement('style');
dnaStyle.textContent = `
  .dna-node{cursor:pointer;transition:opacity .15s}
  .dna-node:hover circle{opacity:1!important;stroke:rgba(255,255,255,.6)!important}
  #dna-svg{user-select:none}`;
document.head.appendChild(dnaStyle);

window.loadDNA              = loadDNA;
window.switchDNATab         = switchDNATab;
window.loadDriftReport      = loadDriftReport;
window.loadNetworkGraph     = loadNetworkGraph;
window.loadGenealogyPanel   = loadGenealogyPanel;
window.openGenealogyModal   = openGenealogyModal;
window.addGenealogyRelation = addGenealogyRelation;
window.recomputeDNA         = recomputeDNA;
window.lookupGenealogy      = lookupGenealogy;
window.getDNABadge          = getDNABadge;
window.dnaZoom              = dnaZoom;
window.dnaDragStart         = dnaDragStart;
window.dnaDragMove          = dnaDragMove;
window.dnaDragEnd           = dnaDragEnd;
window.resetDNAView         = resetDNAView;
