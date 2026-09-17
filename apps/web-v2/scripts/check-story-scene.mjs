/**
 * LE LECTEUR DE STORY REND SES SCÈNES v3 (#6899) — dans un VRAI navigateur, sur
 * le document PRODUIT (`dist/`). Les témoins unitaires prouvent les lois (image
 * seule, bandes, plateau, son de fond élu) ; ce gate prouve que le lecteur les
 * PEINT, et mesure l'EFFET, jamais la présence d'une balise :
 *
 *  1. `/story/st-scene` (verdict `canvas`) — le texte de l'objet est servi au
 *     Prisme, RANG 2 (`en`), avec `lang` ; la carte est 9:16 (décision #6896)
 *     et CENTRÉE (±1 px) dans le plateau du lecteur (en-tête 72, bas 64,
 *     côtés 8 — `readerCanvasFraming`), aux DEUX tailles ; les bandes sont
 *     habillées.
 *  2. LE PLACEHOLDER EST PEINT AVANT LE SIGNAL « PRÊT » — le moteur (chunk
 *     `scene-player-*`) est RETENU par `page.route` : tant qu'il ne charge pas,
 *     la carte ne peut pas être prête. On lit alors les PIXELS de la carte, à
 *     la peinture (deux `requestAnimationFrame`, jamais `complete` — leçon du
 *     2026-09-12) : ils doivent porter la couleur moyenne du ThumbHash de la
 *     SLIDE (rose ambré), pas celle de la bande (brun, le hash du MÉDIA) ni le noir
 *     du lecteur. Puis on libère le moteur : `data-story-ready` arrive et le
 *     placeholder s'efface.
 *  3. LE SON DE FOND — le bouton dit l'état RÉEL de la piste (refusée par la
 *     politique de lecture automatique ⇒ `aria-pressed="true"`, jouée ⇒
 *     `"false"`), chaque toucher le change, et une fois le son rendu le
 *     `currentTime` AVANCE. L'appui long met en pause la piste ET la barre
 *     (deux lectures égales) et passe la scène en plein bord ; un tap latéral
 *     reprend sans naviguer, et le temps avance de nouveau.
 *  4. `/story/st-scene-image-text` (verdict `imageOnly`, texte DANS l'image) —
 *     le moteur reste monté, rogné au rectangle de l'image : le texte se LIT
 *     (rang 2, `lang`). Épinglée à 3 s : à 2 s la barre dépasse 55 % — la loi
 *     du contenu (plancher 6 s) la tiendrait à 33 %.
 *  5. `/story/st-scene-image` (une image SEULE) — l'image à son rectangle 16:9
 *     centré, AUCUN `[data-scene-player]`, aucune bande, aucun bouton son.
 *  6. CONTRE-ÉPREUVE v1 — `/story/st-amie-2` ne monte aucune carte de scène.
 *  7. Aucune erreur de page ; clair et sombre rendent les MÊMES mesures (le
 *     lecteur force son canevas sombre, `story.tsx`).
 *
 * Les valeurs attendues (textes, couleurs) sont RECOPIÉES ici à dessein : un
 * attendu relu dans le code serait vert sur un code faux.
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

/** Les cotes du plateau iOS, RECOPIÉES (`StoryViewerView+Canvas.swift:1186-1190`). */
const HEADER_INSET = 72;
const BOTTOM_INSET = 64;
const SIDE_INSET = 8;

/**
 * La couleur MOYENNE d'un ThumbHash (spécification d'Evan Wallace, fonction
 * `thumbHashToAverageRGBA`), recopiée ici pour que l'attendu ne soit pas lu
 * dans `lib/media/thumbhash.ts` — le code mesuré.
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
const SLIDE_RGB = averageRgbOfThumbHash('LHkC');
const MEDIA_RGB = averageRgbOfThumbHash('EHoC');
const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** La couleur DOMINANTE d'une capture, décodée par un `<canvas>` de la page. */
async function dominantRgb(page, clip) {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const bitmap = new Image();
    await new Promise((ok, ko) => {
      bitmap.onload = ok;
      bitmap.onerror = ko;
      bitmap.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((x, y) => y[1] - x[1]);
    return top[0].split(',').map(Number);
  }, shot.toString('base64'));
}

const twoFrames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const readBox = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);

const round = (v) => Math.round(v * 100) / 100;

const browser = await launchChromium();

