'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * developer/work.js
 * Developer Work — Aufgaben, Source-Analyse mit RAG, Implementierungsplan, Kommentare.
 */

/* ── Laden ───────────────────────────────────────────────────── */
async function loadDevWork() {
  S.requirements = await window.api.getRequirements({ userId: S.user.id, role: 'developer' });
  $('dev-sub').textContent = `Bereiche: ${(S.user.subcategories||[]).join(', ') || 'Alle'}`;
  const subs = [...new Set(S.requirements.map(r => r.subcategory).filter(Boolean))];
  $('dev-filter-sub').innerHTML = '<option value="">Alle</option>'
    + subs.map(s => `<option value="${s}">${esc(s)}</option>`).join('');
  const render = () => {
    const stF = $('dev-filter-status').value, subF = $('dev-filter-sub').value;
    renderDevReqs(S.requirements.filter(r =>
      (!stF || r.status === stF) && (!subF || r.subcategory === subF)
    ));
  };
  $('dev-filter-status').oninput = render;
  $('dev-filter-sub').oninput = render;
  render();
}

/* ── Karten rendern ──────────────────────────────────────────── */
function renderDevReqs(reqs) {
  const w = $('dev-req-list');
  if (!reqs.length) {
    w.innerHTML = '<div class="empty-state"><h3>Keine Aufgaben</h3><p>Noch keine Anforderungen zugewiesen.</p></div>';
    return;
  }
  w.innerHTML = reqs.map(r => `
    <div class="dev-req-card ${r.priority}">
      <div class="dev-req-expand" onclick="toggleDevReq('${r.id}')">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
              <span class="req-id">${esc(r.id)}</span>
              <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
              <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
              ${r.subcategory ? `<span class="rtag">${esc(r.subcategory)}</span>` : ''}
              ${r.sourceAnalysis ? '<span class="sbadge" style="background:var(--bluebg);color:var(--blue)">🔍 Analysiert</span>' : ''}
              ${r.quality_score != null ? `<span class="sbadge" style="background:var(--s3);color:var(--t2)">⭐ ${r.quality_score}/100</span>` : ''}
            </div>
            <div class="req-title">${esc(r.title)}</div>
            <div class="req-desc" style="font-size:12px">${esc((r.description||'').substring(0,140))}${(r.description||'').length>140?'…':''}</div>
            ${r.acceptance_criteria_text ? `<div style="font-size:11px;color:var(--grn);margin-top:4px">
              ✅ ${r.acceptance_criteria_text.split('\n').length} Akzeptanzkriterien</div>` : ''}
          </div>
          <select onchange="updateDevStatus('${r.id}',this.value)"
            style="font-size:11px;padding:4px 7px" onclick="event.stopPropagation()">
            <option value="assigned"${r.status==='assigned'?' selected':''}>Zugewiesen</option>
            <option value="in-progress"${r.status==='in-progress'?' selected':''}>In Bearbeitung</option>
            <option value="done"${r.status==='done'?' selected':''}>Erledigt</option>
          </select>
        </div>
      </div>

      <div class="dev-req-detail" id="drd-${r.id}">
        <!-- Vollbeschreibung -->
        <div class="req-desc" style="padding:10px 0">${esc(r.description || '')}</div>
        ${r.rationale ? `<div class="req-rat">💡 ${esc(r.rationale)}</div>` : ''}

        <!-- Akzeptanzkriterien -->
        ${r.acceptance_criteria_text ? `
        <div style="background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.2);
          border-radius:var(--r);padding:10px 12px;margin:8px 0">
          <div style="font-size:10px;font-weight:600;color:var(--grn);margin-bottom:6px">✅ Akzeptanzkriterien</div>
          ${r.acceptance_criteria_text.split('\n').filter(Boolean).map(c =>
            `<div style="font-size:11px;padding:2px 0;color:var(--t2)">• ${esc(c)}</div>`
          ).join('')}
        </div>` : ''}

        <!-- Verifikation + ISO -->
        ${(r.verification_method || r.iso_category) ? `
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          ${r.verification_method ? `<span style="font-size:10px;background:var(--s3);padding:2px 8px;border-radius:99px">🔬 ${esc(r.verification_method)}</span>` : ''}
          ${r.iso_category ? `<span style="font-size:10px;background:var(--s3);padding:2px 8px;border-radius:99px">📋 ${esc(r.iso_category)}</span>` : ''}
          ${r.risk_level ? `<span style="font-size:10px;background:var(--s3);padding:2px 8px;border-radius:99px;color:${r.risk_level==='hoch'?'var(--red)':r.risk_level==='mittel'?'var(--amb)':'var(--grn)'}">⚠ Risiko: ${esc(r.risk_level)}</span>` : ''}
        </div>` : ''}

        <!-- Source-Analyse -->
        ${renderSourceBlock(r)}

        <!-- Kommentare -->
        ${renderCommentThread(r)}

        <!-- Aktionen -->
        <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-primary" style="font-size:11px;padding:5px 11px"
            onclick="devAnalyzeSource('${r.id}')">
            🔍 ${r.sourceAnalysis ? 'Neu analysieren' : 'Implementierung planen'}
          </button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
            onclick="toggleCommentInput('${r.id}')">💬 Kommentar</button>
          ${r.sourceAnalysis ? `
          <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
            onclick="devAskFollowUp('${r.id}')">❓ Frage stellen</button>` : ''}
        </div>

        <!-- Kommentar-Eingabe -->
        <div id="ci-wrap-${r.id}" style="display:none;margin-top:8px">
          <div style="display:flex;gap:7px">
            <input type="text" id="ci-${r.id}" placeholder="Kommentar …" style="flex:1;font-size:12px"/>
            <button class="btn-primary" style="font-size:11px;padding:6px 12px"
              onclick="submitComment('${r.id}')">Senden</button>
          </div>
        </div>

        <!-- Follow-Up Chat -->
        <div id="fu-wrap-${r.id}" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Frage zur Implementierung:</div>
          <div style="display:flex;gap:7px">
            <input type="text" id="fu-${r.id}" placeholder="z.B. Wie genau implementiere ich Schritt 2?" style="flex:1;font-size:12px"/>
            <button class="btn-primary" style="font-size:11px;padding:6px 12px"
              onclick="devFollowUp('${r.id}')">Fragen</button>
          </div>
          <div id="fu-answer-${r.id}" style="margin-top:8px"></div>
        </div>
      </div>
    </div>`).join('');
}

