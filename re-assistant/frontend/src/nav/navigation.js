'use strict';
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
};

// ── NAV-Konfiguration ─────────────────────────────────────────
const NAV = {
  admin: [
    { id:'admin-users',    icon:ICONS.users,   label:'Benutzer'    },
    { id:'admin-systems',  icon:ICONS.layers,  label:'Systeme'     },
    { id:'admin-license',  icon:ICONS.lock,    label:'Lizenz'      },
    { id:'voice',          icon:ICONS.mic,     label:'Sprach-Bot'  },
  ],
  business: [
    { id:'import',          icon:ICONS.backlog,  label:'Importieren'     },
    { id:'business-chat', icon:ICONS.chat,  label:'Chat & Prozesse'  },
    { id:'business-reqs', icon:ICONS.list,  label:'Anforderungen'    },
    { id:'templates',     icon:ICONS.tmpl,  label:'Vorlagen'         },
    { id:'archive', icon:ICONS.list, label:'Archiv' },
    { id:'voice',         icon:ICONS.mic,   label:'Sprach-Bot'       },
  ],
  businessanalyst: [
    { id:'ba-dashboard',   icon:ICONS.dash,     label:'Dashboard'         },
    { id:'ba-quality',      icon:ICONS.check,    label:'QS (ISO 29148)'    },
    { id:'ba-docanalysis',  icon:ICONS.doc,      label:'Dokumentenanalyse' },
    { id:'ba-diagrams',     icon:ICONS.diagram,  label:'Diagramme'         },
    { id:'ba-workshop',     icon:ICONS.workshop, label:'Workshop'          },
    { id:'dependencies',    icon:ICONS.deps,     label:'Abhängigkeiten'    },
    { id:'templates',       icon:ICONS.tmpl,     label:'Vorlagen'          },
    { id:'consistency',       icon:ICONS.check,    label:'Konsistenz'        },
    { id:'review-workflow',   icon:ICONS.check,    label:'Review'            },
    { id:'business-chat',     icon:ICONS.chat,     label:'Chat & Prozesse'   },
    { id:'voice',           icon:ICONS.mic,      label:'Sprach-Bot'        },
  ],
  projectmanager: [
    { id:'pm-dashboard',    icon:ICONS.dash,    label:'Dashboard'       },
    { id:'pm-chat',         icon:ICONS.chat,    label:'Chat & Analyse'  },
    { id:'pm-assign',       icon:ICONS.assign,  label:'Zuweisen'        },
    { id:'pm-backlog',      icon:ICONS.backlog, label:'Backlog Builder' },
    { id:'pm-prio',         icon:ICONS.prio,    label:'Priorisierung'   },
    { id:'pm-integrations', icon:ICONS.integr,  label:'Integrationen'   },
    { id:'dependencies',    icon:ICONS.deps,    label:'Abhängigkeiten'  },
    { id:'review-workflow',  icon:ICONS.check,   label:'Review & Freigabe'},
    { id:'traceability',     icon:ICONS.deps,    label:'Traceability'    },
    { id:'audit-log',        icon:ICONS.list,    label:'Audit-Log'       },
    { id:'qs-trends',         icon:ICONS.prio,    label:'QS-Trends'       },
    { id:'sprint-planning',   icon:ICONS.backlog,  label:'Sprint-Planung'  },
    { id:'archive',            icon:ICONS.list,     label:'Archiv'          },
    { id:'voice',             icon:ICONS.mic,      label:'Sprach-Bot'      },
  ],
  developer: [
    { id:'dev-work',   icon:ICONS.code, label:'Meine Aufgaben' },
    { id:'my-tasks',   icon:ICONS.list, label:'Aufgaben'        },
    { id:'voice',    icon:ICONS.mic,  label:'Sprach-Bot'     },
  ],
};

// ── View → Loader Mapping ─────────────────────────────────────
const VIEW_LOADERS = {
  'admin-users':      () => loadAdminUsers(),
  'admin-systems':    () => loadAdminSystems(),
  'admin-license':    () => loadAdminLicense(),
  'business-chat':    () => loadBizChat(),
  'business-reqs':    () => loadBizReqs(),
  'ba-quality':       () => loadBaQS(),
  'ba-docanalysis':   () => loadBaDocAnalysis(),
  'ba-diagrams':      () => loadBaDiagrams(),
  'ba-workshop':      () => loadBaWorkshop(),
  'pm-dashboard':     () => loadPMDash(),
  'pm-chat':          () => loadPMChat(),
  'pm-assign':        () => loadPMAssign(),
  'pm-backlog':       () => loadPMBacklog(),
  'pm-prio':          () => loadPMPrio(),
  'pm-integrations':  () => loadPMIntegrations(),
  'dependencies':       () => loadDependencies(),
  'review-workflow':    () => loadReviewDashboard(),
  'import':             () => loadImportView(),
  'traceability':       () => loadTraceability(),
  'audit-log':          () => { loadAuditLogView(); updateAuditBadge(); },
  'source-analysis':    () => loadSourceAnalysisView(),
  'decomposition':      () => loadDecomposition(),
  'nl-query':           () => loadNLQuery(),
  'changelog':          () => loadChangelog(),
  'completeness':       () => loadCompleteness(),
  'archive':             () => loadArchive(),
  'dna':                 () => loadDNA(),
  'my-tasks':           () => loadTasksView(),
  'consistency':        () => { /* loaded inline */ },
  'ba-dashboard':      () => loadBaDashboard(),
  'templates':        () => loadTemplates(),
  'dev-work':         () => loadDevWork(),
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
}

// ── Switch View ───────────────────────────────────────────────
async function switchView(id) {
  S.activeView = id;

  // Views togglen
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = $('view-' + id);
  if (v) v.classList.add('active');

  // Nav-Buttons
  document.querySelectorAll('.ln-btn').forEach(b => b.classList.remove('active'));
  const nb = $('nav-' + id);
  if (nb) nb.classList.add('active');

  // Loader aufrufen
  const loader = VIEW_LOADERS[id];
  if (loader) await loader();
}

window.buildNav    = buildNav;
window.switchView  = switchView;
window.ICONS       = ICONS;
