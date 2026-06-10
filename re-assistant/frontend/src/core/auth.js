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
  initTheme();
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
  const provider = S.settings.provider || 'anthropic';
  setVal('cfg-provider',   provider);
  setVal('cfg-apikey',     S.settings.apiKey    || '');
  setVal('cfg-model',      S.settings.model);
  setVal('cfg-grok-apikey',  S.settings.grokApiKey  || '');
  setVal('cfg-grok-model',   S.settings.grokModel   || 'grok-3-mini');
  setVal('cfg-groq-apikey',  S.settings.groqApiKey  || '');
  setVal('cfg-groq-model',   S.settings.groqModel   || 'llama-3.3-70b-versatile');
  const isGrok = provider === 'grok';
  const isGroq = provider === 'groq';
  const aw = document.getElementById('cfg-anthropic-wrap');
  const gw = document.getElementById('cfg-grok-wrap');
  const grw = document.getElementById('cfg-groq-wrap');
  if (aw)  aw.style.display  = (!isGrok && !isGroq) ? '' : 'none';
  if (gw)  gw.style.display  = isGrok ? '' : 'none';
  if (grw) grw.style.display = isGroq ? '' : 'none';

  // Für Nicht-Admins: API-Key Felder deaktivieren (nach kurzer Verzögerung)
  setTimeout(() => {
    const isAdmin = S.user?.role === 'admin';
    const apiSection = document.getElementById('cfg-api-section');
    if (!apiSection) return;
    if (!isAdmin) {
      // Alle Inputs + Buttons in der API-Sektion sperren
      apiSection.querySelectorAll('input, button, select').forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
      });
      // Info-Banner hinzufügen
      const banner = document.createElement('div');
      banner.style.cssText = 'padding:8px 10px;background:var(--s2);border-radius:var(--r);font-size:12px;color:var(--t2);margin-top:8px';
      banner.textContent = 'ℹ Der API-Key wird vom Administrator verwaltet.';
      apiSection.appendChild(banner);
    }
  }, 100);
  setVal('cfg-lang',       S.settings.language);
  setVal('cfg-detail',     S.settings.detail);
  setVal('cfg-persona',    S.settings.persona   || 'professional');
  setVal('cfg-jira-url',   S.settings.jiraUrl   || '');
  setVal('cfg-jira-email', S.settings.jiraEmail || '');
  setVal('cfg-jira-token', S.settings.jiraToken || '');
}

