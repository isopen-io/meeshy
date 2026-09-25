#!/usr/bin/env node
/**
 * LES RÉGLAGES ONT UN EFFET (#5563) — le gate du critère de fin, dans un VRAI
 * navigateur, sur le document PRODUIT (`dist/`, source `fixtures`).
 *
 * Un témoin unitaire prouve qu'une section se DESSINE ; il ne prouve ni que la
 * classe du schéma change sans rechargement, ni que la langue d'interface se
 * repose sur l'écran monté, ni qu'une bascule se retourne au rendu qui suit le
 * geste, ni que la déconnexion efface la session. Ce gate mesure, pour chaque
 * schéma × gabarit (390 × 844, 320 × 568) :
 *
 *  1. l'écran d'attente a disparu ; les sections d'iOS sont là ; six bascules ;
 *     aucune entrée non portée n'est offerte — le legacy est décommissionné
 *     (#6702) — et aucun contrôle ne vise une autre origine : la suppression
 *     de compte ouvre sa page de la v2, dans le même onglet (#6715) ;
 *  2. chaque contrôle et chaque texte s'atteignent à leur centre (au repos et
 *     amenés au milieu), et chaque contrôle fait au moins 44 px ; aucun
 *     débordement horizontal ;
 *  3. chaque texte tient AA ;
 *  4. le THÈME bascule à chaud, persiste au rechargement, et « Auto » rend la
 *     main au système ;
 *  5. une BASCULE se retourne aussitôt et le reste après la « réponse » ;
 *     hors ligne, aucune bascule n'est actionnable, et le thème reste actif ;
 *  6. la LANGUE D'INTERFACE se pose sans rechargement, et « Automatique » suit
 *     le navigateur ;
 *  7. la DÉCONNEXION demande confirmation, efface la session, prévient la
 *     passerelle, et mène à l'écran de connexion.
 *
 * Les textes attendus sont RECOPIÉS ici, à dessein : un attendu relu dans le
 * catalogue serait vert sur un catalogue faux. `CAPTURE_DIR=<dossier>` écrit
 * une capture par étape, schéma et gabarit.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { reachAtRest, resumeExclusions } from './lib/reach-at-rest.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const WCAG_AA = 4.5;
const SCHEME_KEY = 'meeshy.scheme';
const LANGUAGE_KEY = 'meeshy.interface-language';
const SESSION_KEY = 'meeshy.session';

/** Une session de RECETTE — un jeton factice, jamais un vrai crédential. */
const RECIPE_SESSION = JSON.stringify({
  token: 'jeton-de-recette',
  sessionToken: 'session-de-recette',
  user: { id: '64b7f0c2a1e4d5f6a7b8c9d0', username: 'awa', displayName: 'Awa Diallo', systemLanguage: 'fr', regionalLanguage: 'en' },
  expiresAt: Date.now() + 86_400_000,
});

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);

/**
 * LES CIBLES DU RELEVÉ AU REPOS — la mesure elle-même vit dans
 * `lib/reach-at-rest.mjs`, SITE UNIQUE depuis #7040.
 *
 * Ce fichier en portait une copie, comme six autres gates. Toutes ouvraient sur
 * un `visible()` qui RENVOYAIT UN TABLEAU VIDE pour un élément dont le centre
 * sortait du viewport : un contrôle hors cadre ne cassait rien, n'apparaissait
 * nulle part, et le gate restait vert avec un contrôle de moins. Un tel élément
 * est désormais MESURÉ et rendu `ok: false` — et ce qui est légitimement hors
 * cadre (écrêté par un conteneur, déclaré `inert`/`aria-hidden`) s'écarte sous
 * une raison ÉCRITE, comptée par `resumeExclusions()`.
 */
const REACH = {
  controls: 'header a, #contenu a, #contenu button, #contenu select',
  texts: '#contenu h2, #contenu .text-body, #contenu .text-caption',
};

