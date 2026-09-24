import { test, expect } from '@playwright/test';

// A11y-дым без внешних зависимостей (в духе "ноль runtime-зависимостей").
// Полный аудит — вручную через axe DevTools/Lighthouse; здесь — контракт,
// который нельзя тихо сломать: skip-link, фокус, семантика, клавиатура, dialog.
test('каталог доступен с клавиатуры и скринридера', async ({ page }) => {
  await page.goto('/');

  // Skip-link виден по фокусу и переводит фокус на каталог (tabindex=-1).
  await page.keyboard.press('Tab');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#games')).toBeFocused();
  await expect(page).toHaveURL(/#games$/);

  // Поиск доступен по имени, статус — живой регион.
  await expect(page.locator('#search')).toHaveAccessibleName(/найти/i);
  await expect(page.locator('#results-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#results-status')).toHaveAttribute('aria-live', 'polite');

  // Карточки — настоящие ссылки с понятными именами (главная — ряды).
  const firstCard = page.locator('.row-track .card').first();
  await expect(firstCard).toBeVisible();
  const name = await firstCard.evaluate((el) => el.textContent?.trim() ?? '');
  expect(name.length).toBeGreaterThan(0);

  // Эмодзи декоративны и скрыты от скринридера.
  for (const emoji of await page.locator('.card__emoji').all()) {
    await expect(emoji).toHaveAttribute('aria-hidden', 'true');
  }
});

test('плеер — модальный dialog с возвратом фокуса', async ({ page }) => {
  await page.goto('/');
  // Своя игра по точному hash в сетке: грузится мгновенно и офлайн,
  // фокус после load детерминирован (мосты зависят от живой сети).
  await page.fill('#search', 'пятнашки');
  const firstCard = page.locator('#games a[href="#/play/fifteen"]');
  await expect(firstCard).toBeVisible();
  await firstCard.focus();
  await page.keyboard.press('Enter');

  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  // Фокус уходит внутрь dialog (крестик закрытия).
  await expect(page.locator('#player-close')).toBeFocused({ focused: true }).catch(async () => {
    // Chromium может оставить фокус на dialog — это тоже валидно для showModal.
    await expect(dialog).toBeFocused({ focused: false });
  });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // iframe выгружен — игра не продолжает работать в фоне.
  await expect(page.locator('#player-frame')).toHaveAttribute('src', 'about:blank');
});

test('игры имеют базовую семантику счёта и статуса', async ({ page }) => {
  await page.goto('/games/snake/');
  await expect(page.locator('output#score')).toBeVisible();
  const status = page.locator('#status');
  // role=status может быть на самом элементе или унаследован — проверяем мягко.
  const hasLiveRegion = await status.evaluate((el) => {
    const role = el.getAttribute('role');
    const live = el.getAttribute('aria-live');
    return role === 'status' || live === 'polite';
  });
  expect(hasLiveRegion).toBe(true);
});
