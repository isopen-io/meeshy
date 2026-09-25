/**
 * LE STUDIO DE STORY (#6900) PEINT CE QU'IL PUBLIERA, dans un VRAI navigateur,
 * sur le document PRODUIT (`dist/`) — patron `check-story-scene.mjs`, brancé
 * juste après lui. Les témoins unitaires (`story-compose.test.tsx`,
 * `story-document.test.ts`, `studio.test.ts`) prouvent les LOIS ; ce gate
 * prouve que `/stories/new` les PEINT :
 *
 *  1. Publier est INERTE sur un brouillon vide (loi 4).
 *  2. Poser un fond (image) ET un son ⇒ `[data-scene-player]` PEINT
 *     réellement — les pixels de la carte ne sont PAS uniformes (deux
 *     `requestAnimationFrame` après la pose, jamais `img.complete` seul).
 *  3. La carte (`[data-scene-stage]`) est TOUJOURS 9:16 (±0,01) et CENTRÉE
 *     (±1 px) dans son plateau, aux DEUX gabarits (320 et 390 px de large) et
 *     dans les DEUX schémas.
 *  4. Cinq cibles ≥ 44 px : les deux portes, Publier, Retirer (fond), le
 *     bouton son.
 *  5. LA SAISIE EST ALIGNÉE SUR CE QU'ELLE FAIT PEINDRE (défaut 1,
 *     revue-correction #6900) : pour un texte d'une ligne ET un texte long
 *     (qui force plusieurs lignes dans le moteur), le haut et la hauteur de
 *     `#story-studio-text` valent ceux de `[data-scene-text]` à ±1 px, et
 *     `scrollHeight === clientHeight` — aucun défilement interne, jamais un
 *     curseur une ligne au-dessus du texte peint.
 *  6. Un texte tapé SURVIT à un rechargement (le brouillon, `studio-draft-
 *     store.ts`, clé par lecteur).
 *  7. Aucune erreur de page ; clair et sombre rendent la MÊME géométrie.
 *  8. L'AUDIENCE SE CHOISIT ET VOYAGE (#7683) : la pastille (`[data-story-
 *     audience]`) ≥ 44 px, dit FRIENDS/`default` sans choix (une story part à
 *     FRIENDS par défaut, `core.ts:421`), sans faire déborder la page ni
 *     réduire le message du pied ; sa feuille (chargée à la demande) offre les
 *     six audiences dans l'ORDRE iOS, rangées ≥ 44 px, `ONLY`/`EXCEPT` grisés
 *     AVEC leur raison, le défaut désigné comme rangée courante, la note de
 *     portée ; choisir « Communautés » se lit sur la pastille ; le menu
 *     « Publier comme » dit l'audience de chaque format sans recouvrir sa
 *     capsule ; le choix survit au rechargement ; et, PUBLIÉ puis le studio
 *     ROUVERT, le brouillon est purgé mais la mémoire du lecteur relue.
 *  9. PLUSIEURS PAGES DE MÉDIAS, ET LEUR AGENCEMENT (#7684) : `/posts/new`
 *     n'affiche AUCUN rail à une seule page et sa ligne Post ne déplie rien
 *     (loi 4) ; trois images posées sur trois pages font trois tuiles
 *     (`[data-story-studio-page]`) de 44×44, la dernière courante, une
 *     corbeille de 44×44 qui ne RECOUVRE aucune tuile, et la scène ne change
 *     pas de hauteur quand le rail paraît (il vit dans la barre haute) ; le
 *     tap sur la tuile 1 en fait la scène courante, qui PEINT ; le menu ▾
 *     déplie sous Post les cinq agencements dans l'ordre iOS, lignes ≥ 44 px,
 *     menu dans l'écran et hors de sa capsule, le réel choisissable ; rechargé,
 *     le brouillon rend ses trois pages et sa page courante ; Post › « Une
 *     grande, les autres à côté » publie.
 *  10. UNE STORY DE PLUSIEURS PAGES PART EN AUTANT DE STORIES (#7707) :
 *      `/stories/new` n'affiche plus AUCUN refus à trois pages ; publier
 *      ENVOIE trois `POST /api/v1/posts` de type `STORY` (canal `.scene`,
 *      jamais `story-with-several-pages`) et ELLES ENTRENT dans « Mes
 *      stories » (`/stories/mine`) — la preuve qu'elles sont bien PARTIES,
 *      pas seulement émises.
 *
 * Sélecteurs préfixés `[data-story-studio*]`/`[data-story-text-input]`, comme
 * l'écran les pose (`story-compose.tsx`) — jamais un texte francophone en dur
 * qui romprait au premier changement de catalogue.
 *
 * Aucun réseau : l'écran ne lit ni n'écrit rien via TanStack Query
 * (`useReaderLanguages`/`useComposeLanguage` sont purement locaux), et la
 * montée/publication passe par la branche FIXTURES de `uploadPostMedia`/
 * `publishStory` dès que `__FIXTURES__` est vrai — le défaut de `bun run
 * build` (`apiConfig.source === 'fixtures'` sans `VITE_DATA_SOURCE=gateway`,
 * la MÊME construction que `check-story-scene.mjs` sert déjà). La SEULE
 * chose que ce gate ne peut pas prouver est la recette RÉSEAU réelle
 * (staging) — hors de son périmètre, voir `check-gateway-build.mjs`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const ICON = new URL('../public/icon-192.png', import.meta.url).pathname;
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

const round = (v) => Math.round(v * 100) / 100;
const MIN_TARGET = 44;
/** Quand la variable est posée, la section 8 écrit la pastille et la feuille
 * aux deux gabarits et dans les deux schémas — le gate n'écrit RIEN sans elle. */
