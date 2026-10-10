// Lance Chromium pour les scripts de rendu des cadres, où qu'on soit.
// Ordre : $PW_CHROMIUM, puis le Chromium de Playwright, puis /opt/pw-browsers/chromium-*/chrome-linux/chrome (conteneurs Claude Code).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadChromium() {
  for (const id of ['@playwright/test', 'playwright']) {
    try {
      return require(id).chromium;
    } catch {}
  }
  throw new Error('Playwright introuvable : lancer « bun install » à la racine du dépôt.');
}

function bundledChrome() {
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().pop();
  const exe = dir && path.join(root, dir, 'chrome-linux', 'chrome');
  return exe && fs.existsSync(exe) ? exe : null;
}

export async function launch() {
  const chromium = loadChromium();
  const candidates = [process.env.PW_CHROMIUM, null, bundledChrome()].filter((c, i) => i === 1 || c);
  let last;
  for (const executablePath of candidates) {
    try {
      return await chromium.launch(executablePath ? { executablePath } : {});
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
