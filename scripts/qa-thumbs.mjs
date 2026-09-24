// QA-бот целостности превью: каждое thumb из data/catalog.json обязано
// существовать, быть настоящим WebP (магия RIFF....WEBP) и непустым.
// Баланс размеров — в check-budgets.mjs; здесь только целостность:
// битый webp проходит бюджеты по байтам, но ломает карточку.
// Ноль зависимостей, работает в CI и pre-push (часть `npm run qa`).
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function isWebp(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  );
}

export async function checkThumbs(rootDir = ROOT) {
  const failures = [];
  const catalog = JSON.parse(await readFile(path.join(rootDir, 'data', 'catalog.json'), 'utf8'));
  for (const game of catalog.games ?? []) {
    if (!game.thumb) continue; // Эмодзи-фолбэк — штатно (см. NOTHUMB_BRIDGES).
    const file = path.join(rootDir, game.thumb);
    try {
      const info = await stat(file);
      if (info.size === 0) {
        failures.push(`${game.thumb}: пустой файл`);
        continue;
      }
      if (!isWebp(await readFile(file))) {
        failures.push(`${game.thumb}: не WebP (битая магия)`);
      }
    } catch {
      failures.push(`${game.thumb}: файл отсутствует`);
    }
  }
  return failures;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const failures = await checkThumbs(ROOT);
  for (const failure of failures) console.error(`FAIL ${failure}`);
  if (failures.length > 0) {
    console.error(`\nqa-thumbs: ${failures.length} problem(s)`);
    process.exitCode = 1;
  } else {
    const catalog = JSON.parse(await readFile(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
    const withThumb = (catalog.games ?? []).filter((game) => game.thumb).length;
    console.log(`qa-thumbs: ok (${withThumb} previews checked)`);
  }
}
