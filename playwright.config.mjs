import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.mjs',
  fullyParallel: true,
  // Фикс: по одному Chromium на воркер, воркеров мало — иначе тесты-раннеры
  // душат друг друга и сыплются ложные таймауты поиска/фокуса (каталог 204
  // игры, ряды рендерят ~80 карточек на первый paint). CI-раннеры тоже тесные.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: { PORT: '4173' },
  },
});