const CAPTURES = process.env.STORY_STUDIO_CAPTURES;

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

/** La session SEMÉE — la même forme que persiste `session.ts` (`PersistedAccount`) :
 * un studio de story refuse tout invité (`StudioRefusal`), donc ce gate ne
 * peut PAS mesurer l'écran sans une session authentifiée déjà là AVANT le
 * premier rendu (`main.tsx` lit `localStorage` à l'IMPORT). */
function seedSession(viewerId) {
  return JSON.stringify({
    token: 'gate-token',
    sessionToken: 'gate-session',
    user: { id: viewerId, username: 'auteur-gate' },
    expiresAt: Date.now() + 3_600_000,
  });
}

const PLATEAU_SELECTOR = '[data-scene-stage]';

async function measureCard(page) {
  const carte = await readBox(page, PLATEAU_SELECTOR);
  if (carte === null) return null;
  const plateau = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const parent = el?.parentElement;
    if (parent === null || parent === undefined) return null;
    const r = parent.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, PLATEAU_SELECTOR);
  return { carte, plateau };
}

async function targetSizesOf(page, selectors) {
  return page.evaluate((sels) => {
    return Object.fromEntries(
      sels.map((sel) => {
        const el = document.querySelector(sel);
        if (el === null) return [sel, null];
        const r = el.getBoundingClientRect();
        return [sel, { width: r.width, height: r.height }];
      }),
    );
  }, selectors);
}

/** La couleur DOMINANTE et sa DISPERSION — un canevas qui n'a encore rien
 * peint (transparent/uniforme) rend une variance nulle ; l'icône réelle
 * (`public/icon-192.png`, plusieurs teintes) ne le peut pas une fois montée. */
async function pixelSpread(page, clip) {
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
    const uniques = new Set();
    for (let i = 0; i < pixels.length; i += 4) uniques.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return uniques.size;
  }, shot.toString('base64'));
}

