'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/import.js
 * B: Requirements-Import — CSV, Excel, JSON, JIRA-Export, Azure DevOps Export.
 * Parsing passiert im Browser, dann API-Upload.
 */

async function loadImportView() {
  S.systems = await window.api.getSystems();
  const sel = $('import-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
  $('btn-import-file').onclick  = pickImportFile;
  $('btn-import-jira').onclick  = openJiraImportDialog;
  $('btn-import-paste').onclick = openPasteDialog;
}

// ── Datei-Import ──────────────────────────────────────────────
async function pickImportFile() {
  const sysId = $('import-sys-sel').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }

  const files = await window.api.pickFiles('.csv,.json,.xml,.xlsx,.xls,.txt,.md');
  if (!files.length) return;
  const file = files[0];
  const ext  = file.name.split('.').pop().toLowerCase();

  $('import-preview').innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lese Datei …</p></div>';

  try {
    let reqs = [];
    if (ext === 'csv' || ext === 'txt')    reqs = await parseCSV(file);
    else if (ext === 'json')               reqs = await parseJSON(file);
    else if (ext === 'xml')                reqs = await parseJiraXML(file);
    else if (ext === 'xlsx' || ext === 'xls') reqs = await parseExcel(file);
    else if (ext === 'md')                 reqs = await parseMarkdown(file);
    else { toast('⚠ Nicht unterstütztes Format'); return; }

    if (!reqs.length) { toast('ℹ Keine Anforderungen erkannt'); return; }
    showImportPreview(reqs, sysId, file.name);
  } catch(e) {
    toast('❌ Fehler beim Lesen: ' + e.message);
    $('import-preview').innerHTML = '';
  }
}

// ── CSV Parser ────────────────────────────────────────────────
async function parseCSV(file) {
  const text = await file.text();
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return [];

  // Header-Zeile erkennen
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
  const colMap = {
    id:          header.findIndex(h => ['id','req-id','req_id','anforderung-id'].includes(h)),
    title:       header.findIndex(h => ['title','titel','name','summary','zusammenfassung'].includes(h)),
    description: header.findIndex(h => ['description','beschreibung','desc','details'].includes(h)),
    priority:    header.findIndex(h => ['priority','priorität','prioritat','prio'].includes(h)),
    category:    header.findIndex(h => ['category','kategorie','type','typ'].includes(h)),
    status:      header.findIndex(h => ['status','zustand'].includes(h)),
    rationale:   header.findIndex(h => ['rationale','begründung','reason','grund'].includes(h)),
  };

  const reqs = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    const get  = (idx) => idx >= 0 ? (cols[idx] || '').replace(/^"|"$/g,'').trim() : '';
    const title = get(colMap.title) || get(0);
    if (!title) continue;
    reqs.push({
      id:          get(colMap.id) || null,
      title,
      description: get(colMap.description),
      priority:    normalizePriority(get(colMap.priority)),
      category:    get(colMap.category) || 'Funktional',
      status:      normalizeStatus(get(colMap.status)),
      rationale:   get(colMap.rationale),
      tags:        [],
    });
  }
  return reqs;
}

function parseCSVLine(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += line[i];
  }
  cols.push(cur);
  return cols;
}

// ── JSON Parser ───────────────────────────────────────────────
async function parseJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  // Verschiedene JSON-Formate erkennen
  const list = Array.isArray(data) ? data
    : data.requirements ? data.requirements
    : data.issues       ? data.issues           // JIRA-Export
    : data.value        ? data.value            // Azure DevOps
    : [];

  return list.map(item => ({
    id:          item.id || item.key || null,
    title:       item.title || item.summary || item.fields?.summary || item.fields?.['System.Title'] || 'Untitled',
    description: item.description || item.fields?.description?.content?.[0]?.content?.[0]?.text || item.fields?.['System.Description'] || '',
    priority:    normalizePriority(item.priority || item.fields?.priority?.name || item.fields?.['Microsoft.VSTS.Common.Priority'] || 'medium'),
    category:    item.category || item.fields?.issuetype?.name || 'Funktional',
    status:      normalizeStatus(item.status || item.fields?.status?.name || ''),
    rationale:   item.rationale || '',
    tags:        item.tags || item.fields?.labels || [],
  }));
}


