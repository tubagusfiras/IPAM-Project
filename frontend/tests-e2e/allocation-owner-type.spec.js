import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

/**
 * Regression tests for the owner_type mismatch bug fixed 2026-07-24.
 * Bug: frontend sent owner_type="infrastructure" but the DB enum owner_type_t
 * only accepts "internal" (among others) — causing a 500 error on save.
 */

test.describe('Allocation owner_type dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expect(page.getByText('firas', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('IP Networks page loads without server errors', async ({ page }) => {
    const serverErrors = [];
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} on ${res.url()}`);
    });

    await page.getByRole('button', { name: 'IP Networks' }).click();
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(1000);

    expect(serverErrors, `Unexpected server errors: ${JSON.stringify(serverErrors)}`).toEqual([]);
  });

  test('Opening a block detail page loads without server errors', async ({ page }) => {
    const serverErrors = [];
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} on ${res.url()}`);
    });

    await page.getByRole('button', { name: 'IP Networks' }).click();
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1500);

    expect(serverErrors, `Unexpected server errors: ${JSON.stringify(serverErrors)}`).toEqual([]);
  });
});
