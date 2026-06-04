'use strict';
/**
 * websocket.js — E: WebSocket-Server für Echtzeit-Kollaboration
 * Broadcast: Req-Updates, Review-Status, Cursor-Positionen, Online-User
 */
const WebSocket = require('ws');

let wss       = null;
let _sessions = null; // Express-Session-Store Referenz

// Verbundene Clients: Map<userId, {ws, userName, role, activeView, activeReqId}>
const clients = new Map();

function init(server, sessionMiddleware) {
  _sessions = sessionMiddleware;
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Session aus Cookie lesen
    sessionMiddleware(req, {}, () => {
      const userId = req.session?.userId;
      if (!userId) { ws.close(1008, 'Nicht authentifiziert'); return; }

      const clientInfo = { ws, userId, userName: '', role: '', activeView: null, activeReqId: null, connectedAt: Date.now() };
      clients.set(userId, clientInfo);

      console.log(`[WS] Verbunden: ${userId} (${clients.size} gesamt)`);
      broadcastPresence();

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleClientMessage(userId, clientInfo, msg);
        } catch(e) { console.error('[WS] Parse-Fehler:', e.message); }
      });

      ws.on('close', () => {
        clients.delete(userId);
        console.log(`[WS] Getrennt: ${userId} (${clients.size} gesamt)`);
        broadcastPresence();
        // Cursor-Leave broadcasten
        broadcast({ type: 'cursor_leave', userId });
      });

      ws.on('error', (e) => console.error('[WS] Fehler:', e.message));
    });
  });

  console.log('[WS] WebSocket-Server bereit auf /ws');
}

function handleClientMessage(userId, client, msg) {
  switch (msg.type) {
    case 'identify':
      client.userName = msg.userName || '';
      client.role     = msg.role     || '';
      broadcastPresence();
      break;

    case 'view_change':
      client.activeView  = msg.view;
      client.activeReqId = msg.reqId || null;
      broadcastPresence();
      break;

    case 'cursor':
      // Live-Cursor bei der Bearbeitung einer Anforderung
      broadcastExcept(userId, {
        type:    'cursor',
        userId,
        userName: client.userName,
        reqId:   msg.reqId,
        field:   msg.field,  // 'title' | 'description' | etc.
      });
      break;

    case 'typing':
      broadcastExcept(userId, {
        type:     'typing',
        userId,
        userName: client.userName,
        reqId:    msg.reqId,
        field:    msg.field,
        preview:  (msg.text || '').substring(0, 60),
      });
      break;

    case 'ping':
      send(userId, { type: 'pong', ts: Date.now() });
      break;
  }
}

// ── Broadcast-Funktionen ──────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN)
      client.ws.send(data);
  }
}

function broadcastExcept(excludeUserId, msg) {
  const data = JSON.stringify(msg);
  for (const [uid, client] of clients) {
    if (uid !== excludeUserId && client.ws.readyState === WebSocket.OPEN)
      client.ws.send(data);
  }
}

function send(userId, msg) {
  const client = clients.get(userId);
  if (client?.ws.readyState === WebSocket.OPEN)
    client.ws.send(JSON.stringify(msg));
}

function broadcastPresence() {
  const presence = [];
  for (const [uid, c] of clients) {
    presence.push({
      userId:      uid,
      userName:    c.userName,
      role:        c.role,
      activeView:  c.activeView,
      activeReqId: c.activeReqId,
    });
  }
  broadcast({ type: 'presence', users: presence });
}

// ── Event-Broadcasting (von server.js aufgerufen) ─────────────
function broadcastReqUpdate(req, actionUserId) {
  broadcast({
    type:         'req_updated',
    reqId:        req.id,
    systemId:     req.systemId,
    title:        req.title,
    status:       req.status,
    reviewStatus: req.reviewStatus,
    priority:     req.priority,
    updatedAt:    req.updatedAt,
    updatedBy:    actionUserId,
  });
}

function broadcastReqCreated(req, actionUserId) {
  broadcast({
    type:      'req_created',
    reqId:     req.id,
    systemId:  req.systemId,
    title:     req.title,
    priority:  req.priority,
    createdBy: actionUserId,
  });
}

function broadcastReqDeleted(reqId, systemId) {
  broadcast({ type: 'req_deleted', reqId, systemId });
}

function broadcastNotification(targetUserId, notif) {
  send(targetUserId, { type: 'notification', ...notif });
}

function getOnlineUsers() {
  return [...clients.entries()].map(([uid, c]) => ({
    userId: uid, userName: c.userName, role: c.role,
    activeView: c.activeView, activeReqId: c.activeReqId,
  }));
}

module.exports = {
  init,
  broadcast, broadcastExcept, send,
  broadcastReqUpdate, broadcastReqCreated, broadcastReqDeleted,
  broadcastNotification, broadcastPresence,
  getOnlineUsers,
};
