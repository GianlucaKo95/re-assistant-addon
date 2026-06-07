'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * core/auth.js
 * Login, Session-Persistenz, App-Initialisierung, Settings.
 */

// ── Boot ──────────────────────────────────────────────────────
(async function boot() {
  $('login-btn').onclick = doLogin;
  $('l-pass').onkeydown  = e => { if (e.key === 'Enter') doLogin(); };
  $('app-ver').textContent = await window.api.getAppVersion().catch(() => '2.0.0');
  S.settings = await window.api.loadSettings();
  applySettingsToForm();
  populateVoices();

  // 🔴 FIX 1: Session-Persistenz — beim Reload prüfen ob Session noch aktiv
  await checkExistingSession();
})();

async function checkExistingSession() {
  try {
    const user = await window.api.getMe();
    if (user && user.id) {
      S.user = user;
      $('login-screen').style.display = 'none';
      $('app-screen').style.display   = 'flex';
      await initApp();
    }
  } catch(e) {
    // Keine aktive Session — Login-Screen bleibt sichtbar
  }
}

async function doLogin() {
  const email = $('l-email').value.trim();
  const pass  = $('l-pass').value;
  $('login-error').textContent = '';
  const btn = $('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Anmelden …';

  try {
    const res = await window.api.login({ email, password: pass });
    if (!res.ok) {
      $('login-error').textContent = res.error || 'Login fehlgeschlagen.';
      return;
    }
    S.user = res.user;
    $('login-screen').style.display = 'none';
    $('app-screen').style.display   = 'flex';
    await initApp();
  } catch(e) {
    $('login-error').textContent = 'Server nicht erreichbar. Bitte prüfen Sie die Verbindung.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Anmelden';
  }
}

async function doLogout() {
  try { await window.api.logout(); } catch(e) {}
  S.user = null;
  Object.keys(S.chatHistory).forEach(k => S.chatHistory[k] = []);
  $('app-screen').style.display   = 'none';
  $('login-screen').style.display = 'flex';
  $('l-pass').value = '';
  $('login-error').textContent = '';
}

async function initApp() {
  // Titlebar
  $('user-avatar').textContent     = S.user.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  $('user-name-label').textContent = S.user.name;
  const rb = $('user-role-badge');
  rb.textContent = roleLabel(S.user.role);
  rb.className   = `rb-${S.user.role}`;

  $('btn-logout').onclick = doLogout;
  $('btn-settings-nav').onclick = () => switchView('settings');

  // Export-Buttons PM-Header
  $('btn-export-pm-md')?.addEventListener('click', async () => {
    const r = await window.api.getRequirements({ systemId: S.pmActiveSystemId });
    await window.api.exportMarkdown({ requirements: r, stories: [], projectName: 'PM-Export' });
    toast('✅ Exportiert');
  });
  $('btn-export-pm-csv')?.addEventListener('click', async () => {
    const r = await window.api.getRequirements({ systemId: S.pmActiveSystemId });
    await window.api.exportCSV({ requirements: r });
    toast('✅ CSV exportiert');
  });

  // Daten laden
  S.systems = await window.api.getSystems();
  if (['admin','projectmanager'].includes(S.user.role)) {
    S.users = await window.api.getUsers().catch(() => []);
  }

  buildNav();
  initNotifications();
  if (typeof initAuditHooks === 'function') initAuditHooks();
  if (typeof updatePersonaBadge === 'function') updatePersonaBadge();
  // Onboarding-Check nach Login
  if (typeof checkAndShowOnboarding === 'function') await checkAndShowOnboarding();
  if (typeof checkResetTokenInURL === 'function') checkResetTokenInURL();
  if (typeof renderPersonaSelector === 'function') renderPersonaSelector('persona-selector-wrap');
  if (typeof updateTasksBadge === 'function') updateTasksBadge();

  const defaultView = {
    admin: 'admin-users', business: 'business-chat',
    businessanalyst: 'ba-dashboard', projectmanager: 'pm-dashboard', developer: 'dev-work',
  };
  switchView(defaultView[S.user.role] || 'settings');
}

// ── Settings ──────────────────────────────────────────────────
function applySettingsToForm() {
  setVal('cfg-apikey',     S.settings.apiKey    || '');
  setVal('cfg-model',      S.settings.model);
  setVal('cfg-lang',       S.settings.language);
  setVal('cfg-detail',     S.settings.detail);
  setVal('cfg-persona',    S.settings.persona   || 'professional');
  setVal('cfg-jira-url',   S.settings.jiraUrl   || '');
  setVal('cfg-jira-email', S.settings.jiraEmail || '');
  setVal('cfg-jira-token', S.settings.jiraToken || '');
}

async function saveCfg() {
  S.settings.apiKey    = $('cfg-apikey').value.trim();
  S.settings.model     = $('cfg-model').value;
  S.settings.language  = $('cfg-lang').value;
  S.settings.detail    = $('cfg-detail').value;
  S.settings.persona   = $('cfg-persona').value;
  S.settings.voiceURI  = $('cfg-voice').value;
  S.settings.jiraUrl   = $('cfg-jira-url').value.trim();
  S.settings.jiraEmail = $('cfg-jira-email').value.trim();
  S.settings.jiraToken = $('cfg-jira-token').value.trim();
  await window.api.saveSettings(S.settings);
  $('cfg-msg').textContent = '✅ Gespeichert.';
  setTimeout(() => $('cfg-msg').textContent = '', 3000);
  if (typeof updatePersonaBadge === 'function') updatePersonaBadge();
  if (typeof renderPersonaSelector === 'function') renderPersonaSelector('persona-selector-wrap');
}

// 🔴 FIX 3: Passwort ändern (eigenes)
function openChangePasswordModal() {
  openModal('Passwort ändern', `
    <div class="frow"><label>Aktuelles Passwort</label>
      <input type="password" id="pw-old" placeholder="Aktuelles Passwort"/></div>
    <div class="frow"><label>Neues Passwort</label>
      <input type="password" id="pw-new" placeholder="Mindestens 8 Zeichen"/></div>
    <div class="frow"><label>Neues Passwort bestätigen</label>
      <input type="password" id="pw-new2" placeholder="Wiederholen …"/></div>
    <div id="pw-error" style="color:var(--red);font-size:12px;min-height:18px"></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="submitChangePassword()">Ändern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function submitChangePassword() {
  const oldPw  = $('pw-old').value;
  const newPw  = $('pw-new').value;
  const newPw2 = $('pw-new2').value;
  const errEl  = $('pw-error');
  errEl.textContent = '';

  if (!oldPw || !newPw) { errEl.textContent = 'Alle Felder ausfüllen.'; return; }
  if (newPw.length < 8)  { errEl.textContent = 'Mindestens 8 Zeichen.'; return; }
  if (newPw !== newPw2)  { errEl.textContent = 'Passwörter stimmen nicht überein.'; return; }

  // Aktuelles Passwort prüfen via Login
  const check = await window.api.login({ email: S.user.email, password: oldPw });
  if (!check.ok) { errEl.textContent = 'Aktuelles Passwort falsch.'; return; }

  await window.api.saveUser({ ...S.user, password: newPw });
  closeModal();
  toast('✅ Passwort geändert');
}

function populateVoices() {
  const fill = () => {
    const voices = window.speechSynthesis?.getVoices() || [];
    const sel    = $('cfg-voice');
    if (!sel) return;
    const lc   = S.settings.language || 'de';
    const rel  = voices.filter(v => v.lang.toLowerCase().startsWith(lc));
    const rest = voices.filter(v => !v.lang.toLowerCase().startsWith(lc));
    sel.innerHTML =
      '<option value="">Standard</option>' +
      (rel.length  ? `<optgroup label="${lc==='de'?'Deutsch':'English'}">${rel.map(v=>`<option value="${esc(v.voiceURI)}"${v.voiceURI===S.settings.voiceURI?' selected':''}>${esc(v.name)}</option>`).join('')}</optgroup>` : '') +
      (rest.length ? `<optgroup label="Andere">${rest.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('')}</optgroup>` : '');
  };
  if (window.speechSynthesis) { fill(); window.speechSynthesis.onvoiceschanged = fill; }
}

document.addEventListener('DOMContentLoaded', () => {
  $('cfg-toggle')?.addEventListener('click', () => {
    const i = $('cfg-apikey');
    i.type = i.type === 'password' ? 'text' : 'password';
    $('cfg-toggle').textContent = i.type === 'password' ? 'Anzeigen' : 'Verbergen';
  });
  $('btn-save-cfg')?.addEventListener('click', saveCfg);
  $('btn-docs')?.addEventListener('click', () => window.api.openExternal('https://docs.anthropic.com'));
  $('btn-change-pw')?.addEventListener('click', openChangePasswordModal);
});

window.doLogin                  = doLogin;
window.doLogout                 = doLogout;
window.checkExistingSession     = checkExistingSession;
window.saveCfg                  = saveCfg;
window.populateVoices           = populateVoices;
window.applySettingsToForm      = applySettingsToForm;
window.openChangePasswordModal  = openChangePasswordModal;
window.submitChangePassword     = submitChangePassword;

// ── Window Globals ──────────────────────────────────────────
window.initApp = initApp;
