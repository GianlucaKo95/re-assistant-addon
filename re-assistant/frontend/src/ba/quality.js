'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * ba/quality.js
 * ISO 29148 + SMART + IEEE-830 Qualitätssicherung mit vollem RE-Kontext.
 */

async function loadBaQS() {
  S.systems = await window.api.getSystems();
  const sel = $('qs-sys-sel');
  if (sel) {
    const mySystems = S.systems.filter(s => (S.user.systems || []).includes(s.id));
    sel.innerHTML = '<option value="">System wählen …</option>' +
      mySystems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = () => loadCachedQS(sel.value);
    if (mySystems.length === 1) sel.value = mySystems[0].id;
  }
  if ($('btn-run-qs')) $('btn-run-qs').onclick = runQS;
  if (sel?.value) {
    loadCachedQS(sel.value);
  } else if ($('qs-results')) {
    $('qs-results').innerHTML = `
      <div class="empty-state"><div class="es-icon">🔬</div>
      <h3>System auswählen und QS starten</h3>
      <p>Die KI bewertet jede Anforderung nach ISO 29148, SMART, IEEE-830:<br>
      Eindeutigkeit, Vollständigkeit, Testbarkeit, Stakeholder-Abdeckung.</p></div>`;
  }
}

// Trennt die Anforderungen eines Systems in bereits gültig bewertete
// (QS-Ergebnis vorhanden UND Inhalt seit der Analyse unverändert) und
// offene (noch nie bewertet, oder Titel/Beschreibung/Kategorie/Priorität
// haben sich seitdem geändert — z.B. weil die Anforderung verbessert
// wurde). So muss eine unveränderte Anforderung nicht erneut über die KI
// laufen, während eine geänderte automatisch wieder als offen gilt.
function splitQSCache(reqs) {
  const cached = [];
  const open = [];
  for (const req of reqs) {
    if (req.qsDetail && req.qsContentHash && req.qsContentHash === hashReqContent(req)) {
      cached.push({ ...req.qsDetail, reqId: req.id });
    } else {
      open.push(req);
    }
  }
  return { cached, open };
}

// Lädt beim Öffnen der Ansicht bzw. bei Systemwechsel die gespeicherten
// QS-Ergebnisse, ohne die KI erneut zu bemühen — das eigentliche
// "gespeichert bleiben solange sich nichts ändert".
async function loadCachedQS(sysId) {
  if (!sysId) return;
  const reqs = await window.api.getRequirements({ systemId: sysId });
  const { cached, open } = splitQSCache(reqs);
  renderQSResults(cached, reqs, [], open.length);
}

