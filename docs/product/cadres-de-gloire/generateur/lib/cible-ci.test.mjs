// Témoins de ce que la CI ÉPINGLE et LANCE pour les cibles de fidélité (lot L21a, #10177) : le job « Cadres de gloire »
// de .github/workflows/ci.yml installe son propre Playwright, donc son Chromium, et compare l'échantillon qu'il rend aux
// cibles versionnées. Un Playwright épinglé sur un autre Chromium que celui de `cible/index.json` rendrait cette
// comparaison bruyante à chaque exécution (un ::warning permanent qui masque une vraie dérive) et les octets versionnés
// irreproductibles. Ce témoin tient les deux ensemble : il lit le Playwright résolu depuis `lib/` (celui que le job
// installe sous generateur/node_modules, comme `lib/launch.mjs`), qui doit ÊTRE la version épinglée, et exige que son
// Chromium soit celui des cibles. Usage : node --test lib/cible-ci.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const ci = fs.readFileSync(path.join(HERE, '../../../../../.github/workflows/ci.yml'), 'utf8');
const job = ci.slice(ci.indexOf('\n  glory-frames:'), ci.indexOf('\n  # ====', ci.indexOf('\n  glory-frames:')));
const index = JSON.parse(fs.readFileSync(path.join(HERE, '../../cible/index.json'), 'utf8'));
const installs = job.split('\n').filter((line) => /^\s*npm install\b/.test(line)).join('\n');
const pinned = (pkg) => [...installs.matchAll(new RegExp(`\\b${pkg}@(\\d+\\.\\d+\\.\\d+)`, 'g'))].map((m) => m[1]);

// Le playwright-core que lib/launch.mjs chargera : celui du premier paquet Playwright résolu depuis lib/, dans son ordre.
function playwrightCore() {
  for (const id of ['playwright', '@playwright/test']) {
    try {
      return path.dirname(createRequire(require.resolve(id)).resolve('playwright-core'));
    } catch {}
  }
  return null;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('le Playwright épinglé par le job livre le Chromium qui a rendu les cibles versionnées', () => {
  const [playwright, ...others] = pinned('playwright');
  assert.ok(playwright, 'le job glory-frames épingle playwright@x.y.z');
  assert.deepEqual(others, [], 'une seule épingle Playwright dans le job');
  const core = playwrightCore();
  const hint = `npm install --prefix . --no-save --no-package-lock playwright@${playwright} (depuis generateur/, comme le job)`;
  assert.ok(core, `aucun Playwright résolu depuis lib/ : ${hint}`);
  const installed = readJson(path.join(core, 'package.json')).version;
  assert.equal(installed, playwright, `le Playwright résolu depuis lib/ (${installed}) doit être l'épinglé (${playwright}) : ${hint}`);
  const chromium = readJson(path.join(core, 'browsers.json')).browsers.find((b) => b.name === 'chromium');
  assert.equal(chromium.browserVersion, index.chromium, `playwright@${playwright} livre Chromium ${chromium.browserVersion}, les cibles versionnées ont été rendues par ${index.chromium} : régénérer l'échantillon avec ce Chromium, ou épingler la version qui l'a produit`);
});

test('le sharp épinglé par le job est celui qui a encodé les cibles versionnées', () => {
  assert.deepEqual(pinned('sharp'), [index.sharp]);
});

test('le job lance les témoins du générateur : un gate déclaré qui ne tourne pas en CI est un test sauté', () => {
  assert.match(job, /run: node --test lib\/\*\.test\.mjs/);
});
