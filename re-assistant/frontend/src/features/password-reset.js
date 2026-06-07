'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/password-reset.js
 * Token-basierter Passwort-Reset — ohne Admin-Eingriff.
 * User fordert Reset an → Link per E-Mail oder vom Admin → neues Passwort setzen.
 */

// ── Login-Screen: "Passwort vergessen?" Link ──────────────────
function initPasswordReset() {
  // Link auf Login-Screen hinzufügen
  const loginBtn = $('login-btn');
  if (!loginBtn) return;

  const existing = document.getElementById('pw-reset-link');
  if (!existing) {
    const link = document.createElement('div');
    link.id = 'pw-reset-link';
    link.style.cssText = 'text-align:center;margin-top:10px';
    link.innerHTML = `<button onclick="openPasswordResetModal()"
      style="background:none;border:none;color:var(--aa);font-size:12px;cursor:pointer;text-decoration:underline;font-family:var(--font)">
      Passwort vergessen?
    </button>`;
    loginBtn.parentNode.insertBefore(link, loginBtn.nextSibling);
  }

  // URL-Hash prüfen für direkten Reset-Link
  checkResetTokenInURL();
}

// ── Hash-basierter Reset-Link ─────────────────────────────────
function checkResetTokenInURL() {
  const hash = window.location.hash;
  if (hash.startsWith('#reset-password?token=')) {
    const token = hash.split('token=')[1];
    if (token) openResetWithToken(token);
  }
}

// ── Schritt 1: E-Mail eingeben ────────────────────────────────
function openPasswordResetModal() {
  openModal('Passwort zurücksetzen', `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px;line-height:1.6">
      Geben Sie Ihre E-Mail-Adresse ein. Falls ein Account existiert, wird ein Reset-Link erstellt.
    </p>
    <div class="frow">
      <label>E-Mail</label>
      <input type="email" id="pr-email" placeholder="ihre@email.de" autofocus/>
    </div>
    <div id="pr-status" style="min-height:18px;font-size:12px;margin-top:6px"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" id="pr-submit-btn"
        onclick="submitPasswordReset()">Zurücksetzen</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);

  $('pr-email').onkeydown = e => { if (e.key === 'Enter') submitPasswordReset(); };
}

async function submitPasswordReset() {
  const email = $('pr-email')?.value.trim();
  if (!email) { $('pr-status').innerHTML = '<span style="color:var(--red)">⚠ E-Mail eingeben</span>'; return; }

  const btn = $('pr-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sende …';

  const res  = await fetch('/api/auth/request-reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();

  btn.disabled = false; btn.innerHTML = 'Zurücksetzen';

  if (data.emailSent) {
    $('pr-status').innerHTML = '<span style="color:var(--grn)">✅ Reset-Link wurde an Ihre E-Mail gesendet.</span>';
  } else if (data.resetUrl) {
    // Kein SMTP konfiguriert — Link anzeigen (nur wenn Admin)
    $('pr-status').innerHTML = `
      <div style="background:var(--ambbg);border-radius:var(--r);padding:10px;margin-top:6px">
        <div style="font-size:11px;font-weight:600;color:var(--amb);margin-bottom:6px">
          ⚠ Kein E-Mail-Server konfiguriert — Link manuell weitergeben:
        </div>
        <input type="text" value="${data.resetUrl}"
          style="width:100%;font-size:10px;font-family:var(--mono);padding:4px 6px;background:var(--s3);border:1px solid var(--b1);border-radius:4px;color:var(--t1)"
          onclick="this.select()" readonly/>
        <div style="font-size:10px;color:var(--t3);margin-top:4px">Gültig für 1 Stunde</div>
      </div>`;
  } else {
    $('pr-status').innerHTML = '<span style="color:var(--grn)">✅ Falls ein Account mit dieser E-Mail existiert, wurde ein Reset erstellt.</span>';
  }
}

// ── Schritt 2: Token validieren + neues Passwort setzen ───────
async function openResetWithToken(token) {
  // Token validieren
  const checkRes = await fetch(`/api/auth/reset-token/${token}`);
  const checkData = await checkRes.json();

  if (!checkData.ok) {
    openModal('Token ungültig', `
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:36px;margin-bottom:10px">⏱</div>
        <p style="font-size:14px;color:var(--t2)">Dieser Reset-Link ist abgelaufen oder ungültig.</p>
        <p style="font-size:12px;color:var(--t3);margin-top:6px">Links sind nur 1 Stunde gültig.</p>
        <button class="btn-primary" style="margin-top:14px" onclick="closeModal();openPasswordResetModal()">
          Neuen Link anfordern
        </button>
      </div>`);
    // Hash aus URL entfernen
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  openModal('Neues Passwort setzen', `
    <div style="background:var(--grnbg);border-radius:var(--r);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--grn)">
      ✓ Token gültig — Account: <strong>${checkData.email}</strong>
    </div>
    <div class="frow">
      <label>Neues Passwort</label>
      <div style="display:flex;gap:8px">
        <input type="password" id="pr-new-pw" placeholder="Mindestens 8 Zeichen" style="flex:1" autofocus/>
        <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
          onclick="toggleKeyVisibility('pr-new-pw','pr-pw-toggle')" id="pr-pw-toggle">👁</button>
      </div>
    </div>
    <div class="frow">
      <label>Passwort bestätigen</label>
      <input type="password" id="pr-new-pw2" placeholder="Wiederholen …"/>
    </div>
    <div id="pr-new-status" style="min-height:18px;font-size:12px;margin-top:6px"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" id="pr-new-btn"
        onclick="submitNewPassword('${token}')">Passwort ändern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);

  $('pr-new-pw').onkeydown = e => { if (e.key === 'Enter') $('pr-new-pw2').focus(); };
  $('pr-new-pw2').onkeydown = e => { if (e.key === 'Enter') submitNewPassword(token); };
}

