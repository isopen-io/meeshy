#!/usr/bin/env node
/**
 * LE PROFIL A UN EFFET — et on peut l'atteindre (#6289, #5562).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la projection et le
 * masquage de `GET /me`, la frontière Zod d'un `PATCH`, l'édition optimiste et
 * son retour arrière, la descente du Prisme après un changement de langue, la
 * recompression bornée. Aucun ne traverse le CÂBLAGE ni la FEUILLE DE STYLE —
 * un bouton « Enregistrer » inerte, une bannière dont le contrôle passe sous un
 * disque flottant, un champ dont le focus s'efface ou une photo qui part
 * entière les laissent tous verts. Ce gate les mesure dans un navigateur réel,
 * sur le `dist` construit (source fixtures : « Awa Diallo », deux langues du
 * Prisme), dans les DEUX schémas et aux deux gabarits de la charte
 * (390 × 844, 320 × 568) :
 *
 *  1. `/me` rend le profil — bannière, avatar, nom, @identifiant, identité,
 *     contact MASQUÉ, trois rangs du Prisme, quatre statistiques, progression,
 *     demandes, ancienneté — et plus l'écran d'attente ;
 *  2. AU REPOS, chaque contrôle et chaque texte visible retombe sur lui-même à
 *     son centre (`elementFromPoint`) — aucun disque flottant n'en vole un — et
 *     chaque contrôle fait au moins 44 de haut ; les contrôles plus bas se
 *     mesurent une fois amenés au milieu de l'écran ;
 *  3. les textes tiennent AA dans les deux schémas ;
 *  4. « Modifier » ouvre quatre champs dont le COUPLE DE FOCUS tient (les
 *     quatre invariants de `check-field-focus.mjs`, que ce lot ne peut pas
 *     modifier : une branche voisine le tient) ; un nom changé puis
 *     « Enregistrer » se lit AUSSITÔT dans la bannière et dans l'identité ;
 *  5. un rang du Prisme s'ouvre sur la feuille des langues, une langue choisie
 *     s'y inscrit (dans sa langue, `lang=`), et « Retirer » la retire ;
 *  6. une photo de téléphone (4032 × 3024) part RECOMPRESSÉE : les octets
 *     réellement montés sont mesurés, et la photo se peint ;
 *  7. hors ligne, le profil reste lisible, le dit, et ses gestes d'écriture sont
 *     désactivés ;
 *  8. aucune erreur de page.
 *
 * SECONDE PASSE (#7083) — `/u/<pseudo>`, LE PROFIL PUBLIC DE QUELQU'UN, dans
 * les MÊMES quatre combinaisons : les trois blocs, le bandeau tapable dont
 * « Messages » et « Traductions » sont ABSENTS (le défaut d'iOS qu'on ne copie
 * pas), le filtre et la pagination MESURÉS À L'EFFET (le nombre de cartes) —
 * et mesurés ENSEMBLE, parce que c'est leur COMBINAISON qui casse : un filtre
 * qui retirerait « Charger plus » laisserait la tuile promettre « 2 Réels »
 * au-dessus d'une liste d'UN, sans aucun geste pour atteindre le second,
 * l'action relationnelle optimiste dans la MÊME image, « Écrire » qui mène à
 * un fil, le refus qui ne répète pas le pseudo demandé, l'atteignabilité et le
 * contraste AA.
 *
 * CE QUE CE GATE NE PEUT PAS PROUVER, et qui doit être dit : le chemin SERVICE
 * WORKER (rechargement à FROID hors ligne). `startDistServer(DIST, {
 * serviceWorker: false })` sert le `dist` SANS coquille. Cette moitié est
 * prouvée par `lib/net/network-only-navigations.test.ts` (la navigation `/u/`
 * revient à la coquille depuis #7083) et par la recette manuelle. Ce qui est
 * mesuré ici est l'autre moitié : hors ligne, la fiche DÉJÀ visitée se repeint
 * depuis le cache persisté et ses gestes d'écriture sont désactivés.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { reachAtRest, resumeExclusions } from './lib/reach-at-rest.mjs';

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
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const WCAG_AA = 4.5;
/** iOS : `ImageCompressor.compressOffMain(image, maxSizeKB: 500)` pour l'avatar. */
const AVATAR_CEILING = 500_000;

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
  controls: 'header a, header button, #contenu a, #contenu button',
  texts: '#contenu h2, [data-profile-hero] p, #contenu section .text-body, #contenu section .text-caption',
};

