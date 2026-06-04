'use strict';
/**
 * features/source-analysis.js
 * P1: Automatische Source-Code-Analyse beim Zuweisen einer Anforderung.
 * Analysiert hochgeladene Quellcode-Dateien und erstellt für den Entwickler:
 * - Betroffene Dateien mit Begründung
 * - Konkrete Funktionen/Klassen die geändert werden müssen
 * - Diff-Vorschlag auf Pseudocode-Ebene
 * - Indirekt betroffene Dateien (Abhängigkeiten)
 * - Geschätzte Komplexität und Risiko
 */

// ── Analyse beim Zuweisen ─────────────────────────────────────
async function analyzeSourceOnAssign(reqId, systemId) {
  const sys = S.systems.find(s => s.id === systemId);
  if (!sys?.docs?.length) return null;

  const codeDocs = filterCodeDocs(sys.docs);
  if (!codeDocs.length) return null;

  const allReqs = await window.api.getRequirements({ systemId });
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return null;

  return runSourceAnalysis(req, codeDocs, sys);
}

// ── Haupt-Analyse-Funktion ────────────────────────────────────
async function runSourceAnalysis(req, codeDocs, sys) {
  setAPIContext('source', sys?.id);
  // Code-Kontext aufbauen — priorisiere relevante Dateien via Keyword-Matching
  const ranked = rankDocsByRelevance(codeDocs, req);
  const topDocs = ranked.slice(0, 12); // Max 12 Dateien für Kontext

  const codeContext = topDocs.map(d =>
    `### ${d.name}\n\`\`\`\n${d.content.substring(0, 3500)}\n\`\`\``
  ).join('\n\n');

  const res = await callAPI([{ role:'user', content:
    `Du bist ein erfahrener Software-Architekt. Analysiere welche Code-Änderungen für diese Anforderung nötig sind.
${langNote()}

Antworte NUR mit JSON ohne Backticks:
{
  "affectedFiles": [
    {
      "file": "src/auth/login.js",
      "reason": "Hauptdatei für Login-Logik — muss erweitert werden",
      "changeType": "modify|create|delete",
      "functions": ["validateUser", "createSession"],
      "estimatedLines": 25
    }
  ],
  "indirectFiles": [
    {
      "file": "src/middleware/auth.js",
      "reason": "Muss wegen geänderter Session-Struktur angepasst werden"
    }
  ],
  "diffSuggestion": "// In src/auth/login.js, Funktion validateUser:\n- const user = db.find(u => u.email === email);\n+ const user = await db.findWithMFA(email, mfaToken);\n+ if (!user.mfaEnabled) throw new Error('MFA erforderlich');",
  "complexity": "low|medium|high|very_high",
  "riskLevel": "low|medium|high",
  "estimatedHours": 4,
  "technicalNotes": "Wichtige technische Hinweise für den Entwickler",
  "testingHints": "Welche Tests müssen angepasst/erstellt werden",
  "summary": "Kurze Zusammenfassung der notwendigen Änderungen"
}

Anforderung:
ID: ${req.id}
Titel: ${req.title}
Beschreibung: ${req.description || '(keine)'}
Kategorie: ${req.category}
Priorität: ${req.priority}
${req.rationale ? `Begründung: ${req.rationale}` : ''}

System: ${sys?.name || ''}

Quellcode:
${codeContext}` }], langNote(), 3000);

  if (!res.ok) return null;

  try {
    const analysis = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    // Analyse speichern
    await window.api.saveRequirement({
      ...req,
      sourceAnalysis:    analysis,
      sourceSuggestion:  analysis.diffSuggestion || '',
      sourceAnalyzedAt:  Date.now(),
    });
    return analysis;
  } catch(e) {
    console.error('[SourceAnalysis] Parse-Fehler:', e);
    return null;
  }
}

