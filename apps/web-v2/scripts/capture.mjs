#!/usr/bin/env node
/**
 * Capture les ecrans du POC aux deux schemas, a la largeur de reference
 * (390 x 844 — l'iPhone que les cibles montrent), pour qu'on JUGE le rendu au
 * lieu de le supposer. Les captures vont dans `render/`, non versionnees.
 */
import { launchChromium } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUTPUT = new URL('../render/', import.meta.url).pathname;
mkdirSync(OUTPUT, { recursive: true });

/**
 * L'INSTANT DE REFERENCE des captures.
 *
 * Les fixtures sont ancrees sur `Date.now()` pour que le fil se lise toujours
 * comme aujourd'hui (sinon il affiche « Hier » le lendemain). Mais alors deux
 * captures du MEME code different par leurs horodatages, et comparer un rendu
 * avant/apres devient impossible. On fige donc l'horloge de la page : les
 * fixtures restent relatives, et le resultat redevient reproductible.
 */
const INSTANT = new Date('2026-09-07T10:00:00Z');

const SCREENS = [
  { name: 'list', path: '/' },
  { name: 'thread', path: '/c/c-deploiement' },
  { name: 'thread-live', path: '/c/c-amina' },
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
  /** LA PROTECTION (D-23, #5676) — au repos, peau Focal, mode par défaut. */
  { name: 'thread-protected', path: '/c/c-protection' },
  /** LE RÉSUMÉ VIVANT (#5695, D-21) — le SEUL corpus qui ATTEINT `summary`. */
  { name: 'thread-summary', path: '/c/c-rattrapage' },
  /** LES QUATRE PORTES D'ENTRÉE (#5816) — capturées SANS session : `/welcome`
      renvoie vers `/` dès qu'il y en a une, et c'est précisément l'écran du
      visiteur qu'on veut voir. `/auth/magic-link` est ici dans son état de
      SAISIE (aucun `?token=`) ; l'attente et son compte à rebours sont tenus
      par les témoins de `magic-link.test.tsx`, qu'une capture figée ne saurait
      montrer sans mentir sur le temps. */
  /** LE LECTEUR PLEIN ÉCRAN DE STORIES (#5817) — les DEUX formes du périmètre :
      la story TEXTE (fond d'effet + texte résolu par le Prisme, rang ≠ 1 :
      l'original est anglais, le lecteur voit le français) et la story IMAGE
      (média plein cadre + légende dessous). Le lecteur force son canevas noir,
      comme iOS (`preferredColorScheme(.dark)`) : les deux schémas doivent rendre
      la MÊME image — c'est la jumelle claire qui prouve qu'aucun jeton de
      surface ne fuit dans le lecteur. */
  { name: 'story-text', path: '/story/st-amie-1' },
  { name: 'story-image', path: '/story/st-amie-2' },
  { name: 'welcome', path: '/welcome' },
  { name: 'magic-link', path: '/auth/magic-link' },
  { name: 'magic-link-validate', path: '/auth/magic-link/validate' },
  { name: 'forgot-password', path: '/forgot-password' },
];

const browser = await launchChromium();
for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });
  for (const screen of SCREENS) {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const file = `${OUTPUT}${screen.name}.${scheme}.png`;
    await page.screenshot({ path: file });
    console.log(`  ${screen.name} · ${scheme}`);
    await page.close();
  }
  await context.close();
}

/**
 * LA SCÈNE DU FIL (#5648) — quatre captures dynamiques sur
 * `/c/c-salon-riviere`, comparées à `targets/thread.focal.scene.*`,
 * `thread.focal.timestamps.*`, `thread.script.*`. `page.clock.setFixedTime`
 * ne fige QUE `Date` (les libellés « Aujourd'hui »/l'heure) — `performance.now()`
 * continue de tourner en temps réel, c'est ce que la scène lit
 * (`reading-mode/scene.ts`), donc le geste de défilement ci-dessous produit
 * un armement et une élection réels.
 */
