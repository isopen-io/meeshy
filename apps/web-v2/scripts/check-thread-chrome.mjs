#!/usr/bin/env node
/**
 * LE CHROME DU FIL (#5774, travail 3/3) — le témoin d'ACCEPTATION du lot.
 *
 * Il ouvre un navigateur RÉEL sur le `dist` construit et mesure, dans les
 * DEUX schémas, ce qu'aucun test unitaire ne peut voir : des `opacity`
 * calculées, des `pointer-events` effectifs, une position à l'écran, un
 * `scrollTop` après un clic.
 *
 * CE QU'IL MESURE
 *
 * 1. L'ESCAMOTAGE. En Focal, pendant un geste TENU (`touchstart` + `scroll`),
 *    l'en-tête ET le composeur portent `opacity: 0` et `pointer-events: none`,
 *    et reviennent à 1 dans les 300 ms qui suivent `touchend`. En Bulles,
 *    seule la GRAPPE d'actions de l'en-tête s'efface — l'en-tête lui-même et
 *    le composeur restent à 1 (miroir `hidesEntireHeader`, `ConversationView.swift:2094-2105`).
 *
 * 2. UN APPUI N'EST PAS UN TIRAGE (défaut trouvé en revue de ce lot). Un
 *    `touchstart` SANS défilement ne cache RIEN : `isDragging`
 *    (`MessageListViewController.swift:585-592`) ne devient vrai qu'au
 *    franchissement du seuil de panoramique, jamais au contact. Sans cette
 *    mesure, chaque tape sur une bulle faisait clignoter tout le chrome
 *    250 ms — mesuré au navigateur avant correction.
 *
 * 3. LA PILULE DE JOUR COLLANTE. Après un défilement de plus de vingt
 *    rangées : un nœud `role="heading"`, posé au bord bas de l'en-tête plus
 *    la MARGE dérivée (`--day-pill-top`), portant le libellé du jour de la
 *    première rangée VISIBLE, RESTANT visible pendant le geste (« le sticker
 *    de date RESTE », `MessageListViewController.swift:597-605`) et
 *    TRANSPARENT au doigt (`.allowsHitTesting(false)`,
 *    `MessageDayStickyOverlay.swift:69` — sans quoi cette bande pleine
 *    largeur vole le tap de la bulle qui passe dessous).
 *
 * 4. « DÉFILER VERS LE BAS ». Après une remontée de deux hauteurs d'écran :
 *    un bouton de 44 px au moins, atteignable en son centre, dont le clic
 *    pose `scrollTop` à `scrollHeight − clientHeight` (± 1 px) et qui
 *    DISPARAÎT ensuite. Son encre est celle que `--accent-ink` sert, et son
 *    contraste sur la teinte à 85 % de l'accent tient la barre AA (4,5:1) —
 *    l'encre blanche en dur y valait 1,98:1 en schéma clair.
 *
 * 5. HORS REACT. Pendant un geste complet, les DEUX attributs de chrome ne
 *    mutent qu'aux TRANSITIONS (« dédoublonné aux transitions, jamais à
 *    chaque frame », `MessageListViewController.swift:585-611`) : un
 *    `MutationObserver` compte au plus quatre mutations pour un geste, quel
 *    que soit le nombre d'images de défilement.
 *
 * CE QU'IL NE MESURE PAS, ET POURQUOI
 *
 * · « recherche ouverte ⇒ rien ne bouge » : aucun état de recherche n'existe
 *   encore côté web (`components/thread-header.tsx`, le bouton n'a pas
 *   d'`onClick` — issue compagnon). La porte `searchOpen` de la loi est
 *   gardée par `src/lib/view/thread-chrome.test.ts` ; ce gate ne peut pas
 *   l'ATTEINDRE, et ne prétend donc pas la mesurer.
 * · Le libellé À COMPTE (« 3 messages non lus, Défiler vers le bas ») : le
 *   compte de `unread-below.ts` ne monte que si un message ARRIVE sous la
 *   fenêtre, ce qu'aucune fixture ne produit (le socket est #5494). Les deux
 *   formes du libellé sont gardées par `thread-chrome.test.ts` ; ici on
 *   mesure le libellé SERVI, à compte nul.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { contrastOf } from './lib/contrast.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'rendus');
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
await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/**
 * LE CORPUS : `c-rattrapage` — le SEUL du jeu qui porte TROIS jours
 * calendaires et assez de rangées pour défiler sur plusieurs écrans
 * (`lib/api/fixtures-catchup.ts`). Il s'ouvrirait en Résumé Vivant
 * (`unreadCount: 26`) : la préférence de mode est donc POSÉE avant la
 * navigation, par la clé que `reading-mode/store.ts:36` lit — jamais par un
 * détour d'interface.
 */
