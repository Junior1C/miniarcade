// Трансформ сырых строк D1 (JSON из `wrangler d1 execute --json`)
// в файлы data/stats/*.json. Чистая функция + тонкий CLI-слой,
// чтобы логику покрывал node --test.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// aliases: карта переименований data/aliases.json (old -> new).
// Сырые строки D1 хранят id на момент события; при агрегации схлопываем
// по канону, иначе переименованные игры стартуют рейтинги с нуля,
// а старые строки висят мертвым грузом 90 дней.
export function summarize(wranglerJson, aliases = {}) {
  const canon = (game) => (typeof aliases[game] === 'string' && aliases[game]) || game;
  const results = Array.isArray(wranglerJson) ? wranglerJson[0]?.results : wranglerJson.results;
  const rows = Array.isArray(results) ? results : [];
  const daily = rows
    .filter((row) => row && typeof row.day === 'string')
    .map((row) => ({
      day: row.day,
      host: String(row.host || ''),
      game: canon(String(row.game || '')),
      event: String(row.event || ''),
      n: Number(row.n) || 0,
      secs: Number(row.secs) || 0,
      // Уникальные дневные посетители (COUNT DISTINCT хеша): суммы по дням
      // в totals — оценка сверху (один человек в разные дни посчитан дважды,
      // так делают все portals без аккаунтов). Старые строки без хеша дают 0.
      uniques: Number(row.uniques) || 0,
    }));
  const totals = new Map();
  for (const row of daily) {
    const key = `${row.host}\n${row.game}\n${row.event}`;
    const entry = totals.get(key) || { host: row.host, game: row.game, event: row.event, n: 0, secs: 0, uniques: 0, days: 0 };
    entry.n += row.n;
    entry.secs += row.secs;
    // uniques за 90 дней — сумма дневных DISTINCT: оценка СВЕРХУ (человек,
    // заходивший в разные дни, посчитан несколько раз). Поле days рядом —
    // видимый размер выборки для честной витрины (см. README § «Рейтинг»).
    entry.uniques += row.uniques;
    entry.days += 1;
    totals.set(key, entry);
  }
  return {
    daily,
    totals: [...totals.values()].sort((a, b) => b.n - a.n || b.secs - a.secs),
    generatedAt: new Date().toISOString(),
  };
}

export async function writeStats(outDir, summary) {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'daily.json'), `${JSON.stringify(summary.daily, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(outDir, 'totals.json'),
    `${JSON.stringify({ generatedAt: summary.generatedAt, totals: summary.totals }, null, 2)}\n`,
    'utf8',
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [inputPath, outDir] = process.argv.slice(2);
  if (!inputPath || !outDir) {
    console.error('Usage: node scripts/pull-stats.mjs <wrangler-output.json> <data/stats dir>');
    process.exitCode = 1;
  } else {
    const aliases = await readFile(path.join(path.dirname(outDir), 'aliases.json'), 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => ({}));
    const summary = summarize(JSON.parse(await readFile(inputPath, 'utf8')), aliases);
    await writeStats(outDir, summary);
    console.log(`stats: ${summary.daily.length} daily rows, ${summary.totals.length} totals`);
    // Усечение выборки LIMIT в stats.yml: 50000 строк — потолок одного запроса.
    // Точное попадание = возможно обрезали хвост окна, нужен чанкинг по месяцам.
    if (summary.daily.length >= 50000) {
      console.error('WARN stats pull hit 50000 rows: выборка может быть усечена, разбейте окно на чанки');
    }
  }
}
