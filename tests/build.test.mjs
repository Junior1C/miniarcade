import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog, buildCspMeta } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function makeFixture(t, games) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'games'), { recursive: true });
  for (const [folder, files] of Object.entries(games)) {
    const gameDir = path.join(dir, 'games', folder);
    await mkdir(gameDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(gameDir, name), content, 'utf8');
    }
  }
  return dir;
}

const validMeta = JSON.stringify({
  id: 'demo',
  title: 'Демо',
  emoji: '🚀',
  description: 'Описание',
});

test('buildCatalog succeeds on the real games folder', async (t) => {
  const dir = await makeFixture(t, {});
  await rm(path.join(dir, 'games'), { recursive: true, force: true });
  const payload = await buildCatalog(ROOT);
  assert.equal(payload.version, 1);
  assert.ok(payload.games.length >= 3);
  const ids = payload.games.map((game) => game.id);
  assert.ok(ids.includes('snake'));
  assert.ok(ids.includes('clicker'));
  assert.ok(ids.includes('memory'));
  for (const game of payload.games) {
    if (game.url) {
      assert.equal(typeof game.author, 'string');
      assert.equal(typeof game.license, 'string');
      assert.equal('file' in game, false);
    } else if (game.link) {
      assert.equal(typeof game.source, 'string');
      assert.equal('file' in game, false);
      assert.equal('url' in game, false);
    } else {
      assert.equal(typeof game.file, 'string');
      assert.ok(game.file.startsWith('games/'));
    }
    assert.equal('order' in game, false);
  }
  assert.ok(ids.includes('ext-2048'));
});

test('buildCatalog rejects id that does not match folder', async (t) => {
  const dir = await makeFixture(t, {
    demo: { 'meta.json': validMeta.replace('"demo"', '"other"'), 'index.html': '<!DOCTYPE html>' },
  });
  await assert.rejects(() => buildCatalog(dir), /must match folder name/);
});

test('buildCatalog rejects unknown meta keys', async (t) => {
  const dir = await makeFixture(t, {
    demo: {
      'meta.json': validMeta.replace('"demo"', '"demo", "hack": true'),
      'index.html': '<!DOCTYPE html>',
    },
  });
  await assert.rejects(() => buildCatalog(dir), /unknown key "hack"/);
});

test('buildCatalog rejects disallowed sandbox tokens', async (t) => {
  const dir = await makeFixture(t, {
    demo: {
      'meta.json': validMeta.replace(
        '"demo"',
        '"demo", "sandbox": ["allow-same-origin"]',
      ),
      'index.html': '<!DOCTYPE html>',
    },
  });
  await assert.rejects(() => buildCatalog(dir), /disallowed token/);
});

test('buildCatalog rejects missing index.html', async (t) => {
  const dir = await makeFixture(t, {
    demo: { 'meta.json': validMeta },
  });
  await assert.rejects(() => buildCatalog(dir), /index\.html is missing/);
});

test('buildCatalog rejects stray files in games/', async (t) => {
  const dir = await makeFixture(t, {});
  await writeFile(path.join(dir, 'games', 'leftover.html'), '<!DOCTYPE html>', 'utf8');
  await assert.rejects(() => buildCatalog(dir), /unexpected files/);
});

const bridgeMeta = {
  id: 'ext-demo',
  title: 'Демо',
  emoji: '🚀',
  description: 'Описание',
  url: 'https://gabrielecirulli.github.io/2048/',
  author: 'Автор',
  license: 'MIT',
  repo: 'https://github.com/example/demo',
};

test('buildCatalog accepts a bridge entry without index.html', async (t) => {
  const dir = await makeFixture(t, {
    'ext-demo': { 'meta.json': JSON.stringify(bridgeMeta) },
  });
  const payload = await buildCatalog(dir);
  assert.equal(payload.games.length, 1);
  assert.equal(payload.games[0].url, bridgeMeta.url);
  assert.equal(payload.games[0].author, 'Автор');
  assert.equal('file' in payload.games[0], false);
});

test('buildCatalog rejects bridge with non-https url', async (t) => {
  const dir = await makeFixture(t, {
    'ext-demo': { 'meta.json': JSON.stringify({ ...bridgeMeta, url: 'http://example.com/game' }) },
  });
  await assert.rejects(() => buildCatalog(dir), /https URL/);
});

test('buildCatalog rejects bridge with non-allowlisted origin', async (t) => {
  const dir = await makeFixture(t, {
    'ext-demo': { 'meta.json': JSON.stringify({ ...bridgeMeta, url: 'https://evil.example/game' }) },
  });
  await assert.rejects(() => buildCatalog(dir), /FRAME_SRC_ORIGINS/);
});

test('buildCatalog rejects bridge without attribution', async (t) => {
  const { author, ...noAuthor } = bridgeMeta;
  const dir = await makeFixture(t, {
    'ext-demo': { 'meta.json': JSON.stringify(noAuthor) },
  });
  await assert.rejects(() => buildCatalog(dir), /attribution/);
});

test('buildCspMeta emits the shared prod policy', () => {
  const tag = buildCspMeta();
  assert.ok(tag.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(tag.includes('frame-src'));
  assert.ok(tag.includes('upgrade-insecure-requests'));
  assert.ok(!tag.includes('frame-ancestors'), 'meta must omit frame-ancestors (spec ignores it)');
});

test('buildCatalog syncs CSP meta into index.html/stats.html and lists stats in sitemap', async (t) => {
  const dir = await makeFixture(t, {
    demo: { 'meta.json': validMeta, 'index.html': '<!DOCTYPE html>' },
  });
  await writeFile(
    path.join(dir, 'index.html'),
    '<!DOCTYPE html><head><meta http-equiv="Content-Security-Policy" content="old">\n  <!-- LD-JSON-START -->\n  <!-- LD-JSON-END --></head>',
    'utf8',
  );
  await writeFile(
    path.join(dir, 'stats.html'),
    '<!DOCTYPE html><head><!-- CSP-META --></head>',
    'utf8',
  );
  await buildCatalog(dir);
  const [indexHtml, statsHtml, sitemap] = await Promise.all([
    readFile(path.join(dir, 'index.html'), 'utf8'),
    readFile(path.join(dir, 'stats.html'), 'utf8'),
    readFile(path.join(dir, 'sitemap.xml'), 'utf8'),
  ]);
  assert.ok(!indexHtml.includes('content="old"'), 'stale CSP meta must be replaced');
  assert.ok(indexHtml.includes(buildCspMeta()));
  assert.ok(!statsHtml.includes('CSP-META'), 'placeholder must be replaced');
  assert.ok(statsHtml.includes(buildCspMeta()));
  assert.ok(sitemap.includes('/stats.html'), 'sitemap must list the stats vitrine');
  // Идемпотентность: второй прогон ничего не меняет.
  await buildCatalog(dir);
  assert.equal(await readFile(path.join(dir, 'stats.html'), 'utf8'), statsHtml);
  assert.equal(await readFile(path.join(dir, 'index.html'), 'utf8'), indexHtml);
});
