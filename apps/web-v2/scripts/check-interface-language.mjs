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
 *  3. le bouton du menu, l'échelle et ses six barreaux s'annoncent dans cette
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
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = process.env.CAPTURE_DIR;
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
if (CAPTURES) await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

const GERMAN = {
  lang: 'de',
  title: 'Meine Links',
  subtitle: 'Lade ein, wen du willst, in deine Unterhaltungen',
  banner: 'Deine Links verwalten',
  back: 'Zurück zu den Unterhaltungen',
  /* Le bouton DIT le compte de la cloche (#6288) : les fixtures en servent
     trois non lues, et son nom le porte dans la langue d'interface. */
  menu: 'Menü, 3 ungelesene Mitteilungen',
  ladder: 'Meeshy-Navigation',
  /* Le barreau « Découvrir » DIT le compte des demandes reçues (#6321) : les
     fixtures en servent trois. */
  rungs: ['Meine Links', 'Mitteilungen, 3 ungelesen', 'Anrufe', 'Entdecken, 3 Anfragen erhalten', 'Communitys', 'Einstellungen'],
};

const ARABIC = {
  lang: 'ar',
  title: 'روابطي',
  subtitle: 'ادعُ من تشاء إلى محادثاتك',
  banner: 'إدارة روابطك',
  back: 'العودة إلى المحادثات',
  menu: 'القائمة، 3 إشعارات غير مقروءة',
  ladder: 'التنقل في Meeshy',
  rungs: ['روابطي', 'الإشعارات، 3 غير مقروءة', 'المكالمات', 'اكتشاف، 3 طلبات واردة', 'المجتمعات', 'الإعدادات'],
};

const FRENCH = {
  lang: 'fr',
  title: 'Mes liens',
  subtitle: 'Invitez qui vous voulez dans vos conversations',
  banner: 'Gérez vos liens',
  back: 'Revenir aux conversations',
  menu: 'Menu, 3 notifications non lues',
  ladder: 'Navigation Meeshy',
  rungs: ['Mes liens', 'Notifications, 3 non lues', 'Appels', 'Découvrir, 3 demandes reçues', 'Communautés', 'Réglages'],
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

async function measure({ name, locale, stored, want }, viewport, scheme) {
  const tag = `${name} · ${viewport.width}×${viewport.height} · ${scheme}`;
  const context = await browser.newContext({ viewport, locale, colorScheme: scheme });
  if (stored !== null) {
    await context.addInitScript((value) => {
      localStorage.setItem('meeshy.interface-language', value);
    }, stored);
  }
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

  expect((await page.evaluate(() => document.documentElement.lang)) === want.lang, `${tag} : <html lang="${want.lang}">`);
  expect((await page.locator('header h1').innerText()).trim() === want.title, `${tag} : titre « ${want.title} »`);
  expect((await page.getByText(want.banner, { exact: true }).count()) === 1, `${tag} : bannière du hub dans la langue`);
  expect((await page.getByText(want.subtitle, { exact: true }).count()) === 1, `${tag} : sous-titre de la bannière dans la langue`);
  expect(
    (await page.locator('header a').first().getAttribute('aria-label')) === want.back,
    `${tag} : le retour s'annonce « ${want.back} »`,
  );
  expect(
    (await page.locator('[data-floating-menu]').getAttribute('aria-label')) === want.menu,
    `${tag} : le bouton du menu s'annonce « ${want.menu} »`,
  );

  const reach = await page.evaluate(() => {
    const subtitle = document.querySelector('[data-links-banner] .text-caption');
    return [document.querySelector('header h1'), subtitle].map((el) => {
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
  for (const [index, label] of ['titre', 'sous-titre de la bannière'].entries()) {
    const r = reach[index];
    expect(r.found && r.reachable, `${tag} : ${label} atteignable à son centre`);
    expect(r.found && r.inside, `${tag} : ${label} ne déborde pas l'écran`);
  }

  if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `interface-${want.lang}-${locale}-${viewport.width}-${scheme}.png`) });

  await page.locator('[data-floating-menu]').click();
  await page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  expect((await page.locator('[role="menu"]').getAttribute('aria-label')) === want.ladder, `${tag} : l'échelle s'annonce « ${want.ladder} »`);
  const rungs = await page.locator('[role="menuitem"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(JSON.stringify(rungs) === JSON.stringify(want.rungs), `${tag} : les six barreaux dans la langue (obtenu ${JSON.stringify(rungs)})`);

  if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `interface-${want.lang}-${locale}-${viewport.width}-${scheme}-menu.png`) });

  expect(
    JSON.stringify([...new Set(catalogs)]) === JSON.stringify([want.lang]),
    `${tag} : un seul catalogue téléchargé, « ${want.lang} » (obtenu ${JSON.stringify(catalogs)})`,
  );
  expect(errors.length === 0, `${tag} : aucune erreur de page (${errors.join(' | ')})`);

  await context.close();
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
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} échec(s) — la langue d'interface ne s'affiche pas comme résolue.`);
  process.exit(1);
}
console.log('\n✓ La langue d’interface résolue s’affiche réellement, et seul son catalogue est téléchargé.');
