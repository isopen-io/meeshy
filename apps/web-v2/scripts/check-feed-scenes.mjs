/**
 * LES SCÈNES DU FIL (#6898) — une publication v:3 se lit dans le fil avec
 * TOUS ses objets, et chaque tuile d'un agencement montre la scène de sa
 * slide (D-78). Six invariants, sur les DEUX schémas (clair/sombre) : la
 * même géométrie, le même Prisme, la même élection ne dépendent d'aucune
 * couleur — seul le rendu VISUEL diffère entre les deux peaux, gardé
 * ailleurs (captures).
 *
 * Style `check-feed-media.mjs` : serveur `dist/`, `launchChromium`,
 * `check(ok, message)`, sortie 1 et liste des échecs.
 */
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { confinementDe } from './lib/chrome-confinement.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

/**
 * La couleur MOYENNE d'un ThumbHash (spécification d'Evan Wallace, fonction
 * `thumbHashToAverageRGBA`), recopiée ici — comme dans `check-story-scene.mjs`
 * — pour que l'attendu ne soit pas lu dans `lib/media/thumbhash.ts`, le code
 * mesuré. `THUMB_HASH_AMBER` (`fixtures-feed.ts`) est désormais posé sur
 * `POST_SCENE_DECORATED.bg1.payload.thumbHash` (revue-correction #6901).
 */
function averageRgbOfThumbHash(base64) {
  const bytes = Buffer.from(base64, 'base64');
  const header = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
  const l = (header & 63) / 63;
  const p = ((header >> 6) & 63) / 31.5 - 1;
  const q = ((header >> 12) & 63) / 31.5 - 1;
  const b = l - (2 / 3) * p;
  const r = (3 * l - b + q) / 2;
  const g = r - q;
  const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return [to255(r), to255(g), to255(b)];
}
const LETTERBOX_AMBER_RGB = averageRgbOfThumbHash('LHkC');
const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** La couleur MOYENNE d'un petit clip, décodée par un `<canvas>` de la page —
 * même patron que `dominantRgb` de `check-story-scene.mjs`, mais moyennée
 * (pas la couleur DOMINANTE) : le clip est volontairement minuscule et le
 * léger anti-aliasing d'un bord de bande ne doit pas faire basculer un pixel
 * isolé au sommet du décompte. */
async function averageRgbOfClip(page, clip) {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const bitmap = new Image();
    await new Promise((ok, ko) => {
      bitmap.onload = ok;
      bitmap.onerror = ko;
      bitmap.src = `data:image/png;base64,${data}`;
    });
    const canvasEl = document.createElement('canvas');
    canvasEl.width = bitmap.width;
    canvasEl.height = bitmap.height;
    const context = canvasEl.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      n += 1;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }, shot.toString('base64'));
}

/** Un pixel de bande par schéma — pour prouver que le SOL ne dépend pas du
 * schéma (`decoratedInvariants` tourne aussi sous `reducedMotion: 'reduce'` ;
 * un seul relevé par schéma suffit, capturé au premier passage). */
const bandeParScheme = {};

const browser = await launchChromium();

