// Lance Chromium pour les scripts de rendu des cadres, où qu'on soit — aligné sur apps/web/scripts/lib/browser.mjs.
// Ordre : $PW_CHROMIUM (ou $CHROMIUM), puis le Chromium que Playwright attend, puis le plus récent chromium_headless_shell
// installé dans le cache de Playwright (macOS, Linux), puis /opt/pw-browsers/chromium-*/chrome-linux/chrome (conteneurs).
// Aucun chemin machine en dur : un binaire absent se signale par l'erreur du dernier candidat.
import fs from 'node:fs';
import os from 'node:os';
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

const latest = (root, prefix) => {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((d) => d.startsWith(prefix)).sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
};

function cachedShells() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')].filter(Boolean);
  const binaries = ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell'];
  return roots.flatMap((root) => latest(root, 'chromium_headless_shell-').flatMap((dir) => binaries.map((b) => path.join(root, dir, b)))).filter((exe) => fs.existsSync(exe));
}

function bundledChrome() {
  const root = '/opt/pw-browsers';
  return latest(root, 'chromium-').map((dir) => path.join(root, dir, 'chrome-linux', 'chrome')).filter((exe) => fs.existsSync(exe));
}

export function candidates() {
  const forced = process.env.PW_CHROMIUM ?? process.env.CHROMIUM;
  return forced ? [forced] : [null, ...cachedShells(), ...bundledChrome()];
}

export async function launch() {
  const chromium = loadChromium();
  let last;
  for (const executablePath of candidates()) {
    try {
      return await chromium.launch(executablePath ? { executablePath } : {});
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
