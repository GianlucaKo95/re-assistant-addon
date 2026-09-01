'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/search.js
 * 🟡 FIX 6: Globale Volltextsuche über Requirements, Workshops, Backlogs.
 */

let _searchOpen  = false;
let _searchTimer = null;

function initGlobalSearch() {
  // Shortcut: Ctrl+Shift+F
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      toggleSearchPanel();
    }
  });
}

function toggleSearchPanel() {
  _searchOpen = !_searchOpen;
  let panel = $('global-search-panel');
  if (!panel) {
    panel = createSearchPanel();
    document.body.appendChild(panel);
  }
  panel.classList.toggle('open', _searchOpen);
  if (_searchOpen) {
    $('global-search-input')?.focus();
  }
}

function createSearchPanel() {
  const panel = document.createElement('div');
  panel.id = 'global-search-panel';
  panel.style.cssText = `
    position:fixed;top:44px;left:50%;transform:translateX(-50%);
    width:min(640px,95vw);background:rgba(12,12,22,.98);
    border:1px solid var(--b2);border-radius:0 0 var(--rxl) var(--rxl);
    z-index:190;box-shadow:0 30px 60px rgba(0,0,0,.5);
    display:none;flex-direction:column;max-height:70vh;overflow:hidden;
  `;
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--b1);display:flex;align-items:center;gap:10px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="global-search-input"
        placeholder="Suche über alle Anforderungen, Workshops, Backlogs … (Esc zum Schließen)"
        style="flex:1;background:none;border:none;color:var(--t1);font-size:14px;outline:none"
        oninput="onSearchInput(this.value)"
        onkeydown="onSearchKey(event)"/>
      <button onclick="toggleSearchPanel()"
        style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:16px">✕</button>
    </div>
    <div id="search-results" style="overflow-y:auto;flex:1;padding:8px 0">
      <div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">
        Suchbegriff eingeben …
      </div>
    </div>
    <div id="search-footer" style="padding:8px 16px;border-top:1px solid var(--b1);font-size:11px;color:var(--t3);display:none">
      <span id="search-count"></span> · ↑↓ navigieren · Enter öffnen · Esc schließen
    </div>`;

  // Schließen bei Klick außerhalb
  document.addEventListener('click', e => {
    if (_searchOpen && !e.target.closest('#global-search-panel') && !e.target.closest('#btn-search'))
      { _searchOpen = false; panel.classList.remove('open'); }
  });

  // CSS animation
  const style = document.createElement('style');
  style.textContent = `#global-search-panel{display:none} #global-search-panel.open{display:flex}
    .search-result-item{padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--b1);transition:background .12s}
    .search-result-item:hover,.search-result-item.selected{background:var(--s2)}
    .search-result-item:last-child{border-bottom:none}
    .search-hit{background:rgba(168,85,247,.25);border-radius:2px;padding:0 2px}
    .search-result-type{font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;text-transform:uppercase}`;
  document.head.appendChild(style);

  return panel;
}

function onSearchInput(q) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => runSearch(q.trim()), 200);
}

function onSearchKey(e) {
  const results = document.querySelectorAll('.search-result-item');
  const selected = document.querySelector('.search-result-item.selected');
  const idx = selected ? [...results].indexOf(selected) : -1;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selected?.classList.remove('selected');
    results[Math.min(idx + 1, results.length - 1)]?.classList.add('selected');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selected?.classList.remove('selected');
    results[Math.max(idx - 1, 0)]?.classList.add('selected');
  } else if (e.key === 'Enter' && selected) {
    selected.click();
  } else if (e.key === 'Escape') {
    _searchOpen = false;
    $('global-search-panel')?.classList.remove('open');
  }
}

async function runSearch(q) {
  if (!q || q.length < 2) {
    $('search-results').innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Suchbegriff eingeben …</div>';
    $('search-footer').style.display = 'none';
    return;
  }
  $('search-results').innerHTML = '<div style="padding:20px;text-align:center"><div class="spin"></div></div>';

  const ql = q.toLowerCase();
  const results = [];

  // Anforderungen
  const reqs = await window.api.getRequirements({});
  for (const r of reqs) {
    const score = matchScore(ql, [r.title, r.description, r.id, r.rationale, ...(r.tags||[])]);
    if (score > 0) {
      const sys = S.systems.find(s => s.id === r.systemId);
      results.push({
        type: 'req', score, id: r.id,
        title: r.title, sub: (r.description||'').substring(0, 100),
        meta: sys?.name || '', status: r.status, priority: r.priority,
        action: () => { toggleSearchPanel(); S.activeSystemId = r.systemId; switchView('business-reqs'); }
      });
    }
  }

  // Workshops
  const workshops = await window.api.getWorkshops('');
  for (const w of workshops) {
    const allText = (w.entries||[]).map(e => e.text).join(' ');
    const score = matchScore(ql, [w.name, w.goal, allText]);
    if (score > 0) results.push({
      type: 'workshop', score, id: w.id,
      title: w.name, sub: w.goal || '',
      meta: new Date(w.createdAt).toLocaleDateString('de-DE'),
      action: () => { toggleSearchPanel(); switchView('ba-workshop'); }
    });
  }

  // Backlogs
  const backlogs = await window.api.getBacklogs('');
  for (const b of backlogs) {
    const epicsText = (b.epics||[]).map(e => `${e.title} ${(e.features||[]).map(f => `${f.title} ${(f.stories||[]).map(s=>s.title).join(' ')}`).join(' ')}`).join(' ');
    const score = matchScore(ql, [b.systemName, epicsText]);
    if (score > 0) results.push({
      type: 'backlog', score, id: b.id,
      title: `Backlog: ${b.systemName||''}`, sub: `${(b.epics||[]).length} Epics`,
      meta: new Date(b.createdAt).toLocaleDateString('de-DE'),
      action: () => { toggleSearchPanel(); switchView('pm-backlog'); }
    });
  }

  // Sortieren nach Score
  results.sort((a, b) => b.score - a.score);

  const typeColors = { req:'var(--aa)', workshop:'var(--ba)', backlog:'var(--pm)' };
  const typeLabels = { req:'Anforderung', workshop:'Workshop', backlog:'Backlog' };

  if (!results.length) {
    $('search-results').innerHTML = `<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Keine Ergebnisse für "<strong>${esc(q)}</strong>"</div>`;
    $('search-footer').style.display = 'none';
    return;
  }

  $('search-results').innerHTML = results.slice(0, 30).map(r => `
    <div class="search-result-item" onclick="(${r.action.toString()})()">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span class="search-result-type" style="background:${typeColors[r.type]}22;color:${typeColors[r.type]};flex-shrink:0;margin-top:2px">
          ${typeLabels[r.type]}
        </span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${highlight(r.title, q)}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:2px">${highlight(r.sub, q)}</div>
        </div>
        <span style="font-size:10px;color:var(--t3);flex-shrink:0">${esc(r.meta)}</span>
      </div>
    </div>`).join('');

  $('search-count').textContent = `${results.length} Ergebnis${results.length !== 1 ? 'se' : ''}`;
  $('search-footer').style.display = '';
}

function matchScore(q, fields) {
  let score = 0;
  for (const f of fields) {
    if (!f) continue;
    const fl = f.toLowerCase();
    if (fl === q) score += 10;
    else if (fl.startsWith(q)) score += 5;
    else if (fl.includes(q)) score += 2;
  }
  return score;
}

function highlight(text, q) {
  if (!text || !q) return esc(text || '');
  const safe = esc(text);
  const safeQ = esc(q);
  return safe.replace(new RegExp(safeQ.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'),
    match => `<span class="search-hit">${match}</span>`);
}

window.initGlobalSearch  = initGlobalSearch;
window.toggleSearchPanel = toggleSearchPanel;
window.onSearchInput     = onSearchInput;
window.onSearchKey       = onSearchKey;
window.runSearch         = runSearch;