// ── JIRA XML Parser ───────────────────────────────────────────
// Unterstützt JIRA XML-Export (Suche → Export → XML)
// Format: <rss><channel><item>...</item></channel></rss>
async function parseJiraXML(file) {
  const text   = await file.text();
  const parser = new DOMParser();
  const doc    = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Ungültiges XML: ' + parseError.textContent.slice(0, 100));

  const reqs = [];

  // ── JIRA RSS-Format (/rss/channel/item) ──────────────────────
  const items = doc.querySelectorAll('rss > channel > item, feed > entry, items > item');
  if (items.length) {
    items.forEach(item => {
      const get  = tag  => item.querySelector(tag)?.textContent?.trim() || '';
      const getA = (tag, attr) => item.querySelector(tag)?.getAttribute(attr)?.trim() || '';

      const key   = get('key') || getA('key', 'id') || '';
      const title = get('summary') || get('title') || key || 'Untitled';
      const desc  = get('description') || get('body') || '';
      const prio  = get('priority') || '';
      const status = get('status') || get('statusName') || '';
      const type  = get('type') || get('issuetype') || get('issueType') || 'Funktional';
      const labels = Array.from(item.querySelectorAll('labels label, labels > *'))
        .map(l => l.textContent.trim()).filter(Boolean);

      reqs.push({
        id:          key,
        title,
        description: stripHTML(desc),
        priority:    normalizePriority(prio),
        category:    normalizeIssueType(type),
        status:      normalizeStatus(status),
        tags:        labels,
        rationale:   '',
      });
    });
    return reqs;
  }

  // ── Generisches XML-Format (/requirements/requirement) ───────
  const reqNodes = doc.querySelectorAll('requirement, Requirement, REQUIREMENT');
  if (reqNodes.length) {
    reqNodes.forEach(node => {
      const get = tag => node.querySelector(tag)?.textContent?.trim()
        || node.getAttribute(tag) || '';
      reqs.push({
        id:          get('id') || get('ID') || get('key'),
        title:       get('title') || get('Title') || get('name') || get('summary'),
        description: get('description') || get('Description') || get('text'),
        priority:    normalizePriority(get('priority') || get('Priority')),
        category:    normalizeIssueType(get('category') || get('type') || get('issueType')),
        status:      normalizeStatus(get('status') || get('Status')),
        tags:        [],
        rationale:   get('rationale') || get('justification') || '',
      });
    });
    return reqs;
  }

  throw new Error('Kein unterstütztes XML-Format erkannt (JIRA RSS oder generisches Requirements-XML erwartet)');
}

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeIssueType(type) {
  const t = String(type||'').toLowerCase();
  if (t.includes('bug') || t.includes('fehler'))             return 'Fehler';
  if (t.includes('story') || t.includes('user'))             return 'User Story';
  if (t.includes('epic'))                                     return 'Epic';
  if (t.includes('task') || t.includes('aufgabe'))            return 'Aufgabe';
  if (t.includes('sub') || t.includes('unter'))               return 'Sub-Task';
  if (t.includes('nonfunc') || t.includes('nicht-funk'))      return 'Nicht-Funktional';
  return 'Funktional';
}

// ── Excel Parser (ohne externe Bibliothek) ────────────────────
async function parseExcel(file) {
  // Fallback: Excel als CSV behandeln wenn keine SheetJS-Bibliothek
  try {
    // Versuche SheetJS falls geladen
    if (window.XLSX) {
      const buf  = await file.arrayBuffer();
      const wb   = window.XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = window.XLSX.utils.sheet_to_json(ws, { header:1 });
      if (!data.length) return [];
      const [header, ...rows] = data;
      const colIdx = {
        title: header.findIndex(h => /titel|title|name|summary/i.test(String(h))),
        desc:  header.findIndex(h => /beschreibung|description|details/i.test(String(h))),
        prio:  header.findIndex(h => /priorit|prio/i.test(String(h))),
        cat:   header.findIndex(h => /kategorie|category|type/i.test(String(h))),
      };
      return rows.filter(r => r.length).map(row => ({
        title:       String(row[colIdx.title >= 0 ? colIdx.title : 0] || '').trim(),
        description: String(row[colIdx.desc  >= 0 ? colIdx.desc  : 1] || '').trim(),
        priority:    normalizePriority(String(row[colIdx.prio >= 0 ? colIdx.prio : 2] || '')),
        category:    String(row[colIdx.cat  >= 0 ? colIdx.cat  : 3] || 'Funktional').trim(),
        tags: [], status: 'open',
      })).filter(r => r.title);
    }
  } catch(e) {}
  // Fallback: als Text behandeln
  toast('ℹ Excel direkt nicht unterstützt — bitte als CSV speichern');
  return [];
}

