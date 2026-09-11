#!/usr/bin/env node
/**
 * VÉRIFIE L'EFFET DU MODE DE LECTURE (#5566) — un contrôle existe s'il a un
 * EFFET, jamais parce qu'il est simplement rendu.
 *
 * CE QU'IL MESURE
 *
 * 1. Le fil s'ouvre en mode FOCAL par défaut (D-7) : des rangées PLATES
 *    (`data-reading-mode="focal"`), AUCUNE bulle.
 * 2. Le menu du chip liste les CINQ modes + « Automatique » ; `Résumé` est
 *    DISPONIBLE pour un inscrit depuis #5695 (D-21) ; `Rivière` reste
 *    désactivée et MOTIVÉE (D-8) — ses deux raisons, sous le seuil et déjà
 *    éligible, sont mesurées par `lib/check-river-menu.mjs` (#5696).
 * 3. Sélectionner « Bulles » change RÉELLEMENT le rendu (l'effet), la
 *    sélection SURVIT à un rechargement (persistance), et « Automatique »
 *    revient au focal.
 * 4. Les DEUX schémas sont capturés et LUS (outil Read, en dehors de ce
 *    script — il produit les fichiers, ne les regarde pas).
 * 5. `prefers-reduced-motion: reduce` : aucune transformation de perspective
 *    n'est posée sur les rangées — plus aucune ne l'est JAMAIS depuis #5648
 *    (la courbe continue a été retirée d'iOS le 2026-08-24). Ce que la
 *    préférence coupe désormais, ce sont les TRANSITIONS de la scène ; ce
 *    qu'elle ne coupe PAS, c'est l'élection elle-même — elle se pose quand
 *    même, sans fondu : l'élection est une information, jamais une animation.
 * 6. AUCUN contrôle de l'en-tête n'en RECOUVRE un autre : le centre de chaque
 *    bouton renvoie ce bouton (`elementFromPoint`). Le chip débordait de sa
 *    boîte de 44 px et volait le centre de « Appeler » — un contrôle rendu
 *    inatteignable par le débord d'un voisin est un contrôle inerte, et rien
 *    dans le DOM ne le dit.
 * 7. Le MENU tient dans l'écran : aligné à droite de son ancre il commençait
 *    à `x = −16` sur un écran de 390.
 * 8. Ce que la rangée plate REND est LISIBLE : la citation d'un message à soi
 *    portait la peau « bulle indigo » (texte BLANC) sur une rangée SANS fond
 *    — contraste 1,0:1 en schéma clair, donc INVISIBLE. Deux assertions, et
 *    la première est la vraie : la peau est choisie par la SURFACE, jamais par
 *    l'expéditeur — le texte d'une citation de rangée plate n'est jamais
 *    blanc. La seconde MESURE le contraste dans les deux schémas et le tient
 *    au-dessus de la barre AA (4,5:1).
 *
 *    Cette barre était tenue à un plancher d'INVISIBILITÉ (2,5) le temps que
 *    `--color-ios-ink-2` (`MeeshyColors.textSecondary`) reste sous AA en
 *    schéma clair (~3,0:1 dans toute l'application, D-4 interdisant de
 *    corriger la couleur ici — elle se corrige dans `MeeshyColors.swift` puis
 *    se régénère). #5625 a relevé `textSecondary(isDark: false)` au cran
 *    minimal qui passe (`indigo700.opacity(0.8)`, méthode D-18) : la citation
 *    tient désormais 4,62:1 en clair — la barre AA remplace le plancher.
 * 9. Une RÉACTION reste visible dans le mode par DÉFAUT (elle ne l'était que
 *    dans le mode « Bulles »), et la pastille du Prisme a un EFFET.
 * 10. INVERSÉ PAR #5648. « Focal » et « Script » rendaient des PNG
 *     STRICTEMENT identiques ; la première réponse fut une courbe de
 *     perspective — qu'iOS avait déjà retirée. Ce que ce gate mesure
 *     désormais est l'ÉLECTION : après un défilement soutenu, EXACTEMENT une
 *     rangée porte `[data-elected="true"]` avec sa carte teintée, son chip
 *     d'identité et son tampon de date ; AUCUNE rangée du fil ne porte de
 *     `scale` ni d'`opacity < 1` ; 4,95 s après le dernier tick, plus aucune
 *     élue ; en Script, jamais aucune. Trois witnesses de revue s'y
 *     ajoutent : la bande de focus est ATTEIGNABLE au doigt (elle passait
 *     sous la rangée suivante, contrôle inerte), l'élue ne peint qu'UNE
 *     pastille d'avatar (elle en peignait deux), et aucune capsule de chip
 *     n'est VIDE.
 * 11. TOUTE rangée porte une heure (elle ne datait que la tête de groupe —
 *     une rangée de continuation n'avait AUCUNE date). La pastille du Prisme
 *     dessine 22 px mais sa zone TACTILE excède sa boîte visuelle
 *     (`tap-target-22`, mesurée par `elementFromPoint`, pas seulement par sa
 *     boîte visuelle) — plein en vertical, BORNÉ en horizontal (défaut 1 de
 *     la revue-correction, ci-dessous) pour ne jamais voler le clic d'un
 *     voisin. Le bouton de citation DÉPLACE le fil et met en évidence le
 *     message cité (il ne faisait rien).
 * 12. Défaut 1 de la revue-correction #5566 : le débord de `tap-target-22`
 *     ne recouvre plus JAMAIS l'intérieur de la boîte visuelle d'un contrôle
 *     voisin — pour chaque bouton de la ligne basse (pastille + drapeaux),
 *     un point à 2 px à l'intérieur de chacun de ses quatre bords se résout
 *     sur LUI-MÊME, jamais sur le bouton d'à côté.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { checkRowIdentityAndLabel } from './lib/check-identity.mjs';
import { checkLivingSummary } from './lib/check-summary.mjs';
import { assertRiverBelowThreshold, checkEligibleRiverRow } from './lib/check-river-menu.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { scrollRowIntoView } from './lib/scroll-row.mjs';
import { waitForFlattenFade, waitForRevealedOpacity } from './lib/scene-polling.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'rendus');
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

await mkdir(CAPTURES, { recursive: true });

const browser = await launchChromium();

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/**
 * Force un schéma AVANT tout rendu. On pose SEULEMENT `localStorage` — c'est
 * le script inline bloquant de `index.html` (« LE SEUL SCRIPT BLOQUANT DU
 * DOCUMENT ») qui pose ensuite les classes `light`/`dark` en le lisant.
 * Toucher `document.documentElement` depuis un `addInitScript` est trop tôt :
 * l'élément n'existe pas encore à ce point de la navigation dans Chromium, et
 * l'accès lève — faire les DEUX ici (comme un premier essai de ce gate l'a
 * fait) avortait le script ENTIER avant même le `localStorage.setItem`.
 */
const setScheme = (context, scheme) =>
  context.addInitScript((s) => {
    try {
      localStorage.setItem('meeshy.scheme', s);
    } catch {
      /* navigation privée : le schéma tient pour la page seule (repli HTML). */
    }
  }, scheme);

const QUOTE_TEXT = 'main li [data-reading-mode] button[aria-label^="Aller au message"] .line-clamp-2';

/**
 * LA BARRE AA (#5625, remplace l'ancien plancher d'invisibilité à 2,5). Le
 * défaut mesuré valait 1,0:1 (blanc sur blanc) ; la peau neutre vaut
 * désormais 4,62:1 en clair et 8,47:1 en sombre — `--color-ios-ink-2` a été
 * relevée au cran minimal qui passe (D-18/#5625), donc ce seuil certifie
 * réellement la conformité, plutôt que de séparer « peint dans la mauvaise
 * peau » de « peint dans la bonne ».
 */
