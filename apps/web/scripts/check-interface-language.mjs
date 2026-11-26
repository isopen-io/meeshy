#!/usr/bin/env node
/**
 * UNE SECONDE LANGUE D'INTERFACE S'AFFICHE RÉELLEMENT (#6206) — le gate du
 * critère de fin, dans un VRAI navigateur, sur le document PRODUIT (`dist/`).
 *
 * Un témoin unitaire prouve que `translate()` rend de l'allemand ; il ne
 * prouve ni que le script d'amorçage résout la langue du navigateur, ni que la
 * route attend le catalogue avant de rendre, ni que le chunk servi est bien
 * celui de CETTE langue. Ce gate ouvre `/links` (le hub « Mes liens », sous les
 * menus flottants — un écran d'attente jusqu'à #6361) et mesure, pour chaque cas :
 *
 *  1. `<html lang>` est la langue résolue (stockage → navigateur → `fr`) ;
 *  2. le titre, la bannière et son sous-titre, et le retour de l'écran sont
 *     dans cette langue ;
 *  3. le bouton du menu, l'échelle et ses sept barreaux (« Ma Légende » en tête depuis #17769) s'annoncent dans cette
 *     langue ;
 *  4. UN SEUL catalogue a été téléchargé, celui de la langue résolue — le
 *     chargement paresseux par langue est une mesure, pas une promesse ;
 *  5. aucune erreur de page (un catalogue lu avant d'être chargé LÈVE) ;
 *  6. à 320 × 568, le titre et le sous-titre les plus longs (allemand) restent
 *     atteignables à leur centre (`document.elementFromPoint`) et ne débordent
 *     pas l'écran.
 *
 * Les textes attendus sont RECOPIÉS ici, à dessein : ce gate mesure ce qui
 * s'AFFICHE, et un attendu relu dans le catalogue serait vert sur un catalogue
 * faux. La parité des sept catalogues est gardée par `i18n-catalog.test.ts`.
 *
 * `CAPTURE_DIR=<dossier>` écrit une capture par cas, gabarit et schéma.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = process.env.CAPTURE_DIR;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;
if (CAPTURES) await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

const GERMAN = {
  lang: 'de',
  dir: 'ltr',
  title: 'Meine Links',
  family: 'Teilen',
  back: 'Zurück zu den Unterhaltungen',
  /* Le bouton DIT le compte de la cloche (#6288) : les fixtures en servent
     trois non lues, et son nom le porte dans la langue d'interface. */
  menu: 'Menü, 3 ungelesene Mitteilungen',
  ladder: 'Meeshy-Navigation',
  /* Le barreau « Découvrir » DIT le compte des demandes reçues (#6321) : les
     fixtures en servent trois. */
  rungs: ['Meine Legende', 'Meine Links', 'Mitteilungen, 3 ungelesen', 'Anrufe', 'Entdecken, 3 Anfragen erhalten', 'Communitys', 'Einstellungen'],
};

const ARABIC = {
  lang: 'ar',
  dir: 'rtl',
  title: 'روابطي',
  family: 'مشاركة',
  back: 'العودة إلى المحادثات',
  menu: 'القائمة، 3 إشعارات غير مقروءة',
  ladder: 'التنقل في Meeshy',
  rungs: ['أسطورتي', 'روابطي', 'الإشعارات، 3 غير مقروءة', 'المكالمات', 'اكتشاف، 3 طلبات واردة', 'المجتمعات', 'الإعدادات'],
};

const FRENCH = {
  lang: 'fr',
  dir: 'ltr',
  title: 'Mes liens',
  family: 'Partage',
  back: 'Revenir aux conversations',
  menu: 'Menu, 3 notifications non lues',
  ladder: 'Navigation Meeshy',
  rungs: ['Ma Légende', 'Mes liens', 'Notifications, 3 non lues', 'Appels', 'Découvrir, 3 demandes reçues', 'Communautés', 'Réglages'],
};

const CASES = [
  { name: 'navigateur de-DE', locale: 'de-DE', stored: null, want: GERMAN },
  { name: 'choix stocké « ar » sur un navigateur en-US', locale: 'en-US', stored: 'ar', want: ARABIC },
  { name: 'navigateur fr-FR', locale: 'fr-FR', stored: null, want: FRENCH },
  { name: 'navigateur ja-JP (langue non servie)', locale: 'ja-JP', stored: null, want: FRENCH },
];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

