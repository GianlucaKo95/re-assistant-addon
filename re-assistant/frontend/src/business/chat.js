'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * business/chat.js
 * Business Chat — KI-gestütztes Prozess- und Anforderungs-Gespräch.
 */

async function loadBizChat() {
  // System-Sidebar aufbauen — hierarchisch mit Subdomains
  const sl = $('bc-system-list');
  sl.innerHTML = '';

  function renderSysBtn(sys, depth) {
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemId === sys.id ? ' active' : '');
    btn.style.paddingLeft = (12 + depth * 14) + 'px';
    btn.innerHTML = `
      ${depth > 0 ? `<span style="color:var(--t3);margin-right:4px;font-size:11px">└</span>` : ''}
      <span class="sys-dot"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(sys.name)}</span>
      ${depth > 0 ? `<span style="font-size:9px;color:var(--t3);flex-shrink:0;margin-left:4px">Sub</span>` : ''}`;
    btn.onclick = () => {
      // System-Wechsel: Chat-Kontext zurücksetzen
      if (S.activeSystemId !== sys.id) {
        S.chatHistory.bc = [];
        window._bcAttachments  = [];
        window._pendingAttachments = undefined;
        if (typeof clearAttachments === 'function') clearAttachments('bc');
      }
      S.activeSystemId = sys.id;
      loadBizChat();
    };
    sl.appendChild(btn);
    // Subdomains
    S.systems.filter(s => s.parentId === sys.id)
      .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0))
      .forEach(child => renderSysBtn(child, depth + 1));
  }

  // Root-Systeme zuerst
  S.systems.filter(s => !s.parentId)
    .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0))
    .forEach(sys => renderSysBtn(sys, 0));

  if (!S.activeSystemId && S.systems.length) S.activeSystemId = S.systems[0].id;

  // Input-Bindings
  const inp = $('bc-input');
  $('bc-send').onclick = sendBizChat;
  inp.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendBizChat(); } autoResize(inp); };
  inp.oninput   = () => autoResize(inp);
  $('bc-mic').onclick = () => toggleChatMic('bc-input', 'bc-mic');

  // Chips
  document.querySelectorAll('#bc-chips .chip').forEach(c =>
    c.onclick = () => { inp.value = c.dataset.p; sendBizChat(); }
  );

  // Datei-Upload initialisieren
  if (typeof initChatAttachments === 'function') initChatAttachments();
  // Unterhaltungsliste laden
  if (typeof loadConvList === 'function') loadConvList('bc');

  // Req-Pane Buttons
  $('bc-btn-extract').onclick   = extractFromConversation;
  $('bc-btn-dedup').onclick     = dedupSystem;
  $('bc-btn-add-manual').onclick = openInlineAdd;
  $('bc-btn-export-reqs').onclick = exportPaneReqs;
  $('bc-dedup-apply').onclick   = applyDedup;
  $('bc-dedup-dismiss').onclick = hideDedup;

  // Filter-Events
  ['bc-req-search','bc-req-filter-cat','bc-req-filter-pri'].forEach(id => {
    const el = $(id);
    if (el) el.oninput = renderReqPane;
  });

  // Begrüßung beim ersten Laden
  if (!$('bc-chat-msgs').children.length) {
    const sys = S.systems.find(s => s.id === S.activeSystemId);
    const docs = (sys?.docs || []).length;
    pushMsg('bc-chat-msgs', 'a',
      sys
        ? `Willkommen! System: **${sys.name}** (${docs} Dokument${docs !== 1 ? 'e' : ''}). Wie kann ich helfen?`
        : 'Kein System ausgewählt. Bitte links ein System wählen.');
  }

  await refreshReqPane();
}

