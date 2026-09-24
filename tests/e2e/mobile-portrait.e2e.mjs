import { test, expect } from '@playwright/test';

const SHOT = 'test-results/mobile-shots';

async function expectNoHOverflow(page) {
  const over = await page.evaluate(
    () => document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test.describe(`portrait ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('home: no overflow, drawer, 2-col grid', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.row-track .card').first()).toBeVisible();
      await expectNoHOverflow(page);
      // Sidebar hidden, hamburger visible.
      await expect(page.locator('#sidebar')).toBeHidden();
      await expect(page.locator('#menu-toggle')).toBeVisible();
      // Drawer opens with genres.
      await page.locator('#menu-toggle').click();
      await expect(page.locator('#mobile-sidebar')).toBeVisible();
      expect(await page.locator('#mobile-genre-list .genre-button').count()).toBeGreaterThan(0);
      await page.screenshot({ path: `${SHOT}/m-${vp.width}-drawer.png` });
      await page.keyboard.press('Escape');
      // Топбар двухэтажный, но поиск/селект внутри него, не на контенте.
      const bar = await page.locator('.topbar').boundingBox();
      const sel = await page.locator('#sort').boundingBox();
      expect(sel.y).toBeGreaterThanOrEqual(bar.y - 1);
      expect(sel.y + sel.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
      expect(bar.height).toBeGreaterThan(60);
      // Grid mode: 2 columns, cards fit.
      await page.fill('#search', 'а');
      await expect(page.locator('#games .card').first()).toBeVisible();
      const cols = await page
        .locator('#games')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(cols).toBe(2);
      const box = await page.locator('#games .card').first().boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
      await expectNoHOverflow(page);
      await page.screenshot({ path: `${SHOT}/m-${vp.width}-grid.png` });
    });

    test('player dialog fits viewport', async ({ page }) => {
      await page.goto('/');
      await page.fill('#search', 'пятнашки');
      await page.locator('#games a[href="#/play/fifteen"]').first().click();
      const dialog = page.locator('#player');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.width).toBeLessThanOrEqual(vp.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      // Кнопки бара целиком внутри бара.
      const pbar = await page.locator('.player__bar').boundingBox();
      for (const id of ['#player-expand', '#player-close']) {
        const b = await page.locator(id).boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(pbar.x - 1);
        expect(b.x + b.width).toBeLessThanOrEqual(pbar.x + pbar.width + 1);
      }
      await page.locator('#player-expand').click();
      await expect(dialog).toHaveClass(/player--fullscreen/);
      const full = await dialog.boundingBox();
      expect(Math.round(full.width)).toBe(vp.width);
      await page.screenshot({ path: `${SHOT}/m-${vp.width}-player.png` });
    });

    test('native game page portrait', async ({ page }) => {
      await page.goto('/games/snake/');
      await expect(page.locator('#board')).toBeVisible();
      await expectNoHOverflow(page);
      for (const btn of await page.locator('.pad__btn').all()) {
        await expect(btn).toBeVisible();
      }
      await page.screenshot({ path: `${SHOT}/m-${vp.width}-snake.png`, fullPage: true });
    });

    test('stats page portrait', async ({ page }) => {
      await page.goto('/stats.html');
      await expectNoHOverflow(page);
      await page.screenshot({ path: `${SHOT}/m-${vp.width}-stats.png`, fullPage: true });
    });
  });
}
