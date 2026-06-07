'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/notification-settings.js
 * F: UI für Benachrichtigungs-Einstellungen — E-Mail SMTP + HA-Webhook + Webhook.
 */

async function loadNotificationSettings() {
  if (S.user?.role !== 'admin') {
    $('notif-settings-wrap').innerHTML = '<div class="empty-state"><h3>Nur für Administratoren</h3></div>';
    return;
  }

  let settings = {};
  try {
    const res = await fetch('/api/notifications/settings', { credentials:'include' });
    settings   = await res.json();
  } catch(e) {}

  const wrap = $('notif-settings-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <!-- E-Mail -->
    <div class="sg">
      <div class="sg-head">
        📧 E-Mail-Benachrichtigungen
        <label style="font-size:12px;font-weight:400;color:var(--t2);margin-left:auto;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="ns-email-enabled" ${settings.email_enabled==='1'?'checked':''}/>
          Aktiviert
        </label>
      </div>
      <div class="sg-body">
        <div class="frow"><label>SMTP-Server</label>
          <input type="text" id="ns-smtp-host" value="${esc(settings.smtp_host||'smtp.gmail.com')}" placeholder="smtp.gmail.com"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="frow"><label>Port</label>
            <input type="number" id="ns-smtp-port" value="${esc(settings.smtp_port||'587')}" placeholder="587"/></div>
          <div class="frow"><label>SSL/TLS</label>
            <select id="ns-smtp-secure">
              <option value="0" ${settings.smtp_secure!=='1'?'selected':''}>STARTTLS (587)</option>
              <option value="1" ${settings.smtp_secure==='1'?'selected':''}>SSL (465)</option>
            </select>
          </div>
        </div>
        <div class="frow"><label>Benutzername / E-Mail</label>
          <input type="text" id="ns-smtp-user" value="${esc(settings.smtp_user||'')}" placeholder="user@gmail.com"/></div>
        <div class="frow"><label>Passwort / App-Passwort</label>
          <input type="password" id="ns-smtp-pass" value="${esc(settings.smtp_pass||'')}" placeholder="App-Passwort …"/></div>
        <div class="frow"><label>Benachrichtigungen senden an</label>
          <input type="text" id="ns-email-to" value="${esc(settings.email_to||'')}" placeholder="team@firma.de, chef@firma.de"/></div>
        <div class="fhint">Gmail: App-Passwort unter Konto → Sicherheit → App-Passwörter erstellen.</div>
      </div>
    </div>

    <!-- Home Assistant Webhook -->
    <div class="sg">
      <div class="sg-head">🏠 Home Assistant Webhook</div>
      <div class="sg-body">
        <div class="frow"><label>Webhook-URL</label>
          <input type="text" id="ns-ha-webhook" value="${esc(settings.ha_webhook_url||'')}"
            placeholder="http://homeassistant.local:8123/api/webhook/re-assistant"/></div>
        <div class="fhint">
          In HA: Einstellungen → Automatisierungen → Neu → Auslöser: Webhook.<br>
          Felder: <code>event_type</code>, <code>message</code>, <code>req_title</code>, <code>user_name</code>
        </div>
      </div>
    </div>

    <!-- Generischer Webhook (Slack, Teams, etc.) -->
    <div class="sg">
      <div class="sg-head">🔗 Webhook (Slack / Teams / Custom)</div>
      <div class="sg-body">
        <div class="frow"><label>Webhook-URL</label>
          <input type="text" id="ns-webhook-url" value="${esc(settings.webhook_url||'')}"
            placeholder="https://hooks.slack.com/services/…"/></div>
        <div class="frow"><label>Secret-Header (optional)</label>
          <input type="text" id="ns-webhook-secret" value="${esc(settings.webhook_secret||'')}"
            placeholder="Geheimer Schlüssel …"/></div>
        <div class="fhint">
          Slack: Incoming Webhooks aktivieren → Webhook-URL kopieren.<br>
          Teams: Connectors → Incoming Webhook → URL kopieren.
        </div>
      </div>
    </div>

    <!-- Events -->
    <div class="sg">
      <div class="sg-head">📋 Benachrichtigungs-Events</div>
      <div class="sg-body">
        ${[
          { key:'review_requested', label:'Review angefordert' },
          { key:'review_approved',  label:'Anforderung freigegeben' },
          { key:'review_rejected',  label:'Anforderung abgelehnt' },
          { key:'req_assigned',     label:'Anforderung zugewiesen' },
          { key:'mention',          label:'Erwähnung in Kommentar' },
          { key:'sprint_ready',     label:'Sprint-Plan erstellt' },
        ].map(e => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--b1)">
            <span style="font-size:13px">${esc(e.label)}</span>
            <input type="checkbox" id="ns-event-${e.key}" ${settings['event_'+e.key]!=='0'?'checked':''}/>
          </div>`).join('')}
      </div>
    </div>

    <!-- Aktionen -->
    <div style="display:flex;gap:8px;padding:0 0 16px">
      <button class="btn-primary" onclick="saveNotificationSettings()">💾 Speichern</button>
      <button class="btn-secondary" onclick="testNotifications()" id="btn-test-notif">📤 Test senden</button>
    </div>`;
}

async function saveNotificationSettings() {
  const settings = {
    email_enabled:    $('ns-email-enabled')?.checked ? '1' : '0',
    smtp_host:        $('ns-smtp-host')?.value.trim(),
    smtp_port:        $('ns-smtp-port')?.value.trim(),
    smtp_secure:      $('ns-smtp-secure')?.value,
    smtp_user:        $('ns-smtp-user')?.value.trim(),
    smtp_pass:        $('ns-smtp-pass')?.value,
    email_to:         $('ns-email-to')?.value.trim(),
    ha_webhook_url:   $('ns-ha-webhook')?.value.trim(),
    webhook_url:      $('ns-webhook-url')?.value.trim(),
    webhook_secret:   $('ns-webhook-secret')?.value.trim(),
  };
  // Events
  for (const key of ['review_requested','review_approved','review_rejected','req_assigned','mention','sprint_ready']) {
    settings['event_'+key] = $('ns-event-'+key)?.checked ? '1' : '0';
  }

  await fetch('/api/notifications/settings', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  toast('✅ Benachrichtigungs-Einstellungen gespeichert');
}

async function testNotifications() {
  const btn = $('btn-test-notif');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sende …';
  try {
    const res = await fetch('/api/notifications/test', { method:'POST', credentials:'include' });
    const data = await res.json();
    btn.disabled = false; btn.innerHTML = '📤 Test senden';
    if (data.ok) toast('✅ Test-Benachrichtigung gesendet');
    else toast('❌ ' + (data.error || 'Fehlgeschlagen'));
  } catch(e) {
    btn.disabled = false; btn.innerHTML = '📤 Test senden';
    toast('❌ ' + e.message);
  }
}

window.loadNotificationSettings = loadNotificationSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.testNotifications        = testNotifications;
