'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/api-key-management.js
 * Admin kann zwischen globalem und per-User API-Key Modus wechseln.
 * User können im per-User Modus ihren eigenen Key hinterlegen.
 */

// ── Status laden (wird beim App-Start aufgerufen) ─────────────
async function loadApiKeyStatus() {
  try {
    const res  = await fetch('api/apikey/user/status', { credentials:'include' });
    const data = await res.json();
    S.apiKeyStatus = data;

    // Warning-Banner aktualisieren
    updateApiKeyBanner(data);

    // Settings-View aktualisieren falls offen
    if (S.activeView === 'settings') renderApiKeySection();
  } catch(e) {}
}

function updateApiKeyBanner(status) {
  // Prüfe ALLE Provider-Keys, nicht nur Anthropic
  const hasAnyGlobalKey = status.hasGlobalKey || status.hasGrokKey || status.hasGroqKey;
  const noKey = status.mode === 'global'
    ? !hasAnyGlobalKey
    : !status.hasUserKey && !hasAnyGlobalKey;

  if (noKey) {
    if (typeof showApiKeyWarning === 'function') showApiKeyWarning();
  } else {
    document.getElementById('apikey-warning')?.remove();
  }
}

// ── Admin-View: Modus konfigurieren ──────────────────────────
async function loadApiKeyAdmin() {
  if (S.user?.role !== 'admin') return;

  try {
    const [modeRes, usersRes] = await Promise.all([
      fetch('api/apikey/mode', { credentials:'include' }).then(r=>r.json()),
      fetch('api/apikey/users/status', { credentials:'include' }).then(r=>r.json()),
    ]);

    const wrap = $('apikey-admin-wrap');
    if (!wrap) return;

    const usersWithKey    = usersRes.filter(u => u.hasKey).length;
    const usersWithoutKey = usersRes.filter(u => u.role !== 'admin' && !u.hasKey).length;

    wrap.innerHTML = `
      <!-- Modus-Auswahl -->
      <div class="sg">
        <div class="sg-head">API-Key Modus</div>
        <div class="sg-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">

            <!-- Globaler Modus -->
            <div onclick="setApiKeyMode('global')" style="
              background:${modeRes.mode==='global'?'rgba(168,85,247,.1)':'var(--s1)'};
              border:1px solid ${modeRes.mode==='global'?'rgba(168,85,247,.4)':'var(--b1)'};
              border-radius:var(--rl);padding:16px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:20px">🌐</span>
                <strong style="font-size:13px">Globaler API-Key</strong>
                ${modeRes.mode==='global'?'<span style="font-size:10px;color:var(--aa);margin-left:auto">✓ Aktiv</span>':''}
              </div>
              <p style="font-size:12px;color:var(--t2);line-height:1.5">
                Ein einziger API-Key für alle Nutzer.<br>
                Einfacher zu verwalten, alle Kosten auf einem Account.
              </p>
            </div>

            <!-- Per-User Modus -->
            <div onclick="setApiKeyMode('per_user')" style="
              background:${modeRes.mode==='per_user'?'rgba(168,85,247,.1)':'var(--s1)'};
              border:1px solid ${modeRes.mode==='per_user'?'rgba(168,85,247,.4)':'var(--b1)'};
              border-radius:var(--rl);padding:16px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:20px">👤</span>
                <strong style="font-size:13px">Per-User API-Keys</strong>
                ${modeRes.mode==='per_user'?'<span style="font-size:10px;color:var(--aa);margin-left:auto">✓ Aktiv</span>':''}
              </div>
              <p style="font-size:12px;color:var(--t2);line-height:1.5">
                Jeder Nutzer hinterlegt seinen eigenen Key.<br>
                Kostentransparenz, individuelle Limits.
              </p>
            </div>
          </div>

          <div style="font-size:11px;color:var(--t3);padding:8px 10px;background:var(--s2);border-radius:var(--r)">
            ${modeRes.mode === 'global'
              ? '🌐 Alle KI-Anfragen nutzen den globalen API-Key (Env-Variable oder unten eingetragen).'
              : `👤 Jeder Nutzer nutzt seinen eigenen Key. Fallback auf globalen Key falls kein User-Key vorhanden.
                 <br>${usersWithKey} von ${usersRes.length} Nutzern haben einen Key hinterlegt.
                 ${usersWithoutKey > 0 ? `<span style="color:var(--amb)"> ⚠ ${usersWithoutKey} Nutzer ohne Key.</span>` : ''}`}
          </div>
        </div>
      </div>

      <!-- Globaler Key -->
      <div class="sg">
        <div class="sg-head">Globaler API-Key</div>
        <div class="sg-body">
          <p style="font-size:12px;color:var(--t2);margin-bottom:12px">
            Wird genutzt wenn kein User-Key vorhanden oder Modus "Global" aktiv.
            Alternativ via Env-Variable <code>ANTHROPIC_API_KEY</code>.
          </p>
          <div class="frow">
            <label>API-Key</label>
            <div style="display:flex;gap:8px">
              <input type="password" id="ak-global-key"
                placeholder="sk-ant-api03-… (leer = Env-Variable nutzen)"
                style="flex:1"/>
              <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
                id="ak-toggle-global"
                onclick="toggleKeyVisibility('ak-global-key','ak-toggle-global')">👁</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="btn-primary" style="font-size:12px" onclick="saveGlobalApiKey()">
              💾 Speichern
            </button>
            <button class="btn-secondary" style="font-size:12px" onclick="testApiKey('global')">
              ✦ Testen
            </button>
          </div>
          <div id="ak-global-status" style="margin-top:8px;font-size:12px"></div>
        </div>
      </div>

      <!-- User-Key Übersicht (nur im per_user-Modus relevant) -->
      ${modeRes.mode === 'per_user' ? `
      <div class="sg">
        <div class="sg-head">User-Key Status</div>
        <div class="sg-body">
          <table class="data-table">
            <thead><tr>
              <th>Name</th><th>Rolle</th><th>E-Mail</th><th>API-Key</th><th>Aktion</th>
            </tr></thead>
            <tbody>
              ${usersRes.map(u => `<tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td><span class="sbadge rb-${u.role}">${roleLabel(u.role)}</span></td>
                <td style="color:var(--t2);font-size:11px">${esc(u.email)}</td>
                <td>
                  ${u.hasKey
                    ? '<span style="color:var(--grn);font-size:12px">✓ Hinterlegt</span>'
                    : '<span style="color:var(--amb);font-size:12px">⚠ Kein Key</span>'}
                </td>
                <td>
                  <div style="display:flex;gap:5px;align-items:center">
                    <button class="btn-primary" style="font-size:10px;padding:3px 9px"
                      onclick="openAdminSetKeyModal('${u.id}','${esc(u.name)}')">
                      ${u.hasKey ? '🔄 Ändern' : '+ Key setzen'}
                    </button>
                    ${u.hasKey
                      ? `<button class="btn-danger" style="font-size:10px;padding:3px 8px"
                           onclick="adminClearUserKey('${u.id}','${esc(u.name)}')">✕</button>`
                      : ''}
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;
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
  if (typeof addNotif === 'function')
    addNotif('🔑', 'API-Key Modus geändert',
      mode === 'global' ? 'Globaler Key aktiv' : 'Per-User Keys aktiv');
}

async function saveGlobalApiKey() {
  const key = $('ak-global-key')?.value.trim();
  if (!key) { toast('⚠ API-Key eingeben'); return; }
  const res  = await fetch('api/apikey/global', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ apiKey: key }),
  });
  const data = await res.json();
  if (data.ok) {
    $('ak-global-status').innerHTML = '<span style="color:var(--grn)">✅ Gespeichert</span>';
    $('ak-global-key').value = '';
    setTimeout(() => { if ($('ak-global-status')) $('ak-global-status').innerHTML = ''; }, 3000);
    document.getElementById('apikey-warning')?.remove();
  } else {
    $('ak-global-status').innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
  }
}

function openAdminSetKeyModal(userId, userName) {
  openModal(`🔑 API-Key für ${userName}`, `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px">
      Anthropic API-Key für <strong>${esc(userName)}</strong> hinterlegen.<br>
      Der User sieht seinen Key nicht — nur ob einer gesetzt ist.
    </p>
    <div class="frow">
      <label>API-Key</label>
      <div style="display:flex;gap:8px">
        <input type="password" id="admin-key-inp"
          placeholder="sk-ant-api03-…" style="flex:1" autofocus/>
        <button class="btn-secondary" style="font-size:11px;padding:6px 10px"
          onclick="toggleKeyVisibility('admin-key-inp','admin-key-toggle')" id="admin-key-toggle">👁</button>
      </div>
    </div>
    <div id="admin-key-status" style="min-height:18px;font-size:12px;margin-top:6px"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1"
        onclick="adminSaveUserKey('${userId}','${esc(userName)}')">💾 Speichern</button>
      <button class="btn-secondary" onclick="adminTestKey('${userId}')" style="font-size:12px">✦ Testen</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function adminSaveUserKey(userId, userName) {
  const key = $('admin-key-inp')?.value.trim();
  if (!key || !key.startsWith('sk-')) {
    $('admin-key-status').innerHTML = '<span style="color:var(--red)">⚠ Ungültiger Key</span>';
    return;
  }
  const btn = document.querySelector('#modal-body .btn-primary');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }

  const res  = await fetch(`/api/apikey/user/${userId}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key }),
  });
  const data = await res.json();

  if (btn) { btn.disabled=false; btn.innerHTML='💾 Speichern'; }

  if (data.ok) {
    closeModal();
    toast(`✅ API-Key für ${userName} gesetzt`);
    await loadApiKeyAdmin();
  } else {
    $('admin-key-status').innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
  }
}

async function adminTestKey(userId) {
  const key = $('admin-key-inp')?.value.trim();
  if (!key) { $('admin-key-status').innerHTML = '<span style="color:var(--red)">⚠ Key eingeben</span>'; return; }
  $('admin-key-status').innerHTML = '<span class="spin"></span> Teste …';
  try {
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:5, messages:[{role:'user',content:'Hi'}] }),
    });
    const ok = res.ok;
    $('admin-key-status').innerHTML = ok
      ? '<span style="color:var(--grn)">✅ Key gültig</span>'
      : '<span style="color:var(--red)">❌ Key ungültig oder inaktiv</span>';
  } catch(e) {
    // CORS-Fehler erwartet — Backend-Test nutzen
    $('admin-key-status').innerHTML = '<span style="color:var(--t3)">Test nur über Backend möglich</span>';
  }
}

async function adminClearUserKey(userId, userName) {
  if (!confirm(`API-Key von ${userName} wirklich löschen?`)) return;
  const res = await fetch(`/api/apikey/user/${userId}`, {
    method: 'DELETE', credentials: 'include',
  });
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
    const res = await fetch('api/ai/chat', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role:'user', content:'Hi' }],
      }),
    });
    const data = await res.json();
    const ok = res.ok && !data.error;
    if (statusEl) statusEl.innerHTML = ok
      ? '<span style="color:var(--grn)">✅ API-Key funktioniert</span>'
      : `<span style="color:var(--red)">❌ ${esc(data.error?.message || 'Fehler')}</span>`;
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`;
  }
}

// ── User-View: Eigenen Key hinterlegen ────────────────────────
async function renderApiKeySection() {
  const wrap = $('apikey-user-wrap');
  if (!wrap) return;

  const res    = await fetch('api/apikey/user/status', { credentials:'include' }).then(r=>r.json());
  const isAdmin = S.user?.role === 'admin';

  if (res.mode === 'global' && !isAdmin) {
    wrap.innerHTML = `
      <div style="font-size:12px;color:var(--t2);padding:10px 12px;background:var(--s2);border-radius:var(--r)">
        🌐 Der Administrator stellt einen globalen API-Key bereit. Kein eigener Key nötig.
        ${res.hasGlobalKey ? '<span style="color:var(--grn)"> ✓ Key aktiv</span>' : '<span style="color:var(--red)"> ⚠ Kein Key konfiguriert</span>'}
      </div>`;
    return;
  }

  if (res.mode === 'per_user') {
    wrap.innerHTML = `
      <div style="margin-bottom:10px;font-size:12px;color:var(--t2);line-height:1.6">
        ${res.hasUserKey
          ? '✅ Dein persönlicher API-Key ist hinterlegt.'
          : '⚠ Kein persönlicher API-Key. KI-Funktionen sind eingeschränkt.'}
        ${res.hasGlobalKey && !res.hasUserKey ? '<br>Fallback auf globalen Key aktiv.' : ''}
      </div>
      <div class="frow">
        <label>${res.hasUserKey ? 'API-Key ersetzen' : 'Anthropic API-Key'}</label>
        <div style="display:flex;gap:8px">
          <input type="password" id="ak-user-key"
            placeholder="sk-ant-api03-…"
            style="flex:1"/>
          <button class="btn-secondary" style="font-size:11px;padding:6px 10px" id="ak-toggle-user"
            onclick="toggleKeyVisibility('ak-user-key','ak-toggle-user')">👁</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        <button class="btn-primary" style="font-size:12px" onclick="saveUserApiKey()">
          💾 Speichern
        </button>
        <button class="btn-secondary" style="font-size:12px" onclick="testApiKey('user')">
          ✦ Testen
        </button>
        ${res.hasUserKey ? `<button class="btn-danger" style="font-size:12px" onclick="deleteUserApiKey()">
          Entfernen
        </button>` : ''}
      </div>
      <div id="ak-user-status" style="margin-top:8px;font-size:12px"></div>
      <div class="fhint" style="margin-top:8px">
        API-Key unter <a href="https://console.anthropic.com/keys" target="_blank" style="color:var(--aa)">console.anthropic.com/keys</a> erstellen.
      </div>`;
  }
}

async function saveUserApiKey() {
  const key = $('ak-user-key')?.value.trim();
  if (!key || !key.startsWith('sk-')) {
    $('ak-user-status').innerHTML = '<span style="color:var(--red)">⚠ Ungültiger Key (muss mit sk- beginnen)</span>';
    return;
  }
  const res  = await fetch('api/apikey/user', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ apiKey: key }),
  });
  const data = await res.json();
  if (data.ok) {
    $('ak-user-status').innerHTML = '<span style="color:var(--grn)">✅ Key gespeichert</span>';
    $('ak-user-key').value = '';
    document.getElementById('apikey-warning')?.remove();
    await loadApiKeyStatus();
    setTimeout(renderApiKeySection, 500);
  } else {
    $('ak-user-status').innerHTML = `<span style="color:var(--red)">❌ ${esc(data.error)}</span>`;
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

window.loadApiKeyStatus    = loadApiKeyStatus;
window.loadApiKeyAdmin     = loadApiKeyAdmin;
window.renderApiKeySection = renderApiKeySection;
window.setApiKeyMode       = setApiKeyMode;
window.saveGlobalApiKey    = saveGlobalApiKey;
window.saveUserApiKey      = saveUserApiKey;
window.deleteUserApiKey    = deleteUserApiKey;
window.adminClearUserKey   = adminClearUserKey;
window.openAdminSetKeyModal = openAdminSetKeyModal;
window.adminSaveUserKey     = adminSaveUserKey;
window.adminTestKey         = adminTestKey;
window.testApiKey          = testApiKey;
window.toggleKeyVisibility = toggleKeyVisibility;
