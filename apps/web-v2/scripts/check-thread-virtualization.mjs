#!/usr/bin/env node
/**
 * VÉRIFIE QUE LE FIL EST VIRTUALISÉ — sur cinq cents messages, pas sur sept.
 *
 * POURQUOI CE TÉMOIN EXISTE. Un fil non virtualisé n'est pas cassé : il est
 * LENT. Cinq cents bulles montées, mesurées et repeintes à chaque image de
 * défilement donnent un écran qui met deux secondes à s'ouvrir puis saccade —
 * et rien, dans aucun test unitaire, ne le dit. La charte du dépôt classe une
 * lenteur comme un BUG ; encore faut-il un instrument qui la voie.
 *
 * CE QU'IL MESURE
 *
 * 1. Le nombre de cellules RÉELLEMENT dans le document, sur un fil de 500.
 *    C'est la mesure qui distingue une virtualisation d'une intention.
 * 2. Que le fil s'ouvre EN BAS — sur le dernier message. Un fil qui s'ouvre en
 *    haut oblige à faire défiler cinq cents messages pour lire le dernier ; la
 *    virtualisation la mieux réglée ne rachète pas ça.
 * 3. Que le défilement vers le haut atteint le PREMIER message, et que le
 *    nombre de cellules reste borné pendant tout le trajet — une fenêtre qui
 *    s'élargit au lieu de glisser rend le gate vert au départ et l'application
 *    lente à l'arrivée.
 * 4. Que le CONTENU VISIBLE ne bouge pas une fois posé. C'est le critère juste,
 *    et la première version de ce témoin mesurait le mauvais : la hauteur
 *    TOTALE d'un fil virtualisé change forcément pendant qu'on le remonte —
 *    les estimations cèdent la place aux mesures réelles, il n'y a pas d'autre
 *    manière de connaître la taille de cinq cents cellules qu'on ne monte pas.
 *    Ce qui ne doit PAS bouger, c'est ce que l'utilisateur regarde : une
 *    cellule visible à un instant donné doit rester exactement où elle est
 *    quand les mesures d'à côté arrivent. Le virtualiseur corrige `scrollTop`
 *    pour ça ; mesurer la hauteur totale l'aurait déclaré cassé alors qu'il
 *    fait précisément son travail.
 *
 * LA VARIANTE DE BANC. Le fil de 500 n'existe que dans une construction
 * `MEESHY_BENCH=500`, où `__BENCH__` est un littéral. Le build servi aux
 * utilisateurs vaut `__BENCH__ = 0`, la fixture de banc y est éliminée, et le
 * gate de poids le prouve. Mesurer la légèreté avec du code de mesure embarqué
 * aurait mesuré autre chose.
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const BENCH = 500;
/** Le plafond de cellules montées. Généreux : on mesure un ORDRE, pas un réglage. */
const MAX_CELLS = 60;

console.log(`\n  construction de la variante de banc (MEESHY_BENCH=${BENCH})…`);
execFileSync('bun', ['run', 'build'], {
  cwd: APP,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, MEESHY_BENCH: String(BENCH) },
});

const DIST = join(APP, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  return ok;
};

await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
await page.waitForSelector('main li', { timeout: 30_000 });
await page.waitForTimeout(600);

const scroller = page.locator('main#contenu');
const cells = page.locator('main li');

const readings = [];
const snapshot = async (label) => {
  const cellCount = await cells.count();
  const geometry = await scroller.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  readings.push({ label, cellCount, ...geometry });
  return { cellCount, ...geometry };
};

// --- 1 & 2 : à l'ouverture, peu de cellules, et le BAS du fil.
const opening = await snapshot('ouverture');
expect(
  opening.cellCount < MAX_CELLS,
  `${opening.cellCount} cellules montées à l'ouverture sur ${BENCH} messages (plafond ${MAX_CELLS}) — le fil n'est pas virtualisé`,
);
const distanceToBottom = opening.scrollHeight - opening.scrollTop - opening.clientHeight;
expect(
  distanceToBottom < 8,
  `le fil ne s'ouvre pas en bas : ${Math.round(distanceToBottom)} px sous le dernier message`,
);