const AA_THRESHOLD = 4.5;

const QUOTE_SKIN_LABEL =
  'la citation d’une rangée plate est peinte dans la peau NEUTRE, jamais dans celle de la bulle indigo';

/**
 * LA VRAIE ASSERTION du défaut : une peau se choisit sur la SURFACE qui la
 * porte, jamais sur l'expéditeur. La rangée plate n'ayant aucun fond teinté,
 * du texte blanc y est du texte perdu — quel que soit le contraste que le
 * schéma sombre lui rend par chance.
 */
const quoteSkinIsNeutral = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const [r, g, b] = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).map(Number);
    return !(r > 240 && g > 240 && b > 240);
  }, QUOTE_TEXT);

/** `contrastOf` vit désormais dans `./lib/contrast.mjs` (source unique,
 *  #5559 revue-correction — voir son en-tête pour la méthode). */

/**
 * LE GESTE SOUTENU (#5648) — `page.mouse.wheel` toutes les 100 ms, la même
 * cadence que la porte DURÉE de `FocalMagnificationLaw` (`sustainedMs`,
 * `election.ts`). Un `wheel` réel (et non un `scrollTo` programmé) ouvre
 * l'intention et compte pour l'armement, exactement comme sur un trackpad.
 * `dx`/`dy` par défaut : un défilement LENT (40 px/100 ms = 400 px/s, sous
 * le seuil de vitesse 1200 px/s) — c'est la DURÉE qui doit armer, pas la
 * vitesse, sauf appel explicite avec un pas plus grand (porte vitesse).
 */
const sustainedWheelScroll = async (page, { ms, step = 40, tick = 100 }) => {
  await page.locator('main').hover();
  const ticks = Math.ceil(ms / tick);
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, -step);
    await page.waitForTimeout(tick);
  }
};

/**
 * L'IDENTIFIANT DU MESSAGE ÉLU (#5648, défaut 1) — `[data-row]` porte
 * l'`id` du message (`routes/thread.tsx`, la même primitive que
 * `element.querySelectorAll('[data-row]')` lit déjà côté `scene.ts` pour
 * candidater à l'élection) ; `[data-elected="true"]` (posé par `FocalRow`)
 * est un DESCENDANT de ce nœud, jamais lui-même — `.closest()` remonte à
 * l'ancêtre qui porte l'id.
 */
const electedMessageId = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('main li [data-elected="true"]');
    return el ? (el.closest('[data-row]')?.getAttribute('data-row') ?? null) : null;
  });

/**
 * ÉLIT UNE RANGÉE PRÉCISE (#5648, défaut 1) — plutôt que « celle qui
 * tombe » d'un défilement soutenu depuis le bas du fil (ce que fait le
 * geste ci-dessus), on la vise EXPLICITEMENT, en deux temps.
 *
 * (1) LA RANGÉE EST VIRTUALISÉE (`@tanstack/react-virtual`,
 * `routes/thread.tsx`) : `[data-row="…"]` n'existe dans le DOM que si son
 * index est dans (ou proche de) la fenêtre visible. `scrollIntoView` sur un
 * nœud pas encore monté est un NO-OP silencieux (`?.`) — un défilement
 * RÉEL (`wheel`), gradué, fait avancer la fenêtre virtualisée jusqu'à ce
 * que la cible apparaisse.
 *
 * (2) UNE FOIS RENDUE, on la CENTRE (`scrollIntoView`, un défilement
 * PROGRAMMÉ : aucune intention ouverte, `scene.ts` l'ignore) puis on arme
 * la scène par la porte DURÉE avec une amplitude quasi NULLE (alternance du
 * signe à chaque tick : dérive nette ≈ 0, bien en-deçà de l'hystérésis de
 * 95 px, `election.ts::THREAD_FOCUS_BAND_HYSTERESIS`) — la rangée déjà
 * centrée reste donc la plus proche de la ligne de focus tout au long du
 * geste, quoi que la phase (1) ait pu élire en passant.
 */
const electRow = async (page, rowId, { ms = 4200, step = 3, tick = 100 } = {}) => {
  await scrollRowIntoView(page, rowId);
  const ticks = Math.ceil(ms / tick);
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, i % 2 === 0 ? -step : step);
    await page.waitForTimeout(tick);
  }
};

/**
 * NON-RECOUVREMENT DU TEXTE PAR LA BANDE/LE TAMPON DE FOCUS (#5648, défaut
 * 1) — même mesure que `heightAndOverlap` ci-dessous (§10), extraite pour
 * être appliquée à une rangée CHOISIE (`electRow`) plutôt qu'à celle qu'un
 * défilement générique élit. Rend aussi si un réservoir (`[data-focus-
 * reserve]`, un attribut plutôt qu'une classe — `check-utilities.mjs`
 * exige une RÈGLE CSS pour toute classe utilisée, et ce marqueur n'en a
 * délibérément aucune) est monté (la rangée n'a pas de ligne basse) et si
 * le nœud élu existe —
 * un appelant qui n'a pas réussi à ÉLIRE sa cible doit le voir, jamais lire
 * un `false` par défaut qui ressemblerait à un succès.
 */
const focusOverlapOf = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('main li [data-elected="true"]');
    if (row === null) return { found: false, stripOverText: null, stampOverText: null, hasReserve: null };
    const textEl = [...row.querySelectorAll('p')].find((e) => (e.textContent ?? '').trim().length > 0);
    const strip = row.querySelector('.focus-strip');
    const stamp = row.querySelector('.focus-stamp');
    const box = (e) => (e ? e.getBoundingClientRect() : null);
    const overlaps = (a, b) =>
      !!a && !!b && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
    const T = box(textEl);
    return {
      found: true,
      stripOverText: overlaps(box(strip), T),
      stampOverText: overlaps(box(stamp), T),
      hasReserve: row.querySelector('[data-focus-reserve]') !== null,
    };
  });

/**
 * Aucune rangée du fil ne porte de perspective CONTINUE — la courbe qu'iOS a
 * retirée. Elle écrivait `style.opacity` ET `style.transform` sur la rangée
 * elle-même (`[data-row] > *`, l'ancien `useThreadPerspective`) : c'est donc
 * la RANGÉE qu'on interroge pour l'opacité.
 *
 * Le `scale`, lui, est balayé sur TOUTE la sous-arborescence — plus strict
 * que la version d'origine, qui ne regardait que deux nœuds. L'opacité ne
 * peut pas l'être : depuis #5648 l'en-tête d'identité ET la pastille
 * d'avatar de la rangée ÉLUE s'effacent à `opacity: 0` (miroir
 * `FocalRow.swift:269`, l'identité passant au chip de focus), et la colonne
 * méta au repos aussi (le révélé). Trois fondus VOULUS, qu'un balayage de
 * sous-arborescence rendrait indistinguables de la courbe qu'on interdit.
 */
const noRowCarriesContinuousPerspective = (page) =>
  page.evaluate(() => {
    const offenders = [];
    for (const row of document.querySelectorAll('main li [data-reading-mode]')) {
      const style = getComputedStyle(row);
      if (Number(style.opacity) < 1) {
        offenders.push({ tag: row.tagName, why: 'opacity', opacity: style.opacity });
      }
      for (const node of [row, ...row.querySelectorAll('*')]) {
        if (getComputedStyle(node).transform.includes('scale(')) {
          offenders.push({ tag: node.tagName, why: 'scale', transform: getComputedStyle(node).transform });
        }
      }
    }
    return offenders;
  });

