'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * ba/diagrams.js
 * BPMN und Systemkontextdiagramme generieren, speichern, exportieren.
 */

/* ══ BA: DIAGRAMME ═══════════════════════════════════════════ */
async function loadBaDiagrams(){
  S.systems=await window.api.getSystems();S.diagrams=await window.api.getDiagrams('');
  const dss=$('diag-sys-sel');
  dss.innerHTML='<option value="">System (optional)</option>'+S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  renderDiagList();
  $('btn-new-diagram').onclick=()=>{S.activeDiagramId=null;$('diag-text-input').value='';$('diag-canvas').innerHTML='<div class="empty-state"><div class="es-icon">📊</div><h3>Text eingeben und generieren</h3></div>';};
  $('btn-gen-diagram').onclick=generateDiagram;
  $('btn-diag-save').onclick=saveDiagramDialog;
  $('btn-diag-export').onclick=exportDiagramSvg;
}
function renderDiagList(){
  const list=$('diag-list');list.innerHTML='';
  if(!S.diagrams.length){list.innerHTML='<div style="padding:14px;font-size:12px;color:var(--t3)">Keine Diagramme.</div>';return;}
  S.diagrams.forEach(d=>{
    const item=document.createElement('div');item.className='diag-list-item'+(S.activeDiagramId===d.id?' active':'');
    item.innerHTML=`<div><div class="diag-item-name">${esc(d.name)}</div><div class="diag-item-type">${d.type==='bpmn'?'BPMN':'Kontext'}</div></div><button class="diag-del-btn" onclick="event.stopPropagation();delDiagram('${d.id}')">✕</button>`;
    item.onclick=()=>{S.activeDiagramId=d.id;$('diag-text-input').value=d.description||'';$('diag-canvas').innerHTML=d.svg||'';renderDiagList();};
    list.appendChild(item);
  });
}
async function generateDiagram(){
  const type=$('diag-type-sel').value,text=$('diag-text-input').value.trim();
  if(!text){toast('⚠ Beschreibung eingeben');return;}
  const btn=$('btn-gen-diagram');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Generiere …';
  $('diag-canvas').innerHTML='<div class="empty-state"><div class="spin"></div><p>Generiere Diagramm …</p></div>';
  const bpmnPrompt=`Erstelle ein professionelles BPMN 2.0 Prozessdiagramm als SVG (Breite 900px):
- Swimlanes: horizontale Bereiche mit Label links, hellgrauer Hintergrund
- Tasks: abgerundete Rechtecke rx=8, weiß mit #6366f1 Rahmen
- Start-Event: grüner Kreis; End-Event: roter Kreis mit dickem Rand
- Gateways: Rauten #f59e0b
- Sequenzflüsse: Pfeile mit Beschriftungen
- Schrift: 12px sans-serif #1e1b4b; Hintergrund: #f8f9fc

Prozess:\n${text}\n\nNur SVG-Code, beginnend mit <svg`;
  const ctxPrompt=`Erstelle ein Systemkontextdiagramm als SVG (800×600px):
- Zentrales System: Rechteck Mitte, violetter Hintergrund #6366f1, weiße Schrift
- Externe Akteure: Ovale, grau #f3f4f6 mit dunklem Rand, um das System herum
- Datenflüsse: beschriftete Pfeile
- Schrift: 13px sans-serif #1e1b4b; Hintergrund: #f8f9fc

System:\n${text}\n\nNur SVG-Code, beginnend mit <svg`;
  const res=await callAPI([{role:'user',content:type==='bpmn'?bpmnPrompt:ctxPrompt}],'Erstelle nur SVG, keine Erklärungen.',3000);
  btn.disabled=false;btn.innerHTML='⚡ Diagramm generieren';
  if(!res.ok){toast('❌ '+res.text);return;}
  const svg=res.text.includes('<svg')?res.text.substring(res.text.indexOf('<svg')):res.text;
  $('diag-canvas').innerHTML=svg;toast('✅ Diagramm generiert');
}
async function saveDiagramDialog(){
  const svg=$('diag-canvas').innerHTML;if(!svg.includes('<svg')){toast('⚠ Kein Diagramm');return;}
  const existing=S.diagrams.find(d=>d.id===S.activeDiagramId);
  openModal('Diagramm speichern',`
    <div class="frow"><label>Name</label><input type="text" id="dg-name" value="${esc(existing?.name||'')}" placeholder="z.B. Bestellprozess"/></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="doSaveDiagram()">Speichern</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
  window._pendDiag={svg,desc:$('diag-text-input').value.trim(),type:$('diag-type-sel').value,systemId:$('diag-sys-sel').value||null};
}
async function doSaveDiagram(){
  const name=$('dg-name').value.trim();if(!name){toast('⚠ Name erforderlich');return;}
  const p=window._pendDiag;
  await window.api.saveDiagram({id:S.activeDiagramId||null,name,type:p.type,description:p.desc,svg:p.svg,systemId:p.systemId});
  S.diagrams=await window.api.getDiagrams('');renderDiagList();closeModal();toast('✅ Diagramm gespeichert');
}
async function delDiagram(id){if(!confirm('Löschen?'))return;await window.api.deleteDiagram(id);S.diagrams=await window.api.getDiagrams('');renderDiagList();toast('✅ Gelöscht');}
async function exportDiagramSvg(){const svg=$('diag-canvas').innerHTML;if(!svg.includes('<svg')){toast('⚠ Kein Diagramm');return;}await window.api.exportDiagramSvg({filename:'diagram.svg',svg});toast('✅ SVG exportiert');}

window.loadBaDiagrams    = loadBaDiagrams;
window.generateDiagram   = generateDiagram;
window.saveDiagramDialog = saveDiagramDialog;
window.doSaveDiagram     = doSaveDiagram;
window.delDiagram        = delDiagram;
window.exportDiagramSvg  = exportDiagramSvg;
window.renderDiagList    = renderDiagList;

// ── Window Globals ──────────────────────────────────────────
