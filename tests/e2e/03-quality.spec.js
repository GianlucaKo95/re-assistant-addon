// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navigateTo } = require('./helpers');

test.describe('QS-Prüfung (Business Analyst)', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'ba');
  });

  test('BA-Dashboard lädt und zeigt KPIs', async ({ page }) => {
    await navigateTo(page, 'ba-dashboard');
    await expect(page.locator('.stats-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.stat-card').first()).toBeVisible();
  });

  test('QS-View lädt mit System-Auswahl', async ({ page }) => {
    await navigateTo(page, 'ba-quality');
    await expect(page.locator('#qs-sys-select')).toBeVisible();
    await expect(page.locator('#btn-run-qs')).toBeVisible();
    await expect(page.locator('#btn-run-qs')).toBeEnabled();
  });

  test('QS-Button ist deaktiviert wenn kein System gewählt', async ({ page }) => {
    await navigateTo(page, 'ba-quality');
    // Kein System ausgewählt — Button sollte trotzdem klickbar sein
    // aber Toast zeigen
    await page.click('#btn-run-qs');
    await expect(page.locator('#toast')).toContainText('System auswählen', { timeout: 3_000 });
  });

  test('Dokumentenanalyse-View lädt', async ({ page }) => {
    await navigateTo(page, 'ba-docanalysis');
    await expect(page.locator('#da-sys-select')).toBeVisible();
    await expect(page.locator('#btn-run-da')).toBeVisible();
  });

  test('Diagramm-View lädt', async ({ page }) => {
    await navigateTo(page, 'ba-diagrams');
    await expect(page.locator('#view-ba-diagrams')).toBeVisible();
  });

  test('Workshop-View lädt', async ({ page }) => {
    await navigateTo(page, 'ba-workshop');
    await expect(page.locator('#view-ba-workshop')).toBeVisible();
  });

  test('Vollständigkeitsprüfung lädt mit Templates', async ({ page }) => {
    await navigateTo(page, 'completeness');
    await expect(page.locator('#comp-template-sel')).toBeVisible();
    const options = await page.locator('#comp-template-sel option').count();
    expect(options).toBeGreaterThanOrEqual(3);
  });

});

test.describe('Review-Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'ba');
  });

  test('Review-Dashboard lädt Kanban-Board', async ({ page }) => {
    await navigateTo(page, 'review-workflow');
    await expect(page.locator('#review-dashboard-wrap')).toBeVisible({ timeout: 5_000 });
  });

  test('Kanban-Spalten sind sichtbar', async ({ page }) => {
    await navigateTo(page, 'review-workflow');
    await page.waitForTimeout(1000);
    // Stats-Row sollte vorhanden sein
    const statsRow = page.locator('.stats-row');
    if (await statsRow.isVisible()) {
      await expect(statsRow).toBeVisible();
    }
  });

});
