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
                onclick="openUserModal('${u.id}')">Bearbeiten</button>
              <button class="btn-danger" style="font-size:11px;padding:4px 10px"
                onclick="deleteUser('${u.id}')">Löschen</button>
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
  const assignedSystems = u.systems || [];

  // Hierarchischen Checkbox-Baum aufbauen
  function buildSysCheckboxTree(systems, parentId, depth) {
    return systems
      .filter(s => (s.parentId || null) === (parentId || null))
      .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0))
      .map(s => {
        const checked = assignedSystems.includes(s.id) ? 'checked' : '';
        const indent  = depth * 18;
        const children = buildSysCheckboxTree(systems, s.id, depth + 1);
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;
            padding-left:${8 + indent}px;border-radius:6px;cursor:pointer;
            transition:background .12s;font-size:13px"
            onmouseover="this.style.background='var(--s2)'"
            onmouseout="this.style.background=''">
            <input type="checkbox" name="um-sys-cb" value="${s.id}" ${checked}
              style="width:14px;height:14px;accent-color:var(--aa);flex-shrink:0"/>
            ${depth > 0 ? `<span style="color:var(--t3);font-size:11px;margin-right:2px">└</span>` : ''}
            <span style="flex:1">${esc(s.name)}</span>
            ${depth > 0 ? `<span style="font-size:9px;color:var(--t3);background:var(--s3);
              padding:1px 6px;border-radius:99px">Sub</span>` : ''}
            <span style="font-size:9px;font-family:var(--mono);color:var(--t3)">${s.idPrefix||'REQ'}</span>
          </label>
          ${children}`;
      }).join('');
  }

  const sysTree = buildSysCheckboxTree(S.systems, null, 0);

  openModal(uid ? 'Benutzer bearbeiten' : 'Neuer Benutzer', `
    <div class="frow"><label>Name</label>
      <input type="text" id="um-name" value="${esc(u.name)}"/></div>
    <div class="frow"><label>E-Mail</label>
      <input type="email" id="um-email" value="${esc(u.email)}"/></div>
    <div class="frow"><label>Rolle</label>
      <select id="um-role" onchange="umRoleChange(this.value)">
        <option value="admin"${u.role==='admin'?' selected':''}>Administrator</option>
        <option value="business"${u.role==='business'?' selected':''}>Business</option>
        <option value="businessanalyst"${u.role==='businessanalyst'?' selected':''}>Business Analyst</option>
        <option value="projectmanager"${u.role==='projectmanager'?' selected':''}>Projektmanager</option>
        <option value="developer"${u.role==='developer'?' selected':''}>Entwickler</option>
      </select></div>

    <div class="frow" id="um-sys-section">
      <label>Systeme & Subdomains</label>
      <div style="border:1px solid var(--b1);border-radius:var(--rl);
        max-height:200px;overflow-y:auto;padding:4px 0">
        ${sysTree || '<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Systeme vorhanden</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:5px">
        <button type="button" class="btn-secondary" style="font-size:11px;padding:3px 9px"
          onclick="umSelectAllSys(true)">Alle auswählen</button>
        <button type="button" class="btn-secondary" style="font-size:11px;padding:3px 9px"
          onclick="umSelectAllSys(false)">Alle abwählen</button>
        <span id="um-sys-count" style="font-size:11px;color:var(--t3);align-self:center">
          ${assignedSystems.length} ausgewählt</span>
      </div>
    </div>

    <div class="frow"><label>${uid ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}</label>
      <input type="password" id="um-pass" placeholder="${uid ? 'leer lassen …' : 'Passwort …'}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveUserModal('${uid||''}')">💾 Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);

  // Checkbox-Counter aktualisieren
  setTimeout(() => {
    document.querySelectorAll('[name="um-sys-cb"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const count = document.querySelectorAll('[name="um-sys-cb"]:checked').length;
        const el = document.getElementById('um-sys-count');
        if (el) el.textContent = count + ' ausgewählt';
      });
    });
    umRoleChange(u.role);
  }, 0);
}

async function saveUserModal(uid) {
  const systems = Array.from(document.querySelectorAll('[name="um-sys-cb"]:checked')).map(cb => cb.value);
  const subs    = [];
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

function umSelectAllSys(select) {
  document.querySelectorAll('[name="um-sys-cb"]').forEach(cb => cb.checked = select);
  const count = document.querySelectorAll('[name="um-sys-cb"]:checked').length;
  const el = document.getElementById('um-sys-count');
  if (el) el.textContent = count + ' ausgewählt';
}

function umRoleChange(role) {
  const sysSection = document.getElementById('um-sys-section');
  if (!sysSection) return;
  // Admin braucht keine System-Zuweisung
  sysSection.style.display = role === 'admin' ? 'none' : '';
}

window.umSelectAllSys = umSelectAllSys;
window.umRoleChange   = umRoleChange;
window.loadAdminUsers  = loadAdminUsers;
window.openUserModal   = openUserModal;
window.saveUserModal   = saveUserModal;
window.deleteUser      = deleteUser;
