#!/usr/bin/env node
/**
 * LES RÉELS SE REGARDENT (#6457).
 *
 * Les témoins `bun test` prouvent les LOIS : l'ordre du fil (graine en tête,
 * suite servie derrière), la fenêtre de lecture, le port de la passerelle, les
 * gestes partagés par le Flux et les Réels, et qu'aucun lecteur ne survit au
 * démontage. Aucun ne traverse le NAVIGATEUR : un défilement qui ne s'accroche
 * pas, deux vidéos qui jouent ensemble, un squelette peint devant un réel déjà
 * en cache, un texte blanc illisible sur une image claire, un retour qui ne
 * quitte pas l'écran. Ce gate les mesure sur le `dist` construit (source
 * fixtures), dans les DEUX schémas et aux deux gabarits (390 × 844, 320 × 568) :
 *
 *  1. le Flux porte « Lancer les Réels » en haut à droite, atteignable, et une
 *     carte de réel ;
 *  2. toucher la carte ouvre `/reels?seed=<id>` SUR ce réel, peint depuis le
 *     cache : aucun squelette, aucun disque flottant ;
 *  3. le réel visible JOUE, et lui seul ; au plus trois lecteurs montés ;
 *  4. un balayage tactile vers le haut accroche le réel SUIVANT (un arrêt par
 *     réel), vers le bas le PRÉCÉDENT, sans tâche longue ; la lecture suit ;
 *  5. les flèches du clavier valent le balayage ;
 *  6. « J'aime » bascule au geste, et le Flux le montre au retour ;
 *  7. auteur, légende et compteurs tiennent AA AU PIXEL sur l'image la plus
 *     claire ; chaque contrôle fait 44 et reste atteignable ;
 *  8. hors ligne, les réels restent et l'écran le dit ;
 *  9. le retour du navigateur quitte les Réels et ne laisse AUCUN lecteur ;
 *     le bouton retour aussi, en reculant (#6498) ;
 * 10. un lien profond `?seed=` démarre sur son réel, une seule fois ; la
 *     première tabulation atteint « Retour » ; ouvert après une page tierce,
 *     son bouton retour mène au Flux, jamais hors de Meeshy (#6498) ;
 * 11. à cache froid hors ligne, la coupure est dite — ni squelette, ni silence ;
 * 12. sous `prefers-reduced-motion`, le clavier déplace sans animation ;
 * 13. aucune erreur de page, aucun défilement horizontal.
 * 14. un réel COMPOSÉ (#6903) se rejoue comme sa scène : `[data-scene-player]`
 *     centré, jamais un `<video data-reel-media>` brut, muet à l'ouverture
 *     (aucune activation) mais une lecture MUETTE qui AVANCE, le muet dit UNE
 *     fois (sur le rail, jamais une pastille de moteur en plus), le tap et la
 *     barre sur la PAGE et non dans la boîte 9:16, et aucun lecteur ni piste
 *     de son de fond ne survit au retour.
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
const served = await startDistServer(DIST);
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
const SEED = 'reel-portrait';
const DEEP_SEED = 'reel-sunset-en';
/** Le réel COMPOSÉ (#6903, `fixtures-reels.ts#REEL_SCENE_LOOP`) — DERNIER du
 * corpus, jamais rencontré par les sections 1-13 dans leur fenêtre. */
const SCENE_SEED = 'reel-scene-loop';
/** Une tâche longue au-delà de ce seuil pendant un balayage est une image perdue visible. */
const LONG_TASK_MS = 120;

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const activeIndex = (page) => page.evaluate(() => Number(document.querySelector('[data-reel-mode="active"]')?.getAttribute('data-reel-index') ?? -1));

/**
 * Le défileur est-il ACCROCHÉ sur la page ATTENDUE, et immobile ? Attendre
 * « accroché » sans la page visée rendait vrai AVANT que le défilement ne parte
 * (mesuré : la position 0 est déjà un multiple de la hauteur). Un délai dépassé
 * n'est pas une erreur : la page réellement atteinte est ce que le témoin juge.
 */
const settle = async (page, expected) => {
  /* Une boucle côté Node, jamais `waitForFunction` : un prédicat qui rend une
     PROMESSE y est jugé sur l'objet promesse — toujours vrai — et l'attente
     rendait la main en plein défilement (mesuré : 634 px sur 844). */
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const landed = await page.evaluate(
      (target) =>
        new Promise((resolve) => {
          const el = document.querySelector('[data-reels-pager]');
          if (el === null) return resolve(false);
          const first = el.scrollTop;
          /* Immobile sur ~100 ms, pas sur deux images : la queue d'un
             défilement doux avance de moins d'un pixel par image. */
          setTimeout(() => resolve(Math.abs(el.scrollTop - first) < 0.5 && Math.abs(el.scrollTop - target * el.clientHeight) < 0.5), 100);
        }),
      expected,
    );
    if (landed) return;
  }
};

