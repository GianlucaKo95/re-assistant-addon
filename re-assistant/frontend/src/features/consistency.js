'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/consistency.js
 * Nr. 4: Konsistenzprüfung — inhaltliche Widersprüche zwischen Requirements.
 * Nr. 5: Anforderungs-Autocomplete — KI-Vorschläge während dem Tippen.
 */

/* ══════════════════════════════════════════════════════════════
   Nr. 4: KONSISTENZPRÜFUNG
══════════════════════════════════════════════════════════════ */

async function runConsistencyCheck(systemId) {
  setAPIContext('consistency', systemId);
  if (!systemId) { toast('⚠ System auswählen'); return; }
  const reqs = await window.api.getRequirements({ systemId });
  if (reqs.length < 3) { toast('ℹ Mindestens 3 Anforderungen für Konsistenzprüfung nötig'); return; }

  const btn = $('btn-consistency-check');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Prüfe …'; }

  const rl = reqs.map(r => `${r.id}: ${r.title} — ${(r.description||'').substring(0,150)}`).join('\n');

  const res = await callAPI([{ role:'user', content:
    `Du bist Requirements-Analyst. Prüfe diese Anforderungen auf inhaltliche Widersprüche.
Widerspruch = zwei Anforderungen fordern einander ausschließende Dinge
(z.B. "offline-fähig" vs. "permanente Internetverbindung", "maximale Performance" vs. "minimaler Ressourcenverbrauch").

Antworte NUR mit JSON ohne Backticks:
{
  "conflicts": [{
    "reqId1": "REQ-001",
    "reqId2": "REQ-002",
    "severity": "high|medium|low",
    "description": "Klare Beschreibung des Widerspruchs",
    "resolution": "Konkreter Lösungsvorschlag"
  }],
  "warnings": [{
    "reqIds": ["REQ-003","REQ-004"],
    "description": "Mögliche Spannung (kein harter Widerspruch)"
  }],
  "summary": "Kurze Zusammenfassung"
}

Wenn keine Widersprüche: {"conflicts":[],"warnings":[],"summary":"Keine Widersprüche gefunden."}

Anforderungen:
${rl}` }], langNote(), 2500);

  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Konsistenz prüfen'; }
  if (!res.ok) { toast('❌ ' + res.text); return; }

  try {
    const result = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    renderConsistencyResults(result, reqs);
    if (typeof addNotif === 'function' && result.conflicts.length)
      addNotif('⚠', 'Widersprüche gefunden', `${result.conflicts.length} Konflikte in Requirements`, () => {});
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function renderConsistencyResults(result, reqs) {
  const wrap = $('consistency-results');
  if (!wrap) { showConsistencyModal(result, reqs); return; }

  if (!result.conflicts.length && !result.warnings.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="es-icon">✅</div>
      <h3>Keine Widersprüche</h3><p>${esc(result.summary)}</p></div>`;
    return;
  }

  const sevColor = { high:'var(--red)', medium:'var(--amb)', low:'var(--blue)' };
  wrap.innerHTML = `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px">${esc(result.summary)}</p>

    ${result.conflicts.length ? `
      <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
        🚨 Widersprüche (${result.conflicts.length})
      </div>
      ${result.conflicts.map(c => {
        const r1 = reqs.find(r => r.id === c.reqId1);
        const r2 = reqs.find(r => r.id === c.reqId2);
        return `<div style="background:var(--redbg);border:1px solid rgba(248,113,113,.2);border-radius:var(--rl);padding:12px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${sevColor[c.severity]}22;color:${sevColor[c.severity]}">
              ${c.severity.toUpperCase()}
            </span>
            <span style="font-size:12px;font-weight:600">${esc(c.description)}</span>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="background:var(--s2);border-radius:var(--r);padding:6px 10px;font-size:12px;flex:1">
              <strong>${esc(c.reqId1)}</strong>: ${esc(r1?.title||c.reqId1)}
            </div>
            <div style="background:var(--s2);border-radius:var(--r);padding:6px 10px;font-size:12px;flex:1">
              <strong>${esc(c.reqId2)}</strong>: ${esc(r2?.title||c.reqId2)}
            </div>
          </div>
          <div style="font-size:12px;color:var(--grn);padding:6px 10px;background:var(--grnbg);border-radius:var(--r)">
            💡 ${esc(c.resolution)}
          </div>
        </div>`;
      }).join('')}` : ''}

    ${result.warnings.length ? `
      <div style="font-size:11px;font-weight:700;color:var(--amb);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 8px">
        ⚠ Spannungsfelder (${result.warnings.length})
      </div>
      ${result.warnings.map(w => `
        <div style="background:var(--ambbg);border:1px solid rgba(251,191,36,.2);border-radius:var(--r);padding:10px 12px;margin-bottom:6px;font-size:12px">
          <div style="font-weight:600;margin-bottom:4px">${esc(w.description)}</div>
          <div style="color:var(--t3)">${(w.reqIds||[]).join(', ')}</div>
        </div>`).join('')}` : ''}`;
}

function showConsistencyModal(result, reqs) {
  openModal('🔍 Konsistenzprüfung', `<div id="consistency-results"></div><button class="btn-secondary" style="margin-top:14px" onclick="closeModal()">Schließen</button>`);
  renderConsistencyResults(result, reqs);
}

/* ══════════════════════════════════════════════════════════════
   Nr. 5: AUTOCOMPLETE
══════════════════════════════════════════════════════════════ */

let _acTimer      = null;
let _acController = null;
let _acActive     = false;

function initReqAutocomplete(titleInputId, descInputId) {
  const titleInp = $(titleInputId);
  if (!titleInp) return;

  titleInp.addEventListener('input', () => {
    clearTimeout(_acTimer);
    const val = titleInp.value.trim();
    if (val.length < 8) { hideACSuggestions(); return; }
    _acTimer = setTimeout(() => fetchACSuggestions(val, titleInputId, descInputId), 600);
  });
  titleInp.addEventListener('blur', () => setTimeout(hideACSuggestions, 200));
  titleInp.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideACSuggestions();
  });
}

async function fetchACSuggestions(title, titleInputId, descInputId) {
  if (_acController) _acController.abort();
  _acController = new AbortController();

  const existingTitles = (S.requirements || []).map(r => r.title).join(', ');

  const res = await callAPI([{ role:'user', content:
    `Vervollständige diese Anforderung. ${langNote()}
    
Gib 2-3 alternative Formulierungen und eine Beschreibung.
Antworte NUR mit JSON ohne Backticks:
{
  "suggestions": ["Alternative Formulierung 1", "Alternative Formulierung 2"],
  "description": "Empfohlene Beschreibung für '${title}'",
  "category": "Funktional"
}

Bestehende Anforderungen (nicht duplizieren): ${existingTitles.substring(0,300)}
Angefangener Titel: "${title}"` }], langNote(), 400);

  if (!res.ok) return;
  try {
    const sugg = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    showACSuggestions(sugg, titleInputId, descInputId);
  } catch(e) {}
}

function showACSuggestions(sugg, titleInputId, descInputId) {
  hideACSuggestions();
  const inp = $(titleInputId);
  if (!inp) return;

  const div = document.createElement('div');
  div.id = 'ac-suggestions';
  div.style.cssText = `position:fixed;z-index:250;background:rgba(12,12,22,.98);
    border:1px solid var(--b2);border-radius:var(--rl);box-shadow:0 16px 40px rgba(0,0,0,.4);
    min-width:320px;max-width:500px;overflow:hidden`;

  const rect = inp.getBoundingClientRect();
  div.style.top  = (rect.bottom + 4) + 'px';
  div.style.left = rect.left + 'px';

  div.innerHTML = `
    <div style="padding:6px 10px;border-bottom:1px solid var(--b1);font-size:10px;color:var(--t3);display:flex;align-items:center;gap:5px">
      <span style="color:var(--aa)">✦</span> KI-Vorschläge
    </div>
    ${(sugg.suggestions||[]).map(s => `
      <div class="ac-suggestion-item" onclick="applyACSuggestion('${titleInputId}','${descInputId}','${esc(s).replace(/'/g,"\\'")}','${esc(sugg.description||'').replace(/'/g,"\\'")}','${esc(sugg.category||'Funktional')}')"
        style="padding:9px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--b1);transition:background .1s"
        onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        ${esc(s)}
      </div>`).join('')}
    ${sugg.description ? `
      <div style="padding:8px 12px;font-size:11px;color:var(--t3)">
        <span style="color:var(--t2)">Beschreibung:</span> ${esc(sugg.description.substring(0,100))}
        <button onclick="applyACDescription('${descInputId}','${esc(sugg.description).replace(/'/g,"\\'")}');hideACSuggestions();"
          style="display:block;margin-top:4px;font-size:10px;padding:2px 8px;background:var(--s2);border:1px solid var(--b1);border-radius:5px;cursor:pointer;color:var(--t1)">
          Beschreibung übernehmen
        </button>
      </div>` : ''}`;

  document.body.appendChild(div);
  _acActive = true;
}

function hideACSuggestions() {
  document.getElementById('ac-suggestions')?.remove();
  _acActive = false;
}

function applyACSuggestion(titleId, descId, title, desc, category) {
  const t = $(titleId); const d = $(descId); const c = $('ip-c') || $('rm-cat');
  if (t) t.value = title;
  if (d && desc) d.value = desc;
  if (c && category) c.value = category;
  hideACSuggestions();
}

function applyACDescription(descId, desc) {
  const d = $(descId);
  if (d) d.value = desc;
}

window.runConsistencyCheck   = runConsistencyCheck;
window.renderConsistencyResults = renderConsistencyResults;
window.initReqAutocomplete   = initReqAutocomplete;
window.hideACSuggestions     = hideACSuggestions;
window.applyACSuggestion     = applyACSuggestion;
window.applyACDescription    = applyACDescription;

// ── Window Globals ──────────────────────────────────────────
window.showConsistencyModal = showConsistencyModal;
window.fetchACSuggestions = fetchACSuggestions;
window.showACSuggestions = showACSuggestions;
