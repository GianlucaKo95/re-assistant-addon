'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * init-handlers.js
 * Setzt alle Event-Listener die vorher als inline onclick in index.html waren.
 * Notwendig wegen HA Content Security Policy die inline Handler blockiert.
 */
document.addEventListener('DOMContentLoaded', function() {

  // Persona-Badge → Settings
  const personaBadge = document.getElementById('persona-badge');
  if (personaBadge) personaBadge.onclick = () => window.switchView && window.switchView('settings');

  // Notification Panel
  const notifBell = document.getElementById('notif-bell');
  if (notifBell) notifBell.onclick = () => window.toggleNotifPanel && window.toggleNotifPanel();

  const clearNotifs = document.querySelector('[onclick*="clearNotifs"]');
  // Suche nach Button in notif-panel-head
  const notifHead = document.getElementById('notif-panel-head');
  if (notifHead) {
    const btn = notifHead.querySelector('button');
    if (btn) btn.onclick = () => window.clearNotifs && window.clearNotifs();
  }

  // Import Button
  const importBtn = document.getElementById('btn-switch-import');
  if (importBtn) importBtn.onclick = () => window.switchView && window.switchView('import');

  // NL-Query History löschen
  const clearNlq = document.getElementById('btn-clear-nlq');
  if (clearNlq) clearNlq.onclick = () => window.clearNLQHistory && window.clearNLQHistory();

  // Audit Log Export
  const auditExport = document.getElementById('btn-export-audit');
  if (auditExport) auditExport.onclick = () => window.exportAuditLog && window.exportAuditLog();

  // Audit Log Filter
  ['audit-filter-action','audit-filter-entity','audit-filter-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => window.loadAuditLogView && window.loadAuditLogView());
  });
  const auditUser = document.getElementById('audit-filter-user');
  if (auditUser) auditUser.addEventListener('input', () => window.loadAuditLogView && window.loadAuditLogView());

  // DNA Tabs
  const dnaDrift = document.getElementById('btn-dna-drift');
  if (dnaDrift) dnaDrift.onclick = () => window.switchDNATab && window.switchDNATab('drift');
  const dnaNetwork = document.getElementById('btn-dna-network');
  if (dnaNetwork) dnaNetwork.onclick = () => window.switchDNATab && window.switchDNATab('network');
  const dnaGenealogy = document.getElementById('btn-dna-genealogy');
  if (dnaGenealogy) dnaGenealogy.onclick = () => window.switchDNATab && window.switchDNATab('genealogy');

  // Token Dashboard Tabs
  const tokenUsage = document.getElementById('token-tab-usage');
  if (tokenUsage) tokenUsage.onclick = () => window.switchDashboardTab && window.switchDashboardTab('usage');
  const tokenBudgets = document.getElementById('token-tab-budgets');
  if (tokenBudgets) tokenBudgets.onclick = () => window.switchDashboardTab && window.switchDashboardTab('budgets');

  // Token Months
  const tokenMonths = document.getElementById('token-months-sel');
  if (tokenMonths) tokenMonths.addEventListener('change', () => window.loadTokenDashboard && window.loadTokenDashboard());

  // Integration Tabs
  document.querySelectorAll('.int-tab').forEach((btn, i) => {
    const tabs = ['jira', 'azuredevops'];
    if (tabs[i]) btn.onclick = () => window.switchIntTab && window.switchIntTab(tabs[i]);
  });

  // Mobile Req Pane Toggle
  const mobileToggle = document.getElementById('bc-mobile-req-toggle');
  if (mobileToggle) mobileToggle.onclick = () => window.toggleMobileReqPane && window.toggleMobileReqPane();

  // Search Panel
  const searchBtns = document.querySelectorAll('[id="btn-search"]');
  searchBtns.forEach(btn => {
    btn.onclick = () => window.toggleSearchPanel && window.toggleSearchPanel();
  });

  // Theme Toggle
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.onclick = () => window.toggleTheme && window.toggleTheme();

  // Settings-Button (falls vorhanden)
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) settingsBtn.onclick = () => window.switchView && window.switchView('settings');

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