async function sendBizChat() {
  // Stopp-Button anzeigen
  const stopBtn = document.getElementById('bc-stop');
  if (stopBtn) stopBtn.style.display = 'flex';
  const sendBtn = document.getElementById('bc-send');
  if (sendBtn) sendBtn.style.display = 'none';
  const inp  = $('bc-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  // Anhänge für diese Nachricht
  const bcAttachments = [...(window._bcAttachments || [])];
  window._pendingAttachments = bcAttachments.map(a => ({
    type: a.type, name: a.name, mime: a.mime,
    data: a.data || undefined,
    text: a.text || undefined,
  }));

  // User-Nachricht mit Anhang-Vorschau anzeigen
  const attachmentHtml = bcAttachments.length
    ? bcAttachments.map(a => a.type === 'image' && a.preview
        ? `<img src="${a.preview}" style="max-width:120px;max-height:80px;border-radius:6px;margin-top:4px;display:block"/>`
        : `<div style="font-size:11px;color:var(--t3);margin-top:2px">📎 ${esc(a.name)}</div>`
      ).join('')
    : '';

  pushMsg('bc-chat-msgs', 'u', text + (attachmentHtml ? '\n' + attachmentHtml : ''));
  S.chatHistory.bc.push({ role:'user', content: text });

  const typing = addTyping('bc-chat-msgs');
  const sys    = S.systems.find(s => s.id === S.activeSystemId);

  // Eigener Abort-Controller für RAG + Chat (deckt die GESAMTE Anfrage ab)
  if (window._chatAbortController) window._chatAbortController.abort();
  window._chatAbortController = new AbortController();
  const chatSignal = window._chatAbortController.signal;

  // RAG: semantische Suche nach relevanten Dokumenten-Passagen
  let ragCtx = '';
  try {
    ragCtx = (typeof buildRAGContext === 'function')
      ? await buildRAGContext(S.activeSystemId, text, chatSignal)
      : '';
  } catch(e) {
    if (e.name === 'AbortError' || chatSignal.aborted) {
      typing.remove();
      document.getElementById('bc-stop')?.style.setProperty('display','none');
      document.getElementById('bc-send')?.style.setProperty('display','flex');
      return;
    }
    ragCtx = '';
  }

  // Falls währenddessen abgebrochen wurde
  if (chatSignal.aborted) {
    typing.remove();
    document.getElementById('bc-stop')?.style.setProperty('display','none');
    document.getElementById('bc-send')?.style.setProperty('display','flex');
    return;
  }
  // RE-Kontext laden: Stakeholder, Use Cases, Qualitätsziele, bestehende Anforderungen
  let stakeholders = [], useCases = [], qualityGoals = [], boundaries = [];
  if (S.activeSystemId) {
    try {
      [stakeholders, useCases, qualityGoals, boundaries] = await Promise.all([
        fetch(`api/systems/${S.activeSystemId}/stakeholders`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
        fetch(`api/systems/${S.activeSystemId}/use-cases`,   {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
        fetch(`api/systems/${S.activeSystemId}/quality-goals`,{credentials:'include'}).then(r=>r.json()).catch(()=>[]),
        fetch(`api/systems/${S.activeSystemId}/boundaries`,  {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      ]);
    } catch(e) {}
  }

  const existingReqs = (S.requirements||[])
    .filter(r => r.systemId === S.activeSystemId)
    .slice(0, 40)
    .map(r => `- ${r.id} [${r.priority||'?'}][${r.category||'?'}]: ${r.title}${r.quality_score != null ? ` (Score: ${r.quality_score}/100)` : ''}`)
    .join('\n');

  const sysCtx = ragCtx
    ? `${ragCtx}\n\nWICHTIG: Stütze dich ausschließlich auf die oben bereitgestellte Dokumentation. Nenne konkrete Funktionen, Komponenten und Abläufe mit ihren exakten Namen aus den Quellen.`
    : (sys ? getCtx(sys, 12000) : '');

  // RE-Kontextblöcke aufbauen
  const stakeholderCtx = stakeholders.length
    ? '## Stakeholder\n' + stakeholders.map(s =>
        `- **${s.name}** (${s.role}, Einfluss: ${s.influence}): ${s.interests}`).join('\n')
    : '';

  const boundaryCtx = boundaries.length
    ? '## Systemgrenzen\n'
      + boundaries.filter(b=>b.type==='in_scope').map(b=>`✓ ${b.description}`).join('\n') + '\n'
      + boundaries.filter(b=>b.type==='out_of_scope').map(b=>`✗ ${b.description}`).join('\n') + '\n'
      + boundaries.filter(b=>b.type==='interface').map(b=>`⟷ ${b.description}`).join('\n')
    : '';

  const useCaseCtx = useCases.length
    ? '## Use Cases\n' + useCases.map(u =>
        `- **${u.title}** (Akteur: ${u.actor}): ${u.description}`).join('\n')
    : '';

  const qualityCtx = qualityGoals.length
    ? '## Qualitätsziele (ISO-25010)\n' + qualityGoals.map(g =>
        `- ${g.iso_char}: ${g.description}${g.target ? ' → Ziel: ' + g.target : ''}`).join('\n')
    : '';

  const reqCtx = existingReqs
    ? `## Bestehende Anforderungen (${(S.requirements||[]).filter(r=>r.systemId===S.activeSystemId).length})\n${existingReqs}`
    : '';

  const system = [
    `Du bist ein hochrangiger Requirements Engineer, Software-Architekt und Business-Analyst mit 20 Jahren Erfahrung. ${langNote()}`,

    sys ? [
      `## Analysiertes System: ${sys.name}`,
      sys.description ? `Beschreibung: ${sys.description}` : '',
      `Dokumentenumfang: ${(sys.docs||[]).length} Dateien`,
    ].filter(Boolean).join('\n') : 'Kein System ausgewählt.',

    stakeholderCtx,
    boundaryCtx,
    useCaseCtx,
    qualityCtx,
    reqCtx,
    sysCtx,

    `## Deine Aufgaben und Verhaltensregeln

Du analysierst das oben beschriebene System tiefgründig und lieferst präzise, fachlich hochwertige Antworten:

- **Systemüberblick**: Beschreibe Architektur, alle Hauptmodule, ihre Funktionen und das Zusammenspiel — vollständig und strukturiert. Keine Verallgemeinerungen.
- **Funktionsanalysen**: Erkläre konkrete Implementierungsdetails aus der Dokumentation, nenne Dateinamen, Funktionsnamen, Datenflüsse.
- **Anforderungsextraktion**: Formuliere Anforderungen nach dem Schema: "Das System MUSS/SOLL/KANN [konkrete Funktion]." Immer mit Priorität (hoch/mittel/niedrig) und Kategorie (funktional/nicht-funktional/Sicherheit/Performance).
- **Lückenanalyse**: Identifiziere fehlende Funktionen, Inkonsistenzen, unklare Schnittstellen und nicht-dokumentierte Bereiche. Sei kritisch und präzise.
- **Prozessmodellierung**: Beschreibe Abläufe schrittweise mit allen Beteiligten, Eingaben, Ausgaben und Ausnahmen.

## Qualitätsstandards

- Antworte immer strukturiert mit Überschriften, Listen und konkreten Beispielen
- Vermeide Floskeln wie "Das System bietet vielfältige Funktionen" — nenne stattdessen die Funktionen direkt beim Namen
- Bei Überblicksanfragen: vollständige Auflistung aller Module/Komponenten aus der Dokumentation, kein Auslassen
- Belege deine Aussagen mit konkreten Referenzen aus der Dokumentation (Dateinamen, Codebeispiele)
- Maximale Ausführlichkeit bei technischen Fragen — kurze, prägnante Antworten nur wenn explizit gewünscht`,
  ].filter(Boolean).join('\n\n');

  const res = await callAPI(S.chatHistory.bc, system, 4000);
  typing.remove();

  // Stopp-/Send-Button zurücksetzen
  document.getElementById('bc-stop')?.style.setProperty('display','none');
  document.getElementById('bc-send')?.style.setProperty('display','flex');

  if (res._aborted) {
    return; // Abgebrochen — keine leere Nachricht anzeigen
  }

  const reply = res.ok ? res.text : `❌ ${res.text}`;
  pushMsg('bc-chat-msgs', 'a', reply);

  // Anhänge leeren nach dem Senden
  window._pendingAttachments = undefined;
  if (typeof clearAttachments === 'function') clearAttachments('bc');

  if (res.ok) {
    S.chatHistory.bc.push({ role:'assistant', content:reply });
    if (S.chatHistory.bc.length > 40) {
      // Ältere Nachrichten zusammenfassen statt löschen
      compressHistory('bc').catch(() => {
        S.chatHistory.bc = S.chatHistory.bc.slice(-40);
      });
    }
    if (typeof scheduleConvAutoSave === 'function') scheduleConvAutoSave('bc');

    // Prüfe ob die Antwort Anforderungen enthält — zeige dann inline "Anforderungen erstellen" Button
    if (S.activeSystemId && containsRequirements(reply)) {
      appendExtractButton('bc-chat-msgs', reply);
    }
  }
}

// Heuristik: enthält die Antwort Anforderungen?
function containsRequirements(text) {
  const patterns = [
    /das system (muss|soll|kann|sollte)/gi,
    /anforderung[en]?\s*:/gi,
    /(REQ|FA|NFA|UC)-?\d+/gi,
    /- \*\*(funktional|nicht.funktional|sicherheit|performance)/gi,
    /priorität[:\s]*(hoch|mittel|niedrig)/gi,
    /\[(hoch|mittel|niedrig)\]/gi,
    /\*\*req|req-\d+/gi,
  ];
  return patterns.some(p => p.test(text));
}

// Fügt nach der letzten KI-Nachricht einen "Anforderungen erstellen"-Button ein
function appendExtractButton(containerId, reply) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Alten Button entfernen falls vorhanden
  container.querySelectorAll('.inline-extract-btn').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'inline-extract-btn';
  wrap.style.cssText = 'display:flex;justify-content:flex-end;padding:4px 12px 8px;';

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.cssText = 'font-size:12px;padding:6px 14px;display:flex;align-items:center;gap:6px';
  btn.innerHTML = '📋 Anforderungen aus dieser Antwort erstellen';
  btn.onclick = () => previewAndCreateRequirements(reply, wrap);

  wrap.appendChild(btn);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

// Extrahiert und zeigt Vorschau — User muss bestätigen
async function previewAndCreateRequirements(reply, btnWrap) {
  if (!S.activeSystemId) { toast('⚠ System auswählen'); return; }
  const btn = btnWrap?.querySelector('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Extrahiere…'; }

  const existing = S.requirements
    .filter(r => r.systemId === S.activeSystemId)
    .map(r => r.title).join(', ');

  // Stakeholder als zusätzlichen Kontext laden
  let shCtx = '';
  try {
    const shs = await fetch(`api/systems/${S.activeSystemId}/stakeholders`,{credentials:'include'}).then(r=>r.json()).catch(()=>[]);
    if (shs.length) shCtx = 'Bekannte Stakeholder: ' + shs.map(s => s.name + ' (' + s.role + ')').join(', ') + '\n\n';
  } catch(e) {}

  const schema = '[{"title":"Verb + Objekt (max 80 Zeichen)","description":"Vollständig und messbar",'
    + '"category":"Funktional|Nicht-Funktional|Sicherheit|Performance|Schnittstelle|Qualität",'
    + '"priority":"high|medium|low","rationale":"Warum wichtig?",'
    + '"acceptance_criteria_text":"Gegeben...Wenn...Dann...",'
    + '"verification_method":"Test|Inspektion|Review|Analyse",'
    + '"iso_category":"Funktionale Eignung|Leistungseffizienz|Sicherheit|Wartbarkeit",'
    + '"risk_level":"hoch|mittel|niedrig","business_value":5}]';

  const res = await callAPI([{ role:'user', content:
    'Du bist CPRE-zertifizierter Requirements Engineer. Extrahiere ALLE Anforderungen aus dem folgenden Text.\n\n'
    + shCtx
    + 'NICHT DUPLIZIEREN: ' + (existing || '(keine)') + '\n\n'
    + 'TEXT:\n' + reply + '\n\n'
    + 'REGELN: Eindeutig, testbar, mit Akzeptanzkriterien (Gegeben/Wenn/Dann), IEEE-830 Kategorie.\n\n'
    + 'JSON-Array (keine Backticks):\n' + schema
    + '\nWenn keine Anforderungen: []' }],
    '', 3000);

  if (btn) { btn.disabled = false; btn.innerHTML = '📋 Anforderungen aus dieser Antwort erstellen'; }

  if (!res.ok) { toast('❌ ' + res.text); return; }

  let reqs;
  try {
    let raw = res.text.trim();

    // 1. Backtick-Codeblöcke entfernen (```json ... ``` oder ``` ... ```)
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 2. Führenden/nachfolgenden Nicht-JSON-Text abschneiden
    // Suche nach dem ersten [ und letzten ] im Text
    const firstBracket = raw.indexOf('[');
    const lastBracket  = raw.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      raw = raw.substring(firstBracket, lastBracket + 1);
    }

    // 3. Häufige Groq/Llama-Fehler beheben
    // Trailing commas: [{"a":1,}] → [{"a":1}]
    raw = raw.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    // Einfache durch doppelte Anführungszeichen (wenn nötig)
    // Nur wenn das JSON noch nicht valide ist
    
    reqs = JSON.parse(raw);

    // Sicherstellen dass es ein Array ist
    if (!Array.isArray(reqs)) {
      // Manchmal gibt die KI ein Objekt mit einem Array zurück: {"requirements": [...]}
      reqs = reqs.requirements || reqs.data || reqs.items || Object.values(reqs)[0] || [];
    }
  } catch(e) {
    // Letzter Versuch: Extrahiere JSON aus dem Text mit RegExp
    try {
      const jsonMatch = res.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        reqs = JSON.parse(jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
      } else {
        console.error('Parse-Fehler:', res.text.substring(0, 500));
        toast('❌ KI-Antwort konnte nicht als Anforderungsliste gelesen werden. Antwort: ' + res.text.substring(0, 100));
        return;
      }
    } catch(e2) {
      console.error('Parse-Fehler (2):', res.text.substring(0, 500));
      toast('❌ Konnte Anforderungen nicht parsen — KI antwortete: ' + res.text.substring(0, 80));
      return;
    }
  }

  if (!reqs?.length) { toast('ℹ Keine klaren Anforderungen erkannt'); return; }

  // Bestätigungs-Modal mit Vorschau
  const preview = reqs.map((r, i) => `
    <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
      padding:10px 12px;display:flex;gap:10px;align-items:flex-start">
      <input type="checkbox" id="req-cb-${i}" checked
        style="width:15px;height:15px;accent-color:var(--aa);flex-shrink:0;margin-top:2px"/>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${esc(r.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(r.description||'')}</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <span style="font-size:10px;background:var(--s3);padding:1px 7px;border-radius:99px">
            ${esc(r.category||'Funktional')}</span>
          <span style="font-size:10px;background:var(--s3);padding:1px 7px;border-radius:99px">
            ${esc(r.priority||'medium')}</span>
        </div>
      </div>
    </div>`).join('');

  openModal(`${reqs.length} Anforderung(en) erstellen?`, `
    <p style="font-size:12px;color:var(--t3);margin-bottom:12px">
      Wähle die Anforderungen aus die du übernehmen möchtest:</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${preview}
    </div>
    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="confirmCreateRequirements(${JSON.stringify(reqs).replace(/"/g,'&quot;')})">
        ✅ Ausgewählte erstellen
      </button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

// Erstellt die bestätigten Anforderungen
async function confirmCreateRequirements(reqs) {
  const checked = reqs.filter((_, i) =>
    document.getElementById(`req-cb-${i}`)?.checked
  );
  if (!checked.length) { toast('⚠ Keine ausgewählt'); return; }

  closeModal();
  let created = 0;
  for (const r of checked) {
    try {
      await window.api.saveRequirement({
        ...r,
        id:            'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        systemId:      S.activeSystemId,
        createdBy:     S.user.id,
        createdByName: S.user.name,
        status:        'open',
        tags:          r.tags || [],
      });
      created++;
      await new Promise(r => setTimeout(r, 50)); // kurze Pause zwischen Saves
    } catch(e) { console.error('Req save error:', e); }
  }
  toast(`✅ ${created} Anforderung(en) erstellt`);
  if (typeof refreshReqPane === 'function') await refreshReqPane();

  // Backlog automatisch aktualisieren
  if (created > 0 && typeof scheduleAutoEpicUpdate === 'function') {
    scheduleAutoEpicUpdate(S.activeSystemId);
  }

  // Button entfernen nach Erstellung
  document.querySelectorAll('.inline-extract-btn').forEach(el => el.remove());
}

window.previewAndCreateRequirements = previewAndCreateRequirements;
window.confirmCreateRequirements    = confirmCreateRequirements;


window.loadBizChat  = loadBizChat;
window.sendBizChat  = sendBizChat;
