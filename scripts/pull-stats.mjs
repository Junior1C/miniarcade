// Трансформ сырых строк D1 (JSON из `wrangler d1 execute --json`)
// в файлы data/stats/*.json. Чистая функция + тонкий CLI-слой,
// чтобы логику покрывал node --test.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarize(wranglerJson) {
  const results = Array.isArray(wranglerJson) ? wranglerJson[0]?.results : wranglerJson.results;
  const rows = Array.isArray(results) ? results : [];
  const daily = rows
    .filter((row) => row && typeof row.day === 'string')
    .map((row) => ({
      day: row.day,
      host: String(row.host || ''),
      game: String(row.game || ''),
      event: String(row.event || ''),
      n: Number(row.n) || 0,
      secs: Number(row.secs) || 0,
    }));
  const totals = new Map();
  for (const row of daily) {
    const key = `${row.host}\n${row.game}\n${row.event}`;
    const entry = totals.get(key) || { host: row.host, game: row.game, event: row.event, n: 0, secs: 0 };
    entry.n += row.n;
    entry.secs += row.secs;
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
    const summary = summarize(JSON.parse(await readFile(inputPath, 'utf8')));
    await writeStats(outDir, summary);
    console.log(`stats: ${summary.daily.length} daily rows, ${summary.totals.length} totals`);
  }
}
