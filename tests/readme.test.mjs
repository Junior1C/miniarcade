import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Тест от дрейфа документации: README обязан упоминать каждый workflow,
// каждый qa-скрипт из package.json и базовые команды. Дешёвый контракт
// в духе tests/headers.test.mjs: доки правятся вместе с кодом.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('README documents every CI workflow', async () => {
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  const lowered = readme.toLowerCase();
  const entries = await readdir(path.join(ROOT, '.github', 'workflows'), { withFileTypes: true });
  const workflows = entries.filter((e) => e.isFile() && e.name.endsWith('.yml')).map((e) => e.name);
  assert.ok(workflows.length > 0, 'workflows must exist');
  for (const name of workflows) {
    const stem = name.replace(/\.yml$/, '').toLowerCase();
    assert.ok(
      lowered.includes(stem) || lowered.includes(name.toLowerCase()),
      `README must mention workflow ${name}`,
    );
  }
});

test('README documents every qa script from package.json', async () => {
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const qaScripts = Object.keys(pkg.scripts).filter((name) => name === 'qa' || name.startsWith('qa:'));
  assert.ok(qaScripts.length > 0, 'qa scripts must exist');
  for (const name of qaScripts) {
    assert.ok(readme.includes(`npm run ${name}`), `README must document npm run ${name}`);
  }
});

test('README documents the core commands', async () => {
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  for (const command of ['npm run build', 'npm test', 'npm run budgets', 'npm run check', 'npm run smoke']) {
    assert.ok(readme.includes(command), `README must document ${command}`);
  }
});
