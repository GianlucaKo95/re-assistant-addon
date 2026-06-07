'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * core/personas.js
 * C: Branchen-Personas — DSGVO, MDR (Medizinprodukte), Banking (MaRisk),
 *    Automotive (ASPICE), Standard.
 * Alle KI-Prompts werden durch die aktive Persona gefiltert.
 */

const PERSONAS = {
  standard: {
    id:    'standard',
    icon:  '🤖',
    label: 'Standard',
    desc:  'Allgemeines Requirements Engineering',
    color: 'var(--aa)',
    systemPrompt: (lang) => `Du bist ein erfahrener Requirements Engineer. ${lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.'}
Erstelle klare, vollständige, testbare Anforderungen nach ISO 29148.`,
    qsRules: [
      'Eindeutigkeit: Keine Ambiguitäten wie "schnell", "einfach", "benutzerfreundlich"',
      'Vollständigkeit: Akzeptanzkriterien, Randbedingungen, Ausnahmen definiert',
      'Testbarkeit: Messbar und verifizierbar',
      'Korrektheit: Grammatikalisch und fachlich korrekt',
    ],
    reqTemplate: `Titel: [Akteur] kann [Funktion]
Beschreibung: Das System soll [was] um [Ziel] zu erreichen.
Akzeptanzkriterien:
- Das System zeigt [Ergebnis] wenn [Bedingung]`,
  },

  gdpr: {
    id:    'gdpr',
    icon:  '🛡',
    label: 'DSGVO',
    desc:  'Datenschutz-Grundverordnung — Art. 25, Privacy by Design',
    color: 'var(--blue)',
    systemPrompt: (lang) => `Du bist ein DSGVO-konformer Requirements Engineer. ${lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.'}

Prüfe JEDE Anforderung auf Datenschutz-Implikationen:
- Werden personenbezogene Daten verarbeitet? (Art. 4 DSGVO)
- Rechtsgrundlage vorhanden? (Art. 6 DSGVO)
- Privacy by Design implementiert? (Art. 25 DSGVO)
- Datenminimierung beachtet?
- Betroffenenrechte berücksichtigt? (Auskunft, Löschung, Portabilität)
- Datenschutz-Folgenabschätzung (DSFA) erforderlich? (Art. 35 DSGVO)

Ergänze immer eine "Datenschutz-Notiz" wenn personenbezogene Daten betroffen sind.`,
    qsRules: [
      'Rechtsgrundlage für Datenverarbeitung definiert (Art. 6 DSGVO)',
      'Betroffenenrechte adressiert (Auskunft, Löschung, Portabilität)',
      'Datenspeicherdauer angegeben',
      'Datenminimierungsprinzip beachtet',
      'Technische und organisatorische Maßnahmen (TOMs) spezifiziert',
      'Drittlandübermittlung geprüft (Art. 44+ DSGVO)',
    ],
    reqTemplate: `Titel: [Funktion] mit DSGVO-Konformität
Beschreibung: Das System soll [was].
Rechtsgrundlage: [Art. 6 Abs. 1 lit. X DSGVO]
Personenbezogene Daten: [welche Daten]
Speicherdauer: [wie lange]
Betroffenenrechte: [wie umgesetzt]
Akzeptanzkriterien:
- Einwilligung wird vor Datenerhebung eingeholt
- Löschfunktion ist implementiert`,
    badges: ['DSGVO', 'Privacy by Design', 'Art. 25'],
  },

  mdr: {
    id:    'mdr',
    icon:  '🏥',
    label: 'Medizinprodukte (MDR)',
    desc:  'EU MDR 2017/745 — IEC 62304, ISO 14971',
    color: '#10b981',
    systemPrompt: (lang) => `Du bist ein Regulatory-Affairs-Experte für Medizinprodukte. ${lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.'}

Erstelle Anforderungen konform zu:
- EU MDR 2017/745 (Medizinprodukteverordnung)
- IEC 62304 (Software-Lebenszyklus für Medizinprodukte)
- ISO 14971 (Risikomanagement)
- IEC 62366 (Gebrauchstauglichkeit)

JEDE Anforderung muss:
- Risikoklasse berücksichtigen (Klasse I/IIa/IIb/III)
- Traceability zu MDR-Anhängen ermöglichen
- Verifizierbar und validierbar sein (V&V)
- Sicherheitsanforderungen explizit kennzeichnen`,
    qsRules: [
      'Sicherheitskritikalität angegeben (SOUP, sicherheitskritisch ja/nein)',
      'MDR Anhang-Referenz angegeben (z.B. Anhang I, §14)',
      'Risikoklasse berücksichtigt',
      'Verifikations- und Validierungsmethode definiert',
      'Eindeutige ID für Traceability vorhanden',
      'Keine Ambiguitäten in sicherheitskritischen Anforderungen',
    ],
    reqTemplate: `Titel: [Funktion] (MDR-konform)
Beschreibung: Das System soll [was].
MDR-Referenz: [Anhang I §X / Anhang II]
Risikoklasse: [I / IIa / IIb / III]
Sicherheitskritisch: [Ja / Nein]
SOUP: [Ja / Nein, falls ja: Version und Hersteller]
Verifikationsmethode: [Test / Inspektion / Analyse]
Akzeptanzkriterien:
- [Testfall mit Pass/Fail-Kriterium]`,
    badges: ['MDR 2017/745', 'IEC 62304', 'ISO 14971'],
  },

  banking: {
    id:    'banking',
    icon:  '🏦',
    label: 'Banking (MaRisk)',
    desc:  'MaRisk, BaFin-Anforderungen, PCI DSS',
    color: '#f59e0b',
    systemPrompt: (lang) => `Du bist ein Banking-IT-Anforderungsexperte. ${lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.'}

Erstelle Anforderungen konform zu:
- MaRisk (Mindestanforderungen an das Risikomanagement, BaFin)
- BAIT (Bankaufsichtliche Anforderungen an die IT)
- PCI DSS (bei Zahlungsdaten)
- EBA-Leitlinien zur IT-Governance

JEDE Anforderung muss:
- Regulatorische Grundlage angeben (MaRisk AT X.X / BAIT)
- Revisionssicherheit adressieren
- Segregation of Duties beachten
- Audit-Trail-Anforderungen berücksichtigen`,
    qsRules: [
      'Regulatorische Grundlage angegeben (MaRisk / BAIT / PCI DSS)',
      'Revisionssicherheit adressiert (Audit-Trail)',
      'Datenhaltungsfristen gemäß regulatorischen Vorgaben',
      'Vier-Augen-Prinzip / Segregation of Duties berücksichtigt',
      'Notfallkonzept referenziert (MaRisk AT 7)',
      'IT-Sicherheitsanforderungen gemäß BAIT',
    ],
    reqTemplate: `Titel: [Funktion] (MaRisk-konform)
Beschreibung: Das System soll [was].
Regulatorische Grundlage: [MaRisk AT X.X / BAIT X]
Revisionssicherheit: [wie umgesetzt]
Audit-Trail: [Welche Aktionen werden protokolliert]
Aufbewahrungsdauer: [X Jahre gemäß §257 HGB]
Akzeptanzkriterien:
- Alle Transaktionen sind unveränderlich protokolliert`,
    badges: ['MaRisk', 'BAIT', 'PCI DSS'],
  },

  automotive: {
    id:    'automotive',
    icon:  '🚗',
    label: 'Automotive (ASPICE)',
    desc:  'ASPICE, ISO 26262, AUTOSAR',
    color: '#6366f1',
    systemPrompt: (lang) => `Du bist ein Automotive-Systems-Engineer. ${lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.'}

Erstelle Anforderungen konform zu:
- ASPICE (Automotive SPICE) — SYS.2, SWE.1
- ISO 26262 (Funktionale Sicherheit)
- AUTOSAR (falls relevant)

JEDE Anforderung muss:
- ASIL-Level angeben (QM / A / B / C / D)
- Eindeutige ID für Traceability haben
- Abgeleitete Anforderungen kennzeichnen
- Testbarkeit für HIL/SIL/PIL demonstrieren`,
    qsRules: [
      'ASIL-Level angegeben (QM/A/B/C/D)',
      'Eltern-Anforderung referenziert (Traceability)',
      'Verifikationsmethode definiert (HIL/SIL/Review)',
      'Keine Shall/Should-Ambiguitäten',
      'Messbare Leistungsmerkmale definiert',
    ],
    reqTemplate: `Titel: [Funktion] [ASIL-X]
Beschreibung: Das System MUSS [was]. (ASIL [Level])
Eltern-Anforderung: [SYS-XXX]
ASIL: [QM / A / B / C / D]
Verifikationsmethode: [HIL-Test / SIL-Simulation / Codeinspektion]
Akzeptanzkriterien:
- [Pass/Fail mit Messwert]`,
    badges: ['ASPICE', 'ISO 26262', 'AUTOSAR'],
  },
};