/**
 * Chaque contrôle du contenu, amené au milieu de l'écran puis mesuré.
 *
 * `enProse` distingue un lien EN LIGNE dans une phrase (`#livraison`,
 * `@kwame-mensah` dans le texte d'une publication) d'une cible autonome. Le
 * plancher de {@link TAP_FLOOR} ne s'applique pas au premier : une ligne de
 * texte fait 18 px, et l'agrandir DÉFORMERAIT la phrase — c'est l'exception
 * « inline » de WCAG 2.5.8, pas une tolérance. L'atteignabilité (`ok`), elle,
 * est mesurée pour TOUS : un lien de prose volé par un disque flottant reste
 * un défaut.
 *
 * `href` sert la SECONDE exception de la même clause — « Equivalent » : une
 * cible sous le plancher est admise quand la MÊME fonction est atteignable par
 * un autre contrôle de la page qui, lui, tient les 44 px. C'est exactement la
 * forme que #7241 a posée : le NOM d'une personne mène où mène son AVATAR, et
 * l'avatar est un carré de 44 px collé à lui. Grandir le nom à 44 px de haut
 * couvrirait l'horodatage au-dessus et le texte en dessous — on remplacerait
 * une cible étroite par une cible qui VOLE ses voisines.
 *
 * **Et l'équivalence se MESURE, elle ne se déclare pas.** Un attribut posé sur
 * le lien dirait qu'un jumeau existe sans l'avoir jamais vu ; le gate cherche
 * donc, dans ce qu'il vient de relever, un contrôle de MÊME `href` qui tient le
 * plancher. Le jour où l'avatar cesse d'être rendu à côté du nom, l'exemption
 * disparaît d'elle-même et ce gate rougit.
 */
const reachScrolled = async (page) => {
  const count = await page.$$eval('#contenu a, #contenu button', (els) => els.length);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      await page.evaluate(async (n) => {
        const el = document.querySelectorAll('#contenu a, #contenu button')[n];
        el.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          nom: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
          ok: hit !== null && (hit === el || el.contains(hit)),
          hauteur: r.height,
          href: el.getAttribute('href'),
          enProse: el.closest('[data-rich-text]') !== null,
        };
      }, i),
    );
  }
  await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
  return out;
};

/** Les quatre invariants du couple de focus (`check-field-focus.mjs`). */
const focusCouples = async (page) => {
  const selector = '#contenu .field-box :is(input, textarea)';
  const count = await page.$$eval(selector, (els) => els.length);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(({ s, n }) => document.querySelectorAll(s)[n].blur(), { s: selector, n: i });
    await page.waitForTimeout(120);
    const rest = await page.evaluate(({ s, n }) => {
      const box = getComputedStyle(document.querySelectorAll(s)[n].parentElement);
      return { color: box.borderTopColor, width: box.borderTopWidth };
    }, { s: selector, n: i });
    await page.evaluate(({ s, n }) => document.querySelectorAll(s)[n].focus(), { s: selector, n: i });
    await page.waitForTimeout(120);
    out.push(
      await page.evaluate(
        ({ s, n, r }) => {
          const el = document.querySelectorAll(s)[n];
          const c = getComputedStyle(el);
          const box = getComputedStyle(el.parentElement);
          return {
            champ: el.id,
            ok:
              c.boxShadow === 'none' &&
              c.outlineStyle === 'none' &&
              box.borderTopColor !== r.color &&
              box.borderTopWidth !== r.width,
            boxShadow: c.boxShadow,
            outline: c.outlineStyle,
            bordure: `${r.color} ${r.width} → ${box.borderTopColor} ${box.borderTopWidth}`,
          };
        },
        { s: selector, n: i, r: rest },
      ),
    );
  }
  return out;
};

