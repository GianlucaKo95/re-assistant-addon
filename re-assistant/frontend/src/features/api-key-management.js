'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/api-key-management.js
 * API-Key Verwaltung für Anthropic und Grok (xAI).
 * Unterstützt globalen Key und per-User Keys mit Provider-Auswahl.
 */

const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', icon: '🤖', placeholder: 'sk-ant-api03-…', hint: 'console.anthropic.com/keys' },
  grok:      { label: 'Grok (xAI)',          icon: '⚡', placeholder: 'xai-…',          hint: 'console.x.ai' },
};

// ── Status laden ──────────────────────────────────────────────
async function loadApiKeyStatus() {
  try {
    const res  = await fetch('api/apikey/user/status', { credentials:'include' });
    const data = await res.json();
    S.apiKeyStatus = data;
    updateApiKeyBanner(data);
    if (S.activeView === 'settings') renderApiKeySection();
  } catch(e) {}
}

function updateApiKeyBanner(status) {
  const noKey = status.mode === 'global'
    ? !status.hasGlobalKey && !status.hasGrokKey
    : !status.hasUserKey && !status.hasGlobalKey && !status.hasGrokKey;
  if (noKey) {
    if (typeof showApiKeyWarning === 'function') showApiKeyWarning();
  } else {
    document.getElementById('apikey-warning')?.remove();
  }
}

