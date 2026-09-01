'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/templates.js
 * Anforderungsvorlagen — eingebaut, KI-generiert, eigene Vorlagen.
 */

/* ══════════════════════════════════════════════════════════════
   ANFORDERUNGSVORLAGEN
══════════════════════════════════════════════════════════════ */
const BUILTIN_TEMPLATES = [
  {
    id:'tmpl-user-story', icon:'👤', name:'User Story',
    desc:'Als [Rolle] möchte ich [Funktion] um [Nutzen].',
    fields:{ title:'Als [Rolle] möchte ich …', description:'Als [Rolle]\nmöchte ich [Funktion]\num [Nutzen zu erreichen].\n\nAkzeptanzkriterien:\n- [ ] Kriterium 1\n- [ ] Kriterium 2', category:'Funktional', priority:'medium', rationale:'Nutzen für den Anwender.' }
  },
  {
    id:'tmpl-usecase', icon:'🎯', name:'Use Case',
    desc:'Akteur interagiert mit System um ein Ziel zu erreichen.',
    fields:{ title:'UC-[Nr]: [Name]', description:'**Akteur:** [Hauptakteur]\n**Vorbedingung:** [Zustand vor dem Use Case]\n**Nachbedingung:** [Zustand nach Erfolg]\n\n**Hauptszenario:**\n1. Akteur [Aktion]\n2. System [Reaktion]\n3. …\n\n**Alternativszenarien:**\n- A1: [Alternative]', category:'Funktional', priority:'medium', rationale:'' }
  },
  {
    id:'tmpl-nonfunc', icon:'⚙', name:'Nicht-funktionale Anforderung',
    desc:'Performance, Sicherheit, Wartbarkeit, etc.',
    fields:{ title:'NFR-[Nr]: [Qualitätsmerkmal]', description:'**Merkmal:** [Performance / Sicherheit / Verfügbarkeit / …]\n**Messkriterium:** [Konkrete, messbare Größe]\n**Zielwert:** [z.B. < 2 Sekunden, 99,9% Verfügbarkeit]\n**Prüfmethode:** [Wie wird gemessen?]', category:'Nicht-funktional', priority:'medium', rationale:'' }
  },
  {
    id:'tmpl-security', icon:'🔒', name:'Sicherheitsanforderung',
    desc:'Datenschutz, Authentifizierung, Autorisierung.',
    fields:{ title:'SEC-[Nr]: [Sicherheitsmerkmal]', description:'**Bedrohung:** [Welche Bedrohung wird adressiert?]\n**Schutzmaßnahme:** [Konkrete Maßnahme]\n**Betroffene Daten/Systeme:** [Was wird geschützt?]\n**Compliance:** [z.B. DSGVO, ISO 27001]', category:'Sicherheit', priority:'high', rationale:'Schutz sensibler Daten und Systeme.' }
  },
  {
    id:'tmpl-interface', icon:'🔌', name:'Schnittstellenanforderung',
    desc:'API, Datenformat, Protokoll-Spezifikation.',
    fields:{ title:'IF-[Nr]: Schnittstelle [Name]', description:'**Schnittstelle:** [Name / Bezeichnung]\n**Protokoll:** [REST / SOAP / GraphQL / …]\n**Datenformat:** [JSON / XML / CSV / …]\n**Endpunkt:** [URL / Adresse]\n**Authentifizierung:** [OAuth / API-Key / …]\n**Fehlercodes:** [Relevante HTTP-Codes]', category:'Integration', priority:'medium', rationale:'' }
  },
  {
    id:'tmpl-data', icon:'🗄', name:'Datenanforderung',
    desc:'Datenmodell, Persistenz, Migrationsanforderung.',
    fields:{ title:'DAT-[Nr]: [Datenobjekt]', description:'**Datenobjekt:** [Name]\n**Felder:** \n- Feld1: [Typ, Pflicht/Optional]\n- Feld2: [Typ, Pflicht/Optional]\n\n**Validierungsregeln:** [Constraints]\n**Retention:** [Wie lange werden Daten gehalten?]\n**Datenschutz:** [Klassifizierung]', category:'Daten', priority:'medium', rationale:'' }
  },
  {
    id:'tmpl-ai', icon:'🤖', name:'KI-generiert',
    desc:'KI erstellt eine passgenaue Anforderung anhand einer Beschreibung.',
    fields:null // special: opens AI dialog
  },
];

