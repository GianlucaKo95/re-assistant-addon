'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/backlog-network.js
 * D3 Force-Network für Backlog — Epic → Feature → Story Hierarchie
 */

let _networkSvg = null;
let _networkSim = null;
let _activeFilter = null;

function renderBacklogNetwork(bl) {
  const container = $('backlog-network-canvas');
  if (!container) return;

  // Cleanup
  if (_networkSim) { _networkSim.stop(); _networkSim = null; }
  container.innerHTML = '';

  if (!bl?.epics?.length) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><h3>Kein Backlog vorhanden</h3><p>Zuerst ein Backlog generieren.</p></div>';
    return;
  }

  // ── Nodes & Links aufbauen ─────────────────────────────────
  const nodes = [];
  const links = [];

  // Farben pro Epic
  const epicColors = [
    '#4f8ef7','#a371f7','#3fb950','#ff9a57','#39d3f2',
    '#f778ba','#e3b341','#f85149','#58a6ff','#56d364',
  ];

  // Root-Node
  nodes.push({ id: '__root__', type: 'root', label: bl.systemName || 'Backlog', r: 22, color: '#4f8ef7' });

  bl.epics.forEach((ep, ei) => {
    const color = epicColors[ei % epicColors.length];
    nodes.push({ id: ep.id, type: 'epic', label: ep.title, desc: ep.description, r: 18, color, epicColor: color });
    links.push({ source: '__root__', target: ep.id, type: 'root-epic' });

    (ep.features || []).forEach(f => {
      nodes.push({ id: f.id, type: 'feature', label: f.title, r: 12, color, epicColor: color, epicId: ep.id });
      links.push({ source: ep.id, target: f.id, type: 'epic-feature' });

      (f.stories || []).forEach(s => {
        const pColor = { high: '#f85149', medium: '#e3b341', low: '#3fb950' }[s.priority] || '#8b949e';
        nodes.push({ id: s.id, type: 'story', label: s.title, desc: s.description, sp: s.storyPoints, priority: s.priority, r: 7, color: pColor, epicColor: color, epicId: ep.id, featureId: f.id });
        links.push({ source: f.id, target: s.id, type: 'feature-story' });
      });
    });
  });

  // ── SVG Setup ─────────────────────────────────────────────
  const W = container.clientWidth || 800;
  const H = container.clientHeight || 600;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .style('background', 'transparent');

  _networkSvg = svg;

  // Zoom
  const g = svg.append('g');
  svg.call(d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => g.attr('transform', e.transform))
  );

  // ── Simulation ────────────────────────────────────────────
  _networkSim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(d => d.type === 'root-epic' ? 140 : d.type === 'epic-feature' ? 90 : 55)
      .strength(d => d.type === 'root-epic' ? 0.8 : 0.6)
    )
    .force('charge', d3.forceManyBody()
      .strength(d => d.type === 'root' ? -800 : d.type === 'epic' ? -400 : d.type === 'feature' ? -150 : -60)
    )
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.r + 8));

  // ── Links ─────────────────────────────────────────────────
  const link = g.append('g').selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => d.type === 'root-epic' ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)')
    .attr('stroke-width', d => d.type === 'root-epic' ? 2 : d.type === 'epic-feature' ? 1.5 : 1)
    .attr('stroke-dasharray', d => d.type === 'feature-story' ? '3,3' : null);

  // ── Nodes ─────────────────────────────────────────────────
  const node = g.append('g').selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'net-node')
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) _networkSim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) _networkSim.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('click', (e, d) => {
      e.stopPropagation();
      onNodeClick(d);
    });

  // Kreis
  node.append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => d.color + (d.type === 'story' ? 'cc' : 'dd'))
    .attr('stroke', d => d.color)
    .attr('stroke-width', d => d.type === 'root' ? 3 : 2)
    .attr('filter', d => d.type !== 'story' ? 'url(#glow)' : null);

  // Labels
  node.filter(d => d.type !== 'story').append('text')
    .attr('dy', d => d.r + 13)
    .attr('text-anchor', 'middle')
    .attr('font-size', d => d.type === 'root' ? 13 : d.type === 'epic' ? 11 : 10)
    .attr('font-weight', d => d.type !== 'feature' ? '600' : '400')
    .attr('fill', 'var(--t1)')
    .attr('pointer-events', 'none')
    .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '…' : d.label);

  // Glow-Filter
  const defs = svg.append('defs');
  const filter = defs.append('filter').attr('id', 'glow');
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Tick
  _networkSim.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Klick auf Hintergrund → Filter aufheben
  svg.on('click', () => {
    _activeFilter = null;
    node.select('circle').attr('opacity', 1);
    link.attr('opacity', 1);
    $('backlog-network-detail')?.remove();
  });

  // ── Legende ───────────────────────────────────────────────
  renderNetworkLegend(bl, nodes, node, link);
}

