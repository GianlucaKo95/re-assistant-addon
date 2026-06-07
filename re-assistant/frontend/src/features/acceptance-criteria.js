'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/acceptance-criteria.js
 * Nr. 6: Akzeptanzkriterien-Generator
 * KI schreibt sofort 3-5 konkrete, testbare AC pro Anforderung.
 */

/**
 * Öffnet das AC-Generator-Modal für eine Anforderung.
 * Kann von überall aufgerufen werden wo eine reqId vorliegt.
 */
async function openACGenerator(reqId) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) { toast('⚠ Anforderung nicht gefunden'); return; }

  openModal(`✓ Akzeptanzkriterien: ${req.title}`, `
    <div style="background:var(--s2);border-radius:var(--r);padding:10px 13px;margin-bottom:14px">
      <div class="req-id">${esc(req.id)}</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(req.title)}</div>
      <div style="font-size:12px;color:var(--t2);margin-top:4px">${esc((req.description||'').substring(0,150))}${(req.description||'').length>150?'…':''}</div>
    </div>

    <div id="ac-gen-area">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <label style="font-size:12px;font-weight:500;color:var(--t2)">Anzahl:</label>
        <select id="ac-count" style="font-size:12px;padding:4px 8px">
          <option value="3">3 Kriterien</option>
          <option value="5" selected>5 Kriterien</option>
          <option value="7">7 Kriterien</option>
        </select>
        <label style="font-size:12px;font-weight:500;color:var(--t2)">Format:</label>
        <select id="ac-format" style="font-size:12px;padding:4px 8px">
          <option value="gherkin">Gherkin (Given/When/Then)</option>
          <option value="checklist" selected>Checkliste</option>
          <option value="table">Testtabelle</option>
        </select>
        <button class="btn-primary" style="margin-left:auto" id="btn-gen-ac">⚡ Generieren</button>
      </div>
      <div id="ac-results"></div>
    </div>

    <div id="ac-existing" style="margin-top:12px">
      ${(req.acceptanceCriteria||[]).length ? `
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">
          Bestehende AC
        </div>
        ${(req.acceptanceCriteria||[]).map((ac,i) => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1)">
            <input type="checkbox" id="ac-existing-${i}" ${ac.done?'checked':''} style="margin-top:2px;flex-shrink:0"
              onchange="toggleExistingAC('${reqId}',${i},this.checked)"/>
            <label for="ac-existing-${i}" style="font-size:12px;color:var(--t2);cursor:pointer;flex:1">${esc(ac.text)}</label>
            <button onclick="deleteExistingAC('${reqId}',${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:12px">✕</button>
          </div>`).join('')}
      ` : ''}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
    </div>`);

  $('btn-gen-ac').onclick = () => generateAC(req);
}

async function generateAC(req) {
  setAPIContext('ac', req.systemId);
  const count  = parseInt($('ac-count').value) || 5;
  const format = $('ac-format').value;
  const btn    = $('btn-gen-ac');
  const area   = $('ac-results');

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  area.innerHTML = '<div style="text-align:center;padding:16px"><div class="spin"></div><p style="font-size:12px;color:var(--t3);margin-top:8px">Generiere Akzeptanzkriterien …</p></div>';

  const formatInstructions = {
    gherkin: `Schreibe ${count} Gherkin-Szenarien im Format:
**Szenario N: [Titel]**
Gegeben [Ausgangszustand]
Wenn [Aktion]
Dann [Erwartetes Ergebnis]`,
    checklist: `Schreibe ${count} konkrete, testbare Akzeptanzkriterien als Checkliste.
Jedes Kriterium beginnt mit einem Verb (z.B. "Das System zeigt …", "Der Nutzer kann …", "Bei Fehler erscheint …").
Jedes muss eigenständig verifizierbar sein.`,
    table: `Erstelle eine Testtabelle mit ${count} Testfällen im Format:
Testfall N: [Beschreibung]
- Vorbedingung: [Zustand]
- Eingabe/Aktion: [Was wird getan]
- Erwartetes Ergebnis: [Was soll passieren]
- Negativtest: [Was soll NICHT passieren]`,
  };

  const sys = S.systems.find(s => s.id === req.systemId);
  const res = await callAPI([{ role:'user', content:
    `Erstelle Akzeptanzkriterien für diese Anforderung. ${langNote()}

${formatInstructions[format]}

Anforderung:
- ID: ${req.id}
- Titel: ${req.title}
- Beschreibung: ${req.description || '(keine)'}
- Kategorie: ${req.category}
- Priorität: ${req.priority}
${sys ? `- System: ${sys.name}` : ''}

Antworte NUR mit JSON ohne Backticks:
{"criteria":[{"text":"...","type":"positive"},{"text":"...","type":"negative"}]}

type: "positive" = Normalfall, "negative" = Fehlerfall/Grenzfall` }],
  langNote(), 1200);

  btn.disabled = false;
  btn.innerHTML = '⚡ Generieren';

  if (!res.ok) { area.innerHTML = `<p style="color:var(--red);font-size:12px">❌ ${esc(res.text)}</p>`; return; }

  try {
    const result = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    const criteria = result.criteria || [];

    area.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
        ✦ KI-Vorschläge
      </div>
      <div id="ac-checklist">
        ${criteria.map((c, i) => `
          <div class="ac-item" id="ac-item-${i}">
            <input type="checkbox" id="ac-cb-${i}" checked style="flex-shrink:0;margin-top:2px"/>
            <label for="ac-cb-${i}" style="flex:1;cursor:pointer">
              <span class="ac-type-badge ${c.type==='negative'?'ac-negative':'ac-positive'}">
                ${c.type === 'negative' ? '✗ Fehlerfall' : '✓ Normalfall'}
              </span>
              <span style="font-size:12px;color:var(--t1);margin-left:6px">${esc(c.text)}</span>
            </label>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn-primary" onclick="saveSelectedAC('${req.id}',${JSON.stringify(criteria).replace(/'/g,"\\'")})">
          ✓ Ausgewählte übernehmen
        </button>
        <button class="btn-secondary" onclick="saveAllAC('${req.id}',${JSON.stringify(criteria).replace(/'/g,"\\'")})">
          Alle übernehmen
        </button>
      </div>`;

    // Inline-Style für AC-Items
    if (!document.getElementById('ac-styles')) {
      const s = document.createElement('style');
      s.id = 'ac-styles';
      s.textContent = `
        .ac-item{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--b1)}
        .ac-item:last-child{border-bottom:none}
        .ac-type-badge{font-size:9px;font-weight:700;padding:1px 7px;border-radius:99px;text-transform:uppercase}
        .ac-positive{background:var(--grnbg);color:var(--grn)}
        .ac-negative{background:var(--redbg);color:var(--red)}`;
      document.head.appendChild(s);
    }
  } catch(e) { area.innerHTML = '<p style="color:var(--red);font-size:12px">❌ Parsing-Fehler</p>'; }
}

async function saveSelectedAC(reqId, criteria) {
  const selected = criteria.filter((_, i) => $(`ac-cb-${i}`)?.checked);
  await _appendAC(reqId, selected);
  toast(`✅ ${selected.length} Akzeptanzkriterien gespeichert`);
  closeModal();
}

async function saveAllAC(reqId, criteria) {
  await _appendAC(reqId, criteria);
  toast(`✅ ${criteria.length} Akzeptanzkriterien gespeichert`);
  closeModal();
}

async function _appendAC(reqId, newCriteria) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return;
  const existing = req.acceptanceCriteria || [];
  const toAdd    = newCriteria.map(c => ({ text: c.text, type: c.type, done: false, createdAt: Date.now() }));
  await window.api.saveRequirement({ ...req, acceptanceCriteria: [...existing, ...toAdd] });
  if (typeof addNotif === 'function')
    addNotif('✓', 'Akzeptanzkriterien hinzugefügt', `${toAdd.length} AC für "${req.title}"`, () => {});
}

async function toggleExistingAC(reqId, index, done) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req || !req.acceptanceCriteria?.[index]) return;
  req.acceptanceCriteria[index].done = done;
  await window.api.saveRequirement(req);
}

async function deleteExistingAC(reqId, index) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return;
  req.acceptanceCriteria = (req.acceptanceCriteria || []).filter((_, i) => i !== index);
  await window.api.saveRequirement(req);
  toast('✅ Entfernt');
  openACGenerator(reqId); // Modal neu öffnen
}

// AC-Übersicht für eine Anforderung rendern (für Dev-Karten etc.)
function renderACProgress(req) {
  const ac = req.acceptanceCriteria || [];
  if (!ac.length) return '';
  const done  = ac.filter(a => a.done).length;
  const pct   = Math.round((done / ac.length) * 100);
  const col   = pct === 100 ? 'var(--grn)' : pct >= 50 ? 'var(--amb)' : 'var(--red)';
  return `
    <div style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-bottom:3px">
        <span>Akzeptanzkriterien</span>
        <span style="color:${col}">${done}/${ac.length} (${pct}%)</span>
      </div>
      <div style="height:4px;background:var(--s3);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;transition:width .4s"></div>
      </div>
    </div>`;
}

window.openACGenerator    = openACGenerator;
window.generateAC         = generateAC;
window.saveSelectedAC     = saveSelectedAC;
window.saveAllAC          = saveAllAC;
window.toggleExistingAC   = toggleExistingAC;
window.deleteExistingAC   = deleteExistingAC;
window.renderACProgress   = renderACProgress;