async function runScheme(colorScheme) {
  const measures = {};
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const tag = `[${colorScheme} ${viewport.width}×${viewport.height}]`;
    // `serviceWorkers: 'block'` : une requête servie par le service worker
    // échapperait à `page.route`, et le moteur ne serait jamais retenu.
    const context = await browser.newContext({ colorScheme, locale: 'en-US', viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    /* ── 2. le placeholder AVANT « prêt » — moteur retenu ─────────────── */
    let releaseEngine = () => {};
    const engineHeld = new Promise((resolve) => {
      releaseEngine = resolve;
    });
    await page.route('**/assets/scene-player-*.js', async (route) => {
      await engineHeld;
      await route.continue();
    });

    await page.goto(`${BASE}/story/st-scene`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-scene-box][data-story-verdict="canvas"] [data-story-placeholder]', { timeout: 8000 });
    await twoFrames(page);
    const box = await readBox(page, '[data-story-scene-box]');
    const avantPret = await page.evaluate(() => {
      const el = document.querySelector('[data-story-scene-box]');
      const placeholder = el?.querySelector('[data-story-placeholder]');
      return {
        pret: el?.hasAttribute('data-story-ready') ?? null,
        opacite: placeholder === null || placeholder === undefined ? null : getComputedStyle(placeholder).opacity,
        barre: document.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow') ?? null,
      };
    });
    check(avantPret.pret === false, `${tag} st-scene : la carte se dit PRÊTE alors que le moteur n'a pas chargé — ${JSON.stringify(avantPret)}`);
    check(avantPret.barre === '0', `${tag} st-scene : la barre avance (${avantPret.barre} %) avant que le contenu soit prêt`);
    if (box !== null) {
      const inner = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.3, width: box.width * 0.5, height: box.height * 0.4 };
      const peint = await dominantRgb(page, inner);
      check(
        distance(peint, SLIDE_RGB) <= 12,
        `${tag} st-scene : AVANT « prêt », la carte peint ${peint} — attendu le ThumbHash de la slide ${SLIDE_RGB} ` +
          `(bande : ${MEDIA_RGB}) ; opacité du placeholder ${avantPret.opacite}`,
      );
    } else {
      check(false, `${tag} st-scene : aucune carte [data-story-scene-box]`);
    }
    releaseEngine();
    await page.waitForSelector('[data-story-scene-box][data-story-ready]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(260);
    const apresPret = await page.evaluate(() => {
      const el = document.querySelector('[data-story-scene-box]');
      const placeholder = el?.querySelector('[data-story-placeholder]');
      return {
        pret: el?.hasAttribute('data-story-ready') ?? null,
        opacite: placeholder === null || placeholder === undefined ? null : getComputedStyle(placeholder).opacity,
      };
    });
    check(apresPret.pret === true && apresPret.opacite === '0', `${tag} st-scene : moteur libéré, la carte n'est pas prête ou le placeholder reste — ${JSON.stringify(apresPret)}`);

    /* ── 1. texte au Prisme, carte 9:16 centrée dans le plateau, bandes ── */
    const scene = await page.evaluate(() => {
      const card = document.querySelector('[data-story-scene-box]');
      const text = card?.querySelector('[data-scene-text]');
      return {
        texte: text?.textContent ?? null,
        lang: text?.getAttribute('lang') ?? null,
        bande: card?.querySelector('[data-scene-letterbox]') !== null,
        fond: document.querySelector('[data-story-backdrop]') !== null,
      };
    });
    check(scene.texte === 'Golden hour, on the bands', `${tag} st-scene : texte servi « ${scene.texte} » — attendu la traduction anglaise (rang 2)`);
    check(scene.lang === 'en', `${tag} st-scene : lang "${scene.lang}" — attendu "en"`);
    check(scene.bande, `${tag} st-scene : fond ajusté + texte sur la bande, et aucune bande habillée`);
    check(scene.fond, `${tag} st-scene : aucun fond flou plein écran [data-story-backdrop]`);

    const carte = await readBox(page, '[data-story-scene-box]');
    const plateau = {
      cx: viewport.width / 2,
      cy: (HEADER_INSET + (viewport.height - BOTTOM_INSET)) / 2,
      maxWidth: viewport.width - 2 * SIDE_INSET,
      maxHeight: viewport.height - BOTTOM_INSET - HEADER_INSET,
    };
    if (carte !== null) {
      const cx = carte.x + carte.width / 2;
      const cy = carte.y + carte.height / 2;
      check(Math.abs(cx - plateau.cx) <= 1 && Math.abs(cy - plateau.cy) <= 1, `${tag} st-scene : carte centrée en (${round(cx)}, ${round(cy)}) — plateau (${plateau.cx}, ${plateau.cy})`);
      check(Math.abs(carte.width / carte.height - 9 / 16) <= 0.01, `${tag} st-scene : carte de rapport ${round(carte.width / carte.height)} — la scène est TOUJOURS 9:16 (#6896)`);
      check(
        carte.width <= plateau.maxWidth + 1 && carte.height <= plateau.maxHeight + 1,
        `${tag} st-scene : carte ${round(carte.width)}×${round(carte.height)} hors du plateau ${plateau.maxWidth}×${plateau.maxHeight}`,
      );
      measures[`${viewport.width}.carte`] = [round(carte.x), round(carte.y), round(carte.width), round(carte.height)];
    }

    /* ── 3. le son de fond : le bouton dit la VÉRITÉ, et il a un effet ─── */
    /* La politique de lecture automatique n'est PAS stable sous Chromium
       piloté : mesuré le 2026-09-17, la même page sans geste voit la piste
       REFUSÉE, et AUTORISÉE dès qu'une capture a précédé la lecture (`page.
       screenshot` suffit). Ce gate ne suppose donc aucun des deux : il exige
       que le bouton dise l'état RÉEL de la piste, puis que chaque toucher le
       fasse changer. */
    const lirePiste = () =>
      page.evaluate(() => {
        const audio = document.querySelector('[data-scene-sound-track]');
        return {
          piste: audio !== null,
          paused: audio?.paused ?? null,
          muted: audio?.muted ?? null,
          t: audio?.currentTime ?? null,
          bouton: document.querySelector('[data-story-sound-toggle]')?.getAttribute('aria-pressed') ?? null,
        };
      });
    const initial = await lirePiste();
    check(initial.piste, `${tag} st-scene : aucune piste de fond [data-scene-sound-track]`);
    const audible = initial.paused === false && initial.muted === false;
    check(
      initial.bouton === (audible ? 'false' : 'true'),
      `${tag} st-scene : le bouton son MENT sur la piste — ${JSON.stringify(initial)} (refusée ⇒ « muet », jouée ⇒ « son »)`,
    );
    if (audible) {
      await page.click('[data-story-sound-toggle]');
      const coupee = await lirePiste();
      check(coupee.bouton === 'true' && coupee.muted === true, `${tag} st-scene : toucher « muet » ne coupe pas la piste — ${JSON.stringify(coupee)}`);
    }
    await page.click('[data-story-sound-toggle]');
    const t0 = (await lirePiste()).t;
    await page.waitForTimeout(800);
    const apresToucher = await lirePiste();
    check(
      apresToucher.bouton === 'false' && apresToucher.muted === false && apresToucher.paused === false && t0 !== null && apresToucher.t !== null && apresToucher.t > t0,
      `${tag} st-scene : après le toucher, la piste doit jouer, SONORE — t0=${t0}, ${JSON.stringify(apresToucher)}`,
    );

    const centre = { x: viewport.width / 2, y: viewport.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    const pendantAppui = await page.evaluate(() => ({
      paused: document.querySelector('[data-scene-sound-track]')?.paused ?? null,
      barre: document.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow') ?? null,
    }));
    await page.waitForTimeout(400);
    const barrePlusTard = await page.evaluate(() => document.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow') ?? null);
    const pleinBord = await readBox(page, '[data-story-scene-box]');
    await page.mouse.up();
    check(
      pendantAppui.paused === true && pendantAppui.barre === barrePlusTard,
      `${tag} st-scene : l'appui long doit geler la piste ET la barre — ${JSON.stringify(pendantAppui)}, barre 400 ms plus tard ${barrePlusTard}`,
    );
    check(
      pleinBord !== null && Math.abs(pleinBord.width - viewport.width) <= 1,
      `${tag} st-scene : chrome masqué, la scène doit passer en plein bord — largeur ${pleinBord === null ? 'absente' : round(pleinBord.width)} pour ${viewport.width}`,
    );
    await page.mouse.click(viewport.width * 0.08, centre.y);
    const t1 = await page.evaluate(() => document.querySelector('[data-scene-sound-track]')?.currentTime ?? null);
    await page.waitForTimeout(700);
    const reprise = await page.evaluate(() => ({
      t: document.querySelector('[data-scene-sound-track]')?.currentTime ?? null,
      paused: document.querySelector('[data-scene-sound-track]')?.paused ?? null,
      scene: document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null,
    }));
    check(
      reprise.scene === 'st-scene' && reprise.paused === false && t1 !== null && reprise.t !== null && reprise.t !== t1,
      `${tag} st-scene : le tap latéral doit reprendre sans naviguer, la piste avançant de nouveau — t1=${t1}, ${JSON.stringify(reprise)}`,
    );

    /* ── 4. l'image seule AVEC un texte dedans : le texte se lit ────────── */
    await page.goto(`${BASE}/story/st-scene-image-text`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-scene-box][data-story-ready] [data-scene-text]', { timeout: 8000 }).catch(() => {});
    const debut = Date.now();
    const imageTexte = await page.evaluate(() => {
      const card = document.querySelector('[data-story-scene-box]');
      const text = card?.querySelector('[data-story-image-only-clip] [data-scene-text]');
      return {
        verdict: card?.getAttribute('data-story-verdict') ?? null,
        texte: text?.textContent ?? null,
        lang: text?.getAttribute('lang') ?? null,
        moteur: card?.querySelector('[data-scene-player]') !== null,
        bande: card?.querySelector('[data-scene-letterbox]') !== null,
      };
    });
    check(
      imageTexte.verdict === 'imageOnly' && imageTexte.moteur && !imageTexte.bande,
      `${tag} st-scene-image-text : attendu l'image seule rognée, moteur monté, sans bande — ${JSON.stringify(imageTexte)}`,
    );
    check(
      imageTexte.texte === 'Inside the picture' && imageTexte.lang === 'en',
      `${tag} st-scene-image-text : le texte posé DANS l'image doit se lire (rang 2, lang en) — ${JSON.stringify(imageTexte)}`,
    );
    await page.waitForTimeout(Math.max(0, 2000 - (Date.now() - debut)));
    const aDeuxSecondes = await page.evaluate(() => ({
      scene: document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null,
      barre: Number(document.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow') ?? '-1'),
    }));
    check(
      aDeuxSecondes.scene === 'st-scene-image-text' && aDeuxSecondes.barre >= 55,
      `${tag} st-scene-image-text : épinglée à 3 s, la barre est à ${aDeuxSecondes.barre} % après 2 s (scène ${aDeuxSecondes.scene}) — ` +
        'la loi du contenu (plancher 6 s) la tiendrait vers 33 % : `timelineDuration` n\'est pas autoritaire.',
    );

    /* ── 5. une image SEULE : aucune scène montée ───────────────────────── */
    await page.goto(`${BASE}/story/st-scene-image`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-image-only]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const imageSeule = await page.evaluate(() => ({
      moteur: document.querySelectorAll('[data-scene-player]').length,
      bande: document.querySelectorAll('[data-scene-letterbox]').length,
      bouton: document.querySelector('[data-story-sound-toggle]') !== null,
    }));
    const image = await readBox(page, '[data-story-image-only]');
    check(
      image !== null && imageSeule.moteur === 0 && imageSeule.bande === 0 && !imageSeule.bouton,
      `${tag} st-scene-image : l'image seule ne doit monter ni moteur, ni bande, ni bouton son — image ${JSON.stringify(image)}, ${JSON.stringify(imageSeule)}`,
    );
    if (image !== null) {
      const cx = image.x + image.width / 2;
      const cy = image.y + image.height / 2;
      check(Math.abs(image.width / image.height - 16 / 9) <= 0.01, `${tag} st-scene-image : image de rapport ${round(image.width / image.height)} — attendu 16:9`);
      check(Math.abs(cx - plateau.cx) <= 1 && Math.abs(cy - plateau.cy) <= 1, `${tag} st-scene-image : image centrée en (${round(cx)}, ${round(cy)}) — plateau (${plateau.cx}, ${plateau.cy})`);
      measures[`${viewport.width}.image`] = [round(image.x), round(image.y), round(image.width), round(image.height)];
    }

    /* ── 6. contre-épreuve : le chemin v1 ne monte aucune scène ─────────── */
    await page.goto(`${BASE}/story/st-amie-2`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-scene]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const v1 = await page.evaluate(() => ({
      carte: document.querySelectorAll('[data-story-scene-box]').length,
      images: document.querySelectorAll('[data-story-scene] img').length,
    }));
    check(v1.carte === 0 && v1.images >= 1, `${tag} st-amie-2 (v1) : le chemin v1 doit rester une image, sans carte de scène — ${JSON.stringify(v1)}`);

    check(pageErrors.length === 0, `${tag} erreurs de page : ${pageErrors.join(' | ')}`);
    await context.close();
  }
  return measures;
}

const clair = await runScheme('light');
const sombre = await runScheme('dark');
check(
  JSON.stringify(clair) === JSON.stringify(sombre),
  `clair et sombre ne rendent pas la même géométrie — clair ${JSON.stringify(clair)} / sombre ${JSON.stringify(sombre)}`,
);

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`check-story-scene : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-story-scene : vert — ${invariants} invariants : le lecteur rend la scène v3 par le moteur partagé (texte au Prisme, ` +
    'carte 9:16 centrée dans le plateau aux deux tailles, bandes habillées), peint son placeholder AVANT « prêt », ' +
    'joue son son de fond au geste et le gèle à l\'appui, lit un texte posé dans une image seule, présente l\'image seule ' +
    'sans moteur, épingle sa durée sur la timeline, et laisse le chemin v1 intact — clair et sombre identiques.',
);