function onNodeClick(d) {
  // Filter/Highlight nach Epic-Zugehörigkeit
  const svg = _networkSvg;
  if (!svg) return;

  if (d.type === 'root') {
    _activeFilter = null;
    svg.selectAll('.net-node circle').attr('opacity', 1);
    svg.selectAll('line').attr('opacity', 1);
    showNetworkDetail(null);
    return;
  }

  const epicId = d.type === 'epic' ? d.id : d.epicId;

  if (_activeFilter === epicId) {
    // Toggle off
    _activeFilter = null;
    svg.selectAll('.net-node circle').attr('opacity', 1);
    svg.selectAll('line').attr('opacity', 1);
  } else {
    _activeFilter = epicId;
    svg.selectAll('.net-node circle').attr('opacity', nd =>
      nd.id === '__root__' || nd.id === epicId || nd.epicId === epicId ? 1 : 0.15
    );
    svg.selectAll('line').attr('opacity', l => {
      const sid = l.source.id || l.source;
      const tid = l.target.id || l.target;
      return sid === '__root__' || tid === epicId || sid === epicId ||
        l.source.epicId === epicId || l.target.epicId === epicId ? 1 : 0.08;
    });
  }

  showNetworkDetail(d);
}

function showNetworkDetail(d) {
  let panel = $('backlog-network-detail');
  if (!d) { panel?.remove(); return; }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'backlog-network-detail';
    panel.style.cssText = `
      position:absolute;right:12px;top:12px;width:240px;
      background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);
      padding:14px;font-size:12px;z-index:10;box-shadow:0 4px 20px rgba(0,0,0,.4);
    `;
    $('backlog-network-wrap').appendChild(panel);
  }

  const badge = { epic:'📦 Epic', feature:'🔹 Feature', story:'📝 Story' }[d.type] || '';
  const priLabel = { high:'🔴 Hoch', medium:'🟡 Mittel', low:'🟢 Niedrig' }[d.priority] || '';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <span style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">${badge}</span>
      <button id="net-detail-close" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;padding:0">✕</button>
    </div>
    <div style="font-weight:600;color:var(--t1);margin-bottom:6px;line-height:1.4">${esc(d.label)}</div>
    ${d.desc ? `<div style="color:var(--t2);line-height:1.5;margin-bottom:8px">${esc(d.desc)}</div>` : ''}
    ${d.sp ? `<div style="margin-bottom:4px"><span class="rtag">${d.sp} Story Points</span></div>` : ''}
    ${d.priority ? `<div>${priLabel}</div>` : ''}
    <div style="margin-top:8px;font-size:10px;color:var(--t3)">${esc(d.id)}</div>
  `;

  document.getElementById('net-detail-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _activeFilter = null;
    _networkSvg?.selectAll('.net-node circle').attr('opacity', 1);
    _networkSvg?.selectAll('line').attr('opacity', 1);
    panel.remove();
  });
}

function renderNetworkLegend(bl, nodes, nodeSel, linkSel) {
  const wrap = $('backlog-network-legend');
  if (!wrap) return;

  const epicColors = ['#4f8ef7','#a371f7','#3fb950','#ff9a57','#39d3f2','#f778ba','#e3b341','#f85149','#58a6ff','#56d364'];
  const storyCount = nodes.filter(n => n.type === 'story').length;
  const featCount  = nodes.filter(n => n.type === 'feature').length;

  wrap.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--t2)">
      <span>📦 ${bl.epics.length} Epics</span>
      <span>🔹 ${featCount} Features</span>
      <span>📝 ${storyCount} Stories</span>
      <span style="color:var(--t3)">|</span>
      ${bl.epics.map((ep, i) => `
        <button class="net-epic-filter" data-epic="${ep.id}"
          style="display:flex;align-items:center;gap:5px;background:none;border:1px solid ${epicColors[i%epicColors.length]}44;
          border-radius:99px;padding:2px 10px;cursor:pointer;color:${epicColors[i%epicColors.length]};font-size:10px">
          <span style="width:8px;height:8px;border-radius:50%;background:${epicColors[i%epicColors.length]};display:inline-block"></span>
          ${esc(ep.id)}
        </button>`).join('')}
      <button id="net-reset-filter" style="background:none;border:1px solid var(--b1);border-radius:99px;padding:2px 10px;cursor:pointer;color:var(--t3);font-size:10px">
        Alle anzeigen
      </button>
    </div>`;

  // Epic Filter Buttons
  wrap.querySelectorAll('.net-epic-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const epicNode = { type: 'epic', id: btn.dataset.epic, epicId: btn.dataset.epic };
      onNodeClick(epicNode);
    });
  });

  document.getElementById('net-reset-filter')?.addEventListener('click', () => {
    _activeFilter = null;
    _networkSvg?.selectAll('.net-node circle').attr('opacity', 1);
    _networkSvg?.selectAll('line').attr('opacity', 1);
    $('backlog-network-detail')?.remove();
  });
}

window.renderBacklogNetwork = renderBacklogNetwork;