async function runQS() {
  const sysId = $('qs-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }

  const allReqs = await window.api.getRequirements({ systemId: sysId });
  if (!allReqs.length) { toast('ℹ Keine Anforderungen im System'); return; }

  // Nur offene (nie bewertete oder seit der letzten QS geänderte)
  // Anforderungen erneut über die KI laufen lassen — unveränderte behalten
  // ihr gespeichertes Ergebnis, das spart Zeit und Tokens.
  const { cached: cachedResults, open: reqs } = splitQSCache(allReqs);
  if (!reqs.length) {
    renderQSResults(cachedResults, allReqs, [], 0);
    const avg = cachedResults.length ? (cachedResults.reduce((s,r)=>s+(r.score||0),0)/cachedResults.length).toFixed(0) : '—';
    toast(`✅ Bereits aktuell — keine Änderungen seit der letzten QS (Ø Score: ${avg}/100)`);
    return;
  }

  const btn = $('btn-run-qs');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Analysiere …'; }
  if ($('qs-results')) $('qs-results').innerHTML =
    `<div class="empty-state"><div class="spin"></div><p>Analysiere ${reqs.length} offene Anforderung(en) mit vollem RE-Kontext …</p></div>`;

  try {
    // Vollständiger RE-Kontext laden
    const [stakeholders, useCases, qualityGoals, boundaries, cacheRes] = await Promise.all([
      fetch(`api/systems/${sysId}/stakeholders`,  {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/use-cases`,     {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/quality-goals`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/boundaries`,    {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/embeddings/summary?systemId=${sysId}`, {credentials:'include'}).then(r=>r.json()).catch(()=>null),
    ]);

    const sysCtx = cacheRes?.summary?.substring(0, 2000) || '';

    // Für tiefen QS-Check: Code-Kontext der betroffenen Anforderungen laden
    // (hilft zu prüfen ob Anforderung zur tatsächlichen Implementierung passt)
    const shText   = stakeholders.map(s => `- ${s.name} (${s.role}, Einfluss: ${s.influence}): ${s.interests}`).join('\n');
    const ucText   = useCases.map(u => `- ${u.id}: ${u.title} (Akteur: ${u.actor})`).join('\n');
    const qgText   = qualityGoals.map(g => `- ${g.iso_char}: ${g.description} → ${g.target||'?'}`).join('\n');
    const inScope  = boundaries.filter(b=>b.type==='in_scope').map(b=>b.description).join(', ');
    const outScope = boundaries.filter(b=>b.type==='out_of_scope').map(b=>b.description).join(', ');

    const sys = S.systems.find(s => s.id === sysId);

    // Anforderungen in Batches analysieren. Jede Anforderung erzeugt bei
    // vollständiger Analyse (issues[], improvedDescription, acceptanceCriteria[],
    // suggestions[]) leicht 600-900 Tokens Output — 15 pro Batch bei nur 4000
    // max_tokens riss die Antwort regelmäßig mitten im JSON ab. Kleinerer
    // Batch + mehr Tokens (unten bei callAPI) beugt dem vor.
    const BATCH = 6;
    const allResults = [];
    const batchErrors = [];

    for (let i = 0; i < reqs.length; i += BATCH) {
      const batch = reqs.slice(i, i + BATCH);
      const reqList = batch.map(r =>
        `ID:${r.id}\nTitel: ${r.title}\nBeschreibung: ${r.description || '(keine)'}\n` +
        `Kategorie: ${r.category||'?'} | Priorität: ${r.priority||'?'}\n` +
        `Akzeptanzkriterien: ${r.acceptance_criteria_text || '(keine)'}\n` +
        `ISO-Kategorie: ${r.iso_category || '(keine)'}\n` +
        `Bestehender Score: ${r.quality_score != null ? r.quality_score + '/100' : '(nicht bewertet)'}`
      ).join('\n\n---\n\n');

      const schema = '[{"reqId":"REQ-001","score":75,"issues":[{"type":"ambiguity|missing|not_testable|inconsistency|stakeholder_gap","text":"...","suggestion":"...","severity":"kritisch|hoch|mittel|niedrig"}],"improvedTitle":"...","improvedDescription":"vollständige, messbare Beschreibung","acceptanceCriteria":["Gegeben...Wenn...Dann..."],"stakeholderGap":"Welcher Stakeholder wird nicht adressiert?","missingUseCases":["Welcher Use Case fehlt?"],"isoCompliance":"konform|teilweise|nicht konform","ieee830Issues":["Verletzt IEEE-830 Regel X"],"suggestions":["Konkrete Verbesserung"]}]';

      const prompt = [
        'Du bist CPRE-zertifizierter Requirements Engineer und ISO-29148-Prüfer.',
        'Bewerte jede Anforderung nach: ISO 29148, SMART, IEEE-830.',
        '',
        sys ? `SYSTEM: ${sys.name}` : '',
        sysCtx ? `SYSTEMKONTEXT:\n${sysCtx}` : '',
        shText ? `\nSTAKEHOLDER:\n${shText}` : '',
        ucText ? `\nUSE CASES:\n${ucText}` : '',
        qgText ? `\nQUALITÄTSZIELE:\n${qgText}` : '',
        inScope ? `\nIM UMFANG: ${inScope}` : '',
        outScope ? `AUSSERHALB: ${outScope}` : '',
        '',
        'BEWERTUNGSKRITERIEN (ISO 29148):',
        '- Eindeutigkeit: keine Ambiguitäten (schnell, einfach, effizient, benutzerfreundlich)',
        '- Vollständigkeit: Akzeptanzkriterien, Ausnahmen, Randbedingungen vorhanden?',
        '- Testbarkeit: messbar und verifizierbar?',
        '- Konsistenz: kein Widerspruch zu anderen Anforderungen oder Qualitätszielen?',
        '- Stakeholder-Abdeckung: werden alle relevanten Stakeholder adressiert?',
        '- Use-Case-Bindung: ist ein Use Case zugeordnet?',
        '',
        `ANFORDERUNGEN:\n${reqList}`,
        '',
        `Antworte NUR mit JSON-Array (keine Backticks):\n${schema}`,
      ].filter(Boolean).join('\n');

      const res = await callAPI(
        [{ role: 'user', content: prompt }],
        `Du bist CPRE-zertifizierter QS-Experte. ${langNote()}`,
        8000
      );

      if (!res.ok) { batchErrors.push(res.text); continue; }
      try {
        const batchResults = JSON.parse(cleanJsonText(res.text));
        allResults.push(...(Array.isArray(batchResults) ? batchResults : []));
      } catch(e) {
        // Antwort durch max_tokens mitten im JSON abgeschnitten: statt den
        // ganzen Batch zu verwerfen, alle vollständigen {...}-Objekte vor
        // dem Abbruch retten (extractJsonObjects parst jedes einzeln).
        const recovered = extractJsonObjects(res.text);
        if (recovered.length) {
          allResults.push(...recovered);
          batchErrors.push(`Antwort unvollständig (Token-Limit erreicht) — ${recovered.length}/${batch.length} Anforderungen aus diesem Batch gerettet`);
        } else {
          console.error('QS: Antwort konnte nicht als JSON verarbeitet werden', e, res.text);
          batchErrors.push('Antwort der KI konnte nicht verarbeitet werden');
        }
      }

      if (i + BATCH < reqs.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Scores + volles QS-Ergebnis speichern (inkl. Inhalts-Hash) — solange
    // sich Titel/Beschreibung/Kategorie/Priorität danach nicht ändern, wird
    // diese Anforderung beim nächsten Öffnen aus dem gespeicherten Ergebnis
    // wiederhergestellt statt erneut analysiert.
    for (const r of allResults) {
      const req = reqs.find(x => x.id === r.reqId);
      if (!req) continue;
      await window.api.saveRequirement({
        ...req,
        quality_score:            r.score,
        acceptance_criteria_text: r.acceptanceCriteria?.join('\n') || req.acceptance_criteria_text || '',
        iso_category:             req.iso_category || '',
        qsDetail:                 r,
        qsContentHash:            hashReqContent(req),
      }).catch(() => {});
    }

    // Frisch analysierte + aus dem Cache wiederverwendete Ergebnisse zusammen
    // anzeigen — der Nutzer sieht immer den vollständigen Stand des Systems.
    const combined = [...cachedResults, ...allResults];
    const stillOpen = reqs.filter(r => !allResults.some(x => x.reqId === r.id)).length;
    renderQSResults(combined, allReqs, batchErrors, stillOpen);
    if (!allResults.length) {
      toast('❌ QS fehlgeschlagen: ' + (batchErrors[0] || 'Keine Ergebnisse von der KI erhalten'));
    } else {
      const avg = (combined.reduce((s, r) => s + (r.score||0), 0) / combined.length).toFixed(0);
      const failedNote = batchErrors.length ? ` — ${batchErrors.length} von ${Math.ceil(reqs.length / BATCH)} Batches fehlgeschlagen` : '';
      toast(`✅ ${allResults.length} neu bewertet (${combined.length} gesamt) — Ø Score: ${avg}/100${failedNote}`);
    }

  } catch(e) {
    toast('❌ Fehler: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '▶ QS starten'; }
  }
}

function renderQSResults(results, reqs, batchErrors, openCount) {
  if (!$('qs-results')) return;
  batchErrors = batchErrors || [];
  openCount = openCount || 0;

  if (!results.length && !batchErrors.length) {
    // Kein Fehlschlag — es wurde nur noch nichts (gültig) bewertet: entweder
    // Erstaufruf, oder alle vorherigen Ergebnisse sind wegen Änderungen an
    // den Anforderungen veraltet und wieder offen.
    $('qs-results').innerHTML = reqs.length ? `
      <div class="empty-state"><div class="es-icon">🔬</div>
      <h3>Noch keine gültige QS-Analyse</h3>
      <p>${reqs.length} Anforderung(en) offen — auf "QS starten" klicken.</p></div>` : `
      <div class="empty-state"><div class="es-icon">🔬</div>
      <h3>Keine Anforderungen im System</h3></div>`;
    return;
  }
  if (!results.length && reqs.length) {
    // Gleiche Fehlermeldung(en) wie in den einzelnen Batches — dedupliziert,
    // damit z.B. bei 3 identisch fehlgeschlagenen Batches nicht 3x derselbe
    // Text erscheint.
    const uniqueErrors = [...new Set((batchErrors||[]).filter(Boolean))];
    $('qs-results').innerHTML = `
      <div class="empty-state">
        <div class="es-icon" style="color:var(--red)">⚠</div>
        <h3>QS-Analyse fehlgeschlagen</h3>
        <p>Die KI hat für keine der ${reqs.length} Anforderungen ein auswertbares Ergebnis geliefert.</p>
        ${uniqueErrors.length ? `
        <div style="text-align:left;max-width:520px;margin:12px auto 0;background:var(--s2);
          border:1px solid var(--b1);border-radius:var(--r);padding:10px 14px">
          ${uniqueErrors.map(e => `<div style="font-size:12px;color:var(--red);font-family:var(--mono);
            word-break:break-word;padding:3px 0">${esc(e)}</div>`).join('')}
        </div>` : `<p>Details siehe Browser-Konsole — mögliche Ursachen: API-Key/Budget,
        Provider-Fehler oder eine unerwartete Antwortstruktur.</p>`}
      </div>`;
    return;
  }
  const sorted = [...results].sort((a, b) => (a.score||0) - (b.score||0));

  const typeLabels = {
    ambiguity:      '⚠ Ambiguität',
    missing:        '✗ Fehlt',
    not_testable:   '✗ Nicht testbar',
    inconsistency:  '🔀 Inkonsistenz',
    stakeholder_gap:'👥 Stakeholder-Lücke',
    suggestion:     '💡 Vorschlag',
  };
  const sevColors = {
    kritisch: 'var(--red)', hoch: 'var(--amb)', mittel: 'var(--ab)', niedrig: 'var(--t3)',
  };

  $('qs-results').innerHTML = `
    <!-- Zusammenfassung -->
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${[
        ['Gesamt', results.length, 'var(--aa)'],
        ['Ø Score', results.length ? Math.round(results.reduce((s,r)=>s+(r.score||0),0)/results.length) + '/100' : '—', 'var(--t1)'],
        ['Kritisch', results.filter(r=>(r.issues||[]).some(i=>i.severity==='kritisch')).length, 'var(--red)'],
        ['Gut (≥80)', results.filter(r=>(r.score||0)>=80).length, 'var(--grn)'],
        ...(openCount > 0 ? [['Offen', openCount, 'var(--amb)']] : []),
      ].map(([label, val, color]) => `
        <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
          padding:8px 14px;text-align:center;min-width:80px">
          <div style="font-size:18px;font-weight:700;color:${color}">${val}</div>
          <div style="font-size:10px;color:var(--t3)">${label}</div>
        </div>`).join('')}
    </div>
    ${openCount > 0 ? `<p style="font-size:11px;color:var(--t3);margin:-6px 0 14px">
      ${openCount} Anforderung(en) noch nicht bewertet oder seit der letzten QS geändert —
      "QS starten" bewertet nur diese neu.</p>` : ''}

    <!-- Karten -->
    ${sorted.map(r => {
      const req = reqs.find(x => x.id === r.reqId);
      const col = (r.score||0) >= 80 ? 'var(--grn)' : (r.score||0) >= 50 ? 'var(--amb)' : 'var(--red)';
      return `<div class="qs-card">
        <div class="qs-card-head" onclick="this.nextElementSibling.classList.toggle('open')">
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:2px">
              <span class="req-id">${esc(r.reqId)}</span>
              ${r.isoCompliance === 'konform' ? '<span style="font-size:9px;color:var(--grn);background:rgba(63,185,80,.1);padding:1px 6px;border-radius:99px">ISO ✓</span>' :
                r.isoCompliance === 'teilweise' ? '<span style="font-size:9px;color:var(--amb);background:rgba(251,191,36,.1);padding:1px 6px;border-radius:99px">ISO ~</span>' :
                '<span style="font-size:9px;color:var(--red);background:rgba(248,81,73,.1);padding:1px 6px;border-radius:99px">ISO ✗</span>'}
            </div>
            <div class="req-title" style="font-size:13px">${esc(req?.title || r.reqId)}</div>
          </div>
          <div class="qs-score">
            <div class="qs-score-bar">
              <div class="qs-score-fill" style="width:${r.score||0}%;background:${col}"></div>
            </div>
            <div class="qs-score-num" style="color:${col}">${r.score||0}<span style="font-size:10px;color:var(--t3)">/100</span></div>
          </div>
        </div>
        <div class="qs-body">
          ${(r.issues||[]).map(i => `
          <div class="qs-issue">
            <span class="qs-issue-type" style="background:${(sevColors[i.severity]||'var(--t3)') + '22'};color:${sevColors[i.severity]||'var(--t3)'}">
              ${typeLabels[i.type]||i.type}${i.severity ? ` · ${i.severity}` : ''}
            </span>
            <div style="flex:1">
              ${esc(i.text)}
              ${i.suggestion ? `<div class="qs-suggestion-box">
                <div class="qs-suggestion-label">💡 Verbesserungsvorschlag</div>
                <div style="font-size:12px">${esc(i.suggestion)}</div>
                <button class="btn-accept" onclick="acceptQSSuggestion('${r.reqId}',${JSON.stringify(i.suggestion).replace(/"/g,'&quot;')})">✓ Übernehmen</button>
              </div>` : ''}
            </div>
          </div>`).join('')}

          ${r.acceptanceCriteria?.length ? `
          <div class="qs-suggestion-box">
            <div class="qs-suggestion-label">✅ Vorgeschlagene Akzeptanzkriterien</div>
            ${r.acceptanceCriteria.map(c => `<div style="font-size:11px;padding:2px 0">• ${esc(c)}</div>`).join('')}
            <button class="btn-accept" onclick="acceptAC('${r.reqId}',${JSON.stringify(r.acceptanceCriteria).replace(/"/g,'&quot;')})">✓ Übernehmen</button>
          </div>` : ''}

          ${r.stakeholderGap ? `
          <div style="background:rgba(171,100,255,.08);border:1px solid rgba(171,100,255,.2);
            border-radius:var(--r);padding:8px 10px;margin-top:6px;font-size:11px">
            <span style="color:var(--ab);font-weight:600">👥 Stakeholder-Lücke: </span>${esc(r.stakeholderGap)}
          </div>` : ''}

          ${r.ieee830Issues?.filter(i=>i && i!=='...').length ? `
          <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);
            border-radius:var(--r);padding:8px 10px;margin-top:6px">
            <div style="font-size:10px;font-weight:600;color:var(--amb);margin-bottom:4px">📋 IEEE-830 Verstöße</div>
            ${r.ieee830Issues.map(i => `<div style="font-size:11px;padding:2px 0">• ${esc(i)}</div>`).join('')}
          </div>` : ''}

          ${r.improvedTitle || r.improvedDescription ? `
          <div class="qs-suggestion-box" style="margin-top:10px">
            <div class="qs-suggestion-label">✦ Vollständig verbesserte Anforderung</div>
            ${r.improvedTitle ? `<strong style="font-size:13px">${esc(r.improvedTitle)}</strong><br/>` : ''}
            ${r.improvedDescription ? `<span style="font-size:12px;color:var(--t2)">${esc(r.improvedDescription)}</span><br/>` : ''}
            <button class="btn-accept"
              onclick="acceptImprovedReq('${r.reqId}',${JSON.stringify(r.improvedTitle||'').replace(/"/g,'&quot;')},${JSON.stringify(r.improvedDescription||'').replace(/"/g,'&quot;')})">
              ✓ Verbesserte Version übernehmen
            </button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}`;
}

async function acceptQSSuggestion(reqId, suggestion) {
  const all = await window.api.getRequirements({});
  const req = all.find(r => r.id === reqId);
  if (!req) return;
  await window.api.saveRequirement({ ...req, description: suggestion });
  toast('✅ Vorschlag übernommen');
}

async function acceptAC(reqId, criteria) {
  const all = await window.api.getRequirements({});
  const req = all.find(r => r.id === reqId);
  if (!req) return;
  await window.api.saveRequirement({
    ...req,
    acceptance_criteria_text: Array.isArray(criteria) ? criteria.join('\n') : criteria,
  });
  toast('✅ Akzeptanzkriterien übernommen');
}

async function acceptImprovedReq(reqId, title, desc) {
  const all = await window.api.getRequirements({});
  const req = all.find(r => r.id === reqId);
  if (!req) return;
  const upd = { ...req };
  if (title) upd.title       = title;
  if (desc)  upd.description = desc;
  await window.api.saveRequirement(upd);
  toast('✅ Verbesserte Version übernommen');
}

window.loadBaQS           = loadBaQS;
window.runQS              = runQS;
window.acceptQSSuggestion = acceptQSSuggestion;
window.acceptAC           = acceptAC;
window.acceptImprovedReq  = acceptImprovedReq;
