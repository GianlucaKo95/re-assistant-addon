'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/onboarding.js
 * Onboarding-Wizard — erster Start, System anlegen, erste Anforderungen.
 * Wird automatisch nach Login angezeigt wenn noch kein Setup vorhanden.
 */

async function checkAndShowOnboarding() {
  try {
    const status = await fetch('/api/onboarding/status', { credentials:'include' }).then(r=>r.json());
    if (!status.complete && !status.steps.hasRequirements) {
      showOnboardingWizard(status);
    }
  } catch(e) { /* Onboarding-Fehler ignorieren */ }
}

function showOnboardingWizard(status) {
  // Overlay über die App legen
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(5,5,12,.9);z-index:500;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);`;
  overlay.innerHTML = `
    <div id="onboarding-box" style="
      width:min(580px,95vw);background:var(--s1);border:1px solid var(--b2);
      border-radius:20px;box-shadow:0 40px 80px rgba(0,0,0,.5);
      overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
      <div id="onboarding-content" style="flex:1;overflow-y:auto"></div>
    </div>`;
  document.body.appendChild(overlay);
  window._onboardingStep = 1;
  window._onboardingData = {};
  renderOnboardingStep(1);
}

function renderOnboardingStep(step) {
  const steps = {
    1: renderWelcome,
    2: renderCreateSystem,
    3: renderAddReqs,
    4: renderInviteHint,
    5: renderDone,
  };
  const fn = steps[step];
  if (fn) fn();
}

function renderWelcome() {
  $('onboarding-content').innerHTML = `
    <div style="padding:40px 36px;text-align:center">
      <div style="font-size:52px;margin-bottom:16px">🧠</div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Willkommen beim RE-Assistenten</h1>
      <p style="font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:24px">
        Ihr KI-gestütztes Requirements Engineering Tool.<br>
        Wir richten alles in 3 kurzen Schritten ein.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:28px">
        ${[
          { icon:'📋', label:'System anlegen', desc:'Ihr erstes Projekt' },
          { icon:'✦',  label:'Anforderungen', desc:'KI hilft beim Erfassen' },
          { icon:'🚀', label:'Loslegen',       desc:'Sofort produktiv' },
        ].map((s,i) => `
          <div style="background:var(--s2);border-radius:12px;padding:14px 10px;text-align:center">
            <div style="font-size:24px;margin-bottom:6px">${s.icon}</div>
            <div style="font-size:12px;font-weight:600">${esc(s.label)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(s.desc)}</div>
          </div>`).join('')}
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;font-size:14px" onclick="nextOnboardingStep()">
        Einrichtung starten →
      </button>
      <button onclick="skipOnboarding()" style="background:none;border:none;color:var(--t3);font-size:12px;cursor:pointer;margin-top:12px;display:block;width:100%">
        Überspringen — ich richte das selbst ein
      </button>
    </div>`;
}

function renderCreateSystem() {
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(1, 3, '📁', 'System anlegen', 'Ein System ist ein Projekt oder eine Softwarekomponente.')}
      <div class="frow" style="margin-bottom:14px">
        <label>Name des Systems</label>
        <input type="text" id="ob-sys-name" placeholder="z.B. Kundenverwaltung, Mobile App, API-Gateway …"
          style="font-size:14px" autofocus/>
      </div>
      <div class="frow" style="margin-bottom:20px">
        <label>Kurze Beschreibung</label>
        <textarea id="ob-sys-desc" rows="3" placeholder="Was macht dieses System? Für wen ist es gedacht?"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" id="ob-create-sys-btn" onclick="onboardingCreateSystem()">
          System anlegen →
        </button>
      </div>
    </div>`;
  $('ob-sys-name').focus();
  $('ob-sys-name').onkeydown = e => { if (e.key==='Enter') onboardingCreateSystem(); };
}

