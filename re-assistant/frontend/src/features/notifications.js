'use strict';
/**
 * features/notifications.js
 * Benachrichtigungssystem — Badge, Panel, History.
 */

const NOTIFS = [];
let _notifOpen = false;

function initNotifications() {
  const bell = $('notif-bell');
  if (bell) bell.onclick = toggleNotifPanel;
  renderNotifs();
}

function addNotif(icon, title, sub, onClick) {
  const n = { id:'n'+Date.now(), icon, title, sub, onClick, read:false, ts:Date.now() };
  NOTIFS.unshift(n);
  if (NOTIFS.length > 50) NOTIFS.pop();
  renderNotifs();
}

function renderNotifs() {
  const badge = $('notif-badge');
  const list  = $('notif-list');
  const unread = NOTIFS.filter(n => !n.read).length;

  if (badge) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.toggle('visible', unread > 0);
  }
  if (!list) return;
  if (!NOTIFS.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">Keine Benachrichtigungen</div>';
    return;
  }
  list.innerHTML = NOTIFS.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="clickNotif('${n.id}')">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span class="notif-icon">${n.icon}</span>
        <div style="flex:1;min-width:0">
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-sub">${esc(n.sub)}</div>
          <div class="notif-sub" style="color:var(--t3)">${timeSince(n.ts)}</div>
        </div>
      </div>
    </div>`).join('');
}

function clickNotif(id) {
  const n = NOTIFS.find(x => x.id === id);
  if (n) {
    n.read = true;
    renderNotifs();
    toggleNotifPanel();
    if (n.onClick) n.onClick();
  }
}

function toggleNotifPanel() {
  _notifOpen = !_notifOpen;
  $('notif-panel')?.classList.toggle('open', _notifOpen);
  if (_notifOpen) {
    NOTIFS.forEach(n => n.read = true);
    renderNotifs();
  }
}

function clearNotifs() {
  NOTIFS.length = 0;
  renderNotifs();
}

// Panel schließen bei Klick außerhalb
document.addEventListener('click', e => {
  if (_notifOpen &&
      !e.target.closest('#notif-panel') &&
      !e.target.closest('#notif-bell')) {
    _notifOpen = false;
    $('notif-panel')?.classList.remove('open');
  }
});

window.initNotifications = initNotifications;
window.addNotif          = addNotif;
window.toggleNotifPanel  = toggleNotifPanel;
window.clickNotif        = clickNotif;
window.clearNotifs       = clearNotifs;
