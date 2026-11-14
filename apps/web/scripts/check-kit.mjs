#!/usr/bin/env node
/**
 * LE CATALOGUE DU KIT SE VOIT ET SE PROUVE (#17335, K00, loi 13).
 *
 * Trois choses, sur le `dist` de fixtures déjà construit :
 *
 * 1. LE CLIQUET DU VERRE. Hors de `components/kit/`, le nombre de classes de
 *    `glass.css` posées dans les `.tsx` (et celui des fichiers qui les portent,
 *    des verres ronds, et des verres sans réponse au toucher dessinée — ni
 *    `active:` ni disque d'appel) ne fait que descendre : le plafond est dans
 *    `scripts/kit-glass-baseline.json` et s'abaisse dans le commit qui fait
 *    baisser. Un verre neuf passe par le kit.
 * 2. LE REGISTRE FACE AU CATALOGUE LU DANS LE NAVIGATEUR. Un composant dont la
 *    cible existe est listé, avec son témoin et ses images ; un composant dont
 *    la cible n'existe pas n'est pas listé. L'égalité des clés et des noms avec
 *    le registre se prouve dans `kit-registry-guard.test.ts`.
 * 3. LE CATALOGUE LUI-MÊME, aux trois largeurs, clair et sombre, en RTL et à
 *    200 % : pas de défilement horizontal, des lignes de 44 px, le détail qui
 *    se règle sans toucher la liste, une clé inconnue qui laisse la liste.
 *
 * `CAPTURE_DIR=docs/product/kit/captures/web node scripts/check-kit.mjs`
 * réécrit les images de référence (jamais le gate seul).
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { allFiles } from './lib/files.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { measureKitGlass, ratchetProblems } from './lib/kit-glass-ratchet.mjs';
import {
  boardViewIds,
  candidatePaths,
  catalogueProblems,
  imageStem,
  KIT_BOARD_ID,
  KIT_CATALOGUE_NAME,
  KIT_COMPACT_WIDTH,
  KIT_WIDTHS,
  kitLotsOf,
  lotProblems,
} from './lib/kit-registry-audit.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(APP, '..', '..');
const DIST = join(APP, 'dist');
const SHOTS = join(ROOT, 'docs', 'product', 'kit', 'captures', 'web');
const CAPTURE_DIR = process.env.CAPTURE_DIR === undefined ? null : resolve(process.env.CAPTURE_DIR);
const IMAGES = CAPTURE_DIR ?? SHOTS;
const HEIGHT = 844;
const TARGET = 44;
const SCHEMES = ['clair', 'sombre'];

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('\n  dist/ est absent : construis l’application (bun run build) avant ce gate.\n');
  process.exit(1);
}

const registry = JSON.parse(readFileSync(join(ROOT, '.claude', 'workflows', 'meeshy-kit-planche.lots.json'), 'utf8'));
const lots = kitLotsOf(registry);
const planche = readFileSync(join(ROOT, 'docs', 'product', 'composer-vue-finale', 'planche.html'), 'utf8');

console.log('\n  le cliquet du verre hors du kit');
{
  const sources = allFiles(join(APP, 'src'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ path: relative(APP, file), text: readFileSync(file, 'utf8') }));
  const measured = measureKitGlass(sources);
  const ceiling = JSON.parse(readFileSync(join(APP, 'scripts', 'kit-glass-baseline.json'), 'utf8'));
  const problems = ratchetProblems({ measured, ceiling });
  expect(problems.length === 0, `verre hors du kit : ${measured.calls} classes, ${measured.files} fichiers, ${measured.rounds} ronds, ${measured.untouched} sans réponse au toucher${problems.length === 0 ? '' : ` — ${problems.join(' ; ')}`}`);
}

const served = await startDistServer(DIST, { serviceWorker: false });
const browser = await launchChromium();

const open = async ({ width, scheme = 'clair', path = '/kit' }) => {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
  await page.goto(`${served.base}${path}`);
  await page.waitForSelector('main h1');
  await page.evaluate((next) => {
    const root = document.documentElement;
    root.classList.toggle('light', next === 'clair');
    root.classList.toggle('dark', next === 'sombre');
  }, scheme);
  return { context, page, errors };
};

const overflowsSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

const capture = async (locator, name, stem) => {
  if (CAPTURE_DIR === null) return;
  await mkdir(join(CAPTURE_DIR, name), { recursive: true });
  await locator.screenshot({ path: join(CAPTURE_DIR, name, `${stem}.png`), animations: 'disabled' });
};

const listed = async (page) =>
  page.$$eval('[data-kit-row]', (rows) => rows.map((row) => ({ key: row.getAttribute('data-kit-key'), label: row.getAttribute('aria-label'), height: row.getBoundingClientRect().height })));

console.log('\n  la liste, aux trois largeurs, clair et sombre');
let rows = [];
for (const width of KIT_WIDTHS) {
  for (const scheme of SCHEMES) {
    const { context, page, errors } = await open({ width, scheme });
    rows = await listed(page);
    const empty = await page.$('[data-kit-empty]');
    expect((rows.length === 0) === (empty !== null), `${width} px ${scheme} : la phrase de l’état vide paraît si, et seulement si, aucun composant n’est livré (${rows.length} livrés)`);
    expect(!(await overflowsSideways(page)), `${width} px ${scheme} : pas de défilement horizontal`);
    expect(rows.every((row) => row.height >= TARGET), `${width} px ${scheme} : chaque ligne tient dans une cible de ${TARGET} px`);
    expect(errors.length === 0, `${width} px ${scheme} : aucune erreur de page${errors.length === 0 ? '' : ` — ${errors.join(' | ')}`}`);
    if (empty !== null) await capture(page.locator('[data-kit-empty]'), KIT_CATALOGUE_NAME, imageStem({ id: 'vide', variant: scheme, width }));
    await context.close();
  }
}

console.log('\n  la liste, à 200 % et en RTL');
{
  const { context, page } = await open({ width: KIT_COMPACT_WIDTH });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  expect(!(await overflowsSideways(page)), `${KIT_COMPACT_WIDTH} px à 200 % : pas de défilement horizontal`);
  if ((await page.$('[data-kit-empty]')) !== null) await capture(page.locator('[data-kit-empty]'), KIT_CATALOGUE_NAME, imageStem({ id: KIT_BOARD_ID, variant: 'grande-police', width: KIT_COMPACT_WIDTH }));
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    document.documentElement.dir = 'rtl';
  });
  expect(!(await overflowsSideways(page)), `${KIT_COMPACT_WIDTH} px en RTL : pas de défilement horizontal`);
  if ((await page.$('[data-kit-empty]')) !== null) await capture(page.locator('[data-kit-empty]'), KIT_CATALOGUE_NAME, imageStem({ id: KIT_BOARD_ID, variant: 'rtl', width: KIT_COMPACT_WIDTH }));
  await context.close();
}

console.log('\n  une clé inconnue laisse la liste');
{
  const { context, page } = await open({ width: KIT_COMPACT_WIDTH, path: '/kit/k99' });
  expect((await page.textContent('main h1')) === 'Kit' && (await page.$('[data-kit-tile]')) === null, '/kit/k99 rend la liste, aucune tuile');
  await context.close();
}

const detailStates = (page) =>
  page.$$eval('[data-kit-tile]', (tiles) =>
    tiles
      .filter((tile) => tile.getAttribute('data-kit-tile') === tile.getAttribute('data-kit-state'))
      .map((tile) => ({ id: tile.getAttribute('data-kit-state'), boardView: tile.getAttribute('data-kit-board-view'), isTouchable: tile.hasAttribute('data-kit-touchable') })),
  );

console.log('\n  chaque composant livré : détail, réglages, captures');
const found = [];
for (const row of rows) {
  const { context, page } = await open({ width: KIT_COMPACT_WIDTH, path: `/kit/${row.key.toLowerCase()}` });
  const name = await page.getAttribute('main h1', 'data-kit-name');
  const states = await detailStates(page);
  found.push({ key: row.key, name, states });
  expect(states.length > 0, `${row.key} ${name} : le détail porte au moins une tuile`);
  for (const scheme of SCHEMES) {
    for (const width of KIT_WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const dark = await page.isChecked('[data-kit-setting="dark"]');
      if (dark !== (scheme === 'sombre')) await page.click('[data-kit-setting="dark"]');
      for (const state of states) {
        const stage = page.locator(`[data-kit-tile="${state.id}"] [data-kit-stage]`);
        await capture(stage, name, imageStem({ id: state.id, variant: scheme, width }));
        if (state.isTouchable && scheme === 'clair') await capture(page.locator(`[data-kit-tile="${state.id}-presse"] [data-kit-stage]`), name, imageStem({ id: state.id, variant: 'presse', width }));
      }
    }
  }
  await page.setViewportSize({ width: KIT_COMPACT_WIDTH, height: HEIGHT });
  await page.click('[data-kit-setting="large-font"]');
  expect(!(await overflowsSideways(page)), `${row.key} : à 200 %, pas de défilement horizontal`);
  await capture(page.locator('[data-kit-tiles]'), name, imageStem({ id: KIT_BOARD_ID, variant: 'grande-police', width: KIT_COMPACT_WIDTH }));
  await page.click('[data-kit-setting="large-font"]');
  await page.click('[data-kit-setting="rtl"]');
  expect((await page.getAttribute('[data-kit-tiles]', 'dir')) === 'rtl' && !(await overflowsSideways(page)), `${row.key} : en RTL, sans défilement horizontal`);
  await capture(page.locator('[data-kit-tiles]'), name, imageStem({ id: KIT_BOARD_ID, variant: 'rtl', width: KIT_COMPACT_WIDTH }));
  await context.close();
}
if (rows.length === 0) console.log('  --    aucun composant livré : le détail se prouve par les témoins de l’écran (bun test)');

await browser.close();
await served.close();

console.log('\n  le registre, face au catalogue lu dans le navigateur');
{
  const existing = new Set(candidatePaths(lots).filter((path) => existsSync(join(ROOT, path))));
  const images = existsSync(IMAGES) ? allFiles(IMAGES).map((file) => relative(IMAGES, file).split('\\').join('/')) : [];
  const known = boardViewIds(planche);
  const problems = [
    ...lots.flatMap((lot) => {
      const entry = found.find((candidate) => candidate.key === lot.key) ?? { key: lot.key, name: lot.name, states: [] };
      return lotProblems({ lot, entry, boardViewIds: known, disk: { existing, images } });
    }),
    ...catalogueProblems({ images }),
  ];
  expect(problems.length === 0, `${lots.length} lots du registre en règle${problems.length === 0 ? '' : ` — ${problems.join(' ; ')}`}`);
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} échec(s) :\n${failures.map((failure) => `    - ${failure}`).join('\n')}\n`);
  process.exit(1);
}
console.log('\n  catalogue du kit : tout est en règle.\n');
