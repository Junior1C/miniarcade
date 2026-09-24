// Синхронизация CSP в носителях из единого источника.
// _headers (Cloudflare) и vercel.json (Vercel) обязаны содержать ровно
// CSP_PROD из scripts/security-headers.mjs — руками править perilous:
// рассинхрон ловит tests/headers.test.mjs, а правит этот скрипт.
// index.html/stats.html (<meta>) синхронизирует build.mjs.
//
// Запуск: node scripts/sync-headers.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CSP_PROD } from './security-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function syncHeaders(rootDir = ROOT) {
  const headersPath = path.join(rootDir, '_headers');
  const headers = await readFile(headersPath, 'utf8');
  const nextHeaders = headers.replace(
    /^ {2}Content-Security-Policy: .*$/m,
    `  Content-Security-Policy: ${CSP_PROD}`,
  );
  if (nextHeaders === headers) throw new Error('_headers: CSP line not found');
  if (nextHeaders !== headers) await writeFile(headersPath, nextHeaders, 'utf8');

  const vercelPath = path.join(rootDir, 'vercel.json');
  const vercel = JSON.parse(await readFile(vercelPath, 'utf8'));
  const cspEntry = vercel.headers[0].headers.find((entry) => entry.key === 'Content-Security-Policy');
  if (!cspEntry) throw new Error('vercel.json: CSP entry not found');
  cspEntry.value = CSP_PROD;
  await writeFile(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`, 'utf8');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await syncHeaders(ROOT);
  console.log('headers synced from security-headers.mjs');
}
