'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/onboarding.js
 * Onboarding-Wizard — erster Start, System anlegen, erste Anforderungen.
 * Wird automatisch nach Login angezeigt wenn noch kein Setup vorhanden.
 */

async function checkAndShowOnboarding() {
  try {
    const status = await fetch('api/onboarding/status', { credentials:'include' }).then(r=>r.json());
    // Wizard zeigen wenn: nicht abgeschlossen UND noch kein System angelegt
    // Oder: nicht abgeschlossen UND noch keine Anforderungen (frischer Start)
    // Wizard zeigen wenn nicht abgeschlossen ODER kein System vorhanden
    const shouldShow = !status.complete || !status.steps.hasSystem;
    if (shouldShow) {
      showOnboardingWizard(status);
    }
  } catch(e) { /* Onboarding-Fehler ignorieren */ }
}

function showOnboardingWizard(status) {
  // Overlay über die App legen
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(5,5,12,.9);z-index:500;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);`;
  overlay.innerHTML = `
    <div id="onboarding-box" style="
      width:min(580px,95vw);background:var(--s1);border:1px solid var(--b2);
      border-radius:20px;box-shadow:0 40px 80px rgba(0,0,0,.5);
      overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
      <div id="onboarding-content" style="flex:1;overflow-y:auto"></div>
    </div>`;
  document.body.appendChild(overlay);
  window._onboardingStep = 1;
  window._onboardingData = {};
  renderOnboardingStep(1);
}

function renderOnboardingStep(step) {
  const steps = {
    1: renderWelcome,
    2: renderCreateSystem,
    3: renderAddReqs,
    4: renderImportStep,
    5: renderInviteHint,
    6: renderDone,
  };
  const fn = steps[step];
  if (fn) fn();
}

function renderWelcome() {
  $('onboarding-content').innerHTML = `
    <div style="padding:40px 36px;text-align:center">
      <div style="font-size:52px;margin-bottom:16px">🧠</div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Willkommen beim RE-Assistenten</h1>
      <p style="font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:24px">
        Ihr KI-gestütztes Requirements Engineering Tool.<br>
        Wir richten alles in 4 kurzen Schritten ein.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:28px">
        ${[
          { icon:'📋', label:'System anlegen', desc:'Ihr erstes Projekt' },
          { icon:'✦',  label:'Anforderungen', desc:'KI hilft beim Erfassen' },
          { icon:'🚀', label:'Loslegen',       desc:'Sofort produktiv' },
        ].map((s,i) => `
          <div style="background:var(--s2);border-radius:12px;padding:14px 10px;text-align:center">
            <div style="font-size:24px;margin-bottom:6px">${s.icon}</div>
            <div style="font-size:12px;font-weight:600">${esc(s.label)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(s.desc)}</div>
          </div>`).join('')}
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;font-size:14px" onclick="nextOnboardingStep()">
        Einrichtung starten →
      </button>
      <button onclick="skipOnboarding()" style="background:none;border:none;color:var(--t3);font-size:12px;cursor:pointer;margin-top:12px;display:block;width:100%">
        Überspringen — ich richte das selbst ein
      </button>
    </div>`;
}

function renderCreateSystem() {
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(1, 4, '📁', 'System anlegen', 'Ein System ist ein Projekt oder eine Softwarekomponente.')}
      <div class="frow" style="margin-bottom:14px">
        <label>Name des Systems</label>
        <input type="text" id="ob-sys-name" placeholder="z.B. Kundenverwaltung, Mobile App, API-Gateway …"
          style="font-size:14px" autofocus/>
      </div>
      <div class="frow" style="margin-bottom:20px">
        <label>Kurze Beschreibung</label>
        <textarea id="ob-sys-desc" rows="3" placeholder="Was macht dieses System? Für wen ist es gedacht?"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" id="ob-create-sys-btn" onclick="onboardingCreateSystem()">
          System anlegen →
        </button>
      </div>
    </div>`;
  $('ob-sys-name').focus();
  $('ob-sys-name').onkeydown = e => { if (e.key==='Enter') onboardingCreateSystem(); };
}

