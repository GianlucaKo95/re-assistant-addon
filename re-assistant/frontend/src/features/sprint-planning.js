'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/sprint-planning.js
 * G: KI-Sprint-Planning — Kapazität, Story Points, Sprint-Vorschläge.
 */

async function loadSprintPlanning() {
  S.systems = await window.api.getSystems();
  S.users   = await window.api.getUsers().catch(()=>[]);

  const sel = $('sprint-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.filter(s=>(S.user.systems||[]).includes(s.id)||S.user.role==='admin')
              .map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = () => loadSprintBacklog();
  }

  $('btn-create-sprint').onclick = openCreateSprintModal;

  // Gespeicherte Sprints laden
  await loadSavedSprints();
}

async function loadSprintBacklog() {
  const sysId = $('sprint-sys-sel')?.value;
  if (!sysId) return;
  const backlogs = await window.api.getBacklogs(sysId);
  const bl       = backlogs[backlogs.length-1];

  const wrap = $('sprint-backlog-preview');
  if (!wrap) return;

  if (!bl?.epics?.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">Kein Backlog vorhanden. Erst Backlog generieren.</div>';
    return;
  }

  const allStories = bl.epics.flatMap(e => e.features?.flatMap(f => f.stories||[])||[]);
  const total = allStories.reduce((s,x)=>s+(x.storyPoints||0),0);
  wrap.innerHTML = `<div style="font-size:12px;color:var(--t2)">
    ${bl.epics.length} Epics · ${allStories.length} Stories · ${total} Story Points gesamt
  </div>`;
}

async function loadSavedSprints() {
  const sysId = $('sprint-sys-sel')?.value || '';
  try {
    const url  = '/api/sprint/plans' + (sysId ? `?systemId=${sysId}` : '');
    const plans = await fetch(url, { credentials:'include' }).then(r=>r.json());
    renderSprintList(plans);
  } catch(e) {}
}

function renderSprintList(plans) {
  const wrap = $('sprint-list-wrap');
  if (!wrap) return;
  if (!plans.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="es-icon">🏃</div><h3>Noch keine Sprints</h3><p>KI erstellt Sprint-Pläne basierend auf Backlog und Team-Kapazität.</p></div>';
    return;
  }
  wrap.innerHTML = plans.map(p => `
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);margin-bottom:10px;overflow:hidden">
      <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid var(--b1)"
        onclick="toggleSprintDetail('sprint-${p.id}')">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(p.name)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">
            ${esc(p.systemName||'')} · ${p.duration||2} Wochen · ${p.totalPoints||0} SP · ${(p.stories||[]).length} Stories
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;padding:2px 9px;border-radius:99px;background:${
            p.status==='active'?'var(--grnbg)':p.status==='completed'?'var(--bluebg)':'var(--s2)'};
            color:${p.status==='active'?'var(--grn)':p.status==='completed'?'var(--blue)':'var(--t3)'}">
            ${p.status==='active'?'Aktiv':p.status==='completed'?'Abgeschlossen':'Geplant'}
          </span>
          <button class="btn-danger" style="font-size:10px;padding:3px 8px"
            onclick="event.stopPropagation();deleteSprintPlan('${p.id}')">✕</button>
        </div>
      </div>
      <div id="sprint-${p.id}" style="display:none;padding:12px 16px">
        ${renderSprintDetail(p)}
      </div>
    </div>`).join('');
}

function toggleSprintDetail(id) {
  const el = $(id);
  if (el) el.style.display = el.style.display==='none' ? '' : 'none';
}

