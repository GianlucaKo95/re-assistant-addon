// @ts-check
const { expect } = require('@playwright/test');
const { USERS } = require('../fixtures/test-data');

/**
 * Loggt einen User ein und wartet auf die App.
 */
async function login(page, role = 'admin') {
  const user = USERS[role];
  if (!user) throw new Error(`Unbekannte Rolle: ${role}`);
  await page.goto('/');
  await page.fill('#l-email', user.email);
  await page.fill('#l-pass', user.password);
  await page.click('#login-btn');
  await expect(page.locator('#app-screen')).toBeVisible({ timeout: 10_000 });
  return user;
}

/**
 * Navigiert zu einer View.
 */
async function navigateTo(page, viewId) {
  // Via Nav-Button falls vorhanden
  const navBtn = page.locator(`#nav-${viewId}`);
  if (await navBtn.isVisible()) {
    await navBtn.click();
  } else {
    // Fallback: JavaScript
    await page.evaluate((id) => window.switchView(id), viewId);
  }
  await expect(page.locator(`#view-${viewId}`)).toBeVisible({ timeout: 5_000 });
}

/**
 * Erstellt ein Test-System via API.
 */
async function createTestSystem(request, name = 'Test-System-' + Date.now()) {
  const loginRes = await request.post('/api/auth/login', {
    data: { email: USERS.admin.email, password: USERS.admin.password }
  });
  expect(loginRes.ok()).toBeTruthy();

  const sysRes = await request.post('/api/systems', {
    data: { id: 'sys-test-' + Date.now(), name, description: 'E2E-Test' }
  });
  expect(sysRes.ok()).toBeTruthy();
  return { id: 'sys-test-' + Date.now(), name };
}

/**
 * Wartet auf Toast-Meldung.
 */
async function waitForToast(page, text) {
  await expect(page.locator('#toast')).toContainText(text, { timeout: 10_000 });
}

/**
 * Schliesst Modal falls offen.
 */
async function closeModalIfOpen(page) {
  const modal = page.locator('#modal-overlay');
  if (await modal.isVisible()) {
    await page.click('#modal-close');
    await expect(modal).not.toBeVisible();
  }
}

module.exports = { login, navigateTo, createTestSystem, waitForToast, closeModalIfOpen };