function toggleDevReq(id) { $(`drd-${id}`)?.classList.toggle('open'); }

async function updateDevStatus(reqId, status) {
  const req = S.requirements.find(r => r.id === reqId);
  if (!req) return;
  await window.api.saveRequirement({ ...req, status });
  toast(`✅ Status: ${statusLabel(status)}`);
  await loadDevWork();
}

/* ── Source-Block rendern ────────────────────────────────────── */
function renderSourceBlock(r) {
  if (!r.sourceAnalysis) return '';
  if (typeof renderSourceAnalysisBlock === 'function') return renderSourceAnalysisBlock(r, true);

  const impl = r.sourceAnalysis;
  const filesHtml = (impl.affectedFiles || impl.affected_files || []).map(f => `
    <div style="background:var(--s3);border-radius:4px;padding:6px 10px;margin-bottom:4px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--ab)">${esc(f.file || f.path || '')}</div>
      <div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(f.action || f.reason || '')}</div>
      ${f.function ? `<div style="font-size:10px;color:var(--t3);margin-top:1px">Funktion: ${esc(f.function)}</div>` : ''}
    </div>`).join('');

  const stepsHtml = (impl.steps || []).map((s, i) => `
    <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1)">
      <div style="font-size:12px;font-weight:700;color:var(--aa);min-width:20px">${i + 1}.</div>
      <div>
        <div style="font-size:12px;font-weight:600">${esc(s.title || s)}</div>
        ${s.detail ? `<div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(s.detail)}</div>` : ''}
        ${s.file ? `<div style="font-family:var(--mono);font-size:10px;color:var(--ab);margin-top:2px">${esc(s.file)}</div>` : ''}
        ${s.code ? `<pre style="margin:4px 0;font-size:10px;overflow-x:auto;background:var(--s3);padding:6px;border-radius:4px">${esc(s.code)}</pre>` : ''}
      </div>
    </div>`).join('');

  return `
    <div class="source-block" style="margin:8px 0">
      <div class="source-block-head">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        ${esc(impl.summary || 'Implementierungsplan')}
      </div>
      <div class="source-block-body">
        ${filesHtml ? `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:6px">BETROFFENE DATEIEN</div>${filesHtml}</div>` : ''}
        ${stepsHtml ? `<div><div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:6px">IMPLEMENTIERUNGSSCHRITTE</div>${stepsHtml}</div>` : ''}
        ${impl.tests ? `<div style="margin-top:10px;background:rgba(63,185,80,.08);border-radius:4px;padding:8px 10px">
          <div style="font-size:10px;font-weight:600;color:var(--grn);margin-bottom:4px">TESTS</div>
          <div style="font-size:11px;white-space:pre-wrap">${esc(impl.tests)}</div>
        </div>` : ''}
        ${impl.risks ? `<div style="margin-top:8px;background:rgba(248,81,73,.08);border-radius:4px;padding:8px 10px">
          <div style="font-size:10px;font-weight:600;color:var(--red);margin-bottom:4px">RISIKEN / ABHÄNGIGKEITEN</div>
          <div style="font-size:11px;white-space:pre-wrap">${esc(impl.risks)}</div>
        </div>` : ''}
      </div>
    </div>`;
}

/* ── Implementierungsanalyse mit RAG ─────────────────────────── */
async function devAnalyzeSource(reqId) {
  const req = S.requirements.find(r => r.id === reqId);
  if (!req) return;

  const card = document.getElementById(`drd-${reqId}`);
  const btn = card?.querySelector('button[onclick*="devAnalyzeSource"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Analysiere…'; }

  try {
    // 1. RAG-Kontext für diese spezifische Anforderung laden
    const ragCtx = typeof buildRAGContext === 'function'
      ? await buildRAGContext(req.systemId, req.title + ' ' + (req.description || ''))
      : '';

    // 2. Stakeholder + Use Cases als Kontext
    let shCtx = '', ucCtx = '';
    try {
      const [shs, ucs] = await Promise.all([
        fetch(`api/systems/${req.systemId}/stakeholders`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
        fetch(`api/systems/${req.systemId}/use-cases`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      ]);
      if (shs.length) shCtx = 'Stakeholder: ' + shs.map(s => s.name + ' (' + s.role + ')').join(', ');
      const relUC = ucs.filter(u => u.req_ids?.includes(reqId) || u.title.toLowerCase().includes(req.title.toLowerCase().substring(0,20)));
      if (relUC.length) ucCtx = 'Verwandte Use Cases:\n' + relUC.map(u => `- ${u.title}: ${u.main_flow}`).join('\n');
    } catch(e) {}

    // 3. Verwandte Anforderungen für Kontextverständnis
    const related = (S.requirements || [])
      .filter(r => r.systemId === req.systemId && r.id !== reqId)
      .slice(0, 15)
      .map(r => `- ${r.id}: ${r.title} [${r.status}]`)
      .join('\n');

    // 4. Prompt aufbauen
    const systemPrompt = [
      'Du bist ein erfahrener Software-Architekt und Senior-Entwickler mit 15 Jahren Erfahrung.',
      'Analysiere die folgende Anforderung TIEFGRÜNDIG anhand des bereitgestellten Quellcodes.',
      'WICHTIG: Referenziere immer exakte Dateinamen, Funktionsnamen und Zeilenbereiche aus dem Code.',
      'Zeige konkreten Code (Diffs oder vollständige Funktionen) — keine abstrakten Beschreibungen.',
      'Identifiziere ALLE betroffenen Dateien inkl. Abhängigkeitsketten.',
      'Antworte NUR mit einem JSON-Objekt (keine Backticks, keine Erklärungen außerhalb des JSON).',
    ].join(' ');

    const schema = JSON.stringify({
      summary: 'Kurze Zusammenfassung was zu implementieren ist',
      affected_files: [
        {
          file: 'relative/pfad/zur/datei.js',
          action: 'erstellen|ändern|erweitern|löschen',
          function: 'Funktion/Methode die geändert wird',
          reason: 'Warum diese Datei betroffen ist',
        }
      ],
      steps: [
        {
          title: 'Schritt-Titel',
          detail: 'Detaillierte Beschreibung was genau zu tun ist',
          file: 'relative/pfad/zur/datei.js',
          code: '// Konkreter Code-Ausschnitt oder Diff',
        }
      ],
      tests: 'Wie die Implementierung getestet werden soll (Unit-Tests, Integration-Tests, manuelle Tests)',
      risks: 'Bekannte Risiken, Abhängigkeiten, Breaking Changes',
      estimated_effort: 'XS|S|M|L|XL',
      notes: 'Zusätzliche Hinweise für den Entwickler',
    });

    const userPrompt = [
      '## ANFORDERUNG',
      `ID: ${req.id}`,
      `Titel: ${req.title}`,
      `Beschreibung: ${req.description || '(keine)'}`,
      `Kategorie: ${req.category || ''} | Priorität: ${req.priority || ''}`,
      req.rationale ? `Begründung: ${req.rationale}` : '',
      req.acceptance_criteria_text ? `\nAkzeptanzkriterien:\n${req.acceptance_criteria_text}` : '',
      req.verification_method ? `Verifikation: ${req.verification_method}` : '',
      req.iso_category ? `ISO-Kategorie: ${req.iso_category}` : '',
      '',
      shCtx,
      ucCtx,
      related ? `## ANDERE ANFORDERUNGEN (Kontext)\n${related}` : '',
      '',
      ragCtx ? `## RELEVANTE DOKUMENTATION / CODE\n${ragCtx}` : '',
      '',
      `## AUFGABE`,
      'Erstelle einen konkreten Implementierungsplan mit:',
      '1. Welche Dateien müssen erstellt/geändert werden (mit exakten Pfaden aus der Dokumentation)',
      '2. In welchen Funktionen/Klassen müssen Änderungen erfolgen',
      '3. Schritt-für-Schritt Implementierungsanleitung mit konkretem Code',
      '4. Wie die Akzeptanzkriterien verifiziert werden',
      '5. Bekannte Risiken und Abhängigkeiten',
      '',
      `Antworte NUR mit JSON:\n${schema}`,
    ].filter(Boolean).join('\n');

    const res = await callAPI(
      [{ role: 'user', content: userPrompt }],
      systemPrompt,
      6000
    );

    if (!res.ok) { toast('❌ Analyse fehlgeschlagen: ' + res.text); return; }

    let analysis;
    try {
      analysis = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    } catch(e) {
      toast('❌ Parsing-Fehler — KI-Antwort war kein valides JSON');
      console.error('Parse error:', res.text.substring(0, 500));
      return;
    }

    // Speichern
    await window.api.saveRequirement({
      ...req,
      status: req.status === 'assigned' ? 'in-progress' : req.status,
      sourceAnalysis: analysis,
      sourceSuggestion: (analysis.steps || []).map(s => s.code || '').filter(Boolean).join('\n\n'),
    });

    S.requirements = await window.api.getRequirements({ userId: S.user.id, role: 'developer' });
    renderDevReqs(S.requirements);

    // Detail öffnen
    const detail = $(`drd-${reqId}`);
    if (detail && !detail.classList.contains('open')) detail.classList.add('open');

    toast('✅ Implementierungsplan erstellt');
    await writeAuditLogFE('implementation_planned', reqId, req.title);

  } catch(e) {
    toast('❌ Fehler: ' + e.message);
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Neu analysieren'; }
  }
}

