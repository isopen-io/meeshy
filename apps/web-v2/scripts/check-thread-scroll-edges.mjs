#!/usr/bin/env node
/**
 * LE FIL DÉFILE D'UN BORD À L'AUTRE DE L'ÉCRAN (#6213) — le témoin
 * d'acceptation du lot.
 *
 * AUCUN TEST UNITAIRE NE VOIT UNE ARÊTE. La loi des réserves se prouve à la
 * fonction pure (`src/lib/view/thread-insets.test.ts`) ; que le contenu ne
 * soit plus TRANCHÉ ne se prouve qu'en ouvrant un navigateur et en comparant
 * des rectangles. C'est précisément ce que la capture du porteur montrait, le
 * 2026-09-12 : la dernière ligne du dernier message coupée en deux par la
 * pilule de langue du composeur, sous un en-tête dont l'arête basse hachait
 * le fil.
 *
 * CE QU'IL MESURE
 *
 * 1. LE DÉFILEUR EST L'ÉCRAN. Son rectangle part de `y = 0` et finit à
 *    `innerHeight` — miroir `.ignoresSafeArea(.container, edges: [.top,
 *    .bottom])` (`ConversationView.swift:1873`). Tant qu'il était borné par
 *    ses deux voisins de flux, sa hauteur visible valait `innerHeight` moins
 *    les deux bandes : l'escamotage du chrome (#5774) libérait du vide, pas
 *    du contenu.
 *
 * 2. LES RÉSERVES SONT DES MARGES INTÉRIEURES, et elles valent ce que la loi
 *    dit — encoche en haut, bord bas mesuré + 16 en bas
 *    (`topInset`/`bottomInset`, :1552-1556). Mesurées AVEC une encoche
 *    simulée : `--safe-top`/`--safe-bottom` sont la seule porte par laquelle
 *    l'appareil parle à la loi (`styles/thread-menu.css`), donc les surcharger
 *    exerce le chemin RÉEL, pas une approximation.
 *
 * 3. LA DERNIÈRE RANGÉE RESPIRE. Au repos, son bord bas est au moins 16 px
 *    au-dessus du composeur. C'est LE défaut de la capture, mesuré.
 *
 * 4. LE CONTENU TRANSITE SOUS LA BANDE. Défilé jusqu'en haut, il existe une
 *    rangée dont le sommet passe SOUS l'arête basse de l'en-tête. Sans elle,
 *    le flou de la bande (`backdrop-blur-xl`) n'a rien à flouter — l'en-tête
 *    était habillé en bande flottante et posé en frère de flux.
 *
 * 5. RIEN NE SE CACHE DERRIÈRE LE COMPOSEUR. Le bouton « revenir en bas »
 *    est ENTIÈREMENT au-dessus de lui : posé à `bottom-2` d'un défileur
 *    devenu plein écran, il passait dessous.
 *
 * 6. LA PILULE DE JOUR DÉMARRE SOUS LA BANDE — l'arithmétique iOS ENTIÈRE
 *    retrouvée (`MessageDayStickyPlacement.topOffset`), la soustraction
 *    `DAY_PILL_MARGIN` ayant disparu avec sa cause.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { LIST_BOTTOM_BREATH, SCROLL_BUTTON_GAP } from './lib/thread-insets-law.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
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

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/** L'ENCOCHE SIMULÉE — un iPhone à Dynamic Island, en chiffres ronds. */
const SAFE_TOP = 59;
const SAFE_BOTTOM = 34;

/**
 * `c-rattrapage` — le seul corpus du jeu assez long pour défiler sur
 * plusieurs écrans (`lib/api/fixtures-catchup.ts`), donc le seul qui puisse
 * montrer une rangée SOUS la bande. Il s'ouvrirait en Résumé Vivant : la
 * préférence de mode se pose avant la navigation, par la clé que
 * `reading-mode/store.ts` lit.
 */
const CONVERSATION = 'c-rattrapage';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;

const browser = await launchChromium();

