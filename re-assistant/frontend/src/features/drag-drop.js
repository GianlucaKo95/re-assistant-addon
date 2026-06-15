'use strict';
/**
 * features/drag-drop.js
 * 5: Drag & Drop Priorisierung — Backlog Stories und Req-Liste manuell sortieren.
 * Kein externe Bibliothek — natives HTML5 Drag & Drop API.
 */

// ── Drag-State ────────────────────────────────────────────────
let _dragItem    = null;
let _dragList    = null;
let _dragData    = null; // Sortierte Items
let _dragCallback = null; // fn(newOrder) nach Drop

// ── Draggable Liste initialisieren ───────────────────────────
/**
 * Macht eine Liste von Elementen draggable.
 * @param {string} containerId - ID des Container-Elements
 * @param {string} itemSelector - CSS-Selector für ziehbare Items
 * @param {Function} onReorder - Callback mit neuer Reihenfolge der data-ids
 */
function initDragDrop(containerId, itemSelector, onReorder) {
  const container = document.getElementById(containerId);
  if (!container) return;

  _dragList     = container;
  _dragCallback = onReorder;

  // Alle Items draggable machen
  container.querySelectorAll(itemSelector).forEach(item => makeDraggable(item));

  // Mutation Observer für dynamisch hinzugefügte Items
  const observer = new MutationObserver(() => {
    container.querySelectorAll(`${itemSelector}:not([draggable])`).forEach(item => makeDraggable(item));
  });
  observer.observe(container, { childList: true });

  // Drag-Handle CSS
  injectDragStyles();
}

