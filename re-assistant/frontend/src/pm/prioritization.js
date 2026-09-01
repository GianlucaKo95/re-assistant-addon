'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/prioritization.js
 * PM Priorisierung — WSJF, RICE, MoSCoW, Kano mit vollständigem RE-Kontext.
 * QS-Dashboard für alle Anforderungen eines Systems.
 */

/* ── Laden ───────────────────────────────────────────────────── */
async function loadPMPrio() {
  S.systems = await window.api.getSystems();
  const userSystems = S.systems.filter(s => (S.user.systems || []).includes(s.id));
  const opts = userSystems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  [
    'prio-sys-sel', 'qs-sys-sel',
  ].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '<option value="">System wählen …</option>' + opts;
  });

  if ($('btn-run-prio'))   $('btn-run-prio').onclick   = runPrio;
  if ($('btn-run-qs'))     $('btn-run-qs').onclick     = runQSDashboard;
  if ($('prio-results'))   $('prio-results').innerHTML =
    '<div class="empty-state"><div class="es-icon">📊</div><h3>System wählen und Methode auswählen</h3></div>';
  if ($('qs-results'))     $('qs-results').innerHTML   =
    '<div class="empty-state"><div class="es-icon">✅</div><h3>System wählen und QS starten</h3></div>';
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
      5000
    );

    if (!res.ok) { toast('❌ ' + res.text); return; }

    let pr;
    try {
      pr = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
    } catch(e) { toast('❌ Parsing-Fehler'); return; }

    renderPrioResults(pr, reqs, method, m.label);
    toast(`✅ ${m.label} abgeschlossen`);

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
      <button class="btn-secondary" style="font-size:11px" onclick="applyPrioToReqs(${JSON.stringify(pr).replace(/"/g,'&quot;')}, '${method}')">
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

// Prioritäten auf Anforderungen anwenden
async function applyPrioToReqs(pr, method) {
  const reqs = await window.api.getRequirements({ systemId: $('prio-sys-sel')?.value });
  let updated = 0;

  if (method === 'moscow') {
    const priorityMap = { must: 'high', should: 'medium', could: 'low', wont: 'low' };
    for (const [group, ids] of Object.entries(pr.groups || {})) {
      for (const reqId of ids) {
        const req = reqs.find(r => r.id === reqId);
        if (!req) continue;
        await window.api.saveRequirement({ ...req, priority: priorityMap[group] || req.priority }).catch(() => {});
        updated++;
      }
    }
  } else {
    // WSJF/RICE: Top-25% = high, 25-75% = medium, Bottom-25% = low
    const sorted = [...(pr.items || [])].sort((a, b) => (+b.score || +b.wsjf || 0) - (+a.score || +a.wsjf || 0));
    const total  = sorted.length;
    for (const [idx, item] of sorted.entries()) {
      const req = reqs.find(r => r.id === item.reqId);
      if (!req) continue;
      const prio = idx < total * 0.25 ? 'high' : idx < total * 0.75 ? 'medium' : 'low';
      const bv   = item.businessValue || item.reach || null;
      await window.api.saveRequirement({
        ...req, priority: prio,
        business_value: bv != null ? Math.min(10, Math.round(bv / 10)) : req.business_value,
      }).catch(() => {});
      updated++;
    }
  }
  toast(`✅ ${updated} Anforderungen aktualisiert`);
}

/* ══ QS-DASHBOARD ═══════════════════════════════════════════════ */