// ── Admin-View ─────────────────────────────────────────────────
async function loadApiKeyAdmin() {
  if (S.user?.role !== 'admin') return;
  try {
    const [modeRes, globalRes, usersRes] = await Promise.all([
      fetch('api/apikey/mode',         { credentials:'include' }).then(r=>r.json()),
      fetch('api/apikey/global',       { credentials:'include' }).then(r=>r.json()),
      fetch('api/apikey/users/status', { credentials:'include' }).then(r=>r.json()),
    ]);

    const wrap = $('apikey-admin-wrap');
    if (!wrap) return;

    const usersWithKey    = usersRes.filter(u => u.hasKey).length;
    const usersWithoutKey = usersRes.filter(u => u.role !== 'admin' && !u.hasKey).length;
    const currentProvider = globalRes.provider || 'anthropic';

    wrap.innerHTML = `
      <!-- Modus-Auswahl -->
      <div class="sg">
        <div class="sg-head">API-Key Modus</div>
        <div class="sg-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
            <div data-action="set-mode" data-mode="global" style="
              background:${modeRes.mode==='global'?'rgba(168,85,247,.1)':'var(--s1)'};
              border:1px solid ${modeRes.mode==='global'?'rgba(168,85,247,.4)':'var(--b1)'};
              border-radius:var(--rl);padding:16px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:20px">🌐</span>
                <strong style="font-size:13px">Globaler API-Key</strong>
                ${modeRes.mode==='global'?'<span style="font-size:10px;color:var(--aa);margin-left:auto">✓ Aktiv</span>':''}
              </div>
              <p style="font-size:12px;color:var(--t2);line-height:1.5">Ein Key für alle Nutzer.</p>
            </div>
            <div data-action="set-mode" data-mode="per_user" style="
              background:${modeRes.mode==='per_user'?'rgba(168,85,247,.1)':'var(--s1)'};
              border:1px solid ${modeRes.mode==='per_user'?'rgba(168,85,247,.4)':'var(--b1)'};
              border-radius:var(--rl);padding:16px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:20px">👤</span>
                <strong style="font-size:13px">Per-User API-Keys</strong>
                ${modeRes.mode==='per_user'?'<span style="font-size:10px;color:var(--aa);margin-left:auto">✓ Aktiv</span>':''}
              </div>
              <p style="font-size:12px;color:var(--t2);line-height:1.5">Jeder Nutzer hat seinen eigenen Key + Provider.</p>
            </div>
          </div>
          <div style="font-size:11px;color:var(--t3);padding:8px 10px;background:var(--s2);border-radius:var(--r)">
            ${modeRes.mode === 'global'
              ? '🌐 Alle KI-Anfragen nutzen den globalen API-Key.'
              : `👤 Jeder Nutzer nutzt seinen eigenen Key.
                 ${usersWithKey} von ${usersRes.length} Nutzern haben einen Key.
                 ${usersWithoutKey > 0 ? `<span style="color:var(--amb)"> ⚠ ${usersWithoutKey} ohne Key.</span>` : ''}`}
          </div>
        </div>
      </div>

      <!-- Globaler Key + Provider -->
      <div class="sg">
        <div class="sg-head">Globaler API-Key & Provider</div>
        <div class="sg-body">
          <div class="frow">
            <label>KI-Anbieter</label>
            <select id="ak-global-provider">
              <option value="anthropic" ${currentProvider==='anthropic'?'selected':''}>🤖 Anthropic (Claude)</option>
              <option value="grok"      ${currentProvider==='grok'?'selected':''}>⚡ Grok (xAI) — kostenlos verfügbar</option>
            </select>
          </div>

          <!-- Anthropic Key -->
          <div id="ak-anthropic-section" style="${currentProvider==='anthropic'?'':'display:none'}">
            <div class="frow">
              <label>Anthropic API-Key</label>
              <div style="display:flex;gap:8px">
                <input type="password" id="ak-global-key"
                  placeholder="sk-ant-api03-… (leer = Env-Variable)"
                  style="flex:1"/>
                <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
                  id="ak-toggle-global">👁</button>
              </div>
              <span class="fhint">${globalRes.hasAnthKey ? '✓ Key hinterlegt' : '⚠ Kein Key — Env-Variable ANTHROPIC_API_KEY nutzen'}</span>
            </div>
          </div>

          <!-- Grok Key -->
          <div id="ak-grok-section" style="${currentProvider==='grok'?'':'display:none'}">
            <div class="frow">
              <label>Grok API-Key (xAI)</label>
              <div style="display:flex;gap:8px">
                <input type="password" id="ak-global-grok-key"
                  placeholder="xai-…"
                  style="flex:1"/>
                <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
                  id="ak-toggle-grok">👁</button>
              </div>
              <span class="fhint">${globalRes.hasGrokKey ? '✓ Key hinterlegt' : '⚠ Kein Key'} — Key unter <a href="https://console.x.ai" target="_blank" style="color:var(--aa)">console.x.ai</a></span>
            </div>
            <div style="padding:8px 10px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.2);border-radius:var(--r);font-size:12px;color:var(--t2);margin-bottom:8px">
              💡 Grok bietet ein kostenloses Kontingent — ideal zum Testen. Modell: <code>grok-3-mini</code>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="btn-primary" style="font-size:12px" id="btn-save-global-key">💾 Speichern</button>
            <button class="btn-secondary" style="font-size:12px" id="btn-test-global-key">✦ Testen</button>
          </div>
          <div id="ak-global-status" style="margin-top:8px;font-size:12px"></div>
        </div>
      </div>

      <!-- User-Key Übersicht -->
      ${modeRes.mode === 'per_user' ? `
      <div class="sg">
        <div class="sg-head">User-Key Status</div>
        <div class="sg-body">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Rolle</th><th>Provider</th><th>API-Key</th><th>Aktion</th></tr></thead>
            <tbody>
              ${usersRes.map(u => `<tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td><span class="sbadge rb-${u.role}">${roleLabel(u.role)}</span></td>
                <td style="font-size:11px">${u.provider === 'grok' ? '⚡ Grok' : '🤖 Anthropic'}</td>
                <td>${u.hasKey
                  ? '<span style="color:var(--grn);font-size:12px">✓ Hinterlegt</span>'
                  : '<span style="color:var(--amb);font-size:12px">⚠ Kein Key</span>'}</td>
                <td>
                  <div style="display:flex;gap:5px">
                    <button class="btn-primary" style="font-size:10px;padding:3px 9px"
                      data-action="admin-set-key" data-id="${u.id}" data-name="${esc(u.name)}">
                      ${u.hasKey ? '🔄 Ändern' : '+ Key setzen'}
                    </button>
                    ${u.hasKey ? `<button class="btn-danger" style="font-size:10px;padding:3px 8px"
                      data-action="admin-clear-key" data-id="${u.id}" data-name="${esc(u.name)}">✕</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;

    // Event-Listener setzen
    setTimeout(() => {
      // Provider Toggle
      document.getElementById('ak-global-provider')?.addEventListener('change', function() {
        const isGrok = this.value === 'grok';
        document.getElementById('ak-anthropic-section').style.display = isGrok ? 'none' : '';
        document.getElementById('ak-grok-section').style.display = isGrok ? '' : 'none';
      });

      // Key-Visibility Toggle
      document.getElementById('ak-toggle-global')?.addEventListener('click', () => toggleKeyVisibility('ak-global-key','ak-toggle-global'));
      document.getElementById('ak-toggle-grok')?.addEventListener('click', () => toggleKeyVisibility('ak-global-grok-key','ak-toggle-grok'));

      // Speichern
      document.getElementById('btn-save-global-key')?.addEventListener('click', saveGlobalApiKey);
      document.getElementById('btn-test-global-key')?.addEventListener('click', () => testApiKey('global'));

      // Modus wechseln
      document.querySelectorAll('[data-action="set-mode"]').forEach(el => {
        el.addEventListener('click', () => setApiKeyMode(el.dataset.mode));
      });

      // Admin User-Key Buttons
      document.querySelectorAll('[data-action="admin-set-key"]').forEach(el => {
        el.addEventListener('click', () => openAdminSetKeyModal(el.dataset.id, el.dataset.name));
      });
      document.querySelectorAll('[data-action="admin-clear-key"]').forEach(el => {
        el.addEventListener('click', () => adminClearUserKey(el.dataset.id, el.dataset.name));
      });
    }, 0);

  } catch(e) {
    const wrap = $('apikey-admin-wrap');
    if (wrap) wrap.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

async function setApiKeyMode(mode) {
  await fetch('api/apikey/mode', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ mode }),
  });
  toast(`✅ Modus: ${mode === 'global' ? 'Globaler API-Key' : 'Per-User API-Keys'}`);
  await loadApiKeyAdmin();
}

async function saveGlobalApiKey() {
  const provider  = document.getElementById('ak-global-provider')?.value || 'anthropic';
  const anthKey   = document.getElementById('ak-global-key')?.value.trim();
  const grokKey   = document.getElementById('ak-global-grok-key')?.value.trim();
  const statusEl  = $('ak-global-status');

  const body = { provider };
  if (anthKey) body.apiKey = anthKey;
  if (grokKey) body.grokApiKey = grokKey;

  const res  = await fetch('api/apikey/global', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ok) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--grn)">✅ Gespeichert</span>';
    if (document.getElementById('ak-global-key')) document.getElementById('ak-global-key').value = '';
    if (document.getElementById('ak-global-grok-key')) document.getElementById('ak-global-grok-key').value = '';
    document.getElementById('apikey-warning')?.remove();
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
  } else {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
  }
}

