'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/req-network.js
 * Netzwerkdarstellung der Anforderungen — Obsidian-Style
 * D3.js Force-Simulation mit System- und Themen-Clustering
 */

let _network = null; // Aktuelle Simulation

async function loadReqNetwork() {
  const wrap = $('req-network-wrap');
  if (!wrap) return;

  // System-Filter befüllen
  S.systems = S.systems?.length ? S.systems : await window.api.getSystems();
  const sysSel = $('network-sys-sel');
  if (sysSel) {
    sysSel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sysSel.addEventListener('change', renderNetwork);
  }

  $('network-cluster-sel')?.addEventListener('change', renderNetwork);
  $('network-search')?.addEventListener('input', debounceNetwork);
  $('btn-network-fullscreen')?.addEventListener('click', toggleNetworkFullscreen);
  $('btn-network-reset')?.addEventListener('click', () => {
    if (_network) { _network.alpha(0.5).restart(); }
  });

  await renderNetwork();
}

async function renderNetwork() {
  const wrap = $('req-network-canvas');
  if (!wrap) return;

  const sysId   = $('network-sys-sel')?.value || '';
  const cluster = $('network-cluster-sel')?.value || 'system';
  const search  = ($('network-search')?.value || '').toLowerCase();

  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Netzwerk …</p></div>';

  // Daten laden
  const reqs = await window.api.getRequirements(sysId ? { systemId: sysId } : {});
  if (!reqs.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="es-icon">🕸</div><h3>Keine Anforderungen</h3><p>System auswählen und Anforderungen anlegen.</p></div>';
    return;
  }

  // Filter anwenden
  const filtered = search
    ? reqs.filter(r => r.title?.toLowerCase().includes(search) || r.description?.toLowerCase().includes(search))
    : reqs;

  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state"><h3>Keine Treffer</h3></div>';
    return;
  }

  // Knoten und Kanten aufbauen
  const nodes = [];
  const links = [];
  const clusterMap = {};

  // Cluster-Farben
  const COLORS = [
    '#4f8ef7','#a371f7','#3fb950','#e3b341','#f85149',
    '#58a6ff','#d2a8ff','#56d364','#e3b341','#ff7b72',
    '#79c0ff','#d2a8ff','#7ee787','#ffa657','#ffa198',
  ];

  // Cluster-Gruppen bestimmen
  const getCluster = (req) => {
    if (cluster === 'system') {
      const sys = S.systems?.find(s => s.id === req.systemId);
      return sys?.name || 'Unbekannt';
    }
    if (cluster === 'category') return req.category || 'Unbekannt';
    if (cluster === 'priority') return req.priority || 'medium';
    if (cluster === 'status')   return req.status || 'open';
    return 'Standard';
  };

  // Cluster-Farben zuweisen
  let colorIdx = 0;
  filtered.forEach(req => {
    const cl = getCluster(req);
    if (!clusterMap[cl]) {
      clusterMap[cl] = { name: cl, color: COLORS[colorIdx++ % COLORS.length], count: 0 };
    }
    clusterMap[cl].count++;
  });

  // Cluster-Knoten (zentrale Hub-Knoten)
  const clusterNodes = Object.values(clusterMap).map((cl, i) => ({
    id: `cluster-${cl.name}`,
    label: cl.name,
    type: 'cluster',
    color: cl.color,
    size: 20 + cl.count * 2,
    cluster: cl.name,
  }));
  nodes.push(...clusterNodes);

  // Requirement-Knoten
  const reqNodes = filtered.map(req => {
    const cl = getCluster(req);
    return {
      id: req.id,
      label: req.title?.substring(0, 40) || req.id,
      fullLabel: req.title,
      type: 'req',
      color: clusterMap[cl]?.color || '#58a6ff',
      size: 8 + (req.qualityScore || 5) * 0.5,
      cluster: cl,
      priority: req.priority,
      status: req.status,
      systemId: req.systemId,
      req,
    };
  });
  nodes.push(...reqNodes);

  // Links: Req → Cluster
  reqNodes.forEach(n => {
    links.push({ source: n.id, target: `cluster-${n.cluster}`, type: 'cluster' });
  });

  // Links: Ähnliche Anforderungen verbinden (gleiche Tags oder Kategorie)
  const tagMap = {};
  filtered.forEach(req => {
    (req.tags || []).forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(req.id);
    });
  });
  Object.values(tagMap).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length - 1; i++) {
      links.push({ source: ids[i], target: ids[i+1], type: 'tag' });
    }
  });

  // D3 laden falls nicht vorhanden
  if (!window.d3) {
    await loadD3();
  }
  if (!window.d3) {
    wrap.innerHTML = '<div class="empty-state"><h3>D3.js nicht verfügbar</h3></div>';
    return;
  }

  renderD3Network(wrap, nodes, links, clusterMap);
}

