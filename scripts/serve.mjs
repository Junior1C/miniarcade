import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devSecurityHeaders } from './security-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = devSecurityHeaders();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\0')) return null;

  const candidate = path.resolve(ROOT, `.${decoded}`);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (candidate !== ROOT && !candidate.startsWith(rootWithSep)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const indexPath = path.join(candidate, 'index.html');
      await stat(indexPath);
      return indexPath;
    }
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    send(res, 400, 'Bad Request');
    return;
  }

  const filePath = await resolveFile(pathname);
  if (!filePath) {
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  try {
    const body = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, req.method === 'HEAD' ? undefined : body, {
      'Content-Type': type,
      ...SECURITY_HEADERS,
    });
  } catch {
    send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

server.listen(PORT, () => {
  console.log(`MiniArcade dev server: http://localhost:${PORT}`);
});