function renderSprintDetail(plan) {
  const storyGroups = {};
  for (const s of (plan.stories||[])) {
    const dev = s.assignedTo || 'Nicht zugewiesen';
    if (!storyGroups[dev]) storyGroups[dev] = [];
    storyGroups[dev].push(s);
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:14px">
      <div class="stat-card"><span class="stat-n">${plan.totalPoints||0}</span><span class="stat-l">Story Points</span></div>
      <div class="stat-card"><span class="stat-n">${plan.duration||2}</span><span class="stat-l">Wochen</span></div>
      <div class="stat-card"><span class="stat-n">${plan.velocity||0}</span><span class="stat-l">Velocity SP/W</span></div>
      <div class="stat-card"><span class="stat-n">${Math.round((plan.totalPoints||0)/(plan.capacity||1)*100)}%</span><span class="stat-l">Auslastung</span></div>
    </div>
    ${plan.aiReasoning ? `
      <div style="background:var(--s2);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--t2);line-height:1.6">
        <strong style="color:var(--aa)">✦ KI-Begründung:</strong> ${esc(plan.aiReasoning)}
      </div>` : ''}
    ${Object.entries(storyGroups).map(([dev, stories]) => `
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:5px">${esc(dev)}</div>
        stories.map(s => "<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px">             <span style="font-size:11px;font-weight:700;color:var(--aa);min-width:28px">' + (s.storyPoints||'?') + ' SP</span>             <div style="flex:1">' + (esc(s.title)) + '</div>             <span class="sbadge p-' + (s.priority) + '" style="font-size:9px">' + (priLabel(s.priority)) + '</span>").join('')}
      </div>`).join('')}
    <div style="display:flex;gap:8px;margin-top:10px">
      ${plan.status!=='active' ? `<button class="btn-primary" style="font-size:11px" onclick="setSprintStatus('${plan.id}','active')">▶ Starten</button>` : ''}
      ${plan.status==='active' ? `<button class="btn-secondary" style="font-size:11px" onclick="setSprintStatus('${plan.id}','completed')">✓ Abschließen</button>` : ''}
      <button class="btn-secondary" style="font-size:11px" onclick="exportSprintPlan(${JSON.stringify(plan).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">↓ Export</button>
    </div>`;
}

function openCreateSprintModal() {
  const sysId = $('sprint-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  const devs = S.users.filter(u => (u.systems||[]).includes(sysId) && u.role==='developer');

  openModal('⚡ Sprint planen', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="frow"><label>Sprint-Name</label>
        <input type="text" id="sp-name" value="Sprint ${new Date().toLocaleDateString('de-DE',{month:'short',year:'numeric'})}" /></div>
      <div class="frow"><label>Dauer (Wochen)</label>
        <select id="sp-duration"><option value="1">1 Woche</option><option value="2" selected>2 Wochen</option><option value="3">3 Wochen</option><option value="4">4 Wochen</option></select>
      </div>
    </div>

    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
      Team-Kapazität (verfügbare Tage pro Entwickler)
    </div>
    <div id="sp-team-capacity" style="margin-bottom:14px">
      devs.length ? devs.map(d => "<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--b1)">           <span style="font-size:12px;flex:1">' + (esc(d.name)) + '</span>           <input type="number" id="sp-cap-' + (d.id) + '" value="10" min="0" max="14" style="width:60px;font-size:12px" />           <span style="font-size:11px;color:var(--t3)">Tage</span>").join("")}
      : '<div style="font-size:12px;color:var(--t3)">Keine Entwickler im System — Gesamtkapazität eingeben:</div>'}
      ${!devs.length ? '<input type="number" id="sp-cap-total" value="20" min="1" style="width:80px;font-size:12px;margin-top:6px"/> SP Gesamtkapazität' : ''}
    </div>

    <div class="frow" style="margin-bottom:8px">
      <label>Story Points pro Tag (Velocity)</label>
      <input type="number" id="sp-velocity" value="3" min="1" max="10" style="width:80px"/>
    </div>

    <div class="frow" style="margin-bottom:14px">
      <label>Fokus-Priorität</label>
      <select id="sp-focus">
        <option value="balanced">Ausgewogen</option>
        <option value="high_first">Höchste Priorität zuerst</option>
        <option value="quick_wins">Quick Wins (kleine Stories)</option>
        <option value="tech_debt">Technical Debt reduzieren</option>
      </select>
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" id="btn-generate-sprint" onclick="generateSprintPlan('${sysId}')">
        ✦ Sprint generieren
      </button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>
    <div id="sp-generate-status" style="margin-top:8px"></div>`);
}

