'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/completeness.js
 * O: Vollständigkeitsprüfung — KI erkennt fehlende Anforderungen gegen Branchen-Standards.
 */

// ── Branchen-Checklisten ──────────────────────────────────────
const COMPLETENESS_TEMPLATES = {
  general: {
    label: 'Allgemein (Software)',
    categories: ['Funktional','Nicht-funktional','Sicherheit','Performance','Datenschutz','Fehlerbehandlung','Logging','API/Schnittstellen','Deployment','Wartbarkeit'],
  },
  ecommerce: {
    label: 'E-Commerce',
    categories: ['Produktkatalog','Warenkorb','Checkout','Zahlung','Benutzer-Authentifizierung','Bestellverwaltung','Versand','Retouren','Datenschutz (DSGVO)','Performance','Sicherheit (PCI DSS)','Mobile','SEO'],
  },
  banking: {
    label: 'Banking / Fintech',
    categories: ['Authentifizierung (MFA)','Autorisierung','Verschlüsselung','Audit-Trail','Vier-Augen-Prinzip','Datenhaltung','Reporting','Compliance (MaRisk)','Fehlerbehandlung','Notfallkonzept','API-Sicherheit'],
  },
  healthcare: {
    label: 'Healthcare / MDR',
    categories: ['Patientendaten-Sicherheit','Authentifizierung','Rollenkonzept','Audit-Trail','Datenschutz','Fehlerbehandlung','Systemverfügbarkeit','Datensicherung','Regulatorische Compliance','Usability'],
  },
  mobile: {
    label: 'Mobile App',
    categories: ['Onboarding','Authentifizierung','Offline-Fähigkeit','Push-Benachrichtigungen','Datenschutz','Performance','Fehlerbehandlung','Accessibility','Updates','Analytics'],
  },
};

