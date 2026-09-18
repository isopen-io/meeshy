#!/usr/bin/env node
/**
 * SES COMMUNAUTÉS SE LISENT, S'OUVRENT ET SE CRÉENT — et on peut les atteindre (#6364).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la projection des charges
 * de la passerelle, les bornes d'un brouillon, l'écriture du cache à la
 * création, la recherche servie depuis le cache, où chaque pièce mène. Aucun ne
 * traverse le CÂBLAGE ni la FEUILLE DE STYLE — une carte qu'un disque flottant
 * recouvre, un nom blanc illisible sur une communauté jaune, un refus 409 qui ne
 * se pose sous aucun champ, ou `/communities/new` lu comme l'identifiant d'une
 * communauté les laissent tous verts. Ce gate les mesure dans un navigateur
 * réel, sur le `dist` construit (source fixtures : trois communautés), dans les
 * DEUX schémas et aux deux gabarits de la charte (390 × 844, 320 × 568) :
 *
 *  1. `/communities` rend la grille des trois communautés — plus l'écran
 *     d'attente — et « + » mène à `/communities/new` ;
 *  2. AU REPOS, chaque contrôle et chaque texte visible retombe sur lui-même à
 *     son centre (`elementFromPoint`) — aucun disque flottant n'en vole un — et
 *     chaque contrôle fait au moins 44 de haut ; chaque carte s'atteint une fois
 *     amenée au milieu de l'écran ;
 *  3. les textes tiennent AA dans les deux schémas — ceux des CARTES mesurés
 *     contre le pixel le PLUS CLAIR réellement peint sous eux (texte masqué,
 *     capture, luminance maximale), parce qu'un fond en dégradé ne se lit pas
 *     dans `background-color` ;
 *  4. une recherche se peint depuis le cache en moins d'une seconde, une
 *     recherche sans réponse nomme ce qu'elle cherchait, et l'effacer rend la
 *     grille ;
 *  5. une carte ouvre SON détail (titre, compteurs, conversations), une
 *     conversation ouvre SON fil, et une adresse inconnue rend le refus ;
 *  6. la création : bouton désactivé tant que le nom manque, couple de focus
 *     des trois champs, aperçu vivant, 409 posé SOUS l'identifiant, puis une
 *     création qui REMPLACE l'écran par le détail et se lit en tête de liste au
 *     retour ;
 *  7. hors ligne, la liste reste lisible et le dit, et la création ne part pas ;
 *     la pastille de synchronisation ne recouvre pas la recherche (#6401) ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { syncPillOverlap } from './lib/sync-pill-clearance.mjs';

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

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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
    const controls = [...document.querySelectorAll('header a, header button, [data-community-back], [data-community-search], #contenu a, #contenu button')].flatMap(
      measure,
    );
    const texts = [...document.querySelectorAll('#contenu h1, [data-community-name], [data-community-counts], #contenu p, #contenu h2')].flatMap(measure);
    return { controls, texts };
  });

/** Chaque carte, amenée au milieu de l'écran puis mesurée. */
const reachCards = async (page) => {
  const ids = await page.$$eval('[data-community-card]', (els) => els.map((el) => el.getAttribute('data-community-card')));
  const out = [];
  for (const id of ids) {
    out.push(
      await page.evaluate(async (cardId) => {
        const el = document.querySelector(`[data-community-card="${cardId}"]`);
        el.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { carte: cardId, ok: hit !== null && el.contains(hit), hauteur: r.height };
      }, id),
    );
  }
  await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
  return out;
};

/**
 * LE CONTRASTE D'UN TEXTE BLANC SUR CE QUI EST PEINT SOUS LUI — le texte et ses
 * glyphes passent transparents le temps d'une capture de leur boîte, et la
 * luminance la PLUS HAUTE de la capture est le pire fond. Le décodage se fait
 * dans la page (Blob + `createImageBitmap`) : aucune requête, aucune CSP.
 */
