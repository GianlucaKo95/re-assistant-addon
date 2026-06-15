'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/traceability.js
 * Traceability-Graph: Anforderung → User Story → Testfall
 * D3.js hierarchischer Graph mit Zoom/Pan, Inline-Editing, KI-Generierung
 */

let _traceData   = null;
let _traceSysId  = null;
let _traceFilter = 'all';

// ── View laden ────────────────────────────────────────────────
async function loadTraceability() {
  S.systems = await window.api.getSystems();

  const sel = $('trace-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s => {
        const indent = s.level > 0 ? '└ '.repeat(s.level) : '';
        return `<option value="${s.id}">${indent}${esc(s.name)}</option>`;
      }).join('');
    sel.addEventListener('change', () => renderTraceGraph());
  }

  $('trace-filter-sel')?.addEventListener('change', function() {
    _traceFilter = this.value;
    renderTraceGraph();
  });

  $('btn-trace-generate')?.addEventListener('click', generateAllUserStories);
  $('btn-trace-export')?.addEventListener('click', exportTraceability);
  $('btn-trace-fullscreen')?.addEventListener('click', toggleTraceFullscreen);
}

// ── Daten laden und Graph rendern ─────────────────────────────
async function renderTraceGraph() {
  const sysId = $('trace-sys-sel')?.value;
  if (!sysId) return;
  _traceSysId = sysId;

  const wrap = $('trace-graph-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Traceability-Daten …</p></div>';

  try {
    const [reqs, stories, testCases] = await Promise.all([
      window.api.getRequirements({ systemId: sysId }),
      window.api.getUserStories({ systemId: sysId }),
      window.api.getTestCases({ systemId: sysId }),
    ]);

    _traceData = { reqs, stories, testCases };
    updateTraceStats(reqs, stories, testCases);

    // Filter anwenden
    const filteredReqs = _traceFilter === 'incomplete'
      ? reqs.filter(r => !stories.some(s => s.reqId === r.id))
      : _traceFilter === 'complete'
      ? reqs.filter(r => stories.some(s => s.reqId === r.id))
      : reqs;

    if (!filteredReqs.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="es-icon">🕸</div><h3>Keine Anforderungen</h3><p>Wähle ein System mit Anforderungen.</p></div>';
      return;
    }

    if (!window.d3) await loadD3();
    if (!window.d3) {
      renderTraceTable(wrap, filteredReqs, stories, testCases);
      return;
    }

    renderD3TraceGraph(wrap, filteredReqs, stories, testCases);
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3 style="color:var(--red)">Fehler: ${esc(e.message)}</h3></div>`;
  }
}

// ── D3 Hierarchischer Graph ───────────────────────────────────
function renderD3TraceGraph(container, reqs, stories, testCases) {
  const d3 = window.d3;
  container.innerHTML = '';

  const W = container.offsetWidth  || 900;
  const H = container.offsetHeight || 600;

  // Hierarchie aufbauen
  const root = {
    id: 'root', label: 'Anforderungen', type: 'root', children:
      reqs.map(req => ({
        id: req.id,
        label: req.title?.substring(0, 35) || req.id,
        fullLabel: req.title,
        type: 'req',
        priority: req.priority,
        status: req.status,
        req,
        children: stories
          .filter(s => s.reqId === req.id)
          .map(story => ({
            id: story.id,
            label: story.title?.substring(0, 30) || story.id,
            fullLabel: story.title,
            type: 'story',
            status: story.status,
            storyPoints: story.storyPoints,
            story,
            children: testCases
              .filter(t => t.storyId === story.id)
              .map(tc => ({
                id: tc.id,
                label: tc.title?.substring(0, 28) || tc.id,
                fullLabel: tc.title,
                type: 'testcase',
                status: tc.status,
                tc,
                children: [],
              })),
          })),
      })),
  };

  const hierarchy = d3.hierarchy(root);
  const nodeCount = hierarchy.descendants().length;

  // Layout: Tree-Layout horizontal
  const treeLayout = d3.tree()
    .size([H - 80, W - 200])
    .separation((a, b) => a.parent === b.parent ? 1.2 : 1.8);

  treeLayout(hierarchy);

  const svg = d3.select(container).append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('background', 'var(--bg)');

  const g = svg.append('g').attr('transform', 'translate(100,40)');

  svg.call(d3.zoom()
    .scaleExtent([0.1, 3])
    .on('zoom', event => g.attr('transform', event.transform)));

  // Verbindungslinien
  const link = g.append('g').selectAll('path')
    .data(hierarchy.links().filter(d => d.source.data.type !== 'root'))
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', d => {
      if (d.target.data.type === 'story')    return 'rgba(79,142,247,.4)';
      if (d.target.data.type === 'testcase') return 'rgba(63,185,80,.4)';
      return 'var(--b2)';
    })
    .attr('stroke-width', 1.5)
    .attr('d', d3.linkHorizontal()
      .x(d => d.y)
      .y(d => d.x));

  // Knoten
  const nodeGroup = g.append('g').selectAll('g')
    .data(hierarchy.descendants().filter(d => d.data.type !== 'root'))
    .join('g')
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      openTraceNodeDetail(d.data);
    });

  // Knoten-Hintergrund je Typ
  const nodeColors = {
    req:      { fill: 'rgba(79,142,247,.12)',  stroke: '#4f8ef7' },
    story:    { fill: 'rgba(163,113,247,.12)', stroke: '#a371f7' },
    testcase: { fill: 'rgba(63,185,80,.12)',   stroke: '#3fb950' },
  };

  const nodeW = { req: 140, story: 120, testcase: 110 };
  const nodeH = 32;

  nodeGroup.append('rect')
    .attr('x', d => -(nodeW[d.data.type] || 120) / 2)
    .attr('y', -nodeH / 2)
    .attr('width', d => nodeW[d.data.type] || 120)
    .attr('height', nodeH)
    .attr('rx', 6)
    .attr('fill', d => nodeColors[d.data.type]?.fill || 'var(--s2)')
    .attr('stroke', d => nodeColors[d.data.type]?.stroke || 'var(--b1)')
    .attr('stroke-width', 1.5);

  // Status-Indikator
  nodeGroup.append('circle')
    .attr('cx', d => -(nodeW[d.data.type] || 120) / 2 + 10)
    .attr('cy', 0)
    .attr('r', 4)
    .attr('fill', d => {
      const s = d.data.status;
      if (s === 'done' || s === 'passed') return 'var(--grn)';
      if (s === 'in-progress' || s === 'failed') return 'var(--amb)';
      return 'var(--t3)';
    });

  // Label
  nodeGroup.append('text')
    .text(d => d.data.label)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', d => d.data.type === 'req' ? '11px' : '10px')
    .attr('fill', 'var(--t1)')
    .style('pointer-events', 'none');

  // Typ-Icon links
  const typeIcons = { req: '📋', story: '📖', testcase: '🧪' };
  nodeGroup.filter(d => d.data.type !== 'root').append('text')
    .text(d => typeIcons[d.data.type] || '')
    .attr('x', d => -(nodeW[d.data.type] || 120) / 2 + 22)
    .attr('dy', '0.35em')
    .attr('font-size', '9px')
    .style('pointer-events', 'none');

  // "+ Story" Button für Anforderungen ohne Stories
  nodeGroup.filter(d => d.data.type === 'req' && d.data.children?.length === 0)
    .append('text')
    .text('+ Story')
    .attr('x', d => (nodeW[d.data.type] || 140) / 2 + 8)
    .attr('dy', '0.35em')
    .attr('font-size', '9px')
    .attr('fill', 'var(--aa)')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      openAddStoryModal(d.data.req);
    });

  // Legende
  const legend = svg.append('g').attr('transform', 'translate(16,16)');
  [
    { color: '#4f8ef7', label: '📋 Anforderung' },
    { color: '#a371f7', label: '📖 User Story' },
    { color: '#3fb950', label: '🧪 Testfall' },
  ].forEach((item, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 20})`);
    row.append('rect').attr('width', 12).attr('height', 12).attr('y', -10)
      .attr('rx', 3).attr('fill', item.color + '33').attr('stroke', item.color).attr('stroke-width', 1.5);
    row.append('text').text(item.label).attr('x', 18).attr('dy', '0.1em')
      .attr('font-size', '11px').attr('fill', 'var(--t2)');
  });

  // Stats
  svg.append('text')
    .text(`${reqs.length} Anforderungen · ${stories.length} User Stories · ${testCases.length} Testfälle`)
    .attr('x', W - 10).attr('y', H - 10)
    .attr('text-anchor', 'end').attr('font-size', '11px').attr('fill', 'var(--t3)');
}

