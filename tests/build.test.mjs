import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog } from '../scripts/build.mjs';

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
    assert.equal(typeof game.file, 'string');
    assert.ok(game.file.startsWith('games/'));
    assert.equal('order' in game, false);
  }
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
