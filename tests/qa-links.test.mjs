import test from 'node:test';
import assert from 'node:assert/strict';

import { extractLocalHrefs, sitemapToFiles } from '../scripts/qa-links.mjs';

test('extractLocalHrefs берёт только локальные ссылки без дублей', () => {
  const html = `<a href="stats.html">s</a><link href="assets/css/main.css">`
    + `<script src="assets/js/main.js"></script><a href="#/play/x">h</a>`
    + `<a href="https://example.com/y">e</a><iframe src="about:blank">`;
  assert.deepEqual(extractLocalHrefs(html), ['stats.html', 'assets/css/main.css', 'assets/js/main.js']);
});

test('sitemapToFiles маппит канонические URL в файлы и метит чужие', () => {
  const xml = `<urlset><url><loc>https://junior1c.github.io/miniarcade/</loc></url>`
    + `<url><loc>https://junior1c.github.io/miniarcade/stats.html</loc></url>`
    + `<url><loc>https://junior1c.github.io/miniarcade/games/snake/</loc></url>`
    + `<url><loc>https://evil.example/game</loc></url></urlset>`;
  const mapped = sitemapToFiles(xml);
  assert.equal(mapped[0].file, 'index.html');
  assert.equal(mapped[1].file, 'stats.html');
  assert.equal(mapped[2].file, 'games/snake/index.html');
  assert.ok(mapped[3].external);
});