const worstContrastUnderWhite = async (page, selector) => {
  /* Le défilement d'abord, et SEUL : la boîte lue dans la même évaluation que
     `scrollIntoView` est celle d'AVANT le défilement, et la capture tombait
     alors sur le texte voisin — mesuré, un nom à 1,27:1 qui était la
     description blanche de la carte, peinte là où le nom se trouvait. */
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await settle(page);
  await page.waitForTimeout(80);
  /* Sous les LIGNES de texte réellement posées (`Range.getClientRects`), jamais
     sous la boîte de l'élément : une boîte pleine largeur englobe l'anneau blanc
     de l'avatar voisin, où aucune lettre n'est peinte. */
  /* Deux pièges mesurés : un élément `line-clamp` rend aussi les rectangles de
     ses lignes MASQUÉES (posés sur les compteurs voisins), et un texte
     `sr-only` rend sa largeur NON rognée (jusque sur la carte d'à côté). Seuls
     les nœuds de texte visibles comptent, rognés à la boîte de l'élément. */
  const boxes = await page.$eval(selector, (el) => {
    const own = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.parentElement === null || node.parentElement.closest('.sr-only') !== null || (node.textContent ?? '').trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const left = Math.max(r.left, own.left, 0);
        const top = Math.max(r.top, own.top, 0);
        const right = Math.min(r.right, own.right, innerWidth);
        const bottom = Math.min(r.bottom, own.bottom, innerHeight);
        if (right - left > 1 && bottom - top > 1) lines.push({ x: left, y: top, width: right - left, height: bottom - top });
      }
    }
    [el, ...el.querySelectorAll('*')].forEach((node) => {
      node.dataset.inkProbe = node.style.getPropertyValue('color');
      node.style.setProperty('color', 'transparent', 'important');
    });
    return lines;
  });
  await settle(page);
  const pngs = [];
  for (const clip of boxes) pngs.push(await page.screenshot({ clip, animations: 'disabled' }));
  await page.$eval(selector, (el) => {
    [el, ...el.querySelectorAll('*')].forEach((node) => {
      const previous = node.dataset.inkProbe ?? '';
      node.style.removeProperty('color');
      if (previous !== '') node.style.setProperty('color', previous);
      delete node.dataset.inkProbe;
    });
  });
  const brightest = await page.evaluate(async (images) => Math.max(0, ...(await Promise.all(images.map(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      if (l > max) max = l;
    }
    return max;
  })))), pngs.map((png) => png.toString('base64')));
  return Math.round((1.05 / (brightest + 0.05)) * 100) / 100;
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
      const box = getComputedStyle(document.querySelectorAll(s)[n].closest('.field-box'));
      return { color: box.borderTopColor, width: box.borderTopWidth };
    }, { s: selector, n: i });
    await page.evaluate(({ s, n }) => document.querySelectorAll(s)[n].focus(), { s: selector, n: i });
    await page.waitForTimeout(120);
    out.push(
      await page.evaluate(
        ({ s, n, r }) => {
          const el = document.querySelectorAll(s)[n];
          const c = getComputedStyle(el);
          const box = getComputedStyle(el.closest('.field-box'));
          return {
            champ: el.id,
            ok: c.boxShadow === 'none' && c.outlineStyle === 'none' && box.borderTopColor !== r.color && box.borderTopWidth !== r.width,
            bordure: `${r.color} ${r.width} → ${box.borderTopColor} ${box.borderTopWidth}`,
          };
        },
        { s: selector, n: i, r: rest },
      ),
    );
  }
  await page.evaluate(({ s }) => document.querySelectorAll(s).forEach((el) => el.blur()), { s: selector });
  return out;
};

