'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * nav/navigation.js
 * NAV-Konfiguration, buildNav(), switchView(), Icon-Bibliothek.
 */

// ── Icons ─────────────────────────────────────────────────────
function icoSvg(d) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${d}</svg>`;
}
const ICONS = {
  users:    icoSvg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  layers:   icoSvg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
  chat:     icoSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  list:     icoSvg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  check:    icoSvg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  doc:      icoSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  diagram:  icoSvg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  workshop: icoSvg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  dash:     icoSvg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  assign:   icoSvg('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>'),
  backlog:  icoSvg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  prio:     icoSvg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
  integr:   icoSvg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  code:     icoSvg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  mic:      icoSvg('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
  deps:     icoSvg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>'),
  coin:     icoSvg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M8 12h8"/>'),
  dna:      icoSvg('<path d="M2 12h2m16 0h2M4 8C4 5.79 5.79 4 8 4s4 1.79 4 4-1.79 4-4 4"/><path d="M20 8c0-2.21-1.79-4-4-4s-4 1.79-4 4 1.79 4 4 4"/><path d="M4 16c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4"/><path d="M20 16c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4"/>'),
  lock:     icoSvg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  code2:    icoSvg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/>'),
  decomp:   icoSvg('<rect x="3" y="3" width="7" height="5"/><rect x="14" y="3" width="7" height="5"/><rect x="3" y="14" width="7" height="5"/><rect x="14" y="14" width="7" height="5"/><line x1="6.5" y1="8" x2="6.5" y2="14"/><line x1="17.5" y1="8" x2="17.5" y2="14"/><line x1="6.5" y1="11" x2="17.5" y2="11"/>'),
  chat2:    icoSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/>'),
  log:      icoSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>'),
  check2:   icoSvg('<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>'),
  tmpl:     icoSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>'),
  kanban:   icoSvg('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>'),
  network:  icoSvg('<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><line x1="12" y1="7.5" x2="6" y2="17"/><line x1="12" y1="7.5" x2="18" y2="17"/>'),
  wordDoc:  icoSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13l1.5 6 1.5-4.5L12.5 19 14 13"/>'),
  more:     icoSvg('<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
  settings: icoSvg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
};

// Mobile Bottom-Bar: pro Rolle nur die meistgenutzten Einträge direkt
// zeigen (eine Bottom-Bar verträgt ~4-5 Slots), der Rest kommt ins
// "Mehr"-Menü. Reihenfolge/Auswahl bewusst redaktionell, nicht die
// ersten N aus NAV — bei 13-15 Einträgen (BA/PM) wäre "die ersten 4"
// zufällig statt sinnvoll.
const NAV_MOBILE_CORE = {
  admin:           ['admin-users', 'admin-systems', 'admin-license'],
  business:        ['business-chat', 'business-reqs', 'import', 'templates'],
  businessanalyst: ['ba-dashboard', 'req-analysis', 'ba-quality', 'ba-docanalysis'],
  projectmanager:  ['pm-dashboard', 'pm-chat', 'pm-backlog', 'kanban'],
  developer:       ['dev-work', 'my-tasks'],
};

// ── NAV-Konfiguration ─────────────────────────────────────────
const NAV = {
  admin: [
    { id:'admin-users',    icon:ICONS.users,   label:'Benutzer'    },
    { id:'admin-systems',  icon:ICONS.layers,  label:'Systeme'     },
    { id:'admin-license',  icon:ICONS.lock,    label:'Lizenz'      },
  ],
  business: [
    { id:'import',          icon:ICONS.backlog,  label:'Importieren'     },
    { id:'business-chat', icon:ICONS.chat,  label:'Chat & Prozesse'  },
    { id:'business-reqs', icon:ICONS.list,  label:'Anforderungen'    },
    { id:'templates',     icon:ICONS.tmpl,  label:'Vorlagen'         },
    { id:'word-analysis', icon:ICONS.wordDoc, label:'Word-Analyse'  },
    { id:'archive', icon:ICONS.list, label:'Archiv' },
  ],
  businessanalyst: [
    { id:'ba-dashboard',   icon:ICONS.dash,     label:'Dashboard'         },
    { id:'req-analysis',   icon:ICONS.check,    label:'RE-Analyse'        },
    { id:'ba-quality',      icon:ICONS.check,    label:'QS (ISO 29148)'    },
    { id:'ba-docanalysis',  icon:ICONS.doc,      label:'Dokumentenanalyse' },
    { id:'word-analysis',   icon:ICONS.wordDoc,  label:'Word-Analyse'      },
    { id:'ba-diagrams',     icon:ICONS.diagram,  label:'Diagramme'         },
    { id:'ba-workshop',     icon:ICONS.workshop, label:'Workshop'          },
    { id:'dependencies',    icon:ICONS.deps,     label:'Abhängigkeiten'    },
    { id:'req-network',     icon:ICONS.network,  label:'Netzwerk'          },
    { id:'templates',       icon:ICONS.tmpl,     label:'Vorlagen'          },
    { id:'review-workflow',   icon:ICONS.check,    label:'Review'            },
    { id:'business-chat',     icon:ICONS.chat,     label:'Chat & Prozesse'   },
    { id:'req-analysis',     icon:ICONS.check,    label:'RE-Analyse'        },
  ],
  projectmanager: [
    { id:'pm-dashboard',    icon:ICONS.dash,    label:'Dashboard'       },
    { id:'pm-chat',         icon:ICONS.chat,    label:'Chat & Analyse'  },
    { id:'pm-assign',       icon:ICONS.assign,  label:'Zuweisen'        },
    { id:'pm-backlog',      icon:ICONS.backlog, label:'Backlog Builder' },
    { id:'pm-prio',         icon:ICONS.prio,    label:'Priorisierung'   },
    { id:'kanban',          icon:ICONS.kanban,  label:'Kanban-Board'    },
    { id:'pm-integrations', icon:ICONS.integr,  label:'Integrationen'   },
    { id:'dependencies',    icon:ICONS.deps,    label:'Abhängigkeiten'  },
    { id:'req-network',     icon:ICONS.network, label:'Netzwerk'        },
    { id:'review-workflow',  icon:ICONS.check,   label:'Review & Freigabe'},
    { id:'traceability',     icon:ICONS.deps,    label:'Traceability'    },
    { id:'audit-log',        icon:ICONS.list,    label:'Audit-Log'       },
    { id:'qs-trends',         icon:ICONS.prio,    label:'QS-Trends'       },
    { id:'sprint-planning',   icon:ICONS.backlog,  label:'Sprint-Planung'  },
    { id:'archive',            icon:ICONS.list,     label:'Archiv'          },
  ],
  developer: [
    { id:'dev-work',   icon:ICONS.code, label:'Meine Aufgaben' },
    { id:'my-tasks',   icon:ICONS.list, label:'Aufgaben'        },
  ],
};

// ── View → Loader Mapping ─────────────────────────────────────
const VIEW_LOADERS = {
  'admin-users':      () => typeof loadAdminUsers === 'function' && loadAdminUsers(),
  'admin-systems':    () => typeof loadAdminSystems === 'function' && loadAdminSystems(),
  'admin-license':    () => typeof loadAdminLicense === 'function' && loadAdminLicense(),
  'business-chat':    () => { loadBizChat(); if (typeof updateConflictBadge === 'function') updateConflictBadge(); },
  'business-reqs':    () => typeof loadBizReqs === 'function' && loadBizReqs(),
  'ba-quality':       () => typeof loadBaQS === 'function' && loadBaQS(),
  'ba-docanalysis':   () => typeof loadBaDocAnalysis === 'function' && loadBaDocAnalysis(),
  'ba-diagrams':      () => typeof loadBaDiagrams === 'function' && loadBaDiagrams(),
  'ba-workshop':      () => typeof loadBaWorkshop === 'function' && loadBaWorkshop(),
  'pm-dashboard':     () => typeof loadPMDash === 'function' && loadPMDash(),
  'pm-chat':          () => typeof loadPMChat === 'function' && loadPMChat(),
  'pm-assign':        () => typeof loadPMAssign === 'function' && loadPMAssign(),
  'pm-backlog':       () => typeof loadPMBacklog === 'function' && loadPMBacklog(),
  'pm-prio':          () => typeof loadPMPrio === 'function' && loadPMPrio(),
  'kanban':           () => typeof loadKanbanView === 'function' && loadKanbanView(),
  'pm-integrations':  () => typeof loadPMIntegrations === 'function' && loadPMIntegrations(),
  'dependencies':       () => typeof loadDependencies === 'function' && loadDependencies(),
  'req-network':        () => typeof loadReqNetwork === 'function' && loadReqNetwork(),
  'word-analysis':      () => typeof loadWordAnalysis === 'function' && loadWordAnalysis(),
  'review-workflow':    () => typeof loadReviewDashboard === 'function' && loadReviewDashboard(),
  'import':             () => typeof loadImportView === 'function' && loadImportView(),
  'traceability':       () => typeof loadTraceability === 'function' && loadTraceability(),
  'audit-log':          () => { loadAuditLogView(); updateAuditBadge(); },
  'source-analysis':    () => typeof loadSourceAnalysisView === 'function' && loadSourceAnalysisView(),
  'decomposition':      () => typeof loadDecomposition === 'function' && loadDecomposition(),
  'nl-query':           () => typeof loadNLQuery === 'function' && loadNLQuery(),
  'changelog':          () => typeof loadChangelog === 'function' && loadChangelog(),
  'completeness':       () => typeof loadCompleteness === 'function' && loadCompleteness(),
  'archive':             () => typeof loadArchive === 'function' && loadArchive(),
  'dna':                 () => typeof loadDNA === 'function' && loadDNA(),
  'my-tasks':           () => typeof loadTasksView === 'function' && loadTasksView(),
  'ba-dashboard':      () => typeof loadBaDashboard === 'function' && loadBaDashboard(),
  'templates':        () => typeof loadTemplates === 'function' && loadTemplates(),
  'dev-work':         () => typeof loadDevWork === 'function' && loadDevWork(),
  'voice':            () => { buildVoice && buildVoice(); populateVoices && populateVoices(); },
  'req-analysis':  () => { typeof loadReqAnalysis === "function" && loadReqAnalysis(); },
  'qs-trends':  () => { typeof loadQSTrends === "function" && loadQSTrends(); },
  'sprint-planning':  () => { typeof loadSprintPlanning === "function" && loadSprintPlanning(); },
  'notification-settings':  () => { typeof loadNotificationSettings === "function" && loadNotificationSettings(); },
  'token-dashboard':  () => { typeof loadTokenDashboard === "function" && loadTokenDashboard(); },
  'settings':         () => {
    typeof applyApiSectionVisibility === 'function' && applyApiSectionVisibility();
    typeof loadDbStatus === 'function' && loadDbStatus();
    const adminSection = document.getElementById('apikey-admin-section');
    if (adminSection) adminSection.style.display = S.user?.role === 'admin' ? '' : 'none';
    typeof loadApiKeyAdmin === 'function' && loadApiKeyAdmin();
    typeof renderApiKeySection === 'function' && renderApiKeySection();
  },
};

// ── Build Nav ─────────────────────────────────────────────────
function buildNav() {
  // Globale Suche initialisieren
  if (typeof initGlobalSearch === 'function') initGlobalSearch();
  // Benutzernamen in Settings zeigen
  const sn = $('settings-user-name');
  if (sn) sn.textContent = S.user?.name || '';
  const items = NAV[S.user.role] || [];
  $('ln-items').innerHTML = items.map(n =>
    `<button class="ln-btn" id="nav-${n.id}" onclick="switchView('${n.id}')" title="${n.label}">
      ${n.icon}
      <span class="ln-tooltip">${n.label}</span>
    </button>`
  ).join('');
  buildMobileNav();
}

// ── Mobile Bottom-Bar ─────────────────────────────────────────
function buildMobileNav() {
  const bar = $('mobile-bottombar');
  if (!bar) return;
  const items = NAV[S.user.role] || [];
  // NAV enthält mind. einen bekannten Duplikat-Eintrag (req-analysis bei
  // businessanalyst) — für die Desktop-Sidebar harmlos (zwei identische
  // Icons), im "Mehr"-Menü wäre eine doppelte Zeile aber sichtbar falsch.
  const seen = new Set();
  const unique = items.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  const coreIds = NAV_MOBILE_CORE[S.user.role] || unique.slice(0, 4).map(n => n.id);
  const core = coreIds.map(id => unique.find(n => n.id === id)).filter(Boolean);
  const overflow = unique.filter(n => !coreIds.includes(n.id));

  const btn = n => `<button class="mb-btn" id="mbnav-${n.id}" onclick="switchView('${n.id}')">${n.icon}<span class="mb-label">${n.label}</span></button>`;

  bar.innerHTML = core.map(btn).join('')
    + (overflow.length ? `<button class="mb-btn" id="mbnav-more" onclick="openMobileMore()">${ICONS.more}<span class="mb-label">Mehr</span></button>` : '')
    + `<button class="mb-btn" id="mbnav-settings" onclick="switchView('settings')">${ICONS.settings}<span class="mb-label">Einstellungen</span></button>`;

  S._mobileOverflow = overflow;
}

function openMobileMore() {
  const overflow = S._mobileOverflow || [];
  const html = overflow.map(n =>
    `<button class="mb-more-item" onclick="switchView('${n.id}');closeModal()">${n.icon}<span>${n.label}</span></button>`
  ).join('');
  openModal('Mehr', html);
}

// ── Switch View ───────────────────────────────────────────────
async function switchView(id) {
  S.activeView = id;

  // Views togglen
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = $('view-' + id);
  if (v) v.classList.add('active');

  // Nav-Buttons
  document.querySelectorAll('.ln-btn, .mb-btn').forEach(b => b.classList.remove('active'));
  const nb = $('nav-' + id);
  if (nb) nb.classList.add('active');
  const mb = $('mbnav-' + id);
  if (mb) mb.classList.add('active');
  else if ((S._mobileOverflow || []).some(n => n.id === id)) $('mbnav-more')?.classList.add('active');

  // Loader aufrufen
  const loader = VIEW_LOADERS[id];
  if (loader) await loader();
}

// Setzt API-Sektion je nach Rolle sichtbar/gesperrt
async function applyApiSectionVisibility() {
  if (typeof applySettingsToForm === 'function') applySettingsToForm();
  const isAdmin = S.user?.role === 'admin';

  // Server-seitig konfigurierten Provider laden und Dropdown synchronisieren
  // (localStorage kann veraltet/falsch sein — Server ist Quelle der Wahrheit)
  if (isAdmin) {
    try {
      const res  = await fetch('api/apikey/global', { credentials:'include' });
      if (res.ok) {
        const data = await res.json();
        const sel = document.getElementById('cfg-provider');
        if (sel && data.provider) {
          sel.value = data.provider;
          // sichtbare Felder + Modell-Overrides entsprechend dem SERVER-Stand
          // umschalten (nicht aus localStorage — der Admin-Override in
          // app_settings ist die Quelle der Wahrheit, siehe /api/apikey/global)
          if (typeof applySettingsToForm === 'function') {
            S.settings.provider  = data.provider;
            if (data.model)     S.settings.model     = data.model;
            if (data.grokModel) S.settings.grokModel = data.grokModel;
            if (data.groqModel) S.settings.groqModel = data.groqModel;
            applySettingsToForm();
          }
        }
        // Hinweis-Banner wenn Provider gesetzt aber kein Key für diesen Provider
        const hasKeyForProvider =
          (data.provider === 'anthropic' && data.hasAnthKey) ||
          (data.provider === 'grok'      && data.hasGrokKey) ||
          (data.provider === 'groq'      && data.hasGroqKey);

        const existing = document.getElementById('cfg-provider-mismatch');
        existing?.remove();
        if (!hasKeyForProvider) {
          const banner = document.createElement('div');
          banner.id = 'cfg-provider-mismatch';
          banner.style.cssText = 'padding:8px 10px;background:var(--ambbg);border:1px solid rgba(251,191,36,.3);border-radius:var(--r);font-size:12px;color:var(--amb);margin-top:8px';
          banner.textContent = `⚠ Anbieter "${data.provider}" ist ausgewählt, aber für diesen Anbieter ist (serverseitig) noch kein Key gespeichert. Bitte Key eintragen und "Speichern" klicken.`;
          const apiSection = document.getElementById('cfg-api-section');
          apiSection?.appendChild(banner);
        }
      }
    } catch(e) {}
  }

  const apiSection = document.getElementById('cfg-api-section');
  if (!apiSection) return;
  // Reset
  apiSection.querySelectorAll('input, button, select').forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
    el.style.cursor = '';
  });
  apiSection.querySelectorAll('.api-non-admin-banner').forEach(el => el.remove());
  if (!isAdmin) {
    apiSection.querySelectorAll('input, button, select').forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
    });
    const banner = document.createElement('div');
    banner.className = 'api-non-admin-banner';
    banner.style.cssText = 'padding:8px 10px;background:var(--s2);border-radius:var(--r);font-size:12px;color:var(--t2);margin-top:8px';
    banner.textContent = 'ℹ Der API-Key wird vom Administrator verwaltet.';
    apiSection.appendChild(banner);
  }
}

window.buildNav       = buildNav;
window.switchView     = switchView;
window.ICONS          = ICONS;
window.openMobileMore = openMobileMore;