// --- 1 : le défaut est FOCAL, mesuré au DOM.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, 'dark');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  expect(
    (await page.locator('main li [data-reading-mode="focal"]').count()) > 0,
    'la rangée plate FOCALE est rendue par défaut (D-7)',
  );
  expect(
    (await page.locator('main li .rounded-bubble').count()) === 0,
    "l'état par défaut ne rend AUCUNE bulle",
  );

  // --- 1 bis (défaut 6) : TOUTE rangée porte une heure, tête de groupe
  // comme continuation — « cet en-tête ne date plus rien » (iOS,
  // `FocalIdentityHeader.swift:13-18`) : l'heure vit dans la colonne méta,
  // accolée à CHAQUE rangée, jamais seulement à la tête.
  {
    const rowCount = await page.locator('main li [data-reading-mode]').count();
    const timeCount = await page.locator('main li [data-reading-mode] time').count();
    expect(
      rowCount > 0 && timeCount === rowCount,
      `toute rangée du fil porte une heure, tête de groupe comme continuation (${timeCount}/${rowCount})`,
    );
  }

  // --- 6 : aucun contrôle de l'en-tête n'en recouvre un autre.
  const stolen = await page.evaluate(() =>
    [...document.querySelectorAll('header button[aria-label], header a[aria-label]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const owner = hit?.closest('button, a');
        return owner === el ? null : el.getAttribute('aria-label');
      })
      .filter((label) => label !== null),
  );
  expect(
    stolen.length === 0,
    `aucun contrôle de l'en-tête n'est recouvert par un voisin${stolen.length ? ` (volés : ${stolen.join(', ')})` : ''}`,
  );

  // --- 8 : la peau de la citation suit la SURFACE, pas l'expéditeur.
  expect(await quoteSkinIsNeutral(page), QUOTE_SKIN_LABEL);
  const quoteDark = await contrastOf(page, QUOTE_TEXT);
  expect(
    quoteDark !== null && quoteDark >= AA_THRESHOLD,
    `schéma sombre : la citation d'une rangée plate tient AA (contraste ${quoteDark})`,
  );

  // --- 9 : la réaction survit au mode par DÉFAUT.
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('main li [data-reading-mode]')].some((row) =>
        (row.textContent ?? '').includes('👍'),
      ),
    ),
    'une réaction posée sur un message reste visible dans le mode par défaut',
  );

  /**
   * --- 9 bis : la pastille du Prisme a un EFFET (elle n'en avait aucun).
   *
   * SUBSTITUTION, PAS RÉVÉLATION (revue #5814, défaut majeur 12) — la
   * pastille posait un panneau `SecondaryText` SOUS le texte (un second
   * `p[lang]` apparaissait, d'où l'ancienne mesure par COMPTE) ; elle pose
   * désormais `displayLanguage` via `onPickLanguage`, LA MÊME loi que le
   * sous-menu « Traduire » du menu du message — le texte SERVI (et son
   * `lang`) CHANGE en place, il ne se double plus d'un second paragraphe.
   * La mesure suit donc l'attribut `lang` du paragraphe de LA MÊME rangée
   * (`closest('[data-reading-mode]')`, jamais un compte document-large qui
   * confondrait les rangées), pas un compte d'éléments.
   */
  const pastille = page.locator('main li [data-reading-mode] button[aria-label*="langue d’origine"]').first();
  expect((await pastille.count()) > 0, 'un message traduit porte la pastille du Prisme');
  const langOf = async () =>
    pastille.evaluate((btn) => btn.closest('[data-reading-mode]')?.querySelector('p[lang]')?.getAttribute('lang') ?? null);
  const beforeLang = await langOf();
  await pastille.click();
  await page.waitForTimeout(200);
  const afterLang = await langOf();
  expect(
    afterLang !== null && afterLang !== beforeLang,
    `cliquer la pastille du Prisme OUVRE la langue d’origine (le contrôle a un effet) — ${beforeLang} → ${afterLang}`,
  );
  await pastille.click();
  await page.waitForTimeout(200);
  expect(
    (await langOf()) === beforeLang,
    'la recliquer referme — le contrôle est une bascule, pas un aller simple',
  );

  /**
   * --- défaut 10 : le SAUT de citation a un EFFET (le bouton ne faisait
   * rien : ni `onClick`, ni prop de rappel).
   */
  const quoteButton = page
    .locator('main li [data-reading-mode] button[aria-label^="Aller au message"]')
    .first();
  expect((await quoteButton.count()) > 0, 'un message avec citation est rendu');
  await quoteButton.click();
  await page.waitForTimeout(200);
  const highlighted = await page.evaluate(() =>
    [...document.querySelectorAll('main li [data-reading-mode]')].some((row) => {
      const bg = getComputedStyle(row).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }),
  );
  expect(highlighted, 'cliquer une citation met en évidence le message cité (le contrôle a un effet)');

  await page.screenshot({ path: join(CAPTURES, 'thread-focal-dark.png') });

  // --- 2 : le menu du chip.
  await page.getByRole('button', { name: /Mode de lecture/ }).click();
  await page.waitForTimeout(200);

  // --- 7 : le menu tient dans l'écran.
  const menuBox = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return null;
    const r = menu.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), viewport: window.innerWidth };
  });
  expect(
    menuBox !== null && menuBox.left >= 0 && menuBox.right <= menuBox.viewport,
    `le menu tient ENTIÈREMENT dans l'écran (${JSON.stringify(menuBox)})`,
  );

  const rows = page.getByRole('menuitemradio');
  expect((await rows.count()) === 5, 'le menu liste les CINQ modes');
  expect((await page.getByRole('menuitem', { name: 'Automatique' }).count()) === 1, "« Automatique » est une ligne séparée");

  const summaryRow = page.getByRole('menuitemradio', { name: /Résumé/ });
  const riverRow = page.getByRole('menuitemradio', { name: /Rivière/ });
  /**
   * INVERSÉ (#5695) — le Résumé Vivant est RENDU depuis ce lot (D-21) : pour
   * le lecteur de fixture (inscrit), la ligne « Résumé » est désormais
   * SÉLECTIONNABLE, comme « Focal »/« Script ». Seule « Rivière » reste
   * désactivée et motivée (elle n'est pas encore rendue, hors périmètre de
   * #5695).
   */
  expect((await summaryRow.isDisabled()) === false, 'Résumé est DISPONIBLE (#5695) — plus jamais désactivé pour un inscrit');
  await assertRiverBelowThreshold({ riverRow, expect });

  /**
   * ET une raison LISIBLE, pas seulement présente : voilée avec sa ligne
   * (`disabled:opacity-40`), elle tombait à 1,49:1 en schéma clair. La barre
   * n'est pas un chiffre choisi ici — c'est l'encre des lignes DISPONIBLES,
   * mesurée sur la même page : un mode indisponible dit pourquoi dans la même
   * encre qu'un mode disponible.
   */
  const reasonInk = await page.evaluate(() => {
    const parse = (v) => {
      const n = (v.match(/[\d.]+/g) ?? []).map(Number);
      return n.length >= 3 ? { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 } : null;
    };
    const over = (t, b) => ({
      r: t.r * t.a + b.r * (1 - t.a),
      g: t.g * t.a + b.g * (1 - t.a),
      b: t.b * t.a + b.b * (1 - t.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg.a > 0) layers.push(bg);
        if (bg && bg.a === 1) break;
      }
      return layers.reduceRight((u, l) => over(l, u), { r: 255, g: 255, b: 255, a: 1 });
    };
    const alpha = (el) => {
      let a = 1;
      for (let n = el; n; n = n.parentElement) {
        const o = Number(getComputedStyle(n).opacity);
        if (!Number.isNaN(o)) a *= o;
      }
      return a;
    };
    const ratio = (el) => {
      const bd = backdrop(el);
      const raw = parse(getComputedStyle(el).color);
      const text = over({ ...raw, a: raw.a * alpha(el) }, bd);
      const [a, b] = [lum(text), lum(bd)].sort((x, y) => y - x);
      return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
    };
    const subtitleOf = (title) =>
      [...document.querySelectorAll('[role="menuitemradio"]')]
        .filter((b) => (b.textContent ?? '').startsWith(title))
        .map((b) => b.querySelectorAll('span span')[1])
        .map((el) => (el ? ratio(el) : null))[0] ?? null;
    // #5695 : « Résumé » est désormais DISPONIBLE — le témoin d'encre mesure
    // « Rivière », la seule ligne encore désactivée et motivée.
    return { available: subtitleOf('Script'), unavailable: subtitleOf('Rivière') };
  });
  expect(
    reasonInk.unavailable !== null && reasonInk.unavailable === reasonInk.available,
    `la raison d'un mode indisponible est écrite dans la MÊME encre qu'une ligne disponible (${JSON.stringify(reasonInk)})`,
  );

  await page.screenshot({ path: join(CAPTURES, 'thread-menu-dark.png') });

  // --- 3 : sélectionner « Bulles » a un EFFET, qui PERSISTE.
  await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
  await page.waitForTimeout(300);
  expect((await page.locator('main li .rounded-bubble').count()) > 0, "sélectionner « Bulles » rend RÉELLEMENT des bulles");
  expect((await page.locator('main li [data-reading-mode]').count()) === 0, 'plus aucune rangée plate en mode bulles');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  expect((await page.locator('main li .rounded-bubble').count()) > 0, 'le choix « Bulles » SURVIT à un rechargement');

  await page.getByRole('button', { name: /Mode de lecture/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Automatique' }).click();
  await page.waitForTimeout(300);
  expect(
    (await page.locator('main li [data-reading-mode="focal"]').count()) > 0,
    '« Automatique » revient au focal',
  );

  /**
   * --- défauts 1/5, SOLDÉS par #5648 : « Focal » et « Script » ne se
   * distinguent plus par une courbe continue (retirée d'iOS le 2026-08-24,
   * `apps/ios/decisions.md:328`) mais par l'ÉLECTION d'une rangée au
   * défilement soutenu — voir le bloc « --- 10 » ci-dessous, sur
   * `/c/c-salon-riviere` (seule conversation du jeu qui défile assez pour
   * armer la scène ; `c-deploiement`, 7 messages, ne le permettait pas —
   * l'ancien garde `scrollSlack > 4` SAUTAIT sa propre mesure, ce qui ne
   * PROUVAIT rien, spécification #5648 §2).
   */

  /**
   * AU CLAVIER, de bout en bout (défaut #5566 §9, corrigé) : `Enter` ouvre le
   * menu ET pose le focus sur la ligne COURANTE (elle en était exclue —
   * `disabled` la rendait inatteignable alors qu'elle porte la SEULE coche du
   * menu) ; `ArrowDown` déplace RÉELLEMENT le focus (les flèches ne
   * bougeaient rien) ; `Enter` sur la ligne atteinte change le mode ;
   * `Escape` referme en rendant le focus au chip.
   */
  await page.getByRole('button', { name: /Mode de lecture/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const focusedOnOpen = await page.evaluate(() => ({
    role: document.activeElement?.getAttribute('role'),
    checked: document.activeElement?.getAttribute('aria-checked'),
  }));
  expect(
    focusedOnOpen.role === 'menuitemradio' && focusedOnOpen.checked === 'true',
    `à l'ouverture, le focus entre DANS le menu, sur la ligne COURANTE — cochée (${JSON.stringify(focusedOnOpen)})`,
  );
  await page.keyboard.press('ArrowDown');
  const afterArrow = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(
    afterArrow.startsWith('Script'),
    `ArrowDown déplace RÉELLEMENT le focus vers la ligne suivante (« ${afterArrow} »)`,
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(
    (await page.locator('main li [data-reading-mode="script"]').count()) > 0,
    'au clavier, Entrée sur la ligne atteinte par les flèches change RÉELLEMENT le mode (Script)',
  );
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'menu'),
    'le focus revient au chip après un choix — jamais perdu sur le document',
  );

  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const focusedAfterReopen = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(
    focusedAfterReopen.startsWith('Script'),
    're-ouvert, le focus se pose de nouveau sur la ligne COURANTE (Script)',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect((await page.locator('[role="menu"]').count()) === 0, 'Escape referme le menu');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'menu'),
    'Escape rend le focus au chip',
  );

  await context.close();
}

/**
 * --- 10 : L'ÉLECTION DE LA SCÈNE (#5648) — Focal se distingue de Script par
 * l'ÉLECTION d'une rangée au défilement soutenu (carte teintée, chip
 * d'identité agrandi, tampon de date), plus par la courbe continue qu'iOS a
 * retirée. Sur `/c/c-salon-riviere` (40 messages) — la SEULE conversation du
 * jeu qui défile assez pour armer la scène ; `c-deploiement` ne le permet
 * pas (l'ancien garde `scrollSlack > 4` le SAUTAIT, ce qui ne prouvait
 * rien).
 */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, 'dark');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  // Le fil de démonstration DOIT défiler assez pour que la scène soit
  // observable — un gate qui saute sa propre mesure ne prouve rien
  // (spécification #5648 §2, §4.5).
  const scrollSlack = await page.evaluate(() => {
    const m = document.querySelector('main');
    return m ? m.scrollHeight - m.clientHeight : 0;
  });
  expect(scrollSlack > 4, `le fil de démonstration défile assez pour armer la scène (scrollSlack=${scrollSlack})`);

  // (1) AU REPOS : aucune élection, aucune scène.
  expect(
    (await page.locator('main li [data-reading-mode="focal"][data-elected="true"]').count()) === 0,
    'au repos, aucune rangée Focal n’est élue',
  );
  expect(
    await page.evaluate(() => document.querySelector('main')?.dataset.scene === undefined),
    'au repos, `main[data-scene]` est absent',
  );

  // BASELINE — hauteurs AU REPOS, indexées par le texte de chaque rangée :
  // comparées après l'élection pour prouver qu'ÉLIRE ne fait JAMAIS bouger
  // la hauteur de la rangée élue (correction de revue #5648, défaut
  // bloquant 3 : la ligne basse était DÉMONTÉE plutôt qu'effacée, ce
  // qu'aucun témoin d'AVANT cette correction n'attrapait).
  // (2) DÉFILEMENT SOUTENU (4 200 ms ≥ SUSTAINED_SCROLL_MS, jamais ≥ 1 200 px/s
  // sur un seul pas) : EXACTEMENT une rangée élue, avec sa carte, son chip
  // d’identité et son tampon.
  await sustainedWheelScroll(page, { ms: 4200 });
  // L'HORLOGE DU REPOS part du DERNIER `wheel`, pas de la fin des assertions
  // qui suivent : sans ce repère, l'échantillonnage du fondu (plus bas)
  // tombait entièrement AVANT le passage à `idle` et ne mesurait rien.
  const lastGestureAt = Date.now();
  const electedCount = await page.locator('main li [data-elected="true"]').count();
  expect(electedCount === 1, `après un défilement soutenu, EXACTEMENT une rangée est élue (${electedCount})`);

  const elected = page.locator('main li [data-elected="true"]').first();
  const cardBg = await elected.locator('.focus-card').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(
    cardBg !== 'rgba(0, 0, 0, 0)' && cardBg !== 'transparent',
    `la carte de la rangée élue porte un fond calculé ≠ transparent (${cardBg})`,
  );

  const identity = await elected.locator('.focus-identity').evaluate((el) => {
    const avatar = el.querySelector('.avatar-root');
    const r = el.getBoundingClientRect();
    const a = avatar ? avatar.getBoundingClientRect() : null;
    return { height: r.height, avatarWidth: a ? a.width : null };
  });
  expect(identity.height >= 34, `le chip d'identité de l'élue mesure au moins 34 px de haut (${identity.height})`);
  expect(identity.avatarWidth === 26, `l'avatar du chip d'identité mesure 26 px (${identity.avatarWidth})`);

  const stampText = await elected.locator('.focus-stamp').first().innerText();
  expect(
    /^Aujourd'hui \d{1,2}:\d{2}/.test(stampText),
    `le tampon de l'élue commence par « Aujourd'hui HH:MM » (« ${stampText} »)`,
  );

  const offenders = await noRowCarriesContinuousPerspective(page);
  expect(
    offenders.length === 0,
    `aucune rangée du fil ne porte de perspective continue (scale/opacity<1) — ${JSON.stringify(offenders)}`,
  );

  /**
   * WITNESSES DE REVUE (#5648) — trois défauts MESURÉS sur la première
   * livraison, chacun invisible d'un test de rendu :
   *
   * a) la bande de focus DÉBORDE sous la rangée, et chaque rangée est un
   *    contexte d'empilement (`transform` du virtualiseur) : ses boutons
   *    passaient SOUS la rangée suivante — présents, fonctionnels, et
   *    INATTEIGNABLES au doigt. `elementFromPoint` est le seul témoin qui
   *    l'attrape (la loi 4 : un contrôle existe s'il a un effet) ;
   * b) l'en-tête d'identité de l'élue s'efface, mais son AVATAR restait
   *    peint : deux pastilles pour un seul auteur ;
   * c) `PrismPastille` rend `null` quand la langue servie EST l'originale —
   *    sa capsule restait montée, VIDE.
   */
  const overlayHealth = await elected.evaluate((row) => {
    const strip = row.querySelector('.focus-strip');
    const buttons = [...(strip?.querySelectorAll('button') ?? [])];
    const unreachable = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top !== b && !b.contains(top);
    }).length;
    const emptyChips = [...row.querySelectorAll('.focus-chip')].filter(
      (c) => c.textContent?.trim() === '' && c.children.length === 0,
    ).length;
    return {
      buttons: buttons.length,
      unreachable,
      emptyChips,
      avatars: row.querySelectorAll('.avatar-root').length,
      visibleAvatars: [...row.querySelectorAll('.avatar-root')].filter((a) => {
        for (let n = a; n instanceof HTMLElement; n = n.parentElement) {
          if (Number(getComputedStyle(n).opacity) === 0) return false;
          if (n.hasAttribute('data-elected')) break;
        }
        return true;
      }).length,
      hasStrip: strip !== null,
      stripInsideAriaHidden: strip !== null && strip.closest('[aria-hidden="true"]') !== null,
    };
  });
  expect(
    overlayHealth.hasStrip && overlayHealth.buttons > 0,
    `la rangée élue porte une bande de focus AVEC des contrôles — sans quoi les trois witnesses ci-dessous ne prouveraient rien (${JSON.stringify(overlayHealth)})`,
  );
  expect(
    overlayHealth.unreachable === 0,
    `chaque bouton de la bande de focus est ATTEIGNABLE au doigt — ${JSON.stringify(overlayHealth)}`,
  );
  expect(
    overlayHealth.visibleAvatars <= 1,
    `la rangée élue ne peint qu'UNE pastille d'avatar (${overlayHealth.visibleAvatars})`,
  );
  expect(overlayHealth.emptyChips === 0, `aucune capsule de chip VIDE sur l'élue (${overlayHealth.emptyChips})`);
  expect(
    !overlayHealth.stripInsideAriaHidden,
    'la bande de focus n’est pas sous un `aria-hidden` — elle porte les SEULS contrôles de Prisme de la rangée élue',
  );

  /**
   * WITNESS DÉFAUT BLOQUANT 3 (#5648, correction de revue) — ÉLIRE une
   * rangée ne change JAMAIS sa hauteur : comparée à la hauteur COMMUNE des
   * rangées NON élues actuellement rendues (le corpus est de « densité
   * uniforme du premier au dernier message », fixture dédiée), jamais à un
   * relevé « au repos » — le virtualiseur ne rendait pas encore cette
   * rangée avant le défilement, donc rien à y comparer temporellement. Ni
   * la bande ni le tampon ne recouvrent JAMAIS le `<p>` du message qu'ils
   * élisent. `FocalRow.swift:317-322` efface la ligne basse par opacité —
   * « la bande SUR la ligne basse remplace visuellement cette ligne, QUI
   * GARDE SA PLACE » — jamais en la démontant.
   */
  const heightAndOverlap = await elected.evaluate((row) => {
    const li = row.closest('li');
    const others = [...document.querySelectorAll('main li[data-index]')]
      .filter((n) => n !== li)
      .map((n) => Math.round(n.getBoundingClientRect().height));
    const commonHeight = others.length > 0 ? others.sort((a, b) => a - b)[Math.floor(others.length / 2)] : null;
    const textEl = [...row.querySelectorAll('p')].find((e) => (e.textContent ?? '').trim().length > 0);
    const strip = row.querySelector('.focus-strip');
    const stamp = row.querySelector('.focus-stamp');
    const box = (e) => (e ? e.getBoundingClientRect() : null);
    const overlaps = (a, b) =>
      !!a && !!b && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
    const T = box(textEl);
    return {
      liH: li ? Math.round(li.getBoundingClientRect().height) : null,
      commonHeight,
      stripOverText: overlaps(box(strip), T),
      stampOverText: overlaps(box(stamp), T),
    };
  });
  expect(
    heightAndOverlap.liH === heightAndOverlap.commonHeight,
    `élire une rangée ne change JAMAIS sa hauteur, comparée à celle des rangées voisines non élues — ${JSON.stringify(heightAndOverlap)}`,
  );
  expect(
    !heightAndOverlap.stripOverText,
    `la bande de focus ne recouvre JAMAIS le texte de la rangée qu'elle élit — ${JSON.stringify(heightAndOverlap)}`,
  );
  expect(
    !heightAndOverlap.stampOverText,
    `le tampon de focus ne recouvre JAMAIS le texte de la rangée qu'il élit — ${JSON.stringify(heightAndOverlap)}`,
  );

  /**
   * WITNESS DÉFAUT MAJEUR 5 (#5648, correction de revue) — cliquer un
   * contrôle de la bande de focus fait GRANDIR la rangée (panneau
   * secondaire de traduction) sans jamais DÉPLACER l'élection sur une
   * rangée voisine. `reading-mode/scene.ts` ne reprogramme la passe de
   * géométrie que depuis un `scrolled` COMPTÉ (`state.intent` vrai) —
   * jamais depuis le relayout lui-même.
   */
  const electedKeyBeforeClick = await elected.evaluate((row) => row.closest('li')?.getAttribute('data-index') ?? null);
  await elected.locator('.focus-strip button').first().click();
  await page.waitForTimeout(300);
  const stillElectedKey = await page.evaluate(() => {
    const row = document.querySelector('main li [data-elected="true"]');
    return row ? (row.closest('li')?.getAttribute('data-index') ?? null) : null;
  });
  expect(
    stillElectedKey === electedKeyBeforeClick,
    `cliquer un contrôle de la bande de focus ne déplace JAMAIS l'élection (avant « ${electedKeyBeforeClick} », après « ${stillElectedKey} »)`,
  );

  /**
   * (3) APLATISSEMENT — `SCENE_REST_DELAY_MS` (4 500) + `SCENE_FLATTEN_DURATION_MS`
   * (450) après le DERNIER `scrolled` compté, PLUS la granularité des `tick`
   * d'horloge (`SCROLL_ACTIVITY_LINGER_MS / 3` = 300 ms, qui peut retarder de
   * jusqu'à un tick la DÉTECTION du passage à l'inactivité) : 4 950 ms au
   * minimum, mesuré. 5 400 ms laisse une marge sûre sans rien prouver de
   * moins — aucun nouveau geste n'a lieu pendant l'attente.
   */
  /**
   * LE FONDU de l'aplatissement (`--scene-flatten-ms`, 450 ms) est SONDÉ
   * sur une fenêtre LARGE (`waitForFlattenFade`, `lib/scene-polling.mjs`),
   * jamais échantillonné à taille fixe : sous charge (`load average`
   * élevé), les 24 pas fixes de 60 ms (correction de revue #5696)
   * pouvaient manquer la fenêtre entière (`{"opacity":1,…}` observé sous
   * charge). Sans la règle CSS qui LIT la variable, la carte reste à 1
   * puis se démonte d'un coup — l'état de la première livraison.
   */
  await page.waitForTimeout(Math.max(0, 4300 - (Date.now() - lastGestureAt)));
  const { matched: fadingSample, seen: flattenSamples } = await waitForFlattenFade(page, {
    sample: () =>
      page.evaluate(() => {
        const card = document.querySelector('main .focus-card');
        return {
          scene: document.querySelector('main')?.dataset.scene ?? null,
          opacity: card === null ? null : Number(getComputedStyle(card).opacity),
          ms: card === null ? null : getComputedStyle(card).transitionDuration,
        };
      }),
    until: (x) => x.scene === 'idle' && x.opacity !== null && x.opacity < 1 && x.ms === '0.45s',
    budgetMs: 12000,
  });
  expect(
    fadingSample !== null,
    `l'aplatissement FOND la carte sur \`--scene-flatten-ms\` — ${JSON.stringify(flattenSamples.filter((x) => x.scene === 'idle'))}`,
  );

  await page.waitForTimeout(5400);
  expect(
    (await page.locator('main li [data-elected="true"]').count()) === 0,
    '5,4 s après le dernier tick, plus aucune rangée élue (aplatissement)',
  );

  /**
   * (3 bis) LES DEUX TÉMOINS DU DÉFAUT 1 (#5648, correction de revue) — le
   * corpus par défaut de `c-salon-riviere` alternait STRICTEMENT expéditeur
   * et traduisait CHAQUE message : `mountsBottomLine` (`reading-mode/meta.ts`)
   * ne pouvait donc JAMAIS rendre `false`, et le témoin `heightAndOverlap`
   * ci-dessus ne pouvait faire échouer AUCUNE garde sur une rangée SANS
   * ligne basse — exactement la forme où le recouvrement de 9 px a été
   * mesuré. `RIVER_CONTINUATION_WITNESS_ID` (`riv-5`, miroir de la
   * constante EXPORTÉE `apps/web-v2/src/lib/api/fixtures.ts`) est une
   * CONTINUATION (`tail === false`, traduite, sans réaction) ;
   * `RIVER_NO_TRANSLATION_WITNESS_ID` (`riv-12`) ne porte NI traduction NI
   * réaction. `electRow` les ÉLIT explicitement (défilement gradué jusqu'à
   * ce que la rangée virtualisée apparaisse, puis `scrollIntoView` et un
   * défilement soutenu d'amplitude quasi nulle) plutôt que d'espérer que
   * l'un d'eux tombe sous le geste générique du bloc ci-dessus — les deux
   * index sont d'ailleurs choisis LOIN de la zone que ce geste générique
   * élit (`fixtures.ts`, commentaire de `RIVER_NO_TRANSLATION_INDEX`), pour
   * que ses propres witnesses (bande de focus AVEC contrôles, etc.)
   * restent déterministes.
   */
  for (const witnessId of ['riv-5', 'riv-12']) {
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
    await page.waitForSelector('main li');
    await page.waitForTimeout(400);
    await electRow(page, witnessId);

    const electedId = await electedMessageId(page);
    expect(electedId === witnessId, `l'élection cible bien la rangée-témoin « ${witnessId} » (élue : « ${electedId} »)`);

    const overlap = await focusOverlapOf(page);
    expect(overlap.found, `une rangée est élue pour le témoin « ${witnessId} »`);
    expect(
      !overlap.stripOverText,
      `la bande de focus ne recouvre JAMAIS le texte de la rangée-témoin sans ligne basse « ${witnessId} » — ${JSON.stringify(overlap)}`,
    );
    expect(
      !overlap.stampOverText,
      `le tampon de focus ne recouvre JAMAIS le texte de la rangée-témoin sans ligne basse « ${witnessId} » — ${JSON.stringify(overlap)}`,
    );
    // Le réservoir (`[data-focus-reserve]`, `focal-row.tsx`) n'existe QUE sur
    // les témoins qui n'ont réellement AUCUNE ligne basse — les deux le sont.
    expect(
      overlap.hasReserve === true,
      `la rangée-témoin sans ligne basse « ${witnessId} » monte le réservoir de hauteur (\`[data-focus-reserve]\`) — ${JSON.stringify(overlap)}`,
    );
  }

  // (4) LA PORTE VITESSE : un défilement FRANC (une seule frame, > 1 200 px/s)
  // arme IMMÉDIATEMENT.
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  await page.locator('main').hover();
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(300);
  const velocityElected = await page.locator('main li [data-elected="true"]').count();
  expect(velocityElected === 1, `un défilement franc (>1200 px/s) arme immédiatement (${velocityElected} élues)`);

  // (5) DÉFILEMENT PROGRAMMÉ : `scrollTo` répété SANS `wheel`/`touchstart`/
  // `keydown` — l'intention ne s'ouvre jamais, donc ni le révélé ni
  // l'armement ne réagissent.
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }));
  for (let i = 0; i < 50; i += 1) {
    await page.evaluate(() => {
      const m = document.querySelector('main');
      if (m) m.scrollTo({ top: m.scrollTop + 60 });
    });
    await page.waitForTimeout(100);
  }
  expect(
    (await page.locator('main li [data-elected="true"]').count()) === 0,
    'un défilement PROGRAMMÉ (scrollTo, sans intention utilisateur) n’élit jamais',
  );

  // (6) SCRIPT : le même geste soutenu n'élit JAMAIS, et ne monte pas de scène.
  await page.getByRole('button', { name: /Mode de lecture/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('menuitemradio', { name: /Script/ }).click();
  await page.waitForTimeout(300);
  expect(
    (await page.locator('main li [data-reading-mode="script"]').count()) > 0,
    'le mode Script est bien actif pour ce test',
  );
  await sustainedWheelScroll(page, { ms: 4200 });
  expect(
    (await page.locator('main li [data-elected="true"]').count()) === 0,
    'en Script, le même geste soutenu n’élit JAMAIS',
  );
  expect(
    await page.evaluate(() => document.querySelector('main')?.dataset.scene === undefined),
    'en Script, `main[data-scene]` reste absent',
  );

  // CLAVIER : `PageUp` répété est une INTENTION au même titre qu'un `wheel`
  // (D-15) — `<main tabIndex={-1}>` se focalise programmatiquement. Le choix
  // « Script » du sous-test précédent PERSISTE (`readingModeStore`,
  // `localStorage`) : `page.goto` seul y REVIENT au rechargement — on efface
  // le magasin d'abord, sans quoi ce sous-test « clavier » recharge en
  // Script (qui n'arme jamais) et ne prouve rien.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  expect(
    (await page.locator('main li [data-reading-mode="focal"]').count()) > 0,
    'le magasin de mode réinitialisé, le fil rouvre bien en Focal pour le sous-test clavier',
  );
  await page.evaluate(() => (document.querySelector('main'))?.focus());
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(300);
  }
  const keyboardElected = await page.locator('main li [data-elected="true"]').count();
  expect(keyboardElected === 1, `PageUp soutenu au clavier élit une rangée (${keyboardElected})`);

  await context.close();
}

