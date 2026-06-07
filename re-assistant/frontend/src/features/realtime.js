'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/realtime.js
 * E: WebSocket-Client — Live-Kollaboration, Cursor, Online-User, Req-Updates.
 */

let _ws         = null;
let _reconnectTimer = null;
let _pingTimer  = null;
let _online     = [];
let _connected  = false;

// ── Verbindung aufbauen ───────────────────────────────────────
function connectWebSocket() {
  if (_ws?.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = `${proto}//${location.host}/ws`;

  try {
    _ws = new WebSocket(url);
  } catch(e) { scheduleReconnect(); return; }

  _ws.onopen = () => {
    _connected = true;
    clearTimeout(_reconnectTimer);
    updateConnectionBadge(true);
    // Identify
    send({ type: 'identify', userName: S.user?.name || '', role: S.user?.role || '' });
    // Ping alle 25s
    _pingTimer = setInterval(() => send({ type: 'ping' }), 25000);
    console.log('[WS] Verbunden');
  };

  _ws.onmessage = (e) => {
    try { handleServerMessage(JSON.parse(e.data)); }
    catch(err) { console.error('[WS] Parse-Fehler', err); }
  };

  _ws.onclose = () => {
    _connected = false;
    clearInterval(_pingTimer);
    updateConnectionBadge(false);
    scheduleReconnect();
  };

  _ws.onerror = () => {
    _ws?.close();
  };
}

function scheduleReconnect() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(connectWebSocket, 5000);
}

function send(msg) {
  if (_ws?.readyState === WebSocket.OPEN)
    _ws.send(JSON.stringify(msg));
}

// ── Eingehende Nachrichten ────────────────────────────────────
function handleServerMessage(msg) {
  switch(msg.type) {

    case 'presence':
      _online = (msg.users || []).filter(u => u.userId !== S.user?.id);
      renderPresenceBar();
      renderReqEditingIndicators();
      break;

    case 'req_updated':
      handleRemoteReqUpdate(msg);
      break;

    case 'req_created':
      handleRemoteReqCreated(msg);
      break;

    case 'req_deleted':
      handleRemoteReqDeleted(msg);
      break;

    case 'cursor':
    case 'typing':
      renderRemoteTyping(msg);
      break;

    case 'cursor_leave':
      clearRemoteTyping(msg.userId);
      break;

    case 'notification':
      if (typeof addNotif === 'function')
        addNotif(msg.icon||'📌', msg.title||'', msg.sub||'', msg.onClick);
      break;

    case 'pong':
      break;
  }
}

// ── Req-Updates empfangen ─────────────────────────────────────
function handleRemoteReqUpdate(msg) {
  // Aktuellen View aktualisieren wenn relevant
  if (S.activeView === 'business-chat' || S.activeView === 'business-reqs') {
    const idx = (S.requirements||[]).findIndex(r => r.id === msg.reqId);
    if (idx >= 0) {
      S.requirements[idx] = { ...S.requirements[idx], ...msg };
      if (typeof renderReqPane === 'function') renderReqPane();
    }
  }
  if (S.activeView === 'pm-dashboard' || S.activeView === 'pm-assign') {
    if (typeof loadPMDash === 'function') loadPMDash();
  }
  if (S.activeView === 'review-workflow') {
    if (typeof loadReviewDashboard === 'function') loadReviewDashboard();
  }
  // Toast nur wenn anderer User
  if (msg.updatedBy !== S.user?.id) {
    const updater = _online.find(u => u.userId === msg.updatedBy);
    const name    = updater?.userName || 'Jemand';
    showLiveToast(`${name} hat "${(msg.title||'').substring(0,40)}" aktualisiert`);
  }
}

function handleRemoteReqCreated(msg) {
  if (msg.createdBy !== S.user?.id) {
    const creator = _online.find(u => u.userId === msg.createdBy);
    const name    = creator?.userName || 'Jemand';
    showLiveToast(`${name} hat neue Anforderung erstellt: "${(msg.title||'').substring(0,40)}"`);
    if (typeof addNotif === 'function')
      addNotif('➕', 'Neue Anforderung', msg.title||'', () => switchView('business-reqs'));
  }
}

function handleRemoteReqDeleted(msg) {
  if (S.requirements) S.requirements = S.requirements.filter(r => r.id !== msg.reqId);
  if (typeof renderReqPane === 'function') renderReqPane();
}

// ── Typing-Indikatoren ────────────────────────────────────────
const _typingTimers = {};

