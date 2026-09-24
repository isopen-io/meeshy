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
 *  7. LES RACCOURCIS NE VOLENT PAS LA FRAPPE D'UN CONTRÔLE (#7112, revue,
 *     D-91) — Espace ACTIVE le bouton du rail qui a le focus, « a b c » tapé
 *     dans le composeur de commentaire reste « a b c », une flèche pendant la
 *     frappe n'avance pas la story ; et sa CONTRE-ÉPREUVE, qui garde la
 *     cession FINE : une flèche alors qu'un BOUTON a le focus avance quand
 *     même. Trois symptômes, une cause, et aucun visible à un témoin de DOM :
 *     il faut un vrai clavier et un vrai focus.
 *     7 bis — ET LE MÊME DÉFAUT PAR LE DOIGT : deux taps sur la scène NUE
 *     au-dessus de la feuille ne doivent ni reprendre la lecture ni naviguer
 *     ni emporter le brouillon. « Une couche de saisie réclame le geste comme
 *     elle réclame la touche » (`screenGestureYields`, même module).
 *  8. Aucune erreur de page ; clair et sombre rendent les MÊMES mesures (le
 *     lecteur force son canevas sombre, `story.tsx`).
 *  9. LE RAIL AUTEUR COMPLET (#7116) — sur MA story (`/story/st-mienne`,
 *     session semée) : le rail porte EXACTEMENT Vues, Partager, Enregistrer,
 *     Commentaires, dans cet ordre, sans rien de ce qu'un lecteur ferait à la
 *     story d'autrui ; « Vues » ouvre la feuille (en-tête « 8 vues », trois
 *     lecteurs, story EN PAUSE, rail hors d'atteinte), Échap ferme LA FEUILLE
 *     — pas le lecteur, défaut mesuré sur le premier jet — et rend le focus
 *     à « Vues » ; « Partager » appelle la feuille du système SYNCHRONEMENT
 *     au clic (la seule preuve qu'elle s'ouvrirait sur Safari, D-48) avec
 *     l'adresse canonique ; « Enregistrer » pose l'anneau à SA place pendant
 *     que « Partager » reste un bouton, puis LIVRE `meeshy-m4.svg` et le dit
 *     — premier jet mesuré : aucun téléchargement, aucun anneau, aucun mot.
 *     Aucun de ces gestes ne fait avancer la story.
 *
 * Les valeurs attendues (textes, couleurs) sont RECOPIÉES ici à dessein : un
 * attendu relu dans le code serait vert sur un code faux.
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
const served = await startDistServer(DIST);
const BASE = served.base;

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
    /**
     * LE CHROME MASQUÉ NE DOIT PLUS ÊTRE UNE COMMANDE (D-90) — mesuré ICI
     * parce que la souris est DÉJÀ enfoncée : c'est le seul instant où
     * `chromeHidden` est vrai dans un VRAI navigateur, et le seul endroit du
     * dépôt où l'effet de `inert` se mesure pour de bon (happy-dom l'imite,
     * un navigateur l'APPLIQUE).
     *
     * TROIS moitiés, et il les faut toutes les trois : sous le voile le
     * bouton reste MONTÉ (le démonter referait la mise en page au
     * relâchement) et n'est plus ATTEIGNABLE ; le voile levé, il REDEVIENT
     * atteignable. Un témoin qui ne mesurerait que « monté » verdirait sur un
     * démontage — la régression que l'opacité existe pour éviter ; un témoin
     * qui ne mesurerait que « inatteignable » verdirait sur un `inert`
     * PERMANENT, c'est-à-dire sur un lecteur entièrement inerte.
     *
     * Le témoin interroge l'EFFET (`focus()` puis `activeElement`), jamais
     * l'attribut : un `inert` posé sur le mauvais nœud — le défaut RÉEL de
     * `story-rail.tsx`, dont le doublon s'était reconstitué sur l'enveloppe —
     * laisserait une assertion d'attribut verte.
     */
    const reachableCloseButton = () =>
      page.evaluate(() => {
        const closeButton = document.querySelector('button[aria-label="Fermer"]');
        if (closeButton === null) return { mounted: false, reachable: null };
        document.body.focus();
        closeButton.focus();
        return { mounted: true, reachable: document.activeElement === closeButton };
      });
    const maskedChrome = await reachableCloseButton();
    await page.mouse.up();
    check(
      maskedChrome.mounted === true && maskedChrome.reachable === false,
      `${tag} st-scene : chrome masqué, la croix doit rester MONTÉE mais devenir INATTEIGNABLE (D-90) — ${JSON.stringify(maskedChrome)}`,
    );
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
    /**
     * LA MOITIÉ QUE LE PREMIER JET DE D-90 N'AVAIT PAS (revue #7112) — il ne
     * mesurait que « inatteignable sous le voile ». Un `inert` POSÉ EN
     * PERMANENCE (l'accident classique d'un runtime qui rendrait
     * `inert={false}` par une chaîne vraie) satisfait cette moitié-là et tue
     * toute la commande du lecteur : le témoin serait resté VERT sur la pire
     * régression qu'il puisse y avoir.
     *
     * Elle se mesure ICI, pas au relâchement : une pause d'appui long
     * SURVIT au `mouse.up` par dessein (`onPointerUp` sort tout de suite si
     * `holdFired`), et c'est le tap latéral ci-dessus qui rend le chrome.
     * Mesuré : placé au relâchement, ce témoin rougissait aux quatre
     * configurations en accusant le code juste.
     */
    const shownChrome = await reachableCloseButton();
    check(
      shownChrome.mounted === true && shownChrome.reachable === true,
      `${tag} st-scene : chrome RENDU, la croix doit redevenir ATTEIGNABLE — un \`inert\` permanent passerait la moitié précédente (D-90) — ${JSON.stringify(shownChrome)}`,
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

    /* ── 7. LES RACCOURCIS DU LECTEUR NE VOLENT PAS LA FRAPPE D'UN CONTRÔLE
           (revue #7112, `lib/view/shortcut-scope.ts`) ───────────────────────
       Le lecteur écoute le clavier sur `window` ; sa feuille de commentaires
       (D-89) y a posé une zone de saisie. TROIS symptômes mesurés ici, une
       seule cause — un `preventDefault` d'écran sur une touche adressée au
       nœud qui a le focus :

         a. Espace sur un BOUTON du rail ne l'activait pas : le `click` d'un
            `<button>` naît du `keyup` d'Espace, que ce `preventDefault`
            supprime. Chaque bouton du lecteur n'était activable qu'à Entrée.
         b. « a b » tapé dans le composeur rendait « ab ».
         c. une flèche pendant la frappe faisait avancer la story, ce qui
            ferme la feuille et emporte le brouillon.

       Aucun des trois n'est visible à un témoin de DOM : il faut un vrai
       clavier, sur un vrai navigateur, avec un vrai focus. */
    await page.focus('[data-story-action="comments"]');
    await page.keyboard.press(' ');
    await page.waitForTimeout(350);
    const openedBySpace = (await page.$('[data-story-comments-sheet]')) !== null;
    check(
      openedBySpace,
      `${tag} st-amie-2 : ESPACE sur un bouton du rail qui a le focus doit l'ACTIVER — le raccourci de pause ne prend pas la touche d'un contrôle`,
    );
    /* LES TROIS SYMPTÔMES SE MESURENT SÉPARÉMENT — si le premier tombe, on
       ouvre la feuille au CLIC pour que les deux suivants rendent quand même
       leur verdict. Un `if` autour d'eux les aurait fait DISPARAÎTRE du
       décompte au lieu de rougir : une absence de témoin n'est pas un
       témoin vert, et c'est le compte d'invariants qui l'aurait dit tout bas. */
    if (!openedBySpace) {
      await page.click('[data-story-action="comments"]');
      await page.waitForTimeout(350);
    }
    await page.click('[data-comment-field]');
    await page.keyboard.type('a b c');
    const typed = await page.$eval('[data-comment-field]', (el) => el.value);
    check(typed === 'a b c', `${tag} st-amie-2 : « a b c » tapé dans le composeur doit rester « a b c » — obtenu ${JSON.stringify(typed)}`);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    const afterArrow = await page.evaluate(() => ({
      sheet: document.querySelector('[data-story-comments-sheet]') !== null,
      text: document.querySelector('[data-comment-field]')?.value ?? null,
    }));
    check(
      afterArrow.sheet === true && afterArrow.text === typed,
      `${tag} st-amie-2 : une flèche PENDANT la frappe ne doit ni avancer la story ni emporter le brouillon — ${JSON.stringify(afterArrow)}`,
    );

    /* ── 7 bis. LE MÊME DÉFAUT PAR L'AUTRE ENTRÉE : LE DOIGT (#7112, revue)
           ─────────────────────────────────────────────────────────────────
       La cession ci-dessus a été écrite pour les TOUCHES. La feuille
       n'occupe que le bas de l'écran ; les ~550 px de scène NUE au-dessus
       gardaient leurs trois bandes de geste vivantes. Un tap sur un bord y
       vaut « reprendre » (`decideTouchDown`, `lib/stories/gesture.ts`), la
       lecture repartait SOUS la feuille, la diapositive suivante arrivait,
       `setCommentsOpen(false)` fermait le fil — et le brouillon partait avec.

       LE TÉMOIN MESURE LA CAUSE, PAS SON DÉLAI. Attendre les six secondes de
       la diapositive rendrait un gate lent ET fragile ; ce qui se mesure ici
       est que la lecture N'A PAS REPRIS (`data-story-paused` tient) et que
       DEUX taps au bord — reprendre, puis naviguer — ne déplacent rien.
       C'est le scénario exact de la recette manuelle, en un dixième du temps. */
    const bordDroit = await page.$eval('[data-story-scene]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width * 0.9), y: Math.round(r.top + r.height * 0.25) };
    });
    const avantTap = await page.evaluate(() => document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null);
    await page.mouse.click(bordDroit.x, bordDroit.y);
    await page.waitForTimeout(150);
    await page.mouse.click(bordDroit.x, bordDroit.y);
    await page.waitForTimeout(350);
    const apresTap = await page.evaluate(() => ({
      story: document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null,
      pause: document.querySelector('[data-story-scene]')?.getAttribute('data-story-paused') ?? null,
      sheet: document.querySelector('[data-story-comments-sheet]') !== null,
      text: document.querySelector('[data-comment-field]')?.value ?? null,
    }));
    check(
      apresTap.story === avantTap && apresTap.pause === 'true' && apresTap.sheet === true && apresTap.text === typed,
      `${tag} st-amie-2 : DEUX taps sur la scène nue, feuille ouverte, ne doivent ni reprendre la lecture ni naviguer ni emporter le brouillon — ${avantTap} → ${JSON.stringify(apresTap)}`,
    );
    /* MÊME DISCIPLINE QU'AU SYMPTÔME a : si celui-ci tombe, la feuille a été
       emportée et les témoins SUIVANTS mourraient d'un `page.click` en
       timeout — un ROUGE qui accuse la mauvaise chose (30 s d'attente sur la
       croix, et le message de CE témoin jamais imprimé). On rouvre donc,
       après avoir rendu le verdict. */
    if (!apresTap.sheet) {
      await page.goto(`${BASE}/story/st-amie-2`, { waitUntil: 'load' });
      await page.waitForSelector('[data-story-action="comments"]', { timeout: 8000 });
      await page.click('[data-story-action="comments"]');
      await page.waitForSelector('[data-story-comments-close]', { timeout: 8000 });
    }
    /* ── 7 ter. LA FEUILLE ELLE-MÊME, HORS DE TOUT CHAMP (revue #6484) ────
       La cession des touches ne couvrait que les CONTRÔLES (7) : sur la
       feuille nue — qui PREND le focus à son montage —, une flèche avançait
       la story recouverte et Espace relançait sa lecture. Même loi que le
       doigt (7 bis) : feuille ouverte, les raccourcis du lecteur se taisent. */
    await page.focus('[data-story-comments-sheet]');
    const avantPanneau = await page.evaluate(() => document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    /* Un FAIT attendu, jamais un délai (`lib/fixed-delay-ratchet.test.ts`) :
       le défaut se voit dès que la story change, reprend ou perd sa feuille ;
       son absence se conclut à l'échéance. */
    await page
      .waitForFunction(
        (avant) => {
          const scene = document.querySelector('[data-story-scene]');
          return (
            scene?.getAttribute('data-story-scene') !== avant ||
            scene?.getAttribute('data-story-paused') !== 'true' ||
            document.querySelector('[data-story-comments-sheet]') === null
          );
        },
        avantPanneau,
        { timeout: 800 },
      )
      .catch(() => undefined);
    const apresPanneau = await page.evaluate(() => ({
      story: document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null,
      pause: document.querySelector('[data-story-scene]')?.getAttribute('data-story-paused') ?? null,
      sheet: document.querySelector('[data-story-comments-sheet]') !== null,
    }));
    check(
      apresPanneau.story === avantPanneau && apresPanneau.pause === 'true' && apresPanneau.sheet === true,
      `${tag} st-amie-2 : une flèche ou Espace sur la feuille nue ne doit ni avancer la story ni la relancer — ${avantPanneau} → ${JSON.stringify(apresPanneau)}`,
    );
    if (!apresPanneau.sheet) {
      await page.goto(`${BASE}/story/st-amie-2`, { waitUntil: 'load' });
      await page.waitForSelector('[data-story-action="comments"]', { timeout: 8000 });
      await page.click('[data-story-action="comments"]');
      await page.waitForSelector('[data-story-comments-close]', { timeout: 8000 });
    }
    /* LA CONTRE-ÉPREUVE DE LA CESSION — elle est FINE, et sans ce témoin rien
       n'empêcherait de la rendre GROSSIÈRE. Cliquer un bouton le FOCALISE
       (comportement natif) : si l'écran cédait TOUTE touche à un contrôle
       focalisé, les flèches cesseraient d'avancer la story dès le premier
       clic sur « muet » — un raccourci mort, pour corriger un vol de frappe.
       Un bouton ne réclame qu'Espace et Entrée ; les flèches restent à
       l'écran. */
    await page.click('[data-story-comments-close]');
    await page.waitForTimeout(250);
    /* LA FEUILLE REND LE FOCUS PAR OÙ IL EST ENTRÉ — elle le PREND au montage
       (sinon la touche suivante irait au plateau, qui navigue) ; ne pas le
       rendre le laisse tomber sur `<body>`, et au clavier on repart du haut
       du document pour retrouver le bouton qu'on venait d'actionner. */
    const focusRendu = await page.evaluate(() => document.activeElement?.getAttribute('data-story-action') ?? document.activeElement?.tagName ?? null);
    check(
      focusRendu === 'comments',
      `${tag} st-amie-2 : en se fermant, la feuille doit RENDRE le focus au bouton qui l'a ouverte — reçu ${JSON.stringify(focusRendu)}`,
    );
    await page.focus('[data-story-action="react"]');
    const sceneBeforeArrow = await page.evaluate(() => document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const sceneAfterArrow = await page.evaluate(() => document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null);
    check(
      sceneBeforeArrow !== null && sceneAfterArrow !== sceneBeforeArrow,
      `${tag} st-amie-2 : une flèche alors qu'un BOUTON a le focus doit rester un raccourci d'écran — story ${sceneBeforeArrow} → ${sceneAfterArrow}`,
    );

    check(pageErrors.length === 0, `${tag} erreurs de page : ${pageErrors.join(' | ')}`);
    await context.close();
  }
  return measures;
}

