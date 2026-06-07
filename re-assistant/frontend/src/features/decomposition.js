'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/decomposition.js
 * K: Anforderungs-Dekomposition — Epics automatisch in atomare User Stories zerlegen.
 * Erkennt zu große Anforderungen und schlägt Zerlegung vor.
 */

const MAX_STORY_POINTS = 8; // Stories über diesem Wert gelten als zu groß

// ── Haupt-View ────────────────────────────────────────────────
async function loadDecomposition() {
  S.systems = await window.api.getSystems();
  const sel = $('decomp-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = loadDecompReqs;
  }
  $('btn-decomp-run').onclick = decomposeSelected;
  $('btn-decomp-all').onclick = decomposeAll;
}

async function loadDecompReqs() {
  const sysId = $('decomp-sys-sel')?.value;
  if (!sysId) return;
  S.requirements = await window.api.getRequirements({ systemId: sysId });
  renderDecompList();
}

function renderDecompList() {
  const wrap = $('decomp-req-list');
  if (!wrap) return;
  if (!S.requirements.length) {
    wrap.innerHTML = '<div class="empty-state"><h3>Keine Anforderungen</h3></div>';
    return;
  }
  // Anforderungen nach Dekompositions-Bedarf sortieren
  const scored = S.requirements.map(r => ({
    ...r, decompScore: calcDecompScore(r)
  })).sort((a,b) => b.decompScore - a.decompScore);

  wrap.innerHTML = scored.map(r => {
    const needs = r.decompScore >= 3;
    const already = r.decomposed;
    return `<div class="decomp-req-row${needs?' needs-decomp':''}${already?' already-decomposed':''}">
      <input type="checkbox" class="decomp-cb" id="dcb-${r.id}" ${needs && !already ? 'checked':''} style="flex-shrink:0;margin-top:2px"/>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
          <span class="req-id">${esc(r.id)}</span>
          <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
          ${needs ? `<span style="font-size:9px;padding:1px 7px;border-radius:99px;background:var(--ambbg);color:var(--amb)">⚡ Zerlegung empfohlen</span>` : ''}
          ${already ? `<span style="font-size:9px;padding:1px 7px;border-radius:99px;background:var(--grnbg);color:var(--grn)">✓ Bereits zerlegt</span>` : ''}
        </div>
        <div style="font-size:13px;font-weight:500">${esc(r.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc((r.description||'').substring(0,100))}${(r.description||'').length>100?'…':''}</div>
        ${r.decompScore > 0 ? `<div style="font-size:10px;color:var(--amb);margin-top:3px">${decompReasons(r).join(' · ')}</div>` : ''}
      </div>
      <button class="btn-secondary" style="font-size:11px;padding:4px 10px;flex-shrink:0"
        onclick="decomposeOne('${r.id}')">Zerlegen</button>
    </div>`;
  }).join('');
}

// ── Dekompositions-Score berechnen ────────────────────────────
function calcDecompScore(r) {
  let score = 0;
  const desc = r.description || '';
  const title = r.title || '';
  // Zu lang
  if (desc.length > 500) score += 2;
  else if (desc.length > 250) score += 1;
  // Mehrere Verben/Aktionen
  const verbs = (title + ' ' + desc).match(/\b(und|sowie|außerdem|zusätzlich|auch|and|also|additionally)\b/gi) || [];
  score += Math.min(verbs.length, 3);
  // Enthält "soll können" Auflistungen
  const lists = (desc.match(/\n-|\n\d+\.|;/g) || []).length;
  score += Math.min(lists, 2);
  // Vage Scope-Ausdrücke
  if (/komplett|vollständig|alle|gesamt|komplex|umfassend|complete|entire/i.test(title + desc)) score += 1;
  return score;
}

