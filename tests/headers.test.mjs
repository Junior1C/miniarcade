import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROSS_ORIGIN_OPENER_POLICY,
  CSP_CORE,
  CSP_PROD,
  FRAME_SRC_ORIGINS,
  PERMISSIONS_POLICY,
  devSecurityHeaders,
  prodSecurityHeaders,
} from '../scripts/security-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dev CSP is prod CSP minus upgrade-insecure-requests (localhost is http)', () => {
  assert.equal(prodSecurityHeaders()['Content-Security-Policy'], CSP_PROD);
  assert.equal(devSecurityHeaders()['Content-Security-Policy'], CSP_CORE);
  assert.ok(!devSecurityHeaders()['Content-Security-Policy'].includes('upgrade-insecure-requests'));
});

test('dev server uses the shared headers module with full Permissions-Policy', async () => {
  const serve = await readFile(path.join(ROOT, 'scripts', 'serve.mjs'), 'utf8');
  assert.ok(
    serve.includes("from './security-headers.mjs'"),
    'serve.mjs must import scripts/security-headers.mjs instead of hardcoding headers',
  );
  assert.ok(!serve.includes('camera=(), microphone=(), geolocation=()'), 'old short policy must be gone');
  assert.equal(devSecurityHeaders()['Permissions-Policy'], PERMISSIONS_POLICY);
  assert.ok(PERMISSIONS_POLICY.includes('payment=()'));
  assert.ok(PERMISSIONS_POLICY.includes('usb=()'));
});

test('_headers and vercel.json match the shared prod policy', async () => {
  const [headersFile, vercelRaw] = await Promise.all([
    readFile(path.join(ROOT, '_headers'), 'utf8'),
    readFile(path.join(ROOT, 'vercel.json'), 'utf8'),
  ]);
  const vercel = JSON.parse(vercelRaw);
  const vercelHeaders = Object.fromEntries(
    vercel.headers[0].headers.map((entry) => [entry.key, entry.value]),
  );

  for (const [source, csp] of [
    ['_headers', headersFile],
    ['vercel.json', vercelHeaders['Content-Security-Policy']],
  ]) {
    assert.ok(csp.includes(CSP_CORE), `${source} must contain shared CSP_CORE`);
    assert.ok(
      csp.includes('upgrade-insecure-requests'),
      `${source} must add upgrade-insecure-requests on prod HTTPS`,
    );
  }
  assert.ok(headersFile.includes(`Permissions-Policy: ${PERMISSIONS_POLICY}`));
  assert.equal(vercelHeaders['Permissions-Policy'], PERMISSIONS_POLICY);
});

test('COOP same-origin is set everywhere (GH Pages documents the gap)', async () => {
  assert.equal(devSecurityHeaders()['Cross-Origin-Opener-Policy'], CROSS_ORIGIN_OPENER_POLICY);
  assert.equal(prodSecurityHeaders()['Cross-Origin-Opener-Policy'], 'same-origin');
  const [headersFile, vercelRaw] = await Promise.all([
    readFile(path.join(ROOT, '_headers'), 'utf8'),
    readFile(path.join(ROOT, 'vercel.json'), 'utf8'),
  ]);
  const vercelHeaders = Object.fromEntries(
    JSON.parse(vercelRaw).headers[0].headers.map((entry) => [entry.key, entry.value]),
  );
  assert.ok(headersFile.includes('Cross-Origin-Opener-Policy: same-origin'));
  assert.equal(vercelHeaders['Cross-Origin-Opener-Policy'], 'same-origin');
});

test('bridge origins are allowlisted exactly once in both directions', async () => {
  assert.equal(
    new Set(FRAME_SRC_ORIGINS).size,
    FRAME_SRC_ORIGINS.length,
    'FRAME_SRC_ORIGINS must not contain duplicates',
  );
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(path.join(ROOT, 'games'), { withFileTypes: true });
  const bridges = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(ROOT, 'games', entry.name, 'meta.json'), 'utf8'));
    if (meta.url) bridges.push(meta);
  }
  assert.ok(bridges.length > 0, 'at least one bridge entry expected');
  const used = new Set();
  for (const meta of bridges) {
    const origin = new URL(meta.url).origin;
    assert.ok(
      FRAME_SRC_ORIGINS.includes(origin),
      `${meta.id}: origin ${origin} must be in FRAME_SRC_ORIGINS`,
    );
    used.add(origin);
  }
  for (const origin of FRAME_SRC_ORIGINS) {
    assert.ok(used.has(origin), `${origin} is allowlisted but unused — trim the allowlist`);
  }
});

test('index.html meta CSP carries the bridge origins (GH Pages has no headers)', async () => {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match, 'CSP meta tag must exist');
  for (const origin of FRAME_SRC_ORIGINS) {
    assert.ok(match[1].includes(origin), `meta CSP must allow framing ${origin}`);
  }
});
