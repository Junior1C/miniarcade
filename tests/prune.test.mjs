import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { dropOriginsFromAllowlist, planPrune } from '../scripts/prune-bridges.mjs';

async function fixture(t, metas) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-prune-'));
  t.after(() => import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true })));
  await mkdir(path.join(dir, 'games'), { recursive: true });
  await mkdir(path.join(dir, 'scripts'), { recursive: true });
  for (const meta of metas) {
    const gameDir = path.join(dir, 'games', meta.id);
    await mkdir(gameDir, { recursive: true });
    await writeFile(path.join(gameDir, 'meta.json'), JSON.stringify(meta), 'utf8');
  }
  return dir;
}

const bridge = (id, url) => ({ id, url, author: 'a', license: 'MIT' });

test('planPrune refuses natives, unknown ids and duplicates', async (t) => {
  const dir = await fixture(t, [bridge('dead-game', 'https://dead.example/game'), { id: 'snake' }]);
  const plan = await planPrune(dir, ['dead-game', 'snake', 'nope', 'dead-game']);
  assert.deepEqual(plan.remove, ['dead-game']);
  assert.equal(plan.errors.length, 2);
});

test('planPrune drops origin only when unused elsewhere', async (t) => {
  const dir = await fixture(t, [
    bridge('gone-a', 'https://gone.example/a'),
    bridge('gone-b', 'https://gone.example/b'),
    bridge('stays', 'https://stay.example/'),
  ]);
  const plan = await planPrune(dir, ['gone-a', 'gone-b']);
  assert.deepEqual(plan.remove, ['gone-a', 'gone-b']);
  assert.deepEqual(plan.dropOrigins, ['https://gone.example']);
  const keep = await planPrune(dir, ['gone-a']);
  assert.deepEqual(keep.dropOrigins, [], 'origin stays while another bridge uses it');
});

test('dropOriginsFromAllowlist removes exact lines only', async (t) => {
  const dir = await fixture(t, [bridge('x', 'https://x.example/')]);
  const target = path.join(dir, 'scripts', 'security-headers.mjs');
  await writeFile(
    target,
    "export const FRAME_SRC_ORIGINS = [\n  'https://gone.example',\n  // keep me\n  'https://stay.example',\n];\n",
    'utf8',
  );
  const dropped = await dropOriginsFromAllowlist(dir, ['https://gone.example']);
  assert.equal(dropped, 1);
  const text = await readFile(target, 'utf8');
  assert.ok(!text.includes('gone.example'));
  assert.ok(text.includes('stay.example'));
  assert.ok(text.includes('// keep me'), 'comments must survive');
});
