// Синхронизация security-заголовков в носителях из единого источника.
// _headers (Cloudflare) и vercel.json (Vercel) обязаны содержать ровно
// prodSecurityHeaders() из scripts/security-headers.mjs — руками не правим:
// рассинхрон ловит tests/headers.test.mjs, а правит этот скрипт.
// index.html/stats.html (<meta>) синхронизирует build.mjs.
//
// Запуск: node scripts/sync-headers.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prodSecurityHeaders } from './security-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function renderHeadersFile(prod) {
  const lines = ['/*'];
  for (const [key, value] of Object.entries(prod)) {
    lines.push(`  ${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function syncHeaders(rootDir = ROOT) {
  const prod = prodSecurityHeaders();

  // _headers пересобираем целиком: иначе HSTS/Permissions-Policy дрейфуют
  // (прецедент 2026-09-24 с пропавшим CSP показал цену ручной синхронизации).
  await writeFile(path.join(rootDir, '_headers'), renderHeadersFile(prod), 'utf8');

  const vercelPath = path.join(rootDir, 'vercel.json');
  const vercel = JSON.parse(await readFile(vercelPath, 'utf8'));
  vercel.headers[0].headers = Object.entries(prod).map(([key, value]) => ({ key, value }));
  await writeFile(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`, 'utf8');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await syncHeaders(ROOT);
  console.log('headers synced from security-headers.mjs');
}