// ── Relevanz-Ranking ──────────────────────────────────────────
function rankDocsByRelevance(docs, req) {
  const keywords = extractKeywords(req);
  return docs.map(d => {
    let score = 0;
    const content = (d.name + ' ' + d.content).toLowerCase();
    for (const kw of keywords) {
      const matches = (content.match(new RegExp(kw, 'gi')) || []).length;
      score += matches;
    }
    return { ...d, relevanceScore: score };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function extractKeywords(req) {
  const text  = `${req.title} ${req.description || ''}`.toLowerCase();
  const words = text.split(/\W+/).filter(w => w.length > 3);
  // Stopp-Wörter entfernen
  const stop  = new Set(['dass','soll','muss','kann','wird','sollen','haben','sein','werden','eine','einen','einem','dieser','diese','dieses','system']);
  return [...new Set(words.filter(w => !stop.has(w)))].slice(0, 20);
}

function filterCodeDocs(docs) {
  const codeExts = ['.js','.ts','.jsx','.tsx','.py','.java','.cs','.go','.rs','.cpp','.c','.php','.rb','.swift','.kt','.vue','.html','.css','.scss'];
  return docs.filter(d => codeExts.some(ext => d.name.toLowerCase().endsWith(ext)));
}

// ── UI: Analyse-Block rendern ─────────────────────────────────
function renderSourceAnalysisBlock(req, compact = false) {
  const a = req.sourceAnalysis;
  if (!a) return '';

  const complexityColors = {
    low:      'var(--grn)', medium: 'var(--amb)',
    high:     'var(--red)', very_high: 'var(--red)',
  };
  const riskColors = { low:'var(--grn)', medium:'var(--amb)', high:'var(--red)' };
  const changeIcons = { modify:'✏', create:'➕', delete:'🗑' };

  if (compact) {
    return `
      <div class="source-block">
        <div class="source-block-head" onclick="this.nextElementSibling.classList.toggle('open')" style="cursor:pointer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Source-Analyse
          <span style="margin-left:auto;font-size:10px;color:${complexityColors[a.complexity]||'var(--t3)'}">
            ${complexityLabel(a.complexity)} · ~${a.estimatedHours || '?'}h
          </span>
        </div>
        <div class="source-block-body" style="display:none">
          ${renderAffectedFiles(a, true)}
        </div>
      </div>`;
  }

  return `
    <div class="source-analysis-full">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <div style="font-size:13px;font-weight:600">${esc(a.summary||'Source-Analyse')}</div>
        <div style="display:flex;gap:6px;margin-left:auto">
          <span style="font-size:10px;padding:2px 9px;border-radius:99px;background:${complexityColors[a.complexity]||'var(--s2)'}22;color:${complexityColors[a.complexity]||'var(--t3)'}">
            ${complexityLabel(a.complexity)}
          </span>
          <span style="font-size:10px;padding:2px 9px;border-radius:99px;background:${riskColors[a.riskLevel]||'var(--s2)'}22;color:${riskColors[a.riskLevel]||'var(--t3)'}">
            Risiko: ${riskLabel(a.riskLevel)}
          </span>
          ${a.estimatedHours ? `<span style="font-size:10px;padding:2px 9px;border-radius:99px;background:var(--s2);color:var(--t2)">~${a.estimatedHours}h</span>` : ''}
        </div>
      </div>

      <!-- Direkt betroffene Dateien -->
      ${(a.affectedFiles||[]).length ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
          Zu ändernde Dateien (${a.affectedFiles.length})
        </div>
        ${renderAffectedFiles(a, false)}` : ''}

      <!-- Indirekt betroffene Dateien -->
      ${(a.indirectFiles||[]).length ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">
          Indirekt betroffen (${a.indirectFiles.length})
        </div>
        ${(a.indirectFiles||[]).map(f => `
          <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px;color:var(--t3)">
            <span>↗</span>
            <code style="color:var(--ab)">${esc(f.file)}</code>
            <span style="flex:1">${esc(f.reason)}</span>
          </div>`).join('')}` : ''}

      <!-- Diff-Vorschlag -->
      ${a.diffSuggestion ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">
          Code-Änderungs-Vorschlag
        </div>
        <div class="diff-block">
          ${renderDiff(a.diffSuggestion)}
        </div>` : ''}

      <!-- Technische Hinweise -->
      ${a.technicalNotes ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px">
          Technische Hinweise
        </div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6;background:var(--s2);padding:10px 12px;border-radius:var(--r)">${esc(a.technicalNotes)}</div>` : ''}

      <!-- Test-Hinweise -->
      ${a.testingHints ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px">
          Tests
        </div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6;background:var(--s2);padding:10px 12px;border-radius:var(--r)">${esc(a.testingHints)}</div>` : ''}

      <!-- Aktionen -->
      <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
        <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
          onclick="reRunSourceAnalysis('${req.id}')">🔄 Neu analysieren</button>
        <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
          onclick="exportSourceAnalysis('${req.id}')">↓ Exportieren</button>
      </div>
    </div>`;
}

function renderAffectedFiles(a, compact) {
  const changeIcons = { modify:'✏', create:'➕', delete:'🗑' };
  return (a.affectedFiles||[]).map(f => `
    <div style="background:var(--s2);border-radius:var(--r);padding:${compact?'6px 10px':'10px 12px'};margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${compact?'0':'5px'}">
        <span style="font-size:12px">${changeIcons[f.changeType]||'✏'}</span>
        <code style="font-size:${compact?'11':'12'}px;color:var(--ab);flex:1">${esc(f.file)}</code>
        ${f.estimatedLines ? `<span style="font-size:10px;color:var(--t3)">~${f.estimatedLines} Zeilen</span>` : ''}
      </div>
      ${!compact ? `
        <div style="font-size:11px;color:var(--t2);margin-bottom:4px">${esc(f.reason)}</div>
        ${(f.functions||[]).length ? `
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${f.functions.map(fn => `<code style="font-size:10px;background:var(--s3);padding:1px 6px;border-radius:4px;color:var(--aa)">${esc(fn)}()</code>`).join('')}
          </div>` : ''}` : `<div style="font-size:10px;color:var(--t3);margin-top:3px">${esc(f.reason.substring(0,80))}</div>`}
    </div>`).join('');
}

function renderDiff(diff) {
  return diff.split('\n').map(line => {
    const cls = line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-rem' : line.startsWith('//') || line.startsWith('#') ? 'diff-comment' : '';
    return `<div class="diff-line${cls?' '+cls:''}">${esc(line)}</div>`;
  }).join('');
}

function complexityLabel(c) {
  return { low:'Niedrig', medium:'Mittel', high:'Hoch', very_high:'Sehr hoch' }[c] || c;
}
function riskLabel(r) {
  return { low:'Niedrig', medium:'Mittel', high:'Hoch' }[r] || r;
}

// ── Re-Analyse ────────────────────────────────────────────────
async function reRunSourceAnalysis(reqId) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return;
  const sys = S.systems.find(s => s.id === req.systemId);
  if (!sys?.docs?.length) { toast('⚠ Keine Dokumente im System'); return; }
  toast('🔍 Analysiere Source-Code …');
  const analysis = await runSourceAnalysis(req, filterCodeDocs(sys.docs), sys);
  if (analysis) { toast('✅ Source-Analyse aktualisiert'); if (typeof loadDevWork === 'function') loadDevWork(); }
  else toast('❌ Analyse fehlgeschlagen');
}

// ── Export ────────────────────────────────────────────────────
async function exportSourceAnalysis(reqId) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req?.sourceAnalysis) return;
  const a    = req.sourceAnalysis;
  let  md    = `# Source-Analyse: ${req.title}\n**${req.id}** · ${new Date().toLocaleDateString('de-DE')}\n\n`;
  md += `## Zusammenfassung\n${a.summary||''}\n\n`;
  md += `**Komplexität:** ${complexityLabel(a.complexity)} | **Risiko:** ${riskLabel(a.riskLevel)} | **Schätzung:** ~${a.estimatedHours||'?'}h\n\n`;
  if (a.affectedFiles?.length) {
    md += `## Zu ändernde Dateien\n`;
    for (const f of a.affectedFiles)
      md += `- **${f.file}** (${f.changeType}): ${f.reason}\n${(f.functions||[]).length?`  Funktionen: \`${f.functions.join('`, `')}\`\n`:''}`;
    md += '\n';
  }
  if (a.indirectFiles?.length) {
    md += `## Indirekt betroffen\n`;
    for (const f of a.indirectFiles) md += `- **${f.file}**: ${f.reason}\n`;
    md += '\n';
  }
  if (a.diffSuggestion) md += `## Code-Änderungs-Vorschlag\n\`\`\`diff\n${a.diffSuggestion}\n\`\`\`\n\n`;
  if (a.technicalNotes) md += `## Technische Hinweise\n${a.technicalNotes}\n\n`;
  if (a.testingHints)   md += `## Tests\n${a.testingHints}\n`;
  const blob = new Blob([md], { type:'text/markdown' });
  const a_el = document.createElement('a');
  a_el.href = URL.createObjectURL(blob); a_el.download = `source-analysis-${req.id}.md`; a_el.click();
  URL.revokeObjectURL(a_el.href);
  toast('✅ Source-Analyse exportiert');
}

// ── CSS ───────────────────────────────────────────────────────
const saStyle = document.createElement('style');
saStyle.textContent = `
  .diff-block{background:#0d1117;border-radius:var(--r);padding:12px 14px;font-family:var(--mono);font-size:11px;line-height:1.6;overflow-x:auto;margin-top:4px;border:1px solid rgba(255,255,255,.06)}
  .diff-line{white-space:pre}
  .diff-add{color:#3fb950;background:rgba(63,185,80,.08)}
  .diff-rem{color:#f85149;background:rgba(248,81,73,.08)}
  .diff-comment{color:#8b949e}
  .source-analysis-full{padding:14px 0}`;
document.head.appendChild(saStyle);

window.analyzeSourceOnAssign    = analyzeSourceOnAssign;
window.runSourceAnalysis        = runSourceAnalysis;
window.renderSourceAnalysisBlock = renderSourceAnalysisBlock;
window.reRunSourceAnalysis      = reRunSourceAnalysis;
window.exportSourceAnalysis     = exportSourceAnalysis;
window.filterCodeDocs           = filterCodeDocs;
window.rankDocsByRelevance      = rankDocsByRelevance;

// ── Source Analysis View (für PM und Developer) ───────────────
async function loadSourceAnalysisView() {
  S.systems      = await window.api.getSystems();
  S.requirements = await window.api.getRequirements({});
  const sel = $('sa-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = renderSAView;
  }
  await renderSAView();
}

async function renderSAView() {
  const sysId = $('sa-sys-sel')?.value || '';
  const reqs  = sysId ? S.requirements.filter(r=>r.systemId===sysId) : S.requirements;
  const wrap  = $('sa-req-list');
  if (!wrap) return;

  const withAnalysis = reqs.filter(r=>r.sourceAnalysis);
  const without      = reqs.filter(r=>!r.sourceAnalysis && r.status==='assigned');

  wrap.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--b1);flex-shrink:0;display:flex;gap:10px;align-items:center">
      <span style="font-size:12px;color:var(--t2)">${withAnalysis.length} analysiert · ${without.length} ausstehend</span>
      ${without.length ? `<button class="btn-primary" style="font-size:11px;padding:5px 11px;margin-left:auto"
        onclick="batchAnalyzeSources('${sysId}')">⚡ Alle analysieren (${without.length})</button>` : ''}
    </div>
    ${reqs.filter(r=>r.sourceAnalysis||r.status==='assigned').map(r => {
      const sys = S.systems.find(s=>s.id===r.systemId);
      return `<div style="border-bottom:1px solid var(--b1);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;flex-wrap:wrap">
          <span class="req-id">${esc(r.id)}</span>
          <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
          <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
          ${sys?`<span class="rtag" style="font-size:9px">${esc(sys.name)}</span>`:''}
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(r.title)}</div>
        ${r.sourceAnalysis
          ? renderSourceAnalysisBlock(r, false)
          : `<button class="btn-secondary" style="font-size:11px;padding:5px 11px"
               onclick="analyzeSourceForReq('${r.id}','${r.systemId}')">
               🔍 Source analysieren
             </button>`}
      </div>`;
    }).join('')}
    ${reqs.filter(r=>r.sourceAnalysis||r.status==='assigned').length===0
      ? '<div class="empty-state"><div class="es-icon">🔍</div><h3>Keine zugewiesenen Anforderungen</h3><p>Weisen Sie Anforderungen zu damit die Source-Analyse startet.</p></div>'
      : ''}`;
}

async function analyzeSourceForReq(reqId, systemId) {
  toast('🔍 Analysiere …');
  const result = await analyzeSourceOnAssign(reqId, systemId);
  if (result) { toast('✅ Analyse abgeschlossen'); renderSAView(); }
  else toast('❌ Keine Code-Dateien im System');
}

async function batchAnalyzeSources(sysId) {
  const toAnalyze = S.requirements.filter(r =>
    (!sysId || r.systemId===sysId) && r.status==='assigned' && !r.sourceAnalysis
  );
  let done = 0;
  for (const r of toAnalyze) {
    toast(`🔍 ${done+1}/${toAnalyze.length}: ${r.title.substring(0,40)}`);
    await analyzeSourceOnAssign(r.id, r.systemId);
    done++;
  }
  toast(`✅ ${done} Analysen abgeschlossen`);
  await loadSourceAnalysisView();
}

window.loadSourceAnalysisView = loadSourceAnalysisView;
window.renderSAView           = renderSAView;
window.analyzeSourceForReq    = analyzeSourceForReq;
window.batchAnalyzeSources    = batchAnalyzeSources;