/** Les lecteurs DE RÉEL montés et ceux qui JOUENT, par page.
 *
 * RESTREINT à `[data-reel-index]` (#6807) — la requête balayait TOUT le
 * document. L'invariante 9 (« le retour du navigateur quitte les Réels et ne
 * laisse AUCUN lecteur ») s'évalue APRÈS un `goBack()` vers le Flux : elle
 * comptait donc les médias du FIL, l'écran même où l'on vient d'atterrir.
 *
 * Elle était juste tant qu'aucune carte du fil ne montait de `<video>` ni
 * d'`<audio>` — ce qui a cessé d'être vrai avec #6807. Les quatre
 * déclinaisons ont rougi sur `page: -1`, la valeur de repli de `closest()`,
 * qui DISAIT déjà que ces éléments n'appartenaient à aucun réel : le gate
 * portait son propre diagnostic dans son message d'échec.
 *
 * La restriction ne relâche rien. L'invariante 3 — « lui seul joue », « au
 * plus trois lecteurs montés » — parle des lecteurs de RÉEL, et c'est
 * exactement ce qui est compté maintenant ; un média du fil n'y entrait que
 * par accident de sélecteur. */
const players = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-reel-index] video, [data-reel-index] audio')].map((m) => ({
      page: Number(m.closest('[data-reel-index]')?.getAttribute('data-reel-index') ?? -1),
      playing: !m.paused && !m.ended,
    })),
  );

const waitPlaying = (page, index) =>
  page
    .waitForFunction(
      (i) => {
        const m = document.querySelector(`[data-reel-index="${i}"] video, [data-reel-index="${i}"] audio`);
        return m !== null && !m.paused && m.currentTime > 0;
      },
      index,
      { timeout: 6000 },
    )
    .then(() => true, () => false);

/**
 * Un balayage TACTILE réel, LANCÉ comme un pouce le lance (`preventFling:
 * false`) : le compositeur, l'inertie et l'accroche du navigateur. Le trajet ne
 * couvre qu'un tiers de page — c'est l'élan qui doit porter au réel suivant, et
 * `scroll-snap-stop: always` qui doit l'y ARRÊTER (mesuré : sans élan, un tiers
 * de page revient en place ; avec élan, exactement une page).
 */
/**
 * UN BALAYAGE TACTILE — sans FLING (correction 2026-09-14).
 *
 * `preventFling: false` confiait la course au compositeur : le doigt lance, la
 * physique finit. En local la page atterrissait à 568 ; **en CI le défileur ne
 * bougeait pas d'un pixel** (`top: 0`), et douze invariants tombaient en
 * accusant l'application.
 *
 * Un fling a besoin du fil compositeur, que le runner sans GPU ne sert pas de
 * la même façon. Or l'invariant mesuré n'est pas la physique du geste : c'est
 * « un arrêt par réel ». `preventFling: true` parcourt la distance demandée de
 * façon déterministe, et laisse `scroll-snap` faire son travail — ce qui est
 * exactement ce que le témoin juge.
 *
 * ## La distance, elle, n'était pas anodine — et c'est la vraie cause
 *
 * 35 % de la hauteur est SOUS le point de bascule de `scroll-snap`, qui est la
 * moitié. Sans fling, le défileur parcourait 299 px sur 844 puis **revenait en
 * arrière** : « accroche le réel suivant (0) », mesuré en local une fois le
 * fling retiré. Avec fling, l'élan franchissait la moitié — le témoin passait
 * pour une raison qui ne lui appartenait pas, et tombait dès que le compositeur
 * ne servait plus l'élan.
 *
 * 60 % dépasse le point de bascule de façon DÉTERMINISTE. Le geste devient
 * décisif au lieu d'être emporté, ce qui est précisément ce que l'invariant
 * « un arrêt par réel » veut éprouver.
 *
 * Rend le déplacement RÉELLEMENT obtenu, pour que l'appelant puisse distinguer
 * « l'application n'accroche pas » de « le geste n'est jamais parti ».
 */
const pagerTop = (page) => page.evaluate(() => document.querySelector('[data-reels-pager]')?.scrollTop ?? -1);

/** Le geste de haut niveau : un doigt, une course, la physique du navigateur. */
const gestureSynthetise = async (cdp, { width, height }, distance, direction) =>
  cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(width / 3),
    y: Math.round(height / 2),
    xDistance: 0,
    yDistance: direction === 'next' ? -distance : distance,
    speed: 3000,
    gestureSourceType: 'touch',
    preventFling: true,
  });

/**
 * LE MÊME GESTE, ÉVÉNEMENT PAR ÉVÉNEMENT — `Input.dispatchTouchEvent`.
 *
 * `synthesizeScrollGesture` passe par le pipeline de gestes du navigateur, que
 * certains hôtes headless ne servent pas. Les événements bruts, eux, entrent
 * par la voie ordinaire : ce que reçoit la page est indiscernable d'un vrai
 * doigt, et c'est exactement ce que l'invariant veut éprouver.
 */
