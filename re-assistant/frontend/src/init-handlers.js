'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * init-handlers.js
 * Event-Listener für Elemente, die csp-compat.js NICHT automatisch abdeckt
 * (dieses konvertiert nur [onclick] — change/input-Attribute bleiben unter
 * der HA-CSP sonst wirkungslos blockiert).
 *
 * Achtung: NICHT hier zusätzlich .onclick für Elemente setzen, die bereits
 * ein onclick="..."-Attribut in index.html haben — csp-compat.js wandelt
 * das bereits in einen echten Listener um; eine zweite Registrierung hier
 * lässt jeden Klick den Handler zweimal auslösen. Bei toggle-artigen
 * Funktionen (toggleTheme, toggleSearchPanel, toggleNotifPanel, …) hebt
 * sich das gegenseitig auf, sodass der Button scheinbar nichts tut. Das
 * ist hier bereits einmal passiert (notif-bell, btn-theme, btn-search,
 * bc-mobile-req-toggle u.a. waren dadurch faktisch nicht klickbar) — vor
 * dem Hinzufügen eines neuen Eintrags in index.html prüfen, ob das
 * Element schon ein onclick-Attribut hat.
 */
document.addEventListener('DOMContentLoaded', function() {

  // Audit Log Filter
  ['audit-filter-action','audit-filter-entity','audit-filter-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => window.loadAuditLogView && window.loadAuditLogView());
  });
  const auditUser = document.getElementById('audit-filter-user');
  if (auditUser) auditUser.addEventListener('input', () => window.loadAuditLogView && window.loadAuditLogView());

  // Token Months
  const tokenMonths = document.getElementById('token-months-sel');
  if (tokenMonths) tokenMonths.addEventListener('change', () => window.loadTokenDashboard && window.loadTokenDashboard());

});

async function rechunkDocs() {
  if (!S.activeSystemId) { toast('⚠ System auswählen'); return; }
  if (!confirm('Alle Dokumente mit dem neuen Chunking-Algorithmus neu indexieren? Das kann einige Minuten dauern.')) return;
  const res = await fetch('api/systems/' + S.activeSystemId + '/rechunk', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  toast(data.ok ? '✅ ' + data.message : '❌ ' + data.error);
}
window.rechunkDocs = rechunkDocs;