const CONVERSATION = 'c-rattrapage';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;

const browser = await launchChromium();

/** Le geste, en trois primitives — le DOIGT, jamais la molette (§2 ci-dessus). */
const touch = (page, kind, dy = 0) =>
  page.evaluate(
    ({ kind, dy }) => {
      const el = document.querySelector('main');
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const point = (clientY) => new Touch({ identifier: 1, target: el, clientX: x, clientY });
      if (kind === 'start') {
        const t = point(y);
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      if (kind === 'move') {
        el.scrollTop -= dy;
        const t = point(y + dy);
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      const t = point(y);
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], targetTouches: [], changedTouches: [t] }));
    },
    { kind, dy },
  );

const chromeState = (page) =>
  page.evaluate(() => {
    const header = document.querySelector('header.thread-header');
    const host = header?.parentElement ?? null;
    const actions = document.querySelector('.thread-header-actions');
    const composer = document.querySelector('.thread-composer-chrome');
    const read = (el) => (el === null ? null : { opacity: getComputedStyle(el).opacity, pointerEvents: getComputedStyle(el).pointerEvents });
    return {
      dataHeader: host?.dataset.chromeHeader ?? null,
      dataComposer: host?.dataset.chromeComposer ?? null,
      header: read(header),
      actions: read(actions),
      composer: read(composer),
    };
  });

const openThread = async (scheme, { mode = 'focal' } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });
  await context.addInitScript(
    ({ scheme, key, mode }) => {
      try {
        localStorage.setItem('meeshy.scheme', scheme);
        localStorage.setItem(key, mode);
      } catch {
        /* navigation privée : le repli HTML tient pour la page seule. */
      }
    },
    { scheme, key: MODE_KEY, mode },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main li', { timeout: 20_000 });
  await page.waitForTimeout(900);
  page.__context = context;
  return page;
};
const close = async (page) => {
  await page.close();
  await page.__context.close();
};