function renderRemoteTyping(msg) {
  if (!msg.reqId) return;
  const el = document.querySelector(`[data-req-id="${msg.reqId}"] .remote-typing`);
  if (!el) return;
  el.innerHTML = `<span style="font-size:10px;color:var(--aa)">${esc(msg.userName)} tippt …</span>`;
  el.style.display = '';
  clearTimeout(_typingTimers[msg.userId]);
  _typingTimers[msg.userId] = setTimeout(() => { el.innerHTML=''; el.style.display='none'; }, 2500);
}

function clearRemoteTyping(userId) {
  clearTimeout(_typingTimers[userId]);
}

// ── Presence-Bar ──────────────────────────────────────────────
function renderPresenceBar() {
  const bar = $('presence-bar');
  if (!bar) return;
  if (!_online.length) { bar.innerHTML = ''; return; }

  const roleColors = { admin:'var(--red)', business:'var(--grn)', businessanalyst:'var(--ba)', projectmanager:'var(--pm)', developer:'var(--blue)' };

  bar.innerHTML = _online.slice(0,6).map(u => `
    <div style="display:flex;align-items:center;gap:5px;padding:3px 8px;background:var(--s2);border-radius:99px;font-size:11px" title="${esc(u.userName)} — ${esc(u.activeView||'Dashboard')}">
      <div style="width:8px;height:8px;border-radius:50%;background:${roleColors[u.role]||'var(--t3)'}"></div>
      <span>${esc(u.userName.split(' ')[0])}</span>
    </div>`).join('');
}

function renderReqEditingIndicators() {
  // Zeige an welche Requirements gerade von anderen bearbeitet werden
  document.querySelectorAll('.bc-req-item').forEach(el => {
    const reqId = el.id?.replace('bri-','');
    if (!reqId) return;
    const editing = _online.filter(u => u.activeReqId === reqId);
    let ind = el.querySelector('.editing-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.className = 'editing-indicator';
      ind.style.cssText = 'font-size:9px;color:var(--amb);margin-top:2px';
      el.appendChild(ind);
    }
    ind.textContent = editing.length
      ? `✏ ${editing.map(u=>u.userName.split(' ')[0]).join(', ')} bearbeitet gerade`
      : '';
  });
}

// ── Verbindungs-Badge ─────────────────────────────────────────
function updateConnectionBadge(connected) {
  const badge = $('ws-status');
  if (!badge) return;
  badge.title   = connected ? 'Echtzeit-Verbindung aktiv' : 'Verbinde …';
  badge.style.background = connected ? 'var(--grn)' : 'var(--amb)';
}

// ── Live-Toast (anders als normaler Toast) ────────────────────
let _liveToastTimer;
function showLiveToast(msg) {
  let el = $('live-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'live-toast';
    el.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(168,85,247,.15);border:1px solid rgba(168,85,247,.3);border-radius:99px;padding:6px 16px;font-size:11px;color:var(--t1);z-index:150;backdrop-filter:blur(8px);transition:opacity .3s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(_liveToastTimer);
  _liveToastTimer = setTimeout(() => el.style.opacity = '0', 3000);
}

// ── View-Tracking ─────────────────────────────────────────────
// Patcht switchView um aktuelle View an Server zu melden
const _origSwitchView = window.switchView;
if (typeof _origSwitchView === 'function') {
  window.switchView = async function(id) {
    send({ type: 'view_change', view: id, reqId: null });
    return _origSwitchView(id);
  };
}

// ── Init ──────────────────────────────────────────────────────
function initRealtime() {
  connectWebSocket();
}

window.initRealtime     = initRealtime;
window.sendWS           = send;
window.getOnlineUsers   = () => _online;
window.showLiveToast    = showLiveToast;

// ── Window Globals ──────────────────────────────────────────
window.connectWebSocket = connectWebSocket;
window.scheduleReconnect = scheduleReconnect;
window.handleServerMessage = handleServerMessage;
window.handleRemoteReqUpdate = handleRemoteReqUpdate;
window.handleRemoteReqCreated = handleRemoteReqCreated;
window.handleRemoteReqDeleted = handleRemoteReqDeleted;
window.renderRemoteTyping = renderRemoteTyping;
window.clearRemoteTyping = clearRemoteTyping;
window.renderPresenceBar = renderPresenceBar;
window.renderReqEditingIndicators = renderReqEditingIndicators;
window.updateConnectionBadge = updateConnectionBadge;
