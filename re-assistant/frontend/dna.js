'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/changelog.js
 * N: Changelog-Generierung — aus Änderungen ein lesbares Management-Dokument.
 */

async function loadChangelog() {
  S.systems = await window.api.getSystems();
  const sel = $('cl-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = () => $('cl-preview').innerHTML = '';
  }
  $('btn-gen-changelog').onclick = generateChangelog;
}

async function generateChangelog() {
  setAPIContext('changelog');
  const sysId = $('cl-sys-sel')?.value || '';
  const period = $('cl-period')?.value || '7';
  const btn  = $('btn-gen-changelog');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Generiere …';

  const since = Date.now() - parseInt(period) * 24*60*60*1000;
  const reqs  = await window.api.getRequirements(sysId ? {systemId:sysId} : {});

  // Änderungen der Periode sammeln
  const changes = [];
  for (const r of reqs) {
    // Kürzlich aktualisierte Anforderungen
    if (r.updatedAt > since) {
      const hist = r.history || [];
      const recentHist = hist.filter(h => h.changedAt > since);
      changes.push({
        type: recentHist.length > 0 ? 'updated' : 'created',
        req:  r, changes: recentHist,
        sys:  S.systems.find(s=>s.id===r.systemId)?.name || '',
      });
    }
    // Kürzlich erstellte AC
    const newAC = (r.acceptanceCriteria||[]).filter(ac => ac.createdAt > since);
    if (newAC.length) changes.push({ type:'ac_added', req:r, acCount:newAC.length, sys:S.systems.find(s=>s.id===r.systemId)?.name||'' });
    // Review-Status-Änderungen
    if (r.reviewedAt > since) changes.push({ type:'review_'+r.reviewStatus, req:r, sys:S.systems.find(s=>s.id===r.systemId)?.name||'' });
  }

  btn.disabled=false; btn.innerHTML='📋 Changelog generieren';

  if (!changes.length) {
    $('cl-preview').innerHTML = '<div class="empty-state"><h3>Keine Änderungen im Zeitraum</h3><p>Im gewählten Zeitraum wurden keine Anforderungen bearbeitet.</p></div>';
    return;
  }

  // KI fasst zusammen
  const summary = changes.slice(0,50).map(c => {
    const t = { updated:'aktualisiert', created:'erstellt', ac_added:'AC hinzugefügt', review_approved:'freigegeben', review_rejected:'abgelehnt', review_in_review:'in Review' };
    return `- ${t[c.type]||c.type}: "${c.req.title}" (${c.req.id}) [${c.sys}]`;
  }).join('\n');

  const res = await callAPI([{ role:'user', content:
    `Erstelle ein professionelles Changelog für Management und Stakeholder. ${langNote()}

Zeitraum: letzte ${period} Tage
Änderungen:
${summary}

Antworte mit JSON ohne Backticks:
{
  "title": "Changelog [Datum]",
  "summary": "Executive Summary (2-3 Sätze)",
  "highlights": ["Wichtigste Änderung 1", "Wichtigste Änderung 2"],
  "sections": [
    {
      "title": "Neue Anforderungen",
      "items": [{"id": "REQ-001", "title": "...", "note": "Kurze Erläuterung"}]
    },
    {
      "title": "Aktualisierungen",
      "items": [...]
    },
    {
      "title": "Freigegebene Anforderungen",
      "items": [...]
    }
  ],
  "stats": {"created": 3, "updated": 7, "approved": 2},
  "nextSteps": ["Empfehlung für die nächste Periode"]
}` }], langNote(), 1800);

  if (!res.ok) { toast('❌ ' + res.text); return; }

  try {
    const cl = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    renderChangelog(cl, changes, period);
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function renderChangelog(cl, changes, period) {
  const wrap = $('cl-preview');
  if (!wrap) return;

  wrap.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rxl);overflow:hidden">
      <!-- Header -->
      <div style="padding:20px 24px;background:linear-gradient(135deg,rgba(168,85,247,.1),transparent);border-bottom:1px solid var(--b1)">
        <div style="font-size:20px;font-weight:700;margin-bottom:6px">${esc(cl.title)}</div>
        <div style="font-size:13px;color:var(--t2);line-height:1.6">${esc(cl.summary||'')}</div>
      </div>

      <!-- Stats -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--b1)">
        ${Object.entries(cl.stats||{}).map(([k,v]) => `
          <div style="flex:1;padding:12px 16px;text-align:center;border-right:1px solid var(--b1)">
            <div style="font-size:22px;font-weight:700;color:var(--aa)">${v}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(k)}</div>
          </div>`).join('')}
      </div>

      <!-- Highlights -->
      ${(cl.highlights||[]).length ? `
        <div style="padding:14px 20px;border-bottom:1px solid var(--b1);background:rgba(168,85,247,.04)">
          <div style="font-size:11px;font-weight:700;color:var(--aa);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Highlights</div>
          ${cl.highlights.map(h=>`<div style="font-size:13px;padding:4px 0;display:flex;gap:8px"><span>⭐</span>${esc(h)}</div>`).join('')}
        </div>` : ''}

      <!-- Sections -->
      ${(cl.sections||[]).filter(s=>s.items?.length).map(sec => `
        <div style="padding:14px 20px;border-bottom:1px solid var(--b1)">
          <div style="font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
            ${esc(sec.title)} (${sec.items.length})
          </div>
          ${sec.items.map(item => `
            <div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--b1)">
              <code style="font-size:10px;color:var(--aa);flex-shrink:0;margin-top:2px">${esc(item.id||'')}</code>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:500">${esc(item.title||'')}</div>
                ${item.note ? `<div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(item.note)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>`).join('')}

      <!-- Next Steps -->
      ${(cl.nextSteps||[]).length ? `
        <div style="padding:14px 20px;background:var(--s2)">
          <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Nächste Schritte</div>
          ${cl.nextSteps.map(s=>`<div style="font-size:12px;color:var(--t2);padding:3px 0;display:flex;gap:7px"><span>→</span>${esc(s)}</div>`).join('')}
        </div>` : ''}
    </div>

    <!-- Export-Buttons -->
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-primary" style="font-size:12px" onclick="exportChangelogMD(${JSON.stringify(cl).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
        ↓ Markdown
      </button>
      <button class="btn-secondary" style="font-size:12px" onclick="exportChangelogHTML(${JSON.stringify(cl).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
        ↓ HTML
      </button>
    </div>`;
}

function exportChangelogMD(cl) {
  let md = `# ${cl.title}\n\n`;
  md += `${cl.summary||''}\n\n`;
  if (cl.highlights?.length) {
    md += `## ⭐ Highlights\n${cl.highlights.map(h=>`- ${h}`).join('\n')}\n\n`;
  }
  for (const sec of (cl.sections||[])) {
    if (!sec.items?.length) continue;
    md += `## ${sec.title}\n`;
    for (const item of sec.items) md += `- **${item.id}**: ${item.title}${item.note?` — ${item.note}`:''}\n`;
    md += '\n';
  }
  if (cl.nextSteps?.length) md += `## Nächste Schritte\n${cl.nextSteps.map(s=>`- ${s}`).join('\n')}\n`;
  const blob = new Blob([md],{type:'text/markdown'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`changelog-${Date.now()}.md`; a.click();
  URL.revokeObjectURL(a.href); toast('✅ Markdown exportiert');
}

function exportChangelogHTML(cl) {
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${cl.title}</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:800px;margin:40px auto;color:#1e1b4b;line-height:1.6}
h1{color:#6366f1}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
.stat{display:inline-block;background:#f0f1ff;border-radius:8px;padding:10px 20px;margin:4px;text-align:center}
.stat-n{display:block;font-size:24px;font-weight:700;color:#6366f1}li{margin:4px 0}</style></head><body>
<h1>${cl.title}</h1><p>${cl.summary||''}</p>
${Object.entries(cl.stats||{}).map(([k,v])=>`<div class="stat"><span class="stat-n">${v}</span>${k}</div>`).join('')}
${(cl.sections||[]).map(s=>`<h2>${s.title}</h2><ul>${(s.items||[]).map(i=>`<li><strong>${i.id}</strong>: ${i.title}${i.note?` — <em>${i.note}</em>`:''}</li>`).join('')}</ul>`).join('')}
</body></html>`;
  const blob = new Blob([html],{type:'text/html'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`changelog-${Date.now()}.html`; a.click();
  URL.revokeObjectURL(a.href); toast('✅ HTML exportiert');
}

window.loadChangelog       = loadChangelog;
window.generateChangelog   = generateChangelog;
window.exportChangelogMD   = exportChangelogMD;
window.exportChangelogHTML = exportChangelogHTML;
