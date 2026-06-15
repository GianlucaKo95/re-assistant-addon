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
  // Key nicht aus S.settings — wird vom Backend über /api/apikey/global geliefert (Sterne-Anzeige)
  setVal('cfg-model',      S.settings.model);
  // Grok/Groq Keys nicht aus localStorage
  setVal('cfg-grok-model',   S.settings.grokModel   || 'grok-3-mini');
  // Groq Key nicht aus localStorage
  setVal('cfg-groq-model',   S.settings.groqModel   || 'llama-3.3-70b-versatile');
  const isGrok = provider === 'grok';
  const isGroq = provider === 'groq';
  const aw = document.getElementById('cfg-anthropic-wrap');
  const gw = document.getElementById('cfg-grok-wrap');
  const grw = document.getElementById('cfg-groq-wrap');
  if (aw)  aw.style.display  = (!isGrok && !isGroq) ? '' : 'none';
  if (gw)  gw.style.display  = isGrok ? '' : 'none';
  if (grw) grw.style.display = isGroq ? '' : 'none';


  setVal('cfg-lang',       S.settings.language);
  setVal('cfg-detail',     S.settings.detail);
  setVal('cfg-persona',    S.settings.persona   || 'professional');
  setVal('cfg-jira-url',   S.settings.jiraUrl   || '');
  setVal('cfg-jira-email', S.settings.jiraEmail || '');
  setVal('cfg-jira-token', S.settings.jiraToken || '');
}

