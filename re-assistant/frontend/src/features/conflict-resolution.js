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
    const res = await fetch('/api/requirements', {
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
  const res = await callAPI([{ role:'user', content:
    `Führe zwei Versionen einer Anforderung zusammen. ${langNote()}
Behalte die wichtigsten Informationen aus beiden Versionen.
Antworte NUR mit JSON ohne Backticks:
{"title":"...","description":"...","priority":"medium","category":"...","rationale":"..."}

Server-Version:
Titel: ${serverVersion.title}
Beschreibung: ${serverVersion.description || ''}
Priorität: ${serverVersion.priority}

Eigene Version:
Titel: ${clientVersion.title}
Beschreibung: ${clientVersion.description || ''}
Priorität: ${clientVersion.priority}` }], langNote(), 600);

  if (!res.ok) throw new Error(res.text);
  const merged = JSON.parse(res.text.replace(/```json|```/g,'').trim());
  return { ...serverVersion, ...merged };
}

window.resolveConflict = resolveConflict;
window.mergeWithAI     = mergeWithAI;
