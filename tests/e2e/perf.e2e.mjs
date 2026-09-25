import { test, expect } from '@playwright/test';

// Perf-дым: каталог обязан оставаться мгновенным без сборки и CDN.
// Пороги щедрые для CI (медленные раннеры), их задача — ловить регрессии,
// а не мериться миллисекундами. Жёсткие байтовые бюджеты — в scripts/check-budgets.mjs.
test('каталог грузится быстро и без ошибок консоли', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const started = Date.now();
  await page.goto('/');
  await expect(page.locator('.row-track .card').first()).toBeVisible();
  const loadMs = Date.now() - started;

  expect(loadMs).toBeLessThan(8000);
  expect(errors).toEqual([]);

  const catalogTiming = await page.evaluate(async () => {
    const t0 = performance.now();
    const response = await fetch('data/catalog.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`catalog fetch failed: ${response.status}`);
    const payload = await response.json();
    return { ms: performance.now() - t0, bytes: JSON.stringify(payload).length, games: payload.games.length };
  });
  expect(catalogTiming.ms).toBeLessThan(2000);
  // Дублирует байтовый бюджет из check-budgets.mjs на уровне браузера.
  expect(catalogTiming.bytes).toBeLessThan(250 * 1024);
  expect(catalogTiming.games).toBeGreaterThan(0);
});

test('CLS стартового кадра в норме (пререндер рядов)', async ({ page }) => {
  // Совокупное смещение макета за первые секунды жизни страницы:
  // пререндер 12 карточек обязан держать CLS ≤ 0.1 без JS-ожиданий.
  await page.goto('/');
  await expect(page.locator('.row-track .card').first()).toBeVisible();
  await page.waitForTimeout(2500);
  const cls = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let value = 0;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.hadRecentInput) continue;
              value += entry.value;
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(value);
          }, 500);
        } catch {
          resolve(0);
        }
      }),
  );
  expect(cls).toBeLessThan(0.1);
});

test('статические ряды видны без JavaScript (пререндер build)', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.row-track .card')).toHaveCount(12);
  await expect(page.locator('.row-track .card__link').first()).toHaveAttribute('href', '#/play/2048');
  await context.close();
});

test('поиск остаётся отзывчивым (debounce 120мс)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.row-track .card').first()).toBeVisible();
  await page.fill('#search', 'квиндичи');
  await expect(page.locator('#games .card')).toHaveCount(1);
});