const icon = await readFile(ICON);
const sound = Buffer.from([0xff, 0xf3, 0x18, 0xc4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // en-tête MPEG minimal, contenu sans importance (fixtures n'inspectent aucun octet)

const browser = await launchChromium();

async function runScheme(colorScheme) {
  const measures = {};
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    const tag = `[${colorScheme} ${viewport.width}×${viewport.height}]`;
    const viewerId = 'a'.repeat(24);
    const context = await browser.newContext({ colorScheme, locale: 'fr-FR', viewport, serviceWorkers: 'block' });
    await context.addInitScript((session) => localStorage.setItem('meeshy.session', session), seedSession(viewerId));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(`${BASE}/stories/new`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-studio]', { timeout: 8000 });

    /* ── 1. Publier INERTE sur un brouillon vide (loi 4) ────────────────── */
    const publishDisabled = await page.evaluate(() => document.querySelector('[data-story-publish]')?.disabled ?? null);
    check(publishDisabled === true, `${tag} : Publier doit être désactivé sur un brouillon vide — ${publishDisabled}`);
    check(await page.evaluate(() => document.querySelector('[data-scene-player]') === null), `${tag} : aucune scène avant toute pose`);

    /* ── 2. poser un fond + un son ⇒ le moteur PEINT réellement ─────────── */
    await page.setInputFiles('input[data-door="visual"]', { name: 'fond.png', mimeType: 'image/png', buffer: icon });
    await page.setInputFiles('input[data-door="sound"]', { name: 'son.mp3', mimeType: 'audio/mpeg', buffer: sound });
    await page.waitForSelector('[data-scene-player]', { timeout: 8000 });
    await twoFrames(page);

    const stageBox = await readBox(page, PLATEAU_SELECTOR);
    check(stageBox !== null, `${tag} : aucune carte [data-scene-stage]`);
    if (stageBox !== null) {
      const inner = { x: stageBox.x + 4, y: stageBox.y + 4, width: Math.max(1, stageBox.width - 8), height: Math.max(1, stageBox.height - 8) };
      const uniques = await pixelSpread(page, inner);
      check(uniques > 4, `${tag} : la carte ne peint que ${uniques} teinte(s) distincte(s) — le moteur ne semble rien avoir chargé`);
    }
    check(
      await page.evaluate(() => document.querySelector('[data-story-studio-sound]') !== null),
      `${tag} : aucun <audio> pour le son de fond posé`,
    );
    check(
      (await page.evaluate(() => document.querySelector('[data-asset-phase="ready"]')?.textContent)) !== undefined,
      `${tag} : la montée fixtures devrait aboutir « Prêt »`,
    );

    /* ── 3. la carte est 9:16, CENTRÉE dans son plateau ─────────────────── */
    const mesure = await measureCard(page);
    check(mesure !== null && mesure.plateau !== null, `${tag} : plateau introuvable`);
    if (mesure !== null && mesure.plateau !== null) {
      const { carte, plateau } = mesure;
      const rapport = carte.width / carte.height;
      check(Math.abs(rapport - 9 / 16) <= 0.01, `${tag} : carte de rapport ${round(rapport)} — attendu 9:16`);
      const cxCarte = carte.x + carte.width / 2;
      const cyCarte = carte.y + carte.height / 2;
      const cxPlateau = plateau.x + plateau.width / 2;
      const cyPlateau = plateau.y + plateau.height / 2;
      check(
        Math.abs(cxCarte - cxPlateau) <= 1 && Math.abs(cyCarte - cyPlateau) <= 1,
        `${tag} : carte centrée en (${round(cxCarte)}, ${round(cyCarte)}) — plateau (${round(cxPlateau)}, ${round(cyPlateau)})`,
      );
      measures[`${viewport.width}.carte`] = [round(carte.x), round(carte.y), round(carte.width), round(carte.height)];
    }

    /* ── 4. cinq cibles ≥ 44 px ──────────────────────────────────────────── */
    const tailles = await targetSizesOf(page, [
      'input[data-door="visual"]',
      'input[data-door="sound"]',
      '[data-story-publish]',
      'button[aria-label="Retirer le fond"]',
      '[data-story-studio-sound-toggle]',
    ]);
    for (const [selector, size] of Object.entries(tailles)) {
      // Les `<input type=file>` sont masqués (`sr-only`) : c'est leur `<label>`
      // englobant (`StudioDoorButton`) qui porte la cible visible et cliquable.
      const cible = selector.startsWith('input') ? await readBox(page, `label:has(${selector})`) : size;
      check(
        cible !== null && cible.width >= MIN_TARGET - 0.5 && cible.height >= MIN_TARGET - 0.5,
        `${tag} : cible ${selector} = ${JSON.stringify(cible)} — attendu ≥ ${MIN_TARGET} px`,
      );
    }

    /* ── 5. la saisie est ALIGNÉE sur ce qu'elle fait peindre (défaut 1) ─── */
    const alignmentCases = [
      ['une ligne', 'Bonjour'],
      ['un texte long', 'Un texte suffisamment long pour forcer plusieurs lignes dans le moteur partagé et dans la saisie transparente qui le recouvre.'],
    ];
    for (const [label, text] of alignmentCases) {
      await page.fill('#story-studio-text', text);
      await twoFrames(page);
      const alignement = await page.evaluate(() => {
        const textarea = document.querySelector('#story-studio-text');
        const peint = document.querySelector('[data-scene-text]');
        if (textarea === null || peint === null) return null;
        const t = textarea.getBoundingClientRect();
        const p = peint.getBoundingClientRect();
        return {
          top: t.top,
          height: t.height,
          peintTop: p.top,
          peintHeight: p.height,
          scrollHeight: textarea.scrollHeight,
          clientHeight: textarea.clientHeight,
        };
      });
      check(alignement !== null, `${tag} : [data-scene-text] introuvable pour « ${label} »`);
      if (alignement !== null) {
        check(
          Math.abs(alignement.top - alignement.peintTop) <= 1,
          `${tag} : (${label}) haut de la saisie ${round(alignement.top)} — texte peint ${round(alignement.peintTop)}`,
        );
        check(
          Math.abs(alignement.height - alignement.peintHeight) <= 1,
          `${tag} : (${label}) hauteur de la saisie ${round(alignement.height)} — texte peint ${round(alignement.peintHeight)}`,
        );
        check(
          alignement.scrollHeight - alignement.clientHeight <= 1,
          `${tag} : (${label}) la saisie défile en interne (scrollHeight ${alignement.scrollHeight} / clientHeight ${alignement.clientHeight})`,
        );
      }
    }

    /* ── 6. un texte tapé SURVIT à un rechargement (brouillon) ──────────── */
    await page.fill('#story-studio-text', 'Recette du gate');
    await page.waitForTimeout(50); // l'effet qui persiste le brouillon n'est pas synchrone au frappé.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-story-studio]', { timeout: 8000 });
    const texteRelu = await page.evaluate(() => document.querySelector('#story-studio-text')?.value ?? null);
    check(texteRelu === 'Recette du gate', `${tag} : le texte du brouillon n'a pas survécu au rechargement — « ${texteRelu} »`);

    /* ── 8. L'AUDIENCE SE CHOISIT ET VOYAGE (#7683) ──────────────────────── */
    const readAudience = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-story-audience]');
        return el === null ? null : { value: el.getAttribute('data-audience-value'), source: el.getAttribute('data-audience-source') };
      });
    const pastilleBox = await readBox(page, '[data-story-audience]');
    check(
      pastilleBox !== null && pastilleBox.width >= MIN_TARGET - 0.5 && pastilleBox.height >= MIN_TARGET - 0.5,
      `${tag} : la pastille d'audience [data-story-audience] = ${JSON.stringify(pastilleBox)} — attendu ≥ ${MIN_TARGET} px`,
    );
    const defaultAudience = await readAudience();
    check(
      defaultAudience !== null && defaultAudience.value === 'FRIENDS' && defaultAudience.source === 'default',
      `${tag} : une story sans audience choisie doit dire FRIENDS/default — ${JSON.stringify(defaultAudience)}`,
    );
    const footerFit = await page.evaluate(() => {
      const hint = document.querySelector('footer p');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        hintWidth: hint === null ? 0 : hint.getBoundingClientRect().width,
        viewport: innerWidth,
      };
    });
    check(footerFit.overflow <= 0, `${tag} : la page déborde horizontalement de ${footerFit.overflow} px avec la pastille`);
    check(
      footerFit.hintWidth >= footerFit.viewport - 40,
      `${tag} : le message du pied n'a que ${round(footerFit.hintWidth)} px sur ${footerFit.viewport} — une erreur s'y lirait tronquée`,
    );
    if (CAPTURES !== undefined) await page.screenshot({ path: join(CAPTURES, `audience-${colorScheme}-${viewport.width}x${viewport.height}-chip.png`) });

    await page.click('[data-story-audience]');
    await page.waitForSelector('dialog[open] [data-audience-choice]', { timeout: 8000 });
    const sheet = await page.evaluate(() =>
      Array.from(document.querySelectorAll('dialog[open] [data-audience-choice]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          value: el.getAttribute('data-audience-choice'),
          disabled: el.getAttribute('aria-disabled'),
          current: el.getAttribute('aria-current'),
          caption: el.querySelector('[data-audience-caption]')?.textContent ?? '',
          height: r.height,
        };
      }),
    );
    check(
      JSON.stringify(sheet.map((row) => row.value)) === JSON.stringify(['PUBLIC', 'COMMUNITY', 'FRIENDS', 'EXCEPT', 'ONLY', 'PRIVATE']),
      `${tag} : les six audiences, dans l'ordre iOS — reçu ${JSON.stringify(sheet.map((row) => row.value))}`,
    );
    for (const row of sheet) {
      check(row.height >= MIN_TARGET - 0.5, `${tag} : la rangée ${row.value} mesure ${round(row.height)} px — attendu ≥ ${MIN_TARGET}`);
      const refused = row.value === 'ONLY' || row.value === 'EXCEPT';
      check(
        (row.disabled === 'true') === refused && row.caption.trim() !== '',
        `${tag} : ${row.value} doit être ${refused ? 'grisé AVEC sa raison' : 'choisissable avec son sous-titre'} — ${JSON.stringify(row)}`,
      );
    }
    check(
      JSON.stringify(sheet.filter((row) => row.current === 'true').map((row) => row.value)) === '["FRIENDS"]',
      `${tag} : rien choisi, la rangée courante de la feuille doit être le défaut FRIENDS — ${JSON.stringify(sheet.map((row) => [row.value, row.current]))}`,
    );
    check(
      await page.evaluate(() => document.querySelector('dialog[open] [data-audience-scope]') !== null),
      `${tag} : la note de portée [data-audience-scope] manque à la feuille`,
    );
    if (CAPTURES !== undefined) await page.screenshot({ path: join(CAPTURES, `audience-${colorScheme}-${viewport.width}x${viewport.height}-sheet.png`) });

    // COMMUNITY, pas FRIENDS : le défaut d'une story EST FRIENDS — un témoin
    // de mémoire posé sur la valeur par défaut ne pourrait pas rougir.
    await page.click('dialog[open] [data-audience-choice="COMMUNITY"]');
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 4000 });
    const chosenAudience = await readAudience();
    check(
      chosenAudience !== null && chosenAudience.value === 'COMMUNITY' && chosenAudience.source === 'chosen',
      `${tag} : choisir « Communautés » doit se lire sur la pastille — ${JSON.stringify(chosenAudience)}`,
    );

    await page.click('[data-publish-kind-toggle]');
    await page.waitForSelector('[data-publish-kind-menu]', { timeout: 4000 });
    const menuFit = await page.evaluate(() => {
      const menu = document.querySelector('[data-publish-kind-menu]')?.getBoundingClientRect();
      const capsule = document.querySelector('[data-publish-split]')?.getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll('[data-publish-kind-menu] [data-publish-kind-audience]')).map((n) => n.textContent);
      return menu === undefined || capsule === undefined
        ? null
        : { menuTop: menu.top, menuBottom: menu.bottom, capsuleTop: capsule.top, capsuleBottom: capsule.bottom, lines };
    });
    check(
      menuFit !== null && (menuFit.menuBottom <= menuFit.capsuleTop + 0.5 || menuFit.menuTop >= menuFit.capsuleBottom - 0.5) && menuFit.menuTop >= 0,
      `${tag} : le menu « Publier comme » recouvre la capsule qui l'ouvre — ${JSON.stringify(menuFit)}`,
    );
    check(menuFit !== null && menuFit.lines.length === 3, `${tag} : chaque format du menu doit dire son audience — ${JSON.stringify(menuFit)}`);
    await page.keyboard.press('Escape');

    // L'effet qui persiste le brouillon n'est pas synchrone au choix : on
    // attend le FAIT (le brouillon porte l'audience), jamais un délai.
    await page.waitForFunction(
      (key) => (localStorage.getItem(key) ?? '').includes('"visibility":"COMMUNITY"'),
      `meeshy.draft.story.${viewerId}`,
      { timeout: 4000 },
    );
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-story-studio]', { timeout: 8000 });
    const reloadedAudience = await readAudience();
    check(
      reloadedAudience !== null && reloadedAudience.value === 'COMMUNITY' && reloadedAudience.source === 'chosen',
      `${tag} : l'audience choisie n'a pas survécu au rechargement — ${JSON.stringify(reloadedAudience)}`,
    );

    // LE CRITÈRE : publier, puis ROUVRIR le studio — le brouillon est purgé
    // (texte vide), la mémoire du lecteur ne l'est pas.
    await page.waitForSelector('[data-story-publish]:not([disabled])', { timeout: 8000 });
    await page.click('[data-story-publish]');
    await page.waitForURL((url) => url.pathname === '/stories', { timeout: 8000 });
    await page.goto(`${BASE}/stories/new`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-studio]', { timeout: 8000 });
    const afterPublish = await page.evaluate(() => {
      const el = document.querySelector('[data-story-audience]');
      return {
        value: el?.getAttribute('data-audience-value') ?? null,
        source: el?.getAttribute('data-audience-source') ?? null,
        text: document.querySelector('#story-studio-text')?.value ?? null,
      };
    });
    check(
      afterPublish.value === 'COMMUNITY' && afterPublish.source === 'chosen' && afterPublish.text === '',
      `${tag} : rouvert après publication, le studio doit avoir purgé le brouillon et relu la mémoire (COMMUNITY/chosen, texte vide) — ${JSON.stringify(afterPublish)}`,
    );

    check(pageErrors.length === 0, `${tag} : erreurs de page — ${pageErrors.join(' | ')}`);
    await context.close();

    /* ── 9. PLUSIEURS PAGES DE MÉDIAS, ET LEUR AGENCEMENT (#7684) ────────── */
    const pagesViewerId = 'b'.repeat(24);
    const pagesContext = await browser.newContext({ colorScheme, locale: 'fr-FR', viewport, serviceWorkers: 'block' });
    await pagesContext.addInitScript((session) => localStorage.setItem('meeshy.session', session), seedSession(pagesViewerId));
    const pagesPage = await pagesContext.newPage();
    const pagesErrors = [];
    pagesPage.on('pageerror', (e) => pagesErrors.push(String(e)));

    await pagesPage.goto(`${BASE}/posts/new`, { waitUntil: 'load' });
    await pagesPage.waitForSelector('[data-story-studio]', { timeout: 8000 });

    /* (a) UNE page : aucun rail, et la ligne Post ne déplie rien (loi 4). */
    await pagesPage.setInputFiles('input[data-door="visual"]', { name: 'page1.png', mimeType: 'image/png', buffer: icon });
    await pagesPage.waitForSelector('[data-asset-phase="ready"]', { timeout: 8000 });
    // Mesurée AVEC le média posé : la ligne du pied qui le décrit existe aussi
    // sur chaque page suivante — seule l'apparition du rail peut alors bouger
    // la scène.
    const stageBefore = await readBox(pagesPage, PLATEAU_SELECTOR);
    check(
      await pagesPage.evaluate(() => document.querySelector('[data-story-studio-page-rail]') === null),
      `${tag} : le rail des pages ne doit PAS exister avec une seule page (loi 4)`,
    );
    await pagesPage.click('[data-publish-kind-toggle]');
    await pagesPage.waitForSelector('[data-publish-kind-menu]', { timeout: 4000 });
    check(
      await pagesPage.evaluate(() => document.querySelector('[data-publish-kind-choice="POST"]')?.hasAttribute('aria-haspopup') === false),
      `${tag} : un post d'UNE page n'offre aucun sous-menu de disposition (loi 4)`,
    );
    await pagesPage.keyboard.press('Escape');

    /* (b) TROIS images, une par page ⇒ trois tuiles, la dernière courante. */
    for (const name of ['page2.png', 'page3.png']) {
      await pagesPage.click('[data-story-option="add-page"]');
      await pagesPage.waitForFunction((n) => document.querySelectorAll('[data-story-studio-page]').length === n, name === 'page2.png' ? 2 : 3, { timeout: 8000 });
      await pagesPage.setInputFiles('input[data-door="visual"]', { name, mimeType: 'image/png', buffer: icon });
      await pagesPage.waitForSelector('[data-asset-phase="ready"]', { timeout: 8000 });
    }
    const rail = await pagesPage.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const tiles = Array.from(document.querySelectorAll('[data-story-studio-page]'));
      const del = document.querySelector('[data-story-studio-page-delete]');
      return {
        tiles: tiles.map((el) => ({ ...box(el), current: el.getAttribute('aria-current') === 'true', id: el.getAttribute('data-story-studio-page') })),
        del: del === null ? null : box(del),
        stageCurrent: document.querySelector('[data-scene-stage]')?.getAttribute('data-story-studio-current-page') ?? null,
      };
    });
    check(rail.tiles.length === 3, `${tag} : trois images posées sur trois pages ⇒ trois tuiles, vu ${rail.tiles.length}`);
    check(rail.tiles[2]?.current === true, `${tag} : la page créée en dernier doit être la page courante`);
    for (const tile of rail.tiles) {
      check(tile.width >= MIN_TARGET - 0.5 && tile.height >= MIN_TARGET - 0.5, `${tag} : une tuile de page doit être une cible de 44×44 — ${JSON.stringify(tile)}`);
    }
    check(
      rail.del !== null && rail.del.width >= MIN_TARGET - 0.5 && rail.del.height >= MIN_TARGET - 0.5,
      `${tag} : la corbeille de page doit atteindre 44×44 px — ${JSON.stringify(rail.del)}`,
    );
    const overlaps = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    check(
      rail.del !== null && rail.tiles.every((tile) => !overlaps(rail.del, tile)),
      `${tag} : la corbeille ne recouvre aucune tuile — un tap sur la scène courante ne doit jamais la supprimer — ${JSON.stringify(rail)}`,
    );
    const stageAfter = await readBox(pagesPage, PLATEAU_SELECTOR);
    check(
      stageBefore !== null && stageAfter !== null && Math.abs(stageBefore.height - stageAfter.height) <= 0.5,
      `${tag} : le rail apparaît dans la barre haute — la scène ne change pas de hauteur (${JSON.stringify({ stageBefore, stageAfter })})`,
    );
    if (CAPTURES !== undefined) await pagesPage.screenshot({ path: join(CAPTURES, `pages-${colorScheme}-${viewport.width}x${viewport.height}-rail.png`) });

    /* (c) le tap sur la tuile 1 change la scène courante — et elle PEINT. */
    await pagesPage.click(`[data-story-studio-page="${rail.tiles[0]?.id}"]`);
    await pagesPage.waitForFunction(
      (id) => document.querySelector('[data-scene-stage]')?.getAttribute('data-story-studio-current-page') === id,
      rail.tiles[0]?.id,
      { timeout: 4000 },
    );
    check(
      await pagesPage.evaluate((id) => document.querySelector(`[data-story-studio-page="${id}"]`)?.getAttribute('aria-current') === 'true', rail.tiles[0]?.id),
      `${tag} : la tuile tapée devient la scène courante`,
    );
    await pagesPage.waitForSelector('[data-scene-player]', { timeout: 8000 });
    await twoFrames(pagesPage);
    const pageStage = await readBox(pagesPage, PLATEAU_SELECTOR);
    if (pageStage !== null) {
      const inner = { x: pageStage.x + 4, y: pageStage.y + 4, width: Math.max(1, pageStage.width - 8), height: Math.max(1, pageStage.height - 8) };
      check((await pixelSpread(pagesPage, inner)) > 4, `${tag} : la scène de la page 1 ne peint rien`);
    }

    /* (d) le menu ▾ : Post DÉPLIE ses cinq agencements (ordre iOS), chacun
       une cible ≥ 44 px, le menu reste dans l'écran et ne recouvre pas sa
       capsule ; le RÉEL est choisissable (trois images). */
    await pagesPage.click('[data-publish-kind-toggle]');
    await pagesPage.waitForSelector('[data-publish-kind-menu]', { timeout: 4000 });
    check(
      await pagesPage.evaluate(() => document.querySelector('[data-publish-kind-choice="POST"]')?.getAttribute('aria-haspopup') === 'menu'),
      `${tag} : à plusieurs pages, la ligne Post porte un sous-menu (aria-haspopup="menu")`,
    );
    check(
      await pagesPage.evaluate(() => document.querySelector('[data-publish-kind-choice="REEL"]')?.getAttribute('aria-disabled') === 'false'),
      `${tag} : trois images ⇒ le réel devient choisissable (qualifiesAsReel)`,
    );
    await pagesPage.click('[data-publish-kind-choice="POST"]');
    await pagesPage.waitForSelector('[data-publish-layout-choice="sine"]', { timeout: 4000 });
    await twoFrames(pagesPage);
    const layoutMenu = await pagesPage.evaluate(() => {
      const menu = document.querySelector('[data-publish-kind-menu]');
      const capsule = document.querySelector('[data-publish-split]')?.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll('[data-publish-layout-choice]')).map((el) => ({
        mode: el.getAttribute('data-publish-layout-choice'),
        height: el.getBoundingClientRect().height,
      }));
      const r = menu?.getBoundingClientRect();
      return r === undefined || capsule === undefined
        ? null
        : { menuTop: r.top, menuBottom: r.bottom, capsuleTop: capsule.top, capsuleBottom: capsule.bottom, innerHeight, rows };
    });
    check(
      layoutMenu !== null && layoutMenu.rows.map((row) => row.mode).join(',') === 'carousel,reel,hero,wave,sine',
      `${tag} : les cinq agencements, dans l'ordre iOS (ComposerMosaicChoice.ordered) — ${JSON.stringify(layoutMenu?.rows)}`,
    );
    check(
      layoutMenu !== null && layoutMenu.rows.every((row) => row.height >= MIN_TARGET - 0.5),
      `${tag} : chaque ligne d'agencement est une cible ≥ 44 px — ${JSON.stringify(layoutMenu?.rows)}`,
    );
    check(
      layoutMenu !== null &&
        layoutMenu.menuTop >= 0 &&
        layoutMenu.menuBottom <= layoutMenu.innerHeight + 0.5 &&
        (layoutMenu.menuBottom <= layoutMenu.capsuleTop + 0.5 || layoutMenu.menuTop >= layoutMenu.capsuleBottom - 0.5),
      `${tag} : le menu déplié reste dans l'écran et ne recouvre pas la capsule — ${JSON.stringify(layoutMenu)}`,
    );
    if (layoutMenu !== null) measures[`${viewport.width}.layoutMenu`] = [round(layoutMenu.menuTop), round(layoutMenu.menuBottom), layoutMenu.rows.length];
    measures[`${viewport.width}.rail`] = rail.tiles.map((tile) => [round(tile.x), round(tile.y), round(tile.width), round(tile.height)]);
    if (CAPTURES !== undefined) await pagesPage.screenshot({ path: join(CAPTURES, `pages-${colorScheme}-${viewport.width}x${viewport.height}-menu.png`) });
    await pagesPage.keyboard.press('Escape');

    /* (e) rechargé, le brouillon garde ses trois pages et la page courante. */
    await pagesPage.waitForFunction(
      (key) => (localStorage.getItem(key) ?? '').includes('"schema":2'),
      `meeshy.draft.story.${pagesViewerId}`,
      { timeout: 4000 },
    );
    await pagesPage.reload({ waitUntil: 'load' });
    await pagesPage.waitForFunction(() => document.querySelectorAll('[data-story-studio-page]').length === 3, undefined, { timeout: 8000 });
    check(
      await pagesPage.evaluate((id) => document.querySelector(`[data-story-studio-page="${id}"]`)?.getAttribute('aria-current') === 'true', rail.tiles[0]?.id),
      `${tag} : rechargé, le brouillon rend ses trois pages ET la page courante`,
    );

    /* (f) Post › « Une grande, les autres à côté » publie. */
    await pagesPage.click('[data-publish-kind-toggle]');
    await pagesPage.click('[data-publish-kind-choice="POST"]');
    await pagesPage.click('[data-publish-layout-choice="hero"]');
    await pagesPage.waitForURL((url) => url.pathname.startsWith('/feed'), { timeout: 8000 });

    check(pagesErrors.length === 0, `${tag} : erreurs de page (plusieurs pages) — ${pagesErrors.join(' | ')}`);
    await pagesContext.close();
  }
  return measures;
}

