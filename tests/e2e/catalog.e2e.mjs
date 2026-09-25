import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('каталог рендерит карточки и статус', async ({ page }) => {
  await page.goto('/');
  // Главная — ряды-карусели, сетка включается поиском/жанром/сортировкой.
  await expect(page.locator('.row-track .card').first()).toBeVisible();
  await expect(page.locator('#results-status')).toContainText('Всего:');
  await expect(page.locator('#error-state')).toBeHidden();
});

test('диплинк #/play/ открывает игру со старта (ленивый плеер)', async ({ page }) => {
  await page.goto('/#/play/fifteen');
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#player-frame')).toHaveAttribute('src', /fifteen/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#player')).toBeHidden();
});

test('рекорд из игры сохраняется в портал и виден на карточке', async ({ page }) => {
  await page.goto('/');
  // Грузим deferred-плеер (слушатель postMessage живёт в нём),
  // сразу закрываем: слать рекорду уже есть куда.
  await page.locator('.row-track .card__link').first().click();
  await expect(page.locator('#player')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#player')).toBeHidden();
  // Синтетика вместо живой партии: origin 'null' как у sandbox-iframe.
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'null',
        data: { type: 'miniarcade:score', game: 'fifteen', score: 42 },
      }),
    );
  });
  await expect(page.evaluate(() => localStorage.getItem('miniarcade-best:fifteen'))).resolves.toBe('42');
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card__stats').first()).toContainText('Ваш рекорд: 42');
});

test('старый хеш редиректит на канонический id (aliases.json)', async ({ page }) => {
  // Без хардкода id: первая пара из живой карты переименований.
  const aliases = JSON.parse(await readFile('data/aliases.json', 'utf8'));
  const catalog = JSON.parse(await readFile('data/catalog.json', 'utf8'));
  const [oldId, newId] = Object.entries(aliases)[0];
  const target = catalog.games.find((game) => game.id === newId);
  assert.ok(target, 'alias target must exist in catalog');
  await page.goto(`/#/play/${oldId}`);
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#player-frame')).toHaveAttribute('src', target.url ?? target.file);
  expect(new URL(await page.url()).hash).toBe(`#/play/${newId}`);
});

test('лендинг всегда ряды; повторный выбор сортировки работает', async ({ page }) => {
  // Селект помнит «Новые», но первая всегда главная-ряды.
  // Открытие списка (pointerdown) приводит вид к селекту, поэтому
  // повторный выбор того же пункта не мёртвый (change бы не стрельнул).
  await page.addInitScript(() => localStorage.setItem('miniarcade-sort', 'new'));
  await page.goto('/');
  await expect(page.locator('#sort')).toHaveValue('new');
  await expect(page.locator('.row-track .card__link').first()).toBeVisible();
  await page.locator('#sort').dispatchEvent('pointerdown');
  await expect(page.locator('#home-rows')).toBeHidden();
  // Ожидание — из живого каталога (зеркало sort.js new: added ↓, title ↑),
  // а не захардкоженный id: переименования больше не ломают тест.
  const live = JSON.parse(await readFile('data/catalog.json', 'utf8'));
  const maxAdded = live.games.map((game) => game.added || '').sort().at(-1);
  const expected = live.games
    .filter((game) => (game.added || '') === maxAdded)
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'))[0];
  const first = await page.locator('#games .card__link').first().getAttribute('href');
  expect(first).toBe(`#/play/${expected.id}`);
  await expect(page.locator('#results-status')).toContainText('Новые');
});

test('карточки: свои игры с WebP-превью, мосты с эмодзи', async ({ page }) => {
  await page.goto('/');
  const thumbs = page.locator('.row-track .card__thumb');
  // Ретрящееся ожидание вместо одноразового count(): ряды едут после каталога.
  await expect(thumbs.first()).toBeVisible();
  expect(await thumbs.count()).toBeGreaterThan(0);
  await expect(thumbs.first()).toHaveAttribute('loading', 'lazy');
  await expect(thumbs.first()).toHaveAttribute('alt', '');
  // Мост без превью (пустой кадр осознанно выкинут) — остаётся эмодзи.
  await page.fill('#search', 'duckhunt');
  await expect(page.locator('#games .card__emoji').first()).toBeVisible();
  await expect(page.locator('#games .card__thumb')).toHaveCount(0);
});

test('поиск расширяется по фокусу и показывает лупу', async ({ page }) => {
  await page.goto('/');
  const box = page.locator('.search');
  await expect(page.locator('.search__icon')).toBeVisible();
  const before = await box.evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('#search').focus();
  await expect
    .poll(async () => box.evaluate((el) => el.getBoundingClientRect().width), { timeout: 2000 })
    .toBeGreaterThan(before + 50);
  await expect(page.locator('.sort-label')).not.toBeVisible();
});

test('поиск фильтрует каталог', async ({ page }) => {
  await page.goto('/');
  // Запрос с заведомо единственным хитом (уникальное название):
  // счётчик не должен гнить при добавлении мостов (кейс «пятнашки» ×3).
  await page.fill('#search', 'квиндичи');
  await expect(page.locator('#games .card')).toHaveCount(1);
  // В заголовке теперь и бейдж языка (RU/EN/…) — проверяем вхождение.
  await expect(page.locator('#games .card__title')).toContainText('Квиндичи');
  await page.fill('#search', 'квццыв');
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('плеер открывает игру в sandbox и закрывается по Esc', async ({ page }) => {
  await page.goto('/');
  // Своя игра: iframe локальный, без сетевой гонки.
  await page.fill('#search', 'пятнашки');
  await page.locator('#games a[href="#/play/fifteen"]').first().click();
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
  await page.locator('#games a[href="#/play/fifteen"]').first().click();
  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  const closeBtn = page.locator('#player-close');
  await expect(closeBtn).toHaveAttribute('commandfor', 'player');
  await expect(closeBtn).toHaveAttribute('command', 'close');
  await closeBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#player-frame')).toHaveAttribute('src', 'about:blank');
});

test('кнопка разворота вписывает игру в окно и видна справа', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'квиндичи');
  await page.locator('#games .card__link').first().click();
  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  const expand = page.locator('#player-expand');
  await expect(expand).toBeVisible();
  // Иконки без видимых слов: имя — через aria-label.
  await expect(expand).toHaveAttribute('aria-label', 'Развернуть на весь экран');
  await expect(page.locator('#player-close')).toHaveAttribute('aria-label', 'Закрыть игру');
  const bar = await page.locator('.player__bar').boundingBox();
  const box = await expand.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
  await expand.click();
  await expect(dialog).toHaveClass(/player--fullscreen/);
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  const full = await dialog.boundingBox();
  expect(Math.round(full.width)).toBe(page.viewportSize().width);
  await expand.click();
  await expect(dialog).not.toHaveClass(/player--fullscreen/);
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
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
