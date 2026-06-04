// @ts-check
const { test, expect } = require('@playwright/test');
const { USERS } = require('../fixtures/test-data');

test.describe('Authentifizierung', () => {

  test('Login mit korrekten Zugangsdaten', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.fill('#l-email', USERS.admin.email);
    await page.fill('#l-pass', USERS.admin.password);
    await page.click('#login-btn');

    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#user-name-label')).toContainText('Admin');
    await expect(page.locator('#user-role-badge')).toContainText('Administrator');
  });

  test('Login mit falschem Passwort zeigt Fehlermeldung', async ({ page }) => {
    await page.goto('/');
    await page.fill('#l-email', USERS.admin.email);
    await page.fill('#l-pass', 'falschespasswort');
    await page.click('#login-btn');

    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('falsch');
    await expect(page.locator('#login-screen')).toBeVisible();
  });

  test('Login mit leeren Feldern zeigt Fehler', async ({ page }) => {
    await page.goto('/');
    await page.click('#login-btn');
    // App-Screen darf nicht erscheinen
    await expect(page.locator('#app-screen')).not.toBeVisible();
  });

  test('Session bleibt nach Reload erhalten', async ({ page }) => {
    await page.goto('/');
    await page.fill('#l-email', USERS.admin.email);
    await page.fill('#l-pass', USERS.admin.password);
    await page.click('#login-btn');
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });

    // Reload
    await page.reload();
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#user-name-label')).toContainText('Admin');
  });

  test('Logout funktioniert', async ({ page }) => {
    await page.goto('/');
    await page.fill('#l-email', USERS.admin.email);
    await page.fill('#l-pass', USERS.admin.password);
    await page.click('#login-btn');
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });

    await page.click('#btn-logout');
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5_000 });
  });

  test('Alle Demo-User können sich einloggen', async ({ page }) => {
    for (const [name, user] of Object.entries(USERS)) {
      await page.goto('/');
      await page.fill('#l-email', user.email);
      await page.fill('#l-pass', user.password);
      await page.click('#login-btn');
      await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });
      await page.click('#btn-logout');
      await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Enter-Taste im Passwort-Feld löst Login aus', async ({ page }) => {
    await page.goto('/');
    await page.fill('#l-email', USERS.admin.email);
    await page.fill('#l-pass', USERS.admin.password);
    await page.press('#l-pass', 'Enter');
    await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });
  });

});
