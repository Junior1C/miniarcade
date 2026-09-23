// QA-бот гигиены репозитория: секреты, смешанные окончания строк,
// висячие пробелы, бюджеты размеров игр. Ноль зависимостей.
// FAIL валит `npm run qa`, WARN только шумит. `--fix` правит только
// висячие пробелы (безопасно: пробел в конце строки семантики не несёт).
//
// Запуск: node scripts/qa-repo.mjs [--fix]
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', '.wrangler']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css', '.json', '.xml', '.txt', '.yml', '.sql', '.md', '.cjs']);

// Сигнатуры секретов: токены GitHub, AWS-ключи, чат-токены, приватные ключи.
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{8,}/,
  /github_pat_[A-Za-z0-9_]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{8,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /sk-(?:live|test)-[A-Za-z0-9]{8,}/,
];

// Один игровой каталог обязан оставаться лёгким: вся игра — пара файлов.
const GAME_DIR_WARN_BYTES = 100 * 1024;
// data/stats растёт каждую ночь: сигнал, что пора ротировать/урезать окно.
const STATS_FILE_WARN_BYTES = 1024 * 1024;

export function scanSecrets(text) {
  return SECRET_PATTERNS.filter((pattern) => pattern.test(text)).map(String);
}

// Три состояния: lf | crlf | mixed. Mixed — FAIL (патч-опасность, шум
// в диффах: так index.html ломал build.mjs до EOL-нормализации).
// Чистый CRLF — только WARN: репо исторически смешанное, насильно
// не перегоняем (одноразовый шум в 14 файлах никому не нужен).
export function eolStatus(buffer) {
  const text = buffer.toString('binary');
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(^|[^\r])\n/g) || []).length;
  if (crlf > 0 && lf > 0) return 'mixed';
  if (crlf > 0) return 'crlf';
  return 'lf';
}

export function stripTrailingWhitespace(text, eol) {
  return text
    .split(eol)
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join(eol);
}

async function walkTextFiles(rootDir) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.githooks' && entry.name !== '.github') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }
  await walk(rootDir);
  return files;
}

export async function auditRepo(rootDir = ROOT, { fix = false } = {}) {
  const fails = [];
  const warns = [];
  let fixed = 0;
  for (const full of await walkTextFiles(rootDir)) {
    const rel = path.relative(rootDir, full);
    const buffer = await readFile(full);
    for (const signature of scanSecrets(buffer.toString('utf8'))) {
      fails.push(`${rel}: похож на секрет (${signature})`);
    }
    const status = eolStatus(buffer);
    if (status === 'mixed') fails.push(`${rel}: смешанные окончания строк (LF + CRLF)`);
    else if (status === 'crlf') warns.push(`${rel}: CRLF (историческое, не трогаем)`);
    const eol = status === 'crlf' ? '\r\n' : '\n';
    const text = buffer.toString('utf8');
    if (/[ \t]+(\r?\n)/.test(text)) {
      if (fix) {
        await writeFile(full, stripTrailingWhitespace(text, eol), 'utf8');
        fixed += 1;
      } else {
        fails.push(`${rel}: висячие пробелы в конце строк (лечится --fix)`);
      }
    }
  }
  const gamesDir = path.join(rootDir, 'games');
  for (const entry of await readdir(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    let size = 0;
    const dir = path.join(gamesDir, entry.name);
    for (const file of await readdir(dir)) {
      size += (await stat(path.join(dir, file))).size;
    }
    if (size > GAME_DIR_WARN_BYTES) {
      warns.push(`games/${entry.name}: ${Math.round(size / 1024)} КБ (> 100 КБ — проверить ассеты)`);
    }
  }
  const statsDir = path.join(rootDir, 'data', 'stats');
  for (const name of ['daily.json', 'totals.json']) {
    try {
      const size = (await stat(path.join(statsDir, name))).size;
      if (size > STATS_FILE_WARN_BYTES) warns.push(`data/stats/${name} > 1 МБ — урезать окно агрегации`);
    } catch {
      // Файлов ещё нет (ночной забор не работал) — штатно, молчим.
    }
  }
  return { fails, warns, fixed };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const fix = process.argv.includes('--fix');
  const { fails, warns, fixed } = await auditRepo(ROOT, { fix });
  // CRLF-историю сворачиваем в одну строку, чтобы не шуметь на каждый прогон.
  const crlf = warns.filter((line) => line.endsWith('(историческое, не трогаем)'));
  const rest = warns.filter((line) => !line.endsWith('(историческое, не трогаем)'));
  for (const line of rest) console.log(`WARN ${line}`);
  if (crlf.length > 0) console.log(`WARN CRLF в ${crlf.length} файле(ах) — историческое, смешанных нет`);
  if (fix && fixed > 0) console.log(`fixed trailing whitespace in ${fixed} file(s)`);
  if (fails.length > 0) {
    for (const line of fails) console.error(`FAIL ${line}`);
    console.error(`\nqa-repo: ${fails.length} problem(s), ${warns.length} warning(s)`);
    process.exitCode = 1;
  } else {
    console.log(`qa-repo: ok (${warns.length} warning(s))`);
  }
}
