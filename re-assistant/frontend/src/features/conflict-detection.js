'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/conflict-detection.js
 * KI-gestützte Konflikt-Erkennung — wird automatisch beim Speichern
 * einer Anforderung ausgelöst. Systemübergreifend bei verknüpften Systemen.
 */

let _conflictPanel = null;
let _conflictCount = 0;

// ── Nach dem Speichern: Konflikte prüfen ──────────────────────
async function checkConflictsAfterSave(reqId, systemId) {
  try {
    const res  = await fetch('api/conflicts/analyze', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, systemId, crossSystem: true }),
    });
    const data = await res.json();
    const conflicts = data.conflicts || [];

    if (conflicts.length > 0) {
      showConflictNotification(reqId, conflicts);
      updateConflictBadge();
    }
  } catch(e) {
    // Stiller Fehler — Konflikt-Check blockiert nie den Workflow
  }
}

// ── Notification Banner ───────────────────────────────────────
function showConflictNotification(reqId, conflicts) {
  const high   = conflicts.filter(c => c.severity === 'high').length;
  const medium = conflicts.filter(c => c.severity === 'medium').length;
  const total  = conflicts.length;

  // Existing Banner entfernen
  document.getElementById('conflict-notification')?.remove();

  const banner = document.createElement('div');
  banner.id = 'conflict-notification';
  banner.style.cssText = `
    position: fixed; bottom: 80px; right: 16px; z-index: 1500;
    background: ${high > 0 ? 'rgba(248,81,73,.12)' : 'rgba(227,179,65,.1)'};
    border: 1px solid ${high > 0 ? 'rgba(248,81,73,.4)' : 'rgba(227,179,65,.35)'};
    border-radius: var(--rl); padding: 12px 14px;
    font-size: 12px; color: var(--t1);
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
    max-width: 300px; animation: slideInRight .3s ease;
    cursor: pointer;
  `;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:16px">${high > 0 ? '⚠️' : '⚡'}</span>
      <strong>${total} Konflikt${total > 1 ? 'e' : ''} erkannt</strong>
      <button onclick="document.getElementById('conflict-notification').remove()"
        style="margin-left:auto;background:none;border:none;color:var(--t3);
        font-size:16px;cursor:pointer;padding:0 2px;line-height:1">×</button>
    </div>
    <div style="color:var(--t2);line-height:1.5;margin-bottom:8px">
      ${high > 0 ? `<span style="color:var(--red)">● ${high} kritisch</span>` : ''}
      ${medium > 0 ? `<span style="color:var(--amb)"> ● ${medium} mittel</span>` : ''}
    </div>
    <div style="display:flex;gap:6px">
      <button onclick="openConflictPanel('${reqId}')"
        style="flex:1;background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
        padding:5px 10px;font-size:11px;color:var(--t1);cursor:pointer">
        🔍 Anzeigen
      </button>
    </div>`;

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12000);
}

// ── Konflikt-Panel ────────────────────────────────────────────
async function openConflictPanel(filterReqId = null) {
  const systemId = S.activeSystemId || '';

  // Konflikte laden
  const url = 'api/conflicts' + (systemId ? `?systemId=${systemId}` : '');
  const res  = await fetch(url, { credentials: 'include' });
  const allConflicts = await res.json();

  const filtered = filterReqId
    ? allConflicts.filter(c => c.req_id_a === filterReqId || c.req_id_b === filterReqId)
    : allConflicts.filter(c => c.status === 'open');

  // Panel erstellen
  if (_conflictPanel) _conflictPanel.remove();
  _conflictPanel = document.createElement('div');
  _conflictPanel.id = 'conflict-panel';
  _conflictPanel.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.6);
    z-index: 2000; display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  const severityColor = { high: 'var(--red)', medium: 'var(--amb)', low: 'var(--t3)' };
  const typeLabel = { contradiction: 'Widerspruch', overlap: 'Überschneidung', ambiguity: 'Mehrdeutigkeit' };
  const typeIcon  = { contradiction: '⚡', overlap: '🔄', ambiguity: '❓' };

  _conflictPanel.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rxl);
      width:100%;max-width:700px;max-height:85vh;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(0,0,0,.5)">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;
        border-bottom:1px solid var(--b1);flex-shrink:0">
        <span style="font-size:20px">⚠️</span>
        <div>
          <div style="font-size:15px;font-weight:600">Konflikt-Erkennung</div>
          <div style="font-size:11px;color:var(--t3)">${filtered.length} offene Konflikte${filterReqId ? ' für diese Anforderung' : ''}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${!filterReqId ? `
          <button onclick="runManualConflictCheck()"
            style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
            padding:5px 12px;font-size:12px;color:var(--t1);cursor:pointer">
            ↺ Alle prüfen
          </button>` : ''}
          <button onclick="document.getElementById('conflict-panel').remove()"
            style="background:none;border:none;color:var(--t3);font-size:20px;cursor:pointer">×</button>
        </div>
      </div>

      <!-- Konflikte -->
      <div style="overflow-y:auto;flex:1;padding:12px">
        ${filtered.length === 0 ? `
          <div style="text-align:center;padding:40px 20px;color:var(--t3)">
            <div style="font-size:32px;margin-bottom:10px">✅</div>
            <div style="font-size:14px">Keine offenen Konflikte</div>
          </div>` :
          filtered.map(c => `
            <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--rl);
              padding:14px;margin-bottom:10px">

              <!-- Konflikt Header -->
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <span style="font-size:18px">${typeIcon[c.conflict_type] || '⚠'}</span>
                <span style="font-weight:600;font-size:13px">${typeLabel[c.conflict_type] || c.conflict_type}</span>
                <span style="font-size:10px;padding:2px 8px;border-radius:99px;
                  background:${c.severity==='high'?'var(--redbg)':c.severity==='medium'?'var(--ambbg)':'var(--s3)'};
                  color:${severityColor[c.severity]||'var(--t3)'}">
                  ${c.severity === 'high' ? '● Kritisch' : c.severity === 'medium' ? '● Mittel' : '● Niedrig'}
                </span>
                ${c.system_id_a !== c.system_id_b ? `
                  <span style="font-size:10px;color:var(--ba);background:var(--babg);
                    padding:2px 8px;border-radius:99px">🔗 Systemübergreifend</span>` : ''}
                <button onclick="resolveConflict('${c.id}')"
                  style="margin-left:auto;background:var(--grnbg);border:1px solid rgba(63,185,80,.3);
                  border-radius:var(--r);padding:3px 10px;font-size:11px;color:var(--grn);cursor:pointer">
                  ✓ Gelöst
                </button>
              </div>

              <!-- Beteiligte Anforderungen -->
              <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <div style="flex:1;min-width:120px;background:var(--s1);border-radius:var(--r);
                  padding:7px 10px;font-size:11px">
                  <div style="color:var(--t3);margin-bottom:3px">Anforderung A</div>
                  <code style="color:var(--aa)">${esc(c.req_id_a)}</code>
                </div>
                <div style="display:flex;align-items:center;color:var(--t3);font-size:18px">↔</div>
                <div style="flex:1;min-width:120px;background:var(--s1);border-radius:var(--r);
                  padding:7px 10px;font-size:11px">
                  <div style="color:var(--t3);margin-bottom:3px">Anforderung B</div>
                  <code style="color:var(--aa)">${esc(c.req_id_b)}</code>
                </div>
              </div>

              <!-- Beschreibung -->
              <div style="font-size:12px;color:var(--t2);margin-bottom:8px;line-height:1.5">
                ${esc(c.description)}
              </div>

              <!-- KI-Vorschlag -->
              ${c.ai_suggestion ? `
                <div style="background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.2);
                  border-radius:var(--r);padding:8px 10px;font-size:12px;color:var(--t2)">
                  <span style="color:var(--aa);font-weight:600">💡 Lösungsvorschlag:</span>
                  ${esc(c.ai_suggestion)}
                </div>` : ''}
            </div>`).join('')}
      </div>

      <!-- Footer -->
      <div style="padding:12px 20px;border-top:1px solid var(--b1);flex-shrink:0;
        display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:var(--t3)">
          ${allConflicts.filter(c=>c.status==='open').length} offene Konflikte insgesamt
        </span>
        <button onclick="document.getElementById('conflict-panel').remove()"
          style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
          padding:6px 16px;font-size:12px;color:var(--t1);cursor:pointer">
          Schließen
        </button>
      </div>
    </div>`;

  _conflictPanel.addEventListener('click', e => {
    if (e.target === _conflictPanel) _conflictPanel.remove();
  });
  document.body.appendChild(_conflictPanel);
}