async function runQSDashboard() {
  const sysId = $('qs-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }

  const btn = $('btn-run-qs');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Prüfe …'; }
  if ($('qs-results')) $('qs-results').innerHTML =
    '<div class="empty-state"><div class="spin"></div><p>Analysiere Qualität …</p></div>';

  try {
    const [reqs, stakeholders, qualityGoals, useCases] = await Promise.all([
      window.api.getRequirements({ systemId: sysId }),
      fetch(`api/systems/${sysId}/stakeholders`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/quality-goals`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/use-cases`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
    ]);

    if (!reqs.length) { toast('ℹ Keine Anforderungen'); return; }

    // Statistiken berechnen
    const stats = {
      total:       reqs.length,
      withScore:   reqs.filter(r => r.quality_score != null).length,
      avgScore:    reqs.filter(r => r.quality_score != null).reduce((s,r) => s + r.quality_score, 0) /
                   Math.max(reqs.filter(r => r.quality_score != null).length, 1),
      withAC:      reqs.filter(r => r.acceptance_criteria_text).length,
      withISO:     reqs.filter(r => r.iso_category).length,
      highRisk:    reqs.filter(r => r.risk_level === 'hoch').length,
      noDesc:      reqs.filter(r => !r.description || r.description.length < 20).length,
      highPrio:    reqs.filter(r => r.priority === 'high').length,
      open:        reqs.filter(r => r.status === 'open').length,
      byCategory:  {},
      byISO:       {},
    };
    reqs.forEach(r => {
      stats.byCategory[r.category||'?'] = (stats.byCategory[r.category||'?'] || 0) + 1;
      if (r.iso_category) stats.byISO[r.iso_category] = (stats.byISO[r.iso_category] || 0) + 1;
    });

    // KI-Analyse für systemische Probleme
    const reqSummary = reqs.map(r =>
      `${r.id}: ${r.title} [Score:${r.quality_score??'—'}/100][AC:${r.acceptance_criteria_text?'✓':'✗'}][ISO:${r.iso_category||'—'}][Risiko:${r.risk_level||'—'}]`
    ).join('\n');

    const qgText = qualityGoals.map(g => `- ${g.iso_char}: ${g.description} → Ziel: ${g.target||'?'}`).join('\n');
    const ucText = useCases.map(u => `- ${u.title} (${u.actor})`).join('\n');
    const shText = stakeholders.map(s => `- ${s.name} (${s.role}, ${s.influence})`).join('\n');

    // RAG-Kontext für QS: findet Code der zu den Anforderungen gehört
    let qsRagCtx = '';
    try {
      if (typeof getRAGContextForQuery === 'function') {
        qsRagCtx = await getRAGContextForQuery(sysId,
          'Anforderungen Implementierung Architektur ' + reqs.slice(0,5).map(r=>r.title).join(' '),
          { role: 'overview' }
        );
      }
    } catch(e) {}

    const res = await callAPI([{ role: 'user', content:
      'Du bist CPRE-zertifizierter QS-Experte. Analysiere die Qualität dieses Anforderungssatzes systematisch.\n\n'
      + `SYSTEM: ${S.systems.find(s=>s.id===sysId)?.name || sysId}\n`
      + `ANFORDERUNGEN (${reqs.length}):\n${reqSummary}\n\n`
      + (shText ? `STAKEHOLDER:\n${shText}\n\n` : '')
      + (ucText ? `USE CASES:\n${ucText}\n\n` : '')
      + (qgText ? `QUALITÄTSZIELE:\n${qgText}\n\n` : '')
      + (qsRagCtx ? `IMPLEMENTIERUNGSKONTEXT (Code/Doku):\n${qsRagCtx.substring(0, 3000)}\n\n` : '')
      + 'Erstelle einen vollständigen QS-Bericht. JSON (keine Backticks):\n'
      + '{"overallQuality":"hoch|mittel|niedrig","summary":"...","issues":['
      + '{"severity":"kritisch|hoch|mittel|niedrig","type":"Vollständigkeit|Konsistenz|Testbarkeit|Eindeutigkeit|Rückverfolgbarkeit|Abdeckung","affected":["REQ-001"],"description":"...","recommendation":"..."}'
      + '],"gaps":["Fehlende Anforderung: ..."],"duplicates":["REQ-001 ≈ REQ-002: ..."],'
      + '"coverageByStakeholder":{"stakeholderName":"abgedeckt|teilweise|fehlt"},'
      + '"coverageByUseCase":{"ucTitle":"abgedeckt|teilweise|fehlt"},'
      + '"recommendations":["..."]}'
    }],
      `Du bist CPRE-zertifizierter QS-Experte und Requirements Auditor. ${langNote()}`,
      5000
    );

    let analysis = null;
    if (res.ok) {
      try {
        analysis = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
      } catch(e) {}
    }

    renderQSDashboard(stats, analysis, reqs, sysId);
    toast('✅ QS-Analyse abgeschlossen');

  } catch(e) {
    toast('❌ Fehler: ' + e.message);
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔍 QS-Analyse starten'; }
  }
}

function renderQSDashboard(stats, analysis, reqs, sysId) {
  const w = $('qs-results');
  if (!w) return;

  const qualColor = analysis?.overallQuality === 'hoch' ? 'var(--grn)'
    : analysis?.overallQuality === 'mittel' ? 'var(--amb)' : 'var(--red)';
  const scoreColor = s => s >= 80 ? 'var(--grn)' : s >= 50 ? 'var(--amb)' : 'var(--red)';

  let html = `
    <!-- KPI-Kacheln -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:16px">
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--aa)">${stats.total}</div>
        <div style="font-size:10px;color:var(--t3)">Anforderungen</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${scoreColor(stats.avgScore)}">${stats.withScore ? Math.round(stats.avgScore) : '—'}</div>
        <div style="font-size:10px;color:var(--t3)">Ø SMART-Score</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${stats.withAC/stats.total > 0.7 ? 'var(--grn)' : 'var(--amb)'}">${Math.round(stats.withAC/stats.total*100)}%</div>
        <div style="font-size:10px;color:var(--t3)">mit Akzeptanzkriterien</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${stats.highRisk > 3 ? 'var(--red)' : 'var(--grn)'}">${stats.highRisk}</div>
        <div style="font-size:10px;color:var(--t3)">Hohes Risiko</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${stats.noDesc > 0 ? 'var(--red)' : 'var(--grn)'}">${stats.noDesc}</div>
        <div style="font-size:10px;color:var(--t3)">ohne Beschreibung</div>
      </div>
      ${analysis ? `
      <div style="background:var(--s2);border:2px solid ${qualColor};border-radius:var(--r);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700;color:${qualColor}">${analysis.overallQuality?.toUpperCase()}</div>
        <div style="font-size:10px;color:var(--t3)">Gesamtqualität</div>
      </div>` : ''}
    </div>`;

  // Summary
  if (analysis?.summary) {
    html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
      padding:12px 14px;margin-bottom:12px;font-size:12px;color:var(--t2)">${esc(analysis.summary)}</div>`;
  }

  // Issues
  if (analysis?.issues?.length) {
    const sevColors = { kritisch:'var(--red)', hoch:'var(--amb)', mittel:'var(--ab)', niedrig:'var(--t3)' };
    html += `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">⚠ Qualitätsprobleme (${analysis.issues.length})</div>`;
    analysis.issues.forEach(issue => {
      const c = sevColors[issue.severity] || 'var(--t3)';
      html += `<div style="background:var(--s2);border:1px solid var(--b1);border-left:3px solid ${c};
        border-radius:var(--r);padding:10px 12px;margin-bottom:6px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;font-weight:600;color:${c}">${esc(issue.severity?.toUpperCase())}</span>
          <span style="font-size:10px;background:var(--s3);padding:1px 6px;border-radius:99px">${esc(issue.type)}</span>
          ${(issue.affected||[]).slice(0,3).map(id=>`<span style="font-size:10px;font-family:var(--mono);color:var(--ab)">${esc(id)}</span>`).join('')}
          ${(issue.affected||[]).length > 3 ? `<span style="font-size:10px;color:var(--t3)">+${issue.affected.length-3}</span>` : ''}
        </div>
        <div style="font-size:12px">${esc(issue.description)}</div>
        ${issue.recommendation ? `<div style="font-size:11px;color:var(--grn);margin-top:4px">💡 ${esc(issue.recommendation)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Lücken + Duplikate
  const hasGaps = analysis?.gaps?.length;
  const hasDups = analysis?.duplicates?.length;
  if (hasGaps || hasDups) {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">`;
    if (hasGaps) {
      html += `<div style="background:rgba(248,81,73,.06);border:1px solid rgba(248,81,73,.2);border-radius:var(--r);padding:10px 12px">
        <div style="font-size:10px;font-weight:600;color:var(--red);margin-bottom:6px">🕳 Lücken (${analysis.gaps.length})</div>
        ${analysis.gaps.map(g=>`<div style="font-size:11px;padding:2px 0;color:var(--t2)">• ${esc(g)}</div>`).join('')}
      </div>`;
    }
    if (hasDups) {
      html += `<div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-radius:var(--r);padding:10px 12px">
        <div style="font-size:10px;font-weight:600;color:var(--amb);margin-bottom:6px">🔁 Mögliche Duplikate (${analysis.duplicates.length})</div>
        ${analysis.duplicates.map(d=>`<div style="font-size:11px;padding:2px 0;color:var(--t2)">• ${esc(d)}</div>`).join('')}
      </div>`;
    }
    html += `</div>`;
  }

  // Stakeholder / Use Case Abdeckung
  const hasSHCov = analysis?.coverageByStakeholder && Object.keys(analysis.coverageByStakeholder).length;
  const hasUCCov = analysis?.coverageByUseCase && Object.keys(analysis.coverageByUseCase).length;
  if (hasSHCov || hasUCCov) {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">`;
    if (hasSHCov) {
      html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:10px 12px">
        <div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:6px">👥 Stakeholder-Abdeckung</div>
        ${Object.entries(analysis.coverageByStakeholder).map(([name, status]) => {
          const c = status === 'abgedeckt' ? 'var(--grn)' : status === 'teilweise' ? 'var(--amb)' : 'var(--red)';
          return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0">
            <span>${esc(name)}</span>
            <span style="color:${c}">${esc(status)}</span>
          </div>`;
        }).join('')}
      </div>`;
    }
    if (hasUCCov) {
      html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:10px 12px">
        <div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:6px">📋 Use Case Abdeckung</div>
        ${Object.entries(analysis.coverageByUseCase).map(([name, status]) => {
          const c = status === 'abgedeckt' ? 'var(--grn)' : status === 'teilweise' ? 'var(--amb)' : 'var(--red)';
          return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
            <span style="color:${c};flex-shrink:0;margin-left:8px">${esc(status)}</span>
          </div>`;
        }).join('')}
      </div>`;
    }
    html += `</div>`;
  }

  // Empfehlungen
  if (analysis?.recommendations?.length) {
    html += `<div style="background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);border-radius:var(--r);padding:10px 12px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;color:var(--grn);margin-bottom:6px">💡 Empfehlungen</div>
      ${analysis.recommendations.map(r=>`<div style="font-size:11px;padding:2px 0;color:var(--t2)">• ${esc(r)}</div>`).join('')}
    </div>`;
  }

  // Schnell-SMART für alle ohne Score
  const noScore = reqs.filter(r => r.quality_score == null);
  if (noScore.length) {
    html += `<div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);
      border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;color:var(--amb)">${noScore.length} Anforderungen ohne SMART-Score</div>
        <button class="btn-secondary" style="font-size:11px"
          onclick="batchSmartCheck('${sysId}', ${JSON.stringify(noScore.map(r=>r.id))})">
          ⭐ Alle SMART-prüfen
        </button>
      </div>
    </div>`;
  }

  // Kategorie-Verteilung
  html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:10px 12px">
    <div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:8px">KATEGORIE-VERTEILUNG</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,count]) =>
        `<div style="background:var(--s3);border-radius:99px;padding:3px 10px;font-size:11px">
          ${esc(cat)} <strong>${count}</strong>
        </div>`
      ).join('')}
    </div>
  </div>`;

  w.innerHTML = html;
}

// Batch SMART-Check
async function batchSmartCheck(sysId, reqIds) {
  toast(`⭐ SMART-Prüfung für ${reqIds.length} Anforderungen gestartet (läuft im Hintergrund) …`);
  let done = 0;
  for (const id of reqIds) {
    try {
      await fetch(`api/requirements/${id}/quality-check`, {
        method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}
      });
      done++;
    } catch(e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  toast(`✅ ${done}/${reqIds.length} SMART-Checks abgeschlossen`);
  runQSDashboard();
}

// Exports
window.loadPMPrio        = loadPMPrio;
window.runPrio           = runPrio;
window.applyPrioToReqs   = applyPrioToReqs;
window.runQSDashboard    = runQSDashboard;
window.batchSmartCheck   = batchSmartCheck;
