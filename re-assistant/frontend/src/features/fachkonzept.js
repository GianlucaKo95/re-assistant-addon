'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/fachkonzept.js
 * Fachkonzept-Generator — aus einer tief beschriebenen Anforderung erstellt
 * die KI ein vollständiges Fachkonzept, das direkt als Word-Datei (.docx)
 * heruntergeladen werden kann. Ergänzt die Word-Analyse (liest .docx) um
 * die umgekehrte Richtung (erzeugt .docx).
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

let _fkReqs = [];
let _fkData = null; // zuletzt generiertes Fachkonzept (strukturiert)
let _fkMeta = null; // { reqId, reqTitle, systemName }

async function loadFachkonzept() {
  S.systems = S.systems?.length ? S.systems : await window.api.getSystems();
  const sysSel = $('fk-sys-select');
  if (sysSel) {
    sysSel.innerHTML = '<option value="">Kein System (eigenständig) …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sysSel.onchange = loadFkRequirements;
  }
  const reqSel = $('fk-req-select');
  if (reqSel) reqSel.onchange = fillFromRequirement;
  $('btn-fk-generate').onclick = generateFachkonzept;
  $('btn-fk-download').onclick = downloadFachkonzeptDocx;
  $('btn-fk-download').style.display = 'none';
  await loadFkRequirements();
}

async function loadFkRequirements() {
  const sysId = $('fk-sys-select')?.value || '';
  const reqSel = $('fk-req-select');
  if (!reqSel) return;
  if (!sysId) {
    _fkReqs = [];
    reqSel.innerHTML = '<option value="">— frei beschreiben —</option>';
    reqSel.disabled = true;
    return;
  }
  reqSel.disabled = false;
  reqSel.innerHTML = '<option value="">— lädt …</option>';
  _fkReqs = await window.api.getRequirements({ systemId: sysId });
  reqSel.innerHTML = '<option value="">— frei beschreiben —</option>' +
    _fkReqs.map(r => `<option value="${r.id}">${esc(r.id)} — ${esc(r.title)}</option>`).join('');
}

function fillFromRequirement() {
  const reqId = $('fk-req-select')?.value || '';
  if (!reqId) return;
  const req = _fkReqs.find(r => r.id === reqId);
  if (!req) return;
  const parts = [req.title, req.description, req.rationale ? `Begründung: ${req.rationale}` : '',
    req.acceptance_criteria_text ? `Akzeptanzkriterien: ${req.acceptance_criteria_text}` : ''].filter(Boolean);
  $('fk-desc-input').value = parts.join('\n\n');
}