const openThread = async (mode) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: 'dark',
  });
  await context.addInitScript(
    ({ key, mode, top, bottom }) => {
      try {
        localStorage.setItem('meeshy.scheme', 'dark');
        localStorage.setItem(key, mode);
      } catch {
        /* navigation privée */
      }
    },
    { key: MODE_KEY, mode },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main li', { timeout: 20_000 });
  /*
    L'ENCOCHE PAR LA PORTE OFFICIELLE. `env(safe-area-inset-*)` n'est pilotable
    depuis aucun navigateur automatisé — c'est la raison pour laquelle aucune
    mise en page à encoche n'avait jamais été MESURÉE ici. Depuis #6213, `env()`
    n'est plus écrit qu'à UN endroit (`styles/app.css`, `:root`), et tout ce qui
    a besoin de l'encoche en DÉRIVE : les utilitaires `pt-safe`/`pb-safe`, la
    loi pure (`lib/view/safe-area.ts`), le placement du menu de message. Poser
    les deux variables en style INLINE sur la racine surcharge donc la chaîne
    ENTIÈRE d'un seul geste, et exerce le chemin réel plutôt qu'une imitation.

    L'événement `resize` est celui que `useThreadInsets` écoute pour relire
    l'encoche (rotation, plein écran) : sans lui la réserve resterait sur la
    lecture du montage.
  */
  await page.evaluate(
    ({ top, bottom }) => {
      document.documentElement.style.setProperty('--safe-top', `${top}px`);
      document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
      window.dispatchEvent(new Event('resize'));
    },
    { top: SAFE_TOP, bottom: SAFE_BOTTOM },
  );
  /*
    LE REPOS, C'EST LE BAS DU FIL — et il faut l'y ramener APRÈS avoir posé
    l'encoche : le fil s'est ancré en bas au montage, avec un composeur qui ne
    portait pas encore ses 34 px de `pb-safe`. Ce recalage est un artefact du
    banc (sur un appareil l'encoche est là dès la première image), jamais une
    correction du produit — sans lui, on mesurerait le décalage qu'on vient
    d'introduire soi-même.
  */
  /* DEUX passes, et c'est le virtualiseur qui l'impose : il MESURE les rangées
     qu'il vient de monter, donc `scrollHeight` grandit pendant la première
     descente. Une seule passe s'arrêtait 10 px avant le bas — assez pour faire
     rougir une mesure de respiration qui, elle, était juste. */
  for (const _ of [0, 1]) {
    await page.evaluate(() => {
      const main = document.querySelector('main');
      main.scrollTop = main.scrollHeight;
    });
    await page.waitForTimeout(500);
  }
  page.__context = context;
  return page;
};

const geometry = (page) =>
  page.evaluate(() => {
    const box = (el) => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
    };
    const main = document.querySelector('main');
    const style = getComputedStyle(main);
    const rows = [...document.querySelectorAll('main li')];
    return {
      viewport: { height: window.innerHeight, width: window.innerWidth },
      main: box(main),
      mainClient: { height: main.clientHeight, scrollTop: main.scrollTop, scrollHeight: main.scrollHeight },
      padding: { top: Number.parseFloat(style.paddingTop), bottom: Number.parseFloat(style.paddingBottom) },
      header: box(document.querySelector('header.thread-header')),
      composer: box(document.querySelector('.thread-composer-chrome')),
      dayPill: box(document.querySelector('.thread-day-pill span')),
      scrollButton: box(document.querySelector('.thread-scroll-to-bottom')),
      lastRow: box(rows[rows.length - 1] ?? null),
      /* La rangée la PLUS HAUTE encore rendue : c'est elle qui doit pouvoir
         passer sous la bande quand on remonte le fil. */
      firstRow: box(rows[0] ?? null),
    };
  });

const page = await openThread('focal');
const g = await geometry(page);

/* 1 — LE DÉFILEUR EST L'ÉCRAN */
expect(Math.abs(g.main.top) < 1, `le défileur part du bord HAUT physique (y = ${g.main.top.toFixed(1)})`);
expect(
  Math.abs(g.main.bottom - g.viewport.height) < 1,
  `le défileur finit au bord BAS physique (y = ${g.main.bottom.toFixed(1)} pour ${g.viewport.height})`,
);
expect(
  Math.abs(g.mainClient.height - g.viewport.height) < 1,
  `sa hauteur VISIBLE est l'écran entier — l'escamotage du chrome découvre du contenu (${g.mainClient.height} / ${g.viewport.height})`,
);

/* 2 — LES RÉSERVES SONT DES MARGES INTÉRIEURES, ET VALENT LA LOI */
expect(
  Math.abs(g.padding.top - SAFE_TOP) < 1,
  `la réserve HAUTE est l'encoche SEULE, jamais la bande (${g.padding.top} pour ${SAFE_TOP})`,
);
const attendu = g.composer.height + LIST_BOTTOM_BREATH;
expect(
  Math.abs(g.padding.bottom - attendu) < 1.5,
  `la réserve BASSE est le composeur MESURÉ + ${LIST_BOTTOM_BREATH} (${g.padding.bottom.toFixed(1)} pour ${attendu.toFixed(1)})`,
);
expect(
  g.composer.height > SAFE_BOTTOM,
  `le composeur porte lui-même l'encoche basse (pb-safe) — ${g.composer.height.toFixed(1)} > ${SAFE_BOTTOM}`,
);

