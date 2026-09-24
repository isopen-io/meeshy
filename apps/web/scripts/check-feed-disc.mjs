#!/usr/bin/env node
/**
 * LE DISQUE DU FLUX BASCULE, ET SON APPUI LONG OUVRE LES RÉELS (#6456).
 *
 * Les témoins `bun test` prouvent la LOI (route → destination du disque) et les
 * gestes sur un document de témoin, où l'adresse ne change pas et où rien ne se
 * dessine. Ce gate les rejoue dans un NAVIGATEUR, sur le `dist` construit
 * (source fixtures), dans les deux schémas et aux deux gabarits (390 × 844,
 * 320 × 568) :
 *
 *  1. sur la liste, le disque est un lien vers /feed nommé « Flux », décrit par
 *     l'indice de l'appui long, avec son raccourci clavier ; dans l'arbre
 *     d'accessibilité réel, l'indice n'est lu QUE comme cette description (#6499) ;
 *  2. un tap TREMBLÉ de 2 px ouvre le Flux ; le disque n'a jamais quitté le
 *     document et n'a pas bougé d'un pixel ; il se nomme alors
 *     « Conversations », mène à /, et porte la marque ;
 *  3. sur le Flux, le tap ramène à la liste ;
 *  4. un appui long de la souris ouvre /reels pendant l'appui, et le relâché
 *     n'empile RIEN d'autre ; la place mémorisée est intacte ; le retour
 *     retrouve le disque à sa place — sur la liste comme sur le Flux ;
 *  5. un appui long TACTILE ouvre /reels, et aucun menu contextuel du système
 *     n'est laissé passer ;
 *  6. un glisser tenu plus de 500 ms n'ouvre ni le Flux ni les Réels ; le
 *     disque suit le pointeur SANS retard ; il s'accroche au bord ; la place
 *     survit au rechargement ET à la bascule ;
 *  7. Maj+F10 sur le disque ouvre les Réels ;
 *  8. l'en-tête du Flux porte « Lancer les Réels » en haut à droite ;
 *  9. un réel ouvert depuis une carte du Flux ramène au Flux, à la même
 *     position de défilement ;
 * 10. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const HINT = 'Appui long pour lancer les Réels';
/** Au-delà de `LONG_PRESS_MS` (500), avec la marge d'un moteur chargé. */
const HOLD_MS = 750;
const DISC = '[data-floating-feed]';

/**
 * LES ENREGISTREURS, posés AVANT l'application à chaque document : les
 * adresses empilées (le site unique de `navigate`), le sort de chaque menu
 * contextuel, et chaque instant où le disque a quitté le document pendant une
 * bascule surveillée.
 */
const RECORDERS = () => {
  window.__nav = [];
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name].bind(history);
    history[name] = (state, title, url) => {
      const cible = new URL(String(url), location.href);
      window.__nav.push(`${name === 'pushState' ? 'push' : 'replace'} ${cible.pathname}${cible.search}`);
      return original(state, title, url);
    };
  }
  window.__ctx = [];
  addEventListener('contextmenu', (event) => {
    setTimeout(() => window.__ctx.push(event.defaultPrevented), 0);
  });
  /* Les clics qui ATTEIGNENT le document : un clic avalé à la fenêtre n'y
     arrive pas. Compté autour d'un appui long, c'est le clic du relâché qui
     retomberait sur l'écran suivant. */
  window.__clicks = 0;
  document.addEventListener('click', () => {
    window.__clicks += 1;
  });
  window.__watchDisc = false;
  window.__discGone = 0;
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      if (window.__watchDisc && document.querySelector('[data-floating-feed]') === null) window.__discGone += 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
};

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const pause = (page, ms) => page.waitForTimeout(ms);