async function onboardingCreateSystem() {
  const name = $('ob-sys-name')?.value.trim();
  const desc = $('ob-sys-desc')?.value.trim();
  if (!name) { $('ob-sys-name').style.borderColor='var(--red)'; return; }
  const btn = $('ob-create-sys-btn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  const id = 'sys-' + Date.now();
  await window.api.saveSystem({ id, name, description:desc });
  S.systems = await window.api.getSystems();
  window._onboardingData.systemId   = id;
  window._onboardingData.systemName = name;
  nextOnboardingStep();
}

function renderAddReqs() {
  const sysName = window._onboardingData.systemName || 'Ihr System';
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(2, 3, '✦', 'Erste Anforderungen', `KI hilft Ihnen beim Erfassen der Anforderungen für "${sysName}".`)}

      <div style="background:var(--s2);border-radius:12px;padding:14px;margin-bottom:14px;font-size:13px;color:var(--t2);line-height:1.6">
        💡 Beschreiben Sie kurz was das System können soll — die KI strukturiert es automatisch.
      </div>

      <div class="frow" style="margin-bottom:8px">
        <label>Was soll "${esc(sysName)}" können?</label>
        <textarea id="ob-req-text" rows="5"
          placeholder="Beispiel: Nutzer sollen sich mit E-Mail und Passwort anmelden können. Das System soll Kundendaten verwalten und Berichte generieren. Bei Fehlern soll eine verständliche Meldung erscheinen …"></textarea>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn-secondary" style="flex:1" onclick="onboardingSkipReqs()">Später manuell hinzufügen</button>
        <button class="btn-primary" style="flex:1" id="ob-gen-reqs-btn" onclick="onboardingGenerateReqs()">
          ✦ KI extrahieren
        </button>
      </div>

      <div id="ob-req-preview"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px" id="ob-req-nav" style="display:none">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" id="ob-save-reqs-btn" onclick="onboardingSaveReqs()">Speichern →</button>
      </div>
      <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="prevOnboardingStep()">← Zurück</button>
    </div>`;
}

async function onboardingGenerateReqs() {
  const text = $('ob-req-text')?.value.trim();
  if (!text) { toast('⚠ Bitte erst beschreiben was das System können soll'); return; }
  const btn = $('ob-gen-reqs-btn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Analysiere …';

  const res = await callAPI([{ role:'user', content:
    `Extrahiere strukturierte Anforderungen aus dieser Beschreibung. ${langNote()}
JSON-Array ohne Backticks:
[{"title":"...","description":"...","category":"Funktional","priority":"medium","rationale":""}]
Max. 8 Anforderungen.

Beschreibung: "${text}"` }], langNote(), 1200);

  btn.disabled=false; btn.innerHTML='✦ KI extrahieren';
  if (!res.ok) { toast('❌ ' + res.text); return; }

  try {
    const reqs = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    window._onboardingData.generatedReqs = reqs;

    $('ob-req-preview').innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--aa);margin-bottom:8px">
        ✓ ${reqs.length} Anforderungen erkannt:
      </div>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--b1);border-radius:10px">
        ${reqs.map((r,i) => `
          <div style="padding:9px 12px;border-bottom:1px solid var(--b1);display:flex;gap:8px;align-items:center">
            <input type="checkbox" checked id="ob-req-cb-${i}"/>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
              <div style="font-size:11px;color:var(--t3)">${esc(r.category)} · ${esc(r.priority)}</div>
            </div>
          </div>`).join('')}
      </div>`;
    $('ob-req-nav').style.display='grid';
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

async function onboardingSaveReqs() {
  const reqs = window._onboardingData.generatedReqs || [];
  const sysId = window._onboardingData.systemId;
  if (!sysId) return;
  let saved = 0;
  for (let i=0; i<reqs.length; i++) {
    if ($(`ob-req-cb-${i}`)?.checked !== false) {
      await window.api.saveRequirement({
        ...reqs[i],
        id: 'REQ-'+Date.now()+'-'+i,
        systemId: sysId,
        createdBy: S.user.id,
        createdByName: S.user.name,
        status: 'open',
      });
      saved++;
    }
  }
  toast(`✅ ${saved} Anforderungen gespeichert`);
  nextOnboardingStep();
}

function onboardingSkipReqs() { nextOnboardingStep(); }

function renderInviteHint() {
  $('onboarding-content').innerHTML = `
    <div style="padding:36px">
      ${onboardingHeader(3, 3, '👥', 'Team einladen', 'Laden Sie Kollegen mit verschiedenen Rollen ein.')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
        ${[
          { role:'Business',         icon:'💼', desc:'Prozesse beschreiben, Anforderungen erfassen' },
          { role:'Business Analyst', icon:'🔬', desc:'QS-Prüfung, Diagramme, Workshops' },
          { role:'Projektmanager',   icon:'📊', desc:'Backlog, Priorisierung, Jira-Export' },
          { role:'Entwickler',       icon:'👨‍💻', desc:'Aufgaben einsehen, Code-Analyse' },
        ].map(r => `
          <div style="background:var(--s2);border-radius:10px;padding:12px">
            <div style="font-size:18px;margin-bottom:4px">${r.icon}</div>
            <div style="font-size:12px;font-weight:600">${esc(r.role)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px;line-height:1.4">${esc(r.desc)}</div>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--t3);margin-bottom:16px">
        Benutzer können unter <strong>Einstellungen → Benutzerverwaltung</strong> angelegt werden.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn-secondary" onclick="prevOnboardingStep()">← Zurück</button>
        <button class="btn-primary" onclick="nextOnboardingStep()">Weiter →</button>
      </div>
    </div>`;
}

function renderDone() {
  const sysName = window._onboardingData.systemName;
  const reqCount = (window._onboardingData.generatedReqs||[]).length;
  $('onboarding-content').innerHTML = `
    <div style="padding:40px 36px;text-align:center">
      <div style="font-size:52px;margin-bottom:16px">🎉</div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Alles bereit!</h1>
      <p style="font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:20px">
        ${sysName ? `System "<strong>${esc(sysName)}</strong>" wurde angelegt.` : ''}
        ${reqCount ? ` ${reqCount} Anforderungen wurden erfasst.` : ''}
        <br>Sie können jetzt sofort loslegen.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        ${[
          { icon:'💬', label:'Chat starten — mit KI Anforderungen besprechen', view:'business-chat' },
          { icon:'🔬', label:'QS-Prüfung durchführen', view:'ba-quality' },
          { icon:'📊', label:'Backlog erstellen', view:'pm-backlog' },
        ].map(a => `
          <button class="btn-secondary" style="text-align:left;padding:12px 14px"
            onclick="finishOnboarding('${a.view}')">
            <span style="margin-right:8px">${a.icon}</span>${esc(a.label)}
          </button>`).join('')}
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;font-size:14px"
        onclick="finishOnboarding()">
        Zum Dashboard
      </button>
    </div>`;
}

async function finishOnboarding(targetView) {
  await fetch('/api/onboarding/complete', { method:'POST', credentials:'include' });
  document.getElementById('onboarding-overlay')?.remove();
  if (targetView) switchView(targetView);
  else {
    S.systems = await window.api.getSystems();
    switchView(S.user.role === 'business' ? 'business-chat' :
               S.user.role === 'businessanalyst' ? 'ba-dashboard' :
               S.user.role === 'projectmanager' ? 'pm-dashboard' : 'dev-work');
  }
  if (typeof addNotif === 'function')
    addNotif('🎉', 'Einrichtung abgeschlossen', 'RE-Assistent ist bereit');
}

async function skipOnboarding() {
  await fetch('/api/onboarding/complete', { method:'POST', credentials:'include' });
  document.getElementById('onboarding-overlay')?.remove();
}

function nextOnboardingStep() {
  window._onboardingStep = (window._onboardingStep || 1) + 1;
  renderOnboardingStep(window._onboardingStep);
}
function prevOnboardingStep() {
  window._onboardingStep = Math.max(1, (window._onboardingStep || 1) - 1);
  renderOnboardingStep(window._onboardingStep);
}

function onboardingHeader(step, total, icon, title, subtitle) {
  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        ${Array.from({length:total}).map((_,i)=>`
          <div style="height:4px;flex:1;border-radius:2px;background:${i<step?'var(--aa)':'var(--s3)'}"></div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Schritt ${step} von ${total}</div>
      <div style="font-size:28px;margin-bottom:8px">${icon}</div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(title)}</h2>
      <p style="font-size:13px;color:var(--t2)">${subtitle}</p>
    </div>`;
}

window.checkAndShowOnboarding = checkAndShowOnboarding;
window.nextOnboardingStep     = nextOnboardingStep;
window.prevOnboardingStep     = prevOnboardingStep;
window.onboardingCreateSystem = onboardingCreateSystem;
window.onboardingGenerateReqs = onboardingGenerateReqs;
window.onboardingSaveReqs     = onboardingSaveReqs;
window.onboardingSkipReqs     = onboardingSkipReqs;
window.finishOnboarding       = finishOnboarding;
window.skipOnboarding         = skipOnboarding;
