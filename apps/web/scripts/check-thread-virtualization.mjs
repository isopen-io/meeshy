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
 *    virtualisation la mieux réglée ne rachète pas ça. Et, sur ce fil qu'aucun
 *    curseur ne borne (#7351, D-L2), qu'il s'ouvre SUR son séparateur de
 *    non-lus, devant les deux derniers messages d'autrui (§ 2 bis).
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
 * 6. **LE FIL S'OUVRE SUR UN FAVORI PLUS ANCIEN QUE SES PAGES** (#7420,
 *    `lib/check-thread-anchor.mjs`) : toucher le favori `arch-12` ouvre son fil
 *    SUR lui, mis en évidence, par la fenêtre `?around=` ; défiler vers le bas
 *    rejoint ensuite le présent sans trou ni doublon.
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
 * LA MESURE SE PROLONGE JUSQU'À L'IMMOBILITÉ, ET COUVRE LES DEUX RÉGIMES
 * D'ARRIVÉE (#9216, #9219). Ce témoin a rougi par intermittence — « 179 px »
 * sur un commit, « 0 px » sur son voisin, sans un octet du fil changé. La
 * mesure n'était pas en cause : le saut était RÉEL, et son déclencheur était
 * l'horloge du virtualiseur. Une page arrivée dans les 150 ms qui suivent le
 * dernier `scroll` laissait le fil immobile ; arrivée après, elle le faisait
 * glisser — deux ancrages s'effaçaient l'un l'autre (`use-older-messages.ts`).
 * Le client de fixtures servant sur-le-champ, seul un agent d'intégration
 * continue chargé tombait dans le second régime. D'où deux règles :
 *
 * - une page sur deux est retenue `NETWORK_LATENCY_MS` (une entrée : la
 *   latence d'un réseau), pour que les DEUX régimes soient joués à chaque
 *   passage, quelle que soit la charge ;
 * - la rangée repérée est suivie, image par image, de l'insertion jusqu'à ce
 *   qu'elle reste IMMOBILE `STILL_FRAMES` images de suite, et la dérive est le
 *   pire écart vu sur ce trajet — un saut qui survient une ou deux images
 *   après l'insertion (une rangée re-mesurée) échappait à la lecture unique.
 *
 * LA VARIANTE DE BANC. Le fil de 500 n'existe que dans une construction
 * `MEESHY_BENCH=500`, où `__BENCH__` est un littéral. Le build servi aux
 * utilisateurs vaut `__BENCH__ = 0`, la fixture de banc y est éliminée, et le
 * gate de poids le prouve. Mesurer la légèreté avec du code de mesure embarqué
 * aurait mesuré autre chose.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { driftLine, insertionDrift } from './lib/insertion-drift.mjs';
import { checkThreadAnchor } from './lib/check-thread-anchor.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const BENCH = 500;
/**
 * LA LATENCE D'UNE PAGE SERVIE PAR LE RÉSEAU (#9216, #9219) — une ENTRÉE du
 * scénario, jamais une attente avant un verdict. Le client de fixtures sert
 * l'historique sur-le-champ : la page tombait donc presque toujours dans les
 * 150 ms où le virtualiseur se croit encore en défilement
 * (`isScrollingResetDelay` de `@tanstack/virtual-core`) et ne mesure rien au
 * commit. Sur une machine chargée, elle en sortait — et c'est là seulement
 * que le fil sautait : 179 px sur la CI de `main`, puis 0 px sur un commit
 * voisin. Une page sur deux est donc retenue AU-DELÀ de cette fenêtre
 * (`fixture-hold.ts`, canal `messages-before`) : les deux régimes sont
 * mesurés à chaque passage, quelle que soit la charge.
 */
const NETWORK_LATENCY_MS = 300;
const OLDER_PAGE_LATENCY = () => {
  window.__olderPageLatency = 0;
  window.__meeshyFixtureHold = (channel) => {
    const latency = window.__olderPageLatency;
    if (channel !== 'messages-before' || latency === 0) return undefined;
    return new Promise((resolve) => setTimeout(resolve, latency));
  };
};
/** La rangée lue est IMMOBILE quand sa position n'a pas changé sur autant
 * d'images consécutives — un FAIT, lu image par image (leçon 634 : un fait
 * qu'un effet différé peut défaire n'est prouvé qu'une fois STABLE). */
const STILL_FRAMES = 3;
/** Le plafond de cellules montées. Généreux : on mesure un ORDRE, pas un réglage. */
const MAX_CELLS = 60;

console.log(`\n  construction de la variante de banc (MEESHY_BENCH=${BENCH})…`);
execFileSync('bun', ['run', 'build'], {
  cwd: APP,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, MEESHY_BENCH: String(BENCH) },
});

