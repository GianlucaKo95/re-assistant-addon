'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * admin/license.js
 * Lizenz-Verwaltung für On-Premise-Deployments.
 */

async function loadAdminLicense() {
  const wrap = $('view-admin-license');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-pulse" style="padding:40px;text-align:center">Lade …</div>';
  try {
    const lic = await window.api.getLicenseStatus();
    renderLicenseView(lic);
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler beim Laden</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderLicenseView(lic) {
  const wrap = $('view-admin-license');

  const STATUS_LABELS = {
    valid:            { label:'Aktiv',             cls:'status-active'   },
    unlicensed:       { label:'Nicht lizenziert',  cls:'status-warn'     },
    expired:          { label:'Abgelaufen',         cls:'status-error'    },
    grace:            { label:'Kulanzzeitraum',     cls:'status-warn'     },
    locked:           { label:'Gesperrt',           cls:'status-error'    },
    invalid:          { label:'Ungültig',           cls:'status-error'    },
    hardware_mismatch:{ label:'Hardware-Konflikt',  cls:'status-error'    },
  };
  const st = STATUS_LABELS[lic.status] || { label: lic.status, cls:'status-warn' };

  const expiry = lic.expiresAt
    ? new Date(lic.expiresAt).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })
    : 'Unbegrenzt';

  const graceNote = lic.status === 'grace' && lic.graceDaysLeft != null
    ? `<div class="info-banner warn">Hardware-Fingerprint hat sich geändert. Noch <strong>${lic.graceDaysLeft} Tag(e)</strong> verbleibend — bitte Lizenz erneuern.</div>`
    : '';

  const lockedNote = lic.status === 'locked'
    ? `<div class="info-banner error">Kulanzzeitraum abgelaufen. Die Anwendung ist eingeschränkt. Bitte neuen Lizenzschlüssel aktivieren.</div>`
    : '';

  wrap.innerHTML = `
    <div class="view-header">
      <h2>Lizenz</h2>
    </div>

    ${graceNote}${lockedNote}

    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div style="font-size:28px">${licenseIcon(lic.status)}</div>
        <div>
          <div style="font-size:18px;font-weight:600">${st.label}</div>
          ${lic.customer ? `<div style="color:var(--t2);font-size:13px">${esc(lic.customer)}</div>` : ''}
        </div>
        <span class="sbadge ${st.cls}" style="margin-left:auto">${st.label}</span>
      </div>

      <table class="data-table" style="margin-bottom:0">
        <tbody>
          <tr><td style="color:var(--t2);width:160px">Kunde</td><td>${esc(lic.customer || '—')}</td></tr>
          <tr><td style="color:var(--t2)">Gültig bis</td><td>${expiry}</td></tr>
          <tr><td style="color:var(--t2)">Seats</td><td>${lic.seats || 1}</td></tr>
          <tr>
            <td style="color:var(--t2)">Hardware-Fingerprint</td>
            <td>
              <code id="fp-code" style="font-size:12px;background:var(--s2);padding:2px 8px;border-radius:4px;cursor:pointer"
                title="Klicken zum Kopieren" onclick="copyFingerprint()">${esc(lic.fingerprint || '—')}</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 style="margin:0 0 14px">Lizenzschlüssel ${lic.status === 'valid' ? 'erneuern' : 'aktivieren'}</h3>
      <p style="color:var(--t2);font-size:13px;margin-bottom:14px">
        Den Hardware-Fingerprint (oben) an Ihren Lizenzgeber schicken, um einen passenden Schlüssel zu erhalten.
      </p>
      <div style="display:flex;gap:10px;align-items:flex-start">
        <textarea id="lic-key-input" rows="3"
          placeholder="RE-eyJ…"
          style="flex:1;font-family:var(--mono);font-size:12px;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--b1);background:var(--s1);color:var(--t1)"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn-primary" onclick="activateLicenseKey()">Aktivieren</button>
        ${lic.status === 'valid' ? '<button class="btn-danger" style="font-size:12px" onclick="removeLicenseKey()">Lizenz entfernen</button>' : ''}
      </div>
      <div id="lic-result" style="margin-top:12px;font-size:13px"></div>
    </div>`;
}

function licenseIcon(status) {
  const icons = {
    valid:      '✅',
    unlicensed: '🔓',
    expired:    '⏰',
    grace:      '⚠️',
    locked:     '🔒',
    invalid:    '❌',
  };
  return icons[status] || '❓';
}

async function copyFingerprint() {
  const el = $('fp-code');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent.trim());
    const orig = el.textContent;
    el.textContent = 'Kopiert!';
    setTimeout(() => { el.textContent = orig; }, 1500);
  } catch(e) { /* clipboard not available */ }
}

async function activateLicenseKey() {
  const key  = ($('lic-key-input')?.value || '').trim();
  const res  = $('lic-result');
  if (!key) { if (res) res.innerHTML = '<span style="color:var(--error)">Bitte Schlüssel eingeben.</span>'; return; }
  if (res) res.innerHTML = '<span style="color:var(--t2)">Prüfe …</span>';
  try {
    const r = await window.api.activateLicense(key);
    if (r.ok) {
      if (res) res.innerHTML = '<span style="color:var(--success)">Lizenz erfolgreich aktiviert.</span>';
      setTimeout(() => loadAdminLicense(), 1200);
    } else {
      if (res) res.innerHTML = `<span style="color:var(--error)">${esc(r.error || 'Aktivierung fehlgeschlagen')}</span>`;
    }
  } catch(e) {
    if (res) res.innerHTML = `<span style="color:var(--error)">${esc(e.message)}</span>`;
  }
}

async function removeLicenseKey() {
  if (!confirm('Lizenz wirklich entfernen?')) return;
  try {
    await window.api.removeLicense();
    loadAdminLicense();
  } catch(e) {
    alert('Fehler: ' + e.message);
  }
}

window.loadAdminLicense   = loadAdminLicense;
window.copyFingerprint    = copyFingerprint;
window.activateLicenseKey = activateLicenseKey;
window.removeLicenseKey   = removeLicenseKey;
