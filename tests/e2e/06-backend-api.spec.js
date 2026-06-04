// @ts-check
const { test, expect } = require('@playwright/test');
const { USERS, TEST_SYSTEM, TEST_REQ } = require('../fixtures/test-data');

test.describe('Backend API — Kritische Routen', () => {

  let authCookie = '';

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: USERS.admin.email, password: USERS.admin.password }
    });
    expect(res.ok()).toBeTruthy();
  });

  // ── Requirements CRUD ──────────────────────────────────────
  test('POST /api/requirements — erstellt Anforderung', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const sys = await request.get('/api/systems');
    const systems = await sys.json();
    expect(systems.length).toBeGreaterThan(0);
    const sysId = systems[0].id;

    const res = await request.post('/api/requirements', {
      data: {
        id:          'REQ-TEST-' + Date.now(),
        systemId:    sysId,
        title:       TEST_REQ.title,
        description: TEST_REQ.description,
        category:    TEST_REQ.category,
        priority:    TEST_REQ.priority,
        status:      'open',
      }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBeTruthy();
  });

  test('GET /api/requirements — gibt Liste zurück', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const res  = await request.get('/api/requirements');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/requirements?systemId=X — filtert korrekt', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const sys  = await (await request.get('/api/systems')).json();
    const sysId = sys[0]?.id;
    if (!sysId) return;

    const res  = await request.get(`/api/requirements?systemId=${sysId}`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    for (const r of data) expect(r.systemId).toBe(sysId);
  });

  // ── Optimistic Locking ────────────────────────────────────
  test('POST /api/requirements — Konflikt gibt 409 zurück', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const sys    = await (await request.get('/api/systems')).json();
    const sysId  = sys[0]?.id;
    const reqs   = await (await request.get(`/api/requirements?systemId=${sysId}`)).json();
    if (!reqs.length) { test.skip(true, 'Keine Anforderungen'); return; }

    const req = reqs[0];
    // Falsche updatedAt senden → Konflikt
    const res = await request.post('/api/requirements', {
      data: { ...req, title: 'Konflikt-Test', _expectedUpdatedAt: 12345 }
    });
    expect(res.status()).toBe(409);
    const data = await res.json();
    expect(data.conflict).toBeTruthy();
    expect(data.serverVersion).toBeDefined();
    expect(data.clientVersion).toBeDefined();
  });

  // ── Systems ───────────────────────────────────────────────
  test('POST /api/systems — erstellt System', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const id  = 'sys-api-test-' + Date.now();
    const res = await request.post('/api/systems', {
      data: { id, name: TEST_SYSTEM.name + Date.now(), description: TEST_SYSTEM.description }
    });
    expect(res.ok()).toBeTruthy();
    // Aufräumen
    await request.delete(`/api/systems/${id}`);
  });

  // ── Search ────────────────────────────────────────────────
  test('GET /api/search?q= — gibt Ergebnisse zurück', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const res  = await request.get('/api/search?q=System');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.requirements).toBeDefined();
    expect(Array.isArray(data.requirements)).toBeTruthy();
  });

  test('GET /api/search ohne Query — gibt leeres Ergebnis', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const res  = await request.get('/api/search?q=');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.requirements.length).toBe(0);
  });

  // ── Backup ────────────────────────────────────────────────
  test('GET /api/backup — erstellt vollständigen Export', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const res  = await request.get('/api/backup');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.version).toBeDefined();
    expect(data.exportedAt).toBeDefined();
    expect(Array.isArray(data.users)).toBeTruthy();
    expect(Array.isArray(data.systems)).toBeTruthy();
    expect(Array.isArray(data.requirements)).toBeTruthy();
    // Passwörter dürfen nicht im Backup sein
    for (const u of data.users) expect(u.password).toBeUndefined();
  });

  // ── Archiv ────────────────────────────────────────────────
  test('DELETE mit archive=true archiviert statt löscht', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const sys  = await (await request.get('/api/systems')).json();
    const sysId = sys[0]?.id;
    // Neue Anforderung erstellen
    const reqId = 'REQ-ARCHIVE-TEST-' + Date.now();
    await request.post('/api/requirements', {
      data: { id:reqId, systemId:sysId, title:'Zu archivieren', description:'', category:'Funktional', priority:'low', status:'open' }
    });
    // Archivieren
    const res = await request.delete(`/api/requirements/${reqId}?archive=true`);
    expect(res.ok()).toBeTruthy();
    // Nicht mehr in normaler Liste
    const reqs = await (await request.get(`/api/requirements?systemId=${sysId}`)).json();
    expect(reqs.find(r=>r.id===reqId)).toBeUndefined();
    // Aber in Archiv
    const archived = await request.get(`/api/requirements/archived?systemId=${sysId}`);
    if (archived.ok()) {
      const archivedData = await archived.json();
      expect(archivedData.find(r=>r.id===reqId)).toBeDefined();
    }
  });

  // ── Onboarding ────────────────────────────────────────────
  test('GET /api/onboarding/status — gibt Status zurück', async ({ request }) => {
    await request.post('/api/auth/login', { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const res  = await request.get('/api/onboarding/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(typeof data.complete).toBe('boolean');
    expect(data.steps).toBeDefined();
  });

});