async function submitNewPassword(token) {
  const pw  = $('pr-new-pw')?.value;
  const pw2 = $('pr-new-pw2')?.value;
  const statusEl = $('pr-new-status');

  if (!pw || pw.length < 8) { statusEl.innerHTML = '<span style="color:var(--red)">⚠ Mindestens 8 Zeichen</span>'; return; }
  if (pw !== pw2)            { statusEl.innerHTML = '<span style="color:var(--red)">⚠ Passwörter stimmen nicht überein</span>'; return; }

  const btn = $('pr-new-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';

  const res  = await fetch('/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: pw }),
  });
  const data = await res.json();

  btn.disabled = false; btn.innerHTML = 'Passwort ändern';

  if (data.ok) {
    // Hash aus URL entfernen
    history.replaceState(null, '', window.location.pathname);
    openModal('Passwort geändert', `
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:36px;margin-bottom:10px">✅</div>
        <p style="font-size:14px;font-weight:600">Passwort erfolgreich geändert!</p>
        <p style="font-size:13px;color:var(--t2);margin-top:6px">Sie können sich jetzt mit Ihrem neuen Passwort anmelden.</p>
        <button class="btn-primary" style="margin-top:14px;width:100%" onclick="closeModal()">
          Zum Login
        </button>
      </div>`);
  } else {
    statusEl.innerHTML = `<span style="color:var(--red)">❌ ${data.error || 'Fehler beim Zurücksetzen'}</span>`;
  }
}

// ── Admin: Reset-Link für User generieren ─────────────────────
async function adminGenerateResetLink(userId, userName) {
  const res  = await fetch(`/api/auth/admin-reset/${userId}`, {
    method: 'POST', credentials: 'include',
  });
  const data = await res.json();
  if (!data.ok) { toast('❌ ' + (data.error || 'Fehler')); return; }

  openModal(`🔑 Reset-Link: ${userName}`, `
    <p style="font-size:13px;color:var(--t2);margin-bottom:12px">
      Geben Sie diesen Link an <strong>${userName}</strong> weiter.
      Der Link ist <strong>1 Stunde</strong> gültig und kann nur einmal verwendet werden.
    </p>
    <div class="frow">
      <label>Reset-Link</label>
      <div style="display:flex;gap:8px">
        <input type="text" value="${data.resetUrl}" id="admin-reset-url"
          style="flex:1;font-size:11px;font-family:var(--mono)" onclick="this.select()" readonly/>
        <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
          onclick="navigator.clipboard.writeText($('admin-reset-url').value);toast('✅ Kopiert')">
          📋
        </button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:6px;padding:8px;background:var(--s2);border-radius:var(--r)">
      Token: <code style="font-size:10px;color:var(--aa)">${data.token.substring(0, 16)}…</code>
      &nbsp;·&nbsp; Gültig bis: ${new Date(Date.now() + 3600000).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })} Uhr
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-primary" style="flex:1"
        onclick="navigator.clipboard.writeText($('admin-reset-url').value);toast('✅ Link kopiert');closeModal()">
        📋 Kopieren & Schließen
      </button>
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
    </div>`);
}

// ── Init beim App-Start ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPasswordReset();
});

window.initPasswordReset      = initPasswordReset;
window.openPasswordResetModal = openPasswordResetModal;
window.submitPasswordReset    = submitPasswordReset;
window.openResetWithToken     = openResetWithToken;
window.submitNewPassword      = submitNewPassword;
window.adminGenerateResetLink = adminGenerateResetLink;
window.checkResetTokenInURL   = checkResetTokenInURL;