async function loadCompleteness() {
  S.systems = await window.api.getSystems();
  const sel = $('comp-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
  const tmplSel = $('comp-template-sel');
  if (tmplSel) {
    tmplSel.innerHTML = Object.entries(COMPLETENESS_TEMPLATES)
      .map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('');
  }
  $('btn-run-completeness').onclick = runCompletenessCheck;
}

async function runCompletenessCheck() {
  setAPIContext('completeness', sysId);
  const sysId    = $('comp-sys-sel')?.value;
  const template = $('comp-template-sel')?.value || 'general';
  if (!sysId) { toast('⚠ System auswählen'); return; }

  const btn = $('btn-run-completeness');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Prüfe …';

  const reqs = await window.api.getRequirements({ systemId: sysId });
  const sys  = S.systems.find(s=>s.id===sysId);
  const tmpl = COMPLETENESS_TEMPLATES[template] || COMPLETENESS_TEMPLATES.general;

  const reqList = reqs.map(r=>
    `${r.id} [${r.category}]: ${r.title}`
  ).join('\n');

  const res = await callAPI([{ role:'user', content:
    `Du bist ein Requirements-Experte. Prüfe ob diese Anforderungsliste vollständig ist für ein ${tmpl.label}-System. ${langNote()}

Prüfe folgende Kategorien auf Vollständigkeit: ${tmpl.categories.join(', ')}

Antworte NUR mit JSON ohne Backticks:
{
  "overallScore": 72,
  "categories": [
    {
      "name": "Authentifizierung",
      "status": "complete|partial|missing",
      "coverage": 85,
      "existingReqIds": ["REQ-001"],
      "gaps": ["Passwort-Reset fehlt", "MFA nicht spezifiziert"],
      "suggestedRequirements": [
        {
          "title": "Passwort zurücksetzen",
          "description": "Nutzer sollen ihr Passwort per E-Mail-Link zurücksetzen können.",
          "priority": "high",
          "category": "Sicherheit"
        }
      ]
    }
  ],
  "criticalGaps": ["Fehlerbehandlung fehlt vollständig", "Kein Logging definiert"],
  "summary": "Kurze Management-Zusammenfassung"
}

status: complete = >80% abgedeckt, partial = 20-80%, missing = <20%

Bestehende Anforderungen:
${reqList || '(keine Anforderungen vorhanden)'}

System: ${sys?.name || ''} — ${sys?.description || ''}` }], langNote(), 3000);

  btn.disabled=false; btn.innerHTML='🔍 Vollständigkeit prüfen';

  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const result = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    renderCompletenessResult(result, sysId);
    if (typeof addNotif==='function')
      addNotif('🔍', 'Vollständigkeitsprüfung', `Score: ${result.overallScore}% — ${(result.criticalGaps||[]).length} kritische Lücken`, ()=>switchView('completeness'));
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function renderCompletenessResult(result, sysId) {
  const wrap = $('comp-results');
  if (!wrap) return;

  const scoreCol = result.overallScore>=80?'var(--grn)':result.overallScore>=50?'var(--amb)':'var(--red)';
  const statusIcons = { complete:'✅', partial:'⚠', missing:'❌' };
  const statusCols  = { complete:'var(--grn)', partial:'var(--amb)', missing:'var(--red)' };

  wrap.innerHTML = `
    <!-- Overall Score -->
    <div style="text-align:center;padding:20px;border-bottom:1px solid var(--b1)">
      <div style="font-size:52px;font-weight:700;color:${scoreCol}">${result.overallScore}%</div>
      <div style="font-size:13px;color:var(--t2);margin-top:4px">Vollständigkeit</div>
      <div style="width:200px;height:8px;background:var(--s3);border-radius:4px;margin:10px auto 0;overflow:hidden">
        <div style="height:100%;width:${result.overallScore}%;background:${scoreCol};border-radius:4px;transition:width .6s"></div>
      </div>
    </div>

    <!-- Summary -->
    ${result.summary ? `
      <div style="padding:12px 16px;border-bottom:1px solid var(--b1);font-size:13px;color:var(--t2);line-height:1.6">
        ${esc(result.summary)}
      </div>` : ''}

    <!-- Critical Gaps -->
    ${(result.criticalGaps||[]).length ? `
      <div style="padding:12px 16px;border-bottom:1px solid var(--b1);background:var(--redbg)">
        <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;margin-bottom:8px">
          🚨 Kritische Lücken (${result.criticalGaps.length})
        </div>
        ${result.criticalGaps.map(g=>`<div style="font-size:12px;color:var(--red);padding:3px 0">• ${esc(g)}</div>`).join('')}
      </div>` : ''}

    <!-- Kategorien -->
    <div style="padding:12px 16px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
        Analyse nach Kategorie
      </div>
      ${(result.categories||[]).map(cat => `
        <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);margin-bottom:8px;overflow:hidden">
          <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer"
            onclick="toggleCompCat('cc-${cat.name.replace(/\W/g,'_')}')">
            <span style="font-size:16px">${statusIcons[cat.status]||'⚠'}</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${esc(cat.name)}</div>
              <div style="height:4px;background:var(--s3);border-radius:2px;margin-top:5px;overflow:hidden">
                <div style="height:100%;width:${cat.coverage||0}%;background:${statusCols[cat.status]||'var(--t3)'};border-radius:2px"></div>
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${statusCols[cat.status]||'var(--t3)'}">${cat.coverage||0}%</span>
          </div>
          <div id="cc-${cat.name.replace(/\W/g,'_')}" style="display:none;padding:0 14px 12px">
            ${(cat.gaps||[]).length ? `
              <div style="font-size:11px;font-weight:700;color:var(--amb);margin-bottom:6px">Lücken:</div>
              ${cat.gaps.map(g=>`<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(g)}</div>`).join('')}` : ''}
            ${(cat.suggestedRequirements||[]).length ? `
              <div style="font-size:11px;font-weight:700;color:var(--aa);margin:10px 0 6px">✦ Vorgeschlagene Anforderungen:</div>
              ${cat.suggestedRequirements.map((s,si) => `
                <div style="background:var(--bg);border:1px solid var(--b1);border-radius:var(--r);padding:8px 10px;margin-bottom:5px">
                  <div style="font-size:12px;font-weight:600">${esc(s.title)}</div>
                  <div style="font-size:11px;color:var(--t2);margin-top:3px">${esc((s.description||'').substring(0,100))}</div>
                  <button class="btn-secondary" style="font-size:10px;padding:3px 9px;margin-top:6px"
                    onclick="addSuggestedReq('${sysId}',${JSON.stringify(s).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
                    + Hinzufügen
                  </button>
                </div>`).join('')}` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

function toggleCompCat(id) {
  const el = $(id);
  if (el) el.style.display = el.style.display==='none' ? '' : 'none';
}

async function addSuggestedReq(sysId, suggestion) {
  await window.api.saveRequirement({
    id:          'REQ-COMP-' + Date.now(),
    systemId:    sysId,
    title:       suggestion.title,
    description: suggestion.description || '',
    category:    suggestion.category || 'Nicht-funktional',
    priority:    suggestion.priority || 'medium',
    rationale:   'Aus Vollständigkeitsprüfung generiert',
    tags:        ['vollständigkeit'],
    status:      'open',
    createdBy:   S.user.id,
    createdByName: S.user.name,
  });
  toast(`✅ "${suggestion.title.substring(0,40)}" hinzugefügt`);
}

window.loadCompleteness         = loadCompleteness;
window.runCompletenessCheck     = runCompletenessCheck;
window.toggleCompCat            = toggleCompCat;
window.addSuggestedReq          = addSuggestedReq;
window.COMPLETENESS_TEMPLATES   = COMPLETENESS_TEMPLATES;

// ── Window Globals ──────────────────────────────────────────
window.renderCompletenessResult = renderCompletenessResult;