/**
 * --- 13 : LE RÉVÉLÉ (#5648) — heure et coches masquées au repos, révélées
 * pendant le geste, EN FOCAL COMME EN SCRIPT (D-22 : « le révélé vit en
 * Focal ET en Script »). La rangée ÉLUE fait exception : son `<time>` méta
 * reste à 0 (remplacé par `.focus-stamp`, toujours à 1).
 */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, 'dark');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  const metaOpacities = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main li [data-reading-mode] time')]
        .filter((t) => !t.classList.contains('focus-stamp'))
        .map((t) => Number(getComputedStyle(t.closest('.focal-meta') ?? t).opacity)),
    );

  const atRest = await metaOpacities();
  expect(
    atRest.length > 0 && atRest.every((o) => o === 0),
    `au repos (Focal), toute heure de rangée est masquée (${JSON.stringify(atRest)})`,
  );

  /**
   * SOUTENIR le geste plutôt que l'ÉCHANTILLONNER (`waitForRevealedOpacity`,
   * `lib/scene-polling.mjs`, correction de revue #5696) : un `wheel`
   * unique + `waitForTimeout(450)` fixe course contre la transition CSS
   * sous charge et peut l'attraper EN VOL (`[0.808236,…]`) ou avant qu'elle
   * ait commencé (`[0,0,…]`) — observé sous charge, jamais un désaccord
   * sur la fonctionnalité. Chaque `wheel` re-arme
   * `SCROLL_ACTIVITY_LINGER_MS` : soutenir le geste NE PEUT PAS faire
   * manquer la fenêtre.
   */
  const { opacities: duringGesture, lastWheelAt: focalLastWheelAt } = await waitForRevealedOpacity(page, {
    sample: metaOpacities,
  });
  expect(
    duringGesture.some((o) => o === 1),
    `pendant le geste (Focal), au moins une heure de rangée est révélée (${JSON.stringify(duringGesture)})`,
  );

  /**
   * `SCROLL_ACTIVITY_LINGER_MS` (900) après le DERNIER `wheel` RÉELLEMENT
   * dispatché (`focalLastWheelAt`, jamais un offset fixe depuis le début
   * du bloc — le geste ci-dessus a pu se répéter), PUIS `--reveal-fade-ms`
   * (280) pour le fondu de sortie — mesuré : le fondu complet prend
   * jusqu'à ~1,7 s après le dernier `wheel`. 2,1 s laisse une marge sûre.
   */
  await page.waitForTimeout(Math.max(0, 2100 - (Date.now() - focalLastWheelAt)));
  const afterLinger = await metaOpacities();
  expect(
    afterLinger.every((o) => o === 0),
    `2,1 s après le dernier "wheel" (900 + 280 ms de fondu), toute heure retombe à 0 (${JSON.stringify(afterLinger)})`,
  );

  // SCRIPT : le révélé vit AUSSI en Script (D-22), sans jamais élire.
  await page.getByRole('button', { name: /Mode de lecture/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('menuitemradio', { name: /Script/ }).click();
  await page.waitForTimeout(300);
  const { opacities: scriptDuring } = await waitForRevealedOpacity(page, { sample: metaOpacities });
  expect(
    scriptDuring.some((o) => o === 1),
    `pendant le geste (Script), au moins une heure de rangée est révélée (${JSON.stringify(scriptDuring)})`,
  );
  expect(
    (await page.locator('main li [data-elected="true"]').count()) === 0,
    'en Script, le révélé n’élit jamais',
  );

  await context.close();
}

// --- 4 : le second schéma, capturé et LU (outil Read, hors de ce script).
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, 'light');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  expect(
    (await page.locator('main li [data-reading-mode="focal"]').count()) > 0,
    'le mode clair rend aussi la rangée plate par défaut',
  );
  /**
   * C'est le schéma CLAIR qui a trouvé le défaut : la citation d'un message à
   * soi portait la peau de la bulle indigo (texte blanc) sur une rangée sans
   * fond — invisible. Le schéma sombre, lui, la rendait par CHANCE.
   */
  expect(await quoteSkinIsNeutral(page), `${QUOTE_SKIN_LABEL} — schéma clair`);
  const quoteLight = await contrastOf(page, QUOTE_TEXT);
  expect(
    quoteLight !== null && quoteLight >= AA_THRESHOLD,
    `schéma clair : la citation d'une rangée plate tient AA (contraste ${quoteLight})`,
  );
  await page.screenshot({ path: join(CAPTURES, 'thread-focal-light.png') });
  await context.close();
}