function decompReasons(r) {
  const reasons = [];
  const desc = r.description || '';
  if (desc.length > 500) reasons.push('Beschreibung sehr lang');
  const verbs = (r.title + ' ' + desc).match(/\b(und|sowie|außerdem|zusätzlich)\b/gi) || [];
  if (verbs.length > 0) reasons.push('Mehrere Aktionen');
  const lists = (desc.match(/\n-|\n\d+\./g) || []).length;
  if (lists > 1) reasons.push('Enthält Auflistungen');
  if (/komplett|vollständig|alle|gesamt/i.test(r.title)) reasons.push('Zu breiter Scope');
  return reasons;
}

// ── Einzelne Anforderung zerlegen ─────────────────────────────
async function decomposeOne(reqId) {
  const req = S.requirements.find(r => r.id === reqId);
  if (!req) return;
  await runDecomposition([req]);
}

async function decomposeSelected() {
  const selected = S.requirements.filter(r => document.getElementById(`dcb-${r.id}`)?.checked);
  if (!selected.length) { toast('⚠ Mindestens eine Anforderung auswählen'); return; }
  await runDecomposition(selected);
}

async function decomposeAll() {
  const candidates = S.requirements.filter(r => calcDecompScore(r) >= 2 && !r.decomposed);
  if (!candidates.length) { toast('ℹ Keine Zerlegungskandidaten gefunden'); return; }
  if (!confirm(`${candidates.length} Anforderungen zerlegen?`)) return;
  await runDecomposition(candidates);
}

async function runDecomposition(reqs) {
  setAPIContext('decomposition', $('decomp-sys-sel')?.value);
  const btn  = $('btn-decomp-run');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span> Zerlege …'; }
  const wrap = $('decomp-results');

  let totalCreated = 0;
  const results = [];

  for (const req of reqs) {
    if (wrap) wrap.innerHTML = `<div style="padding:16px;text-align:center"><div class="spin"></div><p style="font-size:12px;color:var(--t3);margin-top:8px">Zerlege: ${esc(req.title.substring(0,50))}</p></div>`;

    const res = await callAPI([{ role:'user', content:
      `Zerlege diese Anforderung in atomare, implementierbare User Stories. ${langNote()}

Regeln:
- Jede Story soll genau EINE Funktion abdecken
- Maximal ${MAX_STORY_POINTS} Story Points pro Story
- Stories müssen unabhängig voneinander implementierbar sein (INVEST-Prinzip)
- Zusammen decken alle Stories die Original-Anforderung vollständig ab
- Keine Geschichte zu klein (min. 1 SP), keine zu groß (max. ${MAX_STORY_POINTS} SP)

Antworte NUR mit JSON ohne Backticks:
{
  "stories": [
    {
      "title": "Als [Rolle] möchte ich [Funktion]",
      "description": "Detaillierte Beschreibung",
      "acceptanceCriteria": ["Kriterium 1", "Kriterium 2", "Kriterium 3"],
      "storyPoints": 3,
      "priority": "high|medium|low",
      "category": "${req.category||'Funktional'}",
      "rationale": "Warum ist diese Teilanforderung eigenständig?"
    }
  ],
  "reasoning": "Begründung der Zerlegungsstrategie"
}

Original-Anforderung:
ID: ${req.id}
Titel: ${req.title}
Beschreibung: ${req.description || '(keine)'}
Kategorie: ${req.category}
Priorität: ${req.priority}` }], langNote(), 2000);

    if (!res.ok) continue;
    try {
      const decomp = JSON.parse(res.text.replace(/```json|```/g,'').trim());
      results.push({ req, stories: decomp.stories || [], reasoning: decomp.reasoning || '' });
      totalCreated += (decomp.stories||[]).length;
    } catch(e) { console.error('Decomp parse error', e); }
  }

  if (btn) { btn.disabled=false; btn.innerHTML='⚡ Ausgewählte zerlegen'; }
  if (!results.length) { toast('❌ Zerlegung fehlgeschlagen'); return; }
  renderDecompResults(results);
}