// ── Aktive Persona verwalten ───────────────────────────────────
function getActivePersona() {
  const id = S.settings?.persona || 'standard';
  return PERSONAS[id] || PERSONAS.standard;
}

function getSystemPrompt() {
  const persona = getActivePersona();
  const lang    = S.settings?.language || 'de';
  return persona.systemPrompt(lang);
}

function getQSRules() {
  return getActivePersona().qsRules;
}

function getReqTemplate() {
  return getActivePersona().reqTemplate;
}

// ── Persona-Auswahl View ───────────────────────────────────────
function renderPersonaSelector(containerId) {
  const wrap = $(containerId);
  if (!wrap) return;
  const active = getActivePersona();

  wrap.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
      Branchen-Profil
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
      ${Object.values(PERSONAS).map(p => `
        <div onclick="selectPersona('${p.id}')" style="
          background:${p.id===active.id ? `rgba(168,85,247,.1)` : 'var(--s1)'};
          border:1px solid ${p.id===active.id ? 'rgba(168,85,247,.4)' : 'var(--b1)'};
          border-radius:var(--rl);padding:12px;cursor:pointer;transition:all .15s;
        " onmouseover="if('${p.id}'!=='${active.id}')this.style.background='var(--s2)'" onmouseout="if('${p.id}'!=='${active.id}')this.style.background='var(--s1)'">
          <div style="font-size:22px;margin-bottom:6px">${p.icon}</div>
          <div style="font-size:12px;font-weight:600;color:${p.color}">${esc(p.label)}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:3px;line-height:1.4">${esc(p.desc)}</div>
          ${p.id === active.id ? '<div style="font-size:10px;color:var(--aa);margin-top:5px;font-weight:600">✓ Aktiv</div>' : ''}
        </div>`).join('')}
    </div>
    <div id="persona-detail" style="margin-top:12px"></div>`;

  renderPersonaDetail(active.id);
}

function renderPersonaDetail(id) {
  const p    = PERSONAS[id];
  const wrap = $('persona-detail');
  if (!p || !wrap) return;

  if (p.id === 'standard') { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--rl);padding:12px 14px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:8px">
        ${p.icon} ${p.label} — Zusätzliche QS-Regeln
      </div>
      ${(p.qsRules || []).map(r => `
        <div style="display:flex;gap:7px;padding:4px 0;font-size:12px;color:var(--t2);border-bottom:1px solid var(--b1)">
          <span style="color:${p.color};flex-shrink:0">✓</span>
          ${esc(r)}
        </div>`).join('')}
      ${p.badges?.length ? `
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">
          ${p.badges.map(b => `<span style="font-size:10px;padding:2px 8px;background:${p.color}22;color:${p.color};border-radius:99px;font-weight:600">${esc(b)}</span>`).join('')}
        </div>` : ''}
    </div>`;
}