for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });

  // thread-focal-rest — au repos, avant tout geste.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-focal-rest.${scheme}.png` });
    console.log(`  thread-focal-rest · ${scheme}`);
    await page.close();
  }

  /**
   * list-scrolled — LA LENTILLE EN SCÈNE (#5694). La capture au repos ne peut
   * montrer NI le sticker COLLÉ (il n'a encore rien sous quoi glisser), NI la
   * rangée magnifiée (au repos, `level` vaut 0 et la magnification est
   * aplatie) : les deux comportements que ce lot a livrés sont donc invisibles
   * sur `list.*`. C'est la capture à comparer à `targets/lentille.scrolled.*`.
   */
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('#contenu').hover();
    for (let i = 0; i < 7; i += 1) {
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT}list-scrolled.${scheme}.png` });
    console.log(`  list-scrolled · ${scheme}`);
    await page.close();
  }

  /**
   * thread-focal-chrome-hidden (#5774, travail 3/3) — LE CHROME ESCAMOTÉ,
   * pendant le geste. Un contexte À PART parce qu'il lui faut `hasTouch` :
   * l'escamotage suit le DOIGT (`isDragging`), jamais la molette
   * (`MessageListViewController.swift:585-611`) — une capture à la molette
   * montrerait le fil au repos et mentirait sur ce que le lot livre.
   * `c-rattrapage` est le corpus (trois jours, assez de rangées) ; son mode
   * est POSÉ à `focal`, sans quoi il s'ouvrirait en Résumé Vivant.
   */
  {
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      colorScheme: scheme === 'light' ? 'light' : 'dark',
    });
    await touchContext.addInitScript(() => {
      try {
        localStorage.setItem('meeshy.reading-mode.u_u-viewer.c-rattrapage', 'focal');
      } catch {
        /* navigation privée */
      }
    });
    const page = await touchContext.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-rattrapage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const el = document.querySelector('main');
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const point = (clientY) => new Touch({ identifier: 1, target: el, clientX: x, clientY });
      const start = point(y);
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], targetTouches: [start], changedTouches: [start] }));
      for (let i = 0; i < 8; i += 1) {
        el.scrollTop -= 60;
        const move = point(y + 60);
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [move], targetTouches: [move], changedTouches: [move] }));
      }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUTPUT}thread-focal-chrome-hidden.${scheme}.png` });
    console.log(`  thread-focal-chrome-hidden · ${scheme}`);
    await page.close();
    await touchContext.close();
  }

  // thread-focal-scene — après 4,2 s de `wheel` soutenu (< 4,5 s d'aplatissement).
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('main').hover();
    for (let i = 0; i < 42; i += 1) {
      await page.mouse.wheel(0, -40);
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: `${OUTPUT}thread-focal-scene.${scheme}.png` });
    console.log(`  thread-focal-scene · ${scheme}`);
    await page.close();
  }

  // thread-focal-reveal — 200 ms après le dernier `wheel` (heure/coches révélées).
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('main').hover();
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT}thread-focal-reveal.${scheme}.png` });
    console.log(`  thread-focal-reveal · ${scheme}`);
    await page.close();
  }

  // thread-script — le mode Script, densité uniforme, zéro élection.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /Script/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-script.${scheme}.png` });
    console.log(`  thread-script · ${scheme}`);
    await page.close();
  }

  await context.close();
}

/**
 * LA PROTECTION (D-23, #5676) — deux captures dynamiques de plus, sur
 * `/c/c-protection`. `setFixedTime` suffit ici : la révélation s'appuie sur
 * `setTimeout` RÉEL, pas sur `Date`, donc la capturer n'exige pas de figer le
 * temps virtuel comme `check-thread-states.mjs` — un clic puis une attente
 * réelle brève suffisent.
 */
for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });

  // thread-protected-revealed — juste après le tap sur le témoin flouté.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-protection`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('[data-protected="hidden"]').first().click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT}thread-protected-revealed.${scheme}.png` });
    console.log(`  thread-protected-revealed · ${scheme}`);
    await page.close();
  }

  // thread-protected-bubbles — la même Salle sécurisée, peau Bulles.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-protection`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-protected-bubbles.${scheme}.png` });
    console.log(`  thread-protected-bubbles · ${scheme}`);
    await page.close();
  }

  /**
   * thread-media / thread-media-bubbles — le corpus « Médias » (#5805), les
   * DEUX peaux.
   *
   * DYNAMIQUES, et non une entrée de `SCREENS` (revue #5805) : le fil ouvre
   * EN BAS, et l'image du corpus est le PREMIER message — la capture censée
   * prouver « une image s'affiche » ne montrait aucune image (mesuré sur les
   * quatre rendus du lot). On amène donc la pièce `media-1-a1` dans le cadre :
   * le rendu porte alors l'image RÉELLE, le vocal anglais servi en français
   * (rang 1) et le vocal allemand servi en anglais (rang 2) — les trois
   * choses que ce lot livre, dans une seule vue.
   */
  for (const [name, skin] of [
    ['thread-media', 'focal'],
    ['thread-media-bubbles', 'bulles'],
  ]) {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-medias`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    if (skin === 'bulles') {
      await page.getByRole('button', { name: /Mode de lecture/ }).click();
      await page.waitForTimeout(150);
      await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
      await page.waitForTimeout(300);
    }
    await page.evaluate(() =>
      document.querySelector('[data-attachment="media-1-a1"]')?.scrollIntoView({ block: 'start' }),
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUTPUT}${name}.${scheme}.png` });
    console.log(`  ${name} · ${scheme}`);
    await page.close();
  }

  await context.close();
}