/** La session SEMÉE — le plan AUTEUR n'existe que pour un lecteur IDENTIFIÉ
 * comme l'auteur (`VIEWER_ID` = `u-viewer`, `fixtures-base.ts`) ; même forme
 * que `check-story-self-rail.mjs`. Sans elle, ce gate serait vert par
 * ABSENCE du rail qu'il mesure. */
const SEEDED_SESSION = JSON.stringify({
  token: 'gate-token',
  sessionToken: 'gate-session',
  user: { id: 'u-viewer', username: 'viewer-gate' },
  expiresAt: Date.now() + 3_600_000,
});

/**
 * ── 9. LE RAIL AUTEUR COMPLET (#7116) ─────────────────────────────────────
 *
 * DEUX RETENUES, posées par script d'initialisation parce que `page.route`
 * n'intercepte pas une adresse `data:` (le média de fixtures) :
 *  - `navigator.share` est REMPLACÉ par un enregistreur SYNCHRONE — le
 *    Chromium de CI n'a pas l'API, et c'est l'INSTANT de l'appel qui se mesure
 *    (dans le clic, avant tout `await`) ; `canShare` reste absent, donc la
 *    livraison du fichier passe par l'ancre de téléchargement, comme sur un
 *    navigateur de bureau ;
 *  - la lecture du média est RETARDÉE de 700 ms : sans elle, le
 *    téléchargement d'une image de fixtures finit avant qu'on puisse voir
 *    l'anneau, et la moitié « l'anneau REMPLACE Enregistrer, Partager reste »
 *    ne pourrait pas se mesurer.
 */
