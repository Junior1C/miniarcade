import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { checkThumbs, isWebp } from '../scripts/qa-thumbs.mjs';

const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
]);

test('isWebp отличает WebP от мусора и обрезанных файлов', () => {
  assert.equal(isWebp(WEBP_HEAD), true);
  assert.equal(isWebp(Buffer.from('not a webp at all....')), false);
  assert.equal(isWebp(Buffer.alloc(0)), false);
  assert.equal(isWebp(Buffer.from('RIFFxxxx')), false);
  assert.equal(isWebp('RIFF....WEBP'), false);
});

test('checkThumbs ловит недостающий, пустой и битый файл', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-thumbs-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'games', 'ok'), { recursive: true });
  await mkdir(path.join(dir, 'games', 'empty'), { recursive: true });
  await mkdir(path.join(dir, 'games', 'broken'), { recursive: true });
  await mkdir(path.join(dir, 'games', 'emoji'), { recursive: true });
  await writeFile(path.join(dir, 'games', 'ok', 'thumb.webp'), WEBP_HEAD);
  await writeFile(path.join(dir, 'games', 'empty', 'thumb.webp'), Buffer.alloc(0));
  await writeFile(path.join(dir, 'games', 'broken', 'thumb.webp'), Buffer.from('junkjunkjunkjunk'));
  await writeFile(
    path.join(dir, 'data', 'catalog.json'),
    JSON.stringify({
      version: 1,
      games: [
        { id: 'ok', thumb: 'games/ok/thumb.webp' },
        { id: 'empty', thumb: 'games/empty/thumb.webp' },
        { id: 'broken', thumb: 'games/broken/thumb.webp' },
        { id: 'missing', thumb: 'games/missing/thumb.webp' },
        { id: 'emoji' },
      ],
    }),
  );
  const failures = await checkThumbs(dir);
  assert.equal(failures.length, 3);
  assert.ok(failures.some((f) => f.includes('games/missing/thumb.webp')));
  assert.ok(failures.some((f) => f.includes('пустой')));
  assert.ok(failures.some((f) => f.includes('не WebP')));
});
