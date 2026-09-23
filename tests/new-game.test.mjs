import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGame } from '../scripts/new-game.mjs';
import { buildCatalog } from '../scripts/build.mjs';

async function makeRoot(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-new-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('createGame scaffolds a valid game', async (t) => {
  const root = await makeRoot(t);
  await createGame(root, 'moya-igra', 'Моя <игра>');

  const files = (await readdir(path.join(root, 'games', 'moya-igra'))).sort();
  assert.deepEqual(files, ['game.js', 'index.html', 'meta.json', 'style.css']);

  const html = await readFile(path.join(root, 'games', 'moya-igra', 'index.html'), 'utf8');
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes('Моя &lt;игра&gt;'));
  assert.ok(!html.includes('Моя <игра>'));

  const payload = await buildCatalog(root);
  assert.equal(payload.games.length, 1);
  assert.equal(payload.games[0].id, 'moya-igra');
  assert.equal(payload.games[0].title, 'Моя <игра>');
});

test('createGame rejects invalid id', async (t) => {
  const root = await makeRoot(t);
  await assert.rejects(() => createGame(root, 'Bad_ID', 'X'), /kebab-case/);
});

test('createGame rejects empty title', async (t) => {
  const root = await makeRoot(t);
  await assert.rejects(() => createGame(root, 'demo', '   '), /title/);
});

test('createGame rejects existing folder', async (t) => {
  const root = await makeRoot(t);
  await createGame(root, 'demo', 'Демо');
  await assert.rejects(() => createGame(root, 'demo', 'Демо'), /already exists/);
});