const face = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const hintId = el.getAttribute('aria-describedby');
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      href: el.getAttribute('href'),
      label: el.getAttribute('aria-label'),
      face: el.getAttribute('data-disc-face'),
      hint: hintId === null ? null : (document.getElementById(hintId)?.textContent ?? null),
      keys: el.getAttribute('aria-keyshortcuts'),
      marque: el.querySelectorAll('svg line').length,
      glyphe: el.querySelectorAll('svg path').length,
      atteint: hit !== null && (hit === el || el.contains(hit)),
      left: r.left,
      top: r.top,
      width: r.width,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }, DISC);

let menusEmis = 0;
const clicks = (page) => page.evaluate(() => window.__clicks);
const path = (page) => page.evaluate(() => `${location.pathname}${location.search}`);
const navs = (page) => page.evaluate(() => [...window.__nav]);
const waitPath = (page, expected) =>
  page.waitForFunction((p) => location.pathname === p, expected, { timeout: 4000 }).then(() => true, () => false);
const stored = (page) => page.evaluate(() => localStorage.getItem('feedButtonPosition'));
const samePlace = (a, b) => a !== null && b !== null && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5;
const frame = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));

/**
 * L'INDICE DANS L'ARBRE D'ACCESSIBILITÉ RÉEL (#6499) — la DESCRIPTION du lien
 * nommé `name`, et le nombre de nœuds lisibles qui portent l'indice À PART.
 * Un `sr-only` passait le premier contrôle et échouait au second : VoiceOver et
 * TalkBack le lisaient seul au balayage.
 */
const axHint = async (cdp, name) => {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return {
    description: nodes.find((n) => n.role?.value === 'link' && n.name?.value === name)?.description?.value ?? null,
    seul: nodes.filter((n) => !n.ignored && n.role?.value !== 'link' && (n.name?.value ?? '').includes(HINT)).length,
  };
};

/** Le disque au repos : ni enfoncement `:active`, ni échelle de déplacement en cours. */
const settled = async (page) => {
  await page.waitForSelector(DISC);
  await pause(page, 260);
  return face(page);
};

/** Un tap au pointeur, tremblé de `tremble` px entre l'appui et le relâché. */
const tap = async (page, at, tremble = 0) => {
  await page.mouse.move(at.cx, at.cy);
  await page.mouse.down();
  if (tremble > 0) await page.mouse.move(at.cx + tremble, at.cy);
  await page.mouse.up();
};

const watchToggle = async (page, run) => {
  await page.evaluate(() => {
    window.__discGone = 0;
    window.__watchDisc = true;
  });
  await run();
  await pause(page, 300);
  return page.evaluate(() => {
    window.__watchDisc = false;
    return window.__discGone;
  });
};

const browser = await launchChromium();

