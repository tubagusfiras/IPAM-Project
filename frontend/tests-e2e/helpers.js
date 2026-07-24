import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

export async function login(page) {
  await page.goto('/');
  await page.getByPlaceholder('admin').fill(process.env.TEST_ADMIN_USERNAME);
  await page.getByPlaceholder('Enter your password').fill(process.env.TEST_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  // Wait for navigation away from login page
  await page.waitForSelector('text=Customers', { timeout: 10000 }).catch(() => {});
}
