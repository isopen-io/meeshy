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
 * 5. **QUE LE CONTENU VISIBLE NE BOUGE PAS NON PLUS QUAND UNE PAGE PLUS
 *    ANCIENNE S'INSÈRE EN TÊTE** (#6972). Le critère 4 mesurait déjà « une
 *    cellule visible ne bouge pas de plus de 2 px » — mais seulement sous
 *    l'effet de la MESURE des cellules, jamais d'une INSERTION : le corpus de
 *    banc arrivait en UN SEUL bloc, il n'y avait pas de page à insérer.
 *    Depuis que le fil pagine, préfixer cinquante rangées fait glisser toute
 *    la fenêtre — et c'est le défaut qu'aucun témoin unitaire ne voit. Le fil
 *    est donc chargé PAGE PAR PAGE, et la dérive est mesurée à CHAQUE couture.
 *
 * COMMENT LA DÉRIVE D'INSERTION EST MESURÉE, ET POURQUOI DANS LA PAGE.
 * L'échantillon de référence doit être pris AVANT que la page ne s'insère,
 * sinon le témoin est vert quoi qu'il arrive — « un vert des deux côtés d'une
 * mutation mesure la machine, pas la règle ». Un aller-retour CDP par
 * échantillon ne peut pas garantir cet ordre. La boucle vit donc DANS la page
 * (`requestAnimationFrame`) : `main.scrollTop` est appliqué SYNCHRONEMENT,
 * l'échantillon pris juste après reflète déjà la nouvelle position, et le
 * rappel de l'`IntersectionObserver` ne peut pas avoir couru entre les deux.
 * La rangée est repérée par son `data-row` (l'id du message) et jamais par son
 * `data-index` : un préfixage décale TOUS les index.
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

/**
 * --- 5 : LA PAGINATION DU HAUT (#6972). Le fil s'ouvre sur UNE page serveur
 * (50 messages) : la sentinelle haute doit donc être ARMÉE, et chaque approche
 * du haut doit poser une page plus ancienne SANS déplacer ce qu'on lit.
 */
const olderState = () =>
  page.evaluate(() => document.querySelector('[data-thread-older]')?.getAttribute('data-thread-older') ?? null);

expect(
  (await olderState()) === 'idle',
  `la sentinelle HAUTE est armée à l'ouverture d'un fil tronqué (état lu : ${await olderState()})`,
);

/** Un tour de pagination, mesuré DANS la page — voir le doc-comment du
 * fichier § « COMMENT LA DÉRIVE D'INSERTION EST MESURÉE ». */
const pullOlderPage = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const main = document.querySelector('main#contenu');
        const list = main?.querySelector('ol');
        if (main === null || list === null || list === undefined) {
          resolve({ loaded: false, reason: 'pas de défileur' });
          return;
        }
        const sample = () => {
          const box = main.getBoundingClientRect();
          for (const el of main.querySelectorAll('[data-row]')) {
            const r = el.getBoundingClientRect();
            if (r.top >= box.top && r.bottom <= box.bottom) {
              return { height: list.offsetHeight, row: el.getAttribute('data-row'), top: r.top };
            }
          }
          return { height: list.offsetHeight, row: null, top: 0 };
        };

        /* HORS de la zone de déclenchement (`rootMargin` de cinq rangées) : on
           s'assure qu'aucune page n'est en vol avant de repérer la rangée. */
        main.scrollTop = 1500;
        /* Puis DANS la zone, en UNE assignation — `scrollTop` est appliqué
           synchronement, donc l'échantillon ci-dessous reflète déjà 100, et le
           rappel de l'observateur n'a pas pu courir entre les deux. */
        main.scrollTop = 100;
        let last = sample();
        const baseHeight = last.height;

        let frames = 0;
        const step = () => {
          const now = sample();
          if (now.height > baseHeight) {
            const el = last.row === null ? null : main.querySelector(`[data-row="${last.row}"]`);
            resolve({
              loaded: true,
              row: last.row,
              drift: el === null ? null : Math.abs(el.getBoundingClientRect().top - last.top),
            });
            return;
          }
          last = now;
          frames += 1;
          if (frames > 240) {
            resolve({ loaded: false, reason: 'aucune page en 240 images' });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );

let insertionJump = 0;
let olderPages = 0;
let lostAnchor = 0;
for (let turn = 0; turn < 20; turn += 1) {
  if ((await olderState()) !== 'idle') break;
  const pull = await pullOlderPage();
  if (pull.loaded !== true) break;
  olderPages += 1;
  await page.waitForTimeout(150);
  if (pull.drift === null) lostAnchor += 1;
  else insertionJump = Math.max(insertionJump, pull.drift);
  const r = await snapshot(`page ancienne ${olderPages}`);
  expect(
    r.cellCount < MAX_CELLS,
    `${r.cellCount} cellules montées après ${olderPages} page(s) ancienne(s) (plafond ${MAX_CELLS}) — la fenêtre s'élargit au lieu de glisser`,
  );
}

expect(olderPages >= 2, `au moins DEUX pages anciennes se chargent à l'approche du haut (mesuré ${olderPages})`);
expect(lostAnchor === 0, `la rangée repérée reste MONTÉE après l'insertion (perdue ${lostAnchor} fois)`);
/** Deux pixels : la marge d'arrondi du navigateur. Au-delà, l'historique
 * inséré a fait glisser le fil sous les yeux du lecteur. */
expect(
  insertionJump <= 2,
  `une cellule visible a bougé de ${Math.round(insertionJump)} px à l'insertion d'une page ancienne — l'historique pousse le fil sous les yeux`,
);
expect(
  (await olderState()) === 'exhausted',
  `l'historique ÉPUISÉ désarme la sentinelle haute (état lu : ${await olderState()})`,
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
console.log(`  pages anciennes chargées ${olderPages}`);
console.log(`  saut à l'insertion      ${Math.round(insertionJump)} px`);
console.log(`  saut du contenu visible ${Math.round(visualJump)} px\n`);

if (failures.length > 0) {
  console.error(`  ${failures.length} défaut(s) :\n`);
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(
  `  Le fil de ${BENCH} messages ne monte jamais plus de ${MAX_CELLS} cellules, s'ouvre sur le dernier, charge son historique en ${olderPages} pages, et se remonte sans que le contenu visible bouge.\n`,
);
