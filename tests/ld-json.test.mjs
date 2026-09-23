import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildCatalog, buildLdJson } from '../scripts/build.mjs';

const INDEX_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>T</title>
  <!-- LD-JSON-START -->
  <!-- LD-JSON-END -->
</head>
<body></body>
</html>
`;

async function makeRoot(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-ld-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'games', 'demo'), { recursive: true });
  await writeFile(
    path.join(dir, 'games', 'demo', 'meta.json'),
    JSON.stringify({ id: 'demo', title: 'Демо', emoji: '🚀', description: 'Описание' }),
    'utf8',
  );
  await writeFile(path.join(dir, 'games', 'demo', 'index.html'), '<!DOCTYPE html>', 'utf8');
  await writeFile(path.join(dir, 'index.html'), INDEX_TEMPLATE, 'utf8');
  return dir;
}

function extractLd(html) {
  const match = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
  assert.ok(match, 'index.html must contain an ld+json block');
  return JSON.parse(match[1]);
}

test('buildLdJson emits a valid VideoGame ItemList', () => {
  const payload = JSON.parse(
    buildLdJson([
      { id: 'snake', title: 'Змейка', description: 'Описание', file: 'games/snake/index.html' },
    ]),
  );
  assert.equal(payload['@context'], 'https://schema.org');
  assert.equal(payload['@type'], 'ItemList');
  assert.equal(payload.itemListElement.length, 1);
  const item = payload.itemListElement[0].item;
  assert.equal(item['@type'], 'VideoGame');
  assert.equal(item.name, 'Змейка');
  assert.ok(item.url.endsWith('/games/snake/'));
});

test('build injects ld+json between markers and stays idempotent', async (t) => {
  const dir = await makeRoot(t);
  await buildCatalog(dir);
  const first = await readFile(path.join(dir, 'index.html'), 'utf8');
  const ld = extractLd(first);
  assert.equal(ld.itemListElement.length, 1);
  assert.equal(ld.itemListElement[0].item.name, 'Демо');

  await buildCatalog(dir);
  const second = await readFile(path.join(dir, 'index.html'), 'utf8');
  assert.equal(second, first);
});

test('build fails fast when index.html has no LD markers', async (t) => {
  const dir = await makeRoot(t);
  await writeFile(path.join(dir, 'index.html'), '<!DOCTYPE html><html></html>', 'utf8');
  await assert.rejects(() => buildCatalog(dir), /LD-JSON markers/);
});