async function saveCfg() {
  const provider    = $('cfg-provider')?.value    || 'anthropic';
  const apiKey      = $('cfg-apikey')?.value.trim()      || '';
  const grokApiKey  = $('cfg-grok-apikey')?.value.trim() || '';
  const groqApiKey  = $('cfg-groq-apikey')?.value.trim() || '';

  // Provider + Modelle in S.settings — KEINE Keys
  S.settings.provider  = provider;
  S.settings.model     = $('cfg-model')?.value      || 'claude-sonnet-4-6';
  S.settings.grokModel = $('cfg-grok-model')?.value  || 'grok-3-mini';
  S.settings.groqModel = $('cfg-groq-model')?.value  || 'llama-3.3-70b-versatile';
  // Explizit sicherstellen dass keine Keys in S.settings landen
  delete S.settings.apiKey;
  delete S.settings.grokApiKey;
  delete S.settings.groqApiKey;

  // Key ans Backend senden
  const keyBody = { provider };
  if (apiKey)     keyBody.apiKey     = apiKey;
  if (grokApiKey) keyBody.grokApiKey = grokApiKey;
  if (groqApiKey) keyBody.groqApiKey = groqApiKey;

  if (apiKey || grokApiKey || groqApiKey) {
    try {
      const res  = await fetch('api/apikey/global', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(keyBody),
      });
      const data = await res.json();
      if (!res.ok) {
        if ($('cfg-msg')) $('cfg-msg').innerHTML = '<span style="color:var(--red)">❌ ' + esc(data.error||'Fehler') + '</span>';
        return;
      }
      if (data.rebuilding && typeof toast === 'function') {
        toast('🔄 Kontext-Cache wird mit KI neu aufgebaut …');
      }
    } catch(e) {
      if ($('cfg-msg')) $('cfg-msg').innerHTML = '<span style="color:var(--red)">❌ Netzwerkfehler</span>';
      return;
    }
  }

  await window.api.saveSettings(S.settings);
  if ($('cfg-msg')) {
    $('cfg-msg').innerHTML = '<span style="color:var(--grn)">✅ Gespeichert</span>';
    setTimeout(() => { if ($('cfg-msg')) $('cfg-msg').innerHTML = ''; }, 3000);
  }
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
      (rel.length  ? `<optgroup label="${lc==='de'?'Deutsch':'English'}">${rel.map(v => '<option value="${esc(v.voiceURI)}"${v.voiceURI===S.settings.voiceURI?\' selected\':\'\'}>${esc(v.name)}</option>').join('')}</optgroup>` : '') +
      (rest.length ? `<optgroup label="Andere">${rest.map(v => '<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>').join('')}</optgroup>` : '');
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
  $('btn-test-api')?.addEventListener('click', testApiConnection);
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
// ── Backup Export/Import ──────────────────────────────────────
async function exportBackup() {
  const statusEl = document.getElementById('backup-status');
  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Exportiere …';
  try {
    const res  = await fetch('api/backup/export', { credentials: 'include' });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url; a.download = `re-assistant-backup-${date}.json`;
    a.click(); URL.revokeObjectURL(url);
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--grn)">✅ Backup exportiert</span>';
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

async function importBackup() {
  const files = await window.api.pickFiles('.json');
  if (!files.length) return;
  const statusEl = document.getElementById('backup-status');
  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Importiere …';
  try {
    const text = await files[0].text();
    const data = JSON.parse(text);
    const res  = await fetch('api/backup/import', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.ok) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--grn)">✅ ${result.imported.systems} Systeme, ${result.imported.requirements} Anforderungen importiert</span>`;
      S.systems = await window.api.getSystems();
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(result.error)}</span>`;
    }
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

window.exportBackup = exportBackup;
window.importBackup = importBackup;
// DB-Status in Einstellungen anzeigen
async function loadDbStatus() {
  const wrap = document.getElementById('db-status-wrap');
  if (!wrap) return;
  try {
    const res  = await fetch('api/health', { credentials: 'include' });
    const data = await res.json();
    const isExternal = data.dbMode === 'external';
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
        background:var(--s2);border-radius:var(--r);border:1px solid var(--b1)">
        <span style="font-size:20px">${data.db?.ok ? '🟢' : '🔴'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">
            ${isExternal ? '🌐 Externe Datenbank' : '🏠 Interne PostgreSQL'}
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(data.dbUrl || '')}
          </div>
        </div>
        <span style="font-size:11px;color:${data.db?.ok?'var(--grn)':'var(--red)'}">
          ${data.db?.ok ? 'Verbunden' : 'Fehler'}
        </span>
      </div>
      ${isExternal ? '' : '<p style="font-size:11px;color:var(--amb);margin-top:6px">⚠ Interne DB: Daten können bei Neuinstallation verloren gehen.</p>'}`;
  } catch(e) {}
}
window.loadDbStatus = loadDbStatus;
// ── KI-Provider Verbindungstest ───────────────────────────────
async function testApiConnection() {
  const btn = $('btn-test-api');
  const out = $('api-test-result');
  if (!btn || !out) return;

  btn.disabled = true;
  const origText = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Teste …';
  out.innerHTML = '';

  try {
    const res  = await fetch('api/apikey/test', { method:'POST', credentials:'include' });
    const data = await res.json();

    if (data.ok) {
      out.innerHTML = `
        <div style="padding:10px 12px;background:var(--grnbg);border:1px solid rgba(63,185,80,.3);
          border-radius:var(--r);font-size:12px;color:var(--grn)">
          ✅ Verbindung erfolgreich — <strong>${esc(data.provider)}</strong> (${esc(data.model)})<br/>
          Antwortzeit: ${data.latency}ms · Key: ${esc(data.keyPrefix)}<br/>
          Antwort: "${esc(data.reply)}"
        </div>`;
    } else {
      out.innerHTML = `
        <div style="padding:10px 12px;background:var(--redbg);border:1px solid rgba(248,81,73,.3);
          border-radius:var(--r);font-size:12px;color:var(--red)">
          ❌ Verbindung fehlgeschlagen — Provider: <strong>${esc(data.provider||'unbekannt')}</strong>
          ${data.status ? ` (HTTP ${data.status})` : ''}<br/>
          ${esc(data.error || 'Unbekannter Fehler')}
          ${data.latency ? `<br/>Zeit: ${data.latency}ms` : ''}
        </div>`;
    }
  } catch(e) {
    out.innerHTML = `
      <div style="padding:10px 12px;background:var(--redbg);border:1px solid rgba(248,81,73,.3);
        border-radius:var(--r);font-size:12px;color:var(--red)">
        ❌ Netzwerkfehler: ${esc(e.message)}
      </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}
window.testApiConnection = testApiConnection;
