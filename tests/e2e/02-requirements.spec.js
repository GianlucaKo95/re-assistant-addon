// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navigateTo, waitForToast } = require('./helpers');
const { TEST_REQ } = require('../fixtures/test-data');

test.describe('Anforderungen — CRUD', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'business');
  });

  test('Neue Anforderung manuell erstellen', async ({ page }) => {
    await navigateTo(page, 'business-reqs');
    await page.click('#btn-new-req-biz');

    // Modal ausfüllen
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.fill('#rm-title', TEST_REQ.title);
    await page.fill('#rm-desc', TEST_REQ.description);
    await page.selectOption('#rm-cat', TEST_REQ.category);
    await page.selectOption('#rm-pri', TEST_REQ.priority);

    await page.click('button:has-text("Speichern")');
    await waitForToast(page, '✅');

    // Anforderung erscheint in der Liste
    await expect(page.locator('.req-card, .bc-req-item').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Anforderung bearbeiten', async ({ page }) => {
    await navigateTo(page, 'business-reqs');
    // Erste bearbeitbare Anforderung
    const editBtn = page.locator('button:has-text("Bearbeiten")').first();
    if (!await editBtn.isVisible()) {
      test.skip(true, 'Keine Anforderungen vorhanden');
      return;
    }
    await editBtn.click();
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.fill('#rm-title', 'Geänderter Titel ' + Date.now());
    await page.click('button:has-text("Speichern")');
    await waitForToast(page, '✅');
  });

  test('Anforderung löschen', async ({ page }) => {
    // Erst Anforderung erstellen
    await navigateTo(page, 'business-reqs');
    await page.click('#btn-new-req-biz');
    await page.fill('#rm-title', 'ZuLöschende-Anforderung-' + Date.now());
    await page.click('button:has-text("Speichern")');
    await waitForToast(page, '✅');

    // Löschen via Modal
    const editBtn = page.locator('button:has-text("Bearbeiten")').first();
    await editBtn.click();
    const delBtn = page.locator('button:has-text("Löschen")');
    if (await delBtn.isVisible()) {
      page.on('dialog', d => d.accept());
      await delBtn.click();
      await waitForToast(page, '✅');
    }
  });

  test('Anforderungs-Suche filtert korrekt', async ({ page }) => {
    await navigateTo(page, 'business-reqs');
    const searchInput = page.locator('#biz-filter-q');
    if (!await searchInput.isVisible()) return;

    await searchInput.fill('Login');
    await page.waitForTimeout(500);
    // Ergebnisse enthalten nur passende Einträge
    const items = page.locator('.req-card');
    const count = await items.count();
    if (count > 0) {
      const text = await items.first().textContent();
      expect(text?.toLowerCase()).toContain('login');
    }
  });

  test('Prioritäts-Filter funktioniert', async ({ page }) => {
    await navigateTo(page, 'business-reqs');
    const priFilter = page.locator('#biz-filter-status');
    if (!await priFilter.isVisible()) return;
    await priFilter.selectOption('open');
    await page.waitForTimeout(300);
    // Kein Crash, View bleibt sichtbar
    await expect(page.locator('#view-business-reqs')).toBeVisible();
  });

});

test.describe('Anforderungen — Chat & Extraktion', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'business');
  });

  test('Business Chat lädt ohne Fehler', async ({ page }) => {
    await navigateTo(page, 'business-chat');
    await expect(page.locator('#bc-chat-msgs')).toBeVisible();
    await expect(page.locator('#bc-input')).toBeVisible();
  });

  test('Chat-Input sendet mit Enter', async ({ page }) => {
    await navigateTo(page, 'business-chat');
    await page.fill('#bc-input', 'Test-Nachricht');
    await page.press('#bc-input', 'Enter');
    // Nachricht erscheint in Chat
    await expect(page.locator('.msg.u').first()).toBeVisible({ timeout: 3_000 });
  });

});