const browser = await launchChromium();

/* Le sens au moment où `<body>` naît : les scripts en ligne de `<head>` ont
   tourné, l'application (module différé) pas encore. C'est ce que voit la
   première peinture. */
function recordDirectionAtBodyBirth() {
  const observer = new MutationObserver(() => {
    if (document.body === null) return;
    window.__dirAtBodyBirth = document.documentElement.dir;
    observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
}

const horizontalOverflow = (page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });

async function newContextFor({ locale, stored }, viewport, scheme) {
  const context = await browser.newContext({ viewport, locale, colorScheme: scheme });
  await context.addInitScript(recordDirectionAtBodyBirth);
  if (stored !== null) {
    await context.addInitScript((value) => {
      localStorage.setItem('meeshy.interface-language', value);
    }, stored);
  }
  return context;
}

async function measure({ name, locale, stored, want }, viewport, scheme) {
  const tag = `${name} · ${viewport.width}×${viewport.height} · ${scheme}`;
  const context = await newContextFor({ locale, stored }, viewport, scheme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const catalogs = [];
  page.on('request', (request) => {
    const match = /\/assets\/catalog-([a-z]{2})-/.exec(request.url());
    if (match) catalogs.push(match[1]);
  });

  await page.goto(`${BASE}/links`, { waitUntil: 'load' });
  await page.locator('header h1').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('[data-floating-menu]').waitFor({ state: 'visible', timeout: 10_000 });
  /* Le NOM du bouton dit le compte de la cloche (#6288) : il naît SANS compte
     et se met à jour quand `GET /notifications/counts` répond — une requête
     asynchrone que le montage du bouton ne garantit pas terminée. Lire
     `aria-label` juste après « visible » est une COURSE (#6874, mesurée en
     CI : deux verdicts opposés sur le même commit). La pastille de coin
     (`UnreadCornerBadge`) naît du MÊME état que le nom du bouton, dans le
     même rendu : l'attendre revient à attendre la VALEUR, pas le rendu. */
  await page.waitForSelector('.floating-menus [data-unread]', { timeout: 10_000 });

  expect((await page.evaluate(() => document.documentElement.lang)) === want.lang, `${tag} : <html lang="${want.lang}">`);
  const dir = await page.evaluate(() => ({ now: document.documentElement.dir, atBodyBirth: window.__dirAtBodyBirth ?? null }));
  expect(dir.now === want.dir, `${tag} : <html dir="${want.dir}"> (obtenu "${dir.now}")`);
  expect(dir.atBodyBirth === want.dir, `${tag} : dir="${want.dir}" dès la naissance de <body> (obtenu "${dir.atBodyBirth}")`);
  const overflow = await horizontalOverflow(page);
  expect(overflow.scroll <= overflow.client + 1, `${tag} : aucun défilement horizontal (${overflow.scroll} > ${overflow.client})`);
  expect((await page.locator('header h1').innerText()).trim() === want.title, `${tag} : titre « ${want.title} »`);
  expect((await page.locator('[data-links-family-title]').first().innerText()).trim() === want.family, `${tag} : la première famille du hub dans la langue`);
  expect(
    (await page.locator('header a').first().getAttribute('aria-label')) === want.back,
    `${tag} : le retour s'annonce « ${want.back} »`,
  );
  expect(
    (await page.locator('[data-floating-menu]').getAttribute('aria-label')) === want.menu,
    `${tag} : le bouton du menu s'annonce « ${want.menu} »`,
  );

  const reach = await page.evaluate(() => {
    const family = document.querySelector('[data-links-family-title]');
    return [document.querySelector('header h1'), family].map((el) => {
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        found: true,
        reachable: hit !== null && (hit === el || el.contains(hit)),
        inside: r.left >= 0 && r.right <= window.innerWidth + 0.5,
      };
    });
  });
  for (const [index, label] of ['titre', 'première famille'].entries()) {
    const r = reach[index];
    expect(r.found && r.reachable, `${tag} : ${label} atteignable à son centre`);
    expect(r.found && r.inside, `${tag} : ${label} ne déborde pas l'écran`);
  }

  if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `interface-${want.lang}-${locale}-${viewport.width}-${scheme}.png`) });

  await page.locator('[data-floating-menu]').click();
  await page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  expect((await page.locator('[role="menu"]').getAttribute('aria-label')) === want.ladder, `${tag} : l'échelle s'annonce « ${want.ladder} »`);
  const rungs = await page.locator('[role="menuitem"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(JSON.stringify(rungs) === JSON.stringify(want.rungs), `${tag} : les sept barreaux dans la langue (obtenu ${JSON.stringify(rungs)})`);

  if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `interface-${want.lang}-${locale}-${viewport.width}-${scheme}-menu.png`) });

  expect(
    JSON.stringify([...new Set(catalogs)]) === JSON.stringify([want.lang]),
    `${tag} : un seul catalogue téléchargé, « ${want.lang} » (obtenu ${JSON.stringify(catalogs)})`,
  );
  expect(errors.length === 0, `${tag} : aucune erreur de page (${errors.join(' | ')})`);

  await context.close();
}