// ── Fallback: Tabellen-Ansicht ────────────────────────────────
function renderTraceTable(container, reqs, stories, testCases) {
  container.innerHTML = `
    <div style="overflow-x:auto;padding:16px">
      <table class="data-table" style="min-width:700px">
        <thead><tr>
          <th>Anforderung</th>
          <th>User Stories</th>
          <th>Testfälle</th>
          <th>Status</th>
          <th>Aktionen</th>
        </tr></thead>
        <tbody>
          ${reqs.map(req => {
            const reqStories  = stories.filter(s => s.reqId === req.id);
            const reqTests    = testCases.filter(t => reqStories.some(s => s.id === t.storyId));
            const complete    = reqStories.length > 0 && reqTests.length > 0;
            return `<tr>
              <td>
                <div style="font-weight:600;font-size:13px">${esc(req.title?.substring(0,50)||req.id)}</div>
                <code style="font-size:10px;color:var(--t3)">${esc(req.id)}</code>
              </td>
              <td>
                ${reqStories.length > 0
                  ? reqStories.map(s => `<div style="font-size:12px;color:var(--t2)">📖 ${esc(s.title?.substring(0,40))}</div>`).join('')
                  : '<span style="color:var(--t3);font-size:11px">Keine</span>'}
              </td>
              <td>
                ${reqTests.length > 0
                  ? `<span style="color:var(--grn);font-size:12px">🧪 ${reqTests.length} Testfälle</span>`
                  : '<span style="color:var(--t3);font-size:11px">Keine</span>'}
              </td>
              <td>
                <span style="font-size:11px;padding:2px 8px;border-radius:99px;
                  background:${complete?'var(--grnbg)':'var(--ambbg)'};
                  color:${complete?'var(--grn)':'var(--amb)'}">
                  ${complete ? '✓ Vollständig' : '⚠ Lücke'}
                </span>
              </td>
              <td>
                <button class="btn-secondary" style="font-size:11px;padding:3px 9px"
                  onclick="openAddStoryModal(${JSON.stringify({id:req.id,title:req.title}).replace(/"/g,'&quot;')})">
                  + Story
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Stats aktualisieren ───────────────────────────────────────
function updateTraceStats(reqs, stories, testCases) {
  const withStory = reqs.filter(r => stories.some(s => s.reqId === r.id)).length;
  const withTest  = reqs.filter(r => {
    const rs = stories.filter(s => s.reqId === r.id);
    return rs.some(s => testCases.some(t => t.storyId === s.id));
  }).length;
  const coverage  = reqs.length ? Math.round((withStory / reqs.length) * 100) : 0;

  if ($('trace-stat-reqs'))    $('trace-stat-reqs').textContent    = reqs.length;
  if ($('trace-stat-stories')) $('trace-stat-stories').textContent = stories.length;
  if ($('trace-stat-tests'))   $('trace-stat-tests').textContent   = testCases.length;
  if ($('trace-stat-cover'))   $('trace-stat-cover').textContent   = coverage + '%';
  if ($('trace-stat-gaps'))    $('trace-stat-gaps').textContent    = reqs.length - withStory;
}

