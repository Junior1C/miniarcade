// Полуавтоматическая чистка мёртвых мостов: человек решает (по strict-артефакту
// qa-bridges.yml: мёртв 2 недели / закрыт фрейминг / редирект на заглушку),
// скрипт делает механику: удаляет папки, чистит неиспользуемые origin
// из allowlist, разносит заголовки и пересобирает каталог.
// Использование: node scripts/prune-bridges.mjs <id...>
// Решение — всегда за человеком: скрипт никогда не сканирует живость сам,
// только исполняет явный список. Ноль npm-зависимостей.
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECURITY_HEADERS = path.join(ROOT, 'scripts', 'security-headers.mjs');

export async function readBridges(rootDir = ROOT) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const bridges = new Map();
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    if (meta.url) bridges.set(entry.name, meta);
  }
  return bridges;
}

// Чистое планирование (покрыто node --test на фикстурах): никаких удалений,
// только списки + ошибки. origin дропаем, только если его не использует
// ни один мост вне списка на удаление.
export async function planPrune(rootDir, ids) {
  const bridges = await readBridges(rootDir);
  const remove = [];
  const errors = [];
  const seen = new Set();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const meta = bridges.get(id);
    if (!meta) {
      errors.push(`${id}: нет такой папки с внешней игрой (свои игры не трогаем)`);
      continue;
    }
    remove.push(id);
  }
  const doomed = new Set(remove);
  const usedElsewhere = new Set();
  for (const [id, meta] of bridges) {
    if (doomed.has(id)) continue;
    try {
      usedElsewhere.add(new URL(meta.url).origin);
    } catch {
      // Битый url — валидация build, не prune.
    }
  }
  const dropOrigins = new Set();
  for (const id of remove) {
    try {
      const origin = new URL(bridges.get(id).url).origin;
      if (!usedElsewhere.has(origin)) dropOrigins.add(origin);
    } catch {
      // Битый url — папку всё равно удаляем, origin не трогаем.
    }
  }
  return { remove, dropOrigins: [...dropOrigins].sort(), errors };
}

export async function dropOriginsFromAllowlist(rootDir, origins) {
  if (origins.length === 0) return 0;
  const file = path.join(rootDir, 'scripts', 'security-headers.mjs');
  const lines = (await readFile(file, 'utf8')).split('\n');
  const doomed = new Set(origins);
  const kept = lines.filter((line) => {
    const match = line.match(/^  '(https:\/\/[^']+)',$/);
    return !(match && doomed.has(match[1]));
  });
  if (kept.length !== lines.length) {
    await writeFile(file, kept.join('\n'), 'utf8');
  }
  return lines.length - kept.length;
}

function runNode(rootDir, script, args = []) {
  execFileSync(process.execPath, [path.join(rootDir, 'scripts', script), ...args], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (ids.length === 0) {
    console.error('Usage: node scripts/prune-bridges.mjs <id...>  (id — из strict-артефакта qa-bridges)');
    process.exitCode = 2;
  } else {
    const { remove, dropOrigins, errors } = await planPrune(ROOT, ids);
    for (const error of errors) console.error(`SKIP ${error}`);
    if (remove.length === 0) {
      console.error('prune-bridges: nothing to remove');
      process.exitCode = 1;
    } else {
      for (const id of remove) {
        await rm(path.join(ROOT, 'games', id), { recursive: true, force: true });
        console.log(`removed games/${id}/`);
      }
      const dropped = await dropOriginsFromAllowlist(ROOT, dropOrigins);
      console.log(`allowlist: dropped ${dropped} origin(s): ${dropOrigins.join(', ') || '—'}`);
      runNode(ROOT, 'sync-headers.mjs');
      runNode(ROOT, 'build.mjs');
      console.log('prune-bridges: done — проверьте git status и запустите npm run check');
    }
  }
}