// ── Konflikt als gelöst markieren ────────────────────────────
async function resolveConflict(conflictId) {
  await fetch(`api/conflicts/${conflictId}/resolve`, {
    method: 'POST', credentials: 'include',
  });
  toast('✅ Konflikt als gelöst markiert');
  updateConflictBadge();
  // Panel neu laden
  const panel = document.getElementById('conflict-panel');
  if (panel) openConflictPanel();
}

// ── Manueller Check aller Anforderungen ──────────────────────
async function runManualConflictCheck() {
  const systemId = S.activeSystemId || '';
  if (!systemId) { toast('⚠ Bitte zuerst ein System auswählen'); return; }

  const btn = document.querySelector('[onclick="runManualConflictCheck()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Prüfe …'; }

  try {
    const reqs = await window.api.getRequirements({ systemId });
    if (!reqs.length) { toast('Keine Anforderungen gefunden'); return; }

    let found = 0;
    for (const req of reqs.slice(0, 20)) { // Max 20 um API-Kosten zu begrenzen
      const res  = await fetch('api/conflicts/analyze', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.id, systemId, crossSystem: true }),
      });
      const data = await res.json();
      found += (data.conflicts || []).length;
    }

    toast(`✅ Prüfung abgeschlossen — ${found} Konflikte gefunden`);
    updateConflictBadge();
    openConflictPanel(); // Panel neu laden
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '↺ Alle prüfen'; }
  }
}