async function runScheme(colorScheme) {
  const context = await browser.newContext({ colorScheme, locale: 'en-US', viewport: { width: 420, height: 900 } });
  const pageErrors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  /* ── 1. post-scene-text : texte seul, rang 2, aucune image ──────────── */
  await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
  // On attend le TEXTE, pas l'enveloppe : `[data-feed-scene]` est monté
  // synchrone, `[data-scene-text]` vient du moteur CHARGÉ À LA DEMANDE
  // (`lazy`, D-79). Attendre l'enveloppe puis lire le texte est une course
  // qu'un runner lent perd (revue-correction #6898).
  await page.waitForSelector('[data-feed-card-id="post-scene-text"] [data-feed-scene] [data-scene-text]');
  const sceneText = await page.evaluate(() => {
    const carte = document.querySelector('[data-feed-card-id="post-scene-text"] [data-feed-scene]');
    const texte = carte?.querySelector('[data-scene-text]');
    return {
      texte: texte?.textContent ?? null,
      lang: texte?.getAttribute('lang') ?? null,
      images: carte?.querySelectorAll('img').length ?? -1,
    };
  });
  check(
    sceneText.texte === 'The scene speaks for itself.',
    `[${colorScheme}] post-scene-text : texte attendu au rang 2 (en) — reçu « ${sceneText.texte} »`,
  );
  check(sceneText.lang === 'en', `[${colorScheme}] post-scene-text : lang attendu "en" — reçu "${sceneText.lang}"`);
  check(sceneText.images === 0, `[${colorScheme}] post-scene-text : ${sceneText.images} <img> dans une scène texte seul`);

  /* ── 2. post-scenes-mixed : 3 pages, texte à l'index 1, image à 0 ────── */
  await page.waitForSelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="1"] [data-scene-text]');
  await page.waitForSelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="0"] [data-scene-player]');
  const mixed = await page.evaluate(() => {
    const carte = document.querySelector('[data-feed-card-id="post-scenes-mixed"]');
    const pages = [...carte.querySelectorAll('[data-feed-scene-index]')];
    const page1 = pages.find((p) => p.getAttribute('data-feed-scene-index') === '1');
    const page0 = pages.find((p) => p.getAttribute('data-feed-scene-index') === '0');
    const texte1 = page1?.querySelector('[data-scene-text]');
    return {
      count: pages.length,
      texte1: texte1?.textContent ?? null,
      lang1: texte1?.getAttribute('lang') ?? null,
      img1: page1?.querySelectorAll('img').length ?? -1,
      img0: page0?.querySelectorAll('img').length ?? -1,
      compteur: carte.querySelector('[data-feed-media-counter]')?.textContent?.replace(/\s+/g, '') ?? null,
      flechePrev: carte.querySelector('[aria-label="Previous scene"]') !== null,
      flecheSuivante: carte.querySelector('[aria-label="Next scene"]') !== null,
    };
  });
  check(mixed.count === 3, `[${colorScheme}] post-scenes-mixed : 3 pages attendues — ${mixed.count}`);
  check(mixed.texte1 === 'Deuxième page, texte seul', `[${colorScheme}] post-scenes-mixed : texte de la page 1 — reçu « ${mixed.texte1} »`);
  check(mixed.lang1 === 'fr', `[${colorScheme}] post-scenes-mixed : lang de la page 1 — reçu "${mixed.lang1}"`);
  check(mixed.img1 === 0, `[${colorScheme}] post-scenes-mixed : ${mixed.img1} <img> sur la page texte seul`);
  check(mixed.img0 >= 1, `[${colorScheme}] post-scenes-mixed : aucune <img> sur la page 0 (panorama)`);
  check(mixed.compteur === '1/3', `[${colorScheme}] post-scenes-mixed : compteur attendu "1 / 3" — reçu "${mixed.compteur}"`);
  check(!mixed.flechePrev, `[${colorScheme}] post-scenes-mixed : une flèche « précédente » sur la page 1`);
  check(mixed.flecheSuivante, `[${colorScheme}] post-scenes-mixed : aucune flèche « suivante » sur la page 1`);

  /* ── 3. le plafond 1,4 : boîte plafonnée, contenu centré ─────────────── */
  // Mesuré AVANT le clic : la page 0 glisse d'une largeur dès que la piste
  // défile, et son centre HORIZONTAL — la moitié du critère — ne se lit
  // qu'au repos sur elle.
  //
  // `SceneCardHeightCap` (iOS) plafonne la BOÎTE et centre DEDANS le carrousel
  // ENTIER à son rapport naturel (la page la plus haute, 9:16) : le panorama
  // se pose donc dans une zone PLUS ÉTROITE que la boîte, bandes LATÉRALES
  // visibles. La première forme de ce gate mesurait des bandes haut/bas — la
  // géométrie d'un carrousel posé à pleine largeur de boîte, que la cible
  // iOS ne montre pas.
  const geometrie = await page.evaluate(() => {
    const box = document.querySelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-box]').getBoundingClientRect();
    const content = document
      .querySelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="0"] [data-scene-player]')
      .getBoundingClientRect();
    const seul = document.querySelector('[data-feed-card-id="post-scene-text"] [data-feed-scene-box]').getBoundingClientRect();
    return {
      boxWidth: box.width,
      boxHeight: box.height,
      contentWidth: content.width,
      centreXContent: content.left + content.width / 2,
      centreXBox: box.left + box.width / 2,
      centreYContent: content.top + content.height / 2,
      centreYBox: box.top + box.height / 2,
      seulWidth: seul.width,
      seulRatio: seul.height / seul.width,
    };
  });
  check(
    geometrie.boxHeight <= 1.4 * geometrie.boxWidth + 1 && geometrie.boxHeight >= 1.4 * geometrie.boxWidth - 1,
    `[${colorScheme}] plafond 1,4 : boîte ${geometrie.boxWidth.toFixed(1)}×${geometrie.boxHeight.toFixed(1)} (ratio ${(geometrie.boxHeight / geometrie.boxWidth).toFixed(3)})`,
  );
  check(
    geometrie.contentWidth < geometrie.boxWidth - 1,
    `[${colorScheme}] page 0 (panorama) : le contenu (${geometrie.contentWidth.toFixed(1)} px) devrait être plus ÉTROIT que la boîte (${geometrie.boxWidth.toFixed(1)} px) — bandes latérales`,
  );
  check(
    Math.abs(geometrie.centreXContent - geometrie.centreXBox) <= 1,
    `[${colorScheme}] page 0 (panorama) : |centreX(contenu) − centreX(boîte)| = ${Math.abs(geometrie.centreXContent - geometrie.centreXBox).toFixed(2)} px (attendu ≤ 1)`,
  );
  check(
    Math.abs(geometrie.centreYContent - geometrie.centreYBox) <= 1,
    `[${colorScheme}] page 0 (panorama) : le contenu n'est pas centré verticalement dans la boîte`,
  );
  // Contre-épreuve : `post-scene-text` cadre sur la boîte de son texte
  // (plancher 0,42 de la scène) ⇒ hauteur = 0,42 × 16/9 × largeur ≈ 0,7467 ×
  // largeur, à 2 px près. Une carte qui rendrait le 9:16 entier (1,78) ou le
  // plafond (1,4) serait rouge.
  const attendu = (0.42 * 16) / 9;
  check(
    Math.abs(geometrie.seulRatio - attendu) * geometrie.seulWidth <= 2,
    `[${colorScheme}] post-scene-text : ratio ${geometrie.seulRatio.toFixed(4)} — attendu ${attendu.toFixed(4)} (boîte du texte, plancher 0,42)`,
  );

  await page.click('[data-feed-card-id="post-scenes-mixed"] [aria-label="Next scene"]');
  const apresClic = await page.evaluate(() => {
    const carte = document.querySelector('[data-feed-card-id="post-scenes-mixed"]');
    const page1 = carte.querySelector('[data-feed-scene-index="1"]')?.closest('[aria-current]');
    return {
      compteur: carte.querySelector('[data-feed-media-counter]')?.textContent?.replace(/\s+/g, '') ?? null,
      current: page1?.getAttribute('aria-current') ?? null,
    };
  });
  check(apresClic.compteur === '2/3', `[${colorScheme}] post-scenes-mixed : après clic, compteur attendu "2 / 3" — reçu "${apresClic.compteur}"`);
  check(apresClic.current === 'true', `[${colorScheme}] post-scenes-mixed : après clic, la page 1 n'est pas aria-current`);

  /* ── 2 bis. le clavier et la molette, les deux autres chemins ─────────── */
  // Une flèche n'est qu'UN des trois chemins vers la page suivante : la
  // piste focalisée répond à ←/→, et le glissement (ici la molette
  // horizontale, le seul qu'un navigateur de recette sache produire) doit
  // mettre le compteur à jour sans aucun clic.
  const compteurDe = () =>
    page.evaluate(
      () =>
        document
          .querySelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-media-counter]')
          ?.textContent?.replace(/\s+/g, '') ?? null,
    );
  await page.focus('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-track]');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  const apresGauche = await compteurDe();
  check(apresGauche === '1/3', `[${colorScheme}] post-scenes-mixed : ← sur la piste focalisée, compteur attendu "1 / 3" — reçu "${apresGauche}"`);
  const piste = await page.evaluate(() => {
    const r = document.querySelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-track]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width };
  });
  await page.mouse.move(piste.x, piste.y);
  await page.mouse.wheel(piste.width, 0);
  await page.waitForTimeout(900);
  const apresMolette = await compteurDe();
  check(apresMolette === '2/3', `[${colorScheme}] post-scenes-mixed : molette horizontale d'une page, compteur attendu "2 / 3" — reçu "${apresMolette}"`);

  /* ── 4. UNE seule scène cinématique joue à la fois ───────────────────── */
  // `scrollIntoView({ block: 'center' })`, JAMAIS `scrollIntoViewIfNeeded` —
  // ce dernier ne scrolle QUE si l'élément n'est pas déjà visible, et les
  // deux cartes clip-a/clip-b tiennent SIMULTANÉMENT dans un viewport de
  // 900 px : sans forcer le centrage, la deuxième carte resterait à sa
  // place et l'élection continuerait de désigner la première (plus proche
  // du centre), un FAUX négatif mesuré avant ce correctif.
  // « À LA FOIS » se mesure sur une FENÊTRE, jamais sur un instant : la
  // boucle d'élection corrigée en cours de lot faisait alterner DEUX vidéos
  // des centaines de fois par seconde — un relevé unique pouvait tomber sur
  // une trame où une seule jouait. On échantillonne donc chaque trame
  // pendant 2,1 s, après le centrage, et on retient le MAXIMUM.
  const echantillonner = (cardId) =>
    page.evaluate(
      (id) =>
        new Promise((resolve) => {
          document.querySelector(`[data-feed-card-id="${id}"]`).scrollIntoView({ block: 'center' });
          const debut = performance.now();
          let maximum = 0;
          const trame = () => {
            const enLecture = [...document.querySelectorAll('[data-feed-card] video')].filter((v) => !v.paused).length;
            if (performance.now() - debut > 300) maximum = Math.max(maximum, enLecture);
            if (performance.now() - debut < 2400) requestAnimationFrame(trame);
            else resolve(maximum);
          };
          requestAnimationFrame(trame);
        }),
      cardId,
    );
  const maxA = await echantillonner('post-scene-clip-a');
  const clipA = await page.evaluate(() => {
    const videos = [...document.querySelectorAll('[data-feed-card] video')];
    const enLecture = videos.filter((v) => !v.paused);
    const carteA = document.querySelector('[data-feed-card-id="post-scene-clip-a"]');
    const carteB = document.querySelector('[data-feed-card-id="post-scene-clip-b"]');
    return {
      total: videos.length,
      enLecture: enLecture.length,
      dansA: enLecture.some((v) => carteA.contains(v)),
      sonCoupeA: carteA.querySelector('[data-scene-sound="muted"]') !== null,
      sonCoupeB: carteB.querySelector('[data-scene-sound="muted"]') !== null,
      // Le texte du post reste AU-DESSUS de la scène, jamais en bandeau
      // (`FeedPostCard.swift:378-382`) — la carte clip-a porte un média SEUL
      // sans légende, le cas exact où `resolveMedia` prête le contenu du post.
      //
      // VISÉ PAR SON MARQUEUR, PLUS PAR SA PROFONDEUR (#7141). La forme
      // précédente — `:scope > div > p[lang]` — épinglait un CHEMIN : poser la
      // pastille du Prisme à côté du texte a ajouté un niveau, et ce gate est
      // tombé en rendant « null » alors que le texte était toujours au-dessus
      // de la scène. Ce qu'il mesure est une POSITION (au-dessus, jamais en
      // bandeau), pas une profondeur d'arbre ; `data-feed-text` la nomme sans
      // la deviner. C'est la même correction que `feed-post-card.test.tsx` a
      // dû recevoir sur sa liste de classes — deux formes du même défaut de
      // témoin.
      texteDuPost: carteA.querySelector('[data-feed-text]')?.textContent ?? null,
      legendesA: carteA.querySelectorAll('[data-feed-scene-caption]').length,
    };
  });
  check(maxA <= 1, `[${colorScheme}] clip-a centré : jusqu'à ${maxA} vidéos en lecture SIMULTANÉE sur la fenêtre échantillonnée (attendu ≤ 1)`);
  check(clipA.enLecture === 1, `[${colorScheme}] clip-a centré : ${clipA.enLecture} vidéo(s) en lecture (attendu 1)`);
  check(clipA.dansA, `[${colorScheme}] clip-a centré : la vidéo en lecture n'est pas dans la carte -a`);
  check(clipA.sonCoupeA, `[${colorScheme}] clip-a : aucun indicateur « son coupé » alors qu'il joue et qu'il est audible`);
  check(!clipA.sonCoupeB, `[${colorScheme}] clip-b : un indicateur « son coupé » alors qu'il est \`muted: true\` (non audible)`);
  check(clipA.texteDuPost === 'Avec le son, en boucle', `[${colorScheme}] clip-a : texte du post attendu AU-DESSUS de la scène — reçu « ${clipA.texteDuPost} »`);
  check(clipA.legendesA === 0, `[${colorScheme}] clip-a : ${clipA.legendesA} bandeau(x) de légende — le texte du post n'y descend jamais`);

  const maxB = await echantillonner('post-scene-clip-b');
  const clipB = await page.evaluate(() => {
    const videos = [...document.querySelectorAll('[data-feed-card] video')];
    const enLecture = videos.filter((v) => !v.paused);
    const carteB = document.querySelector('[data-feed-card-id="post-scene-clip-b"]');
    return { enLecture: enLecture.length, dansB: enLecture.some((v) => carteB.contains(v)) };
  });
  check(maxB <= 1, `[${colorScheme}] clip-b centré : jusqu'à ${maxB} vidéos en lecture SIMULTANÉE sur la fenêtre échantillonnée (attendu ≤ 1)`);
  check(clipB.enLecture === 1, `[${colorScheme}] clip-b centré : ${clipB.enLecture} vidéo(s) en lecture (attendu 1)`);
  check(clipB.dansB, `[${colorScheme}] clip-b centré : la vidéo en lecture n'est pas dans la carte -b`);

  /* ── Contre-épreuve : prefers-reduced-motion ⇒ aucune lecture ────────── */
  await context.close();
  const reducedContext = await browser.newContext({ colorScheme, locale: 'en-US', viewport: { width: 420, height: 900 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${BASE}/feed`, { waitUntil: 'load' });
  await reducedPage.waitForSelector('[data-feed-card-id="post-scene-clip-a"]');
  await reducedPage.evaluate(() => {
    document.querySelector('[data-feed-card-id="post-scene-clip-a"]').scrollIntoView({ block: 'center' });
  });
  await reducedPage.waitForTimeout(1000);
  const reduced = await reducedPage.evaluate(() => {
    const videos = [...document.querySelectorAll('[data-feed-card] video')];
    const videoOf = (id) => document.querySelector(`[data-feed-card-id="${id}"] video`);
    return {
      enLecture: videos.filter((v) => !v.paused).length,
      glypheA: document.querySelector('[data-feed-card-id="post-scene-clip-a"] [data-feed-scene-paused-glyph]') !== null,
      glypheB: document.querySelector('[data-feed-card-id="post-scene-clip-b"] [data-feed-scene-paused-glyph]') !== null,
      posterA: videoOf('post-scene-clip-a')?.getAttribute('poster') ?? null,
      posterB: videoOf('post-scene-clip-b')?.getAttribute('poster') ?? null,
    };
  });
  check(reduced.enLecture === 0, `[${colorScheme}] prefers-reduced-motion : ${reduced.enLecture} vidéo(s) en lecture (attendu 0)`);
  check(reduced.glypheA, `[${colorScheme}] prefers-reduced-motion : glyphe de lecture absent sur clip-a`);
  check(reduced.glypheB, `[${colorScheme}] prefers-reduced-motion : glyphe de lecture absent sur clip-b`);
  // Défaut de revue #6898 (défaut 4) : une vidéo `preload="none"` non élue ne
  // peint RIEN tant qu'elle n'a pas joué — sans `poster`, la boîte retombe
  // sur la couleur DE LA CARTE, indiscernable de l'absence de scène. Le
  // porteur (`SceneCarrier.media[].poster`) doit donc atteindre l'attribut.
  check(
    typeof reduced.posterA === 'string' && reduced.posterA !== '',
    `[${colorScheme}] prefers-reduced-motion : clip-a n'a AUCUN \`poster\` — boîte transparente sur la couleur de la carte`,
  );
  check(
    typeof reduced.posterB === 'string' && reduced.posterB !== '',
    `[${colorScheme}] prefers-reduced-motion : clip-b n'a AUCUN \`poster\` — boîte transparente sur la couleur de la carte`,
  );
  await reducedContext.close();

  const context2 = await browser.newContext({ colorScheme, locale: 'en-US', viewport: { width: 420, height: 900 } });
  const page2 = await context2.newPage();
  page2.on('pageerror', (e) => pageErrors.push(String(e)));

  /* ── 5. post-scenes-wave : 4 tuiles, +1, aucune légende ──────────────── */
  await page2.goto(`${BASE}/feed`, { waitUntil: 'load' });
  await page2.waitForSelector('[data-feed-card-id="post-scenes-wave"] [data-feed-mosaic-tile]');
  const wave = await page2.evaluate(() => {
    const carte = document.querySelector('[data-feed-card-id="post-scenes-wave"]');
    const tuiles = [...carte.querySelectorAll('[data-feed-mosaic-tile]')];
    return {
      count: tuiles.length,
      indices: tuiles.map((t) => t.querySelector('[data-feed-scene-index]')?.getAttribute('data-feed-scene-index')),
      overflow: tuiles[tuiles.length - 1]?.querySelector('[data-feed-mosaic-overflow]')?.textContent ?? null,
      legendes: carte.querySelectorAll('[data-feed-scene-caption]').length,
    };
  });
  check(wave.count === 4, `[${colorScheme}] post-scenes-wave : 4 tuiles attendues — ${wave.count}`);
  check(wave.indices.join(',') === '0,1,2,3', `[${colorScheme}] post-scenes-wave : indices attendus 0..3 — reçu ${wave.indices.join(',')}`);
  check(wave.overflow === '+1', `[${colorScheme}] post-scenes-wave : dernière tuile attendue "+1" — reçu "${wave.overflow}"`);
  check(wave.legendes === 0, `[${colorScheme}] post-scenes-wave : ${wave.legendes} légende(s) — wave n'en porte aucune`);

  /* ── 6. pageerror = 0, le détail rend le même carrousel ──────────────── */
  await page2.goto(`${BASE}/post/post-scenes-mixed`, { waitUntil: 'load' });
  await page2.waitForSelector('[data-feed-scene-index]');
  const detail = await page2.evaluate(() => document.querySelectorAll('[data-feed-scene-index]').length);
  check(detail === 3, `[${colorScheme}] /post/post-scenes-mixed : 3 pages attendues — ${detail}`);
  check(pageErrors.length === 0, `[${colorScheme}] ${pageErrors.length} erreur(s) de page — ${pageErrors.slice(0, 3).join(' | ')}`);

  await context2.close();

  /* ── 7. post-scene-decorated : les six couches, et l'EFFET des keyframes
   * (#6901, T-F) — un contrôle/mécanisme se prouve par son EFFET, jamais son
   * seul câblage : deux relevés de `style.left` espacés de 700 ms, PENDANT
   * que la carte est élue (centrée), doivent DIFFÉRER. Les KINDS (sticker,
   * lieu, dessin) se vérifient sous les DEUX réglages de mouvement ; le
   * MOUVEMENT lui-même ne se vérifie que SANS `prefers-reduced-motion` — sous
   * ce réglage, l'élection d'autoplay du fil (`autoplay-election.ts:14`,
   * `reducedMotion ⇒ null`) n'élit AUCUNE carte, `playing` reste faux pour
   * TOUTES les scènes cinématiques (loi DÉJÀ gardée par les invariants
   * clip-a/clip-b ci-dessus, § 4) : une carte non élue n'anime rien, quel
   * que soit son contenu — ce n'est pas un défaut de CE lot. */
  const decoratedInvariants = async (colorSchemeCtx) => {
    const context3 = await browser.newContext({
      colorScheme,
      locale: 'en-US',
      viewport: { width: 420, height: 900 },
      ...colorSchemeCtx,
    });
    const page3 = await context3.newPage();
    await page3.goto(`${BASE}/feed`, { waitUntil: 'load' });
    await page3.waitForSelector('[data-feed-card-id="post-scene-decorated"] [data-scene-object="text"]');
    await page3.evaluate(() => {
      document.querySelector('[data-feed-card-id="post-scene-decorated"]').scrollIntoView({ block: 'center' });
    });
    const kinds = await page3.evaluate(() => {
      const carte = document.querySelector('[data-feed-card-id="post-scene-decorated"]');
      return {
        sticker: carte?.querySelector('[data-scene-object="sticker"]')?.textContent ?? null,
        place: carte?.querySelector('[data-scene-object="place"]')?.textContent ?? null,
        drawing: carte?.querySelectorAll('[data-scene-object="drawing"] polyline').length ?? -1,
      };
    });
    const reduced = colorSchemeCtx.reducedMotion === 'reduce' ? ' (prefers-reduced-motion)' : '';
    check(kinds.sticker === '🔥', `[${colorScheme}]${reduced} post-scene-decorated : sticker attendu « 🔥 » — reçu « ${kinds.sticker} »`);
    check(
      typeof kinds.place === 'string' && kinds.place.includes('Café Central'),
      `[${colorScheme}]${reduced} post-scene-decorated : lieu attendu « Café Central » — reçu « ${kinds.place} »`,
    );
    check(kinds.drawing >= 2, `[${colorScheme}]${reduced} post-scene-decorated : ${kinds.drawing} trait(s) de dessin (attendu ≥ 2)`);

    /* LA BOÎTE D'UN TEXTE EST BORNÉE PAR LA SCÈNE, JAMAIS PAR ELLE-MÊME
     * (revue-correction #6901). `max-width` se résolvait contre
     * `SceneObjectFrame`, dont la largeur est AUTO : la boîte peinte valait
     * 85 % du TEXTE — mesuré 65,72 px pour un texte de 77,33 px — donc le
     * texte débordait sa propre boîte de 15 % à chaque scène, et le studio,
     * qui aligne sa saisie sur cette boîte, coupait un mot en deux lignes
     * (`check-story-studio.mjs`, 4 échecs). L'invariant mesure la LOI : la
     * boîte vaut le minimum entre la largeur INTRINSÈQUE du texte et 85 % de
     * la scène. Aucun témoin `bun test` ne peut le porter — happy-dom rejette
     * l'unité `cqw` à l'assignation, et la loi est un CALCUL de mise en page. */
    /* UN TEXTE DE SCÈNE NE DÉPEND PAS DU SCHÉMA POUR ÊTRE LU
     * (revue-correction #6901). Le texte blanc de cette scène se peignait sur
     * les bandes d'un fond `fit`, donc sur l'aplat de CARTE : lisible en
     * sombre, INVISIBLE en clair. Sa pastille (`textBg`) le rend
     * indépendant du schéma — DÉFENSE EN PROFONDEUR, la cause profonde
     * (le sol d'un fond ajusté) est désormais résolue ci-dessous. */
    const pill = await page3.evaluate(() => {
      const peint = document.querySelector('[data-feed-card-id="post-scene-decorated"] [data-scene-text]');
      return peint === null ? null : getComputedStyle(peint).backgroundColor;
    });
    check(
      typeof pill === 'string' && pill !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(pill),
      `[${colorScheme}]${reduced} post-scene-decorated : le texte n'a aucune pastille opaque derrière lui (backgroundColor="${pill}") — il dépendrait du schéma pour être lu`,
    );

    const textBox = await page3.evaluate(() => {
      const peint = document.querySelector('[data-feed-card-id="post-scene-decorated"] [data-scene-object="text"] [data-scene-text]');
      if (peint === null) return null;
      const canvas = peint.closest('[data-scene-player]');
      const clone = peint.cloneNode(true);
      clone.style.maxWidth = 'none';
      clone.style.whiteSpace = 'pre';
      clone.style.visibility = 'hidden';
      clone.style.position = 'absolute';
      peint.parentElement.appendChild(clone);
      const intrinsic = clone.getBoundingClientRect().width;
      clone.remove();
      return { box: peint.getBoundingClientRect().width, intrinsic, scene: canvas?.getBoundingClientRect().width ?? 0 };
    });
    check(textBox !== null, `[${colorScheme}]${reduced} post-scene-decorated : [data-scene-text] introuvable`);
    if (textBox !== null) {
      const attendu = Math.min(textBox.intrinsic, textBox.scene * 0.85);
      check(
        Math.abs(textBox.box - attendu) <= 1,
        `[${colorScheme}]${reduced} post-scene-decorated : boîte du texte ${Math.round(textBox.box * 100) / 100} px — attendu min(intrinsèque ${Math.round(textBox.intrinsic * 100) / 100}, 85 % de la scène ${Math.round(textBox.scene * 85) / 100}) = ${Math.round(attendu * 100) / 100}`,
      );
    }

    /* LE SOL D'UN FOND AJUSTÉ EST PEINT DANS LE MOTEUR, PAS DANS L'APLAT DE
     * CARTE (revue-correction #6901, défaut 1). Le fond `fit` de cette scène
     * (16:9) est plus LARGE que le canvas 9:16 : il laisse une bande
     * horizontale en haut ET en bas. L'échantillon est pris au centre du bord
     * HAUT — loin des deux coins arrondis (`data-feed-scene-box`,
     * `borderRadius: 16`) et de tout occupant (texte à x∈[0,2;0,8] y=0,2 ;
     * dessin dès (100,100) en design, ≈ 36 px rendus ; sticker/lieu en bas) —
     * et exige la couleur MOYENNE du ThumbHash du fond (ambré), jamais celle
     * de l'aplat de carte, qui CHANGE de schéma alors que le sol ne doit pas. */
    if (colorSchemeCtx.reducedMotion !== 'reduce') {
      const sceneRect = await page3.evaluate(() => {
        const scene = document.querySelector('[data-feed-card-id="post-scene-decorated"] [data-scene-player]');
        if (scene === null) return null;
        const r = scene.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      check(sceneRect !== null, `[${colorScheme}] post-scene-decorated : [data-scene-player] introuvable pour l'échantillon de bande`);
      if (sceneRect !== null) {
        const clip = { x: Math.round(sceneRect.x + sceneRect.width / 2 - 4), y: Math.round(sceneRect.y + 4), width: 8, height: 6 };
        const rgb = await averageRgbOfClip(page3, clip);
        bandeParScheme[colorScheme] = rgb;
        const ecart = distance(rgb, LETTERBOX_AMBER_RGB);
        check(
          ecart <= 40,
          `[${colorScheme}] post-scene-decorated : bande du fond \`fit\` = rgb(${rgb.join(',')}) — attendu proche de l'ambré du ThumbHash rgb(${LETTERBOX_AMBER_RGB.join(',')}) (écart ${ecart}, ≤ 40), pas l'aplat de carte`,
        );
      }
    }

    if (colorSchemeCtx.reducedMotion !== 'reduce') {
      const first = await page3.evaluate(
        () => document.querySelector('[data-feed-card-id="post-scene-decorated"] [data-scene-object="text"]').style.left,
      );
      await page3.waitForTimeout(700);
      const second = await page3.evaluate(
        () => document.querySelector('[data-feed-card-id="post-scene-decorated"] [data-scene-object="text"]').style.left,
      );
      check(
        first !== second,
        `[${colorScheme}] post-scene-decorated : le texte à keyframes n'a pas bougé entre deux relevés à 700 ms (left="${first}" les deux fois)`,
      );
    }
    await context3.close();
  };
  await decoratedInvariants({});
  await decoratedInvariants({ reducedMotion: 'reduce' });
}

for (const scheme of ['light', 'dark']) await runScheme(scheme);

/* LE SOL NE DÉPEND PAS DU SCHÉMA — LA CARTE, ELLE, EN DÉPEND (revue-correction
 * #6901). Contre-épreuve de l'invariant ci-dessus : les DEUX relevés (clair,
 * sombre) doivent se ressembler, alors que `var(--color-ios-card)` — l'aplat
 * que la scène montrait avant ce lot — change bel et bien de valeur entre les
 * deux schémas. Si cette épreuve rougissait sans que l'invariant par schéma
 * rougisse, le sol dépendrait du schéma malgré tout (un dégradé qui matcherait
 * l'ambré dans CHAQUE schéma par coïncidence, par exemple). */
check(
  bandeParScheme.light !== undefined && bandeParScheme.dark !== undefined,
  `post-scene-decorated : bande de fond non relevée dans un des deux schémas (clair=${JSON.stringify(bandeParScheme.light)}, sombre=${JSON.stringify(bandeParScheme.dark)})`,
);
if (bandeParScheme.light !== undefined && bandeParScheme.dark !== undefined) {
  // Le sol se peint à `LETTERBOX_FILL_OPACITY` (0,85, MÊME constante qu'iOS,
  // `StoryLetterboxFill.fillOpacity`) : il laisse filtrer 15 % de ce qu'il y
  // a DESSOUS, donc un écart RÉSIDUEL entre schémas est ATTENDU — mesuré ici
  // à 34 (clair rgb(225,173,169), sombre rgb(191,139,135), calcul vérifié :
  // 0,85 × ambré + 0,15 × `--color-ios-card` de chaque schéma). Le seuil
  // borne ce résidu, PAS l'écart des deux aplats de carte eux-mêmes
  // (`#f8f7ff` clair vs `#13111c` sombre : distance 229) — c'est CETTE
  // distance-là que le sol doit éviter, pas atteindre zéro.
  const ecartEntreSchemas = distance(bandeParScheme.light, bandeParScheme.dark);
  check(
    ecartEntreSchemas <= 40,
    `post-scene-decorated : la bande diffère entre les schémas — clair rgb(${bandeParScheme.light.join(',')}), sombre rgb(${bandeParScheme.dark.join(',')}) (écart ${ecartEntreSchemas}, ≤ 40) — le sol dépendrait du thème comme l'aplat de carte qu'il remplace`,
  );
}

/**
 * ── 8-10. #6902 : TOUCHER UNE SCÈNE DU FIL L'OUVRE EN PLEIN ÉCRAN, LA MÊME
 * SCÈNE, À L'ÉCHELLE UNIFORME ET CENTRÉE ────────────────────────────────────
 *
 * La visionneuse est RÉUTILISÉE (`MediaViewer`, D-54/D-59) — jamais un second
 * plein écran (la leçon d'iOS #6709) : `[data-scene-fullscreen]` est le MÊME
 * dialogue que la galerie de médias, une page de plus.
 *
 * La comparaison de rapport se fait contre `[data-feed-scene-index="N"]`
 * LUI-MÊME — le CADRE de la scène sur la carte (mesuré : 267,75 × 476, exactement
 * 9:16), PAS `[data-feed-scene-box]` (la boîte EXTÉRIEURE du carrousel,
 * PLAFONNÉE à 1,4 par `clampedCardAspect` — un cadrage de carte hors
 * périmètre de ce lot, § 0) ni `[data-scene-player]` (le CONTENU ajusté à
 * l'intérieur du cadre, qui pour une scène TEXTE SEUL retombe sur le
 * PLANCHER 0,42 de `pageAspect` — mesuré 267,75 × 199,9, ≈ 1,34 — une loi de
 * carte, pas la forme de la SCÈNE). Le cadre, lui, dérive de `naturalAspect`
 * (`carouselAspect`, la page la plus haute du lot) qui, D-80 aidant, vaut
 * 9:16 — LA MÊME forme que `SCENE_RATIO` en plein écran : c'est CETTE
 * égalité que le critère vise, et elle est vraie PAR CONSTRUCTION.
 */
async function fullscreenInvariants(viewport) {
  const context = await browser.newContext({ viewport, locale: 'en-US' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
  await page.waitForSelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="1"] [data-scene-player]');

  const sceneBoxBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="1"]');
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });

  // ── 8. le tap ouvre EN PLACE, sur la scène TOUCHÉE (jamais la première) ──
  await page.click('[data-feed-card-id="post-scenes-mixed"] [data-feed-scene-index="1"] button');
  await page.waitForSelector('[data-scene-fullscreen] [data-scene-viewer-page]');
  await page.waitForTimeout(120); // `ResizeObserver`/`fitScene` peint la boîte après le montage

  const fullscreen = await page.evaluate(() => {
    const dialog = document.querySelector('[data-scene-fullscreen]');
    // La fenêtre de rendu (±1, `rendersFullPixels`) monte AUSSI les scènes
    // VOISINES — `[data-scene-viewer-page]` existe donc pour PLUSIEURS pages
    // à la fois ; seule celle à `translateX(0%)` est la page COURANTE (même
    // repère que `currentPage()`, `media-viewer.test.tsx`).
    const activePage = [...dialog.querySelectorAll('[data-viewer-page]')].find((p) => p.style.transform === 'translateX(0%)');
    const box = activePage.querySelector('[data-scene-viewer-page] > div');
    const r = box.getBoundingClientRect();
    return { index: dialog.getAttribute('data-viewer-index'), width: r.width, height: r.height, centerX: r.left + r.width / 2, centerY: r.top + r.height / 2 };
  });

  check(fullscreen.index === '1', `[${viewport.width}×${viewport.height}] #6902 : index courant attendu "1" (la scène TOUCHÉE) — reçu "${fullscreen.index}"`);

  /**
   * #7040 — LA PORTE DE SORTIE TIENT DANS LE CADRE.
   *
   * #7037 (iOS) a rendu une croix à `x = −326,3` pour un viewport de 402 pt :
   * entièrement hors de l'écran, sur le plein écran d'une pièce jointe. Le
   * plateau y adoptait la largeur du CARROUSEL et toutes ses couches
   * s'alignaient sur ce cadre-là plutôt que sur l'écran — un motif qui ne
   * demande qu'un `ZStack` de trop pour se rejouer ici, où le même plein écran
   * monte AUSSI les pages voisines (`rendersFullPixels`).
   *
   * Aucun gate du dépôt ne savait dire ça : `reachAtRest` EXCLUAIT du relevé ce
   * dont le centre sortait du cadre (le lot qui porte cette ligne), et le seul
   * invariant de confinement existant (`check-thread-chrome.mjs:554-571`, la
   * capsule de synchronisation) ne couvrait pas les plein écran. Il y est
   * porté, aux DEUX gabarits que cette fonction joue déjà.
   */
  const porte = await confinementDe(page, '[data-scene-fullscreen] .media-viewer-close', { nom: 'la croix du plein écran de scène' });
  check(porte.ok, `[${viewport.width}×${viewport.height}] #7040 : ${porte.message}`);

  const ratioCard = sceneBoxBefore.width / sceneBoxBefore.height;
  const ratioFullscreen = fullscreen.width / fullscreen.height;
  check(
    Math.abs(ratioCard - ratioFullscreen) <= 0.01,
    `[${viewport.width}×${viewport.height}] #6902 : rapport largeur/hauteur — carte ${ratioCard.toFixed(4)} vs plein écran ${ratioFullscreen.toFixed(4)} (écart ${Math.abs(ratioCard - ratioFullscreen).toFixed(4)}, ≤ 0,01)`,
  );
  check(
    Math.abs(fullscreen.centerX - viewport.width / 2) <= 1,
    `[${viewport.width}×${viewport.height}] #6902 : centre X ${fullscreen.centerX.toFixed(2)} — attendu ${(viewport.width / 2).toFixed(2)} (±1 px)`,
  );
  check(
    Math.abs(fullscreen.centerY - viewport.height / 2) <= 1,
    `[${viewport.width}×${viewport.height}] #6902 : centre Y ${fullscreen.centerY.toFixed(2)} — attendu ${(viewport.height / 2).toFixed(2)} (±1 px)`,
  );

  // ── 9. `history.back()` ferme la couche, sans entrée fantôme ni vidéo en lecture ──
  await page.goBack();
  await page.waitForTimeout(100);
  const afterBack = await page.evaluate(() => ({
    dialog: document.querySelector('[data-scene-fullscreen]') !== null,
    playing: [...document.querySelectorAll('video')].some((v) => !v.paused),
    path: location.pathname,
  }));
  check(!afterBack.dialog, `[${viewport.width}×${viewport.height}] #6902 : [data-scene-fullscreen] encore présent après history.back()`);
  check(!afterBack.playing, `[${viewport.width}×${viewport.height}] #6902 : une <video> encore en lecture après history.back()`);
  check(afterBack.path === '/feed', `[${viewport.width}×${viewport.height}] #6902 : /feed attendu après history.back() — reçu "${afterBack.path}"`);

  check(pageErrors.length === 0, `[${viewport.width}×${viewport.height}] #6902 : ${pageErrors.length} erreur(s) de page — ${pageErrors.slice(0, 3).join(' | ')}`);
  await context.close();
}

await fullscreenInvariants({ width: 390, height: 844 });
await fullscreenInvariants({ width: 320, height: 568 });

/* ── 10. un post à SCÈNE SANS AUCUN MÉDIA (texte seul) s'ouvre AUSSI — la
 * SCÈNE décide, jamais le média (`post-scene-text`, une seule scène, aucun
 * `PostMedia`). */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
  await page.waitForSelector('[data-feed-card-id="post-scene-text"] [data-feed-scene] button');
  await page.click('[data-feed-card-id="post-scene-text"] [data-feed-scene] button');
  await page.waitForSelector('[data-scene-fullscreen]');
  const opened = await page.evaluate(() => document.querySelector('[data-scene-fullscreen] [data-scene-viewer-page]') !== null);
  check(opened, "#6902 : post-scene-text (aucun média) ne s'ouvre pas en plein écran — la scène doit décider, pas le média");
  check(pageErrors.length === 0, `#6902 (post-scene-text) : ${pageErrors.length} erreur(s) de page — ${pageErrors.slice(0, 3).join(' | ')}`);
  await context.close();
}