const gestureBrut = async (cdp, { width, height }, distance, direction) => {
  const x = Math.round(width / 3);
  const depart = direction === 'next' ? Math.round(height * 0.75) : Math.round(height * 0.2);
  const signe = direction === 'next' ? -1 : 1;
  const pas = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: depart }] });
  for (let i = 1; i <= pas; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: Math.round(depart + (signe * distance * i) / pas) }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * UN BALAYAGE TACTILE, en CASCADE QUI SE DÉCLARE (2026-09-14).
 *
 * ## Ce que la CI a appris, en deux exécutions
 *
 * `preventFling: false` confiait la course au compositeur : en local la page
 * atterrissait, **en CI le défileur ne bougeait pas d'un pixel**, et douze
 * invariants tombaient en accusant l'application. Le témoin de déplacement
 * ajouté ici a rendu le verdict sans ambiguïté — `déplace le défileur (0 → 0)`
 * sur les quatre peaux : le geste n'arrivait pas.
 *
 * Retirer le fling a aussi révélé une seconde faute, indépendante : 35 % de la
 * hauteur est SOUS le point de bascule de `scroll-snap`, donc le défileur
 * revenait. L'élan franchissait cette moitié — le témoin passait pour une
 * raison qui ne lui appartenait pas. La course est désormais de 60 %.
 *
 * ## La cascade, et pourquoi elle ne ment pas
 *
 * Deux voies, de la plus fidèle à la plus basique, et la SORTIE dit laquelle a
 * porté. Un repli silencieux aurait rendu le gate vert sur un hôte incapable de
 * livrer un geste — le pire des verts, celui qui tient par un motif étranger à
 * ce qu'il affirme.
 */
const swipe = async (cdp, page, { width, height }, direction) => {
  const avant = await pagerTop(page);
  const distance = Math.round(height * 0.6);

  await gestureSynthetise(cdp, { width, height }, distance, direction);
  let apres = await pagerTop(page);
  let voie = 'geste';

  if (apres === avant) {
    await gestureBrut(cdp, { width, height }, distance, direction);
    apres = await pagerTop(page);
    voie = 'événements tactiles';
  }

  return { avant, apres, voie, bouge: avant !== apres };
};

/** Au centre, chaque contrôle retombe sur lui-même, et fait 44. */
const reach = (page, selector) =>
  page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight) return [];
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return [{ nom: el.getAttribute('aria-label') ?? el.getAttribute('data-reel-gesture') ?? el.tagName, ok: hit !== null && (hit === el || el.contains(hit)), w: Math.round(r.width), h: Math.round(r.height) }];
    });
  }, selector);

/**
 * LE CONTRASTE AU PIXEL — le texte est rendu TRANSPARENT (ombre comprise), la
 * zone qu'il occupe est photographiée, et le pixel le plus CLAIR du fond sert de
 * pire cas pour le blanc. Une couleur calculée ne voit ni l'image ni le voile.
 */
