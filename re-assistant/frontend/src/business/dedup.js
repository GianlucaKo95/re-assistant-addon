'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * business/dedup.js
 * KI-gestützte Duplikat-Erkennung und -Bereinigung.
 */

async function dedupSystem() {
  const reqs = S.requirements.filter(r => r.systemId === S.activeSystemId);
  if (reqs.length < 2) { toast('ℹ Mindestens 2 Anforderungen nötig'); return; }
  await _runDedup(reqs, 'pane');
}

async function runGlobalDedup() {
  const all = await window.api.getRequirements({});
  const my  = all.filter(r => S.user.role === 'admin' || r.createdBy === S.user.id);
  if (my.length < 2) { toast('ℹ Mindestens 2 Anforderungen nötig'); return; }
  await _runDedup(my, 'modal');
}

async function _runDedup(reqs, mode) {
  toast('🔍 Analysiere Redundanzen …');
  const rl = reqs.map(r =>
    `ID:${r.id} [${r.category}] ${r.title} — ${(r.description||'').substring(0,120)}`
  ).join('\n');

  const res = await callAPI([{ role:'user', content:
    `Analysiere diese Anforderungen auf Redundanzen und Duplikate.
    Antworte NUR mit JSON ohne Backticks:
    {
      "duplicateGroups": [{
        "reason": "Kurze Begründung",
        "reqIds": ["REQ-001","REQ-002"],
        "merged": {"title":"...","description":"...","category":"Funktional","priority":"medium","rationale":"..."}
      }],
      "summary": "Kurze Zusammenfassung"
    }
    
    Wenn keine Duplikate: {"duplicateGroups":[],"summary":"Keine Redundanzen gefunden."}
    
    Anforderungen:
    ${rl}` }],
    langNote(), 2000);

  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const a = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
    S.dedupSuggestion = { analysis: a, allReqs: reqs };
    if (!a.duplicateGroups?.length) {
      toast('✅ Keine Duplikate — ' + a.summary);
      return;
    }
    // Duplikate markieren
    a.duplicateGroups.flatMap(g => g.reqIds).forEach(id => {
      const el = $(`bri-${id}`);
      if (el) el.classList.add('duplicate-flag');
    });
    if (mode === 'pane') showDedupBanner(a);
    else                 showDedupModal(a, reqs);
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function showDedupBanner(a) {
  const b = $('bc-dedup-banner');
  const t = $('bc-dedup-text');
  if (!b || !t) return;
  t.innerHTML = `<strong>${a.duplicateGroups.length} Gruppe(n) gefunden.</strong> ${esc(a.summary)}`;
  b.style.display = '';
  b.classList.add('visible');
}

function hideDedup() {
  const b = $('bc-dedup-banner');
  if (b) {
    b.classList.remove('visible');
    setTimeout(() => b.style.display = 'none', 300);
  }
  S.dedupSuggestion = null;
}

async function applyDedup() {
  if (!S.dedupSuggestion) return;
  let merged = 0, removed = 0;
  for (const g of S.dedupSuggestion.analysis.duplicateGroups) {
    if (!g.reqIds?.length || !g.merged) continue;
    const primary = S.dedupSuggestion.allReqs.find(x => x.id === g.reqIds[0]);
    if (!primary) continue;
    await window.api.saveRequirement({ ...primary, ...g.merged });
    merged++;
    for (const id of g.reqIds.slice(1)) {
      await window.api.deleteRequirement(id);
      removed++;
    }
  }
  hideDedup();
  toast(`✅ ${merged} zusammengeführt, ${removed} entfernt`);
  await refreshReqPane();
}

function showDedupModal(a, reqs) {
  openModal(`${a.duplicateGroups.length} Redundanzgruppe(n)`,
    `<p style="font-size:13px;color:var(--t2);margin-bottom:14px">${esc(a.summary)}</p>` +
    a.duplicateGroups.map((g, i) => `
      <div class="dedup-group">
        <div class="dedup-group-head">Gruppe ${i+1}: ${esc(g.reason)}</div>
        ${g.reqIds.map(id => {
          const r   = reqs.find(x => x.id === id);
          if (!r) return '';
          const sys = S.systems.find(s => s.id === r.systemId);
          return `<div style="padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px">
            <strong>${esc(r.id)}</strong>
            ${sys ? `<span class="rtag" style="font-size:9px">${esc(sys.name)}</span>` : ''}
            — ${esc(r.title)}
          </div>`;
        }).join('')}
        ${g.merged ? `
          <div class="dedup-merged">
            <div class="dedup-merged-label">✦ KI-Vorschlag</div>
            <strong>${esc(g.merged.title)}</strong>
            <p style="font-size:12px;color:var(--t2);margin-top:4px">${esc(g.merged.description)}</p>
          </div>` : ''}
      </div>`).join('') +
    `<div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn-primary" onclick="applyGlobalDedup()">Zusammenführen</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function applyGlobalDedup() {
  closeModal();
  await applyDedup();
  if (S.activeView === 'business-reqs') await loadBizReqs();
}

window.dedupSystem     = dedupSystem;
window.runGlobalDedup  = runGlobalDedup;
window.hideDedup       = hideDedup;
window.applyDedup      = applyDedup;
window.applyGlobalDedup = applyGlobalDedup;