// ── Markdown Parser ───────────────────────────────────────────
async function parseMarkdown(file) {
  const text  = await file.text();
  const reqs  = [];
  const lines = text.split('\n');
  let cur     = null;

  for (const line of lines) {
    const h2 = line.match(/^#{1,3}\s+(.+)/);
    if (h2) {
      if (cur) reqs.push(cur);
      cur = { title: h2[1].trim(), description: '', priority: 'medium', category: 'Funktional', tags: [], status: 'open' };
    } else if (cur && line.trim() && !line.startsWith('#')) {
      const prioMatch = line.match(/\*\*Priorität:\*\*\s*(\w+)/i);
      const catMatch  = line.match(/\*\*Kategorie:\*\*\s*(.+)/i);
      if (prioMatch) cur.priority = normalizePriority(prioMatch[1]);
      else if (catMatch) cur.category = catMatch[1].trim();
      else cur.description += (cur.description ? '\n' : '') + line.trim();
    }
  }
  if (cur) reqs.push(cur);
  return reqs.filter(r => r.title);
}

// ── Normalisierung ────────────────────────────────────────────
function normalizePriority(p) {
  const s = String(p || '').toLowerCase();
  if (s.includes('hoch') || s.includes('high') || s === '1' || s === 'critical') return 'high';
  if (s.includes('niedrig') || s.includes('low') || s === '3') return 'low';
  return 'medium';
}
function normalizeStatus(s) {
  const l = String(s || '').toLowerCase();
  if (l.includes('done') || l.includes('erledigt') || l.includes('closed')) return 'done';
  if (l.includes('progress') || l.includes('bearbeitung')) return 'in-progress';
  return 'open';
}

// ── Vorschau & Bestätigung ────────────────────────────────────
function showImportPreview(reqs, sysId, filename) {
  const wrap = $('import-preview');
  if (!wrap) return;

  const priCounts = { high:0, medium:0, low:0 };
  reqs.forEach(r => priCounts[r.priority] = (priCounts[r.priority]||0) + 1);

  wrap.innerHTML = `
    <div style="background:var(--s2);border-radius:var(--r);padding:12px 14px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">
        📂 ${esc(filename)} — ${reqs.length} Anforderungen erkannt
      </div>
      ${(() => {
        const ids = reqs.map(r=>r.id).filter(Boolean);
        const prefixCounts = {};
        ids.forEach(id => { const m = String(id).match(/^([A-Z][A-Z0-9_-]*)-\d+$/i); if(m) prefixCounts[m[1].toUpperCase()]=(prefixCounts[m[1].toUpperCase()]||0)+1; });
        const top = Object.entries(prefixCounts).sort((a,b)=>b[1]-a[1])[0];
        return top ? `<div style="font-size:11px;color:var(--aa)">✓ Erkannter Prefix: <code>${esc(top[0])}</code> — wird als ID-Schema übernommen</div>` : '';
      })()}
      <div style="display:flex;gap:10px;font-size:12px;color:var(--t2)">
        <span style="color:var(--red)">● Hoch: ${priCounts.high}</span>
        <span style="color:var(--amb)">● Mittel: ${priCounts.medium}</span>
        <span style="color:var(--grn)">● Niedrig: ${priCounts.low}</span>
      </div>
    </div>

    <div style="font-size:12px;font-weight:500;margin-bottom:6px;color:var(--t2)">Vorschau (erste 10):</div>
    <div style="max-height:240px;overflow-y:auto;border:1px solid var(--b1);border-radius:var(--r);margin-bottom:12px">
      ${reqs.slice(0,10).map((r,i) => `
        <div style="display:flex;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--b1)">
          <input type="checkbox" checked id="imp-cb-${i}" style="flex-shrink:0"/>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
            ${r.description ? `<div style="font-size:11px;color:var(--t3)">${esc(r.description.substring(0,80))}${r.description.length>80?'…':''}</div>` : ''}
          </div>
          <span class="sbadge p-${r.priority}" style="font-size:9px;flex-shrink:0">${priLabel(r.priority)}</span>
          <span class="rtag" style="font-size:9px;flex-shrink:0">${esc(r.category)}</span>
        </div>`).join('')}
      ${reqs.length > 10 ? `<div style="padding:8px 12px;font-size:11px;color:var(--t3)">… und ${reqs.length-10} weitere</div>` : ''}
    </div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label style="font-size:12px;color:var(--t2)">Bei Duplikaten:</label>
      <select id="import-mode" style="font-size:12px;padding:4px 8px">
        <option value="merge">Überspringen (empfohlen)</option>
        <option value="replace">Überschreiben</option>
        <option value="duplicate">Trotzdem importieren</option>
      </select>
      <button class="btn-primary" style="margin-left:auto" onclick="executeImport(${JSON.stringify(reqs).replace(/</g,'\\u003c').replace(/'/g,"\\'")},'${sysId}')">
        ↑ Alle importieren (${reqs.length})
      </button>
      <button class="btn-secondary" onclick="$('import-preview').innerHTML=''">Abbrechen</button>
    </div>`;
}

async function executeImport(reqs, sysId) {
  const mode = $('import-mode')?.value || 'merge';
  const btn  = document.querySelector('#import-preview .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Importiere …'; }

  try {
    const res = await fetch('/api/requirements/import', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId: sysId, requirements: reqs, mode })
    });
    const data = await res.json();
    $('import-preview').innerHTML = `
      <div style="background:var(--grnbg);border:1px solid rgba(52,211,153,.3);border-radius:var(--rl);padding:16px;text-align:center">
        <div style="font-size:28px;margin-bottom:8px">✅</div>
        <div style="font-size:14px;font-weight:600">Import abgeschlossen</div>
        <div style="font-size:12px;color:var(--t2);margin-top:6px">
          ${data.added} hinzugefügt · ${data.updated} aktualisiert · ${data.skipped} übersprungen
        </div>
        <button class="btn-primary" style="margin-top:12px" onclick="switchView('business-reqs')">
          Anforderungen ansehen
        </button>
      </div>`;
    if (typeof addNotif === 'function')
      addNotif('📥', 'Import abgeschlossen', `${data.added} neue Anforderungen`, () => switchView('business-reqs'));
    if (typeof logAuditEvent === 'function')
      logAuditEvent('create', 'requirement', sysId, `Import: ${data.added} Anforderungen`, { count: data.added, mode });

    // Prefix aus importierten IDs erkennen und System-Schema aktualisieren
    if (typeof detectAndApplyPrefix === 'function') {
      await detectAndApplyPrefix(sysId);
      // Systeme neu laden damit idPrefix/idCounter aktuell sind
      S.systems = await window.api.getSystems();
    }
  } catch(e) {
    toast('❌ Import fehlgeschlagen: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = `↑ Alle importieren`; }
  }
}