async function runAuthorRail(colorScheme) {
  const tag = `[${colorScheme} rail auteur]`;
  const context = await browser.newContext({
    colorScheme,
    locale: 'fr-FR',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  await context.addInitScript((session) => {
    localStorage.setItem('meeshy.session', session);
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data) => {
        window.__shareCalls.push(data.url);
        return Promise.resolve();
      },
    });
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).startsWith('data:image/svg')
        ? new Promise((resolve) => setTimeout(resolve, 700)).then(() => realFetch(input, init))
        : realFetch(input, init);
  }, SEEDED_SESSION);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/story/st-mienne`, { waitUntil: 'load' });
  await page.waitForSelector('[data-story-action-rail] [data-story-action]', { timeout: 8000 });
  const lecture = () =>
    page.evaluate(() => ({
      path: location.pathname,
      scene: document.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') ?? null,
      paused: document.querySelector('[data-story-scene]')?.getAttribute('data-story-paused') === 'true',
    }));
  /* La story tourne sur six secondes : chaque étape repart d'une lecture EN
     PAUSE (Espace, focus rendu au document), sans quoi un gate un peu lent
     verrait la story suivante et accuserait le mauvais défaut. */
  const figer = async () => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    if (!(await lecture()).paused) await page.keyboard.press(' ');
  };
  await figer();

  const rail = await page.$$eval('[data-story-action-rail] [data-story-action]', (els) => els.map((e) => e.getAttribute('data-story-action')));
  check(
    JSON.stringify(rail) === JSON.stringify(['views', 'share', 'save', 'comments']),
    `${tag} : le rail de MA story doit porter EXACTEMENT Vues, Partager, Enregistrer, Commentaires — reçu ${JSON.stringify(rail)}`,
  );
  const vuesCompte = await page.$eval('[data-story-action="views"]', (el) => el.textContent?.trim() ?? '');
  check(vuesCompte === '8', `${tag} : « Vues » doit porter le compte SERVI (8) — reçu « ${vuesCompte} »`);
  const cibles = await page.$$eval('[data-story-action-rail] [data-story-action]', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }),
  );
  check(cibles.every((c) => c >= 44), `${tag} : chaque bouton du rail doit se toucher sur 44 px — ${JSON.stringify(cibles)}`);

  /* ── « Vues » : la feuille, la pause, le rail hors d'atteinte ── */
  await page.click('[data-story-action="views"]');
  await page.waitForSelector('dialog[open] [data-story-viewer]', { timeout: 8000 }).catch(() => {});
  const feuille = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const views = document.querySelector('[data-story-action="views"]');
    document.body.focus();
    views?.focus();
    return {
      titre: dialog?.querySelector('h2')?.textContent ?? null,
      lignes: dialog?.querySelectorAll('[data-story-viewer]').length ?? 0,
      liens: [...(dialog?.querySelectorAll('[data-story-viewer] a') ?? [])].map((a) => a.getAttribute('href')),
      railAtteignable: document.activeElement === views,
    };
  });
  const pendantFeuille = await lecture();
  check(feuille.titre === '8 vues', `${tag} : l'en-tête de la feuille lit le compte AUTORITATIF — « ${feuille.titre} »`);
  check(feuille.lignes === 3, `${tag} : la feuille doit lister les trois lecteurs servis — ${feuille.lignes}`);
  check(
    JSON.stringify(feuille.liens) === JSON.stringify(['/u/noor.haddad', '/u/elan.roy', '/u/mika.sorel']),
    `${tag} : chaque lecteur mène à son profil — ${JSON.stringify(feuille.liens)}`,
  );
  check(pendantFeuille.paused, `${tag} : la story doit être EN PAUSE sous la feuille — ${JSON.stringify(pendantFeuille)}`);
  check(!feuille.railAtteignable, `${tag} : feuille ouverte, le rail ne doit plus être atteignable`);

  await page.keyboard.press('Escape');
  /* Un FAIT attendu, jamais un délai (`lib/fixed-delay-ratchet.test.ts`) : la
     feuille fermée ET la lecture repartie — ou le lecteur parti, le défaut
     que ce témoin existe pour attraper. */
  await page
    .waitForFunction(
      () =>
        document.querySelector('dialog[open]') === null &&
        (location.pathname !== '/story/st-mienne' || document.querySelector('[data-story-scene]')?.getAttribute('data-story-paused') !== 'true'),
      undefined,
      { timeout: 3000 },
    )
    .catch(() => {});
  const apresEchap = await lecture();
  const focusRendu = await page.evaluate(() => document.activeElement?.getAttribute('data-story-action') ?? document.activeElement?.tagName ?? null);
  check(
    apresEchap.path === '/story/st-mienne' && apresEchap.scene === 'st-mienne',
    `${tag} : Échap ferme la FEUILLE, jamais le lecteur — ${JSON.stringify(apresEchap)}`,
  );
  check(!apresEchap.paused, `${tag} : la feuille fermée, la lecture doit REPRENDRE — ${JSON.stringify(apresEchap)}`);
  check(focusRendu === 'views', `${tag} : la feuille fermée rend le focus à « Vues » — reçu ${JSON.stringify(focusRendu)}`);

  /* MÊME DISCIPLINE QU'AU § 7 : si Échap a emporté le lecteur, les témoins
     SUIVANTS mourraient d'un `page.click` en attente — un rouge qui accuse la
     mauvaise chose. Le verdict est rendu ci-dessus ; on rouvre MA story. */
  if (apresEchap.path !== '/story/st-mienne') {
    await page.goto(`${BASE}/story/st-mienne`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-action-rail] [data-story-action]', { timeout: 8000 });
  }

  /* ── « Partager » : la feuille du système, DANS le geste ── */
  await figer();
  const partage = await page.evaluate(() => {
    document.querySelector('[data-story-action="share"]')?.click();
    return window.__shareCalls.slice();
  });
  check(
    JSON.stringify(partage) === JSON.stringify(['https://meeshy.me/feeds/post/st-mienne']),
    `${tag} : « Partager » doit ouvrir la feuille du système PENDANT le clic, sur l'adresse canonique (D-48) — ${JSON.stringify(partage)}`,
  );

  /* ── « Enregistrer » : l'anneau à SA place, puis le fichier livré et dit ── */
  await figer();
  const telechargement = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  /* Un `click()` par la page, jamais `page.click` : un bouton ABSENT doit
     rendre son verdict ci-dessous (« l'anneau… », « livrer… »), pas trente
     secondes d'attente puis une exception qui tait ce qui manquait. */
  const offert = await page.evaluate(() => {
    const bouton = document.querySelector('[data-story-action="save"]');
    bouton?.click();
    return bouton !== null;
  });
  check(offert, `${tag} : « Enregistrer » doit être offert sur MA story, qui porte un média exportable`);
  await page.waitForSelector('[data-story-save-ring]', { timeout: 2000 }).catch(() => {});
  const pendantExport = await page.evaluate(() => ({
    anneau: document.querySelector('[data-story-save-ring]') !== null,
    enregistrer: document.querySelector('[data-story-action="save"]') !== null,
    partager: document.querySelector('[data-story-action="share"]')?.tagName ?? null,
  }));
  const annuler = await readBox(page, '[data-story-save-cancel]');
  check(
    pendantExport.anneau && !pendantExport.enregistrer && pendantExport.partager === 'BUTTON',
    `${tag} : pendant l'export, l'anneau REMPLACE « Enregistrer » et « Partager » reste un bouton — ${JSON.stringify(pendantExport)}`,
  );
  check(
    annuler !== null && annuler.width >= 44 && annuler.height >= 44,
    `${tag} : l'anneau annulable se touche sur 44 px — ${JSON.stringify(annuler)}`,
  );
  const fichier = await telechargement;
  const nom = fichier === null ? null : fichier.suggestedFilename();
  check(nom === 'meeshy-m4.svg', `${tag} : « Enregistrer » doit LIVRER le média de la story — reçu ${JSON.stringify(nom)}`);
  await page.waitForFunction(() => document.querySelector('[data-story-save-ring]') === null, undefined, { timeout: 3000 }).catch(() => {});
  const apresExport = await page.evaluate(() => ({
    enregistrer: document.querySelector('[data-story-action="save"]') !== null,
    annonce: document.querySelector('p[role="status"]')?.textContent ?? '',
  }));
  check(
    apresExport.enregistrer && apresExport.annonce === 'Story enregistrée',
    `${tag} : l'export fini, « Enregistrer » revient et l'issue est DITE — ${JSON.stringify(apresExport)}`,
  );

  const fin = await lecture();
  check(fin.scene === 'st-mienne', `${tag} : aucun geste du rail ne doit faire avancer la story — ${JSON.stringify(fin)}`);
  check(pageErrors.length === 0, `${tag} erreurs de page : ${pageErrors.join(' | ')}`);
  await context.close();
  return { rail, vuesCompte, titre: feuille.titre, lignes: feuille.lignes, partage, nom };
}

