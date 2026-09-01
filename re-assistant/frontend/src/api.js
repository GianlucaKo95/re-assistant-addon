/**
 * api.js — Web-API-Client für das HA Add-on
 * Kommuniziert per fetch() mit dem Express-Backend auf /api/
 */

const API = {
  // ── AUTH ──────────────────────────────────────────────────
  async login(data)     { return post('api/auth/login', data); },
  async logout()        { return post('api/auth/logout'); },
  async changePassword(d){ return post('api/auth/change-password', d); },
  async getMe()         { return get('api/auth/me'); },
  async getAppVersion() { const d = await get('api/version'); return d.version; },

  // ── USERS ─────────────────────────────────────────────────
  async getUsers()       { return get('api/users'); },
  async saveUser(u)      { return post('api/users', u); },
  async deleteUser(id)   { return del(`api/users/${id}`); },

  // ── SYSTEMS ───────────────────────────────────────────────
  async getSystems()     { return get('api/systems'); },
  async saveSystem(s)    { return post('api/systems', s); },
  async deleteSystem(id) { return del(`api/systems/${id}`); },

  async uploadDocs(systemId, files) {
    const fd = new FormData();
    for (const f of files) {
      // Bei Ordner-Upload: relativen Pfad als Dateinamen nutzen (für Gruppierung)
      const name = f.webkitRelativePath || f.name;
      fd.append('files', f, name);
    }
    const res = await fetch(`api/systems/${systemId}/docs`, {
      method: 'POST', body: fd, credentials: 'include'
    });
    return res.json();
  },
  async removeDoc({ systemId, docId }) {
    return del(`api/systems/${systemId}/docs/${docId}`);
  },

  // ── REQUIREMENTS ──────────────────────────────────────────
  async getRequirements(params = {}) {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v))
    );
    return get('api/requirements' + (q.toString() ? '?' + q : ''));
  },
  async getUserStories(params = {}) {
    const q = new URLSearchParams(params).toString();
    return get('api/user-stories' + (q ? '?' + q : ''));
  },
  async saveUserStory(s)      { return post('api/user-stories', s); },
  async deleteUserStory(id)   { return del('api/user-stories/' + id); },
  async generateUserStories(reqId, systemId) {
    return post('api/user-stories/generate', { reqId, systemId });
  },
  async getTestCases(params = {}) {
    const q = new URLSearchParams(params).toString();
    return get('api/test-cases' + (q ? '?' + q : ''));
  },
  async saveTestCase(t)       { return post('api/test-cases', t); },
  async deleteTestCase(id)    { return del('api/test-cases/' + id); },
  async getReqHistory(reqId) { return get('api/requirements/' + reqId + '/history'); },
  async getReqComments(reqId) { return get('api/requirements/' + reqId + '/comments'); },

  async getConflicts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return get('api/conflicts' + (q ? '?' + q : ''));
  },

  async saveRequirement(r) {
    const result = await post('api/requirements', r);
    // Konflikt-Check asynchron nach dem Speichern
    if (r.id && r.systemId) {
      setTimeout(() => checkConflictsAfterSave(r.id, r.systemId), 500);
    }
    return result;
  },
  async deleteRequirement(id)  { return del(`api/requirements/${id}`); },
  async addComment({ reqId, comment }) {
    return post(`api/requirements/${reqId}/comments`, comment);
  },
  async assignRequirement({ reqId, userId, subcategory }) {
    return post(`api/requirements/${reqId}/assign`, { userId, subcategory });
  },

  // ── BACKLOGS ──────────────────────────────────────────────
  async getBacklogs(systemId)  { return get('api/backlogs' + (systemId ? `?systemId=${systemId}` : '')); },
  async saveBacklog(b)         { return post('api/backlogs', b); },
  async deleteBacklog(id)      { return del(`api/backlogs/${id}`); },

  // ── WORKSHOPS ─────────────────────────────────────────────
  async getWorkshops(systemId) { return get('api/workshops' + (systemId ? `?systemId=${systemId}` : '')); },
  async saveWorkshop(w)        { return post('api/workshops', w); },

  // ── DIAGRAMS ──────────────────────────────────────────────
  async getDiagrams(systemId)  { return get('api/diagrams' + (systemId ? `?systemId=${systemId}` : '')); },
  async saveDiagram(d)         { return post('api/diagrams', d); },
  async deleteDiagram(id)      { return del(`api/diagrams/${id}`); },

  // ── ANTHROPIC (über Backend-Proxy) ───────────────────────
  async anthropicRequest({ body }) {
    const res = await fetch('api/ai/chat', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  },

  // ── JIRA (über Backend-Proxy) ─────────────────────────────
  async jiraGetProjects({ url, email, token }) {
    return post('api/jira/projects', { url, email, token, path: '/rest/api/3/project?maxResults=50', method: 'GET' });
  },
  async jiraGetIssues({ url, email, token, projectKey }) {
    return post('api/jira/issues', { url, email, token, path: `/rest/api/3/search?jql=${encodeURIComponent(`project=${projectKey} ORDER BY created DESC`)}&maxResults=100&fields=summary,description,issuetype,priority,status`, method: 'GET' });
  },
  async jiraCreateIssues({ url, email, token, projectKey, issues }) {
    return post('api/jira/create', { url, email, token, path: '/rest/api/3/issue/bulk', method: 'POST',
      body: { issueUpdates: issues.map(i => ({ fields: {
        project: { key: projectKey },
        summary: i.title,
        description: { type:'doc', version:1, content:[{ type:'paragraph', content:[{ type:'text', text: i.description||'' }] }] },
        issuetype: { name: i.type || 'Story' },
        priority: { name: i.priority==='high' ? 'High' : i.priority==='low' ? 'Low' : 'Medium' }
      }})) }
    });
  },

  // ── EXPORT (Browser-Download) ─────────────────────────────
  async exportMarkdown({ requirements, stories, projectName, extra }) {
    let md = `# ${projectName||'Export'}\n**Datum:** ${new Date().toLocaleDateString('de-DE')}\n\n`;
    if (extra) md += extra + '\n\n';
    if (requirements?.length) {
      md += `## Requirements (${requirements.length})\n\n`;
      for (const r of requirements) {
        md += `### ${r.id}: ${r.title}\n**Priorität:** ${r.priority} | **Status:** ${r.status}\n\n${r.description||''}\n`;
        if (r.rationale) md += `\n> 💡 ${r.rationale}\n`;
        if (r.qualityScore) md += `\n**QS-Score:** ${r.qualityScore}/10\n`;
        md += '\n---\n\n';
      }
    }
    dlText(md, `${projectName||'export'}.md`, 'text/markdown');
    return true;
  },
  async exportCSV({ requirements }) {
    const e = v => `"${String(v||'').replace(/"/g,'""')}"`;
    let csv = 'ID,System,Kategorie,Titel,Beschreibung,Priorität,Status,Zugewiesen,QS-Score,Tags\n';
    for (const r of requirements)
      csv += [r.id,r.systemId,r.category,r.title,r.description,r.priority,r.status,r.assignedTo||'',r.qualityScore||'',(r.tags||[]).join(';')].map(e).join(',') + '\n';
    dlText('\uFEFF' + csv, 'requirements.csv', 'text/csv');
    return true;
  },
  async exportJSON(data) {
    dlText(JSON.stringify(data, null, 2), `re-export-${Date.now()}.json`, 'application/json');
    return true;
  },
  async exportDiagramSvg({ filename, svg }) {
    dlText(svg, filename || 'diagram.svg', 'image/svg+xml');
    return true;
  },

  // ── LICENSE ───────────────────────────────────────────────
  async getLicenseStatus()     { return get('api/license/status'); },
  async activateLicense(key)   { return post('api/license/activate', { key }); },
  async removeLicense()        { return del('api/license'); },

  // ── EINSTELLUNGEN (localStorage) ─────────────────────────
  async loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('re-settings') || 'null') || defaultSettings();
      // Sicherheit: Keys niemals aus localStorage zurückgeben
      delete s.apiKey;
      delete s.grokApiKey;
      delete s.groqApiKey;
      return s;
    }
    catch(e) { return defaultSettings(); }
  },
  async saveSettings(s) {
    // Keys NIEMALS in localStorage speichern
    const safeSettings = { ...s };
    delete safeSettings.apiKey;
    delete safeSettings.grokApiKey;
    delete safeSettings.groqApiKey;
    localStorage.setItem('re-settings', JSON.stringify(safeSettings));
    return true;
  },

  openExternal(url) { window.open(url, '_blank', 'noopener'); },

  // Dateiauswahl im Browser
  pickFiles(accept = '*') {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true; inp.accept = accept;
      inp.onchange = () => resolve(Array.from(inp.files));
      inp.click();
    });
  },

  pickFolder() {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.webkitdirectory = true;
      inp.multiple = true;
      inp.onchange = () => {
        // Nur unterstützte Code/Dokument-Formate durchlassen
        const allowed = /\.(txt|md|docx|pdf|js|ts|tsx|jsx|py|java|cs|cpp|c|h|go|rb|php|swift|kt|rs|json|csv|yaml|yml|html|css|scss|sql|sh|bash|vue|dart|xml|toml|ini|env|config|r|scala|ex|exs)$/i;
        const files = Array.from(inp.files).filter(f => allowed.test(f.name));
        resolve(files);
      };
      inp.click();
    });
  },
};

function defaultSettings() {
  // API-Keys werden NICHT in localStorage gespeichert — nur in der DB (app_settings)
  return { provider:'anthropic', model:'claude-sonnet-4-6', grokModel:'grok-3-mini', groqModel:'llama-3.3-70b-versatile', language:'de', detail:'standard', voiceURI:'', persona:'professional', jiraUrl:'', jiraEmail:'', jiraToken:'' };
}

async function get(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: data !== undefined ? JSON.stringify(data) : undefined
  });
  return res.json();
}
async function del(url) {
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  return res.json();
}
function dlText(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

window.api = API;
export default API;
