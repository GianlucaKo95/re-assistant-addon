'use strict';
/**
 * features/export.js
 * 🟡 FIX 8: Erweiterter Export — Word (DOCX) und PDF über Backend-Generierung.
 * Für das HA Add-on ohne Electron: HTML-zu-PDF im Browser + DOCX via Backend.
 */

function openExportModal(requirements, projectName) {
  if (!requirements?.length) { toast('⚠ Keine Anforderungen zum Exportieren'); return; }
  openModal('📤 Export', `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px">
      ${requirements.length} Anforderung(en) aus <strong>${esc(projectName)}</strong> exportieren:
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="export-fmt-btn" onclick="exportAsMarkdown(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">📝</div>
        <div style="font-size:13px;font-weight:600">Markdown</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">.md Datei</div>
      </button>
      <button class="export-fmt-btn" onclick="exportAsCSV(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">📊</div>
        <div style="font-size:13px;font-weight:600">CSV</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Für Excel / Sheets</div>
      </button>
      <button class="export-fmt-btn" onclick="exportAsHTML(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">🌐</div>
        <div style="font-size:13px;font-weight:600">HTML</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Druckbares Dokument</div>
      </button>
      <button class="export-fmt-btn" onclick="exportAsPDF(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">📄</div>
        <div style="font-size:13px;font-weight:600">PDF</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Über Druckdialog</div>
      </button>
      <button class="export-fmt-btn" onclick="exportAsJSON(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">{ }</div>
        <div style="font-size:13px;font-weight:600">JSON</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Für Import/Backup</div>
      </button>
      <button class="export-fmt-btn" onclick="exportAsDocx(window._exportData)">
        <div style="font-size:24px;margin-bottom:6px">📋</div>
        <div style="font-size:13px;font-weight:600">Word (DOCX)</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Über HTML-Download</div>
      </button>
    </div>
    <style>
      .export-fmt-btn{background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);
        padding:16px;cursor:pointer;transition:all .15s;color:var(--t1);font-family:var(--font);text-align:center}
      .export-fmt-btn:hover{background:var(--s2);border-color:rgba(168,85,247,.3)}
    </style>`);
  window._exportData = { requirements, projectName };
}

async function exportAsMarkdown({ requirements, projectName }) {
  await window.api.exportMarkdown({ requirements, stories: [], projectName });
  closeModal();
  toast('✅ Markdown exportiert');
}

async function exportAsCSV({ requirements, projectName }) {
  await window.api.exportCSV({ requirements });
  closeModal();
  toast('✅ CSV exportiert');
}

async function exportAsJSON({ requirements, projectName }) {
  await window.api.exportJSON({ requirements, projectName, exportedAt: new Date().toISOString() });
  closeModal();
  toast('✅ JSON exportiert');
}

function exportAsHTML({ requirements, projectName }) {
  const html = buildHTMLReport(requirements, projectName);
  dlText(html, `${projectName || 'export'}.html`, 'text/html');
  closeModal();
  toast('✅ HTML exportiert');
}

function exportAsPDF({ requirements, projectName }) {
  // PDF via Browser-Druckdialog mit angepasstem CSS
  const html = buildHTMLReport(requirements, projectName, true);
  const win  = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
  closeModal();
}