async function selectPersona(id) {
  S.settings.persona = id;
  await window.api.saveSettings(S.settings);
  if (typeof applySettingsToForm === 'function') applySettingsToForm();
  renderPersonaSelector('persona-selector-wrap');
  toast(`✅ Branchen-Profil: ${PERSONAS[id]?.label || id}`);
  if (typeof addNotif === 'function')
    addNotif(PERSONAS[id]?.icon || '🤖', 'Profil geändert', `${PERSONAS[id]?.label} aktiv`);
}

// ── Persona-Badge im Titlebar ──────────────────────────────────
function updatePersonaBadge() {
  const p     = getActivePersona();
  const badge = $('persona-badge');
  if (!badge) return;
  badge.innerHTML  = `${p.icon} ${p.label}`;
  badge.title      = p.desc;
  badge.style.color = p.color;
}

// ── Persona-aware callAPI ─────────────────────────────────────
// Überschreibt langNote() um Persona-Prompt einzuschließen
window.langNote = function() {
  const lang    = S.settings?.language || 'de';
  const persona = getActivePersona();
  if (persona.id === 'standard') {
    return lang === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.';
  }
  return persona.systemPrompt(lang);
};

window.PERSONAS             = PERSONAS;
window.getActivePersona     = getActivePersona;
window.getSystemPrompt      = getSystemPrompt;
window.getQSRules           = getQSRules;
window.getReqTemplate       = getReqTemplate;
window.renderPersonaSelector = renderPersonaSelector;
window.renderPersonaDetail  = renderPersonaDetail;
window.selectPersona        = selectPersona;
window.updatePersonaBadge   = updatePersonaBadge;