function renderD3Network(container, nodes, links, clusterMap) {
  const d3 = window.d3;
  container.innerHTML = '';

  const W = container.offsetWidth  || 800;
  const H = container.offsetHeight || 600;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .style('background', 'var(--bg)');

  // Zoom & Pan
  const g = svg.append('g');
  svg.call(d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => g.attr('transform', event.transform))
  );

  // Arrowhead
  svg.append('defs').append('marker')
    .attr('id','arrow').attr('viewBox','0 -5 10 10')
    .attr('refX',18).attr('refY',0)
    .attr('markerWidth',6).attr('markerHeight',6)
    .attr('orient','auto')
    .append('path').attr('d','M0,-5L10,0L0,5').attr('fill','var(--b2)');

  // Simulation
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(d => d.type === 'cluster' ? 80 : 120)
      .strength(d => d.type === 'cluster' ? 0.8 : 0.3))
    .force('charge', d3.forceManyBody().strength(d => d.type === 'cluster' ? -200 : -80))
    .force('center', d3.forceCenter(W/2, H/2))
    .force('collision', d3.forceCollide().radius(d => d.size + 4));

  _network = sim;

  // Links zeichnen
  const link = g.append('g').selectAll('line')
    .data(links).join('line')
    .attr('stroke', d => d.type === 'cluster' ? 'var(--b2)' : 'var(--b1)')
    .attr('stroke-opacity', d => d.type === 'cluster' ? 0.4 : 0.6)
    .attr('stroke-width', d => d.type === 'cluster' ? 1 : 1.5)
    .attr('stroke-dasharray', d => d.type === 'tag' ? '4,2' : null);

  // Knoten zeichnen
  const nodeGroup = g.append('g').selectAll('g')
    .data(nodes).join('g')
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',  (event, d) => { d.fx=event.x; d.fy=event.y; })
      .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      if (d.type === 'req') showNodeDetail(d);
    })
    .on('mouseover', (event, d) => showTooltip(event, d))
    .on('mouseout', hideTooltip);

  // Kreis
  nodeGroup.append('circle')
    .attr('r', d => d.size)
    .attr('fill', d => d.type === 'cluster' ? d.color + '33' : d.color + 'cc')
    .attr('stroke', d => d.color)
    .attr('stroke-width', d => d.type === 'cluster' ? 2 : 1.5);

  // Label für Cluster-Knoten
  nodeGroup.filter(d => d.type === 'cluster').append('text')
    .text(d => d.label.length > 15 ? d.label.substring(0,13)+'…' : d.label)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('fill', d => d.color)
    .style('pointer-events', 'none');

  // Label für Req-Knoten (nur bei Hover via CSS)
  nodeGroup.filter(d => d.type === 'req').append('text')
    .text(d => d.label.length > 20 ? d.label.substring(0,18)+'…' : d.label)
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.size + 12)
    .attr('font-size', '9px')
    .attr('fill', 'var(--t2)')
    .style('pointer-events', 'none')
    .style('opacity', '0')
    .classed('node-label', true);

  // Simulation Tick
  sim.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Legende
  const legend = svg.append('g').attr('transform', 'translate(16,16)');
  Object.values(clusterMap).slice(0, 8).forEach((cl, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 20})`);
    row.append('circle').attr('r', 6).attr('cx', 6).attr('cy', 0)
      .attr('fill', cl.color + '44').attr('stroke', cl.color).attr('stroke-width', 1.5);
    row.append('text').text(`${cl.name} (${cl.count})`)
      .attr('x', 16).attr('dy', '0.35em')
      .attr('font-size', '11px').attr('fill', 'var(--t2)');
  });

  // Knoten-Anzahl
  svg.append('text')
    .text(`${nodes.filter(n=>n.type==='req').length} Anforderungen · ${Object.keys(clusterMap).length} Cluster`)
    .attr('x', W - 10).attr('y', H - 10)
    .attr('text-anchor', 'end')
    .attr('font-size', '11px')
    .attr('fill', 'var(--t3)');

  // Hover: Labels einblenden
  nodeGroup.filter(d => d.type === 'req')
    .on('mouseover', function(event, d) {
      d3.select(this).select('.node-label').style('opacity', '1');
      showTooltip(event, d);
    })
    .on('mouseout', function(event, d) {
      d3.select(this).select('.node-label').style('opacity', '0');
      hideTooltip();
    });
}

// ── Tooltip ───────────────────────────────────────────────────
let _tooltip = null;
function showTooltip(event, d) {
  if (!_tooltip) {
    _tooltip = document.createElement('div');
    _tooltip.style.cssText = `
      position:fixed;background:var(--s1);border:1px solid var(--b1);
      border-radius:var(--rl);padding:10px 12px;font-size:12px;
      pointer-events:none;z-index:9999;max-width:260px;
      box-shadow:0 4px 16px rgba(0,0,0,.3);
    `;
    document.body.appendChild(_tooltip);
  }
  if (d.type === 'cluster') {
    _tooltip.innerHTML = `<strong style="color:${d.color}">${esc(d.label)}</strong><br>
      <span style="color:var(--t2)">${d.size > 20 ? Math.round((d.size-20)/2) : 0} Anforderungen</span>`;
  } else {
    const sys = S.systems?.find(s => s.id === d.req?.systemId);
    _tooltip.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px">${esc(d.fullLabel || d.label)}</div>
      <div style="color:var(--t2);font-size:11px">${esc(d.cluster)}</div>
      ${sys ? `<div style="color:var(--t3);font-size:10px">${esc(sys.name)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:5px">
        <span class="sbadge p-${d.priority}" style="font-size:9px">${priLabel(d.priority)}</span>
        <span class="sbadge s-${d.status}" style="font-size:9px">${statusLabel(d.status)}</span>
      </div>`;
  }
  _tooltip.style.left = (event.clientX + 12) + 'px';
  _tooltip.style.top  = (event.clientY - 10) + 'px';
  _tooltip.style.display = 'block';
}
function hideTooltip() {
  if (_tooltip) _tooltip.style.display = 'none';
}

// ── Node Detail Panel ─────────────────────────────────────────
function showNodeDetail(node) {
  const req = node.req;
  if (!req) return;
  const sys = S.systems?.find(s => s.id === req.systemId);
  openModal(`📋 ${esc(req.title)}`, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="sbadge p-${req.priority}">${priLabel(req.priority)}</span>
      <span class="sbadge s-${req.status}">${statusLabel(req.status)}</span>
      ${sys ? `<span class="rtag">${esc(sys.name)}</span>` : ''}
      ${req.category ? `<span class="rtag">${esc(req.category)}</span>` : ''}
    </div>
    ${req.description ? `<p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:12px">${esc(req.description)}</p>` : ''}
    ${req.qualityScore != null ? `
      <div style="font-size:12px;color:var(--t2)">QS-Score:
        <strong style="color:${req.qualityScore>=7?'var(--grn)':req.qualityScore>=4?'var(--amb)':'var(--red)'}">${req.qualityScore}/10</strong>
      </div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn-primary" style="font-size:12px" id="btn-net-open-req">📝 Anforderung öffnen</button>
      <button class="btn-secondary" style="font-size:12px" id="btn-net-close">Schließen</button>
    </div>`);
  setTimeout(() => {
    document.getElementById('btn-net-open-req')?.addEventListener('click', () => {
      closeModal();
      switchView('business-reqs');
    });
    document.getElementById('btn-net-close')?.addEventListener('click', closeModal);
  }, 0);
}

// ── Fullscreen ────────────────────────────────────────────────
function toggleNetworkFullscreen() {
  const view = $('view-req-network');
  if (!view) return;
  view.classList.toggle('network-fullscreen');
  const btn = $('btn-network-fullscreen');
  if (btn) btn.textContent = view.classList.contains('network-fullscreen') ? '⊠ Verkleinern' : '⛶ Vollbild';
  setTimeout(renderNetwork, 100);
}

// ── D3 dynamisch laden ────────────────────────────────────────
async function loadD3() {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

// ── Debounce für Suche ────────────────────────────────────────
let _debounceTimer;
function debounceNetwork() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(renderNetwork, 300);
}

window.loadReqNetwork          = loadReqNetwork;
window.renderNetwork           = renderNetwork;
window.toggleNetworkFullscreen = toggleNetworkFullscreen;
