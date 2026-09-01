'use strict';
const $ = window.$ || (id => document.getElementById(id));
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
  const done=mr.filter(r=>r.status==='done').length;
  const pct=mr.length?Math.round(done/mr.length*100):0;
  const circ=2*Math.PI*40;
  const dash=(pct/100*circ).toFixed(1);
  const wrap=$('pm-stats-row');wrap.className='stats-row';
  wrap.innerHTML=`<div class="stat-card donut-card">
      <svg width="82" height="82" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--s3)" stroke-width="9"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="url(#pmdonut)" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${dash} ${circ.toFixed(1)}" transform="rotate(-90 50 50)"/>
        <defs><linearGradient id="pmdonut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c93f8"/><stop offset="1" stop-color="#c77bf0"/></linearGradient></defs>
      </svg>
      <div class="donut-card-label"><span class="stat-n">${pct}%</span><span class="stat-l">Abgeschlossen</span></div>
    </div><div class="stat-card accent"><span class="stat-n">${mr.length}</span><span class="stat-l">Gesamt</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='open').length}</span><span class="stat-l">Offen</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='assigned').length}</span><span class="stat-l">Zugewiesen</span></div><div class="stat-card"><span class="stat-n">${done}</span><span class="stat-l">Erledigt</span></div>`;
  $('pm-systems-tabs').className='sys-tabs';
  $('pm-systems-tabs').innerHTML=my.map(s=>`<button class="sys-tab${s.id===S.pmActiveSystemId?' active':''}" onclick="pmSelSys('${s.id}')">${esc(s.name)}</button>`).join('');
  renderReqList('pm-req-list',mr.filter(r=>r.systemId===S.pmActiveSystemId),'pm');
}
async function pmSelSys(id){S.pmActiveSystemId=id;await loadPMDash();}

window.loadPMDash=loadPMDash;
window.pmSelSys=pmSelSys;