// ── Node Detail öffnen ────────────────────────────────────────
function openTraceNodeDetail(node) {
  if (node.type === 'req')      openReqTraceDetail(node);
  else if (node.type === 'story')    openStoryDetail(node);
  else if (node.type === 'testcase') openTestCaseDetail(node);
}

function openReqTraceDetail(node) {
  const req = node.req;
  const stories  = _traceData?.stories.filter(s => s.reqId === req.id) || [];
  const allTests = _traceData?.testCases || [];

  openModal(`📋 ${esc(req.title)}`, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="sbadge p-${req.priority}">${priLabel(req.priority)}</span>
      <span class="sbadge s-${req.status}">${statusLabel(req.status)}</span>
    </div>
    ${req.description ? `<p style="font-size:13px;color:var(--t2);margin-bottom:14px">${esc(req.description)}</p>` : ''}

    <div style="font-size:12px;font-weight:700;color:var(--t3);text-transform:uppercase;
      letter-spacing:.06em;margin-bottom:8px">User Stories (${stories.length})</div>
    ${stories.length ? stories.map(s => {
      const tests = allTests.filter(t => t.storyId === s.id);
      return `<div style="background:var(--s2);border-radius:var(--r);padding:8px 10px;
        margin-bottom:6px;font-size:12px">
        <div style="font-weight:600">📖 ${esc(s.title)}</div>
        <div style="color:var(--t3);margin-top:3px">🧪 ${tests.length} Testfälle</div>
      </div>`;
    }).join('') : `<div style="color:var(--t3);font-size:12px;margin-bottom:10px">Keine User Stories</div>`}

    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn-primary" style="font-size:12px" id="btn-add-story-from-detail">+ Story hinzufügen</button>
      <button class="btn-secondary" style="font-size:12px" id="btn-gen-stories-detail">✦ KI generieren</button>
      <button class="btn-secondary" style="font-size:12px" onclick="closeModal()">Schließen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('btn-add-story-from-detail')?.addEventListener('click', () => {
      closeModal(); openAddStoryModal(req);
    });
    document.getElementById('btn-gen-stories-detail')?.addEventListener('click', () => {
      closeModal(); generateUserStoriesForReq(req);
    });
  }, 0);
}

