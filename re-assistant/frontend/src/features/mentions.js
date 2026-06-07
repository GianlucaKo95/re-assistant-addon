'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/mentions.js
 * Nr. 2: @Mentions — @username in Kommentaren erstellt Aufgaben und Benachrichtigungen.
 */

// ── Mentions-Parsing ──────────────────────────────────────────
function parseMentions(text) {
  const mentions = [];
  const regex    = /@(\S+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const user  = (S.users || []).find(u =>
      u.name.toLowerCase().replace(/\s+/g,'') === name ||
      u.email.split('@')[0].toLowerCase() === name
    );
    if (user) mentions.push(user);
  }
  return [...new Map(mentions.map(u => [u.id, u])).values()];
}

function renderTextWithMentions(text) {
  if (!text) return '';
  return esc(text).replace(/@(\S+)/g, (match, name) => {
    const user = (S.users || []).find(u =>
      u.name.toLowerCase().replace(/\s+/g,'') === name.toLowerCase() ||
      u.email.split('@')[0].toLowerCase() === name.toLowerCase()
    );
    return user
      ? `<span class="mention-chip" title="${esc(user.email)}">@${esc(user.name)}</span>`
      : match;
  });
}

// ── Autocomplete-Dropdown für @mentions ───────────────────────
function initMentionAutocomplete(inputId) {
  const inp = $(inputId);
  if (!inp) return;

  inp.addEventListener('input', e => {
    const val    = inp.value;
    const cursor = inp.selectionStart;
    const before = val.substring(0, cursor);
    const atIdx  = before.lastIndexOf('@');
    if (atIdx === -1) { hideMentionDropdown(); return; }
    const query = before.substring(atIdx + 1).toLowerCase();
    if (query.includes(' ')) { hideMentionDropdown(); return; }
    showMentionDropdown(inp, query, atIdx, cursor);
  });

  inp.addEventListener('keydown', e => {
    const dd = document.getElementById('mention-dropdown');
    if (!dd) return;
    const items = dd.querySelectorAll('.mention-item');
    const sel   = dd.querySelector('.mention-item.selected');
    const idx   = sel ? [...items].indexOf(sel) : -1;
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx+1,items.length-1)]?.classList.add('selected'); sel?.classList.remove('selected'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(idx-1,0)]?.classList.add('selected'); sel?.classList.remove('selected'); }
    else if (e.key === 'Enter' && sel) { e.preventDefault(); sel.click(); }
    else if (e.key === 'Escape') hideMentionDropdown();
  });

  inp.addEventListener('blur', () => setTimeout(hideMentionDropdown, 150));
}

function showMentionDropdown(inp, query, atIdx, cursor) {
  const users = (S.users || [])
    .filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    .slice(0, 6);
  if (!users.length) { hideMentionDropdown(); return; }

  let dd = document.getElementById('mention-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'mention-dropdown';
    dd.style.cssText = `position:fixed;z-index:300;background:rgba(12,12,22,.98);border:1px solid var(--b2);
      border-radius:var(--rl);box-shadow:0 16px 40px rgba(0,0,0,.4);min-width:200px;overflow:hidden`;
    document.body.appendChild(dd);
  }

  const rect = inp.getBoundingClientRect();
  dd.style.top  = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';

  dd.innerHTML = users.map((u, i) => `
    <div class="mention-item${i===0?' selected':''}" data-user-id="${u.id}"
      style="display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;transition:background .1s"
      onmouseover="this.parentElement.querySelectorAll('.mention-item').forEach(x=>x.classList.remove('selected'));this.classList.add('selected')"
      onclick="insertMention('${inp.id}',${atIdx},${cursor},'${esc(u.name)}','${u.id}')">
      <div style="width:26px;height:26px;border-radius:50%;background:var(--ag);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">
        ${u.name.substring(0,2).toUpperCase()}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600">${esc(u.name)}</div>
        <div style="font-size:10px;color:var(--t3)">${esc(u.email)}</div>
      </div>
      <span class="sbadge rb-${u.role}" style="font-size:9px;margin-left:auto">${roleLabel(u.role)}</span>
    </div>`).join('');
}

function hideMentionDropdown() {
  document.getElementById('mention-dropdown')?.remove();
}

function insertMention(inputId, atIdx, cursor, userName, userId) {
  const inp   = $(inputId);
  if (!inp) return;
  const val   = inp.value;
  const before = val.substring(0, atIdx);
  const after  = val.substring(cursor);
  const mention = `@${userName.replace(/\s+/g,'')} `;
  inp.value    = before + mention + after;
  inp.focus();
  const newCursor = (before + mention).length;
  inp.setSelectionRange(newCursor, newCursor);
  hideMentionDropdown();
  inp.dispatchEvent(new Event('input'));
}