// ── Badge in der Sidebar aktualisieren ───────────────────────
async function updateConflictBadge() {
  try {
    const systemId = S.activeSystemId || '';
    const url = 'api/conflicts?status=open' + (systemId ? `&systemId=${systemId}` : '');
    const res  = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    _conflictCount = data.length || 0;

    // Badge in Titlebar oder Nav
    let badge = document.getElementById('conflict-badge');
    if (_conflictCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'conflict-badge';
        badge.style.cssText = `
          display:inline-flex;align-items:center;justify-content:center;
          min-width:18px;height:18px;padding:0 4px;
          background:var(--red);color:#fff;
          font-size:10px;font-weight:700;border-radius:99px;
          position:absolute;top:-4px;right:-4px;
        `;
        // An den Anforderungs-Nav-Button hängen
        const reqBtn = document.getElementById('nav-business-reqs') ||
                       document.getElementById('nav-ba-quality');
        if (reqBtn) {
          reqBtn.style.position = 'relative';
          reqBtn.appendChild(badge);
        }
      }
      badge.textContent = _conflictCount > 99 ? '99+' : _conflictCount;
    } else {
      badge?.remove();
    }
  } catch(e) {}
}

window.checkConflictsAfterSave = checkConflictsAfterSave;
window.openConflictPanel       = openConflictPanel;
window.resolveConflict         = resolveConflict;
window.runManualConflictCheck  = runManualConflictCheck;
window.updateConflictBadge     = updateConflictBadge;
