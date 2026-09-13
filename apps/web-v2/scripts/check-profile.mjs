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
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { contrastOf } from './lib/contrast.mjs';

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

/** Au repos : chaque contrôle et chaque texte VISIBLE, à son centre. */
const reachAtRest = (page) =>
  page.evaluate(() => {
    const by = (hit) => (hit === null ? 'rien' : hit.closest('.floating-menus') !== null ? 'un disque flottant' : hit.tagName);
    const visible = (r) => {
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return r.width > 0 && r.height > 0 && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
    };
    const measure = (el) => {
      const r = el.getBoundingClientRect();
      if (!visible(r)) return [];
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return [
        {
          nom: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
          ok: hit !== null && (hit === el || el.contains(hit)),
          par: by(hit),
          hauteur: r.height,
        },
      ];
    };
    const controls = [...document.querySelectorAll('header a, header button, #contenu a, #contenu button')].flatMap(measure);
    const texts = [...document.querySelectorAll('#contenu h2, [data-profile-hero] p, #contenu section .text-body, #contenu section .text-caption')].flatMap(
      measure,
    );
    return { controls, texts };
  });

/** Chaque contrôle du contenu, amené au milieu de l'écran puis mesuré. */
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
      const rest = await reachAtRest(page);
      const blocked = rest.controls.filter((c) => !c.ok);
      /* Au repos, hors édition, l'écran n'expose que le retour et « Modifier » :
         la bannière et l'avatar sont à LIRE, pas à toucher. Les rangs du Prisme
         et les entrées se mesurent plus bas, amenés au milieu de l'écran. */
      check(rest.controls.length >= 2, `${label} : le retour et « Modifier » mesurés au repos (${rest.controls.length})`);
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
      const picks = (await reachAtRest(page)).controls.filter((c) => /photo de profil|bannière/.test(c.nom));
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

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Le profil se lit, se modifie, s’atteint et tient AA — et la photo part recompressée.\n');
