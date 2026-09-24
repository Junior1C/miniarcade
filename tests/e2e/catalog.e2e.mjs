import { test, expect } from '@playwright/test';

test('каталог рендерит карточки и статус', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#games .card').first()).toBeVisible();
  await expect(page.locator('#results-status')).toContainText('Всего:');
  await expect(page.locator('#error-state')).toBeHidden();
});

test('карточки: свои игры с WebP-превью, мосты с эмодзи', async ({ page }) => {
  await page.goto('/');
  const thumbs = page.locator('#games .card__thumb');
  expect(await thumbs.count()).toBeGreaterThan(0);
  await expect(thumbs.first()).toHaveAttribute('loading', 'lazy');
  await expect(thumbs.first()).toHaveAttribute('alt', '');
  // Мост без превью (пустой кадр осознанно выкинут) — остаётся эмодзи.
  await page.fill('#search', 'duckhunt');
  await expect(page.locator('#games .card__emoji').first()).toBeVisible();
  await expect(page.locator('#games .card__thumb')).toHaveCount(0);
});

test('поиск фильтрует каталог', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card')).toHaveCount(1);
  await expect(page.locator('#games .card__title')).toHaveText('Пятнашки');
  await page.fill('#search', 'квццыв');
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('плеер открывает игру в sandbox и закрывается по Esc', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card')).toHaveCount(1);
  await page.locator('#games .card').first().click();
  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  const frame = page.locator('#player-frame');
  const sandbox = await frame.getAttribute('sandbox');
  expect(sandbox).toContain('allow-scripts');
  expect(sandbox).not.toContain('allow-same-origin');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/#/);
});

test('кнопка закрытия плеера работает мышью (invoker + JS-фолбэк)', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card')).toHaveCount(1);
  await page.locator('#games .card').first().click();
  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  const closeBtn = page.locator('#player-close');
  await expect(closeBtn).toHaveAttribute('commandfor', 'player');
  await expect(closeBtn).toHaveAttribute('command', 'close');
  await closeBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#player-frame')).toHaveAttribute('src', 'about:blank');
});

test('структурированные данные каталога валидны', async ({ page }) => {
  await page.goto('/');
  const ldText = await page.locator('script[type="application/ld+json"]').textContent();
  expect(ldText).toBeTruthy();
  const ld = JSON.parse(ldText);
  expect(ld['@type']).toBe('ItemList');
  // Карточек на странице может быть меньше из-за пагинации,
  // а разметка покрывает только свои игры (мосты/ссылки — нет) —
  // сверяем с числом локальных игр каталога, а не с видимыми.
  const catalog = await page.evaluate(async () => {
    const response = await fetch('data/catalog.json');
    return response.json();
  });
  const localCount = catalog.games.filter((game) => game.file).length;
  expect(ld.itemListElement.length).toBe(localCount);
  for (const entry of ld.itemListElement) {
    expect(entry.item['@type']).toBe('VideoGame');
  }
});