async function generateSprintPlan(sysId) {
  setAPIContext('sprint', sysId);
  const btn  = $('btn-generate-sprint');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> KI plant Sprint …';

  const name     = $('sp-name')?.value || 'Sprint';
  const duration = parseInt($('sp-duration')?.value || '2');
  const velocity = parseInt($('sp-velocity')?.value || '3');
  const focus    = $('sp-focus')?.value || 'balanced';
  const devs     = S.users.filter(u=>(u.systems||[]).includes(sysId)&&u.role==='developer');

  // Kapazität berechnen
  let totalCapDays = 0;
  const teamCapacity = {};
  if (devs.length) {
    for (const d of devs) {
      const days = parseInt($(`sp-cap-${d.id}`)?.value || '10');
      teamCapacity[d.name] = days;
      totalCapDays += days;
    }
  } else {
    totalCapDays = parseInt($('sp-cap-total')?.value || '20');
  }
  const capacity = totalCapDays * velocity; // Total Story Points

  // Backlog laden
  const backlogs = await window.api.getBacklogs(sysId);
  const bl = backlogs[backlogs.length-1];
  if (!bl?.epics?.length) {
    $('sp-generate-status').innerHTML = '<span style="color:var(--red)">⚠ Kein Backlog vorhanden</span>';
    btn.disabled=false; btn.innerHTML='✦ Sprint generieren'; return;
  }

  const allStories = bl.epics.flatMap(ep =>
    (ep.features||[]).flatMap(f =>
      (f.stories||[]).map(s=>({...s, epicTitle:ep.title, featureTitle:f.title}))
    )
  );

  const storyList = allStories.map(s =>
    `- ${s.id}: "${s.title}" (${s.storyPoints||3} SP, ${s.priority}) [${s.epicTitle}]`
  ).join('\n');

  const teamInfo = devs.length
    ? `Team: ${devs.map(d => '${d.name} (${teamCapacity[d.name]||10} Tage, Bereiche: ${(d.subcategories||[]).join(\',\')||\'Allgemein\'})').join(', ')}`
    : `Gesamtkapazität: ${capacity} Story Points`;

  const res = await callAPI([{ role:'user', content:
    `Erstelle einen optimalen ${duration}-Wochen-Sprint-Plan. ${langNote()}

${teamInfo}
Kapazität: ${capacity} Story Points
Velocity: ${velocity} SP/Tag
Fokus: ${focus}

Wähle Stories aus dieser Liste aus (max. ${capacity} SP):
${storyList}

JSON ohne Backticks:
{
  "stories": [{
    "id": "US-1.1.1",
    "title": "...",
    "storyPoints": 5,
    "priority": "high",
    "assignedTo": "Entwickler-Name oder null",
    "reason": "Warum diese Story?"
  }],
  "totalPoints": 42,
  "reasoning": "Kurze Begründung der Sprint-Zusammenstellung",
  "risks": ["Mögliches Risiko 1"],
  "recommendations": ["Empfehlung 1"]
}` }], langNote(), 2000);

  btn.disabled=false; btn.innerHTML='✦ Sprint generieren';

  if (!res.ok) { $('sp-generate-status').innerHTML=`<span style="color:var(--red)">❌ ${esc(res.text)}</span>`; return; }

  try {
    const plan = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
    const sys  = S.systems.find(s=>s.id===sysId);
    const fullPlan = {
      id:           null,
      name,
      systemId:     sysId,
      systemName:   sys?.name || '',
      duration,
      velocity,
      capacity,
      focus,
      stories:      plan.stories || [],
      totalPoints:  plan.totalPoints || 0,
      aiReasoning:  plan.reasoning || '',
      risks:        plan.risks || [],
      recommendations: plan.recommendations || [],
      status:       'planned',
      createdAt:    Date.now(),
      teamCapacity,
    };

    // Speichern
    const saveRes = await fetch('api/sprint/plans', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(fullPlan),
    });
    const saved = await saveRes.json();

    closeModal();
    await loadSavedSprints();
    toast(`✅ Sprint "${name}" erstellt — ${plan.totalPoints} SP / ${capacity} SP Kapazität`);

    if (typeof addNotif === 'function')
      addNotif('🚀', 'Sprint-Plan erstellt', `${name}: ${plan.totalPoints} Story Points`, () => switchView('sprint-planning'));

    // HA-Webhook
    if (typeof notifDispatch === 'function')
      notifDispatch('sprint_ready', { title:name, systemName:sys?.name, userName:S.user.name });

  } catch(e) { toast('❌ Parsing-Fehler: ' + e.message); }
}

async function setSprintStatus(id, status) {
  const plans = await fetch('api/sprint/plans', {credentials:'include'}).then(r=>r.json());
  const plan  = plans.find(p=>p.id===id);
  if (!plan) return;
  plan.status = status;
  await fetch('api/sprint/plans', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(plan),
  });
  await loadSavedSprints();
  toast(`✅ Sprint ${status==='active'?'gestartet':'abgeschlossen'}`);
}

async function deleteSprintPlan(id) {
  if (!confirm('Sprint-Plan löschen?')) return;
  await fetch(`/api/sprint/plans/${id}`, {method:'DELETE',credentials:'include'});
  await loadSavedSprints();
  toast('✅ Gelöscht');
}

function exportSprintPlan(plan) {
  const e = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'Story-ID,Titel,Story Points,Priorität,Zugewiesen,Begründung\n';
  for (const s of (plan.stories||[]))
    csv += [s.id,s.title,s.storyPoints,s.priority,s.assignedTo||'',s.reason||''].map(e).join(',') + '\n';
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`sprint-${plan.name||'plan'}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Sprint exportiert');
}

window.loadSprintPlanning    = loadSprintPlanning;
window.loadSprintBacklog     = loadSprintBacklog;
window.openCreateSprintModal = openCreateSprintModal;
window.generateSprintPlan    = generateSprintPlan;
window.setSprintStatus       = setSprintStatus;
window.deleteSprintPlan      = deleteSprintPlan;
window.exportSprintPlan      = exportSprintPlan;
window.toggleSprintDetail    = toggleSprintDetail;
