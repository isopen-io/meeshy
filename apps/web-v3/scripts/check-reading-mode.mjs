#!/usr/bin/env node
/**
 * VÉRIFIE L'EFFET DU MODE DE LECTURE (#5566) — un contrôle existe s'il a un
 * EFFET, jamais parce qu'il est simplement rendu.
 *
 * CE QU'IL MESURE
 *
 * 1. Le fil s'ouvre en mode FOCAL par défaut (D-7) : des rangées PLATES
 *    (`data-reading-mode="focal"`), AUCUNE bulle.
 * 2. Le menu du chip liste les CINQ modes + « Automatique » ; `Résumé` et
 *    `Rivière` sont désactivés et MOTIVÉS (D-8 : jamais un mode qu'on ne
 *    sait pas rendre, jamais un placeholder muet).
 * 3. Sélectionner « Bulles » change RÉELLEMENT le rendu (l'effet), la
 *    sélection SURVIT à un rechargement (persistance), et « Automatique »
 *    revient au focal.
 * 4. Les DEUX schémas sont capturés et LUS (outil Read, en dehors de ce
 *    script — il produit les fichiers, ne les regarde pas).
 * 5. `prefers-reduced-motion: reduce` : aucune transformation de perspective
 *    n'est posée sur les rangées, même en mode Focal — `reading-mode/scene.ts`
 *    coupe la passe entière avant son premier `requestAnimationFrame` quand
 *    la préférence est active (§10 ci-dessous prouve l'INVERSE : la passe
 *    EXISTE dès que le mouvement n'est pas réduit).
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
 * 10. « Focal » et « Script » rendaient des PNG STRICTEMENT identiques
 *     (mesuré : `Buffer.equals === true`). Ce gate scrolle et compare la
 *     `transform` calculée de la rangée la plus haute dans les DEUX modes :
 *     posée en Focal, absente en Script — la perspective (`reading-mode/
 *     scene.ts`, dérivée de `focus-curve.ts` variant `thread`, gardée par
 *     `check-curve.mjs`) est désormais réelle, pas seulement annoncée.
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
import { contrastOf } from './lib/contrast.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v3-workflow', 'rendus');
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

  // --- 9 bis : la pastille du Prisme a un EFFET (elle n'en avait aucun).
  const pastille = page.locator('main li [data-reading-mode] button[aria-label*="langue d’origine"]').first();
  expect((await pastille.count()) > 0, 'un message traduit porte la pastille du Prisme');
  const beforePastille = await page.locator('main li [data-reading-mode] p[lang]').count();
  await pastille.click();
  await page.waitForTimeout(200);
  expect(
    (await page.locator('main li [data-reading-mode] p[lang]').count()) > beforePastille,
    'cliquer la pastille du Prisme OUVRE la langue d’origine (le contrôle a un effet)',
  );
  await pastille.click();
  await page.waitForTimeout(200);
  expect(
    (await page.locator('main li [data-reading-mode] p[lang]').count()) === beforePastille,
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
  expect((await summaryRow.isDisabled()) === true, 'Résumé est désactivé');
  expect((await riverRow.isDisabled()) === true, 'Rivière est désactivée');
  expect(
    ((await summaryRow.textContent()) ?? '').trim().length > 'Résumé'.length,
    'Résumé porte une raison NON VIDE, pas un placeholder muet',
  );
  expect(
    ((await riverRow.textContent()) ?? '').trim().length > 'Rivière'.length,
    'Rivière porte une raison NON VIDE, pas un placeholder muet',
  );

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
    return { available: subtitleOf('Script'), unavailable: subtitleOf('Résumé') };
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
   * --- défauts 1/5 : la PERSPECTIVE distingue RÉELLEMENT « Focal » de
   * « Script » au défilement. Avant ce lot, les deux modes rendaient des PNG
   * STRICTEMENT identiques (`Buffer.equals === true`, 87 862 octets) — la
   * courbe `thread` de `focus-curve.ts` (dérivée dans
   * `reading-mode/perspective.ts`, gardée par `check-curve.mjs`) est
   * désormais appliquée aux rangées visibles en mode `focal` SEUL
   * (`reading-mode/scene.ts`), jamais en `script` (« densité uniforme, zéro
   * perspective », même ligne que `FocalRow.swift`).
   */
  const scrollSlack = await page.evaluate(() => {
    const m = document.querySelector('main');
    return m ? m.scrollHeight - m.clientHeight : 0;
  });
  if (scrollSlack > 4) {
    await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }));
    await page.waitForTimeout(250);
    const focalTransform = await page.evaluate(() => {
      const row = document.querySelector('main li [data-reading-mode="focal"]');
      return row ? getComputedStyle(row).transform : null;
    });
    expect(
      focalTransform !== null && focalTransform !== 'none',
      `en mode focal, la rangée la plus haute porte une transform de perspective au défilement (${focalTransform})`,
    );
    await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 999_999 }));
    await page.waitForTimeout(250);
  } else {
    console.log('  (mesure ignorée : le fil de démonstration ne défile pas assez pour la perspective)');
  }

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

  if (scrollSlack > 4) {
    await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }));
    await page.waitForTimeout(250);
    const scriptTransform = await page.evaluate(() => {
      const row = document.querySelector('main li [data-reading-mode="script"]');
      return row ? getComputedStyle(row).transform : null;
    });
    expect(
      scriptTransform === null || scriptTransform === 'none',
      `en mode script, AUCUNE perspective n'est posée — « densité uniforme, zéro perspective » (${scriptTransform})`,
    );
  }

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
    'mouvement réduit : aucune transform de perspective sur les rangées (aucune passe de perspective à ce lot)',
  );

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
  expect(rowButtonCount >= 3, `la ligne basse porte au moins la pastille et deux drapeaux (${rowButtonCount} trouvés)`);
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

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} défaut(s) du mode de lecture.\n`);
  process.exit(1);
}
console.log(
  `\n  Le mode de lecture tient : focal par défaut, menu à cinq lignes motivées, sélection avec effet et persistance, deux schémas capturés dans ${CAPTURES}.\n`,
);
