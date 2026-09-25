import test from 'node:test';
import assert from 'node:assert/strict';

import { gameSource } from '../assets/js/source.js';

test('native game (no url) is MiniArcade without link', () => {
  assert.deepEqual(gameSource({ id: 'snake' }), {
    key: 'miniarcade',
    label: 'MiniArcade',
    external: false,
    href: null,
  });
  assert.equal(gameSource(null).key, 'miniarcade');
});

test('portal comes from repo donor, not play-url host', () => {
  // Игра задеплоена на vercel, код взят с GitHub — бейдж GitHub.
  assert.deepEqual(gameSource({ url: 'https://boxindanga.vercel.app/', repo: 'https://github.com/user/game' }), {
    key: 'github',
    label: 'GitHub',
    external: true,
    href: 'https://github.com/user/game',
  });
});

test('github.io play url without repo is GitHub', () => {
  assert.deepEqual(gameSource({ url: 'https://wayou.github.io/t-rex-runner/' }), {
    key: 'github',
    label: 'GitHub',
    external: true,
    href: 'https://wayou.github.io/t-rex-runner/',
  });
});

test('gitlab repo is GitLab', () => {
  assert.deepEqual(
    gameSource({ url: 'https://dino-runner-79dd43.gitlab.io/', repo: 'https://gitlab.com/ccm27/dino-runner' }),
    {
      key: 'gitlab',
      label: 'GitLab',
      external: true,
      href: 'https://gitlab.com/ccm27/dino-runner',
    },
  );
});

test('other resources fall back to bare domain with donor link', () => {
  assert.deepEqual(gameSource({ url: 'https://4ark.me/game/' }), {
    key: '4ark-me',
    label: '4ark.me',
    external: true,
    href: 'https://4ark.me/game/',
  });
  assert.equal(gameSource({ url: 'https://www.example.com/play' }).label, 'example.com');
});

test('broken url degrades to Web, not throw', () => {
  assert.equal(gameSource({ url: 'not a url' }).label, 'Web');
});