// ── JIRA-Import ────────────────────────────────────────────────
function openJiraImportDialog() {
  const sysId = $('import-sys-sel').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  openModal('JIRA-Export importieren', `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px">
      JIRA-Issues aus einem Export importieren.
    </p>

    <!-- Format-Auswahl -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div id="jira-fmt-json" onclick="jiraSelectFormat('json')" style="
        background:var(--s2);border:2px solid var(--aa);border-radius:10px;
        padding:12px;cursor:pointer;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">{ }</div>
        <div style="font-size:12px;font-weight:600">JSON</div>
        <div style="font-size:10px;color:var(--t3)">Export → JSON</div>
      </div>
      <div id="jira-fmt-xml" onclick="jiraSelectFormat('xml')" style="
        background:var(--s2);border:2px solid var(--b1);border-radius:10px;
        padding:12px;cursor:pointer;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">&lt;/&gt;</div>
        <div style="font-size:12px;font-weight:600">XML</div>
        <div style="font-size:10px;color:var(--t3)">Export → XML (RSS)</div>
      </div>
    </div>

    <!-- Anleitung je Format -->
    <div id="jira-hint-json" style="font-size:11px;color:var(--t3);background:var(--s2);
      padding:8px 10px;border-radius:6px;margin-bottom:12px;line-height:1.6">
      📋 In JIRA: <strong>Issues suchen → Oben rechts „Export" → „Export Excel CSV (alle Felder)" oder „Export JSON"</strong>
    </div>
    <div id="jira-hint-xml" style="display:none;font-size:11px;color:var(--t3);background:var(--s2);
      padding:8px 10px;border-radius:6px;margin-bottom:12px;line-height:1.6">
      📋 In JIRA: <strong>Issues suchen → Oben rechts „Export" → „Export XML"</strong><br>
      Auch kompatibel mit generischen XML-Exports anderer Tools.
    </div>

    <button class="btn-primary" style="width:100%" onclick="pickJiraFile('${sysId}')">
      📂 Datei wählen …
    </button>
    <div id="jira-import-status" style="margin-top:10px"></div>
    <button class="btn-secondary" style="margin-top:10px;width:100%" onclick="closeModal()">Abbrechen</button>`);

  window._jiraImportFormat = 'json';
}