/**
 * #7040 — LA SEULE PORTE DE SORTIE DES ÉTATS D'ATTENTE LIT L'ENCOCHE.
 *
 * `story.tsx` posait la croix des états « Chargement… » et « Story introuvable »
 * à `top-3` SEC, pendant que le chrome du chemin CHARGÉ, douze lignes plus bas,
 * lit `calc(var(--safe-top, 0px) + 8px)`. Une divergence interne à un même
 * fichier, et sur l'état où l'utilisateur a le plus besoin de sortir : sur une
 * coque à encoche, sa seule issue passait SOUS la barre d'état.
 *
 * LE GATE SIMULE L'ENCOCHE, sinon il ne peut pas tomber. `--safe-top` vaut
 * `env(safe-area-inset-top, 0px)`, donc ZÉRO dans un Chromium de bureau : un
 * témoin qui ne la pose pas mesurerait un défaut de coque sur un appareil qui
 * n'en a pas, et resterait vert pour toujours. Les cotes recopiées sont celles
 * d'un iPhone à encoche (47 / 34 pt).
 *
 * Les deux états partagent le MÊME nœud : une mesure les couvre tous les deux.
 */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(`${BASE}/story/st-inconnue-du-corpus`, { waitUntil: 'load' });
  await page.addStyleTag({ content: ':root{--safe-top:47px;--safe-bottom:34px}' });
  await page.waitForSelector('[role="alert"]', { timeout: 8000 });

  const porte = await confinementDe(page, 'button[aria-label="Fermer"]', { nom: "la croix de l'état « Story introuvable »" });
  check(porte.ok, `#7040 : sous une encoche de 47, ${porte.message}`);
  await context.close();
}