/**
 * LE MENU DU MESSAGE (#5814) — quatre captures, comparees a
 * `targets/thread.message-menu.{light,dark}.png` : la RANGEE PLATE (Focal, la
 * cible claire) et la BULLE (la cible sombre), plus le mode SELECTION que le
 * menu ouvre. Le geste est le CLIC DROIT (`contextmenu`) : Playwright ne sait
 * pas tenir un doigt 500 ms de facon fiable, et les deux portes ouvrent le
 * MEME menu (`useLongPress`).
 */
for (const scheme of ['dark', 'light']) {
  /**
   * UN CONTEXTE PAR CAPTURE, pas un par schema (revue #5814) : le mode de
   * lecture est PERSISTE (localStorage), et une capture « Bulles » teignait
   * donc toutes les suivantes du meme contexte — mesure : `thread-selection`
   * et `thread-message-menu-translate` sortaient en Bulles alors que le
   * script demandait Focal. Un contexte neuf par page rend chaque capture
   * INDEPENDANTE de l'ordre du script.
   */
  const openThread = async (skin) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme === 'light' ? 'light' : 'dark',
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    if (skin === 'bubbles') {
      await page.getByRole('button', { name: /Mode de lecture/ }).click();
      await page.waitForTimeout(150);
      await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
      await page.waitForTimeout(300);
    }
    page.__context = context;
    return page;
  };
  const closeThread = async (page) => {
    await page.close();
    await page.__context.close();
  };

  // thread-message-menu — la rangee plate (Focal), la 3e rangee.
  {
    const page = await openThread('focal');
    await page.locator('[data-row]').nth(2).click({ button: 'right' });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUTPUT}thread-message-menu.${scheme}.png` });
    console.log(`  thread-message-menu · ${scheme}`);
    await closeThread(page);
  }

  // thread-message-menu-bubbles — la meme action sur une BULLE.
  {
    const page = await openThread('bubbles');
    await page.locator('[data-row]').nth(2).click({ button: 'right' });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUTPUT}thread-message-menu-bubbles.${scheme}.png` });
    console.log(`  thread-message-menu-bubbles · ${scheme}`);
    await closeThread(page);
  }

  // thread-message-menu-last — la DERNIERE rangee : le cas ou la loi de
  // placement RABAT le cluster, donc celui ou un aperçu et sa rangee vive se
  // dedoubleraient si la source ne s'effaçait pas.
  {
    const page = await openThread('focal');
    await page.locator('[data-row]').last().click({ button: 'right' });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUTPUT}thread-message-menu-last.${scheme}.png` });
    console.log(`  thread-message-menu-last · ${scheme}`);
    await closeThread(page);
  }

  // thread-message-menu-translate — le sous-menu Traduire, ouvert. Sur la
  // PREMIERE rangee : la 3e est une piece jointe SANS texte, donc sans
  // « Traduire » ni « Copier » (garde `hasText`, message-actions.ts).
  {
    const page = await openThread('focal');
    await page.locator('[data-row]').nth(0).click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: 'Traduire' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-message-menu-translate.${scheme}.png` });
    console.log(`  thread-message-menu-translate · ${scheme}`);
    await closeThread(page);
  }

  // thread-selection — la barre de selection REMPLACE le composeur.
  {
    const page = await openThread('focal');
    await page.locator('[data-row]').nth(0).click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: 'Sélectionner' }).click();
    await page.waitForTimeout(300);
    await page.locator('[data-row]').nth(3).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT}thread-selection.${scheme}.png` });
    console.log(`  thread-selection · ${scheme}`);
    await closeThread(page);
  }

}

await browser.close();