/* -- 11. `?scene=N` — LE LIEN PROFOND DU DETAIL (revue-correction #6902,
 * item F de la specification). Livre SANS aucun temoin : ni test, ni section
 * de gate ne l'exercait, alors que la specification en annoncait deux (T5 et
 * « gate 10 »). Trois mesures : l'index demande est bien celui qui s'ouvre,
 * un index HORS BORNES tombe sur la derniere scene (`boundedSceneIndex`) au
 * lieu d'une page vide, et `history.back()` rend l'ecran du detail INTACT --
 * l'entree de la couche est consommee, jamais celle de l'ecran. */
for (const [asked, expected] of [
  ['1', '1'],
  ['9', '2'],
  ['-3', '0'],
]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/post/post-scenes-mixed?scene=${asked}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-scene-fullscreen] [data-scene-viewer-page]', { timeout: 10000 }).catch(() => {});
  const index = await page.evaluate(() => document.querySelector('[data-scene-fullscreen]')?.getAttribute('data-viewer-index') ?? null);
  check(index === expected, `#6902 : /post/post-scenes-mixed?scene=${asked} — index courant attendu "${expected}", recu "${index}"`);

  if (asked === '1') {
    await page.goBack();
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => ({
      dialog: document.querySelector('[data-scene-fullscreen]') !== null,
      card: document.querySelector('[data-feed-card-id="post-scenes-mixed"]') !== null,
      path: location.pathname,
    }));
    check(!after.dialog, '#6902 : la couche du lien profond survit a history.back()');
    check(after.card, "#6902 : history.back() a quitte le DETAIL au lieu de ne fermer que la couche");
    check(after.path === '/post/post-scenes-mixed', `#6902 : /post/post-scenes-mixed attendu apres history.back() — recu "${after.path}"`);
  }

  check(pageErrors.length === 0, `#6902 (?scene=${asked}) : ${pageErrors.length} erreur(s) de page — ${pageErrors.slice(0, 3).join(' | ')}`);
  await context.close();
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-feed-scenes : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-feed-scenes : vert — ${invariants} invariants (clair + sombre) : une publication v:3 se lit dans le fil avec ` +
    "tous ses objets (texte seul, image, cadrage plafonné 1,4), chaque tuile d'un agencement montre la scène de sa " +
    'slide, une seule scène cinématique joue à la fois, et `prefers-reduced-motion` en tient une hors du jeu.',
);