async function saveCfg() {
  const provider = $('cfg-provider')?.value || 'anthropic';
  S.settings.provider   = provider;
  S.settings.apiKey     = $('cfg-apikey')?.value.trim() || '';
  S.settings.model      = $('cfg-model')?.value || 'claude-sonnet-4-20250514';
  S.settings.grokApiKey  = $('cfg-grok-apikey')?.value.trim()  || '';
  S.settings.grokModel   = $('cfg-grok-model')?.value           || 'grok-3-mini';
  S.settings.groqApiKey  = $('cfg-groq-apikey')?.value.trim()  || '';
  S.settings.groqModel   = $('cfg-groq-model')?.value           || 'llama-3.3-70b-versatile';
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
  $('cfg-grok-toggle')?.addEventListener('click', () => {
    const i = $('cfg-grok-apikey');
    if (!i) return;
    i.type = i.type === 'password' ? 'text' : 'password';
    $('cfg-grok-toggle').textContent = i.type === 'password' ? 'Anzeigen' : 'Verbergen';
  });
  $('cfg-groq-toggle')?.addEventListener('click', () => {
    const i = $('cfg-groq-apikey');
    if (!i) return;
    i.type = i.type === 'password' ? 'text' : 'password';
    $('cfg-groq-toggle').textContent = i.type === 'password' ? 'Anzeigen' : 'Verbergen';
  });
  $('cfg-provider')?.addEventListener('change', function() {
    const isGrok = this.value === 'grok';
    const isGroq = this.value === 'groq';
    const aw  = document.getElementById('cfg-anthropic-wrap');
    const gw  = document.getElementById('cfg-grok-wrap');
    const grw = document.getElementById('cfg-groq-wrap');
    if (aw)  aw.style.display  = (!isGrok && !isGroq) ? '' : 'none';
    if (gw)  gw.style.display  = isGrok ? '' : 'none';
    if (grw) grw.style.display = isGroq ? '' : 'none';
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
// ── Dark/Light Mode Toggle ────────────────────────────────────
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('re-theme', next);

  // Icons tauschen
  const dark  = document.getElementById('theme-icon-dark');
  const light = document.getElementById('theme-icon-light');
  if (dark)  dark.style.display  = next === 'dark'  ? '' : 'none';
  if (light) light.style.display = next === 'light' ? '' : 'none';
}

function initTheme() {
  const saved = localStorage.getItem('re-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const dark  = document.getElementById('theme-icon-dark');
  const light = document.getElementById('theme-icon-light');
  if (dark)  dark.style.display  = saved === 'dark'  ? '' : 'none';
  if (light) light.style.display = saved === 'light' ? '' : 'none';
}

// ── Globale Suche ─────────────────────────────────────────────
let _searchOpen = false;

function toggleSearchPanel() {
  _searchOpen = !_searchOpen;
  let panel = document.getElementById('global-search-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'global-search-panel';
    panel.innerHTML = `
      <div id="gsp-inner">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--b1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="gsp-input" placeholder="Anforderungen, Systeme, Workshops suchen …"
            style="flex:1;background:none;border:none;outline:none;font-size:14px;color:var(--t1)"/>
          <kbd style="font-size:10px;color:var(--t3);padding:2px 6px;border:1px solid var(--b1);border-radius:4px">ESC</kbd>
        </div>
        <div id="gsp-results" style="max-height:400px;overflow-y:auto;padding:8px 0">
          <div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Suchbegriff eingeben …</div>
        </div>
      </div>`;
    panel.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;
      display:flex;align-items:flex-start;justify-content:center;padding-top:80px;`;
    document.body.appendChild(panel);

    // Schließen bei Klick außerhalb
    panel.addEventListener('click', (e) => {
      if (e.target === panel) closeSearchPanel();
    });

    // Suche
    let debounce;
    document.getElementById('gsp-input').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => runGlobalSearch(e.target.value.trim()), 250);
    });

    // Keyboard
    document.addEventListener('keydown', handleSearchKey);
  }

  panel.style.display = _searchOpen ? 'flex' : 'none';
  if (_searchOpen) {
    setTimeout(() => document.getElementById('gsp-input')?.focus(), 50);
  }
}

function closeSearchPanel() {
  _searchOpen = false;
  const panel = document.getElementById('global-search-panel');
  if (panel) panel.style.display = 'none';
}

function handleSearchKey(e) {
  if (e.key === 'Escape' && _searchOpen) closeSearchPanel();
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    toggleSearchPanel();
  }
}

async function runGlobalSearch(q) {
  const results = document.getElementById('gsp-results');
  if (!results) return;

  if (!q || q.length < 2) {
    results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Suchbegriff eingeben …</div>';
    return;
  }

  results.innerHTML = '<div style="padding:20px;text-align:center"><div class="spin"></div></div>';

  try {
    const res  = await fetch(`api/search?q=${encodeURIComponent(q)}`, { credentials:'include' });
    const data = await res.json();

    const reqs = data.requirements || [];
    const ws   = data.workshops    || [];
    const bls  = data.backlogs     || [];
    const total = reqs.length + ws.length + bls.length;

    if (!total) {
      results.innerHTML = `<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Keine Treffer für „${esc(q)}"</div>`;
      return;
    }

    let html = '';

    if (reqs.length) {
      html += `<div style="padding:6px 16px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">Anforderungen (${reqs.length})</div>`;
      html += reqs.slice(0,8).map(r => `
        <div class="gsp-item" data-view="business-reqs" style="
          display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;
          transition:background .12s;border-bottom:1px solid var(--b1)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(r.id)} · ${esc(r.category||'')}</div>
          </div>
          <span class="sbadge p-${r.priority}" style="font-size:9px;flex-shrink:0">${priLabel(r.priority)}</span>
        </div>`).join('');
    }

    if (ws.length) {
      html += `<div style="padding:6px 16px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Workshops (${ws.length})</div>`;
      html += ws.slice(0,4).map(w => `
        <div class="gsp-item" data-view="ba-workshop" style="
          display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;
          transition:background .12s;border-bottom:1px solid var(--b1)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <div style="font-size:13px">${esc(w.name)}</div>
        </div>`).join('');
    }

    results.innerHTML = html;

    // Klick auf Ergebnis
    results.querySelectorAll('.gsp-item').forEach(el => {
      el.addEventListener('mouseover', () => el.style.background = 'var(--s2)');
      el.addEventListener('mouseout',  () => el.style.background = '');
      el.addEventListener('click', () => {
        closeSearchPanel();
        switchView(el.dataset.view);
      });
    });

  } catch(e) {
    results.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">Fehler: ${esc(e.message)}</div>`;
  }
}

window.applySettingsToForm      = applySettingsToForm;
window.openChangePasswordModal  = openChangePasswordModal;
window.submitChangePassword     = submitChangePassword;
