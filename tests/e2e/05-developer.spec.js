// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navigateTo } = require('./helpers');

test.describe('Developer — Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'dev');
  });

  test('Developer-Aufgaben View lädt', async ({ page }) => {
    await navigateTo(page, 'dev-work');
    await expect(page.locator('#view-dev-work')).toBeVisible({ timeout: 5_000 });
  });

  test('Source-Analyse View lädt', async ({ page }) => {
    await navigateTo(page, 'source-analysis');
    await expect(page.locator('#sa-sys-sel')).toBeVisible({ timeout: 5_000 });
  });

  test('Voice-Bot View lädt', async ({ page }) => {
    await navigateTo(page, 'voice');
    await expect(page.locator('#view-voice')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#voice-orb')).toBeVisible();
  });

  test('Meine Aufgaben Badge aktualisiert sich', async ({ page }) => {
    await navigateTo(page, 'my-tasks');
    await expect(page.locator('#tasks-wrap')).toBeVisible({ timeout: 5_000 });
    // Tasks-View lädt ohne Fehler
    await expect(page.locator('#view-my-tasks')).toBeVisible();
  });

});

test.describe('Admin — Benutzerverwaltung', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  test('Benutzerliste lädt alle Demo-User', async ({ page }) => {
    await navigateTo(page, 'admin-users');
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 5_000 });
    const rows = await page.locator('.data-table tbody tr').count();
    expect(rows).toBeGreaterThanOrEqual(5);
  });

  test('System-Liste zeigt mindestens ein System', async ({ page }) => {
    await navigateTo(page, 'admin-systems');
    await expect(page.locator('#systems-list')).toBeVisible({ timeout: 5_000 });
    const systems = await page.locator('.system-card').count();
    expect(systems).toBeGreaterThanOrEqual(1);
  });

  test('Neues System kann erstellt werden', async ({ page }) => {
    await navigateTo(page, 'admin-systems');
    await page.click('#btn-new-system');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.fill('#sm-name', 'Test-System-' + Date.now());
    await page.fill('#sm-desc', 'Playwright-Test');
    await page.click('button:has-text("Speichern")');
    await expect(page.locator('#modal-overlay')).not.toBeVisible({ timeout: 5_000 });
  });

  test('Benachrichtigungs-Einstellungen laden', async ({ page }) => {
    await navigateTo(page, 'notification-settings');
    await expect(page.locator('#notif-settings-wrap')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#ns-email-enabled')).toBeVisible();
  });

  test('Einstellungen-View zeigt Persona-Selector', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page.locator('#persona-selector-wrap')).toBeVisible({ timeout: 5_000 });
    const personas = await page.locator('#persona-selector-wrap [onclick]').count();
    expect(personas).toBeGreaterThanOrEqual(3);
  });

});

test.describe('Features — Suche und Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  test('Globale Suche öffnet mit Ctrl+Shift+F', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app-screen', { state: 'visible', timeout: 10_000 });
    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#global-search-panel')).toBeVisible({ timeout: 3_000 });
  });

  test('Suche schließt mit Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app-screen', { state: 'visible', timeout: 10_000 });
    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#global-search-panel')).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-search-panel')).not.toBeVisible({ timeout: 2_000 });
  });

  test('Notification-Bell ist sichtbar', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app-screen', { state: 'visible', timeout: 10_000 });
    await expect(page.locator('#notif-bell')).toBeVisible();
  });

  test('Import-View lädt', async ({ page }) => {
    await navigateTo(page, 'import');
    await expect(page.locator('#import-sys-sel')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#btn-import-file')).toBeVisible();
    await expect(page.locator('#btn-import-paste')).toBeVisible();
  });

});
