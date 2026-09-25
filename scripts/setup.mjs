// One-time setup контрибьютора: хуки, браузер для e2e, проверка cwebp.
// Использование: npm run setup
import { execFileSync } from 'node:child_process';

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

run('git', ['config', 'core.hooksPath', '.githooks']);
console.log('hooks: core.hooksPath -> .githooks (pre-push гоняет npm run check)');

try {
  run('npx', ['playwright', 'install', 'chromium']);
} catch {
  // Установка могла упасть (сеть/права), а браузер — уже стоять:
  // проверяем запуском, а не кодом возврата.
}
try {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  await browser.close();
  console.log('e2e: chromium ready — npm run test:e2e works');
} catch {
  console.error('WARN chromium is not runnable — e2e will not run (npm run test:e2e)');
}

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  console.log('thumbs: cwebp found — npm run thumbs works');
} catch {
  console.error('WARN cwebp not found in PATH — превью не соберутся (CI: sudo apt-get install -y webp)');
}