async function loadTemplates() {
  const grid = $('tmpl-grid');
  const custom = loadCustomTemplates();
  const all = [...BUILTIN_TEMPLATES, ...custom];
  grid.innerHTML = all.map(t => `
    <div class="tmpl-card" onclick="useTemplate('${t.id}')">
      <div class="tmpl-icon">${t.icon}</div>
      <div class="tmpl-name">${esc(t.name)}</div>
      <div class="tmpl-desc">${esc(t.desc)}</div>
      ${t.custom ? `<button onclick="event.stopPropagation();deleteCustomTemplate('${t.id}')" style="margin-top:8px;background:none;border:none;color:var(--t3);font-size:11px;cursor:pointer">🗑 Löschen</button>` : ''}
    </div>`).join('');
  $('btn-new-template').onclick = openNewTemplateModal;
}

function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem('re-custom-templates') || '[]'); } catch(e) { return []; }
}
function saveCustomTemplates(tmpl) { localStorage.setItem('re-custom-templates', JSON.stringify(tmpl)); }
function deleteCustomTemplate(id) {
  saveCustomTemplates(loadCustomTemplates().filter(t => t.id !== id));
  loadTemplates(); toast('✅ Vorlage gelöscht');
}

async function useTemplate(id) {
  if (id === 'tmpl-ai') { openAiTemplateDialog(); return; }
  const builtin = BUILTIN_TEMPLATES.find(t => t.id === id);
  const custom  = loadCustomTemplates().find(t => t.id === id);
  const t = builtin || custom;
  if (!t || !t.fields) return;
  // Ask for system
  const sysOpts = S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  openModal(`Vorlage: ${t.name}`, `
    <div style="background:var(--s2);border-radius:var(--r);padding:10px 13px;margin-bottom:14px;font-size:12px;color:var(--t2)">${t.icon} ${esc(t.desc)}</div>
    <div class="frow"><label>System</label><select id="tmpl-sys">${sysOpts}</select></div>
    <div class="frow"><label>Titel</label><input type="text" id="tmpl-title" value="${esc(t.fields.title)}"/></div>
    <div class="frow"><label>Beschreibung</label><textarea id="tmpl-desc-inp" rows="6">${esc(t.fields.description)}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label><select id="tmpl-cat">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option${t.fields.category===c?' selected':''}>${c}</option>`).join('')}</select></div>
      <div class="frow"><label>Priorität</label><select id="tmpl-pri"><option value="high"${t.fields.priority==='high'?' selected':''}>Hoch</option><option value="medium"${t.fields.priority==='medium'?' selected':''}>Mittel</option><option value="low"${t.fields.priority==='low'?' selected':''}>Niedrig</option></select></div>
    </div>
    <div class="frow"><label>Begründung</label><input type="text" id="tmpl-rat" value="${esc(t.fields.rationale||'')}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="saveFromTemplate()">Anforderung erstellen</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}

async function saveFromTemplate() {
  const title = $('tmpl-title').value.trim();
  if (!title) { toast('⚠ Titel erforderlich'); return; }
  const sysId = $('tmpl-sys').value;
  await window.api.saveRequirement({
    id: 'REQ-' + Date.now(), systemId: sysId,
    title, description: $('tmpl-desc-inp').value.trim(),
    category: $('tmpl-cat').value, priority: $('tmpl-pri').value,
    rationale: $('tmpl-rat').value.trim(),
    tags: ['vorlage'], createdBy: S.user.id, createdByName: S.user.name, status: 'open'
  });
  closeModal(); toast('✅ Anforderung aus Vorlage erstellt');
  addNotif('📝', 'Anforderung erstellt', `"${title}"`, () => switchView('business-reqs'));
  S.activeSystemId = sysId;
  if (S.activeView === 'business-chat') await refreshReqPane();
}

