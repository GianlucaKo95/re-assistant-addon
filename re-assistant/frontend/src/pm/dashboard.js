'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * pm/dashboard.js
 * PM Dashboard — Statistiken, System-Tabs, Anforderungs-Übersicht.
 */

/* ══ PM: DASHBOARD ═══════════════════════════════════════════ */
async function loadPMDash(){
  const my=S.systems.filter(s=>(S.user.systems||[]).includes(s.id));
  if(!S.pmActiveSystemId&&my.length)S.pmActiveSystemId=my[0].id;
  S.requirements=await window.api.getRequirements({});
  const mr=S.requirements.filter(r=>my.some(s=>s.id===r.systemId));
  const wrap=$('pm-stats-row');wrap.className='stats-row';
  wrap.innerHTML=`<div class="stat-card accent"><span class="stat-n">${mr.length}</span><span class="stat-l">Gesamt</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='open').length}</span><span class="stat-l">Offen</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='assigned').length}</span><span class="stat-l">Zugewiesen</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='done').length}</span><span class="stat-l">Erledigt</span></div>`;
  $('pm-systems-tabs').className='sys-tabs';
  $('pm-systems-tabs').innerHTML=my.map(s=>`<button class="sys-tab${s.id===S.pmActiveSystemId?' active':''}" onclick="pmSelSys('${s.id}')">${esc(s.name)}</button>`).join('');
  renderReqList('pm-req-list',mr.filter(r=>r.systemId===S.pmActiveSystemId),'pm');
}
async function pmSelSys(id){S.pmActiveSystemId=id;await loadPMDash();}

window.loadPMDash=loadPMDash;
window.pmSelSys=pmSelSys;
