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
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
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
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

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
      texteDuPost: carteA.querySelector(':scope > div > p[lang]')?.textContent ?? null,
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
}

for (const scheme of ['light', 'dark']) await runScheme(scheme);

await browser.close();
server.close();

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