async function onboardingCreateSystem() {
  const name = $('ob-sys-name')?.value.trim();
  const desc = $('ob-sys-desc')?.value.trim();
  if (!name) { $('ob-sys-name').style.borderColor='var(--red)'; return; }
  const btn = $('ob-create-sys-btn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  const id = 'sys-' + Date.now();
  await window.api.saveSystem({ id, name, description:desc });
  S.systems = await window.api.getSystems();
  window._onboardingData.systemId   = id;
  window._onboardingData.systemName = name;
  nextOnboardingStep();
}

function renderAddReqs() {
  const sysName = window._onboardingData.systemName || 'Ihr System';
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(2, 4, '✦', 'Erste Anforderungen', `KI hilft Ihnen beim Erfassen der Anforderungen für "${sysName}".`)}

      <div style="background:var(--s2);border-radius:12px;padding:14px;margin-bottom:14px;font-size:13px;color:var(--t2);line-height:1.6">
        💡 Beschreiben Sie kurz was das System können soll — die KI strukturiert es automatisch.
      </div>

      <div class="frow" style="margin-bottom:8px">
        <label>Was soll "${esc(sysName)}" können?</label>
        <textarea id="ob-req-text" rows="5"
          placeholder="Beispiel: Nutzer sollen sich mit E-Mail und Passwort anmelden können. Das System soll Kundendaten verwalten und Berichte generieren. Bei Fehlern soll eine verständliche Meldung erscheinen …"></textarea>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn-secondary" style="flex:1" onclick="onboardingSkipReqs()">Später manuell hinzufügen</button>
        <button class="btn-primary" style="flex:1" id="ob-gen-reqs-btn" onclick="onboardingGenerateReqs()">
          ✦ KI extrahieren
        </button>
      </div>

      <div id="ob-req-preview"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px" id="ob-req-nav" style="display:none">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" id="ob-save-reqs-btn" onclick="onboardingSaveReqs()">Speichern →</button>
      </div>
      <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="prevOnboardingStep()">← Zurück</button>
    </div>`;
}

async function onboardingGenerateReqs() {
  const text = $('ob-req-text')?.value.trim();
  if (!text) { toast('⚠ Bitte erst beschreiben was das System können soll'); return; }
  const btn = $('ob-gen-reqs-btn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Analysiere …';

  const res = await callAPI([{ role:'user', content:
    `Extrahiere strukturierte Anforderungen aus dieser Beschreibung. ${langNote()}
JSON-Array ohne Backticks:
[{"title":"...","description":"...","category":"Funktional","priority":"medium","rationale":""}]
Max. 8 Anforderungen.

Beschreibung: "${text}"` }], langNote(), 1200);

  btn.disabled=false; btn.innerHTML='✦ KI extrahieren';
  if (!res.ok) { toast('❌ ' + res.text); return; }

  try {
    const reqs = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
    window._onboardingData.generatedReqs = reqs;

    $('ob-req-preview').innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--aa);margin-bottom:8px">
        ✓ ${reqs.length} Anforderungen erkannt:
      </div>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--b1);border-radius:10px">
        ${reqs.map((r,i) => `
          <div style="padding:9px 12px;border-bottom:1px solid var(--b1);display:flex;gap:8px;align-items:center">
            <input type="checkbox" checked id="ob-req-cb-${i}"/>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
              <div style="font-size:11px;color:var(--t3)">${esc(r.category)} · ${esc(r.priority)}</div>
            </div>
          </div>`).join('')}
      </div>`;
    $('ob-req-nav').style.display='grid';
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

async function onboardingSaveReqs() {
  const reqs = window._onboardingData.generatedReqs || [];
  const sysId = window._onboardingData.systemId;
  if (!sysId) return;
  let saved = 0;
  for (let i=0; i<reqs.length; i++) {
    if ($(`ob-req-cb-${i}`)?.checked !== false) {
      await window.api.saveRequirement({
        ...reqs[i],
        id: 'REQ-'+Date.now()+'-'+i,
        systemId: sysId,
        createdBy: S.user.id,
        createdByName: S.user.name,
        status: 'open',
      });
      saved++;
    }
  }
  toast(`✅ ${saved} Anforderungen gespeichert`);
  nextOnboardingStep();
}

function onboardingSkipReqs() { nextOnboardingStep(); }

// ── Schritt 4: Import (optional) ─────────────────────────────
function renderImportStep() {
  const sysName = window._onboardingData?.systemName || 'Ihr System';
  const sysId   = window._onboardingData?.systemId;

  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(3, 4, '📥', 'Anforderungen importieren',
        'Bestehende Anforderungen aus Jira oder einer Datei importieren — optional.')}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">

        <!-- Jira -->
        <div id="ob-import-jira" onclick="obSelectImportSource('jira')" style="
          background:var(--s2);border:2px solid var(--b1);border-radius:12px;
          padding:16px;cursor:pointer;transition:all .15s;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">🔗</div>
          <div style="font-size:13px;font-weight:600">Aus Jira importieren</div>
          <div style="font-size:11px;color:var(--t3);margin-top:4px">Issues als Anforderungen</div>
        </div>

        <!-- Datei -->
        <div id="ob-import-file" onclick="obSelectImportSource('file')" style="
          background:var(--s2);border:2px solid var(--b1);border-radius:12px;
          padding:16px;cursor:pointer;transition:all .15s;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">📄</div>
          <div style="font-size:13px;font-weight:600">Datei importieren</div>
          <div style="font-size:11px;color:var(--t3);margin-top:4px">CSV, JSON, Excel, Markdown</div>
        </div>
      </div>

      <!-- Jira-Formular -->
      <div id="ob-jira-form" style="display:none;margin-bottom:12px">
        <div class="frow">
          <label>Jira URL</label>
          <input type="text" id="ob-jira-url" placeholder="https://mein-projekt.atlassian.net"/>
        </div>
        <div class="frow">
          <label>E-Mail</label>
          <input type="email" id="ob-jira-email" placeholder="user@firma.de"/>
        </div>
        <div class="frow">
          <label>API-Token</label>
          <input type="password" id="ob-jira-token" placeholder="Token aus Atlassian Account Settings"/>
        </div>
        <button class="btn-primary" style="width:100%;font-size:12px" id="ob-jira-connect-btn"
          onclick="obConnectJira('${sysId}')">🔗 Verbinden & importieren</button>
        <div id="ob-jira-status" style="margin-top:8px;font-size:12px"></div>
      </div>

      <!-- Datei-Import -->
      <div id="ob-file-form" style="display:none;margin-bottom:12px">
        <button class="btn-secondary" style="width:100%" onclick="obPickImportFile('${sysId}')">
          📂 Datei wählen (CSV, JSON, Excel, Markdown)
        </button>
        <div id="ob-file-status" style="margin-top:8px;font-size:12px"></div>
      </div>

      <div id="ob-import-preview" style="margin-bottom:12px"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" onclick="nextOnboardingStep()">
          Weiter → <span style="font-size:10px;opacity:.7">(überspringen)</span>
        </button>
      </div>
    </div>`;
}

function obSelectImportSource(source) {
  const jiraCard = document.getElementById('ob-import-jira');
  const fileCard = document.getElementById('ob-import-file');
  const jiraForm = document.getElementById('ob-jira-form');
  const fileForm = document.getElementById('ob-file-form');

  // Reset
  [jiraCard, fileCard].forEach(el => {
    if (el) el.style.borderColor = 'var(--b1)';
  });

  if (source === 'jira') {
    if (jiraCard) jiraCard.style.borderColor = 'var(--aa)';
    if (jiraForm) jiraForm.style.display = '';
    if (fileForm) fileForm.style.display = 'none';
  } else {
    if (fileCard) fileCard.style.borderColor = 'var(--aa)';
    if (fileForm) fileForm.style.display = '';
    if (jiraForm) jiraForm.style.display = 'none';
  }
}

async function obConnectJira(sysId) {
  const url   = document.getElementById('ob-jira-url')?.value.trim();
  const email = document.getElementById('ob-jira-email')?.value.trim();
  const token = document.getElementById('ob-jira-token')?.value.trim();
  const statusEl = document.getElementById('ob-jira-status');
  const btn   = document.getElementById('ob-jira-connect-btn');

  if (!url || !email || !token) { toast('⚠ Alle Felder ausfüllen'); return; }
  if (!url.startsWith('http')) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">❌ URL muss mit https:// beginnen</span>';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Verbinde …';
  if (statusEl) statusEl.innerHTML = '';

  try {
    const res = await window.api.jiraGetProjects({ url, email, token });
    const projects = res.values || res.data?.values || [];

    if (!projects.length) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">❌ Keine Projekte gefunden oder Zugangsdaten falsch</span>';
      btn.disabled = false; btn.innerHTML = '🔗 Verbinden & importieren';
      return;
    }

    // Erstes Projekt automatisch importieren
    const pk = projects[0].key;
    if (statusEl) statusEl.innerHTML = `<span class="spin"></span> Lade Issues aus ${pk} …`;

    const issuesRes = await window.api.jiraGetIssues({ url, email, token, projectKey: pk });
    const issues = issuesRes.issues || [];

    if (!issues.length) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--amb)">⚠ Keine Issues gefunden</span>';
      btn.disabled = false; btn.innerHTML = '🔗 Verbinden & importieren';
      return;
    }

    // In Anforderungen konvertieren + Prefix erkennen
    const reqs = issues.map(i => ({
      id:          i.key,
      title:       i.fields?.summary || i.key,
      description: i.fields?.description?.content?.[0]?.content?.[0]?.text || '',
      priority:    normalizePriorityOb(i.fields?.priority?.name),
      category:    i.fields?.issuetype?.name || 'Funktional',
      status:      normalizeStatusOb(i.fields?.status?.name),
      tags:        i.fields?.labels || [],
    }));

    // Prefix erkennen und System-ID-Schema setzen
    const detectedPrefix = detectPrefix(issues.map(i => i.key));
    if (detectedPrefix && sysId) {
      await applyDetectedPrefix(sysId, detectedPrefix, issues.map(i=>i.key));
    }

    showObImportPreview(reqs, sysId, `Jira: ${pk} (${reqs.length} Issues)`, detectedPrefix);
    btn.disabled = false; btn.innerHTML = '🔗 Verbinden & importieren';

  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
    btn.disabled = false; btn.innerHTML = '🔗 Verbinden & importieren';
  }
}

async function obPickImportFile(sysId) {
  const files = await window.api.pickFiles('.csv,.json,.xlsx,.xls,.txt,.md');
  if (!files.length) return;
  const file = files[0];
  const ext  = file.name.split('.').pop().toLowerCase();
  const statusEl = document.getElementById('ob-file-status');

  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Lese Datei …';

  try {
    let reqs = [];
    if (ext === 'csv' || ext === 'txt') reqs = await parseCSV(file);
    else if (ext === 'json')            reqs = await parseJSON(file);
    else if (ext === 'xlsx' || ext === 'xls') reqs = await parseExcel(file);
    else if (ext === 'md')              reqs = await parseMarkdown(file);
    else { toast('⚠ Nicht unterstütztes Format'); return; }

    if (!reqs.length) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--amb)">ℹ Keine Anforderungen erkannt</span>'; return; }

    // Prefix erkennen
    const ids = reqs.map(r => r.id).filter(Boolean);
    const detectedPrefix = detectPrefix(ids);
    if (detectedPrefix && sysId) {
      await applyDetectedPrefix(sysId, detectedPrefix, ids);
    }

    if (statusEl) statusEl.innerHTML = '';
    showObImportPreview(reqs, sysId, file.name, detectedPrefix);
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

// ── Prefix-Erkennung ──────────────────────────────────────────
function detectPrefix(ids) {
  if (!ids?.length) return null;
  // Regex: Buchstaben/Zahlen/_ bis zum letzten - gefolgt von Zahl
  const prefixCounts = {};
  for (const id of ids) {
    const m = String(id).match(/^([A-Z][A-Z0-9_-]*)-\d+$/i);
    if (m) {
      const p = m[1].toUpperCase();
      prefixCounts[p] = (prefixCounts[p] || 0) + 1;
    }
  }
  if (!Object.keys(prefixCounts).length) return null;
  // Häufigsten Prefix zurückgeben
  return Object.entries(prefixCounts).sort((a,b) => b[1]-a[1])[0][0];
}

function getMaxCounter(ids, prefix) {
  let max = 0;
  for (const id of ids) {
    const m = String(id).match(new RegExp(`^${prefix}-(\d+)$`, 'i'));
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return max;
}

async function applyDetectedPrefix(sysId, prefix, ids) {
  const counter = getMaxCounter(ids, prefix);
  // System mit erkanntem Prefix + Counter aktualisieren
  const sys = S.systems?.find(s => s.id === sysId);
  if (sys) {
    sys.idPrefix  = prefix;
    sys.idCounter = counter;
    await window.api.saveSystem({ ...sys });
  }
}

function showObImportPreview(reqs, sysId, filename, detectedPrefix) {
  const wrap = document.getElementById('ob-import-preview');
  if (!wrap) return;

  wrap.innerHTML = `
    <div style="background:var(--grnbg);border:1px solid rgba(63,185,80,.3);
      border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">
        ✅ ${reqs.length} Anforderungen erkannt
      </div>
      ${detectedPrefix ? `
        <div style="font-size:12px;color:var(--t2)">
          Erkannter Prefix: <code style="color:var(--aa)">${esc(detectedPrefix)}</code>
          — neue Anforderungen werden als <code style="color:var(--aa)">${esc(detectedPrefix)}-XXX</code> angelegt
        </div>` : ''}
      <div style="font-size:11px;color:var(--t3);margin-top:4px">Aus: ${esc(filename)}</div>
    </div>
    <div style="max-height:160px;overflow-y:auto;border:1px solid var(--b1);
      border-radius:8px;margin-bottom:12px">
      ${reqs.slice(0,5).map(r => `
        <div style="padding:7px 12px;border-bottom:1px solid var(--b1);font-size:12px">
          ${r.id ? `<code style="font-size:10px;color:var(--t3);margin-right:6px">${esc(r.id)}</code>` : ''}
          ${esc(r.title)}
        </div>`).join('')}
      ${reqs.length > 5 ? `<div style="padding:6px 12px;font-size:11px;color:var(--t3)">… und ${reqs.length-5} weitere</div>` : ''}
    </div>
    <button class="btn-primary" style="width:100%;font-size:12px" onclick="obExecuteImport(${JSON.stringify(reqs).replace(/</g,'\u003c').replace(/'/g,"\'")}, '${sysId}')">
      ↑ ${reqs.length} Anforderungen importieren
    </button>`;
}

async function obExecuteImport(reqs, sysId) {
  const btn = document.querySelector('#ob-import-preview .btn-primary');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span> Importiere …'; }

  try {
    const res  = await fetch('api/requirements/import', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ systemId: sysId, requirements: reqs, mode: 'merge' }),
    });
    const data = await res.json();
    const wrap = document.getElementById('ob-import-preview');
    if (wrap) wrap.innerHTML = `
      <div style="background:var(--grnbg);border:1px solid rgba(63,185,80,.3);
        border-radius:10px;padding:12px 14px;text-align:center">
        <div style="font-size:24px;margin-bottom:6px">✅</div>
        <div style="font-size:13px;font-weight:600">${data.added} Anforderungen importiert</div>
        <div style="font-size:11px;color:var(--t2)">${data.updated} aktualisiert · ${data.skipped} übersprungen</div>
      </div>`;

    // Weiter-Button aktualisieren
    const navBtn = document.querySelector('#onboarding-content .btn-primary:last-child');
    if (navBtn) { navBtn.textContent = 'Weiter →'; navBtn.style.opacity = '1'; }

  } catch(e) {
    if (btn) { btn.disabled=false; btn.innerHTML='Erneut versuchen'; }
    toast('❌ Import fehlgeschlagen: ' + e.message);
  }
}

function normalizePriorityOb(p) {
  const s = String(p||'').toLowerCase();
  if (s.includes('high')||s.includes('hoch')||s==='1'||s==='critical') return 'high';
  if (s.includes('low')||s.includes('niedrig')||s==='3') return 'low';
  return 'medium';
}
function normalizeStatusOb(s) {
  const l = String(s||'').toLowerCase();
  if (l.includes('done')||l.includes('erledigt')||l.includes('closed')) return 'done';
  if (l.includes('progress')||l.includes('bearbeitung')) return 'in-progress';
  return 'open';
}

function renderInviteHint() {
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(4, 4, '👥', 'Team einladen', 'Laden Sie Kollegen mit verschiedenen Rollen ein.')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
        ${[
          { role:'Business',         icon:'💼', desc:'Prozesse beschreiben, Anforderungen erfassen' },
          { role:'Business Analyst', icon:'🔬', desc:'QS-Prüfung, Diagramme, Workshops' },
          { role:'Projektmanager',   icon:'📊', desc:'Backlog, Priorisierung, Jira-Export' },
          { role:'Entwickler',       icon:'👨‍💻', desc:'Aufgaben einsehen, Code-Analyse' },
        ].map(r => `
          <div style="background:var(--s2);border-radius:10px;padding:12px">
            <div style="font-size:18px;margin-bottom:4px">${r.icon}</div>
            <div style="font-size:12px;font-weight:600">${esc(r.role)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px;line-height:1.4">${esc(r.desc)}</div>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--t3);margin-bottom:16px">
        Benutzer können unter <strong>Einstellungen → Benutzerverwaltung</strong> angelegt werden.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" onclick="nextOnboardingStep()">Weiter →</button>
      </div>
    </div>`;
}

function renderDone() {
  const sysName = window._onboardingData.systemName;
  const reqCount = (window._onboardingData.generatedReqs||[]).length;
  $('onboarding-content').innerHTML = `
    <div style="padding:40px 36px;text-align:center">
      <div style="font-size:52px;margin-bottom:16px">🎉</div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Alles bereit!</h1>
      <p style="font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:20px">
        ${sysName ? `System "<strong>${esc(sysName)}</strong>" wurde angelegt.` : ''}
        ${reqCount ? ` ${reqCount} Anforderungen wurden erfasst.` : ''}
        <br>Sie können jetzt sofort loslegen.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        ${[
          { icon:'💬', label:'Chat starten — mit KI Anforderungen besprechen', view:'business-chat' },
          { icon:'🔬', label:'QS-Prüfung durchführen', view:'ba-quality' },
          { icon:'📊', label:'Backlog erstellen', view:'pm-backlog' },
        ].map(a => `
          <button class="btn-secondary" style="text-align:left;padding:12px 14px"
            onclick="finishOnboarding('${a.view}')">
            <span style="margin-right:8px">${a.icon}</span>${esc(a.label)}
          </button>`).join('')}
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;font-size:14px"
        onclick="finishOnboarding()">
        Zum Dashboard
      </button>
    </div>`;
}

async function finishOnboarding(targetView) {
  await fetch('api/onboarding/complete', { method:'POST', credentials:'include' });
  document.getElementById('onboarding-overlay')?.remove();

  // Systeme immer neu laden
  S.systems = await window.api.getSystems();

  // Admin-Systemliste aktualisieren falls offen
  if (typeof loadAdminSystems === 'function') {
    try { await loadAdminSystems(); } catch(e) {}
  }

  if (targetView) {
    switchView(targetView);
  } else {
    const view = S.user.role === 'admin' ? 'admin-systems' :
                 S.user.role === 'business' ? 'business-chat' :
                 S.user.role === 'businessanalyst' ? 'ba-dashboard' :
                 S.user.role === 'projectmanager' ? 'pm-dashboard' : 'dev-work';
    switchView(view);
  }

  if (typeof addNotif === 'function')
    addNotif('🎉', 'System angelegt', `"${window._onboardingData?.systemName || 'Neues System'}" ist bereit`);

  window._onboardingData = {};
}

async function skipOnboarding() {
  await fetch('api/onboarding/complete', { method:'POST', credentials:'include' });
  document.getElementById('onboarding-overlay')?.remove();
}

function nextOnboardingStep() {
  window._onboardingStep = (window._onboardingStep || 1) + 1;
  renderOnboardingStep(window._onboardingStep);
}
function prevOnboardingStep() {
  window._onboardingStep = Math.max(1, (window._onboardingStep || 1) - 1);
  renderOnboardingStep(window._onboardingStep);
}

function onboardingHeader(step, total, icon, title, subtitle) {
  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        ${Array.from({length:total}).map((_,i)=>`
          <div style="height:4px;flex:1;border-radius:2px;background:${i<step?'var(--aa)':'var(--s3)'}"></div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Schritt ${step} von ${total}</div>
      <div style="font-size:28px;margin-bottom:8px">${icon}</div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(title)}</h2>
      <p style="font-size:13px;color:var(--t2)">${subtitle}</p>
    </div>`;
}


// ── Wizard für neues System starten ──────────────────────────
function startNewSystemWizard() {
  window._onboardingData = {};
  showOnboardingWizard({ complete: false, steps: { hasSystem: false, hasRequirements: false } });
}
window.obSelectImportSource = obSelectImportSource;
window.obConnectJira        = obConnectJira;
window.obPickImportFile     = obPickImportFile;
window.obExecuteImport      = obExecuteImport;
window.showObImportPreview  = showObImportPreview;
window.startNewSystemWizard = startNewSystemWizard;
window.checkAndShowOnboarding = checkAndShowOnboarding;
window.nextOnboardingStep     = nextOnboardingStep;
window.prevOnboardingStep     = prevOnboardingStep;
window.onboardingCreateSystem = onboardingCreateSystem;
window.onboardingGenerateReqs = onboardingGenerateReqs;
window.onboardingSaveReqs     = onboardingSaveReqs;
window.onboardingSkipReqs     = onboardingSkipReqs;
window.finishOnboarding       = finishOnboarding;
window.skipOnboarding         = skipOnboarding;
window.detectPrefix           = detectPrefix;
window.getMaxCounter          = getMaxCounter;
