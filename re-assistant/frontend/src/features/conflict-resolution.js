'use strict';
/**
 * features/conflict-resolution.js
 * A: Optimistic Locking — Konflikt-Erkennung und -Auflösung.
 * Verhindert dass zwei User dieselbe Anforderung gleichzeitig überschreiben.
 */

/**
 * Wraps window.api.saveRequirement mit Konflikt-Erkennung.
 * Wird beim Speichern immer aufgerufen.
 */
const _origSaveReq = window.api.saveRequirement.bind(window.api);
window.api.saveRequirement = async function(req) {
  // _expectedUpdatedAt mitschicken damit Backend Konflikte erkennt
  const payload = { ...req };
  if (req.updatedAt) payload._expectedUpdatedAt = req.updatedAt;

  try {
    const res = await fetch('api/requirements', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.status === 409 && data.conflict) {
      // Konflikt! User entscheiden lassen
      return await resolveConflict(data);
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch(e) {
    if (e.message?.includes('conflict')) throw e;
    throw new Error('Speichern fehlgeschlagen: ' + e.message);
  }
};

/**
 * Zeigt Konflikt-Dialog und lässt User entscheiden.
 */
function resolveConflict(conflictData) {
  return new Promise((resolve, reject) => {
    const { serverVersion: sv, clientVersion: cv, changedBy, changedAt } = conflictData;
    const when = new Date(changedAt).toLocaleString('de-DE');

    openModal('⚠ Bearbeitungskonflikt', `
      <div style="background:var(--ambbg);border:1px solid rgba(251,191,36,.3);border-radius:var(--r);padding:10px 13px;margin-bottom:14px;font-size:12px;color:var(--amb)">
        <strong>${esc(changedBy)}</strong> hat diese Anforderung um ${esc(when)} geändert,
        während Sie sie ebenfalls bearbeitet haben. Welche Version soll gespeichert werden?
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <!-- Server-Version -->
        <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:12px">
          <div style="font-size:10px;font-weight:700;color:var(--blue);text-transform:uppercase;margin-bottom:8px">
            🌐 Server-Version (${esc(changedBy)})
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(sv.title)}</div>
          <div style="font-size:11px;color:var(--t2);line-height:1.5">${esc((sv.description||'').substring(0,120))}</div>
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
            <span class="sbadge p-${sv.priority}">${priLabel(sv.priority)}</span>
            <span class="rtag" style="font-size:9px">${esc(sv.category||'')}</span>
          </div>
        </div>

        <!-- Eigene Version -->
        <div style="background:var(--s1);border:1px solid rgba(168,85,247,.3);border-radius:var(--r);padding:12px">
          <div style="font-size:10px;font-weight:700;color:var(--aa);text-transform:uppercase;margin-bottom:8px">
            ✏ Ihre Version
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(cv.title)}</div>
          <div style="font-size:11px;color:var(--t2);line-height:1.5">${esc((cv.description||'').substring(0,120))}</div>
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
            <span class="sbadge p-${cv.priority}">${priLabel(cv.priority)}</span>
            <span class="rtag" style="font-size:9px">${esc(cv.category||'')}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-secondary" style="flex:1" id="cr-keep-server">
          🌐 Server-Version behalten
        </button>
        <button class="btn-primary" style="flex:1" id="cr-keep-mine">
          ✏ Meine Version erzwingen
        </button>
        <button class="btn-secondary" style="flex:1" id="cr-merge">
          ✦ KI zusammenführen
        </button>
      </div>
      <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeModal()">
        Abbrechen
      </button>`);

    // Server-Version behalten
    document.getElementById('cr-keep-server').onclick = () => {
      closeModal();
      resolve({ ok: true, kept: 'server' });
    };

    // Eigene Version erzwingen (ohne _expectedUpdatedAt → überschreibt immer)
    document.getElementById('cr-keep-mine').onclick = async () => {
      closeModal();
      const { _expectedUpdatedAt, ...forcePayload } = cv;
      // updatedAt auf Server-Wert setzen damit Locking-Check überspringt
      forcePayload.updatedAt = sv.updatedAt;
      try {
        const result = await _origSaveReq(forcePayload);
        resolve(result);
      } catch(e) { reject(e); }
    };

    // KI-Zusammenführung
    document.getElementById('cr-merge').onclick = async () => {
      document.getElementById('cr-merge').innerHTML = '<span class="spin"></span>';
      document.getElementById('cr-merge').disabled = true;
      try {
        const merged = await mergeWithAI(sv, cv);
        closeModal();
        // Merged Version ohne Locking-Check speichern
        merged.updatedAt = sv.updatedAt;
        const result = await _origSaveReq(merged);
        toast('✅ Versionen zusammengeführt');
        resolve(result);
      } catch(e) {
        toast('❌ KI-Zusammenführung fehlgeschlagen');
        reject(e);
      }
    };
  });
}

async function mergeWithAI(serverVersion, clientVersion) {
  // RAG-Kontext für bessere Zusammenführung (kennt den tatsächlichen Code)
  let ragCtx = '';
  try {
    if (typeof getRAGContextForQuery === 'function' && S.activeSystemId) {
      ragCtx = await getRAGContextForQuery(
        S.activeSystemId,
        serverVersion.title + ' ' + (serverVersion.description || ''),
        { role: 'normal' }
      );
    }
  } catch(e) {}

  const schema = '{"title":"...","description":"vollständig und messbar","priority":"high|medium|low","category":"...","rationale":"...","acceptance_criteria_text":"Gegeben...Wenn...Dann..."}';

  const prompt = 'Du bist CPRE-zertifizierter Requirements Engineer. '
    + 'Führe zwei Versionen einer Anforderung zusammen nach IEEE-830. '
    + langNote() + '\n\n'
    + 'REGELN: Behalte die präzisere Formulierung, merge Akzeptanzkriterien, keine Information verlieren.\n\n'
    + (ragCtx ? 'IMPLEMENTIERUNGSKONTEXT (für inhaltliche Genauigkeit):\n' + ragCtx.substring(0, 3000) + '\n\n' : '')
    + 'SERVER-VERSION:\n'
    + 'Titel: ' + serverVersion.title + '\n'
    + 'Beschreibung: ' + (serverVersion.description || '') + '\n'
    + 'Akzeptanzkriterien: ' + (serverVersion.acceptance_criteria_text || '') + '\n'
    + 'Priorität: ' + serverVersion.priority + '\n\n'
    + 'EIGENE VERSION:\n'
    + 'Titel: ' + clientVersion.title + '\n'
    + 'Beschreibung: ' + (clientVersion.description || '') + '\n'
    + 'Akzeptanzkriterien: ' + (clientVersion.acceptance_criteria_text || '') + '\n'
    + 'Priorität: ' + clientVersion.priority + '\n\n'
    + 'Antworte NUR mit JSON ohne Backticks:\n' + schema;

  const res = await callAPI([{ role:'user', content: prompt }],
    'Du bist CPRE-zertifizierter Requirements Engineer.', 1500);

  if (!res.ok) throw new Error(res.text);
  const merged = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
  return { ...serverVersion, ...merged };
}

window.resolveConflict = resolveConflict;
window.mergeWithAI     = mergeWithAI;