/** Une photo de téléphone : 4032 × 3024, du bruit (incompressible), JPEG à 0,95. */
const phonePhoto = (page) =>
  page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4032;
    canvas.height = 3024;
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      image.data[i] = Math.abs(v) * 255;
      image.data[i + 1] = (i / 4) % canvas.width % 256;
      image.data[i + 2] = Math.floor(i / 4 / canvas.width) % 256;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
    return { base64: btoa(chunks.join('')), size: bytes.length };
  });

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. le profil, et plus l'écran d'attente
      await page.goto(`${BASE}/me`, { waitUntil: 'load' });
      await page.waitForSelector('[data-profile-hero]');
      await page.waitForSelector('section[aria-labelledby="profile-identity"]');
      await page.waitForSelector('[data-stat="totalMessages"]');
      await page.waitForTimeout(300);
      check((await textOf(page, '[data-profile-hero] p')) === 'Awa Diallo', `${label} : la bannière porte le nom (« ${await textOf(page, '[data-profile-hero] p')} »)`);
      check((await textOf(page, '[data-profile-hero] p:last-of-type')) === '@vous', `${label} : et l'@identifiant`);
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      const sections = await page.$$eval('#contenu section h2', (els) => els.map((el) => (el.textContent ?? '').trim()));
      check(
        ['IDENTITÉ', 'CONTACT', 'LANGUES', 'STATISTIQUES', 'DEMANDES', 'MEMBRE DEPUIS'].every((title) => sections.includes(title)),
        `${label} : les six sections d'iOS, dans l'écran (${JSON.stringify(sections)})`,
      );
      const contact = await textOf(page, 'section[aria-labelledby="profile-contact"]');
      check(contact !== null && contact.includes('a•••@meeshy.example') && !/@meeshy\.example/.test(contact.replace('a•••@meeshy.example', '')), `${label} : le contact se lit MASQUÉ`);
      check((await page.$$('[data-prism-rank]')).length === 3, `${label} : trois rangs du Prisme`);
      check((await textOf(page, '[data-stat="totalMessages"] strong')) === '1204', `${label} : les statistiques servies`);
      check((await page.getAttribute('[data-profile-progression]', 'href')) === '/me/progression', `${label} : la progression mène à /me/progression`);
      check((await textOf(page, '[data-pending-requests]')) === '3', `${label} : les demandes d'amis portent leur compte`);
      await capture(page, `profil-${scheme}-${width}x${height}`);

      // ------------------------------------------------ 2. atteignabilité
      const rest = await reachAtRest(page, REACH);
      const blocked = rest.controls.filter((c) => !c.ok);
      /* Au repos, hors édition, l'écran n'expose que le retour et « Modifier » :
         la bannière et l'avatar sont à LIRE, pas à toucher. Les rangs du Prisme
         et les entrées se mesurent plus bas, amenés au milieu de l'écran. */
      check(rest.controls.length >= 2, `${label} : le retour et « Modifier » mesurés au repos (${rest.controls.length}, ${resumeExclusions(rest)})`);
      check(blocked.length === 0, `${label} : aucun contrôle n'est volé à son centre au repos — ${JSON.stringify(blocked)}`);
      const stolen = rest.texts.filter((t) => !t.ok);
      check(rest.texts.length >= 4, `${label} : au moins quatre textes visibles mesurés au repos (${rest.texts.length})`);
      check(stolen.length === 0, `${label} : aucun texte n'est volé à son centre au repos — ${JSON.stringify(stolen)}`);
      const small = rest.controls.filter((c) => c.hauteur < TAP_FLOOR);
      check(small.length === 0, `${label} : chaque contrôle fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);
      const scrolled = await reachScrolled(page);
      const unreachable = scrolled.filter((c) => !c.ok || c.hauteur < TAP_FLOOR);
      check(scrolled.length >= 6 && unreachable.length === 0, `${label} : chaque contrôle du contenu s'atteint (${scrolled.length}) — ${JSON.stringify(unreachable)}`);

      // ------------------------------------------------ 3. contraste AA
      const inks = {
        nom: await contrastOf(page, '[data-profile-hero] p'),
        identifiant: await contrastOf(page, '[data-profile-hero] p:last-of-type'),
        titreSection: await contrastOf(page, '#profile-identity'),
        modifier: await contrastOf(page, '[data-profile-edit]'),
        libelle: await contrastOf(page, 'section[aria-labelledby="profile-identity"] .text-caption'),
        valeur: await contrastOf(page, 'section[aria-labelledby="profile-identity"] .text-body'),
        badge: await contrastOf(page, 'section[aria-labelledby="profile-contact"] .text-chip'),
        langue: await contrastOf(page, '[data-prism-rank="systemLanguage"] [lang]'),
        statistique: await contrastOf(page, '[data-stat="totalMessages"] strong'),
        libelleStatistique: await contrastOf(page, '[data-stat="totalMessages"] .text-chip'),
        demandes: await contrastOf(page, '[data-pending-requests]'),
      };
      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte du profil tient AA — ${JSON.stringify(inks)}`);

      // ------------------------------------------------ 4. l'édition : focus, puis enregistrement optimiste
      await page.click('[data-profile-edit]');
      await page.waitForSelector('#profile-displayName');
      const couples = await focusCouples(page);
      check(couples.length === 4, `${label} : l'édition ouvre quatre champs (${couples.length})`);
      const halves = couples.filter((c) => !c.ok);
      check(halves.length === 0, `${label} : chaque champ garde son couple de focus entier — ${JSON.stringify(halves)}`);
      await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
      await page.waitForTimeout(150);
      const picks = (await reachAtRest(page, REACH)).controls.filter((c) => /photo de profil|bannière/.test(c.nom));
      check(
        picks.length === 2 && picks.every((c) => c.ok && c.hauteur >= TAP_FLOOR),
        `${label} : en édition, les deux contrôles d'image s'atteignent au repos, hors des disques — ${JSON.stringify(picks)}`,
      );
      await capture(page, `profil-edition-${scheme}-${width}x${height}`);
      await page.fill('#profile-displayName', 'Awa D.');
      await page.fill('#profile-bio', 'Traductrice, Dakar.');
      await page.click('[data-profile-save]');
      /* « Aussitôt » = au rendu qui suit le geste, borné à une seconde : lire
         dans la même évaluation que le clic mesurerait l'état d'AVANT le rendu. */
      const optimistic = await page
        .waitForFunction(() => document.querySelector('[data-profile-hero] p')?.textContent === 'Awa D.', undefined, { timeout: 1000 })
        .then(() => true, () => false);
      check(optimistic, `${label} : le nom changé se lit aussitôt dans la bannière`);
      await page.waitForFunction(() => document.querySelector('[data-profile-notice]')?.textContent === 'Profil enregistré');
      const identity = await textOf(page, 'section[aria-labelledby="profile-identity"]');
      check(identity !== null && identity.includes('Awa D.') && identity.includes('Traductrice, Dakar.'), `${label} : l'identité porte le nom et la bio enregistrés`);
      check((await page.$('#profile-displayName')) === null, `${label} : enregistré, l'édition se referme`);

      // ------------------------------------------------ 5. un rang du Prisme
      await page.click('[data-prism-rank="customDestinationLanguage"] button');
      await page.waitForSelector('dialog[open]');
      await capture(page, `profil-langues-${scheme}-${width}x${height}`);
      await page.click('dialog[open] button:has([lang="es"])');
      await page.waitForSelector('[data-prism-rank="customDestinationLanguage"] [lang="es"]');
      check((await page.$('dialog[open]')) === null, `${label} : choisir une langue referme la feuille`);
      check(
        (await textOf(page, '[data-prism-rank="customDestinationLanguage"] [lang="es"]')) === 'Español',
        `${label} : la langue choisie s'inscrit, nommée dans sa langue`,
      );
      await page.click('[data-prism-clear="customDestinationLanguage"]');
      await page.waitForFunction(() => document.querySelector('[data-prism-rank="customDestinationLanguage"] [lang]') === null);
      check(
        ((await textOf(page, '[data-prism-rank="customDestinationLanguage"]')) ?? '').includes('Aucune'),
        `${label} : « Retirer » retire la langue du rang`,
      );

      // ------------------------------------------------ 6. la photo part recompressée
      if (width === 390) {
        const photo = await phonePhoto(page);
        await page.click('[data-profile-edit]');
        await page.waitForSelector('[data-profile-pick="avatar"]');
        await page.setInputFiles('[data-profile-file="avatar"]', {
          name: 'IMG_0042.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from(photo.base64, 'base64'),
        });
        await page.waitForSelector('[data-profile-notice][data-uploaded-bytes]', { timeout: 20_000 });
        const sent = Number(await page.getAttribute('[data-profile-notice]', 'data-uploaded-bytes'));
        console.log(`        photo d'origine ${photo.size} o → montés ${sent} o`);
        check(photo.size > 2_000_000, `${label} : la photo d'essai pèse comme une photo de téléphone (${photo.size} o)`);
        check(sent > 0 && sent <= AVATAR_CEILING && sent * 5 < photo.size, `${label} : l'avatar part recompressé (${sent} o montés pour ${photo.size} o)`);
        check((await page.$('[data-profile-hero] img')) !== null, `${label} : la nouvelle photo se peint`);
        await page.click('[data-profile-cancel]');
      }

      // ------------------------------------------------ 7. hors ligne
      await context.setOffline(true);
      await page.waitForSelector('[data-profile-offline]');
      check(await page.$eval('[data-profile-edit]', (el) => el.disabled), `${label} : hors ligne, « Modifier » est désactivé`);
      check(
        (await page.$$eval('[data-prism-rank] button', (els) => els.filter((el) => !el.disabled).length)) === 0,
        `${label} : hors ligne, aucun rang du Prisme ne s'ouvre`,
      );
      check((await textOf(page, '[data-profile-hero] p')) !== null, `${label} : hors ligne, le profil reste lisible`);
      await capture(page, `profil-hors-ligne-${scheme}-${width}x${height}`);
      await context.setOffline(false);

      // ================================================ LE PROFIL PUBLIC DE QUELQU'UN (#7083)
      await context.setOffline(false);
      await page.goto(`${BASE}/u/kwame-mensah`, { waitUntil: 'load' });
      await page.waitForSelector('[data-user-hero]');
      await page.waitForSelector('[data-profile-posts] [data-feed-card-id]');

      // ------------------------------------------------ 9. l'identité et les trois blocs
      check((await textOf(page, '[data-user-hero] p')) === 'Kwame Mensah', `${label} : /u/ porte le nom (« ${await textOf(page, '[data-user-hero] p')} »)`);
      check((await textOf(page, '[data-user-hero] p:nth-of-type(2)')) === '@kwame-mensah', `${label} : /u/ porte l'@identifiant`);
      check((await page.$('[data-user-banner]')) !== null, `${label} : /u/ porte sa bannière`);
      const publicSections = await page.$$eval('#contenu section h2', (els) => els.map((el) => (el.textContent ?? '').trim()));
      check(
        JSON.stringify(publicSections) === JSON.stringify(['CONNEXION', 'PUBLICATIONS', 'STATISTIQUES']),
        `${label} : les trois blocs, dans l'ordre (${JSON.stringify(publicSections)})`,
      );
      await capture(page, `profil-public-${scheme}-${width}x${height}`);

      // ------------------------------------------------ 10. le bandeau, et ce qu'il NE dit pas
      const band = await page.$$eval('[data-profile-tile]', (els) =>
        els.map((el) => ({ cle: el.getAttribute('data-profile-tile'), texte: (el.textContent ?? '').trim(), bouton: el.querySelector('button') !== null })),
      );
      check(band.length === 3, `${label} : trois tuiles — ${JSON.stringify(band.map((t) => t.cle))}`);
      check(
        band.every((t) => /\d/.test(t.texte)),
        `${label} : chaque tuile porte son compte SERVI — ${JSON.stringify(band.map((t) => t.texte))}`,
      );
      /* iOS ouvre les stories parce qu'il a l'écran ; la v3.1 ne l'a pas —
         une tuile muette informe, un bouton sans effet mentirait (loi 4). */
      check(
        band.find((t) => t.cle === 'storiesCount')?.bouton === false && band.filter((t) => t.bouton).length === 2,
        `${label} : « Stories » n'est PAS un bouton, « Postes » et « Réels » le sont`,
      );
      /* LE DÉFAUT D'iOS QU'ON NE COPIE PAS : `servedUserStats` retire quatre
         compteurs à un tiers ; iOS les décode en 0 et annonce « 0 Messages ». */
      const statsText = (await textOf(page, '[data-profile-stats]')) ?? '';
      check(
        !statsText.includes('Messages') && !statsText.includes('Traductions'),
        `${label} : un compteur ABSENT ne peint AUCUNE tuile — « ${statsText.slice(0, 90)} »`,
      );

      /* LA RÈGLE 1 DU PRISME, sur le prisme à UN échelon de ce contexte
         (`fr-FR` ⇒ `['fr']`) : la publication espagnole n'a QUE des
         traductions anglaises, donc l'ORIGINAL est servi. Un rendu qui
         tomberait sur « la première traduction » montrerait l'anglais.
         L'autre moitié — le rang 2 — se mesure en `en-US`, après la boucle. */
      const serviFr = (await textOf(page, '[data-feed-card-id="ap-1"]')) ?? '';
      check(
        serviFr.includes('el informe') && !serviFr.includes('the report'),
        `${label} : prisme ['fr'] — aucune traduction ne matche ⇒ l'ORIGINAL, jamais « la première »`,
      );

      // ------------------------------------------------ 11. le filtre a un EFFET, et il se DÉFAIT
      const cardCount = () => page.$$eval('[data-profile-posts] [data-feed-card-id]', (els) => els.length);
      const allCards = await cardCount();
      await page.click('[data-profile-filter="reels"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-profile-posts] [data-feed-card-id]').length < n, allCards, { timeout: 1000 });
      const reelCards = await cardCount();
      check(reelCards > 0 && reelCards < allCards, `${label} : toucher « Réels » filtre le listing (${allCards} → ${reelCards})`);
      await page.click('[data-profile-filter="reels"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-profile-posts] [data-feed-card-id]').length === n, allCards, { timeout: 1000 });
      check((await cardCount()) === allCards, `${label} : re-toucher la MÊME tuile rétablit tout`);

      // ------------------------------------------------ 12. la pagination a un EFFET, et le FILTRE ne la MURE pas
      /* Le filtre est CLIENT (sur les pages déjà lues) et la tuile annonce un
         compte SERVEUR (`expand=stats`) : tant que « Charger plus » manque sous
         un filtre, le bandeau promet « 2 Réels » au-dessus d'une liste d'UN et
         plus aucun geste n'atteint le second. La pagination se mesure donc
         SOUS le filtre — c'est la combinaison qui casse, pas chaque moitié. */
      check((await page.$('[data-profile-posts-more]')) !== null, `${label} : une seconde page est annoncée`);
      await page.click('[data-profile-filter="reels"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-profile-posts] [data-feed-card-id]').length < n, allCards, { timeout: 1000 });
      check((await page.$('[data-profile-posts-more]')) !== null, `${label} : sous un filtre, « Charger plus » reste OFFERT`);
      /* ET LA TROISIÈME COMBINAISON DU MÊME COUPLE (revue #7083, défaut
         majeur 2) : le correctif qui a rendu « Charger plus » visible sous un
         filtre a OUVERT l'image inverse — « Aucun réel · Touchez à nouveau la
         tuile pour tout revoir » peint SOUS une tuile disant « 2 Réels », avec
         « Charger plus » juste en dessous. Les deux branches du rendu sont
         DISJOINTES (`models.length === 0` d'un côté, `hasNextPage` de
         l'autre) : chaque moitié se mesurait verte séparément, jamais leur
         coexistence. Ici on garde l'INVARIANT — jamais les deux ensemble.
         L'ÉTAT lui-même (page sans aucun réel ET suite annoncée) n'est pas
         atteignable depuis le corpus de fixtures, dont la première page porte
         un réel : il est mesuré par montage réel dans
         `routes/user-profile.test.tsx` § « le vide filtré et la page qui reste
         à lire », qui sème le cache. */
      check(
        (await page.$('[data-profile-posts-empty]')) === null || (await page.$('[data-profile-posts-more]')) === null,
        `${label} : jamais « aucun résultat » ET « Charger plus » dans la même image`,
      );
      /* « CHARGER PLUS » EST UN GESTE COMME LES AUTRES (revue #7083, défaut
         majeur 4) : il restait ACTIF hors ligne et le tap ne changeait ni la
         liste, ni le libellé, ni l'état — TanStack met la page en PAUSE, donc
         l'écran ne passe jamais par `isError`, le seul chemin qui aurait peint
         « Réessayer ». L'utilisateur touchait un contrôle et l'application se
         taisait. On mesure l'EFFET du tap, pas seulement l'attribut.

         LA SONDE EST ICI, et pas dans la section HORS LIGNE plus bas : le
         cache des publications est PERSISTÉ (`query-client.ts`), donc une
         fiche rouverte après la section 12 revient DÉJÀ paginée jusqu'au bout
         et n'a plus de bouton du tout. Mesurer un contrôle absent rendrait un
         gate vert sur un geste jamais regardé. */
      await context.setOffline(true);
      const avantTapHorsLigne = await cardCount();
      /* L'ATTENTE FAIT PARTIE DE LA MESURE : `setOffline` coupe le RÉSEAU, la
         bascule de `navigator.onLine` arrive par un événement, et React
         redessine au tour suivant. Lire l'attribut dans la foulée mesurerait
         l'image d'AVANT la coupure — un gate vert sur un bouton jamais
         regardé hors ligne. */
      const desarme = await page
        .waitForSelector('[data-profile-posts-more][disabled]', { timeout: 3000 })
        .then(() => true, () => false);
      check(desarme, `${label} : hors ligne, « Charger plus » se désarme avec ses voisins`);
      await page.click('[data-profile-posts-more]', { force: true }).catch(() => null);
      await page.waitForTimeout(400);
      check(
        (await cardCount()) === avantTapHorsLigne,
        `${label} : hors ligne, le tap sur « Charger plus » ne change RIEN (${avantTapHorsLigne})`,
      );
      await context.setOffline(false);
      const rearme = await page
        .waitForSelector('[data-profile-posts-more]:not([disabled])', { timeout: 5000 })
        .then(() => true, () => false);
      check(rearme, `${label} : et il se RÉARME au retour du réseau — jamais un geste perdu pour la session`);
      /* SON ENCRE SE MESURE ICI, tant qu'il existe — la dernière page le
         retire, et une mesure faite plus bas rendrait `null` pour un contrôle
         simplement absent, c'est-à-dire un gate vert sur une couleur jamais
         regardée. */
      const chargerPlusInk = await contrastOf(page, '[data-profile-posts-more]');
      const promised = Number((await textOf(page, '[data-profile-tile="reelsCount"] strong')) ?? '0');
      await page.click('[data-profile-posts-more]');
      const held = await page
        .waitForFunction((n) => document.querySelectorAll('[data-profile-posts] [data-feed-card-id]').length === n, promised, { timeout: 3000 })
        .then(() => true, () => false);
      check(held, `${label} : la tuile est TENUE — ${promised} réels annoncés, ${await cardCount()} servis`);
      await page.click('[data-profile-filter="reels"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-profile-posts] [data-feed-card-id]').length > n, allCards, { timeout: 1000 });
      const grown = await cardCount();
      check(grown > allCards, `${label} : « Charger plus » ajoute des cartes (${allCards} → ${grown})`);
      check((await page.$('[data-profile-posts-more]')) === null, `${label} : le bouton disparaît sur la dernière page`);

      // ------------------------------------------------ 13. atteignabilité et contraste AA
      const publicRest = await reachAtRest(page, REACH);
      const publicBlocked = publicRest.controls.filter((c) => !c.ok);
      check(publicBlocked.length === 0, `${label} : /u/ — aucun contrôle volé à son centre au repos — ${JSON.stringify(publicBlocked)}`);
      const publicScrolled = await reachScrolled(page);
      /* LES DESTINATIONS QUI ONT DÉJÀ UNE GRANDE PORTE — mesurées sur le
         relevé lui-même, jamais déclarées (voir `reachScrolled`). */
      const grandesPortes = new Set(
        publicScrolled.filter((c) => c.hauteur >= TAP_FLOOR && c.href !== null).map((c) => c.href),
      );
      const publicUnreachable = publicScrolled.filter(
        (c) =>
          !c.ok ||
          (!c.enProse && c.hauteur < TAP_FLOOR && !(c.href !== null && grandesPortes.has(c.href))),
      );
      check(
        publicScrolled.length >= 6 && publicUnreachable.length === 0,
        `${label} : /u/ — chaque contrôle s'atteint et fait ${TAP_FLOOR} de haut (${publicScrolled.length}) — ${JSON.stringify(publicUnreachable)}`,
      );
      const publicInks = {
        nom: await contrastOf(page, '[data-user-hero] p'),
        identifiant: await contrastOf(page, '[data-user-hero] p:nth-of-type(2)'),
        titreSection: await contrastOf(page, '#user-profile-posts'),
        valeurTuile: await contrastOf(page, '[data-profile-tile="postsCount"] strong'),
        libelleTuile: await contrastOf(page, '[data-profile-tile="postsCount"] .text-chip'),
        valeurStat: await contrastOf(page, '[data-profile-stat="languagesUsed"] strong'),
        ajouter: await contrastOf(page, '[data-profile-action="add"]'),
        /* « ÉCRIRE » ET « CHARGER PLUS » entrent à la revue de #7083 : la
           liste mesurait deux boutons sur quatre, et les DEUX qu'elle sautait
           étaient précisément ceux à l'encre `--color-ios-brand` — 3,84 en
           clair pour « Écrire », le geste que l'audience de cet écran vient
           chercher. Une liste d'encres nommée À LA MAIN ne mesure que ce que
           son auteur soupçonne : elle se relit quand un bouton s'ajoute. */
        ecrire: await contrastOf(page, '[data-profile-action="write"]'),
        chargerPlus: chargerPlusInk,
        bloquer: await contrastOf(page, '[data-profile-action="block"]'),
        membreDepuis: await contrastOf(page, '[data-profile-member-since]'),
      };
      const publicFaibles = Object.entries(publicInks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(publicFaibles.length === 0, `${label} : /u/ — chaque texte tient AA — ${JSON.stringify(publicInks)}`);

      // ------------------------------------------------ 14. l'action relationnelle est OPTIMISTE, dans les DEUX sens
      /* « Aussitôt » = au rendu qui suit le geste, borné à une seconde — même
         mesure que l'enregistrement optimiste de `/me` ci-dessus. Le geste
         INVERSE est joué dans la foulée : il prouve l'autre moitié de la loi,
         ET il rend la fixture à son état initial, sans quoi les trois
         combinaisons suivantes ouvriraient la fiche déjà « en attente ». */
      const relationTurned = async (selector) =>
        page.waitForFunction((s) => document.querySelector(s) !== null, selector, { timeout: 1000 }).then(() => true, () => false);
      await page.click('[data-profile-action="add"]');
      check(await relationTurned('[data-profile-action="cancel"]'), `${label} : « Ajouter » passe la fiche « en attente » dans la même image`);
      check(
        (await textOf(page, '[data-profile-context]'))?.includes('Kwame Mensah') === true,
        `${label} : la bannière de contexte dit de QUI il s'agit`,
      );
      /* « Annuler » attend sa LIGNE : la passerelle ne sert pas l'identifiant
         de la demande (`relationAvec` jette `id`), l'écran charge donc le
         panier des envoyées et le bouton reste désactivé tant qu'il ne l'a
         pas — un geste qui n'aurait rien à envoyer mentirait. Ce qui se mesure
         ici est que l'attente est BORNÉE, pas qu'elle n'existe pas. */
      const cancelArmed = await page
        .waitForSelector('[data-profile-action="cancel"]:not([disabled])', { timeout: 3000 })
        .then(() => true, () => false);
      check(cancelArmed, `${label} : « Annuler » s'arme dès que sa ligne arrive`);
      if (cancelArmed) {
        await page.click('[data-profile-action="cancel"]');
        check(await relationTurned('[data-profile-action="add"]'), `${label} : « Annuler » rend la fiche à « Ajouter », aussi vite`);
      }

      // ------------------------------------------------ 15. hors ligne, la fiche reste lisible
      await context.setOffline(true);
      await page.waitForSelector('[data-profile-offline]');
      check((await textOf(page, '[data-user-hero] p')) === 'Kwame Mensah', `${label} : hors ligne, la fiche reste lisible`);
      check(
        (await page.$$eval('[data-profile-action]', (els) => els.filter((el) => !el.disabled).length)) === 0,
        `${label} : hors ligne, aucun geste d'écriture ne part`,
      );
      /* UNE SEULE VOIX POUR L'ÉTAT RÉSEAU (revue #7083, défaut majeur 5, D-11)
         — la pastille globale peignait « Hors ligne » PAR-DESSUS le titre
         « Hors ligne » de la carte de l'écran : le même mot deux fois, dont
         une moitié masquée par l'autre. La loi vit dans
         `lib/view/sync-pill-voice.ts`. */
      const chevauche = await page.evaluate(() => {
        const pastille = document.querySelector('[data-sync-pill]');
        const carte = document.querySelector('[data-profile-offline]');
        if (pastille === null || carte === null) return false;
        const a = pastille.getBoundingClientRect();
        const b = carte.getBoundingClientRect();
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      });
      check(!chevauche, `${label} : une seule voix hors ligne — la pastille globale ne recouvre pas la carte de l'écran`);
      await capture(page, `profil-public-hors-ligne-${scheme}-${width}x${height}`);
      await context.setOffline(false);

      // ------------------------------------------------ 16. « Écrire » mène à un fil
      await page.goto(`${BASE}/u/kwame-mensah`, { waitUntil: 'load' });
      await page.waitForSelector('[data-profile-action="write"]');
      await page.click('[data-profile-action="write"]');
      await page.waitForFunction(() => window.location.pathname.startsWith('/c/'), undefined, { timeout: 3000 });
      check(page.url().includes('/c/'), `${label} : « Écrire » mène au fil (${page.url().replace(BASE, '')})`);
      check((await page.waitForSelector('main', { timeout: 5000 }).then(() => true, () => false)), `${label} : et le fil s'ouvre`);

      // ------------------------------------------------ 17. le refus ne répète RIEN
      await page.goto(`${BASE}/u/personne-qui-nexiste-pas`, { waitUntil: 'load' });
      await page.waitForSelector('#contenu p');
      await page.waitForTimeout(200);
      const refusal = (await textOf(page, '#contenu')) ?? '';
      check(refusal.includes('Ce profil n’est pas accessible'), `${label} : un profil refusé le dit — « ${refusal.slice(0, 60)} »`);
      check(
        !refusal.toLowerCase().includes('introuvable') && !(await page.content()).includes('personne-qui-nexiste-pas'),
        `${label} : le refus ne laisse RIEN déduire — ni « introuvable », ni le pseudo demandé`,
      );
      check((await page.$('[data-profile-retry]')) === null, `${label} : un refus n'offre pas « Réessayer »`);

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }
  /**
   * LE PRISME DU BLOC PUBLICATIONS, SUR UN RANG AUTRE QUE LE PREMIER (#7083).
   *
   * Les quatre combinaisons ci-dessus tournent en `fr-FR`, donc sur un prisme
   * à UN seul échelon (`['fr']`) : la publication espagnole y est servie en
   * ESPAGNOL, ce qui est la règle 1 du Prisme (aucune traduction ne matche ⇒
   * l'original) mais ne prouve RIEN sur la descente. Un contexte `en-US`
   * donne le prisme `['fr','en']` : la MÊME publication doit alors se lire en
   * ANGLAIS — c'est le rang 2, et un bloc qui ne descendrait que le rang 1
   * montrerait encore l'espagnol. Même dispositif que `check-rich-text.mjs`,
   * qui ouvre lui aussi un second contexte pour cette seule mesure.
   */
  const rangContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', locale: 'en-US' });
  const rangPage = await rangContext.newPage();
  rangPage.setDefaultTimeout(10_000);
  await rangPage.goto(`${BASE}/u/kwame-mensah`, { waitUntil: 'load' });
  await rangPage.waitForSelector('[data-profile-posts] [data-feed-card-id]');
  const servi = (await textOf(rangPage, '[data-feed-card-id="ap-1"]')) ?? '';
  check(servi.includes('the report is ready'), `prisme ['fr','en'] : la publication espagnole se lit au RANG 2 — « ${servi.slice(0, 70)} »`);
  check(!servi.includes('el informe'), `prisme ['fr','en'] : et l'original n'est plus le texte servi`);
  await rangContext.close();
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Les deux profils se lisent, s’atteignent et tiennent AA — /me se modifie, /u/ publie, filtre, pagine et connecte.\n');