async function pickJiraFile(sysId) {
  const fmt   = window._jiraImportFormat || 'json';
  const files = await window.api.pickFiles(fmt === 'xml' ? '.xml' : '.json,.xml,.csv');
  if (!files.length) return;
  const statusEl = $('jira-import-status');
  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Lese JIRA-Export …';
  try {
    const ext  = files[0].name.split('.').pop().toLowerCase();
    const reqs = ext === 'xml' ? await parseJiraXML(files[0]) : await parseJSON(files[0]);
    if (!reqs.length) throw new Error('Keine Anforderungen im Export gefunden');
    closeModal();
    showImportPreview(reqs, sysId, files[0].name);
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

function jiraSelectFormat(fmt) {
  window._jiraImportFormat = fmt;
  const jsonCard = document.getElementById('jira-fmt-json');
  const xmlCard  = document.getElementById('jira-fmt-xml');
  const jsonHint = document.getElementById('jira-hint-json');
  const xmlHint  = document.getElementById('jira-hint-xml');
  if (jsonCard) jsonCard.style.borderColor = fmt === 'json' ? 'var(--aa)' : 'var(--b1)';
  if (xmlCard)  xmlCard.style.borderColor  = fmt === 'xml'  ? 'var(--aa)' : 'var(--b1)';
  if (jsonHint) jsonHint.style.display = fmt === 'json' ? '' : 'none';
  if (xmlHint)  xmlHint.style.display  = fmt === 'xml'  ? '' : 'none';
}

// ── Einfügen per Text ──────────────────────────────────────────
function openPasteDialog() {
  const sysId = $('import-sys-sel').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  openModal('Text einfügen', `
    <p style="font-size:13px;color:var(--t2);margin-bottom:12px">
      Requirements als Text einfügen — jede Zeile wird eine Anforderung.
      Oder kommagetrennte Spalten: <code style="font-size:11px">Titel, Beschreibung, Priorität</code>
    </p>
    <textarea id="paste-inp" rows="10" placeholder="REQ-001, Benutzer kann sich anmelden, high&#10;REQ-002, Passwort zurücksetzen, medium&#10;..."></textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" onclick="parsePasteImport('${sysId}')">✦ KI analysieren & importieren</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function parsePasteImport(sysId) {
  const text = $('paste-inp')?.value.trim();
  if (!text) return;
  const btn = document.querySelector('#modal-body .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }

  // KI strukturiert den Text
  const res = await callAPI([{ role:'user', content:
    `Extrahiere Requirements aus diesem Text und strukturiere sie. ${langNote()}
JSON ohne Backticks:
[{"title":"...","description":"...","priority":"medium","category":"Funktional","rationale":""}]

Text:
${text.substring(0, 3000)}` }], langNote(), 1500);

  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const reqs = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    closeModal();
    showImportPreview(reqs, sysId, 'Eingefügter Text');
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

window.loadImportView      = loadImportView;
window.pickImportFile      = pickImportFile;
window.executeImport       = executeImport;
window.openJiraImportDialog = openJiraImportDialog;
window.pickJiraFile        = pickJiraFile;
window.openPasteDialog     = openPasteDialog;
window.parsePasteImport    = parsePasteImport;
window.showImportPreview   = showImportPreview;