/** Chaque contrôle du contenu, amené au milieu de l'écran puis mesuré. */
const reachScrolled = async (page) => {
  const selector = '#contenu a, #contenu button, #contenu select';
  const count = await page.$$eval(selector, (els) => els.length);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      await page.evaluate(
        async ({ s, n }) => {
          const el = document.querySelectorAll(s)[n];
          el.scrollIntoView({ block: 'center' });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            nom: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
            ok: hit !== null && (hit === el || el.contains(hit)),
            hauteur: r.height,
          };
        },
        { s: selector, n: i },
      ),
    );
  }
  await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
  return out;
};

const htmlClass = (page) => page.evaluate(() => (document.documentElement.classList.contains('light') ? 'light' : 'dark'));
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const marked = (page) => page.evaluate(() => window.__reglagesSansRechargement === true);
const mark = (page) => page.evaluate(() => {
  window.__reglagesSansRechargement = true;
});
const within = (page, predicate, arg) =>
  page.waitForFunction(predicate, arg, { timeout: 1000 }).then(
    () => true,
    () => false,
  );

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const suffix = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      await context.addInitScript(
        ({ key, value }) => {
          if (sessionStorage.getItem('recette-semee') === null) {
            localStorage.setItem(key, value);
            sessionStorage.setItem('recette-semee', '1');
          }
        },
        { key: SESSION_KEY, value: RECIPE_SESSION },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const logoutCalls = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/v1/auth/logout')) logoutCalls.push(request.method());
      });

      // ------------------------------------------------ 1. les réglages, et plus l'écran d'attente
      await page.goto(`${BASE}/settings`, { waitUntil: 'load' });
      await page.waitForSelector('[data-settings-profile]');
      await page.waitForSelector('section[aria-labelledby="settings-privacy"] [role="switch"]');
      await page.waitForTimeout(300);
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      check((await textOf(page, 'h1')) === 'Réglages', `${label} : le titre (« ${await textOf(page, 'h1')} »)`);
      const sections = await page.$$eval('#contenu section h2', (els) => els.map((el) => (el.textContent ?? '').trim()));
      check(
        ['COMPTE', 'CONFIDENTIALITÉ', 'APPARENCE', 'NOTIFICATIONS', 'DONNÉES', 'OUTILS', 'À PROPOS'].every((title) => sections.includes(title)),
        `${label} : les sections d'iOS, « Données » comprise depuis que l'export y mène (#6725) (${JSON.stringify(sections)})`,
      );
      check((await page.$$('[role="switch"]')).length === 6, `${label} : six bascules que la passerelle obéit`);
      check(((await textOf(page, '[data-settings-profile]')) ?? '').includes('@awa'), `${label} : la carte de profil porte la session`);
      // Le legacy est décommissionné (#6702) : une entrée non portée est MASQUÉE,
      // jamais marquée. La suppression de compte mène à SA page de la v2
      // (#6715), sur la même origine et dans le même onglet : plus AUCUN
      // contrôle des réglages ne vise une autre origine.
      const links = await page.$$eval('#contenu a[href]', (els) =>
        els.map((el) => ({ href: el.getAttribute('href') ?? '', target: el.getAttribute('target') })),
      );
      const external = links.filter((l) => /^(?:[a-z]+:)?\/\//i.test(l.href));
      check(external.length === 0, `${label} : aucun contrôle ne vise une autre origine — ${JSON.stringify(external)}`);
      const deletion = links.filter((l) => l.href === '/account/deletion');
      check(
        deletion.length === 1 && deletion[0].target === null,
        `${label} : la suppression de compte ouvre sa page de la v2, dans le même onglet — ${JSON.stringify(deletion)}`,
      );
      const dataExport = links.filter((l) => l.href === '/settings/data-export');
      check(
        dataExport.length === 1 && dataExport[0].target === null,
        `${label} : l'export de données ouvre sa page de la v2, dans le même onglet (#6725) — ${JSON.stringify(dataExport)}`,
      );
      check((await textOf(page, '[data-settings-version]')) === VERSION, `${label} : la version servie est celle du paquet (${VERSION})`);
      await capture(page, `reglages-${suffix}`);

      // ------------------------------------------------ 2. atteignabilité
      const corridor = await page.evaluate(() => {
        const discs = [...document.querySelectorAll('.floating-menus button, .floating-menus a')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        const card = document.querySelector('[data-settings-profile]')?.getBoundingClientRect() ?? null;
        const discBottom = Math.max(0, ...discs.map((r) => r.bottom));
        return { discs: discs.length, discBottom, cardTop: card?.top ?? null };
      });
      check(
        corridor.discs >= 2 && corridor.cardTop !== null && corridor.cardTop >= corridor.discBottom,
        `${label} : au repos, la carte de profil commence sous les disques flottants — ${JSON.stringify(corridor)}`,
      );
      const rest = await reachAtRest(page, REACH);
      const blocked = rest.controls.filter((c) => !c.ok);
      check(rest.controls.length >= 3, `${label} : des contrôles mesurés au repos (${rest.controls.length}, ${resumeExclusions(rest)})`);
      check(blocked.length === 0, `${label} : aucun contrôle n'est volé à son centre au repos — ${JSON.stringify(blocked)}`);
      const stolen = rest.texts.filter((t) => !t.ok);
      check(rest.texts.length >= 4 && stolen.length === 0, `${label} : aucun texte n'est volé à son centre au repos (${rest.texts.length}) — ${JSON.stringify(stolen)}`);
      const scrolled = await reachScrolled(page);
      const unreachable = scrolled.filter((c) => !c.ok || c.hauteur < TAP_FLOOR);
      // Dix-huit contrôles au moins depuis le retour de l'export de données (#6725) : profil 1,
      // compte 1, confidentialité 4, apparence 5, notifications 2, données 1, outils 1, à propos 2,
      // déconnexion 1. Médias et messages restent masqués (#6723, #6724).
      check(scrolled.length >= 18 && unreachable.length === 0, `${label} : chaque contrôle s'atteint et fait ${TAP_FLOOR} px (${scrolled.length}) — ${JSON.stringify(unreachable)}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(overflow <= 0, `${label} : aucun débordement horizontal (${overflow} px)`);

      // ------------------------------------------------ 3. contraste AA
      const inks = {
        titreSection: await contrastOf(page, '#settings-account'),
        libelle: await contrastOf(page, 'section[aria-labelledby="settings-privacy"] .text-body'),
        legende: await contrastOf(page, 'section[aria-labelledby="settings-privacy"] .text-caption'),
        identifiant: await contrastOf(page, '[data-settings-profile] .text-caption'),
        themeChoisi: await contrastOf(page, '[data-theme-choice][aria-pressed="true"]'),
        themeLibre: await contrastOf(page, '[data-theme-choice][aria-pressed="false"]'),
        langue: await contrastOf(page, '[data-interface-language]'),
        version: await contrastOf(page, '[data-settings-version]'),
        deconnexion: await contrastOf(page, '[data-settings-logout]'),
      };
      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte des réglages tient AA — ${JSON.stringify(inks)}`);

      // ------------------------------------------------ 4. le thème, à chaud et persisté
      await mark(page);
      const opposite = scheme === 'light' ? 'dark' : 'light';
      await page.click(`[data-theme-choice="${opposite}"]`);
      check(await within(page, (s) => document.documentElement.classList.contains(s), opposite), `${label} : « ${opposite} » se peint au rendu qui suit le geste`);
      check((await stored(page, SCHEME_KEY)) === opposite, `${label} : le choix est persisté`);
      check(await marked(page), `${label} : sans rechargement`);
      await capture(page, `reglages-theme-${suffix}`);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('[data-theme-choice]');
      check((await htmlClass(page)) === opposite, `${label} : le thème choisi survit au rechargement`);
      check((await page.getAttribute(`[data-theme-choice="${opposite}"]`, 'aria-pressed')) === 'true', `${label} : et s'annonce choisi`);
      await page.click('[data-theme-choice="system"]');
      check(await within(page, (s) => document.documentElement.classList.contains(s), scheme), `${label} : « Auto » rend la main au système (${scheme})`);
      check((await stored(page, SCHEME_KEY)) === null, `${label} : « Auto » retire le choix stocké`);

      // ------------------------------------------------ 5. une bascule, optimiste ; hors ligne
      await page.waitForSelector('[data-setting="showOnlineStatus"]');
      const before = await page.getAttribute('[data-setting="showOnlineStatus"]', 'aria-checked');
      await page.click('[data-setting="showOnlineStatus"]');
      const flipped = before === 'true' ? 'false' : 'true';
      check(
        await within(page, (v) => document.querySelector('[data-setting="showOnlineStatus"]')?.getAttribute('aria-checked') === v, flipped),
        `${label} : la bascule se retourne aussitôt (${before} → ${flipped})`,
      );
      await page.waitForTimeout(400);
      check((await page.getAttribute('[data-setting="showOnlineStatus"]', 'aria-checked')) === flipped, `${label} : et le reste après la réponse`);
      await page.click('[data-setting="showOnlineStatus"]');
      await page.waitForTimeout(300);

      await context.setOffline(true);
      await page.waitForSelector('[data-settings-offline]');
      check((await page.$$eval('[role="switch"]', (els) => els.filter((el) => !el.disabled).length)) === 0, `${label} : hors ligne, aucune bascule n'est actionnable`);
      await page.click(`[data-theme-choice="${opposite}"]`);
      check(await within(page, (s) => document.documentElement.classList.contains(s), opposite), `${label} : hors ligne, le thème bascule quand même`);
      await capture(page, `reglages-hors-ligne-${suffix}`);
      await page.click('[data-theme-choice="system"]');
      await context.setOffline(false);
      await page.waitForFunction(() => document.querySelector('[data-settings-offline]') === null);

      // ------------------------------------------------ 6. la langue de l'interface, à chaud
      await mark(page);
      await page.selectOption('[data-interface-language]', 'en');
      check(await within(page, () => document.querySelector('h1')?.textContent === 'Settings'), `${label} : l'anglais se pose sur l'écran monté (« ${await textOf(page, 'h1')} »)`);
      check((await page.evaluate(() => document.documentElement.lang)) === 'en', `${label} : <html lang> suit`);
      check((await stored(page, LANGUAGE_KEY)) === 'en', `${label} : le choix est persisté`);
      check(await marked(page), `${label} : sans rechargement`);
      check((await page.$eval('[data-interface-language]', (el) => el.value)) === 'en', `${label} : la liste annonce le choix`);
      await capture(page, `reglages-anglais-${suffix}`);
      await page.selectOption('[data-interface-language]', '');
      check(await within(page, () => document.querySelector('h1')?.textContent === 'Réglages'), `${label} : « Automatique » suit le navigateur (fr-FR)`);
      check((await stored(page, LANGUAGE_KEY)) === null, `${label} : « Automatique » retire le choix stocké`);

      // ------------------------------------------------ 7. la déconnexion
      // Prise UNIQUE (revue-correction #6149, issue #7858) : `ConfirmDialog`,
      // partagée avec Découvrir › Débloquer et Mes liens › Supprimer.
      await page.click('[data-settings-logout]');
      await page.waitForSelector('dialog[open][data-confirm-dialog="logout"]');
      await capture(page, `reglages-deconnexion-${suffix}`);
      const clipped = await page.$$eval('dialog[open] button', (els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => (el.textContent ?? '').trim()),
      );
      check(clipped.length === 0, `${label} : aucun bouton de la confirmation ne tronque son libellé — ${JSON.stringify(clipped)}`);
      await page.click('[data-confirm-dialog="logout"] [data-confirm="cancel"]');
      await page.waitForFunction(() => document.querySelector('dialog[open]') === null);
      check((await stored(page, SESSION_KEY)) !== null, `${label} : « Annuler » ne déconnecte pas`);
      await page.click('[data-settings-logout]');
      await page.waitForSelector('dialog[open][data-confirm-dialog="logout"]');
      await page.click('[data-confirm-dialog="logout"] [data-confirm="confirm"]');
      await page.waitForURL(/\/login$/);
      check((await stored(page, SESSION_KEY)) === null, `${label} : la session est effacée`);
      check(logoutCalls.includes('POST'), `${label} : la passerelle est prévenue (POST /api/v1/auth/logout)`);

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Les réglages ont un effet : thème et langue à chaud, bascules optimistes, suppression de compte sur la v2, déconnexion réelle.\n');