function openStoryDetail(node) {
  const story = node.story;
  const tests = _traceData?.testCases.filter(t => t.storyId === story.id) || [];

  openModal(`📖 ${esc(story.title)}`, `
    ${story.description ? `<p style="font-size:13px;color:var(--t2);margin-bottom:12px">${esc(story.description)}</p>` : ''}
    ${story.acceptanceCriteria?.length ? `
      <div style="font-size:12px;font-weight:700;color:var(--t3);margin-bottom:6px">Akzeptanzkriterien</div>
      <ul style="font-size:12px;color:var(--t2);padding-left:16px;margin-bottom:12px">
        ${story.acceptanceCriteria.map(ac => `<li>${esc(ac)}</li>`).join('')}
      </ul>` : ''}
    <div style="font-size:12px;font-weight:700;color:var(--t3);margin-bottom:8px">Testfälle (${tests.length})</div>
    tests.length ? tests.map(t => "<div style="background:var(--s2);border-radius:var(--r);padding:8px 10px;margin-bottom:6px;font-size:12px">         <div style="display:flex;justify-content:space-between">           <span>🧪 ' + (esc(t.title)) + '</span>           <span style="color:' + (t.status==='passed'?'var(--grn)':t.status==='failed'?'var(--red)':'var(--t3)') + '">             ' + (t.status) + '           </span>         </div>").join("")}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-primary" style="font-size:12px" id="btn-add-test">+ Testfall</button>
      <button class="btn-danger" style="font-size:12px" id="btn-del-story">Löschen</button>
      <button class="btn-secondary" style="font-size:12px" onclick="closeModal()">Schließen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('btn-add-test')?.addEventListener('click', () => {
      closeModal(); openAddTestModal(story);
    });
    document.getElementById('btn-del-story')?.addEventListener('click', async () => {
      if (!confirm('User Story löschen?')) return;
      await window.api.deleteUserStory(story.id);
      closeModal(); renderTraceGraph();
    });
  }, 0);
}

function openTestCaseDetail(node) {
  const tc = node.tc;
  openModal(`🧪 ${esc(tc.title)}`, `
    ${tc.expected ? `<div style="font-size:13px;color:var(--t2);margin-bottom:12px">
      <strong>Erwartetes Ergebnis:</strong> ${esc(tc.expected)}</div>` : ''}
    ${tc.steps?.length ? `
      <div style="font-size:12px;font-weight:700;color:var(--t3);margin-bottom:6px">Schritte</div>
      <ol style="font-size:12px;color:var(--t2);padding-left:16px">
        ${tc.steps.map(s => `<li style="margin-bottom:4px">${esc(s)}</li>`).join('')}
      </ol>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn-primary" style="font-size:12px" id="btn-tc-pass">✓ Bestanden</button>
      <button class="btn-danger"  style="font-size:12px" id="btn-tc-fail">✕ Fehlgeschlagen</button>
      <button class="btn-secondary" style="font-size:12px" onclick="closeModal()">Schließen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('btn-tc-pass')?.addEventListener('click', async () => {
      await window.api.saveTestCase({ ...tc, status: 'passed' });
      closeModal(); renderTraceGraph(); toast('✅ Testfall bestanden');
    });
    document.getElementById('btn-tc-fail')?.addEventListener('click', async () => {
      await window.api.saveTestCase({ ...tc, status: 'failed' });
      closeModal(); renderTraceGraph(); toast('❌ Testfall fehlgeschlagen');
    });
  }, 0);
}

// ── User Story hinzufügen ─────────────────────────────────────
function openAddStoryModal(req) {
  openModal(`📖 User Story für „${esc(req.title?.substring(0,30))}"`, `
    <div class="frow">
      <label>Titel</label>
      <input type="text" id="story-title-inp" placeholder="Als [Rolle] möchte ich …" autofocus/>
    </div>
    <div class="frow">
      <label>Beschreibung / Damit …</label>
      <textarea id="story-desc-inp" rows="2" placeholder="Damit …"></textarea>
    </div>
    <div class="frow">
      <label>Akzeptanzkriterien (eine pro Zeile)</label>
      <textarea id="story-ac-inp" rows="3" placeholder="AC1: …&#10;AC2: …"></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="frow">
        <label>Priorität</label>
        <select id="story-prio-sel">
          <option value="high">Hoch</option>
          <option value="medium" selected>Mittel</option>
          <option value="low">Niedrig</option>
        </select>
      </div>
      <div class="frow">
        <label>Story Points</label>
        <input type="number" id="story-points-inp" min="1" max="21" placeholder="3"/>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" id="btn-save-story">💾 Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('btn-save-story')?.addEventListener('click', async () => {
      const title = document.getElementById('story-title-inp')?.value.trim();
      if (!title) { toast('⚠ Titel erforderlich'); return; }
      const ac = (document.getElementById('story-ac-inp')?.value || '')
        .split('\n').map(s => s.trim()).filter(Boolean);
      await window.api.saveUserStory({
        reqId: req.id, systemId: _traceSysId,
        title,
        description: document.getElementById('story-desc-inp')?.value.trim() || '',
        acceptanceCriteria: ac,
        priority: document.getElementById('story-prio-sel')?.value || 'medium',
        storyPoints: parseInt(document.getElementById('story-points-inp')?.value) || null,
        status: 'open',
      });
      closeModal(); renderTraceGraph(); toast('✅ User Story gespeichert');
    });
  }, 0);
}

