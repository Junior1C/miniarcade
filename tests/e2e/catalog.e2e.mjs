import { test, expect } from '@playwright/test';

test('каталог рендерит карточки и статус', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#games .card').first()).toBeVisible();
  await expect(page.locator('#results-status')).toContainText('Всего:');
  await expect(page.locator('#error-state')).toBeHidden();
});

test('поиск фильтрует каталог', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'змей');
  await expect(page.locator('#games .card')).toHaveCount(1);
  await expect(page.locator('#games .card__title')).toHaveText('Змейка');
  await page.fill('#search', 'квццыв');
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('плеер открывает игру в sandbox и закрывается по Esc', async ({ page }) => {
  await page.goto('/');
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