const cardNames = (page) => page.$$eval('[data-community-name]', (els) => els.map((el) => (el.textContent ?? '').trim()));

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. la grille, et plus l'écran d'attente
      await page.goto(`${BASE}/communities`, { waitUntil: 'load' });
      await page.waitForSelector('[data-community-card]');
      const menus = await page.waitForSelector('.floating-menus', { timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(300);
      check(menus, `${label} : les disques flottants sont posés — l'atteignabilité se mesure contre eux`);
      const names = await cardNames(page);
      check(
        names.length === 3 && ['Les polyglottes de Dakar', 'Équipe déploiement', 'Club de lecture'].every((name) => names.includes(name)),
        `${label} : la grille porte les trois communautés (${JSON.stringify(names)})`,
      );
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      check((await textOf(page, 'header h1')) === 'Communautés', `${label} : le titre de l'écran`);
      check((await page.getAttribute('[data-community-create]', 'href')) === '/communities/new', `${label} : « + » mène à /communities/new`);
      check(
        ((await textOf(page, '[data-community-card="m-polyglottes"] [data-community-counts]')) ?? '').replace(/\s/gu, ' ').includes('1,3 k membres'),
        `${label} : un compteur s'abrège dans la langue (« 1,3 k membres »)`,
      );
      await capture(page, `communautes-${slug}`);

      // ------------------------------------------------ 2. atteignabilité
      const rest = await reachAtRest(page);
      const blocked = rest.controls.filter((c) => !c.ok);
      check(rest.controls.length >= 4, `${label} : au repos, retour, « + », recherche et au moins une carte mesurés (${rest.controls.length})`);
      check(blocked.length === 0, `${label} : aucun contrôle n'est volé à son centre au repos — ${JSON.stringify(blocked)}`);
      const stolen = rest.texts.filter((t) => !t.ok);
      check(rest.texts.length >= 3, `${label} : au moins trois textes visibles mesurés au repos (${rest.texts.length})`);
      check(stolen.length === 0, `${label} : aucun texte n'est volé à son centre au repos — ${JSON.stringify(stolen)}`);
      const small = rest.controls.filter((c) => c.hauteur < TAP_FLOOR);
      check(small.length === 0, `${label} : chaque contrôle fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);
      const cards = await reachCards(page);
      check(cards.length === 3 && cards.every((c) => c.ok && c.hauteur >= TAP_FLOOR), `${label} : chaque carte s'atteint — ${JSON.stringify(cards)}`);

      // ------------------------------------------------ 3. contraste AA
      const inks = { titre: await contrastOf(page, 'header h1') };
      for (const id of ['m-polyglottes', 'm-deploiement', 'm-lecture']) {
        inks[`${id} nom`] = await worstContrastUnderWhite(page, `[data-community-card="${id}"] [data-community-name]`);
        inks[`${id} compteurs`] = await worstContrastUnderWhite(page, `[data-community-card="${id}"] [data-community-counts]`);
      }
      inks['m-polyglottes description'] = await worstContrastUnderWhite(page, '[data-community-card="m-polyglottes"] [data-community-description]');
      await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
      /* Le texte d'une carte ne monte jamais dans la bande de l'avatar : un nom de
         deux lignes sur une description de deux lignes, au gabarit étroit, est le
         pire cas du jeu de fixtures. */
      const bands = await page.$$eval('[data-community-card]', (els) =>
        els.map((card) => {
          const avatar = card.querySelector('.rounded-full').getBoundingClientRect();
          const text = card.querySelector('[data-community-name]').getBoundingClientRect();
          return { carte: card.getAttribute('data-community-card'), ecart: Math.round(text.top - avatar.bottom) };
        }),
      );
      check(bands.every((band) => band.ecart >= 2), `${label} : le texte d'une carte reste sous la bande de l'avatar — ${JSON.stringify(bands)}`);
      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte de la liste tient AA, cartes mesurées au pire pixel — ${JSON.stringify(inks)}`);

      // ------------------------------------------------ 4. la recherche
      await page.fill('[data-community-search]', 'club');
      const fromCache = await page
        .waitForFunction(
          () => {
            const shown = [...document.querySelectorAll('[data-community-name]')].map((el) => (el.textContent ?? '').trim());
            return shown.length === 1 && shown[0] === 'Club de lecture';
          },
          undefined,
          { timeout: 1000 },
        )
        .then(() => true, () => false);
      check(fromCache, `${label} : « club » ne laisse que « Club de lecture », en moins d'une seconde`);
      await page.fill('[data-community-search]', 'zzz');
      await page.waitForSelector('[data-community-search-empty]');
      check(((await textOf(page, '[data-community-search-empty]')) ?? '').includes('« zzz »'), `${label} : une recherche sans réponse nomme ce qu'elle cherchait`);
      const emptyInk = await contrastOf(page, '[data-community-search-empty]');
      check(emptyInk !== null && emptyInk >= WCAG_AA, `${label} : et tient AA (${emptyInk})`);
      await page.click('[data-community-search-clear]');
      await page.waitForFunction(() => document.querySelectorAll('[data-community-card]').length === 3);
      check((await page.inputValue('[data-community-search]')) === '', `${label} : effacer vide le champ et rend la grille`);

      // ------------------------------------------------ 5. le détail, puis un fil
      await page.click('[data-community-card="m-deploiement"]');
      await page.waitForURL('**/communities/m-deploiement');
      await page.waitForSelector('[data-community-hero]');
      await page.waitForSelector('[data-community-conversation]');
      await page.waitForTimeout(250);
      check((await textOf(page, '[data-community-title]')) === 'Équipe déploiement', `${label} : la carte ouvre SON détail`);
      check((await textOf(page, '[data-community-stat="members"] strong')) === '9', `${label} : les compteurs du détail`);
      const rows = await page.$$eval('[data-community-conversation]', (els) => els.map((el) => el.getAttribute('href')));
      check(JSON.stringify(rows) === JSON.stringify(['/c/c-deploiement', '/c/c-annonces']), `${label} : ses conversations mènent à leurs fils (${JSON.stringify(rows)})`);
      check((await page.$('.floating-menus')) === null, `${label} : le détail, route profonde, ne porte pas les disques (miroir isDeepRoute)`);
      const detailRest = await reachAtRest(page);
      const detailBlocked = detailRest.controls.filter((c) => !c.ok || c.hauteur < TAP_FLOOR);
      check(detailRest.controls.length >= 2 && detailBlocked.length === 0, `${label} : le retour et les conversations visibles s'atteignent — ${JSON.stringify(detailBlocked)}`);
      const detailInks = {
        titre: await contrastOf(page, '[data-community-title]'),
        confidentialite: await contrastOf(page, '[data-community-hero] [data-community-privacy]'),
        libelle: await contrastOf(page, '[data-community-stat="members"] .text-chip'),
        section: await contrastOf(page, '#community-conversations'),
        ligne: await contrastOf(page, '[data-community-conversation] .text-body'),
        membres: await contrastOf(page, '[data-community-conversation] .text-caption'),
      };
      const detailFaibles = Object.entries(detailInks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(detailFaibles.length === 0, `${label} : chaque texte du détail tient AA — ${JSON.stringify(detailInks)}`);
      await capture(page, `communaute-${slug}`);
      await page.click('[data-community-conversation="c-deploiement"]');
      await page.waitForURL('**/c/c-deploiement');
      check(true, `${label} : une conversation ouvre son fil`);
      await page.goBack();
      await page.waitForSelector('[data-community-hero]');
      await page.goto(`${BASE}/communities/inconnue`, { waitUntil: 'load' });
      await page.waitForSelector('[data-community-refused]');
      check((await textOf(page, '[data-community-refused] p')) === 'Communauté introuvable', `${label} : une adresse inconnue rend le refus`);
      await capture(page, `communaute-refus-${slug}`);

      // ------------------------------------------------ 6. la création
      await page.goto(`${BASE}/communities`, { waitUntil: 'load' });
      await page.waitForSelector('[data-community-card]');
      await page.click('[data-community-create]');
      await page.waitForURL('**/communities/new');
      await page.waitForSelector('[data-community-submit]');
      check(await page.$eval('[data-community-submit]', (el) => el.disabled), `${label} : sans nom, « Créer la communauté » est désactivé`);
      const couples = await focusCouples(page);
      check(couples.length === 3 && couples.every((c) => c.ok), `${label} : les trois champs gardent leur couple de focus — ${JSON.stringify(couples)}`);
      await page.fill('#community-name', 'Atelier web');
      check(((await textOf(page, '[data-community-preview]')) ?? '').includes('Atelier web'), `${label} : l'aperçu porte le nom tapé`);
      await page.click('[data-community-privacy-toggle]');
      check((await page.getAttribute('[data-community-privacy-toggle]', 'aria-checked')) === 'false', `${label} : la bascule rend la communauté publique`);
      check(((await textOf(page, '[data-community-preview]')) ?? '').includes('Publique'), `${label} : et l'aperçu le dit`);
      const previewInk = await worstContrastUnderWhite(page, '[data-community-preview] .line-clamp-2');
      check(previewInk >= WCAG_AA, `${label} : le nom de l'aperçu tient AA au pire pixel (${previewInk})`);
      await capture(page, `communaute-creation-${slug}`);
      await page.fill('#community-identifier', 'polyglottes');
      await page.click('[data-community-submit]');
      await page.waitForSelector('#community-identifier-error');
      check((await textOf(page, '#community-identifier-error')) === 'Cet identifiant est déjà pris.', `${label} : un identifiant pris se refuse SOUS son champ`);
      check(new URL(page.url()).pathname === '/communities/new', `${label} : et l'écran reste ouvert`);
      await page.fill('#community-identifier', 'atelier-web');
      check((await page.$('#community-identifier-error')) === null, `${label} : corriger le champ retire son refus`);
      await page.click('[data-community-submit]');
      await page.waitForURL(/\/communities\/m-[^/]+$/);
      await page.waitForSelector('[data-community-title]');
      check((await textOf(page, '[data-community-title]')) === 'Atelier web', `${label} : créée, l'écran devient son détail`);
      check(((await textOf(page, '[data-community-hero] [data-community-privacy]')) ?? '') === 'Publique', `${label} : publique, comme choisi`);
      await page.goBack();
      await page.waitForURL('**/communities');
      await page.waitForSelector('[data-community-card]');
      check((await cardNames(page))[0] === 'Atelier web', `${label} : le retour ramène à la liste, la nouvelle en tête`);

      // ------------------------------------------------ 7. hors ligne
      await context.setOffline(true);
      await page.waitForSelector('[data-community-offline]');
      check((await cardNames(page)).length >= 3, `${label} : hors ligne, la liste reste lisible et le dit`);

      // -------------------------------- 7 bis. la pastille ne recouvre pas la recherche (#6401)
      await page.waitForSelector('.sync-pill');
      const communitiesOverlap = await syncPillOverlap(page, ['[data-community-search]']);
      check(communitiesOverlap.pill !== null, `${label} : hors ligne, la pastille de synchronisation est posée`);
      check(
        communitiesOverlap.covers.length === 0,
        `${label} : hors ligne, la pastille ne recouvre pas le champ de recherche — ${JSON.stringify(communitiesOverlap.covers)}`,
      );

      await capture(page, `communautes-hors-ligne-${slug}`);
      await page.click('[data-community-create]');
      await page.waitForURL('**/communities/new');
      await page.fill('#community-name', 'Hors ligne');
      check(await page.$eval('[data-community-submit]', (el) => el.disabled), `${label} : hors ligne, la création ne part pas`);
      await context.setOffline(false);

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
console.log('\n  Ses communautés se lisent, s’ouvrent, se créent, s’atteignent et tiennent AA.\n');