const clair = await runScheme('light');
const sombre = await runScheme('dark');
check(
  JSON.stringify(clair) === JSON.stringify(sombre),
  `clair et sombre ne rendent pas la même géométrie — clair ${JSON.stringify(clair)} / sombre ${JSON.stringify(sombre)}`,
);
const auteurClair = await runAuthorRail('light');
const auteurSombre = await runAuthorRail('dark');
check(
  JSON.stringify(auteurClair) === JSON.stringify(auteurSombre),
  `rail auteur : clair et sombre ne rendent pas la même chose — clair ${JSON.stringify(auteurClair)} / sombre ${JSON.stringify(auteurSombre)}`,
);

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-story-scene : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-story-scene : vert — ${invariants} invariants : le lecteur rend la scène v3 par le moteur partagé (texte au Prisme, ` +
    'carte 9:16 centrée dans le plateau aux deux tailles, bandes habillées), peint son placeholder AVANT « prêt », ' +
    'joue son son de fond au geste et le gèle à l\'appui, lit un texte posé dans une image seule, présente l\'image seule ' +
    'sans moteur, épingle sa durée sur la timeline, laisse le chemin v1 intact, et porte le rail AUTEUR complet (Vues en ' +
    'pause, Échap qui ne ferme que la feuille, Partager dans le geste, Enregistrer qui livre) — clair et sombre identiques.',
);