const DIST = join(APP, 'dist');
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(OLDER_PAGE_LATENCY);
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
 * --- 2 bis : L'APPAREIL NEUF (#7351, D-L2). `c-deploiement` n'a AUCUN curseur
 * de lecture et la liste l'annonce à 2 non-lus : c'est le fil que reçoit un
 * appareil qui ne l'a jamais ouvert. Il s'ouvre SUR son séparateur, posé devant
 * les 2 DERNIERS messages d'autrui — jamais devant le premier des 500 (le fil
 * ouvert à 8 400 px du bas qu'une frontière sans curseur produisait) : le
 * séparateur est dans l'écran ET le bas est atteint (§ 2 ci-dessus).
 */
const separator = await page.evaluate(() => {
  const el = document.querySelector('[data-unread-separator]');
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: innerHeight, text: el.textContent?.trim() ?? '' };
});
expect(
  separator !== null && separator.top >= 0 && separator.bottom <= separator.viewport && /\b2\b/.test(separator.text),
  `un appareil neuf (2 non-lus, aucun curseur) n'ouvre pas le fil sur « 2 messages non lus » dans l'écran : ${JSON.stringify(separator)}`,
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
const pullOlderPage = (latency) =>
  page.evaluate(
    ({ latency: pageLatency, stillFrames }) =>
      new Promise((resolve) => {
        const main = document.querySelector('main#contenu');
        const list = main?.querySelector('ol');
        if (main === null || list === null || list === undefined) {
          resolve({ loaded: false, reason: 'pas de défileur' });
          return;
        }
        window.__olderPageLatency = pageLatency;
        const sample = () => {
          const box = main.getBoundingClientRect();
          for (const el of main.querySelectorAll('[data-row]')) {
            const r = el.getBoundingClientRect();
            if (r.top >= box.top && r.bottom <= box.bottom) {
              return { rows: Number(list.getAttribute('data-thread-rows')), row: el.getAttribute('data-row'), top: r.top };
            }
          }
          return { rows: Number(list.getAttribute('data-thread-rows')), row: null, top: 0 };
        };

        /* HORS de la zone de déclenchement (`rootMargin` de cinq rangées) : on
           s'assure qu'aucune page n'est en vol avant de repérer la rangée. */
        main.scrollTop = 1500;
        /* Puis DANS la zone, en UNE assignation — `scrollTop` est appliqué
           synchronement, donc l'échantillon ci-dessous reflète déjà 100, et le
           rappel de l'observateur n'a pas pu courir entre les deux. */
        main.scrollTop = 100;
        let last = sample();
        /* L'insertion se lit au NOMBRE de rangées du fil (`data-thread-rows`),
           jamais à la hauteur de la liste : celle-ci grandit aussi quand les
           rangées tout juste montées sont mesurées, et une page RETENUE laisse
           à ces mesures le temps d'arriver avant elle. */
        const baseRows = last.rows;

        /* APRÈS l'insertion, la rangée repérée est suivie IMAGE PAR IMAGE
           jusqu'à ce qu'elle soit IMMOBILE (#9216, #9219) : l'image de
           l'insertion ne suffit pas. Les rangées préfixées se mesurent une à
           deux images plus tard, l'ancienne tête perd son séparateur de jour,
           et c'est là que le fil glissait de 40 px sans que l'image de
           l'insertion le montre. La dérive est le PIRE écart vu sur tout ce
           trajet — une image déplacée puis reposée a été peinte, donc vue. */
        const follow = (anchor) => {
          let worst = 0;
          let previous = anchor.top;
          let still = 0;
          let settleFrames = 0;
          const track = () => {
            const el = main.querySelector(`[data-row="${anchor.row}"]`);
            if (el === null) {
              resolve({ loaded: true, row: anchor.row, drift: null });
              return;
            }
            const top = el.getBoundingClientRect().top;
            worst = Math.max(worst, Math.abs(top - anchor.top));
            still = top === previous ? still + 1 : 0;
            previous = top;
            settleFrames += 1;
            if (still >= stillFrames || settleFrames > 240) {
              resolve({ loaded: true, row: anchor.row, drift: worst, settled: still >= stillFrames });
              return;
            }
            requestAnimationFrame(track);
          };
          track();
        };

        let frames = 0;
        const step = () => {
          const now = sample();
          if (now.rows > baseRows) {
            if (last.row === null) {
              resolve({ loaded: true, row: null, drift: null });
              return;
            }
            follow(last);
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
    { latency, stillFrames: STILL_FRAMES },
  );

/** Les tirages BRUTS — agrégés par `insertionDrift`, jamais à la main : un
 * accumulateur initialisé à `0` imprimait « 0 px » sur une mesure qui n'avait
 * pas eu lieu (#7110). */
const pulls = [];
let olderPages = 0;
for (let turn = 0; turn < 20; turn += 1) {
  if ((await olderState()) !== 'idle') break;
  /* Une page sur deux arrive APRÈS le calme du défilement — voir
     `NETWORK_LATENCY_MS`. */
  const latency = turn % 2 === 0 ? 0 : NETWORK_LATENCY_MS;
  const pull = await pullOlderPage(latency);
  if (pull.loaded !== true) break;
  olderPages += 1;
  pulls.push({ drift: pull.drift, latency });
  const r = await snapshot(`page ancienne ${olderPages}`);
  expect(
    r.cellCount < MAX_CELLS,
    `${r.cellCount} cellules montées après ${olderPages} page(s) ancienne(s) (plafond ${MAX_CELLS}) — la fenêtre s'élargit au lieu de glisser`,
  );
}

const drift = insertionDrift(pulls);
const lostAnchor = drift.kind === 'unmeasurable' ? drift.lost : 0;

expect(olderPages >= 2, `au moins DEUX pages anciennes se chargent à l'approche du haut (mesuré ${olderPages})`);
expect(lostAnchor === 0, `la rangée repérée reste MONTÉE après l'insertion (perdue ${lostAnchor} fois)`);
/** Deux pixels : la marge d'arrondi du navigateur. Au-delà, l'historique
 * inséré a fait glisser le fil sous les yeux du lecteur.
 *
 * L'assertion exige une mesure RÉELLE (#7110) : sur `non-mesurable`, l'ancien
 * accumulateur valait `0`, donc `0 <= 2` — le gate concluait au vert par
 * ABSENCE DE SUJET, et seule l'assertion voisine `lostAnchor === 0` le
 * rattrapait. Deux gardes qui tombent ensemble valent mieux qu'une qui ment. */
expect(
  drift.kind === 'measured' && drift.max <= 2,
  drift.kind === 'measured'
    ? `une cellule visible a bougé de ${Math.round(drift.max)} px à l'insertion d'une page ancienne — l'historique pousse le fil sous les yeux`
    : `la dérive d'insertion n'a PAS pu être mesurée (${driftLine(drift)}) — aucun verdict de dérive n'est prononçable`,
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

// --- 6 : le favori plus ancien que les pages du fil (#7420).
const anchor = await checkThreadAnchor({ browser, BASE, expect: (ok, what) => {
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return expect(ok, what);
} });

await browser.close();
served.close();

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
console.log(`  saut à l'insertion      ${driftLine(drift)}`);
console.log(`    page servie aussitôt  ${driftLine(insertionDrift(pulls.filter((p) => p.latency === 0)))}`);
console.log(`    page après ${NETWORK_LATENCY_MS} ms    ${driftLine(insertionDrift(pulls.filter((p) => p.latency !== 0)))}`);
console.log(`  saut du contenu visible ${Math.round(visualJump)} px`);
console.log(`  favori ancien           ${anchor.newerPages} page(s) jusqu'au présent, ${anchor.sampled} rangées lues sans écart\n`);

if (failures.length > 0) {
  console.error(`  ${failures.length} défaut(s) :\n`);
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(
  `  Le fil de ${BENCH} messages ne monte jamais plus de ${MAX_CELLS} cellules, s'ouvre sur le dernier, charge son historique en ${olderPages} pages, et se remonte sans que le contenu visible bouge.\n`,
);