/**
 * Le dernier message de la fixture NORMALE ferme le fil de banc — il est donc
 * la preuve que c'est bien le BAS qui est monté, et pas seulement une position
 * de défilement.
 */
expect(
  (await page.getByText('Je pousse la mesure ce soir.').count()) > 0,
  "le dernier message n'est pas rendu à l'ouverture",
);

// --- 3 : la remontée. La fenêtre GLISSE, elle ne s'élargit pas.
let visualJump = 0;
for (const fraction of [0.75, 0.5, 0.25, 0]) {
  await scroller.evaluate((el, f) => {
    el.scrollTop = el.scrollHeight * f;
  }, fraction);
  await page.waitForTimeout(250);
  const r = await snapshot(`défilement ${Math.round(fraction * 100)} %`);
  expect(
    r.cellCount < MAX_CELLS,
    `${r.cellCount} cellules montées à ${Math.round(fraction * 100)} % (plafond ${MAX_CELLS}) — la fenêtre s'élargit au lieu de glisser`,
  );

  // --- 4 : ce que l'utilisateur REGARDE ne doit pas bouger pendant que les
  // mesures voisines arrivent. On repère une cellule visible, on la laisse
  // vivre, et on relit sa position.
  const anchor = await page.evaluate(() => {
    const main = document.querySelector('main#contenu');
    if (main === null) return null;
    const box = main.getBoundingClientRect();
    for (const li of main.querySelectorAll('li[data-index]')) {
      const r = li.getBoundingClientRect();
      if (r.top >= box.top && r.bottom <= box.bottom) {
        return { index: li.getAttribute('data-index'), top: r.top };
      }
    }
    return null;
  });
  if (anchor !== null) {
    await page.waitForTimeout(400);
    const after = await page.evaluate((index) => {
      const li = document.querySelector(`main#contenu li[data-index="${index}"]`);
      return li === null ? null : li.getBoundingClientRect().top;
    }, anchor.index);
    if (after !== null) visualJump = Math.max(visualJump, Math.abs(after - anchor.top));
  }
}

expect(
  (await page.getByText('Message 0 —', { exact: false }).count()) > 0,
  "le premier message du banc n'est pas atteint en haut du fil",
);

/**
 * Deux pixels : la marge d'arrondi du navigateur. Au-delà, une cellule que
 * l'utilisateur lisait a glissé sous ses yeux.
 */
expect(
  visualJump <= 2,
  `une cellule visible a bougé de ${Math.round(visualJump)} px après sa pose — le contenu saute sous les yeux`,
);

await browser.close();
server.close();

/**
 * ON REND `dist` À SON ÉTAT NORMAL. Sans ça, ce témoin laisse derrière lui une
 * construction de banc — et le gate de poids, ou un `preview` lancé juste
 * après, mesurerait cinq cents messages de fixture en croyant mesurer
 * l'application. Un témoin ne doit pas fausser le suivant.
 */
execFileSync('bun', ['run', 'build'], { cwd: APP, stdio: ['ignore', 'ignore', 'inherit'] });

console.log(`\n  fil de banc            ${BENCH} messages`);
for (const r of readings) {
  console.log(
    `  ${r.label.padEnd(22)} ${String(r.cellCount).padStart(3)} cellules montées · ${Math.round(r.scrollHeight)} px de contenu`,
  );
}
console.log(`  saut du contenu visible ${Math.round(visualJump)} px\n`);

if (failures.length > 0) {
  console.error(`  ${failures.length} défaut(s) :\n`);
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`  Le fil de ${BENCH} messages ne monte jamais plus de ${MAX_CELLS} cellules, s'ouvre sur le dernier, et se remonte sans que le contenu visible bouge.\n`);