/* 3 — LA DERNIÈRE RANGÉE RESPIRE : le défaut de la capture, mesuré */
const respiration = g.composer.top - g.lastRow.bottom;
expect(
  respiration >= LIST_BOTTOM_BREATH - 1,
  `au repos, la dernière rangée respire ${LIST_BOTTOM_BREATH} px au-dessus du composeur (mesuré ${respiration.toFixed(1)})`,
);

/* 4 — LE CONTENU TRANSITE SOUS LA BANDE */
await page.evaluate(() => {
  document.querySelector('main').scrollTop = 0;
});
await page.waitForTimeout(400);
const haut = await geometry(page);
const sousLaBande = await page.evaluate(
  (headerBottom) =>
    [...document.querySelectorAll('main li')].some((li) => {
      const r = li.getBoundingClientRect();
      return r.top < headerBottom - 4 && r.bottom > 0;
    }),
  haut.header.bottom,
);
expect(
  sousLaBande,
  `remonté en haut, une rangée passe SOUS l'arête de la bande (y < ${haut.header.bottom.toFixed(1)}) — le flou a enfin quelque chose à flouter`,
);
expect(
  haut.mainClient.scrollTop === 0 && haut.firstRow.top >= SAFE_TOP - 1,
  `et le fil s'ARRÊTE sous l'encoche : la première rangée ne se glisse pas sous l'horloge (y = ${haut.firstRow.top.toFixed(1)})`,
);

/* 5 — RIEN NE SE CACHE DERRIÈRE LE COMPOSEUR */
if (haut.scrollButton !== null) {
  expect(
    haut.scrollButton.bottom <= haut.composer.top + 1,
    `le bouton « revenir en bas » est ENTIÈREMENT au-dessus du composeur (${haut.scrollButton.bottom.toFixed(1)} ≤ ${haut.composer.top.toFixed(1)})`,
  );
  expect(
    Math.abs(haut.composer.top - haut.scrollButton.bottom - SCROLL_BUTTON_GAP) < 1.5,
    `et il s'en écarte des ${SCROLL_BUTTON_GAP} px de MeeshySpacing.sm (${(haut.composer.top - haut.scrollButton.bottom).toFixed(1)})`,
  );
} else {
  failures.push('le bouton « revenir en bas » ne se montre pas alors que le fil est remonté en haut');
}

/*
  6 — LA PILULE DE JOUR DÉMARRE SOUS LA BANDE. Mesurée À MI-FIL, jamais au
  sommet : `stickyDayOf` ne colle rien quand `scrollOffset` vaut 0 (« un fil
  qui s'ouvre au sommet de son premier message ne doit rien coller »,
  `use-thread-chrome-signals.ts`) — au sommet, l'absence de pilule est la
  règle, pas une panne.
*/
await page.evaluate(() => {
  const main = document.querySelector('main');
  main.scrollTop = Math.round(main.scrollHeight / 2);
  main.dispatchEvent(new Event('scroll', { bubbles: true }));
});
await page.waitForTimeout(600);
const milieu = await geometry(page);
if (milieu.dayPill !== null) {
  expect(
    milieu.dayPill.top >= milieu.header.bottom - 1,
    `la pilule de jour démarre SOUS la bande (${milieu.dayPill.top.toFixed(1)} ≥ ${milieu.header.bottom.toFixed(1)})`,
  );
  expect(
    Math.abs(milieu.dayPill.top - (SAFE_TOP + 60)) < 6,
    `et elle retrouve l'arithmétique iOS ENTIÈRE — encoche + topOffset(60) = ${SAFE_TOP + 60} (mesuré ${milieu.dayPill.top.toFixed(1)})`,
  );
} else {
  failures.push('la pilule de jour collante ne se montre pas à mi-fil');
}

await page.__context.close();
await browser.close();
server.close();

if (failures.length > 0) {
  console.error('\n  LE FIL EST DE NOUVEAU BORNÉ — du contenu est TRANCHÉ (#6213) :\n');
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n  Le fil défile d’un bord à l’autre : le chrome flotte, les réserves sont des marges intérieures.');