for (const scheme of ['light', 'dark']) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const g = `${scheme} ${viewport.width}×${viewport.height}`;
    const context = await browser.newContext({ viewport, colorScheme: scheme, locale: 'fr-FR', hasTouch: true });
    await context.addInitScript(RECORDERS);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);

    // ------------------------------------------------ 1. la face « Flux »
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-row]');
    const repos = await settled(page);
    check(repos !== null, `${g} : aucun disque du Flux sur la liste`);
    if (repos === null) {
      await context.close();
      continue;
    }
    check(repos.href === '/feed' && repos.label === 'Flux' && repos.face === 'feed', `${g} : sur la liste, le disque ne se dit pas « Flux » vers /feed — ${JSON.stringify(repos)}`);
    check(repos.hint === HINT, `${g} : l'indice de l'appui long n'est pas annoncé — ${repos.hint}`);
    check(repos.keys === 'Shift+F10', `${g} : le raccourci clavier de l'appui long n'est pas déclaré — ${repos.keys}`);
    check(repos.glyphe > 0 && repos.marque === 0, `${g} : la face « Flux » ne porte pas le glyphe du Flux`);
    check(repos.atteint && repos.width >= 44, `${g} : le disque n'est pas atteignable à son centre, ou fait moins de 44`);
    const axListe = await axHint(cdp, 'Flux');
    check(axListe.description === HINT && axListe.seul === 0, `${g} : sur la liste, l'indice n'est pas la seule description du disque dans l'arbre d'accessibilité — ${JSON.stringify(axListe)}`);
    await capture(page, `disc-list.${scheme}.${viewport.width}x${viewport.height}`);

    // ------------------------------------ 2. tap tremblé ⇒ Flux, sans saut
    let avant = (await navs(page)).length;
    const disparitionsAller = await watchToggle(page, async () => {
      await tap(page, repos, 2);
      check(await waitPath(page, '/feed'), `${g} : un tap tremblé de 2 px n'ouvre pas le Flux`);
    });
    await page.waitForSelector('[data-feed-card]');
    const surFlux = await settled(page);
    check((await navs(page)).slice(avant).join('|') === 'push /feed', `${g} : le tap vers le Flux empile autre chose que /feed — ${(await navs(page)).slice(avant)}`);
    check(disparitionsAller === 0, `${g} : le disque a quitté le document pendant la bascule vers le Flux (${disparitionsAller})`);
    check(samePlace(repos, surFlux), `${g} : le disque a sauté à la bascule vers le Flux — ${JSON.stringify([repos, surFlux])}`);
    check(
      surFlux?.href === '/' && surFlux?.label === 'Conversations' && surFlux?.face === 'conversations' && surFlux?.marque === 3,
      `${g} : sur le Flux, le disque ne se dit pas « Conversations » vers / avec la marque — ${JSON.stringify(surFlux)}`,
    );
    check(surFlux?.hint === HINT, `${g} : sur le Flux, l'indice de l'appui long a disparu`);
    const axFlux = await axHint(cdp, 'Conversations');
    check(axFlux.description === HINT && axFlux.seul === 0, `${g} : sur le Flux, l'indice n'est pas la seule description du disque dans l'arbre d'accessibilité — ${JSON.stringify(axFlux)}`);
    await capture(page, `disc-feed.${scheme}.${viewport.width}x${viewport.height}`);

    // -------------------------------------------- 8. le bouton de l'en-tête
    const entete = await page.evaluate(() => {
      const el = document.querySelector('header [data-feed-reels]');
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('aria-label'), href: el.getAttribute('href'), right: r.right, top: r.top };
    });
    check(
      entete !== null && entete.href === '/reels' && entete.label === 'Lancer les Réels' && entete.right > viewport.width - 64,
      `${g} : l'en-tête du Flux ne porte pas « Lancer les Réels » en haut à droite — ${JSON.stringify(entete)}`,
    );

    // ------------------------------------------- 3. sur le Flux ⇒ la liste
    avant = (await navs(page)).length;
    const disparitionsRetour = await watchToggle(page, async () => {
      await tap(page, surFlux);
      check(await waitPath(page, '/'), `${g} : sur le Flux, le tap ne ramène pas à la liste`);
    });
    const deRetour = await settled(page);
    check((await navs(page)).slice(avant).join('|') === 'push /', `${g} : le tap vers la liste empile autre chose que / — ${(await navs(page)).slice(avant)}`);
    check(disparitionsRetour === 0, `${g} : le disque a quitté le document pendant la bascule vers la liste (${disparitionsRetour})`);
    check(samePlace(repos, deRetour) && deRetour?.label === 'Flux', `${g} : revenu sur la liste, le disque n'est pas « Flux » à sa place`);

    // --------------------------------- 4. appui long souris, liste puis Flux
    for (const [depart, retour] of [
      ['/', '/'],
      ['/feed', '/feed'],
    ]) {
      if (depart === '/feed') {
        await tap(page, await settled(page));
        await waitPath(page, '/feed');
      }
      const ici = await settled(page);
      avant = (await navs(page)).length;
      const clicsAvant = await clicks(page);
      await page.mouse.move(ici.cx, ici.cy);
      await page.mouse.down();
      await pause(page, HOLD_MS);
      check((await path(page)) === '/reels', `${g} : depuis ${depart}, l'appui long tenu n'ouvre pas les Réels — ${await path(page)}`);
      await page.mouse.up();
      await pause(page, 400);
      check((await clicks(page)) === clicsAvant, `${g} : depuis ${depart}, le clic du relâché de l'appui long souris a atteint l'écran des Réels`);
      check((await path(page)) === '/reels', `${g} : depuis ${depart}, le relâché de l'appui long a quitté les Réels — ${await path(page)}`);
      check((await navs(page)).slice(avant).join('|') === 'push /reels', `${g} : depuis ${depart}, l'appui long empile autre chose que /reels — ${(await navs(page)).slice(avant)}`);
      check((await page.$(DISC)) === null, `${g} : un disque flottant survit sur les Réels`);
      check((await stored(page)) === null, `${g} : l'appui long a déplacé le disque (${await stored(page)})`);
      if (depart === '/') await capture(page, `disc-longpress-reels.${scheme}.${viewport.width}x${viewport.height}`);
      await page.goBack();
      check(await waitPath(page, retour), `${g} : le retour depuis les Réels ne ramène pas à ${retour}`);
      const revenu = await settled(page);
      check(samePlace(repos, revenu), `${g} : de retour sur ${retour}, le disque n'est plus à sa place`);
    }
    await tap(page, await settled(page));
    await waitPath(page, '/');

    // ------------------------------------------ 5. appui long TACTILE
    const tactile = await settled(page);
    avant = (await navs(page)).length;
    await page.evaluate(() => {
      window.__ctx = [];
    });
    const clicsTactiles = await clicks(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(tactile.cx), y: Math.round(tactile.cy) }] });
    await pause(page, HOLD_MS + 250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(page, 450);
    check((await path(page)) === '/reels', `${g} : l'appui long tactile n'ouvre pas les Réels — ${await path(page)}`);
    check((await navs(page)).slice(avant).join('|') === 'push /reels', `${g} : l'appui long tactile empile autre chose que /reels — ${(await navs(page)).slice(avant)}`);
    check((await clicks(page)) === clicsTactiles, `${g} : le clic du relâché tactile a atteint l'écran des Réels (la scène met la lecture en pause)`);
    /* Chromium sans tête n'émet pas toujours de menu contextuel pour un appui
       tactile synthétique : la liste peut être VIDE, et `[].every` est vrai.
       Le compte est donc publié au bilan, jamais tu ; la loi est prouvée par
       `floating-menus.test.tsx`, et sur la coque Android. */
    const menus = await page.evaluate(() => [...window.__ctx]);
    menusEmis += menus.length;
    check(menus.every((prevented) => prevented), `${g} : un menu contextuel du système a été laissé passer pendant l'appui long tactile — ${JSON.stringify(menus)}`);
    await page.goBack();
    await waitPath(page, '/');

    // ------------------------------------------------ 7. Maj+F10
    await page.waitForSelector(DISC);
    avant = (await navs(page)).length;
    await page.focus(DISC);
    await page.keyboard.press('Shift+F10');
    check(await waitPath(page, '/reels'), `${g} : Maj+F10 sur le disque n'ouvre pas les Réels`);
    check((await navs(page)).slice(avant).join('|') === 'push /reels', `${g} : Maj+F10 empile autre chose que /reels`);
    await page.goBack();
    await waitPath(page, '/');

    // ---------------------------------- 6. glisser : rien ne s'ouvre, il suit
    const depart = await settled(page);
    avant = (await navs(page)).length;
    await page.mouse.move(depart.cx, depart.cy);
    await page.mouse.down();
    await page.mouse.move(depart.cx + 12, depart.cy + 12, { steps: 3 });
    await pause(page, HOLD_MS);
    const cible = { x: viewport.width - 70, y: depart.cy + 140 };
    await page.mouse.move(cible.x, cible.y, { steps: 10 });
    await frame(page);
    const enCourse = await face(page);
    check(
      enCourse !== null && Math.abs(enCourse.cx - cible.x) < 1.5 && Math.abs(enCourse.cy - cible.y) < 1.5,
      `${g} : pendant le glisser, le disque ne suit pas le pointeur sans retard — ${JSON.stringify(enCourse && { cx: enCourse.cx, cy: enCourse.cy })} ≠ ${JSON.stringify(cible)}`,
    );
    await page.mouse.up();
    await pause(page, 400);
    check((await path(page)) === '/', `${g} : un glisser tenu plus de 500 ms a ouvert ${await path(page)}`);
    check((await navs(page)).length === avant, `${g} : un glisser a empilé une adresse — ${(await navs(page)).slice(avant)}`);
    const pose = await settled(page);
    const memoire = await stored(page);
    check(memoire !== null && memoire.startsWith('1,'), `${g} : le glisser vers la droite ne s'accroche pas au bord droit (${memoire})`);
    check(pose !== null && pose.left + pose.width > viewport.width - 40, `${g} : posé, le disque n'est pas au bord droit — ${JSON.stringify(pose)}`);

    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-row]');
    const recharge = await settled(page);
    check(samePlace(pose, recharge), `${g} : le rechargement ne retrouve pas la place du disque — ${JSON.stringify([pose, recharge])}`);

    await tap(page, recharge);
    await waitPath(page, '/feed');
    const deplaceSurFlux = await settled(page);
    check(samePlace(pose, deplaceSurFlux), `${g} : la bascule vers le Flux a ramené le disque déplacé à sa place par défaut`);
    await capture(page, `disc-feed-moved.${scheme}.${viewport.width}x${viewport.height}`);

    // ---------------------- 9. un réel ouvert depuis le Flux ramène au Flux
    await page.evaluate(() => localStorage.removeItem('feedButtonPosition'));
    await page.waitForSelector('[data-feed-card="reel"]');
    const avantReel = await page.evaluate(() => {
      const carte = document.querySelector('[data-feed-card="reel"]');
      carte?.scrollIntoView({ block: 'center' });
      return new Promise((ok) => setTimeout(() => ok(document.getElementById('contenu')?.scrollTop ?? null), 400));
    });
    check(avantReel !== null && avantReel > 0, `${g} : la carte de réel du Flux n'a demandé aucun défilement (${avantReel}) — le témoin de position ne peut pas tomber`);
    await page.evaluate(() => document.querySelector('[data-feed-card="reel"] a[href^="/reels?seed="]')?.click());
    check(await waitPath(page, '/reels'), `${g} : toucher la carte de réel n'ouvre pas les Réels`);
    await pause(page, 300);
    await page.goBack();
    check(await waitPath(page, '/feed'), `${g} : le retour depuis un réel de carte ne ramène pas au Flux`);
    await page.waitForSelector('[data-feed-card]');
    await pause(page, 400);
    const apresReel = await page.evaluate(() => document.getElementById('contenu')?.scrollTop ?? null);
    check(
      avantReel !== null && apresReel !== null && Math.abs(apresReel - avantReel) <= 2,
      `${g} : de retour d'un réel, le Flux n'est plus à la même position (${apresReel} ≠ ${avantReel})`,
    );
    check((await face(page))?.face === 'conversations', `${g} : de retour d'un réel sur le Flux, le disque ne ramène plus aux conversations`);

    const debordement = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!debordement, `${g} : la page défile horizontalement`);
    check(errors.length === 0, `${g} : erreurs de page — ${errors.join(' | ')}`);

    await context.close();
  }
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-feed-disc : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-feed-disc : vert — ${invariants} invariants, 2 schémas × 2 gabarits : la bascule Flux ↔ conversations sans saut, ` +
    'l’appui long (souris, doigt, Maj+F10) vers les Réels sans navigation ni clic au relâché, le glisser qui n’ouvre rien et suit sans retard, ' +
    `la place au rechargement, le retour d’un réel au même défilement (${menusEmis} menu(s) contextuel(s) émis par Chromium, tous avalés).`,
);