// ── Aufgaben aus Mentions erstellen ───────────────────────────
async function processMentionsInComment(reqId, commentText, commentId) {
  const mentioned = parseMentions(commentText);
  if (!mentioned.length) return;

  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);

  for (const user of mentioned) {
    // Aufgabe/Benachrichtigung erzeugen
    const task = {
      id:        'task-' + Date.now() + Math.random(),
      type:      'mention',
      reqId,
      reqTitle:  req?.title || reqId,
      commentId,
      text:      commentText.substring(0, 120),
      assignedTo:user.id,
      createdBy: S.user.id,
      createdAt: Date.now(),
      done:      false,
    };

    // In localStorage speichern (einfach, kein DB-Schema nötig)
    const tasks = loadTasks();
    tasks.push(task);
    saveTasks(tasks);

    // Benachrichtigung anzeigen wenn der User eingeloggt ist
    if (user.id === S.user.id && typeof addNotif === 'function') {
      addNotif('💬', 'Du wurdest erwähnt', `In "${req?.title || reqId}": ${commentText.substring(0, 60)}`,
        () => { S.activeSystemId = req?.systemId; switchView('business-reqs'); });
    }
  }
}

// ── Aufgaben-Verwaltung ────────────────────────────────────────
function loadTasks() {
  try { return JSON.parse(localStorage.getItem('re-tasks') || '[]'); } catch(e) { return []; }
}
function saveTasks(tasks) { localStorage.setItem('re-tasks', JSON.stringify(tasks)); }

function getMyTasks() {
  return loadTasks().filter(t => t.assignedTo === S.user?.id && !t.done);
}

async function loadTasksView() {
  const tasks = getMyTasks();
  const allReqs = await window.api.getRequirements({});
  const wrap  = $('tasks-wrap');
  if (!wrap) return;

  if (!tasks.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="es-icon">✅</div><h3>Keine offenen Aufgaben</h3><p>Alle Mentions bearbeitet.</p></div>';
    return;
  }

  wrap.innerHTML = tasks.map(t => {
    const req = allReqs.find(r => r.id === t.reqId);
    return `
      <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:12px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start">
        <div style="width:32px;height:32px;background:var(--babg);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">💬</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${esc(req?.title || t.reqId)}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">"${esc(t.text)}"</div>
          <div style="font-size:10px;color:var(--t3);margin-top:4px">${timeSince(t.createdAt)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="btn-primary" style="font-size:11px;padding:4px 10px"
            onclick="markTaskDone('${t.id}')">✓ Erledigt</button>
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
            onclick="navigateToReq('${t.reqId}')">→ Öffnen</button>
        </div>
      </div>`;
  }).join('');
}

function markTaskDone(taskId) {
  const tasks = loadTasks().map(t => t.id === taskId ? { ...t, done:true } : t);
  saveTasks(tasks);
  loadTasksView();
  toast('✅ Als erledigt markiert');
}

function navigateToReq(reqId) {
  closeModal?.();
  if (S.activeSystemId) switchView('business-reqs');
  // Req im DOM suchen und scrollen
  setTimeout(() => {
    const el = document.getElementById(`bri-${reqId}`);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 300);
}

// Aufgaben-Badge in der Nav aktualisieren
function updateTasksBadge() {
  const count = getMyTasks().length;
  const badge = $('tasks-badge');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('visible', count > 0);
  }
}

// CSS
const mentionStyle = document.createElement('style');
mentionStyle.textContent = `
  .mention-chip{display:inline-flex;align-items:center;background:rgba(168,85,247,.15);
    border:1px solid rgba(168,85,247,.3);color:var(--aa);border-radius:99px;
    padding:1px 8px;font-size:11px;font-weight:600;cursor:default}
  .mention-item.selected{background:var(--s2)}`;
document.head.appendChild(mentionStyle);

window.parseMentions           = parseMentions;
window.renderTextWithMentions  = renderTextWithMentions;
window.initMentionAutocomplete = initMentionAutocomplete;
window.insertMention           = insertMention;
window.processMentionsInComment = processMentionsInComment;
window.loadTasksView           = loadTasksView;
window.markTaskDone            = markTaskDone;
window.navigateToReq           = navigateToReq;
window.updateTasksBadge        = updateTasksBadge;
window.getMyTasks              = getMyTasks;
