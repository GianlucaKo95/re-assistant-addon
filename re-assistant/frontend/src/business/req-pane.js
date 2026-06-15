'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * business/req-pane.js
 * Live-Anforderungs-Pane im Business Chat — CRUD, KI-Verfeinerung,
 * Inline-Bearbeitung, Export.
 */

async function refreshReqPane() {
  if (!$('bc-req-pane') || !S.activeSystemId) return;
  S.requirements = await window.api.getRequirements({ systemId: S.activeSystemId });
  updatePaneCatFilter();
  renderReqPane();
}

function updatePaneCatFilter() {
  const sel = $('bc-req-filter-cat');
  if (!sel) return;
  const cats = [...new Set(S.requirements.map(r => r.category).filter(Boolean))];
  const cur  = sel.value;
  sel.innerHTML = '<option value="">Alle</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (cats.includes(cur)) sel.value = cur;
}

function renderReqPane() {
  const list  = $('bc-req-list');
  const badge = $('bc-req-count-badge');
  if (!list) return;

  const q   = ($('bc-req-search')?.value  || '').toLowerCase();
  const cat = $('bc-req-filter-cat')?.value || '';
  const pri = $('bc-req-filter-pri')?.value || '';

  // Nur eigene Anforderungen (oder alle für Admin)
  const reqs = S.requirements.filter(r =>
    r.systemId === S.activeSystemId &&
    (S.user.role === 'admin' || r.createdBy === S.user.id)
  );
  if (badge) badge.textContent = reqs.length;

  const filtered = reqs.filter(r =>
    (!q   || r.title?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)) &&
    (!cat || r.category === cat) &&
    (!pri || r.priority === pri)
  );

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:24px 10px;text-align:center;color:var(--t3);font-size:12px">
      ${reqs.length ? 'Keine Treffer für die Filter.' : 'Noch keine Anforderungen. Chat nutzen oder manuell hinzufügen.'}
    </div>`;
    return;
  }

  // Gespeicherte Reihenfolge anwenden
  const ordered = typeof applyStoredReqOrder === 'function'
    ? applyStoredReqOrder(filtered, S.activeSystemId)
    : filtered;

  list.innerHTML = ordered.map(r => `
    <div class="bc-req-item${r.isDuplicate ? ' duplicate-flag' : ''}" data-id="${r.id}" id="bri-${r.id}">
      <div class="bri-top">
        <div style="display:flex;align-items:center;gap:5px">
          ${r.isDuplicate ? '<span class="dup-dot" title="Mögliches Duplikat"></span>' : ''}
          <span class="bri-id">${esc(r.id)}</span>
          ${r.qualityScore ? `
            <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;
              background:${r.qualityScore>=7?'var(--grnbg)':r.qualityScore>=4?'var(--ambbg)':'var(--redbg)'};
              color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">
              QS:${r.qualityScore}
            </span>` : ''}
        </div>
        <span class="sbadge p-${r.priority}" style="font-size:9px">${priLabel(r.priority)}</span>
      </div>
      <div class="bri-title" onclick="toggleBriEdit('${r.id}')">${esc(r.title)}</div>
      <div class="bri-desc">${esc((r.description||'').substring(0, 120))}${(r.description||'').length > 120 ? '…' : ''}</div>
      <div class="bri-actions">
        <button class="bri-btn" onclick="toggleBriEdit('${r.id}')">✏ Bearbeiten</button>
        <button class="bri-btn" onclick="aiRefineReq('${r.id}')">✦ KI</button>
        <button class="bri-btn del" onclick="delPaneReq('${r.id}')">✕</button>
      </div>
      <div class="bri-edit-form" id="bri-edit-${r.id}">
        <input type="text" id="bri-t-${r.id}" value="${esc(r.title)}" placeholder="Titel"/>
        <textarea id="bri-d-${r.id}" placeholder="Beschreibung" rows="3">${esc(r.description||'')}</textarea>
        <div class="bri-edit-row">
          <select id="bri-c-${r.id}">
            ${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit']
              .map(c => `<option${r.category===c?' selected':''}>${c}</option>`).join('')}
          </select>
          <select id="bri-p-${r.id}">
            <option value="high"${r.priority==='high'?' selected':''}>Hoch</option>
            <option value="medium"${r.priority==='medium'?' selected':''}>Mittel</option>
            <option value="low"${r.priority==='low'?' selected':''}>Niedrig</option>
          </select>
        </div>
        <input type="text" id="bri-rat-${r.id}" value="${esc(r.rationale||'')}" placeholder="Begründung"/>
        <input type="text" id="bri-tags-${r.id}" value="${(r.tags||[]).join(', ')}" placeholder="Tags (kommagetrennt)"/>
        <div class="bri-edit-actions">
          <button class="rp-btn rp-primary" onclick="savePaneReq('${r.id}')">Speichern</button>
          <button class="rp-btn" onclick="toggleBriEdit('${r.id}')">Abbrechen</button>
        </div>
      </div>
    </div>`).join('');

  // Drag & Drop für manuelle Reihenfolge
  if (typeof enableReqListDragDrop === 'function') {
    enableReqListDragDrop('bc-req-list', ordered, (newOrder) => {
      const orderMap = {};
      newOrder.forEach((id, idx) => { orderMap[id] = idx; });
      S.requirements.sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));
    });
  }
}

function toggleBriEdit(id) {
  $(`bri-edit-${id}`)?.classList.toggle('open');
}

async function savePaneReq(id) {
  const r = S.requirements.find(x => x.id === id);
  if (!r) return;
  const tags = ($(`bri-tags-${id}`)?.value || '').split(',').map(t => t.trim()).filter(Boolean);
  await window.api.saveRequirement({
    ...r,
    title:       $(`bri-t-${id}`)?.value.trim()   || r.title,
    description: $(`bri-d-${id}`)?.value.trim()   || '',
    category:    $(`bri-c-${id}`)?.value           || r.category,
    priority:    $(`bri-p-${id}`)?.value           || r.priority,
    rationale:   $(`bri-rat-${id}`)?.value.trim()  || '',
    tags,
  });
  toast('✅ Gespeichert');
  await refreshReqPane();
}

async function delPaneReq(id) {
  if (!confirm('Anforderung entfernen?')) return;
  await window.api.deleteRequirement(id);
  toast('✅ Entfernt');
  await refreshReqPane();
}

async function aiRefineReq(id) {
  const r = S.requirements.find(x => x.id === id);
  if (!r) return;
  toast('✦ Verfeinere Anforderung …');
  const res = await callAPI([{ role:'user', content:
    `Verbessere diese Anforderung — präziser, messbarer, ohne Ambiguitäten.
    Antworte NUR mit JSON ohne Backticks:
    {"title":"...","description":"...","rationale":"..."}
    
    Aktuell:
    Titel: ${r.title}
    Beschreibung: ${r.description || '(keine)'}` }],
    langNote(), 600);
  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const ref = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    await window.api.saveRequirement({ ...r, ...ref });
    toast('✅ Anforderung verfeinert');
    await refreshReqPane();
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

async function extractFromConversation() {
  if (!S.activeSystemId) { toast('⚠ System auswählen'); return; }
  const btn = $('bc-btn-extract');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';

  const hist = S.chatHistory.bc
    .map(m => `${m.role === 'user' ? 'Nutzer' : 'Assistent'}: ${m.content}`)
    .join('\n\n');
  const existing = S.requirements
    .filter(r => r.systemId === S.activeSystemId)
    .map(r => r.title).join(', ');

  const schemaExample = '[{"title":"...","description":"Vollständige Beschreibung mit messbarem Kriterium","category":"Funktional|Nicht-Funktional|Sicherheit|Performance|Schnittstelle|Qualität","priority":"high|medium|low","rationale":"Warum ist diese Anforderung wichtig?","acceptance_criteria_text":"Gegeben... Wenn... Dann...\nGegeben... Wenn... Dann...","stakeholders":"Rolle1, Rolle2","verification_method":"Test|Inspektion|Review|Analyse","iso_category":"Funktionale Eignung|Leistungseffizienz|Sicherheit|Wartbarkeit","risk_level":"hoch|mittel|niedrig","complexity":"hoch|mittel|niedrig","business_value":"1-10","tags":[]}]';

  const res = await callAPI([{ role:'user', content:
    'Du bist ein zertifizierter Requirements Engineer (CPRE). Extrahiere alle expliziten und impliziten Anforderungen aus dem Gespräch.\n\n'
    + 'BEREITS VORHANDEN (nicht duplizieren): ' + (existing || '(keine)') + '\n\n'
    + 'GESPRÄCH:\n' + hist + '\n\n'
    + 'REGELN:\n'
    + '- Jede Anforderung muss eindeutig, vollständig und testbar sein\n'
    + '- Titel: kurz und prägnant (max 80 Zeichen), beginnt mit Verb\n'
    + '- Beschreibung: vollständig, messbar, ohne Mehrdeutigkeiten\n'
    + '- Akzeptanzkriterien: mind. 1-3 Gherkin-Szenarien (Gegeben/Wenn/Dann)\n'
    + '- Kategorie genau klassifizieren nach IEEE-830\n'
    + 'Antworte NUR mit JSON-Array (keine Backticks, keine Erklärungen):\n'
    + schemaExample
    + '\nWenn keine Anforderungen erkennbar: []'
  }], langNote(), 3500);

  btn.disabled = false;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Extrahieren';

  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const reqs = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    if (!reqs.length) { toast('ℹ Keine neuen Anforderungen gefunden'); return; }
    for (const r of reqs) {
      await window.api.saveRequirement({
        ...r,
        id: 'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        systemId:      S.activeSystemId,
        createdBy:     S.user.id,
        createdByName: S.user.name,
        status:        'open',
      });
    }
    toast(`✅ ${reqs.length} Anforderung(en) hinzugefügt`);
    await refreshReqPane();
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

async function openInlineAdd() {
  openModal('Neue Anforderung', `
    <div class="frow"><label>Titel</label>
      <input type="text" id="ip-t" placeholder="Kurzer, prägnanter Titel"/></div>
    <div class="frow"><label>Beschreibung</label>
      <textarea id="ip-d" rows="4" placeholder="Was soll das System tun?"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label>
        <select id="ip-c">
          ${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit']
            .map(c => `<option>${c}</option>`).join('')}
        </select></div>
      <div class="frow"><label>Priorität</label>
        <select id="ip-p">
          <option value="high">Hoch</option>
          <option value="medium" selected>Mittel</option>
          <option value="low">Niedrig</option>
        </select></div>
    </div>
    <div class="frow"><label>Begründung</label>
      <input type="text" id="ip-r" placeholder="Warum ist das wichtig?"/></div>
    <div class="frow"><label>Tags</label>
      <input type="text" id="ip-tags" placeholder="tag1, tag2, …"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveInlineAdd()">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveInlineAdd() {
  const title = $('ip-t').value.trim();
  if (!title) { toast('⚠ Titel erforderlich'); return; }
  const tags = ($('ip-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
  await window.api.saveRequirement({
    id:            'REQ-' + Date.now(),
    systemId:      S.activeSystemId,
    title,
    description:   $('ip-d').value.trim(),
    category:      $('ip-c').value,
    priority:      $('ip-p').value,
    rationale:     $('ip-r').value.trim(),
    tags,
    createdBy:     S.user.id,
    createdByName: S.user.name,
    status:        'open',
  });
  closeModal();
  toast('✅ Anforderung hinzugefügt');
  await refreshReqPane();
}

async function exportPaneReqs() {
  const reqs = S.requirements.filter(r =>
    r.systemId === S.activeSystemId &&
    (S.user.role === 'admin' || r.createdBy === S.user.id)
  );
  const sys = S.systems.find(s => s.id === S.activeSystemId);
  await window.api.exportMarkdown({ requirements: reqs, stories: [], projectName: sys?.name || 'Export' });
  toast('✅ Exportiert');
}

window.refreshReqPane        = refreshReqPane;
window.renderReqPane         = renderReqPane;
window.toggleBriEdit         = toggleBriEdit;
window.savePaneReq           = savePaneReq;
window.delPaneReq            = delPaneReq;
window.aiRefineReq           = aiRefineReq;
window.extractFromConversation = extractFromConversation;
window.openInlineAdd         = openInlineAdd;
window.saveInlineAdd         = saveInlineAdd;
window.exportPaneReqs        = exportPaneReqs;

// Drag-drop init added inline