function openAdminSetKeyModal(userId, userName) {
  openModal(`🔑 API-Key für ${userName}`, `
    <div class="frow">
      <label>KI-Anbieter</label>
      <select id="admin-provider-sel">
        <option value="anthropic">🤖 Anthropic (Claude)</option>
        <option value="grok">⚡ Grok (xAI)</option>
      </select>
    </div>
    <div class="frow">
      <label>API-Key</label>
      <div style="display:flex;gap:8px">
        <input type="password" id="admin-key-inp"
          placeholder="sk-ant-api03-… oder xai-…" style="flex:1" autofocus/>
        <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
          id="admin-key-toggle">👁</button>
      </div>
    </div>
    <div id="admin-key-status" style="min-height:18px;font-size:12px;margin-top:6px"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" id="btn-admin-save-key">💾 Speichern</button>
      <button class="btn-secondary" id="btn-admin-test-key">✦ Testen</button>
      <button class="btn-secondary" id="btn-admin-cancel">Abbrechen</button>
    </div>`);

  setTimeout(() => {
    document.getElementById('admin-key-toggle')?.addEventListener('click',
      () => toggleKeyVisibility('admin-key-inp','admin-key-toggle'));
    document.getElementById('btn-admin-save-key')?.addEventListener('click',
      () => adminSaveUserKey(userId, userName));
    document.getElementById('btn-admin-test-key')?.addEventListener('click',
      () => adminTestKey(userId));
    document.getElementById('btn-admin-cancel')?.addEventListener('click', closeModal);
  }, 0);
}