async function openAiTemplateDialog() {
  const sysOpts = S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  openModal('KI-Anforderung generieren', `
    <div class="frow"><label>System</label><select id="ai-tmpl-sys">${sysOpts}</select></div>
    <div class="frow"><label>Beschreiben Sie, was die Anforderung abdecken soll</label><textarea id="ai-tmpl-prompt" rows="4" placeholder="z.B.: Wir brauchen eine Anforderung für die Zwei-Faktor-Authentifizierung beim Login …"></textarea></div>
    <div class="frow"><label>Kategorie</label><select id="ai-tmpl-cat">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" id="btn-ai-tmpl-gen">✦ Generieren</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
  $('btn-ai-tmpl-gen').onclick = async () => {
    const prompt = $('ai-tmpl-prompt').value.trim();
    if (!prompt) { toast('⚠ Beschreibung eingeben'); return; }
    const btn = $('btn-ai-tmpl-gen'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    const res = await callAPI([{role:'user', content:`Erstelle eine professionelle Anforderung für: "${prompt}"\n\nKategorie: ${$('ai-tmpl-cat').value}\n\nJSON ohne Backticks:\n{"title":"...","description":"...","rationale":"...","priority":"medium","tags":["..."]}`}], langNote(), 800);
    btn.disabled = false; btn.innerHTML = '✦ Generieren';
    if (!res.ok) { toast('❌ ' + res.text); return; }
    try {
      const r = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
      await window.api.saveRequirement({...r, id:'REQ-'+Date.now(), systemId:$('ai-tmpl-sys').value, category:$('ai-tmpl-cat').value, createdBy:S.user.id, createdByName:S.user.name, status:'open'});
      closeModal(); toast('✅ KI-Anforderung erstellt');
      addNotif('🤖', 'KI-Anforderung erstellt', r.title, () => switchView('business-reqs'));
    } catch(e) { toast('❌ Parsing-Fehler'); }
  };
}

function openNewTemplateModal() {
  openModal('Eigene Vorlage erstellen', `
    <div class="frow"><label>Name</label><input type="text" id="ct-name" placeholder="z.B. GDPR-Anforderung"/></div>
    <div class="frow"><label>Icon (Emoji)</label><input type="text" id="ct-icon" value="📋" maxlength="2" style="width:60px"/></div>
    <div class="frow"><label>Kurzbeschreibung</label><input type="text" id="ct-desc" placeholder="Wofür ist diese Vorlage?"/></div>
    <div class="frow"><label>Titel-Vorlage</label><input type="text" id="ct-title" placeholder="z.B. GDPR-[Nr]: [Thema]"/></div>
    <div class="frow"><label>Beschreibungs-Vorlage</label><textarea id="ct-body" rows="5" placeholder="Beschreibung mit Platzhaltern …"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label><select id="ct-cat">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="frow"><label>Priorität</label><select id="ct-pri"><option value="high">Hoch</option><option value="medium" selected>Mittel</option><option value="low">Niedrig</option></select></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="saveCustomTemplate()">Vorlage speichern</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
function saveCustomTemplate() {
  const name = $('ct-name').value.trim(); if (!name) { toast('⚠ Name erforderlich'); return; }
  const custom = loadCustomTemplates();
  custom.push({ id:'ct-'+Date.now(), icon:$('ct-icon').value||'📋', name, desc:$('ct-desc').value.trim(), custom:true, fields:{ title:$('ct-title').value, description:$('ct-body').value, category:$('ct-cat').value, priority:$('ct-pri').value, rationale:'' }});
  saveCustomTemplates(custom); closeModal(); loadTemplates(); toast('✅ Vorlage gespeichert');
}

/* ══════════════════════════════════════════════════════════════
   PM: INTEGRATIONEN (Jira + Azure DevOps)
══════════════════════════════════════════════════════════════ */
function switchIntTab(tab) {
  document.querySelectorAll('.int-tab').forEach((t, i) => t.classList.toggle('active', i === (tab==='jira'?0:1)));
  document.querySelectorAll('.int-pane').forEach(p => p.classList.remove('active'));
  $(`int-pane-${tab}`)?.classList.add('active');
  if (tab === 'jira') initJiraPane();
  else initAdoPane();
}

async function loadPMIntegrations() {
  S.systems = await window.api.getSystems();
  // Initialize Jira side (default tab)
  initJiraPane();
}

async function initJiraPane() {
  const jiraSysSel = $('jira-sys-sel');
  if (jiraSysSel) {
    jiraSysSel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.filter(s => (S.user.systems||[]).includes(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
  if (S.settings.jiraUrl) { setVal('jira-url', S.settings.jiraUrl); setVal('jira-email', S.settings.jiraEmail); setVal('jira-token', S.settings.jiraToken); }
  const connectBtn = $('btn-jira-connect');
  if (connectBtn) connectBtn.onclick = connectJira;
  const exportBtn = $('btn-jira-export');
  if (exportBtn) exportBtn.onclick = jiraExport;
  const importBtn = $('btn-jira-import');
  if (importBtn) importBtn.onclick = jiraImport;
}

async function initAdoPane() {
  const sel = $('ado-sys-sel');
  if (sel) sel.innerHTML = '<option value="">System wählen …</option>' +
    S.systems.filter(s => (S.user.systems||[]).includes(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (S.settings.adoUrl) { setVal('ado-url', S.settings.adoUrl); setVal('ado-project', S.settings.adoProject); setVal('ado-token', S.settings.adoToken); }
  $('btn-ado-connect').onclick  = connectAdo;
  $('btn-ado-export').onclick   = adoExport;
  $('btn-ado-import').onclick   = adoImport;
}

// ── Azure DevOps ──────────────────────────────────────────────
async function connectAdo() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  if (!url || !project || !token) { toast('⚠ Alle Felder ausfüllen'); return; }
  $('ado-status').innerHTML = '<span class="spin"></span> Verbinde …';
  try {
    const auth = btoa(`:${token}`);
    const res  = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/workitemtypes?api-version=7.0`, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $('ado-status').innerHTML = '<span style="color:var(--grn)">✅ Verbunden</span>';
    $('ado-action-pane').style.display = '';
    S.settings.adoUrl = url; S.settings.adoProject = project; S.settings.adoToken = token;
    await window.api.saveSettings(S.settings);
    $('ado-results-pane').innerHTML = `<div style="padding:16px"><h3 style="font-size:15px;margin-bottom:8px">✅ Verbunden mit ${esc(url)}/${esc(project)}</h3><p style="font-size:13px;color:var(--t2)">Azure DevOps bereit.</p></div>`;
  } catch(e) {
    $('ado-status').innerHTML = `<span style="color:var(--red)">❌ Verbindung fehlgeschlagen: ${esc(e.message)}</span>`;
  }
}

async function adoExport() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  const sysId = $('ado-sys-sel').value;
  if (!url || !project || !token) { toast('⚠ Zuerst verbinden'); return; }
  if (!sysId) { toast('⚠ System wählen'); return; }
  const reqs = await window.api.getRequirements({ systemId: sysId });
  if (!reqs.length) { toast('ℹ Keine Anforderungen'); return; }
  const auth = btoa(`:${token}`);
  let ok = 0, err = 0;
  $('ado-results-pane').innerHTML = '<div style="padding:16px"><div class="spin"></div> Exportiere …</div>';
  for (const r of reqs) {
    try {
      const body = [
        { op:'add', path:'/fields/System.Title',       value: r.title },
        { op:'add', path:'/fields/System.Description', value: r.description || '' },
        { op:'add', path:'/fields/Microsoft.VSTS.Common.Priority', value: r.priority==='high'?1:r.priority==='low'?3:2 },
        { op:'add', path:'/fields/System.Tags',        value: (r.tags||[]).join('; ') },
      ];
      const res = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/workitems/$User%20Story?api-version=7.0`, {
        method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(body)
      });
      if (res.ok) ok++; else err++;
    } catch(e) { err++; }
  }
  $('ado-results-pane').innerHTML = `<div style="padding:16px"><h3 style="font-size:14px;color:var(--grn)">✅ Export abgeschlossen</h3><p style="font-size:13px;color:var(--t2);margin-top:8px">${ok} erfolgreich, ${err} fehlgeschlagen.</p></div>`;
  toast(`✅ ${ok} Work Items nach Azure DevOps exportiert`);
  addNotif('🔷', 'Azure DevOps Export', `${ok} Work Items exportiert`, () => switchView('pm-integrations'));
}

async function adoImport() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  if (!url || !project || !token) { toast('⚠ Zuerst verbinden'); return; }
  $('ado-results-pane').innerHTML = '<div style="padding:16px"><div class="spin"></div> Importiere …</div>';
  try {
    const auth = btoa(`:${token}`);
    const res = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0`, {
      method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.CreatedDate] DESC" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.workItems || [];
    window._adoItems = items;
    $('ado-results-pane').innerHTML = `<div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="font-size:14px">${items.length} Work Items aus ${esc(project)}</h3>
        <button class="btn-primary" style="font-size:12px" onclick="analyzeAdoImport()">✦ KI analysieren</button>
      </div>
      ${items.slice(0,50).map(i => `<div class="jira-issue"><span class="jira-key" style="color:var(--ba)">#${i.id}</span><div style="font-size:13px">${esc(i.fields?.['System.Title']||i.url||'')}</div></div>`).join('')}
      ${items.length > 50 ? `<p style="font-size:11px;color:var(--t3);margin-top:8px">… und ${items.length - 50} weitere</p>` : ''}
    </div>`;
    toast(`✅ ${items.length} Work Items geladen`);
  } catch(e) { $('ado-results-pane').innerHTML = `<div style="padding:16px;color:var(--red)">❌ Import fehlgeschlagen: ${esc(e.message)}</div>`; }
}

async function analyzeAdoImport() {
  if (!window._adoItems?.length) return;
  const list = window._adoItems.slice(0, 50).map(i => `#${i.id}: ${i.fields?.['System.Title']||''}`).join('\n');
  const res = await callAPI([{role:'user', content:`Analysiere diesen Azure DevOps Backlog: Duplikate, Lücken, Qualitätsprobleme, Priorisierungsempfehlungen.\n\n${list}`}], langNote(), 1500);
  if (!res.ok) return;
  const analysis = document.createElement('div');
  analysis.style.cssText = 'margin-top:16px;padding:14px;background:var(--s2);border-radius:var(--rl);font-size:13px;line-height:1.7;border:1px solid var(--b1)';
  analysis.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--ba);text-transform:uppercase;margin-bottom:8px">✦ KI-Analyse</div>${renderMD(res.text)}`;
  $('ado-results-pane').querySelector('div').appendChild(analysis);
}

window.loadTemplates=loadTemplates;
window.useTemplate=useTemplate;
window.saveFromTemplate=saveFromTemplate;
window.openAiTemplateDialog=openAiTemplateDialog;
window.openNewTemplateModal=openNewTemplateModal;
window.saveCustomTemplate=saveCustomTemplate;
window.deleteCustomTemplate=deleteCustomTemplate;