// ── System-Kontext (Stakeholder/Use Cases/Qualitätsziele/RAG) ─────────────
async function gatherSystemContext(sysId) {
  if (!sysId) return { shCtx: '', ucCtx: '', qgCtx: '', ragCtx: '', sys: null };
  try {
    const [shs, ucs, qgs, cache] = await Promise.all([
      fetch(`api/systems/${sysId}/stakeholders`,  { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch(`api/systems/${sysId}/use-cases`,     { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch(`api/systems/${sysId}/quality-goals`, { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch(`api/embeddings/summary?systemId=${sysId}`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]);
    const shCtx  = shs.length ? 'Stakeholder: ' + shs.map(s => `${s.name} (${s.role})`).join(', ') : '';
    const ucCtx  = ucs.length ? 'Bekannte Use Cases: ' + ucs.map(u => u.title).join(', ') : '';
    const qgCtx  = qgs.length ? 'Qualitätsziele: ' + qgs.map(g => `${g.iso_char}: ${g.description}`).join(' | ') : '';
    const ragCtx = cache?.summary ? 'SYSTEMÜBERBLICK (KI-analysiert):\n' + cache.summary.substring(0, 5000) : '';
    const sys = S.systems.find(s => s.id === sysId) || null;
    return { shCtx, ucCtx, qgCtx, ragCtx, sys };
  } catch(e) { return { shCtx: '', ucCtx: '', qgCtx: '', ragCtx: '', sys: null }; }
}

// ── Generierung ─────────────────────────────────────────────────────────
async function generateFachkonzept() {
  const desc = $('fk-desc-input')?.value.trim();
  if (!desc) { toast('⚠ Bitte die Anforderung beschreiben'); return; }

  const sysId    = $('fk-sys-select')?.value || '';
  const reqId    = $('fk-req-select')?.value || '';
  const reqTitle = _fkReqs.find(r => r.id === reqId)?.title || '';

  const btn = $('btn-fk-generate');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Erstelle Fachkonzept …';
  $('fk-preview').innerHTML = '<div class="empty-state"><div class="spin"></div><p>KI erstellt das Fachkonzept …</p></div>';
  $('btn-fk-download').style.display = 'none';

  const { shCtx, ucCtx, qgCtx, ragCtx, sys } = await gatherSystemContext(sysId);
  const boundToSystem = !!(sysId && (shCtx || ucCtx || qgCtx || ragCtx));

  const schema = '{"title":"Kurztitel der Anforderung","ausgangslage":"Warum wird das benötigt? Ist-Situation, mehrere Sätze","zielsetzung":"Was soll erreicht werden — konkret und messbar","fachlicheBeschreibung":"Ausführliche fachliche Beschreibung der Funktionalität, mehrere Absätze getrennt durch \\n\\n","prozessablauf":["Schritt 1 ...","Schritt 2 ..."],"geschaeftsregeln":["Regel 1 ...","Regel 2 ..."],"akzeptanzkriterien":["Gegeben ... Wenn ... Dann ...","..."],"imScope":["..."],"ausserScope":["..."],"stakeholder":["Name/Rolle: Interesse bzw. Betroffenheit"],"risiken":[{"text":"...","mitigation":"..."}],"annahmen":["..."],"glossar":[{"begriff":"...","definition":"..."}]}';

  const prompt = [
    'Du bist CPRE-zertifizierter Requirements Engineer und erstellst aus einer Anforderungsbeschreibung ein vollständiges Fachkonzept (fachliches Feinkonzept), geeignet als eigenständiges Word-Dokument für Fachbereich, Entwicklung und QA.',
    boundToSystem
      ? 'Die Anforderung gehört zu einem bekannten System — beziehe den folgenden Systemkontext aktiv mit ein (Stakeholder-Zuordnung, Abgleich mit bekannten Use Cases/Qualitätszielen).'
      : 'Es liegt kein zusätzlicher Systemkontext vor — arbeite ausschließlich mit der unten stehenden Beschreibung.',
    boundToSystem ? shCtx : '', boundToSystem ? ucCtx : '', boundToSystem ? qgCtx : '', boundToSystem ? ragCtx : '',
    '',
    sys ? `SYSTEM: ${sys.name}` : '',
    reqTitle ? `ANFORDERUNGSTITEL: ${reqTitle}` : '',
    '',
    'DETAILBESCHREIBUNG DER ANFORDERUNG (vom Fachbereich):',
    desc.substring(0, 8000),
    '',
    'Erstelle daraus ein vollständiges, in sich konsistentes Fachkonzept mit:',
    '- Ausgangslage/Motivation und messbarer Zielsetzung',
    '- Ausführlicher fachlicher Beschreibung (mehrere Absätze, konkret und für Fachbereich UND Entwicklung verständlich)',
    '- Nummeriertem Prozessablauf',
    '- Geschäftsregeln',
    '- Testbaren Akzeptanzkriterien (Gegeben/Wenn/Dann)',
    '- Abgrenzung: was ist im Scope, was explizit nicht',
    '- Betroffenen Stakeholdern',
    '- Risiken mit Gegenmaßnahmen sowie offenen Annahmen',
    '- Glossar bei fachspezifischen Begriffen (leeres Array wenn nicht nötig)',
    '',
    'Erfinde keine Fakten, die der Beschreibung oder dem Kontext widersprechen — wo Informationen fehlen, kennzeichne dies statt zu spekulieren.',
    '',
    'Antworte NUR mit JSON (keine Backticks):',
    schema,
  ].filter(Boolean).join('\n');

  const res = await callAPI([{ role: 'user', content: prompt }],
    'Du bist CPRE-zertifizierter Requirements Engineer, spezialisiert auf Fachkonzepte. ' + langNote(), 4500, 'fachkonzept');

  btn.disabled = false; btn.innerHTML = '📝 Fachkonzept generieren';

  if (!res.ok) { toast('❌ ' + res.text); $('fk-preview').innerHTML = ''; return; }
  try {
    const data = JSON.parse((() => {
      let _r = res.text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const _fo = _r.indexOf('{'), _lo = _r.lastIndexOf('}');
      if (_fo !== -1 && _lo > _fo) _r = _r.substring(_fo, _lo + 1);
      return _r.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    })());
    _fkData = data;
    _fkMeta = { reqId, reqTitle: reqTitle || data.title || '', systemName: sys?.name || '' };
    renderFachkonzeptPreview(data);
    $('btn-fk-download').style.display = '';
    toast('✅ Fachkonzept erstellt');
    if (typeof logAuditEvent === 'function')
      logAuditEvent('create', 'fachkonzept', sysId || null, `Fachkonzept generiert: ${data.title || reqTitle || '(ohne Titel)'}`, {});
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

// ── Vorschau ────────────────────────────────────────────────────────────
function fkSection(title, bodyHTML) {
  return `<div class="fk-sec"><h3 class="fk-sec-title">${esc(title)}</h3>${bodyHTML}</div>`;
}
function fkList(items) {
  return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function renderFachkonzeptPreview(a) {
  const wr = $('fk-preview');
  wr.innerHTML = '';
  const sections = [];

  if (a.title) sections.push(`<div style="font-size:15px;font-weight:700">${esc(a.title)}</div>`);
  if (a.ausgangslage) sections.push(fkSection('Ausgangslage', `<p>${esc(a.ausgangslage)}</p>`));
  if (a.zielsetzung) sections.push(fkSection('Zielsetzung', `<p>${esc(a.zielsetzung)}</p>`));
  if (a.fachlicheBeschreibung) sections.push(fkSection('Fachliche Beschreibung', `<p>${esc(a.fachlicheBeschreibung)}</p>`));
  if (a.prozessablauf?.length) sections.push(fkSection('Prozessablauf', fkList(a.prozessablauf)));
  if (a.geschaeftsregeln?.length) sections.push(fkSection('Geschäftsregeln', fkList(a.geschaeftsregeln)));
  if (a.akzeptanzkriterien?.length) sections.push(fkSection('Akzeptanzkriterien', fkList(a.akzeptanzkriterien)));
  if (a.imScope?.length || a.ausserScope?.length) {
    let body = '';
    if (a.imScope?.length) body += `<div style="font-size:11px;font-weight:600;color:var(--grn);margin-bottom:2px">Im Scope</div>${fkList(a.imScope)}`;
    if (a.ausserScope?.length) body += `<div style="font-size:11px;font-weight:600;color:var(--red);margin:8px 0 2px">Außerhalb des Scopes</div>${fkList(a.ausserScope)}`;
    sections.push(fkSection('Abgrenzung', body));
  }
  if (a.stakeholder?.length) sections.push(fkSection('Betroffene Stakeholder', fkList(a.stakeholder)));
  if (a.risiken?.length) sections.push(fkSection('Risiken', fkList(a.risiken.map(r => `${r.text}${r.mitigation ? ` — Gegenmaßnahme: ${r.mitigation}` : ''}`))));
  if (a.annahmen?.length) sections.push(fkSection('Annahmen', fkList(a.annahmen)));
  if (a.glossar?.length) sections.push(fkSection('Glossar', fkList(a.glossar.map(g => `${g.begriff}: ${g.definition}`))));

  wr.innerHTML = sections.join('');
}

// ── Word-Datei (.docx) erzeugen ────────────────────────────────────────
function docxParagraphs(text) {
  return String(text || '').split(/\n{2,}/).map(p => new Paragraph({ children: [new TextRun(p.trim())], spacing: { after: 160 } }));
}
function docxBullets(items) {
  return (items || []).map(i => new Paragraph({ text: String(i), bullet: { level: 0 }, spacing: { after: 80 } }));
}
function docxHeading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 } });
}

function buildFachkonzeptDocx(a, meta) {
  const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const metaRow = (label, value) => new TableRow({ children: [
    new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
    new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders, children: [new Paragraph(String(value || '—'))] }),
  ]});

  const children = [
    new Paragraph({ text: 'Fachkonzept', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: a.title || meta.reqTitle || 'Ohne Titel', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 280 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      metaRow('Anforderung', meta.reqTitle),
      metaRow('System', meta.systemName),
      metaRow('Erstellt am', new Date().toLocaleDateString('de-DE')),
      metaRow('Erstellt mit', 'RE-Assistent (KI-gestützt)'),
    ]}),
  ];

  const addTextSection = (title, text) => { if (text) { children.push(docxHeading(title)); children.push(...docxParagraphs(text)); } };
  const addListSection = (title, items) => { if (items?.length) { children.push(docxHeading(title)); children.push(...docxBullets(items)); } };

  addTextSection('Ausgangslage', a.ausgangslage);
  addTextSection('Zielsetzung', a.zielsetzung);
  addTextSection('Fachliche Beschreibung', a.fachlicheBeschreibung);
  addListSection('Prozessablauf', a.prozessablauf);
  addListSection('Geschäftsregeln', a.geschaeftsregeln);
  addListSection('Akzeptanzkriterien', a.akzeptanzkriterien);

  if (a.imScope?.length || a.ausserScope?.length) {
    children.push(docxHeading('Abgrenzung'));
    if (a.imScope?.length) { children.push(new Paragraph({ children: [new TextRun({ text: 'Im Scope', bold: true })] })); children.push(...docxBullets(a.imScope)); }
    if (a.ausserScope?.length) { children.push(new Paragraph({ children: [new TextRun({ text: 'Außerhalb des Scopes', bold: true })], spacing: { before: 120 } })); children.push(...docxBullets(a.ausserScope)); }
  }

  addListSection('Betroffene Stakeholder', a.stakeholder);
  addListSection('Risiken', (a.risiken || []).map(r => `${r.text}${r.mitigation ? ` — Gegenmaßnahme: ${r.mitigation}` : ''}`));
  addListSection('Annahmen', a.annahmen);

  if (a.glossar?.length) {
    children.push(docxHeading('Glossar'));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: a.glossar.map(g => new TableRow({ children: [
      new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders, children: [new Paragraph({ children: [new TextRun({ text: g.begriff || '', bold: true })] })] }),
      new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders, children: [new Paragraph(g.definition || '')] }),
    ]}))}));
  }

  return new Document({ sections: [{ children }] });
}

async function downloadFachkonzeptDocx() {
  if (!_fkData) return;
  const btn = $('btn-fk-download');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Erzeuge Datei …';
  try {
    const doc  = buildFachkonzeptDocx(_fkData, _fkMeta || {});
    const blob = await Packer.toBlob(doc);
    const safeTitle = (_fkData.title || _fkMeta?.reqTitle || 'Fachkonzept').replace(/[\\/:*?"<>|]/g, '').trim().substring(0, 80) || 'Fachkonzept';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Fachkonzept - ${safeTitle}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ Word-Datei erstellt');
  } catch(e) {
    toast('❌ Fehler beim Erzeugen der Datei: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '⬇ Als Word-Datei herunterladen (.docx)';
  }
}

window.loadFachkonzept = loadFachkonzept;
window.generateFachkonzept = generateFachkonzept;
window.downloadFachkonzeptDocx = downloadFachkonzeptDocx;