async function adminSaveUserKey(userId, userName) {
  const key      = document.getElementById('admin-key-inp')?.value.trim();
  const provider = document.getElementById('admin-provider-sel')?.value || 'anthropic';
  const statusEl = $('admin-key-status');

  if (!key) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">⚠ Key eingeben</span>';
    return;
  }

  const res  = await fetch(`api/apikey/user/${userId}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key, provider }),
  });
  const data = await res.json();

  if (data.ok) {
    closeModal();
    toast(`✅ API-Key für ${userName} gesetzt`);
    await loadApiKeyAdmin();
  } else {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
  }
}

async function adminTestKey(userId) {
  const statusEl = $('admin-key-status');
  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Teste …';
  try {
    const res  = await fetch('api/ai/chat', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:10, messages:[{role:'user',content:'Hi'}] }),
    });
    const data = await res.json();
    if (statusEl) statusEl.innerHTML = res.ok && !data.error
      ? '<span style="color:var(--grn)">✅ Funktioniert</span>'
      : `<span style="color:var(--red)">❌ ${esc(data.error?.message || 'Fehler')}</span>`;
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

async function adminClearUserKey(userId, userName) {
  if (!confirm(`API-Key von ${userName} wirklich löschen?`)) return;
  const res = await fetch(`api/apikey/user/${userId}`, { method:'DELETE', credentials:'include' });
  const data = await res.json();
  if (data.ok) {
    toast(`✅ Key von ${userName} gelöscht`);
    await loadApiKeyAdmin();
  } else {
    toast('❌ ' + (data.error || 'Fehler'));
  }
}

async function testApiKey(scope) {
  const statusEl = $(`ak-${scope}-status`);
  if (statusEl) statusEl.innerHTML = '<span class="spin"></span> Teste …';
  try {
    const res  = await fetch('api/ai/chat', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:10, messages:[{role:'user',content:'Hi'}] }),
    });
    const data = await res.json();
    if (statusEl) statusEl.innerHTML = res.ok && !data.error
      ? '<span style="color:var(--grn)">✅ API-Key funktioniert</span>'
      : `<span style="color:var(--red)">❌ ${esc(data.error?.message || data.error || 'Fehler')}</span>`;
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

// ── User-View: Eigenen Key hinterlegen ────────────────────────
async function renderApiKeySection() {
  const wrap = $('apikey-user-wrap');
  if (!wrap) return;

  const res     = await fetch('api/apikey/user/status', { credentials:'include' }).then(r=>r.json());
  const isAdmin = S.user?.role === 'admin';

  if (res.mode === 'global' && !isAdmin) {
    const prov = PROVIDERS[res.globalProvider] || PROVIDERS.anthropic;
    wrap.innerHTML = `
      <div style="font-size:12px;color:var(--t2);padding:10px 12px;background:var(--s2);border-radius:var(--r)">
        ${prov.icon} Der Administrator nutzt <strong>${prov.label}</strong> als globalen Anbieter.
        ${(res.hasGlobalKey || res.hasGrokKey)
          ? '<span style="color:var(--grn)"> ✓ Key aktiv</span>'
          : '<span style="color:var(--red)"> ⚠ Kein Key konfiguriert</span>'}
      </div>`;
    return;
  }

  if (res.mode === 'per_user') {
    const userProv = res.userProvider || 'anthropic';
    wrap.innerHTML = `
      <div style="margin-bottom:10px;font-size:12px;color:var(--t2);line-height:1.6">
        ${res.hasUserKey
          ? `✅ Dein persönlicher API-Key ist hinterlegt (${PROVIDERS[userProv]?.label || userProv}).`
          : '⚠ Kein persönlicher API-Key. KI-Funktionen sind eingeschränkt.'}
      </div>
      <div class="frow">
        <label>KI-Anbieter wählen</label>
        <select id="ak-user-provider">
          <option value="anthropic" ${userProv==='anthropic'?'selected':''}>🤖 Anthropic (Claude)</option>
          <option value="grok"      ${userProv==='grok'?'selected':''}>⚡ Grok (xAI) — kostenlos verfügbar</option>
        </select>
      </div>
      <div class="frow">
        <label>API-Key</label>
        <div style="display:flex;gap:8px">
          <input type="password" id="ak-user-key"
            placeholder="${userProv === 'grok' ? 'xai-…' : 'sk-ant-api03-…'}"
            style="flex:1"/>
          <button class="btn-secondary" style="font-size:11px;padding:6px 10px" id="ak-toggle-user">👁</button>
        </div>
      </div>
      <div id="ak-grok-info" style="${userProv==='grok'?'':'display:none'};padding:8px 10px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.2);border-radius:var(--r);font-size:12px;color:var(--t2);margin-bottom:8px">
        💡 Grok kostenlos unter <a href="https://console.x.ai" target="_blank" style="color:var(--aa)">console.x.ai</a>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        <button class="btn-primary" style="font-size:12px" id="btn-save-user-key">💾 Speichern</button>
        <button class="btn-secondary" style="font-size:12px" id="btn-test-user-key">✦ Testen</button>
        ${res.hasUserKey ? '<button class="btn-danger" style="font-size:12px" id="btn-delete-user-key">Entfernen</button>' : ''}
      </div>
      <div id="ak-user-status" style="margin-top:8px;font-size:12px"></div>`;

    setTimeout(() => {
      document.getElementById('ak-user-provider')?.addEventListener('change', function() {
        const isGrok = this.value === 'grok';
        const inp = document.getElementById('ak-user-key');
        if (inp) inp.placeholder = isGrok ? 'xai-…' : 'sk-ant-api03-…';
        const info = document.getElementById('ak-grok-info');
        if (info) info.style.display = isGrok ? '' : 'none';
      });
      document.getElementById('ak-toggle-user')?.addEventListener('click',
        () => toggleKeyVisibility('ak-user-key','ak-toggle-user'));
      document.getElementById('btn-save-user-key')?.addEventListener('click', saveUserApiKey);
      document.getElementById('btn-test-user-key')?.addEventListener('click', () => testApiKey('user'));
      document.getElementById('btn-delete-user-key')?.addEventListener('click', deleteUserApiKey);
    }, 0);
  }
}

async function saveUserApiKey() {
  const key      = document.getElementById('ak-user-key')?.value.trim();
  const provider = document.getElementById('ak-user-provider')?.value || 'anthropic';
  const statusEl = $('ak-user-status');

  if (!key) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">⚠ Key eingeben</span>';
    return;
  }

  const res  = await fetch('api/apikey/user', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ apiKey: key, provider }),
  });
  const data = await res.json();
  if (data.ok) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--grn)">✅ Key gespeichert</span>';
    document.getElementById('ak-user-key').value = '';
    document.getElementById('apikey-warning')?.remove();
    await loadApiKeyStatus();
    setTimeout(renderApiKeySection, 500);
  } else {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
  }
}

async function deleteUserApiKey() {
  if (!confirm('Eigenen API-Key entfernen?')) return;
  await fetch('api/apikey/user', { method:'DELETE', credentials:'include' });
  toast('✅ Key entfernt');
  await loadApiKeyStatus();
  renderApiKeySection();
}

function toggleKeyVisibility(inputId, btnId) {
  const inp = $(inputId);
  const btn = $(btnId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

window.loadApiKeyStatus     = loadApiKeyStatus;
window.loadApiKeyAdmin      = loadApiKeyAdmin;
window.renderApiKeySection  = renderApiKeySection;
window.setApiKeyMode        = setApiKeyMode;
window.saveGlobalApiKey     = saveGlobalApiKey;
window.saveUserApiKey       = saveUserApiKey;
window.deleteUserApiKey     = deleteUserApiKey;
window.adminClearUserKey    = adminClearUserKey;
window.openAdminSetKeyModal = openAdminSetKeyModal;
window.adminSaveUserKey     = adminSaveUserKey;
window.adminTestKey         = adminTestKey;
window.testApiKey           = testApiKey;
window.toggleKeyVisibility  = toggleKeyVisibility;
