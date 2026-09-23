import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROSS_ORIGIN_OPENER_POLICY,
  CSP_CORE,
  CSP_PROD,
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
