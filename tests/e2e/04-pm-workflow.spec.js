// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navigateTo, waitForToast } = require('./helpers');

test.describe('Projektmanager — Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'pm');
  });

  test('PM-Dashboard lädt mit Statistiken', async ({ page }) => {
    await navigateTo(page, 'pm-dashboard');
    await expect(page.locator('#view-pm-dashboard')).toBeVisible({ timeout: 5_000 });
  });

  test('Zuweisung-View lädt Filter', async ({ page }) => {
    await navigateTo(page, 'pm-assign');
    await expect(page.locator('#assign-filter-sys')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#assign-filter-status')).toBeVisible();
  });

  test('Backlog-View lädt ohne Fehler', async ({ page }) => {
    await navigateTo(page, 'pm-backlog');
    await expect(page.locator('#view-pm-backlog')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#btn-gen-backlog')).toBeVisible();
  });

  test('Priorisierungs-View zeigt Methoden', async ({ page }) => {
    await navigateTo(page, 'pm-prio');
    await expect(page.locator('#prio-method')).toBeVisible();
    const options = await page.locator('#prio-method option').count();
    expect(options).toBeGreaterThanOrEqual(3);
  });

  test('Sprint-Planning View lädt', async ({ page }) => {
    await navigateTo(page, 'sprint-planning');
    await expect(page.locator('#sprint-sys-sel')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#btn-create-sprint')).toBeVisible();
  });

  test('Sprint planen ohne System zeigt Warnung', async ({ page }) => {
    await navigateTo(page, 'sprint-planning');
    await page.click('#btn-create-sprint');
    await expect(page.locator('#toast')).toContainText('System auswählen', { timeout: 3_000 });
  });

  test('QS-Trends View lädt', async ({ page }) => {
    await navigateTo(page, 'qs-trends');
    await expect(page.locator('#qs-trends-sys-sel')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#qs-trends-days')).toBeVisible();
  });

  test('Integrationen-View zeigt Jira und Azure', async ({ page }) => {
    await navigateTo(page, 'pm-integrations');
    await expect(page.locator('#view-pm-integrations')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.int-tab').first()).toBeVisible();
  });

  test('NL-Query View lädt mit Beispielen', async ({ page }) => {
    await navigateTo(page, 'nl-query');
    await expect(page.locator('#nlq-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#nlq-send')).toBeVisible();
    const examples = await page.locator('.nlq-example').count();
    expect(examples).toBeGreaterThanOrEqual(3);
  });

  test('Changelog View lädt mit Zeitraum-Selector', async ({ page }) => {
    await navigateTo(page, 'changelog');
    await expect(page.locator('#cl-period')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#btn-gen-changelog')).toBeVisible();
  });

});

test.describe('Projektmanager — API-Tests', () => {

  test('Requirements-API gibt Liste zurück', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'tobias@re.local', password: 'test123' }
    });
    expect(loginRes.ok()).toBeTruthy();

    const reqs = await request.get('/api/requirements');
    expect(reqs.ok()).toBeTruthy();
    const data = await reqs.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('Systems-API gibt Liste zurück', async ({ request }) => {
    await request.post('/api/auth/login', {
      data: { email: 'tobias@re.local', password: 'test123' }
    });
    const sys = await request.get('/api/systems');
    expect(sys.ok()).toBeTruthy();
    const data = await sys.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
  });

  test('Version-API gibt korrekte Version zurück', async ({ request }) => {
    const res  = await request.get('/api/version');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.db).toBeTruthy(); // DB-Engine (sqlite oder postgresql)
  });

  test('Unauthentifizierter Zugriff gibt 401', async ({ request }) => {
    const res = await request.get('/api/requirements');
    expect(res.status()).toBe(401);
  });

});