const pixelContrast = async (page, selector) => {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    el.setAttribute('data-contrast-probe', '');
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - r.left), height: Math.min(r.height, innerHeight - r.top) };
  }, selector);
  if (box === null || box.width < 1 || box.height < 1) return null;
  await page.addStyleTag({ content: '[data-contrast-probe], [data-contrast-probe] * { color: transparent !important; text-shadow: none !important; }' });
  const shot = await page.screenshot({ clip: box, animations: 'disabled' });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-contrast-probe]')) el.removeAttribute('data-contrast-probe');
  });
  return page.evaluate(async (data) => {
    const img = new Image();
    await new Promise((ok, ko) => {
      img.onload = ok;
      img.onerror = ko;
      img.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    const px = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    let brightest = 0;
    for (let i = 0; i < px.length; i += 4) brightest = Math.max(brightest, 0.2126 * channel(px[i]) + 0.7152 * channel(px[i + 1]) + 0.0722 * channel(px[i + 2]));
    return Math.round((1.05 / (brightest + 0.05)) * 100) / 100;
  }, shot.toString('base64'));
};

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      /* `ONLY=<schéma>-<l>x<h>` restreint une itération locale à un gabarit ;
         le composite et la CI n'en posent jamais. */
      if (process.env.ONLY !== undefined && process.env.ONLY !== slug) continue;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR', hasTouch: true });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const cdp = await context.newCDPSession(page);

      // ------------------------------------------------ 1. le Flux
      await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
      await page.waitForSelector(`[data-feed-card="reel"]`);
      const header = await reach(page, '[data-feed-reels]');
      check(
        header.length === 1 && header[0].ok && header[0].h >= TAP_FLOOR && header[0].w >= TAP_FLOOR,
        `${label} : « Lancer les Réels » est dans l'en-tête, atteignable, 44 au moins (${JSON.stringify(header)})`,
      );
      const headerBox = await page.$eval('[data-feed-reels]', (el) => {
        const r = el.getBoundingClientRect();
        return { right: innerWidth - r.right, top: r.top, href: el.getAttribute('href') };
      });
      check(headerBox.href === '/reels' && headerBox.right <= 16 && headerBox.top < 80, `${label} : en haut à droite, sans graine (${JSON.stringify(headerBox)})`);
      await capture(page, `reels-flux-entete-${slug}`);

      // ------------------------------------------------ 2. toucher le réel
      await page.evaluate((seed) => {
        window.__skeletonSeen = false;
        new MutationObserver(() => {
          if (document.querySelector('[data-reels-skeleton]') !== null) window.__skeletonSeen = true;
        }).observe(document.body, { childList: true, subtree: true });
        document.querySelector(`[data-feed-card="reel"] [data-feed-reel-open][href="/reels?seed=${seed}"]`)?.scrollIntoView({ block: 'center' });
      }, SEED);
      const opened = Date.now();
      await page.click(`[data-feed-reel-open][href="/reels?seed=${SEED}"]`, { position: { x: 30, y: 60 } });
      await page.waitForURL(`**/reels?seed=${SEED}`);
      await page.waitForSelector('[data-reel-index="0"]');
      const paintedIn = Date.now() - opened;
      check((await page.getAttribute('[data-reel-index="0"]', 'data-reel')) === SEED, `${label} : le lecteur démarre SUR le réel touché`);
      check(!(await page.evaluate(() => window.__skeletonSeen)), `${label} : peint depuis le cache, sans squelette (${paintedIn} ms, chunk compris)`);
      check((await page.$('[data-floating-menu]')) === null && (await page.$('.floating-menus')) === null, `${label} : aucun disque flottant sur les Réels`);

      // ------------------------------------------------ 3. un seul réel joue
      check(await waitPlaying(page, 0), `${label} : le réel visible joue`);
      const atRest = await players(page);
      check(atRest.filter((p) => p.playing).length === 1 && atRest.every((p) => !p.playing || p.page === 0), `${label} : lui seul (${JSON.stringify(atRest)})`);
      check(atRest.length <= 3, `${label} : au plus trois lecteurs montés — le visible et ses voisins (${atRest.length})`);
      await capture(page, `reels-lecture-${slug}`);

      // ------------------------------------------------ 7. contraste et cibles
      const inks = {
        auteur: await pixelContrast(page, '[data-reel-index="0"] [data-reel-author]'),
        legende: await pixelContrast(page, '[data-reel-index="0"] [data-reel-caption]'),
        compteur: await pixelContrast(page, '[data-reel-index="0"] [data-reel-gesture="like"] .tabular-nums'),
      };
      check(Object.values(inks).every((ratio) => ratio !== null && ratio >= WCAG_AA), `${label} : auteur, légende et compteur tiennent AA au pixel sur la mire (${JSON.stringify(inks)})`);
      const controls = await reach(page, '[data-reel-index="0"] [data-reel-gesture], [data-reels-back]');
      check(controls.length === 5 && controls.every((c) => c.ok && c.h >= TAP_FLOOR && c.w >= TAP_FLOOR), `${label} : retour, j'aime, enregistrer, partager, son — atteignables, 44 au moins (${JSON.stringify(controls)})`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} : aucun défilement horizontal`);

      // ------------------------------------------------ 4. balayage tactile
      await page.evaluate(() => {
        window.__longTasks = [];
        new PerformanceObserver((list) => window.__longTasks.push(...list.getEntries().map((e) => Math.round(e.duration)))).observe({ type: 'longtask' });
      });
      const gesteSuivant = await swipe(cdp, page, { width, height }, 'next');
      await settle(page, 1);
      // Le geste a-t-il seulement PARTI ? Sans cette distinction, un harnais
      // muet accuse l'application : c'est ce qui s'est produit en CI le
      // 2026-09-14, où `preventFling: false` ne déplaçait rien du tout.
      check(gesteSuivant.bouge, `${label} : le balayage tactile déplace le défileur (${gesteSuivant.avant} → ${gesteSuivant.apres}, par ${gesteSuivant.voie})`);
      check((await activeIndex(page)) === 1, `${label} : balayer vers le haut accroche le réel SUIVANT (${await activeIndex(page)})`);
      const landed = await page.evaluate(() => {
        const el = document.querySelector('[data-reels-pager]');
        return { top: el.scrollTop, page: el.clientHeight };
      });
      check(Math.abs(landed.top - landed.page) < 1, `${label} : un arrêt par réel — exactement une page (${JSON.stringify(landed)})`);
      const afterSwipe = await page
        .waitForFunction(() => {
          const media = [...document.querySelectorAll('video, audio')];
          const playing = media.filter((m) => !m.paused);
          return playing.length <= 1 && playing.every((m) => m.closest('[data-reel-index]')?.getAttribute('data-reel-index') !== '0');
        }, null, { timeout: 3000 })
        .then(() => true, () => false);
      check(afterSwipe, `${label} : le réel quitté ne joue plus, jamais deux à la fois`);
      await swipe(cdp, page, { width, height }, 'previous');
      await settle(page, 0);
      check((await activeIndex(page)) === 0, `${label} : balayer vers le bas revient au PRÉCÉDENT`);
      check(await waitPlaying(page, 0), `${label} : et il rejoue`);
      const longTasks = await page.evaluate(() => window.__longTasks);
      check(longTasks.every((d) => d < LONG_TASK_MS), `${label} : aucune tâche longue pendant les balayages (${JSON.stringify(longTasks)})`);

      // ------------------------------------------------ 5. clavier
      const keyState = () =>
        page.evaluate(() => ({
          top: Math.round(document.querySelector('[data-reels-pager]').scrollTop),
          active: document.querySelector('[data-reel-mode="active"]')?.getAttribute('data-reel-index'),
          focus: document.activeElement?.getAttribute('data-reel-index') ?? document.activeElement?.tagName,
        }));
      await page.keyboard.press('ArrowDown');
      await settle(page, 1);
      const down = await keyState();
      check(down.active === '1' && down.focus === '1', `${label} : Flèche bas ⇒ réel suivant, qui prend le focus (${JSON.stringify(down)})`);
      await page.keyboard.press('ArrowUp');
      await settle(page, 0);
      const up = await keyState();
      check(up.active === '0' && up.focus === '0', `${label} : Flèche haut ⇒ réel précédent (${JSON.stringify(up)})`);

      // ------------------------------------------------ 6. j'aime, partagé avec le Flux
      const likeSel = '[data-reel-index="0"] [data-reel-gesture="like"]';
      const before = Number(await page.textContent(`${likeSel} .tabular-nums`));
      await page.click(likeSel);
      const liked = await page
        .waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', likeSel, { timeout: 500 })
        .then(() => true, () => false);
      check(liked && Number(await page.textContent(`${likeSel} .tabular-nums`)) === before + 1, `${label} : « J'aime » bascule au geste, compte +1`);

      // ------------------------------------------------ 8. hors ligne, avec des réels
      /* La coupure se dit par la pastille de synchronisation de la coquille, le
         signal de toute l'application — jamais par une seconde annonce propre à
         l'écran, qui s'y superposait (mesuré à 320 × 568). */
      await context.setOffline(true);
      const warm = await page.waitForSelector('[data-sync-pill]', { timeout: 3000 }).then(() => true, () => false);
      check(
        warm && (await page.$('[data-reel-index="0"]')) !== null && (await page.$$('[data-reels-offline], [data-reels-failure]')).length === 0,
        `${label} : hors ligne, les réels restent et la pastille de la coquille le dit, seule`,
      );
      await capture(page, `reels-hors-ligne-${slug}`);
      await context.setOffline(false);

      // ------------------------------------------------ 9. le retour quitte, sans lecteur orphelin
      await page.goBack();
      await page.waitForURL('**/feed');
      await page.waitForSelector('[data-feed-card="reel"]');
      const left = await players(page);
      check(left.length === 0, `${label} : le retour du navigateur quitte les Réels, aucun lecteur ne reste (${JSON.stringify(left)})`);
      check(
        (await page.getAttribute(`[data-feed-card="reel"]:has([href="/reels?seed=${SEED}"]) [data-feed-gesture="like"]`, 'aria-pressed')) === 'true',
        `${label} : le Flux montre le « J'aime » posé dans les Réels`,
      );
      await page.click('[data-feed-reels]');
      await page.waitForURL('**/reels');
      await page.waitForSelector('[data-reel-index="0"]');
      await page.click('[data-reels-back]');
      await page.waitForURL('**/feed');
      /* Ouvert DEPUIS le Flux, le bouton RECULE (#6498) : l'entrée des Réels
         reste devant soi. Un remplacement par le Flux arriverait à la même
         adresse, mais empilerait un second Flux derrière le premier. */
      check(await page.evaluate(() => window.navigation?.canGoForward === true), `${label} : le bouton retour ramène au Flux en RECULANT, sans empiler`);

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();

      // ------------------------------------------------ 10. lien profond avec graine
      const deep = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const deepPage = await deep.newPage();
      deepPage.setDefaultTimeout(10_000);
      const deepErrors = [];
      deepPage.on('pageerror', (error) => deepErrors.push(error.message));
      await deepPage.goto(`${BASE}/reels?seed=${DEEP_SEED}`, { waitUntil: 'load' });
      await deepPage.waitForSelector('[data-reel-index="0"]');
      const deepIds = await deepPage.$$eval('[data-reel]', (els) => els.map((el) => el.getAttribute('data-reel')));
      check(deepIds[0] === DEEP_SEED && deepIds.filter((id) => id === DEEP_SEED).length === 1, `${label} : un lien profond démarre sur SA graine, une seule fois (${JSON.stringify(deepIds)})`);
      check(
        (await deepPage.textContent('[data-reel-index="0"] [data-reel-caption]'))?.includes('L’heure dorée sur le port') === true,
        `${label} : la légende est servie dans la langue du lecteur (Prisme)`,
      );
      await capture(deepPage, `reels-lien-profond-${slug}`);
      /* « Retour » est le PREMIER contrôle du lecteur (#6498) : après le fil,
         il fallait traverser la scène et le rail de chaque réel monté. Seul le
         lien d'évitement de la coquille (« Aller au contenu ») le précède. */
      await deepPage.keyboard.press('Tab');
      if (await deepPage.evaluate(() => document.activeElement?.classList.contains('skip-link') === true)) await deepPage.keyboard.press('Tab');
      const firstControl = await deepPage.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
      check(
        await deepPage.evaluate(() => document.activeElement?.hasAttribute('data-reels-back') === true),
        `${label} : « Retour » est le premier contrôle du lecteur au clavier, avant tout réel (${firstControl})`,
      );
      check(deepErrors.length === 0, `${label} : aucune erreur de page au lien profond — ${JSON.stringify(deepErrors)}`);

      /* Un lien profond ouvert APRÈS une page tierce (#6498) : `history.length`
         vaut 3, mais rien de Meeshy ne précède — le bouton mène au Flux. */
      const foreign = await deep.newPage();
      await foreign.goto('data:text/html,<p>ailleurs</p>');
      await foreign.goto(`${BASE}/reels?seed=${DEEP_SEED}`, { waitUntil: 'load' });
      await foreign.waitForSelector('[data-reel-index="0"]');
      await foreign.click('[data-reels-back]');
      const stayed = await foreign.waitForURL(`${BASE}/feed`, { timeout: 5000 }).then(() => true, () => false);
      check(stayed, `${label} : un lien profond ouvert après une page tierce revient au Flux, jamais hors de Meeshy (${foreign.url()})`);
      await foreign.close();
      await deep.close();

      // ------------------------------------------------ 11. cache froid hors ligne
      const cold = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const coldPage = await cold.newPage();
      coldPage.setDefaultTimeout(10_000);
      const coldErrors = [];
      coldPage.on('pageerror', (error) => coldErrors.push(error.message));
      await coldPage.goto(`${BASE}/settings`, { waitUntil: 'load' });
      const setNetwork = (online) =>
        coldPage.evaluate((value) => {
          Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value });
          window.dispatchEvent(new Event(value ? 'online' : 'offline'));
        }, online);
      await setNetwork(false);
      await coldPage.evaluate(() => {
        history.pushState(null, '', '/reels');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      const saysOffline = await coldPage.waitForSelector('[data-reels-failure="offline"]', { timeout: 4000 }).then(() => true, () => false);
      check(saysOffline && (await coldPage.$('[data-reels-skeleton]')) === null, `${label} : à cache froid hors ligne, la coupure est dite — ni squelette`);
      await capture(coldPage, `reels-hors-ligne-froid-${slug}`);
      await setNetwork(true);
      const resumed = await coldPage.waitForSelector('[data-reel-index="0"]', { timeout: 5000 }).then(() => true, () => false);
      check(resumed, `${label} : au retour du réseau, les réels se chargent seuls`);
      check(coldErrors.length === 0, `${label} : aucune erreur de page à cache froid — ${JSON.stringify(coldErrors)}`);
      await cold.close();

      // ------------------------------------------------ 14. un réel COMPOSÉ (#6903)
      const sceneCtx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      /**
       * L'ARRIVÉE PAR LIEN PROFOND, RENDUE DÉTERMINISTE (revue-correction
       * #6903) : `hasUserActivation()` (`routes/reels.tsx:63-70`) lit
       * `navigator.userActivation.hasBeenActive` AU PREMIER RENDU, et
       * Chromium piloté l'arme quelque part autour de la première peinture —
       * mesuré `hasBeenActive: true` sur 10 contextes NEUFS interrogés juste
       * après le montage, alors que le rendu avait déjà lu `false`. Ce
       * témoin rougissait donc une fois sur dix, au hasard de la course. On
       * pose ici la CONDITION qu'il prétend éprouver — « la page n'a reçu
       * aucun geste » — au lieu de parier dessus.
       */
      await sceneCtx.addInitScript(() => {
        Object.defineProperty(navigator, 'userActivation', {
          configurable: true,
          get: () => ({ hasBeenActive: false, isActive: false }),
        });
      });
      const scenePage = await sceneCtx.newPage();
      scenePage.setDefaultTimeout(10_000);
      const sceneErrors = [];
      scenePage.on('pageerror', (error) => sceneErrors.push(error.message));
      await scenePage.goto(`${BASE}/reels?seed=${SCENE_SEED}`, { waitUntil: 'load' });
      await scenePage.waitForSelector(`[data-reel-index="0"][data-reel="${SCENE_SEED}"] [data-reel-scene]`);

      const scenePlayerPresent = (await scenePage.$('[data-reel-index="0"] [data-scene-player]')) !== null;
      const rawVideoAbsent = (await scenePage.$('[data-reel-index="0"] [data-reel-media="video"]')) === null;
      check(scenePlayerPresent && rawVideoAbsent, `${label} : un réel composé monte [data-scene-player], jamais un <video data-reel-media> brut`);

      const stageBox = await scenePage.evaluate(() => {
        const el = document.querySelector('[data-reel-index="0"] [data-reel-scene-stage]');
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
      check(
        stageBox !== null && Math.abs(stageBox.cx - width / 2) <= 1 && Math.abs(stageBox.cy - height / 2) <= 1,
        `${label} : la scène du réel composé est centrée au pixel près (${JSON.stringify(stageBox)})`,
      );

      const soundLabel = await scenePage.getAttribute('[data-reel-index="0"] [data-reel-gesture="sound"]', 'aria-label');
      check(soundLabel === 'Activer le son', `${label} : sans activation, le son du réel composé démarre coupé`);

      // Revue-correction #6903 — LE MUET SE DIT UNE FOIS : la pastille du
      // moteur doublait le bouton son du rail et se posait MESURÉ sur le
      // compteur de partages.
      const badges = await scenePage.$$eval('[data-reel-index="0"] [data-scene-sound="muted"]', (els) => els.length);
      check(badges === 0, `${label} : le muet d'un réel composé se dit UNE fois, sur le rail — aucune pastille de moteur (${badges})`);

      // Revue-correction #6903 — LE TAP ET LA BARRE SONT SUR LA PAGE, pas
      // dans la boîte 9:16 : une scène ajustée laisse des bandes où le tap
      // restait sans effet, et la barre atterrissait contre la rangée auteur.
      const frames = await scenePage.evaluate(() => {
        const page = document.querySelector('[data-reel-index="0"]');
        // `offsetWidth` — la largeur de MISE EN PAGE : la barre porte un
        // `scaleX(progression)` que `getBoundingClientRect` inclurait, et on
        // mesure ici sa PLACE, jamais son avancement.
        const r = (el) => {
          if (el === null) return null;
          const b = el.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), w: el.offsetWidth, bottom: Math.round(b.bottom) };
        };
        return {
          page: r(page),
          surface: r(page?.querySelector('[data-reel-surface]') ?? null),
          bar: r(page?.querySelector('[data-reel-progress]') ?? null),
        };
      });
      check(
        frames.surface !== null &&
          frames.page !== null &&
          frames.surface.x === frames.page.x &&
          frames.surface.y === frames.page.y &&
          frames.surface.w === frames.page.w &&
          frames.surface.bottom === frames.page.bottom,
        `${label} : le tap d'un réel composé couvre la PAGE, jamais la seule boîte 9:16 (${JSON.stringify(frames)})`,
      );
      const tapped = await scenePage.evaluate(() => {
        const el = document.elementFromPoint(window.innerWidth / 2, 12);
        return el === null ? null : el.closest('[data-reel-surface]') !== null;
      });
      check(tapped === true, `${label} : la bande noire au-dessus de la scène reçoit bien le tap de pause`);
      check(
        frames.bar !== null && frames.page !== null && frames.bar.bottom === frames.page.bottom && frames.bar.w === frames.page.w,
        `${label} : la barre du réel composé est collée au bas de la PAGE, comme celle d'un réel vidéo (${JSON.stringify(frames.bar)})`,
      );
      /**
       * LA BARRE SE VOIT (revue-correction #6903) — le VOILE BAS est peint
       * APRÈS elle et l'effaçait : mesuré au pixel, `rgb(15,15,36)` de
       * rempli contre `rgb(12,12,12)` de piste, deux teintes qu'aucun œil ne
       * sépare. On mesure donc ce qui est PEINT, jamais une règle CSS : une
       * capture de la bande basse, décodée dans un canvas, et l'écart entre
       * la part remplie et la piste.
       */
      // On attend que la lecture ait REMPLI un bout de barre plutôt que de
      // forcer un `scaleX` — l'horloge le réécrirait à la trame suivante.
      await scenePage
        .waitForFunction(
          () => {
            const el = document.querySelector('[data-reel-index="0"] [data-reel-progress]');
            return el !== null && el.getBoundingClientRect().width >= 20;
          },
          undefined,
          { timeout: 5000 },
        )
        .catch(() => undefined);
      const barPixels = await scenePage.evaluate(() => {
        const bar = document.querySelector('[data-reel-index="0"] [data-reel-progress]');
        if (bar === null) return null;
        return { y: Math.round(bar.getBoundingClientRect().top) + 1, w: bar.offsetWidth };
      });
      const strip = barPixels === null ? null : await scenePage.screenshot({ clip: { x: 0, y: barPixels.y, width: barPixels.w, height: 1 } });
      const pixels =
        strip === null
          ? null
          : await scenePage.evaluate(async (data) => {
              const img = new Image();
              img.src = `data:image/png;base64,${data}`;
              await img.decode();
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const at = (x) => [...ctx.getImageData(x, 0, 1, 1).data].slice(0, 3);
              return { fill: at(2), track: at(img.naturalWidth - 3) };
            }, strip.toString('base64'));
      // La PISTE (`rgba(255,255,255,0.3)`, sans transformation) sur le noir du
      // lecteur vaut ~77 quand rien ne la couvre, ~12 sous le voile : c'est
      // la mesure qui prouve que la barre n'est plus effacée.
      const trackLuma = pixels === null ? -1 : Math.max(...pixels.track);
      const gap = pixels === null ? -1 : Math.max(...pixels.fill.map((v, i) => Math.abs(v - pixels.track[i])));
      check(trackLuma >= 50, `${label} : la piste de la barre n'est pas effacée par le voile bas — ${trackLuma} sur 255 (${JSON.stringify(pixels)})`);
      check(gap >= 40, `${label} : le rempli de la barre se distingue de sa piste — écart ${gap} sur 255 (${JSON.stringify(pixels)})`);

      const sceneTime = (sel) => scenePage.evaluate((s) => document.querySelector(s)?.currentTime ?? -1, sel);
      const t0Video = await sceneTime('[data-reel-index="0"] [data-scene-player] video');
      const t0Track = await sceneTime('[data-reel-index="0"] [data-scene-sound-track]');
      await scenePage.waitForTimeout(700);
      const t1Video = await sceneTime('[data-reel-index="0"] [data-scene-player] video');
      const t1Track = await sceneTime('[data-reel-index="0"] [data-scene-sound-track]');
      check(
        t0Video >= 0 && t1Video > t0Video && t0Track >= 0 && t1Track > t0Track,
        `${label} : une lecture MUETTE de la scène et de son son de fond avance (vidéo ${t0Video} → ${t1Video}, piste ${t0Track} → ${t1Track})`,
      );
      await capture(scenePage, `reels-scene-${slug}`);

      /**
       * LOI 4 — LE BOUTON SON D'UN RÉEL COMPOSÉ A UN EFFET (revue-correction
       * #6903) : il commande la piste de fond, le seul son que cette scène
       * porte. Le fond VIDÉO, lui, reste muet même là : l'AUTEUR l'a déclaré
       * (`payload.muted`), et la loi qui décide d'afficher ce bouton le lit
       * déjà (`sceneHasControllableSound`) — le rendu le lit désormais aussi.
       */
      await scenePage.click('[data-reel-index="0"] [data-reel-gesture="sound"]');
      const unmuted = await scenePage
        .waitForFunction(
          () => document.querySelector('[data-reel-index="0"] [data-scene-sound-track]')?.muted === false,
          undefined,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      const afterSound = await scenePage.evaluate(() => ({
        label: document.querySelector('[data-reel-index="0"] [data-reel-gesture="sound"]')?.getAttribute('aria-label') ?? null,
        fond: document.querySelector('[data-reel-index="0"] [data-scene-player] video')?.muted ?? null,
      }));
      check(unmuted && afterSound.label === 'Couper le son', `${label} : le bouton son d'un réel composé OUVRE sa piste de fond (${JSON.stringify(afterSound)})`);
      check(afterSound.fond === true, `${label} : le fond vidéo que l'AUTEUR a coupé reste muet, son ouvert (${afterSound.fond})`);

      await scenePage.click('[data-reels-back]');
      await scenePage.waitForURL('**/feed');
      const anyScenePlaying = await scenePage.evaluate(() => [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.ended));
      const sceneTracksLeft = await scenePage.$$eval('[data-scene-sound-track]', (els) => els.length);
      check(!anyScenePlaying && sceneTracksLeft === 0, `${label} : le retour depuis le réel composé ne laisse ni lecteur en marche ni piste de son de fond`);

      check(sceneErrors.length === 0, `${label} : aucune erreur de page sur le réel composé — ${JSON.stringify(sceneErrors)}`);
      await sceneCtx.close();
    }
  }

  // ------------------------------------------------ 12. mouvement réduit
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  const calmPage = await calm.newPage();
  await calmPage.goto(`${BASE}/reels`, { waitUntil: 'load' });
  await calmPage.waitForSelector('[data-reel-index="1"]');
  await calmPage.keyboard.press('ArrowDown');
  const instant = await calmPage.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const el = document.querySelector('[data-reels-pager]');
          resolve(Math.round(el.scrollTop) === el.clientHeight);
        }),
      ),
  );
  check(instant, 'mouvement réduit : la flèche déplace d’un réel sans animation');
  await calm.close();
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Les Réels se regardent : un réel à la fois, au doigt comme au clavier, depuis le cache.\n');
