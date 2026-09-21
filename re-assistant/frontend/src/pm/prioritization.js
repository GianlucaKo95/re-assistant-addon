'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/prioritization.js
 * PM Priorisierung — WSJF, RICE, MoSCoW, Kano mit vollständigem RE-Kontext.
 */

/* ── Laden ───────────────────────────────────────────────────── */
async function loadPMPrio() {
  S.systems = await window.api.getSystems();
  const userSystems = S.systems.filter(s => (S.user.systems || []).includes(s.id));
  const opts = userSystems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  const sel = $('prio-sys-sel');
  if (sel) sel.innerHTML = '<option value="">System wählen …</option>' + opts;

  if ($('btn-run-prio'))   $('btn-run-prio').onclick   = runPrio;
  if ($('prio-results'))   $('prio-results').innerHTML =
    '<div class="empty-state"><div class="es-icon">📊</div><h3>System wählen und Methode auswählen</h3></div>';
}

/* ══ PRIORISIERUNG ══════════════════════════════════════════════ */

async function runPrio() {
  const sysId  = $('prio-sys-sel')?.value;
  const method = $('prio-method')?.value || 'wsjf';
  if (!sysId) { toast('⚠ System auswählen'); return; }

  const reqs = await window.api.getRequirements({ systemId: sysId });
  if (!reqs.length) { toast('ℹ Keine Anforderungen'); return; }

  const btn = $('btn-run-prio');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Priorisiere …'; }
  if ($('prio-results')) $('prio-results').innerHTML =
    '<div class="empty-state"><div class="spin"></div><p>Analysiere …</p></div>';

  try {
    // RE-Kontext laden
    const [stakeholders, qualityGoals, boundaries, cache] = await Promise.all([
      fetch(`api/systems/${sysId}/stakeholders`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/quality-goals`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/boundaries`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/embeddings/summary?systemId=${sysId}`, {credentials:'include'}).then(r=>r.json()).catch(()=>null),
    ]);

    const sys = S.systems.find(s => s.id === sysId);
    const sysCtx = cache?.summary?.substring(0, 3000) || '';

    // Anforderungs-Liste mit allen verfügbaren Metadaten
    const reqList = reqs.map(r =>
      `${r.id} | ${r.title} | Kategorie: ${r.category||'?'} | Prio: ${r.priority||'?'}` +
      `${r.business_value ? ' | BV: ' + r.business_value + '/10' : ''}` +
      `${r.risk_level ? ' | Risiko: ' + r.risk_level : ''}` +
      `${r.complexity ? ' | Komplexität: ' + r.complexity : ''}` +
      `${r.quality_score != null ? ' | Score: ' + r.quality_score + '/100' : ''}` +
      `${r.description ? ' | ' + r.description.substring(0, 80) : ''}`
    ).join('\n');

    const shCtx = stakeholders.length
      ? 'Stakeholder: ' + stakeholders.map(s => s.name + ' (Einfluss: ' + s.influence + ')').join(', ')
      : '';
    const qgCtx = qualityGoals.length
      ? 'Qualitätsziele: ' + qualityGoals.map(g => g.iso_char + ': ' + g.description).join(' | ')
      : '';

    // Methoden-spezifischer Prompt
    const methodPrompts = {
      wsjf: {
        label: 'WSJF (Weighted Shortest Job First)',
        desc: 'WSJF = (Business Value + Time Criticality + Risk Reduction) / Job Size. Scores 1-10.',
        schema: '{"items":[{"reqId":"REQ-001","businessValue":8,"timeCriticality":7,"riskReduction":5,"jobSize":3,"wsjf":6.67,"rationale":"...","rank":1}],"summary":"...","recommendations":["..."]}',
      },
      rice: {
        label: 'RICE (Reach × Impact × Confidence / Effort)',
        desc: 'Reach (Nutzer/Monat), Impact (0.25/0.5/1/2/3), Confidence (%), Effort (Personenmonate).',
        schema: '{"items":[{"reqId":"REQ-001","reach":1000,"impact":2,"confidence":80,"effort":2,"score":800,"rationale":"...","rank":1}],"summary":"...","recommendations":["..."]}',
      },
      moscow: {
        label: 'MoSCoW',
        desc: 'Must Have (kritisch), Should Have (wichtig), Could Have (nice-to-have), Won\'t Have (nicht jetzt).',
        schema: '{"groups":{"must":["REQ-001"],"should":["REQ-002"],"could":["REQ-003"],"wont":["REQ-004"]},"items":[{"reqId":"REQ-001","group":"must","rationale":"...","stakeholderImpact":"..."}],"summary":"...","recommendations":["..."]}',
      },
      kano: {
        label: 'Kano-Modell',
        desc: 'Basis (erwartet), Leistung (je mehr desto besser), Begeisterung (unerwartet positiv), Gleichgültig, Negativ.',
        schema: '{"items":[{"reqId":"REQ-001","category":"basis|leistung|begeisterung|gleichgueltig|negativ","rationale":"...","customerSatisfaction":8,"customerDissatisfaction":9}],"summary":"...","recommendations":["..."]}',
      },
    };

    const m = methodPrompts[method] || methodPrompts.wsjf;

    const prompt = [
      `Du bist ein erfahrener Product Owner und Projektmanager. Priorisiere die folgenden Anforderungen nach der ${m.label}-Methode.`,
      '',
      `METHODE: ${m.desc}`,
      '',
      sys ? `SYSTEM: ${sys.name}` : '',
      shCtx,
      qgCtx,
      boundaries.filter(b=>b.type==='in_scope').length
        ? 'Im Umfang: ' + boundaries.filter(b=>b.type==='in_scope').map(b=>b.description).join(', ')
        : '',
      sysCtx ? `\nSYSTEMKONTEXT:\n${sysCtx}` : '',
      '',
      `ANFORDERUNGEN (${reqs.length}):\n${reqList}`,
      '',
      'BEWERTUNGSKRITERIEN:',
      '- Stakeholder-Einfluss und Erwartungen berücksichtigen',
      '- Qualitätsziele (ISO-25010) einbeziehen',
      '- Technische Abhängigkeiten und Risiken beachten',
      '- Business Value und strategischen Nutzen gewichten',
      '',
      `Antworte NUR mit JSON (keine Backticks):\n${m.schema}`,
    ].filter(Boolean).join('\n');

    const res = await callAPI(
      [{ role: 'user', content: prompt }],
      `Du bist zertifizierter Product Owner und Projektmanager. ${langNote()}`,
      6000
    );

    if (!res.ok) { toast('❌ ' + res.text); return; }

    let pr;
    let partial = false;
    try {
      pr = JSON.parse(cleanJsonText(res.text));
    } catch(e) {
      // Bei max_tokens mitten in "items" abgeschnitten: vollständig
      // priorisierte Einträge retten statt die ganze Priorisierung zu verwerfen.
      const items = extractJsonObjects(res.text, 'items');
      if (!items.length) { toast('❌ Parsing-Fehler' + (res.truncated ? ' (Antwort wegen Längenbegrenzung abgeschnitten)' : '')); return; }
      pr = { items, groups: {}, summary: 'Antwort unvollständig (Token-Limit)', recommendations: [] };
      partial = true;
    }

    renderPrioResults(pr, reqs, method, m.label);
    toast(partial ? `⚠ ${m.label} unvollständig — ${pr.items.length} von ${reqs.length} priorisiert` : `✅ ${m.label} abgeschlossen`);

  } catch(e) {
    toast('❌ Fehler: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '⚡ Priorisieren'; }
  }
}

function renderPrioResults(pr, reqs, method, label) {
  const w = $('prio-results');
  if (!w) return;
  const reqMap = Object.fromEntries(reqs.map(r => [r.id, r]));

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600">${label} — ${reqs.length} Anforderungen</div>
      <button class="btn-secondary" style="font-size:11px" onclick="previewApplyPrio(${JSON.stringify(pr).replace(/"/g,'&quot;')}, '${method}')">
        ✅ Prioritäten übernehmen
      </button>
    </div>`;

  // Summary + Empfehlungen
  if (pr.summary || pr.recommendations?.length) {
    html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px 14px;margin-bottom:12px">`;
    if (pr.summary) html += `<div style="font-size:12px;color:var(--t2);margin-bottom:8px">${esc(pr.summary)}</div>`;
    if (pr.recommendations?.length) {
      html += `<div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:4px">💡 EMPFEHLUNGEN</div>`;
      html += pr.recommendations.map(r => `<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(r)}</div>`).join('');
    }
    html += `</div>`;
  }

  if (method === 'moscow') {
    const groups = { must: '🔴 Must Have', should: '🟠 Should Have', could: '🟡 Could Have', wont: '⚪ Won\'t Have' };
    const colors  = { must: 'var(--red)', should: 'var(--amb)', could: 'var(--grn)', wont: 'var(--t3)' };
    Object.entries(groups).forEach(([key, label]) => {
      const ids = pr.groups?.[key] || [];
      html += `<div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;color:${colors[key]};margin-bottom:8px">
          ${label} (${ids.length})
        </div>`;
      ids.forEach(reqId => {
        const r = reqMap[reqId];
        const item = (pr.items || []).find(i => i.reqId === reqId);
        if (!r) return;
        html += renderPrioCard(r, item, null, colors[key]);
      });
      html += `</div>`;
    });
  } else if (method === 'kano') {
    const cats = {
      basis: { label: '🏗 Basis (erwartet)', color: 'var(--t3)' },
      leistung: { label: '📈 Leistung', color: 'var(--ab)' },
      begeisterung: { label: '⭐ Begeisterung', color: 'var(--aa)' },
      gleichgueltig: { label: '😐 Gleichgültig', color: 'var(--t3)' },
      negativ: { label: '❌ Negativ', color: 'var(--red)' },
    };
    Object.entries(cats).forEach(([cat, {label, color}]) => {
      const items = (pr.items || []).filter(i => i.category === cat);
      if (!items.length) return;
      html += `<div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;color:${color};margin-bottom:8px">${label} (${items.length})</div>`;
      items.forEach(item => {
        const r = reqMap[item.reqId];
        if (!r) return;
        html += renderPrioCard(r, item, null, color);
      });
      html += `</div>`;
    });
  } else {
    // WSJF / RICE — nach Score sortiert
    const sorted = [...(pr.items || [])].sort((a, b) => (+b.score || +b.wsjf || 0) - (+a.score || +a.wsjf || 0));
    const max = Math.max(...sorted.map(i => +(i.score || i.wsjf) || 0), 1);
    sorted.forEach((item, idx) => {
      const r = reqMap[item.reqId];
      if (!r) return;
      const score = +(item.score || item.wsjf) || 0;
      html += `<div class="prio-card">
        <div class="prio-row">
          <div class="prio-rank">${idx + 1}</div>
          <div class="prio-info">
            <div class="req-title" style="font-size:13px">${esc(r.title)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(r.id)} · ${esc(r.category||'')}
              ${r.risk_level ? `· Risiko: ${esc(r.risk_level)}` : ''}
              ${r.complexity ? `· Komplexität: ${esc(r.complexity)}` : ''}
            </div>
          </div>
          <div class="prio-score-area">
            <div class="prio-score">${score.toFixed(1)}</div>
            <div class="prio-score-label">${method.toUpperCase()}</div>
            <div class="prio-bar"><div class="prio-bar-fill" style="width:${Math.round(score/max*100)}%"></div></div>
          </div>
        </div>
        ${method === 'wsjf' && item.businessValue != null ? `
        <div style="display:flex;gap:12px;margin:6px 0;font-size:10px;color:var(--t3)">
          <span>BV: <strong>${item.businessValue}</strong></span>
          <span>TC: <strong>${item.timeCriticality}</strong></span>
          <span>RR: <strong>${item.riskReduction}</strong></span>
          <span>JS: <strong>${item.jobSize}</strong></span>
        </div>` : ''}
        ${method === 'rice' && item.reach != null ? `
        <div style="display:flex;gap:12px;margin:6px 0;font-size:10px;color:var(--t3)">
          <span>Reach: <strong>${item.reach}</strong></span>
          <span>Impact: <strong>${item.impact}</strong></span>
          <span>Confidence: <strong>${item.confidence}%</strong></span>
          <span>Effort: <strong>${item.effort}</strong></span>
        </div>` : ''}
        ${item.rationale ? `<div class="prio-rationale">${esc(item.rationale)}</div>` : ''}
        ${item.stakeholderImpact ? `<div style="font-size:11px;color:var(--ab);margin-top:4px">👥 ${esc(item.stakeholderImpact)}</div>` : ''}
      </div>`;
    });
  }

  w.innerHTML = html;
}

function renderPrioCard(r, item, rank, color) {
  return `<div class="prio-card">
    <div class="prio-row">
      ${rank != null ? `<div class="prio-rank" style="color:${color}">${rank}</div>` : ''}
      <div class="prio-info">
        <div class="req-title" style="font-size:13px">${esc(r.title)}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(r.id)} · ${esc(r.category||'')}</div>
      </div>
      <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
    </div>
    ${item?.rationale ? `<div class="prio-rationale">${esc(item.rationale)}</div>` : ''}
    ${item?.stakeholderImpact ? `<div style="font-size:11px;color:var(--ab);margin-top:4px">👥 ${esc(item.stakeholderImpact)}</div>` : ''}
    ${item?.customerSatisfaction != null ? `
    <div style="display:flex;gap:12px;font-size:10px;color:var(--t3);margin-top:4px">
      <span>😊 Zufriedenheit: ${item.customerSatisfaction}/10</span>
      <span>😞 Unzufriedenheit: ${item.customerDissatisfaction}/10</span>
    </div>` : ''}
  </div>`;
}

// Prioritäten auf Anforderungen anwenden — berechnet nur, was sich ändern
// würde (keine Seiteneffekte). Von previewApplyPrio() für die Vorschau und
// von commitPendingPrioChanges() für die tatsächliche Übernahme genutzt.
function computePrioChanges(pr, method, reqs) {
  const changes = [];
  if (method === 'moscow') {
    const priorityMap = { must: 'high', should: 'medium', could: 'low', wont: 'low' };
    for (const [group, ids] of Object.entries(pr.groups || {})) {
      for (const reqId of ids) {
        const req = reqs.find(r => r.id === reqId);
        if (!req) continue;
        changes.push({ req, newPriority: priorityMap[group] || req.priority, newBusinessValue: null });
      }
    }
  } else {
    // WSJF/RICE: Top-25% = high, 25-75% = medium, Bottom-25% = low
    const sorted = [...(pr.items || [])].sort((a, b) => (+b.score || +b.wsjf || 0) - (+a.score || +a.wsjf || 0));
    const total  = sorted.length;
    sorted.forEach((item, idx) => {
      const req = reqs.find(r => r.id === item.reqId);
      if (!req) return;
      const newPriority = idx < total * 0.25 ? 'high' : idx < total * 0.75 ? 'medium' : 'low';
      // WSJF liefert businessValue bereits auf einer 1-10-Skala (siehe
      // Prompt-Schema oben) — das frühere "/10 für beide Felder" kollabierte
      // WSJF-Werte dadurch praktisch immer auf 0 oder 1 (z.B. 8/10 gerundet
      // → 1), unabhängig vom tatsächlichen Score. Nur RICE liefert reach als
      // große Zahl (Nutzer/Monat), die erst grob auf 1-10 herunterskaliert
      // werden muss.
      const bv = item.businessValue != null ? Math.round(item.businessValue)
        : item.reach != null ? Math.round(item.reach / 10)
        : null;
      changes.push({
        req, newPriority,
        newBusinessValue: bv != null ? Math.min(10, Math.max(1, bv)) : null,
      });
    });
  }
  return changes;
}

// Merkt sich die zuletzt berechneten Änderungen zwischen Vorschau-Modal und
// Bestätigung — vermeidet, die komplette (potenziell große) Requirement-
// Liste erneut ins onclick-Attribut des Bestätigen-Buttons einzubetten.
let _pendingPrioChanges = null;

async function previewApplyPrio(pr, method) {
  const reqs = await window.api.getRequirements({ systemId: $('prio-sys-sel')?.value });
  const changes = computePrioChanges(pr, method, reqs);
  if (!changes.length) { toast('⚠ Keine Änderungen zu übernehmen'); return; }

  const rows = changes.map(c => {
    const prioChanged = c.newPriority !== c.req.priority;
    const bvChanged   = c.newBusinessValue != null && c.newBusinessValue !== c.req.business_value;
    if (!prioChanged && !bvChanged) return null;
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;
      border-bottom:1px solid var(--b1);font-size:12px">
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <span class="req-id" style="margin-right:6px">${esc(c.req.id)}</span>${esc(c.req.title)}
      </div>
      <div style="flex-shrink:0;display:flex;gap:10px;font-size:11px;color:var(--t2);white-space:nowrap">
        ${prioChanged ? `<span>${priLabel(c.req.priority)} → <strong>${priLabel(c.newPriority)}</strong></span>` : ''}
        ${bvChanged ? `<span>BV ${c.req.business_value ?? '—'} → <strong>${c.newBusinessValue}</strong></span>` : ''}
      </div>
    </div>`;
  }).filter(Boolean);

  _pendingPrioChanges = changes;

  openModal('Prioritäten übernehmen — Vorschau', `
    <p style="font-size:12px;color:var(--t3);margin-bottom:10px">
      ${rows.length} von ${changes.length} Anforderungen ändern sich. Unveränderte werden hier nicht aufgeführt.
    </p>
    <div style="max-height:400px;overflow-y:auto;margin-bottom:12px">
      ${rows.length ? rows.join('') : '<div style="font-size:12px;color:var(--t3)">Keine Änderungen — alle Anforderungen haben bereits die vorgeschlagenen Werte.</div>'}
    </div>
    <div class="modal-footer-actions">
      ${rows.length ? `<button class="btn-primary" onclick="commitPendingPrioChanges()">✅ Bestätigen (${rows.length})</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">${rows.length ? 'Abbrechen' : 'Schließen'}</button>
    </div>
  `);
}

async function commitPendingPrioChanges() {
  const changes = _pendingPrioChanges;
  _pendingPrioChanges = null;
  closeModal();
  if (!changes) return;
  let updated = 0;
  for (const c of changes) {
    const patch = { ...c.req, priority: c.newPriority };
    if (c.newBusinessValue != null) patch.business_value = c.newBusinessValue;
    await window.api.saveRequirement(patch).catch(() => {});
    updated++;
  }
  toast(`✅ ${updated} Anforderungen aktualisiert`);
}

// Exports
window.loadPMPrio              = loadPMPrio;
window.runPrio                 = runPrio;
window.previewApplyPrio        = previewApplyPrio;
window.commitPendingPrioChanges = commitPendingPrioChanges;