/* ── Follow-Up Fragen ────────────────────────────────────────── */
function devAskFollowUp(reqId) {
  const wrap = $(`fu-wrap-${reqId}`);
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

async function devFollowUp(reqId) {
  const req = S.requirements.find(r => r.id === reqId);
  if (!req) return;
  const input = $(`fu-${reqId}`);
  const question = input?.value.trim();
  if (!question) return;

  const answerEl = $(`fu-answer-${reqId}`);
  if (answerEl) answerEl.innerHTML = '<div class="spin" style="margin:8px 0"></div>';

  const impl = req.sourceAnalysis;
  const context = impl ? [
    'Implementierungsplan:',
    'Betroffene Dateien: ' + (impl.affected_files || []).map(f => f.file).join(', '),
    'Schritte: ' + (impl.steps || []).map((s,i) => `${i+1}. ${s.title}`).join(', '),
  ].join('\n') : '';

  const ragCtx = typeof buildRAGContext === 'function'
    ? await buildRAGContext(req.systemId, question + ' ' + req.title)
    : '';

  const res = await callAPI([{ role: 'user', content:
    `Anforderung: ${req.title}\n${context}\n\n`
    + (ragCtx ? `Relevante Dokumentation:\n${ragCtx}\n\n` : '')
    + `Entwickler-Frage: ${question}`
  }],
    'Du bist Senior-Entwickler. Beantworte die Frage konkret und vollständig mit Code-Beispielen, Dateinamen und Implementierungsdetails.',
    4000);

  if (answerEl) {
    answerEl.innerHTML = res.ok
      ? `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
          padding:10px 12px;font-size:12px;white-space:pre-wrap">${esc(res.text)}</div>`
      : `<div style="color:var(--red);font-size:12px">❌ ${esc(res.text)}</div>`;
  }
  if (input) input.value = '';
}

/* ── Kommentare ──────────────────────────────────────────────── */
function renderCommentThread(r) {
  if (!(r.comments || []).length) return '';
  return `<div class="comment-thread">${(r.comments || []).map(c => `
    <div class="comment">
      <div class="comment-avatar">${((c.authorName||c.userName||'?').substring(0,2)).toUpperCase()}</div>
      <div class="comment-body">
        <span class="comment-author">${esc(c.authorName || c.userName || '')}</span>
        <span class="comment-time"> · ${new Date(c.createdAt||c.created_at).toLocaleString('de-DE',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</span>
        <div class="comment-text">${esc(c.text || c.content || '')}</div>
      </div>
    </div>`).join('')}</div>`;
}

function toggleCommentInput(reqId) {
  const d = $(`ci-wrap-${reqId}`);
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

async function submitComment(reqId) {
  const inp = $(`ci-${reqId}`);
  const text = inp.value.trim();
  if (!text) return;
  await window.api.addComment({ reqId, comment: { text, authorId: S.user.id, authorName: S.user.name } });
  inp.value = '';
  S.requirements = await window.api.getRequirements({ userId: S.user.id, role: 'developer' });
  renderDevReqs(S.requirements);
  toast('✅ Kommentar gespeichert');
}

/* ── Audit-Log Helper ────────────────────────────────────────── */
async function writeAuditLogFE(action, entityId, entityName) {
  try {
    await fetch('api/audit-log', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, entityType: 'requirement', entityId, entityName }),
    });
  } catch(e) {}
}

// Exports
window.loadDevWork          = loadDevWork;
window.renderDevReqs        = renderDevReqs;
window.toggleDevReq         = toggleDevReq;
window.updateDevStatus      = updateDevStatus;
window.renderSourceBlock    = renderSourceBlock;
window.renderCommentThread  = renderCommentThread;
window.toggleCommentInput   = toggleCommentInput;
window.submitComment        = submitComment;
window.devAnalyzeSource     = devAnalyzeSource;
window.devAskFollowUp       = devAskFollowUp;
window.devFollowUp          = devFollowUp;
