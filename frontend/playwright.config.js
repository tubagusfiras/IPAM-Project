import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:8100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