/**
 * --- 6 bis : L'ÉCRAN ÉTROIT (320 px — le plus petit téléphone encore servi).
 * La grappe d'action n'y tient plus en entier : il faut que ce soit le CHIP
 * qui tronque, jamais une cible tactile qui rétrécit. Sans ce témoin, les
 * boutons « Appeler » et « Rechercher » tombaient à 35 px de large.
 */
{
  const context = await browser.newContext({ viewport: { width: 320, height: 780 } });
  await setScheme(context, 'dark');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('header button[aria-label], header a[aria-label]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44
          ? null
          : `${el.getAttribute('aria-label')} ${Math.round(r.width)}×${Math.round(r.height)}`;
      })
      .filter((entry) => entry !== null),
  );
  expect(
    small.length === 0,
    `320 px : toute cible de l'en-tête fait au moins 44×44${small.length ? ` (${small.join(' · ')})` : ''}`,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    '320 px : aucun débordement horizontal du document',
  );
  await context.close();
}

// --- 5 : `prefers-reduced-motion: reduce` — aucune perspective posée.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await setScheme(context, 'dark');
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  const transforms = await page.evaluate(() =>
    [...document.querySelectorAll('main li [data-reading-mode]')].map(
      (el) => el.getAttribute('style') ?? '',
    ),
  );
  expect(
    transforms.every((style) => !/scale\(|perspective\(/.test(style)),
    'mouvement réduit : aucune transform de perspective sur les rangées (la scène du fil ne pose plus aucune écriture style.transform, #5648)',
  );

  /**
   * --- #5648 §4.5(d) : `reducedMotion: 'reduce'` COUPE les TRANSITIONS,
   * jamais l'ÉLECTION — « l'élection n'est pas une animation ». Le même
   * geste soutenu, sur `/c/c-salon-riviere`, élit QUAND MÊME une rangée ; la
   * transition CSS de sa carte tombe à ~0 (règle globale `app.css:190-199`).
   */
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  await sustainedWheelScroll(page, { ms: 4200 });
  const reducedElectedCount = await page.locator('main li [data-elected="true"]').count();
  expect(
    reducedElectedCount === 1,
    `mouvement réduit : l'élection se pose QUAND MÊME (${reducedElectedCount} élues) — ce n'est pas une animation`,
  );
  const reducedTransitionDuration = await page
    .locator('main li [data-elected="true"] .focus-card')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  /**
   * Chromium formate `0.00001s` en NOTATION SCIENTIFIQUE (`1e-05s`), une
   * TROISIÈME forme que ni `0s` ni `0.00001s` ne couvrent en texte — la
   * seule comparaison qui tienne est NUMÉRIQUE (`parseFloat`), pas un motif
   * de chaîne.
   */
  expect(
    parseFloat(reducedTransitionDuration) < 0.001,
    `mouvement réduit : la transition de la carte tombe à ~0 (${reducedTransitionDuration})`,
  );
  const reducedOffenders = await noRowCarriesContinuousPerspective(page);
  expect(
    reducedOffenders.length === 0,
    `mouvement réduit : toujours aucune perspective continue (${JSON.stringify(reducedOffenders)})`,
  );
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  /**
   * --- défaut 11 : la zone TACTILE excède le DESSIN (22 px) jusqu'à 44 px,
   * par le débord `::after` de `tap-target-22` (`app.css`) — mesuré AU-DELÀ
   * de la boîte visuelle, jamais seulement par `getBoundingClientRect` qui ne
   * voit pas un pseudo-élément. Sans cette classe, l'ancien commentaire
   * promettait une compensation absente (mesuré : aucun second geste à
   * taille pleine dans ce dépôt).
   *
   * Mesurée dans CE contexte (mouvement réduit) précisément parce qu'il
   * garantit `scale(1)` sur CHAQUE rangée (assertion ci-dessus) : la
   * perspective du défaut 1/5 réduit RÉELLEMENT l'échelle d'une rangée
   * éloignée de la bande de focus — c'est son effet recherché —, donc mesurer
   * 22 px littéraux dans le contexte FOCAL dépendrait de la position de
   * défilement et confondrait deux défauts distincts.
   *
   * Le fil s'ouvre PINNÉ EN BAS (§ mission) : l'UNIQUE message porteur d'une
   * pastille (`m1`, langue d'origine anglaise servie en français) est alors
   * scrollé HORS de la zone visible de `<main>` (clippée par
   * `overflow-y-auto`) — un `elementFromPoint` à cet endroit répond
   * légitimement l'EN-TÊTE, qui occupe l'écran par-dessus. On remonte donc en
   * haut du fil avant de mesurer, pour tester une pastille RÉELLEMENT visible.
   */
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  const pastille = page.locator('main li [data-reading-mode] button[aria-label*="langue d’origine"]').first();
  expect((await pastille.count()) > 0, 'un message traduit porte la pastille du Prisme (mouvement réduit)');
  const tapTarget = await pastille.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const probe = (dx, dy) => {
      const hit = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy);
      return hit === el || hit?.closest('button') === el;
    };
    /**
     * Vertical PLEIN (débord -11px, rien ne le dispute) : 18 px au-dessus
     * du centre reste hors de la boîte (rayon 11 px) et dans le débord
     * (rayon 22 px). Horizontal BORNÉ à la moitié du gap réel vers `Flags`
     * (-2px, défaut 1 de la revue-correction #5566) : 12 px à gauche du
     * centre est hors de la boîte propre (rayon 11) mais dans le débord
     * borné (rayon 13) — la pastille est le PREMIER contrôle de sa rangée,
     * rien ne la dispute non plus à gauche.
     */
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      hitsAbove: probe(0, -18),
      hitsLeft: probe(-12, 0),
    };
  });
  expect(
    tapTarget.w < 44 && tapTarget.hitsAbove && tapTarget.hitsLeft,
    `la pastille dessine ${tapTarget.w}×${tapTarget.h} mais sa zone TACTILE réelle excède sa boîte visuelle vers le haut et la gauche (${JSON.stringify(tapTarget)})`,
  );

  /**
   * --- défaut 1 de la revue-correction #5566 : AUCUN débord de
   * `tap-target-22` ne vole le clic d'un VOISIN.
   *
   * Le débord symétrique -11px d'origine dépassait le gap réel (4px) entre
   * la pastille et chaque drapeau : le `::after` du bouton SUIVANT en ordre
   * DOM peignait par-dessus jusqu'à 7 des 22 px du bouton PRÉCÉDENT (~32 %
   * de sa surface dessinée), et un clic dans CETTE zone — pourtant à
   * l'INTÉRIEUR de la boîte visuelle du bouton visé — se résolvait sur le
   * voisin. Le témoin ci-dessus ne l'aurait jamais vu : il ne mesure que
   * l'extérieur de la boîte de la pastille, jamais l'intérieur d'un voisin.
   *
   * Pour CHAQUE bouton `tap-target-22` de la ligne basse (pastille +
   * drapeaux), les quatre points à 2 px À L'INTÉRIEUR de sa propre boîte
   * doivent donc résoudre sur LUI-MÊME — l'assertion qui rougissait avant
   * le correctif (borne horizontale à -2px + gap `Flags` porté à 4px).
   */
  /* La ligne basse de m1, et ELLE SEULE : `.tap-target-22` existe sur
     CHAQUE message traduit du fil, et les autres sont scrollés hors de
     `<main>` (clippé par `overflow-y-auto`) — `elementFromPoint` y répond
     l'en-tête ou rien du tout, un faux positif qui n'a rien à voir avec le
     défaut mesuré ici. On repart du conteneur direct de la pastille. */
  const rowButtons = pastille.locator('xpath=..').locator('.tap-target-22');
  const rowButtonCount = await rowButtons.count();
  /**
   * `>= 2`, PAS `>= 3` (correction D-23, #5676) : la bande de drapeaux
   * (`languageBand`, `reading-mode/meta.ts`) exclut désormais la langue
   * SERVIE (leçon 261, témoin de RANG) — un drapeau qui rebasculerait sur la
   * langue déjà à l'écran n'aurait aucun effet observable (loi 4). `m1`
   * (original `en`, traduit `fr`, servi `fr`) ne porte donc plus qu'UN
   * drapeau (`en`, l'original) plus la pastille : exactement les deux
   * contrôles que les deux témoins de débord ci-dessous ciblent nommément
   * (« Afficher…langue d'origine » et « English »).
   */
  expect(rowButtonCount >= 2, `la ligne basse porte au moins la pastille et le drapeau de la langue d’origine (${rowButtonCount} trouvés)`);
  for (let i = 0; i < rowButtonCount; i += 1) {
    const btn = rowButtons.nth(i);
    const label = (await btn.getAttribute('aria-label')) ?? (await btn.getAttribute('title')) ?? `#${i}`;
    const insideEdges = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const resolvesSelf = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit === el || hit?.closest('button') === el;
      };
      return {
        left: resolvesSelf(r.left + 2, r.top + r.height / 2),
        right: resolvesSelf(r.right - 2, r.top + r.height / 2),
        top: resolvesSelf(r.left + r.width / 2, r.top + 2),
        bottom: resolvesSelf(r.left + r.width / 2, r.bottom - 2),
      };
    });
    expect(
      insideEdges.left && insideEdges.right && insideEdges.top && insideEdges.bottom,
      `bouton « ${label} » (ligne basse) : un point à 2 px à l'intérieur de sa propre boîte se résout sur un AUTRE contrôle — le débord d'un voisin lui vole son clic (${JSON.stringify(insideEdges)})`,
    );
  }

  await context.close();
}

// --- 11 : LA RIVIÈRE ÉLIGIBLE, grisée et motivée SANS MENTIR (#5696) — `lib/check-river-menu.mjs`.
await checkEligibleRiverRow({ browser, BASE, setScheme, expect });

// --- 14 : LE RÉSUMÉ VIVANT (#5695) — `lib/check-summary.mjs` (l'hôte est hors
// budget de taille) ; il reçoit LE compteur de défauts et LA pose de schéma.
await checkLivingSummary({ browser, BASE, CAPTURES, setScheme, expect, AA_THRESHOLD });

// --- 15 : L'IDENTITÉ DE RANGÉE PORTE role="article" + son libellé (#5935) —
// `lib/check-identity.mjs` (l'hôte est hors budget de taille).
await checkRowIdentityAndLabel({ browser, BASE, CAPTURES, setScheme, expect });

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} défaut(s) du mode de lecture.\n`);
  process.exit(1);
}
console.log(
  `\n  Le mode de lecture tient : focal par défaut, menu à cinq lignes motivées, sélection avec effet et persistance, deux schémas capturés dans ${CAPTURES}.\n`,
);
