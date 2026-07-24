import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

/**
 * Regression test for the exact bug fixed 2026-07-24:
 * BlockDetail.jsx's OWNER_TYPES had value="infrastructure" but the DB enum
 * owner_type_t only accepts "internal". The dropdown LABEL still reads
 * "Infrastructure" (unchanged, by design) but the underlying VALUE must be
 * "internal". Selecting it and saving must not cause a 500 error.
 */

test('Selecting Infrastructure owner_type in BlockDetail does not cause a 500', async ({ page }) => {
  const serverErrors = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/v1/allocations/') && res.status() >= 500) {
      serverErrors.push(`${res.status()} on ${res.url()}`);
    }
  });

  await login(page);
  await expect(page.getByText('firas', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'IP Networks' }).click();
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('table tbody tr');
    return Array.from(rows).some(r => r.textContent.trim().length > 0);
  }, { timeout: 10000 });

  const rows = page.locator('table tbody tr').filter({ hasNotText: '' });
  await rows.first().click();
  await page.waitForTimeout(1500);

  // Find an owner_type <select> — identified by having a "Reserved" option
  // alongside "Infrastructure" label (unique to the owner_type dropdown)
  const ownerSelects = page.locator('select').filter({ hasText: 'Infrastructure' }).filter({ hasText: 'Peering' });
  const count = await ownerSelects.count();
  expect(count, 'Expected at least one owner_type select on the block detail page').toBeGreaterThan(0);

  const firstSelect = ownerSelects.first();

  // The dropdown must NOT expose value="infrastructure" anymore (that was the bug)
  const infraOption = firstSelect.locator('option[value="infrastructure"]');
  await expect(infraOption, 'value="infrastructure" should not exist in the dropdown').toHaveCount(0);

  // The corrected value "internal" must exist (label still reads "Infrastructure")
  const internalOption = firstSelect.locator('option[value="internal"]');
  await expect(internalOption, 'value="internal" should exist in the dropdown').toHaveCount(1);

  // Select it and confirm no 500 error follows
  await firstSelect.selectOption('internal');
  await page.waitForTimeout(1500);

  expect(serverErrors, `Server errors detected: ${JSON.stringify(serverErrors)}`).toEqual([]);
});