function renderDecompResults(results) {
  const wrap = $('decomp-results');
  if (!wrap) return;
  const totalStories = results.reduce((s,r)=>s+r.stories.length, 0);

  wrap.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--aa);margin-bottom:12px">
      ✦ ${results.length} Anforderung(en) → ${totalStories} User Stories
    </div>
    ${results.map((result, ri) => `
      <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);margin-bottom:12px;overflow:hidden">
        <div style="padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--b1)">
          <div style="font-size:11px;color:var(--t3)">Original:</div>
          <div style="font-size:13px;font-weight:600">${esc(result.req.title)}</div>
          ${result.reasoning ? `<div style="font-size:11px;color:var(--t2);margin-top:4px">✦ ${esc(result.reasoning)}</div>` : ''}
        </div>
        <div style="padding:10px 14px">
          ${result.stories.map((s, si) => `
            <div style="background:var(--bg);border:1px solid var(--b1);border-radius:var(--r);padding:10px 12px;margin-bottom:7px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                <input type="checkbox" checked id="ds-${ri}-${si}"/>
                <span style="font-size:13px;font-weight:500;flex:1">${esc(s.title)}</span>
                <span style="font-size:11px;font-weight:700;color:var(--aa)">${s.storyPoints||'?'} SP</span>
                <span class="sbadge p-${s.priority||'medium'}" style="font-size:9px">${priLabel(s.priority||'medium')}</span>
              </div>
              <div style="font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:6px">${esc((s.description||'').substring(0,150))}</div>
              ${(s.acceptanceCriteria||[]).length ? `
                <div style="font-size:10px;color:var(--t3)">AC: ${s.acceptanceCriteria.slice(0,2).map(c=>`<span style="background:var(--s2);padding:1px 6px;border-radius:4px;margin:1px">${esc(c.substring(0,50))}</span>`).join('')}</div>` : ''}
            </div>`).join('')}
        </div>
        <div style="padding:8px 14px 12px;display:flex;gap:8px">
          <button class="btn-primary" style="font-size:11px"
            onclick="saveDecomp(${ri},${JSON.stringify(result).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
            ✓ Ausgewählte speichern
          </button>
          <button class="btn-secondary" style="font-size:11px"
            onclick="saveDecompAll(${ri},${JSON.stringify(result).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
            Alle speichern
          </button>
        </div>
      </div>`).join('')}`;
}

async function saveDecomp(ri, result) {
  const selected = result.stories.filter((_,si) => document.getElementById(`ds-${ri}-${si}`)?.checked);
  await _persistDecomp(result.req, selected);
}
async function saveDecompAll(ri, result) {
  await _persistDecomp(result.req, result.stories);
}

async function _persistDecomp(origReq, stories) {
  const sysId = $('decomp-sys-sel')?.value || origReq.systemId;
  let saved = 0;
  for (const s of stories) {
    await window.api.saveRequirement({
      id: 'REQ-DECOMP-' + Date.now() + '-' + Math.floor(Math.random()*1000),
      systemId: sysId,
      title:       s.title,
      description: s.description || '',
      category:    s.category || origReq.category,
      priority:    s.priority || origReq.priority,
      rationale:   s.rationale || '',
      tags:        [...(origReq.tags||[]), 'dekomponiert', `aus:${origReq.id}`],
      acceptanceCriteria: (s.acceptanceCriteria||[]).map(t=>({text:t,done:false,createdAt:Date.now()})),
      status: 'open',
      createdBy: S.user.id, createdByName: S.user.name,
    });
    saved++;
  }
  // Original als zerlegt markieren
  await window.api.saveRequirement({ ...origReq, decomposed: true, decomposedInto: saved });
  toast(`✅ ${saved} User Stories aus "${origReq.title.substring(0,40)}" erstellt`);
  if (typeof addNotif === 'function')
    addNotif('⚡', 'Anforderung zerlegt', `${saved} User Stories erstellt`, () => loadDecompReqs());
  await loadDecompReqs();
}

window.loadDecomposition  = loadDecomposition;
window.loadDecompReqs     = loadDecompReqs;
window.decomposeOne       = decomposeOne;
window.decomposeSelected  = decomposeSelected;
window.decomposeAll       = decomposeAll;
window.saveDecomp         = saveDecomp;
window.saveDecompAll      = saveDecompAll;