for (const scheme of ['light', 'dark']) {
  console.log(`\n--- schéma ${scheme} ---`);

  // ------------------------------------------------------------------ 1 + 2
  {
    const page = await openThread(scheme);
    expect(
      (await page.locator('main li [data-reading-mode="focal"]').count()) > 0,
      `${scheme} · le fil est bien en rangée PLATE (Focal) — le corpus du gate`,
    );

    // --- 2. UN APPUI N'EST PAS UN TIRAGE.
    await touch(page, 'start');
    await page.waitForTimeout(300);
    const tapped = await chromeState(page);
    expect(
      tapped.dataHeader === null && tapped.dataComposer === null && tapped.header.opacity === '1',
      `${scheme} · un APPUI sans défilement ne cache RIEN (${JSON.stringify(tapped.dataHeader)}, opacité ${tapped.header.opacity})`,
    );
    await touch(page, 'end');
    await page.waitForTimeout(200);

    // --- 5. HORS REACT : compter les mutations d'attribut d'un geste ENTIER.
    await page.evaluate(() => {
      const host = document.querySelector('header.thread-header').parentElement;
      window.__chromeMutations = 0;
      window.__chromeObserver = new MutationObserver((records) => {
        window.__chromeMutations += records.length;
      });
      window.__chromeObserver.observe(host, { attributes: true, attributeFilter: ['data-chrome-header', 'data-chrome-composer'] });
    });

    // --- 1. L'ESCAMOTAGE, en Focal.
    await touch(page, 'start');
    for (let i = 0; i < 8; i += 1) {
      await touch(page, 'move', 60);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    const held = await chromeState(page);
    expect(
      held.dataHeader === 'entire' && held.dataComposer === 'hidden',
      `${scheme} · Focal, geste tenu : data-chrome-header="entire" + data-chrome-composer="hidden" (${JSON.stringify([held.dataHeader, held.dataComposer])})`,
    );
    expect(
      held.header.opacity === '0' && held.header.pointerEvents === 'none',
      `${scheme} · Focal, geste tenu : l'en-tête ENTIER est à opacity 0 et pointer-events none (${JSON.stringify(held.header)})`,
    );
    expect(
      held.composer.opacity === '0' && held.composer.pointerEvents === 'none',
      `${scheme} · Focal, geste tenu : le composeur est à opacity 0 et pointer-events none (${JSON.stringify(held.composer)})`,
    );

    await page.screenshot({ path: join(CAPTURES, `thread-focal-chrome-hidden.${scheme}.png`) });

    await touch(page, 'end');
    await page.waitForTimeout(300);
    const released = await chromeState(page);
    expect(
      released.header.opacity === '1' && released.composer.opacity === '1',
      `${scheme} · 300 ms après touchend, l'en-tête ET le composeur sont revenus à 1 (${JSON.stringify([released.header.opacity, released.composer.opacity])})`,
    );

    const mutations = await page.evaluate(() => {
      window.__chromeObserver.disconnect();
      return window.__chromeMutations;
    });
    expect(
      mutations > 0 && mutations <= 4,
      `${scheme} · le chrome mute AUX TRANSITIONS seulement : ${mutations} mutations pour 8 images de défilement (attendu 1..4)`,
    );

    await close(page);
  }

  // ---------------------------------------------------------------------- 3
  {
    const page = await openThread(scheme);
    await page.evaluate(() => {
      const m = document.querySelector('main');
      m.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    // Redescendre de VINGT rangées (borné par la hauteur du fil : le corpus
    // de fixtures n'en compte pas vingt écrans), pour que la tête visible ne
    // soit plus la première du fil — là où la sticky se tait, à raison : le
    // séparateur EN FLUX est encore à l'écran.
    const travelled = await page.evaluate(() => {
      const m = document.querySelector('main');
      const first = document.querySelector('main li[data-index]');
      const rowHeight = first === null ? 88 : first.getBoundingClientRect().height;
      m.scrollTop = Math.min(m.scrollHeight - m.clientHeight, 20 * rowHeight);
      return { scrollTop: m.scrollTop, clientHeight: m.clientHeight };
    });
    await page.waitForTimeout(500);
    expect(
      travelled.scrollTop > travelled.clientHeight,
      `${scheme} · le fil a bien défilé de plus d'un écran avant la mesure (${Math.round(travelled.scrollTop)} px)`,
    );

    const pill = await page.evaluate(() => {
      const node = document.querySelector('.thread-day-pill');
      if (node === null) return null;
      const heading = node.querySelector('[role="heading"]');
      const rect = node.getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      const host = document.querySelector('header.thread-header').parentElement;
      const centre = document.elementFromPoint(12, Math.round(rect.top + rect.height / 2));
      // LE LIBELLÉ ATTENDU : le dernier séparateur EN FLUX au-dessus ou sur la
      // tête visible — la MÊME question que `updateStickyDayLabel` (:896-957).
      const scroller = document.querySelector('main');
      let expected = null;
      for (const li of [...document.querySelectorAll('main li[data-index]')].sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      )) {
        if (li.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top) {
          const opener = li.querySelector(':scope > div > span');
          if (opener !== null) expected = opener.textContent;
          continue;
        }
        const opener = li.querySelector(':scope > div > span');
        if (opener !== null) expected = opener.textContent;
        break;
      }
      return {
        label: heading?.textContent ?? null,
        role: heading?.getAttribute('role') ?? null,
        expected,
        top: rect.top,
        mainTop: main.top,
        pillTopVar: getComputedStyle(host).getPropertyValue('--day-pill-top').trim(),
        pointerEvents: getComputedStyle(node).pointerEvents,
        catchesTheFinger: node.contains(centre),
      };
    });

    if (expect(pill !== null, `${scheme} · une pilule de jour COLLANTE est montée après vingt rangées`)) {
      expect(pill.role === 'heading', `${scheme} · la pilule collante porte role="heading" (${pill.role})`);
      expect(
        pill.label !== null && pill.label === pill.expected,
        `${scheme} · elle porte le jour de la PREMIÈRE rangée visible (servi « ${pill.label} », attendu « ${pill.expected} »)`,
      );
      /**
       * DEUX assertions, et la PREMIÈRE est la vraie. Comparer la position à
       * la variable qui la produit ne prouve que l'auto-cohérence : les deux
       * bougeraient ensemble. Le FAIT à tenir est GÉOMÉTRIQUE — « la pill
       * démarre SOUS le header » (`MessageDayStickyOverlay.swift:18-20`) :
       * elle touche le bord bas de l'en-tête, à moins d'une marge. Poser
       * `topOffset` entier dans une enveloppe qui commence DÉJÀ à ce bord la
       * descendait 52 px plus bas — mesuré à `y = 120` en revue de #5774,
       * contre `y = 76` sur la cible iOS.
       */
      const offset = Math.round(pill.top - pill.mainTop);
      expect(
        offset >= 0 && offset <= 16,
        `${scheme} · elle démarre SOUS l'en-tête, à moins d'une marge : ${offset} px sous son bord bas`,
      );
      const derived = Number.parseFloat(pill.pillTopVar);
      expect(
        Number.isFinite(derived) && Math.abs(offset - derived) <= 1,
        `${scheme} · et cette marge est celle que la cote DÉRIVÉE sert (--day-pill-top = ${pill.pillTopVar})`,
      );
      expect(
        pill.pointerEvents === 'none' && !pill.catchesTheFinger,
        `${scheme} · elle est TRANSPARENTE au doigt sur toute sa bande (pointer-events ${pill.pointerEvents}, attrape ${pill.catchesTheFinger})`,
      );
    }

    // Elle RESTE pendant le geste — c'est le seul chrome qui ne s'escamote pas.
    await touch(page, 'start');
    for (let i = 0; i < 5; i += 1) {
      await touch(page, 'move', 40);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(250);
    const duringGesture = await page.evaluate(() => {
      const node = document.querySelector('.thread-day-pill');
      return node === null ? null : { opacity: getComputedStyle(node).opacity, label: node.textContent };
    });
    expect(
      duringGesture !== null && duringGesture.opacity === '1',
      `${scheme} · la pilule de jour RESTE pendant le geste (${JSON.stringify(duringGesture)}) — l'en-tête, lui, est parti`,
    );
    await touch(page, 'end');
    await close(page);
  }

  // ---------------------------------------------------------------------- 4
  {
    const page = await openThread(scheme);
    const twoScreensUp = await page.evaluate(() => {
      const m = document.querySelector('main');
      m.scrollTop -= m.clientHeight * 2;
      return { scrollTop: m.scrollTop, max: m.scrollHeight - m.clientHeight };
    });
    await page.waitForTimeout(500);

    const button = await page.evaluate(() => {
      const b = document.querySelector('.thread-scroll-to-bottom');
      if (b === null) return null;
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return {
        label: b.getAttribute('aria-label'),
        width: r.width,
        height: r.height,
        insetEnd: window.innerWidth - r.right,
        ink: cs.color,
        surface: cs.backgroundColor,
        reachable: b.contains(hit),
        tag: b.tagName,
      };
    });

    if (
      expect(
        button !== null,
        `${scheme} · remonté de deux hauteurs d'écran (${Math.round(twoScreensUp.scrollTop)}/${Math.round(twoScreensUp.max)}), le bouton « revenir en bas » est PRÉSENT`,
      )
    ) {
      expect(button.tag === 'BUTTON', `${scheme} · c'est un <button>, jamais un <div onClick> (${button.tag})`);
      expect(
        button.width >= 44 && button.height >= 44,
        `${scheme} · sa cible fait au moins 44 px (${button.width}×${button.height})`,
      );
      expect(button.reachable, `${scheme} · son centre lui revient — aucun voisin ne le recouvre`);
      expect(
        button.label === 'Défiler vers le bas',
        `${scheme} · son nom accessible est celui de la loi, à compte nul (« ${button.label} »)`,
      );
      const ratio = await contrastOf(page, '.thread-scroll-to-bottom');
      expect(
        ratio !== null && ratio >= 4.5,
        `${scheme} · son encre tient la barre AA sur la teinte de l'accent : ${ratio}:1 (${button.ink} sur ${button.surface})`,
      );
    }

    const landed = await (async () => {
      await page.locator('.thread-scroll-to-bottom').click();
      await page.waitForTimeout(900);
      return page.evaluate(() => {
        const m = document.querySelector('main');
        return {
          scrollTop: m.scrollTop,
          max: m.scrollHeight - m.clientHeight,
          stillThere: document.querySelector('.thread-scroll-to-bottom') !== null,
        };
      });
    })();
    expect(
      Math.abs(landed.scrollTop - landed.max) <= 1,
      `${scheme} · son clic pose scrollTop au BAS EXACT du défileur (${Math.round(landed.scrollTop)} pour un maximum de ${Math.round(landed.max)})`,
    );
    expect(!landed.stillThere, `${scheme} · il se RETIRE une fois le bas atteint`);
    await close(page);
  }

  // ---------------------------------------------- 1 (suite) : le mode BULLES
  {
    const page = await openThread(scheme, { mode: 'bubbles' });
    // La peau Bulles ne pose pas `data-reading-mode` : elle se reconnaît à sa
    // bulle (`.rounded-bubble`), le MÊME témoin que `check-reading-mode.mjs:525`.
    expect(
      (await page.locator('main li .rounded-bubble').count()) > 0,
      `${scheme} · le fil est bien en BULLES pour ce bloc`,
    );
    await touch(page, 'start');
    for (let i = 0; i < 6; i += 1) {
      await touch(page, 'move', 60);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    const held = await chromeState(page);
    expect(
      held.dataHeader === 'actions' && held.dataComposer === null,
      `${scheme} · Bulles, geste tenu : SEULE la grappe d'actions est visée (${JSON.stringify([held.dataHeader, held.dataComposer])})`,
    );
    expect(
      held.actions !== null && held.actions.opacity === '0' && held.actions.pointerEvents === 'none',
      `${scheme} · Bulles : la grappe d'actions s'efface (${JSON.stringify(held.actions)})`,
    );
    expect(
      held.header.opacity === '1' && held.composer.opacity === '1',
      `${scheme} · Bulles : l'en-tête et le composeur RESTENT (${JSON.stringify([held.header.opacity, held.composer.opacity])})`,
    );
    await touch(page, 'end');
    await close(page);
  }

  // ---------------------------------------------------------------------- 6
  /**
   * LA PASTILLE DE LANGUE DU COMPOSEUR (#5828, § 4.9 de la spécification).
   * Sur `c-deploiement` (la conversation que `check-thread-states.mjs`
   * ouvre déjà pour le même genre de mesure — « 0 contrôle sans
   * gestionnaire ») : la pastille existe, tient la cible d'au moins 44×44,
   * ne recouvre ni le champ ni le bouton « + », tient le contraste AA ; un
   * choix dans la feuille la met à jour ET l'envoi suivant porte la langue
   * choisie jusque dans la bulle SERVIE (`lang="en"`) — l'effet mesuré
   * jusqu'au pixel, pas un booléen lu dans le code (leçon du dépôt).
   */
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme === 'light' ? 'light' : 'dark',
    });
    await context.addInitScript((s) => {
      try {
        localStorage.setItem('meeshy.scheme', s);
      } catch {
        /* navigation privée : le repli HTML tient pour la page seule. */
      }
    }, scheme);
    const page = await context.newPage();
    await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
    await page.waitForSelector('[data-message]');
    await page.waitForTimeout(300);

    const PILL = '[data-composer] button[aria-label^="Langue d’écriture"]';

    const pillBox = await page.evaluate((sel) => {
      const pill = document.querySelector(sel);
      const textarea = document.querySelector('[data-composer] textarea');
      const plus = document.querySelector('[data-composer] [aria-label="Ouvrir le menu des pièces jointes"]');
      if (pill === null || textarea === null) return null;
      const p = pill.getBoundingClientRect();
      const t = textarea.getBoundingClientRect();
      const plusBox = plus === null ? null : plus.getBoundingClientRect();
      const overlapsPlus =
        plusBox !== null &&
        !(p.right <= plusBox.left || p.left >= plusBox.right || p.bottom <= plusBox.top || p.top >= plusBox.bottom);
      /* LA CAPSULE PEINTE, PAS SEULEMENT LA CIBLE (revue-correction #5828) —
         une capsule plus LARGE que son bouton déborde sans rien changer au
         rectangle du `<button>` : c'est la peinture qui sortait de l'écran
         (chevron coupé, mesuré sur les deux schémas avant correction), et
         `opacity` comme le non-recouvrement du champ la donnaient pour
         « entièrement visible ». On mesure donc la RÉUNION bouton+capsule
         contre le cadre, et le défilement horizontal du document. */
      const painted = [pill, ...pill.querySelectorAll('*')]
        .map((n) => n.getBoundingClientRect())
        .reduce((u, r) => ({ left: Math.min(u.left, r.left), right: Math.max(u.right, r.right) }), {
          left: p.left,
          right: p.right,
        });
      return {
        width: p.width,
        height: p.height,
        bottom: p.bottom,
        textareaTop: t.top,
        opacity: getComputedStyle(pill).opacity,
        overlapsPlus,
        paintedLeft: painted.left,
        paintedRight: painted.right,
        viewportWidth: document.documentElement.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
      };
    }, PILL);

    if (expect(pillBox !== null, `${scheme} · une pastille de langue existe dans le composeur`)) {
      expect(
        pillBox.width >= 44 && pillBox.height >= 44,
        `${scheme} · sa cible fait au moins 44×44 (${pillBox.width}×${pillBox.height})`,
      );
      expect(Number.parseFloat(pillBox.opacity) === 1, `${scheme} · elle est entièrement visible (opacity ${pillBox.opacity})`);
      expect(
        pillBox.paintedLeft >= 0 && pillBox.paintedRight <= pillBox.viewportWidth,
        `${scheme} · sa CAPSULE PEINTE tient dans le cadre (${Math.round(pillBox.paintedLeft)} → ${Math.round(pillBox.paintedRight)} pour ${pillBox.viewportWidth} px)`,
      );
      expect(
        pillBox.docScrollWidth <= pillBox.viewportWidth,
        `${scheme} · elle ne fait pas défiler la page horizontalement (${pillBox.docScrollWidth} ≤ ${pillBox.viewportWidth})`,
      );
      expect(
        pillBox.bottom <= pillBox.textareaTop,
        `${scheme} · elle ne recouvre pas le champ (son bas ${Math.round(pillBox.bottom)} ≤ le haut du champ ${Math.round(pillBox.textareaTop)})`,
      );
      expect(!pillBox.overlapsPlus, `${scheme} · elle ne chevauche pas le bouton « + »`);

      const ratio = await contrastOf(page, `${PILL} span`);
      expect(ratio !== null && ratio >= 4.5, `${scheme} · son contraste encre/fond tient la barre AA (${ratio}:1)`);
    }

    await page.locator(PILL).click();
    await page.waitForSelector('dialog[open]');
    const dialogTitle = await page.locator('dialog[open] h2').textContent();
    expect(dialogTitle === 'Langue d’écriture', `${scheme} · la feuille est titrée « Langue d’écriture » (« ${dialogTitle} »)`);

    await page.locator('dialog[open] button', { hasText: 'English' }).first().click();
    await page.waitForTimeout(200);
    expect((await page.locator('dialog[open]').count()) === 0, `${scheme} · le dialogue s'est refermé après le choix`);

    const afterChoice = await page.locator('[data-composer-language]').getAttribute('aria-label');
    expect(
      afterChoice === 'Langue d’écriture : anglais',
      `${scheme} · l'aria-label devient « Langue d’écriture : anglais » (« ${afterChoice} »)`,
    );

    await page.locator('[data-composer] textarea').fill('Do you confirm the mockup for tomorrow?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const lastLang = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-message]');
      const last = rows[rows.length - 1];
      return last?.querySelector('[lang]')?.getAttribute('lang') ?? null;
    });
    expect(lastLang === 'en', `${scheme} · la DERNIÈRE bulle du fil porte lang="en" (« ${lastLang} »)`);

    await context.close();
  }
}

await browser.close();
server.close();

if (failures.length > 0) {
  console.error('\n  LE CHROME DU FIL A DÉRIVÉ (#5774) :\n');
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\n  Le chrome du fil est conforme à ConversationView.swift / MessageDayStickyOverlay.swift / ConversationScrollControlsView.swift (deux schémas).`);
console.log(`  Captures : ${join(CAPTURES, 'thread-focal-chrome-hidden.{light,dark}.png')}`);