function makeDraggable(item) {
  item.draggable = true;
  item.style.cursor = 'grab';

  // Drag-Handle Icon hinzufügen
  if (!item.querySelector('.drag-handle')) {
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/>
      <line x1="9" y1="6" x2="9" y2="6"/></svg>`;
    handle.style.cssText = 'position:absolute;left:6px;top:50%;transform:translateY(-50%);color:var(--t3);cursor:grab;opacity:.4;transition:opacity .15s;z-index:1';
    item.style.position = 'relative';
    item.style.paddingLeft = '24px';
    item.insertBefore(handle, item.firstChild);
    handle.onmouseover = () => handle.style.opacity = '1';
    handle.onmouseout  = () => handle.style.opacity = '.4';
  }

  item.addEventListener('dragstart', onDragStart);
  item.addEventListener('dragend',   onDragEnd);
  item.addEventListener('dragover',  onDragOver);
  item.addEventListener('dragleave', onDragLeave);
  item.addEventListener('drop',      onDrop);
}

function onDragStart(e) {
  _dragItem = e.currentTarget;
  _dragItem.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragItem.dataset.id || '');
}

function onDragEnd(e) {
  if (_dragItem) _dragItem.style.opacity = '1';
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  _dragItem = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target !== _dragItem) {
    target.classList.add('drag-over');
    // Position bestimmen
    const rect   = target.getBoundingClientRect();
    const midY   = rect.top + rect.height / 2;
    const before = e.clientY < midY;
    _dragList.insertBefore(_dragItem, before ? target : target.nextSibling);
  }
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  // Neue Reihenfolge ermitteln
  const newOrder = [..._dragList.children]
    .map(el => el.dataset.id)
    .filter(Boolean);
  if (_dragCallback && newOrder.length > 0) _dragCallback(newOrder);
}

// ── Backlog-Liste draggable machen ────────────────────────────
function enableBacklogDragDrop() {
  const backlogArea = document.getElementById('backlog-area');
  if (!backlogArea) return;
  injectDragStyles();

  // Jede Feature-Block: Stories draggable
  backlogArea.querySelectorAll('.feature-block').forEach(featureBlock => {
    const storyContainer = featureBlock.querySelector('.stories-list') || featureBlock;
    const stories = featureBlock.querySelectorAll('.story-row[data-id]');
    if (!stories.length) return;

    stories.forEach(story => makeDraggable(story));

    // Container-Level Drop-Handler für korrekte Reihenfolge
    featureBlock.addEventListener('drop', () => {
      const epicId  = featureBlock.closest('[data-epic-id]')?.dataset.epicId;
      const featId  = stories[0]?.dataset.feat;
      if (!S.currentBacklog || !featId) return;

      const newOrder = [...featureBlock.querySelectorAll('.story-row[data-id]')]
        .map(el => el.dataset.id).filter(Boolean);

      // Backlog-State aktualisieren
      for (const epic of S.currentBacklog.epics || []) {
        for (const feat of epic.features || []) {
          if (feat.id === featId) {
            feat.stories = newOrder
              .map(id => feat.stories.find(s => s.id === id))
              .filter(Boolean);
            break;
          }
        }
      }
      // Speichern
      if (typeof window.api?.saveBacklog === 'function') {
        window.api.saveBacklog(S.currentBacklog)
          .then(() => toast('✅ Reihenfolge gespeichert'))
          .catch(() => toast('⚠ Speichern fehlgeschlagen'));
      } else {
        toast('✅ Reihenfolge angepasst');
      }
    });
  });

  // Epics selbst auch sortierbar
  backlogArea.querySelectorAll('.epic-block[data-epic-id]').forEach(epic => {
    makeDraggable(epic);
  });

  backlogArea.addEventListener('drop', (e) => {
    if (!e.target.closest('.epic-block')) return;
    const newEpicOrder = [...backlogArea.querySelectorAll('.epic-block[data-epic-id]')]
      .map(el => el.dataset.epicId).filter(Boolean);
    if (!S.currentBacklog || !newEpicOrder.length) return;
    const epicMap = Object.fromEntries((S.currentBacklog.epics||[]).map(ep => [ep.id, ep]));
    S.currentBacklog.epics = newEpicOrder.map(id => epicMap[id]).filter(Boolean);
    toast('✅ Epic-Reihenfolge gespeichert');
  });
}

// ── Req-Liste draggable machen ────────────────────────────────
function enableReqListDragDrop(containerId, reqs, onReorder) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.req-card, .bc-req-item').forEach((item, idx) => {
    const req = reqs[idx];
    if (req) item.dataset.id = req.id;
    makeDraggable(item);
  });

  // Nach Drop: neue Reihenfolge speichern (localStorage-basiert, nicht DB)
  const saveOrder = (newOrder) => {
    const key = `req-order-${S.activeSystemId || 'default'}`;
    localStorage.setItem(key, JSON.stringify(newOrder));
    toast('✅ Reihenfolge angepasst');
    if (onReorder) onReorder(newOrder);
  };

  container.addEventListener('drop', (e) => {
    const newOrder = [...container.querySelectorAll('[data-id]')].map(el => el.dataset.id).filter(Boolean);
    if (newOrder.length > 0) saveOrder(newOrder);
  });
}

// ── Gespeicherte Reihenfolge anwenden ────────────────────────
function applyStoredReqOrder(reqs, systemId) {
  const key   = `req-order-${systemId || 'default'}`;
  const order = JSON.parse(localStorage.getItem(key) || '[]');
  if (!order.length) return reqs;
  const ordered = [];
  for (const id of order) {
    const r = reqs.find(x => x.id === id);
    if (r) ordered.push(r);
  }
  // Neue Anforderungen die noch nicht in der Reihenfolge sind, hinzufügen
  for (const r of reqs) {
    if (!order.includes(r.id)) ordered.push(r);
  }
  return ordered;
}

// ── Sprint-Stories draggable ──────────────────────────────────
function enableSprintDragDrop(planId) {
  const container = document.getElementById(`sprint-${planId}`);
  if (!container) return;

  container.querySelectorAll('.story-row, [data-story-id]').forEach(story => {
    makeDraggable(story);
  });
}

// ── CSS ───────────────────────────────────────────────────────
function injectDragStyles() {
  if (document.getElementById('drag-drop-styles')) return;
  const s = document.createElement('style');
  s.id = 'drag-drop-styles';
  s.textContent = `
    [draggable]:active { cursor: grabbing !important; }
    .drag-over {
      border-top: 2px solid var(--aa) !important;
      background: rgba(168,85,247,.06) !important;
    }
    [draggable] { user-select: none; }
    .drag-handle:hover { color: var(--aa) !important; }`;
  document.head.appendChild(s);
}

window.initDragDrop             = initDragDrop;
window.enableBacklogDragDrop    = enableBacklogDragDrop;
window.enableReqListDragDrop    = enableReqListDragDrop;
window.applyStoredReqOrder      = applyStoredReqOrder;
window.enableSprintDragDrop     = enableSprintDragDrop;