const clair = await runScheme('light');
const sombre = await runScheme('dark');
check(
  JSON.stringify(clair) === JSON.stringify(sombre),
  `clair et sombre ne rendent pas la même géométrie — clair ${JSON.stringify(clair)} / sombre ${JSON.stringify(sombre)}`,
);

/**
 * ── 10. UNE STORY DE PLUSIEURS PAGES PART EN AUTANT DE STORIES (#7707) ──
 *
 * Le canal `.scene` (`studioPublishPlan`, miroir `ComposerPublishChannel.
 * swift:79-104`) : trois pages ⇒ trois `POST /api/v1/posts`, jamais un refus
 * (`story-with-several-pages`, retiré). Sous fixtures, chaque publication
 * s'enregistre dans le registre d'onglet (`recordFixtureStory`,
 * `stories-publish.ts`) que `loadStoryTray` sert devant le corpus littéral —
 * « Mes stories » (`/stories/mine`) est donc le témoin OBSERVABLE que trois
 * publications sont bien PARTIES, pas seulement que trois requêtes ont été
 * émises.
 */
{
  const tag = '[stories #7707]';
  const storiesViewerId = 'd'.repeat(24);
  const context = await browser.newContext({ colorScheme: 'light', locale: 'fr-FR', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript((session) => localStorage.setItem('meeshy.session', session), seedSession(storiesViewerId));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Le baseline (le corpus fixtures porte déjà `st-mienne`, une story de
  // VIEWER_ID) se mesure AVANT de publier, sur CETTE page — un `page.goto`
  // plus tard viderait le registre d'onglet (`recordFixtureStory`).
  await page.goto(`${BASE}/stories/mine`, { waitUntil: 'load' });
  await page.waitForSelector('[data-my-stories-list], [data-my-stories-empty]', { timeout: 8000 });
  const baseline = await page.evaluate(() => document.querySelectorAll('[data-my-stories-list] li[data-my-story]').length);

  await page.click('header a');
  await page.waitForURL((url) => url.pathname === '/', { timeout: 8000 });
  await page.waitForSelector('[data-self-create]', { timeout: 8000 });
  await page.click('[data-self-create]');
  await page.waitForURL((url) => url.pathname === '/stories/new', { timeout: 8000 });
  await page.waitForSelector('[data-story-studio]', { timeout: 8000 });
  await page.fill('#story-studio-text', 'Une');
  for (const [text, count] of [
    ['Deux', 2],
    ['Trois', 3],
  ]) {
    await page.click('[data-story-option="add-page"]');
    await page.waitForFunction((n) => document.querySelectorAll('[data-story-studio-page]').length === n, count, { timeout: 8000 });
    await page.fill('#story-studio-text', text);
  }
  check(
    await page.evaluate(() => document.querySelector('[data-publish-refusal]') === null),
    `${tag} : une story de plusieurs pages ne doit plus être refusée (#7707)`,
  );
  await page.waitForSelector('[data-story-publish]:not([disabled])', { timeout: 8000 });

  await page.click('[data-story-publish]');
  await page.waitForURL((url) => url.pathname === '/stories', { timeout: 8000 });

  // Retour à la Lentille PUIS « Mes stories », en navigation CLIENT — jamais
  // un `page.goto` (rechargement), qui viderait le registre fixtures de
  // l'onglet (`recordFixtureStory`, doc-comment `stories-publish.ts`).
  await page.click('header a');
  await page.waitForURL((url) => url.pathname === '/', { timeout: 8000 });
  await page.waitForSelector('[data-story-self-open]', { timeout: 8000 });
  await page.click('[data-story-self-open]');
  await page.waitForURL((url) => url.pathname === '/stories/mine', { timeout: 8000 });
  await page.waitForSelector('[data-my-stories-list] li[data-my-story]', { timeout: 8000 });
  const mine = await page.evaluate(() => document.querySelectorAll('[data-my-stories-list] li[data-my-story]').length);
  check(
    mine === baseline + 3,
    `${tag} : trois pages publiées doivent AJOUTER trois stories à « Mes stories » — vu ${baseline} puis ${mine}`,
  );

  check(pageErrors.length === 0, `${tag} : erreurs de page — ${pageErrors.join(' | ')}`);
  await context.close();
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-story-studio : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-story-studio : vert — ${invariants} invariants : Publier inerte sur un brouillon vide, un fond + un son posés font ` +
    'PEINDRE le moteur partagé, la carte est 9:16 centrée dans son plateau aux deux gabarits, cinq cibles ≥ 44 px, la saisie ' +
    'est alignée au pixel près sur ce que le moteur peint (une ligne et un texte long, sans défilement interne), le texte ' +
    'tapé survit à un rechargement, l’audience se choisit et voyage (pastille ≥ 44 px sans débordement, défaut FRIENDS ' +
    'désigné dans la feuille, six audiences dans l’ordre iOS, ONLY/EXCEPT grisés avec leur raison, menu sans recouvrement, ' +
    'choix relu après rechargement ET après publication), et PLUSIEURS PAGES DE MÉDIAS (#7684) : aucun rail ni sous-menu à ' +
    'une page, trois images ⇒ trois tuiles 44×44 dans la barre haute, corbeille 44×44 hors des tuiles, le tap change la ' +
    'scène courante, Post déplie ses cinq agencements (ordre iOS, lignes ≥ 44 px, menu dans l’écran hors de sa capsule), ' +
    'le réel choisissable, le brouillon relu avec ses pages, publication — clair et sombre identiques, et une story de ' +
    'plusieurs pages part en autant de stories (#7707), retrouvées dans « Mes stories ».',
);