const SCREENS = [
  { path: '/c/c-deploiement', ready: '[data-message]', label: 'le fil de la conversation' },
  { path: '/feed', ready: '[data-feed-card]', label: 'le fil d’actualité' },
];

async function measureScreens({ name, locale, stored, want }) {
  for (const screen of SCREENS) {
    const tag = `${name} · ${screen.label}`;
    const context = await newContextFor({ locale, stored }, VIEWPORTS[0], 'light');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'load' });
    await page.waitForSelector(screen.ready, { timeout: 10_000 });
    await page.waitForTimeout(300);
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir === want.dir, `${tag} : <html dir="${want.dir}"> (obtenu "${dir}")`);
    const overflow = await horizontalOverflow(page);
    expect(overflow.scroll <= overflow.client + 1, `${tag} : aucun défilement horizontal (${overflow.scroll} > ${overflow.client})`);
    if (screen.path === '/feed') await measureCarousel(page, tag, want);
    if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `direction-${want.lang}${screen.path.replaceAll('/', '-')}.png`) });
    expect(errors.length === 0, `${tag} : aucune erreur de page (${errors.join(' | ')})`);
    await context.close();
  }
}

async function measureCarousel(page, tag, want) {
  const card = '[data-feed-card-id="post-scenes-mixed"]';
  await page.locator(card).scrollIntoViewIfNeeded();
  await page.waitForSelector(`${card} [data-feed-carousel-arrow="forward"]`, { timeout: 10_000 });
  const placement = await page.evaluate((selector) => {
    const track = document.querySelector(`${selector} [data-feed-scene-track]`).getBoundingClientRect();
    const arrow = document.querySelector(`${selector} [data-feed-carousel-arrow="forward"]`).getBoundingClientRect();
    return { arrow: arrow.left + arrow.width / 2, track: track.left + track.width / 2 };
  }, card);
  const onLeft = placement.arrow < placement.track;
  expect(onLeft === (want.dir === 'rtl'), `${tag} : la flèche « suivant » est à ${want.dir === 'rtl' ? 'gauche' : 'droite'} du carrousel`);
  await page.locator(`${card} [data-feed-carousel-arrow="forward"]`).click();
  await page.waitForTimeout(900);
  const after = await page.evaluate((selector) => ({
    counter: document.querySelector(`${selector} [data-feed-media-counter]`)?.textContent?.replace(/\s+/g, '') ?? null,
    scrollLeft: document.querySelector(`${selector} [data-feed-scene-track]`).scrollLeft,
  }), card);
  expect(after.counter === '2/3', `${tag} : « suivant » avance le carrousel à 2 / 3 (obtenu "${after.counter}")`);
  expect(want.dir === 'rtl' ? after.scrollLeft < 0 : after.scrollLeft > 0, `${tag} : la piste défile dans le sens de lecture (scrollLeft ${after.scrollLeft})`);
}

try {
  for (const testCase of CASES) {
    console.log(`\n${testCase.name}`);
    await measure(testCase, VIEWPORTS[0], 'light');
  }
  console.log('\nGabarit étroit et schéma sombre — la langue la plus longue, et l’arabe');
  for (const testCase of [CASES[0], CASES[1]]) {
    await measure(testCase, VIEWPORTS[1], 'dark');
  }
  console.log('\nLe sens d’écriture sur les écrans de lecture — l’arabe et le français');
  for (const testCase of [CASES[1], CASES[2]]) {
    await measureScreens(testCase);
  }
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} échec(s) — la langue d'interface ne s'affiche pas comme résolue.`);
  process.exit(1);
}
console.log('\n✓ La langue d’interface résolue s’affiche réellement, et seul son catalogue est téléchargé.');