function exportAsDocx({ requirements, projectName }) {
  // DOCX via HTML-Datei die Word öffnen kann (MHT-ähnlich)
  const html = buildWordHTML(requirements, projectName);
  const blob = new Blob([html], { type: 'application/msword' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${projectName || 'export'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  closeModal();
  toast('✅ Word-Dokument exportiert');
}

function buildHTMLReport(reqs, projectName, forPrint = false) {
  const date = new Date().toLocaleDateString('de-DE', { year:'numeric', month:'long', day:'numeric' });
  const priColors = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' };
  const statusColors = { open:'#3b82f6', assigned:'#f59e0b', 'in-progress':'#a855f7', done:'#10b981' };
  const statusLabels = { open:'Offen', assigned:'Zugewiesen', 'in-progress':'In Bearbeitung', done:'Erledigt' };

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${projectName} — Requirements</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e1b4b; background: #fff; padding: ${forPrint ? '0' : '32px'}; max-width: ${forPrint ? '100%' : '900px'}; margin: 0 auto; }
  h1 { font-size: 24px; font-weight: 700; color: #6366f1; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: #f8f9ff; border: 1px solid #e5e7ff; border-radius: 10px; padding: 12px 16px; }
  .stat-n { font-size: 24px; font-weight: 700; color: #6366f1; }
  .stat-l { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-top: 2px; }
  .req { border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 12px; overflow: hidden; page-break-inside: avoid; }
  .req-head { background: #f8f9ff; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .req-id { font-family: monospace; font-size: 11px; color: #6b7280; }
  .req-title { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .req-body { padding: 12px 16px; }
  .req-desc { line-height: 1.6; color: #374151; }
  .req-rat { font-style: italic; color: #6b7280; margin-top: 8px; padding: 8px 12px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #e5e7eb; }
  .badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 99px; text-transform: uppercase; white-space: nowrap; }
  .qs-score { font-size: 13px; font-weight: 700; }
  @media print { body { padding: 0; } .req { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>${projectName} — Requirements</h1>
<div class="meta">Exportiert am ${date} · ${reqs.length} Anforderungen</div>
<div class="stats">
  <div class="stat"><div class="stat-n">${reqs.length}</div><div class="stat-l">Gesamt</div></div>
  <div class="stat"><div class="stat-n">${reqs.filter(r=>r.status==='open').length}</div><div class="stat-l">Offen</div></div>
  <div class="stat"><div class="stat-n">${reqs.filter(r=>r.priority==='high').length}</div><div class="stat-l">Hohe Prio</div></div>
  <div class="stat"><div class="stat-n">${reqs.filter(r=>r.qualityScore!=null).length}</div><div class="stat-l">QS bewertet</div></div>
</div>
${reqs.map(r => `
<div class="req">
  <div class="req-head">
    <div>
      <div class="req-id">${r.id}</div>
      <div class="req-title">${r.title}</div>
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0">
      <span class="badge" style="background:${(priColors[r.priority]||'#6b7280')}22;color:${priColors[r.priority]||'#6b7280'}">${priLabel(r.priority)}</span>
      <span class="badge" style="background:${(statusColors[r.status]||'#6b7280')}22;color:${statusColors[r.status]||'#6b7280'}">${statusLabels[r.status]||r.status}</span>
      ${r.qualityScore != null ? `<span class="qs-score" style="color:${r.qualityScore>=7?'#10b981':r.qualityScore>=4?'#f59e0b':'#ef4444'}">QS:${r.qualityScore}</span>` : ''}
    </div>
  </div>
  <div class="req-body">
    <div class="req-desc">${(r.description||'').replace(/\n/g,'<br>')}</div>
    ${r.rationale ? `<div class="req-rat">💡 ${r.rationale}</div>` : ''}
    ${(r.tags||[]).length ? `<div style="margin-top:8px">${r.tags.map(t => `<span style="font-size:10px;padding:2px 8px;background:#f3f4f6;border-radius:99px;margin-right:4px">${t}</span>`).join('')}</div>` : ''}
  </div>
</div>`).join('')}
</body></html>`;
}

function buildWordHTML(reqs, projectName) {
  // Word-kompatibles HTML
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head><meta charset="UTF-8"><title>${projectName}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt} h1{font-size:18pt;color:#6366f1} h2{font-size:13pt} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:6pt 8pt;font-size:10pt} th{background:#f0f1ff;font-weight:bold}</style>
</head><body>
<h1>${projectName} — Anforderungen</h1>
<p>Exportiert: ${new Date().toLocaleDateString('de-DE')}</p>
<table>
<tr><th>ID</th><th>Titel</th><th>Beschreibung</th><th>Priorität</th><th>Status</th><th>QS</th></tr>
${reqs.map(r => `<tr><td>${r.id}</td><td><b>${r.title}</b></td><td>${(r.description||'').substring(0,200)}</td><td>${priLabel(r.priority)}</td><td>${statusLabel(r.status)}</td><td>${r.qualityScore||'—'}</td></tr>`).join('')}
</table></body></html>`;
}

function dlText(content, filename, type) {
  const blob = new Blob([content], { type });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.openExportModal  = openExportModal;
window.exportAsMarkdown = exportAsMarkdown;
window.exportAsCSV      = exportAsCSV;
window.exportAsJSON     = exportAsJSON;
window.exportAsHTML     = exportAsHTML;
window.exportAsPDF      = exportAsPDF;
window.exportAsDocx     = exportAsDocx;