// ── Testfall hinzufügen ───────────────────────────────────────
function openAddTestModal(story) {
  openModal(`🧪 Testfall für „${esc(story.title?.substring(0,30))}"`, `
    <div class="frow">
      <label>Titel</label>
      <input type="text" id="tc-title-inp" placeholder="Testfall-Bezeichnung" autofocus/>
    </div>
    <div class="frow">
      <label>Schritte (eine pro Zeile)</label>
      <textarea id="tc-steps-inp" rows="4" placeholder="1. Öffne …&#10;2. Klicke auf …&#10;3. Prüfe …"></textarea>
    </div>
    <div class="frow">
      <label>Erwartetes Ergebnis</label>
      <input type="text" id="tc-expected-inp" placeholder="System zeigt …"/>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" id="btn-save-tc">💾 Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('btn-save-tc')?.addEventListener('click', async () => {
      const title = document.getElementById('tc-title-inp')?.value.trim();
      if (!title) { toast('⚠ Titel erforderlich'); return; }
      const steps = (document.getElementById('tc-steps-inp')?.value || '')
        .split('\n').map(s => s.trim()).filter(Boolean);
      await window.api.saveTestCase({
        storyId: story.id, reqId: story.reqId, systemId: _traceSysId,
        title, steps,
        expected: document.getElementById('tc-expected-inp')?.value.trim() || '',
        status: 'not_run',
      });
      closeModal(); renderTraceGraph(); toast('✅ Testfall gespeichert');
    });
  }, 0);
}

// ── KI: User Stories generieren ──────────────────────────────
async function generateUserStoriesForReq(req) {
  toast('✦ Generiere User Stories …');
  try {
    const data = await window.api.generateUserStories(req.id, _traceSysId);
    const stories = data.stories || [];
    if (!stories.length) { toast('⚠ Keine Stories generiert'); return; }

    for (const s of stories) {
      await window.api.saveUserStory({
        reqId: req.id, systemId: _traceSysId,
        title: s.title, description: s.description || '',
        acceptanceCriteria: s.acceptanceCriteria || [],
        priority: s.priority || 'medium',
        storyPoints: s.storyPoints || null,
        status: 'open',
      });
    }
    toast(`✅ ${stories.length} User Stories generiert`);
    renderTraceGraph();
  } catch(e) {
    toast('❌ Fehler: ' + e.message);
  }
}

async function generateAllUserStories() {
  if (!_traceSysId) { toast('⚠ Bitte zuerst ein System wählen'); return; }
  const btn = $('btn-trace-generate');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Generiere …'; }

  try {
    const reqs = _traceData?.reqs || [];
    const withoutStories = reqs.filter(r =>
      !(_traceData?.stories || []).some(s => s.reqId === r.id)
    );

    if (!withoutStories.length) {
      toast('✅ Alle Anforderungen haben bereits User Stories');
      return;
    }

    let count = 0;
    for (const req of withoutStories.slice(0, 10)) {
      try {
        const data = await window.api.generateUserStories(req.id, _traceSysId);
        for (const s of (data.stories || [])) {
          await window.api.saveUserStory({
            reqId: req.id, systemId: _traceSysId,
            title: s.title, description: s.description || '',
            acceptanceCriteria: s.acceptanceCriteria || [],
            priority: s.priority || 'medium',
            storyPoints: s.storyPoints || null,
            status: 'open',
          });
          count++;
        }
      } catch(e) {}
    }

    toast(`✅ ${count} User Stories für ${withoutStories.length} Anforderungen generiert`);
    renderTraceGraph();
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✦ KI: Stories generieren'; }
  }
}

// ── Export ────────────────────────────────────────────────────
async function exportTraceability() {
  if (!_traceData) { toast('⚠ Bitte zuerst ein System laden'); return; }
  const { reqs, stories, testCases } = _traceData;

  const esc2 = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'Anforderung-ID,Anforderung,User Story ID,User Story,Story Points,Testfall ID,Testfall,Testfall-Status\n';

  for (const req of reqs) {
    const reqStories = stories.filter(s => s.reqId === req.id);
    if (!reqStories.length) {
      csv += [req.id, req.title, '', '', '', '', '', ''].map(esc2).join(',') + '\n';
    } else {
      for (const story of reqStories) {
        const storyTests = testCases.filter(t => t.storyId === story.id);
        if (!storyTests.length) {
          csv += [req.id, req.title, story.id, story.title, story.storyPoints||'', '', '', ''].map(esc2).join(',') + '\n';
        } else {
          for (const tc of storyTests) {
            csv += [req.id, req.title, story.id, story.title, story.storyPoints||'', tc.id, tc.title, tc.status].map(esc2).join(',') + '\n';
          }
        }
      }
    }
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `traceability-${_traceSysId}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Traceability-Matrix exportiert');
}

// ── Fullscreen ────────────────────────────────────────────────
function toggleTraceFullscreen() {
  const view = document.getElementById('view-traceability');
  if (!view) return;
  view.classList.toggle('trace-fullscreen');
  const btn = $('btn-trace-fullscreen');
  if (btn) btn.textContent = view.classList.contains('trace-fullscreen') ? '⊠ Verkleinern' : '⛶ Vollbild';
  setTimeout(renderTraceGraph, 100);
}

// ── D3 laden ──────────────────────────────────────────────────
async function loadD3() {
  if (window.d3) return;
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
    s.onload = resolve; s.onerror = resolve;
    document.head.appendChild(s);
  });
}

window.loadTraceability        = loadTraceability;
window.renderTraceGraph        = renderTraceGraph;
window.openTraceNodeDetail     = openTraceNodeDetail;
window.openAddStoryModal       = openAddStoryModal;
window.openAddTestModal        = openAddTestModal;
window.generateUserStoriesForReq = generateUserStoriesForReq;
window.generateAllUserStories  = generateAllUserStories;
window.exportTraceability      = exportTraceability;
window.toggleTraceFullscreen   = toggleTraceFullscreen;
