'use strict';
/**
 * admin/users.js
 * Benutzerverwaltung — Tabelle, Erstellen, Bearbeiten, Löschen.
 */

async function loadAdminUsers() {
  S.users = await window.api.getUsers();
  renderUsersTable();
  $('btn-new-user').onclick = () => openUserModal(null);
}

function renderUsersTable() {
  const w = $('users-table-wrap');
  if (!S.users.length) {
    w.innerHTML = '<div class="empty-state"><h3>Keine Benutzer</h3></div>';
    return;
  }
  w.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Name</th><th>E-Mail</th><th>Rolle</th>
        <th>Systeme</th><th>Bereiche</th><th>Aktionen</th>
      </tr></thead>
      <tbody>
        ${S.users.map(u => `<tr>
          <td><strong>${esc(u.name)}</strong></td>
          <td style="color:var(--t2)">${esc(u.email)}</td>
          <td><span class="sbadge rb-${u.role}">${roleLabel(u.role)}</span></td>
          <td>${(u.systems||[]).map(sid => {
            const s = S.systems.find(x => x.id === sid);
            return s ? `<span class="rtag">${esc(s.name)}</span> ` : '';
          }).join('') || '—'}</td>
          <td>${(u.subcategories||[]).map(s => `<span class="rtag">${esc(s)}</span>`).join('') || '—'}</td>
          <td>
            <div style="display:flex;gap:5px">
              <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
                data-action="edit" data-id="${u.id}">Bearbeiten</button>
              <button class="btn-danger" style="font-size:11px;padding:4px 10px"
                data-action="delete" data-id="${u.id}">Löschen</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openUserModal(uid) {
  const u = uid
    ? S.users.find(x => x.id === uid)
    : { id:null, name:'', email:'', role:'business', systems:[], subcategories:[], password:'' };
  const so = S.systems.map(s =>
    `<option value="${s.id}"${(u.systems||[]).includes(s.id)?' selected':''}>${esc(s.name)}</option>`
  ).join('');
  openModal(uid ? 'Benutzer bearbeiten' : 'Neuer Benutzer', `
    <div class="frow"><label>Name</label>
      <input type="text" id="um-name" value="${esc(u.name)}"/></div>
    <div class="frow"><label>E-Mail</label>
      <input type="email" id="um-email" value="${esc(u.email)}"/></div>
    <div class="frow"><label>Rolle</label>
      <select id="um-role">
        <option value="admin"${u.role==='admin'?' selected':''}>Administrator</option>
        <option value="business"${u.role==='business'?' selected':''}>Business</option>
        <option value="businessanalyst"${u.role==='businessanalyst'?' selected':''}>Business Analyst</option>
        <option value="projectmanager"${u.role==='projectmanager'?' selected':''}>Projektmanager</option>
        <option value="developer"${u.role==='developer'?' selected':''}>Entwickler</option>
      </select></div>
    <div class="frow"><label>Systeme (Strg/Cmd = Mehrfach)</label>
      <select id="um-systems" multiple style="height:90px">${so}</select></div>
    <div class="frow"><label>Unterbereiche (kommagetrennt, für Entwickler)</label>
      <input type="text" id="um-subs" value="${(u.subcategories||[]).join(', ')}"/></div>
    <div class="frow"><label>${uid ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}</label>
      <input type="password" id="um-pass" placeholder="${uid ? 'leer lassen …' : 'Passwort …'}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" id="btn-save-user-modal">Speichern</button>
      <button class="btn-secondary" id="btn-cancel-user-modal">Abbrechen</button>
    </div>`);
}

async function saveUserModal(uid) {
  const systems = Array.from($('um-systems').selectedOptions).map(o => o.value);
  const subs    = $('um-subs').value.split(',').map(s => s.trim()).filter(Boolean);
  const pw      = $('um-pass').value;
  const data    = {
    id: uid || null,
    name:          $('um-name').value.trim(),
    email:         $('um-email').value.trim(),
    role:          $('um-role').value,
    systems, subcategories: subs,
  };
  if (pw) data.password = pw;
  await window.api.saveUser(data);
  S.users = await window.api.getUsers();
  renderUsersTable();
  closeModal();
  toast('✅ Gespeichert');
}

async function deleteUser(id) {
  if (!confirm('Benutzer wirklich löschen?')) return;
  await window.api.deleteUser(id);
  S.users = await window.api.getUsers();
  renderUsersTable();
  toast('✅ Gelöscht');
}

window.loadAdminUsers  = loadAdminUsers;
window.openUserModal   = openUserModal;
window.saveUserModal   = saveUserModal;
window.deleteUser      = deleteUser;
